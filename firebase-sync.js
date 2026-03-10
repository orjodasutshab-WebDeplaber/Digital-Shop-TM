// ============================================================
// firebase-sync.js — Digital Shop TM
// Firebase Firestore sync layer
// সব device এ data sync করে
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────
// Firebase Config
// ──────────────────────────────────────────
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

// ──────────────────────────────────────────
// Key mapping: localStorage key → Firestore collection
// ──────────────────────────────────────────
const KEY_MAP = {
  'TM_DB_PRODUCTS_V2'      : 'products',
  'TM_DB_USERS_V2'         : 'users',
  'TM_DB_ORDERS_V2'        : 'orders',
  'TM_DB_ADS_V2'           : 'ads',
  'TM_DB_GIFT_CARDS_V2'    : 'gift_cards',
  'TM_DB_RETURNS_V2'       : 'returns',
  'TM_DB_NOTICES_V1'       : 'notices',
  'TM_LOGIN_LEADERBOARDS'  : 'leaderboards',
  'TM_LOCAL_BOARDS'        : 'local_boards',
  'sironam_list'           : 'sironam',
  'deli_ads'               : 'deli_ads',
  'TM_SUB_ADMINS'          : 'sub_admins',
  'special_requests'       : 'special_requests',
  'TM_DB_PRODUCT_LIMITS'   : 'product_limits',
};

// Single-doc keys (not arrays — stored as single doc)
const SINGLE_DOC_KEYS = [
  'TM_DB_PRODUCT_LIMITS',
];

// ──────────────────────────────────────────
// Helper: array → Firestore collection
// ──────────────────────────────────────────
async function pushArrayToFirestore(colName, arr) {
  try {
    const batch = writeBatch(db);
    // Delete existing docs first
    const snap = await getDocs(collection(db, colName));
    snap.forEach(d => batch.delete(d.ref));
    // Add new docs
    arr.forEach((item, i) => {
      const id = item.id ? String(item.id) : String(i);
      batch.set(doc(db, colName, id), item);
    });
    await batch.commit();
  } catch(e) {
    console.warn('[FB] pushArray error:', colName, e);
  }
}

// Helper: Firestore collection → array
async function pullArrayFromFirestore(colName) {
  try {
    const snap = await getDocs(collection(db, colName));
    return snap.docs.map(d => d.data());
  } catch(e) {
    console.warn('[FB] pullArray error:', colName, e);
    return null;
  }
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
    if (SINGLE_DOC_KEYS.includes(lsKey)) {
      await setDoc(doc(db, colName, 'data'), { value: data });
    } else if (Array.isArray(data)) {
      await pushArrayToFirestore(colName, data);
    } else {
      await setDoc(doc(db, colName, 'data'), data);
    }
    console.log('[FB] Pushed:', lsKey, '→', colName);
  } catch(e) {
    console.warn('[FB] push error:', lsKey, e);
  }
}

// ──────────────────────────────────────────
// PULL: Firestore → localStorage
// ──────────────────────────────────────────
export async function pullFromCloud(lsKey) {
  const colName = KEY_MAP[lsKey];
  if (!colName) return;

  try {
    if (SINGLE_DOC_KEYS.includes(lsKey)) {
      const snap = await getDoc(doc(db, colName, 'data'));
      if (snap.exists()) {
        localStorage.setItem(lsKey, JSON.stringify(snap.data().value));
      }
    } else {
      const arr = await pullArrayFromFirestore(colName);
      if (arr && arr.length > 0) {
        localStorage.setItem(lsKey, JSON.stringify(arr));
      }
    }
    console.log('[FB] Pulled:', lsKey, '←', colName);
  } catch(e) {
    console.warn('[FB] pull error:', lsKey, e);
  }
}

// ──────────────────────────────────────────
// SYNC ALL: Pull all keys from Firestore on load
// ──────────────────────────────────────────
export async function syncAllFromCloud() {
  console.log('[FB] Syncing all from cloud...');
  const keys = Object.keys(KEY_MAP);
  await Promise.all(keys.map(k => pullFromCloud(k)));
  console.log('[FB] Sync complete!');
}

// ──────────────────────────────────────────
// Override localStorage.setItem to auto-push
// ──────────────────────────────────────────
const _origSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
  _origSetItem(key, value);
  if (KEY_MAP[key]) {
    // Debounce push (avoid too many writes)
    clearTimeout(window._fbPushTimers?.[key]);
    if (!window._fbPushTimers) window._fbPushTimers = {};
    window._fbPushTimers[key] = setTimeout(() => {
      pushToCloud(key);
    }, 800);
  }
};

// ──────────────────────────────────────────
// Real-time listener for products (live updates)
// ──────────────────────────────────────────
export function listenProducts(callback) {
  return onSnapshot(collection(db, 'products'), snap => {
    const products = snap.docs.map(d => d.data());
    localStorage.setItem('TM_DB_PRODUCTS_V2', JSON.stringify(products));
    if (callback) callback(products);
  });
}

export function listenOrders(callback) {
  return onSnapshot(collection(db, 'orders'), snap => {
    const orders = snap.docs.map(d => d.data());
    _origSetItem('TM_DB_ORDERS_V2', JSON.stringify(orders));
    if (callback) callback(orders);
  });
}

// ──────────────────────────────────────────
// Init: pull all data on page load
// ──────────────────────────────────────────
window.FB_READY = syncAllFromCloud();

export { db };
