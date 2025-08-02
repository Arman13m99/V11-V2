// Enhanced Universal Content Script - Fixed Search Feature
// Version 3.1 - Search Fixes & Improvements

console.log('🚀 Enhanced Universal Price Comparator v3.1 - Fixed Search Loaded:', window.location.href);

// === PERFORMANCE OPTIMIZATIONS ===

// Debounce utility for expensive operations
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Throttle utility for high-frequency events
const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    return function(...args) {
        if (!lastRan) {
            func.apply(this, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
};

// Efficient DOM cache
class DOMCache {
    constructor() {
        this.cache = new Map();
    }
    
    get(selector) {
        if (!this.cache.has(selector)) {
            this.cache.set(selector, document.querySelectorAll(selector));
        }
        return this.cache.get(selector);
    }
    
    clear() {
        this.cache.clear();
    }
    
    invalidate(selector) {
        this.cache.delete(selector);
    }
}

// === GLOBAL STATE MANAGEMENT ===
class ExtensionState {
    constructor() {
        this.currentPageType = null;
        this.lastUrl = window.location.href;
        this.isInitialized = false;
        this.urlChangeCount = 0;
        
        // Navigation monitoring
        this.navigationInterval = null;
        
        // Page-specific state
        this.comparisonData = {};
        this.vendorInfo = {};
        this.pairedVendors = new Set();
        this.processedVendors = new Set();
        this.allProductElements = new WeakSet();
        this.activeObservers = [];
        this.vendorList = [];
        
        // Performance tracking
        this.performanceMetrics = {
            initTime: 0,
            processTime: 0,
            apiCalls: 0
        };
        
        // DOM cache
        this.domCache = new DOMCache();
    }
    
    reset() {
        this.comparisonData = {};
        this.vendorInfo = {};
        this.pairedVendors = new Set();
        this.processedVendors = new Set();
        this.allProductElements = new WeakSet();
        this.vendorList = [];
        this.domCache.clear();
    }
    
    cleanup() {
        this.activeObservers.forEach(observer => observer.disconnect());
        this.activeObservers = [];
        this.domCache.clear();
        this.vendorList = [];
        if (this.navigationInterval) {
            clearInterval(this.navigationInterval);
        }
    }
}

const state = new ExtensionState();

// === ENHANCED SEARCH STATE MANAGEMENT ===
class SearchManager {
    constructor() {
        this.history = this.loadFromStorage('spVsTpSearchHistory');
        this.favorites = this.loadFromStorage('spVsTpFavorites');
        this.searchStats = this.loadFromStorage('spVsTpSearchStats');
        this.currentCategory = 'all';
        this.maxPrice = null; // For price filtering
        this.isSearching = false;
        this.searchTimeout = null;
        this.searchResults = [];
        this.filteredResults = [];
        this.currentSort = 'relevance';
        this.searchStartTime = null;
        this.searchCache = new Map();
        
        // Initialize search stats if not exists or fix corrupted data
        if (!this.searchStats || typeof this.searchStats !== 'object') {
            this.searchStats = {
                totalSearches: 0,
                averageResultCount: 0,
                popularQueries: {},
                lastSearchTime: null
            };
            this.saveToStorage('spVsTpSearchStats', this.searchStats);
        }
        
        // Ensure popularQueries exists
        if (!this.searchStats.popularQueries || typeof this.searchStats.popularQueries !== 'object') {
            this.searchStats.popularQueries = {};
            this.saveToStorage('spVsTpSearchStats', this.searchStats);
        }
    }
    
    loadFromStorage(key) {
        try {
            const data = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(data) ? data : (data || []);
        } catch (e) {
            console.warn(`Failed to load ${key}:`, e);
            return [];
        }
    }
    
    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save to storage:', e);
        }
    }
    
    addToHistory(query) {
        if (!query || query.length < 2) return;
        
        const normalizedQuery = query.trim().toLowerCase();
        const idx = this.history.findIndex(item => 
            (typeof item === 'string' ? item : item.query).toLowerCase() === normalizedQuery
        );
        
        const searchItem = {
            query: query.trim(),
            timestamp: Date.now(),
            resultCount: this.searchResults.length
        };
        
        if (idx !== -1) {
            this.history.splice(idx, 1);
        }
        
        this.history.unshift(searchItem);
        if (this.history.length > 20) this.history.pop();
        
        this.saveToStorage('spVsTpSearchHistory', this.history);
        this.updateSearchStats(query);
    }
    
    updateSearchStats(query) {
        this.searchStats.totalSearches++;
        this.searchStats.lastSearchTime = Date.now();
        
        // Calculate average result count
        const currentAvg = this.searchStats.averageResultCount || 0;
        this.searchStats.averageResultCount = Math.round(
            (currentAvg + this.searchResults.length) / 2
        );
        
        this.saveToStorage('spVsTpSearchStats', this.searchStats);
        this.updateStatsDisplay();
    }
    
    updateStatsDisplay() {
        const statsElement = document.querySelector('.search-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                <span class="stats-item">کل جستجوها: ${this.formatNumber(this.searchStats.totalSearches)}</span>
                <span class="stats-separator">•</span>
                <span class="stats-item">علاقه‌مندی‌ها: ${this.formatNumber(this.favorites.length)}</span>
            `;
        }
    }
    
    formatNumber(num) {
        return new Intl.NumberFormat('fa-IR').format(num || 0);
    }
    
    toggleFavorite(name) {
        const idx = this.favorites.findIndex(fav => 
            (typeof fav === 'string' ? fav : fav.name) === name
        );
        
        if (idx !== -1) {
            this.favorites.splice(idx, 1);
        } else {
            this.favorites.push({
                name: name,
                timestamp: Date.now(),
                source: state.currentPageType
            });
        }
        
        if (this.favorites.length > 50) this.favorites.pop();
        this.saveToStorage('spVsTpFavorites', this.favorites);
        this.updateStatsDisplay();
    }
    
    isFavorite(name) {
        return this.favorites.some(fav => 
            (typeof fav === 'string' ? fav : fav.name) === name
        );
    }
    
    clearHistory() {
        this.history = [];
        this.saveToStorage('spVsTpSearchHistory', this.history);
    }
    
    resetStats() {
        this.searchStats = {
            totalSearches: 0,
            averageResultCount: 0,
            popularQueries: {},
            lastSearchTime: null
        };
        this.saveToStorage('spVsTpSearchStats', this.searchStats);
        this.updateStatsDisplay();
    }
}

const searchManager = new SearchManager();

// === OPTIMIZED PAGE TYPE DETECTION ===
const PAGE_PATTERNS = {
    'snappfood-menu': /snappfood\.ir\/restaurant\/menu\//,
    'tapsifood-menu': /tapsi\.food\/vendor\//,
    'snappfood-service': /snappfood\.ir\/service\/.+\/city\//,
    'snappfood-homepage': /^https?:\/\/(www\.)?snappfood\.ir\/?(\?.*)?$/
};

function detectPageType(url = window.location.href) {
    for (const [type, pattern] of Object.entries(PAGE_PATTERNS)) {
        if (pattern.test(url)) return type;
    }
    return 'unknown';
}

// === MEMORY-EFFICIENT CLEANUP ===
function cleanupAll() {
    console.log('🧹 Optimized cleanup starting...');
    const startTime = performance.now();
    
    // Batch DOM operations for better performance
    const elementsToRemove = [
        '.sp-vs-tp-comparison-text',
        '#sp-vs-tp-widget-container', 
        '#sp-vs-tp-widget-icon', 
        '.sp-vs-tp-paired-vendor-textbox', 
        '.sp-vs-tp-paired-vendor-badge',
        '.sp-vs-tp-high-rating-textbox', 
        '.sp-vs-tp-recommendation-textbox',
        '.sp-vs-tp-recommendation-badge',
        '.sp-vs-tp-star-badge'
    ];
    
    // Single query for all elements to remove
    const selector = elementsToRemove.join(', ');
    document.querySelectorAll(selector).forEach(el => el.remove());
    
    // Batch class removal
    const classesToRemove = [
        'sp-vs-tp-cheaper', 'sp-vs-tp-expensive', 'sp-vs-tp-same-price',
        'sp-vs-tp-same-price-gray', 'sp-vs-tp-unpaired',
        'sp-vs-tp-vendor-paired', 'sp-vs-tp-vendor-high-rating', 'sp-vs-tp-vendor-hot-recommendation'
    ];
    
    const classSelector = classesToRemove.map(cls => `.${cls}`).join(', ');
    document.querySelectorAll(classSelector).forEach(el => {
        el.classList.remove(...classesToRemove);
    });
    
    // Clean up state
    state.reset();
    
    const cleanupTime = performance.now() - startTime;
    console.log(`✅ Optimized cleanup completed in ${cleanupTime.toFixed(2)}ms`);
}

// === OPTIMIZED HELPER FUNCTIONS ===

// Cached regex patterns for better performance
const VENDOR_CODE_PATTERNS = {
    snappfood: /-r-([a-zA-Z0-9]+)\/?/,
    tapsifood: /tapsi\.food\/vendor\/([a-zA-Z0-9]+)/
};

function extractVendorCodeFromUrl(url, platform) {
    const pattern = VENDOR_CODE_PATTERNS[platform];
    const match = url.match(pattern);
    return match ? match[1] : null;
}

// Optimized Persian number conversion with caching
const PERSIAN_TO_WESTERN_MAP = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

const persianToWesternCache = new Map();

function persianToWestern(str) {
    if (persianToWesternCache.has(str)) {
        return persianToWesternCache.get(str);
    }
    
    let result = str;
    for (const [persian, western] of Object.entries(PERSIAN_TO_WESTERN_MAP)) {
        result = result.replace(new RegExp(persian, 'g'), western);
    }
    
    persianToWesternCache.set(str, result);
    return result;
}

// Optimized rating extraction with early returns
function extractRatingFromElement(element) {
    if (!element) return null;
    
    const textContent = element.textContent;
    if (!textContent.trim()) return null;
    
    const westernText = persianToWestern(textContent);
    
    // Early return patterns (most common first)
    const patterns = [
        /(\d+\.?\d*)\s*(?:\(.*امتیاز\)|★|⭐)/, // Star ratings (most common)
        /(\d+\.?\d*)\s*(?:از\s*\d+|\/\d+)/,    // Fraction ratings
        /امتیاز[:\s]*(\d+\.?\d*)/i              // Persian ratings
    ];
    
    for (const pattern of patterns) {
        const match = westernText.match(pattern);
        if (match) {
            const rating = parseFloat(match[1]);
            if (rating >= 0 && rating <= 10) return rating;
        }
    }
    
    // Fallback to element-specific search (more expensive)
    const ratingElements = element.querySelectorAll('.sc-hKgILt.jsaCNc, [class*="rating"]');
    for (const ratingEl of ratingElements) {
        const ratingText = persianToWestern(ratingEl.textContent.trim());
        const rating = parseFloat(ratingText);
        if (rating && !isNaN(rating) && rating >= 0 && rating <= 10) {
            return rating;
        }
    }
    
    return null;
}

// === OPTIMIZED TEXT BOX CREATION ===

// Professional badge factory matching SnappFood's design
const TEXT_BOX_TEMPLATES = {
    paired: {
        className: 'sp-vs-tp-paired-vendor-badge',
        text: 'ارسال رایگان از تپسی‌فود',
        backgroundColor: '#28a745'
    },
    recommendation: {
        className: 'sp-vs-tp-recommendation-badge',
        text: 'پیشنهاد ویژه',
        backgroundColor: '#ffc107',
        color: '#212529'
    }
};

function createProfessionalBadge(type) {
    const template = TEXT_BOX_TEMPLATES[type];
    const badge = document.createElement('div');
    badge.className = template.className;
    
    if (type === 'paired') {
        // Create professional badge matching SnappFood's style
        badge.innerHTML = `
            <span class="sp-vs-tp-badge-icon">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.5832 9.58325C14.1229 9.58325 13.7498 9.95635 13.7498 10.4166C13.7498 10.8768 14.1229 11.2499 14.5832 11.2499C15.0434 11.2499 15.4165 10.8768 15.4165 10.4166C15.4165 9.95635 15.0434 9.58325 14.5832 9.58325Z"></path>
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M7.55167 17.6256C5.58545 18.4597 3.42815 17.2569 2.99477 15.2849L2.80188 15.3599C2.54548 15.4596 2.25639 15.4264 2.02933 15.2711C1.80228 15.1157 1.6665 14.8584 1.6665 14.5833L1.6665 9.16659C1.6665 6.62223 2.7184 4.66703 4.31719 3.36431C5.89569 2.07812 7.96582 1.45825 9.99984 1.45825C12.0339 1.45825 14.104 2.07812 15.6825 3.36431C17.2813 4.66703 18.3332 6.62223 18.3332 9.16659V12.4999C18.3332 12.8344 18.1332 13.1364 17.8253 13.2671L7.55167 17.6256Z"></path>
                </svg>
            </span>
            <span class="sp-vs-tp-badge-text">${template.text}</span>
        `;
        
        // Apply professional styling matching SnappFood's badges
        Object.assign(badge.style, {
            display: 'flex !important',
            alignItems: 'center !important',
            gap: '6px !important',
            backgroundColor: template.backgroundColor + ' !important',
            color: 'white !important',
            padding: '8px 12px !important',
            marginTop: '8px !important',
            borderRadius: '8px !important',
            fontSize: '12px !important',
            fontWeight: '500 !important',
            fontFamily: "'IRANSansMobile', 'Vazirmatn', sans-serif !important",
            direction: 'rtl !important',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1) !important',
            border: '1px solid rgba(255,255,255,0.2) !important',
            lineHeight: '1.3 !important'
        });
        
    } else if (type === 'recommendation') {
        // Star badge for top-left positioning
        badge.innerHTML = '⭐ ' + template.text;
        
        Object.assign(badge.style, {
            position: 'absolute !important',
            top: '8px !important',
            left: '8px !important',
            backgroundColor: template.backgroundColor + ' !important',
            color: template.color + ' !important',
            padding: '4px 8px !important',
            borderRadius: '12px !important',
            fontSize: '10px !important',
            fontWeight: 'bold !important',
            fontFamily: "'IRANSansMobile', 'Vazirmatn', sans-serif !important",
            direction: 'rtl !important',
            textAlign: 'center !important',
            whiteSpace: 'nowrap !important',
            zIndex: '10 !important',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15) !important',
            border: '1px solid rgba(255,255,255,0.3) !important'
        });
    }
    
    return badge;
}

// Legacy function for backward compatibility
function createTextBox(type, rating = null) {
    return createProfessionalBadge(type);
}

// Create compact star badge for top-left positioning
function createStarBadge() {
    return createProfessionalBadge('recommendation');
}

// === ENHANCED PROFESSIONAL SEARCH WIDGET ===

function openCounterpartVendor() {
    if (state.currentPageType.startsWith('snappfood') && state.vendorInfo.tf_code) {
        window.open(`https://tapsi.food/vendor/${state.vendorInfo.tf_code}`, '_blank');
    } else if (state.currentPageType.startsWith('tapsifood') && state.vendorInfo.sf_code) {
        window.open(`https://snappfood.ir/restaurant/menu/${state.vendorInfo.sf_code}`, '_blank');
    }
}

function formatPrice(price) {
    return new Intl.NumberFormat('fa-IR').format(price);
}

function formatPercentage(percent) {
    return new Intl.NumberFormat('fa-IR').format(percent);
}

function formatNumber(num) {
    return new Intl.NumberFormat('fa-IR').format(num);
}

// Enhanced search analytics
function trackSearchAnalytics(query, resultCount, searchTime) {
    const analytics = {
        query: query,
        resultCount: resultCount,
        searchTime: searchTime,
        timestamp: Date.now(),
        pageType: state.currentPageType,
        hasProductData: Object.keys(state.comparisonData).length > 0
    };
    
    console.log('📊 Search analytics:', analytics);
}

// IMPROVED search with better matching
function performAdvancedSearch(query, list, input) {
    if (searchManager.searchTimeout) {
        clearTimeout(searchManager.searchTimeout);
    }
    
    searchManager.isSearching = true;
    updateSearchStatus('در حال جستجو...', true);
    
    searchManager.searchTimeout = setTimeout(() => {
        const startTime = performance.now();
        searchManager.searchStartTime = startTime;
        
        const category = searchManager.currentCategory;
        const hasProductData = Object.keys(state.comparisonData).length > 0;
        let results = hasProductData ? Object.values(state.comparisonData) : state.vendorList;
        
        // Clear cache if needed
        const cacheKey = `${query}-${category}-${hasProductData}`;
        
        // Search logic
        if (query && query.length >= 1) {
            results = performSmartSearch(query, results, hasProductData);
        }
        
        // Apply category filters
        results = applyCategoryFilters(results, category, hasProductData);
        
        // Apply current sort
        results = applySorting(results, searchManager.currentSort, hasProductData);
        
        // Store results
        searchManager.searchResults = results;
        searchManager.filteredResults = results;
        
        const searchTime = performance.now() - startTime;
        
        // Render results
        if (hasProductData) {
            renderEnhancedResults(results, list);
        } else {
            renderEnhancedVendorResults(results, list);
        }
        
        // Update search status
        updateSearchStatus(`${formatNumber(results.length)} نتیجه در ${searchTime.toFixed(0)} میلی‌ثانیه`, false);
        
        // Add to history and analytics
        if (query) {
            searchManager.addToHistory(query);
            trackSearchAnalytics(query, results.length, searchTime);
        }
        
        searchManager.isSearching = false;
        
    }, query ? 150 : 0); // Debounce user input, but instant for category changes
}

// IMPROVED smart search with better fuzzy matching
function performSmartSearch(query, data, hasProductData) {
    const lowerQuery = query.toLowerCase().trim();
    const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 0);
    
    if (queryWords.length === 0) return data;
    
    const results = data.map(item => {
        let score = 0;
        let searchableText = '';
        
        if (hasProductData) {
            searchableText = `${item.baseProduct.name} ${item.counterpartProduct.name}`.toLowerCase();
        } else {
            searchableText = `${item.vendor_mapping.sf_name} ${item.vendor_mapping.tf_name}`.toLowerCase();
        }
        
        // Exact match bonus (highest priority)
        if (searchableText.includes(lowerQuery)) {
            score += 1000;
        }
        
        // Word matching with different weights
        queryWords.forEach(word => {
            if (searchableText.includes(word)) {
                score += 100;
                
                // Start of word bonus
                if (searchableText.includes(' ' + word) || searchableText.startsWith(word)) {
                    score += 50;
                }
            } else {
                // Simple similarity check
                const similarity = calculateSimpleSimilarity(word, searchableText);
                score += similarity;
            }
        });
        
        // Length penalty for very different lengths
        const lengthDiff = Math.abs(lowerQuery.length - searchableText.length);
        score -= lengthDiff * 2;
        
        return { ...item, searchScore: score };
    });
    
    return results
        .filter(item => item.searchScore > 10) // Higher threshold for better results
        .sort((a, b) => b.searchScore - a.searchScore);
}

