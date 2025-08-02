// Enhanced popup functionality with dynamic data and improved UX
console.log("🚀 مقایسه‌گر قیمت غذا - پاپ‌آپ باز شد");

// Global state
let vendorStats = null;
let currentTabInfo = null;
let apiConnectionStatus = 'checking'; // 'checking', 'connected', 'error'

document.addEventListener('DOMContentLoaded', function() {
    console.log("📱 Popup DOM loaded, initializing...");
    
    // Initialize popup components
    initializePopup();
    
    // Add enhanced interactions
    setupFeatureAnimations();
    setupKeyboardNavigation();
});

async function initializePopup() {
    try {
        // Show loading state
        showLoadingState();
        
        // Load vendor statistics first (faster response)
        await loadVendorStats();
        
        // Check current tab in parallel
        await checkCurrentTab();
        
        // Update final UI state
        updateFinalState();
        
    } catch (error) {
        console.error("❌ Popup initialization failed:", error);
        showErrorState("خطا در راه‌اندازی پاپ‌آپ");
    }
}

function loadVendorStats() {
    return new Promise((resolve) => {
        console.log("📊 Loading vendor statistics...");
        
        chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("🔴 Runtime error:", chrome.runtime.lastError);
                apiConnectionStatus = 'error';
                resolve(false);
                return;
            }
            
            if (response && response.success) {
                console.log("✅ Vendor stats loaded:", response.stats);
                vendorStats = response.stats;
                apiConnectionStatus = 'connected';
                updateVendorStats(response.stats, response.vendors);
                
                // Handle API warnings
                if (response.apiErrors) {
                    console.warn("⚠️ API warnings detected:", response.apiErrors);
                    showApiWarnings(response.apiErrors);
                }
                resolve(true);
            } else {
                console.error("🔴 Failed to load vendor stats:", response?.error);
                apiConnectionStatus = 'error';
                showErrorStatus(response?.error || "خطای نامشخص");
                resolve(false);
            }
        });
    });
}

function checkCurrentTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (chrome.runtime.lastError || !tabs[0]) {
                console.warn("⚠️ Could not access current tab");
                resolve(false);
                return;
            }
            
            const currentUrl = tabs[0].url;
            console.log("🔍 Checking current tab:", currentUrl);
            
            currentTabInfo = analyzeCurrentUrl(currentUrl);
            updateCurrentSiteStatus(currentTabInfo);
            resolve(true);
        });
    });
}

function analyzeCurrentUrl(currentUrl) {
    const info = {
        platform: null,
        vendorCode: null,
        pageType: 'unknown',
        isSupported: false
    };
    
    // SnappFood detection
    if (currentUrl.includes('snappfood.ir')) {
        info.platform = 'snappfood';
        
        if (currentUrl.includes('/restaurant/menu/')) {
            const match = currentUrl.match(/-r-([a-zA-Z0-9]+)\/?/);
            if (match) {
                info.vendorCode = match[1];
                info.pageType = 'menu';
            }
        } else if (currentUrl.includes('/service/')) {
            info.pageType = 'service';
        } else if (currentUrl.match(/^https?:\/\/(www\.)?snappfood\.ir\/?(\?.*)?$/)) {
            info.pageType = 'homepage';
        }
    }
    
    // TapsiFood detection
    else if (currentUrl.includes('tapsi.food')) {
        info.platform = 'tapsifood';
        
        if (currentUrl.includes('/vendor/')) {
            const match = currentUrl.match(/tapsi\.food\/vendor\/([a-zA-Z0-9]+)/);
            if (match) {
                info.vendorCode = match[1];
                info.pageType = 'menu';
            }
        }
    }
    
    console.log("🎯 URL Analysis result:", info);
    return info;
}

function updateVendorStats(stats, vendors) {
    const statusItems = document.querySelectorAll('.status-item');
    
    // Update second status item with vendor count
    if (statusItems[1]) {
        const textSpan = statusItems[1].querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = `${stats.totalVendors || 0} رستوران پشتیبانی شده`;
        }
        
        // Add success styling
        statusItems[1].classList.add('success');
    }
    
    // Add item count status
    addItemCountStatus(stats.totalItems || 0);
    
    console.log(`📈 Stats updated: ${stats.totalVendors} vendors, ${stats.totalItems} items`);
}

function addItemCountStatus(itemCount) {
    const statusContainer = document.querySelector('.status');
    if (!statusContainer) return;
    
    const itemCountElement = document.createElement('div');
    itemCountElement.className = 'status-item success';
    itemCountElement.innerHTML = `
        <span class="status-indicator active"></span>
        <span>${itemCount.toLocaleString('fa-IR')} محصول قابل مقایسه</span>
    `;
    
    statusContainer.appendChild(itemCountElement);
}

