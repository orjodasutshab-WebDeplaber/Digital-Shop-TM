// ============================================================
// firebase-sync.js v5.0 — Digital Shop TM
// Simple & Reliable — compat SDK
// ============================================================
(function () {
'use strict';

// ── Config ──────────────────────────────────────────────────
const FB_CONFIG = {
  apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
  authDomain: "digitalshoptm-2008.firebaseapp.com",
  projectId: "digitalshoptm-2008",
  storageBucket: "digitalshoptm-2008.firebasestorage.app",
  messagingSenderId: "627378095856",
  appId: "1:627378095856:web:b705f4f75e0512646ca435"
};

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
};

// Single doc keys (not array)
const SINGLE_DOC = new Set(['tm_reports','all_discounts','global_discounts','TM_DB_PRODUCT_LIMITS']);

// ── State ────────────────────────────────────────────────────
let db = null;
let _pulling = false;
window._fbTimers = window._fbTimers || {};

// ── Init Firebase ────────────────────────────────────────────
function initFB() {
  try {
    if (!window.firebase) { console.error('[FB] firebase SDK not loaded!'); return false; }
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    db = firebase.firestore();
    console.log('[FB] Firebase ready');
    return true;
  } catch(e) { console.error('[FB] init error:', e.message); return false; }
}

// ── setLocal: TM_CACHE তে সরাসরি লিখি (idb-shim bypass) ─────
function setLocal(key, val) {
  _pulling = true;
  try {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    // ১. idb-shim cache সরাসরি update
    if (window._TM_CACHE) window._TM_CACHE[key] = str;
    // ২. IDB persist
    if (window._TMDB && typeof window._TMDB.set === 'function') {
      window._TMDB.set(key, str).catch(()=>{});
    }
    // ৩. actual localStorage এও save — getItem() সবসময় কাজ করবে
    if (localStorage._fbOrigSet) {
      localStorage._fbOrigSet(key, str);
    }
  } catch(e) {}
  finally { _pulling = false; }
}

// ── Push one key to Firestore ────────────────────────────────
window.pushToCloud = async function(lsKey) {
  if (!db) return;
  const col = KEY_MAP[lsKey];
  if (!col) return;
  // _TM_CACHE কে priority দিই — idb-shim এখানে data রাখে
  const raw = (window._TM_CACHE && window._TM_CACHE[lsKey]) || localStorage.getItem(lsKey);
  if (!raw) { console.warn('[FB] pushToCloud: no data for', lsKey); return; }
  try {
    const data = JSON.parse(raw);
    if (SINGLE_DOC.has(lsKey)) {
      const payload = Array.isArray(data) ? {_arr: data} : (typeof data==='object' ? data : {value: data});
      await db.collection(col).doc('data').set(payload);
    } else if (Array.isArray(data)) {
      const CHUNK = 400;
      for (let i = 0; i < data.length; i += CHUNK) {
        const b = db.batch();
        data.slice(i, i+CHUNK).forEach((item, j) => {
          const id = item.id ? String(item.id) : String(i+j);
          b.set(db.collection(col).doc(id), JSON.parse(JSON.stringify(item)));
        });
        await b.commit();
      }
    } else if (typeof data === 'object') {
      // object হলে single doc হিসেবে save করি
      await db.collection(col).doc('data').set(data);
    }
    console.log('[FB] ↑ Pushed:', lsKey, Array.isArray(data) ? data.length+' items' : '');
  } catch(e) { console.warn('[FB] push err:', lsKey, e.message); }
};

// ── Pull one key from Firestore ──────────────────────────────
async function pullOne(lsKey) {
  if (!db) return;
  const col = KEY_MAP[lsKey];
  if (!col) return;
  try {
    if (SINGLE_DOC.has(lsKey)) {
      const snap = await db.collection(col).doc('data').get();
      if (snap.exists) {
        const d = snap.data();
        const val = d._arr !== undefined ? d._arr : (d.value !== undefined ? d.value : d);
        setLocal(lsKey, val);
      }
    } else {
      const snap = await db.collection(col).get();
      if (!snap.empty) {
        let arr = snap.docs.map(d => d.data());
        // Users: valid only
        if (lsKey === 'TM_DB_USERS_V2') {
          const valid = arr.filter(u => u.id && u.name);
          if (valid.length === 0) {
            console.warn('[FB] Users: Firebase empty, keeping local');
            return; // local রাখি
          }
          arr = valid;
        }
        setLocal(lsKey, arr);
      }
    }
    console.log('[FB] ↓ Pulled:', lsKey);
  } catch(e) { console.warn('[FB] pull err:', lsKey, e.message); }
}

// ── Sync all ─────────────────────────────────────────────────
async function syncAll() {
  console.log('[FB] Syncing...');
  const priority = [
    'TM_DB_PRODUCTS_V2','TM_DB_USERS_V2','TM_DB_ORDERS_V2',
    'TM_DB_ADS_V2','deli_ads','special_requests',
    'TM_DB_RETURNS_V2','tm_reports','TM_DB_PRODUCT_LIMITS','sironam_list'
  ];
  const rest = Object.keys(KEY_MAP).filter(k => !priority.includes(k));
  for (const k of priority) await pullOne(k);
  await Promise.all(rest.map(k => pullOne(k)));
  console.log('[FB] Sync complete!');
  window.dispatchEvent(new CustomEvent('fb-sync-done'));
}

// ── setItem override ─────────────────────────────────────────
function overrideSetItem() {
  // idb-shim এর tmStorage.setItem save করি
  const origSet = localStorage.setItem.bind(localStorage);
  localStorage._fbOrigSet = origSet;

  localStorage.setItem = function(key, value) {
    // idb-shim এ save (normal)
    origSet(key, value);

    if (_pulling) return;

    // Known Firebase key → debounce push
    if (KEY_MAP[key]) {
      clearTimeout(window._fbTimers[key]);
      window._fbTimers[key] = setTimeout(() => window.pushToCloud(key), 800);
    }

    // Address key → users collection এ merge
    if (key.startsWith('digital_shop_user_address_')) {
      const uid = key.replace('digital_shop_user_address_', '');
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

// ── Real-time listeners ──────────────────────────────────────
function startListeners() {
  if (!db) return;

  db.collection('products').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_PRODUCTS_V2', arr);
    if (window.appState) window.appState.products = arr;
    if (typeof renderProductGrid === 'function') renderProductGrid(arr);
    _pulling = false;
  });

  db.collection('ads').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_ADS_V2', arr);
    if (window.appState) window.appState.ads = arr;
    if (typeof startAdBoard === 'function') startAdBoard();
    _pulling = false;
  });

  db.collection('users').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data()).filter(u => u.id && u.name);
    if (arr.length > 0) {
      setLocal('TM_DB_USERS_V2', arr);
      if (window.appState) window.appState.users = arr;
    }
    _pulling = false;
  });

  db.collection('orders').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_ORDERS_V2', arr);
    if (window.appState) window.appState.orders = arr;
    _pulling = false;
  });

  db.collection('special_requests').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('special_requests', arr);
    if (window.appState) window.appState.specialRequests = arr;
    _pulling = false;
  });

  db.collection('returns').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_RETURNS_V2', arr);
    if (window.appState) window.appState.returns = arr;
    _pulling = false;
  });

  db.collection('deli_ads').onSnapshot(snap => {
    _pulling = true;
    setLocal('deli_ads', snap.docs.map(d => d.data()));
    _pulling = false;
  });

  // পণ্য লোড লিমিট listener
  db.collection('product_limits').doc('data').onSnapshot(snap => {
    if (snap.exists) {
      const d = snap.data();
      const arr = d._arr !== undefined ? d._arr : (Array.isArray(d) ? d : null);
      if (arr) {
        _pulling = true;
        setLocal('TM_DB_PRODUCT_LIMITS', arr);
        _pulling = false;
        if (window.appState) window.appState.productLoadSequence = arr;
        console.log('[FB] ↻ Product limits updated:', arr);
      }
    }
  });

  // বেলি বোর্ড listeners
  ['beli_left', 'beli_right'].forEach(key => {
    db.collection(key).onSnapshot(snap => {
      const data = snap.docs.map(d => d.data());
      _pulling = true;
      setLocal(key, data);
      _pulling = false;
      // app এ reload করি
      if (window.beliBoardData) {
        const side = key.replace('beli_', '');
        window.beliBoardData[side] = data;
      }
      if (typeof window.refreshBeliDisplay === 'function') window.refreshBeliDisplay();
    });
  });

  console.log('[FB] Listeners started');
}

// ── Start ────────────────────────────────────────────────────
if (!initFB()) {
  console.error('[FB] Failed to init');
} else {
  overrideSetItem();
  const ready = window.TM_READY || Promise.resolve();
  window.FB_READY = ready.then(async () => {
    await syncAll();
    startListeners();
  });
}

// ── Global: যেকোনো জায়গা থেকে একজন user সরাসরি Firestore এ save করা যাবে ──
window.saveUserToFirebase = async function(userObj) {
  try {
    if (!userObj || !userObj.id) { console.warn('[FB] saveUserToFirebase: invalid user'); return; }
    await db.collection('users').doc(String(userObj.id)).set(userObj);
    console.log('[FB] ✅ User saved to Firebase:', userObj.id);
  } catch(e) {
    console.error('[FB] ❌ saveUserToFirebase error:', e.message);
  }
};

})();
