/* ================================================================
   DIGITAL SHOP TM — IndexedDB Migration Shim  v2.0
   ----------------------------------------------------------------
   ✅ v2.0 পরিবর্তন:
   - window.onload এবং window.addEventListener('load', ...)
     intercept করা হয়েছে — IndexedDB hydration শেষ হওয়ার
     আগে app.js এর কোনো কোড চালু হবে না।
   - app.js বা অন্য কোনো ফাইল বদলানোর দরকার নেই।
   ================================================================ */

(function () {
    'use strict';

    /* ── 1. IndexedDB low-level helper ─────────────────────────── */
    var IDB = (function () {
        var DB_NAME    = 'DigitalShopTM_IDB';
        var DB_VERSION = 1;
        var STORE_NAME = 'kv_store';
        var _db = null;

        function open() {
            return new Promise(function (resolve, reject) {
                if (_db) { resolve(_db); return; }
                var req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function (e) {
                    e.target.result.createObjectStore(STORE_NAME);
                };
                req.onsuccess = function (e) {
                    _db = e.target.result;
                    resolve(_db);
                };
                req.onerror = function (e) {
                    console.error('[IDB] open error', e.target.error);
                    reject(e.target.error);
                };
            });
        }

        function tx(mode) {
            return open().then(function (db) {
                return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
            });
        }

        return {
            set: function (key, value) {
                return tx('readwrite').then(function (store) {
                    return new Promise(function (res, rej) {
                        var r = store.put(value, key);
                        r.onsuccess = function () { res(true); };
                        r.onerror   = function (e) { rej(e.target.error); };
                    });
                });
            },
            get: function (key) {
                return tx('readonly').then(function (store) {
                    return new Promise(function (res, rej) {
                        var r = store.get(key);
                        r.onsuccess = function (e) { res(e.target.result !== undefined ? e.target.result : null); };
                        r.onerror   = function (e) { rej(e.target.error); };
                    });
                });
            },
            del: function (key) {
                return tx('readwrite').then(function (store) {
                    return new Promise(function (res, rej) {
                        var r = store.delete(key);
                        r.onsuccess = function () { res(true); };
                        r.onerror   = function (e) { rej(e.target.error); };
                    });
                });
            },
            clear: function () {
                return tx('readwrite').then(function (store) {
                    return new Promise(function (res, rej) {
                        var r = store.clear();
                        r.onsuccess = function () { res(true); };
                        r.onerror   = function (e) { rej(e.target.error); };
                    });
                });
            },
            getAllEntries: function () {
                return open().then(function (db) {
                    return new Promise(function (res, rej) {
                        var entries = {};
                        var storeTx = db.transaction(STORE_NAME, 'readonly');
                        var store   = storeTx.objectStore(STORE_NAME);
                        var curReq  = store.openCursor();
                        curReq.onsuccess = function (e) {
                            var cursor = e.target.result;
                            if (cursor) {
                                entries[cursor.key] = cursor.value;
                                cursor.continue();
                            }
                        };
                        storeTx.oncomplete = function () { res(entries); };
                        storeTx.onerror    = function (e) { rej(e.target.error); };
                    });
                });
            }
        };
    })();

    /* ── 2. In-memory cache ─────────────────────────────────────── */
    var TM_CACHE = Object.create(null);

    /* ── 3. localStorage replacement ───────────────────────────── */
    var tmStorage = {
        setItem: function (key, value) {
            var str = String(value);
            TM_CACHE[key] = str;
            IDB.set(key, str).catch(function (err) {
                console.warn('[IDB] setItem failed for key:', key, err);
            });
        },
        getItem: function (key) {
            var val = TM_CACHE[key];
            return (val !== undefined) ? val : null;
        },
        removeItem: function (key) {
            delete TM_CACHE[key];
            IDB.del(key).catch(function (err) {
                console.warn('[IDB] removeItem failed for key:', key, err);
            });
        },
        clear: function () {
            var keys = Object.keys(TM_CACHE);
            for (var i = 0; i < keys.length; i++) { delete TM_CACHE[keys[i]]; }
            IDB.clear().catch(function (err) {
                console.warn('[IDB] clear failed', err);
            });
        },
        key: function (n) { return Object.keys(TM_CACHE)[n] || null; },
        get length() { return Object.keys(TM_CACHE).length; }
    };

    /* ── 4. Override window.localStorage ───────────────────────── */
    try {
        Object.defineProperty(window, 'localStorage', {
            get: function () { return tmStorage; },
            configurable: true
        });
    } catch (e) {
        window.localStorage = tmStorage;
    }

    /* ══════════════════════════════════════════════════════════════
       ── 5. LOAD EVENT INTERCEPT ──────────────────────────────────
       সমস্যা: window.onload এবং addEventListener('load') হলো
       IndexedDB hydration শেষের আগেই। ফলে app.js এর loadDatabase()
       খালি cache থেকে পড়ে — ডাটা পায় না।

       সমাধান: browser এর load event কে আমরা আটকে রাখি।
       Hydration শেষ হলে তারপর app.js এর সব callbacks চালাই।
    ══════════════════════════════════════════════════════════════ */

    var _hydrationDone = false;
    var _loadFired     = false;
    var _pendingOnload = null;
    var _pendingLoads  = [];

    /* window.onload intercept */
    Object.defineProperty(window, 'onload', {
        get: function () { return _pendingOnload; },
        set: function (fn) { _pendingOnload = fn; },
        configurable: true
    });

    /* addEventListener('load') intercept */
    var _origAEL = window.addEventListener.bind(window);
    window.addEventListener = function (type, listener, options) {
        if (type === 'load') {
            if (_hydrationDone) {
                // hydration আগেই শেষ — সরাসরি register করো
                _origAEL(type, listener, options);
            } else {
                // hydration বাকি — queue তে রাখো
                _pendingLoads.push({ listener: listener, options: options });
            }
            return;
        }
        // অন্য সব event এ কোনো পরিবর্তন নেই
        _origAEL(type, listener, options);
    };

    /* সব pending load callbacks চালানোর function */
    function _flushLoads() {
        if (typeof _pendingOnload === 'function') {
            try { _pendingOnload(); }
            catch (e) { console.error('[IDB Shim] window.onload error:', e); }
        }
        for (var i = 0; i < _pendingLoads.length; i++) {
            try { _pendingLoads[i].listener.call(window, new Event('load')); }
            catch (e) { console.error('[IDB Shim] load listener error:', e); }
        }
        _pendingLoads = [];
    }

    /* browser load event ধরা (original দিয়ে) */
    _origAEL('load', function () {
        _loadFired = true;
        if (_hydrationDone) {
            _flushLoads();
        }
        // নইলে hydration শেষে চালাবে
    });

    /* ── 6. IndexedDB Hydration ─────────────────────────────────── */
    window.TM_READY = IDB.getAllEntries().then(function (entries) {
        var keys = Object.keys(entries);
        for (var i = 0; i < keys.length; i++) {
            TM_CACHE[keys[i]] = entries[keys[i]];
        }
        console.info('[DigitalShopTM] ✅ IndexedDB cache hydrated. Keys loaded:', keys.length);

        _hydrationDone = true;

        if (_loadFired) {
            _flushLoads();  // load আগেই এসেছে, এখন flush করো
        }
        // নইলে _origAEL('load') আসলে flush হবে

    }).catch(function (err) {
        console.error('[DigitalShopTM] ⚠️ Hydration failed, continuing anyway.', err);
        _hydrationDone = true;
        if (_loadFired) { _flushLoads(); }
    });

    /* ── 7. Debugging helpers ───────────────────────────────────── */
    window._TMDB     = IDB;
    window._TM_CACHE = TM_CACHE;

})();