function updateCurrentSiteStatus(tabInfo) {
    const statusItems = document.querySelectorAll('.status-item');
    const firstStatusItem = statusItems[0];
    
    if (!firstStatusItem) return;
    
    if (tabInfo.pageType === 'menu' && tabInfo.vendorCode) {
        // Check if this vendor is supported
        checkVendorSupport(tabInfo, firstStatusItem);
    } else if (tabInfo.pageType === 'homepage' || tabInfo.pageType === 'service') {
        updateStatus(firstStatusItem, true, `${tabInfo.platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود'} - نشان‌گذاری رستوران‌ها فعال`);
        firstStatusItem.classList.add('success');
        updateInstructionsForHomepage(tabInfo.platform);
    } else if (tabInfo.platform) {
        updateStatus(firstStatusItem, false, `${tabInfo.platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود'} شناسایی شد - صفحه پشتیبانی نمی‌شود`);
        firstStatusItem.classList.add('warning');
    } else {
        updateStatus(firstStatusItem, false, 'لطفاً به صفحه اسنپ‌فود یا تپسی‌فود بروید');
        firstStatusItem.classList.add('error');
    }
}

function checkVendorSupport(tabInfo, statusItem) {
    if (apiConnectionStatus === 'error') {
        updateStatus(statusItem, false, 'خطا در اتصال به API - نمی‌توان وضعیت رستوران را بررسی کرد');
        statusItem.classList.add('error');
        return;
    }
    
    chrome.runtime.sendMessage({ action: "getVendorList" }, (response) => {
        if (response && response.success && response.vendors) {
            console.log(`🔍 Checking ${response.vendors.length} vendors for ${tabInfo.vendorCode}`);
            
            const supportedVendor = response.vendors.find(v => 
                tabInfo.platform === 'snappfood' ? 
                v.sf_code === tabInfo.vendorCode : 
                v.tf_code === tabInfo.vendorCode
            );
            
            if (supportedVendor) {
                const restaurantName = tabInfo.platform === 'snappfood' ? 
                    supportedVendor.sf_name : supportedVendor.tf_name;
                const otherPlatform = tabInfo.platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
                
                updateStatus(statusItem, true, `${restaurantName} - مقایسه با ${otherPlatform} فعال`);
                statusItem.classList.add('success');
                updateInstructionsForRestaurant(restaurantName, tabInfo.platform);
                
                console.log(`✅ Found supported vendor: ${restaurantName}`);
            } else {
                updateStatus(statusItem, false, 'رستوران شناسایی شد اما پشتیبانی نمی‌شود');
                statusItem.classList.add('warning');
                console.log(`⚠️ Vendor ${tabInfo.vendorCode} not supported`);
            }
        } else {
            console.warn("⚠️ Could not check vendor support:", response?.error);
            updateStatus(statusItem, false, 'خطا در بررسی پشتیبانی رستوران');
            statusItem.classList.add('error');
        }
    });
}

function updateStatus(statusItem, isActive, text) {
    const indicator = statusItem.querySelector('.status-indicator');
    const textSpan = statusItem.querySelector('span:last-child');
    
    if (indicator) {
        if (isActive) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }
    
    if (textSpan) {
        textSpan.textContent = text;
    }
}

function updateInstructionsForRestaurant(restaurantName, platform) {
    const instructionsDiv = document.querySelector('.instructions');
    if (!instructionsDiv) return;
    
    const platformName = platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود';
    const otherPlatform = platform === 'snappfood' ? 'تپسی‌فود' : 'اسنپ‌فود';
    
    instructionsDiv.innerHTML = `
        <h3>✅ ${restaurantName}</h3>
        <ol>
            <li>شما در حال حاضر در ${platformName} هستید</li>
            <li>قیمت‌های مقایسه شده با ${otherPlatform} نمایش داده می‌شوند</li>
            <li>محصولات ارزان‌تر با حاشیه سبز مشخص شده‌اند</li>
            <li>برای رفتن به ${otherPlatform} روی متن مقایسه کلیک کنید</li>
            <li>برای جستجو روی آیکن 🔍 کلیک کنید</li>
        </ol>
    `;
}

function updateInstructionsForHomepage(platform) {
    const instructionsDiv = document.querySelector('.instructions');
    if (!instructionsDiv) return;
    
    const platformName = platform === 'snappfood' ? 'اسنپ‌فود' : 'تپسی‌فود';
    
    instructionsDiv.innerHTML = `
        <h3>🏠 صفحه اصلی ${platformName}</h3>
        <ol>
            <li>رستوران‌های مشترک با حاشیه سبز مشخص شده‌اند</li>
            <li>رستوران‌های محبوب (امتیاز 4.5+) با حاشیه زرد و ستاره مشخص شده‌اند</li>
            <li>نشان "ارسال رایگان از تپسی‌فود" روی رستوران‌ها نمایش داده می‌شود</li>
            <li>به صفحه منوی رستوران‌ها بروید تا قیمت‌ها را مقایسه کنید</li>
        </ol>
    `;
}

function showLoadingState() {
    const statusItems = document.querySelectorAll('.status-item');
    statusItems.forEach(item => {
        item.classList.add('loading');
        const textSpan = item.querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = 'در حال بارگذاری...';
        }
    });
}

