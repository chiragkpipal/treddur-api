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

            const imgNode = cells[0].querySelector('.imgTireGifTable');
            const imageUrl = imgNode ? `https://www.vulcantire.com${imgNode.getAttribute('src')}` : '';
            
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
    const { page = 1, sort = 'popular' } = req.query;

    if (!size) {
        return res.status(400).json({ error: 'Size parameter is required (e.g., 195-70-14)' });
    }

    try {
        const url = `https://simpletire.com/_next/data/qH6suniMYQa9Ak3PJgqtn/tire-sizes/${size}.json?size=${size}`;
        
        const response = await axios.get(url, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
                'priority': 'u=1, i',
                'referer': 'https://simpletire.com/',
                'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
                'x-nextjs-data': '1'
            }
        });

        // Extract and simplify the response
        const pageProps = response.data.pageProps;
        const simplifiedResponse = {
            size: pageProps.size,
            tires: pageProps.tires.map(tire => ({
                id: tire.id,
                brand: tire.brand.name,
                model: tire.model.name,
                image: tire.image?.url,
                price: tire.price,
                rating: tire.rating,
                reviewCount: tire.reviewCount,
                specs: {
                    loadIndex: tire.loadIndex,
                    speedRating: tire.speedRating,
                    utqg: tire.utqg,
                    warranty: tire.warranty
                },
                promotions: tire.promotions?.map(promo => ({
                    type: promo.type,
                    description: promo.description,
                    disclaimer: promo.disclaimer
                }))
            })),
            filters: pageProps.filters,
            pagination: {
                currentPage: pageProps.currentPage,
                totalPages: pageProps.totalPages,
                totalResults: pageProps.totalResults
            }
        };

        res.json(simplifiedResponse);
    } catch (error) {
        console.error('Error fetching from SimpleTire:', error);
        res.status(500).json({ 
            error: 'Failed to fetch tire data',
            details: error.response?.data || error.message 
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
