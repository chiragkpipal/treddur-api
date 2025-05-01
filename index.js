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

app.get('/tirerack/size', async (req, res) => {
  try {
    const url = 'https://www.tirerack.com/tires/TireSearchResults.jsp?zip-code=94541&width=225/&ratio=45&diameter=17&rearWidth=255/&rearRatio=40&rearDiameter=17&performance=ALL';
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0', // helps avoid being blocked
      }
    });

    res.set('Content-Type', 'text/html');
    res.send(response.data); // sends the HTML as plain text
  } catch (error) {
    console.error('Error fetching Tire Rack page:', error.message);
    res.status(500).send('Failed to fetch tire data.');
  }
});
app.get('/discounttire/brand', async (req, res) => {
    const { brand, storeCode = '2337', page = 0, pageSize = 12, sort = 'BEST_SELLER' } = req.query;

    if (!brand) {
        return res.status(400).json({ error: 'Brand parameter is required' });
    }

    try {
        const graphqlQuery = {\"operationName\":\"StaggeredSearchQuery\",\"variables\":{\"search\":{\"applyFallBack\":false,\"initialFacets\":[],\"initialFilters\":[{\"facetName\":\"BRAND_NAME\",\"facetValue\":\"michelin-tires\"}],\"nearByStoreCodes\":[],\"page\":{\"pageNumber\":0,\"pageSize\":12,\"sort\":\"BEST_SELLER\"},\"productType\":\"TIRE\",\"query\":\"\",\"queryType\":\"BRAND_SEARCH\",\"staggeredType\":\"SET\"},\"storeCode\":\"2337\"},\"query\":\"query StaggeredSearchQuery($search: StaggeredProductSearchInput!, $vehicleInfo: VehicleInput, $storeCode: String!) {\\n  productSearch {\\n    staggeredSearchQuery(search: $search, vehicleInfo: $vehicleInfo, storeCode: $storeCode) {\\n      ...productSearchResult\\n    }\\n  }\\n}\\n\\nfragment productSearchResult on ProductSearchResult {\\n  facets {\\n    ...facetsFragment\\n  }\\n  pagination {\\n    currentPage\\n    numberOfPages\\n    pageSize\\n    totalNumberOfResults\\n  }\\n  results {\\n    ...productFragment\\n  }\\n  sorts {\\n    code\\n    name\\n    selected\\n  }\\n  recommendationAvailable\\n}\\n\\nfragment facetsFragment on FacetData_SearchStateData {\\n  category\\n  code\\n  isSlider\\n  description\\n  multiSelect\\n  name\\n  needCollapse\\n  needExpand\\n  needShowMore\\n  priority\\n  topValues {\\n    code\\n    count\\n    name\\n    query {\\n      listUrl\\n      query {\\n        value\\n      }\\n      url\\n    }\\n    scaleMaxVal\\n    scaleMinVal\\n    selected\\n    sliderMaxVal\\n    sliderMinVal\\n  }\\n  values {\\n    code\\n    count\\n    name\\n    plpToolTip\\n    query {\\n      listUrl\\n      query {\\n        value\\n      }\\n      url\\n    }\\n    scaleMaxVal\\n    scaleMinVal\\n    selected\\n    sliderMaxVal\\n    sliderMinVal\\n  }\\n  type\\n}\\n\\nfragment productFragment on ProductData {\\n  ...plpQueriesAlcFields\\n  ...windshieldWiperFields\\n  ...treadwellDataFields\\n  aggregates {\\n    allVehiclesReviewCount\\n    codes\\n    propertyRanges {\\n      name\\n      rangeValue\\n    }\\n    itemType\\n    specialCanonical\\n  }\\n  averageRating\\n  baseprice {\\n    value\\n    formattedValue\\n  }\\n  brandLogo {\\n    url\\n  }\\n  code\\n  color\\n  description\\n  freeShipping\\n  gbb\\n  icons {\\n    altText\\n  }\\n  images {\\n    url\\n    altText\\n    format\\n  }\\n  isCoreProduct\\n  isExclusive\\n  isOtherVehiclesOE\\n  isViewableOnVehicle\\n  origEquipmentData {\\n    description\\n    disPlayName\\n    name\\n  }\\n  line\\n  manufacturerAID\\n  manufacturerMileageWarranty\\n  mapDisplayRule {\\n    mapPriceDisplay\\n    message\\n    messageDisplay\\n  }\\n  mapPrice {\\n    formattedValue\\n    value\\n  }\\n  mapRuleSatisfied\\n  name\\n  potentialPromotions {\\n    ...potentialPromotionsFragment\\n  }\\n  price {\\n    value\\n    formattedValue\\n  }\\n  priceRange {\\n    minPrice {\\n      formattedValue\\n      value\\n    }\\n    maxPrice {\\n      formattedValue\\n      value\\n    }\\n  }\\n  productType\\n  rearProduct {\\n    ...plpQueriesAlcFields\\n    code\\n    description\\n    origEquipmentData {\\n      description\\n      disPlayName\\n      name\\n    }\\n    gbb\\n    brand\\n    brandLogo {\\n      url\\n    }\\n    images {\\n      url\\n      altText\\n      format\\n    }\\n    name\\n    productType\\n    potentialPromotions {\\n      ...potentialPromotionsFragment\\n    }\\n    price {\\n      value\\n      formattedValue\\n    }\\n    mapRuleSatisfied\\n    mapDisplayRule {\\n      mapPriceDisplay\\n      message\\n      messageDisplay\\n    }\\n    mapPrice {\\n      formattedValue\\n      value\\n    }\\n    size\\n    stock {\\n      preferredStoreStockMessage\\n      purchaseDecisionValue\\n      relativeStockCount\\n      stockCount\\n      availabilityMessage\\n      availabilityMessageRank\\n      stockLevelStatus {\\n        code\\n      }\\n    }\\n    markdownPriceData {\\n      formattedPercentageSaved\\n      originalRetailValue\\n    }\\n    manufacturerAID\\n    unitName\\n    wheelRimDiameter\\n    wheelWidth\\n  }\\n  reviewSummaryData {\\n    totalCount\\n    recommendCount\\n    totalRating\\n  }\\n  size\\n  stock {\\n    ...stockFields\\n  }\\n  unitName\\n  unitOfMeasureDescription\\n  url\\n  wheelFinish: finish\\n  wheelColor\\n  wheelRimDiameter\\n  wheelWidth\\n  swatches {\\n    ...swatchImageDataAttributes\\n  }\\n  vendorFinish\\n  canonicalFallBackUrl\\n  markdownPriceData {\\n    formattedPercentageSaved\\n    originalRetailValue\\n  }\\n}\\n\\nfragment instantPromotionFields on PromotionData {\\n  instantCredit\\n  instantPromotion\\n  originalRetailValue\\n}\\n\\nfragment potentialPromotionsFragment on PromotionData {\\n  configuredDiscountValue\\n  description\\n  endDate\\n  shortDescription\\n  title\\n  detailsUrl\\n  promotionConditionType\\n  ...instantPromotionFields\\n}\\n\\nfragment plpQueriesAlcFields on ProductData {\\n  addToCartDisabled\\n  articleStatus\\n  articleStatusLabel\\n  productLaunchDate\\n}\\n\\nfragment stockFields on StockData {\\n  availableDate\\n  cityOfStore\\n  daysOut\\n  purchaseDecisionValue\\n  relativeStockCount\\n  stockCount\\n  availabilityMessage\\n  availabilityMessageRank\\n  preferredStoreStockMessage\\n  relativeInventory {\\n    isAvailable\\n    relativeInventoryStatus\\n    stockMessagingCode\\n  }\\n  vendorsStockCount\\n  stockLevelStatus {\\n    code\\n  }\\n  storeCode\\n  storeStreetAddress\\n}\\n\\nfragment windshieldWiperFields on ProductData {\\n  accessoryType\\n  brand\\n  brandCategory\\n  fitmentPosition {\\n    code\\n    description\\n  }\\n}\\n\\nfragment treadwellDataFields on ProductData {\\n  tdsData {\\n    ...tdsDataFields\\n  }\\n  recommendationData {\\n    ...plpRecommendationDataFields\\n  }\\n}\\n\\nfragment tdsDataFields on TdsData {\\n  code\\n  mileage {\\n    median\\n    max\\n    warranty\\n    min\\n    mileageType\\n  }\\n  stopping {\\n    ...plpQueriesStoppingFields\\n  }\\n  rideRating {\\n    handling\\n    quiet\\n    comfort\\n    wetHandling\\n  }\\n  manufacturerPartNumber\\n  testVehicleType\\n  testVehicleCategory\\n  durabilityRating\\n  dryRating\\n  wetWornProxy\\n  rollingResistanceProxy\\n  sustainabilityRating\\n  sustainabilityProxy\\n}\\n\\nfragment plpQueriesStoppingFields on StoppingData {\\n  rollingResistanceRating\\n  wetRating\\n  wetDistance\\n  wetWornDistance\\n  dryDistance\\n  dryRating\\n  winterRating\\n}\\n\\nfragment plpRecommendationDataFields on RecommendedArticleData {\\n  rideRating {\\n    handling\\n    quiet\\n    comfort\\n    wetHandling\\n  }\\n  tireLifeYears\\n  tireLifeMonths\\n  stopping {\\n    ...plpQueriesStoppingFields\\n  }\\n  rank\\n  mileage {\\n    median\\n    max\\n    warranty\\n    min\\n  }\\n  milesPerDollar\\n  winter {\\n    snowBrakeFeet\\n    snowHandlingRating\\n  }\\n}\\n\\nfragment swatchImageDataAttributes on SwatchImageData {\\n  altText\\n  code\\n  color\\n  format\\n  hexCode: hexcode\\n  isViewableOnVehicle\\n  linkUrl\\n  productCode\\n  vendorFinish\\n  wheelPartId\\n}\\n\"};

        const response = await axios.post('https://www.discounttire.com/webapi/discounttire.graph', graphqlQuery, {
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'x-dtpc': '7$407496384_232h16vAFMSEMWBNFVJOAAWOHRCOOTRIEGQOEPJ-0e0',
                'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 CrKey/1.54.250320'
            }
        });

        // Simplify the response for your API
        const simplifiedResults = response.data.data.productSearch.staggeredSearchQuery.results.map(product => ({
            id: product.code,
            name: product.name,
            brand: product.brand,
            description: product.description,
            price: product.price.formattedValue,
            image: product.images[0]?.url,
            size: product.size,
            rating: product.averageRating,
            reviewCount: product.reviewSummaryData?.totalCount,
            availability: product.stock.availabilityMessage,
            promotions: product.potentialPromotions?.map(promo => ({
                title: promo.title,
                description: promo.shortDescription
            }))
        }));

        res.json({
            pagination: response.data.data.productSearch.staggeredSearchQuery.pagination,
            results: simplifiedResults,
            facets: response.data.data.productSearch.staggeredSearchQuery.facets
        });

    } catch (error) {
        console.error('Error fetching from Discount Tire:', error);
        res.status(500).json({ error: 'Failed to fetch tire data' });
    }
});
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
