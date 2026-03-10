// ============================================================
// firebase-sync.js — Digital Shop TM v2.2
// Firebase Firestore sync layer — সব device এ data sync করে
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
  authDomain: "digitalshoptm-2008.firebaseapp.com",
  projectId: "digitalshoptm-2008",
  storageBucket: "digitalshoptm-2008.firebasestorage.app",
  messagingSenderId: "627378095856",
  appId: "1:627378095856:web:b705f4f75e0512646ca435",
  measurementId: "G-1LJR9JQL0V"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Firebase থেকে pull হচ্ছে কিনা — এই flag থাকলে push হবে না
let _pulling = false;

// Key mapping
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

// এগুলো plain value/object, array নয়
const SINGLE_DOC_KEYS = new Set([
  'tm_reports',
  'all_discounts',
  'global_discounts',
]);

// undefined দূর করে clean object বানাই
function sanitize(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch(e) { return obj; }
}

// ──────────────────────────────────────────
// Array push/pull helpers
// ──────────────────────────────────────────
async function pushArray(colName, arr) {
  const CHUNK = 400;
  try {
    // পুরনো docs delete
    const snap = await getDocs(collection(db, colName));
    if (snap.docs.length > 0) {
      const b = writeBatch(db);
      snap.docs.forEach(d => b.delete(d.ref));
      await b.commit();
    }
    // নতুন docs write
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

// idb-shim এর cache ও update করে localStorage এ set করে
function setLocal(key, value) {
  _pulling = true;
  try { localStorage.setItem(key, JSON.stringify(value)); }
  finally { _pulling = false; }
}

// ──────────────────────────────────────────
// PUSH: localStorage → Firestore
// ──────────────────────────────────────────
export async function pushToCloud(lsKey) {
  const colName = KEY_MAP[lsKey];
  if (!colName) return;
  const raw = localStorage.getItem(lsKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!SINGLE_DOC_KEYS.has(lsKey) && Array.isArray(data)) {
      await pushArray(colName, data);
    } else {
      const payload = Array.isArray(data)
        ? { _arr: sanitize(data) }
        : (data && typeof data === 'object' ? sanitize(data) : { value: data });
      await setDoc(doc(db, colName, 'data'), payload);
    }
    console.log('[FB] ↑ Pushed:', lsKey);
  } catch(e) { console.warn('[FB] push err:', lsKey, e.message); }
}

// ──────────────────────────────────────────
// PULL: Firestore → localStorage (+idb cache)
// ──────────────────────────────────────────
export async function pullFromCloud(lsKey) {
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
// SYNC ALL on page load
// ──────────────────────────────────────────
export async function syncAllFromCloud() {
  console.log('[FB] Syncing all from cloud...');
  const priority = [
    'TM_DB_PRODUCTS_V2','TM_DB_USERS_V2','TM_DB_ORDERS_V2',
    'special_requests','TM_DB_RETURNS_V2','tm_reports','TM_DB_PRODUCT_LIMITS'
  ];
  const rest = Object.keys(KEY_MAP).filter(k => !priority.includes(k));
  await Promise.all(priority.map(k => pullFromCloud(k)));
  await Promise.all(rest.map(k => pullFromCloud(k)));
  console.log('[FB] Sync complete!');
  window.dispatchEvent(new CustomEvent('fb-sync-done'));
}

// ──────────────────────────────────────────
// localStorage.setItem override — auto push
// ──────────────────────────────────────────
localStorage.setItem = (function(origSet) {
  return function(key, value) {
    origSet(key, value); // idb-shim এর setItem — cache ও update হবে
    if (!_pulling && KEY_MAP[key]) {
      if (!window._fbTimers) window._fbTimers = {};
      clearTimeout(window._fbTimers[key]);
      window._fbTimers[key] = setTimeout(() => pushToCloud(key), 500);
    }
  };
})(localStorage.setItem.bind(localStorage));

// ──────────────────────────────────────────
// Real-time listeners — অন্য device এ instant update
// ──────────────────────────────────────────
export function listenOrders(cb) {
  return onSnapshot(collection(db, 'orders'), snap => {
    const orders = snap.docs.map(d => d.data());
    setLocal('TM_DB_ORDERS_V2', orders);
    if (window.appState) window.appState.orders = orders;
    if (cb) cb(orders);
  });
}

export function listenRequests(cb) {
  return onSnapshot(collection(db, 'special_requests'), snap => {
    const reqs = snap.docs.map(d => d.data());
    setLocal('special_requests', reqs);
    if (window.appState) window.appState.specialRequests = reqs;
    if (cb) cb(reqs);
  });
}

export function listenReturns(cb) {
  return onSnapshot(collection(db, 'returns'), snap => {
    const returns = snap.docs.map(d => d.data());
    setLocal('TM_DB_RETURNS_V2', returns);
    if (window.appState) window.appState.returns = returns;
    if (cb) cb(returns);
  });
}

export function listenProducts(cb) {
  return onSnapshot(collection(db, 'products'), snap => {
    const products = snap.docs.map(d => d.data());
    setLocal('TM_DB_PRODUCTS_V2', products);
    if (window.appState) window.appState.products = products;
    if (cb) cb(products);
  });
}

// ──────────────────────────────────────────
// Init
// ──────────────────────────────────────────
window.FB_READY = syncAllFromCloud().then(() => {
  listenOrders();
  listenRequests();
  listenReturns();
});

export { db };