// Improved similarity calculation
function calculateSimpleSimilarity(query, text) {
    let score = 0;
    let queryIndex = 0;
    
    // Check for partial matches
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
        if (text[i] === query[queryIndex]) {
            score += 10;
            queryIndex++;
        }
    }
    
    // Bonus for consecutive matches
    if (queryIndex === query.length) {
        score += 20;
    }
    
    return score;
}

// Apply category filters with price filter support
function applyCategoryFilters(results, category, hasProductData) {
    if (!hasProductData) return results;
    
    switch (category) {
        case 'tf-cheaper':
            return results.filter(r => r.priceDiff > 0);
        case 'sf-cheaper':
            return results.filter(r => r.priceDiff < 0);
        case 'same-price':
            return results.filter(r => r.priceDiff === 0);
        case 'high-savings':
            let filtered = results.filter(r => Math.abs(r.priceDiff) > 5000);
            // Apply price filter if set
            if (searchManager.maxPrice) {
                filtered = filtered.filter(r => r.baseProduct.price <= searchManager.maxPrice);
            }
            return filtered;
        case 'favorites':
            return results.filter(r => searchManager.isFavorite(r.baseProduct.name));
        default:
            return results;
    }
}

// Apply sorting
function applySorting(results, sortType, hasProductData) {
    if (!hasProductData) {
        // Vendor sorting
        switch (sortType) {
            case 'name-asc':
                return results.sort((a, b) => 
                    a.vendor_mapping.sf_name.localeCompare(b.vendor_mapping.sf_name, 'fa'));
            case 'name-desc':
                return results.sort((a, b) => 
                    b.vendor_mapping.sf_name.localeCompare(a.vendor_mapping.sf_name, 'fa'));
            default:
                return results;
        }
    }
    
    // Product sorting
    switch (sortType) {
        case 'price-asc':
            return results.sort((a, b) => a.baseProduct.price - b.baseProduct.price);
        case 'price-desc':
            return results.sort((a, b) => b.baseProduct.price - a.baseProduct.price);
        case 'savings-desc':
            return results.sort((a, b) => Math.abs(b.priceDiff) - Math.abs(a.priceDiff));
        case 'percent-desc':
            return results.sort((a, b) => b.percentDiff - a.percentDiff);
        case 'name-asc':
            return results.sort((a, b) => 
                a.baseProduct.name.localeCompare(b.baseProduct.name, 'fa'));
        case 'name-desc':
            return results.sort((a, b) => 
                b.baseProduct.name.localeCompare(a.baseProduct.name, 'fa'));
        case 'relevance':
        default:
            return results; // Already sorted by search score
    }
}