function showErrorState(message) {
    const statusItems = document.querySelectorAll('.status-item');
    statusItems[0]?.classList.add('error');
    statusItems[1]?.classList.add('error');
    
    const firstTextSpan = statusItems[0]?.querySelector('span:last-child');
    if (firstTextSpan) {
        firstTextSpan.textContent = message;
    }
}

function showApiWarnings(apiErrors) {
    if (!apiErrors.statsError && !apiErrors.vendorsError) return;
    
    const statusContainer = document.querySelector('.status');
    if (!statusContainer) return;
    
    const warningElement = document.createElement('div');
    warningElement.className = 'status-item warning';
    warningElement.innerHTML = `
        <span class="status-indicator" style="background: #ffc107;"></span>
        <span>اتصال API محدود - برخی ویژگی‌ها ممکن است کار نکنند</span>
    `;
    
    statusContainer.appendChild(warningElement);
}

function showErrorStatus(error) {
    const statusItems = document.querySelectorAll('.status-item');
    if (statusItems[1]) {
        const textSpan = statusItems[1].querySelector('span:last-child');
        if (textSpan) {
            textSpan.textContent = 'خطا در دریافت اطلاعات سرور';
        }
        
        statusItems[1].classList.add('error');
    }
}

function updateFinalState() {
    // Remove loading states
    const loadingElements = document.querySelectorAll('.loading');
    loadingElements.forEach(el => el.classList.remove('loading'));
    
    console.log("✅ Popup initialization completed");
}

// Enhanced Feature Animations
function setupFeatureAnimations() {
    const features = document.querySelectorAll('.feature');
    features.forEach((feature, index) => {
        // Add staggered animation on load
        feature.style.opacity = '0';
        feature.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            feature.style.transition = 'all 0.3s ease';
            feature.style.opacity = '1';
            feature.style.transform = 'translateY(0)';
        }, 100 * (index + 1));
        
        // Enhanced click animation
        feature.addEventListener('click', function() {
            this.style.transform = 'scale(0.98) translateY(0)';
            setTimeout(() => {
                this.style.transform = 'translateY(-1px)';
            }, 150);
            
            // Add subtle success feedback
            const icon = this.querySelector('.icon');
            if (icon) {
                icon.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    icon.style.transform = 'scale(1)';
                }, 200);
            }
        });
        
        // Add keyboard navigation
        feature.setAttribute('tabindex', '0');
        feature.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
    });
}

// Keyboard Navigation Support
function setupKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        // Refresh with F5 or Ctrl+R
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
            e.preventDefault();
            console.log("🔄 Manual refresh triggered");
            initializePopup();
        }
        
        // Quick navigation with numbers
        if (e.key >= '1' && e.key <= '4') {
            const featureIndex = parseInt(e.key) - 1;
            const features = document.querySelectorAll('.feature');
            if (features[featureIndex]) {
                features[featureIndex].click();
                features[featureIndex].focus();
            }
        }
    });
}

// Enhanced Error Handling
window.addEventListener('error', (event) => {
    console.error('🔴 Popup runtime error:', event.error);
    showErrorState('خطای غیرمنتظره در رابط کاربری');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🔴 Unhandled promise rejection:', event.reason);
    showErrorState('خطای غیرمنتظره در درخواست داده');
});

// Utility Functions
function formatNumber(num) {
    if (typeof num !== 'number') return '0';
    
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString('fa-IR');
}

function getTimeAgo(timestamp) {
    const now = new Date().getTime();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'هم‌اکنون';
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    
    const days = Math.floor(hours / 24);
    return `${days} روز پیش`;
}

// Auto-refresh functionality
let autoRefreshInterval;

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    // Refresh every 30 seconds when popup is open
    autoRefreshInterval = setInterval(() => {
        if (document.hasFocus()) {
            console.log("🔄 Auto-refreshing vendor stats");
            loadVendorStats();
        }
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Handle popup visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
        // Refresh when popup becomes visible again
        if (apiConnectionStatus === 'connected') {
            loadVendorStats();
        }
    }
});

// Handle window focus/blur
window.addEventListener('focus', () => {
    console.log("👁️ Popup focused, refreshing data");
    if (apiConnectionStatus === 'connected') {
        loadVendorStats();
    }
    startAutoRefresh();
});

window.addEventListener('blur', () => {
    console.log("👁️ Popup blurred, stopping auto-refresh");
    stopAutoRefresh();
});

// Initialize auto-refresh when popup loads
setTimeout(() => {
    if (apiConnectionStatus === 'connected') {
        startAutoRefresh();
    }
}, 2000);

// Add smooth scroll behavior
document.documentElement.style.scrollBehavior = 'smooth';

// Performance monitoring
if (window.performance && window.performance.mark) {
    window.performance.mark('popup-script-loaded');
}

console.log("🎉 Enhanced popup script loaded successfully");