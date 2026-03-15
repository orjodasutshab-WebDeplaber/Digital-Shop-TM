

// System Constants
const SYSTEM_CONFIG = {
    ADMIN_ID: 'DigitalShopOrjo',    // Admin Username
    ADMIN_PASS: 'Orjo@1010',         // Admin Password
    ADMIN_PHONE: '01822963824',     // Bkash/Nagad/Contact
    DELIVERY_CHARGE: 150,           // Delivery Fee
    CURRENCY: '৳'
}
const DB_KEYS = {
    PRODUCTS: 'TM_DB_PRODUCTS_V2',
    USERS: 'TM_DB_USERS_V2',
    ORDERS: 'TM_DB_ORDERS_V2',
    SESSION: 'TM_SESSION_USER',
    THEME: 'TM_THEME_PREF',
    ADDRESS: 'TM_USER_ADDRESS',
    ADS: 'TM_DB_ADS_V2',
    GLOBAL_DISCOUNTS: 'TM_DB_GIFT_CARDS_V2', // গিফট কার্ড ডাটা
    SPECIAL_REQUESTS: 'special_requests',
    RETURNS: 'TM_DB_RETURNS_V2',
    NOTICES: 'TM_DB_NOTICES_V1',
    PRODUCT_LIMITS: 'TM_DB_PRODUCT_LIMITS' // নতুন যোগ করা হলো (পণ্য লোড লিমিট সেভ করার জন্য)
    
};

// ✅ User-specific storage key helpers
// cart ও address প্রতিটি user এর আলাদা key এ save হবে
function _cartKey() {
    const uid = appState.currentUser ? appState.currentUser.id : 'guest';
    return 'user_cart_' + uid;
}
function _addrKey() {
    const uid = appState.currentUser ? appState.currentUser.id : 'guest';
    return 'digital_shop_user_address_' + uid;
}
// Application State (সংশোধিত)
let appState = {
    currentUser: null,
    currentProduct: null,
    products: [],
    users: [],
    orders: [],
    returns: [],
    globalDiscounts: [], // এটি যোগ করুন (গিফট কার্ড ডাটা এখানে জমা থাকবে)
};

// ====================================================================
// 2. INITIALIZATION (Run on Window Load)
// ====================================================================
window.onload = function() {
    console.log("🚀 Digital Shop TM System Initializing...");
    
    // Mobile touch scroll এবং swipe support
    _initMobileFixes();
    
    // ১. মেইন ডাটাবেজ লোড করা (এর ভেতরেই এখন গিফট কার্ড লোড হবে)
    loadDatabase(); 
    
    // ২. সেশন এবং ইউজার চেক
    checkSession(); 

    // --- নতুন যোগ করা অংশ (রিটার্ন ডাটা রিকভারি) ---
    // ৩. রিফ্রেশ দিলে যাতে রিটার্ন ও চ্যাট ডাটা না হারায়
    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
    const savedReturns = localStorage.getItem(RETURN_KEY);
    if (savedReturns) {
        appState.returns = JSON.parse(savedReturns);
        console.log("📦 Return Data Recovered:", appState.returns.length);
    }
    // ------------------------------------------
    
    // ৪. হোমপেজের প্রোডাক্ট দেখানো
    if (typeof renderProductGrid === 'function') {
        renderProductGrid(appState.products);
    }
    
    // ৫. থিম লোড করা
    loadTheme();
    
    // ৬. বিজ্ঞাপন বোর্ড চালু করা
    if (typeof startAdBoard === 'function') {
        startAdBoard();
    }

    // ৭. অটো কার্ড ক্লিনআপ (পুরনো বা মেয়াদ শেষ হওয়া কার্ড ডিলিট করা)
    if (typeof autoCleanupExpiredCards === 'function') {
        autoCleanupExpiredCards();
    }
    setTimeout(() => {
    if (typeof showNoticeBoardPopup === 'function') showNoticeBoardPopup();
}, 1500);

    console.log("✅ System Ready!");

    // Firebase sync শেষে সব reload
    window.addEventListener('fb-sync-done', function() {
        try {
            const fp = localStorage.getItem(DB_KEYS.PRODUCTS);
            if (fp) appState.products = JSON.parse(fp);

            const fu = localStorage.getItem(DB_KEYS.USERS);
            if (fu) { const u = JSON.parse(fu); appState.users = u.filter(x => x.id && x.name); }

            const fo = localStorage.getItem(DB_KEYS.ORDERS);
            if (fo) appState.orders = JSON.parse(fo);

            const fr = localStorage.getItem('special_requests');
            if (fr) appState.specialRequests = JSON.parse(fr);

            const fret = localStorage.getItem('TM_DB_RETURNS_V2');
            if (fret) appState.returns = JSON.parse(fret);

            const frep = localStorage.getItem('tm_reports');
            if (frep) appState.reports = JSON.parse(frep);

            const fl = localStorage.getItem(DB_KEYS.PRODUCT_LIMITS);
            if (fl) {
                const parsed = JSON.parse(fl);
                appState.productLoadSequence = Array.isArray(parsed) ? parsed : (parsed._arr || [35, 50]);
            }

            if (typeof renderProductGrid === 'function') renderProductGrid(appState.products);
            if (typeof startAdBoard === 'function') startAdBoard();

            // বেলি বোর্ড reload
            if (typeof _reloadBeliData === 'function') _reloadBeliData();
            if (typeof refreshBeliDisplay === 'function') refreshBeliDisplay();

            const sp = new URLSearchParams(window.location.search).get('id');
            if (sp) setTimeout(() => { if(typeof openProductDetails==='function') openProductDetails(sp); }, 400);

            console.log('[App] FB sync — Users:', appState.users.length, 'Products:', appState.products.length, 'Orders:', appState.orders.length);
        } catch(e) { console.warn('[App] fb-sync-done error:', e.message); }
    }, { once: true });

};
// পেজ লোড হওয়ার সাথে সাথে চেক করবে ইউজার লগইন কি না
window.addEventListener('load', function() {
    const session = localStorage.getItem(DB_KEYS.SESSION);
    const helpline = document.getElementById('floatingHelpline');
    
    if (session && helpline) {
        // যদি সেশন থাকে (অর্থাৎ ইউজার লগইন করা), তবে বাটন দেখাবে না
        helpline.style.display = 'none';
    }
});
/**
 * Loads data from LocalStorage or sets defaults
 */
function loadDatabase() {
    // ১. ইউজার লোড করা
    const storedUsers = localStorage.getItem(DB_KEYS.USERS);
    if (storedUsers) {
        appState.users = JSON.parse(storedUsers);
        // ✅ Expired adminCode গুলো পরিষ্কার করা (refresh এর পরে)
        const now = Date.now();
        let cleaned = false;
        appState.users.forEach(u => {
            if (u.adminCode && u.adminCodeExpiry && now > u.adminCodeExpiry) {
                delete u.adminCode;
                delete u.adminCodeExpiry;
                cleaned = true;
            }
        });
        if (cleaned) localStorage.setItem(DB_KEYS.USERS, JSON.stringify(appState.users));
    } else {
        appState.users = [{
            id: SYSTEM_CONFIG.ADMIN_ID,
            pass: SYSTEM_CONFIG.ADMIN_PASS,
            name: 'Super Admin',
            mobile: SYSTEM_CONFIG.ADMIN_PHONE,
            role: 'admin',
            joined: new Date().toLocaleDateString()
        }];
        saveData(DB_KEYS.USERS, appState.users);
    }

    // ২. প্রোডাক্ট লোড করা
    const storedProducts = localStorage.getItem(DB_KEYS.PRODUCTS);
    appState.products = storedProducts ? JSON.parse(storedProducts) : [];

    // ৩. অর্ডার লোড করা
    const storedOrders = localStorage.getItem(DB_KEYS.ORDERS);
    appState.orders = storedOrders ? JSON.parse(storedOrders) : [];

    // ৪. স্পেশাল রিকোয়েস্ট লিস্ট লোড
    const storedRequests = localStorage.getItem('special_requests'); 
    appState.specialRequests = storedRequests ? JSON.parse(storedRequests) : [];

    // ৫. রিকোয়েস্ট ব্লক স্ট্যাটাস লোড করা
    // ৫. রিকোয়েস্ট ব্লক স্ট্যাটাস লোড (localStorage + Firebase)
    const storedSettings = localStorage.getItem('request_settings');
    if (storedSettings) {
        const settings = JSON.parse(storedSettings);
        appState.isRequestBlocked = settings.isRequestBlocked || false;
    } else {
        appState.isRequestBlocked = false;
    }
    // Firebase থেকেও latest block status নিই
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            firebase.firestore().collection('app_settings').doc('request_settings').get()
                .then(snap => {
                    if (snap.exists) {
                        const d = snap.data();
                        appState.isRequestBlocked = d.isRequestBlocked || false;
                        saveData('request_settings', { isRequestBlocked: appState.isRequestBlocked });
                        console.log('[FB] Block status loaded:', appState.isRequestBlocked);
                    }
                }).catch(() => {});
        }
    } catch(e) {}

    // ৪.৫ রিটার্ন রিকোয়েস্ট লোড করা
    const storedReturns = localStorage.getItem('returns');
    appState.returns = storedReturns ? JSON.parse(storedReturns) : [];
    console.log("📦 Digital Shop TM: রিটার্ন ডাটা লোড হয়েছে!", appState.returns);

    // ৬. ডিসকাউন্ট এবং গ্লোবাল কার্ড লোড করা
    const storedDiscounts = localStorage.getItem(DB_KEYS.DISCOUNTS);
    appState.allPublishedCards = storedDiscounts ? JSON.parse(storedDiscounts) : [];

    const storedDrafts = localStorage.getItem(DB_KEYS.DRAFTS);
    appState.draftDiscounts = storedDrafts ? JSON.parse(storedDrafts) : [];
    
    const storedGlobalDiscounts = localStorage.getItem(DB_KEYS.GLOBAL_DISCOUNTS || 'global_discounts');
    appState.globalDiscounts = storedGlobalDiscounts ? JSON.parse(storedGlobalDiscounts) : [];
    
    const savedLimits = localStorage.getItem(DB_KEYS.PRODUCT_LIMITS);
    if (savedLimits) {
        const parsed = JSON.parse(savedLimits);
        // Firebase থেকে আসলে {_arr: [...]} format এ থাকে
        appState.productLoadSequence = Array.isArray(parsed) ? parsed : (parsed._arr || [35, 50]);
    } else {
        appState.productLoadSequence = [35, 50];
    }

    console.log("✅ Digital Shop TM: লোড হওয়া লিমিট সিকুয়েন্স:", appState.productLoadSequence);
    console.log("✅ Digital Shop TM: সকল ডাটা (রিকোয়েস্টসহ) লোড হয়েছে!");

    // নোটিফিকেশন ডট চেক
    if (appState.currentUser && appState.currentUser.hasUnreadDiscount === true) {
        const dot = document.getElementById('discount-notif-dot');
        if (dot) {
            dot.style.display = 'block';
            console.log("🔴 Digital Shop TM: নতুন ডিসকাউন্ট পাওয়া গেছে!");
        }
    }

    console.log("📂 লোড হওয়া রিকোয়েস্ট লিস্ট:", appState.specialRequests);

    // --- নতুন লজিক যুক্ত করা হলো ---
    // ডাটা লোড হওয়ার সাথে সাথে মেইন সাইটের গ্রিডকে ফিল্টার করে আপডেট করা
    if (typeof updateMainSiteGrid === 'function') {
        updateMainSiteGrid();
    } else {
        // যদি ফাংশনটি খুঁজে না পায় তবে সরাসরি ফিল্টার করে রেন্ডার করা
        const mainOnly = appState.products.filter(p => !p.sironamTag || p.sironamTag === "" || p.sironamTag === "main");
        renderProductGrid(mainOnly);
    }
}
// ====================================================================
// 3. AUTHENTICATION SYSTEM (Login/Register/Logout)
// ====================================================================

/**
 * Validates Login Credentials
 */
function submitLogin() {
    const userId = document.getElementById('loginInputId').value.trim();
    const userPass = document.getElementById('loginInputPass').value.trim();

    if (!userId || !userPass) {
        return alert("❌ দয়া করে আইডি এবং পাসওয়ার্ড দিন।");
    }

    const user = appState.users.find(u => 
        (u.id === userId || u.mobile === userId) && u.pass === userPass
    );

    if (user) {
        // --- নতুন ব্লক চেক লজিক ---
        if (user.isUserBlocked) {
            return alert("🚫 দুঃখিত! আপনার অ্যাকাউন্টটি বর্তমানে ব্লক করা আছে। দয়া করে অ্যাডমিনের সাথে যোগাযোগ করুন।");
        }

        // ব্লক না থাকলে লগইন সফল হবে
        localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(user));
        
        const helpline = document.getElementById('floatingHelpline');
        if (helpline) helpline.style.display = 'none';

        alert(`✅ স্বাগতম, ${user.name}!`);
        closeModal('loginModal');
        window.location.reload(); 
    } else {
        alert("❌ ভুল আইডি অথবা পাসওয়ার্ড! আবার চেষ্টা করুন।");
    }
}
/**
 * Handles New User Registration
 */
function submitRegistration() {
    // ১. ডাটা সংগ্রহ (পাসওয়ার্ড কনফার্মেশন সহ)
    const name = document.getElementById('regName').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const passConfirm = document.getElementById('regPassConfirm').value.trim(); // নতুন যোগ করা

    // ২. শক্তিশালী ভ্যালিডেশন
    // এখানে চেক করা হচ্ছে কোনো ঘর খালি আছে কি না
    if (!name || !mobile || !email || !pass || !passConfirm) {
        return alert("❌ দুঃখিত! সবগুলো তথ্য পূরণ করা আবশ্যক। কোনো ঘর খালি রাখা যাবে না।");
    }
    
    // পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড ম্যাচিং চেক
    if (pass !== passConfirm) {
        return alert("❌ দুই জায়গার পাসওয়ার্ড মেলেনি! দয়া করে একই পাসওয়ার্ড আবার লিখুন।");
    }
    
    if (mobile.length < 11) {
        return alert("❌ সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন।");
    }

    // ইমেইল ফরম্যাট চেক
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return alert("❌ দয়া করে একটি সঠিক ইমেইল অ্যাড্রেস দিন।");
    }

    // ৩. ডুপ্লিকেট চেক (মোবাইল বা ইমেইল আগে আছে কি না)
    const mobileExists = appState.users.find(u => u.mobile === mobile);
    if (mobileExists) {
        return alert("⚠️ এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।");
    }

    const emailExists = appState.users.find(u => u.email === email);
    if (emailExists) {
        return alert("⚠️ এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।");
    }

    // ৪. ইউজার অবজেক্ট তৈরি
    const newUser = {
        id: mobile, 
        name: name,
        mobile: mobile,
        email: email, 
        pass: pass,
        role: 'user',
        joined: new Date().toLocaleDateString(),
        
        // ব্লক ম্যানেজমেন্ট সিস্টেম
        isUserBlocked: false,      
        isOrderBlocked: false,     
        isCodBlocked: false,       
        isDiscountBlocked: false   
    };

    // ৫. ডাটা সেভ এবং মডাল চেঞ্জ
    appState.users.push(newUser);
    saveData(DB_KEYS.USERS, appState.users);
    // Firebase এ সাথে সাথে push করি
    if (typeof window.pushToCloud === 'function') {
        window.pushToCloud('TM_DB_USERS_V2');
    }

    alert(`✅ অভিনন্দন ${name}! আপনার রেজিস্ট্রেশন সফল হয়েছে। এখন লগইন করুন।`);
    
    if (typeof switchModal === 'function') {
        switchModal('registerModal', 'loginModal');
    }
}
/**
 * Checks if user is logged in and updates UI
 */
function checkSession() {
    const sessionData = localStorage.getItem(DB_KEYS.SESSION);
    if (sessionData) {
        appState.currentUser = JSON.parse(sessionData);
        
        // UI Update: Hide Login Btns, Show Profile
        document.getElementById('authButtonsGroup').classList.add('hidden');
        document.getElementById('userProfileGroup').classList.remove('hidden');
        
        // Set Header Name & Avatar
        document.getElementById('headerUserName').innerText = appState.currentUser.name;
        
        // Show Admin Panel Button if Admin or Sub-Admin
        if (appState.currentUser.role === 'admin' || appState.currentUser.role === 'sub_admin') {
            createFloatingAdminButton();
        }
    }
}

// Sub-admin sidebar filter — শুধু অনুমোদিত বাটন দেখাবে
function _filterSubAdminSidebar(permissions) {
    // adminPanelModal এখনো লোড না হওয়া পর্যন্ত observer দিয়ে অপেক্ষা করি
    const _apply = () => {
        const sidebar = document.querySelector('#adminPanelModal .admin-sidebar, #adminPanelModal [class*="sidebar"]');
        const allBtns = document.querySelectorAll('#adminPanelModal .menu-btn');
        allBtns.forEach(btn => {
            const onclick = btn.getAttribute('onclick') || '';
            const matched = SUB_ADMIN_FUNCTIONS.find(f => onclick.includes(f.tab) || onclick.includes(f.fn||'__NONE__'));
            if (matched) {
                btn.style.display = permissions.includes(matched.key) ? '' : 'none';
            } else if (onclick.includes('sub-admin') || btn.textContent.includes('নতুন এডমিন')) {
                btn.style.display = 'none'; // sub-admin cannot create admins
            }
        });
    };
    // modal open এ apply করি
    const origOpen = window.openModal;
    window.openModal = function(id) {
        origOpen && origOpen(id);
        if (id === 'adminPanelModal') setTimeout(_apply, 100);
    };
}

/**
 * Logs out the user
 */
function performLogout() {
    if(confirm("আপনি কি নিশ্চিত লগআউট করতে চান?")) {
        localStorage.removeItem(DB_KEYS.SESSION);
        window.location.replace('landing.html');
    }
}



// ====================================================================
// 4. PRODUCT DISPLAY & FILTERING LOGIC
// ====================================================================
/**
 * Digital Shop TM - Fixed Product Renderer
 */

// যদি ভেরিয়েবলটি আগে না থাকে তবেই তৈরি করবে, নাহলে আগেরটিই ব্যবহার করবে
if (window.currentlyDisplayedProducts === undefined) { 
    window.currentlyDisplayedProducts = []; 
}
if (window.currentStepIndex === undefined) { 
    window.currentStepIndex = 0; 
}

function renderProductGrid(productList, isLoadMore = false) {
    const grid = document.getElementById('productDisplayArea');
    if (!grid) return;

    try {
        // --- শিরোনাম ফিল্টারিং লজিক (বাকি কোড ঠিক রেখে এড করা হয়েছে) ---
        // মেইন গ্রিডে শুধুমাত্র সেই পণ্যগুলো থাকবে যাদের sironamTag নেই অথবা খালি
        let finalDisplayList = Array.isArray(productList) ? productList : [];
        
        // যদি এটি মেইন শপ হয় (পপ-আপ শপ না হয়), তবে ফিল্টার হবে
        if (typeof isSironamShopOpen === 'undefined' || !isSironamShopOpen) {
            finalDisplayList = finalDisplayList.filter(p => !p.sironamTag || p.sironamTag === "" || p.sironamTag === "main");
        }

        window.currentlyDisplayedProducts = finalDisplayList;

        // ১. রিসেট লজিক
        if (!isLoadMore) {
            grid.innerHTML = '';
            window.currentStepIndex = 0;
            const oldBtn = document.getElementById('loadMoreContainer');
            if (oldBtn) oldBtn.remove();
        }

        if (window.currentlyDisplayedProducts.length === 0) {
            grid.innerHTML = `<div style="text-align:center; width:100%; color:gray; padding:40px;"><h3>কোনো পণ্য পাওয়া যায়নি!</h3></div>`;
            return;
        }

        // ২. লোড লিমিট
        let sequence = [35, 50]; 
        if (typeof appState !== 'undefined' && appState.productLoadSequence) {
            sequence = appState.productLoadSequence;
        }
        const stepLimit = parseInt(sequence[window.currentStepIndex]) || 35;

        // ৩. বর্তমানে কয়টি আইটেম আছে এবং পরবর্তী আইটেম স্লাইস করা
        const currentCount = grid.querySelectorAll('.product-card').length;
        const itemsToShow = window.currentlyDisplayedProducts.slice(currentCount, currentCount + stepLimit);

        // ৪. এইচটিএমএল তৈরি
        const currency = (typeof SYSTEM_CONFIG !== 'undefined') ? SYSTEM_CONFIG.CURRENCY : '৳';
        const checkAdmin = (typeof isAdmin === 'function') ? isAdmin() : false;

        const productsHTML = itemsToShow.map(item => {
            const images = Array.isArray(item.images) ? item.images : [item.images || item.image];
            return `
            <div class="product-card" style="position: relative;">
                ${checkAdmin ? `
                    <div class="admin-actions-overlay">
                        <button class="admin-btn btn-edit" onclick="openEditModal('${item.id}')">EDIT</button>
                        <button class="admin-btn btn-delete" onclick="adminDeleteProduct('${item.id}')">DELETE</button>
                    </div>
                ` : ''}
                <div class="product-slider" id="slider-${item.id}">
                    <div class="slides-container scroll-custom">
                        ${images.map(img => `<img src="${img}" class="slide-img" style="cursor:pointer;" onclick="openProductDetails('${item.id}')">`).join('')}
                    </div>
                    ${images.length > 1 ? `
                        <button class="slide-prev" onclick="moveSlide('${item.id}', -1)">&#10094;</button>
                        <button class="slide-next" onclick="moveSlide('${item.id}', 1)">&#10095;</button>
                    ` : ''}
                </div>
                <h4 class="product-title" style="cursor:pointer;" onclick="openProductDetails('${item.id}')">${item.title}</h4>
                <span class="product-price">${currency} ${item.price}</span>
                <button class="btn-buy-now" onclick="initiateCheckout('${item.id}')">
                    <i class="fa fa-shopping-cart"></i> অর্ডার করুন
                </button>
            </div>`;
        }).join('');

        grid.insertAdjacentHTML('beforeend', productsHTML);

        // ৫. বাটন হ্যান্ডেলার
        handleLoadMoreButtonDisplay(window.currentlyDisplayedProducts.length);

    } catch (e) {
        console.error("Render error:", e);
    }
}
function handleLoadMoreButtonDisplay(totalLength) {
    const existingBtn = document.getElementById('loadMoreContainer');
    if (existingBtn) existingBtn.remove();

    const currentShown = document.querySelectorAll('.product-card').length;
    if (currentShown < totalLength) {
        const btnHTML = `
            <div id="loadMoreContainer" style="text-align: center; margin: 30px 0; width:100%;">
                <button onclick="onLoadMoreClick()" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: white; border: none; padding: 12px 35px; border-radius: 12px; cursor: pointer; font-size: 16px; font-weight: bold;">
                    আরো দেখুন <i class="fa fa-chevron-down" style="margin-left:8px;"></i>
                </button>
            </div>`;
        document.getElementById('productDisplayArea').insertAdjacentHTML('afterend', btnHTML);
    }
}

function onLoadMoreClick() {
    window.currentStepIndex++;
    renderProductGrid(window.currentlyDisplayedProducts, true);
}
// স্লাইডার চালানোর নতুন ফাংশন
function moveSlide(id, step) {
    const slider = document.querySelector(`#slider-${id} .slides-container`);
    const width = slider.clientWidth;
    slider.scrollBy({ left: width * step, behavior: 'smooth' });
}
/**
 * Filters products by category
 */
function filterProducts(category, btnElement) {
    // 1. Update Active Button Style
    const buttons = document.querySelectorAll('.nav-item');
    buttons.forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    // 2. Filter Logic
    if (category === 'All') {
        renderProductGrid(appState.products);
    } else {
        const filtered = appState.products.filter(p => p.category === category);
        renderProductGrid(filtered);
    }
}

// ====================================================================
// 5. CHECKOUT & ORDER SYSTEM (Multi-Step)
// ====================================================================

/**
 * Step 1: Open Checkout Modal & Show Details (Login Check Added)
 */
/**
 * Step 1: Open Checkout Modal & Show Details (Updated with Discount)
 */
function initiateCheckout(productId) {
    const session = localStorage.getItem(DB_KEYS.SESSION);
    if (!session) {
        alert("⚠️ পণ্য অর্ডার করতে হলে আপনাকে প্রথমে লগইন করতে হবে!");
        openModal('loginModal'); 
        return; 
    }

    const currentUser = JSON.parse(session);
    
    if (currentUser.isUserBlocked) {
        alert("🚫 দুঃখিত! আপনার অ্যাকাউন্টটি বর্তমানে ব্লক করা হয়েছে।");
        return;
    }

    if (currentUser.isOrderBlocked) {
        alert("⚠️ আপনার অর্ডার দেওয়ার সুবিধাটি বর্তমানে বন্ধ রাখা হয়েছে।");
        return;
    }

    appState.currentProduct = appState.products.find(p => p.id === productId);
    if (!appState.currentProduct) return alert("পণ্যটি পাওয়া যাচ্ছে না!");

    // ১. গ্লোবাল ডাটা সেটআপ
    const unitPrice = parseInt(appState.currentProduct.price);
    window.currentOrderPrice = unitPrice; 
    appState.currentUser = currentUser;
    appState.currentProduct.orderQty = 1; // ডিফল্ট ১ পিস

    const summaryBox = document.getElementById('checkoutSummaryBox');
    if (summaryBox) {
        summaryBox.style.maxHeight = "350px"; 
        summaryBox.style.overflowY = "auto"; 
        summaryBox.style.display = "block"; 
        
        // এখানে শুধু এইচটিএমএল স্ট্রাকচারটা একবারই তৈরি হবে
        summaryBox.innerHTML = `
            <div style="background: #f8fafc; padding: 12px; border-radius: 10px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
                <p style="margin: 0 0 10px 0; font-size: 15px;"><strong>পণ্য:</strong> ${appState.currentProduct.title}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                    <span style="font-weight: bold; font-size: 14px; color: #475569;">পরিমাণ সিলেক্ট করুন:</span>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <button type="button" onclick="updateStepCalc(-1, ${unitPrice})" style="width: 30px; height: 30px; border-radius: 6px; border: 1px solid #6366f1; background: #fff; cursor: pointer; font-weight: bold; font-size: 18px; color: #6366f1;">−</button>
                        <b id="stepQty" style="font-size: 18px; min-width: 20px; text-align: center;">1</b>
                        <button type="button" onclick="updateStepCalc(1, ${unitPrice})" style="width: 30px; height: 30px; border-radius: 6px; border: 1px solid #6366f1; background: #6366f1; color: #fff; cursor: pointer; font-weight: bold; font-size: 18px;">+</button>
                    </div>
                </div>
            </div>
            
            <div style="padding: 0 5px;">
                <p style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span>পণ্যের দাম:</span> 
                    <span>${SYSTEM_CONFIG.CURRENCY} <span id="stepSubtotal">${unitPrice}</span></span>
                </p>
                <p id="discountRow" style="display: flex; justify-content: space-between; margin: 8px 0; color: #e11d48; font-weight: bold;">
                    <span>ডিসকাউন্ট:</span> 
                    <span>- ${SYSTEM_CONFIG.CURRENCY} <span id="stepDiscountDisplay">0</span></span>
                </p>
                <p style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <span>ডেলিভারি চার্জ:</span> 
                    <span>${SYSTEM_CONFIG.CURRENCY} <span id="stepShipping">150</span></span>
                </p>
                <hr style="border: 0; border-top: 1px dashed #cbd5e1; margin: 12px 0;">
                <h4 style="display: flex; justify-content: space-between; color: #27ae60; margin: 0; font-size: 19px;">
                    <span>সর্বমোট:</span> 
                    <span>${SYSTEM_CONFIG.CURRENCY} <span id="stepFinalTotal">${unitPrice + 150}</span></span>
                </h4>
            </div>
        `;
    }

    // ৩. ডাইনামিক ক্যালকুলেশন ফাংশন
    // এটি এখন শুধু টেক্সট আপডেট করবে, পুরো HTML পাল্টাবে না। তাই বাটন হারাবে না।
    window.updateStepCalc = function(change, price) {
        let qtyElem = document.getElementById('stepQty');
        let subtotalElem = document.getElementById('stepSubtotal');
        let shippingElem = document.getElementById('stepShipping');
        let totalElem = document.getElementById('stepFinalTotal');

        let currentQty = parseInt(qtyElem.innerText) + change;

        // ১ থেকে ১০ এর মধ্যে সীমাবদ্ধ রাখা
        if (currentQty < 1) return;
        if (currentQty > 10) {
            alert("আপনি সর্বোচ্চ ১০টি পণ্য অর্ডার করতে পারবেন।");
            return;
        }

        // ডাটা আপডেট
        qtyElem.innerText = currentQty;
        appState.currentProduct.orderQty = currentQty; 

        let newSubtotal = price * currentQty;
        subtotalElem.innerText = newSubtotal;

        // আপনার ডেলিভারি চার্জ ম্যাট্রিক্স
        let newShipping = 150;
        if (currentQty >= 4 && currentQty <= 5) newShipping = 200;
        else if (currentQty >= 6 && currentQty <= 7) newShipping = 250;
        else if (currentQty >= 8 && currentQty <= 9) newShipping = 300;
        else if (currentQty === 10) newShipping = 350;

        shippingElem.innerText = newShipping;
        
        // টোটাল আপডেট (ডিসকাউন্ট ছাড়া ডিফল্ট)
        totalElem.innerText = newSubtotal + newShipping;
        
        window.currentOrderPrice = newSubtotal; 

        // ডিসকাউন্ট কার্ডের ড্রপডাউন এবং লজিক আপডেট
        if (typeof populateDiscountDropdown === 'function') {
            populateDiscountDropdown(newSubtotal);
        }
        if (typeof applyDiscountLogic === 'function') {
            applyDiscountLogic(); 
        }
    };

    // ৪. প্রি-ফিল ইউজার ডাটা (আপনার অরিজিনাল কোড)
    const orderNameInput = document.getElementById('orderName');
    const orderPhoneInput = document.getElementById('orderPhone');
    const orderAddressInput = document.getElementById('orderAddress');

    if(orderNameInput) orderNameInput.value = appState.currentUser.name || '';
    if(orderPhoneInput) orderPhoneInput.value = appState.currentUser.mobile || '';
    
    const savedAddr = localStorage.getItem(_addrKey()); // ✅ user-specific
    if(savedAddr && orderAddressInput) orderAddressInput.value = savedAddr;

    // ডেলিভারি ঠিকানা section refresh
    setTimeout(() => _loadCheckoutSavedAddr(), 300);

    // ৫. স্টেপ রিসেট
    const step1 = document.getElementById('checkoutStep1');
    const step2 = document.getElementById('checkoutStep2');
    
    if(step1 && step2) {
        step2.style.display = 'none';
        step2.classList.add('hidden');
        step1.style.display = 'block';
        step1.classList.remove('hidden');
    }
    
    populateDiscountDropdown(unitPrice); 
    openModal('checkoutModal');
}
function backToStep1() {
    document.getElementById('checkoutStep2').classList.add('hidden');
    document.getElementById('checkoutStep1').classList.remove('hidden');
}


// ====================================================================
// 6. ADMIN PANEL LOGIC (Points 10-14)
// ====================================================================

function createFloatingAdminButton() {
    const btn = document.createElement('button');
    btn.innerHTML = '<i class="fa fa-cogs"></i> Admin Panel';
    btn.style.cssText = "position:fixed; bottom:20px; right:20px; background:#2d3436; color:white; padding:15px; border-radius:30px; z-index:9999; box-shadow:0 10px 20px rgba(0,0,0,0.3);";
    btn.onclick = () => {
        openModal('adminPanelModal');
        if (appState.currentUser && appState.currentUser.role === 'sub_admin') {
            setTimeout(() => _applySubAdminSidebar(appState.currentUser.permissions || []), 150);
        }
    };    document.body.appendChild(btn);
}

/**
 * Switches Tabs in Admin Panel
 */
/**
 * loadAdminTab: আপনার অরিজিনাল লজিক ঠিক রেখে স্টোরেজ মনিটর যুক্ত করা হয়েছে
 */
function loadAdminTab(tabName, event) {
    // Sub-admin permission check
    if (appState.currentUser && appState.currentUser.role === 'sub_admin') {
        const perms = appState.currentUser.permissions || [];
        if (!perms.includes(tabName)) {
            showToast('🚫 এই ট্যাবে আপনার এক্সেস নেই!');
            return;
        }
    }    // ১. মেনু বাটন অ্যাক্টিভ স্টেট হ্যান্ডলিং
    const buttons = document.querySelectorAll('.menu-btn');
    buttons.forEach(b => {
        b.style.transition = "0.3s";
        b.classList.remove('active');
        b.style.background = "transparent";
        b.style.color = "#94a3b8";
    });

    if(event && event.currentTarget) {
        event.currentTarget.classList.add('active');
        event.currentTarget.style.background = "rgba(52, 152, 219, 0.15)";
        event.currentTarget.style.color = "#3498db";
    }

    const container = document.getElementById('adminMainContainer');
    if (!container) return;
    
    // ২. প্রিমিয়াম লোডিং স্পিনার (Glass effect)
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 20px; animation: fadeIn 0.5s ease-in-out;">
            <div class="loader-circle"></div>
            <p style="margin-top: 20px; color: #3498db; font-family: 'Hind Siliguri', sans-serif; font-weight: 600; letter-spacing: 1px;">প্রসেসিং হচ্ছে...</p>
        </div>
        <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .loader-circle {
                width: 50px; height: 50px;
                border: 4px solid rgba(52, 152, 219, 0.1);
                border-left-color: #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
        </style>
    `;

    // ৩. কন্টেন্ট লোড করা
    setTimeout(() => {
        container.style.animation = "fadeIn 0.4s ease-out";

        if (tabName === 'publish') {
            renderAdminPublish(container);
        } 
        else if (tabName === 'orders') {
            renderAdminOrders(container); 
        } 
        else if (tabName === 'users') {
            renderAdminUsers(container);
        } 
        else if (tabName === 'ads') {
            renderAdminAds(container); 
        }
        // --- নতুন রিটার্ন সেকশন যোগ করা হয়েছে ---
        else if (tabName === 'returns') {
            renderAdminReturnList(container); 
        }
        else if (tabName === 'notices') { renderAdminNotices(container); }
        else if (tabName === 'local-board') { renderAdminLocalBoard(container); }
        else if (tabName === 'login-leaderboard') { renderAdminLoginLeaderboard(container); }
        else if (tabName === 'sub-admin') { renderSubAdminManager(container); }
        // ------------------------------------
        else if (tabName === 'storage') {
            container.innerHTML = `
                <div style="padding:30px; background: linear-gradient(135deg, #1e293b, #0f172a); border-radius:24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px;">
                        <div style="width: 50px; height: 50px; background: rgba(16, 185, 129, 0.1); border-radius: 15px; display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 24px;">
                            <i class="fa fa-database"></i>
                        </div>
                        <div>
                            <h3 style="margin:0; color:#fff; font-size: 20px; font-weight: 700;">লাইভ মেমোরি স্ট্যাটাস</h3>
                            <p style="margin:0; font-size: 12px; color: #64748b;">Digital Shop TM: Database Monitor</p>
                        </div>
                    </div>
                    <div id="storageStatusArea" style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.03);"></div>
                    <div style="margin-top: 20px; padding: 15px; border-radius: 12px; background: rgba(52, 152, 219, 0.05); border: 1px solid rgba(52, 152, 219, 0.1);">
                        <p style="font-size:11px; color:#94a3b8; margin:0; line-height: 1.6;">
                            <i class="fa fa-info-circle" style="color: #3498db; margin-right: 5px;"></i>
                            আপনার লোকাল স্টোরেজ ডাটাবেসের বর্তমান অবস্থা চেক করা হচ্ছে। মেমোরি ফুল হয়ে গেলে অপ্রয়োজনীয় ডাটা ক্লিন করুন।
                        </p>
                    </div>
                </div>
            `;
            renderStorageMonitor(document.getElementById('storageStatusArea'));
        }
        else if (tabName === 'discount-mgmt') {
            container.innerHTML = `
                <div style="animation: fadeIn 0.4s ease-out;">
                    ${getDiscountMgmtUI()}
                </div>
            `;
            
            
            setTimeout(() => {
                if (typeof renderDraftCards === 'function') renderDraftCards();
                if (typeof renderActiveAdminCards === 'function') renderActiveAdminCards();
            }, 50);
        }
    }, 400); 
}





// --- Admin Sub-Functions (Updated with Sironam Selection) ---
function renderAdminPublish(container) {
    _reloadSironamData(); // ✅ fresh sironam list
    // শিরোনামের লিস্ট ড্রপডাউনের জন্য তৈরি করা
    const sironamOptions = sironamData.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    container.innerHTML = `
        <div style="font-family: 'Hind Siliguri', sans-serif; color: #fff; padding-bottom: 30px;">
            
            <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 25px; border-radius: 20px; margin-bottom: 25px; border: 1px solid rgba(255,255,255,0.05); text-align: center;">
                <div style="width: 50px; height: 50px; background: rgba(52, 152, 219, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; color: #3498db; font-size: 24px;">
                    <i class="fa fa-shopping-bag"></i>
                </div>
                <h3 style="margin: 0; font-size: 22px; font-weight: 700;">নতুন পণ্য যুক্ত করুন</h3>
                <p style="color: #94a3b8; font-size: 13px; margin-top: 5px;">সঠিক তথ্য দিয়ে আপনার ইনভেন্টরি আপডেট করুন</p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px;">
                
                <div style="background: #1e293b; padding: 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label style="color: #cbd5e1; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">পণ্যের নাম</label>
                            <input type="text" id="admTitle" placeholder="নাম লিখুন" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #fff; outline: none; box-sizing: border-box;">
                        </div>
                        <div class="form-group">
                            <label style="color: #cbd5e1; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">মূল্য (৳)</label>
                            <input type="number" id="admPrice" placeholder="দাম" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #fff; outline: none; box-sizing: border-box;">
                        </div>
                        <div style="margin-bottom: 20px;">
                            <label style="color: #94a3b8; display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600;">
                                <i class="fa fa-barcode" style="margin-right: 8px; color: #3498db;"></i>পণ্যের ইউনিক কোড (SKU)
                            </label>
                            <div style="position: relative;">
                                <input type="text" id="admSku" placeholder="উদা: TM-101" 
                                    style="width: 100%; padding: 12px 15px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #fff; font-size: 14px; outline: none; transition: 0.3s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);"
                                    onfocus="this.style.borderColor='#3498db'; this.style.boxShadow='0 0 0 2px rgba(52, 152, 219, 0.2)';"
                                    onblur="this.style.borderColor='#334155'; this.style.boxShadow='none';">
                            </div>
                            <p style="color: #64748b; font-size: 11px; margin-top: 5px; font-style: italic;">* কোডটি অবশ্যই <b>TM</b> দিয়ে শুরু হতে হবে।</p>
                        </div>
                    </div>

                    <div class="form-group" style="margin-top: 15px;">
                        <label style="color: #cbd5e1; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">ক্যাটাগরি সিলেক্ট করুন</label>
                        <select id="admCat" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #fff; outline: none; cursor: pointer;">
                            <option value="" selected disabled>-- ক্যাটাগরি বেছে নিন --</option>
                            <option value="Men">Men Fashion</option>
                            <option value="Women">Women Fashion</option>
                            
                            <option value="Electronics">Electronics</option>
                            <option value="Shoes">Shoes</option>
                            <option value="HouseHold">House Hold</option>
                            <option value="SKIN CARE & BEAUTY">SKIN CARE & BEAUTY</option>
                            <option value="Digital Products">Digital Products</option>
                            <option value="Child Fashion">Child Fashion</option>
                            <option value="Toy">Toy</option>
                            <option value="Vehicel">Vehicel</option>
                            <option value="Furniture">Furniture</option>
                            <option value="Book">Book</option>
                            <option value="Sport">Sport</option>
                            <option value="Gift Card">Gift Card</option>
                            <option value="Game Topup">Game Topup</option>
                            <option value="Medicine">Medicine</option>
                            <option value="Watches">Watches</option>
                            <option value="Musical Instruments">Musical Instruments</option>
                            <option value="Others">Others</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-top: 15px;">
                        <label style="color: #f59e0b; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">
                           <i class="fa fa-list-alt"></i> শিরোনাম সিলেক্ট করুন (ঐচ্ছিক)
                        </label>
                        <select id="admSironamTag" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #fff; outline: none; cursor: pointer;">
                            <option value="" selected disabled>-- শিরোনাম বেছে নিন --</option>
                            
                            ${sironamOptions}
                        </select>
                        <p style="color: #64748b; font-size: 11px; margin-top: 5px;">* নির্দিষ্ট শিরোনামে পণ্য পাঠাতে এটি ব্যবহার করুন।</p>
                    </div>
                </div>
                
                <div style="background: #1e293b; padding: 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                    <label style="color: #3498db; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                        <i class="fa fa-image"></i> পণ্যের ছবিসমূহ (URL)
                    </label>
                    <div id="imageInputGroup" style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="multi-img-box">
                            <input type="text" class="admImgInput" placeholder="ছবির লিঙ্ক ১" oninput="showLivePreview()" 
                                style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 10px; color: #2ecc71; font-size: 12px; outline: none; box-sizing: border-box;">
                        </div>
                    </div>
                    <button class="btn-mini-add" onclick="addNewImgRow()" 
                        style="margin-top: 15px; width: 100%; padding: 10px; background: rgba(52, 152, 219, 0.1); border: 1px dashed #3498db; color: #3498db; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.3s;">
                        + আরও ছবি যোগ করুন
                    </button>
                    <div id="liveImgPreview" style="display: flex; gap: 10px; margin-top: 15px; overflow-x: auto; padding-bottom: 5px;"></div>
                </div>

                <div style="background: #1e293b; padding: 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
                    <div class="form-group">
                        <label style="color: #cbd5e1; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">সার্চ ট্যাগ (#Tags)</label>
                        <input type="text" id="admTags" placeholder="উদা: mobile, offer..." style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; color: #fff; outline: none; box-sizing: border-box;">
                    </div>

                    <div class="form-group" style="margin-top: 15px;">
                        <label style="color: #cbd5e1; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">পণ্যের বিবরণ</label>
                        <textarea id="pDesc" placeholder="বিস্তারিত বিবরণ লিখুন..." 
                            style="width: 100%; height: 100px; padding: 12px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 12px; resize: none; outline: none; line-height: 1.6; box-sizing: border-box;"></textarea>
                    </div>

                    <div class="form-group" style="margin-top: 15px;">
                        <label style="color: #2ecc71; font-size: 13px; display: block; margin-bottom: 8px; font-weight: 600;">
                            <i class="fa fa-id-card"></i> সেলার বিস্তারিত
                        </label>
                        <textarea id="admSellerInfo" placeholder="সেলার সম্পর্কে তথ্য এখানে লিখুন..." 
                            style="width: 100%; height: 80px; padding: 12px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 12px; resize: none; outline: none; line-height: 1.6; box-sizing: border-box;"></textarea>
                    </div>
                </div>
            </div>

            <div style="margin-top: 30px; background: #0f172a; padding: 20px; border-radius: 20px; border: 1px solid rgba(52, 152, 219, 0.3); text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin-bottom: 15px;">সব তথ্য চেক করে পাবলিশ বাটনে ক্লিক করুন</p>
                <button class="btn-primary" onclick="adminSaveProduct()" 
                    style="width: 100%; padding: 18px; background: linear-gradient(135deg, #3498db, #1e40af); color: #fff; border: none; border-radius: 15px; font-weight: 800; font-size: 18px; cursor: pointer; transition: 0.3s; box-shadow: 0 10px 25px rgba(30, 64, 175, 0.4);">
                    <i class="fa fa-paper-plane"></i> পণ্য পাবলিশ করুন
                </button>
            </div>
        </div>

        <style>
            input:focus, textarea:focus, select:focus {
                border-color: #3498db !important;
                background: #1e293b !important;
            }
            .btn-mini-add:hover {
                background: #3498db !important;
                color: #fff !important;
            }
            #liveImgPreview img {
                width: 50px;
                height: 50px;
                border-radius: 8px;
                object-fit: cover;
                border: 2px solid #334155;
            }
        </style>
    `;
}
// ২. নতুন ইনপুট বক্স যোগ করার বুদ্ধি
function addNewImgRow() {
    const div = document.createElement('div');
    div.className = 'multi-img-box';
    div.innerHTML = `<input type="text" class="admImgInput" placeholder="পরের ছবির লিঙ্ক..." oninput="showLivePreview()">`;
    document.getElementById('imageInputGroup').appendChild(div);
}

// ৩. লাইভ প্রিভিউ দেখার বুদ্ধি
function showLivePreview() {
    const inputs = document.querySelectorAll('.admImgInput');
    const previewArea = document.getElementById('liveImgPreview');
    previewArea.innerHTML = '';
    inputs.forEach(input => {
        if(input.value) {
            previewArea.innerHTML += `<img src="${input.value}" class="preview-thumb">`;
        }
    });
}
function adminSaveProduct() {
    const title = document.getElementById('admTitle').value;
    const price = document.getElementById('admPrice').value;
    const cat = document.getElementById('admCat').value;
    const desc = document.getElementById('pDesc').value;
    
    // --- শিরোনাম সিলেক্ট ডাটা (Sironam Tag) ---
    const sironamTag = document.getElementById('admSironamTag') ? document.getElementById('admSironamTag').value : "";
    
    // --- সেলার বিস্তারিত ইনপুট ---
    const sellerInfo = document.getElementById('admSellerInfo') ? document.getElementById('admSellerInfo').value : "";
    
    // --- TM কোড ইনপুট (SKU) ---
    const skuInput = document.getElementById('admSku') ? document.getElementById('admSku').value.trim().toUpperCase() : "";
    
    // ট্যাগ ইনপুট থেকে ডাটা নেওয়া
    const tagsInput = document.getElementById('admTags') ? document.getElementById('admTags').value : "";
    const tagList = tagsInput.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag !== "");
    
    const imgInputs = document.querySelectorAll('.admImgInput');
    const imgArray = Array.from(imgInputs).map(input => input.value).filter(val => val !== "");

    // --- ভ্যালিডেশন চেক ---
    if(!title || !price || imgArray.length === 0) return alert("সব তথ্য সঠিকভাবে দিন!");
    
    // ১. TM কোড ভ্যালিডেশন
    if(!skuInput || !skuInput.startsWith('TM')) {
        return alert("ভুল! পণ্যের কোড অবশ্যই 'TM' দিয়ে শুরু হতে হবে (যেমন: TM-101)");
    }

    // ২. ইউনিক SKU চেক
    const isDuplicate = appState.products.some(p => p.sku === skuInput);
    if(isDuplicate) {
        return alert("এই TM কোডটি ইতিমধ্যে অন্য একটি পণ্যে ব্যবহার করা হয়েছে! নতুন কোড দিন।");
    }

    // নতুন পণ্য অবজেক্ট তৈরি
    const newProd = {
        id: 'P-' + Date.now(),
        sku: skuInput,
        title: title,
        price: price,
        category: cat,
        sironamTag: sironamTag, // এখানে শিরোনামের ID সেভ হচ্ছে
        images: imgArray, 
        description: desc,
        sellerInfo: sellerInfo,
        tags: tagList,
        likes: 0,
        likedBy: []
    };

    // ডাটাবেসে পণ্য যুক্ত করা
    appState.products.unshift(newProd);
    saveData(DB_KEYS.PRODUCTS, appState.products);
    
    alert("✅ সফলভাবে পাবলিশ হয়েছে!");
    
    // --- মেইন সাইট আপডেট (ফিল্টার লজিক) ---
    // যে পণ্যগুলোতে Sironam Tag নেই বা "main" লেখা, শুধু সেগুলোই মেইন সাইটে দেখাবে
    if (typeof updateMainSiteGrid === 'function') {
        updateMainSiteGrid(); 
    } else {
        const mainProducts = appState.products.filter(p => !p.sironamTag || p.sironamTag === "" || p.sironamTag === "main");
        renderProductGrid(mainProducts); 
    }
    
    // পাবলিশ পেজ রিফ্রেশ করা
    loadAdminTab('publish');
}
let currentOrderFilter = 'All'; // গ্লোবাল ফিল্টার স্ট্যাটাস (আপনার আগের কোড অনুযায়ী এটি এখানে থাকবে)

function renderAdminOrders(container) {
    const orders = appState.orders;
    
    let html = `
        <div class="order-list-wrapper" style="padding: 15px; font-family: 'Hind Siliguri', sans-serif; color: #fff;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
                <h3 style="margin: 0; font-size: 22px; font-weight: 700; color: #fff;">
                    <i class="fa fa-boxes" style="color: #3498db; margin-right: 10px;"></i> মোট অর্ডার: 
                    <span id="totalOrderCount" style="background: #3498db; padding: 2px 12px; border-radius: 20px; font-size: 16px;">${orders.length}</span>
                </h3>
            </div>
            
            <div style="position: relative; margin-bottom: 20px;">
                <input type="text" id="masterOrderSearch" onkeyup="handleOrderSearchAndFilter()" 
                    placeholder="ID, কাস্টমার বা প্রোডাক্ট দিয়ে সার্চ করুন..." 
                    style="width: 100%; padding: 15px 15px 15px 45px; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; color: #fff; outline: none; box-sizing: border-box; font-size: 14px; transition: 0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <i class="fa fa-search" style="position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: #64748b;"></i>
            </div>

          <div style="display: flex; gap: 12px; margin-bottom: 25px; overflow-x: auto; padding: 10px 5px; scrollbar-width: none; -ms-overflow-style: none; border-bottom: 1px solid #e2e8f0;">
    
    <style>
        .adm-filter-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            background: #ffffff;
            color: #64748b;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }

        .adm-filter-btn i {
            font-size: 14px;
        }

        .adm-filter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            border-color: var(--btn-color, #3b82f6);
            color: var(--btn-color, #3b82f6);
        }

        .adm-filter-btn.active {
            background: var(--btn-color, #3b82f6);
            color: white !important;
            border-color: var(--btn-color, #3b82f6);
            box-shadow: 0 4px 15px var(--shadow-color, rgba(59, 130, 246, 0.4));
        }

        /* স্ক্রলবার হাইড করার জন্য */
        div::-webkit-scrollbar { display: none; }
    </style>

    <button onclick="setOrderFilter('All', this)" class="adm-filter-btn active" style="--btn-color: #3b82f6; --shadow-color: rgba(59, 130, 246, 0.4);">
        <i class="fas fa-list-ul"></i> সবগুলো
    </button>

    <button onclick="setOrderFilter('Pending', this)" class="adm-filter-btn" style="--btn-color: #f39c12; --shadow-color: rgba(243, 156, 18, 0.4);">
        <i class="fas fa-clock"></i> পেন্ডিং
    </button>

    <button onclick="setOrderFilter('Confirm', this)" class="adm-filter-btn" style="--btn-color: #27ae60; --shadow-color: rgba(39, 174, 96, 0.4);">
        <i class="fas fa-check-circle"></i> কনফার্ম
    </button>

    <button onclick="setOrderFilter('Processing', this)" class="adm-filter-btn" style="--btn-color: #3498db; --shadow-color: rgba(52, 152, 219, 0.4);">
        <i class="fas fa-sync"></i> প্রসেসিং
    </button>

    <button onclick="setOrderFilter('Our Hub', this)" class="adm-filter-btn" style="--btn-color: #8e44ad; --shadow-color: rgba(142, 68, 173, 0.4);">
        <i class="fas fa-warehouse"></i> আওয়ার হাব
    </button>

    <button onclick="setOrderFilter('Your Hab', this)" class="adm-filter-btn" style="--btn-color: #e67e22; --shadow-color: rgba(230, 126, 34, 0.4);">
        <i class="fas fa-building"></i> আপনার হাব
    </button>

    <button onclick="setOrderFilter('Going To Delivered', this)" class="adm-filter-btn" style="--btn-color: #16a085; --shadow-color: rgba(22, 160, 133, 0.4);">
        <i class="fas fa-truck-loading"></i> ডেলিভারি বের হয়েছে
    </button>

    <button onclick="setOrderFilter('Delivered', this)" class="adm-filter-btn" style="--btn-color: #2c3e50; --shadow-color: rgba(44, 62, 80, 0.4);">
        <i class="fas fa-box-open"></i> ডেলিভারি সম্পন্ন
    </button>

    <button onclick="setOrderFilter('Reject', this)" class="adm-filter-btn" style="--btn-color: #e74c3c; --shadow-color: rgba(231, 76, 60, 0.4);">
        <i class="fas fa-times-circle"></i> রিজেক্ট
    </button>
</div>

            <div id="filteredOrderGrid" style="display: grid; gap: 15px;">`;
    
    // প্রাথমিক রেন্ডার (আইটেমগুলো লোড হচ্ছে)
    html += generateOrderListItems(orders);
    
    html += `
            </div>
        </div>

        <style>
            .adm-filter-btn {
                background: #1e293b;
                color: #94a3b8;
                border: 1px solid rgba(255,255,255,0.05);
                padding: 10px 20px;
                border-radius: 12px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                white-space: nowrap;
                transition: 0.3s;
            }
            .adm-filter-btn:hover {
                background: #334155;
                color: #fff;
            }
            .adm-filter-btn.active {
                background: var(--btn-color, #3498db);
                color: #fff;
                border-color: transparent;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            }
            #masterOrderSearch:focus {
                border-color: #3498db;
                background: #0f172a;
                box-shadow: 0 0 0 4px rgba(52, 152, 219, 0.15);
            }
            /* অর্ডার কার্ড এনিমেশন */
            #filteredOrderGrid > div {
                animation: fadeIn 0.4s ease-out;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;
    container.innerHTML = html;
}
// ২. অর্ডার কার্ড তৈরির মূল লজিক (বাটন ডিজাইন ও লজিক ফিক্সড)
function generateOrderListItems(ordersToDisplay) {
    if (ordersToDisplay.length === 0) {
        return `
            <div style="text-align:center; padding:60px 20px; color:#64748b; background: rgba(30, 41, 59, 0.5); border-radius:20px; border: 1px dashed rgba(255,255,255,0.1);">
                <i class="fa fa-box-open" style="font-size: 40px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p style="margin:0; font-size:16px;">দুঃখিত, কোনো অর্ডার পাওয়া যায়নি!</p>
            </div>`;
    }

    return ordersToDisplay.map((order, index) => {
        const originalIndex = appState.orders.findIndex(o => o.id === order.id);
        
        // স্ট্যাটাস অনুযায়ী ডাইনামিক কালার
        let statusColor, statusBg, statusText = order.status || 'Pending';
        if (statusText === 'Confirmed') { statusColor = '#2ecc71'; statusBg = 'rgba(46, 204, 113, 0.1)'; }
        else if (statusText === 'Delivered') { statusColor = '#3498db'; statusBg = 'rgba(52, 152, 219, 0.1)'; }
        else if (statusText === 'Rejected') { statusColor = '#e74c3c'; statusBg = 'rgba(231, 76, 60, 0.1)'; }
        else { statusColor = '#f1c40f'; statusBg = 'rgba(241, 196, 15, 0.1)'; }

        const payStatusColor = order.paymentStatus === 'পেইড' ? '#2ecc71' : '#ef4444';
        const targetPid = order.productId || order.id;

        return `
            <div class="order-item-card" style="background:#1e293b; border:1px solid rgba(255,255,255,0.05); padding:0; border-radius:18px; margin-bottom:20px; overflow:hidden; position:relative; transition:0.3s; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                
                <div style="position:absolute; left:0; top:0; bottom:0; width:6px; background:${statusColor};"></div>

                <div style="padding:20px 20px 15px 26px;">
                    <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:10px;">
                        <div style="flex:1; min-width:200px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                                <span style="color:#94a3b8; font-size:12px; font-weight:bold; letter-spacing:1px;">#${order.id}</span>
                                <span style="background:${statusBg}; color:${statusColor}; padding:2px 10px; border-radius:8px; font-size:11px; font-weight:800; text-transform:uppercase; border:1px solid ${statusColor}44;">
                                    ${statusText}
                                </span>
                            </div>
                            <h4 style="margin:0 0 10px; color:#fff; font-size:18px; font-weight:700;">${order.productName}</h4>
                            
                            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:15px;">
                                <p style="margin:0; font-size:13px; color:#cbd5e1;"><i class="fa fa-user" style="width:18px; color:#64748b;"></i> <b>কাস্টমার:</b> ${order.customerName}</p>
                                <p style="margin:0; font-size:13px; color:#2ecc71;"><i class="fa fa-tag" style="width:18px; color:#2ecc71;"></i> <b>মূল্য:</b> ${order.price} ৳</p>
                                <p style="margin:0; font-size:13px; color:#cbd5e1;">
                                    <i class="fa fa-credit-card" style="width:18px; color:#64748b;"></i> <b>পেমেন্ট:</b> 
                                    <span style="color:${payStatusColor}; font-weight:bold;">${order.paymentStatus || 'পেইড হয় নাই'}</span>
                                </p>
                            </div>

                            <div id="adminNote-${originalIndex}">
                                ${order.adminNote ? `
                                    <div style="background:rgba(52, 152, 219, 0.1); padding:10px; border-radius:12px; border-left:3px solid #3498db; font-size:13px; display:flex; justify-content:space-between; align-items:center; color:#cbd5e1; margin-top:5px;">
                                        <span><i class="fa fa-sticky-note" style="margin-right:8px; color:#3498db;"></i>${order.adminNote}</span>
                                        <button onclick="deleteAdminNote(${originalIndex})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px;"><i class="fa fa-trash"></i></button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
                            <div style="display:flex; gap:6px;">
                             
                             <button onclick="openProductBySKU('${order.sku || ''}', '${order.productId || order.id}')" title="Product Info" class="order-action-btn" style="background:#9b59b6;">
                            <i class="fa fa-box"></i>
                            </button>
                                
                                <button onclick="adminViewOrderDetails('${order.id}')" title="View Details" class="order-action-btn" style="background:#2ecc71;">
                                    <i class="fa fa-eye"></i>
                                </button>
                                
                                <button onclick="togglePaymentStatus('${order.id}')" title="Payment Status" class="order-action-btn" style="background:#f39c12;">
                                    <i class="fa fa-wallet"></i>
                                </button>
                                
                                <button onclick="generateInvoice('${order.id}')" title="Generate Invoice" class="order-action-btn" style="background:#3498db;">
                                    <i class="fa fa-file-invoice"></i>
                                </button>
                                
                                <button onclick="adminDeleteOrder('${order.id}')" title="Delete Order" class="order-action-btn" style="background:#e74c3c;">
                                    <i class="fa fa-trash-alt"></i>
                                </button>
                            </div>
                            
                            <div style="display:flex; gap:6px;">
                                <button onclick="changeOrderStatus(${originalIndex}, 'Confirmed')" class="order-status-btn" style="background:#2ecc71;">Confirm</button>
                                <button onclick="changeOrderStatus(${originalIndex}, 'Delivered')" class="order-status-btn" style="background:#3498db;">Delivered</button>
                                <button onclick="changeOrderStatus(${originalIndex}, 'Rejected')" class="order-status-btn" style="background:#e67e22;">Reject</button>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; align-items:center; margin-top:20px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.05);">
                        <div style="position:relative; flex:1;">
                            <i class="fa fa-pen" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#64748b; font-size:12px;"></i>
                            <input type="text" id="noteInput-${originalIndex}" placeholder="ডেলিভারি মেসেজ বা নোট লিখুন..." 
                                style="width:100%; padding:10px 10px 10px 35px; background:#0f172a; border:1px solid #334155; border-radius:10px; font-size:13px; color:#fff; outline:none;">
                        </div>
                        <button onclick="saveAdminNote(${originalIndex})" 
                            style="background:#34495e; color:white; border:none; padding:10px 20px; border-radius:10px; cursor:pointer; font-weight:bold; font-size:13px; transition:0.2s;">
                            Update Note
                        </button>
                    </div>
                </div>
            </div>

            <style>
                /* আপনার আগের প্রিমিয়াম বাটন ডিজাইন এখানে */
                .order-action-btn {
                    width: 38px; 
                    height: 38px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    color: white; 
                    border: none; 
                    border-radius: 12px; 
                    cursor: pointer; 
                    transition: 0.3s; 
                    font-size: 15px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .order-status-btn {
                    padding: 8px 14px; 
                    color: white; 
                    border: none; 
                    border-radius: 10px; 
                    cursor: pointer; 
                    font-weight: 700; 
                    font-size: 11px; 
                    text-transform: uppercase; 
                    transition: 0.3s;
                    letter-spacing: 0.5px;
                }
                .order-action-btn:hover, .order-status-btn:hover { 
                    filter: brightness(1.2); 
                    transform: translateY(-3px); 
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
                }
                .order-item-card:hover { 
                    border-color: rgba(52, 152, 219, 0.3) !important; 
                    transform: translateY(-2px);
                }
            </style>
        `;
    }).join('');
}
// ৩. শক্তিশালী সার্চ এবং ফিল্টার ফাংশন
function handleOrderSearchAndFilter() {
    const term = document.getElementById('masterOrderSearch').value.toLowerCase();
    const grid = document.getElementById('filteredOrderGrid');
    const countSpan = document.getElementById('totalOrderCount');

    const filtered = appState.orders.filter(o => {
        // স্ট্যাটাস ফিল্টার ম্যাচিং
        const matchesStatus = currentOrderFilter === 'All' || o.status === currentOrderFilter;
        
        // সার্চ টার্ম ম্যাচিং (আইডি, নাম, পণ্য, দাম)
        const matchesSearch = 
            o.id.toString().toLowerCase().includes(term) ||
            o.customerName.toLowerCase().includes(term) ||
            o.productName.toLowerCase().includes(term) ||
            o.price.toString().includes(term);

        return matchesStatus && matchesSearch;
    });

    grid.innerHTML = generateOrderListItems(filtered);
    countSpan.innerText = filtered.length;
}

// ৪. ফিল্টার বাটন সেট করার ফাংশন
function setOrderFilter(status) {
    currentOrderFilter = status;
    handleOrderSearchAndFilter();
}

// --- নতুন যোগ করা ফাংশনগুলো ---

function saveAdminNote(index) {
    const noteInput = document.getElementById(`noteInput-${index}`);
    const noteValue = noteInput.value.trim();
    if(noteValue === "") return alert("অনুগ্রহ করে কিছু লিখুন!");

    appState.orders[index].adminNote = noteValue;
    saveData(DB_KEYS.ORDERS, appState.orders);
    loadAdminTab('orders'); 
    alert("✅ নোট সেভ করা হয়েছে।");
}

function deleteAdminNote(index) {
    if(confirm("আপনি কি এই নোটটি ডিলিট করতে চান?")) {
        delete appState.orders[index].adminNote;
        saveData(DB_KEYS.ORDERS, appState.orders);
        loadAdminTab('orders');
    }
}
function adminDeleteOrder(orderId) {
    if(confirm("আপনি কি নিশ্চিতভাবে এই অর্ডারটি ডিলিট করতে চান?")) {
        // ১. appState থেকে বাদ দেওয়া
        appState.orders = appState.orders.filter(order => order.id !== orderId);
        
        // ২. localStorage আপডেট
        saveData(DB_KEYS.ORDERS, appState.orders);
        
        // ৩. Firebase থেকেও ডিলিট
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                firebase.firestore().collection('orders').doc(String(orderId)).delete()
                    .then(() => console.log('[FB] Order deleted:', orderId))
                    .catch(e => console.warn('[FB] order delete err:', e.message));
            }
        } catch(e) {}
        
        // ৪. অ্যাডমিন প্যানেল রিফ্রেশ
        loadAdminTab('orders');
        alert("✅ অর্ডারটি সফলভাবে ডিলিট করা হয়েছে।");
    }
}

function changeOrderStatus(index, newStatus) {
    appState.orders[index].status = newStatus;
    saveData(DB_KEYS.ORDERS, appState.orders);
    loadAdminTab('orders'); // Refresh table
    alert(`অর্ডার স্ট্যাটাস: ${newStatus}`);
}

function renderAdminUsers(container) {
    // incomplete users বাদ দিই
    appState.users = appState.users.filter(u => u.id && u.name);
    // --- পুরনো ইউজারদের জন্য ব্লক ফিল্ডগুলো নিশ্চিত করা ---
    appState.users.forEach(u => {
        if (u.isUserBlocked === undefined) u.isUserBlocked = false;
        if (u.isOrderBlocked === undefined) u.isOrderBlocked = false;
        if (u.isCodBlocked === undefined) u.isCodBlocked = false;
        if (u.isDiscountBlocked === undefined) u.isDiscountBlocked = false;
    });

    // Sub-admin হলে শুধু normal user দেখাবে, admin/sub_admin লুকাবে
    const isSubAdmin = appState.currentUser && appState.currentUser.role === 'sub_admin';
    const visibleUsers = isSubAdmin
        ? appState.users.filter(u => u.role !== 'admin' && u.role !== 'sub_admin')
        : appState.users;

    // ১. মেইন লেআউট, সার্চবার এবং ফিল্টার বাটন তৈরি
    let html = `
        <div style="padding:10px; background:#111; border-radius:10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3>ইউজার লিস্ট (<span id="countUsers">${visibleUsers.length}</span>)</h3>
                
                <div style="display: flex; gap: 5px;">
                    <button onclick="filterBlockedUsers(false)" class="filter-btn-custom active-filter" id="btnAll">সবাই</button>
                    <button onclick="filterBlockedUsers(true)" class="filter-btn-custom" id="btnBlocked" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);">ব্লক ইউজার</button>
                </div>
            </div>
            
            <div style="margin-bottom: 15px; position: relative;">
                <input type="text" id="userSearchField" onkeyup="handleUserSearch()" 
                    placeholder="নাম বা মোবাইল নম্বর দিয়ে আইডি খুঁজুন..." 
                    style="width: 100%; padding: 12px 15px 12px 40px; background: #222; color: #fff; border: 1px solid #444; border-radius: 8px; outline: none;">
                <i class="fa fa-search" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #888;"></i>
            </div>

            <style>
                .filter-btn-custom {
                    padding: 5px 12px;
                    font-size: 11px;
                    border-radius: 6px;
                    border: 1px solid #444;
                    background: #222;
                    color: #fff;
                    cursor: pointer;
                    font-weight: bold;
                    transition: 0.3s;
                }
                .active-filter {
                    background: #3498db !important;
                    color: white !important;
                    border-color: #3498db !important;
                }
            </style>

            <div id="userGridDisplay" class="user-list-grid">`;

    // ইউজার লিস্ট তৈরি করা
    html += buildUserCards(visibleUsers);
    
    html += `</div></div>`;
    container.innerHTML = html;
}

// --- ২. ফিল্টার করার লজিক ---
function filterBlockedUsers(onlyBlocked) {
    const display = document.getElementById('userGridDisplay');
    const btnAll = document.getElementById('btnAll');
    const btnBlocked = document.getElementById('btnBlocked');

    if (!display) return;

    // বাটন কালার চেঞ্জ
    if (onlyBlocked) {
        btnBlocked.classList.add('active-filter');
        btnAll.classList.remove('active-filter');
    } else {
        btnAll.classList.add('active-filter');
        btnBlocked.classList.remove('active-filter');
    }

    const isSubAdmin = appState.currentUser && appState.currentUser.role === 'sub_admin';
    let list;
    if (onlyBlocked) {
        list = appState.users.filter(u => u.isUserBlocked || u.isOrderBlocked || u.isCodBlocked || u.isDiscountBlocked);
    } else {
        list = appState.users;
    }
    if (isSubAdmin) list = list.filter(u => u.role !== 'admin' && u.role !== 'sub_admin');

    display.innerHTML = buildUserCards(list);
    document.getElementById('countUsers').innerText = list.length;
}
function buildUserCards(users) {
    if (users.length === 0) return `
        <div style="text-align:center; padding:40px; color:#64748b; background: rgba(30, 41, 59, 0.5); border-radius:15px; border: 1px dashed rgba(255,255,255,0.1);">
            <i class="fa fa-users-slash" style="font-size: 30px; margin-bottom: 10px; opacity: 0.5;"></i>
            <p>কোনো ইউজার পাওয়া যায়নি!</p>
        </div>`;
    
    return users.map(u => {
        // ব্লক চেক করা
        const isAnyBlocked = u.isUserBlocked || u.isOrderBlocked || u.isCodBlocked || u.isDiscountBlocked;
        const blockBtnColor = isAnyBlocked ? '#ef4444' : '#22c55e'; 

        return `
        <div class="user-info-card" style="background: #1e293b; border: 1px solid rgba(255,255,255,0.05); padding: 15px; margin-bottom: 12px; border-radius: 18px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); position: relative; transition: 0.3s;">
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <div style="width: 45px; height: 45px; background: ${u.role === 'admin' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #3498db, #1e40af)'}; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: white; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
                        ${(u.name||'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <strong style="font-size: 16px; color: #fff; display: block; font-weight: 700;">${u.name}</strong>
                        <div style="font-size: 11px; color: #94a3b8; display: flex; gap: 8px; margin-top: 2px;">
                            <span><i class="fa fa-id-badge"></i> ${u.id}</span>
                            <span><i class="fa fa-phone"></i> ${u.mobile}</span>
                        </div>
                    </div>
                </div>

                <div style="text-align: right;">
                    <span style="background: ${u.role === 'admin' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(52, 152, 219, 0.1)'}; color: ${u.role === 'admin' ? '#f59e0b' : '#3498db'}; padding: 3px 10px; border-radius: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase;">
                        ${u.role}
                    </span>
                    <div style="font-size: 12px; margin-top: 5px; color: #2ecc71; font-weight: bold;">
                        Code: <span id="admin-code-${u.id}" style="color: #ef4444;">${u.adminCode || 'N/A'}</span>
                    </div>
                </div>
                 </div>

                  <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.05); margin:    0;">

                   <div class="user-actions" style="display: flex; gap: 6px; flex-wrap: wrap;">
                  ${u.role !== 'admin' ? `
                    <button onclick="changeAdminCode('${u.id}')" class="u-action-btn" style="background: #f39c12;" title="Change Admin Code">
                        <i class="fa fa-key"></i> Code
                    </button>

                   <div style="position: relative;">
                        <button onclick="toggleBlockMenu('${u.id}')" id="main-block-btn-${u.id}"     class="u-action-btn" style="background: ${isAnyBlocked ? '#ef4444' : '#22c55e'};">
                    <i class="fa fa-ban"></i> ব্লক
                     </button>
            
                    <div id="block-menu-${u.id}" style="display: none; position: absolute; left:     0; bottom: 40px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; z-index: 100; min-width: 180px; overflow: hidden;">
                
                    <button onclick="applyAdminBlock('${u.id}', 'user')" class="drop-btn" style="color: ${u.isUserBlocked ? '#ef4444' : '#cbd5e1'}">
                    <i class="fa fa-user-slash"></i> ${u.isUserBlocked ? 'Unblock User' : 'Block User'}
                    </button>

                    <button onclick="applyAdminBlock('${u.id}', 'order')"                class="drop-btn"       style="color: ${u.isOrderBlocked ? '#ef4444' :       '#cbd5e1'}">
                    <i class="fa fa-shopping-cart"></i> ${u.isOrderBlocked ? 'Unblock Order' : 'Block Order'}
                    </button>

                     <button onclick="applyAdminBlock('${u.id}', 'cod')" class="drop-btn" style="color: ${u.isCodBlocked ? '#ef4444' : '#cbd5e1'}">
                    <i class="fa fa-truck"></i> ${u.isCodBlocked ? 'Enable COD' : 'Disable COD'}
                     </button>

                       <button onclick="applyAdminBlock('${u.id}', 'discount')" class="drop-btn" style="color: ${u.isDiscountBlocked ? '#ef4444' : '#cbd5e1'}">
                    <i class="fa fa-percent"></i> ${u.isDiscountBlocked ? 'Unblock Discount' : 'Block Discount'}
                       </button>
                       </div>
                      </div>
                      
                    <button onclick="showUserDetails('${u.id}')" class="u-action-btn" style="background: #8e44ad;" title="See Details">
                     <i class="fa fa-eye"></i> Details
                   </button>

                   
                   <button onclick="adminChangeEmail('${u.id}')" class="u-action-btn" style="background: #16a085;" title="Change Email">
                    <i class="fa fa-envelope"></i> Email
                     </button>

                    <button onclick="adminResetPass('${u.id}')" class="u-action-btn" style="background: #64748b;" title="Reset Password"><i class="fa fa-sync"></i> Reset</button>
                    <button onclick="adminChangeMobile('${u.id}')" class="u-action-btn" style="background: #34495e;" title="Change Mobile"><i class="fa fa-mobile-alt"></i> Mobile</button>
                    <button onclick="adminDeleteUser('${u.id}')" class="u-action-btn" style="background: #e74c3c;" title="Delete User"><i class="fa fa-trash"></i></button>
                ` : `
                    <div style="width: 100%; text-align: center; background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 8px; border-radius: 10px; font-size: 12px; font-weight: bold;">
                        <i class="fa fa-shield-alt"></i> এটি প্রধান অ্যাডমিন অ্যাকাউন্ট
                    </div>
                `}
            </div>
        </div>

        <style>
            .u-action-btn {
                padding: 8px 12px;
                border: none;
                border-radius: 10px;
                color: white;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: 0.2s;
            }
            .u-action-btn:hover {
                transform: translateY(-2px);
                filter: brightness(1.2);
            }
            .drop-btn {
                width: 100%;
                text-align: left;
                padding: 10px 15px;
                font-size: 12px;
                border: none;
                background: none;
                color: #cbd5e1;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: 0.2s;
            }
            .drop-btn:hover {
                background: #334155;
                color: #fff;
            }
            .user-info-card:hover {
                border-color: rgba(52, 152, 219, 0.3);
                transform: translateY(-2px);
            }
        </style>
        `;
    }).join('');
}








function adminViewOrderDetails(orderId) {
    const order = appState.orders.find(o => o.id === orderId);
    if (!order) return alert("অর্ডার পাওয়া যায়নি!");

    const adminStatusNotes = {
        'Pending': { msg: 'অর্ডারটি পর্যালোচনার অপেক্ষায় আছে।', icon: 'fa-clock', color: '#f39c12' },
        'Confirm': { msg: 'আপনার অর্ডারটি নিশ্চিত করা হয়েছে।', icon: 'fa-check-circle', color: '#27ae60' },
        'Processing': { msg: 'পণ্যটি বর্তমানে প্যাকিং করা হচ্ছে।', icon: 'fa-sync', color: '#3498db' },
        'Our Hub': { msg: 'পণ্যটি আমাদের প্রধান সেন্টারে প্রসেসিং হচ্ছে।', icon: 'fa-warehouse', color: '#8e44ad' },
        'Your Hab': { msg: 'পণ্যটি আপনার নিকটস্থ হাবে পৌঁছেছে।', icon: 'fa-building', color: '#e67e22' },
        'Going To Delivey': { msg: 'পণ্যটি আপনার ঠিকানায় পাঠানোর জন্য বের হয়েছে।', icon: 'fa-truck-loading', color: '#16a085' },
        'Delivered': { msg: 'সফলভাবে ডেলিভারি করা হয়েছে। ধন্যবাদ!', icon: 'fa-box-open', color: '#2c3e50' },
        'Reject': { msg: 'দুঃখিত, আপনার অর্ডারটি বাতিল করা হয়েছে।', icon: 'fa-times-circle', color: '#e74c3c' }
    };

    const history = order.adm_history || [];
    const userComments = order.user_comments || [];

    // বিস্তারিত হিসাব-নিকাশ
    const itemPrice = parseFloat(order.itemPrice) || (parseFloat(order.price) / (order.orderQty || 1));
    const deliveryCharge = parseFloat(order.deliveryCharge) || 0;
    const discount = parseFloat(order.discountAmount) || 0;
    const total = parseFloat(order.price);

    const modalHtml = `
        <div id="adminOrderModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.9); display:flex; align-items:center; justify-content:center; z-index:99999999; backdrop-filter: blur(8px); font-family: 'Segoe UI', Roboto, sans-serif;">
            <div style="background:#f1f5f9; width:98%; height:95%; max-width:1100px; border-radius:20px; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 20px 50px rgba(0,0,0,0.3); border:1px solid #34495e;">
                
                <div style="background:#1e293b; color:white; padding:15px 25px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:18px;">অ্যাডমিন কন্ট্রোল - #${order.id}</h3>
                        <small style="opacity:0.7;">কাস্টমার: ${order.customerName} | তারিখ: ${order.date || 'N/A'}</small>
                    </div>
                    <span onclick="document.getElementById('adminOrderModal').remove()" style="cursor:pointer; font-size:30px; line-height:1;">&times;</span>
                </div>

                <div style="flex:1; overflow-y:auto; padding:20px; display:grid; grid-template-columns: 1.1fr 1.9fr; gap:20px;">
                    
                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <div style="background:white; padding:20px; border-radius:15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
                            <h4 style="margin:0 0 15px 0; color:#334155; border-bottom:2px solid #3b82f6; padding-bottom:5px; font-size:16px;">
                                <i class="fas fa-file-invoice-dollar"></i> অর্ডার ও পেমেন্ট সামারি
                            </h4>
                            <div style="font-size:13px; color:#475569; line-height:1.8;">
                                <p style="margin:4px 0;"><strong>নাম:</strong> ${order.customerName}</p>
                                <p style="margin:4px 0;"><strong>ফোন:</strong> <a href="tel:${order.customerPhone}" style="color:#3b82f6;">${order.customerPhone}</a></p>
                                <p style="margin:4px 0;"><strong>ঠিকানা:</strong> ${order.address}</p>
                                <hr style="border:0; border-top:1px dashed #cbd5e1; margin:10px 0;">
                                <p style="margin:4px 0;"><strong>পণ্য:</strong> ${order.productName}</p>
                                <p style="margin:4px 0;"><strong>পরিমাণ:</strong> ${order.orderQty || 1} পিস</p>
                                
                                <p style="margin:4px 0; background: #fff7ed; padding: 5px 8px; border-radius: 6px; border: 1px solid #fed7aa;">
                                    <strong>TrxID:</strong> <span style="color:#c2410c; font-family: monospace; font-weight: bold;">${order.trxId || 'N/A'}</span>
                                </p>

                                <div style="background:#f8fafc; padding:10px; border-radius:10px; margin-top:10px; border:1px solid #edf2f7;">
                                    <div style="display:flex; justify-content:space-between;"><span>পণ্যের মূল্য:</span> <span>৳${itemPrice.toFixed(2)}</span></div>
                                    <div style="display:flex; justify-content:space-between;"><span>ডেলিভারি চার্জ:</span> <span>৳${deliveryCharge.toFixed(2)}</span></div>
                                    <div style="display:flex; justify-content:space-between; color:#e11d48;"><span>ডিসকাউন্ট:</span> <span>-৳${discount.toFixed(2)}</span></div>
                                    <div style="display:flex; justify-content:space-between; font-weight:bold; color:#1e293b; border-top:1px solid #cbd5e1; margin-top:5px; padding-top:5px; font-size:15px;">
                                        <span>মোট আদায়যোগ্য:</span> <span>৳${total.toFixed(2)}</span>
                                    </div>
                                </div>
                                <p style="margin:8px 0 0; text-align:center;"><span style="background:#dcfce7; color:#166534; padding:2px 12px; border-radius:20px; font-size:11px; font-weight:bold;">পেমেন্ট স্ট্যাটাস: ${order.paymentStatus}</span></p>
                            </div>
                        </div>

                        <div style="background:white; padding:20px; border-radius:15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
                            <h4 style="margin:0 0 15px 0; color:#334155; font-size:16px;"><i class="fas fa-edit"></i> কুইক স্ট্যাটাস আপডেট</h4>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                                ${Object.keys(adminStatusNotes).map(status => `
                                    <button onclick="saveAdminUpdate('${order.id}', '${status}', '${adminStatusNotes[status].msg}', '${adminStatusNotes[status].icon}')" 
                                            style="padding:10px 5px; border-radius:8px; border:1px solid ${adminStatusNotes[status].color}; background:white; color:${adminStatusNotes[status].color}; cursor:pointer; font-weight:bold; font-size:10px; transition: 0.3s;"
                                            onmouseover="this.style.background='${adminStatusNotes[status].color}'; this.style.color='white'">
                                        <i class="fas ${adminStatusNotes[status].icon}"></i> ${status}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:20px;">
                        
                        <div style="background:white; border-radius:15px; display:flex; flex-direction:column; height:320px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                            <div style="background:#f8fafc; padding:12px 20px; border-bottom:1px solid #e2e8f0; border-radius:15px 15px 0 0; font-weight:bold; color:#1e293b; display:flex; justify-content:space-between;">
                                <span><i class="fas fa-comments" style="color:#3b82f6;"></i> কাস্টমার সাপোর্ট চ্যাট</span>
                            </div>
                            <div id="adminChatList" style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; gap:10px; background:#f1f5f9;">
                                ${userComments.length > 0 ? userComments.map(c => `
                                    <div style="align-self: ${c.sender === 'Admin' ? 'flex-end' : 'flex-start'}; 
                                                background: ${c.sender === 'Admin' ? '#3b82f6' : 'white'}; 
                                                color: ${c.sender === 'Admin' ? 'white' : '#1e293b'}; 
                                                padding:10px 15px; border-radius:15px; max-width:80%; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                                        <p style="margin:0; font-size:12px;">${c.text}</p>
                                        <small style="display:block; text-align:right; font-size:8px; opacity:0.7; margin-top:4px;">${c.time}</small>
                                    </div>
                                `).join('') : '<p style="text-align:center; color:#94a3b8; font-size:12px; margin-top:20px;">কোনো কথা হয়নি</p>'}
                            </div>
                            <div style="padding:12px; background:white; border-top:1px solid #e2e8f0; display:flex; gap:10px; border-radius:0 0 15px 15px;">
                                <input id="adminReplyInput" type="text" placeholder="এখানে লিখুন..." style="flex:1; padding:10px; border-radius:10px; border:1px solid #cbd5e1; outline:none; font-size:13px;">
                                <button onclick="sendAdminComment('${order.id}')" style="background:#3b82f6; color:white; border:none; width:40px; height:40px; border-radius:10px; cursor:pointer;"><i class="fas fa-paper-plane"></i></button>
                            </div>
                        </div>

                        <div style="background:white; padding:20px; border-radius:15px; border:1px solid #e2e8f0; flex:1; overflow:hidden; display:flex; flex-direction:column;">
                            <h4 style="margin:0 0 15px 0; color:#334155; font-size:16px;"><i class="fas fa-history"></i> ট্র্যাকিং হিস্টোরি</h4>
                            <div style="flex:1; overflow-y:auto; padding-right:10px;">
                                ${history.length > 0 ? history.map((h, idx) => `
                                    <div style="display:flex; justify-content:space-between; align-items: flex-start; border-left:2px solid #3b82f6; padding-left:15px; margin-bottom:15px; position:relative;">
                                        <div style="width:10px; height:10px; background:#3b82f6; border-radius:50%; position:absolute; left:-6px; top:5px;"></div>
                                        <div>
                                            <strong style="font-size:13px; color:#1e293b;">${h.status}</strong>
                                            <p style="font-size:12px; margin:2px 0; color:#64748b;">${h.comment}</p>
                                            <small style="font-size:10px; color:#94a3b8;">${h.time}</small>
                                        </div>
                                        <button onclick="deleteHistoryItem('${order.id}', ${idx})" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:14px; padding:5px;" title="ডিলিট করুন">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                `).join('') : '<p style="text-align:center; color:#94a3b8;">কোনো হিস্টোরি নেই</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const chatBox = document.getElementById('adminChatList');
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ট্র্যাকিং হিস্টোরি ডিলিট করার ফাংশন
function deleteHistoryItem(orderId, index) {
    if (!confirm("আপনি কি এই হিস্টোরিটি মুছে ফেলতে চান?")) return;

    const orderIndex = appState.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    appState.orders[orderIndex].adm_history.splice(index, 1);
    
    // যদি সব হিস্টোরি ডিলিট হয়ে যায়, বর্তমান স্ট্যাটাস ডিফল্ট করে দিন
    if (appState.orders[orderIndex].adm_history.length > 0) {
        appState.orders[orderIndex].status = appState.orders[orderIndex].adm_history[0].status;
    }

    saveData(DB_KEYS.ORDERS, appState.orders);
    document.getElementById('adminOrderModal').remove();
    adminViewOrderDetails(orderId); // রিফ্রেশ
}

// অ্যাডমিন যখন ইউজারকে কমেন্ট/রিপ্লাই করবে

function sendAdminComment(orderId) {

    const input = document.getElementById('adminReplyInput');

    const text = input.value.trim();

    if (!text) return;



    const orderIndex = appState.orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return;



    if (!appState.orders[orderIndex].user_comments) appState.orders[orderIndex].user_comments = [];



    const newComment = {

        sender: 'Admin',

        text: text,

        time: new Date().toLocaleString('bn-BD', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })

    };



    appState.orders[orderIndex].user_comments.push(newComment);

    saveData(DB_KEYS.ORDERS, appState.orders);

   

    input.value = '';

    document.getElementById('adminOrderModal').remove();

    adminViewOrderDetails(orderId); // রিফ্রেশ মোডাল

}



function saveAdminUpdate(orderId, status, comment, icon) {

    const orderIndex = appState.orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return;



    if (!appState.orders[orderIndex].adm_history) appState.orders[orderIndex].adm_history = [];

   

    const newUpdate = {

        status: status,

        comment: comment,

        icon: icon,

        time: new Date().toLocaleString('bn-BD')

    };



    appState.orders[orderIndex].adm_history.unshift(newUpdate);

    appState.orders[orderIndex].status = status;

   

    saveData(DB_KEYS.ORDERS, appState.orders);

    alert("স্ট্যাটাস আপডেট হয়েছে!");

    document.getElementById('adminOrderModal').remove();

    if (typeof renderAdminOrders === 'function') renderAdminOrders();
}

function viewUserOrderDetails(orderId) {
    const order = appState.orders.find(o => o.id === orderId);
    if (!order) return alert("অর্ডার পাওয়া যায়নি!");

    // ১. স্মার্ট ইমেজ রিকভারি লজিক (ঠিক যেমনটি আপনার শপ পেজে আছে)
    const item = appState.products.find(p => p.id == order.productId);
    let productImage = '';

    if (item) {
        const images = Array.isArray(item.images) ? item.images : [item.images || item.image];
        productImage = images[0] || 'https://via.placeholder.com/150';
    } else {
        // যদি মেইন ডাটাবেসে না থাকে, তবে অর্ডারের ভেতরের ইমেজ বা SKU পাথ ব্যবহার করবে
        productImage = order.productImage || order.image || (order.sku ? `images/products/${order.sku}.jpg` : 'https://cdn-icons-png.flaticon.com/512/263/263142.png');
    }
    
    const history = order.adm_history || [{status: 'Pending', comment: 'আপনার অর্ডারটি পর্যালোচনার অপেক্ষায় আছে।', icon: 'fa-clock', time: ''}];
    const userComments = order.user_comments || []; 
    
    // ২. বিস্তারিত বাটনের জন্য সঠিক ফাংশন কল
    const productId = order.productId || order.id;

    const itemPrice = parseFloat(order.itemPrice) || (parseFloat(order.price) / (order.orderQty || 1));
    const deliveryCharge = parseFloat(order.deliveryCharge) || 0;
    const discount = parseFloat(order.discountAmount) || 0;
    const total = parseFloat(order.price);

    const modalHtml = `
        <div id="userOrderModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:10000000; backdrop-filter: blur(8px); font-family: 'Hind Siliguri', sans-serif;">
            <div style="background:#fff; width:95%; height:92%; max-width:600px; border-radius:25px; overflow:hidden; display:flex; flex-direction:column; box-shadow: 0 25px 50px rgba(0,0,0,0.5); border:1px solid #3498db; animation: zoomIn 0.3s ease;">
                
                <div style="background:#3498db; color:white; padding:20px; text-align:center; position:relative;">
                    <h3 style="margin:0; font-size:18px;">অর্ডার ডিটেইলস ও ট্র্যাকিং</h3>
                    <p style="margin:5px 0 0; opacity:0.8; font-size:12px;">অর্ডার আইডি: #${order.id}</p>
                    <span onclick="document.getElementById('userOrderModal').remove()" style="position:absolute; top:15px; right:20px; cursor:pointer; font-size:28px; line-height:1;">&times;</span>
                </div>

                <div id="userModalBody" style="flex:1; overflow-y:auto; padding:15px; background:#f8fafc;">
                    
                    <div style="background:#fff; border-radius:20px; padding:20px; margin-bottom:20px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
                        <div style="display:flex; gap:15px; margin-bottom:15px; border-bottom:1px dashed #cbd5e1; padding-bottom:15px;">
                            <div style="position:relative; cursor:pointer;" onclick="document.getElementById('userOrderModal').remove(); openProductDetails('${productId}')">
                                <img src="${productImage}" onerror="this.src='https://via.placeholder.com/150'" alt="Product" style="width:100px; height:100px; object-fit:contain; border-radius:15px; border:2px solid #3498db; background:#f1f5f9;">
                                <div style="position:absolute; bottom:0; width:100%; background:rgba(52, 152, 219, 0.9); color:white; font-size:10px; text-align:center; border-radius:0 0 15px 15px; padding:4px 0; font-weight:bold;">বিস্তারিত দেখুন</div>
                            </div>
                            <div style="flex:1;">
                                <h4 style="margin:0 0 8px 0; color:#1e293b; font-size:17px; line-height:1.3;">${order.productName || 'পণ্যটির নাম পাওয়া যায়নি'}</h4>
                                <div style="margin-bottom:10px;">
                                    <span style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:bold; border:1px solid #bdf0d2;">
                                        পেমেন্ট: ${order.paymentStatus}
                                    </span>
                                </div>
                                <p style="margin:0; font-size:13px; color:#64748b;">পরিমাণ: ${order.orderQty || 1} পিস</p>
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:8px; font-size:14px; color:#475569;">
                            <div style="display:flex; justify-content:space-between;">
                                <span>পণ্যের দাম:</span>
                                <span>৳${itemPrice.toFixed(2)}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span>ডেলিভারি চার্জ:</span>
                                <span>৳${deliveryCharge.toFixed(2)}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; color:#e11d48;">
                                <span>ডিসকাউন্ট:</span>
                                <span>- ৳${discount.toFixed(2)}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:5px; padding-top:10px; border-top:2px solid #3498db; color:#1e293b; font-weight:bold; font-size:18px;">
                                <span>সর্বমোট মূল্য:</span>
                                <span style="color:#3498db;">৳${total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <h4 style="margin:25px 0 15px 5px; color:#1e293b; font-size:16px; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-truck-fast" style="color:#3498db;"></i> অর্ডার আপডেট হিস্টোরি
                    </h4>
                    <div style="display:flex; flex-direction:column; padding-left:5px; margin-bottom:20px;">
                        ${history.map((item, index) => `
                            <div style="display:flex; gap:15px;">
                                <div style="display:flex; flex-direction:column; align-items:center; min-width:40px;">
                                    <div style="width:30px; height:30px; background:${index === 0 ? '#3498db' : '#fff'}; color:${index === 0 ? 'white' : '#3498db'}; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; z-index:2; border:2px solid #3498db;">
                                        <i class="fas ${item.icon || 'fa-check'}"></i>
                                    </div>
                                    ${index !== history.length - 1 ? '<div style="width:2px; flex:1; background:#3498db; opacity:0.2; margin:2px 0;"></div>' : ''}
                                </div>
                                <div style="flex:1; padding-bottom:20px;">
                                    <div style="background:${index === 0 ? '#fff9c4' : '#fff'}; padding:15px; border-radius:15px; border:1px solid ${index === 0 ? '#fbc02d' : '#e2e8f0'}; position:relative;">
                                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                            <strong style="color:#1e293b; font-size:14px;">${item.status}</strong>
                                            <small style="color:#94a3b8; font-size:10px;">${item.time}</small>
                                        </div>
                                        <p style="margin:0; font-size:13px; color:#475569; line-height:1.5;">${item.comment}</p>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;">
                    
                    <h4 style="margin:0 0 15px 5px; color:#1e293b; font-size:16px; display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-comments" style="color:#3498db;"></i> মেসেজ এবং সাপোর্ট
                    </h4>

                    <div style="background:#fff; border-radius:20px; padding:15px; border:1px solid #3498db; margin-bottom:20px;">
                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <input id="userCommentInput" type="text" placeholder="অর্ডার নিয়ে কিছু লিখুন..." style="flex:1; padding:12px; border-radius:12px; border:1px solid #ddd; outline:none; font-size:14px;">
                            <button onclick="saveUserComment('${order.id}')" style="background:#3498db; color:white; border:none; width:45px; height:45px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>

                        <div id="commentList" style="display:flex; flex-direction:column; gap:12px;">
                            ${userComments.length > 0 ? userComments.map(c => {
                                const isAdmin = c.sender === 'Admin';
                                return `
                                    <div style="align-self: ${isAdmin ? 'flex-start' : 'flex-end'}; max-width: 85%;">
                                        <div style="background: ${isAdmin ? '#f1f5f9' : '#e0f2fe'}; 
                                                    color: ${isAdmin ? '#1e293b' : '#0369a1'}; 
                                                    padding: 10px 15px; 
                                                    border-radius: ${isAdmin ? '15px 15px 15px 0' : '15px 15px 0 15px'}; 
                                                    border: 1px solid ${isAdmin ? '#e2e8f0' : '#bae6fd'};
                                                    position: relative;">
                                            <small style="display:block; font-size:9px; font-weight:bold; margin-bottom:3px; color:${isAdmin ? '#64748b' : '#0ea5e9'};">
                                                ${isAdmin ? 'Digital Shop TM (Admin)' : 'আপনি'}
                                            </small>
                                            <p style="margin:0; font-size:13px;">${c.text}</p>
                                            <small style="display:block; text-align:right; font-size:8px; color:#94a3b8; margin-top:4px;">${c.time}</small>
                                        </div>
                                    </div>
                                `;
                            }).join('') : '<p style="text-align:center; color:#94a3b8; font-size:12px; margin:10px 0;">কোনো মেসেজ নেই</p>'}
                        </div>
                    </div>
                </div>

                <div style="padding:15px; background:#fff; text-align:center; border-top:1px solid #e2e8f0;">
                    <button onclick="document.getElementById('userOrderModal').remove()" style="width:100%; padding:14px; background:#3498db; color:white; border:none; border-radius:15px; font-weight:bold; cursor:pointer; font-size:16px;">বন্ধ করুন</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
// ইউজার কমেন্ট সেভ করার ফাংশন
function saveUserComment(orderId) {
    const input = document.getElementById('userCommentInput');
    const text = input.value.trim();
    if (!text) return;

    const orderIndex = appState.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    if (!appState.orders[orderIndex].user_comments) {
        appState.orders[orderIndex].user_comments = [];
    }

    const newComment = {
        text: text,
        time: new Date().toLocaleString('bn-BD', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    };

    appState.orders[orderIndex].user_comments.push(newComment);
    saveData(DB_KEYS.ORDERS, appState.orders);
    
    // UI রিফ্রেশ
    input.value = '';
    document.getElementById('userOrderModal').remove();
    viewUserOrderDetails(orderId);
    
    // স্ক্রল করে নিচে নিয়ে যাওয়া
    setTimeout(() => {
        const body = document.getElementById('userModalBody');
        body.scrollTop = body.scrollHeight;
    }, 100);
}














const bdData = {
    "Dhaka": {
        "Dhaka": ["Dhanmondi", "Mirpur", "Uttara", "Gulshan", "Savar", "Keraniganj", "Dhamrai", "Nawabganj", "Dohar"],
        "Gazipur": ["Gazipur Sadar", "Kaliakair", "Sreepur", "Kaliganj", "Kapasia"],
        "Narayanganj": ["Narayanganj Sadar", "Bandar", "Rupganj", "Sonargaon", "Araihazar"],
        "Tangail": ["Tangail Sadar", "Mirzapur", "Sakhipur", "Kalihati", "Madhupur", "Gopalpur"],
        "Faridpur": ["Faridpur Sadar", "Bhanga", "Boalmari", "Madhukhali", "Nagarkanda"],
        "Manikganj": ["Manikganj Sadar", "Singair", "Shivalaya", "Saturia", "Harirampur"],
        "Narsingdi": ["Narsingdi Sadar", "Raipura", "Shibpur", "Belabo", "Palash"],
        "Munshiganj": ["Munshiganj Sadar", "Srinagar", "Sirajdikhan", "Lauhajang", "Gajaria"]
    },
    "Chittagong": {
        "Chittagong": ["Lohagara", "Satkania", "Patiya", "Hathazari", "Boalkhali", "Raozan", "Rangunia", "Anwara", "Chandanaish", "Banshkhali", "Fatikchhari", "Sandwip"],
        "Cox's Bazar": ["Cox's Bazar Sadar", "Chakaria", "Ukhiya", "Teknaf", "Ramu", "Pekua", "Maheshkhali", "Kutubdia"],
        "Cumilla": ["Cumilla Sadar", "Laksam", "Daudkandi", "Chauddagram", "Barura", "Burichang", "Chandina", "Debidwar", "Homna", "Muradnagar"],
        "Feni": ["Feni Sadar", "Chhagalnaiya", "Daganbhuiyan", "Parshuram", "Sonagazi", "Fulgazi"],
        "Noakhali": ["Noakhali Sadar", "Begumganj", "Chatkhil", "Senbagh", "Hatiya", "Companiganj"],
        "Brahmanbaria": ["Brahmanbaria Sadar", "Ashuganj", "Akhaura", "Bancharampur", "Kasba", "Nasirnagar"],
        "Chandpur": ["Chandpur Sadar", "Hajiganj", "Kachua", "Matlab North", "Matlab South", "Shahrasti"],
        "Rangamati": ["Rangamati Sadar", "Kaptai", "Kawkhali", "Bagaichhari", "Barkal"],
        "Bandarban": ["Bandarban Sadar", "Thanchi", "Lama", "Ruma", "Alikadam"],
        "Khagrachhari": ["Khagrachhari Sadar", "Dighinala", "Matiranga", "Panchhari"]
    },
    "Rajshahi": {
        "Rajshahi": ["Paba", "Bagmara", "Godagari", "Charghat", "Durgapur", "Mohanpur", "Tanore"],
        "Bogura": ["Bogura Sadar", "Sherpur", "Shajahanpur", "Dhunat", "Adamdighi", "Gabtali", "Kahaloo", "Nandigram", "Sariakandi"],
        "Pabna": ["Pabna Sadar", "Ishwardi", "Santhia", "Chatmohar", "Bera", "Faridpur", "Atgharia"],
        "Naogaon": ["Naogaon Sadar", "Mahadevpur", "Patnitala", "Dhamoirhat", "Porsha", "Sapahar"],
        "Natore": ["Natore Sadar", "Singra", "Baraigram", "Bagatipara", "Lalpur", "Gurudaspur"],
        "Chapai Nawabganj": ["Chapai Nawabganj Sadar", "Shibganj", "Nachole", "Gomastapur", "Bholahat"],
        "Sirajganj": ["Sirajganj Sadar", "Shahjadpur", "Ullahpara", "Belkuchi", "Kazipur", "Tarash"]
    },
    "Khulna": {
        "Khulna": ["Khulna Sadar", "Dumuria", "Batiaghata", "Dacope", "Paikgachha", "Phultala", "Rupsha"],
        "Jashore": ["Jashore Sadar", "Jhikargachha", "Keshabpur", "Manirampur", "Sharsha", "Abhaynagar"],
        "Bagerhat": ["Bagerhat Sadar", "Mongla", "Morrelganj", "Chitalmari", "Fakirhat", "Mollahat"],
        "Kushtia": ["Kushtia Sadar", "Kumarkhali", "Bheramara", "Mirpur", "Daulatpur", "Khoksa"],
        "Satkhira": ["Satkhira Sadar", "Ashassuni", "Debhata", "Kalaroa", "Kaliganj", "Shyamnagar"]
    },
    "Barisal": {
        "Barisal": ["Barisal Sadar", "Bakerganj", "Babuganj", "Banaripara", "Gournadi", "Hizla", "Mehendiganj"],
        "Bhola": ["Bhola Sadar", "Char Fasson", "Lalmohan", "Borhanuddin", "Daulatkhan", "Manpura"],
        "Patuakhali": ["Patuakhali Sadar", "Bauphal", "Galachipa", "Kalapara", "Dashmina", "Dumki"]
    },
    "Sylhet": {
        "Sylhet": ["Sylhet Sadar", "Beanibazar", "Bishwanath", "Fenchuganj", "Golapganj", "Gowainghat", "Kanaighat"],
        "Moulvibazar": ["Moulvibazar Sadar", "Sreemangal", "Kulaura", "Barlekha", "Juri", "Kamalganj"],
        "Habiganj": ["Habiganj Sadar", "Nabiganj", "Madhabpur", "Chunarughat", "Bahubal", "Baniyachong"]
    },
    "Rangpur": {
        "Rangpur": ["Rangpur Sadar", "Badarganj", "Gangachara", "Kaunia", "Mithapukur", "Pirganj", "Pirgachha"],
        "Dinajpur": ["Dinajpur Sadar", "Birganj", "Biral", "Bochaganj", "Phulbari", "Ghoraghat", "Hakimpur"],
        "Kurigram": ["Kurigram Sadar", "Ulipur", "Nageshwari", "Rajarhat", "Bhurungamari"]
    },
    "Mymensingh": {
        "Mymensingh": ["Mymensingh Sadar", "Muktagachha", "Bhaluka", "Trishal", "Gaffargaon", "Ishwarganj", "Nandail"],
        "Netrokona": ["Netrokona Sadar", "Mohanganj", "Kendua", "Durgapur", "Khaliajuri"],
        "Sherpur": ["Sherpur Sadar", "Nakla", "Nalitabari", "Jhenaigati", "Sreebardi"]
    }
};

// জেলা আপডেট করার ফাংশন
function updateDistricts() {
    const division = document.getElementById('addrDivision').value;
    const districtSelect = document.getElementById('addrDistrict');
    const upazilaSelect = document.getElementById('addrUpazila');

    districtSelect.innerHTML = '<option value="">জেলা সিলেক্ট করুন</option>';
    upazilaSelect.innerHTML = '<option value="">উপজেলা/থানা সিলেক্ট করুন</option>';

    if (division && bdData[division]) {
        const districts = Object.keys(bdData[division]);
        districts.forEach(dist => {
            const option = document.createElement('option');
            option.value = dist;
            option.textContent = dist;
            districtSelect.appendChild(option);
        });
    }
}

// উপজেলা আপডেট করার ফাংশন
function updateUpazilas() {
    const division = document.getElementById('addrDivision').value;
    const district = document.getElementById('addrDistrict').value;
    const upazilaSelect = document.getElementById('addrUpazila');

    upazilaSelect.innerHTML = '<option value="">উপজেলা/থানা সিলেক্ট করুন</option>';

    if (division && district && bdData[division][district]) {
        const upazilas = bdData[division][district];
        upazilas.forEach(upz => {
            const option = document.createElement('option');
            option.value = upz;
            option.textContent = upz;
            upazilaSelect.appendChild(option);
        });
    }
}

// ৩. সার্চ ফিল্টার করার মূল জাভাস্ক্রিপ্ট লজিক
function handleUserSearch() {
    const query = document.getElementById("userSearchField").value.toLowerCase();
    const grid = document.getElementById("userGridDisplay");
    const counter = document.getElementById("countUsers");
    const isSubAdmin = appState.currentUser && appState.currentUser.role === "sub_admin";
    let filtered = appState.users.filter(u => {
        const userName = (u.name || "").toLowerCase();
        const userMobile = (u.mobile || "").toLowerCase();
        return userName.includes(query) || userMobile.includes(query);
    });
    if (isSubAdmin) filtered = filtered.filter(u => u.role !== "admin" && u.role !== "sub_admin");
    grid.innerHTML = buildUserCards(filtered);
    counter.innerText = filtered.length;
}
















// --- নতুন অ্যাডমিন ফাংশনসমূহ ---

// ১. মোবাইল নম্বর পরিবর্তন
function adminChangeMobile(userId) {
    const user = appState.users.find(u => u.id === userId);
    const newMobile = prompt("ইউজারের নতুন মোবাইল নম্বর দিন:", user.mobile);
    
    if (newMobile && newMobile.length >= 11) {
        user.mobile = newMobile;
        user.id = newMobile; // যেহেতু আপনার সিস্টেমে মোবাইল নম্বরই ID
        saveData(DB_KEYS.USERS, appState.users);
        loadAdminTab('users'); // লিস্ট রিফ্রেশ
        alert("✅ মোবাইল নম্বর আপডেট করা হয়েছে!");
    } else if (newMobile !== null) {
        alert("❌ সঠিক মোবাইল নম্বর দিন!");
    }
}

// ২. ইউজার ডিলিট করা
function adminDeleteUser(userId) {
    if (confirm("আপনি কি নিশ্চিতভাবে এই ইউজারকে ডিলিট করতে চান? এই কাজ আর ফেরত আনা যাবে না!")) {
        appState.users = appState.users.filter(u => u.id !== userId);
        saveData(DB_KEYS.USERS, appState.users);
        // Firebase users collection থেকে delete
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                firebase.firestore().collection('users').doc(String(userId)).delete()
                    .then(() => console.log('[FB] ✅ User deleted:', userId))
                    .catch(e => console.warn('[FB] user delete err:', e.message));
            }
        } catch(e) {}
        loadAdminTab('users');
        alert("🗑️ ইউজার সফলভাবে রিমুভ করা হয়েছে।");
    }
}

function adminResetPass(userId) {
    const newPass = prompt("নতুন পাসওয়ার্ড দিন:");
    if(newPass) {
        const user = appState.users.find(u => u.id === userId);
        user.pass = newPass;
        saveData(DB_KEYS.USERS, appState.users);
        alert("✅ পাসওয়ার্ড পরিবর্তন হয়েছে!");
    }
}



function adminDeleteProduct(id) {
    if(confirm("আপনি কি এই পণ্যটি ডিলিট করতে চান?")) {
        appState.products = appState.products.filter(p => p.id !== id);
        saveData(DB_KEYS.PRODUCTS, appState.products);
        renderProductGrid(appState.products);
    }
}



// ====================================================================
// 7. USER SETTINGS & UTILITIES
// ====================================================================

// Toggle Dropdown
function toggleDropdown(id) {
    const el = document.getElementById(id).parentElement;
    el.classList.toggle('active');
}

// Theme Management
function toggleThemeMode() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem(DB_KEYS.THEME, isDark ? 'dark' : 'light');
}

function loadTheme() {
    const theme = localStorage.getItem(DB_KEYS.THEME);
    if(theme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

// User Profile Updates
function updatePassword() {
    const oldP = document.getElementById('oldPass').value;
    const newP = document.getElementById('newPass').value;
    
    if(appState.currentUser.pass !== oldP) return alert("❌ বর্তমান পাসওয়ার্ড ভুল!");
    
    appState.currentUser.pass = newP;
    updateCurrentUserRecord();
    alert("✅ পাসওয়ার্ড পরিবর্তিত হয়েছে।");
    closeModal('resetPasswordModal');
}

function updateUsername() {
    const newName = document.getElementById('newUsernameInput').value;
    if(!newName) return;
    
    appState.currentUser.name = newName;
    updateCurrentUserRecord();
    document.getElementById('headerUserName').innerText = newName;
    alert("✅ নাম পরিবর্তন হয়েছে।");
    closeModal('resetUsernameModal');
}

// ১. ডাটাবেস (নমুনা)
const areaData = {
    "Dhaka": { districts: ["Dhaka", "Gazipur", "Tangail"], upazilas: { "Dhaka": ["Savar", "Dhamrai"] } },
    "Chittagong": { districts: ["Chittagong", "Cox's Bazar", "Lohagara"], upazilas: { "Lohagara": ["Lohagara Upazila"] } }
};

// ২. ডাইনামিক ফিল্টার ফাংশন
function filterDistricts() {
    const div = document.getElementById('addrDivision').value;
    const list = document.getElementById('districts');
    list.innerHTML = "";
    if (areaData[div]) {
        areaData[div].districts.forEach(d => list.innerHTML += `<option value="${d}">`);
    }
}

function adminChangeEmail(userId) {
    const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex !== -1) {
        const newEmail = prompt("নতুন ইমেইল এড্রেস লিখুন:", users[userIndex].email || "");
        
        if (newEmail !== null && newEmail.trim() !== "") {
            users[userIndex].email = newEmail.trim();
            saveData(DB_KEYS.USERS, users);
            appState.users = users;
            renderAdminUsers(document.getElementById('adminMainContainer'));
            showToast("✅ ইমেইল আপডেট করা হয়েছে");
        }
    }
}

function filterUpazilas() {
    const div = document.getElementById('addrDivision').value;
    const dist = document.getElementById('addrDistrict').value;
    const list = document.getElementById('upazilas');
    list.innerHTML = "";
    if (areaData[div] && areaData[div].upazilas[dist]) {
        areaData[div].upazilas[dist].forEach(u => list.innerHTML += `<option value="${u}">`);
    }
}

// ৩. নতুন সেভ ফাংশন (সব তথ্য একসাথে)
// ১. ডাটা কি নামে সেভ হবে তা নিশ্চিত করা
// ১. ডাটা কি নামে সেভ হবে তা নিশ্চিত করা
// ✅ ADDRESS_STORAGE_KEY এখন user-specific _addrKey() ব্যবহার করে

function saveAddressToProfile() {
    // HTML থেকে ভ্যালুগুলো সংগ্রহ করা
    const name = document.getElementById('addrName').value.trim();
    const mobile = document.getElementById('addrMobile').value.trim();
    const division = document.getElementById('addrDivision').value;
    const district = document.getElementById('addrDistrict').value;
    const upazila = document.getElementById('addrUpazila').value;
    const details = document.getElementById('addrDetails').value.trim();

    // ২. সঠিক ভ্যালিডেশন
    if (!name || !mobile || !division || !district || !upazila) {
        alert("❌ নাম, মোবাইল, বিভাগ, জেলা এবং উপজেলা অবশ্যই দিতে হবে।");
        return;
    }

    // ৩. ডাটা অবজেক্ট তৈরি
    const addressObj = {
        name: name,
        mobile: mobile,
        division: division,
        district: district,
        upazila: upazila,
        details: details,
        timestamp: new Date().getTime()
    };

    try {
        // ৪. LocalStorage-এ সেভ করা
        localStorage.setItem(_addrKey(), JSON.stringify(addressObj));

        // Users array তে address save → Firebase sync হবে
        if (appState.currentUser && appState.currentUser.id) {
            const uIdx = appState.users.findIndex(u => String(u.id) === String(appState.currentUser.id));
            if (uIdx !== -1) {
                appState.users[uIdx].savedAddress = addressObj;
                localStorage.setItem(DB_KEYS.USERS, JSON.stringify(appState.users));
            }
        }
        
        // ৫. তাৎক্ষণিকভাবে UI আপডেট করা (রিফ্রেশ ছাড়া)
        const formatted = `${name}, ${mobile}, ${details}, ${upazila}, ${district}, ${division}`;
        
        // চেকআউট পেজের ডিসপ্লে বক্স আপডেট
        const displayBox = document.getElementById('displaySavedAddr');
        if (displayBox) {
            displayBox.innerHTML = `<b style="color:#3498db;">[সেভ করা]:</b> ${formatted}`;
            // বক্সের বর্ডার নীল করে দেওয়া (সেভ করা বোঝাতে)
            if (document.getElementById('savedAddrBox')) {
                document.getElementById('savedAddrBox').style.borderColor = "#3498db";
            }
        }

        // অর্ডারের গোপন বা দৃশ্যমান ইনপুট আপডেট (যাতে অর্ডারের সাথে ডাটা যায়)
        const orderInput = document.getElementById('orderAddress');
        if (orderInput) {
            // যদি এটি textarea হয় তবে ভ্যালু সেট হবে
            orderInput.value = formatted;
        }
        
        alert("✅ ঠিকানা প্রোফাইলে সেভ এবং আপডেট করা হয়েছে!");
        
        // ৬. মোডাল বন্ধ করা
        closeModal('addressModal');
        
    } catch (error) {
        console.error("Save Error:", error);
        alert("❌ সেভ করার সময় সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
}
// চেকআউট পেজে ডাটা লোড করার ফাংশন
function loadSavedAddressToCheckout() {
    let savedData = localStorage.getItem(_addrKey());

    // localStorage এ না থাকলে users array থেকে নিই
    if (!savedData && appState.currentUser) {
        const user = appState.users.find(u => String(u.id) === String(appState.currentUser.id));
        if (user && user.savedAddress) {
            savedData = JSON.stringify(user.savedAddress);
            localStorage.setItem(_addrKey(), savedData);
        }
    }

    const targetTextarea = document.getElementById('orderAddress');
    if (savedData && targetTextarea) {
        const addr = JSON.parse(savedData);
        const formatted = `নাম: ${addr.name}\nমোবাইল: ${addr.mobile}\nঠিকানা: ${addr.details}, ${addr.upazila}, ${addr.district}, ${addr.division}`;
        targetTextarea.value = formatted;
    }
}

// মোডাল বন্ধ করার ফাংশন (যদি আগে না থাকে)
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function callHelpline() {
    window.location.href = `tel:${SYSTEM_CONFIG.ADMIN_PHONE}`;
}

// Update User in Array after Edit
function updateCurrentUserRecord() {
    // Save to Session
    localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(appState.currentUser));
    
    // Save to Main Database
    const index = appState.users.findIndex(u => u.id === appState.currentUser.id);
    if(index !== -1) {
        appState.users[index] = appState.currentUser;
        saveData(DB_KEYS.USERS, appState.users);
    }
}

// Order Tracking View - Digital Shop TM (ছবি সহ আপডেট করা)
document.querySelector("li[onclick=\"openModal('orderTrackingModal')\"]").onclick = function() {
    openModal('orderTrackingModal');
    
    var list = document.getElementById('userOrderHistoryList');
    if(!list) return; 

    list.style.maxHeight = "450px"; 
    list.style.overflowY = "auto";  
    list.style.paddingRight = "5px"; 
    list.style.scrollBehavior = "smooth";

    list.innerHTML = '<div style="text-align:center; padding:20px; color: #888;">অর্ডার চেক করা হচ্ছে...</div>';

    if (!appState.currentUser || !appState.orders) {
        list.innerHTML = '<p style="text-align:center; padding:20px; color: #e74c3c;">লগইন সমস্যা! আবার লগইন করুন।</p>';
        return;
    }

    var myOrders = appState.orders.filter(function(order) {
        return order.userId === appState.currentUser.id;
    });

    if(myOrders.length === 0) {
        list.innerHTML = '<p style="color: #888; text-align:center; padding:30px; font-size: 14px;">আপনার বর্তমানে কোনো অর্ডার নেই।</p>';
        return;
    }

    var finalHtml = "";
    myOrders.forEach(function(o) {
        var statusColor = (o.status === 'Confirmed') ? '#2ecc71' : (o.status === 'Rejected' ? '#e74c3c' : '#f39c12');
        var paymentStatusColor = (o.paymentStatus === 'পেইড') ? '#2ecc71' : '#ff4757';
        
        // ছবি রিকভারি লজিক
        var item = appState.products.find(p => p.id == o.productId);
        var pImage = "";
        if(item) {
            var images = Array.isArray(item.images) ? item.images : [item.images || item.image];
            pImage = images[0];
        } else {
            pImage = o.productImage || o.image || (o.sku ? `images/products/${o.sku}.jpg` : 'https://placehold.co/100x100?text=No+Img');
        }

        // ডিলিট বাটন লজিক
        var deleteBtnHtml = "";
        if (o.status === 'Pending') {
            deleteBtnHtml = '<button onclick="cancelUserOrder(\'' + o.id + '\')" style="background: #ff4757; color: #fff; border: none; padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold; transition: 0.3s; margin-top:5px;">' +
                            '<i class="fa fa-trash"></i> ডিলিট</button>';
        }

        var adminNoteHtml = "";
        if (o.adminNote) {
            adminNoteHtml = '<div style="margin-top: 12px; padding: 12px; background: rgba(52, 152, 219, 0.15); border-left: 4px solid #3498db; border-radius: 8px; font-size: 13px; color: #fff;">' +
                            '<b style="color: #5dade2;">📢 শপ থেকে বার্তা:</b> ' + o.adminNote + 
                            '</div>';
        }

        finalHtml += '<div style="background: #1e1e1e; border: 1px solid #333; padding: 18px; margin-bottom: 15px; border-radius: 12px; color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">' +
                        '<div style="display: flex; justify-content: space-between; align-items: start;">' +
                            '<div>' +
                                '<strong style="font-size: 15px; display:block; margin-bottom: 4px; color: #ffffff;">' + o.productName + ' <span style="color:#3498db; font-size:12px;">(' + (o.sku || 'N/A') + ')</span></strong>' +
                                '<small style="color: #bbbbbb; font-size: 12px; display: block;">পরিমাণ: ' + (o.orderQty || 1) + ' পিস</small>' +
                                '<small style="color: #bbbbbb; font-size: 11px; display: block; margin-top:2px;">Trx ID: ' + o.trxId + '</small>' +
                                '<small style="color: #ffffff; font-size: 12px; display: block; margin-top: 5px;">পেমেন্ট: <b style="color:' + paymentStatusColor + ';">' + (o.paymentStatus || 'পেইড হয় নাই') + '</b></small>' +
                            '</div>' +
                            '<div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">' +
                                '<div style="font-weight: bold; color: #2ecc71; font-size: 16px; margin-bottom: 8px;">' + o.price + ' ৳</div>' +
                                // --- ছবি যোগ করা হয়েছে এখানে ---
                                '<img src="' + pImage + '" onerror="this.src=\'https://placehold.co/100x100?text=Error\'" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover; border: 1px solid #444; background: #2a2a2a; margin-bottom: 5px;">' +
                                // ----------------------------
                                deleteBtnHtml + 
                            '</div>' +
                        '</div>' +
                        '<div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #333; padding-top: 10px;">' +
                            '<span style="font-size: 13px; color: #eeeeee;">অবস্থা: <b style="color:' + statusColor + ';">' + o.status + '</b></span>' +
                            '<small style="font-size: 10px; color: #666;">' + (o.date || '') + '</small>' +
                        '</div>' +
                        adminNoteHtml + 
                      '</div>';
    });

    list.innerHTML = finalHtml;
};

// অর্ডার ডিলিট করার জন্য নতুন ফাংশন
function cancelUserOrder(orderId) {
    if (confirm("আপনি কি নিশ্চিত যে আপনি এই অর্ডারটি চিরতরে ডিলিট করতে চান?")) {
        // ডাটাবেজ থেকে ফিল্টার করে ডিলিট করা
        appState.orders = appState.orders.filter(function(o) {
            return o.id !== orderId;
        });
        
        // লোকাল স্টোরেজে সেভ করা
        saveData(DB_KEYS.ORDERS, appState.orders);
        
        // ভিউ আপডেট করা (আবার ট্র্যাকিং ওপেন করে রিফ্রেশ করা)
        document.querySelector("li[onclick=\"openModal('orderTrackingModal')\"]").click();
        
        alert("অর্ডারটি সফলভাবে ডিলিট করা হয়েছে।");
    }
}
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function switchModal(closeId, openId) {
    closeModal(closeId);
    openModal(openId);
}

function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function isAdmin() {
    if (!appState.currentUser) return false;
    if (appState.currentUser.role === 'admin') return true;
    // Sub-admin with product_edit permission — পণ্যে edit/delete বাটন দেখাবে
    if (appState.currentUser.role === 'sub_admin' &&
        (appState.currentUser.permissions||[]).includes('product_edit')) return true;
    return false;
}

// Default Data Generator (To make sure site isn't empty)
function generateDefaultProducts() {
    return [
        {id:'101', title:'Premium Panjabi', price:'1200', category:'Men', images:['ko.jpeg']},
        {id:'102', title:'Silk Saree', price:'2500', category:'Women', images:['ko.jpeg']},
        {id:'103', title:'Kids T-Shirt', price:'350', category:'Kids', images:['ko.jpeg']},
        {id:'104', title:'Smart Watch', price:'1800', category:'Electronics', images:['ko.jpeg']},
        {id:'105', title:'Running Shoes', price:'950', category:'Shoes', images:['ko.jpeg']},
        {id:'106', title:'Blender Machine', price:'3200', category:'Household', images:['ko.jpeg']}
    ];
}

function loadAdvertisements() {
    // Future ad logic
    console.log("Ads loaded");
}
// ছবি বড় করে দেখার ফাংশন
function viewFullImage(imgUrl) {
    const lightbox = document.getElementById('imageLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    lightboxImg.src = imgUrl;
    lightbox.style.display = 'flex';
    lightbox.style.zIndex = '3000'; // সবার উপরে থাকবে
}

// লাইটবক্স বন্ধ করার ফাংশন
function closeLightbox() {
    document.getElementById('imageLightbox').style.display = 'none';
}
// ১. এডিট মোডাল ওপেন করার ফাংশন
window.openEditModal = function(productId) {
    const product = appState.products.find(p => String(p.id) === String(productId));
    if (!product) return alert("পণ্যটি পাওয়া যায়নি!");

    const categories = [
        "Men Fashion", "Women Fashion", "Electronics", "Shoes", "HouseHold", 
        "SKIN CARE & BEAUTY", "Digital Products", "Child Fashion", "Toy", 
        "Vehicel", "Book", "Sport", "Gift Card", "Game Topup", "Watches", 
        "Musical Instruments", "Others"
    ];

    const images = Array.isArray(product.images) ? product.images : [product.images || product.image];
    let imageThumbsHtml = images.filter(img => img).map((img) => `
        <div class="edit-img-wrapper" style="position:relative; width:80px; height:80px; border-radius:12px; overflow:hidden; border:2px solid #e2e8f0;">
            <img src="${img}" style="width:100%; height:100%; object-fit:cover;">
            <div onclick="this.parentElement.remove()" style="position:absolute; top:0; right:0; background:rgba(231, 76, 60, 0.9); color:white; width:22px; height:22px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px;">
                <i class="fa fa-times"></i>
            </div>
        </div>
    `).join('');

    const modalHtml = `
        <div id="editProductModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.8); display:flex; align-items:center; justify-content:center; z-index:10089760000; backdrop-filter:blur(8px); font-family: 'Inter', sans-serif;">
            <div style="background:#fff; width:95%; max-width:550px; border-radius:24px; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); animation: modalBounce 0.4s ease;">
                
                <div style="background: linear-gradient(135deg, #1e293b, #334155); color:#fff; padding:20px 25px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; font-size:18px; font-weight:700;">পণ্য এডিট করুন</h3>
                        <p style="margin:0; font-size:11px; opacity:0.7;">SKU: ${product.sku || 'N/A'}</p>
                    </div>
                    <div onclick="document.getElementById('editProductModal').remove()" style="cursor:pointer; width:32px; height:32px; background:rgba(255,255,255,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center;">
                        <i class="fa fa-times"></i>
                    </div>
                </div>

                <div style="padding:25px; max-height:70vh; overflow-y:auto; background:#ffffff;">
                    
                    <div style="margin-bottom:18px;">
                        <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">পণ্যের নাম</label>
                        <input id="editTitle" type="text" value="${product.title}" style="width:100%; padding:12px; border:1.5px solid #e2e8f0; border-radius:12px; outline:none; font-size:14px;">
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:18px;">
                        <div>
                            <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">মূল্য (৳)</label>
                            <input id="editPrice" type="number" value="${product.price}" style="width:100%; padding:12px; border:1.5px solid #e2e8f0; border-radius:12px; outline:none; font-size:14px;">
                        </div>
                        <div>
                            <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">ক্যাটাগরি</label>
                            <select id="editCategory" style="width:100%; padding:12px; border:1.5px solid #e2e8f0; border-radius:12px; font-size:14px; background:white;">
                                ${categories.map(cat => `<option value="${cat}" ${product.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="margin-bottom:18px;">
                        <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">বিস্তারিত বিবরণ</label>
                        <textarea id="editDesc" style="width:100%; padding:12px; height:80px; border:1.5px solid #e2e8f0; border-radius:12px; outline:none; resize:none; font-size:14px;">${product.description || ''}</textarea>
                    </div>

                    <div style="margin-bottom:18px;">
                        <label style="display:block; font-size:13px; font-weight:600; color:#2ecc71; margin-bottom:6px;">সেলার বিস্তারিত</label>
                        <textarea id="editSellerInfo" style="width:100%; padding:12px; height:80px; border:1.5px solid #e2e8f0; border-radius:12px; outline:none; resize:none; font-size:14px; background:#f9fffb;">${product.sellerInfo || ''}</textarea>
                    </div>

                    <div style="margin-bottom:18px; background: #fff7ed; padding: 15px; border-radius: 12px; border: 1.5px solid #fdba74;">
                        <label style="display:block; font-size:13px; font-weight:700; color:#ea580c; margin-bottom:6px;">
                            <i class="fa fa-heart"></i> পণ্যের লাইক সংখ্যা সেট করুন
                        </label>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input id="editLikes" type="number" value="${product.likes || 0}" style="width:120px; padding:10px; border:1.5px solid #fdba74; border-radius:8px; outline:none; font-size:16px; font-weight:bold; color:#ea580c; text-align:center;">
                            <span style="font-size:12px; color:#9a3412;">এই সংখ্যাটি পণ্যর রিঅ্যাকশন হিসেবে শো করবে।</span>
                        </div>
                    </div>

                    <div style="margin-bottom:18px;">
                        <label style="display:block; font-size:13px; font-weight:600; color:#3b82f6; margin-bottom:10px;">বিদ্যমান ছবিসমূহ</label>
                        <div id="currentImagesList" style="display:flex; gap:12px; flex-wrap:wrap; background:#f8fafc; padding:12px; border-radius:16px; border:1px solid #f1f5f9;">
                            ${imageThumbsHtml}
                        </div>
                    </div>

                    <div>
                        <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">নতুন ছবি যোগ করুন (URL)</label>
                        <input id="newImageUrl" type="text" placeholder="https://example.com/image.jpg" style="width:100%; padding:12px; border:1.5px dashed #cbd5e1; border-radius:12px; outline:none; font-size:13px;">
                    </div>
                </div>

                <div style="padding:20px 25px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; gap:12px;">
                    <button onclick="document.getElementById('editProductModal').remove()" style="flex:1; padding:12px; background:#fff; border:1.5px solid #e2e8f0; border-radius:12px; color:#64748b; font-weight:600; cursor:pointer;">বাতিল</button>
                    <button onclick="saveProductEdit('${product.id}')" style="flex:2; padding:12px; background:linear-gradient(135deg, #3b82f6, #2563eb); border:none; border-radius:12px; color:#fff; font-weight:700; cursor:pointer;">পরিবর্তন সেভ করুন</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes modalBounce {
                0% { opacity: 0; transform: translateY(20px); }
                100% { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};
// ২. ডাটা সেভ করার ফাংশন (আপডেট করা)
window.saveProductEdit = function(productId) {
    const product = appState.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    // ইমেজ লিস্ট সংগ্রহ
    let finalImages = [];
    document.querySelectorAll('#currentImagesList img').forEach(img => {
        finalImages.push(img.src);
    });

    const newUrl = document.getElementById('newImageUrl').value.trim();
    if(newUrl) finalImages.push(newUrl);

    // সব ডাটা আপডেট (সেলার ইনফো এবং লাইক সহ)
    product.title = document.getElementById('editTitle').value;
    product.price = document.getElementById('editPrice').value;
    product.category = document.getElementById('editCategory').value;
    product.description = document.getElementById('editDesc').value;
    product.sellerInfo = document.getElementById('editSellerInfo').value; // সেলার ইনফো সেভ হচ্ছে
    
    // লাইক সংখ্যা আপডেট (নতুন যোগ করা হয়েছে)
    const likesInput = document.getElementById('editLikes');
    if (likesInput) {
        product.likes = parseInt(likesInput.value) || 0;
    }

    product.images = finalImages;

    // ডাটাবেস আপডেট
    if(typeof saveData === 'function') {
        saveData(DB_KEYS.PRODUCTS, appState.products);
    } else {
        localStorage.setItem('products', JSON.stringify(appState.products));
    }
    
    // রি-রেন্ডার
    if(typeof renderProductGrid === 'function') renderProductGrid(appState.products);
    if(typeof renderAdminProducts === 'function') renderAdminProducts();

    document.getElementById('editProductModal').remove();
    alert("✅ পণ্যটি সফলভাবে আপডেট করা হয়েছে!");
};
function renderUserList(users) {
    const container = document.getElementById('userListArea');
    container.innerHTML = users.map(user => `
        <div class="user-item">
            <div class="user-details-box">
                <strong>নাম:</strong> ${user.name || 'N/A'}<br>
                <strong>মোবাইল:</strong> ${user.phone || 'N/A'}
            </div>
            <button class="btn-reset-pass" onclick="resetPassword('${user.id}')">Reset Pass</button>
        </div>
    `).join('');
}

// স্ক্রিনের যেকোনো জায়গায় ক্লিক করলে ড্রপডাউন বা মোডাল বন্ধ করার লজিক
window.addEventListener('click', function(event) {
    
    // ১. প্রোফাইল ড্রপডাউন বন্ধ করার জন্য
    const profileArea = document.querySelector('.user-profile-area');
    if (profileArea && !profileArea.contains(event.target)) {
        profileArea.classList.remove('active');
    }

    // ২. মোডাল (Popup) বন্ধ করার জন্য 
    // যদি কেউ মোডাল বক্সের বাইরে (কালো ব্যাকগ্রাউন্ডে) ক্লিক করে
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // ৩. ইমেজ লাইটবক্স (ছবি বড় করে দেখা) বন্ধ করার জন্য
    const lightbox = document.getElementById('imageLightbox');
    if (event.target === lightbox) {
        closeLightbox();
    }
});





function renderAdminAds(container) {
    const allAds = JSON.parse(localStorage.getItem(DB_KEYS.ADS)) || [];
    
    container.innerHTML = `
        <div class="ad-management-layout" style="font-family: 'Hind Siliguri', sans-serif;">
            <div class="ad-card ad-form-section" style="background: #1e293b; padding: 20px; border-radius: 20px; margin-bottom: 20px;">
                <h3 class="ad-title" style="color: #fff;">📢 প্রিমিয়াম বিজ্ঞাপন পাবলিশ</h3>
                <hr style="opacity:0.1; margin: 15px 0;">
                
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <input type="text" id="adTitle" placeholder="বিজ্ঞাপন শিরোনাম" style="width: 100%; padding: 12px; border-radius: 10px; background: #0f172a; border: 1px solid #334155; color: #fff;">
                    <input type="text" id="adImg" placeholder="ছবির লিঙ্ক (Image URL)" style="width: 100%; padding: 12px; border-radius: 10px; background: #0f172a; border: 1px solid #334155; color: #fff;">
                    <input type="text" id="adLink" placeholder="টার্গেট লিঙ্ক (Target Link)" style="width: 100%; padding: 12px; border-radius: 10px; background: #0f172a; border: 1px solid #334155; color: #fff;">
                    <button class="btn-primary" onclick="masterPublishAd()" style="width: 100%; padding: 15px; background: #f59e0b; border: none; border-radius: 10px; color: #fff; font-weight: 800; cursor: pointer;">পাবলিশ করুন</button>
                </div>
            </div>

            <div class="ad-card ad-list-section" style="background: #1e293b; padding: 20px; border-radius: 20px;">
                <h3 class="ad-title" style="color: #fff;">📋 সকল বিজ্ঞাপন লিস্ট (${allAds.length})</h3>
                <hr style="opacity:0.1; margin: 15px 0;">
                <div id="adminAdList" style="display: flex; flex-direction: column; gap: 10px;">
                    ${allAds.map(ad => `
                        <div style="display: flex; align-items: center; justify-content: space-between; background: #0f172a; padding: 10px; border-radius: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <img src="${ad.img}" style="width: 50px; height: 35px; object-fit: cover; border-radius: 5px;">
                                <span style="color: #fff; font-size: 14px;">${ad.title}</span>
                            </div>
                            <button onclick="masterDeleteAd(${ad.id})" style="background: none; border: none; color: #ef4444; cursor: pointer;">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    `).reverse().join('')}
                </div>
            </div>
        </div>
    `;
}



// ২. বিজ্ঞাপন সেভ করার ফাংশন
function masterPublishAd() {
    const title = document.getElementById('adTitle').value;
    const img = document.getElementById('adImg').value;
    const link = document.getElementById('adLink').value || "#";
    
    if(!title || !img) return alert("শিরোনাম এবং ছবির লিঙ্ক দিন!");

    const ads = JSON.parse(localStorage.getItem(DB_KEYS.ADS)) || [];
    ads.push({ id: Date.now(), title, img, link });
    localStorage.setItem(DB_KEYS.ADS, JSON.stringify(ads));
    if(typeof window.pushToCloud==='function') window.pushToCloud('TM_DB_ADS_V2');
    
    alert("বিজ্ঞাপন সফলভাবে পাবলিশ হয়েছে!");
    renderAdminAds(document.getElementById('adminMainContainer'));
}

// ৩. বিজ্ঞাপন ডিলিট করার ফাংশন
function masterDeleteAd(id) {
    if(confirm("আপনি কি এটি ডিলিট করতে চান?")) {
        let ads = JSON.parse(localStorage.getItem(DB_KEYS.ADS)) || [];
        ads = ads.filter(a => a.id !== id);
        if(typeof window.pushToCloud==='function') window.pushToCloud('TM_DB_ADS_V2');
        localStorage.setItem(DB_KEYS.ADS, JSON.stringify(ads));
        renderAdminAds(document.getElementById('adminMainContainer'));
    }
}
/**
 * 8.1 INVOICE GENERATION ENGINE
 * এই ফাংশনটি একটি পপ-আপ উইন্ডোতে ইনভয়েস তৈরি করবে যা প্রিন্ট বা পিডিএফ করা যাবে।
 */
function generateInvoice(orderId) {
    const order = appState.orders.find(o => o.id === orderId);
    if (!order) return alert("অর্ডার পাওয়া যায়নি!");

    const invoiceWindow = window.open('', '_blank', 'width=850,height=950');
    
    const isPaid = order.paymentStatus === 'পেইড';
    const statusColor = isPaid ? '#10b981' : '#ef4444';
    const statusText = order.paymentStatus || 'বকেয়া';

    // ১. ডাটা প্রসেসিং (অর্ডার অবজেক্ট থেকে সঠিক তথ্য নেয়া)
    const qty = parseInt(order.orderQty || 1); // অর্ডারে থাকা পরিমাণ
    const finalTotal = parseInt(order.price); // সর্বমোট টাকা
    const discount = parseInt(order.discountAmount || 0); // ডিসকাউন্ট (যা ১টি পণ্যে দেওয়া হয়েছে)
    
    // ২. ডাইনামিক ডেলিভারি চার্জ নির্ধারণ (পরিমাণ অনুযায়ী)
    let delivery = 150;
    if (qty >= 4 && qty <= 5) delivery = 200;
    else if (qty >= 6 && qty <= 7) delivery = 250;
    else if (qty >= 8 && qty <= 9) delivery = 300;
    else if (qty === 10) delivery = 350;

    // ৩. সাবটোটাল বা আসল পণ্যের দাম বের করা
    // মোট দাম = (ইউনিট প্রাইস * পরিমাণ) - ডিসকাউন্ট + ডেলিভারি
    // তাই, (ইউনিট প্রাইস * পরিমাণ) = ফাইনাল টোটাল + ডিসকাউন্ট - ডেলিভারি
    const totalProductValue = (finalTotal + discount) - delivery;
    const unitPrice = totalProductValue / qty;

    const invoiceHTML = `
        <!DOCTYPE html>
        <html lang="bn">
        <head>
            <meta charset="UTF-8">
            <title>Invoice - ${order.id}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #334155; line-height: 1.6; background: #f1f5f9; }
                .invoice-card { background: #fff; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 800px; margin: auto; position: relative; overflow: hidden; }
                .invoice-card::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 8px; background: #3b82f6; }
                
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px; }
                .logo-area h1 { margin: 0; color: #3b82f6; font-size: 28px; letter-spacing: -1px; }
                .logo-area p { margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; }
                
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
                .info-box h4 { margin: 0 0 10px 0; color: #1e293b; text-transform: uppercase; font-size: 13px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
                .info-box p { margin: 4px 0; font-size: 14px; }

                .status-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; color: white; background: ${statusColor}; margin-top: 10px; }

                .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .invoice-table th { background: #f8fafc; padding: 12px; text-align: left; font-size: 13px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                .invoice-table td { padding: 15px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
                
                .summary { margin-left: auto; width: 300px; margin-top: 20px; }
                .summary-item { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
                .summary-item.grand-total { border-top: 2px solid #f1f5f9; margin-top: 10px; padding-top: 10px; font-size: 18px; font-weight: bold; color: #1e293b; }

                .payment-stamp { position: absolute; top: 150px; right: 50px; border: 4px solid ${statusColor}; color: ${statusColor}; padding: 10px 20px; transform: rotate(-15deg); font-size: 30px; font-weight: 800; border-radius: 12px; opacity: 0.2; pointer-events: none; text-transform: uppercase; }
                
                .footer { margin-top: 50px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; color: #94a3b8; font-size: 12px; }
                .print-btn { background: #3b82f6; color: white; border: none; padding: 10px 30px; border-radius: 8px; cursor: pointer; font-weight: 600; margin-top: 20px; transition: 0.3s; }
                .print-btn:hover { background: #2563eb; }

                @media print { .print-btn { display: none; } body { background: white; padding: 0; } .invoice-card { box-shadow: none; border: none; } }
            </style>
        </head>
        <body>
            <div class="invoice-card">
                <div class="payment-stamp">${isPaid ? 'PAID' : 'UNPAID'}</div>

                <div class="header">
                    <div class="logo-area">
                        <h1>Digital Shop TM</h1>
                        <p>Your Trusted Online Marketplace</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin:0; color:#1e293b;">INVOICE</h2>
                        <p style="margin:0; font-size:14px; color:#64748b;">Order ID: #${order.id}</p>
                        <p style="margin:0; font-size:14px; color:#64748b;">Date: ${new Date(order.date || Date.now()).toLocaleDateString('bn-BD')}</p>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-box">
                        <h4>বিলেবল গ্রাহক (Bill To):</h4>
                        <p><strong>${order.customerName}</strong></p>
                        <p>ফোন: ${order.customerPhone}</p>
                        <p>ঠিকানা: ${order.address || 'উল্লেখ্য নেই'}</p>
                    </div>
                    <div class="info-box">
                        <h4>পেমেন্ট ইনফো:</h4>
                        <p>পদ্ধতি: ${order.paymentMethod === 'COD' ? 'ক্যাশ অন ডেলিভারি' : 'অনলাইন পেমেন্ট'}</p>
                        <p>ট্রানজেকশন আইডি: ${order.trxId || 'N/A'}</p>
                        <div class="status-badge">${statusText}</div>
                    </div>
                </div>

                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th>পণ্যের বিবরণ</th>
                            <th style="text-align: center;">পরিমাণ (Qty)</th>
                            <th style="text-align: right;">ইউনিট মূল্য</th>
                            <th style="text-align: right;">মোট</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <strong>${order.productName}</strong><br>
                                <small style="color: #64748b;">ক্যাটাগরি: ${order.category || 'জেনারেল'}</small>
                            </td>
                            <td style="text-align: center;">${qty} পিস</td>
                            <td style="text-align: right;">${SYSTEM_CONFIG.CURRENCY} ${unitPrice.toFixed(0)}</td>
                            <td style="text-align: right;">${SYSTEM_CONFIG.CURRENCY} ${totalProductValue.toFixed(0)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="summary">
                    <div class="summary-item">
                        <span>পণ্যের মোট দাম:</span>
                        <span>${SYSTEM_CONFIG.CURRENCY} ${totalProductValue.toFixed(0)}</span>
                    </div>
                    <div class="summary-item">
                        <span>ডেলিভারি চার্জ (${qty} পিস):</span>
                        <span>${SYSTEM_CONFIG.CURRENCY} ${delivery}</span>
                    </div>
                    ${discount > 0 ? `
                    <div class="summary-item" style="color: #ef4444;">
                        <span>ডিসকাউন্ট (১টি পণ্যে):</span>
                        <span>- ${SYSTEM_CONFIG.CURRENCY} ${discount}</span>
                    </div>` : ''}
                    <div class="summary-item grand-total">
                        <span>সর্বমোট প্রদেয়:</span>
                        <span>${SYSTEM_CONFIG.CURRENCY} ${finalTotal}</span>
                    </div>
                </div>

                <div class="footer">
                    <p>Digital Shop TM - এ শপিং করার জন্য আপনাকে ধন্যবাদ।</p>
                    <p>এটি একটি কম্পিউটার জেনারেটেড ইনভয়েস, কোনো স্বাক্ষর প্রয়োজন নেই।</p>
                    <button class="print-btn" onclick="window.print()">Download & Print Invoice</button>
                </div>
            </div>
        </body>
        </html>
    `;

    invoiceWindow.document.write(invoiceHTML);
    invoiceWindow.document.close();
}
// ১. স্টোরেজ ক্যালকুলেটর (ফাইল এর নিচে যোগ করুন)
function checkStorageUsage() {
    let total = 0;
    for (let x in localStorage) {
        if (!localStorage.hasOwnProperty(x)) continue;
        total += ((localStorage[x].length + x.length) * 2);
    }
    const limit = 5242880;
    const usedMB = (total / (1024 * 1024)).toFixed(2);
    const percentage = ((total / limit) * 100).toFixed(2);
    return { usedMB, percentage };
}

// ২. স্টোরেজ বার রেন্ডারার (Advanced IndexedDB Version)
function renderStorageMonitor(container) {
    if (!container) return;

    // লোডিং অবস্থা দেখানো
    container.innerHTML = `
        <div style="text-align:center; padding: 30px; color: #64748b;">
            <i class="fa fa-spinner fa-spin" style="font-size: 28px; color: #3498db; margin-bottom: 12px; display:block;"></i>
            <span style="font-size: 13px;">IndexedDB স্ক্যান করা হচ্ছে...</span>
        </div>
    `;

    // IndexedDB থেকে রিয়েল ডাটা পড়া
    const idbAvailable = window._TMDB && typeof window._TMDB.getAllEntries === 'function';

    function buildUI(entries) {
        const keys = Object.keys(entries);
        let totalBytes = 0;
        const rows = [];

        // DB_KEYS থেকে label ম্যাপ
        const labelMap = {
            [DB_KEYS.USERS]:            { label: 'ইউজার ডাটা',       icon: 'fa-users',        color: '#3498db' },
            [DB_KEYS.PRODUCTS]:         { label: 'পণ্য ডাটা',         icon: 'fa-box',          color: '#9b59b6' },
            [DB_KEYS.ORDERS]:           { label: 'অর্ডার ডাটা',       icon: 'fa-shopping-bag', color: '#e67e22' },
            [DB_KEYS.RETURNS]:          { label: 'রিটার্ন ডাটা',      icon: 'fa-undo',         color: '#e74c3c' },
            [DB_KEYS.ADS]:              { label: 'বিজ্ঞাপন ডাটা',     icon: 'fa-bullhorn',     color: '#f39c12' },
            [DB_KEYS.GLOBAL_DISCOUNTS]: { label: 'ডিসকাউন্ট কার্ড',  icon: 'fa-tag',          color: '#1abc9c' },
            [DB_KEYS.SESSION]:          { label: 'সেশন ডাটা',         icon: 'fa-user-circle',  color: '#2ecc71' },
            [DB_KEYS.THEME]:            { label: 'থিম সেটিং',         icon: 'fa-palette',      color: '#8e44ad' },
            [DB_KEYS.PRODUCT_LIMITS]:   { label: 'লোড লিমিট',         icon: 'fa-sliders-h',    color: '#16a085' },
            'sironam_list':             { label: 'সিরোনাম ক্যাটাগরি', icon: 'fa-layer-group',  color: '#2980b9' },
            'user_cart':                { label: 'কার্ট ডাটা',         icon: 'fa-shopping-cart',color: '#27ae60' },
            'beli_left':                { label: 'বেলি বোর্ড (বাম)',   icon: 'fa-ad',           color: '#c0392b' },
            'beli_right':               { label: 'বেলি বোর্ড (ডান)',   icon: 'fa-ad',           color: '#c0392b' },
            'digital_shop_user_address':{ label: 'ঠিকানা ডাটা',       icon: 'fa-map-marker-alt',color: '#d35400' },
            'user_profile_pic':         { label: 'প্রোফাইল ছবি',      icon: 'fa-image',        color: '#7f8c8d' },
            'special_requests':         { label: 'বিশেষ অনুরোধ',      icon: 'fa-comment-dots', color: '#2c3e50' },
        };

        keys.forEach(key => {
            const val = entries[key] || '';
            const bytes = (val.length + key.length) * 2;
            totalBytes += bytes;
            const info = labelMap[key] || { label: key, icon: 'fa-database', color: '#636e72' };
            rows.push({ key, bytes, ...info });
        });

        // বড় থেকে ছোট সাজানো
        rows.sort((a, b) => b.bytes - a.bytes);

        const totalKB    = (totalBytes / 1024).toFixed(1);
        const totalMB    = (totalBytes / (1024 * 1024)).toFixed(3);
        const idbLimitMB = 500;
        const pct        = Math.min((totalBytes / (idbLimitMB * 1024 * 1024)) * 100, 100).toFixed(2);
        const barColor   = pct < 30 ? '#2ecc71' : pct < 70 ? '#f39c12' : '#e74c3c';

        let rowsHTML = rows.map(r => {
            const kb     = (r.bytes / 1024).toFixed(2);
            const rowPct = totalBytes > 0 ? ((r.bytes / totalBytes) * 100).toFixed(1) : 0;
            return `
                <div style="display:flex; align-items:center; gap:10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
                    <div style="width:32px; height:32px; border-radius:8px; background:${r.color}22; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="fa ${r.icon}" style="color:${r.color}; font-size:13px;"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:12px; color:#cbd5e1; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.label}</div>
                        <div style="height:4px; background:rgba(255,255,255,0.06); border-radius:4px; margin-top:4px;">
                            <div style="width:${rowPct}%; height:100%; background:${r.color}; border-radius:4px;"></div>
                        </div>
                    </div>
                    <div style="text-align:right; flex-shrink:0;">
                        <div style="font-size:12px; color:#94a3b8;">${kb} KB</div>
                        <div style="font-size:10px; color:#475569;">${rowPct}%</div>
                    </div>
                </div>
            `;
        }).join('');

        if (rows.length === 0) {
            rowsHTML = `<div style="text-align:center; padding:20px; color:#475569; font-size:13px;"><i class="fa fa-inbox" style="font-size:24px; margin-bottom:8px; display:block; opacity:0.3;"></i>ডাটাবেসে কোনো ডাটা নেই</div>`;
        }

        container.innerHTML = `
            <div style="font-family: 'Hind Siliguri', sans-serif;">

                <!-- মেইন সামারি -->
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:18px;">
                    <div style="background:rgba(52,152,219,0.1); border:1px solid rgba(52,152,219,0.2); border-radius:12px; padding:12px; text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:#3498db;">${totalKB} KB</div>
                        <div style="font-size:10px; color:#64748b; margin-top:2px;">মোট ব্যবহার</div>
                    </div>
                    <div style="background:rgba(46,204,113,0.1); border:1px solid rgba(46,204,113,0.2); border-radius:12px; padding:12px; text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:#2ecc71;">${keys.length}</div>
                        <div style="font-size:10px; color:#64748b; margin-top:2px;">মোট কী</div>
                    </div>
                    <div style="background:rgba(155,89,182,0.1); border:1px solid rgba(155,89,182,0.2); border-radius:12px; padding:12px; text-align:center;">
                        <div style="font-size:20px; font-weight:700; color:#9b59b6;">${totalMB} MB</div>
                        <div style="font-size:10px; color:#64748b; margin-top:2px;">MB-তে</div>
                    </div>
                </div>

                <!-- প্রোগ্রেস বার -->
                <div style="margin-bottom:18px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <span style="font-size:11px; color:#94a3b8;"><i class="fa fa-database" style="margin-right:4px; color:#3498db;"></i>IndexedDB ব্যবহার</span>
                        <span style="font-size:11px; color:#94a3b8;">${pct}% ব্যবহৃত</span>
                    </div>
                    <div style="width:100%; height:10px; background:rgba(255,255,255,0.07); border-radius:10px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:10px; transition:width 0.6s ease;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:4px;">
                        <span style="font-size:10px; color:#475569;">0 MB</span>
                        <span style="font-size:10px; color:#475569;">সীমা: ~${idbLimitMB}+ MB</span>
                    </div>
                </div>

                <!-- কী-ভিত্তিক বিস্তারিত -->
                <div style="background:rgba(0,0,0,0.2); border-radius:12px; padding:14px; border:1px solid rgba(255,255,255,0.04);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:12px; color:#94a3b8; font-weight:600;"><i class="fa fa-list" style="margin-right:5px;"></i>ডাটা বিস্তারিত</span>
                        <button onclick="renderStorageMonitor(document.getElementById('storageStatusArea'))"
                            style="background:rgba(52,152,219,0.15); color:#3498db; border:1px solid rgba(52,152,219,0.3); border-radius:8px; padding:4px 10px; font-size:11px; cursor:pointer;">
                            <i class="fa fa-sync-alt" style="margin-right:3px;"></i>রিফ্রেশ
                        </button>
                    </div>
                    ${rowsHTML}
                </div>

                <!-- ইনফো নোট -->
                <div style="margin-top:12px; padding:10px 14px; background:rgba(52,152,219,0.05); border:1px solid rgba(52,152,219,0.1); border-radius:10px;">
                    <p style="font-size:11px; color:#64748b; margin:0; line-height:1.7;">
                        <i class="fa fa-info-circle" style="color:#3498db; margin-right:5px;"></i>
                        IndexedDB ব্যবহার করায় সীমা এখন <strong style="color:#2ecc71;">localStorage-এর 5MB</strong> থেকে বেড়ে <strong style="color:#3498db;">500MB+</strong> হয়েছে।
                        ডাটা ব্রাউজার ক্লিয়ার না করলে হারাবে না।
                    </p>
                </div>
            </div>
        `;
    }

    if (idbAvailable) {
        window._TMDB.getAllEntries()
            .then(entries => buildUI(entries))
            .catch(() => {
                buildUI(window._TM_CACHE || {});
            });
    } else if (window._TM_CACHE) {
        buildUI(window._TM_CACHE);
    } else {
        const stats = checkStorageUsage();
        container.innerHTML = `
            <div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px;">
                <i class="fa fa-exclamation-triangle" style="color:#f39c12; font-size:22px; margin-bottom:8px; display:block;"></i>
                IndexedDB শিম লোড হয়নি<br>
                <small>localStorage ব্যবহার: ${stats.usedMB} MB / 5 MB</small>
            </div>
        `;
    }
}

// ৩. ইনভয়েস জেনারেটর (আগে দেওয়া খণ্ড ৮ এর কোডটি এখানে দিন)
// (আমি কোডটি ছোট করে দিলাম যাতে এরর না আসে)



/**
 * খণ্ড ৯: কাস্টমার অর্ডার হিস্ট্রি এবং ইনভয়েস এক্সেস
 * এটি কাস্টমারের প্রোফাইল ট্যাবে দেখাবে।
 */
function renderCustomerOrders(container) {
    const myOrders = appState.orders.filter(o => (appState.currentUser.mobile && o.customerPhone === appState.currentUser.mobile) || (appState.currentUser.id && String(o.userId) === String(appState.currentUser.id)));
    
    // মেইন লেআউটকে ছোট এবং মাঝখানে নিয়ে আসা হয়েছে
    let html = `
        <div style="display: flex; justify-content: center; align-items: flex-start; padding: 20px; min-height: 80vh; font-family: 'Hind Siliguri', sans-serif; animation: fadeIn 0.3s ease;">
            
            <div style="width: 100%; max-width: 500px; background: #1e293b; border-radius: 24px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); max-height: 85vh; overflow-y: auto;">
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; position: sticky; top: 0; background: #1e293b; padding-bottom: 15px; z-index: 10; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <h3 style="margin:0; font-size: 17px; color: #fff; display: flex; align-items: center; gap: 8px;">
                        <i class="fa fa-history" style="color: #3498db;"></i> অর্ডার হিস্ট্রি
                    </h3>
                    <button onclick="window.location.reload()" style="background: rgba(231, 76, 60, 0.1); color:#e74c3c; border: none; width: 30px; height: 30px; border-radius: 50%; cursor:pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: 0.3s;">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
    `;

    if (myOrders.length === 0) {
        html += `
            <div style="text-align:center; padding:40px 10px; color: #94a3b8;">
                <i class="fa fa-folder-open" style="font-size: 40px; margin-bottom: 15px; opacity: 0.2;"></i>
                <p>আপনি এখনো কোনো অর্ডার করেননি।</p>
                <button onclick="window.location.reload()" style="margin-top: 15px; background:#3498db; color:white; border:none; padding:10px 20px; border-radius:10px; cursor:pointer; font-weight: 600;">শপ-এ ফিরুন</button>
            </div>
        `;
    } else {
        myOrders.reverse().forEach(order => {
            let statusColor = '#f39c12';
            if (order.status === 'Confirmed' || order.status === 'ডেলিভারি সম্পন্ন') statusColor = '#22c55e';
            if (order.status === 'Cancelled' || order.status === 'বাতিল') statusColor = '#ef4444';

            html += `
                <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.05); padding: 15px; margin-bottom: 12px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                            <span style="font-size: 10px; color: #64748b; font-weight: bold;">ID: #${order.id}</span>
                            <span style="font-size: 10px; color: ${statusColor}; font-weight: 800;">● ${order.status}</span>
                        </div>
                        <strong style="color: #fff; font-size: 14px; display: block;">${order.productName}</strong>
                        <p style="margin: 3px 0 0; font-size: 15px; font-weight: 800; color: #2ecc71;">${order.price} ৳</p>
                    </div>
                    
                    <button onclick="generateInvoice('${order.id}')" style="background: #3498db; color: #fff; border: none; padding: 8px 12px; border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: bold; transition: 0.2s;">
                        <i class="fa fa-file-invoice"></i> রশিদ
                    </button>
                </div>
            `;
        });
    }

    html += `
            <p style="text-align: center; color: #475569; font-size: 10px; margin-top: 15px; letter-spacing: 1px;">Digital Shop TM</p>
        </div>
    </div>
    <style>
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        /* কাস্টম স্ক্রলবার ডিজাইন */
        div::-webkit-scrollbar { width: 5px; }
        div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    </style>
    `;
    container.innerHTML = html;
}
/**
 * কাস্টমারের অর্ডার লিস্ট ওপেন করার মেইন ফাংশন
 */
function openMyOrders() {
    // আপনার মেইন কন্টেইনারের আইডি (সাধারণত mainContainer বা appArea হয়)
    const container = document.getElementById('adminMainContainer') || document.getElementById('mainContainer'); 
    
    if (!container) {
        alert("কন্টেইনার পাওয়া যায়নি!");
        return;
    }

    // কন্টেইনার খালি করে খণ্ড ৯ রেন্ডার করা
    container.innerHTML = '<div style="text-align:center; padding:20px;">অর্ডার লোড হচ্ছে...</div>';
    
    setTimeout(() => {
        renderCustomerOrders(container);
    }, 300);
}
function openUserOrders() {
    const dropdown = document.getElementById('userDropdownMenu');
    if (dropdown) dropdown.style.display = 'none';

    let orderModal = document.getElementById('dynamicOrderModal');
    if (!orderModal) {
        orderModal = document.createElement('div');
        orderModal.id = 'dynamicOrderModal';
        document.body.appendChild(orderModal);
    }

    orderModal.innerHTML = `
        <div id="orderOverlay" onclick="closeOrderModal()" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 1000000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px);">
            <div id="orderContent" onclick="event.stopPropagation()" style="background: #0f172a; width: 90%; max-width: 600px; max-height: 85vh; overflow-y: auto; border-radius: 20px; border: 1px solid #334155; position: relative; padding: 20px; animation: modalSlideUp 0.3s ease;">
                <button onclick="closeOrderModal()" style="position: absolute; right: 15px; top: 15px; background: #1e293b; border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;">&times;</button>
                <div id="orderDataArea">
                    <div style="text-align: center; padding: 40px;"><div class="loader-spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    window.closeOrderModal = function() { orderModal.innerHTML = ''; };

    setTimeout(() => {
        const dataArea = document.getElementById('orderDataArea');
        if (!appState.currentUser) {
            dataArea.innerHTML = `<div style="text-align:center; color:#fff; padding:30px;"><h3>আগে লগইন করুন</h3></div>`;
            return;
        }

        const myOrders = appState.orders.filter(o => (appState.currentUser.mobile && String(o.customerPhone) === String(appState.currentUser.mobile)) || (appState.currentUser.id && String(o.userId) === String(appState.currentUser.id)));

        if (myOrders.length === 0) {
            dataArea.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:30px;"><h3>কোনো অর্ডার পাওয়া যায়নি!</h3></div>`;
            return;
        }

        // রিটার্ন ডাটা লোড করা (চেক করার জন্য যে কোন অর্ডারে রিটার্ন করা হয়েছে)
        const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
        const allReturns = JSON.parse(localStorage.getItem(RETURN_KEY)) || [];

        let html = `<h3 style="color: #fff; margin-bottom: 20px;"><i class="fa fa-shopping-bag" style="color:#6366f1"></i> আমার অর্ডারসমূহ (${myOrders.length})</h3>`;

        myOrders.reverse().forEach(order => {
            const isDelivered = (order.status === 'Delivered' || order.status === 'ডেলিভারি সম্পন্ন');
            
            // --- নতুন লজিক: চেক করা হচ্ছে এই অর্ডারের বিপরীতে কোনো রিটার্ন রিকোয়েস্ট অলরেডি আছে কি না ---
            const hasRequestedReturn = allReturns.some(ret => String(ret.orderId) === String(order.id));

            html += `
                <div class="user-order-card" style="background: #1e293b; border: 1px solid #334155; border-radius: 15px; padding: 18px; margin-bottom: 15px; color: #fff;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <span style="font-size: 10px; color: #94a3b8; font-weight: bold;">ID: #${order.id}</span>
                            <h4 style="margin: 5px 0; color: #f8fafc; font-size: 15px;">${order.productName}</h4>
                        </div>
                        <span style="background: ${isDelivered ? 'rgba(39, 174, 96, 0.2)' : 'rgba(243, 156, 18, 0.2)'}; color: ${isDelivered ? '#2ecc71' : '#f39c12'}; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: bold;">
                            ${order.status}
                        </span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                        <span style="color: #2ecc71; font-weight: 800; font-size: 18px;">${order.price} ৳</span>
                        
                        <div style="display: flex; gap: 6px;">
                            <button onclick="generateInvoice('${order.id}')" style="background: #0f172a; color: #3498db; border: 1px solid #3498db; padding: 6px 10px; border-radius: 8px; font-size: 11px; cursor: pointer;">রশিদ</button>
                            
                            ${(isDelivered && !hasRequestedReturn) ? `
                            <button onclick="openReturnModal('${order.id}')" style="background: #450a0a; color: #f87171; border: 1px solid #f87171; padding: 6px 10px; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer;">রিটার্ন</button>
                            ` : (hasRequestedReturn ? '<span style="color:#94a3b8; font-size:11px; font-style:italic;">রিটার্ন করা হয়েছে</span>' : '')}

                            <button onclick="viewUserOrderDetails('${order.id}')" style="background: #3498db; color: white; border: none; padding: 7px 14px; border-radius: 8px; font-size: 11px; cursor: pointer;">বিস্তারিত</button>
                        </div>
                    </div>
                </div>
            `;
        });

        dataArea.innerHTML = html;
    }, 500);
}




function openReturnModal(orderId) {
    // ১. ডুপ্লিকেট রিকোয়েস্ট চেক
    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
    const allReturns = JSON.parse(localStorage.getItem(RETURN_KEY)) || [];
    const alreadyExists = allReturns.some(ret => String(ret.orderId) === String(orderId));

    if (alreadyExists) {
        alert("⚠️ আপনি এই অর্ডারের জন্য ইতিমধ্যে একটি রিটার্ন রিকোয়েস্ট করেছেন!");
        return;
    }

    // ২. অর্ডার খুঁজে বের করা
    const order = appState.orders.find(o => String(o.id) === String(orderId));
    if (!order) return alert("অর্ডার পাওয়া যায়নি!");

    const modalHtml = `
    <div id="returnModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.85); display:flex; align-items:center; justify-content:center; z-index:999999999; backdrop-filter: blur(15px); font-family: 'Inter', sans-serif; padding: 15px;">
        <div style="background:#fff; width:100%; max-width:420px; max-height: 92vh; border-radius:32px; display:flex; flex-direction:column; box-shadow:0 50px 100px -20px rgba(0,0,0,0.6); animation: modalPopUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); position:relative; overflow:hidden; border: 1px solid rgba(255,255,255,0.3);">
            
            <div style="background: linear-gradient(90deg, #fff7ed, #ffedd5); padding: 12px 20px; border-bottom: 1px solid #fed7aa; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa fa-info-circle" style="color: #f97316; font-size: 14px;"></i>
                <span style="font-size: 11px; color: #9a3412; font-weight: 700;">ছবি আপলোড করতে না পারলে <a href="https://wa.me/8801822963824" target="_blank" style="color: #ea580c; text-decoration: underline; font-weight: 800;">এখানে যোগাযোগ করুন</a></span>
            </div>

            <div style="padding: 15px 24px; background: #fff; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="background:linear-gradient(135deg, #ef4444, #b91c1c); width:36px; height:36px; border-radius:12px; display:flex; align-items:center; justify-content:center;">
                        <i class="fa fa-undo" style="color:#fff; font-size:13px;"></i>
                    </div>
                    <div>
                        <h3 style="margin:0; color:#0f172a; font-size:16px; font-weight:800;">রিটার্ন পোর্টাল</h3>
                        <p style="margin:0; font-size:10px; color:#94a3b8; font-weight:600;">অর্ডার: #${orderId}</p>
                    </div>
                </div>
                <button onclick="document.getElementById('returnModal').remove()" style="width:30px; height:30px; background:#f1f5f9; border:none; border-radius:50%; cursor:pointer; color:#64748b; font-size:18px;">&times;</button>
            </div>

            <div class="custom-modal-body" style="padding: 20px 24px; overflow-y: auto; flex: 1; scroll-behavior: smooth;">
                
                <div style="margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <label style="font-size:13px; font-weight:700; color:#334155;">প্রমাণস্বরূপ ছবি</label>
                        <button onclick="addNewImageInput()" style="font-size:11px; color:#3b82f6; border:1px solid #3b82f6; background:#eff6ff; padding:6px 12px; border-radius:10px; cursor:pointer; font-weight:700;">
                            <i class="fa fa-plus-circle"></i> আরো ছবি যোগ করুন
                        </button>
                    </div>

                    <div id="imageInputsContainer">
                        <div class="img-input-group" style="margin-bottom:14px; background:#f8fafc; border:2px solid #e2e8f0; border-radius:16px; padding:14px;">
                            
                            <!-- ফাইল আপলোড বাটন -->
                            <div style="margin-bottom:10px;">
                                <label style="display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; padding:10px 16px; border-radius:12px; cursor:pointer; font-size:13px; font-weight:700; text-align:center;">
                                    <i class="fa fa-upload"></i> ফাইল থেকে ছবি আপলোড করুন
                                    <input type="file" accept="image/*" class="return-img-file" style="display:none;" onchange="uploadReturnImageFile(this)">
                                </label>
                                <div class="img-upload-status" style="display:none; margin-top:8px; font-size:12px; color:#6366f1; font-weight:600; text-align:center;">
                                    <i class="fa fa-spinner fa-spin"></i> আপলোড হচ্ছে...
                                </div>
                            </div>

                            <!-- OR divider -->
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                                <div style="flex:1; height:1px; background:#e2e8f0;"></div>
                                <span style="font-size:11px; color:#94a3b8; font-weight:600;">অথবা লিংক দিন</span>
                                <div style="flex:1; height:1px; background:#e2e8f0;"></div>
                            </div>

                            <!-- লিংক input -->
                            <input type="url" class="return-image-url" placeholder="ছবির ডিরেক্ট লিংক দিন..." 
                                style="width:100%; padding:11px 14px; border:2px solid #e2e8f0; border-radius:12px; outline:none; font-size:12px; background:#fff; box-sizing:border-box;"
                                oninput="previewSingleImage(this)">

                            <!-- Preview -->
                            <div class="single-preview" style="margin-top:10px; display:none;">
                                <div style="width:80px; height:80px; border-radius:12px; overflow:hidden; border:2px solid #6366f1;">
                                    <img src="" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                                <span class="preview-ok" style="display:block; font-size:11px; color:#10b981; font-weight:700; margin-top:4px;"><i class="fa fa-check-circle"></i> ছবি প্রস্তুত</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:700; color:#334155;">বিস্তারিত কারণ</label>
                    <textarea id="returnReason" placeholder="বিস্তারিত লিখুন..." style="width:100%; padding:14px; border:2px solid #f1f5f9; border-radius:20px; font-family:inherit; resize:none; height:80px; outline:none; font-size:13px; background:#f8fafc; box-sizing: border-box;"></textarea>
                </div>

                <div style="margin-bottom:20px;">
                    <label style="display:block; margin-bottom:8px; font-size:13px; font-weight:700; color:#334155;">রিফান্ড মাধ্যম</label>
                    <select id="refundMethod" onchange="toggleRefundFields()" style="width:100%; padding:14px; border:2px solid #f1f5f9; border-radius:20px; background:#f8fafc; font-size:14px; font-weight:700;">
                        <option value="voucher">🎁 শপিং ভাউচার</option>
                        <option value="payment">📱 পার্সোনাল পেমেন্ট</option>
                    </select>
                </div>

                <div id="paymentFields" style="display:none; background:#eff6ff; padding:15px; border-radius:24px; border:1px solid #bfdbfe; margin-bottom:15px;">
                    <select id="paymentType" style="width:100%; padding:10px; border-radius:12px; border:1.5px solid #fff; margin-bottom:10px;">
                        <option value="Bkash">বিকাশ (bKash)</option>
                        <option value="Nagad">নগদ (Nagad)</option>
                    </select>
                    <input type="number" id="refundNumber" placeholder="নম্বর দিন" style="width:100%; padding:12px; border-radius:12px; border:1.5px solid #fff; width:100%; box-sizing:border-box;">
                </div>
            </div>

            <div style="padding: 18px 24px; background: #fff; border-top: 1px solid #f1f5f9;">
                <button onclick="submitReturnRequest('${orderId}')" style="width:100%; background:#0f172a; color:#fff; border:none; padding:18px; border-radius:20px; font-weight:800; cursor:pointer; font-size:16px;">সাবমিট করুন</button>
            </div>
        </div>
    </div>
    <style>
        @keyframes modalPopUp { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        .custom-modal-body::-webkit-scrollbar { width: 4px; }
        .custom-modal-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    </style>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// এই ফাংশনগুলো অবশ্যই openReturnModal এর বাইরে রাখবেন
window.addNewImageInput = function() {
    const container = document.getElementById('imageInputsContainer');
    const div = document.createElement('div');
    div.className = 'img-input-group';
    div.style.cssText = "margin-bottom:14px; background:#f8fafc; border:2px solid #e2e8f0; border-radius:16px; padding:14px; position:relative;";
    div.innerHTML = `
        <button onclick="this.parentElement.remove()" style="position:absolute; right:10px; top:10px; background:#fee2e2; border:none; color:#ef4444; width:24px; height:24px; border-radius:50%; cursor:pointer; z-index:1;">&times;</button>
        <label style="display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; padding:10px 16px; border-radius:12px; cursor:pointer; font-size:13px; font-weight:700; margin-bottom:10px;">
            <i class="fa fa-upload"></i> ফাইল থেকে আপলোড
            <input type="file" accept="image/*" class="return-img-file" style="display:none;" onchange="uploadReturnImageFile(this)">
        </label>
        <div class="img-upload-status" style="display:none; font-size:12px; color:#6366f1; font-weight:600; text-align:center; margin-bottom:8px;">
            <i class="fa fa-spinner fa-spin"></i> আপলোড হচ্ছে...
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <div style="flex:1; height:1px; background:#e2e8f0;"></div>
            <span style="font-size:11px; color:#94a3b8; font-weight:600;">অথবা লিংক</span>
            <div style="flex:1; height:1px; background:#e2e8f0;"></div>
        </div>
        <input type="url" class="return-image-url" placeholder="ছবির লিংক দিন..." 
            style="width:100%; padding:11px 14px; border:2px solid #e2e8f0; border-radius:12px; outline:none; font-size:12px; background:#fff; box-sizing:border-box;"
            oninput="previewSingleImage(this)">
        <div class="single-preview" style="margin-top:10px; display:none;">
            <div style="width:80px; height:80px; border-radius:12px; overflow:hidden; border:2px solid #6366f1;">
                <img src="" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <span style="display:block; font-size:11px; color:#10b981; font-weight:700; margin-top:4px;"><i class="fa fa-check-circle"></i> ছবি প্রস্তুত</span>
        </div>
    `;
    container.appendChild(div);
};

window.previewSingleImage = function(input) {
    const group = input.closest('.img-input-group') || input.parentElement;
    const previewDiv = group.querySelector('.single-preview');
    if (!previewDiv) return;
    const img = previewDiv.querySelector('img');
    const url = input.value.trim();
    if (url && url.startsWith('http')) {
        img.src = url;
        previewDiv.style.display = 'block';
        img.onerror = () => previewDiv.style.display = 'none';
    } else {
        previewDiv.style.display = 'none';
    }
};

// ImgBB তে ফাইল আপলোড করে URL return করে
window.uploadReturnImageFile = async function(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("❌ ছবির size সর্বোচ্চ ৫MB হতে পারবে!");
        fileInput.value = '';
        return;
    }

    const group = fileInput.closest('.img-input-group');
    const statusDiv = group ? group.querySelector('.img-upload-status') : null;
    const urlInput  = group ? group.querySelector('.return-image-url') : null;
    const previewDiv = group ? group.querySelector('.single-preview') : null;
    const previewImg = previewDiv ? previewDiv.querySelector('img') : null;

    if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> আপলোড হচ্ছে...';
    }

    try {
        // ১. File → Base64
        const base64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload  = e => res(e.target.result.split(',')[1]);
            reader.onerror = rej;
            reader.readAsDataURL(file);
        });

        // ২. ImgBB API — URL params দিয়ে (CORS issue নেই)
        const apiKey = '5be9029fcab9d8ab514eeeb3563af84d';
        const resp = await fetch(
            'https://api.imgbb.com/1/upload?key=' + apiKey,
            { method: 'POST', body: (() => { const fd = new FormData(); fd.append('image', base64); return fd; })() }
        );

        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();

        if (json.success && json.data && json.data.url) {
            const imgUrl = json.data.display_url || json.data.url;

            if (urlInput) {
                urlInput.value = imgUrl;
                urlInput.style.borderColor = '#10b981';
            }
            if (previewDiv && previewImg) {
                previewImg.src = imgUrl;
                previewDiv.style.display = 'block';
            }
            if (statusDiv) {
                statusDiv.innerHTML = '<i class="fa fa-check-circle" style="color:#10b981"></i> <span style="color:#10b981">✅ আপলোড সফল!</span>';
                setTimeout(() => { if(statusDiv) statusDiv.style.display = 'none'; }, 3000);
            }
            console.log('[ImgBB] ✅ Uploaded:', imgUrl);

        } else {
            throw new Error((json.error && json.error.message) ? json.error.message : 'Upload failed');
        }

    } catch(e) {
        console.error('[ImgBB] Error:', e.message);
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fa fa-times-circle" style="color:#ef4444"></i> <span style="color:#ef4444">আপলোড ব্যর্থ! লিংক দিয়ে চেষ্টা করুন।</span>';
            setTimeout(() => { if(statusDiv) statusDiv.style.display = 'none'; }, 4000);
        }
        fileInput.value = '';
    }
};

window.toggleRefundFields = function() {
    const methodSelect = document.getElementById('refundMethod');
    const paymentDiv = document.getElementById('paymentFields');
    
    if (methodSelect && paymentDiv) {
        if (methodSelect.value === 'payment') {
            paymentDiv.style.display = 'block';
        } else {
            paymentDiv.style.display = 'none';
        }
    }
};
function submitReturnRequest(orderId) {
    if (!orderId) return alert("❌ অর্ডার রেফারেন্স পাওয়া যায়নি!");

    const reasonElem = document.getElementById('returnReason');
    const methodElem = document.getElementById('refundMethod');
    const payTypeElem = document.getElementById('paymentType');
    const payNumElem = document.getElementById('refundNumber');

    const reason = reasonElem ? reasonElem.value.trim() : "";
    const method = methodElem ? methodElem.value : "voucher";
    const payType = payTypeElem ? payTypeElem.value : 'Mobile Banking';
    const payNum = payNumElem ? payNumElem.value.trim() : '';

    const imageInputs = document.querySelectorAll('.return-image-url');
    const imageUrls = [];
    imageInputs.forEach(input => {
        if (input.value.trim() !== "") imageUrls.push(input.value.trim());
    });

    if (!reason) { alert("❌ দয়া করে রিটার্নের কারণ লিখুন!"); return; }
    if (imageUrls.length === 0) { alert("❌ অন্তত একটি ছবির লিঙ্ক প্রদান করুন!"); return; }
    if (method === 'payment' && (!payNum || payNum.length < 11)) {
        alert("❌ সঠিক ১১ ডিজিটের মোবাইল নাম্বার দিন!"); return;
    }

    if (typeof appState === 'undefined') { alert("⚠️ সিস্টেম এরর!"); return; }
    if (!appState.returns) appState.returns = [];

    const returnData = {
        id: 'RET' + Date.now() + Math.floor(Math.random() * 1000),
        orderId: orderId,
        userId: (appState.currentUser && appState.currentUser.id) ? appState.currentUser.id : 'GUEST-' + Date.now(),
        userName: (appState.currentUser && appState.currentUser.name) ? appState.currentUser.name : 'Unknown User',
        reason: reason,
        images: imageUrls,
        image: imageUrls[0],
        refundMethod: method,
        paymentDetails: method === 'payment' ? `${payType}: ${payNum}` : 'Voucher Request',
        status: 'পেন্ডিং',
        statusHistory: [
            { text: 'রিটার্ন রিকোয়েস্ট জমা দেওয়া হয়েছে', time: new Date().toLocaleString('bn-BD') }
        ],
        messages: [],
        date: new Date().toLocaleString('bn-BD')
    };

    appState.returns.push(returnData);

    const orderIndex = appState.orders.findIndex(o => String(o.id) === String(orderId));
    if (orderIndex !== -1) {
        appState.orders[orderIndex].isReturned = true;
        appState.orders[orderIndex].returnId = returnData.id;
        appState.orders[orderIndex].returnStatus = 'পেন্ডিং';
    }

    // ── localStorage সেভ ──
    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'TM_DB_RETURNS_V2';
    const ORDER_KEY  = (typeof DB_KEYS !== 'undefined' && DB_KEYS.ORDERS)  ? DB_KEYS.ORDERS  : 'TM_DB_ORDERS_V2';
    try {
        if (typeof saveData === 'function') {
            saveData(RETURN_KEY, appState.returns);
            saveData(ORDER_KEY, appState.orders);
        } else {
            localStorage.setItem(RETURN_KEY, JSON.stringify(appState.returns));
            localStorage.setItem(ORDER_KEY,  JSON.stringify(appState.orders));
        }
    } catch(e) {}

    // ── Firebase এ সরাসরি save — reload এর আগেই await করি ──
    const modal = document.getElementById('returnModal');
    if (modal) modal.remove();

    function _doReload() { setTimeout(() => location.reload(), 300); }

    if (typeof firebase !== 'undefined' && firebase.firestore) {
        const fdb = firebase.firestore();
        const retSave   = fdb.collection('returns').doc(String(returnData.id)).set(returnData);
        const orderSave = (orderIndex !== -1)
            ? fdb.collection('orders').doc(String(orderId)).set(appState.orders[orderIndex])
            : Promise.resolve();

        Promise.all([retSave, orderSave])
            .then(() => {
                console.log('[FB] ✅ Return + Order saved to Firebase:', returnData.id);
                alert("✅ রিটার্ন রিকোয়েস্ট সফলভাবে জমা হয়েছে।");
                _doReload();
            })
            .catch(e => {
                console.warn('[FB] return save err:', e.message);
                alert("✅ রিটার্ন জমা হয়েছে (অফলাইন মোড)।");
                _doReload();
            });
    } else {
        alert("✅ রিটার্ন রিকোয়েস্ট জমা হয়েছে।");
        _doReload();
    }
}
// এডমিন প্যানেলে রিটার্ন লিস্ট দেখানোর সঠিক ফাংশন
function renderAdminReturnList(container) {
    const listArea = container || document.getElementById('adminMainContainer');
    if(!listArea) return;

    // ডাটা রিফ্রেশ করা (saveData থেকে লোড করা)
    const allReturns = appState.returns || [];

    let html = '<div style="padding:20px;"><h3 style="color:#fff; margin-bottom:20px;"><i class="fa fa-undo"></i> রিটার্ন ইউজার পার্সেল</h3>';
    
    if (allReturns.length === 0) {
        html += '<p style="color:#888; text-align:center; padding:40px;">বর্তমানে কোনো রিটার্ন রিকোয়েস্ট নেই।</p>';
    } else {
        // নতুন রিটার্ন সবার আগে দেখাবে
        [...allReturns].reverse().forEach(ret => {
            html += `
            <div onclick="openAdminReturnDetail('${ret.id}')" style="background:#1e293b; padding:15px; margin-bottom:12px; border-radius:12px; border-left:5px solid #e74c3c; cursor:pointer; transition:0.3s; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <p style="color:#fff; margin:0;"><b>ID:</b> ${ret.id}</p>
                    <span style="background:#e74c3c; color:#fff; font-size:10px; padding:3px 8px; border-radius:20px;">${ret.statusHeader}</span>
                </div>
                <p style="color:#cbd5e1; margin:5px 0; font-size:14px;"><b>গ্রাহক:</b> ${ret.userName}</p>
                <p style="color:#94a3b8; margin:0; font-size:12px;">অর্ডার আইডি: ${ret.orderId}</p>
            </div>`;
        });
    }
    html += '</div>';
    listArea.innerHTML = html;
}
function openAdminReturnDetail(retId) {
    const existingModal = document.getElementById('adminRetModal');
    if (existingModal) existingModal.remove();

    const ret = appState.returns.find(r => r.id === retId);
    if (!ret) return alert("রেকর্ড পাওয়া যায়নি!");

    const order = appState.orders.find(o => o.id === ret.orderId) || {};
    
    // ১. আপনার openProductDetails এর লজিক অনুযায়ী প্রোডাক্ট খুঁজে বের করা
    const item = appState.products.find(p => p.id == (order.productId || ret.productId));
    
    // ২. ইমেজ প্রসেসিং (আপনার দেওয়া লজিক হুবহু এখানে কাজ করবে)
    let productImageUrl = '';
    
    if (item) {
        // যদি মেইন প্রোডাক্ট লিস্টে পাওয়া যায়, তবে আপনার লজিক অনুযায়ী ইমেজ সেট হবে
        const images = Array.isArray(item.images) ? item.images : [item.images || item.image || 'https://placehold.co/150x150?text=No+Image'];
        productImageUrl = images[0]; 
    } else {
        // যদি মেইন ডাটাবেসে না পাওয়া যায়, তবে SKU দিয়ে পাথ তৈরি করবে (ব্যাকআপ হিসেবে)
        const productSKU = order.sku || ret.sku || '';
        productImageUrl = productSKU ? `images/products/${productSKU}.jpg` : 'https://placehold.co/150x150?text=Digital+Shop';
    }

    const productSKUDisplay = item ? item.sku : (order.sku || 'N/A');
    const productID = order.productId || ret.productId || order.id;

    const modalHtml = `
    <style>
        .admin-scroll::-webkit-scrollbar { width: 6px; }
        .admin-scroll::-webkit-scrollbar-track { background: transparent; }
        .admin-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        #returnChatBox::-webkit-scrollbar { width: 5px; }
        #returnChatBox::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        
        .product-card-box { 
            background: #fff; padding: 15px; border-radius: 24px; border: 1.5px solid #e2e8f0; 
            transition: all 0.3s ease; cursor: pointer; margin-bottom: 25px;
        }
        .product-card-box:hover { 
            transform: translateY(-3px); border-color: #38bdf8 !important; box-shadow: 0 10px 25px rgba(0,0,0,0.05); 
        }
    </style>

    <div id="adminRetModal" class="modal-overlay" style="display:flex; z-index:9999999; background:rgba(15, 23, 42, 0.95); position:fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center; backdrop-filter: blur(12px);">
        <div class="modal-box" style="background:#fff; width:95%; max-width:1050px; border-radius:32px; overflow:hidden; max-height:92vh; display:flex; flex-direction:column; box-shadow: 0 50px 100px rgba(0,0,0,0.6);">
            
            <div style="background: linear-gradient(135deg, #1e293b, #334155); padding:20px 35px; display:flex; justify-content:space-between; align-items:center; color:#fff;">
                <div>
                    <h3 style="margin:0; font-size:20px; font-weight:700; display:flex; align-items:center; gap:12px;">
                        <i class="fa fa-shield-check" style="color:#38bdf8;"></i> রিটার্ন কন্ট্রোল সেন্টার
                    </h3>
                    <p style="margin:4px 0 0; font-size:11px; color:#94a3b8; letter-spacing:1px;">REFERENCE ID: ${ret.id}</p>
                </div>
                <div style="display:flex; gap:15px; align-items:center;">
                    <button onclick="deleteReturnRecord('${ret.id}')" style="background:rgba(244, 63, 94, 0.15); color:#f43f5e; border:1px solid #f43f5e33; width:42px; height:42px; border-radius:12px; cursor:pointer;"><i class="fa fa-trash-can"></i></button>
                    <button onclick="this.closest('#adminRetModal').remove()" style="background:rgba(255,255,255,0.1); color:#fff; border:none; width:42px; height:42px; border-radius:50%; cursor:pointer; font-size:24px;">&times;</button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1.1fr; overflow:hidden; flex:1; background:#f8fafc;">
                
                <div class="admin-scroll" style="padding:25px; overflow-y:auto; border-right:1px solid #e2e8f0;">
                    <h4 style="margin:0 0 15px; color:#1e293b; font-size:13px; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                        <span style="width:4px; height:18px; background:#38bdf8; border-radius:10px;"></span> অর্ডার ও প্রোডাক্ট
                    </h4>
                    
                    <div class="product-card-box" onclick="openProductBySKU('${productSKUDisplay}', '${productID}')">
                        <div style="display:flex; gap:15px; align-items:center;">
                            <div style="width:75px; height:75px; min-width:75px; background:#f1f5f9; border-radius:18px; overflow:hidden; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center;">
                                <img src="${productImageUrl}" onerror="this.src='https://placehold.co/150x150?text=IMG+Error'" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                            <div style="flex:1;">
                                <b style="color:#1e293b; display:block; font-size:15px; margin-bottom:4px;">${order.productName || ret.productName || 'পণ্যটির তথ্য লোড হচ্ছে...'}</b>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="color:#64748b; font-size:12px; font-family:monospace; background:#f1f5f9; padding:2px 6px; border-radius:6px;">SKU: ${productSKUDisplay}</span>
                                    <b style="color:#059669; font-size:15px;">৳${order.price || '0'}</b>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:12px; padding-top:10px; border-top:1px dashed #e2e8f0; color:#38bdf8; font-size:11px; font-weight:700; text-align:center;">
                            পণ্যের বিস্তারিত দেখতে এখানে ক্লিক করুন <i class="fa fa-external-link"></i>
                        </div>
                    </div>

                    <h4 style="margin:0 0 15px; color:#1e293b; font-size:13px; text-transform:uppercase; display:flex; align-items:center; gap:8px;">
                        <span style="width:4px; height:18px; background:#10b981; border-radius:10px;"></span> কাস্টমার ডিটেইলস
                    </h4>
                    <div style="background:#fff; padding:15px; border-radius:20px; border:1px solid #e2e8f0; margin-bottom:20px;">
                        <div style="display:grid; gap:10px; font-size:13px;">
                            <p style="margin:0; display:flex; justify-content:space-between;"><span style="color:#64748b;">👤 নাম:</span> <b style="color:#1e293b;">${ret.userName}</b></p>
                            <p style="margin:0; display:flex; justify-content:space-between;"><span style="color:#64748b;">🆔 আইডি:</span> <b style="color:#1e293b;">#${ret.userId}</b></p>
                            <div style="margin-top:5px; padding:12px; background:#f0f9ff; border-radius:15px; border:1px solid #bae6fd;">
                                <small style="color:#0369a1; font-weight:700; display:block; margin-bottom:4px;">রিফান্ড পেমেন্ট মেথড:</small>
                                <b style="color:#1e293b;">${ret.paymentDetails || 'N/A'}</b>
                            </div>
                        </div>
                    </div>

                    <div style="background:#fff1f2; padding:15px; border-radius:18px; border-left:4px solid #f43f5e; margin-bottom:25px;">
                        <small style="color:#f43f5e; font-weight:800; display:block; margin-bottom:4px;">🚨 কাস্টমারের অভিযোগ:</small>
                        <p style="margin:0; color:#475569; font-size:13px; line-height:1.4;">${ret.reason}</p>
                    </div>
                      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.5); border-radius: 15px;">
    ${(ret.images && ret.images.length > 0) ? 
        ret.images.map(imgUrl => `
            <div style="width: 85px; height: 85px; border-radius: 12px; overflow: hidden; border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.08); cursor: zoom-in; transition: 0.3s;" 
                 onclick="window.open('${imgUrl}', '_blank')" 
                 onmouseover="this.style.transform='scale(1.05)'" 
                 onmouseout="this.style.transform='scale(1)'">
                <img src="${imgUrl}" onerror="this.src='https://placehold.co/100x100?text=IMG+Error'" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
        `).join('') 
        : 
        (ret.image ? `
            <div style="width: 85px; height: 85px; border-radius: 12px; overflow: hidden; border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.08); cursor: zoom-in;" 
                 onclick="window.open('${ret.image}', '_blank')">
                <img src="${ret.image}" onerror="this.src='https://placehold.co/100x100?text=IMG+Error'" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
        ` : '<p style="font-size:11px; color:#94a3b8; font-weight:600; margin:5px 0;">📷 কোনো ছবি পাওয়া যায়নি</p>')
    }
</div>
<small style="display:block; margin-top:5px; color:#94a3b8; font-size:10px; font-style:italic;">* ছবিতে ক্লিক করলে ফুল ভিউ দেখা যাবে</small>
                    <h4 style="margin:0 0 15px; color:#1e293b; font-size:13px; text-transform:uppercase; display:flex; align-items:center; gap:8px;">
                        <span style="width:4px; height:18px; background:#f59e0b; border-radius:10px;"></span> স্ট্যাটাস কন্ট্রোল
                    </h4>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;">
                        ${['পেন্ডিং', 'গৃহীত', 'হাবে আসার অপেক্ষায়', 'হাবে পৌঁছেছে', 'পরিক্ষা চলছে', 'পেমেন্ট চলছে', 'সফল', 'রিজেক্ট'].map(status => {
                            let color = status === 'সফল' ? '#10b981' : (status === 'রিজেক্ট' ? '#f43f5e' : '#3b82f6');
                            return `<button onclick="quickUpdateStatus('${ret.id}', '${status}')" style="padding:10px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; font-size:11px; font-weight:600; color:#475569; cursor:pointer; transition:0.2s;">
                                <span style="display:inline-block; width:6px; height:6px; background:${color}; border-radius:50%; margin-right:5px;"></span> ${status}
                            </button>`;
                        }).join('')}
                    </div>
                </div>

                <div class="admin-scroll" style="padding:25px; background:#fff; display:flex; flex-direction:column; gap:20px; overflow-y:auto;">
                    <div style="flex: 0.6;">
                        <h4 style="margin:0 0 12px; color:#1e293b; font-size:14px;">📊 টাইমলাইন</h4>
                        <div id="adminHistoryBox" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:20px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                            ${(ret.statusHistory || []).slice().reverse().map((h, index) => `
                                <div style="background:#fff; padding:10px; border-radius:12px; font-size:11px; border:1px solid #e2e8f0; display:flex; justify-content:space-between;">
                                    <div><b style="color:#1e293b;">${h.text}</b><div style="color:#94a3b8; font-size:10px;">${h.time}</div></div>
                                    <button onclick="deleteStatusHistory('${ret.id}', ${index})" style="background:none; border:none; color:#cbd5e1; cursor:pointer; font-size:16px;">&times;</button>
                                </div>
                            `).join('') || '<p style="text-align:center; color:#94a3b8; font-size:11px;">হিস্ট্রি নেই</p>'}
                        </div>
                    </div>

                    <div style="flex: 1.4; display:flex; flex-direction:column;">
                        <h4 style="margin:0 0 12px; color:#1e293b; font-size:14px;"><i class="fa fa-comments"></i> কাস্টমার মেসেজ</h4>
                        <div id="returnChatBox" style="flex:1; min-height:220px; background:#1e293b; border-radius:25px; padding:20px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
                            ${(ret.messages || []).map(m => `
                                <div style="align-self: ${m.sender === 'admin' ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                                    <div style="background:${m.sender === 'admin' ? '#3b82f6' : '#334155'}; color:#fff; padding:10px 14px; border-radius:${m.sender === 'admin' ? '15px 15px 4px 15px' : '15px 15px 15px 4px'}; font-size:12px; line-height:1.4;">
                                        ${m.text}
                                    </div>
                                    <small style="font-size:8px; color:#64748b; margin-top:4px; display:block; text-align:${m.sender === 'admin' ? 'right' : 'left'};">${m.time || ''}</small>
                                </div>
                            `).join('')}
                        </div>
                        <div style="display:flex; gap:10px; margin-top:12px; background:#f1f5f9; padding:6px; border-radius:20px;">
                            <input type="text" id="adminMsg" placeholder="ইউজারকে লিখুন..." onkeypress="if(event.key==='Enter') sendReturnMessage('${ret.id}', 'admin')" style="flex:1; padding:10px 15px; border:none; outline:none; font-size:12px; background:transparent;">
                            <button onclick="sendReturnMessage('${ret.id}', 'admin')" style="background:#3b82f6; color:#fff; border:none; width:40px; height:40px; border-radius:14px; cursor:pointer;">
                                <i class="fa fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const cb = document.getElementById('returnChatBox');
    if(cb) cb.scrollTop = cb.scrollHeight;
}
function openUserReturnChat(retId) {
    const ret = appState.returns.find(r => r.id === retId);
    if (!ret) return alert("রিটার্ন তথ্য পাওয়া যায়নি!");

    // অর্ডার থেকে পণ্যের বিস্তারিত তথ্য বের করা
    const order = appState.orders.find(o => o.id === ret.orderId) || {};

    const modalHtml = `
    <div id="userRetDetailModal" class="modal-overlay" style="display:flex; z-index:20000; background:rgba(0,0,0,0.85); position:fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center; backdrop-filter: blur(10px);">
        <div class="modal-box" style="background:#0f172a; color:#fff; width:95%; max-width:500px; border-radius:30px; overflow:hidden; max-height:95vh; display:flex; flex-direction:column; border:1px solid #1e293b; box-shadow:0 30px 60px rgba(0,0,0,0.6);">
            
            <div style="padding:20px 25px; background:rgba(30, 41, 59, 0.5); border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h3 style="margin:0; font-size:18px; color:#38bdf8; letter-spacing:0.5px;"><i class="fa fa-box-open"></i> রিটার্ন ট্র্যাকিং</h3>
                    <p style="margin:2px 0 0; font-size:11px; color:#64748b;">আইডি: #${ret.id}</p>
                </div>
                <span onclick="document.getElementById('userRetDetailModal').remove()" style="cursor:pointer; width:35px; height:35px; background:#1e293b; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:22px;">&times;</span>
            </div>

            <div style="overflow-y:auto; flex:1; padding:20px 25px; scrollbar-width: none;">
                
                <div style="background:linear-gradient(145deg, #1e293b, #0f172a); border:1px solid #334155; padding:18px; border-radius:20px; margin-bottom:20px; box-shadow: 0 10px 20px rgba(0,0,0,0.2);">
                    <h4 style="margin:0 0 12px; font-size:14px; color:#38bdf8; text-transform:uppercase; letter-spacing:1px;">পণ্যের বিস্তারিত</h4>
                    <div style="font-size:13px; color:#cbd5e1; display:grid; gap:8px;">
                        <p style="margin:0; display:flex; justify-content:space-between;"><span>📦 পণ্য:</span> <b style="color:#fff;">${order.productName || 'N/A'}</b></p>
                        <p style="margin:0; display:flex; justify-content:space-between;"><span>💰 মূল্য:</span> <b style="color:#22c55e;">৳${order.price || '0'}</b></p>
                        <p style="margin:0; display:flex; justify-content:space-between;"><span>📉 ডিসকাউন্ট:</span> <b style="color:#f43f5e;">${order.discount || '0'}%</b></p>
                        <p style="margin:0; display:flex; justify-content:space-between;"><span>💳 রিফান্ড পদ্ধতি:</span> <b style="color:#fff;">${ret.paymentDetails}</b></p>
                    </div>
                </div>

                <div style="background:rgba(244, 63, 94, 0.05); border:1px solid rgba(244, 63, 94, 0.2); padding:15px; border-radius:20px; margin-bottom:20px;">
                    <h4 style="margin:0 0 8px; font-size:13px; color:#f43f5e; display:flex; align-items:center; gap:8px;">
                        <i class="fa fa-circle-exclamation"></i> আপনার দেওয়া কারণ:
                    </h4>
                    <p style="margin:0; font-size:13px; color:#e2e8f0; line-height:1.5;">${ret.reason}</p>
                </div>
               

<div style="margin-bottom:20px;">
    <h4 style="margin:0 0 10px; font-size:13px; color:#38bdf8; display:flex; align-items:center; gap:8px;">
        <i class="fa fa-images"></i> আপনার আপলোড করা ছবি:
    </h4>
    <div style="display: flex; flex-wrap: wrap; gap: 10px; padding: 12px; background: rgba(30, 41, 59, 0.5); border: 1px solid #334155; border-radius: 20px;">
        ${(ret.images && ret.images.length > 0) ? 
            ret.images.map(imgUrl => `
                <div style="width: 75px; height: 75px; border-radius: 12px; overflow: hidden; border: 2px solid #334155; cursor: pointer; transition: 0.3s;" 
                     onclick="window.open('${imgUrl}', '_blank')"
                     onmouseover="this.style.borderColor='#38bdf8'; this.style.transform='scale(1.05)';" 
                     onmouseout="this.style.borderColor='#334155'; this.style.transform='scale(1)';">
                    <img src="${imgUrl}" onerror="this.src='https://placehold.co/100x100/1e293b/64748b?text=Error'" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
            `).join('') 
            : 
            (ret.image ? `
                <div style="width: 75px; height: 75px; border-radius: 12px; overflow: hidden; border: 2px solid #334155; cursor: pointer;" 
                     onclick="window.open('${ret.image}', '_blank')">
                    <img src="${ret.image}" onerror="this.src='https://placehold.co/100x100/1e293b/64748b?text=Error'" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
            ` : '<p style="font-size:11px; color:#64748b; margin:5px 0;">কোনো ছবি নেই</p>')
        }
    </div>
    <small style="display:block; margin-top:6px; color:#475569; font-size:9px; font-style:italic;">* ছবির ওপর ক্লিক করলে বড় করে দেখতে পাবেন</small>
</div>

                <div style="margin-bottom:25px;">
                    <h4 style="margin:0 0 15px; font-size:14px; color:#38bdf8; display:flex; align-items:center; gap:8px;">
                        <i class="fa fa-clock-rotate-left"></i> টাইমলাইন আপডেট
                    </h4>
                    <div style="position:relative; padding-left:20px; border-left:2px solid #1e293b; margin-left:10px; display:flex; flex-direction:column; gap:15px;">
                        ${(ret.statusHistory || []).length > 0 ? ret.statusHistory.map(h => `
                            <div style="position:relative;">
                                <div style="position:absolute; left:-27px; top:5px; width:12px; height:12px; background:#38bdf8; border-radius:50%; box-shadow:0 0 10px #38bdf8;"></div>
                                <div style="background:#1e293b; padding:10px 15px; border-radius:12px; border:1px solid #334155;">
                                    <p style="margin:0; font-size:13px; color:#fff; font-weight:600;">${h.text}</p>
                                    <small style="color:#64748b; font-size:10px;">${h.time}</small>
                                </div>
                            </div>
                        `).join('') : `
                            <div style="background:#1e293b; padding:12px; border-radius:12px; text-align:center; color:#64748b; font-size:12px;">
                                এখনো কোনো নতুন আপডেট আসেনি
                            </div>
                        `}
                    </div>
                </div>

                <h4 style="margin:0 0 12px; font-size:14px; color:#38bdf8;"><i class="fa fa-comments"></i> এডমিন সাপোর্ট</h4>
                <div id="userChatBox" style="height:220px; overflow-y:auto; background:rgba(0,0,0,0.3); border-radius:20px; padding:15px; border:1px solid #1e293b; display:flex; flex-direction:column; gap:12px; margin-bottom:10px;">
                    ${(ret.messages || []).map(m => `
                        <div style="align-self: ${m.sender === 'user' ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                            <div style="background:${m.sender === 'user' ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : '#334155'}; 
                                        color:#fff; padding:10px 15px; border-radius:${m.sender === 'user' ? '20px 20px 5px 20px' : '20px 20px 20px 5px'}; 
                                        font-size:13px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                                ${m.text}
                            </div>
                            <small style="font-size:9px; color:#475569; display:block; text-align:${m.sender === 'user' ? 'right' : 'left'}; margin-top:5px;">${m.time || ''}</small>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="padding:20px 25px 30px; background:rgba(15, 23, 42, 0.8); border-top:1px solid #1e293b;">
                <div style="display:flex; background:#1e293b; border-radius:18px; padding:6px; border:1px solid #334155; align-items:center; gap:5px;">
                    <input type="text" id="userReturnMsgInput" placeholder="এখানে মেসেজ লিখুন..." 
                        style="flex:1; padding:10px 15px; border:none; background:transparent; color:#fff; font-size:13px; outline:none;">
                    <button onclick="sendReturnMessage('${ret.id}', 'user')" 
                        style="background:#38bdf8; color:#0f172a; border:none; width:42px; height:42px; border-radius:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.3s; font-size:18px;">
                        <i class="fa fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const chatBox = document.getElementById('userChatBox');
    chatBox.scrollTop = chatBox.scrollHeight;
}
function openUserReturnList() {
    const modal = document.getElementById('userReturnListModal');
    if(modal) modal.style.display = 'flex';

    const listContainer = document.getElementById('userReturnListContent');
    if (!listContainer) return;

    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
    appState.returns = JSON.parse(localStorage.getItem(RETURN_KEY)) || [];

    const currentUserId = appState.currentUser ? appState.currentUser.id : null;
    const myReturns = appState.returns.filter(r => String(r.userId) === String(currentUserId));
    
    if (myReturns.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding:30px; color:#888;">কোনো রিটার্ন নেই</p>';
        return;
    }

    let html = "";
    [...myReturns].reverse().forEach(ret => {
        const statusColor = ret.statusHeader === 'সফল' ? '#22c55e' : (ret.statusHeader === 'রিজেক্ট' ? '#f43f5e' : '#38bdf8');

        // --- আসল ছবির লজিক (অর্ডার ডাটা থেকে) ---
        // রিটার্নের ভেতর থাকা orderId দিয়ে মেইন অর্ডারটি খুঁজে বের করছি
        const targetOrder = appState.orders.find(o => String(o.id) === String(ret.orderId));
        let pImage = 'https://cdn-icons-png.flaticon.com/512/263/263142.png'; // ডিফল্ট

        if (targetOrder) {
            // ১. প্রথমে অর্ডারের ভেতর সরাসরি ইমেজ আছে কিনা দেখি
            pImage = targetOrder.productImage || targetOrder.image || pImage;
            
            // ২. যদি না থাকে, তবে মেইন প্রোডাক্ট লিস্ট থেকে খুঁজে আনি (সবচেয়ে নির্ভুল উপায়)
            const mainProduct = appState.products.find(p => String(p.id) === String(targetOrder.productId));
            if (mainProduct) {
                const images = Array.isArray(mainProduct.images) ? mainProduct.images : [mainProduct.images || mainProduct.image];
                if (images[0]) pImage = images[0];
            }
        }

        html += `
        <div style="background: linear-gradient(145deg, #1e293b, #0f172a); border: 1px solid #334155; padding: 20px; margin-bottom: 20px; border-radius: 24px; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
            
            <div style="position:absolute; top:0; left:0; width:5px; height:100%; background:${statusColor};"></div>
            
            <div style="display:flex; justify-content:space-between; align-items: flex-start; margin-bottom:15px;">
                <div>
                    <span style="color:#94a3b8; font-weight:600; font-size:11px; display:block; margin-bottom:5px;">ID: #${ret.id}</span>
                    <h4 style="margin:0; font-size:15px; color:#f8fafc; font-weight:600;">📦 অর্ডার আইডি: ${ret.orderId}</h4>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:6px; color:#64748b; font-size:12px;">
                        <i class="fa fa-calendar-alt"></i>
                        <span>${ret.date || 'N/A'}</span>
                    </div>
                </div>

                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                    <span style="background:${statusColor}22; color:${statusColor}; border: 1px solid ${statusColor}44; padding:4px 10px; border-radius:10px; font-size:10px; font-weight:bold;">
                        ${ret.statusHeader || 'পেন্ডিং'}
                    </span>
                    
                    <img src="${pImage}" 
                         style="width: 55px; height: 55px; border-radius: 12px; object-fit: cover; border: 2px solid #334155; background: #0f172a;">
                </div>
            </div>

            <div style="background:rgba(0,0,0,0.2); padding:12px; border-radius:15px; border:1px solid #1e293b; margin-bottom:15px;">
                <p style="font-size:10px; color:#38bdf8; margin:0 0 4px; font-weight:bold;">এডমিন আপডেট:</p>
                <p style="font-size:13px; color:#cbd5e1; margin:0;">
                    ${ret.statusHistory && ret.statusHistory.length > 0 ? ret.statusHistory[ret.statusHistory.length - 1].text : 'রিভিউ করা হচ্ছে...'}
                </p>
            </div>

            <button onclick="openUserReturnChat('${ret.id}')" style="width:100%; background:#1e293b; color:#fff; border:1px solid #334155; padding:12px; border-radius:15px; cursor:pointer; font-weight:bold; font-size:13px; display:flex; align-items:center; justify-content:center; gap:10px;">
                <i class="fa fa-comments" style="color:#38bdf8;"></i> বিস্তারিত ও চ্যাট
            </button>
        </div>`;
    });
    listContainer.innerHTML = html;
}
function updateReturnStatus(retId) {
    const status = document.getElementById('adminStatusHeader').value;
    const note = document.getElementById('adminNote').value;

    const retIndex = appState.returns.findIndex(r => r.id === retId);
    if (retIndex !== -1) {
        appState.returns[retIndex].statusHeader = status;
        appState.returns[retIndex].adminComment = note;

        saveData('returns', appState.returns);
        alert("স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে!");
        
        // অ্যাডমিন প্যানেল রিফ্রেশ করা
        document.getElementById('adminRetModal').remove();
        renderAdminReturnList(); 
    }
}
// স্ট্যাটাস আপডেট করার জন্য
function quickUpdateStatus(retId, newStatus) {
    const retIndex = appState.returns.findIndex(r => r.id === retId);
    if (retIndex !== -1) {
        appState.returns[retIndex].statusHeader = newStatus;
        saveData(DB_KEYS.RETURNS, appState.returns);
        alert("স্ট্যাটাস পরিবর্তন সফল: " + newStatus);
        document.getElementById('adminRetModal').remove();
        renderAdminReturnList(); 
    }
}

// রেকর্ড ডিলিট করার জন্য
function deleteReturnRecord(retId) {
    if(confirm("আপনি কি নিশ্চিতভাবে এই রিটার্ন রেকর্ডটি সম্পূর্ণ ডিলিট করতে চান?")) {
        // ১. সংশ্লিষ্ট order এর isReturned flag সরাও
        const ret = appState.returns.find(r => r.id === retId);
        if (ret) {
            const orderIdx = appState.orders.findIndex(o => String(o.id) === String(ret.orderId));
            if (orderIdx !== -1) {
                delete appState.orders[orderIdx].isReturned;
                delete appState.orders[orderIdx].returnId;
                delete appState.orders[orderIdx].returnStatus;
                saveData(DB_KEYS.ORDERS, appState.orders);
                // Firebase order update
                try {
                    if (typeof firebase !== 'undefined' && firebase.firestore)
                        firebase.firestore().collection('orders').doc(String(ret.orderId)).set(appState.orders[orderIdx]).catch(()=>{});
                } catch(e) {}
            }
        }
        // ২. appState থেকে বাদ
        appState.returns = appState.returns.filter(r => r.id !== retId);
        saveData(DB_KEYS.RETURNS, appState.returns);
        // ৩. Firebase থেকে delete
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore)
                firebase.firestore().collection('returns').doc(String(retId)).delete()
                    .then(() => console.log('[FB] ✅ Return deleted:', retId))
                    .catch(e => console.warn('[FB] return delete err:', e.message));
        } catch(e) {}
        // ৪. UI update
        const modal = document.getElementById('adminRetModal');
        if (modal) modal.remove();
        renderAdminReturnList();
        alert("✅ রিটার্ন রিকোয়েস্ট সম্পূর্ণ ডিলিট হয়েছে।");
    }
}

function sendReturnMessage(retId, sender) {
    const inputId = sender === 'user' ? 'userReturnMsgInput' : 'adminMsg';
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text) return;

    const retIndex = appState.returns.findIndex(r => r.id === retId);
    if (retIndex === -1) return;

    if (!appState.returns[retIndex].messages) {
        appState.returns[retIndex].messages = [];
    }

    // মেসেজ অবজেক্ট
    const newMessage = {
        sender: sender,
        text: text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    appState.returns[retIndex].messages.push(newMessage);
    
    // ডাটা সেভ করা
    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
    saveData(RETURN_KEY, appState.returns);

    // UI রিফ্রেশ করা
    input.value = '';
    if (sender === 'user') {
        document.getElementById('userRetDetailModal').remove();
        openUserReturnChat(retId);
    } else {
        // এডমিন সাইড হলে এডমিন মোডাল রিফ্রেশ করুন
        if (typeof openAdminReturnDetail === 'function') {
            document.getElementById('adminRetModal').remove();
            openAdminReturnDetail(retId);
        }
    }
}
window.quickUpdateStatus = function(retId, newStatus) {
    // ১. লেটেস্ট ডাটা নিশ্চিত করা
    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
    let allReturns = JSON.parse(localStorage.getItem(RETURN_KEY)) || appState.returns || [];

    const retIndex = allReturns.findIndex(r => r.id === retId);
    if (retIndex === -1) return alert("রেকর্ড পাওয়া যায়নি!");

    // ২. হিস্ট্রি অ্যারে চেক ও আপডেট
    if (!allReturns[retIndex].statusHistory) allReturns[retIndex].statusHistory = [];

    const historyItem = {
        text: newStatus,
        time: new Date().toLocaleString('bn-BD', { 
            hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' 
        })
    };

    allReturns[retIndex].statusHeader = newStatus;
    allReturns[retIndex].statusHistory.push(historyItem);

    // ৩. গ্লোবাল স্টেট এবং লোকাল স্টোরেজ আপডেট
    appState.returns = allReturns;
    localStorage.setItem(RETURN_KEY, JSON.stringify(allReturns));

    // ৪. UI রিফ্রেশ (মোডালটি বন্ধ করে আবার ওপেন করা যাতে আপডেট দেখা যায়)
    const oldModal = document.getElementById('adminRetModal');
    if (oldModal) oldModal.remove();
    openAdminReturnDetail(retId);
};
window.deleteStatusHistory = function(retId, index) {
    const RETURN_KEY = (typeof DB_KEYS !== 'undefined' && DB_KEYS.RETURNS) ? DB_KEYS.RETURNS : 'returns';
    
    // ইনডেক্স ধরে স্পেসিফিক হিস্ট্রি মোছা
    const retIndex = appState.returns.findIndex(r => r.id === retId);
    if (retIndex !== -1) {
        appState.returns[retIndex].statusHistory.splice(index, 1);
        
        // সেভ করা
        localStorage.setItem(RETURN_KEY, JSON.stringify(appState.returns));
        
        // রিফ্রেশ ভিউ
        document.getElementById('adminRetModal').remove();
        openAdminReturnDetail(retId);
    }
};












function openProductDetails(productId) {
    // ১. প্রোডাক্ট খুঁজে বের করা
    const item = appState.products.find(p => String(p.id) === String(productId));
    if (!item) {
        console.error("পণ্যটি পাওয়া যায়নি! আইডি:", productId);
        return;
    }

    // ২. ইমেজ প্রসেসিং
    const images = Array.isArray(item.images) ? item.images : [item.images || item.image || 'https://via.placeholder.com/400'];

    // ৩. মোডাল তৈরি বা চেক করা
    let modal = document.getElementById('dynamicDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dynamicDetailModal';
        modal.style = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); backdrop-filter:blur(15px); z-index:98678399999999; display:none; justify-content:center; align-items:center; padding:10px; font-family:'Hind Siliguri', sans-serif;`;
        document.body.appendChild(modal);
    }

    // ৪. ডাটা রিকভারি ও অটো-ক্লিনআপ (রিফ্রেশ সমস্যা সমাধান)
    const savedReports = localStorage.getItem('tm_reports');
    appState.reports = savedReports ? JSON.parse(savedReports) : [];

    const now = Date.now();
    const originalLength = appState.reports.length;
    appState.reports = appState.reports.filter(r => !r.expiryTimestamp || r.expiryTimestamp > now);
    
    if (appState.reports.length !== originalLength) {
        localStorage.setItem('tm_reports', JSON.stringify(appState.reports));
    }

    // ৫. সম্পর্কিত পণ্য ফিল্টার
    const _iTags = Array.isArray(item.tags) ? item.tags.map(t=>String(t).toLowerCase()) : (item.tags ? String(item.tags).toLowerCase().split(',').map(t=>t.trim()) : []);
    const _iWords = item.title.toLowerCase().split(' ').filter(w=>w.length>2);
    const relatedProducts = appState.products.filter(p => {
        if (String(p.id) === String(item.id)) return false;
        if (p.category && item.category && p.category === item.category) return true;
        const pTags = Array.isArray(p.tags) ? p.tags.map(t=>String(t).toLowerCase()) : (p.tags ? String(p.tags).toLowerCase().split(',').map(t=>t.trim()) : []);
        if (_iTags.some(t=>pTags.includes(t))) return true;
        return _iWords.some(w=>p.title.toLowerCase().split(' ').includes(w));
    }).slice(0, 6);

    // ৬. অ্যাডমিন চেক (আপনার সিস্টেমের লজিক অনুযায়ী)
    const isAdminUser = (typeof isAdmin === 'function') ? isAdmin() : false;

    let adminExtraButtons = '';
    // if (isAdminUser) {
    //     adminExtraButtons = `<button onclick="editProduct('${item.id}')" style="flex:1; padding:18px; background:#3498db; color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:bold; cursor:pointer; transition:0.3s; margin-top:10px; display:flex; align-items:center; justify-content:center; gap:8px;">📝 এডিট প্রোডাক্ট (Admin)</button>`;
    // }

    // ৭. লাইক লজিক
    const userId = (appState.currentUser && appState.currentUser.id) ? appState.currentUser.id : 'GUEST';
    const likedByArray = Array.isArray(item.likedBy) ? item.likedBy : [];
    const isLiked = likedByArray.includes(userId);
    const likeColor = isLiked ? '#ef4444' : '#fff'; 
    const heartIcon = isLiked ? '❤️' : '🤍';

    // ৮. বর্তমান প্রোডাক্টের রিপোর্টগুলো ফিল্টার করা
    const productReports = appState.reports.filter(r => String(r.productId) === String(item.id));
    
    let reportsHtml = '';
    if (productReports.length > 0) {
        reportsHtml = `
            <div style="margin-bottom:30px; background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.3); border-radius:16px; padding:20px;">
                <h4 style="color:#ef4444; margin:0 0 15px; font-size:16px; display:flex; align-items:center; gap:8px;">⚠️ ইউজার রিপোর্টসমূহ (${productReports.length})</h4>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${productReports.map(r => `
                        <div style="background:#1e293b; padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="flex:1; padding-right:10px;">
                                <p style="color:#e2e8f0; font-size:14px; margin:0; line-height:1.4; word-break: break-word;">${r.reason}</p>
                                <small style="color:#64748b; font-size:11px; display:block; margin-top:5px;">📅 ${new Date(r.timestamp).toLocaleDateString()} | 👤 ${r.userName || 'User'}</small>
                            </div>
                            ${isAdminUser ? `
                                <button onclick="deleteReportRecord('${r.id}', '${item.id}')" 
                                    style="background:#ef4444; color:#fff; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:bold; flex-shrink:0; transition:0.2s;"
                                    onmouseover="this.style.background='#dc2626'" 
                                    onmouseout="this.style.background='#ef4444'">
                                    মুছে ফেলুন
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    modal.innerHTML = `
        <div style="background:#0f172a; width:98%; max-width:1150px; height:92vh; border-radius:24px; overflow:hidden; position:relative; display:flex; flex-direction:column; border:1px solid rgba(255,255,255,0.1); animation: zoomIn 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);">
            
            <button onclick="document.getElementById('dynamicDetailModal').style.display='none'" style="position:absolute; top:20px; right:25px; background:#ef4444; color:#fff; border:none; border-radius:50%; width:40px; height:40px; cursor:pointer; z-index:10001; font-weight:bold; box-shadow:0 4px 15px rgba(239, 68, 68, 0.3);">✕</button>

            <div style="flex:1; overflow-y:auto; padding:30px;" class="modal-scroll">
                <div style="display:flex; flex-wrap:wrap; gap:40px; margin-bottom:40px;">
                    
                    <div style="flex:1; min-width:320px;">
                        <div style="background:#000; border-radius:20px; overflow:hidden; height:450px; position:relative; border:1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
                            <div id="modalGallery" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; height:100%; scrollbar-width:none;">
                                ${images.map(img => `<img src="${img}" style="min-width:100%; height:100%; object-fit:contain; scroll-snap-align:start;">`).join('')}
                            </div>
                            <div style="position:absolute; bottom:15px; width:100%; text-align:center; color:#fff; font-size:12px; background:rgba(0,0,0,0.6); padding:8px 0; backdrop-filter:blur(5px);">ডানে বা বামে স্লাইড করুন ↔️</div>
                        </div>
                        
                        <div style="display:flex; gap:10px; margin-top:20px;">
                            <button id="likeBtn-${item.id}" onclick="toggleProductLike('${item.id}')" style="flex:2; padding:12px; background:#1e293b; color:${likeColor}; border:1px solid ${isLiked ? '#ef4444' : '#334155'}; border-radius:12px; cursor:pointer; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <span style="font-size:20px;">${heartIcon}</span>
                                <span id="likeCount-${item.id}">${item.likes || 0}</span>
                            </button>

                            <button onclick="shareProduct('${item.id}', '${item.title.replace(/'/g, "\\'")}')" style="flex:2; padding:12px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:12px; cursor:pointer; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <span style="font-size:20px;">🔗</span>
                                <span>শেয়ার</span>
                            </button>

                            <button onclick="openProductOptions('${item.id}')" style="flex:0.5; min-width:50px; padding:12px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                                <span style="font-size:20px;">⋮</span>
                            </button>
                        </div>
                    </div>

                    <div style="flex:1; min-width:320px; display:flex; flex-direction:column;">
                        <h1 style="color:#fff; font-size:32px; margin:0 0 10px; font-weight:800; line-height:1.2;">${item.title}</h1>
                        <p style="color:#94a3b8; font-size:14px; background:rgba(255,255,255,0.05); align-self:flex-start; padding:4px 12px; border-radius:20px; border:1px solid rgba(255,255,255,0.1);">Product ID: #${item.id}</p>
                        
                        <div style="margin:30px 0; border-bottom:1px solid #334155; padding-bottom:25px;">
                            <span style="color:#2ecc71; font-size:45px; font-weight:900;">${SYSTEM_CONFIG.CURRENCY} ${item.price}</span>
                            <span style="color:#64748b; text-decoration:line-through; font-size:22px; margin-left:15px; opacity:0.7;">${SYSTEM_CONFIG.CURRENCY} ${Math.floor(item.price * 1.3)}</span>
                        </div>

                        <div style="background:rgba(255,255,255,0.02); padding:20px; border-radius:20px; border:1px solid rgba(255,255,255,0.05); margin-bottom:30px;">
                            <h4 style="color:#3498db; margin:0 0 12px; font-size:18px;">ℹ️ পণ্যের বিবরণ:</h4>
                            <div style="color:#cbd5e1; font-size:15px; line-height:1.8; white-space:pre-wrap;">${item.description || 'দুঃখিত, কোনো বিবরণ পাওয়া যায়নি।'}</div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:12px; margin-top:auto;">
                            <div style="display:flex; gap:15px;">
                                <button onclick="addToCart('${item.id}')" style="flex:1; padding:18px; background:#f59e0b; color:#fff; border:none; border-radius:14px; font-size:18px; font-weight:bold; cursor:pointer; transition:0.3s; box-shadow: 0 10px 20px -5px rgba(245, 158, 11, 0.3);">🛒 কার্টে যোগ করুন</button>
                                <button onclick="document.getElementById('dynamicDetailModal').style.display='none'; initiateCheckout('${item.id}')" style="flex:1; padding:18px; background:#ef4444; color:#fff; border:none; border-radius:14px; font-size:18px; font-weight:bold; cursor:pointer; transition:0.3s; box-shadow: 0 10px 20px -5px rgba(239, 68, 68, 0.3);">⚡ এখনই অর্ডার</button>
                            </div>
                            ${adminExtraButtons}
                        </div>
                    </div>
                </div>

                <div style="border-top:1px solid #334155; padding-top:40px; margin-top:20px;">
                    
                    ${reportsHtml}

                    <h3 style="color:#fff; margin-bottom:25px; font-size:22px; display:flex; align-items:center; gap:10px;">
                        <span style="width:5px; height:25px; background:#3498db; border-radius:10px;"></span>
                        🔥 এই ক্যাটাগরির আরো পণ্য
                    </h3>
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:20px;">
                        ${relatedProducts.map(p => `
                            <div onclick="openProductDetails('${p.id}')" class="related-card" style="background:#1e293b; padding:12px; border-radius:16px; cursor:pointer; text-align:center; border:1px solid rgba(255,255,255,0.05); transition:0.3s;">
                                <img src="${p.image || (p.images && p.images[0])}" style="width:100%; height:130px; object-fit:contain; border-radius:12px; background:#000;">
                                <h5 style="color:#fff; margin:12px 0 6px; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.title}</h5>
                                <p style="color:#2ecc71; margin:0; font-weight:800; font-size:16px;">${SYSTEM_CONFIG.CURRENCY} ${p.price}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>

        <style>
            @keyframes zoomIn { from { opacity: 0; transform: scale(0.95) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            .modal-scroll::-webkit-scrollbar { width: 6px; }
            .modal-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }
            .modal-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
            .related-card:hover { border-color: #3498db !important; transform: translateY(-5px); background: #243147 !important; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
            button:active { transform: scale(0.98); }
            button:hover { filter: brightness(1.15); }
        </style>
    `;

    modal.style.display = 'flex';
}

window.deleteReportRecord = function(reportId, prodId) {
    if (confirm("আপনি কি নিশ্চিত যে এই রিপোর্টটি ডিলিট করতে চান?")) {
        // ১. লোকাল স্টোরেজ থেকে ডাটা ফিল্টার করা
        let reports = JSON.parse(localStorage.getItem('tm_reports') || '[]');
        reports = reports.filter(r => r.id !== reportId);
        
        // ২. আপডেট করা ডাটা সেভ করা
        localStorage.setItem('tm_reports', JSON.stringify(reports));
        appState.reports = reports;
        
        alert("✅ রিপোর্টটি সফলভাবে মুছে ফেলা হয়েছে।");
        
        // ৩. মোডাল রি-রেন্ডার করা
        openProductDetails(prodId);
    }
};
function toggleProductLike(productId) {
    // ১. প্রোডাক্ট খুঁজে বের করা
    const item = appState.products.find(p => p.id === productId);
    if (!item) return;

    // ২. ইউজার আইডি (লগইন না থাকলে GUEST)
    const userId = (appState.currentUser && appState.currentUser.id) ? appState.currentUser.id : 'GUEST';

    // ৩. লাইক লিস্ট চেক ও টগল
    if (!Array.isArray(item.likedBy)) {
        item.likedBy = [];
    }

    const likeIndex = item.likedBy.indexOf(userId);
    const likeBtn = document.getElementById(`likeBtn-${productId}`);
    const countDisplay = likeBtn ? likeBtn.querySelector('span:last-child') : null;

    if (likeIndex === -1) {
        // লাইক দেওয়া (Like)
        item.likedBy.push(userId);
        item.likes = (item.likes || 0) + 1;
        
        // UI আপডেট (রিয়েল-টাইম)
        if (likeBtn) {
            likeBtn.style.color = '#ef4444';
            likeBtn.style.borderColor = '#ef4444';
            likeBtn.querySelector('span:first-child').innerText = '❤️';
        }
    } else {
        // লাইক তুলে নেওয়া (Unlike)
        item.likedBy.splice(likeIndex, 1);
        item.likes = Math.max(0, (item.likes || 0) - 1);
        
        // UI আপডেট (রিয়েল-টাইম)
        if (likeBtn) {
            likeBtn.style.color = '#fff';
            likeBtn.style.borderColor = '#334155';
            likeBtn.querySelector('span:first-child').innerText = '🤍';
        }
    }

    // সংখ্যাটি সাথে সাথে আপডেট
    if (countDisplay) {
        countDisplay.innerText = item.likes;
    }

    // ৪. ডাটাবেজে চিরস্থায়ীভাবে সেভ করা (এটিই আপনার মেইন কাজ করবে)
    localStorage.setItem(DB_KEYS.PRODUCTS, JSON.stringify(appState.products));
    
    console.log(`✅ Digital Shop TM: প্রোডাক্ট #${productId} এর লাইক সেভ হয়েছে!`);
}
/**
 * পণ্যের লিঙ্ক শেয়ার করার ফাংশন
 * @param {string} productId - পণ্যের আইডি
 * @param {string} productTitle - পণ্যের নাম
 */
async function shareProduct(productId, productTitle) {
    // ১. শেয়ার করার জন্য লিঙ্ক তৈরি (আপনার ওয়েবসাইটের বর্তমান URL + প্রোডাক্ট আইডি)
    // যদি আপনার নির্দিষ্ট কোনো ডোমেইন থাকে তবে 'window.location.origin' এর বদলে সেটি দিতে পারেন
    const shareUrl = `${window.location.origin}${window.location.pathname}?id=${productId}`;
    const shareText = `Digital Shop TM থেকে এই অসাধারণ পণ্যটি দেখুন: ${productTitle}\nমূল্য জানতে এবং অর্ডার করতে নিচের লিঙ্কে ক্লিক করুন:\n`;

    // ২. চেক করা হচ্ছে ব্রাউজারে 'Share API' আছে কি না (স্মার্টফোন বা আধুনিক ব্রাউজারের জন্য)
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Digital Shop TM',
                text: shareText,
                url: shareUrl,
            });
            console.log('✅ সফলভাবে শেয়ার মেনু ওপেন হয়েছে।');
        } catch (err) {
            console.log('❌ শেয়ার বাতিল করা হয়েছে বা সমস্যা হয়েছে:', err);
        }
    } else {
        // ৩. যদি Share API না থাকে (যেমন ডেস্কটপ বা পুরনো ব্রাউজার), তবে লিঙ্ক কপি হবে
        try {
            const fullText = `${shareText}${shareUrl}`;
            await navigator.clipboard.writeText(fullText);
            
            // একটি সুন্দর নোটিফিকেশন বা এলার্ট দেখানো
            alert("✅ লিঙ্কটি কপি করা হয়েছে! এখন আপনি আপনার বন্ধুদের কাছে পেস্ট করে শেয়ার করতে পারেন।");
        } catch (err) {
            console.error('❌ লিঙ্ক কপি করা যায়নি:', err);
            alert("❌ শেয়ার করতে ব্যর্থ হয়েছে। দয়া করে লিঙ্কটি ম্যানুয়ালি কপি করুন।");
        }
    }
}
function openProductOptions(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;

    const optionsHtml = `
        <div id="optionsOverlay" onclick="closeOptions()" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9099999999; display:flex; align-items:center; justify-content:center; font-family:'Hind Siliguri', sans-serif; padding:20px; box-sizing:border-box;">
            <div onclick="event.stopPropagation()" style="width:100%; max-width:380px; background:#1e293b; border-radius:20px; padding:25px; box-sizing:border-box; position:relative; animation: zoomIn 0.2s ease-out; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
                
                <button onclick="closeOptions()" style="position:absolute; top:15px; right:15px; background:rgba(255,255,255,0.05); border:none; width:32px; height:32px; border-radius:50%; color:#94a3b8; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.3s; font-size:18px;">
                    <i class="fa fa-times"></i>
                </button>
                
                <div style="text-align:center; margin-bottom:25px; padding-top:10px;">
                    <div style="width:50px; height:50px; background:rgba(52, 152, 219, 0.1); border-radius:15px; display:flex; align-items:center; justify-content:center; margin:0 auto 12px; color:#3498db; font-size:20px;">
                        <i class="fa fa-cog"></i>
                    </div>
                    <h4 style="margin:0; color:#fff; font-size:18px; font-weight:700;">পণ্য অপশন</h4>
                    <p style="margin:5px 0 0; color:#64748b; font-size:12px; letter-spacing:1px;">SKU: ${product.sku}</p>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px;">
                    
                    <div onclick="showSellerDetail('${product.id}')" style="display:flex; align-items:center; gap:15px; padding:14px; background:#0f172a; border-radius:15px; cursor:pointer; border:1px solid rgba(255,255,255,0.03); transition:0.3s;" 
                         onmouseover="this.style.background='#16213e'; this.style.borderColor='#3498db';" 
                         onmouseout="this.style.background='#0f172a'; this.style.borderColor='rgba(255,255,255,0.03)';">
                        <div style="width:38px; height:38px; background:rgba(46, 204, 113, 0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; color:#2ecc71; font-size:18px;">
                            <i class="fa fa-user-circle"></i>
                        </div>
                        <span style="color:#e2e8f0; font-size:14px; font-weight:600;">সেলার বিস্তারিত</span>
                    </div>

                    <div onclick="reportProduct('${product.id}')" style="display:flex; align-items:center; gap:15px; padding:14px; background:#0f172a; border-radius:15px; cursor:pointer; border:1px solid rgba(255,255,255,0.03); transition:0.3s;"
                         onmouseover="this.style.background='#2d1b1e'; this.style.borderColor='#ff4757';" 
                         onmouseout="this.style.background='#0f172a'; this.style.borderColor='rgba(255,255,255,0.03)';">
                        <div style="width:38px; height:38px; background:rgba(255, 71, 87, 0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; color:#ff4757; font-size:18px;">
                            <i class="fa fa-flag"></i>
                        </div>
                        <span style="color:#ff4757; font-size:14px; font-weight:600;">রিপোর্ট করুন</span>
                    </div>

                </div>
            </div>
        </div>
        
        <style>
            @keyframes zoomIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', optionsHtml);
}

// আগের মতো ফাংশনগুলো ঠিক থাকবে
function closeOptions() {
    const overlay = document.getElementById('optionsOverlay');
    if (overlay) overlay.remove();
}

function showSellerDetail(id) {
    closeOptions();
    const product = appState.products.find(p => p.id === id);
    const info = product.sellerInfo || "কোনো তথ্য পাওয়া যায়নি।";
    alert("👤 সেলার বিস্তারিত:\n\n" + info);
}

function reportProduct(id) {
    if (typeof closeOptions === 'function') closeOptions(); 
    
    const product = appState.products.find(p => String(p.id) === String(id));
    if (!product) return;

    const reason = prompt(`"${product.title}" পণ্যটি কেন রিপোর্ট করতে চান?`);
    
    if (reason && reason.trim() !== "") {
        // ১. ডাটা লোড করা
        let savedReports = JSON.parse(localStorage.getItem('tm_reports') || '[]');

        const now = Date.now();
        const expiry = now + (7 * 24 * 60 * 60 * 1000); 

        const newReport = {
            id: 'REP-' + now,
            productId: String(id),
            reason: reason,
            timestamp: now,
            expiryTimestamp: expiry,
            userName: (appState.currentUser && appState.currentUser.name) ? appState.currentUser.name : "Guest"
        };

        // ২. ডাটা সেভ করা
        savedReports.push(newReport);
        appState.reports = savedReports; 
        localStorage.setItem('tm_reports', JSON.stringify(savedReports)); 
        
        alert("✅ রিপোর্ট জমা হয়েছে!");

        // ৩. সঙ্গে সঙ্গে আপলোড দেখানোর জন্য মোডাল রি-রেন্ডার করা
        openProductDetails(id); 
    }
}
// অ্যাডমিন রিপোর্ট ডিলিট করবে
window.deleteReport = function(reportId) {
    if (!confirm("আপনি কি এই রিপোর্টটি ডিলিট করতে চান?")) return;
    appState.reports = appState.reports.filter(r => r.id !== reportId);
    localStorage.setItem('tm_reports', JSON.stringify(appState.reports));
    alert("রিপোর্ট ডিলিট করা হয়েছে।");
    // পেজ রিফ্রেশ বা রি-রেন্ডার করার প্রয়োজন হলে এখানে ফাংশন কল করুন
};

// ৭ দিনের পুরনো রিপোর্ট অটো ডিলিট করার চেক
function autoCleanReports() {
    if (!appState.reports) return;
    const now = new Date().getTime();
    const activeReports = appState.reports.filter(r => r.expiryTimestamp > now);
    
    if (activeReports.length !== appState.reports.length) {
        appState.reports = activeReports;
        localStorage.setItem('tm_reports', JSON.stringify(appState.reports));
    }
}

function openProductBySKU(skuCode, fallbackId) {
    // ১. যদি SKU কোড থাকে, তবে সেটা দিয়ে খোঁজা
    let item = null;
    if (skuCode && skuCode !== 'undefined' && skuCode !== 'null') {
        item = appState.products.find(p => p.sku === skuCode);
    }

    // ২. যদি SKU দিয়ে না পায়, তবে অর্ডারে থাকা প্রোডাক্ট আইডি দিয়ে খোঁজা (পুরাতন অর্ডারের জন্য)
    if (!item && fallbackId) {
        item = appState.products.find(p => p.id == fallbackId);
    }

    if (item) {
        // পণ্য পাওয়া গেলে পপ-আপ ওপেন হবে
        openProductDetails(item.id); 
    } else {
        alert("দুঃখিত, এই পণ্যের তথ্য ডাটাবেজে পাওয়া যায়নি! (SKU: " + skuCode + ")");
    }
}
function searchProducts() {
    const term = document.getElementById('productSearchInput').value.toLowerCase().trim();
    
    if (typeof appState !== 'undefined' && appState.products) {
        const filtered = appState.products.filter(p => {
            // ১. টাইটেল দিয়ে খোঁজা
            const matchesTitle = p.title.toLowerCase().includes(term);
            
            // ২. ট্যাগ দিয়ে খোঁজা (শক্তিশালী ফিল্টার)
            const matchesTags = p.tags && p.tags.some(tag => tag.includes(term));
            
            return matchesTitle || matchesTags;
        });

        renderProductGrid(filtered); // ফিল্টার করা রেজাল্ট দেখানো
    }
}
// ২. ইনপুট বক্সটি ক্লিয়ার করার বা অতিরিক্ত ফিচারের জন্য (ঐচ্ছিক)
document.getElementById('productSearchInput').addEventListener('search', function() {
    if(this.value === "") {
        renderProductGrid(appState.products); // বক্স খালি করলে সব পণ্য ফিরে আসবে
    }
});

// ১. ফিল্টার মেনু খোলা বা বন্ধ করার ফাংশন
function toggleFilterMenu() {
    const menu = document.getElementById('filterMenu');
    if (menu) {
        const isHidden = menu.style.display === 'none' || menu.style.display === '';
        menu.style.display = isHidden ? 'block' : 'none';
    }
}

// ২. মূল ফিল্টার ফাংশন (যেকোনো পেজে কাজ করবে)

// ১. মেনু খোলা বা বন্ধ করার উন্নত ফাংশন
function toggleFilterMenu(show = null) {
    const menu = document.getElementById('filterMenu');
    if (!menu) return;

    if (show === true) {
        menu.style.display = 'block';
    } else if (show === false) {
        menu.style.display = 'none';
    } else {
        menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    }
}

// ২. বাইরে ক্লিক করলে মেনু বন্ধ হওয়ার লজিক
window.addEventListener('click', function(event) {
    const menu = document.getElementById('filterMenu');
    const filterBtn = document.querySelector('button[onclick="toggleFilterMenu()"]');
    
    // যদি ক্লিকটি মেনু বা ফিল্টার বাটনের বাইরে হয়, তবে মেনু বন্ধ হবে
    if (menu && menu.style.display === 'block') {
        if (!menu.contains(event.target) && event.target !== filterBtn && !filterBtn.contains(event.target)) {
            toggleFilterMenu(false);
        }
    }
});

// ৩. সংশোধিত রিসেট ফাংশন (এটি বর্তমান ক্যাটাগরি বজায় রাখবে)
function resetFilters() {
    document.getElementById('minPrice').value = "";
    document.getElementById('maxPrice').value = "";
    document.getElementById('priceSort').value = "none";
    
    // হোম পেজের সব পণ্য বা বর্তমান ক্যাটাগরির পণ্য ফিরিয়ে আনা
    // যদি আপনার প্রোজেক্টে appState.products থাকে তবে সেটি দেখাবে
    if (typeof renderProductGrid === 'function' && appState.products) {
        renderProductGrid(appState.products);
    }
    toggleFilterMenu(false);
}

// ৪. মূল ফিল্টার ফাংশন
function applyAdvancedFilter() {
    const minVal = document.getElementById('minPrice').value;
    const maxVal = document.getElementById('maxPrice').value;
    const sortOrder = document.getElementById('priceSort').value;

    const minPrice = minVal !== "" ? parseFloat(minVal) : 0;
    const maxPrice = maxVal !== "" ? parseFloat(maxVal) : Infinity;

    // স্ক্রিনে থাকা পণ্যের ID সংগ্রহ
    const visibleProductCards = document.querySelectorAll('.product-card');
    const visibleIds = Array.from(visibleProductCards).map(card => {
        const btn = card.querySelector('button[onclick*="initiateCheckout"]');
        if (btn) {
            const match = btn.getAttribute('onclick').match(/'([^']+)'/);
            return match ? match[1] : null;
        }
        return null;
    }).filter(id => id !== null);

    let productsToFilter = appState.products.filter(p => visibleIds.includes(p.id));

    let filtered = productsToFilter.filter(p => {
        const pPrice = parseFloat(p.price);
        return pPrice >= minPrice && pPrice <= maxPrice;
    });

    if (sortOrder === "low") {
        filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    } else if (sortOrder === "high") {
        filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    }

    renderProductGrid(filtered);
    toggleFilterMenu(false);
}



// লগইন বাটন যখনই ক্লিক হবে বা পেজ লোড হবে তখন এটি রান করবে
document.addEventListener('click', function(e) {
    if (e.target.innerText && e.target.innerText.includes("লগইন")) {
        setTimeout(fixLoginLabelColors, 100); // ফর্ম লোড হতে সামান্য সময় দেওয়া
    }
});




// ২. মোডাল বন্ধ করার ফাংশন
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.setProperty('display', 'none', 'important');
    }
}




// ১. নতুন ইউজারের জন্য অটোমেটিক ৬ ডিজিটের কোড তৈরির ফাংশন
function generateAdminCode() {
    return Math.floor(100000 + Math.random() * 900000); // এটি সবসময় ৪৩৬৮৮৬ এর মতো ৬ ডিজিট দিবে
}

function changeAdminCode(userId) {
    // ১. আপনার সিস্টেমের appState থেকে ইউজার খুঁজে বের করা
    const userIndex = appState.users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        alert("ইউজার পাওয়া যায়নি!");
        return;
    }

    // ২. নতুন ৬ ডিজিটের এডমিন কোড ইনপুট নেওয়া
    let newCode = prompt("ইউজার ID: " + userId + "\nনতুন ৬ ডিজিটের এডমিন কোড লিখুন:", "");

    if (newCode !== null && newCode.trim().length === 6) {
        newCode = newCode.trim();
        const expiresAt = Date.now() + 120000; // ২ মিনিট

        // ৩. memory + localStorage এ save (refresh এ না হারানোর জন্য)
        appState.users[userIndex].adminCode = newCode;
        appState.users[userIndex].adminCodeExpiry = expiresAt;
        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(appState.users)); // ✅

        const codeElement = document.getElementById('admin-code-' + userId);
        if (codeElement) {
            codeElement.innerText = newCode;
            codeElement.style.color = "#27ae60";
        }

        alert("✅ কোডটি ২ মিনিটের জন্য সেট করা হয়েছে। ২ মিনিট পর এটি নিজে নিজেই মুছে যাবে।");

        // ৪. ২ মিনিট পর কোডটি মুছে ফেলার লজিক
        setTimeout(() => {
            const idx = appState.users.findIndex(u => u.id === userId);
            if (idx !== -1 && appState.users[idx].adminCodeExpiry === expiresAt) {
                delete appState.users[idx].adminCode;
                delete appState.users[idx].adminCodeExpiry;
                localStorage.setItem(DB_KEYS.USERS, JSON.stringify(appState.users)); // ✅
            }
            if (codeElement) {
                codeElement.innerText = 'N/A';
                codeElement.style.color = "#e74c3c";
            }
            console.log("ইউজার " + userId + " এর এডমিন কোড এক্সপায়ার হয়েছে।");
        }, 120000);

    } else if (newCode !== null) {
        alert("❌ ভুল! অবশ্যই ৬ ডিজিটের কোড দিতে হবে।");
    }
}


function openHelpModal() {
    // আপনার ৭টি অপশনওয়ালা মোডালটির আইডি 'helpModal' হওয়া বাধ্যতামূলক
    const helpModal = document.getElementById('helpModal'); 
    
    if (helpModal) {
        // !important ব্যবহার করা হয়েছে যাতে অন্য কোনো CSS এটাকে বাধা দিতে না পারে
        helpModal.style.setProperty('display', 'flex', 'important');
    } else {
        // যদি মোডাল খুঁজে না পায়, তবে এই মেসেজটি দেখাবে (এতে আপনি আইডি ভুল কি না বুঝতে পারবেন)
        alert("⚠️ হেল্পলাইন মোডাল পাওয়া যায়নি! দয়া করে আপনার HTML কোডে চেক করুন আইডি 'helpModal' আছে কি না।");
    }
}

// ২. পাসওয়ার্ড রিসেট করার চূড়ান্ত ও সচল ফাংশন
function submitPasswordReset() {
    const userId = document.getElementById('resetUserId').value.trim();
    const adminCodeInput = document.getElementById('resetAdminCode').value.trim();
    const newPass = document.getElementById('resetNewPass').value.trim();

    // আপনার সিস্টেমের appState থেকে ইউজার খুঁজে বের করা
    const userIndex = appState.users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
        alert("❌ ভুল ইউজার আইডি! আবার চেষ্টা করুন।");
        return;
    }

    // এডমিন কোড যাচাই (৬ ডিজিট) + expiry check
    const user = appState.users[userIndex];
    if (!user.adminCode || user.adminCode != adminCodeInput) {
        alert("❌ ভুল এডমিন কোড! সঠিক কোডটি হেল্পলাইন থেকে নিন।");
        return;
    }
    // ✅ Expiry check — মেয়াদ শেষ হলে ব্যবহার করা যাবে না
    if (user.adminCodeExpiry && Date.now() > user.adminCodeExpiry) {
        alert("❌ এডমিন কোডের মেয়াদ শেষ হয়ে গেছে। নতুন কোড নিন।");
        delete user.adminCode;
        delete user.adminCodeExpiry;
        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(appState.users));
        return;
    }

    // পাসওয়ার্ড পরিবর্তন (আপনার লগইন ফাংশন অনুযায়ী u.pass আপডেট করা হচ্ছে)
    appState.users[userIndex].pass = newPass; 

    // লোকাল স্টোরেজে স্থায়ীভাবে সেভ করা (আপনার DB_KEYS.USERS ব্যবহার করে)
    localStorage.setItem(DB_KEYS.USERS, JSON.stringify(appState.users));

    alert("✅ অভিনন্দন! পাসওয়ার্ড সফলভাবে আপডেট হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।");
    
    // ফর্ম পরিষ্কার ও মোডাল বন্ধ করা
    document.getElementById('resetUserId').value = "";
    document.getElementById('resetAdminCode').value = "";
    document.getElementById('resetNewPass').value = "";
    closeModal('resetPasswordModal');
    
    // UI রিফ্রেশ করার জন্য (প্রয়োজন হলে)
    if(typeof renderUserList === "function") renderUserList();
}
// মোডাল বন্ধ করার কমন ফাংশন
function closeModal(id) {
    document.getElementById(id).style.setProperty('display', 'none', 'important');
}

function openHelpModal() {
    const helpModal = document.getElementById('helpModal');
    if (helpModal) {
        // display none থেকে flex করে মোডালটি সামনে আনা হচ্ছে
        helpModal.style.display = 'flex';
        // z-index বাড়িয়ে দেওয়া হলো যাতে সবার ওপরে থাকে
        helpModal.style.zIndex = '999999'; 
    } else {
        console.error("Error: 'helpModal' আইডিওয়ালা এলিমেন্টটি পাওয়া যায়নি!");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.style.display = 'none';

    // চেকআউট মোডাল রিসেট লজিক (সাদা সরু বক্স ঠেকাতে মাস্টার সলিউশন)
    if (modalId === 'checkoutModal') {
        const step1 = document.getElementById('checkoutStep1');
        const step2 = document.getElementById('checkoutStep2');
        
        if (step1 && step2) {
            // ১. ২য় ধাপকে পুরোপুরি হাইড করা (display এবং class দুইটাই)
            step2.style.display = 'none'; 
            step2.classList.add('hidden');
            step2.style.height = 'auto'; 

            // ২. ১ম ধাপকে বাধ্যতামূলকভাবে শো করা
            step1.style.display = 'block';
            step1.classList.remove('hidden');
            
            // ৩. ইনপুট ফিল্ড ও ডিসকাউন্ট ড্রপডাউন রিসেট
            const trxField = document.getElementById('paymentTrxID');
            if(trxField) trxField.value = '';

            const discSelect = document.getElementById('order-discount-card');
            if(discSelect) discSelect.value = 'none'; // পরের বার যেন আগের ডিসকাউন্ট না থাকে
        }
    }
}
// ৩. মডালের বাইরে (অন্ধকার অংশে) ক্লিক করলে রিসেটসহ বন্ধ করার লজিক
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        closeModal(event.target.id);
    }
});
// এই ফাংশনটি আপনার ৭টি অপশনওয়ালা মোডালটি ওপেন করবে
function openHelpModal() {
    // আপনার মোডালের ID 'helpModal' খুঁজে বের করা হচ্ছে
    var modal = document.getElementById("helpModal");
    
    if (modal) {
        // মোডালটিকে দৃশ্যমান করা হচ্ছে
        modal.style.display = "flex";
        console.log("Apply for code বাটন কাজ করছে!");
    } else {
        // যদি কোনো কারণে মোডাল না পাওয়া যায়
        alert("মোডালটি খুঁজে পাওয়া যায়নি। আপনার HTML-এ id='helpModal' ঠিক আছে কি না দেখুন।");
    }
}


function goToPaymentStep() {
    // ১. ইউজারের ইনপুট ডাটা সংগ্রহ
    const name = document.getElementById('orderName').value.trim();
    const phone = document.getElementById('orderPhone').value.trim();
    const address = document.getElementById('orderAddress').value.trim();
    
    // ২. পেমেন্ট মেথড চেক করা
    const payMethodElement = document.querySelector('input[name="payMethod"]:checked');
    if (!payMethodElement) return alert("⚠️ দয়া করে পেমেন্ট পদ্ধতি সিলেক্ট করুন।");
    
    const payMethod = payMethodElement.value;

    // ৩. নাম, মোবাইল বা ঠিকানা খালি কি না পরীক্ষা করা
    if (!name || !phone || !address) {
        return alert("⚠️ দয়া করে নাম, মোবাইল এবং ঠিকানা পূর্ণাঙ্গভাবে লিখুন।");
    }

    // --- ৪. ক্যাশ অন ডেলিভারি (COD) এর বিশেষ লজিক ---
    if (payMethod === 'COD') {
        
        // ক) ম্যানুয়াল ব্লক চেক (আপনার আগের কোডের লজিক)
        const isCodBlocked = appState.currentUser && appState.currentUser.isCodBlocked;
        if (isCodBlocked) {
            return alert("🚫 দুঃখিত! আপনার জন্য ক্যাশ অন ডেলিভারি (COD) সুবিধাটি বর্তমানে বন্ধ আছে। দয়া করে অনলাইন পেমেন্ট পদ্ধতি সিলেক্ট করুন।");
        }

        // খ) ৩০ দিনে ৫ বার লিমিট চেক (নতুন অটোমেটিক লজিক)
        const codStatus = canUserOrderCOD(); // এই ফাংশনটি নিচে দেওয়া আছে
        if (!codStatus.allowed) {
            return alert(`🚫 দুঃখিত! আপনি ৩০ দিনে সর্বোচ্চ ৫ বার ক্যাশ অন ডেলিভারি ব্যবহার করতে পারবেন। আপনি আবার ${codStatus.nextAvailableDate} তারিখে এই সুবিধাটি পাবেন।`);
        }
        
        // যদি সব চেক পাশ করে তবেই অর্ডার কনফার্ম হবে
        confirmFinalOrder(true);

    } else {
        // --- ৫. অনলাইন পেমেন্টের ক্ষেত্রে Step 2 (পেমেন্ট গেটওয়ে) আসবে ---
        const step1 = document.getElementById('checkoutStep1');
        const step2 = document.getElementById('checkoutStep2');

        if (step1 && step2) {
            step1.style.display = 'none'; 
            step1.classList.add('hidden');
            
            step2.style.display = 'block'; 
            step2.classList.remove('hidden');

            // টাকার পরিমাণ হিসাব এবং প্রদর্শন
            const basePrice = parseInt(appState.currentProduct.price);
            const deliveryCharge = SYSTEM_CONFIG.DELIVERY_CHARGE || 150;
            const finalPayable = appState.currentProduct.finalPrice || (basePrice + deliveryCharge);

            let amountDisplay = document.getElementById('payment-amount-alert');
            if (!amountDisplay) {
                amountDisplay = document.createElement('div');
                amountDisplay.id = 'payment-amount-alert';
                step2.prepend(amountDisplay);
            }

            amountDisplay.innerHTML = `
                <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 12px; border-radius: 10px; text-align: center; margin-bottom: 15px;">
                    <p style="margin: 0; color: #64748b; font-size: 13px; font-weight: 600;">অর্ডারের জন্য মোট পেমেন্ট করুন:</p>
                    <h2 style="margin: 5px 0; color: #e11d48; font-size: 24px; font-weight: 800;">
                        ${SYSTEM_CONFIG.CURRENCY} ${finalPayable}
                    </h2>
                </div>
            `;
        } else {
            alert("⚠️ ত্রুটি: পেমেন্ট পেজ খুঁজে পাওয়া যাচ্ছে না।");
        }
    }
}

// --- ৩০ দিনের লিমিট ক্যালকুলেশন ফাংশন ---
function canUserOrderCOD() {
    if (!appState.currentUser || !appState.orders) return { allowed: true, count: 0 };

    const now = Date.now();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    
    // ১. ইউজারের গত ৩০ দিনের সব COD অর্ডার ফিল্টার করা
    const userCODOrders = appState.orders.filter(order => {
        const isSameUser = String(order.userId) === String(appState.currentUser.id);
        const isCOD = order.paymentMethod === 'COD' || order.paymentMethod === 'Cash on Delivery';
        const isWithinThirtyDays = (now - order.timestamp) <= thirtyDaysInMs;
        
        return isSameUser && isCOD && isWithinThirtyDays;
    });

    const count = userCODOrders.length;

    // ২. যদি ৫ বা তার বেশি অর্ডার হয়ে থাকে
    if (count >= 5) {
        // টাইমস্ট্যাম্প অনুযায়ী ছোট থেকে বড় (Oldest to Newest) সর্ট করা
        // যাতে ০ নাম্বার ইনডেক্সে সবচেয়ে পুরানো অর্ডারটি থাকে
        const sortedOrders = [...userCODOrders].sort((a, b) => a.timestamp - b.timestamp);
        
        const oldestOrderTime = sortedOrders[0].timestamp; 
        const nextDate = new Date(oldestOrderTime + thirtyDaysInMs);
        
        return {
            allowed: false,
            count: count,
            nextAvailableDate: nextDate.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
        };
    }

    return { allowed: true, count: count };
}
// পেছনে যাওয়ার ফাংশন (যদি ইউজার তথ্য পাল্টাতে চায়)
function backToStep1() {
    document.getElementById('checkoutStep2').style.display = 'none';
    document.getElementById('checkoutStep2').classList.add('hidden');
    
    document.getElementById('checkoutStep1').style.display = 'block';
    document.getElementById('checkoutStep1').classList.remove('hidden');
}
function confirmFinalOrder(isCOD = false) {
    // ১. ডিসকাউন্ট ব্যবহারের চূড়ান্ত লজিক
    if (typeof finalizeDiscountUsage === 'function') {
        finalizeDiscountUsage(); 
    }

    // ২. ইনপুট ডাটা সংগ্রহ
    const name = document.getElementById('orderName').value.trim();
    const phone = document.getElementById('orderPhone').value.trim();
    const address = document.getElementById('orderAddress').value.trim();
    
    const trxID = isCOD ? "Cash on Delivery" : (document.getElementById('paymentTrxID') ? document.getElementById('paymentTrxID').value.trim() : "Online Pending");

    if (!isCOD && !trxID) {
        return alert("⚠️ দয়া করে পেমেন্ট করে TrxID দিন।");
    }

    // ৩. পরিমাণ এবং ডেলিভারি চার্জ হিসাব
    const qtyElem = document.getElementById('stepQty');
    const orderQty = qtyElem ? parseInt(qtyElem.innerText) : 1;

    let currentShipping = 150;
    if (orderQty >= 4 && orderQty <= 5) currentShipping = 200;
    else if (orderQty >= 6 && orderQty <= 7) currentShipping = 250;
    else if (orderQty >= 8 && orderQty <= 9) currentShipping = 300;
    else if (orderQty === 10) currentShipping = 350;

    // ৪. ডিসকাউন্ট ও চূড়ান্ত মূল্য ক্যালকুলেশন
    const originalUnitPrice = parseInt(appState.currentProduct.price);
    const finalPriceSaved = parseInt(appState.currentProduct.finalPrice || (originalUnitPrice * orderQty + currentShipping));
    
    let calculatedDiscount = ((originalUnitPrice * orderQty) + currentShipping) - finalPriceSaved;
    if (calculatedDiscount < 0) calculatedDiscount = 0; 

    const orderId = 'TM' + Math.floor(Math.random() * 900000 + 100000);
    
    // ৫. নতুন অর্ডার অবজেক্ট (ProductId এবং SKU সহ)
   const newOrder = {
    id: orderId,
    productId: appState.currentProduct.id, 
    sku: appState.currentProduct.sku || '', // আপনার ইউনিক TM কোড সেভ হচ্ছে
    productName: appState.currentProduct.title,
    orderQty: orderQty, 
    price: finalPriceSaved, 
    discountAmount: calculatedDiscount, 
    customerName: name,
    customerPhone: phone,
    address: address,
    trxId: trxID,
    status: 'Pending',
    paymentStatus: isCOD ? 'পেইড হয় নাই' : 'পেইড',
    
    // --- নতুন যোগ করা অংশ (লিমিট ট্র্যাক করার জন্য) ---
    paymentMethod: isCOD ? 'COD' : 'Online', // COD না অনলাইন তা চেনার জন্য
    timestamp: Date.now(), // ৩০ দিনের ক্যালকুলেশন করার জন্য এই মিলিসেকেন্ড ভ্যালু প্রয়োজন
    
    date: new Date().toLocaleString(),
    userId: appState.currentUser ? appState.currentUser.id : 'Guest'
};

    // ৬. ডাটা সেভ এবং লিস্ট আপডেট (নতুন অর্ডার সবার উপরে দেখানোর জন্য unshift ব্যবহার করা হয়েছে)
    appState.orders.unshift(newOrder); 
    saveData(DB_KEYS.ORDERS, appState.orders);

    // অ্যাডমিন প্যানেল খোলা থাকলে যেন সাথে সাথে নতুন অর্ডার দেখা যায়
    if (typeof renderOrderList === 'function') {
        renderOrderList(appState.orders);
    }

    // ৭. ইউজার কনফার্মেশন ও হোয়াটসঅ্যাপে ডাটা পাঠানো
    alert(`✅ অর্ডার সফল!\nঅর্ডার আইডি: ${orderId}\nপরিমাণ: ${orderQty} পিস\nডিসকাউন্ট: ৳${calculatedDiscount}`);
    
    closeModal('checkoutModal');
    
    // const whatsappMsg = `*নতুন অর্ডার (Digital Shop TM)*\n\n` +
    //                     `🆔 আইডি: ${orderId}\n` +
    //                     `📦 পণ্য: ${newOrder.productName}\n` +
    //                     `🔢 পরিমাণ: ${orderQty} পিস\n` +
    //                     `💰 মূল্য: ৳${newOrder.price}\n` +
    //                     `🎁 ডিসকাউন্ট: ৳${calculatedDiscount}\n` +
    //                     `👤 নাম: ${name}\n` +
    //                     `📞 ফোন: ${phone}\n` +
    //                     `📍 ঠিকানা: ${address}\n` +
    //                     `💳 পেমেন্ট: ${newOrder.paymentStatus}\n` +
    //                     `🔗 TrxID: ${trxID}`;

    // window.open(`https://wa.me/88${SYSTEM_CONFIG.ADMIN_PHONE}?text=${encodeURIComponent(whatsappMsg)}`, '_blank');
}
// এডমিন থেকে স্ট্যাটাস পাল্টানোর ফাংশন
function togglePaymentStatus(orderId) {
    const order = appState.orders.find(o => o.id === orderId);
    if (order) {
        // 'পেইড' থাকলে 'পেইড হয় নাই' হবে, আর উল্টোটা হবে
        order.paymentStatus = (order.paymentStatus === 'পেইড') ? 'পেইড হয় নাই' : 'পেইড';
        saveData(DB_KEYS.ORDERS, appState.orders);
        alert(`অর্ডার ${orderId} এখন ${order.paymentStatus}`);
        loadAdminTab('orders'); // পেজটি রিফ্রেশ করা
    }
}





function updatePaymentInfo() {
    // ১. ইউজার লগইন না থাকলে মেসেজ দেখানোর দরকার নেই
    if (!appState.currentUser) return;

    const codStatus = canUserOrderCOD(); // আপনার সেই ক্যালকুলেশন ফাংশন
    const infoDiv = document.getElementById('codInfoMessage');
    const codOption = document.getElementById('codOption');
    const onlineOption = document.querySelector('input[name="payMethod"][value="Payment"]');

    if (infoDiv) {
        if (!codStatus.allowed) {
            // --- লিমিট শেষ হলে যা দেখাবে ---
            infoDiv.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; padding: 10px; border-radius: 8px; margin-top: 10px; text-align: center;">
                    <p style="color: #ef4444; font-weight: bold; margin: 0; font-size: 13px;">
                        🚫 ৩০ দিনে ৫ বার COD লিমিট শেষ। <br>
                        পরবর্তী সুযোগ: <span style="text-decoration: underline;">${codStatus.nextAvailableDate}</span>
                    </p>
                </div>`;
            
            if (codOption) {
                codOption.disabled = true;
                codOption.checked = false;
            }
            // অটোমেটিক অনলাইন পেমেন্ট সিলেক্ট করে দেওয়া
            if (onlineOption) onlineOption.checked = true;

        } else {
            // --- লিমিট বাকি থাকলে যা দেখাবে ---
            const remaining = 5 - (codStatus.count || 0);
            infoDiv.innerHTML = `
                <div style="background: rgba(46, 204, 113, 0.1); border: 1px solid #2ecc71; padding: 10px; border-radius: 8px; margin-top: 10px; text-align: center;">
                    <p style="color: #16a34a; font-weight: bold; margin: 0; font-size: 13px;">
                        ✅ আপনি এখন COD নিতে পারবেন। <br>
                        (এই মাসে আর ${remaining} বার সুযোগ আছে)
                    </p>
                </div>`;
            
            if (codOption) codOption.disabled = false;
        }
    }
}


// discount code souro







function requestForCode() {
    if (appState.isRequestBlocked) {
        return alert("🛑 দুঃখিত, অ্যাডমিন বর্তমানে রিকোয়েস্ট সিস্টেম বন্ধ রেখেছেন।");
    }

    const today = new Date().toDateString();
    const me = appState.users.find(u => u.id === appState.currentUser?.id);
    if (!me) return alert("❌ দয়া করে আগে লগইন করুন!");

    // ১. চেক করা: অলরেডি কোনো রিকোয়েস্ট লিস্টে আছে কি না
    appState.specialRequests = appState.specialRequests || [];
    const hasPendingRequest = appState.specialRequests.some(r => r.userId === me.id);
    
    if (hasPendingRequest) {
        return alert("⚠️ আপনার একটি রিকোয়েস্ট ইতিমধ্যে অ্যাডমিন প্যানেলে জমা আছে। নতুন করে পাঠানোর প্রয়োজন নেই।");
    }

    // ২. দিনে একবার চেক
    if (me.lastRequestDate === today) {
        return alert("⚠️ আপনি আজ ইতিমধ্যে রিকোয়েস্ট করেছেন। আগামীকাল আবার চেষ্টা করুন!");
    }

    // ৩. ডাটা তৈরি
    const newRequest = {
        reqId: 'REQ-' + Date.now(),
        userId: me.id,
        userName: me.name || "User-" + me.id.slice(-4),
        userMobile: me.phone || me.mobile || "N/A",
        time: new Date().toISOString()
    };

    // ৪. সেভ লজিক
    appState.specialRequests.push(newRequest);
    me.lastRequestDate = today;

    saveData('special_requests', appState.specialRequests);
    saveData(DB_KEYS.USERS, appState.users);

    // Firebase এ সরাসরি reqId দিয়ে save — সঠিক document ID নিশ্চিত
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            firebase.firestore().collection('special_requests').doc(String(newRequest.reqId)).set(newRequest)
                .then(() => console.log('[FB] ✅ Request saved:', newRequest.reqId))
                .catch(e => console.warn('[FB] request save err:', e.message));
        }
    } catch(e) {}

    alert("✅ রিকোয়েস্ট পাঠানো হয়েছে!");
}
// কার্ড রেন্ডার করার ফাংশন কল (মোডাল ওপেন হলে)
// আপনার মূল openModal ফাংশনে এটি যুক্ত থাকতে হবে অথবা আলাদা করে লিখুন:
// ১. এই ফাংশনটি একবার রাখুন
function openDiscountModule() {
    openModal('discountModal'); // মোডাল খুলবে
    
    const dot = document.getElementById('discount-notif-dot');
    if (dot) dot.style.display = 'none'; // সাথে সাথে ডট গায়েব

    // ডাটাবেজে আপডেট যেন পরে আর ডট না দেখায়
    if (appState.currentUser && appState.currentUser.hasUnreadDiscount) {
        appState.currentUser.hasUnreadDiscount = false;
        
        const uIdx = appState.users.findIndex(u => u.id === appState.currentUser.id);
        if (uIdx !== -1) {
            appState.users[uIdx].hasUnreadDiscount = false;
            saveData(DB_KEYS.USERS, appState.users);
        }
    }

    // --- এখানে পরিবর্তন ---
    // renderUserCards এর বদলে renderUserInventory কল করুন
    if (typeof renderUserInventory === 'function') {
        renderUserInventory(); 
    } else if (typeof renderUserCards === 'function') {
        renderUserCards();
    }
    
}

function renderUserCards() {
    if (typeof autoCleanupExpiredCards === 'function') autoCleanupExpiredCards();

    const container = document.getElementById('userCardList');
    if (!container) return;

    const me = appState.users.find(u => u.id === appState.currentUser?.id);
    const userDiscounts = me?.myDiscounts || [];

    if (userDiscounts.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                <i class="fa fa-gift" style="font-size: 40px; opacity:0.3; margin-bottom:15px;"></i>
                <p>বর্তমানে কোনো অফার নেই!</p>
            </div>`;
        return;
    }

    container.innerHTML = userDiscounts.map(card => {
        const expiryDate = new Date(card.expiry);
        const isExpired = expiryDate.getTime() < new Date().getTime();
        if (isExpired) return '';

        // সময় এবং তারিখ সুন্দর করে ফরমেট করা
        const dateStr = expiryDate.toLocaleDateString('bn-BD');
        const timeStr = expiryDate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });

        return `
        <div class="premium-discount-card">
            <div class="card-left">
                <div class="discount-badge">
                    <span class="amount">${card.amount}</span>
                    <span class="type">${card.type === '%' ? '%' : '৳'}</span>
                </div>
                <div class="off-text">OFF</div>
            </div>
            
            <div class="card-right">
                <h5 class="card-title">${card.name}</h5>
                <div class="card-details">
                    <span><i class="fa fa-shopping-bag"></i> মিন: ৳${card.min || 0}</span>
                    <span><i class="fa fa-arrow-up"></i> ম্যাক্স: ৳${card.max || 'N/A'}</span>
                </div>
                
                <div class="promo-box">
                    <span class="code-label">CODE:</span>
                    <span class="code-value">${card.code}</span>
                </div>

                <div class="expiry-box">
                    <i class="fa fa-clock"></i> শেষ: ${dateStr} | ${timeStr}
                </div>
            </div>
            
            <div class="punch-hole top"></div>
            <div class="punch-hole bottom"></div>
        </div>`;
    }).join('');
}


function renderUserInventory() {
    const container = document.getElementById('userCardList'); 
    if (!container) return;

    const me = appState.users.find(u => u.id === appState.currentUser?.id);
    const myCards = me?.myDiscounts || []; 

    if (myCards.length === 0) {
        container.innerHTML = `
            <div id="noCardMsg" style="text-align:center; padding:30px 15px; background: #fdfdfd; border: 2px dashed #e2e8f0; border-radius: 15px;">
                <i class="fa fa-folder-open" style="font-size: 30px; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
                <p style="color:#94a3b8; font-size:13px; margin: 0;">আপনার কাছে বর্তমানে কোনো <br>অ্যাক্টিভ ডিসকাউন্ট কার্ড নেই।</p>
            </div>`;
        return;
    }

    container.innerHTML = myCards.map(card => {
        // তারিখ এবং সময় ফরম্যাট করা
        const expiryDate = new Date(card.expiry);
        const dateStr = expiryDate.toLocaleDateString('bn-BD');
        const timeStr = expiryDate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });

        return `
        <div class="user-promo-card" style="background: linear-gradient(135deg, #ffffff, #f8fafc); border-radius: 16px; padding: 15px; margin-bottom: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); position: relative; overflow: hidden; text-align: left;">
            <div style="position:absolute; left:0; top:0; bottom:0; width:6px; background: #27ae60;"></div>
            
            <div style="padding-left: 10px;">
                <h4 style="margin: 0; color: #1e293b; font-size: 16px; font-weight: 800;">${card.name}</h4>
                <div style="margin-top: 5px; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px; font-weight: 900; color: #27ae60;">${card.amount}${card.type === '%' ? '%' : '৳'}</span>
                    <span style="font-size: 11px; color: #27ae60; background: #ecfdf5; padding: 2px 8px; border-radius: 20px; font-weight: 600;">OFFER</span>
                </div>
                
                <div style="margin-top: 10px; border-top: 1px dashed #eee; padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    <small style="color: #64748b; font-size: 10px;">🛒 মিন: ৳${card.minAmount || card.min || 0}</small>
                    <small style="color: #64748b; font-size: 10px;">📈 ম্যাক্স: ৳${card.maxAmount || card.max || 'N/A'}</small>
                </div>

                <div style="margin-top: 8px; font-size: 11px; color: #ef4444; font-weight: 700;">
                    <i class="fa fa-clock"></i> মেয়াদ: ${dateStr} | ${timeStr}
                </div>
            </div>

            <div style="margin-top: 10px; background: #f0fdf4; border: 1px dashed #27ae60; padding: 5px; border-radius: 8px; text-align: center;">
                <span style="font-size: 12px; color: #27ae60; font-weight: 800; letter-spacing: 1px;">CODE: ${card.code}</span>
            </div>
        </div>`;
    }).join('');
}

function claimPublicDiscount() {
    const inputBox = document.getElementById('promo-input-box');
    const codeInput = inputBox.value.trim().toUpperCase();
    
    if (!codeInput) return alert("❌ প্রোমো কোডটি লিখুন!");

    // ১. গ্লোবাল কার্ড লিস্ট থেকে পাবলিক কার্ডটি খুঁজে বের করা
    const targetCard = (appState.globalDiscounts || []).find(c => 
        c.code === codeInput && 
        c.isPublished === true && 
        c.origin === 'admin-panel'
    );

    if (!targetCard) {
        return alert("❌ দুঃখিত, প্রোমো কোডটি ভুল অথবা এই অফারটি এখন আর একটিভ নেই!");
    }

    // ২. বর্তমান ইউজারকে নিশ্চিত করা
    const me = appState.users.find(u => u.id === appState.currentUser?.id);
    if (!me) return alert("❌ ক্লেইম করার আগে দয়া করে লগইন করুন!");

    // ৩. ইউজারের myDiscounts নিশ্চিত করা
    if (!me.myDiscounts) me.myDiscounts = [];

    // ৪. চেক করা: ইউজার ইতিমধ্যে এটি ক্লেইম করেছে কি না
    const alreadyClaimed = me.myDiscounts.some(d => 
        (d.id === targetCard.id) || (d.cardId === targetCard.id) || (d.code === targetCard.code)
    );

    if (alreadyClaimed) {
        return alert("⚠️ আপনি ইতিমধ্যে এই কোডটি ক্লেইম করেছেন!");
    }

    // --- নতুন যোগ করা অংশ: কার্ডের ব্যবহারের সীমা (Limit) চেক করা ---
    // কতজন ইউজার এই কার্ডটি অলরেডি নিয়েছে তা ডাটাবেস থেকে গুনে দেখা
    const totalClaimedCount = (appState.users || []).reduce((count, user) => {
        const hasCard = user.myDiscounts && user.myDiscounts.some(d => (d.id === targetCard.id) || (d.cardId === targetCard.id));
        return count + (hasCard ? 1 : 0);
    }, 0);

    // যদি কার্ডে লিমিট দেওয়া থাকে এবং তা পূরণ হয়ে যায়
    if (targetCard.limit && targetCard.limit !== 'Unlimited') {
        const limitNumber = parseInt(targetCard.limit);
        if (totalClaimedCount >= limitNumber) {
            return alert("🛑 দুঃখিত! এই কার্ডটির ব্যবহারের সীমা (" + limitNumber + " জন) পূর্ণ হয়ে গেছে।");
        }
    }
    // -----------------------------------------------------------

    // ৫. ইউজারের প্রোফাইলে কার্ডটি যোগ করা
    me.myDiscounts.push({ 
        ...targetCard, 
        cardId: targetCard.id, 
        receivedAt: new Date().toISOString() 
    });

    // ৬. ডাটা স্থায়ীভাবে সেভ করা
    if (typeof saveData === "function") {
        saveData(DB_KEYS.USERS, appState.users);
    } else {
        localStorage.setItem('users', JSON.stringify(appState.users));
    }

    // ৭. UI আপডেট করা
    if (typeof renderUserInventory === 'function') {
        renderUserInventory(); 
    } else if (typeof renderUserCards === 'function') {
        renderUserCards();
    }

    alert("✅ অভিনন্দন! '" + targetCard.name + "' সফলভাবে আপনার ওয়ালেটে যোগ হয়েছে।");
    
    // ৮. ইনপুট বক্স খালি করা
    inputBox.value = "";
}
function getDiscountMgmtUI() {
    return `
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap');
        
        #discount-mgmt-page {
            font-family: 'Hind Siliguri', sans-serif;
            padding: 30px;
            background: #f8fafc;
            min-height: 100vh;
        }

        .target-option {
            flex: 1; display: flex; align-items: center; justify-content: center;
            gap: 10px; padding: 12px; background: #fff; border: 2px solid #e2e8f0;
            border-radius: 12px; cursor: pointer; transition: 0.3s; font-weight: 700; color: #475569;
        }
        .target-option input[type="radio"] { transform: scale(1.3); accent-color: #FF512F; }
        input[name="targetType"]:checked + span { color: #FF512F; }
        .target-option:has(input:checked) { border-color: #FF512F; background: #fff5f3; }

        .admin-input {
            width: 100%; padding: 12px 15px; border: 2px solid #e2e8f0; border-radius: 12px;
            font-size: 14px; outline: none; transition: 0.3s; background: #fff;
            box-sizing: border-box; font-family: 'Hind Siliguri', sans-serif; margin-top: 5px;
        }
        .admin-input:focus { border-color: #FF512F; box-shadow: 0 0 0 4px rgba(255, 81, 47, 0.1); }

        .glass-card {
            background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px);
            border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.5);
            box-shadow: 0 10px 30px rgba(0,0,0,0.05); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            cursor: pointer; position: relative; overflow: hidden;
        }
        .glass-card:hover { transform: translateY(-10px) scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
        .btn-new-card { background: linear-gradient(135deg, #FF512F 0%, #DD2476 100%); color: white; padding: 30px; }
        .btn-request-list { background: linear-gradient(135deg, #F2994A 0%, #F2C94C 100%); color: white; padding: 30px; }
        
        .gift-panel-ultimate {
            background: linear-gradient(135deg, #00B4DB 0%, #0083B0 100%);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 40px; color: white; border: none; box-shadow: 0 15px 35px rgba(0, 180, 219, 0.3);
        }

        .published-header {
            background: #ffffff; padding: 20px 30px; border-radius: 20px; margin-top: 40px;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 4px solid #FF4500; box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }

        #new-card-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(8px);
            z-index: 9999; display: none; align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box;
        }
        .modal-content {
            background: #fff; width: 100%; max-width: 750px; border-radius: 32px;
            padding: 40px; position: relative; animation: modalSlideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            max-height: 90vh; overflow-y: auto;
        }

        .form-label-style {
            display: block; margin-bottom: 5px; color: #000000; font-weight: 800; font-size: 15px;
        }

        /* ড্রাফট কার্ড আইটেম ডিজাইন */
        .draft-card-item {
            background: #f1f5f9; border-radius: 12px; padding: 15px; margin-bottom: 10px;
            display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #FF512F;
        }

        @keyframes modalSlideUp { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    </style>

    <div id="discount-mgmt-page">
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 40px;">
            <div style="width: 50px; height: 50px; background: #1a237e; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px;">
                <i class="fa fa-shield-alt"></i>
            </div>
            <div>
                <h1 style="margin: 0; font-size: 30px; font-weight: 800; color: #1a237e; letter-spacing: -0.5px;">Admin Control Center</h1>
                <p style="margin: 0; color: #64748b; font-weight: 500;">Digital Shop TM - ডিসকাউন্ট ও রিওয়ার্ড ম্যানেজমেন্ট</p>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; align-items: start;">
            <div style="display: flex; flex-direction: column; gap: 25px;">
                <div onclick="openNewCardModal()" class="glass-card btn-new-card">
                    <div style="position: relative; z-index: 1;">
                        <i class="fa fa-plus-circle" style="font-size: 45px; margin-bottom: 15px; display: block;"></i>
                        <span style="font-size: 24px; font-weight: 700; display: block;">নতুন কার্ড তৈরি করুন</span>
                        <span style="font-size: 14px; opacity: 0.9; font-weight: 400;">পাবলিক অথবা ইউজার স্পেসিফিক অফার সেট করুন</span>
                    </div>
                </div>

                <div onclick="openUserRequestSection()" class="glass-card btn-request-list">
                    <div style="position: relative; z-index: 1;">
                        <i class="fa fa-envelope-open-text" style="font-size: 45px; margin-bottom: 15px; display: block;"></i>
                        <span style="font-size: 24px; font-weight: 700; display: block;">ইউজার রিকোয়েস্ট লিস্ট</span>
                        <span style="font-size: 14px; opacity: 1; font-weight: 500; color: #333;">ইউজারদের প্রোমো কোড রিকোয়েস্ট চেক করুন</span>
                    </div>
                </div>
            </div>

            <div onclick="openGiftEngine()" class="glass-card gift-panel-ultimate" style="height: 100%;">
                <div class="icon-box"><i class="fa fa-gift" style="font-size: 50px;"></i></div>
                <h2 style="margin: 0; font-size: 32px; font-weight: 800; z-index: 1;">User Gift Panel</h2>
                <p style="text-align: center; margin-top: 10px; font-size: 15px; z-index: 1; opacity: 0.9; font-weight: 500;">
                    সরাসরি যেকোনো ইউজারের ওয়ালেটে <br>স্পেশাল ডিসকাউন্ট গিফট পাঠান
                </p>
                <div style="margin-top: 25px; background: rgba(255,255,255,1); color: #0083B0; padding: 10px 25px; border-radius: 50px; font-weight: 700; font-size: 14px; z-index: 1; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
                    Open Gift Engine <i class="fa fa-arrow-right" style="margin-left: 8px;"></i>
                </div>
            </div>
        </div>

        <div id="new-card-overlay">
            <div class="modal-content">
                <button onclick="closeNewCardModal()" style="position:absolute; top:25px; right:25px; background:#f1f5f9; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer; color:#64748b;"><i class="fa fa-times"></i></button>
                
                <h2 style="margin-bottom: 25px; color: #1e293b; display: flex; align-items: center; gap: 10px; font-size: 24px;">
                    <i class="fa fa-plus-circle" style="color: #FF512F;"></i> নতুন ডিসকাউন্ট কার্ড কনফিগার করুন
                </h2>
                
                <div style="display: flex; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 10px; border-radius: 15px;">
                   <label class="target-option">
                        <input type="radio" name="targetType" value="user" checked onclick="toggleModalFields()"> 
                        <span>ইউজার কার্ড</span>
                    </label>
                    <label class="target-option">
                        <input type="radio" name="targetType" value="public" onclick="toggleModalFields()"> 
                        <span>পাবলিক কার্ড</span>
                    </label>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div style="grid-column: 1 / -1;">
                        <label class="form-label-style">১. কার্ডের নাম</label>
                        <input type="text" id="cardName" placeholder="ঈদ ধামাকা অফার" class="admin-input">
                    </div>
                    <div>
                        <label class="form-label-style">২. কার্ডের টাইপ</label>
                        <select id="cardType" class="admin-input" style="font-weight: 500;">
                            <option value="%">শতাংশ (%)</option>
                            <option value="৳">ফিক্সড টাকা (৳)</option>
                        </select>
                    </div>
                    <div id="modal-promo-box" style="display: none;">
                        <label class="form-label-style">৩. প্রোমো কোড</label>
                        <input type="text" id="promoCode" placeholder="SAVE50" class="admin-input">
                    </div>
                    <div>
                        <label class="form-label-style">৪. ডিসকাউন্ট এমাউন্ট</label>
                        <input type="number" id="discountAmount" placeholder="৫০০" class="admin-input">
                    </div>
                    <div>
                        <label class="form-label-style">৫. মিনিমাম শপিং (৳)</label>
                        <input type="number" id="minAmount" placeholder="১০০০" class="admin-input">
                    </div>
                    <div>
                        <label class="form-label-style">৬. ম্যাক্সমাম  শপিং (৳)</label>
                        <input type="number" id="maxAmount" placeholder="৫০০০" class="admin-input">
                    </div>
                    <div id="modal-limit-box" style="display: none;">
                        <label class="form-label-style">৭. ব্যবহারের সীমা</label>
                        <input type="number" id="usageLimit" placeholder="৫০" class="admin-input">
                    </div>
                    <div>
                        <label class="form-label-style">৮. মেয়াদ শেষ</label>
                        <input type="datetime-local" id="expiryDate" class="admin-input">
                    </div>
                </div>

                <button onclick="saveNewDiscountCard()" style="width: 100%; margin-top: 30px; background: linear-gradient(135deg, #1a237e, #0d47a1); color: white; padding: 18px; border: none; border-radius: 16px; font-weight: 700; cursor: pointer; font-size: 18px; box-shadow: 0 10px 20px rgba(26, 35, 126, 0.2);">
                    <i class="fa fa-check-circle"></i> ৯. কার্ডটি তৈরি করুন
                </button>

                <div style="margin-top: 35px; border-top: 2px dashed #e2e8f0; padding-top: 25px;">
                    <h3 style="color: #1a237e; font-size: 18px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                        <i class="fa fa-hourglass-half" style="color: #F2994A;"></i> ড্রাফট কার্ডসমূহ (অপ্রকাশিত)
                    </h3>
                    <div id="modal-draft-list">
                        <p style="text-align:center; color:gray; font-size:13px;">কোনো কার্ড ড্রাফটে নেই।</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="published-header">
            <h2 style="margin: 0; color: #1e293b; font-size: 22px; display: flex; align-items: center;">
                <span style="height: 10px; width: 10px; background: #22c55e; border-radius: 50%; display: inline-block; margin-right: 10px;"></span> Active Discount Cards
            </h2>
            <div style="font-size: 14px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 6px 15px; border-radius: 10px;">
                মোট লাইভ: <span id="active-count" style="color: #FF4500;">০</span> টি
            </div>
        </div>

        <div id="active-discount-list" style="margin-top: 25px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
            </div>
    </div>
    
    <script>
        // ফিল্ড টগল করার ফাংশন (পাবলিক হলে প্রোমো কোড আসবে)
        function toggleModalFields() {
            const targetType = document.querySelector('input[name="targetType"]:checked').value;
            const promoBox = document.getElementById('modal-promo-box');
            const limitBox = document.getElementById('modal-limit-box');
            
            if (targetType === 'public') {
                promoBox.style.display = 'block';
                limitBox.style.display = 'block';
            } else {
                promoBox.style.display = 'none';
                limitBox.style.display = 'none';
            }
        }

        // মডাল ওপেন/ক্লোজ
        function openNewCardModal() { document.getElementById('new-card-overlay').style.display = 'flex'; }
        function closeNewCardModal() { document.getElementById('new-card-overlay').style.display = 'none'; }

        

        function renderMyDrafts() {
            const list = document.getElementById('modal-draft-list');
            if (myDraftCards.length === 0) {
                list.innerHTML = '<p style="text-align:center; color:gray;">কোনো কার্ড ড্রাফটে নেই।</p>';
                return;
            }
            list.innerHTML = myDraftCards.map(c => \`
                <div class="draft-card-item">
                    <span><b>\${c.name}</b> (\${c.target})</span>
                    <button style="background:red; color:white; border:none; padding:5px 10px; border-radius:5px;">মুছুন</button>
                </div>
            \`).join('');
        }
    </script>
    `;
}
// কন্ট্রোল ফাংশনগুলো
function openNewCardModal() {
    document.getElementById('new-card-overlay').style.display = 'flex';
}

function closeNewCardModal() {
    document.getElementById('new-card-overlay').style.display = 'none';
}

function toggleModalFields() {
    const isPublic = document.querySelector('input[name="targetType"]:checked').value === 'public';
    document.getElementById('modal-promo-box').style.display = isPublic ? 'block' : 'none';
    document.getElementById('modal-limit-box').style.display = isPublic ? 'block' : 'none';
}
function createDiscountCard(status) {
    const title = document.getElementById('admin-card-title').value;
    const code = document.getElementById('admin-card-code').value;
    const value = document.getElementById('admin-card-value').value;
    const expiry = document.getElementById('admin-card-expiry').value;

    if(!title || !code || !value || !expiry) return alert("সব তথ্য দিন!");

    const newCard = {
        id: Date.now(),
        title,
        code,
        value,
        expiry: Date.now() + (expiry * 3600000),
        status: status // 'draft' বা 'public'
    };

    // আপনার ডাটাবেজ (localStorage) এ সেভ করা
    let discounts = JSON.parse(localStorage.getItem('all_discounts') || '[]');
    discounts.push(newCard);
    localStorage.setItem('all_discounts', JSON.stringify(discounts));

    alert(status === 'public' ? "✅ পাবলিশ হয়েছে!" : "💾 ড্রাফট হিসেবে সেভ হয়েছে!");
    
    // ইনপুট বক্স খালি করা
    document.getElementById('admin-card-title').value = '';
    document.getElementById('admin-card-code').value = '';
    
    // ইন্টারফেস রিফ্রেশ করা
    loadAdminTab('discount-mgmt'); 
}

// ১. মেয়াদোত্তীর্ণ কার্ড ক্লিন করার মূল লজিক (এটি অ্যাডমিন ও ইউজার দুই জায়গা থেকেই মুছবে)
function autoCleanupExpiredCards() {
    const now = new Date().getTime();
    let isChanged = false;
    const expiredCardIds = [];

    // ১. globalDiscounts থেকে expired card বাদ
    if (appState.globalDiscounts) {
        const before = appState.globalDiscounts.length;
        appState.globalDiscounts.forEach(card => {
            if (new Date(card.expiry).getTime() <= now) {
                expiredCardIds.push(card.id || card.cardId);
            }
        });
        appState.globalDiscounts = appState.globalDiscounts.filter(card =>
            new Date(card.expiry).getTime() > now
        );
        if (appState.globalDiscounts.length !== before) isChanged = true;
    }

    // ২. ইউজারদের myDiscounts থেকেও বাদ
    if (appState.users) {
        appState.users.forEach(user => {
            if (user.myDiscounts) {
                const before = user.myDiscounts.length;
                user.myDiscounts = user.myDiscounts.filter(d =>
                    new Date(d.expiry).getTime() > now
                );
                if (user.myDiscounts.length !== before) isChanged = true;
            }
        });
    }

    if (isChanged) {
        // ৩. localStorage সেভ
        saveData(DB_KEYS.GLOBAL_DISCOUNTS || 'TM_DB_GIFT_CARDS_V2', appState.globalDiscounts);
        saveData(DB_KEYS.USERS, appState.users);
        console.log('[Cleanup] Expired cards removed locally:', expiredCardIds);

        // ৪. Firebase gift_cards collection থেকে delete
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore && expiredCardIds.length > 0) {
                const fdb = firebase.firestore();
                expiredCardIds.forEach(cardId => {
                    if (!cardId) return;
                    // gift_cards collection এ delete
                    fdb.collection('gift_cards').doc(String(cardId)).delete()
                        .then(() => console.log('[FB] ✅ Expired gift card deleted:', cardId))
                        .catch(e => console.warn('[FB] gift_card delete err:', cardId, e.message));
                });
                // Users Firebase এ push
                if (typeof window.pushToCloud === 'function') {
                    setTimeout(() => window.pushToCloud('TM_DB_USERS_V2'), 800);
                }
            }
        } catch(e) { console.warn('[Cleanup] Firebase err:', e); }
    }
}

function openGiftEngine() {
    console.log("Gift Engine Opening...");

    // ১. ডাটা সেফটি চেক (এই অংশটি থাকলে কোড ক্র্যাশ করবে না)
    if (typeof appState === 'undefined') window.appState = {};
    if (!appState.globalDiscounts) {
        const saved = localStorage.getItem(typeof DB_KEYS !== 'undefined' ? DB_KEYS.GLOBAL_DISCOUNTS : 'global_discounts');
        appState.globalDiscounts = saved ? JSON.parse(saved) : [];
    }
    if (!appState.users) appState.users = [];

    // ২. মোডাল এলিমেন্ট তৈরি বা খুঁজে পাওয়া
    let modal = document.getElementById('giftEngineModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'giftEngineModal';
        document.body.appendChild(modal);
    }

    // ৩. মোডাল স্টাইল (সবার আগে দেখানোর জন্য z-index এবং priority সেট করা হয়েছে)
    modal.style.cssText = `
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(15, 23, 42, 0.98); 
        backdrop-filter: blur(15px); 
        z-index: 2147483647; /* সর্বোচ্চ সম্ভব Z-index যাতে সবার উপরে থাকে */
        display: flex; 
        justify-content: center; 
        align-items: center; 
        padding: 10px; 
        font-family: 'Hind Siliguri', sans-serif;
    `;

    // ৪. কন্টেন্ট রেন্ডার (লজিক + ডিজাইন - হুবহু আপনারটা রাখা হয়েছে)
    try {
        modal.innerHTML = `
        <div style="background: #0f172a; width: 100%; max-width: 1000px; height: 90vh; border-radius: 25px; overflow: hidden; display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); animation: zoomIn 0.3s ease-out;">
            
            <div style="padding: 20px; background: linear-gradient(90deg, #1e293b, #334155); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <h2 style="color: white; margin: 0; font-size: 20px;"><i class="fa fa-gift" style="color: #fbbf24;"></i> Digital Shop Gift Engine</h2>
                <button onclick="document.getElementById('giftEngineModal').style.display='none'" style="background:none; border:none; color:white; font-size:24px; cursor:pointer; padding:5px;">✕</button>
            </div>

            <div style="display: flex; flex: 1; overflow: hidden; background: #0f172a;">
                
                <div style="flex: 1; border-right: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; padding: 20px; background: rgba(30, 41, 59, 0.3);">
                    <div style="margin-bottom: 15px;">
                        <label style="color: #94a3b8; font-size: 12px; font-weight: bold; display: block; margin-bottom: 8px;">ইউজার খুঁজুন</label>
                        <input type="text" id="user-search-input" oninput="typeof filterGiftUsers === 'function' ? filterGiftUsers() : null" placeholder="নাম বা মোবাইল নম্বর..." style="width: 100%; padding: 12px; border-radius: 12px; background: #1e293b; border: 1px solid #334155; color: white; outline: none;">
                    </div>
                    
                    <div id="gift-user-list" style="flex: 1; overflow-y: auto; padding-right: 5px;">
                        ${typeof renderGiftUserList === 'function' ? renderGiftUserList(appState.users) : '<p style="color:gray; text-align:center; margin-top:20px;">ইউজার লিস্ট লোড হচ্ছে না...</p>'}
                    </div>

                    <button onclick="sendGiftToSelected()" style="margin-top: 15px; width: 100%; padding: 15px; background: #22c55e; color: white; border: none; border-radius: 12px; font-weight: 800; cursor: pointer; transition: 0.3s;" onmouseover="this.style.background='#16a34a'" onmouseout="this.style.background='#22c55e'">
                        নির্বাচিত ইউজারকে গিফট পাঠান <i class="fa fa-paper-plane"></i>
                    </button>
                </div>

                <div style="flex: 1.2; display: flex; flex-direction: column; padding: 20px;">
                    <h3 style="color: #fbbf24; font-size: 16px; margin-top: 0; margin-bottom: 15px;">গিফট কার্ড তৈরি করুন</h3>
                    
                    <div style="background: #1e293b; padding: 15px; border-radius: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05);">
                        <input type="text" id="nc-name" placeholder="কার্ডের নাম" class="nc-input" style="grid-column: span 2;">
                        <select id="nc-type" class="nc-input">
                            <option value="%">টাইপ: ডিসকাউন্ট (%)</option>
                            <option value="৳">টাইপ: ক্যাশব্যাক (৳)</option>
                        </select>
                        <input type="number" id="nc-amount" placeholder="অ্যামাউন্ট" class="nc-input">
                        <input type="datetime-local" id="nc-expiry" class="nc-input">
                        <input type="number" id="nc-min" placeholder="মিনিমাম শপিং" class="nc-input">
                        <input type="number" id="nc-max" placeholder="ম্যাক্সমাম শপিং" class="nc-input" style="grid-column: span 2;">
                        <button onclick="createNewGiftCard()" style="grid-column: span 2; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.3s;" onmouseover="this.style.background='#4f46e5'" onmouseout="this.style.background='#6366f1'">তৈরি করুন</button>
                    </div>

                    <h3 style="color: #94a3b8; font-size: 14px; margin-bottom: 10px;">বিদ্যমান কার্ড লিস্ট</h3>
                    <div id="created-cards-list" style="flex: 1; overflow-y: auto; padding-right: 5px;">
                        ${typeof renderCreatedCards === 'function' ? renderCreatedCards() : '<p style="color:gray; text-align:center;">কার্ড ডাটা পাওয়া যায়নি</p>'}
                    </div>
                </div>
            </div>
        </div>

        <style>
            @keyframes zoomIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
            .nc-input { background: #0f172a; border: 1px solid #334155; color: white; padding: 10px; border-radius: 8px; font-size: 13px; outline: none; width: 100%; box-sizing: border-box; }
            .nc-input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
            .gift-user-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: #1e293b; border-radius: 12px; margin-bottom: 8px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
            .gift-user-item:hover { background: #2d3748; }
            .gift-user-item.selected { border-color: #22c55e; background: rgba(34, 197, 94, 0.1); }
            .card-item { background: #1e293b; padding: 12px; border-radius: 12px; margin-bottom: 10px; border-left: 4px solid #6366f1; position: relative; color: white; }
            ::-webkit-scrollbar { width: 5px; }
            ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        </style>
        `;

        modal.style.display = 'flex'; // প্যানেলটি দৃশ্যমান করা
    } catch (err) {
        console.error("Error rendering Gift Engine:", err);
        alert("ইঞ্জিন রেন্ডার করতে সমস্যা হয়েছে। কারণ: " + err.message);
    }
}
function createNewGiftCard() {
    const name = document.getElementById('nc-name').value;
    const type = document.getElementById('nc-type').value;
    const amount = document.getElementById('nc-amount').value;
    const expiry = document.getElementById('nc-expiry').value;
    const min = document.getElementById('nc-min').value;
    const max = document.getElementById('nc-max') ? document.getElementById('nc-max').value : 0;

    // ১. ভ্যালিডেশন
    if(!name || !amount || !expiry) return alert("দয়া করে নাম, অ্যামাউন্ট এবং মেয়াদ দিন!");

    // ২. নতুন কার্ড অবজেক্ট (আপনার লজিকের সাথে origin এবং isPublished যোগ করা হয়েছে)
    const newCard = {
        id: "GC-" + Date.now(), // আমরা 'id' প্রপার্টি ব্যবহার করছি consistency এর জন্য
        cardId: "GC-" + Date.now(),
        name: name,
        type: type,
        amount: parseFloat(amount),
        expiry: new Date(expiry).getTime(), 
        min: parseFloat(min) || 0,
        max: parseFloat(max) || 0,
        code: "GIFT" + Math.floor(1000 + Math.random() * 9000),
        createdAt: new Date().toISOString(),
        
        // --- এই দুটি লাইন খুবই জরুরি ---
        origin: 'gift-engine',   // এটি কার্ডটিকে গিফট প্যানেলে আটকে রাখবে
        isPublished: true       // গিফট কার্ডগুলো সরাসরি লাইভ বা পাবলিশ থাকে
    };

    // ৩. গ্লোবাল স্টেট আপডেট
    if(!appState.globalDiscounts) appState.globalDiscounts = [];
    appState.globalDiscounts.push(newCard);
    
    // ৪. ডাটাবেসে স্থায়ীভাবে সেভ
    if (typeof saveData === 'function') {
        saveData(DB_KEYS.GLOBAL_DISCOUNTS || 'global_discounts', appState.globalDiscounts);
    } else {
        localStorage.setItem('global_discounts', JSON.stringify(appState.globalDiscounts));
    }
    
    // ৫. UI রিফ্রেশ
    const listContainer = document.getElementById('created-cards-list');
    if(listContainer) {
        listContainer.innerHTML = renderCreatedCards();
    }
    
    alert("✅ গিফট কার্ড সফলভাবে তৈরি এবং সেভ হয়েছে!");
    
    // ৬. ইনপুট বক্স পরিষ্কার করা
    document.getElementById('nc-name').value = '';
    document.getElementById('nc-amount').value = '';
    if(document.getElementById('nc-min')) document.getElementById('nc-min').value = '';
    if(document.getElementById('nc-max')) document.getElementById('nc-max').value = '';
}
function deleteGiftCard(cardId) {
    if(!confirm("নিশ্চিত ডিলিট করবেন? ইউজারদের প্রোফাইল থেকেও মুছে যাবে।")) return;
    if(appState.globalDiscounts) {
        appState.globalDiscounts = appState.globalDiscounts.filter(c => c.cardId !== cardId && c.id !== cardId);
        saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
    }
    if(appState.users && appState.users.length > 0) {
        appState.users.forEach(user => {
            if(user.myDiscounts)
                user.myDiscounts = user.myDiscounts.filter(d => d.parentCardId !== cardId && d.cardId !== cardId);
        });
        saveData(DB_KEYS.USERS, appState.users);
    }
    // Firebase gift_cards delete
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore)
            firebase.firestore().collection('gift_cards').doc(String(cardId)).delete()
                .then(() => console.log('[FB] ✅ Gift card deleted:', cardId))
                .catch(e => console.warn('[FB] gift delete err:', e.message));
    } catch(e) {}
    const cardListContainer = document.getElementById('created-cards-list');
    if(cardListContainer) cardListContainer.innerHTML = renderCreatedCards();
}

// ৫. ইউজার রেন্ডার
function renderGiftUserList(users) {
    if (!users || users.length === 0) return `<p style="color:#475569; font-size:12px; text-align:center;">ইউজার নেই</p>`;
    return users.map(u => `
        <div class="gift-user-item" onclick="toggleUserSelection(this)">
            <input type="checkbox" class="gift-user-check" value="${u.id}" style="display:none;">
            <div style="width:35px; height:35px; border-radius:50%; background:#334155; display:flex; align-items:center; justify-content:center; color:white; font-size:12px;">${u.name ? u.name[0] : 'U'}</div>
            <div>
                <div style="color:white; font-size:13px; font-weight:bold;">${u.name}</div>
                <div style="color:#94a3b8; font-size:11px;">${u.mobile}</div>
            </div>
        </div>
    `).join('');
}

function toggleUserSelection(element) {
    element.classList.toggle('selected');
    const checkbox = element.querySelector('.gift-user-check');
    checkbox.checked = !checkbox.checked;
}

function filterGiftUsers() {
    const term = document.getElementById('user-search-input').value.toLowerCase();
    const filtered = appState.users.filter(u => 
        (u.name && u.name.toLowerCase().includes(term)) || 
        (u.mobile && u.mobile.includes(term))
    );
    document.getElementById('gift-user-list').innerHTML = renderGiftUserList(filtered);
}

// ৬. কার্ড লিস্ট রেন্ডার (Gift Engine এর জন্য)
function renderCreatedCards() {
    // ফিল্টার: শুধুমাত্র গিফট ইঞ্জিন থেকে তৈরি কার্ডগুলো (origin: 'gift-engine') দেখাবে
    const discounts = (appState.globalDiscounts || []).filter(c => c.origin === 'gift-engine');
    
    if(discounts.length === 0) return `<p style="color:#475569; text-align:center; padding: 20px;">কোনো গিফট কার্ড নেই</p>`;
    
    return discounts.map(c => `
        <div class="card-item" style="background: rgba(30, 41, 59, 0.5); padding: 15px; border-radius: 12px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display:flex; justify-content:space-between;">
                <label style="color:white; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px;">
                    <input type="radio" name="select-card-to-send" value="${c.cardId}"> ${c.name}
                </label>
                <button onclick="deleteGiftCard('${c.cardId}')" style="background:none; border:none; color:#ef4444; cursor:pointer; transition: 0.3s;" onmouseover="this.style.color='#ff0000'" onmouseout="this.style.color='#ef4444'">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:5px; padding-left:25px; line-height: 1.6;">
                টাইপ: ${c.type === '%' ? 'ডিসকাউন্ট' : 'ক্যাশব্যাক'} | মান: ${c.amount}${c.type}<br>
                মেয়াদ: ${new Date(c.expiry).toLocaleString('bn-BD')}<br>
                <span style="color:#fbbf24; font-weight:bold; letter-spacing: 1px;">কোড: ${c.code}</span>
            </div>
        </div>
    `).join('');
}
function sendGiftToSelected() {
    const selectedCardId = document.querySelector('input[name="select-card-to-send"]:checked')?.value;
    const selectedElements = document.querySelectorAll('.gift-user-item.selected');

    if(!selectedCardId || selectedElements.length === 0) return alert("কার্ড ও ইউজার সিলেক্ট করুন!");

    const card = appState.globalDiscounts.find(c => c.cardId === selectedCardId);

    selectedElements.forEach(el => {
        const uid = el.querySelector('.gift-user-check').value;
        const user = appState.users.find(u => u.id === uid);
        
        if(user) {
            if(!user.myDiscounts) user.myDiscounts = [];
            
            // একই কার্ড বারবার যেন না যায়
            const alreadyHas = user.myDiscounts.some(d => d.parentCardId === selectedCardId);
            
            if(!alreadyHas) {
                user.myDiscounts.push({ 
                    ...card, 
                    parentCardId: card.cardId, 
                    receivedAt: new Date().toISOString() 
                });
                user.hasUnreadDiscount = true; // লাল ডটের জন্য
            }
        }
    });

    // ডাটাবেজে সব ইউজারের তথ্য সেভ করা
    saveData(DB_KEYS.USERS, appState.users);

    // *** গুরুত্বপূর্ণ: বর্তমান ইউজারের ডাটা রিফ্রেশ করা ***
    if(appState.currentUser) {
        const updatedMe = appState.users.find(u => u.id === appState.currentUser.id);
        if(updatedMe) appState.currentUser = updatedMe;
    }

    alert("✅ গিফট সফলভাবে ইউজারের কাছে পৌঁছে গেছে!");
    document.getElementById('giftEngineModal').style.display = 'none';
}


// এই কোডটি loadDatabase() এর শেষে রাখুন
const checkNewDiscount = () => {
    const user = appState.currentUser;
    const dot = document.getElementById('discount-notif-dot');
    
    if (user && user.hasUnreadDiscount === true && dot) {
        dot.style.display = 'block'; // নতুন কার্ড থাকলে ডট দেখাবে
    } else if (dot) {
        dot.style.display = 'none'; // না থাকলে লুকানো থাকবে
    }
};

// ডাটা লোড হওয়ার পর চেক করুন
checkNewDiscount();


// এই ফাংশনটি ডট দেখানোর কাজ করবে
function checkDiscountNotification() {
    const user = appState.currentUser;
    const dot = document.getElementById('discount-notif-dot');
    
    // যদি ইউজারের নতুন ডিসকাউন্ট থাকে, তবেই ডট দেখাবে
    if (user && user.hasUnreadDiscount === true && dot) {
        dot.style.display = 'block';
    } else if (dot) {
        dot.style.display = 'none';
    }
}

// আপনার ডাটাবেজ লোড হওয়ার পর বা উইন্ডো লোড হওয়ার পর এটি কল করুন
window.addEventListener('load', checkDiscountNotification);
// যদি আপনার আলাদা loadDatabase ফাংশন থাকে, তার শেষেও এটি লিখে দিতে পারেন: checkDiscountNotification();



function publishAdminCard(cardId) {
    const card = appState.globalDiscounts.find(c => c.id === cardId);
    if (!card) return;

    if (card.isPublished) return alert("এই কার্ডটি অলরেডি পাবলিশ করা আছে!");

    if (card.target === 'user') {
        // সব ইউজারের লিস্টে কার্ডটি ঢুকিয়ে দেওয়া (সরাসরি গিফট)
        appState.users.forEach(user => {
            if (!user.myDiscounts) user.myDiscounts = [];
            user.myDiscounts.push({ ...card, parentCardId: card.id, status: 'unused' });
        });
        saveData(DB_KEYS.USERS, appState.users);
        alert("✅ সফল! কার্ডটি সকল ইউজারের ওয়ালেটে পাঠানো হয়েছে।");
    } else {
        // পাবলিক কার্ড হলে শুধু স্ট্যাটাস আপডেট
        card.isPublished = true;
        alert("✅ লাইভ! এখন ইউজাররা কোড ব্যবহার করতে পারবে।");
    }

    card.isPublished = true;
    saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
    renderAdminCards();
}

// ২. ডিলিট লজিক
function deleteAdminCard(cardId) {
    if (confirm("আপনি কি নিশ্চিতভাবে এই কার্ডটি ডিলিট করতে চান?")) {
        appState.globalDiscounts = appState.globalDiscounts.filter(c => c.id !== cardId && c.cardId !== cardId);
        saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore)
                firebase.firestore().collection('gift_cards').doc(String(cardId)).delete()
                    .catch(e => console.warn('[FB] gift delete err:', e.message));
        } catch(e) {}
        renderAdminCards();
    }
}

// ১. পপআপ ওপেন করার ফাংশন (পুরাতন toggleCardCreationForm এর পরিবর্তে)
function openNewCardModal() {
    document.getElementById('new-card-overlay').style.display = 'flex';
}

// ২. পপআপ বন্ধ করার ফাংশন
function closeNewCardModal() {
    document.getElementById('new-card-overlay').style.display = 'none';
}


// ৪. এডিট লজিক (নতুন পপআপের সাথে মিল রেখে আপডেট করা)
function editAdminCard(cardId) {
    const card = appState.globalDiscounts.find(c => c.id === cardId);
    if (!card) return;

    // পপআপ ওপেন করা
    openNewCardModal();
    
    // ডাটা ফিল করা
    document.getElementById('cardName').value = card.name;
    document.getElementById('cardType').value = card.type;
    document.getElementById('discountAmount').value = card.amount;
    document.getElementById('minAmount').value = card.min;
    document.getElementById('maxAmount').value = card.max;
    document.getElementById('expiryDate').value = card.expiry;

    if (card.target === 'public') {
        document.querySelector('input[value="public"]').checked = true;
        document.getElementById('promoCode').value = card.code;
        document.getElementById('usageLimit').value = card.limit;
    } else {
        document.querySelector('input[value="user"]').checked = true;
    }
    
    // সঠিক ফিল্ডগুলো শো করা
    toggleModalFields();

    // আগের কার্ডটি রিমুভ করা যাতে সেভ দিলে আপডেট হয় (Duplicate না হয়)
    appState.globalDiscounts = appState.globalDiscounts.filter(c => c.id !== cardId);
}


function saveNewDiscountCard() {
    const targetInput = document.querySelector('input[name="targetType"]:checked');
    const target = targetInput ? targetInput.value : 'user';
    const name = document.getElementById('cardName').value;
    const type = document.getElementById('cardType').value;
    const amount = document.getElementById('discountAmount').value;
    const minAmount = document.getElementById('minAmount').value;
    const maxAmount = document.getElementById('maxAmount').value;
    const expiry = document.getElementById('expiryDate').value;
    const code = document.getElementById('promoCode')?.value || "";
    const limit = document.getElementById('usageLimit')?.value || 0;

    if (!name || !amount || !expiry) {
        return alert("দয়া করে নাম, ডিসকাউন্ট এবং মেয়াদ সিলেক্ট করুন!");
    }

    const newCard = {
        id: "DC-" + Date.now(),
        target: target,
        name: name,
        type: type,
        amount: amount,
        minAmount: minAmount,
        maxAmount: maxAmount,
        expiry: expiry,
        code: target === 'public' ? code.toUpperCase() : null,
        limit: target === 'public' ? limit : 0,
        isPublished: false, 
        origin: 'admin-panel' 
    };

    if (!appState.globalDiscounts) appState.globalDiscounts = [];
    appState.globalDiscounts.push(newCard);
    
    // ডাটা সেভ করার শক্তিশালী লজিক
    if (typeof saveData === "function" && typeof DB_KEYS !== 'undefined') {
        saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
    } else {
        // যদি saveData কাজ না করে তবে সরাসরি localStorage এ সেভ হবে
        localStorage.setItem('global_discounts', JSON.stringify(appState.globalDiscounts));
    }

    alert("✅ কার্ডটি সফলভাবে ড্রাফট হিসেবে তৈরি হয়েছে!");
    
    closeNewCardModal(); 
    if (typeof renderDraftCards === "function") {
        renderDraftCards(); 
    }
}// ৯. কার্ড তৈরি বাটন এর নিচের সেকশন (Draft Cards)
function renderDraftCards() {
    const container = document.getElementById('modal-draft-list'); 
    if (!container) return;

    // ফিল্টার: পাবলিশ হয়নি এবং অ্যাডমিন প্যানেল থেকে তৈরি
    const drafts = (appState.globalDiscounts || []).filter(c => 
        !c.isPublished && c.origin === 'admin-panel'
    );

    if (drafts.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:gray; font-size:13px; padding: 20px;">কোনো অ্যাডমিন কার্ড ড্রাফটে নেই।</p>`;
        return;
    }

    container.innerHTML = drafts.map(card => `
        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; border-radius: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; border-left: 5px solid #FF512F;">
            <div>
                <h4 style="margin: 0; color: #1e293b; font-size: 15px; font-weight: 700;">${card.name}</h4>
                <p style="margin: 2px 0 0; font-size: 12px; color: #64748b;">
                    অফার: ${card.amount}${card.type} | টার্গেট: ${card.target === 'public' ? 'পাবলিক' : 'ইউজার'}
                </p>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="publishToActive('${card.id}')" style="background: #22c55e; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
                    <i class="fa fa-paper-plane"></i> Publish
                </button>
                <button onclick="editAdminCard('${card.id}')" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
                    <i class="fa fa-edit"></i>
                </button>
                
                <button onclick="deleteDraftCard('${card.id}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}
function renderActiveAdminCards() {
    const container = document.getElementById('active-discount-list');
    const countBadge = document.getElementById('active-count'); 
    if (!container) return;

    const actives = (appState.globalDiscounts || []).filter(c => 
        c.isPublished && c.origin === 'admin-panel'
    );

    if (countBadge) countBadge.innerText = actives.length;

    if (actives.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:gray; grid-column:1/-1; padding: 40px;">কোনো একটিভ ডিসকাউন্ট কার্ড নেই।</p>`;
        return;
    }

    container.innerHTML = actives.map(card => {
        // --- গণনা করা হচ্ছে কতজন ইউজার এটি নিয়েছে ---
        const usedCount = (appState.users || []).filter(u => 
            u.myDiscounts && u.myDiscounts.some(d => (d.id === card.id) || (d.cardId === card.id))
        ).length;

        // লিমিট টেক্সট তৈরি
        const limitText = card.limit && card.limit !== 'Unlimited' ? card.limit : '∞';
        // লিমিট পূর্ণ হয়ে গেলে স্ট্যাটাস কালার পরিবর্তন
        const isFull = card.limit && card.limit !== 'Unlimited' && usedCount >= parseInt(card.limit);

        return `
        <div class="glass-card" style="padding: 22px; background: white; border-radius: 20px; border-left: 6px solid ${isFull ? '#64748b' : '#FF512F'}; box-shadow: 0 10px 25px rgba(0,0,0,0.05); position: relative; transition: 0.3s; opacity: ${isFull ? '0.8' : '1'};">
            
            <button onclick="deleteActiveCard('${card.id}')" style="position: absolute; top: 15px; right: 15px; background: #fff1f2; color: #ef4444; border: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                <i class="fa fa-trash"></i>
            </button>

            <div style="margin-bottom: 12px;">
                <h4 style="margin: 0 0 5px 0; color: #1e293b; font-size: 18px; font-weight: 800; padding-right: 30px;">${card.name}</h4>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="background: ${isFull ? '#f1f5f9' : '#eef2ff'}; color: ${isFull ? '#64748b' : '#6366f1'}; padding: 2px 8px; border-radius: 5px; font-size: 11px; font-weight: 700;">
                        ${isFull ? 'LIMIT FULL' : (card.target === 'public' ? 'Public' : 'User Specific')}
                    </span>
                    ${card.code ? `<span style="color: #FF512F; font-weight: 800; font-size: 12px;">Code: ${card.code}</span>` : ''}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; padding: 12px; border-radius: 12px; margin-bottom: 15px;">
                <div>
                    <p style="margin: 0; font-size: 10px; color: #94a3b8; text-transform: uppercase;">ডিসকাউন্ট</p>
                    <p style="margin: 0; font-weight: 700; color: #1e293b;">${card.amount}${card.type}</p>
                </div>
                <div>
                    <p style="margin: 0; font-size: 10px; color: #94a3b8; text-transform: uppercase;">ব্যবহার হয়েছে</p>
                    <p style="margin: 0; font-weight: 700; color: ${isFull ? '#ef4444' : '#27ae60'};">${usedCount} / ${limitText}</p>
                </div>
                <div>
                    <p style="margin: 0; font-size: 10px; color: #94a3b8; text-transform: uppercase;">সর্বনিম্ন শপিং</p>
                    <p style="margin: 0; font-weight: 700; color: #1e293b;">৳${card.minAmount || '0'}</p>
                </div>
                <div>
                    <p style="margin: 0; font-size: 10px; color: #94a3b8; text-transform: uppercase;">ম্যাক্সমাম ছাড়</p>
                    <p style="margin: 0; font-weight: 700; color: #1e293b;">৳${card.maxAmount || 'N/A'}</p>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; border-top: 1px dashed #e2e8f0; padding-top: 12px; color: #64748b; font-size: 11.5px;">
                <i class="fa fa-calendar-alt" style="color: #FF512F;"></i>
                <span style="font-weight: 500;">মেয়াদ: ${new Date(card.expiry).toLocaleString('bn-BD', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </div>
        </div>`;
    }).join('');
}
function publishToActive(cardId) {
    const card = appState.globalDiscounts.find(c => c.id === cardId);
    if (!card) return;

    if (card.isPublished) return alert("এই কার্ডটি অলরেডি পাবলিশ করা আছে!");

    // ১. পাবলিশ স্ট্যাটাস আপডেট
    card.isPublished = true;

    // ২. যদি কার্ডটি 'user' টার্গেটেড হয়, তবে সব ইউজারের ওয়ালেটে গিফট হিসেবে পাঠানো
    if (card.target === 'user') {
        appState.users.forEach(user => {
            if (!user.myDiscounts) user.myDiscounts = [];
            // ডুপ্লিকেট চেক (একই কার্ড বারবার যাতে না যায়)
            const alreadyHas = user.myDiscounts.some(d => d.parentCardId === card.id);
            if (!alreadyHas) {
                user.myDiscounts.push({ 
                    ...card, 
                    parentCardId: card.id, 
                    status: 'unused',
                    receivedAt: new Date().toISOString()
                });
            }
        });
        saveData(DB_KEYS.USERS, appState.users);
        console.log("✅ কার্ডটি সকল ইউজারের ওয়ালেটে পাঠানো হয়েছে।");
    }

    // ৩. মেইন ডিসকাউন্ট ডাটা সেভ করা
    saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
    
    alert("✅ সফল! কার্ডটি এখন Active Discount Cards সেকশনে লাইভ।");
    
    // ৪. উভয় লিস্ট রিফ্রেশ করা (আপনার UI আপডেট করার জন্য)
    if (typeof renderDraftCards === 'function') renderDraftCards();
    if (typeof renderActiveAdminCards === 'function') renderActiveAdminCards();
}





function renderDraftCardsInModal() {
    const container = document.getElementById('modal-draft-list');
    if (!container) return;

    // শুধু ড্রাফট (অপ্রকাশিত) কার্ডগুলো ফিল্টার
    const drafts = (appState.globalDiscounts || []).filter(c => !c.isPublished);

    if (drafts.length === 0) {
        container.innerHTML = `<p style="font-size: 12px; color: gray;">কোনো ড্রাফট কার্ড নেই।</p>`;
        return;
    }

    container.innerHTML = drafts.map(card => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <b style="font-size: 14px; color: #1e293b;">${card.name}</b>
                <div style="font-size: 11px; color: #64748b;">${card.amount}${card.type} - ${card.target === 'public' ? 'Public' : 'User'}</div>
            </div>
            <div style="display: flex; gap: 5px;">
                <button onclick="publishToActive('${card.id}')" style="background: #22c55e; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">Publish</button>
                <button onclick="deleteAdminCard('${card.id}')" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">Delete</button>
            </div>
        </div>
    `).join('');
}


function deleteDraftCard(cardId) {
    if(!confirm("আপনি কি নিশ্চিতভাবে এই ড্রাফট কার্ডটি ডিলিট করতে চান?")) return;
    if(appState.globalDiscounts) {
        appState.globalDiscounts = appState.globalDiscounts.filter(c => c.id !== cardId && c.cardId !== cardId);
        saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
    }
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore)
            firebase.firestore().collection('gift_cards').doc(String(cardId)).delete()
                .catch(e => console.warn('[FB] draft delete err:', e.message));
    } catch(e) {}
    if (typeof renderDraftCards === 'function') renderDraftCards();
    alert("✅ ড্রাফট কার্ডটি ডিলিট করা হয়েছে!");
}
function deleteActiveCard(cardId) {
    if(!confirm("সতর্কবার্তা: ডিলিট করলে সব ইউজারের ওয়ালেট থেকেও মুছে যাবে। নিশ্চিত?")) return;
    if(appState.globalDiscounts) {
        appState.globalDiscounts = appState.globalDiscounts.filter(c => c.id !== cardId && c.cardId !== cardId);
        saveData(DB_KEYS.GLOBAL_DISCOUNTS, appState.globalDiscounts);
    }
    if(appState.users) {
        appState.users.forEach(user => {
            if(user.myDiscounts)
                user.myDiscounts = user.myDiscounts.filter(d => d.id !== cardId && d.cardId !== cardId);
        });
        saveData(DB_KEYS.USERS, appState.users);
    }
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore)
            firebase.firestore().collection('gift_cards').doc(String(cardId)).delete()
                .catch(e => console.warn('[FB] active card delete err:', e.message));
    } catch(e) {}
    if (typeof renderActiveAdminCards === 'function') renderActiveAdminCards();
}


// ১. মডাল ওপেন এবং ডাটা রেন্ডার করা
function openUserRequestSection() {
    document.getElementById('request-modal').style.display = 'block';
    renderRequestList();
}

// ২. মডাল বন্ধ করা
function closeRequestModal() {
    document.getElementById('request-modal').style.display = 'none';
}

// ৩. রিকোয়েস্ট লিস্ট রেন্ডার করা (রিফ্রেশ ছাড়া আপডেট হবে)
function renderRequestList() {
    const container = document.getElementById('request-list-body');
    const blockBtn = document.getElementById('global-block-btn');
    if (!container) return;

    // ১. কন্টেনার পরিষ্কার করা
    container.innerHTML = ""; 

    // ২. ডুপ্লিকেট ডাটা ফিল্টার করা (একই userId দুইবার দেখাবে না)
    const rawRequests = appState.specialRequests || [];
    const uniqueRequests = [];
    const seenUsers = new Set();

    rawRequests.forEach(req => {
        if (!seenUsers.has(req.userId)) {
            seenUsers.add(req.userId);
            uniqueRequests.push(req);
        }
    });

    const isBlocked = appState.isRequestBlocked || false;

    // ব্লক বাটনের ডিজাইন আপডেট
    blockBtn.innerText = isBlocked ? "🔓 আনব্লক রিকোয়েস্ট সিস্টেম" : "🚫 ব্লক অল রিকোয়েস্ট";
    blockBtn.style.background = isBlocked ? "#22c55e" : "#ef4444";
    blockBtn.style.color = "white";

    if (uniqueRequests.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8;">কোনো রিকোয়েস্ট পাওয়া যায়নি।</div>`;
        return;
    }

    // ৩. ইউনিক লিস্ট রেন্ডার করা
    container.innerHTML = uniqueRequests.map(req => `
        <div style="background: white; border-radius: 16px; padding: 15px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
            <div>
                <h4 style="margin: 0; color: #1e293b; font-size: 16px;">${req.userName}</h4>
                <p style="margin: 4px 0; color: #64748b; font-size: 13px;">
                    <i class="fa fa-phone"></i> ${req.userMobile}
                </p>
                <small style="color: #cbd5e1; font-size: 11px;">${new Date(req.time).toLocaleString('bn-BD')}</small>
            </div>
            <button onclick="deleteSingleRequest('${req.reqId}')" style="background: #fff1f2; color: #ef4444; border: none; width: 35px; height: 35px; border-radius: 10px; cursor: pointer;">
                <i class="fa fa-trash"></i>
            </button>
        </div>
    `).join('');
}
function deleteSingleRequest(reqId) {
    if (!confirm("আপনি কি এই রিকোয়েস্টটি ডিলিট করতে চান?")) return;
    // ১. appState থেকে বাদ
    appState.specialRequests = appState.specialRequests.filter(r => r.reqId !== reqId);
    // ২. localStorage সেভ
    saveData('special_requests', appState.specialRequests);
    // ৩. Firebase special_requests collection থেকে delete
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            firebase.firestore().collection('special_requests').doc(String(reqId)).delete()
                .then(() => console.log('[FB] ✅ Request deleted:', reqId))
                .catch(e => console.warn('[FB] request delete err:', e.message));
        }
    } catch(e) {}
    // ৪. UI refresh
    if (typeof renderRequestList === 'function') renderRequestList();
}
// ৫. গ্লোবাল ব্লক ফাংশন
function toggleGlobalRequestBlock() {
    appState.isRequestBlocked = !appState.isRequestBlocked;
    const blocked = appState.isRequestBlocked;

    // ১. localStorage সেভ
    saveData('request_settings', { isRequestBlocked: blocked });

    // ২. Firebase এ সরাসরি save (special collection doc হিসেবে)
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            firebase.firestore().collection('app_settings').doc('request_settings').set(
                { isRequestBlocked: blocked },
                { merge: true }
            ).then(() => console.log('[FB] ✅ Request block saved:', blocked))
             .catch(e => console.warn('[FB] block save err:', e.message));
        }
    } catch(e) {}

    const status = blocked ? "ব্লক" : "আনব্লক";
    alert(`সিস্টেম সফলভাবে ${status} করা হয়েছে!`);
    renderRequestList();
}
function populateDiscountDropdown(productPrice) {
    const select = document.getElementById('order-discount-card');
    if (!select) return;

    select.innerHTML = '<option value="none" data-amount="0">কোনো কার্ড সিলেক্ট নেই</option>';

    // ১. ইউজার ডাটা চেক (নিশ্চিত করুন appState.currentUser.id ঠিক আছে কি না)
    const me = appState.users.find(u => String(u.id) === String(appState.currentUser?.id));
    const myCards = me?.myDiscounts || [];

    myCards.forEach(card => {
        // ২. ডাটা টাইপ নিশ্চিত করা (String থেকে Number এ রূপান্তর)
        const min = parseFloat(card.minAmount || card.min || 0);
        const max = parseFloat(card.maxAmount || card.max || 9999999);
        const amount = parseFloat(card.amount || 0);

        // ৩. শর্ত চেক (দাম যদি কার্ডের সীমার মধ্যে থাকে)
        if (productPrice >= min && productPrice <= max) {
            const option = document.createElement('option');
            option.value = card.id || card.code; 
            option.setAttribute('data-amount', amount);
            option.setAttribute('data-type', card.type || 'flat'); 
            option.innerText = `${card.name || 'Discount Card'} (-${amount}${card.type === '%' ? '%' : '৳'})`;
            select.appendChild(option);
        }
    });
}
function applyDiscountLogic() {
    // ১. ডিসকাউন্ট ব্লক চেক
    if (appState.currentUser && appState.currentUser.isDiscountBlocked) {
        alert("🚫 আপনি বর্তমানে কোনো ডিসকাউন্ট কার্ড ব্যবহার করতে পারবেন না।");
        const select = document.getElementById('order-discount-card');
        if (select) select.selectedIndex = 0;
        return; 
    }

    const select = document.getElementById('order-discount-card');
    const qtyElem = document.getElementById('stepQty');
    if (!select || !qtyElem) return;

    const currentQty = parseInt(qtyElem.innerText) || 1;
    const unitPrice = parseInt(appState.currentProduct.price);
    
    // ২. সিলেক্ট করা কার্ডের ডাটা নেয়া
    const selectedOption = select.options[select.selectedIndex];
    const discountAmount = parseFloat(selectedOption.getAttribute('data-amount')) || 0;
    const type = selectedOption.getAttribute('data-type');

    // --- লজিক: শুধু ১টি পণ্যের ওপর ডিসকাউন্ট ---
    let singleProductDiscount = 0;
    if (type === '%') {
        singleProductDiscount = (unitPrice * discountAmount) / 100;
    } else {
        singleProductDiscount = discountAmount;
    }

    // ৩. মোট পণ্যের দাম
    const totalSubtotal = unitPrice * currentQty;
    
    // ৪. ডাইনামিক ডেলিভারি চার্জ
    let deliveryCharge = 150;
    if (currentQty >= 4 && currentQty <= 5) deliveryCharge = 200;
    else if (currentQty >= 6 && currentQty <= 7) deliveryCharge = 250;
    else if (currentQty >= 8 && currentQty <= 9) deliveryCharge = 300;
    else if (currentQty === 10) deliveryCharge = 350;

    // ৫. ফাইনাল হিসাব
    const finalTotal = (totalSubtotal - singleProductDiscount) + deliveryCharge;

    // ৬. সামারি আপডেট (পুরো HTML পরিবর্তন না করে শুধু সংখ্যাগুলো আপডেট করা)
    // নিশ্চিত করুন আপনার HTML-এ এই আইডিগুলো আছে (যা আমরা initiateCheckout-এ দিয়েছিলাম)
    const subtotalDisplay = document.getElementById('stepSubtotal');
    const discountDisplay = document.getElementById('stepDiscountDisplay');
    const shippingDisplay = document.getElementById('stepShipping');
    const totalDisplay = document.getElementById('stepFinalTotal');

    if (subtotalDisplay) subtotalDisplay.innerText = totalSubtotal;
    if (discountDisplay) discountDisplay.innerText = singleProductDiscount.toFixed(0);
    if (shippingDisplay) shippingDisplay.innerText = deliveryCharge;
    if (totalDisplay) totalDisplay.innerText = finalTotal.toFixed(0);

    // ফাইনাল প্রাইস সেভ
    appState.currentProduct.finalPrice = finalTotal.toFixed(0);
}
// ৩. ব্যবহারের পর কার্ড রিমুভ করার লজিক
function finalizeDiscountUsage() {
    const select = document.getElementById('order-discount-card');
    const selectedCardId = select.value;

    if (selectedCardId === "none") return;

    const me = appState.users.find(u => u.id === appState.currentUser?.id);
    if (me && me.myDiscounts) {
        me.myDiscounts = me.myDiscounts.filter(c => (c.id !== selectedCardId && c.code !== selectedCardId));
        saveData(DB_KEYS.USERS, appState.users);
        console.log("💳 কার্ডটি ব্যবহার শেষে রিমুভ করা হয়েছে।");
    }
}


// ১. ব্লক মেনু খোলা বা বন্ধ করা
function toggleBlockMenu(userId) {
    const menu = document.getElementById(`block-menu-${userId}`);
//   অন্য সব মেনু বন্ধ করে শুধু এটি খোলা
    document.querySelectorAll('[id^="block-menu-"]').forEach(el => {
          if(el.id !== `block-menu-${userId}`) el.style.display = 'none';
    });
   
     menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function applyAdminBlock(userId, blockType) {
    const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex !== -1) {
        let msg = "";
        const u = users[userIndex];

        // ১. ডাটা আপডেট লজিক
        switch(blockType) {
            case 'user': 
                u.isUserBlocked = !u.isUserBlocked;
                msg = u.isUserBlocked ? "ইউজার ব্লক করা হয়েছে" : "ইউজার আনব্লক হয়েছে";
                break;
            case 'order': 
                u.isOrderBlocked = !u.isOrderBlocked;
                msg = u.isOrderBlocked ? "অর্ডার ব্লক করা হয়েছে" : "অর্ডার আনব্লক হয়েছে";
                break;
            case 'cod': 
                u.isCodBlocked = !u.isCodBlocked;
                msg = u.isCodBlocked ? "COD সুবিধা বন্ধ হয়েছে" : "COD সুবিধা চালু হয়েছে";
                break;
            case 'discount': 
                u.isDiscountBlocked = !u.isDiscountBlocked;
                msg = u.isDiscountBlocked ? "ডিসকাউন্ট ব্লক করা হয়েছে" : "ডিসকাউন্ট আনব্লক হয়েছে";
                break;
        }

        // ২. ডাটা সেভ
        saveData(DB_KEYS.USERS, users);

        // ৩. মেমোরি একদম ফ্রেশ করে আপডেট করা
        if (typeof appState !== 'undefined') {
            appState.users = JSON.parse(JSON.stringify(users)); 
        }

        // ৪. UI আপডেট (আপনার সিস্টেম অনুযায়ী ফিক্স করা)
        // এখানে loadAdminTab কল করা হয়েছে যাতে আপনার কার্ডগুলো রিলোড হয়
        if (typeof loadAdminTab === 'function') {
            loadAdminTab('users'); 
        }

        // ৫. টোস্ট মেসেজ দেখানো
        if (typeof showToast === 'function') {
            showToast(`✅ ${msg}`);
        } else {
            console.log(`✅ ${msg}`);
        }
    }
}
function showToast(message) {
    // আগের কোনো টোস্ট থাকলে রিমুভ করুন
    const oldToast = document.querySelector('.custom-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.textContent = message;
    
    // স্টাইল এবং অ্যানিমেশন
    toast.style.cssText = `
        position: fixed; bottom: 30px; right: 20px; 
        background: #22c55e; color: white; padding: 14px 28px; 
        border-radius: 12px; z-index: 10000; font-weight: bold;
        box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        transition: all 0.5s ease;
    `;
    
    document.body.appendChild(toast);

    // ৩ সেকেন্ড পর রিমুভ
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
function toggleRegPass(fieldId, icon) {
    const field = document.getElementById(fieldId);
    if (field.type === "password") {
        field.type = "text";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        icon.style.color = "#3498db"; 
    } else {
        field.type = "password";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        icon.style.color = "#64748b";
    }
}
function showUserDetails(userId) {
    const user = appState.users.find(u => u.id === userId);
    if (user) {
        // একটি সুন্দর এলার্ট বক্সে ডিটেইলস দেখানো
        alert(`👤 ইউজার ডিটেইলস:\n----------------------\n📛 নাম: ${user.name}\n📱 মোবাইল: ${user.mobile}\n📧 ইমেইল: ${user.email || 'নেই'}\n🔑 পাসওয়ার্ড: ${user.pass}\n🆔 আইডি: ${user.id}`);
    }
}

// পেজ লোড হলে বিজ্ঞাপন এবং স্লাইডার চালু করার কমান্ড
document.addEventListener('DOMContentLoaded', () => {
    if (typeof startAdBoard === 'function') {
        startAdBoard(); // বিজ্ঞাপন ডাটা লোড করবে
    }
    if (typeof initSliderEvents === 'function') {
        initSliderEvents(); // টেনে সরানোর (Swipe) ক্ষমতা চালু করবে
    }
});



let adIndex = 0;

function startAdBoard() {
    const ads = JSON.parse(localStorage.getItem(DB_KEYS.ADS)) || [];
    const container = document.getElementById('leaderboardAdArea');
    if (!container || ads.length === 0) return;

    container.innerHTML = `
        <div id="billboard-section">
            <div id="sliderTrack" style="width: 100%; height: 100%;">
                ${ads.map((ad, i) => `
                    <div class="slide ${i === 0 ? 'active' : ''}">
                        <a href="${ad.link || '#'}" target="_blank">
                            <img src="${ad.img}" alt="Ad">
                        </a>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    const slides = document.querySelectorAll('.slide');
    if (slides.length <= 1) return;

    // অটো স্লাইডার লজিক
    setInterval(() => {
        slides[adIndex].classList.remove('active');
        adIndex = (adIndex + 1) % slides.length;
        slides[adIndex].classList.add('active');
    }, 5000);
}

// পেজ লোড হলে ফাংশনটি রান হবে
window.addEventListener('load', startAdBoard);

// এটি জোর করে আপনার 'আমার অর্ডার' বাটনটিকে কাজ করাবে
document.addEventListener('click', function(e) {
    // চেক করবে আপনি যেটাতে ক্লিক করেছেন সেটাতে 'আমার অর্ডার' লেখা আছে কি না
    if (e.target.closest('.dp-item') && e.target.innerText.includes('আমার অর্ডার')) {
        console.log('বুম! অর্ডার বাটন কাজ করছে।');
        
        // মেনুটা বন্ধ করে দিবে যাতে সুন্দর দেখায়
        const dropdown = document.getElementById('userDropdownMenu');
        if (dropdown) dropdown.style.display = 'none';
        
        // আপনার কাঙ্ক্ষিত ফাংশন কল করবে
        openUserOrders();
    }
}, true); // এখানে 'true' মানে এটি সব বাধার ওপর দিয়ে কাজ করবে


// ১. কার্টে পণ্য যোগ করার ফাংশন
function addToCart(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;

    // লোকাল স্টোরেজ থেকে আগের কার্ট ডাটা নেওয়া
    let cart = JSON.parse(localStorage.getItem(_cartKey())) || [];

    // পণ্যটি কি আগেই কার্টে আছে?
    const isExist = cart.find(item => item.id === productId);
    if (isExist) {
        alert("এই পণ্যটি ইতিমধ্যে আপনার কার্টে আছে! 😊");
        return;
    }

    // কার্টে নতুন পণ্য যোগ করা
    cart.push(product);
    localStorage.setItem(_cartKey(), JSON.stringify(cart));
    
    alert("সাফল্যের সাথে কার্টে যোগ করা হয়েছে! 🛒");
}

function updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem(_cartKey())) || [];
    const badge = document.getElementById('cartCountBadge');
    if (badge) {
        if (cart.length > 0) {
            badge.innerText = cart.length;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// পেজ লোড হওয়ার সময় এবং কার্টে পণ্য যোগ করার সময় এটি কল করবেন
window.addEventListener('load', updateCartBadge);

function openUserCart() {
    // ১. মেইন কন্টেইনার তৈরি বা খুঁজে বের করা
    let cartOverlay = document.getElementById('cartOverlayModal');
    if (!cartOverlay) {
        cartOverlay = document.createElement('div');
        cartOverlay.id = 'cartOverlayModal';
        cartOverlay.style = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px); 
            z-index: 999999; display: flex; justify-content: center; 
            align-items: center; padding: 10px; font-family: 'Hind Siliguri', sans-serif;
        `;
        document.body.appendChild(cartOverlay);
    }

    const cartItems = JSON.parse(localStorage.getItem(_cartKey())) || [];
    const activeProducts = appState.products.map(p => p.id);
    const updatedCart = cartItems.filter(item => activeProducts.includes(item.id));
    localStorage.setItem(_cartKey(), JSON.stringify(updatedCart));

    // ২. ৯০% ডিসপ্লে লেআউট ও ক্লোজ বাটন
    cartOverlay.innerHTML = `
        <div style="background: #0f172a; width: 95%; max-width: 1000px; height: 90vh; border-radius: 25px; overflow: hidden; position: relative; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; box-shadow: 0 0 50px rgba(0,0,0,0.8); animation: fadeIn 0.3s ease-out;">
            
            <div style="padding: 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: #1e293b;">
                <h2 style="color: #fff; margin: 0; font-size: 20px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa fa-shopping-cart" style="color: #3498db;"></i> Your Cart (${updatedCart.length})
                </h2>
                <button onclick="document.getElementById('cartOverlayModal').style.display='none'" 
                    style="background: #ef4444; color: #fff; border: none; border-radius: 50%; width: 35px; height: 35px; cursor: pointer; font-weight: bold; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: 0.3s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                    ✕
                </button>
            </div>

            <div style="flex: 1; overflow-y: auto; padding: 20px; background: #0f172a;" class="modal-scroll">
                ${updatedCart.length === 0 ? `
                    <div style="text-align:center; margin-top:100px;">
                        <i class="fa fa-shopping-basket" style="font-size: 60px; color: #334155;"></i>
                        <p style="color:#64748b; margin-top:15px; font-size: 18px;">আপনার কার্টটি বর্তমানে খালি আছে।</p>
                        <button onclick="document.getElementById('cartOverlayModal').style.display='none'" style="margin-top: 20px; padding: 10px 25px; background: #3498db; color: #fff; border: none; border-radius: 10px; cursor: pointer;">শপিং শুরু করুন</button>
                    </div>
                ` : `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">
                        ${updatedCart.map(item => `
                            <div style="background: #1e293b; border-radius: 15px; padding: 12px; display: flex; gap: 12px; border: 1px solid #334155; position: relative; transition: 0.3s;" onmouseover="this.style.borderColor='#3498db'">
                                <img src="${item.image || item.images[0]}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 10px; cursor: pointer;" onclick="openProductDetails('${item.id}')">
                                
                                <div style="flex: 1;">
                                    <h4 style="margin: 0; font-size: 15px; color: #fff; cursor: pointer;" onclick="openProductDetails('${item.id}')">${item.title}</h4>
                                    <p style="color: #2ecc71; font-weight: bold; margin: 5px 0; font-size: 16px;">${SYSTEM_CONFIG.CURRENCY} ${item.price}</p>
                                    
                                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                                        <button onclick="document.getElementById('cartOverlayModal').style.display='none'; initiateCheckout('${item.id}')" style="background: #3498db; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; flex: 1;">অর্ডার</button>
                                        <button onclick="removeFromCart('${item.id}')" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; flex: 1;">ডিলিট</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            
            ${updatedCart.length > 0 ? `
            <div style="padding: 20px; border-top: 1px solid #334155; text-align: center; background: #1e293b;">
                <p style="color: #94a3b8; font-size: 13px;">পণ্য ডিলিট করলে সেটি আপনার কার্ট থেকে স্থায়ীভাবে মুছে যাবে।</p>
            </div>
            ` : ''}
        </div>

        <style>
            @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .modal-scroll::-webkit-scrollbar { width: 5px; }
            .modal-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        </style>
    `;

    cartOverlay.style.display = 'flex';
    
    // মেনু বন্ধ করা
    const menu = document.querySelector('.user-menu-dropdown');
    if(menu) menu.style.display = 'none';
}

// কার্ট থেকে রিমুভ করার পর আবার কার্ট ভিউ আপডেট করার জন্য
function removeFromCart(productId) {
    if(!confirm("আপনি কি নিশ্চিত যে এই পণ্যটি কার্ট থেকে মুছে ফেলতে চান?")) return;
    
    let cart = JSON.parse(localStorage.getItem(_cartKey())) || [];
    cart = cart.filter(item => item.id !== productId);
    localStorage.setItem(_cartKey(), JSON.stringify(cart));
    
    // কার্ট লিস্ট রিফ্রেশ করা
    openUserCart();
    // মেনু ব্যাজ আপডেট করা (যদি ফাংশনটি থাকে)
    if(typeof updateCartBadge === "function") updateCartBadge();
}


// ══════════════════════════════════════════════════
// CHECKOUT ADDRESS SYSTEM — নতুন & উন্নত
// ══════════════════════════════════════════════════

// Checkout খোলার সময় saved address load করা
function _loadCheckoutSavedAddr() {
    const displayEl = document.getElementById('displaySavedAddr');
    const savedAddrBox = document.getElementById('savedAddrBox');
    const orderInput = document.getElementById('orderAddress');
    if (!displayEl) return;

    // ১. localStorage থেকে চেষ্টা
    let addrRaw = localStorage.getItem(_addrKey());

    // ২. না পেলে users array থেকে চেষ্টা
    if (!addrRaw && appState.currentUser) {
        const user = appState.users.find(u => String(u.id) === String(appState.currentUser.id));
        if (user && user.savedAddress) {
            addrRaw = JSON.stringify(user.savedAddress);
            localStorage.setItem(_addrKey(), addrRaw); // cache করি
        }
    }

    if (addrRaw) {
        try {
            const addr = JSON.parse(addrRaw);
            // expiry check
            if (addr.expiry && Date.now() > addr.expiry) {
                displayEl.innerHTML = '<span style="color:#94a3b8;">সেভ করা ঠিকানার মেয়াদ শেষ। নতুন ঠিকানা দিন।</span>';
                if (savedAddrBox) savedAddrBox.style.borderColor = '#e2e8f0';
                return;
            }
            const formatted = `${addr.name}, ${addr.mobile}` +
                (addr.details ? `, ${addr.details}` : '') +
                `, ${addr.upazila}, ${addr.district}, ${addr.division}`;
            displayEl.innerHTML = `<b style="color:#1e293b;">${addr.name}</b> | ${addr.mobile}<br>` +
                `${addr.details ? addr.details+', ' : ''}${addr.upazila}, ${addr.district}, ${addr.division}`;
            if (orderInput) orderInput.value = formatted;
            if (savedAddrBox) {
                savedAddrBox.style.borderColor = '#3498db';
                savedAddrBox.style.background = '#f0f9ff';
            }
            console.log('[Addr] Saved address loaded to checkout');
        } catch(e) {}
    } else {
        displayEl.innerHTML = '<span style="color:#94a3b8;">কোনো সেভ করা ঠিকানা পাওয়া যায়নি।</span>';
        if (savedAddrBox) savedAddrBox.style.borderColor = '#e2e8f0';
        if (orderInput) orderInput.value = '';
    }
}

// সেভ করা ঠিকানা select করলে
function selectSavedAddress(el) {
    const orderInput = document.getElementById('orderAddress');
    const addrRaw = localStorage.getItem(_addrKey());
    if (!addrRaw) return;
    try {
        const addr = JSON.parse(addrRaw);
        const formatted = `${addr.name}, ${addr.mobile}` +
            (addr.details ? `, ${addr.details}` : '') +
            `, ${addr.upazila}, ${addr.district}, ${addr.division}`;
        if (orderInput) orderInput.value = formatted;
        // highlight
        el.style.borderColor = '#3498db';
        el.style.background = '#f0f9ff';
        // নতুন ঠিকানা hide করি
        cancelNewAddr();
    } catch(e) {}
}

// নতুন ঠিকানা toggle
function toggleNewAddrInput() {
    const box = document.getElementById('newAddrInputBox');
    const btn = document.getElementById('toggleNewAddrBtn');
    if (!box) return;
    const isOpen = box.style.display !== 'none';
    if (isOpen) {
        box.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fa fa-plus-circle"></i> নতুন ঠিকানা দিয়ে অর্ডার করুন';
        // saved address ফিরিয়ে দিই
        _loadCheckoutSavedAddr();
    } else {
        box.style.display = 'block';
        if (btn) btn.innerHTML = '<i class="fa fa-times-circle"></i> বাতিল';
        // saved addr box dim করি
        const savedBox = document.getElementById('savedAddrBox');
        if (savedBox) { savedBox.style.borderColor = '#e2e8f0'; savedBox.style.background = '#fff'; }
        const orderInput = document.getElementById('orderAddress');
        if (orderInput) orderInput.value = '';
    }
}

function cancelNewAddr() {
    const box = document.getElementById('newAddrInputBox');
    const btn = document.getElementById('toggleNewAddrBtn');
    if (box) box.style.display = 'none';
    if (btn) btn.innerHTML = '<i class="fa fa-plus-circle"></i> নতুন ঠিকানা দিয়ে অর্ডার করুন';
}

// নতুন ঠিকানা checkout এ apply করা
function applyNewAddrInCheckout() {
    const name = (document.getElementById('newAddrName')?.value || '').trim();
    const mobile = (document.getElementById('newAddrMobile')?.value || '').trim();
    const division = document.getElementById('newAddrDivision')?.value || '';
    const district = document.getElementById('newAddrDistrict')?.value || '';
    const upazila = document.getElementById('newAddrUpazila')?.value || '';
    const details = (document.getElementById('newAddrDetails')?.value || '').trim();

    if (!name || !mobile || !district) {
        alert('\u274c \u09a8\u09be\u09ae, \u09ae\u09cb\u09ac\u09be\u0987\u09b2 \u098f\u09ac\u0982 \u099c\u09c7\u09b2\u09be \u09a6\u09bf\u09a8!');
        return;
    }

    const formatted = `${name}, ${mobile}${details ? ', '+details : ''}${upazila ? ', '+upazila : ''}, ${district}${division ? ', '+division : ''}`;
    const orderInput = document.getElementById('orderAddress');
    if (orderInput) orderInput.value = formatted;

    // saved addr box এ নতুন ঠিকানা দেখাই
    const displayEl = document.getElementById('displaySavedAddr');
    const savedBox = document.getElementById('savedAddrBox');
    if (displayEl) displayEl.innerHTML = `<b style="color:#e67e22;">\u09a8\u09a4\u09c1\u09a8:</b> ${formatted}`;
    if (savedBox) { savedBox.style.borderColor = '#e67e22'; savedBox.style.background = '#fffbf5'; }

    // new addr box বন্ধ করি
    cancelNewAddr();
    alert('\u2705 \u09a0\u09bf\u0995\u09be\u09a8\u09be \u09b8\u09c7\u099f \u09b9\u09af\u09bc\u09c7\u099b\u09c7!');
}

// নতুন ঠিকানার জেলা select
function updateNewAddrDistricts() {
    const div = document.getElementById('newAddrDivision')?.value;
    const distSel = document.getElementById('newAddrDistrict');
    const upSel = document.getElementById('newAddrUpazila');
    if (!distSel) return;
    distSel.innerHTML = '<option value="">জেলা সিলেক্ট করুন</option>';
    if (upSel) upSel.innerHTML = '<option value="">উপজেলা সিলেক্ট করুন</option>';
    if (div && typeof bdData !== 'undefined' && bdData[div]) {
        Object.keys(bdData[div]).forEach(d => {
            distSel.innerHTML += `<option value="${d}">${d}</option>`;
        });
    }
}

// নতুন ঠিকানার উপজেলা select
function updateNewAddrUpazilas() {
    const div = document.getElementById('newAddrDivision')?.value;
    const dist = document.getElementById('newAddrDistrict')?.value;
    const upSel = document.getElementById('newAddrUpazila');
    if (!upSel) return;
    upSel.innerHTML = '<option value="">উপজেলা সিলেক্ট করুন</option>';
    if (div && dist && typeof bdData !== 'undefined' && bdData[div]?.[dist]) {
        bdData[div][dist].forEach(u => {
            upSel.innerHTML += `<option value="${u}">${u}</option>`;
        });
    }
}

// ১. স্টোরেজ কি নিশ্চিত করা
const ADDR_KEY = 'digital_shop_user_address';

// ২. পেজ লোড হলে ঠিকানা দেখানোর ফাংশন (নিরাপদ পদ্ধতি)
function initAddressOnCheckout() {
    const displayBox = document.getElementById('displaySavedAddr');
    const hiddenInput = document.getElementById('orderAddress');
    
    // এলিমেন্টগুলো পেজে আছে কি না তা আগে চেক করা (এরর রোধ করতে)
    if (!displayBox || !hiddenInput) return;

    const savedData = localStorage.getItem(_addrKey());

    if (savedData) {
        try {
            const addr = JSON.parse(savedData);
            const formatted = `${addr.name}, ${addr.mobile}, ${addr.details}, ${addr.upazila}, ${addr.district}, ${addr.division}`;
            displayBox.innerText = formatted;
            hiddenInput.value = formatted;
        } catch (e) {
            console.error("JSON Parse Error:", e);
        }
    } else {
        displayBox.innerText = "কোনো সেভ করা ঠিকানা পাওয়া যায়নি।";
    }
}

// ৩. নতুন ঠিকানার পপআপ খোলার ফাংশন
function openAddressModalForOrder() {
    const modal = document.getElementById('addressModal');
    if (modal) {
        modal.style.display = 'flex';
        
        // এপ্লাই বাটন সেটআপ
        const modalBtn = document.querySelector('#addressModal .btn-primary');
        if(modalBtn) {
            modalBtn.innerText = "ঠিকানা এপ্লাই করুন";
            modalBtn.setAttribute('onclick', 'applyNewAddressToOrder()');
        }
    }
}

// ৪. নতুন ঠিকানা অর্ডারে এপ্লাই করার ফাংশন
function applyNewAddressToOrder() {
    // এলিমেন্টগুলো থেকে ভ্যালু নেওয়া
    const name = document.getElementById('addrName')?.value.trim() || "";
    const mobile = document.getElementById('addrMobile')?.value.trim() || "";
    const division = document.getElementById('addrDivision')?.value || "";
    const district = document.getElementById('addrDistrict')?.value || "";
    const upazila = document.getElementById('addrUpazila')?.value || "";
    const details = document.getElementById('addrDetails')?.value.trim() || "";

    // ভ্যালিডেশন
    if (!name || !mobile || !district) {
        alert("❌ দয়া করে নাম, মোবাইল এবং জেলা পূরণ করুন।");
        return;
    }

    // পূর্ণাঙ্গ ঠিকানার স্ট্রিং তৈরি
    const newFullAddr = `${name}, ${mobile}, ${details}, ${upazila}, ${district}, ${division}`;
    
    // ১. চেকআউট পেজের দৃশ্যমান বক্স (UI) আপডেট
    const displayBox = document.getElementById('displaySavedAddr');
    const addrWrapper = document.getElementById('savedAddrBox');
    
    if (displayBox) {
        displayBox.innerHTML = `<b style="color:#e67e22;">[নতুন ঠিকানা]:</b> ${newFullAddr}`;
        if (addrWrapper) {
            addrWrapper.style.borderColor = "#e67e22"; // নতুন ঠিকানার জন্য কমলা রঙ
            addrWrapper.style.background = "#fffaf0"; // হালকা ব্যাকগ্রাউন্ড হাইলাইট
        }
    }
    
    // ২. সবথেকে গুরুত্বপূর্ণ: মূল অর্ডার ইনপুট আপডেট (যাতে অর্ডারের সাথে ডাটা যায়)
    const hiddenInput = document.getElementById('orderAddress');
    if (hiddenInput) {
        hiddenInput.value = newFullAddr;
        // যদি এটি একটি টেক্সট এরিয়া হয়, তবে সরাসরি ভ্যালু এসাইন রিফ্রেশ ছাড়াই কাজ করে
        hiddenInput.innerHTML = newFullAddr; 
    }

    alert("✅ নতুন ঠিকানা সেট করা হয়েছে। এখন অর্ডার বাটনে ক্লিক করুন।");
    
    // মোডাল বন্ধ করা
    if (typeof closeModal === 'function') {
        closeModal('addressModal');
    } else {
        const modal = document.getElementById('addressModal');
        if (modal) modal.style.display = 'none';
    }
}

// ৫. DOMContentLoaded ইভেন্ট
document.addEventListener('DOMContentLoaded', function() {
    if (typeof initAddressOnCheckout === 'function') {
        initAddressOnCheckout();
    }
});

function refreshAddressDisplay(newAddress, isTemporary = false) {
    const displayBox = document.getElementById('displaySavedAddr');
    const hiddenInput = document.getElementById('orderAddress');
    const addrWrapper = document.getElementById('savedAddrBox');

    if (displayBox && hiddenInput) {
        if (isTemporary) {
            // নতুন ঠিকানার জন্য কমলা ডিজাইন
            displayBox.innerHTML = `<b style="color:#e67e22;">[নতুন ঠিকানা]:</b> ${newAddress}`;
            if (addrWrapper) addrWrapper.style.borderColor = "#e67e22";
        } else {
            // সেভ করা ঠিকানার জন্য নীল ডিজাইন
            displayBox.innerHTML = `<b style="color:#3498db;">[সেভ করা]:</b> ${newAddress}`;
            if (addrWrapper) addrWrapper.style.borderColor = "#3498db";
        }
        
        // মূল ইনপুট আপডেট (যাতে রিফ্রেশ ছাড়া অর্ডার যায়)
        hiddenInput.value = newAddress;
        if(hiddenInput.tagName === 'TEXTAREA') {
            hiddenInput.innerHTML = newAddress;
        }
    }
}

let limitSteps = [35, 50, 50, 100]; // এটি ডাটাবেস থেকে আসবে
let currentStepIndex = 0;
let totalLoaded = 0;

function loadMoreProducts() {
    const btn = document.getElementById('loadMoreBtn');
    
    // বর্তমান স্টেপে কয়টি পন্য লোড করতে হবে তা নির্ধারণ
    let currentLimit = limitSteps[currentStepIndex] || limitSteps[limitSteps.length - 1]; 
    // যদি স্টেপ শেষ হয়ে যায়, তবে শেষ বক্সের সংখ্যাটিই বারবার কাজ করবে

    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> লোড হচ্ছে...';

    fetch(`/api/products?offset=${totalLoaded}&limit=${currentLimit}`)
        .then(res => res.json())
        .then(data => {
            if (data.products.length > 0) {
                appendProductsToGrid(data.products);
                totalLoaded += data.products.length;
                currentStepIndex++; // পরবর্তী ক্লিকের জন্য পরের বক্সে চলে যাবে
                btn.innerHTML = 'আরো দেখুন <i class="fa fa-chevron-down"></i>';
            } else {
                document.getElementById('loadMoreContainer').style.display = 'none';
            }
        });
}

let stepCount = 1;

function openProductLimitModal() {
    if (appState.currentUser && appState.currentUser.role === 'sub_admin') {
        if (!(appState.currentUser.permissions||[]).includes('product_limit')) {
            showToast('🚫 এই ফাংশনে আপনার এক্সেস নেই!'); return;
        }
    }
    document.getElementById('productLimitModal').style.display = 'block';
}

function closeProductLimitModal() {
    document.getElementById('productLimitModal').style.display = 'none';
}

function addNewLimitStep() {
    stepCount++;
    const container = document.getElementById('limitInputsList');
    const newStep = document.createElement('div');
    newStep.className = "limit-box";
    newStep.style.cssText = "margin-bottom:15px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; position:relative; animation: slideIn 0.3s ease;";
    
    newStep.innerHTML = `
        <label style="color:#94a3b8; font-size:12px; font-weight:700; display:block; margin-bottom:8px; text-transform:uppercase;">ধাপ ${stepCount}: 'আরো দেখুন' ক্লিক করলে:</label>
        <div style="display:flex; gap:10px;">
            <input type="number" class="limit-val" value="50" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px; outline:none;">
            <button onclick="this.parentElement.parentElement.remove()" style="background:#ef4444; color:white; border:none; padding:0 10px; border-radius:8px; cursor:pointer;"><i class="fa fa-trash"></i></button>
        </div>
    `;
    container.appendChild(newStep);
}


function saveProductLimits() {
    const inputs = document.querySelectorAll('.limit-val');
    let limitsArray = Array.from(inputs).map(input => parseInt(input.value) || 0);
    localStorage.setItem(DB_KEYS.PRODUCT_LIMITS, JSON.stringify(limitsArray));
    appState.productLoadSequence = limitsArray;
    const doReload = () => { closeProductLimitModal(); location.reload(); };
    if(typeof firebase!=='undefined') {
        firebase.firestore().collection('product_limits').doc('data')
            .set({_arr: limitsArray})
            .then(()=>{ console.log('[FB] ✅ Product limits saved'); alert("✅ সফলভাবে সেভ হয়েছে!"); doReload(); })
            .catch(e=>{ console.warn('[FB] limits err:',e.message); alert("✅ সেভ হয়েছে!"); doReload(); });
    } else {
        alert("✅ সফলভাবে সেভ হয়েছে!"); doReload();
    }
}

// এই ফাংশনটি অ্যাডমিন প্যানেলের কোনো বাটনের ক্লিকের সাথে যুক্ত করুন
function openLoadLimitSettings() {
    // বর্তমান লিমিট সিকুয়েন্স লোড করা
    const currentSeq = appState.productLoadSequence || [35, 50];
    
    const modalHtml = `
        <div id="limitModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:10000; font-family:'Hind Siliguri', sans-serif;">
            <div style="background:#1e293b; width:90%; max-width:400px; padding:25px; border-radius:20px; border:1px solid #3498db; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                <h3 style="color:#fff; margin-bottom:15px; display:flex; align-items:center; gap:10px;">
                    <i class="fa fa-sliders-h" style="color:#3498db;"></i> লোড লিমিট সেটিংস
                </h3>
                <p style="color:#94a3b8; font-size:13px; margin-bottom:20px;">হোমপেজে পণ্য দেখানোর ক্রম সেট করুন (কমা দিয়ে লিখুন)</p>
                
                <div style="margin-bottom:20px;">
                    <label style="color:#cbd5e1; font-size:12px; display:block; margin-bottom:8px;">সিকুয়েন্স (উদা: 5, 10, 20)</label>
                    <input type="text" id="newLimitInput" value="${currentSeq.join(', ')}" 
                           style="width:100%; padding:12px; background:#0f172a; border:1px solid #334155; border-radius:12px; color:#fff; outline:none; box-sizing:border-box;">
                    <p style="color:#64748b; font-size:11px; margin-top:8px;">* প্রথম সংখ্যাটি প্রথমে দেখাবে, পরের সংখ্যাটি 'আরো দেখুন' বাটনে ক্লিক করলে দেখাবে।</p>
                </div>

                <div style="display:flex; gap:10px;">
                    <button onclick="saveNewLoadLimits()" style="flex:1; padding:12px; background:#3498db; color:#fff; border:none; border-radius:12px; cursor:pointer; font-weight:700;">সেভ করুন</button>
                    <button onclick="document.getElementById('limitModal').remove()" style="flex:1; padding:12px; background:#334155; color:#fff; border:none; border-radius:12px; cursor:pointer;">বন্ধ করুন</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// নতুন লিমিট সেভ করার ফাংশন
function saveNewLoadLimits() {
    const inputVal = document.getElementById('newLimitInput').value;
    // ইনপুট থেকে সংখ্যাগুলো আলাদা করা এবং অ্যারেতে রূপান্তর
    const newSeq = inputVal.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    if (newSeq.length === 0) {
        return alert("অনুগ্রহ করে সঠিক সংখ্যা দিন!");
    }

    // ১. appState আপডেট
    appState.productLoadSequence = newSeq;
    
    // ২. LocalStorage এ সেভ
    localStorage.setItem(DB_KEYS.PRODUCT_LIMITS, JSON.stringify(newSeq));
    if(typeof window.pushToCloud==='function') window.pushToCloud('TM_DB_PRODUCT_LIMITS');

    alert("✅ লোড লিমিট সফলভাবে আপডেট হয়েছে!");
    document.getElementById('limitModal').remove();
    
    // ৩. শপ পেজ রিফ্রেশ (যাতে নতুন লিমিট কাজ করে)
    if (typeof renderProductGrid === 'function') {
        renderProductGrid(appState.products);
    }
}


/**
 * Last Portal Parcel - UI Interface Only
 */
function openLastPortalParcel() {
    if (appState.currentUser && appState.currentUser.role === 'sub_admin') {
        if (!(appState.currentUser.permissions||[]).includes('last_portal')) {
            showToast('🚫 এই ফাংশনে আপনার এক্সেস নেই!'); return;
        }
    }
    // আগের কোনো মোডাল থাকলে সরিয়ে ফেলা
    const existing = document.getElementById('lastPortalModal');
    if (existing) existing.remove();

    const modalHTML = `
    <div id="lastPortalModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:99999999; font-family: 'Hind Siliguri', sans-serif;">
        <div style="background:#111827; color:white; padding:30px; border-radius:20px; width:90%; max-width:900px; text-align:center; position:relative; border: 1px solid #374151;">
            
            <span onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:15px; right:20px; cursor:pointer; font-size:28px; color:#9ca3af;">&times;</span>
            
            <h3 style="margin-bottom:25px; font-size:18px;">লাস্ট পোর্টাল পার্সেল</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
<button class="parcel-btn" onclick="openBeliBoardControl('right')">বেলি বোড ডান</button>
<button class="parcel-btn" onclick="openBeliBoardControl('left')">বেলি বোড বাম</button>
<button class="parcel-btn" onclick="openSironamControl()">শিরোনাম মেনশন</button>
<button class="parcel-btn" onclick="openCategoryControl()">ক্যাটাগরি নিয়ন্ত্রণ</button>
            </div>
         <h3>এডমিন কে স্বাগতম পোটালের লাস্ট মেইন সেক্টের এ ☺️।আপনার য়াত্রা শভ হউক🥳। এটা অনেক গুরুত্বপূর্ণ সেটিং তাই এডমিন কাছে অনুরোধ রইল বুজে চিন্তে কাজ করবেন🙂💗/<h3>
        </div>
    </div>

    <style>
        .parcel-btn {
            background: #1f2937;
            color: #f3f4f6;
            border: 1px solid #4b5563;
            padding: 20px 10px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            font-size: 15px;
            transition: all 0.3s ease;
        }
        .parcel-btn:hover {
            background: #4f46e5;
            border-color: #6366f1;
            transform: scale(1.05);
        }
    </style>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// বেলি বোড ডাটা স্টোর
// ✅ Fix: beliBoardData global scope এ parse না করে lazy load
let beliBoardData = { left: [], right: [] };
function _reloadBeliData() {
    beliBoardData = {
        left: JSON.parse(localStorage.getItem('beli_left')) || [],
        right: JSON.parse(localStorage.getItem('beli_right')) || []
    };
}

// অ্যাডমিন প্যানেল থেকে বেলি বোড ম্যানেজমেন্ট ওপেন করা
function openBeliBoardControl(side) {
    _reloadBeliData(); // ✅ fresh data
    const sideName = side === 'left' ? 'বাম' : 'ডান';
    
    const existing = document.getElementById('beliControlModal');
    if (existing) existing.remove();

    const modalHTML = `
    <div id="beliControlModal" class="modal-overlay" 
         style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; 
                background:rgba(0,0,0,0.8); justify-content:center; align-items:center; 
                z-index: 2147483647; backdrop-filter: blur(5px);">
        
        <div class="modal-box" 
             style="background:#111827; color:white; width:90%; max-width:700px; 
                    padding:25px; border-radius:20px; border:1px solid #374151; 
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); position:relative;">
            
            <h3 style="margin-top:0; font-size:1.2rem;">বেলি বোড সেটিংস (${sideName})</h3>
            <hr style="border:0; border-top:1px solid #374151; margin:15px 0;">
            
            <div style="margin-bottom:15px;">
                <label style="font-size:12px; color:#9ca3af; display:block; margin-bottom:5px;">ইমেজ ইউআরএল</label>
                <input type="text" id="beliImgUrl" placeholder="ছবির লিংক দিন" 
                       style="width:100%; padding:12px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:white; outline:none; box-sizing:border-box;">
            </div>

            <div style="margin-bottom:20px;">
                <label style="font-size:12px; color:#9ca3af; display:block; margin-bottom:5px;">টার্গেট ইউআরএল</label>
                <input type="text" id="beliTargetUrl" placeholder="টার্গেট লিংক (Click Link)" 
                       style="width:100%; padding:12px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:white; outline:none; box-sizing:border-box;">
            </div>
            
            <button class="publish-beli-btn" onclick="publishBeliBoard('${side}')" 
                    style="width:100%; background:linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color:white; padding:14px; border:none; border-radius:12px; cursor:pointer; font-weight:bold; font-size:16px; transition:0.3s;">
                পাবলিশ করুন
            </button>
            
            <h4 style="margin:25px 0 10px 0; font-size:14px; color:#e5e7eb;">পাবলিশ হওয়া লিস্ট:</h4>
            <div id="beliList" style="max-height:180px; overflow-y:auto; margin-top:10px; padding-right:5px;" class="scroll-custom">
                ${renderBeliList(side)}
            </div>
            
            <button onclick="this.closest('#beliControlModal').remove()" 
                    style="margin-top:20px; background:none; border:none; color:#9ca3af; cursor:pointer; width:100%; text-align:center; font-size:14px;">
                ফিরে যান
            </button>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// বেলি বোড পাবলিশ করা
function publishBeliBoard(side) {
    const img = document.getElementById('beliImgUrl').value;
    const target = document.getElementById('beliTargetUrl').value;

    if (!img || !target) return alert("লিংক এবং ছবি দুটোই দিন!");

    beliBoardData[side].push({ id: Date.now(), img, target });
    localStorage.setItem(`beli_${side}`, JSON.stringify(beliBoardData[side]));
    
    // সরাসরি Firebase এ save
    if (typeof firebase !== 'undefined') {
        const col = 'beli_' + side;
        const batch = firebase.firestore().batch();
        beliBoardData[side].forEach(item => {
            batch.set(firebase.firestore().collection(col).doc(String(item.id)), item);
        });
        batch.commit()
            .then(() => console.log('[FB] ✅ BeliBoard saved:', col))
            .catch(e => console.warn('[FB] beli save err:', e.message));
    }
    
    document.getElementById('beliList').innerHTML = renderBeliList(side);
    document.getElementById('beliImgUrl').value = '';
    document.getElementById('beliTargetUrl').value = '';
    
    refreshBeliDisplay(); 
}

// লিস্ট রেন্ডার করা
function renderBeliList(side) {
    return beliBoardData[side].map(item => `
        <div style="display:flex; justify-content:space-between; background:#1f2937; padding:10px; margin-bottom:8px; border-radius:8px; align-items:center; border: 1px solid #374151;">
            <img src="${item.img}" style="width:50px; height:35px; object-fit:cover; border-radius:4px;">
            <button onclick="deleteBeliItem('${side}', ${item.id})" style="background:#ef4444; border:none; color:white; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px;">ডিলিট</button>
        </div>
    `).join('') || '<p style="font-size:12px; color:#6b7280;">কোনো ডাটা নেই</p>';
}

// ডিলিট ফাংশন
function deleteBeliItem(side, id) {
    beliBoardData[side] = beliBoardData[side].filter(item => item.id !== id);
    localStorage.setItem(`beli_${side}`, JSON.stringify(beliBoardData[side]));
    
    // Firebase থেকেও delete করি
    if (typeof firebase !== 'undefined') {
        firebase.firestore().collection('beli_'+side).doc(String(id)).delete()
            .catch(e => console.warn('[FB] beli delete err:', e.message));
    }
    
    document.getElementById('beliList').innerHTML = renderBeliList(side);
    refreshBeliDisplay();
}

// বেলি বোড ডিসপ্লে আপডেট (ইমেজ ফুল সাইজ লজিকসহ)
function refreshBeliDisplay() {
    _reloadBeliData(); // ✅ hydration শেষে fresh data
    ['left', 'right'].forEach(side => {
        const board = document.getElementById(`beli-board-${side}`);
        if (!board) return;
        
        const items = beliBoardData[side];
        if (items.length > 0) {
            const current = items[0];
            // ইমেজটিকে পুরো কন্টেইনার জুড়ে দেখানোর জন্য স্টাইল আপডেট (object-fit: fill ব্যবহার করা হয়েছে)
            board.innerHTML = `
                <a href="${current.target}" target="_blank" style="width:100%; height:100%; display:block;">
                    <img src="${current.img}" style="width:100%; height:100%; object-fit:fill; display:block; border-radius:12px;">
                </a>`;
        } else {
            board.innerHTML = `<p style="color:#4b5563; font-size:14px; text-align:center;">বিজ্ঞাপন খালি</p>`;
        }
    });
}

// ৫ সেকেন্ড অটো স্লাইডার
let beliIndices = { left: 0, right: 0 };
setInterval(() => {
    ['left', 'right'].forEach(side => {
        const board = document.getElementById(`beli-board-${side}`);
        const items = beliBoardData[side];
        if (board && items.length > 1) {
            beliIndices[side] = (beliIndices[side] + 1) % items.length;
            const current = items[beliIndices[side]];
            board.innerHTML = `
                <a href="${current.target}" target="_blank" style="width:100%; height:100%; display:block;">
                    <img src="${current.img}" style="width:100%; height:100%; object-fit:fill; display:block; border-radius:12px;">
                </a>`;
        }
    });
}, 5000);

window.addEventListener('load', refreshBeliDisplay);

// শিরোনাম ডাটা স্টোর
// ✅ Fix: global scope এ parse না করে, প্রতিবার localStorage থেকে পড়া হয়
// কারণ: script load এর সময় IndexedDB hydration শেষ না হলে data হারায়
let sironamData = [];
function _reloadSironamData() {
    sironamData = JSON.parse(localStorage.getItem('sironam_list')) || [];
}

// অ্যাডমিন প্যানেল থেকে শিরোনাম কন্ট্রোল ওপেন করা
function openSironamControl() {
    const existing = document.getElementById('sironamControlModal');
    if (existing) existing.remove();

    const modalHTML = `
    <div id="sironamControlModal" class="modal-overlay" 
         style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; 
                background:rgba(0,0,0,0.8); justify-content:center; align-items:center; 
                z-index: 2147483647; backdrop-filter: blur(5px);">
        
        <div class="modal-box" style="background:#111827; color:white; width:90%; max-width:700px; padding:25px; border-radius:20px; border:1px solid #374151;">
            <h3>শিরোনাম মেনশন তৈরি করুন</h3>
            <hr style="border:0; border-top:1px solid #374151; margin:15px 0;">
            
            <input type="text" id="sironamName" placeholder="শিরোনামের নাম দিন" 
                   style="width:100%; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:white; box-sizing:border-box;">
            
            <input type="text" id="sironamImgUrl" placeholder="ছবির লিংক দিন" 
                   style="width:100%; padding:12px; margin-bottom:15px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:white; box-sizing:border-box;">
            
            <button onclick="publishSironam()" style="width:100%; background:#10b981; color:white; padding:14px; border:none; border-radius:12px; cursor:pointer; font-weight:bold;">পাবলিক বাটন</button>
            
            <h4 style="margin:20px 0 10px 0; font-size:14px;">তৈরি শিরোনাম লিস্ট:</h4>
            <div id="adminSironamList" style="max-height:180px; overflow-y:auto; margin-top:10px;">
                ${renderAdminSironamList()}
            </div>
            
            <button onclick="this.closest('#sironamControlModal').remove()" style="margin-top:15px; background:none; border:none; color:#9ca3af; cursor:pointer; width:100%;">বন্ধ করুন</button>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// শিরোনাম পাবলিশ করা
function publishSironam() {
    const name = document.getElementById('sironamName').value;
    const img = document.getElementById('sironamImgUrl').value;

    if (!name || !img) return alert("নাম এবং ছবি দুটুই দিন!");

    sironamData.push({ id: Date.now(), name, img });
    localStorage.setItem('sironam_list', JSON.stringify(sironamData));
    
    document.getElementById('adminSironamList').innerHTML = renderAdminSironamList();
    document.getElementById('sironamName').value = '';
    document.getElementById('sironamImgUrl').value = '';
    
    displaySironamOnPortal(); // পোর্টালে আপডেট করা
}

// অ্যাডমিন লিস্টে শিরোনাম দেখানো (ডিলিট বাটনসহ)
function renderAdminSironamList() {
    return sironamData.map(item => `
        <div style="display:flex; justify-content:space-between; background:#1f2937; padding:10px; margin-bottom:8px; border-radius:8px; align-items:center; border: 1px solid #374151;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${item.img}" style="width:40px; height:40px; object-fit:cover; border-radius:5px;">
                <span style="font-size:13px;">${item.name}</span>
            </div>
            <button onclick="deleteSironam(${item.id})" style="background:#ef4444; border:none; color:white; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px;">ডিলিট</button>
        </div>
    `).join('') || '<p style="color:#6b7280; font-size:12px;">কোনো শিরোনাম নেই</p>';
}

// শিরোনাম এবং তার আওতাধীন সকল পণ্য স্থায়ীভাবে ডিলিট করা
function deleteSironam(id) {
    // ১. নিশ্চিত হওয়ার জন্য কনফার্মেশন
    if (!confirm("সাবধান! এই শিরোনামটি ডিলিট করলে এর ভেতরের সব পণ্য চিরতরে মুছে যাবে। আপনি কি নিশ্চিত?")) {
        return;
    }

    // ২. শিরোনাম ডিলিট করা (sironamData থেকে)
    if (typeof sironamData !== 'undefined') {
        sironamData = sironamData.filter(item => String(item.id) !== String(id));
        localStorage.setItem('sironam_list', JSON.stringify(sironamData));
    }

    // ৩. ঐ শিরোনামের সকল পণ্য ডিলিট করা (আপনার সিস্টেমের লজিক অনুযায়ী)
    if (typeof appState !== 'undefined' && appState.products) {
        
        // আপনার দেওয়া লজিক অনুযায়ী ফিল্টার: sironamTag এর সাথে শিরোনামের ID ম্যাচ করানো হচ্ছে
        appState.products = appState.products.filter(p => String(p.sironamTag) !== String(id));
        
        // আপনার সিস্টেমের saveData ফাংশন ব্যবহার করে ডাটাবেজ আপডেট
        saveData(DB_KEYS.PRODUCTS, appState.products);
        
        console.log("✅ Digital Shop TM: ওই শিরোনামের সকল পণ্য ডাটাবেজ থেকে মুছে ফেলা হয়েছে!");
    }

    // ৪. ইন্টারফেস এবং পোর্টাল রিফ্রেশ করা
    const adminList = document.getElementById('adminSironamList');
    if (adminList) {
        adminList.innerHTML = renderAdminSironamList();
    }
    
    if (typeof displaySironamOnPortal === 'function') {
        displaySironamOnPortal();
    }

    // ৫. মেইন গ্রিড আপডেট করা (যাতে পণ্যগুলো সাথে সাথে চলে যায়)
    if (typeof renderProductGrid === 'function') {
        // মেইন শপে শুধুমাত্র জেনারেল পণ্য দেখানোর জন্য ফিল্টার করা
        const mainOnly = appState.products.filter(p => !p.sironamTag || p.sironamTag === "" || p.sironamTag === "main");
        renderProductGrid(mainOnly);
    }

    alert("শিরোনাম এবং এর ভেতরের সকল পণ্য সফলভাবে ডিলিট হয়েছে।");
    
    // সম্পূর্ণ নিশ্চিত হতে একবার রিলোড দেওয়া ভালো
    location.reload();
}

function displaySironamOnPortal() {
    _reloadSironamData(); // ✅ hydration শেষে fresh data নেওয়া
    const container = document.getElementById('sironam-portal-display');
    if (!container) return;

    // কার্ডে ক্লিক করলে openSironamShop ফাংশন কল হবে
    container.innerHTML = sironamData.map(item => `
        <div class="sironam-card" onclick="openSironamShop('${item.id}', '${item.name}')">
            <img src="${item.img}" alt="${item.name}">
            <div class="sironam-overlay">
                <span>${item.name}</span>
            </div>
        </div>
    `).join('');
}
// পেজ লোড হলে প্রদর্শন করা
window.addEventListener('load', displaySironamOnPortal);
function openSironamShop(id, title) {
    _reloadDeliAds(); // ✅ fresh deli ads
    // ডেলি বিজ্ঞাপন খুঁজে বের করা
    const currentDeliAd = deliAds.find(a => String(a.sironamId) === String(id));

    const shopHTML = `
    <div id="sironamFullShop" style="position:fixed; top:0; left:0; width:100%; height:100%; background:#0f172a; z-index:999999999; overflow-y:auto; font-family: 'Hind Siliguri', sans-serif;">
        
        <div style="position:sticky; top:0; background:#1e293b; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #374151; z-index:100;">
            <h2 style="color:#6366f1; margin:0; font-size:20px; font-weight:bold;">${title}</h2>
            <div style="display:flex; align-items:center; gap:15px; flex-grow:1; justify-content:flex-end;">
                <input type="text" id="shopSearchInput" oninput="filterShopProducts()" placeholder="পণ্য খুঁজুন..." 
                       style="width:100%; max-width:300px; padding:10px 15px; border-radius:30px; border:1px solid #4b5563; background:#111827; color:white; outline:none;">
                <button onclick="document.getElementById('sironamFullShop').remove()" 
                        style="background:#ef4444; color:white; border:none; padding:10px 20px; border-radius:30px; cursor:pointer; font-weight:bold;">
                   🏠 হোম
                </button>
            </div>
        </div>

        <div id="sironamDeliBoard" style="width:95%; max-width:1500px; height:450px; margin:20px auto; background:#111827; border-radius:20px; overflow:hidden; border:1px solid #334155; display:flex; align-items:center; justify-content:center; position:relative;">
            ${(() => {
                const ads = deliAds.filter(a => String(a.sironamId) === String(id));
                if (ads.length === 0) return '<p style="color:#4b5563;">এখানে ডেলি বিজ্ঞাপন প্রদর্শিত হবে</p>';
                return ads.map((ad, idx) => `
                    <a href="${ad.link}" target="_blank" class="deli-slide-item" data-sironam-id="${id}"
                       style="width:100%; height:100%; display:${idx===0?'block':'none'}; position:absolute; top:0; left:0;">
                        <img src="${ad.img}" style="width:100%; height:100%; object-fit:fill;">
                    </a>`).join('');
            })()}
        </div>

        <div id="shopProductGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:20px; padding:30px;">
            ${renderTaggedProducts(id)}
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', shopHTML);

    // ── Deli Ads Slider — ৫ সেকেন্ড পর পর ──
    const _sironamAds = deliAds.filter(a => String(a.sironamId) === String(id));
    if (_sironamAds.length > 1) {
        let _deliIdx = 0;
        const _deliTimer = setInterval(() => {
            const board = document.getElementById('sironamDeliBoard');
            if (!board) { clearInterval(_deliTimer); return; }
            const slides = board.querySelectorAll('.deli-slide-item');
            if (!slides.length) { clearInterval(_deliTimer); return; }
            slides[_deliIdx].style.display = 'none';
            _deliIdx = (_deliIdx + 1) % slides.length;
            slides[_deliIdx].style.display = 'block';
        }, 5000);
    }
}
// ১. শিরোনাম অনুযায়ী পণ্য রেন্ডার করার ফাংশন (Fix)
// ১. শিরোনাম অনুযায়ী পণ্য রেন্ডার করার ফাংশন (Updated: Added Admin Actions)
function renderTaggedProducts(sironamId) {
    // আপনার মেইন পণ্য ডাটা appState.products এ থাকে
    const mainData = (typeof appState !== 'undefined' && appState.products) ? appState.products : [];

    // sironamTag অনুযায়ী ফিল্টার করা
    const filtered = mainData.filter(p => String(p.sironamTag) === String(sironamId));

    if (filtered.length === 0) {
        return `<p style="color:#9ca3af; text-align:center; grid-column:1/-1; padding:50px;">এই ক্যাটাগরিতে কোনো পণ্য নেই।</p>`;
    }

    // অ্যাডমিন চেক করা হচ্ছে
    const checkAdmin = (typeof isAdmin === 'function') ? isAdmin() : false;

    return filtered.map(p => {
        // ইমেজের প্রথমটি নেওয়া
        const displayImg = Array.isArray(p.images) ? p.images[0] : (p.img || p.image);
        const pId = p.id || p._id; // আইডির ভেরিয়েবল নিশ্চিত করা
        
        return `
        <div class="shop-product-item" data-name="${p.title || p.name}" style="background:#1e293b; border-radius:12px; padding:10px; border:1px solid #374151; text-align:center; display:flex; flex-direction:column; justify-content:space-between; height: 100%; position: relative;">
            
            ${checkAdmin ? `
                <div class="admin-actions-overlay" style="position: absolute; top: 15px; left: 15px; z-index: 10; display: flex; gap: 5px;">
                    <button class="admin-btn btn-edit" onclick="openEditModal('${pId}')" style="background: #fbbf24; color: black; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">EDIT</button>
                    <button class="admin-btn btn-delete" onclick="adminDeleteProduct('${pId}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">DELETE</button>
                </div>
            ` : ''}

            <div style="width:100%; aspect-ratio: 1 / 1; overflow:hidden; border-radius:10px; background:#0f172a; display:flex; align-items:center; justify-content:center; padding: 5px;">
                <img src="${displayImg}" 
                     onclick="openProductDetails('${pId}')" 
                     style="max-width:100%; max-height:100%; object-fit:contain; cursor:pointer;" 
                     title="বিস্তারিত দেখতে ক্লিক করুন">
            </div>

            <div style="margin-top: 8px;">
                <h4 style="color:white; margin:0 0 5px; font-size:14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.title || p.name}</h4>
                <p style="color:#10b981; font-weight:bold; font-size:16px; margin:0;">৳ ${p.price}</p>
            </div>
            
            <button class="btn-buy-now" 
                    onclick="initiateCheckout('${pId}')" 
                    style="width:100%; background:#27ae60; color:white; border:none; padding:8px; border-radius:8px; margin-top:8px; cursor:pointer; font-weight:600; font-size:14px;">
                <i class="fa fa-shopping-cart"></i> অর্ডার করুন
            </button>
            
        </div>
        `;
    }).join('');
}
// ২. শপ পণ্য লোড করার স্যাম্পল লজিক (Updated to match appState)
function loadShopProducts() {
    const grid = document.getElementById('shopProductGrid');
    if (!grid) return;

    // যদি এটি sironam পপ-আপ শপ হয়, তবে renderTaggedProducts অলরেডি ডাটা পাঠাবে
    // তাই এখানে শুধু একটি ডিফল্ট চেক রাখা হলো
    const productsToDisplay = (typeof appState !== 'undefined' && appState.products) ? appState.products : [];
    
    if (productsToDisplay.length > 0) {
        // এই ফাংশনটি সাধারণত openSironamShop এর ভেতর থেকে কন্ট্রোল করা ভালো
        // নিচে উদাহরণ হিসেবে সব পণ্য দেখানোর লজিক দেওয়া হলো (প্রয়োজনে)
        console.log("Shop products loading...");
    } else {
        grid.innerHTML = '<p style="color:#ef4444; text-align:center; grid-column:1/-1;">কোনো পণ্য পাওয়া যায়নি!</p>';
    }
}

// ৩. পণ্য ফিল্টার করার ফাংশন (অপরিবর্তিত)
function filterShopProducts() {
    const searchValue = document.getElementById('shopSearchInput').value.toLowerCase();
    const allProducts = document.querySelectorAll('.shop-product-item');

    allProducts.forEach(product => {
        const productName = product.getAttribute('data-name').toLowerCase();
        if (productName.includes(searchValue)) {
            product.style.display = 'block';
        } else {
            product.style.display = 'none';
        }
    });
}

// ৪. ডেলি বিজ্ঞাপন ডাটা স্টোর (অপরিবর্তিত)
let deliAds = [];
function _reloadDeliAds() {
    deliAds = JSON.parse(localStorage.getItem('deli_ads')) || [];
}

// ৫. ক্যাটাগরি নিয়ন্ত্রণ পপ-আপ (অপরিবর্তিত)
function openCategoryControl() {
    _reloadSironamData(); // ✅ fresh sironam list
    const modalHTML = `
    <div id="categoryModal" class="modal-overlay" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); justify-content:center; align-items:center; z-index: 2147483647; backdrop-filter: blur(10px);">
        <div class="modal-box" style="background:#0f172a; color:white; width:95%; max-width:600px; padding:30px; border-radius:25px; border:1px solid #334155; text-align:center;">
            <img src="ko.jpeg" style="width:80px; height:80px; border-radius:50%; margin-bottom:10px; border:2px solid #6366f1;">
            <h2 style="color:#6366f1; margin-bottom:20px;">Digital Shop TM - ক্যাটাগরি ম্যানেজমেন্ট</h2>
            
            <div id="categoryList" style="max-height:400px; overflow-y:auto; text-align:left;">
                ${sironamData.map(item => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:15px; margin-bottom:10px; border-radius:12px; border:1px solid #374151;">
                        <span style="font-weight:bold; cursor:pointer;" onclick="openSironamShop('${item.id}', '${item.name}')">${item.name}</span>
                        <button onclick="openDeliAdPanel('${item.id}')" style="background:linear-gradient(135deg, #f59e0b, #d97706); color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:12px;">ডেলি বিজ্ঞাপন পাবলিশ</button>
                    </div>
                `).join('')}
            </div>
            <button onclick="document.getElementById('categoryModal').remove()" style="margin-top:20px; color:#9ca3af; background:none; border:none; cursor:pointer;">বন্ধ করুন</button>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}
// ডেলি বিজ্ঞাপন পাবলিশ প্যানেল
function openDeliAdPanel(sironamId) {
    const panelHTML = `
    <div id="deliPanel" class="modal-overlay" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index: 2147483648;">
        <div style="background:#111827; padding:25px; border-radius:20px; width:90%; max-width:400px; border:1px solid #374151;">
            <h3 style="color:white; margin-bottom:15px;">ডেলি বিজ্ঞাপন (${sironamId})</h3>
            <input type="text" id="deliImg" placeholder="ছবির লিংক" style="width:100%; padding:12px; margin-bottom:10px; border-radius:10px; background:#1f2937; color:white; border:1px solid #374151;">
            <input type="text" id="deliDetails" placeholder="বিস্তারিত লিংক" style="width:100%; padding:12px; margin-bottom:15px; border-radius:10px; background:#1f2937; color:white; border:1px solid #374151;">
            <button onclick="publishDeliAd('${sironamId}')" style="width:100%; background:#10b981; color:white; padding:12px; border:none; border-radius:10px; cursor:pointer; font-weight:bold;">পাবলিশ</button>
            <div id="deliAdList" style="margin-top:20px; max-height:150px; overflow-y:auto;">${renderDeliAds(sironamId)}</div>
            <button onclick="document.getElementById('deliPanel').remove()" style="width:100%; margin-top:10px; background:none; color:#9ca3af; border:none; cursor:pointer;">ফিরে যান</button>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', panelHTML);
}

function publishDeliAd(id) {
    const img = document.getElementById('deliImg').value;
    const link = document.getElementById('deliDetails').value;
    if(!img || !link) return alert("সব তথ্য দিন");
    deliAds.push({ id: Date.now(), sironamId: id, img, link });
    localStorage.setItem('deli_ads', JSON.stringify(deliAds));
    if(typeof window.pushToCloud==='function') window.pushToCloud('deli_ads');
    document.getElementById('deliAdList').innerHTML = renderDeliAds(id);
}

function renderDeliAds(id) {
    return deliAds.filter(a => a.sironamId === id).map(a => `
        <div style="display:flex; justify-content:space-between; background:#1f2937; padding:8px; margin-bottom:5px; border-radius:5px;">
            <img src="${a.img}" style="width:40px; height:25px; object-fit:cover;">
            <button onclick="deleteDeliAd(${a.id}, '${id}')" style="background:#ef4444; color:white; border:none; padding:2px 8px; border-radius:4px; cursor:pointer;">ডিলিট</button>
        </div>
    `).join('');
}

function deleteDeliAd(adId, sironamId) {
    deliAds = deliAds.filter(a => a.id !== adId);
    localStorage.setItem('deli_ads', JSON.stringify(deliAds));
    if(typeof window.pushToCloud==='function') window.pushToCloud('deli_ads');
    document.getElementById('deliAdList').innerHTML = renderDeliAds(sironamId);
}
// About Us পপ-আপ ওপেন করার ফাংশন
function openAboutModal() {
    document.getElementById('aboutUsModal').style.display = 'block';
    document.body.style.overflow = 'hidden'; // স্ক্রল বন্ধ করা
}

// About Us পপ-আপ ক্লোজ করার ফাংশন
function closeAboutModal() {
    document.getElementById('aboutUsModal').style.display = 'none';
    document.body.style.overflow = 'auto'; // স্ক্রল পুনরায় চালু
}

// পপ-আপের বাইরে ক্লিক করলে বন্ধ হবে
window.onclick = function(event) {
    const modal = document.getElementById('aboutUsModal');
    if (event.target == modal) {
        closeAboutModal();
    }
}

// Terms & Conditions পপ-আপ ওপেন
function openTermsModal() {
    document.getElementById('termsModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Terms & Conditions পপ-আপ ক্লোজ
function closeTermsModal() {
    document.getElementById('termsModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// বাইরে ক্লিক করলে ক্লোজ হবে
window.onclick = function(event) {
    const aboutModal = document.getElementById('aboutUsModal');
    const termsModal = document.getElementById('termsModal');
    if (event.target == aboutModal) closeAboutModal();
    if (event.target == termsModal) closeTermsModal();
}

// Privacy Policy পপ-আপ ওপেন
function openPrivacyModal() {
    document.getElementById('privacyModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Privacy Policy পপ-আপ ক্লোজ
function closePrivacyModal() {
    document.getElementById('privacyModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// বাইরে ক্লিক করলে যেকোনো পপ-আপ বন্ধ হবে
window.onclick = function(event) {
    const about = document.getElementById('aboutUsModal');
    const terms = document.getElementById('termsModal');
    const privacy = document.getElementById('privacyModal');
    
    if (event.target == about) closeAboutModal();
    if (event.target == terms) closeTermsModal();
    if (event.target == privacy) closePrivacyModal();
}

// Return Policy পপ-আপ ওপেন
// ✅ Renamed: Return & Refund Policy modal (openReturnModal নাম conflict করত return order এর সাথে)
function openReturnPolicyModal() {
    document.getElementById('returnModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeReturnPolicyModal() {
    document.getElementById('returnModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// বাইরে ক্লিক করলে বন্ধ করার লজিক আপডেট
window.onclick = function(event) {
    const about = document.getElementById('aboutUsModal');
    const terms = document.getElementById('termsModal');
    const privacy = document.getElementById('privacyModal');
    const returnM = document.getElementById('returnModal');
    
    if (event.target == about) closeAboutModal();
    if (event.target == terms) closeTermsModal();
    if (event.target == privacy) closePrivacyModal();
    if (event.target == returnM) closeReturnPolicyModal();
}

// FAQ পপ-আপ ওপেন
function openFaqModal() {
    document.getElementById('faqModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// FAQ পপ-আপ ক্লোজ
function closeFaqModal() {
    document.getElementById('faqModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// বাইরে ক্লিক করলে বন্ধ করার লজিক (সবগুলোর জন্য আপডেট)
window.onclick = function(event) {
    const modals = ['aboutUsModal', 'termsModal', 'privacyModal', 'returnModal', 'faqModal'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target == modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
}
function openCustomerCareModal() {
    document.getElementById('customerCareModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeCustomerCareModal() {
    document.getElementById('customerCareModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function showHubDetails() {
    const district = document.getElementById('districtSelect').value;
    const box = document.getElementById('hubDetailsBox');
    
    let content = "";

    if (district === "chittagong") {
        content = `<h4 style="color:#10b981;">চট্টগ্রাম হাব ঠিকানা:</h4>
                   <p>📍 খাজা মঞ্জিল, পুলিশ বক্সের পাশে, বহদ্দারহাট, চট্টগ্রাম, বাংলাদেশ।</p>
                   <p>📍 একে খাঁন, বেলি রোড, চট্টগ্রাম, বাংলাদেশ।</p>`;
    } 
    else if (district === "coxsbazar") {
        content = `<h4 style="color:#10b981;">কক্সবাজার হাব ঠিকানা:</h4>
                   <p>📍 নিউ মার্কেট ২য় তলা, চকরিয়া, কক্সবাজার, বাংলাদেশ।</p>
                   <p>📍 কক্সবাজার বেতার কেন্দ্র এর পাশে, কক্সবাজার, বাংলাদেশ।</p>`;
    } 
    else if (district === "rangamati") {
        content = `<h4 style="color:#10b981;">রাঙ্গামাটি হাব ঠিকানা:</h4>
                   <p>📍 নতুন বাজার, কাপ্তাই, রাঙ্গামাটি, বাংলাদেশ।</p>`;
    } 
    else if (district === "others") {
        content = `<p style="color:#ef4444;">দুঃখিত! আপনার এলাকায় এখনও আমাদের হাব নাই।</p>
                   <p style="font-size:14px;">বর্তমানে শুধু <b>চট্টগ্রাম, কক্সবাজার ও রাঙ্গামাটি</b> তে আমাদের হাব আছে। শীঘ্রই আপনার এলাকায় আমরা পৌঁছাবো। এর জন্য আমরা বিনীতভাবে দুঃখিত।</p>
                   <p style="font-size:14px; color:#10b981;">আপনার এলাকায় হাব স্থাপনে আমাদের সাহায্য করতে আপনার সমস্যা বা ঠিকানার কথা জানান: <br> <b>digital.shop.t.m77@gmail.com</b></p>`;
    } 
    else {
        content = `<p style="color:#64748b;">জেলা সিলেক্ট করলে এখানে বিস্তারিত দেখা যাবে।</p>`;
    }

    box.innerHTML = content;
}
// ==================== NOTICE BOARD ====================

function renderAdminNotices(container) {
    container.innerHTML = `
        <div style="padding:20px; max-width:900px; margin:auto;">
            <h2 style="color:#e91e8c; margin-bottom:20px;">📢 নোটিশ বোর্ড ম্যানেজমেন্ট</h2>
            <div style="background:#1a1a2e; border-radius:12px; padding:20px; margin-bottom:20px;">
                <div style="margin-bottom:12px;">
                    <label style="color:#ccc; display:block; margin-bottom:6px;">নোটিশ শিরোনাম *</label>
                    <input id="noticeTitle" type="text" placeholder="নোটিশের শিরোনাম লিখুন..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #444; background:#0f0f1a; color:#fff; font-size:14px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="color:#ccc; display:block; margin-bottom:6px;">ইমেজ URL (ঐচ্ছিক)</label>
                    <input id="noticeImg" type="text" placeholder="https://example.com/image.jpg" style="width:100%; padding:10px; border-radius:8px; border:1px solid #444; background:#0f0f1a; color:#fff; font-size:14px; box-sizing:border-box;">
                </div>
                <div style="margin-bottom:16px;">
                    <label style="color:#ccc; display:block; margin-bottom:6px;">বিস্তারিত লিংক (ঐচ্ছিক)</label>
                    <input id="noticeDetail" type="text" placeholder="https://..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #444; background:#0f0f1a; color:#fff; font-size:14px; box-sizing:border-box;">
                </div>
                <button onclick="adminPublishNotice()" style="background:linear-gradient(135deg,#e91e8c,#9c27b0); color:#fff; border:none; padding:12px 28px; border-radius:8px; font-size:15px; cursor:pointer; font-weight:700;">✅ নোটিশ প্রকাশ করুন</button>
            </div>
            <div id="noticeListContainer"></div>
        </div>
    `;
    renderNoticeList();
}

function renderNoticeList() {
    const container = document.getElementById('noticeListContainer');
    if (!container) return;
    const notices = JSON.parse(localStorage.getItem('TM_DB_NOTICES_V1') || '[]');
    if (notices.length === 0) {
        container.innerHTML = `<p style="color:#888; text-align:center;">কোনো নোটিশ নেই।</p>`;
        return;
    }
    container.innerHTML = notices.map(n => `
        <div style="background:#1a1a2e; border-radius:10px; padding:14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
                <div style="color:#fff; font-weight:700; font-size:14px;">${n.title}</div>
                ${n.img ? `<div style="color:#aaa; font-size:12px; margin-top:4px;">🖼 ইমেজ আছে</div>` : ''}
                ${n.detail ? `<div style="color:#aaa; font-size:12px;">🔗 লিংক আছে</div>` : ''}
            </div>
            <button onclick="adminDeleteNotice(${n.id})" style="background:#c0392b; color:#fff; border:none; padding:8px 14px; border-radius:7px; cursor:pointer; font-size:13px; white-space:nowrap;">🗑 মুছুন</button>
        </div>
    `).join('');
}

function adminPublishNotice() {
    const title = document.getElementById('noticeTitle')?.value.trim();
    const img = document.getElementById('noticeImg')?.value.trim();
    const detail = document.getElementById('noticeDetail')?.value.trim();
    if (!title) { alert('নোটিশের শিরোনাম দিন!'); return; }
    const notices = JSON.parse(localStorage.getItem('TM_DB_NOTICES_V1') || '[]');
    notices.unshift({ id: Date.now(), title, img, detail });
    localStorage.setItem('TM_DB_NOTICES_V1', JSON.stringify(notices));
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeImg').value = '';
    document.getElementById('noticeDetail').value = '';
    renderNoticeList();
    alert('✅ নোটিশ প্রকাশ হয়েছে!');
}

function adminDeleteNotice(id) {
    if (!confirm('এই নোটিশটি মুছে ফেলবেন?')) return;
    let notices = JSON.parse(localStorage.getItem('TM_DB_NOTICES_V1') || '[]');
    notices = notices.filter(n => n.id !== id);
    localStorage.setItem('TM_DB_NOTICES_V1', JSON.stringify(notices));
    // Firebase notices collection থেকে delete
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            firebase.firestore().collection('notices').doc(String(id)).delete()
                .then(() => console.log('[FB] ✅ Notice deleted:', id))
                .catch(e => console.warn('[FB] notice delete err:', e.message));
        }
    } catch(e) {}
    renderNoticeList();
}

function showNoticeBoardPopup() {
    const notices = JSON.parse(localStorage.getItem('TM_DB_NOTICES_V1') || '[]');
    if (!notices.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const lastShown = localStorage.getItem('TM_NOTICE_LAST_SHOWN');
    if (lastShown === today) return;

    let currentIdx = 0;
    localStorage.setItem('TM_NOTICE_LAST_SHOWN', today);

    function renderNoticeContent(n) {
        return `
            <!-- ছবি -->
            ${n.img ? `<div style="width:100%; border-radius:12px; overflow:hidden; margin-bottom:18px; max-height:1000px;">
                <img src="${n.img}" style="width:100%; height:360px; object-fit:cover; display:block;" onerror="this.parentElement.style.display='none'">
            </div>` : ''}

            <!-- Badge + Title -->
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <span style="background:#f0f9ff; color:#0369a1; font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px; border:1px solid #bae6fd; white-space:nowrap;">📢 নোটিশ</span>
                <h3 style="color:#0f172a; font-size:16px; font-weight:800; margin:0; line-height:1.4; flex:1;">${n.title}</h3>
            </div>

            <!-- বিস্তারিত text -->
            ${n.detail ? `<div style="background:#f8fafc; border-left:4px solid #3b82f6; border-radius:0 10px 10px 0; padding:12px 16px; margin-bottom:18px;">
                <p style="color:#334155; font-size:13px; line-height:1.8; margin:0; white-space:pre-wrap;">${n.detail}</p>
            </div>` : ''}
        `;
    }

    const popup = document.createElement('div');
    popup.id = 'noticeBoardPopup';
    popup.style.cssText = `
        position:fixed; inset:0; background:rgba(15,23,42,0.6);
        backdrop-filter:blur(8px); z-index:999999999;
        display:flex; align-items:center; justify-content:center;
        padding:16px; animation:nbFadeIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
    `;

    popup.innerHTML = `
        <style>
            @keyframes nbFadeIn  { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
            @keyframes nbFadeOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.92)} }
        </style>
        <div id="nbCard" style="
            background:#ffffff; border-radius:20px; width:100%; max-width:900px;
            box-shadow:0 24px 64px rgba(0,0,0,0.18); overflow:hidden;
            border:1px solid #e2e8f0; position:relative; max-height:90vh; display:flex; flex-direction:column;">

            <!-- Header bar -->
            <div style="background:#1e293b; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:8px; height:8px; background:#22c55e; border-radius:50%; box-shadow:0 0 6px #22c55e;"></div>
                    <span style="color:#f1f5f9; font-size:13px; font-weight:700; letter-spacing:0.5px;">Digital Shop TM — নোটিশ</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${notices.length > 1 ? `<span id="nbCounter" style="color:#94a3b8; font-size:11px; font-weight:600;">১/${notices.length}</span>` : ''}
                    <button onclick="closeNoticeBoardPopup()" style="background:rgba(255,255,255,0.1); border:none; color:#94a3b8; width:28px; height:28px; border-radius:8px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; line-height:1;">✕</button>
                </div>
            </div>

            <!-- Body — scroll করা যাবে -->
            <div id="nbBody" style="padding:20px; overflow-y:auto; flex:1;">
                ${renderNoticeContent(notices[0])}
            </div>

            <!-- Footer buttons -->
            <div style="padding:14px 20px; border-top:1px solid #f1f5f9; display:flex; gap:10px; justify-content:flex-end; flex-shrink:0; background:#fff;">
                ${notices.length > 1 ? `
                <button id="nbPrev" onclick="nbNavigate(-1)" style="background:#f1f5f9; color:#64748b; border:none; padding:9px 16px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600; display:none;">‹ আগের</button>
                <button id="nbNext" onclick="nbNavigate(1)" style="background:#3b82f6; color:#fff; border:none; padding:9px 16px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600;">পরের ›</button>
                ` : ''}
                <button onclick="closeNoticeBoardPopup()" style="background:#0f172a; color:#fff; border:none; padding:9px 20px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700;">ঠিক আছে</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    // Next/Prev navigation
    window.nbNavigate = function(dir) {
        currentIdx += dir;
        if (currentIdx < 0) currentIdx = 0;
        if (currentIdx >= notices.length) currentIdx = notices.length - 1;
        document.getElementById('nbBody').innerHTML = renderNoticeContent(notices[currentIdx]);
        const counter = document.getElementById('nbCounter');
        if (counter) counter.textContent = (currentIdx+1) + '/' + notices.length;
        const prev = document.getElementById('nbPrev');
        const next = document.getElementById('nbNext');
        if (prev) prev.style.display = currentIdx > 0 ? 'block' : 'none';
        if (next) next.style.display = currentIdx < notices.length-1 ? 'block' : 'none';
    };
}

function closeNoticeBoardPopup() {
    const popup = document.getElementById('noticeBoardPopup');
    if (!popup) return;
    popup.style.animation = 'nbFadeOut 0.3s ease forwards';
    setTimeout(() => popup.remove(), 300);
}

// ============================================================
// LOCAL BOARD — Admin
// ============================================================
const LOCAL_K = 'TM_LOCAL_BOARDS';
const LB_KEY  = 'TM_LOGIN_LEADERBOARDS';

function _adminPanelStyle(){
    return `background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:22px;margin-bottom:24px;`;
}

function renderAdminLocalBoard(container) {
    const items = JSON.parse(localStorage.getItem(LOCAL_K)) || [];
    container.innerHTML = `
    <div style="padding:22px;font-family:'Hind Siliguri',sans-serif;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
            <div style="width:48px;height:48px;background:rgba(99,102,241,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#a5b4fc;">📌</div>
            <div><h3 style="margin:0;color:#fff;font-size:19px;font-weight:700;">লোকাল বোর্ড পাবলিশ</h3><p style="margin:0;font-size:12px;color:#64748b;">Landing Page-এ ৩ কলামে দেখানো হবে (৫০০×৩৫০px)</p></div>
        </div>
        <div style="${_adminPanelStyle()}">
            <h4 style="color:#a5b4fc;margin:0 0 16px;font-size:15px;"><i class="fa fa-plus-circle"></i> নতুন যোগ করুন</h4>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div><label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">ছবির লিংক (URL) *</label>
                <input type="text" id="lbImgUrl" placeholder="https://example.com/image.jpg" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;"></div>
                <div><label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">বিস্তারিত লিংক (URL) <span style="color:#475569;font-weight:400;">(ঐচ্ছিক — ক্লিক করলে এই লিংক খুলবে)</span></label>
                <input type="text" id="lbDesc" placeholder="https://example.com/details" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;"></div>
                <button onclick="publishLocalBoard()" style="align-self:flex-start;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;border:none;padding:11px 24px;border-radius:11px;font-weight:800;font-size:14px;cursor:pointer;font-family:'Hind Siliguri',sans-serif;display:flex;align-items:center;gap:8px;">
                    <i class="fa fa-upload"></i> পাবলিশ করুন
                </button>
            </div>
        </div>
        <h4 style="color:#fff;margin:0 0 12px;font-size:15px;"><i class="fa fa-list"></i> পাবলিশ হওয়া (${items.length}টি)</h4>
        <div id="lbAdminList">
            ${items.length===0
                ?`<div style="text-align:center;padding:35px;color:#334155;border:2px dashed #1e293b;border-radius:14px;"><i class="fa fa-images" style="font-size:36px;display:block;margin-bottom:10px;"></i>কোনো লোকাল বোর্ড নেই</div>`
                :items.map((it,idx)=>`
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:9px;">
                    <img src="${it.img}" style="width:500px;max-width:120px;height:70px;object-fit:cover;border-radius:8px;border:1px solid #334155;flex-shrink:0;" onerror="this.style.background='#1e293b'">
                    <div style="flex:1;min-width:0;">
                        <div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.link?'🔗 '+it.link:'(কোনো লিংক নেই)'}</div>
                        <div style="color:#475569;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.img}</div>
                    </div>
                    <button onclick="deleteLocalBoard(${idx})" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:7px 12px;border-radius:8px;cursor:pointer;font-size:13px;flex-shrink:0;"><i class="fa fa-trash"></i></button>
                </div>`).join('')
            }
        </div>
    </div>`;
}

function publishLocalBoard() {
    const img  = (document.getElementById('lbImgUrl')||{}).value?.trim();
    const link = (document.getElementById('lbDesc')||{}).value?.trim();
    if(!img){showToast('ছবির লিংক দিন!');return;}
    const items = JSON.parse(localStorage.getItem(LOCAL_K))||[];
    items.push({img,link:link||'',id:Date.now()});
    localStorage.setItem(LOCAL_K,JSON.stringify(items));
    showToast('✅ লোকাল বোর্ড পাবলিশ হয়েছে!');
    const c=document.getElementById('adminMainContainer');
    if(c) renderAdminLocalBoard(c);
}

function deleteLocalBoard(idx) {
    if(!confirm('ডিলিট করবেন?'))return;
    const items=JSON.parse(localStorage.getItem(LOCAL_K))||[];
    items.splice(idx,1);
    localStorage.setItem(LOCAL_K,JSON.stringify(items));
    showToast('🗑️ ডিলিট হয়েছে');
    const c=document.getElementById('adminMainContainer');
    if(c) renderAdminLocalBoard(c);
}

// ============================================================
// LOGIN LEADERBOARD — Admin
// ============================================================
function renderAdminLoginLeaderboard(container) {
    const items = JSON.parse(localStorage.getItem(LB_KEY))||[];
    container.innerHTML = `
    <div style="padding:22px;font-family:'Hind Siliguri',sans-serif;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
            <div style="width:48px;height:48px;background:rgba(251,191,36,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fbbf24;"><i class="fa fa-trophy"></i></div>
            <div><h3 style="margin:0;color:#fff;font-size:19px;font-weight:700;">লগইন লিডারবোর্ড</h3><p style="margin:0;font-size:12px;color:#64748b;">Landing Page-এর শীর্ষ স্লাইডার</p></div>
        </div>
        <div style="${_adminPanelStyle()}">
            <h4 style="color:#fbbf24;margin:0 0 16px;font-size:15px;"><i class="fa fa-plus-circle"></i> নতুন যোগ করুন</h4>
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div><label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">ছবির লিংক (URL) *</label>
                <input type="text" id="llbImg" placeholder="https://example.com/image.jpg" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;"></div>
                <div><label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">বিস্তারিত <span style="color:#475569;font-weight:400;">(ঐচ্ছিক)</span></label>
                <input type="text" id="llbDesc" placeholder="যেমন: বিশেষ অফার ৫০% ছাড়!" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;"></div>
                <button onclick="publishLoginLB()" style="align-self:flex-start;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000;border:none;padding:11px 24px;border-radius:11px;font-weight:800;font-size:14px;cursor:pointer;font-family:'Hind Siliguri',sans-serif;display:flex;align-items:center;gap:8px;">
                    <i class="fa fa-upload"></i> পাবলিশ করুন
                </button>
            </div>
        </div>
        <h4 style="color:#fff;margin:0 0 12px;font-size:15px;"><i class="fa fa-list"></i> পাবলিশ হওয়া (${items.length}টি)</h4>
        <div>
            ${items.length===0
                ?`<div style="text-align:center;padding:35px;color:#334155;border:2px dashed #1e293b;border-radius:14px;"><i class="fa fa-images" style="font-size:36px;display:block;margin-bottom:10px;"></i>কোনো লিডারবোর্ড নেই</div>`
                :items.map((it,idx)=>`
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:9px;">
                    <img src="${it.img}" style="width:120px;height:68px;object-fit:cover;border-radius:8px;border:1px solid #334155;flex-shrink:0;" onerror="this.style.background='#1e293b'">
                    <div style="flex:1;min-width:0;">
                        <div style="color:#fff;font-size:13px;font-weight:600;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.desc||'(কোনো বিবরণ নেই)'}</div>
                        <div style="color:#475569;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.img}</div>
                    </div>
                    <button onclick="deleteLoginLB(${idx})" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:7px 12px;border-radius:8px;cursor:pointer;font-size:13px;flex-shrink:0;"><i class="fa fa-trash"></i></button>
                </div>`).join('')
            }
        </div>
    </div>`;
}

function publishLoginLB() {
    const img  = (document.getElementById('llbImg')||{}).value?.trim();
    const desc = (document.getElementById('llbDesc')||{}).value?.trim();
    if(!img){showToast('ছবির লিংক দিন!');return;}
    const items=JSON.parse(localStorage.getItem(LB_KEY))||[];
    items.push({img,desc:desc||'',id:Date.now()});
    localStorage.setItem(LB_KEY,JSON.stringify(items));
    showToast('✅ লিডারবোর্ড পাবলিশ হয়েছে!');
    const c=document.getElementById('adminMainContainer');
    if(c) renderAdminLoginLeaderboard(c);
}

function deleteLoginLB(idx) {
    if(!confirm('ডিলিট করবেন?'))return;
    const items=JSON.parse(localStorage.getItem(LB_KEY))||[];
    items.splice(idx,1);
    localStorage.setItem(LB_KEY,JSON.stringify(items));
    showToast('🗑️ ডিলিট হয়েছে');
    const c=document.getElementById('adminMainContainer');
    if(c) renderAdminLoginLeaderboard(c);
}

// ====================================================================
// SUB-ADMIN SYSTEM
// ====================================================================

const SUB_ADMINS_KEY = 'TM_SUB_ADMINS';

// সকল admin panel ফাংশনের তালিকা — key, label, tab/fn
const SUB_ADMIN_FUNCTIONS = [
    { key: 'publish',       label: 'পণ্য পাবলিশ',                tab: 'publish',        icon: 'fa-upload' },
    { key: 'product_edit',  label: 'পণ্য এডিট ও ডিলিট',          tab: 'product_edit',   icon: 'fa-edit' },
    { key: 'ads',           label: 'বিজ্ঞাপন ম্যানেজমেন্ট',      tab: 'ads',            icon: 'fa-ad' },
    { key: 'orders',        label: 'পেন্ডিং অর্ডারস',             tab: 'orders',         icon: 'fa-list-alt' },
    { key: 'users',         label: 'ইউজার ডিটেইলস',               tab: 'users',          icon: 'fa-users-cog' },
    { key: 'discount-mgmt', label: 'ডিসকাউন্ট ও রিকোয়েস্ট',     tab: 'discount-mgmt',  icon: 'fa-percentage' },
    { key: 'returns',       label: 'রিটার্ন ইউজার পার্সেল',       tab: 'returns',        icon: 'fa-undo-alt' },
    { key: 'notices',       label: 'নোটিশ বোর্ড',                 tab: 'notices',        icon: 'fa-bullhorn' },
    { key: 'storage',       label: 'চেক মেমোরি',                  tab: 'storage',        icon: 'fa-database' },
    { key: 'local-board',   label: 'লোকাল বোর্ড পাবলিশ',          tab: 'local-board',    icon: 'fa-thumbtack' },
    { key: 'login-leaderboard', label: 'লগইন লিডারবোর্ড',         tab: 'login-leaderboard', icon: 'fa-trophy' },
    { key: 'product_limit', label: 'পণ্য লোড ম্যানেজমেন্ট',       fn: 'openProductLimitModal', icon: 'fa-layer-group' },
    { key: 'last_portal',   label: 'লাস্ট পোর্টাল পার্সেল',       fn: 'openLastPortalParcel',  icon: 'fa-box' },
];

function getSubAdmins() {
    try { return JSON.parse(localStorage.getItem(SUB_ADMINS_KEY)) || []; }
    catch(e) { return []; }
}
function saveSubAdmins(list) {
    localStorage.setItem(SUB_ADMINS_KEY, JSON.stringify(list));
}

// ---- Main Sub-Admin Manager UI ----
function renderSubAdminManager(container) {
    const list = getSubAdmins();
    container.innerHTML = `
    <div style="padding:22px;font-family:'Hind Siliguri',sans-serif;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
            <div style="width:48px;height:48px;background:rgba(245,158,11,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;"><i class="fa fa-user-shield" style="color:#fbbf24;"></i></div>
            <div>
                <h3 style="margin:0;color:#fff;font-size:19px;font-weight:700;">সহকারী এডমিন ম্যানেজমেন্ট</h3>
                <p style="margin:0;font-size:12px;color:#64748b;">নতুন সহকারী এডমিন তৈরি এবং পারমিশন ম্যানেজ করুন</p>
            </div>
        </div>

        <!-- Create Form -->
        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:18px;padding:22px;margin-bottom:26px;">
            <h4 style="color:#fbbf24;margin:0 0 16px;font-size:15px;"><i class="fa fa-plus-circle"></i> নতুন সহকারী এডমিন তৈরি করুন</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-bottom:13px;">
                <div>
                    <label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">নাম *</label>
                    <input type="text" id="saName" placeholder="সহকারী এডমিনের নাম" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;font-family:'Hind Siliguri',sans-serif;">
                </div>
                <div>
                    <label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">মোবাইল *</label>
                    <input type="text" id="saMobile" placeholder="017XXXXXXXX" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;font-family:'Hind Siliguri',sans-serif;">
                </div>
                <div>
                    <label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">ইউজার আইডি *</label>
                    <input type="text" id="saId" placeholder="যেমন: Admin_Rahim" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;font-family:'Hind Siliguri',sans-serif;">
                </div>
                <div>
                    <label style="color:#94a3b8;font-size:13px;font-weight:600;display:block;margin-bottom:6px;">পাসওয়ার্ড *</label>
                    <input type="password" id="saPass" placeholder="পাসওয়ার্ড" style="width:100%;background:#0f172a;border:1px solid #334155;color:#fff;padding:10px 13px;border-radius:10px;outline:none;box-sizing:border-box;font-size:14px;font-family:'Hind Siliguri',sans-serif;">
                </div>
            </div>
            <button onclick="createSubAdmin()" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;border:none;padding:11px 26px;border-radius:11px;font-weight:800;font-size:14px;cursor:pointer;font-family:'Hind Siliguri',sans-serif;display:flex;align-items:center;gap:8px;">
                <i class="fa fa-user-plus"></i> এডমিন তৈরি করুন
            </button>
        </div>

        <!-- Sub-Admin List -->
        <h4 style="color:#fff;margin:0 0 13px;font-size:15px;"><i class="fa fa-list"></i> সহকারী এডমিন তালিকা (${list.length}জন)</h4>
        <div id="saList">
            ${list.length === 0
                ? `<div style="text-align:center;padding:40px;color:#334155;border:2px dashed #1e293b;border-radius:14px;"><i class="fa fa-user-slash" style="font-size:38px;display:block;margin-bottom:10px;"></i><p>কোনো সহকারী এডমিন নেই</p></div>`
                : list.map((sa, idx) => _renderSubAdminCard(sa, idx)).join('')
            }
        </div>
    </div>`;
}

function _renderSubAdminCard(sa, idx) {
    const permCount = (sa.permissions||[]).length;
    return `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(245,158,11,.18);border-radius:15px;padding:16px;margin-bottom:12px;display:flex;align-items:center;gap:14px;cursor:pointer;" onclick="openSubAdminPermissions(${idx})" id="saCard_${idx}">
        <div style="width:50px;height:50px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
            <i class="fa fa-user-tie" style="color:#000;"></i>
        </div>
        <div style="flex:1;min-width:0;">
            <div style="color:#fff;font-size:15px;font-weight:700;">${sa.name}</div>
            <div style="color:#64748b;font-size:12px;margin-top:2px;">ID: ${sa.id} &nbsp;|&nbsp; 📞 ${sa.mobile}</div>
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px;">
                ${permCount === 0
                    ? `<span style="background:rgba(100,116,139,.1);color:#475569;padding:3px 10px;border-radius:20px;font-size:11px;">কোনো পারমিশন নেই</span>`
                    : (sa.permissions||[]).slice(0,4).map(p => {
                        const fn = SUB_ADMIN_FUNCTIONS.find(f=>f.key===p);
                        return fn ? `<span style="background:rgba(99,102,241,.12);color:#a5b4fc;padding:3px 9px;border-radius:20px;font-size:11px;"><i class="fa ${fn.icon}"></i> ${fn.label}</span>` : '';
                      }).join('') + (permCount > 4 ? `<span style="background:rgba(99,102,241,.1);color:#6366f1;padding:3px 9px;border-radius:20px;font-size:11px;">+${permCount-4} আরো</span>` : '')
                }
            </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;" onclick="event.stopPropagation()">
            <button onclick="deleteSubAdmin(${idx})" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:8px 14px;border-radius:9px;cursor:pointer;font-size:13px;font-family:'Hind Siliguri',sans-serif;">
                <i class="fa fa-trash"></i> ডিলিট
            </button>
        </div>
    </div>`;
}

function createSubAdmin() {
    const name   = document.getElementById('saName').value.trim();
    const mobile = document.getElementById('saMobile').value.trim();
    const id     = document.getElementById('saId').value.trim();
    const pass   = document.getElementById('saPass').value.trim();

    if (!name||!mobile||!id||!pass) { showToast('❌ সব ঘর পূরণ করুন'); return; }

    const list = getSubAdmins();
    if (list.find(s => s.id === id)) { showToast('❌ এই আইডি আগেই আছে!'); return; }

    // users DB তেও রেজিস্টার করি
    const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    if (users.find(u => u.id === id || u.mobile === mobile)) { showToast('❌ এই আইডি বা মোবাইল ইতিমধ্যে আছে!'); return; }

    const newSA = { id, name, mobile, pass, role: 'sub_admin', permissions: [], createdAt: new Date().toISOString() };
    users.push(newSA);
    localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));

    list.push(newSA);
    saveSubAdmins(list);

    showToast(`✅ ${name} সহকারী এডমিন হিসেবে তৈরি হয়েছে!`);
    const c = document.getElementById('adminMainContainer');
    if (c) renderSubAdminManager(c);
}

function deleteSubAdmin(idx) {
    if (!confirm('এই সহকারী এডমিনকে স্থায়ীভাবে ডিলিট করবেন?')) return;
    const list = getSubAdmins();
    const sa = list[idx];

    // users DB থেকেও সরাই
    const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    const uIdx = users.findIndex(u => u.id === sa.id);
    if (uIdx !== -1) { users.splice(uIdx, 1); localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users)); }

    list.splice(idx, 1);
    saveSubAdmins(list);
    showToast('🗑️ সহকারী এডমিন ডিলিট হয়েছে');
    const c = document.getElementById('adminMainContainer');
    if (c) renderSubAdminManager(c);
}

// ---- Permission Modal ----
function openSubAdminPermissions(idx) {
    const list = getSubAdmins();
    const sa = list[idx];
    const existing = document.getElementById('saPermModal');
    if (existing) existing.remove();

    const hasPerm  = SUB_ADMIN_FUNCTIONS.filter(f => (sa.permissions||[]).includes(f.key));
    const noPerm   = SUB_ADMIN_FUNCTIONS.filter(f => !(sa.permissions||[]).includes(f.key));

    const modal = document.createElement('div');
    modal.id = 'saPermModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(14px);z-index:99994885999;display:flex;align-items:center;justify-content:center;font-family:Hind Siliguri,sans-serif;';
    modal.innerHTML = `
    <div style="background:#0f172a;border:2px solid rgba(245,158,11,.35);border-radius:26px;width:95%;max-width:650px;max-height:88vh;overflow-y:auto;position:relative;animation:saIn .3s ease;">
        <style>@keyframes saIn{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
        <div style="background:linear-gradient(90deg,#f59e0b,#d97706,#f59e0b);background-size:200%;animation:gm 3s linear infinite;height:5px;border-radius:26px 26px 0 0;"></div>
        <div style="padding:24px 28px 10px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <h3 style="color:#fff;margin:0;font-size:19px;font-weight:800;">${sa.name}</h3>
                <p style="color:#64748b;margin:4px 0 0;font-size:13px;">পারমিশন ম্যানেজমেন্ট</p>
            </div>
            <span onclick="document.getElementById('saPermModal').remove()" style="font-size:27px;color:#475569;cursor:pointer;line-height:1;">&times;</span>
        </div>
        <div style="padding:0 28px 28px;">

            <!-- এক্সেস আছে -->
            <div style="margin-bottom:22px;">
                <div style="display:flex;align-items:center;gap:9px;margin-bottom:13px;">
                    <div style="width:8px;height:8px;background:#10b981;border-radius:50%;"></div>
                    <h4 style="color:#10b981;margin:0;font-size:14px;font-weight:700;">এক্সেস আছে (${hasPerm.length}টি)</h4>
                </div>
                ${hasPerm.length === 0
                    ? `<div style="padding:14px;background:rgba(16,185,129,.05);border:1px dashed rgba(16,185,129,.2);border-radius:12px;color:#334155;font-size:13px;text-align:center;">কোনো পারমিশন নেই</div>`
                    : hasPerm.map(f => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.18);border-radius:11px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <div style="width:34px;height:34px;background:rgba(16,185,129,.12);border-radius:9px;display:flex;align-items:center;justify-content:center;"><i class="fa ${f.icon}" style="color:#10b981;font-size:14px;"></i></div>
                                <span style="color:#fff;font-size:14px;font-weight:600;">${f.label}</span>
                            </div>
                            <button onclick="revokePermission(${idx},'${f.key}')" style="background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:6px 13px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;white-space:nowrap;">
                                <i class="fa fa-times"></i> বাতিল করুন
                            </button>
                        </div>`).join('')
                }
            </div>

            <!-- এক্সেস নেই -->
            <div>
                <div style="display:flex;align-items:center;gap:9px;margin-bottom:13px;">
                    <div style="width:8px;height:8px;background:#ef4444;border-radius:50%;"></div>
                    <h4 style="color:#f87171;margin:0;font-size:14px;font-weight:700;">এক্সেস নেই (${noPerm.length}টি)</h4>
                </div>
                ${noPerm.length === 0
                    ? `<div style="padding:14px;background:rgba(99,102,241,.05);border:1px dashed rgba(99,102,241,.2);border-radius:12px;color:#334155;font-size:13px;text-align:center;">সব পারমিশন দেওয়া আছে</div>`
                    : noPerm.map(f => `
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:11px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <div style="width:34px;height:34px;background:rgba(100,116,139,.1);border-radius:9px;display:flex;align-items:center;justify-content:center;"><i class="fa ${f.icon}" style="color:#475569;font-size:14px;"></i></div>
                                <span style="color:#94a3b8;font-size:14px;font-weight:600;">${f.label}</span>
                            </div>
                            <button onclick="grantPermission(${idx},'${f.key}')" style="background:rgba(99,102,241,.15);color:#a5b4fc;border:1px solid rgba(99,102,241,.3);padding:6px 13px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;white-space:nowrap;">
                                <i class="fa fa-check"></i> প্রদান করুন
                            </button>
                        </div>`).join('')
                }
            </div>
        </div>
    </div>`;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

function grantPermission(idx, key) {
    const list = getSubAdmins();
    if (!list[idx]) return;
    list[idx].permissions = list[idx].permissions || [];
    if (!list[idx].permissions.includes(key)) list[idx].permissions.push(key);
    saveSubAdmins(list);
    _syncSubAdminToUsers(list[idx]);
    // যদি এই sub-admin এখন logged in থাকে তাহলে appState ও live update করি
    if (appState.currentUser && appState.currentUser.id === list[idx].id) {
        appState.currentUser.permissions = list[idx].permissions;
        _applySubAdminSidebar(list[idx].permissions);
    }
    if (typeof window.pushToCloud === 'function') window.pushToCloud('TM_DB_USERS_V2');
    showToast('✅ পারমিশন দেওয়া হয়েছে!');
    openSubAdminPermissions(idx);
    const c = document.getElementById('adminMainContainer');
    if (c && c.querySelector('#saList')) renderSubAdminManager(c);
}

function revokePermission(idx, key) {
    const list = getSubAdmins();
    if (!list[idx]) return;
    list[idx].permissions = (list[idx].permissions||[]).filter(p => p !== key);
    saveSubAdmins(list);
    _syncSubAdminToUsers(list[idx]);
    // যদি এই sub-admin এখন logged in থাকে তাহলে appState ও live update করি
    if (appState.currentUser && appState.currentUser.id === list[idx].id) {
        appState.currentUser.permissions = list[idx].permissions;
        _applySubAdminSidebar(list[idx].permissions);
    }
    if (typeof window.pushToCloud === 'function') window.pushToCloud('TM_DB_USERS_V2');
    showToast('🚫 পারমিশন বাতিল হয়েছে');
    openSubAdminPermissions(idx);
    const c = document.getElementById('adminMainContainer');
    if (c && c.querySelector('#saList')) renderSubAdminManager(c);
}

// Users DB তে sub-admin এর permissions sync করি
function _syncSubAdminToUsers(sa) {
    const users = JSON.parse(localStorage.getItem(DB_KEYS.USERS)) || [];
    const idx = users.findIndex(u => u.id === sa.id);
    if (idx !== -1) {
        users[idx].permissions = sa.permissions;
        users[idx].role = 'sub_admin';
        localStorage.setItem(DB_KEYS.USERS, JSON.stringify(users));
        appState.users = users;
    }
    // যদি এই sub-admin এখন logged in থাকে তাহলে session ও update করি
    try {
        const sess = JSON.parse(localStorage.getItem(DB_KEYS.SESSION));
        if (sess && sess.id === sa.id) {
            sess.permissions = sa.permissions;
            localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(sess));
            appState.currentUser = sess;
            _applySubAdminSidebar(sa.permissions);
        }
    } catch(e) {}
    // Firebase এ সরাসরি sub-admin document update করি
    // যাতে sub-admin এর browser real-time listener থেকে live পায়
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            firebase.firestore().collection('users').doc(sa.id).update({
                permissions: sa.permissions,
                role: 'sub_admin'
            }).catch(()=>{});
        }
    } catch(e) {}
}

// Sub-admin sidebar apply
function _applySubAdminSidebar(permissions) {
    window._applySubAdminSidebar = _applySubAdminSidebar; // firebase-sync থেকে access এর জন্য
    document.querySelectorAll('#adminPanelModal .menu-btn').forEach(btn => {
        const oc = btn.getAttribute('onclick') || '';
        // sub-admin management — সবসময় লুকাই
        if (oc.includes('sub-admin') || btn.textContent.includes('নতুন এডমিন')) {
            btn.style.display = 'none'; return;
        }
        // SUB_ADMIN_FUNCTIONS এর মধ্যে match খুঁজি — tab বা fn দিয়ে
        const matched = SUB_ADMIN_FUNCTIONS.find(f => {
            if (f.tab && (oc.includes("'" + f.tab + "'") || oc.includes('"' + f.tab + '"'))) return true;
            if (f.fn && oc.includes(f.fn)) return true;
            return false;
        });
        if (matched) {
            btn.style.display = permissions.includes(matched.key) ? '' : 'none';
        }
        // product_edit কোনো tab নয়, তাই এটা আলাদাভাবে handle করার দরকার নেই sidebar এ
    });
}

// ============================================================
// MOBILE DESKTOP-LIKE FIXES
// মোবাইলে পিসির মতো experience এর জন্য
// ============================================================
function _initMobileFixes() {
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!isMobile) return;

    // ১. Touch scroll — সব scrollable div এ touch scroll enable
    function enableTouchScroll(el) {
        el.style.webkitOverflowScrolling = 'touch';
    }

    // Observe করি নতুন modals যোগ হলে
    if (window.MutationObserver) {
        var obs = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        // overflow:auto বা overflow:scroll যুক্ত element গুলো ধরি
                        var scrollEls = node.querySelectorAll ? 
                            node.querySelectorAll('[style*="overflow"]') : [];
                        scrollEls.forEach(enableTouchScroll);
                        enableTouchScroll(node);
                    }
                });
            });
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // ২. Product slider — swipe support
    function addSwipeToSlider(slider) {
        var startX = 0, startY = 0, moved = false;
        slider.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            moved = false;
        }, { passive: true });
        slider.addEventListener('touchmove', function(e) {
            moved = true;
        }, { passive: true });
        slider.addEventListener('touchend', function(e) {
            if (!moved) return;
            var dx = e.changedTouches[0].clientX - startX;
            var dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                // horizontal swipe detected — slider id বের করি
                var sliderParent = slider.closest('[id^="slider-"]');
                if (sliderParent) {
                    var pid = sliderParent.id.replace('slider-', '');
                    if (dx < 0) { if(typeof moveSlide==='function') moveSlide(pid, 1); }
                    else        { if(typeof moveSlide==='function') moveSlide(pid, -1); }
                }
            }
        }, { passive: true });
    }

    // Existing sliders এ swipe যোগ করি
    document.querySelectorAll('.slides-container').forEach(addSwipeToSlider);

    // নতুন sliders এ swipe যোগ করি (MutationObserver দিয়ে)
    var sliderObs = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    var sliders = node.querySelectorAll ? 
                        node.querySelectorAll('.slides-container') : [];
                    sliders.forEach(addSwipeToSlider);
                    if (node.classList && node.classList.contains('slides-container')) {
                        addSwipeToSlider(node);
                    }
                }
            });
        });
    });
    sliderObs.observe(document.body, { childList: true, subtree: true });

    // ৩. Modal scroll fix — modal খুললে body scroll lock
    document.addEventListener('touchmove', function(e) {
        // modal open থাকলে background scroll বন্ধ
        var openModal = document.querySelector('.modal-overlay[style*="flex"], .mo.open');
        if (openModal && !openModal.contains(e.target)) {
            e.preventDefault();
        }
    }, { passive: false });

    // ৪. Double-tap zoom prevent on buttons
    var lastTap = 0;
    document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            if (now - lastTap < 300) { e.preventDefault(); }
            lastTap = now;
        }
    });

    console.log('[TM] Mobile fixes applied ✅');
}