// Enhanced result rendering with better UI
function renderEnhancedResults(results, list) {
    list.innerHTML = '';
    
    if (results.length === 0) {
        const noResults = document.createElement('li');
        noResults.className = 'no-results';
        noResults.innerHTML = `
            <div class="no-results-content">
                <span class="no-results-icon">🔍</span>
                <p>نتیجه‌ای یافت نشد</p>
                <small>کلمات کلیدی مختلفی امتحان کنید</small>
            </div>
        `;
        list.appendChild(noResults);
        return;
    }
    
    results.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'result-item enhanced';
        
        const baseIsSf = state.currentPageType.startsWith('snappfood');
        const baseLabel = baseIsSf ? 'اسنپ‌فود' : 'تپسی‌فود';
        const counterLabel = baseIsSf ? 'تپسی‌فود' : 'اسنپ‌فود';
        const baseClass = baseIsSf ? 'sf' : 'tf';
        const counterClass = baseIsSf ? 'tf' : 'sf';
        
        const priceDiffText = item.priceDiff === 0 ? 'قیمت برابر' :
            item.priceDiff > 0 ? `${formatPrice(Math.abs(item.priceDiff))} تومان ارزان‌تر` :
            `${formatPrice(Math.abs(item.priceDiff))} تومان گران‌تر`;
        
        const percentageText = item.percentDiff > 0 ? ` (${formatPercentage(item.percentDiff)}%)` : '';
        
        const savingsClass = item.priceDiff > 0 ? 'savings' : 
                           item.priceDiff < 0 ? 'expensive' : 'equal';
        
        li.innerHTML = `
            <div class="result-header">
                <div class="result-title">
                    <h4>${item.baseProduct.name}</h4>
                    <div class="result-actions">
                        <span class="favorite-icon ${searchManager.isFavorite(item.baseProduct.name) ? 'active' : ''}" 
                              title="افزودن به علاقه‌مندی‌ها">
                            ${searchManager.isFavorite(item.baseProduct.name) ? '★' : '☆'}
                        </span>
                        <span class="result-index">#${index + 1}</span>
                    </div>
                </div>
                <div class="price-comparison ${savingsClass}">
                    <span class="comparison-badge">${priceDiffText}${percentageText}</span>
                </div>
            </div>
            <div class="result-body">
                <div class="price-row">
                    <span class="platform-label ${baseClass}">${baseLabel}</span>
                    <span class="price-value">${formatPrice(item.baseProduct.price)} تومان</span>
                </div>
                <div class="price-row">
                    <span class="platform-label ${counterClass}">${counterLabel}</span>
                    <span class="price-value">${formatPrice(item.counterpartProduct.price)} تومان</span>
                </div>
            </div>
        `;
        
        // Add favorite toggle functionality
        const favoriteIcon = li.querySelector('.favorite-icon');
        favoriteIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            searchManager.toggleFavorite(item.baseProduct.name);
            favoriteIcon.textContent = searchManager.isFavorite(item.baseProduct.name) ? '★' : '☆';
            favoriteIcon.classList.toggle('active');
            
            // Show feedback
            showToast(searchManager.isFavorite(item.baseProduct.name) ? 
                'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
        });
        
        // Add click to navigate functionality
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.favorite-icon')) {
                openCounterpartVendor();
                trackAction('result_click', { product: item.baseProduct.name });
            }
        });
        
        // Add animation delay
        li.style.animationDelay = `${index * 50}ms`;
        
        list.appendChild(li);
    });
}

