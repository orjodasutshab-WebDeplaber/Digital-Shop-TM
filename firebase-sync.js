// ============================================================
// firebase-sync.js — Digital Shop TM v3.0
// Regular script (not module) — idb-shim এর আগে override করে
// ============================================================

(async function() {

// Firebase SDK CDN থেকে load করি
const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
const { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, writeBatch } = 
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

const firebaseConfig = {
  apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
  authDomain: "digitalshoptm-2008.firebaseapp.com",
  projectId: "digitalshoptm-2008",
  storageBucket: "digitalshoptm-2008.firebasestorage.app",
  messagingSenderId: "627378095856",
  appId: "1:627378095856:web:b705f4f75e0512646ca435",
  measurementId: "G-1LJR9JQL0V"
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);

// Firebase pull চলছে কিনা — চললে push হবে না
let _pulling = false;

const KEY_MAP = {
  'TM_DB_PRODUCTS_V2'    : 'products',
  'TM_DB_USERS_V2'       : 'users',
  'TM_DB_ORDERS_V2'      : 'orders',
  'TM_DB_ADS_V2'         : 'ads',
  'TM_DB_GIFT_CARDS_V2'  : 'gift_cards',
  'TM_DB_RETURNS_V2'     : 'returns',
  'TM_DB_NOTICES_V1'     : 'notices',
  'TM_LOGIN_LEADERBOARDS': 'leaderboards',
  'TM_LOCAL_BOARDS'      : 'local_boards',
  'sironam_list'         : 'sironam',
  'deli_ads'             : 'deli_ads',
  'TM_SUB_ADMINS'        : 'sub_admins',
  'special_requests'     : 'special_requests',
  'TM_DB_PRODUCT_LIMITS' : 'product_limits',
  'tm_reports'           : 'reports',
  'all_discounts'        : 'all_discounts',
  'global_discounts'     : 'global_discounts',
};

const SINGLE_DOC_KEYS = new Set(['tm_reports','all_discounts','global_discounts']);

function sanitize(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch(e) { return obj; }
}

// ──────────────────────────────────────────
// Array helpers
// ──────────────────────────────────────────
async function pushArray(colName, arr) {
  const CHUNK = 400;
  try {
    const snap = await getDocs(collection(db, colName));
    if (snap.docs.length > 0) {
      const b = writeBatch(db);
      snap.docs.forEach(d => b.delete(d.ref));
      await b.commit();
    }
    for (let i = 0; i < arr.length; i += CHUNK) {
      const b = writeBatch(db);
      arr.slice(i, i + CHUNK).forEach((item, j) => {
        const id = item.id ? String(item.id) : String(i + j);
        b.set(doc(db, colName, id), sanitize(item));
      });
      await b.commit();
    }
  } catch(e) { console.warn('[FB] pushArray err:', colName, e.message); }
}

async function pullArray(colName) {
  try {
    const snap = await getDocs(collection(db, colName));
    return snap.docs.map(d => d.data());
  } catch(e) { return null; }
}

// idb-shim এর TM_CACHE ও update করে
function setLocal(key, value) {
  _pulling = true;
  try {
    // window._TM_CACHE সরাসরি update করি (idb-shim এর internal cache)
    if (window._TM_CACHE) {
      window._TM_CACHE[key] = JSON.stringify(value);
    }
    // তারপর localStorage.setItem দিয়ে IDB তেও save করি
    const origSet = localStorage._origSet || localStorage.setItem.bind(localStorage);
    origSet(key, JSON.stringify(value));
  } finally { _pulling = false; }
}

// ──────────────────────────────────────────
// PUSH
// ──────────────────────────────────────────
async function pushToCloud(lsKey) {
  const colName = KEY_MAP[lsKey];
  if (!colName) return;
  const raw = localStorage.getItem(lsKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!SINGLE_DOC_KEYS.has(lsKey) && Array.isArray(data)) {
      await pushArray(colName, data);
    } else {
      const payload = Array.isArray(data) ? { _arr: sanitize(data) }
        : (data && typeof data === 'object' ? sanitize(data) : { value: data });
      await setDoc(doc(db, colName, 'data'), payload);
    }
    console.log('[FB] ↑ Pushed:', lsKey);
  } catch(e) { console.warn('[FB] push err:', lsKey, e.message); }
}
window.pushToCloud = pushToCloud; // app.js থেকেও call করা যাবে

// ──────────────────────────────────────────
// PULL
// ──────────────────────────────────────────
async function pullFromCloud(lsKey) {
  const colName = KEY_MAP[lsKey];
  if (!colName) return;
  try {
    if (SINGLE_DOC_KEYS.has(lsKey)) {
      const snap = await getDoc(doc(db, colName, 'data'));
      if (snap.exists()) {
        const d = snap.data();
        const val = d._arr !== undefined ? d._arr : (d.value !== undefined ? d.value : d);
        setLocal(lsKey, val);
      }
    } else {
      const arr = await pullArray(colName);
      if (arr && arr.length > 0) {
        setLocal(lsKey, arr);
      }
    }
    console.log('[FB] ↓ Pulled:', lsKey);
  } catch(e) { console.warn('[FB] pull err:', lsKey, e.message); }
}

// ──────────────────────────────────────────
// SYNC ALL
// ──────────────────────────────────────────
async function syncAllFromCloud() {
  console.log('[FB] Syncing all from cloud...');
  const priority = [
    'TM_DB_PRODUCTS_V2','TM_DB_USERS_V2','TM_DB_ORDERS_V2',
    'special_requests','TM_DB_RETURNS_V2','tm_reports','TM_DB_PRODUCT_LIMITS',
    'deli_ads','TM_DB_ADS_V2','sironam_list'
  ];
  const rest = Object.keys(KEY_MAP).filter(k => !priority.includes(k));
  await Promise.all(priority.map(k => pullFromCloud(k)));
  await Promise.all(rest.map(k => pullFromCloud(k)));
  console.log('[FB] Sync complete!');
  window.dispatchEvent(new CustomEvent('fb-sync-done'));
}

// ──────────────────────────────────────────
// localStorage.setItem override
// idb-shim এর setItem কে wrap করি
// ──────────────────────────────────────────
function overrideLocalStorage() {
  const currentSetItem = localStorage.setItem.bind(localStorage);
  // original reference save করি
  localStorage._origSet = currentSetItem;
  
  localStorage.setItem = function(key, value) {
    currentSetItem(key, value); // idb-shim এর setItem — TM_CACHE update হবে
    if (!_pulling && KEY_MAP[key]) {
      if (!window._fbTimers) window._fbTimers = {};
      clearTimeout(window._fbTimers[key]);
      window._fbTimers[key] = setTimeout(() => pushToCloud(key), 600);
    }
  };
  console.log('[FB] localStorage.setItem override installed');
}

// ──────────────────────────────────────────
// Real-time listeners
// ──────────────────────────────────────────
function listenOrders() {
  onSnapshot(collection(db, 'orders'), snap => {
    const orders = snap.docs.map(d => d.data());
    setLocal('TM_DB_ORDERS_V2', orders);
    if (window.appState) window.appState.orders = orders;
  });
}

function listenRequests() {
  onSnapshot(collection(db, 'special_requests'), snap => {
    const reqs = snap.docs.map(d => d.data());
    setLocal('special_requests', reqs);
    if (window.appState) window.appState.specialRequests = reqs;
  });
}

function listenReturns() {
  onSnapshot(collection(db, 'returns'), snap => {
    const returns = snap.docs.map(d => d.data());
    setLocal('TM_DB_RETURNS_V2', returns);
    if (window.appState) window.appState.returns = returns;
  });
}

function listenProducts() {
  onSnapshot(collection(db, 'products'), snap => {
    const products = snap.docs.map(d => d.data());
    setLocal('TM_DB_PRODUCTS_V2', products);
    if (window.appState) {
      window.appState.products = products;
      if (typeof renderProductGrid === 'function') renderProductGrid(products);
    }
  });
}

function listenUsers() {
  onSnapshot(collection(db, 'users'), snap => {
    const users = snap.docs.map(d => d.data());
    setLocal('TM_DB_USERS_V2', users);
    if (window.appState) window.appState.users = users;
  });
}

function listenAds() {
  onSnapshot(collection(db, 'ads'), snap => {
    const ads = snap.docs.map(d => d.data());
    setLocal('TM_DB_ADS_V2', ads);
    if (window.appState) window.appState.ads = ads;
  });
}

// ──────────────────────────────────────────
// Init — idb-shim ready হওয়ার পর চালু করি
// ──────────────────────────────────────────
overrideLocalStorage(); // এখনই override করি

// TM_READY হলে sync শুরু করি
const tmReady = window.TM_READY || Promise.resolve();
window.FB_READY = tmReady.then(async () => {
  await syncAllFromCloud();
  // Real-time listeners চালু
  listenOrders();
  listenRequests();
  listenReturns();
  listenProducts();
  listenUsers();
  listenAds();
});

})();
