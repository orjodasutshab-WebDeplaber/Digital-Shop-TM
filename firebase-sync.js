// ============================================================
// firebase-sync.js  v7.0 — Digital Shop TM
// ── Multi-Firebase (সর্বোচ্চ ১০টি) ──────────────────────────
//
//  ✅ প্রতিটি Firebase আলাদা ডাটা ধরে:
//     FB1 → users (ইউজার ডাটা)
//     FB2 → products (পণ্য সব)
//     FB3 → orders, returns, special_requests (অর্ডার)
//     FB4 → chat (গ্রুপ চ্যাট, পার্সোনাল চ্যাট)
//     FB5 → ads, deli_ads, notices (বিজ্ঞাপন)
//     FB6 → গিফট কার্ড, ডিসকাউন্ট, লিডারবোর্ড ইত্যাদি
//     FB7–FB10 → ভবিষ্যতের জন্য খালি রাখা হয়েছে
//
//  ✅ নতুন Firebase যোগ করতে শুধু:
//     ১. FB_CONFIGS এ config দিন
//     ২. COLLECTION_ROUTING এ collection assign করুন
//     ৩. বাকি সব কোড নিজে নিজে কাজ করবে!
//
//  ✅ যদি কোনো Firebase config না দেওয়া থাকে, সেই
//     collection গুলো স্বয়ংক্রিয়ভাবে FB1 (primary) এ চলে যাবে।
// ============================================================
(function () {
'use strict';

// ════════════════════════════════════════════════════════════
// ██  SECTION A — FIREBASE CONFIGS  (শুধু এখানে পরিবর্তন করুন)
// ════════════════════════════════════════════════════════════
//
//  প্রতিটি Firebase এর জন্য শুধু দুটো জিনিস দরকার:
//    apiKey    → Firebase Console → Project Settings → apiKey
//    projectId → Firebase Console → Project Settings → Project ID
//
//  বাকি ৪টি field (authDomain, storageBucket, messagingSenderId, appId)
//  দিলে ভালো, না দিলে projectId থেকে auto-generate হবে।
// ────────────────────────────────────────────────────────────

const FB_CONFIGS = {

  // ── FB1: Users (ইউজার ডাটা) ─────────────────────────────
  fb1_users: {
    apiKey:            "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
    authDomain:        "digitalshoptm-2008.firebaseapp.com",
    projectId:         "digitalshoptm-2008",
    storageBucket:     "digitalshoptm-2008.firebasestorage.app",
    messagingSenderId: "627378095856",
    appId:             "1:627378095856:web:b705f4f75e0512646ca435"
  },

  // ── FB2: Products (পণ্য) ─────────────────────────────────
  fb2_products: {
    apiKey:            "AIzaSyAwZZvrRudnX2UVhnVvetOAzyqYvv7QMG0",
    authDomain:        "digital-shoptm.firebaseapp.com",
    projectId:         "digital-shoptm",
    storageBucket:     "digital-shoptm.firebasestorage.app",
    messagingSenderId: "668626330126",
    appId:             "1:668626330126:web:a19a02ea3950f8c63a125f",
  },

  // ── FB3: Orders (অর্ডার, রিটার্ন) ───────────────────────
  fb3_orders: {
    apiKey:            "AIzaSyClKg0kEl_9x98cOioA66NtqPA5liQNzQ0",
    authDomain:        "digitalshoptm-3.firebaseapp.com",
    projectId:         "digitalshoptm-3",
    storageBucket:     "digitalshoptm-3.firebasestorage.app",
    messagingSenderId: "62133511639",
    appId:             "1:62133511639:web:6acda80cf6d1520ba09792",
  },

  // ── FB4: Chat (গ্রুপ চ্যাট) ──────────────────────────────
  fb4_chat: {
    apiKey:            "AIzaSyAxMHT3fRUZfMz2FWa3r_SAgPSuuvf8ZPw",
    authDomain:        "digital-shop-tm-9d4dd.firebaseapp.com",
    projectId:         "digital-shop-tm-9d4dd",
    storageBucket:     "digital-shop-tm-9d4dd.firebasestorage.app",
    messagingSenderId: "96811905608",
    appId:             "1:96811905608:web:9dbf9a3d27bdb6f5ec5e7d",
  },

  // ── FB5: ভবিষ্যৎ ─────────────────────────────────────────
  fb5_future1: {
    apiKey:            "AIzaSyDVIQDaZ43M5lKXY5XI-zhzBYabMFUSSX0",
    authDomain:        "digital-shop-tm-96b5a.firebaseapp.com",
    projectId:         "digital-shop-tm-96b5a",
    storageBucket:     "digital-shop-tm-96b5a.firebasestorage.app",
    messagingSenderId: "426220965716",
    appId:             "1:426220965716:web:08d2801cdadae62fce02c1",
  },

  // ── FB6: ভবিষ্যৎ ─────────────────────────────────────────
  fb6_future2: {
    apiKey:            "AIzaSyAfXiFmvRxkmyvstEDMfKmkPiKaVsESuXY",
    authDomain:        "digital-shop-tm-2fb5d.firebaseapp.com",
    projectId:         "digital-shop-tm-2fb5d",
    storageBucket:     "digital-shop-tm-2fb5d.firebasestorage.app",
    messagingSenderId: "411502066413",
    appId:             "1:411502066413:web:2264ebf1dd5deb8efb2ae4",
  },

  // ── FB7: Ads (বিজ্ঞাপন) ──────────────────────────────────
  fb7_ads: {
    apiKey:            "AIzaSyCJSY_SMUru5ja1M2WdBTNb_-rogNI-ds4",
    authDomain:        "digital-shop-tm-357f8.firebaseapp.com",
    projectId:         "digital-shop-tm-357f8",
    storageBucket:     "digital-shop-tm-357f8.firebasestorage.app",
    messagingSenderId: "341824546744",
    appId:             "1:341824546744:web:18c78d697cf2a3c61a114d",
  },

  // ── FB8: ভবিষ্যৎ ─────────────────────────────────────────
  fb8_future3: {
    apiKey:            "AIzaSyB5zF3jXNRASRkdBX7Rq9PWY5T_bR_A_M0",
    authDomain:        "digital-shop-tm-19610.firebaseapp.com",
    projectId:         "digital-shop-tm-19610",
    storageBucket:     "digital-shop-tm-19610.firebasestorage.app",
    messagingSenderId: "440482978244",
    appId:             "1:440482978244:web:6c5665ec5da7473a152c91",
  },

  // ── FB9: ভবিষ্যৎ ─────────────────────────────────────────
  fb9_future4: {
    apiKey:            "AIzaSyC3e4KC-C1Bq93vi9T-0DBY2ZH1o7cxyYg",
    authDomain:        "digital-shop-tm-d9645.firebaseapp.com",
    projectId:         "digital-shop-tm-d9645",
    storageBucket:     "digital-shop-tm-d9645.firebasestorage.app",
    messagingSenderId: "9355944351",
    appId:             "1:9355944351:web:0a3afcdc38ba67c1b85daa",
  },

  // ── FB10: Extras (গিফট কার্ড, ডিসকাউন্ট, PMX) ───────────
  fb10_extras: {
    apiKey:            "AIzaSyDvWN7GjUmgQo39KatIIePls6YWtHbggB0",
    authDomain:        "digital-shop-tm-e2c01.firebaseapp.com",
    projectId:         "digital-shop-tm-e2c01",
    storageBucket:     "digital-shop-tm-e2c01.firebasestorage.app",
    messagingSenderId: "615841063227",
    appId:             "1:615841063227:web:becbbb73f21b0f62f0971e",
  },

};

// ════════════════════════════════════════════════════════════
// ██  SECTION B — COLLECTION ROUTING  (কোন ডাটা কোন Firebase এ)
// ════════════════════════════════════════════════════════════
//
//  বাম দিক = collection name (Firestore এ যেটা আছে)
//  ডান দিক = উপরের FB_CONFIGS এর key নাম
//
//  কোনো collection এর Firebase config না থাকলে (যেমন fb2_products
//  এর apiKey এখনো দেননি), সেটা স্বয়ংক্রিয়ভাবে fb1_users এ যাবে।
// ────────────────────────────────────────────────────────────

const COLLECTION_ROUTING = {

  // ── FB1: Users ───────────────────────────────────────────
  'users':            'fb1_users',
  'sub_admins':       'fb1_users',
  'leaderboards':     'fb1_users',
  'local_boards':     'fb1_users',
  'sironam':          'fb1_users',

  // ── FB2: Products ────────────────────────────────────────
  'products':         'fb2_products',
  'product_limits':   'fb2_products',
  'night_boards':     'fb2_products',
  'pmx_products':     'fb2_products',
  'pmx_headers':      'fb2_products',
  'pmx_holders':      'fb2_products',

  // ── FB3: Orders ──────────────────────────────────────────
  'orders':           'fb3_orders',
  'returns':          'fb3_orders',
  'special_requests': 'fb3_orders',
  'pmx_orders':       'fb3_orders',
  'reports':          'fb3_orders',

  // ── FB4: Chat ────────────────────────────────────────────
  // (chat.js নিজেই Firebase ব্যবহার করে, এখানে শুধু backup)
  'chat_groups':      'fb4_chat',
  'chat_messages':    'fb4_chat',
  'chat_personal':    'fb4_chat',

  // ── FB5: Ads ─────────────────────────────────────────────
  'ads':              'fb7_ads',
  'deli_ads':         'fb7_ads',
  'notices':          'fb7_ads',
  'beli_left':        'fb7_ads',
  'beli_right':       'fb7_ads',

  // ── FB6: Extras ──────────────────────────────────────────
  'gift_cards':       'fb10_extras',
  'all_discounts':    'fb10_extras',
  'global_discounts': 'fb10_extras',

};

// ════════════════════════════════════════════════════════════
// ██  SECTION C — KEY MAP  (localStorage key → collection name)
// ════════════════════════════════════════════════════════════

const KEY_MAP = {
  'TM_DB_PRODUCTS_V2':    'products',
  'TM_DB_USERS_V2':       'users',
  'TM_DB_ORDERS_V2':      'orders',
  'TM_DB_ADS_V2':         'ads',
  'TM_DB_GIFT_CARDS_V2':  'gift_cards',
  'TM_DB_RETURNS_V2':     'returns',
  'TM_DB_NOTICES_V1':     'notices',
  'TM_LOGIN_LEADERBOARDS':'leaderboards',
  'TM_LOCAL_BOARDS':      'local_boards',
  'sironam_list':         'sironam',
  'deli_ads':             'deli_ads',
  'beli_left':            'beli_left',
  'beli_right':           'beli_right',
  'TM_SUB_ADMINS':        'sub_admins',
  'special_requests':     'special_requests',
  'TM_DB_PRODUCT_LIMITS': 'product_limits',
  'tm_reports':           'reports',
  'all_discounts':        'all_discounts',
  'global_discounts':     'global_discounts',
  'night_boards':         'night_boards',
  'pmx_headers':          'pmx_headers',
  'pmx_products':         'pmx_products',
  'pmx_orders':           'pmx_orders',
  'pmx_holders':          'pmx_holders',
};

// Single document keys (array নয়, একটাই doc)
const SINGLE_DOC = new Set([
  'tm_reports','all_discounts','global_discounts','TM_DB_PRODUCT_LIMITS'
]);

// ════════════════════════════════════════════════════════════
// ██  SECTION D — ENGINE  (এখানে কিছু বদলানোর দরকার নেই)
// ════════════════════════════════════════════════════════════

// Firebase app ও db instances
const _fbApps = {};   // { fb1_users: app, fb2_products: app, ... }
const _fbDBs  = {};   // { fb1_users: db,  fb2_products: db,  ... }
const _fbReady = {};  // কোন Firebase টি সফলভাবে চালু হয়েছে

let _pulling = false;
window._fbTimers = window._fbTimers || {};

// ── config থেকে missing fields auto-fill ─────────────────
function _fillConfig(cfg) {
  const pid = cfg.projectId;
  if (!pid) return cfg;
  return {
    apiKey:            cfg.apiKey            || '',
    authDomain:        cfg.authDomain        || `${pid}.firebaseapp.com`,
    projectId:         pid,
    storageBucket:     cfg.storageBucket     || `${pid}.firebasestorage.app`,
    messagingSenderId: cfg.messagingSenderId || '',
    appId:             cfg.appId             || '',
    ...cfg
  };
}

// ── সব Firebase initialize ───────────────────────────────
function initAllFB() {
  if (!window.firebase) {
    console.error('[FB] Firebase SDK লোড হয়নি!');
    return false;
  }

  let anyOk = false;

  for (const [name, rawCfg] of Object.entries(FB_CONFIGS)) {
    // placeholder config skip করো
    if (!rawCfg.apiKey || rawCfg.apiKey.startsWith('YOUR_')) {
      console.warn(`[FB] ⚠️ '${name}' — apiKey দেওয়া নেই, এখন skip। এই Firebase এর collection গুলো fb1_users এ যাবে।`);
      continue;
    }

    const cfg = _fillConfig(rawCfg);
    try {
      let app;
      if (name === 'fb1_users') {
        // প্রথম Firebase = default app
        app = firebase.apps.find(a => a.name === '[DEFAULT]')
              || firebase.initializeApp(cfg);
      } else {
        app = firebase.apps.find(a => a.name === name)
              || firebase.initializeApp(cfg, name);
      }
      _fbApps[name]  = app;
      _fbDBs[name]   = firebase.firestore(app);
      _fbReady[name] = true;
      console.log(`[FB] ✅ '${name}' চালু (${cfg.projectId})`);
      anyOk = true;
    } catch(e) {
      console.error(`[FB] ❌ '${name}' চালু হয়নি:`, e.message);
    }
  }

  return anyOk;
}

// ── collection এর জন্য সঠিক db দাও ──────────────────────
function getDB(collection) {
  const fbName = COLLECTION_ROUTING[collection] || 'fb1_users';

  // assigned Firebase টি ready আছে?
  if (_fbReady[fbName] && _fbDBs[fbName]) {
    return _fbDBs[fbName];
  }

  // না থাকলে fb1_users (primary) তে fallback
  if (_fbDBs['fb1_users']) {
    if (_fbReady[fbName] !== undefined) {
      // assigned ছিল কিন্তু ready না — শুধু একবার log
      console.warn(`[FB] '${collection}' → '${fbName}' ready নয়, fb1_users এ fallback`);
    }
    return _fbDBs['fb1_users'];
  }

  return null;
}

// ── কোন Firebase এ collection আছে সেটা জানা ─────────────
function getFBName(collection) {
  const assigned = COLLECTION_ROUTING[collection] || 'fb1_users';
  return (_fbReady[assigned]) ? assigned : 'fb1_users';
}

// ── setLocal — TM_CACHE + IDB তে লেখা ───────────────────
function setLocal(key, val) {
  _pulling = true;
  try {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    if (window._TM_CACHE) window._TM_CACHE[key] = str;
    if (window._TMDB && typeof window._TMDB.set === 'function') {
      window._TMDB.set(key, str).catch(() => {});
    }
    if (localStorage._fbOrigSet) {
      localStorage._fbOrigSet(key, str);
    }
  } catch(e) {}
  finally { _pulling = false; }
}

// ── Push one key → Firestore ──────────────────────────────
window.pushToCloud = async function(lsKey) {
  const col = KEY_MAP[lsKey];
  if (!col) return;

  const db = getDB(col);
  if (!db) return;

  // এই key গুলো push block — direct manage হয়
  const _blocked = [
    'TM_DB_PRODUCTS_V2','TM_DB_ORDERS_V2','TM_DB_ADS_V2',
    'TM_LOCAL_BOARDS','TM_LOGIN_LEADERBOARDS','TM_SUB_ADMINS',
    'pmx_headers','pmx_products','pmx_holders','sironam_list'
  ];
  if (_blocked.includes(lsKey)) return;

  const raw = (window._TM_CACHE && window._TM_CACHE[lsKey])
              || localStorage.getItem(lsKey);
  if (!raw) { console.warn('[FB] pushToCloud: data নেই:', lsKey); return; }

  try {
    const data = JSON.parse(raw);
    if (SINGLE_DOC.has(lsKey)) {
      const payload = Array.isArray(data) ? {_arr: data}
                    : (typeof data === 'object' ? data : {value: data});
      await db.collection(col).doc('data').set(payload);
    } else if (Array.isArray(data)) {
      const CHUNK = 400;
      for (let i = 0; i < data.length; i += CHUNK) {
        const b = db.batch();
        data.slice(i, i+CHUNK).forEach((item, j) => {
          const id = item.id       ? String(item.id)
                   : item.reqId    ? String(item.reqId)
                   : item.cardId   ? String(item.cardId)
                   : String(i+j);
          b.set(db.collection(col).doc(id), JSON.parse(JSON.stringify(item)));
        });
        await b.commit();
      }
    } else if (typeof data === 'object') {
      await db.collection(col).doc('data').set(data);
    }
    console.log(`[FB] ↑ Push: ${lsKey} → '${getFBName(col)}'`,
      Array.isArray(data) ? data.length+' items' : '');
  } catch(e) { console.warn('[FB] push err:', lsKey, e.message); }
};

// ── Pull one key ← Firestore ──────────────────────────────
async function pullOne(lsKey) {
  const col = KEY_MAP[lsKey];
  if (!col) return;
  const db = getDB(col);
  if (!db) return;

  try {
    if (SINGLE_DOC.has(lsKey)) {
      const snap = await db.collection(col).doc('data').get();
      if (snap.exists) {
        const d = snap.data();
        const val = d._arr !== undefined ? d._arr
                  : d.value !== undefined ? d.value : d;
        setLocal(lsKey, val);
      }
    } else {
      const snap = await db.collection(col).get();
      if (!snap.empty) {
        let arr = snap.docs.map(d => d.data());
        if (lsKey === 'TM_DB_USERS_V2') {
          const valid = arr.filter(u => u.id && u.name);
          if (!valid.length) { console.warn('[FB] Users: Firebase খালি, local রাখা হলো'); return; }
          arr = valid;
        }
        setLocal(lsKey, arr);
      }
    }
    console.log(`[FB] ↓ Pull: ${lsKey} ← '${getFBName(col)}'`);
  } catch(e) { console.warn('[FB] pull err:', lsKey, e.message); }
}

// ── Sync all ──────────────────────────────────────────────
async function syncAll() {
  console.log('[FB] সব Firebase sync শুরু...');
  const priority = [
    'TM_DB_PRODUCTS_V2','TM_DB_USERS_V2','TM_DB_ORDERS_V2',
    'TM_DB_ADS_V2','deli_ads','special_requests',
    'TM_DB_RETURNS_V2','tm_reports','TM_DB_PRODUCT_LIMITS','sironam_list'
  ];
  const rest = Object.keys(KEY_MAP).filter(k => !priority.includes(k));
  for (const k of priority) await pullOne(k);
  await Promise.all(rest.map(k => pullOne(k)));
  console.log('[FB] ✅ সব sync সম্পন্ন!');
  window.dispatchEvent(new CustomEvent('fb-sync-done'));
}

// ── setItem override ──────────────────────────────────────
function overrideSetItem() {
  const origSet = localStorage.setItem.bind(localStorage);
  localStorage._fbOrigSet = origSet;

  localStorage.setItem = function(key, value) {
    origSet(key, value);
    if (_pulling) return;

    if (KEY_MAP[key]) {
      clearTimeout(window._fbTimers[key]);
      window._fbTimers[key] = setTimeout(() => window.pushToCloud(key), 800);
    }

    // User address → users collection এ merge
    if (key.startsWith('digital_shop_user_address_')) {
      const uid = key.replace('digital_shop_user_address_', '');
      const db = getDB('users');
      if (uid && uid !== 'guest' && db) {
        clearTimeout(window._fbTimers['addr_'+uid]);
        window._fbTimers['addr_'+uid] = setTimeout(async () => {
          try {
            const addr = JSON.parse(value);
            await db.collection('users').doc(uid).set({savedAddress: addr}, {merge: true});
            console.log('[FB] Address saved:', uid);
          } catch(e) { console.warn('[FB] addr err:', e.message); }
        }, 800);
      }
    }
  };
  console.log('[FB] setItem override ready');
}

// ── helper: listener শুরু করা ────────────────────────────
function _listen(col, handler) {
  const db = getDB(col);
  if (!db) return;
  db.collection(col).onSnapshot(handler);
}

// ── Real-time listeners ───────────────────────────────────
function startListeners() {

  // Products
  _listen('products', snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_PRODUCTS_V2', arr);
    if (window.appState) window.appState.products = arr;
    if (typeof renderProductGrid === 'function') renderProductGrid(arr);
    _pulling = false;
  });

  // Ads
  _listen('ads', snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_ADS_V2', arr);
    if (window.appState) window.appState.ads = arr;
    if (typeof startAdBoard === 'function') startAdBoard();
    _pulling = false;
  });

  // Users (+ auto-logout, sub-admin, myDiscounts)
  _listen('users', snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data()).filter(u => u.id && u.name);

    // Auto-logout: account delete হয়েছে কিনা
    try {
      const SK = 'TM_SESSION_USER';
      const sessRaw = window._TM_CACHE && window._TM_CACHE[SK];
      if (sessRaw) {
        const cu = JSON.parse(sessRaw);
        if (cu && cu.role !== 'admin' && cu.id) {
          if (!arr.some(u => u.id === cu.id)) {
            console.log('[FB] ⚠️ Account deleted — logout:', cu.id);
            if (window._TM_CACHE) delete window._TM_CACHE[SK];
            if (localStorage._fbOrigSet) localStorage._fbOrigSet(SK, '');
            if (window.appState) window.appState.currentUser = null;
            setTimeout(() => {
              alert('⚠️ আপনার একাউন্টটি অ্যাডমিন কর্তৃক মুছে ফেলা হয়েছে।');
              if (typeof logoutUser === 'function') logoutUser();
              else { localStorage.removeItem('TM_SESSION_USER'); location.reload(); }
            }, 500);
            _pulling = false;
            return;
          }
        }
      }
    } catch(e) {}

    if (arr.length > 0) {
      setLocal('TM_DB_USERS_V2', arr);
      if (window.appState) window.appState.users = arr;

      // Saved address sync
      try {
        const sess = window._TM_CACHE && window._TM_CACHE['TM_SESSION_USER'];
        if (sess) {
          const cu = JSON.parse(sess);
          const updated = arr.find(u => u.id === cu.id);
          if (updated && updated.savedAddress) {
            const addrKey = 'digital_shop_user_address_' + cu.id;
            if (!(window._TM_CACHE && window._TM_CACHE[addrKey])) {
              const addrStr = JSON.stringify(updated.savedAddress);
              if (window._TM_CACHE) window._TM_CACHE[addrKey] = addrStr;
              if (localStorage._fbOrigSet) localStorage._fbOrigSet(addrKey, addrStr);
            }
          }
        }
      } catch(e) {}

      // Checkout address reload
      if (typeof window._loadCheckoutSavedAddr === 'function') {
        const cm = document.getElementById('checkoutModal');
        if (cm && cm.style.display !== 'none') window._loadCheckoutSavedAddr();
      }

      // Sub-admin live permission update
      try {
        const SK = 'TM_SESSION_USER';
        const sessRaw = window._TM_CACHE && window._TM_CACHE[SK];
        const sess = sessRaw ? JSON.parse(sessRaw) : null;
        if (sess && sess.role === 'sub_admin') {
          const updated = arr.find(u => u.id === sess.id);
          if (updated && JSON.stringify(updated.permissions) !== JSON.stringify(sess.permissions)) {
            const newSess = Object.assign({}, sess, {permissions: updated.permissions});
            if (window._TM_CACHE) window._TM_CACHE[SK] = JSON.stringify(newSess);
            if (localStorage._fbOrigSet) localStorage._fbOrigSet(SK, JSON.stringify(newSess));
            if (window.appState) window.appState.currentUser = newSess;
            const fn = window._applySubAdminSidebar || (typeof _applySubAdminSidebar !== 'undefined' ? _applySubAdminSidebar : null);
            if (fn) fn(updated.permissions || []);
            else setTimeout(() => { if (typeof _applySubAdminSidebar === 'function') _applySubAdminSidebar(updated.permissions||[]); }, 200);
          }
        }
      } catch(e) {}

      // myDiscounts live update
      try {
        const SK = 'TM_SESSION_USER';
        const sessRaw = window._TM_CACHE && window._TM_CACHE[SK];
        if (sessRaw) {
          const cu = JSON.parse(sessRaw);
          if (cu && cu.id) {
            const upd = arr.find(u => u.id === cu.id);
            if (upd && JSON.stringify(cu.myDiscounts||[]) !== JSON.stringify(upd.myDiscounts||[])) {
              const newSess = Object.assign({}, cu, {myDiscounts: upd.myDiscounts||[]});
              if (window._TM_CACHE) window._TM_CACHE[SK] = JSON.stringify(newSess);
              if (localStorage._fbOrigSet) localStorage._fbOrigSet(SK, JSON.stringify(newSess));
              if (window.appState) window.appState.currentUser = newSess;
            }
          }
        }
      } catch(e) {}

      if (typeof renderUserCards === 'function') {
        if (document.getElementById('userCardList')) renderUserCards();
      }
    }
    _pulling = false;
  });

  // Orders
  _listen('orders', snap => {
    _pulling = true;
    setLocal('TM_DB_ORDERS_V2', snap.docs.map(d => d.data()));
    if (window.appState) window.appState.orders = snap.docs.map(d => d.data());
    _pulling = false;
  });

  // Special requests
  _listen('special_requests', snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('special_requests', arr);
    if (window.appState) window.appState.specialRequests = arr;
    _pulling = false;
  });

  // Returns
  _listen('returns', snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_RETURNS_V2', arr);
    if (window.appState) window.appState.returns = arr;
    _pulling = false;
  });

  // Deli ads
  _listen('deli_ads', snap => {
    _pulling = true;
    const _deliArr = snap.docs.map(d => d.data());
    setLocal('deli_ads', _deliArr);
    _pulling = false;
    if (typeof window._reloadDeliAds === 'function') window._reloadDeliAds();
    const _deliBoard = document.getElementById('sironamDeliBoard');
    if (_deliBoard && typeof window._currentSironamId !== 'undefined') {
      const _sid = String(window._currentSironamId);
      const _ads = _deliArr.filter(a => String(a.sironamId) === _sid);
      _deliBoard.innerHTML = _ads.length === 0
        ? '<p style="color:#4b5563;text-align:center;padding:20px;">এখানে ডেলি বিজ্ঞাপন প্রদর্শিত হবে</p>'
        : `<img src="${_ads[0].img}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="window.open('${_ads[0].link}','_blank')">`;
    }
    if (typeof renderDeliAds === 'function' && window._openDeliPanelId) {
      const el = document.getElementById('deliAdList');
      if (el) el.innerHTML = renderDeliAds(window._openDeliPanelId);
    }
  });

  // Product limits (single doc)
  (() => {
    const db = getDB('product_limits');
    if (!db) return;
    db.collection('product_limits').doc('data').onSnapshot(snap => {
      if (!snap.exists) return;
      const d = snap.data();
      const arr = d._arr !== undefined ? d._arr : (Array.isArray(d) ? d : null);
      if (arr) {
        _pulling = true;
        setLocal('TM_DB_PRODUCT_LIMITS', arr);
        _pulling = false;
        if (window.appState) window.appState.productLoadSequence = arr;
      }
    });
  })();

  // Beli boards
  ['beli_left', 'beli_right'].forEach(key => {
    _listen(key, snap => {
      const data = snap.docs.map(d => d.data());
      _pulling = true;
      setLocal(key, data);
      _pulling = false;
      if (window.beliBoardData) {
        window.beliBoardData[key.replace('beli_', '')] = data;
      }
      if (typeof window.refreshBeliDisplay === 'function') window.refreshBeliDisplay();
    });
  });

  // Gift cards
  _listen('gift_cards', snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_GIFT_CARDS_V2', arr);
    if (window.appState) window.appState.globalDiscounts = arr;
    if (typeof renderUserCards === 'function' && document.getElementById('userCardList')) renderUserCards();
    if (typeof renderDraftCards === 'function' && document.getElementById('modal-draft-list')) renderDraftCards();
    if (typeof renderActiveAdminCards === 'function' && document.getElementById('active-discount-list')) renderActiveAdminCards();
    _pulling = false;
  });

  // Night boards
  _listen('night_boards', snap => {
    _pulling = true;
    setLocal('night_boards', snap.docs.map(d => d.data()));
    _pulling = false;
    if (typeof window.renderNightBoardLanding === 'function') window.renderNightBoardLanding();
  });

  // PMX orders (cross-db sync: pmx_orders fb → users fb)
  (() => {
    const dbPMX   = getDB('pmx_orders');
    const dbUsers = getDB('users');
    if (!dbPMX) return;
    dbPMX.collection('pmx_orders').onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== 'modified' && change.type !== 'added') return;
        const order = change.doc.data();
        if (!order || !order.loggedUserId) return;
        const userRef = dbUsers.collection('users').doc(String(order.loggedUserId));
        userRef.get().then(doc => {
          if (!doc.exists) return;
          const pmxOrders = doc.data().pmxOrders || [];
          const idx = pmxOrders.findIndex(o => String(o.id) === String(order.id));
          if (idx >= 0) {
            pmxOrders[idx] = {...pmxOrders[idx], status: order.status, comments: order.comments||[]};
            userRef.set({pmxOrders}, {merge: true});
          }
        }).catch(() => {});
      });
    });
  })();

  // Sironam
  _listen('sironam', snap => {
    _pulling = true;
    setLocal('sironam_list', snap.docs.map(d => d.data()));
    _pulling = false;
    if (typeof window._reloadSironamData === 'function') window._reloadSironamData();
    if (typeof window.displaySironamOnPortal === 'function') window.displaySironamOnPortal();
  });

  console.log('[FB] ✅ সব listener চালু');
}

