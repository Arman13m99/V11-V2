// background.js
// API-based Price Comparator Background Script - Universal Version
console.log("Background: Starting Food Price Comparator extension - Universal");

// Configuration
const API_BASE_URL = 'http://127.0.0.1:8000';  // Local FastAPI server

// Global data cache
let vendorDataCache = new Map(); // Cache API responses for performance
let cacheExpiry = new Map();     // Track cache expiry times
let vendorListCache = null;      // Cache for vendor list
let vendorListCacheExpiry = 0;   // Cache expiry for vendor list

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
const VENDOR_LIST_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache for vendor list

// API Helper Functions
async function fetchFromAPI(endpoint) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`Background: Fetching from API: ${url}`);
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return { success: false, error: "Endpoint not found", status: 404 };
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, data };
        
    } catch (error) {
        console.error(`Background: API call failed for ${endpoint}:`, error);
        
        if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            return { 
                success: false, 
                error: "API server not available. Please ensure the FastAPI server is running on port 8000.",
                isConnectionError: true
            };
        }
        
        return { success: false, error: error.message };
    }
}

async function getVendorData(platform, vendorCode) {
    const cacheKey = `${platform}-${vendorCode}`;
    const now = Date.now();
    
    // Check cache first
    if (vendorDataCache.has(cacheKey) && cacheExpiry.get(cacheKey) > now) {
        console.log(`Background: Using cached data for ${cacheKey}`);
        return { success: true, data: vendorDataCache.get(cacheKey) };
    }
    
    // Fetch from API
    const endpoint = `/extension/vendor-data/${platform}/${vendorCode}`;
    const result = await fetchFromAPI(endpoint);
    
    if (result.success) {
        // Cache the response
        vendorDataCache.set(cacheKey, result.data);
        cacheExpiry.set(cacheKey, now + CACHE_DURATION);
        console.log(`Background: Cached data for ${cacheKey}`);
    }
    
    return result;
}

async function getAPIStats() {
    try {
        const result = await fetchFromAPI('/stats');
        return result;
    } catch (error) {
        console.error("Background: Failed to get API stats:", error);
        return { success: false, error: error.message };
    }
}

async function getVendorsList() {
    const now = Date.now();
    
    // Check cache first
    if (vendorListCache && vendorListCacheExpiry > now) {
        console.log("Background: Using cached vendor list");
        return { success: true, data: vendorListCache };
    }
    
    try {
        // Fetch from API using correct endpoint
        const result = await fetchFromAPI('/vendors?limit=1000'); // Get all vendors
        
        if (result.success) {
            // Cache the response
            vendorListCache = result.data;
            vendorListCacheExpiry = now + VENDOR_LIST_CACHE_DURATION;
            console.log(`Background: Cached vendor list with ${result.data?.length || 0} vendors`);
        } else {
            console.warn("Background: Failed to fetch vendor list:", result.error);
        }
        
        return result;
    } catch (error) {
        console.error("Background: Exception in getVendorsList:", error);
        return { success: false, error: error.message };
    }
}

// Enhanced comparison function with API data
function processAndCompare(sfProducts, tfProducts, sourcePlatform, itemMappings) {
    console.log(`Background: Starting comparison for ${sourcePlatform}`);
    console.log(`Background: SF products count: ${Object.keys(sfProducts).length}`);
    console.log(`Background: TF products count: ${Object.keys(tfProducts).length}`);
    console.log(`Background: Item mappings count: ${Object.keys(itemMappings).length}`);
    
    const comparisonResults = {};
    const baseProducts = sourcePlatform === 'snappfood' ? sfProducts : tfProducts;
    const counterpartProducts = sourcePlatform === 'snappfood' ? tfProducts : sfProducts;
    
    let foundMappings = 0;
    let validComparisons = 0;
    
    for (const baseId in baseProducts) {
        const baseIdInt = parseInt(baseId);
        const counterpartId = itemMappings[baseIdInt];
        
        if (counterpartId) {
            foundMappings++;
            
            if (counterpartProducts[counterpartId]) {
                const baseProduct = baseProducts[baseId];
                const counterpartProduct = counterpartProducts[counterpartId];
                
                if (baseProduct.price > 0) { // Avoid division by zero
                    const priceDiff = baseProduct.price - counterpartProduct.price;
                    const percentDiff = Math.round((Math.abs(priceDiff) / baseProduct.price) * 100);
                    
                    comparisonResults[baseId] = {
                        baseProduct,
                        counterpartProduct,
                        priceDiff,
                        percentDiff,
                        isCheaper: priceDiff > 0,
                        isMoreExpensive: priceDiff < 0,
                        isSamePrice: priceDiff === 0
                    };
                    validComparisons++;
                }
            }
        }
    }
    
    console.log(`Background: Found ${foundMappings} mappings, created ${validComparisons} valid comparisons`);
    return comparisonResults;
}

