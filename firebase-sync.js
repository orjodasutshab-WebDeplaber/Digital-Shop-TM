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
  'night_boards':          'night_boards',
  'pmx_headers':           'pmx_headers',
  'pmx_products':          'pmx_products',
  'pmx_orders':            'pmx_orders',
  'pmx_holders':           'pmx_holders',
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

  // ⛔ products key এ pushToCloud block করা হয়েছে
  // কারণ: pushToCloud পুরো array batch.set() করে — delete করলেও ফিরে আসে
  // Products এখন adminDeleteProduct/addProduct/editProduct থেকে direct .delete()/.set() দিয়ে manage হয়
  if (lsKey === 'TM_DB_PRODUCTS_V2') {
    console.log('[FB] pushToCloud: products blocked — use direct Firestore ops');
    return;
  }
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
          const id = item.id ? String(item.id) : (item.reqId ? String(item.reqId) : (item.cardId ? String(item.cardId) : String(i+j)));
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

    // ── Auto-logout: current user এর account delete হয়েছে কিনা চেক ──
    try {
      const SK = 'TM_SESSION_USER';
      const sessRaw = window._TM_CACHE && window._TM_CACHE[SK];
      if (sessRaw) {
        const cu = JSON.parse(sessRaw);
        // Admin নিজে delete হলে logout করব না
        if (cu && cu.role !== 'admin' && cu.id) {
          const stillExists = arr.some(u => u.id === cu.id);
          if (!stillExists) {
            console.log('[FB] ⚠️ Account deleted by admin — logging out:', cu.id);
            // Session clear করো
            if (window._TM_CACHE) delete window._TM_CACHE[SK];
            if (localStorage._fbOrigSet) localStorage._fbOrigSet(SK, '');
            if (window.appState) window.appState.currentUser = null;
            // Alert দিয়ে logout
            setTimeout(() => {
              alert('⚠️ আপনার একাউন্টটি অ্যাডমিন কর্তৃক মুছে ফেলা হয়েছে।');
              if (typeof logoutUser === 'function') {
                logoutUser();
              } else {
                localStorage.removeItem('TM_SESSION_USER');
                location.reload();
              }
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

      // Current user এর saved address update করি
      try {
        const sess = window._TM_CACHE && window._TM_CACHE['TM_SESSION_USER'];
        if (sess) {
          const cu = JSON.parse(sess);
          const updated = arr.find(u => u.id === cu.id);
          if (updated && updated.savedAddress) {
            const addrKey = 'digital_shop_user_address_' + cu.id;
            const existing = window._TM_CACHE && window._TM_CACHE[addrKey];
            if (!existing) {
              // localStorage এ না থাকলে Firebase থেকে cache করি
              const addrStr = JSON.stringify(updated.savedAddress);
              if (window._TM_CACHE) window._TM_CACHE[addrKey] = addrStr;
              if (localStorage._fbOrigSet) localStorage._fbOrigSet(addrKey, addrStr);
            }
          }
        }
      } catch(e) {}

      // Checkout open থাকলে address refresh করি
      if (typeof window._loadCheckoutSavedAddr === 'function') {
        const checkoutModal = document.getElementById('checkoutModal');
        if (checkoutModal && checkoutModal.style.display !== 'none') {
          window._loadCheckoutSavedAddr();
        }
      }

      // Sub-admin এর session live update — permission change হলে সাথে সাথে sidebar update
      try {
        const SK = 'TM_SESSION_USER';
        const sessRaw = localStorage._fbOrigSet ? window._TM_CACHE && window._TM_CACHE[SK] : null;
        const sess = sessRaw ? JSON.parse(sessRaw) : null;
        if (sess && sess.role === 'sub_admin') {
          const updated = arr.find(u => u.id === sess.id);
          if (updated && JSON.stringify(updated.permissions) !== JSON.stringify(sess.permissions)) {
            // permission পরিবর্তন হয়েছে — session update করি
            const newSess = Object.assign({}, sess, {permissions: updated.permissions});
            if (window._TM_CACHE) window._TM_CACHE[SK] = JSON.stringify(newSess);
            if (localStorage._fbOrigSet) localStorage._fbOrigSet(SK, JSON.stringify(newSess));
            if (window.appState) window.appState.currentUser = newSess;
            // Sidebar live update
            if (typeof window._applySubAdminSidebar === 'function') {
              window._applySubAdminSidebar(updated.permissions || []);
            } else {
              setTimeout(() => {
                if (typeof _applySubAdminSidebar === 'function')
                  _applySubAdminSidebar(updated.permissions || []);
              }, 200);
            }
            console.log('[FB] Sub-admin permissions updated live:', updated.permissions);
          }
        }
      } catch(e) {}
      // Current user এর myDiscounts live update + card refresh
      try {
        const SK = 'TM_SESSION_USER';
        const sessRaw = window._TM_CACHE && window._TM_CACHE[SK];
        if (sessRaw) {
          const cu = JSON.parse(sessRaw);
          if (cu && cu.id) {
            const updatedUser = arr.find(u => u.id === cu.id);
            if (updatedUser) {
              const oldDiscounts = JSON.stringify(cu.myDiscounts || []);
              const newDiscounts = JSON.stringify(updatedUser.myDiscounts || []);
              if (oldDiscounts !== newDiscounts) {
                // myDiscounts বদলেছে — session update করি
                const newSess = Object.assign({}, cu, { myDiscounts: updatedUser.myDiscounts || [] });
                if (window._TM_CACHE) window._TM_CACHE[SK] = JSON.stringify(newSess);
                if (localStorage._fbOrigSet) localStorage._fbOrigSet(SK, JSON.stringify(newSess));
                if (window.appState) window.appState.currentUser = newSess;
                console.log('[FB] ↻ myDiscounts updated for:', cu.id);
              }
            }
          }
        }
        // User card panel refresh
        if (typeof renderUserCards === 'function') {
          const userCardList = document.getElementById('userCardList');
          if (userCardList) renderUserCards();
        }
      } catch(e) {}
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

  // Gift Cards real-time listener
  db.collection('gift_cards').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('TM_DB_GIFT_CARDS_V2', arr);
    if (window.appState) window.appState.globalDiscounts = arr;

    // User card panel refresh (user side)
    if (typeof renderUserCards === 'function') {
      const userCardList = document.getElementById('userCardList');
      if (userCardList) renderUserCards();
    }

    // Admin panel refresh (draft + active)
    if (typeof renderDraftCards === 'function') {
      const draftList = document.getElementById('modal-draft-list');
      if (draftList) renderDraftCards();
    }
    if (typeof renderActiveAdminCards === 'function') {
      const activeList = document.getElementById('active-discount-list');
      if (activeList) renderActiveAdminCards();
    }

    // Users collection এ myDiscounts update হলে user card ও refresh
    _pulling = false;
    console.log('[FB] ↻ Gift cards updated:', arr.length);
  });

  // Night Boards real-time listener
  db.collection('night_boards').onSnapshot(snap => {
    _pulling = true;
    const arr = snap.docs.map(d => d.data());
    setLocal('night_boards', arr);
    _pulling = false;
    console.log('[FB] ↻ Night boards updated:', arr.length);
    if (typeof window.renderNightBoardLanding === 'function') {
      window.renderNightBoardLanding();
    }
  });

  // ── pmx_orders listener — admin থেকে status/comment update হলে user document sync ──
  db.collection('pmx_orders').onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'modified' || change.type === 'added') {
        const order = change.doc.data();
        if (!order || !order.loggedUserId) return;
        // User document এ pmxOrders array update করা
        const userRef = db.collection('users').doc(String(order.loggedUserId));
        userRef.get().then(doc => {
          if (!doc.exists) return;
          const pmxOrders = doc.data().pmxOrders || [];
          const idx = pmxOrders.findIndex(o => String(o.id) === String(order.id));
          if (idx >= 0) {
            // শুধু status ও comments update করা (order data মুছব না)
            pmxOrders[idx] = { ...pmxOrders[idx], status: order.status, comments: order.comments || [] };
            userRef.set({ pmxOrders }, { merge: true });
          }
        }).catch(() => {});
      }
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
