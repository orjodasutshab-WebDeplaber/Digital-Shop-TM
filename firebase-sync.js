// ============================================================
// firebase-sync.js — Digital Shop TM v5.0
// compat SDK — idb-shim এর সাথে সঠিকভাবে কাজ করে
// ============================================================
(function() {
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
  authDomain: "digitalshoptm-2008.firebaseapp.com",
  projectId: "digitalshoptm-2008",
  storageBucket: "digitalshoptm-2008.firebasestorage.app",
  messagingSenderId: "627378095856",
  appId: "1:627378095856:web:b705f4f75e0512646ca435"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let _pulling = false; // pull চলছে — push করব না

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

// idb-shim এর tmStorage.setItem সরাসরি call করি
// এতে TM_CACHE আপডেট হয় + IDB তে save হয়
// কিন্তু আমাদের override trigger হয় না (loop নেই)
function setLocal(key, value) {
  _pulling = true;
  try {
    const str = JSON.stringify(value);
    // idb-shim এর TM_CACHE সরাসরি
    if (window._TM_CACHE) window._TM_CACHE[key] = str;
    // IDB তে persist
    if (window._TMDB) window._TMDB.set(key, str).catch(()=>{});
  } finally {
    _pulling = false;
  }
}

// ── PUSH array to Firestore ──
async function pushArray(colName, arr) {
  try {
    if (!arr || arr.length === 0) return;
    const CHUNK = 400;
    for (let i = 0; i < arr.length; i += CHUNK) {
      const b = db.batch();
      arr.slice(i, i + CHUNK).forEach((item, j) => {
        const id = item.id ? String(item.id) : String(i + j);
        const clean = JSON.parse(JSON.stringify(item));
        b.set(db.collection(colName).doc(id), clean);
      });
      await b.commit();
    }
  } catch(e) { console.warn('[FB] pushArray err:', colName, e.message); }
}

// ── PUSH single key to Firestore ──
window.pushToCloud = async function(lsKey) {
  const colName = KEY_MAP[lsKey];
  if (!colName) return;
  const raw = window._TM_CACHE ? window._TM_CACHE[lsKey] : localStorage.getItem(lsKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (SINGLE_DOC_KEYS.has(lsKey)) {
      const payload = Array.isArray(data) ? {_arr: data} : (typeof data==='object' ? data : {value: data});
      await db.collection(colName).doc('data').set(payload);
    } else if (Array.isArray(data)) {
      await pushArray(colName, data);
    }
    console.log('[FB] ↑ Pushed:', lsKey, Array.isArray(data) ? data.length + ' items' : '');
  } catch(e) { console.warn('[FB] push err:', lsKey, e.message); }
};

// ── PULL from Firestore ──
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
      const snap = await db.collection(colName).get();
      if (!snap.empty) {
        let arr = snap.docs.map(d => d.data());
        // Users: শুধু valid (id + name আছে) নিই
        if (lsKey === 'TM_DB_USERS_V2') {
          arr = arr.filter(u => u.id && u.name);
          if (arr.length === 0) { console.warn('[FB] Users: no valid users, skipping'); return; }
        }
        setLocal(lsKey, arr);
      }
    }
    console.log('[FB] ↓ Pulled:', lsKey);
  } catch(e) { console.warn('[FB] pull err:', lsKey, e.message); }
}

// ── SYNC ALL ──
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

// ── Real-time listeners ──
function startListeners() {
  db.collection('products').onSnapshot(snap => {
    if (_pulling) return;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_PRODUCTS_V2', arr);
    if (window.appState) window.appState.products = arr;
  });
  db.collection('users').onSnapshot(snap => {
    if (_pulling) return;
    const arr = snap.docs.map(d => d.data()).filter(u => u.id && u.name);
    if (arr.length === 0) return;
    setLocal('TM_DB_USERS_V2', arr);
    if (window.appState) window.appState.users = arr;
  });
  db.collection('orders').onSnapshot(snap => {
    if (_pulling) return;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_ORDERS_V2', arr);
    if (window.appState) window.appState.orders = arr;
  });
  db.collection('ads').onSnapshot(snap => {
    if (_pulling) return;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_ADS_V2', arr);
    if (window.appState) window.appState.ads = arr;
    if (typeof startAdBoard === 'function') setTimeout(startAdBoard, 300);
  });
  db.collection('deli_ads').onSnapshot(snap => {
    if (_pulling) return;
    setLocal('deli_ads', snap.docs.map(d => d.data()));
  });
  db.collection('special_requests').onSnapshot(snap => {
    if (_pulling) return;
    const arr = snap.docs.map(d => d.data());
    setLocal('special_requests', arr);
    if (window.appState) window.appState.specialRequests = arr;
  });
  db.collection('returns').onSnapshot(snap => {
    if (_pulling) return;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_RETURNS_V2', arr);
    if (window.appState) window.appState.returns = arr;
  });
  console.log('[FB] Real-time listeners started');
}

// ── localStorage.setItem override ──
// idb-shim এর tmStorage object টাকে wrap করি
function overrideSetItem() {
  // idb-shim এর setItem save করি
  const origSetItem = localStorage.setItem.bind(localStorage);
  
  localStorage.setItem = function(key, value) {
    // আগে idb-shim এর setItem call করি (TM_CACHE + IDB update)
    origSetItem(key, value);
    
    if (_pulling) return; // pull চলছে — push করব না
    if (!window._fbTimers) window._fbTimers = {};

    // ১. Known DB keys → Firebase push
    if (KEY_MAP[key]) {
      clearTimeout(window._fbTimers[key]);
      window._fbTimers[key] = setTimeout(() => window.pushToCloud(key), 800);
    }

    // ২. Address keys → users doc এ merge
    if (key.startsWith('digital_shop_user_address_')) {
      const userId = key.replace('digital_shop_user_address_', '');
      if (userId && userId !== 'guest') {
        clearTimeout(window._fbTimers[key]);
        window._fbTimers[key] = setTimeout(async () => {
          try {
            const addrData = JSON.parse(value);
            // users collection এ ঐ user এর doc এ savedAddress merge করি
            await db.collection('users').doc(String(userId)).set(
              { savedAddress: addrData }, { merge: true }
            );
            console.log('[FB] Address saved for user:', userId);
          } catch(e) { console.warn('[FB] address save err:', e.message); }
        }, 800);
      }
    }
  };
  console.log('[FB] setItem override ready');
}

// ── Init ──
overrideSetItem();

const tmReady = window.TM_READY || Promise.resolve();
window.FB_READY = tmReady.then(async () => {
  await syncAllFromCloud();
  startListeners();
});

})();