// ── Start ─────────────────────────────────────────────────
if (!initAllFB()) {
  console.error('[FB] কোনো Firebase চালু করা সম্ভব হয়নি!');
} else {
  overrideSetItem();
  const ready = window.TM_READY || Promise.resolve();
  window.FB_READY = ready.then(async () => {
    await syncAll();
    startListeners();
  });
}

// ════════════════════════════════════════════════════════════
// ██  GLOBAL HELPERS
// ════════════════════════════════════════════════════════════

// User সরাসরি Firebase এ save করা
window.saveUserToFirebase = async function(userObj) {
  try {
    if (!userObj || !userObj.id) { console.warn('[FB] saveUserToFirebase: invalid user'); return; }
    const db = getDB('users');
    await db.collection('users').doc(String(userObj.id)).set(userObj);
    console.log('[FB] ✅ User saved:', userObj.id);
  } catch(e) {
    console.error('[FB] ❌ saveUserToFirebase error:', e.message);
  }
};

// Chat এর জন্য Firebase db expose করা (chat.js ব্যবহার করে)
window._getChatDB = function() {
  return _fbDBs['fb4_chat'] || _fbDBs['fb1_users'] || null;
};

// ── Debug: সব Firebase এর status দেখুন ──────────────────
// Browser console এ টাইপ করুন: _fbStatus()
window._fbStatus = function() {
  console.group('══ Multi-Firebase Status (v7.0) ══');
  for (const [name, cfg] of Object.entries(FB_CONFIGS)) {
    const isReady = !!_fbReady[name];
    const isPlaceholder = !cfg.apiKey || cfg.apiKey.startsWith('YOUR_');
    const status = isPlaceholder ? '⏳ config দেওয়া নেই' : (isReady ? '✅ চালু' : '❌ error');
    console.log(`${status}  '${name}'  →  ${cfg.projectId || '?'}`);
    if (isReady) {
      const cols = Object.entries(COLLECTION_ROUTING)
        .filter(([,fb]) => fb === name)
        .map(([c]) => c);
      console.log(`        Collections: ${cols.join(', ') || '(none)'}`);
    }
  }
  console.log('');
  console.log('📌 নতুন Firebase যোগ করতে:');
  console.log('   ১. FB_CONFIGS এ apiKey ও projectId দিন');
  console.log('   ২. COLLECTION_ROUTING এ collection assign করুন');
  console.groupEnd();
};

// ── Firebase যোগ করার guide দেখুন ───────────────────────
// Browser console এ টাইপ করুন: _fbGuide()
window._fbGuide = function() {
  console.group('══ Firebase যোগ করার গাইড ══');
  console.log(`
  ১. Firebase Console (console.firebase.google.com) খুলুন
  ২. নতুন Project বানান অথবা existing টি select করুন
  ③. Project Settings → General → "Your apps" → Web App যোগ করুন
  ④. apiKey এবং projectId কপি করুন
  ⑤. firebase-sync.js খুলুন
  ⑥. FB_CONFIGS এ যে Firebase খালি আছে সেখানে দিন:
     fb2_products: {
       apiKey:    "আপনার apiKey",
       projectId: "আপনার projectId"
     }
  ⑦. Save করুন — বাকি সব কাজ কোড নিজেই করবে!
  `);
  console.groupEnd();
};

})();
