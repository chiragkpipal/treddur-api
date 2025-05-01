const express = require('express');
const axios = require('axios');
const { JSDOM } = require('jsdom');

const app = express();

app.get('/vulcantire/search', async (req, res) => {
    const { width, ratio, diameter } = req.query;
    
    if (!width || !ratio || !diameter) {
        return res.status(400).json({ error: 'Missing required parameters: width, ratio, diameter' });
    }

    try {
        const url = `https://www.vulcantire.com/cgi-bin/tiresearch.cgi?p1=${encodeURIComponent(width)}&p2=%2F${encodeURIComponent(ratio)}&p3=R${encodeURIComponent(diameter)}`;
        
        const response = await axios.get(url, {
            headers: {
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 CrKey/1.54.250320'
            }
        });

        const dom = new JSDOM(response.data);
        const document = dom.window.document;
        
        const tiresTable = document.getElementById('tires');
        if (!tiresTable) {
            return res.status(404).json({ error: 'Tires table not found' });
        }

        const rows = tiresTable.querySelectorAll('tr');
        const tires = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 10) return; // Skip rows that don't have enough cells
            
            // Skip header rows (those with th elements)
            if (row.querySelector('th')) return;

            const imgNode = cells[0].querySelector('span img');
            const imageUrl = imgNode ? imgNode.getAttribute('src') : '';
            
            const brandNode = cells[1].querySelector('.divBrandName');
            const brand = brandNode ? brandNode.textContent.trim() : '';
            
            const modelNode = cells[2].querySelector('a');
            const model = modelNode ? modelNode.textContent.trim() : '';
            const modelLink = modelNode ? `https://www.vulcantire.com${modelNode.getAttribute('href').replace('?', '/cgi-bin/tiresearch.cgi?')}` : '';
            
            const color = cells[3].textContent.trim();
            const specs = cells[4].textContent.trim();
            const mileage = cells[5].textContent.trim();
            
            const categoryNode = cells[8].querySelector('.divCatName');
            const category = categoryNode ? categoryNode.textContent.trim() : '';
            
            const priceMajor = cells[9].querySelector('.price_major');
            const priceMinor = cells[9].querySelector('.price_minor');
            const price = (priceMajor && priceMinor) 
                ? `${priceMajor.textContent.trim()}.${priceMinor.textContent.trim()}`
                : '0.00';
            
            const setPriceNode = Array.from(cells[10].querySelectorAll('li'))
                .find(li => li.textContent.includes('Set of 4:'));
            const setPrice = setPriceNode 
                ? setPriceNode.textContent.replace('Set of 4:', '').trim()
                : '';

            tires.push({
                image_url: imageUrl,
                brand,
                model,
                model_link: modelLink, // Added the model link here
                color,
                specs,
                mileage,
                category,
                price,
                set_price: setPrice
            });
        });

        res.setHeader('Content-Type', 'application/json');
        res.json(tires);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error fetching tire data' });
    }
});


