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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