// Enhanced vendor results rendering
function renderEnhancedVendorResults(results, list) {
    list.innerHTML = '';
    
    if (results.length === 0) {
        const noResults = document.createElement('li');
        noResults.className = 'no-results';
        noResults.innerHTML = `
            <div class="no-results-content">
                <span class="no-results-icon">🏪</span>
                <p>رستورانی یافت نشد</p>
                <small>نام رستوران را بررسی کنید</small>
            </div>
        `;
        list.appendChild(noResults);
        return;
    }
    
    results.forEach((vendor, index) => {
        const li = document.createElement('li');
        li.className = 'result-item vendor-item enhanced';
        
        const sfCode = vendor.vendor_mapping.sf_code;
        const tfCode = vendor.vendor_mapping.tf_code;
        const sfName = vendor.vendor_mapping.sf_name || '-';
        const tfName = vendor.vendor_mapping.tf_name || '-';
        const itemCount = vendor.item_count || 0;
        
        li.innerHTML = `
            <div class="vendor-header">
                <div class="vendor-info">
                    <h4>${sfName}</h4>
                    <div class="vendor-stats">
                        <span class="item-count">${formatNumber(itemCount)} محصول قابل مقایسه</span>
                        <span class="vendor-index">#${index + 1}</span>
                    </div>
                </div>
            </div>
            <div class="vendor-platforms">
                <a class="platform-link sf" href="https://snappfood.ir/restaurant/menu/${sfCode}" target="_blank">
                    <span class="platform-name">اسنپ‌فود</span>
                    <span class="vendor-name">${sfName}</span>
                </a>
                <a class="platform-link tf" href="https://tapsi.food/vendor/${tfCode}" target="_blank">
                    <span class="platform-name">تپسی‌فود</span>
                    <span class="vendor-name">${tfName}</span>
                </a>
            </div>
        `;
        
        // Add animation delay
        li.style.animationDelay = `${index * 50}ms`;
        
        list.appendChild(li);
    });
}

