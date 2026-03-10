// ============================================================
// firebase-sync.js — Digital Shop TM v4.0
// compat SDK ব্যবহার করে — synchronous, module নয়
// ============================================================

(function() {
'use strict';

// Firebase compat SDK head এ load হওয়া দরকার
// index.html এ আগে থেকেই load হয়েছে

const firebaseConfig = {
  apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
  authDomain: "digitalshoptm-2008.firebaseapp.com",
  projectId: "digitalshoptm-2008",
  storageBucket: "digitalshoptm-2008.firebasestorage.app",
  messagingSenderId: "627378095856",
  appId: "1:627378095856:web:b705f4f75e0512646ca435",
  measurementId: "G-1LJR9JQL0V"
};

// Firebase already initialized check
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

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

// idb-shim এর TM_CACHE সরাসরি update করি
function setLocal(key, value) {
  _pulling = true;
  try {
    const str = JSON.stringify(value);
    // idb-shim এর internal cache সরাসরি update
    if (window._TM_CACHE) {
      window._TM_CACHE[key] = str;
    }
    // IDB তেও save করি (idb-shim এর _origSetItem বা raw setItem)
    const origFn = localStorage._fbOrigSet || Object.getOwnPropertyDescriptor(window, 'localStorage');
    // window._TMDB দিয়ে IDB তে সরাসরি save করি
    if (window._TMDB) {
      window._TMDB.set(key, str).catch(()=>{});
    }
  } finally {
    _pulling = false;
  }
}

// ──────────────────────────────────────────
// PUSH array to Firestore
// ──────────────────────────────────────────
async function pushArray(colName, arr) {
  try {
    const snap = await db.collection(colName).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    const CHUNK = 400;
    for (let i = 0; i < arr.length; i += CHUNK) {
      const b = db.batch();
      arr.slice(i, i + CHUNK).forEach((item, j) => {
        const id = item.id ? String(item.id) : String(i + j);
        b.set(db.collection(colName).doc(id), sanitize(item));
      });
      await b.commit();
    }
    if (snap.docs.length > 0) await batch.commit();
  } catch(e) { console.warn('[FB] pushArray err:', colName, e.message); }
}

async function pullArray(colName) {
  try {
    const snap = await db.collection(colName).get();
    return snap.docs.map(d => d.data());
  } catch(e) { return null; }
}

// ──────────────────────────────────────────
// PUSH
// ──────────────────────────────────────────
window.pushToCloud = async function(lsKey) {
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
      await db.collection(colName).doc('data').set(payload);
    }
    console.log('[FB] ↑ Pushed:', lsKey);
  } catch(e) { console.warn('[FB] push err:', lsKey, e.message); }
};

// ──────────────────────────────────────────
// PULL
// ──────────────────────────────────────────
async function pullFromCloud(lsKey) {
  const colName = KEY_MAP[lsKey];
  if (!colName) return;
  try {
    if (SINGLE_DOC_KEYS.has(lsKey)) {
      const snap = await db.collection(colName).doc('data').get();
      if (snap.exists) {
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
    'special_requests','TM_DB_RETURNS_V2','tm_reports',
    'TM_DB_PRODUCT_LIMITS','deli_ads','TM_DB_ADS_V2','sironam_list'
  ];
  const rest = Object.keys(KEY_MAP).filter(k => !priority.includes(k));
  await Promise.all(priority.map(k => pullFromCloud(k)));
  await Promise.all(rest.map(k => pullFromCloud(k)));
  console.log('[FB] Sync complete!');
  window.dispatchEvent(new CustomEvent('fb-sync-done'));
}

// ──────────────────────────────────────────
// localStorage.setItem override
// ──────────────────────────────────────────
function overrideSetItem() {
  const orig = localStorage.setItem.bind(localStorage);
  localStorage._fbOrigSet = orig;
  localStorage.setItem = function(key, value) {
    orig(key, value);
    if (_pulling) return; // Firebase pull চলছে, push করব না
    if (!window._fbTimers) window._fbTimers = {};

    // ১. Known keys → Firebase push
    if (KEY_MAP[key]) {
      clearTimeout(window._fbTimers[key]);
      window._fbTimers[key] = setTimeout(() => window.pushToCloud(key), 600);
    }

    // ২. Address keys → users collection এ merge
    if (key.startsWith('digital_shop_user_address_')) {
      const userId = key.replace('digital_shop_user_address_', '');
      if (userId && userId !== 'guest') {
        clearTimeout(window._fbTimers[key]);
        window._fbTimers[key] = setTimeout(async () => {
          try {
            const addrData = JSON.parse(value);
            await db.collection('users').doc(userId).set(
              { savedAddress: addrData }, { merge: true }
            );
            console.log('[FB] Address saved for user:', userId);
          } catch(e) { console.warn('[FB] address save err:', e.message); }
        }, 600);
      }
    }
  };
  console.log('[FB] setItem override ready');
}

// ──────────────────────────────────────────
// Real-time listeners
// ──────────────────────────────────────────
function startListeners() {
  // Products
  db.collection('products').onSnapshot(snap => {
    const products = snap.docs.map(d => d.data());
    setLocal('TM_DB_PRODUCTS_V2', products);
    if (window.appState) { window.appState.products = products; }
  });

  // Users
  db.collection('users').onSnapshot(snap => {
    const users = snap.docs.map(d => d.data());
    setLocal('TM_DB_USERS_V2', users);
    if (window.appState) window.appState.users = users;
  });

  // Orders
  db.collection('orders').onSnapshot(snap => {
    const orders = snap.docs.map(d => d.data());
    setLocal('TM_DB_ORDERS_V2', orders);
    if (window.appState) window.appState.orders = orders;
  });

  // Ads
  db.collection('ads').onSnapshot(snap => {
    const ads = snap.docs.map(d => d.data());
    setLocal('TM_DB_ADS_V2', ads);
    if (window.appState) window.appState.ads = ads;
  });

  // Deli ads
  db.collection('deli_ads').onSnapshot(snap => {
    const dads = snap.docs.map(d => d.data());
    setLocal('deli_ads', dads);
  });

  // Special requests
  db.collection('special_requests').onSnapshot(snap => {
    const reqs = snap.docs.map(d => d.data());
    setLocal('special_requests', reqs);
    if (window.appState) window.appState.specialRequests = reqs;
  });

  // Returns
  db.collection('returns').onSnapshot(snap => {
    const returns = snap.docs.map(d => d.data());
    setLocal('TM_DB_RETURNS_V2', returns);
    if (window.appState) window.appState.returns = returns;
  });

  console.log('[FB] Real-time listeners started');
}

// ──────────────────────────────────────────
// Address save — TM_USER_ADDRESS_ prefix key handle
// ──────────────────────────────────────────
(function patchAddressSave() {
  // address key গুলো TM_USER_ADDRESS_userId format এ থাকে
  // এগুলো Firebase এ save করতে হবে
  const origSet = localStorage.setItem.bind(localStorage);
  window._addressOrigSet = origSet;
})();

// ──────────────────────────────────────────
// Init
// ──────────────────────────────────────────
overrideSetItem();

// TM_READY (idb-shim hydration) শেষে sync শুরু করি
const tmReady = window.TM_READY || Promise.resolve();
window.FB_READY = tmReady.then(async () => {
  await syncAllFromCloud();
  startListeners();
});

})();