app.get('/vulcantire/tire', async (req, res) => {
    const { stock, f } = req.query;
    
    if (!stock || !f) {
        return res.status(400).json({ error: 'Missing required parameters: stock, f' });
    }

    try {
        const url = `https://www.vulcantire.com/cgi-bin/tiresearch.cgi?stock=${encodeURIComponent(stock)}&f=${encodeURIComponent(f)}`;
        
        const response = await axios.get(url, {
            headers: {
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 CrKey/1.54.250320'
            }
        });

        const dom = new JSDOM(response.data);
        const document = dom.window.document;
        
        const productDiv = document.querySelector('div[itemscope][itemtype="http://schema.org/Product"]');
        if (!productDiv) {
            return res.status(404).json({ error: 'Product information not found' });
        }

        // Extract basic product info from schema
        const productInfo = {
            name: productDiv.querySelector('[itemprop="name"]')?.textContent.trim(),
            brand: productDiv.querySelector('[itemprop="brand"]')?.textContent.trim(),
            image: productDiv.querySelector('[itemprop="image"]')?.getAttribute('src'),
            description: productDiv.querySelector('[itemprop="description"]')?.textContent.trim(),
            sku: productDiv.querySelector('[itemprop="sku"]')?.textContent.trim(),
            mpn: productDiv.querySelector('[itemprop="mpn"]')?.textContent.trim(),
            weight: productDiv.querySelector('[itemprop="weight"]')?.textContent.trim(),
            condition: productDiv.querySelector('[itemprop="itemCondition"]')?.textContent.trim()
        };

        // Extract offers if available
        const offerDiv = productDiv.querySelector('[itemprop="offers"]');
        if (offerDiv) {
            productInfo.price = offerDiv.querySelector('[itemprop="price"]')?.textContent.trim();
            productInfo.priceCurrency = offerDiv.querySelector('[itemprop="priceCurrency"]')?.textContent.trim();
            productInfo.availability = offerDiv.querySelector('[itemprop="availability"]')?.textContent.trim();
        }

        // Extract description points (from previous implementation)
        const descriptionDiv = document.querySelector('.item-desc-wrap .elem-green span[itemprop="description"]');
        const descriptionText = descriptionDiv ? descriptionDiv.innerHTML : '';
        const descriptionPoints = descriptionText.split('<br><br>')
            .map(point => point.trim())
            .filter(point => point.length > 0);

        // Extract specifications (from previous implementation)
        const specDiv = document.querySelector('.item-spec');
        const specs = {};
        
        if (specDiv) {
            const specItems = specDiv.querySelectorAll('dt, dd');
            let currentKey = '';
            
            specItems.forEach(item => {
                if (item.tagName.toLowerCase() === 'dt') {
                    currentKey = item.textContent.trim();
                } else if (item.tagName.toLowerCase() === 'dd' && currentKey) {
                    // Handle warranty special case
                    if (currentKey === 'General Warranty') {
                        const warrantyText = item.querySelector('td')?.textContent.trim() || 
                                           item.textContent.split('\n')[0].trim();
                        specs[currentKey] = warrantyText;
                    } else {
                        specs[currentKey] = item.textContent.trim();
                    }
                    currentKey = '';
                }
            });
        }

        res.json({
            product: productInfo,
            description: descriptionPoints,
            specifications: specs
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error fetching tire details' });
    }
});


app.get('/simpletire/size/:size', async (req, res) => {
    const { size } = req.params;
    
    if (!size || !/^\d+-\d+-\d+$/.test(size)) {
        return res.status(400).json({ 
            error: 'Invalid size format',
            message: 'Size must be in format width-aspectRatio-diameter (e.g., 195-70-14)'
        });
    }

    try {
        const url = `https://simpletire.com/tire-sizes/${size}.json?size=${size}`;
        
        const response = await axios.get(url, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
                'newrelic': 'eyJ2IjpbMCwxXSwiZDI6eyJ0eSI6IkJyb3dzZXIiLCJhYyI6IjExMzIzNTciLCJhcCI6IjU3Nzc5ODYwNCIsImlkIjoiZDY5OTJmOWFmZWJlZjhmMCIsInRyIjoiZjlhNmQyNzYxNmIxNWY2YiIsInRpIjoxNzQ2MDU1NTE4NDc3fX0=',
                'priority': 'u=1, i',
                'referer': 'https://simpletire.com/',
                'sec-ch-dpr': '2.625',
                'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-ch-viewport-width': '412',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
                'x-nextjs-data': '1'
            },
            timeout: 10000
        });

        // Forward the exact response with original headers
        res.set(response.headers);
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error('Error fetching from SimpleTire:', error);
        
        if (error.response) {
            // Forward the error response exactly as received
            res.set(error.response.headers);
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ 
                error: 'Failed to fetch tire data',
                message: error.message 
            });
        }
    }
});



app.get('/simpletire/brands/:brand', async (req, res) => {
    const { brand } = req.params;
    const { userRegion = '1', userZip = '11205' } = req.query;

    if (!brand) {
        return res.status(400).json({ 
            error: 'Brand parameter is required',
            example: '/simpletire/brands/yokohama'
        });
    }

    try {
        const url = `https://simpletire.com/api/brands/${brand}?userRegion=${userRegion}&userZip=${userZip}`;
        
        const response = await axios.get(url, {
            headers: {
                'accept': 'application/json',
                'sec-ch-dpr': '2',
                'sec-ch-viewport-width': '1280',
                'referer': 'https://simpletire.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
            },
            timeout: 10000
        });

        // Forward the exact response with original headers
        res.set(response.headers);
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error(`Error fetching ${brand} tires:`, error);
        
        if (error.response) {
            // Forward the error response exactly as received
            res.set(error.response.headers);
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ 
                error: `Failed to fetch ${brand} tire data`,
                message: error.message 
            });
        }
    }
});