// Update search status
function updateSearchStatus(message, isLoading = false) {
    const statusElement = document.querySelector('.search-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `search-status ${isLoading ? 'loading' : ''}`;
    }
}

// Show toast notification
function showToast(message, duration = 2000) {
    // Remove existing toast
    const existingToast = document.querySelector('.search-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'search-toast';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Track user actions for analytics
function trackAction(action, data = {}) {
    const actionData = {
        action,
        timestamp: Date.now(),
        pageType: state.currentPageType,
        ...data
    };
    
    console.log('📊 Action tracked:', actionData);
}

// Toggle widget visibility
function toggleWidget() {
    const container = document.getElementById('sp-vs-tp-widget-container');
    if (container) {
        const isVisible = container.classList.contains('show');
        container.classList.toggle('show');
        
        // Track widget usage
        trackAction(isVisible ? 'widget_close' : 'widget_open');
        
        // Focus on search input when opening
        if (!isVisible) {
            setTimeout(() => {
                const searchInput = container.querySelector('#sp-vs-tp-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 100);
        }
    }
}

// Create enhanced search widget with professional features
function createSearchWidget() {
    if (document.getElementById('sp-vs-tp-widget-icon')) return;

    const icon = document.createElement('div');
    icon.id = 'sp-vs-tp-widget-icon';
    icon.innerHTML = `
        <div class="widget-icon-content">
            <span class="widget-icon-symbol">🔍</span>
            <div class="widget-icon-badge" id="widget-result-count" style="display: none;">0</div>
        </div>
    `;
    icon.addEventListener('click', toggleWidget);
    document.body.appendChild(icon);

    const container = document.createElement('div');
    container.id = 'sp-vs-tp-widget-container';
    container.innerHTML = `
        <div id="sp-vs-tp-widget-header">
            <div class="header-content">
                <span class="header-title">جستجوی هوشمند محصولات</span>
                <div class="header-actions">
                    <button class="header-action" id="widget-minimize" title="کوچک کردن">−</button>
                    <button class="header-action" id="widget-close" title="بستن">×</button>
                </div>
            </div>
            <div class="search-status">آماده جستجو</div>
        </div>
        <div id="sp-vs-tp-widget-body">
            <div class="search-controls">
                <div class="search-input-container">
                    <input id="sp-vs-tp-search-input" placeholder="نام محصول یا رستوران را وارد کنید..." />
                    <button class="search-clear" id="search-clear-btn" title="پاک کردن">×</button>
                </div>
                <div class="search-filters">
                    <div id="sp-vs-tp-category-buttons">
                        <button class="sp-vs-tp-category-btn active" data-category="all">همه</button>
                        <button class="sp-vs-tp-category-btn" data-category="tf-cheaper">ارزان‌تر در تپسی‌فود</button>
                        <button class="sp-vs-tp-category-btn" data-category="sf-cheaper">ارزان‌تر در اسنپ‌فود</button>
                        <button class="sp-vs-tp-category-btn" data-category="same-price">قیمت برابر</button>
                        <button class="sp-vs-tp-category-btn" data-category="high-savings" id="high-savings-btn">صرفه‌جویی بالا</button>
                        <button class="sp-vs-tp-category-btn" data-category="favorites">علاقه‌مندی‌ها</button>
                    </div>
                    <div class="price-filter" id="price-filter" style="display: none;">
                        <label for="max-price">حداکثر قیمت (تومان):</label>
                        <input type="number" id="max-price" placeholder="مثال: 50000" />
                    </div>
                    <div class="sort-controls">
                        <label for="sort-select">مرتب‌سازی:</label>
                        <select id="sort-select">
                            <option value="relevance">مرتبط‌ترین</option>
                            <option value="savings-desc">بیشترین صرفه‌جویی</option>
                            <option value="percent-desc">بیشترین درصد تخفیف</option>
                            <option value="price-asc">ارزان‌ترین</option>
                            <option value="price-desc">گران‌ترین</option>
                            <option value="name-asc">الفبایی (الف-ی)</option>
                            <option value="name-desc">الفبایی (ی-الف)</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="results-container">
                <ul id="sp-vs-tp-search-results"></ul>
            </div>
            <div class="widget-footer">
                <div class="search-stats" id="search-stats">
                    <span class="stats-item">کل جستجوها: ${formatNumber(searchManager.searchStats.totalSearches)}</span>
                    <span class="stats-separator">•</span>
                    <span class="stats-item">علاقه‌مندی‌ها: ${formatNumber(searchManager.favorites.length)}</span>
                </div>
                <div class="quick-actions">
                    <button class="quick-action" id="widget-settings" title="تنظیمات">⚙️</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(container);

    // Setup enhanced interactions
    setupWidgetInteractions(container);
}

// Setup all widget interactions and event listeners
function setupWidgetInteractions(container) {
    const input = container.querySelector('#sp-vs-tp-search-input');
    const list = container.querySelector('#sp-vs-tp-search-results');
    const buttons = container.querySelectorAll('.sp-vs-tp-category-btn');
    const sortSelect = container.querySelector('#sort-select');
    const clearBtn = container.querySelector('#search-clear-btn');
    const closeBtn = container.querySelector('#widget-close');
    const minimizeBtn = container.querySelector('#widget-minimize');
    const settingsBtn = container.querySelector('#widget-settings');
    const priceFilter = container.querySelector('#price-filter');
    const maxPriceInput = container.querySelector('#max-price');
    const highSavingsBtn = container.querySelector('#high-savings-btn');

    // Search input functionality
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Show/hide clear button
        clearBtn.style.display = query ? 'block' : 'none';
        
        // Update result count badge
        updateResultCountBadge(0);
        
        // Perform search
        performAdvancedSearch(query, list, input);
    });

    // Clear search functionality
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        updateResultCountBadge(0);
        performAdvancedSearch('', list, input);
        input.focus();
    });

    // Category buttons functionality
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            searchManager.currentCategory = btn.dataset.category;
            
            // Show/hide price filter for high-savings
            if (btn.dataset.category === 'high-savings') {
                priceFilter.style.display = 'block';
            } else {
                priceFilter.style.display = 'none';
                searchManager.maxPrice = null;
                maxPriceInput.value = '';
            }
            
            trackAction('category_change', { category: searchManager.currentCategory });
            performAdvancedSearch(input.value.trim(), list, input);
        });
    });

    // Price filter functionality
    maxPriceInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        searchManager.maxPrice = isNaN(value) ? null : value;
        if (searchManager.currentCategory === 'high-savings') {
            performAdvancedSearch(input.value.trim(), list, input);
        }
    });

    // Sort functionality
    sortSelect.addEventListener('change', (e) => {
        searchManager.currentSort = e.target.value;
        trackAction('sort_change', { sort: searchManager.currentSort });
        performAdvancedSearch(input.value.trim(), list, input);
    });

    // Widget controls
    closeBtn.addEventListener('click', () => {
        container.classList.remove('show');
        trackAction('widget_close');
    });

    minimizeBtn.addEventListener('click', () => {
        container.classList.toggle('minimized');
        minimizeBtn.textContent = container.classList.contains('minimized') ? '+' : '−';
        trackAction('widget_minimize');
    });

    // Settings functionality
    settingsBtn.addEventListener('click', () => {
        showSettingsModal();
        trackAction('settings_open');
    });

    // Keyboard shortcuts
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const firstResult = list.querySelector('.result-item');
            if (firstResult) {
                firstResult.click();
            }
        } else if (e.key === 'Escape') {
            container.classList.remove('show');
        }
    });

    // Initialize with default view
    performAdvancedSearch('', list, input);
}

// Update result count badge on widget icon
function updateResultCountBadge(count) {
    const badge = document.getElementById('widget-result-count');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Show settings modal
function showSettingsModal() {
    // Remove existing modal
    const existingModal = document.querySelector('.settings-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="settings-content">
            <div class="settings-header">
                <h3>تنظیمات جستجو</h3>
                <button class="settings-close">×</button>
            </div>
            <div class="settings-body">
                <div class="setting-group">
                    <h4>آمار جستجو</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">کل جستجوها</span>
                            <span class="stat-value">${formatNumber(searchManager.searchStats.totalSearches)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">علاقه‌مندی‌ها</span>
                            <span class="stat-value">${formatNumber(searchManager.favorites.length)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">تاریخچه</span>
                            <span class="stat-value">${formatNumber(searchManager.history.length)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">متوسط نتایج</span>
                            <span class="stat-value">${Math.round(searchManager.searchStats.averageResultCount || 0)}</span>
                        </div>
                    </div>
                </div>
                <div class="setting-group">
                    <h4>عملیات</h4>
                    <div class="settings-actions">
                        <button class="setting-btn danger" id="clear-favorites">پاک کردن علاقه‌مندی‌ها</button>
                        <button class="setting-btn danger" id="clear-history">پاک کردن تاریخچه</button>
                        <button class="setting-btn danger" id="reset-stats">بازنشانی آمار</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('.settings-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    modal.querySelector('#clear-favorites').addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام علاقه‌مندی‌ها را پاک کنید؟')) {
            searchManager.favorites = [];
            searchManager.saveToStorage('spVsTpFavorites', searchManager.favorites);
            searchManager.updateStatsDisplay();
            showToast('علاقه‌مندی‌ها پاک شدند');
            modal.remove();
        }
    });
    
    modal.querySelector('#clear-history').addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید تمام تاریخچه را پاک کنید؟')) {
            searchManager.clearHistory();
            showToast('تاریخچه پاک شد');
            modal.remove();
        }
    });
    
    modal.querySelector('#reset-stats').addEventListener('click', () => {
        if (confirm('آیا مطمئن هستید که می‌خواهید آمار را بازنشانی کنید؟')) {
            searchManager.resetStats();
            showToast('آمار بازنشانی شد');
            modal.remove();
        }
    });
    
    // Show modal with animation
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
}

// === OPTIMIZED MENU PAGE LOGIC ===

// Memoized product processing
const processedProducts = new WeakMap();

function injectSnappFoodComparisons() {
    const productCards = state.domCache.get('section.ProductCard__Box-sc-1wfx2e0-0');
    console.log(`🔄 Processing ${productCards.length} SnappFood products`);
    
    // Use requestIdleCallback for non-blocking processing
    function processChunk(startIndex) {
        const endIndex = Math.min(startIndex + 10, productCards.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const productCard = productCards[i];
            if (!processedProducts.has(productCard)) {
                injectSnappFoodComparison(productCard);
                processedProducts.set(productCard, true);
            }
        }
        
        if (endIndex < productCards.length) {
            requestIdleCallback(() => processChunk(endIndex));
        }
    }
    
    requestIdleCallback(() => processChunk(0));
}

function injectSnappFoodComparison(productCard) {
    const titleElement = productCard.querySelector('h2.sc-hKgILt.esHHju');
    if (!titleElement) return;
    
    const cardTitle = titleElement.textContent.trim();
    
    // Optimized product matching
    const matchedProduct = Object.values(state.comparisonData)
        .find(p => p.baseProduct.name.trim() === cardTitle);
    
    if (!matchedProduct) {
        productCard.classList.add('sp-vs-tp-unpaired');
        return;
    }
    
    // Check if already processed
    if (productCard.querySelector('.sp-vs-tp-comparison-text')) return;
    
    const priceElement = productCard.querySelector('span.sc-hKgILt.hxREoh');
    if (!priceElement) return;
    
    // Create comparison element efficiently
    const { text, className } = getComparisonText(matchedProduct);
    
    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = `sp-vs-tp-comparison-text ${className}`;
    comparisonDiv.textContent = text;
    comparisonDiv.style.fontFamily = "'IRANSansMobile', 'Vazirmatn', sans-serif";
    
    // Add click handler
    comparisonDiv.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.vendorInfo.tf_code) {
            window.open(`https://tapsi.food/vendor/${state.vendorInfo.tf_code}`, '_blank');
        }
    }, { passive: false });
    
    productCard.classList.add(className);
    priceElement.parentElement.insertBefore(comparisonDiv, priceElement);
}

// Optimized comparison text generation
function getComparisonText(data) {
    const absDiff = new Intl.NumberFormat('fa-IR').format(Math.abs(data.priceDiff));
    
    if (data.priceDiff === 0) {
        return { text: 'سفارش از تپسی‌فود (پیک رایگان)', className: 'sp-vs-tp-same-price' };
    } else if (data.priceDiff > 0) {
        return { 
            text: `${data.percentDiff}% ارزان‌تر در تپسی‌فود (${absDiff} تومان کمتر)`, 
            className: 'sp-vs-tp-cheaper' 
        };
    } else {
        return { 
            text: `${data.percentDiff}% گران‌تر در تپسی‌فود (${absDiff} تومان بیشتر)`, 
            className: 'sp-vs-tp-expensive' 
        };
    }
}

// === OPTIMIZED VENDOR HIGHLIGHTING ===

function processVendorElements() {
    const startTime = performance.now();
    console.log('🔄 Optimized vendor processing starting...');
    
    // Batch query for all restaurant links
    const restaurantLinks = state.domCache.get('a[href*="/restaurant/menu/"]');
    console.log(`📍 Found ${restaurantLinks.length} restaurant menu links`);
    
    if (restaurantLinks.length === 0) {
        console.log('❌ No restaurant links found - page might not be loaded yet');
        return;
    }
    
    let totalHighlighted = 0;
    const processedCodes = new Set();
    
    // Process in chunks for better performance
    const processChunk = (links, startIndex, chunkSize = 20) => {
        const endIndex = Math.min(startIndex + chunkSize, links.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const link = links[i];
            const vendorCode = extractVendorCodeFromUrl(link.href, 'snappfood');
            
            if (vendorCode && !processedCodes.has(vendorCode)) {
                processedCodes.add(vendorCode);
                
                if (state.pairedVendors.has(vendorCode)) {
                    const container = findBestContainer(link);
                    if (container) {
                        const rating = extractRatingFromElement(container);
                        highlightVendor(container, vendorCode, rating);
                        totalHighlighted++;
                    }
                }
            }
        }
        
        // Continue processing if there are more items
        if (endIndex < links.length) {
            requestIdleCallback(() => processChunk(links, endIndex, chunkSize));
        } else {
            const processTime = performance.now() - startTime;
            console.log(`✅ Optimized processing complete. Highlighted: ${totalHighlighted}, Time: ${processTime.toFixed(2)}ms`);
        }
    };
    
    // Start processing
    requestIdleCallback(() => processChunk(restaurantLinks, 0));
}

// Optimized container finding with caching
const containerCache = new WeakMap();

function findBestContainer(link) {
    if (containerCache.has(link)) {
        return containerCache.get(link);
    }
    
    const candidates = [
        link.closest('[class*="card"], [class*="Card"]'),
        link.closest('article'),
        link.closest('li'),
        link.closest('[class*="vendor"], [class*="restaurant"]'),
        link.parentElement
    ];
    
    const container = candidates.find(candidate => 
        candidate && candidate !== document.body && candidate !== document.documentElement
    ) || link.parentElement;
    
    containerCache.set(link, container);
    return container;
}

// Optimized vendor highlighting with professional badges
function highlightVendor(vendorElement, vendorCode, rating) {
    const uniqueId = `${vendorCode}-${rating || 'no-rating'}`;
    if (!vendorElement || state.processedVendors.has(uniqueId)) return;
    
    const isPaired = state.pairedVendors.has(vendorCode);
    const isVeryHighRating = rating && rating > 4.5; // Only check for 4.5+ (hot recommendations)
    
    console.log(`🔍 Processing vendor ${vendorCode}:`, { isPaired, rating, isVeryHighRating });
    
    // Find the actual card box for border highlighting
    const cardBox = vendorElement.querySelector('.VendorCard__VendorBox-sc-6qaz7-0');
    
    // Handle very high rating (4.5+) - Star badge on top-left + yellow border
    if (isVeryHighRating) {
        // Ensure element can contain absolutely positioned badge
        if (vendorElement.style.position !== 'relative' && vendorElement.style.position !== 'absolute') {
            vendorElement.style.position = 'relative';
        }
        
        // Apply border to the card box
        if (cardBox) {
            cardBox.classList.add('sp-vs-tp-vendor-hot-recommendation');
        }
        
        // Add star badge to top-left
        const starBadge = createStarBadge();
        vendorElement.appendChild(starBadge);
        
        console.log(`⭐ Added star badge for high-rated vendor ${vendorCode} (${rating})`);
        
        // If also paired, add professional badge to image wrapper area
        if (isPaired) {
            const imageWrapper = vendorElement.querySelector('.VendorCard__ImgWrapper-sc-6qaz7-2');
            if (imageWrapper) {
                const pairedBadge = createProfessionalBadge('paired');
                // Position it closer to SnappFood's badge
                pairedBadge.style.position = 'absolute';
                pairedBadge.style.bottom = '70px'; // Move up from 8px to 40px to be closer to SnappFood badge
                pairedBadge.style.left = '8px';
                pairedBadge.style.right = '8px';
                pairedBadge.style.zIndex = '5';
                imageWrapper.style.position = 'relative';
                imageWrapper.appendChild(pairedBadge);
                console.log(`🔗 Added paired badge for high-rated vendor ${vendorCode}`);
            }
        }
    }
    // Handle just paired vendors (no special rating) - Green border + professional badge
    else if (isPaired) {
        // Apply border to the card box
        if (cardBox) {
            cardBox.classList.add('sp-vs-tp-vendor-paired');
        }
        
        // Find the image wrapper to add the professional badge
        const imageWrapper = vendorElement.querySelector('.VendorCard__ImgWrapper-sc-6qaz7-2');
        if (imageWrapper) {
            const pairedBadge = createProfessionalBadge('paired');
            // Position it closer to SnappFood's badge
            pairedBadge.style.position = 'absolute';
            pairedBadge.style.bottom = '70px'; // Move up from 8px to 40px to be closer to SnappFood badge
            pairedBadge.style.left = '8px';
            pairedBadge.style.right = '8px';
            pairedBadge.style.zIndex = '5';
            imageWrapper.style.position = 'relative';
            imageWrapper.appendChild(pairedBadge);
            console.log(`🔗 Added professional paired badge for vendor ${vendorCode}`);
        } else {
            console.log(`❌ No image wrapper found for paired vendor ${vendorCode}`);
        }
    }
    else {
        console.log(`⚪ No highlighting for vendor ${vendorCode} - rating: ${rating || 'N/A'}, paired: ${isPaired}`);
    }
    
    state.processedVendors.add(uniqueId);
}

// === OPTIMIZED OBSERVERS ===

// Debounced mutation observer
const debouncedProcessVendors = debounce(processVendorElements, 500);
const debouncedProcessProducts = debounce(injectSnappFoodComparisons, 300);

function setupOptimizedObserver(targetFunction, targetElements) {
    const observer = new MutationObserver((mutations) => {
        const hasRelevantChanges = mutations.some(mutation => {
            return mutation.type === 'childList' && 
                   mutation.addedNodes.length > 0 &&
                   Array.from(mutation.addedNodes).some(node => 
                       node.nodeType === Node.ELEMENT_NODE &&
                       targetElements.some(selector => node.matches?.(selector) || node.querySelector?.(selector))
                   );
        });
        
        if (hasRelevantChanges) {
            state.domCache.clear(); // Invalidate cache
            targetFunction();
        }
    });
    
    const targetNode = document.getElementById('__next') || document.body;
    observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributeFilter: [] // Don't watch attributes for better performance
    });
    
    state.activeObservers.push(observer);
    return observer;
}