// API fetching functions (enhanced with discount handling)
async function fetchSnappfoodData(vendorCode) {
    const url = `https://snappfood.ir/mobile/v2/restaurant/details/dynamic?lat=35.715&long=51.404&vendorCode=${vendorCode}&optionalClient=WEBSITE&client=WEBSITE&deviceType=WEBSITE&appVersion=8.1.1`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`SnappFood API Error: ${response.status}`);
        const json = await response.json();
        
        if (!json || !json.data || !Array.isArray(json.data.menus)) {
            throw new Error("Invalid SnappFood API response: 'data.menus' array not found.");
        }
        
        const products = {};
        json.data.menus.forEach(menuSection => {
            if (menuSection && Array.isArray(menuSection.products)) {
                menuSection.products.forEach(p => {
                    if (p && p.id && typeof p.title !== 'undefined' && typeof p.price !== 'undefined') {
                        const originalPrice = p.price || 0;
                        const discount = p.discount || 0;
                        const finalPrice = originalPrice - discount;
                        
                        products[p.id] = {
                            id: p.id,
                            name: p.title.trim(),
                            price: finalPrice,
                            originalPrice: originalPrice,
                            discount: discount,
                            discountRatio: p.discountRatio || 0
                        };
                    }
                });
            }
        });
        
        if (Object.keys(products).length === 0) {
            console.warn("SnappFood: Response parsed, but no products were extracted. API structure may have changed.");
        }
        
        return products;
    } catch (error) {
        console.error("Failed to fetch SnappFood data:", error);
        return null;
    }
}

async function fetchTapsifoodData(vendorCode) {
    const url = `https://api.tapsi.food/v1/api/Vendor/${vendorCode}/vendor?latitude=35.7559&longitude=51.4132`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`TapsiFood API Error: ${response.status}`);
        const json = await response.json();
        
        if (!json || !json.data || !Array.isArray(json.data.categories)) {
             throw new Error("Invalid or unexpected TapsiFood API response structure.");
        }
        
        const products = {};
        json.data.categories.forEach(category => {
            if(category.products && Array.isArray(category.products)) {
                category.products.forEach(p => {
                    if (p && p.productVariations && p.productVariations.length > 0) {
                        const variation = p.productVariations[0];
                        const originalPrice = variation.price || 0;
                        const finalPrice = variation.priceAfterDiscount || originalPrice;
                        const discountRatio = variation.discountRatio || 0;
                        
                        products[p.productId] = {
                            id: p.productId,
                            name: p.productName.trim(),
                            price: finalPrice,
                            originalPrice: originalPrice,
                            discountRatio: discountRatio
                        };
                    }
                });
            }
        });
        
        return products;
    } catch (error) {
        console.error("Failed to fetch TapsiFood data:", error);
        return null;
    }
}