app.get('/simpletire/tire', async (req, res) => {
    const { brand, productLine, userRegion = '1', userZip = '11205' } = req.query;

    if (!brand || !productLine) {
        return res.status(400).json({ 
            error: 'Both brand and productLine parameters are required',
            example: '/simpletire/product-detail?brand=yokohama&productLine=geolandar-at-g015'
        });
    }

    try {
        const url = `https://simpletire.com/api/product-detail?brand=${encodeURIComponent(brand)}&productLine=${encodeURIComponent(productLine)}&userRegion=${userRegion}&userZip=${userZip}`;
        
        const response = await axios.get(url, {
            headers: {
                'accept': 'application/json',
                'referer': `https://simpletire.com/brands/${brand}-tires/${productLine}`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-mode': 'cors'
            },
            timeout: 10000
        });

        // Forward the exact response with original headers
        res.set(response.headers);
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error(`Error fetching product details for ${brand} ${productLine}:`, error);
        
        if (error.response) {
            // Forward the error response exactly as received
            res.set(error.response.headers);
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ 
                error: `Failed to fetch product details`,
                message: error.message,
                details: {
                    brand,
                    productLine
                }
            });
        }
    }
});

app.get('/simpletire/car', async (req, res) => {
    // Required parameters
    const { 
        make, 
        model, 
        year, 
        tireSize
    } = req.query;

    // Optional parameters with defaults
    const {
        page = '1',
        curationLimit = '1',
        limit = '10',
        userRegion = '1',
        userZip = '11205'
    } = req.query;

    // Validate required parameters
    if (!make || !model || !year || !tireSize) {
        return res.status(400).json({
            error: 'Missing required parameters',
            requiredParams: [
                'make (e.g., honda)',
                'model (e.g., accord)',
                'year (e.g., 2023)',
                'tireSize (e.g., 225-50r17)'
            ],
            example: '/simpletire/car?make=honda&model=accord&year=2023&tireSize=225-50r17'
        });
    }

    try {
        const url = new URL('https://simpletire.com/api/summary-vehicle');
        const params = new URLSearchParams({
            make,
            model,
            year,
            tireSize,
            page,
            curationLimit,
            limit,
            userRegion,
            userZip
        });
        url.search = params.toString();

        const referrer = `https://simpletire.com/vehicles/${make}-tires/${model}/${year}?tireSize=${tireSize}`;

        const response = await axios.get(url.toString(), {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'priority': 'u=1, i',
                'referer': referrer,
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36'
            },
            timeout: 10000,
            withCredentials: true
        });

        // Forward the exact response
        res.set(response.headers);
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error('Error fetching vehicle tire data:', error);
        
        if (error.response) {
            // Forward error response from API
            res.set(error.response.headers);
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({
                error: 'Failed to fetch vehicle tire data',
                message: error.message,
                params: req.query
            });
        }
    }
});

app.get('/tirebuyer/brands/:brand', async (req, res) => {
    const { brand } = req.params;
    const { zipCode = '11205' } = req.query;

    if (!brand) {
        return res.status(400).json({ 
            error: 'Brand parameter is required',
            example: '/tirebuyer/brands/continental/products?zipCode=11205'
        });
    }

    try {
        const url = `https://www.tirebuyer.com/_next/data/Yy3ktq9FQFfJMz5klgSM1/tires/brands/${brand}/products.json?brand=${brand}&zipCode=${zipCode}`;
        
        const response = await axios.get(url, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
                'priority': 'u=1, i',
                'referer': `https://www.tirebuyer.com/tires/brands/${brand}/products?zipCode=${zipCode}`,
                'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
                'x-nextjs-data': '1'
            },
            timeout: 10000
        });

        // Forward the exact response with original headers
        res.set(response.headers);
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error(`Error fetching ${brand} products:`, error);
        
        if (error.response) {
            // Forward the error response exactly as received
            res.set(error.response.headers);
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ 
                error: `Failed to fetch ${brand} products`,
                message: error.message 
            });
        }
    }
});

app.get('/tirebuyer/size/:size', async (req, res) => {
    const { size } = req.params;
    const { zipCode = '11205' } = req.query;

    // Validate size format (e.g., 195-70-14)
    if (!size || !/^\d+-\d+-\d+$/.test(size)) {
        return res.status(400).json({ 
            error: 'Invalid size format',
            message: 'Size must be in format width-aspectRatio-diameter (e.g., 195-70-14)'
        });
    }

    try {
        const url = `https://www.tirebuyer.com/tires/size/${size}?zipCode=${zipCode}`;
        
        const response = await axios.get(url, {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
                'cache-control': 'max-age=0',
                'priority': 'u=0, i',
                'referer': 'https://www.tirebuyer.com/',
                'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
                'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36'
            },
            timeout: 10000
        });

        // Forward the exact HTML response
        res.set({
            'content-type': response.headers['content-type'],
            'cache-control': response.headers['cache-control']
        });
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error(`Error fetching tires for size ${size}:`, error);
        
        if (error.response) {
            // Forward the error response
            res.set({
                'content-type': error.response.headers['content-type'],
                'cache-control': error.response.headers['cache-control']
            });
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ 
                error: `Failed to fetch tires for size ${size}`,
                message: error.message 
            });
        }
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