// === OPTIMIZED INITIALIZATION ===

function initSnappFoodMenu() {
    console.log('🍕 Optimized SnappFood Menu initialization');
    const startTime = performance.now();

    const isSnappFood = window.location.href.includes('snappfood.ir');
    const vendorCode = extractVendorCodeFromUrl(
        window.location.href,
        isSnappFood ? 'snappfood' : 'tapsifood'
    );
    if (!vendorCode) return;

    state.performanceMetrics.apiCalls++;
    const msg = {
        action: "fetchPrices",
        sourcePlatform: isSnappFood ? "snappfood" : "tapsifood"
    };
    if (isSnappFood) msg.sfVendorCode = vendorCode; else msg.tfVendorCode = vendorCode;

    chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError || !response?.success) return;
        
        state.comparisonData = response.data;
        state.vendorInfo = response.vendorInfo || {};

        createSearchWidget();
        
        // Setup optimized processing
        injectSnappFoodComparisons();
        setupOptimizedObserver(debouncedProcessProducts, ['section[class*="ProductCard"]']);
        
        const initTime = performance.now() - startTime;
        state.performanceMetrics.initTime = initTime;
        console.log(`✅ SnappFood initialization completed in ${initTime.toFixed(2)}ms`);
    });
}

function initVendorHighlighting() {
    console.log('🏠 Optimized vendor highlighting initialization');
    const startTime = performance.now();
    
    state.performanceMetrics.apiCalls++;
    chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
        if (chrome.runtime.lastError || !response?.success) return;
        
        if (response.vendors?.length) {
            state.vendorList = response.vendors;
            response.vendors.forEach(vendor => {
                if (vendor.sf_code) state.pairedVendors.add(vendor.sf_code);
            });
        }
        
        console.log(`✅ Loaded ${state.pairedVendors.size} paired vendors`);

        // Setup optimized processing
        processVendorElements();
        setupOptimizedObserver(debouncedProcessVendors, ['a[href*="/restaurant/menu/"]', '[class*="vendor"]']);

        createSearchWidget();
        
        const initTime = performance.now() - startTime;
        console.log(`✅ Vendor highlighting completed in ${initTime.toFixed(2)}ms`);
    });
}