// Message handler for content script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // Handle price fetching requests from menu pages
    if (request.action === "fetchPrices") {
        (async () => {
            const { sfVendorCode, tfVendorCode, sourcePlatform } = request;
            try {
                let apiResult;
                if (sourcePlatform === "snappfood" && sfVendorCode) {
                    apiResult = await getVendorData('snappfood', sfVendorCode);
                } else if (sourcePlatform === "tapsifood" && tfVendorCode) {
                    apiResult = await getVendorData('tapsifood', tfVendorCode);
                } else {
                    sendResponse({ success: false, error: "Invalid request format." });
                    return;
                }
                
                if (!apiResult.success) {
                    sendResponse({ success: false, error: apiResult.error });
                    return;
                }
                
                const { vendor_info, item_mappings } = apiResult.data;
                const [sfProducts, tfProducts] = await Promise.all([
                    fetchSnappfoodData(vendor_info.sf_code),
                    fetchTapsifoodData(vendor_info.tf_code)
                ]);
                
                if (sfProducts && tfProducts) {
                    const comparisonData = processAndCompare(sfProducts, tfProducts, sourcePlatform, item_mappings);
                    sendResponse({ success: true, data: comparisonData, vendorInfo: vendor_info });
                } else {
                    let errorMsg = "Failed to fetch product data from one or both platforms.";
                    if (!sfProducts) errorMsg += " (SnappFood failed)";
                    if (!tfProducts) errorMsg += " (TapsiFood failed)";
                    sendResponse({ success: false, error: errorMsg });
                }
            } catch (error) {
                console.error("Background: Unexpected error in fetchPrices:", error);
                sendResponse({ success: false, error: `Unexpected error: ${error.message}` });
            }
        })();
        return true; // Indicates that the response is sent asynchronously
    }
    
    // Handle vendor list requests from home/service pages or popup
    if (request.action === "getVendorList") {
        (async () => {
            try {
                const [statsResult, vendorsResult] = await Promise.all([
                    getAPIStats(), 
                    getVendorsList()
                ]);
                
                let vendors = [];
                let stats = { totalVendors: 0, totalItems: 0 };
                let apiErrors = { statsError: null, vendorsError: null };
                
                if (vendorsResult.success && vendorsResult.data) {
                    vendors = vendorsResult.data;
                } else {
                    apiErrors.vendorsError = vendorsResult.error;
                }
                
                if (statsResult.success && statsResult.data) {
                    stats = {
                        totalVendors: statsResult.data.total_vendors || 0,
                        totalItems: statsResult.data.total_items || 0,
                        uniqueSfVendors: statsResult.data.unique_sf_vendors || 0,
                        uniqueTfVendors: statsResult.data.unique_tf_vendors || 0
                    };
                } else {
                    apiErrors.statsError = statsResult.error;
                }
                    
                sendResponse({ 
                    success: true, 
                    vendors: vendors,
                    stats: stats,
                    apiErrors: apiErrors
                });
            } catch (error) {
                console.error("Background: Failed to get vendor list:", error);
                sendResponse({ 
                    success: false, 
                    error: `Failed to connect to API: ${error.message}`,
                    isConnectionError: true
                });
            }
        })();
        return true;
    }
    
    // Handle health check requests
    if (request.action === "healthCheck") {
        (async () => {
            try {
                const result = await fetchFromAPI('/health');
                sendResponse(result);
            } catch (error) {
                sendResponse({ 
                    success: false, 
                    error: error.message,
                    isConnectionError: true
                });
            }
        })();
        return true;
    }
    
    // Unknown action
    console.warn(`Background: Unknown action received: ${request.action}`);
    sendResponse({ success: false, error: "Unknown action" });
    return false;
});

// Test API connection on startup
(async () => {
    try {
        const result = await fetchFromAPI('/health');
        if (result.success) {
            console.log("Background: ✅ API connection successful!", result.data);
        } else {
            console.error("Background: ❌ API connection failed!", result.error);
            if (result.isConnectionError) {
                console.log("Background: Please ensure FastAPI server is running on http://127.0.0.1:8000");
            }
        }
    } catch (error) {
        console.error("Background: Failed to test API connection on startup:", error);
    }
})();

// Periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    
    // Clean vendor data cache
    for (const [key, expiry] of cacheExpiry.entries()) {
        if (expiry <= now) {
            vendorDataCache.delete(key);
            cacheExpiry.delete(key);
        }
    }
    
    // Clean vendor list cache
    if (vendorListCacheExpiry <= now) {
        vendorListCache = null;
        vendorListCacheExpiry = 0;
        console.log("Background: Cleaned expired vendor list cache");
    }
}, 60000); // Clean every minute

console.log("Background: Service worker setup complete");