// === OPTIMIZED NAVIGATION ===

const throttledNavigationCheck = throttle(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== state.lastUrl) {
        state.urlChangeCount++;
        console.log(`🔄 URL changed (#${state.urlChangeCount}): ${state.lastUrl} → ${currentUrl}`);
        state.lastUrl = currentUrl;
        
        // Debounced reinitialization
        clearTimeout(window.universalReinitTimer);
        window.universalReinitTimer = setTimeout(reinitialize, 800);
    }
}, 1000);

function startNavigationMonitoring() {
    console.log('🔍 Starting optimized navigation monitoring');
    
    // Use throttled checking for better performance
    state.navigationInterval = setInterval(throttledNavigationCheck, 1000);
}

// === MAIN INITIALIZATION ===

function reinitialize() {
    const newPageType = detectPageType();
    console.log(`🔄 Optimized reinitializing - Page Type: ${newPageType}`);
    
    // Cleanup previous state
    cleanupAll();
    
    // Initialize based on page type with appropriate delays
    const initFunctions = {
        'snappfood-menu': () => setTimeout(initSnappFoodMenu, 300),
        'tapsifood-menu': () => setTimeout(initSnappFoodMenu, 300), // Reuse same logic
        'snappfood-homepage': () => setTimeout(initVendorHighlighting, 500),
        'snappfood-service': () => setTimeout(initVendorHighlighting, 500)
    };
    
    const initFunction = initFunctions[newPageType];
    if (initFunction) {
        initFunction();
    } else {
        console.log('🤷 Unknown page type, skipping initialization');
    }
    
    state.currentPageType = newPageType;
}

function initialize() {
    if (state.isInitialized) return;
    
    console.log('🚀 Enhanced Universal Content Script v3.1 Initializing');
    console.log('📍 URL:', window.location.href);
    console.log('📄 Page Type:', detectPageType());
    
    startNavigationMonitoring();
    reinitialize();
    
    state.isInitialized = true;
    
    // Performance monitoring
    if (window.performance && window.performance.mark) {
        window.performance.mark('extension-initialized');
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    state.cleanup();
});

// Start the enhanced script
requestIdleCallback ? requestIdleCallback(initialize) : setTimeout(initialize, 0);