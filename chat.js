/* ================================================================
   DIGITAL SHOP TM — Chat System  v4.0
   ----------------------------------------------------------------
   ✅ নতুন v4.0 পরিবর্তন:
   - 3D নীল-বেগুনি (Blue-Purple) ডিজাইন
   - সব পুরানো ফিচার সংরক্ষিত
   - সাবজনীন গ্রুপে সব ইউজার অটো-যোগ
   - Firebase FB4 (chat) এ সব ডাটা সেভ
   - পরিষ্কার কোড কাঠামো
   ================================================================ */

(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════════
       CONSTANTS
    ══════════════════════════════════════════════════════════ */
    const PUBLIC_GROUP_ID   = 'digital_shop_tm_main';
    const PUBLIC_GROUP_NAME = 'Digital Shop TM সাবজনীন';
    const MAX_MSG    = 100;
    const TYPING_TTL = 4000;

    /* ══════════════════════════════════════════════════════════
       STATE
    ══════════════════════════════════════════════════════════ */
    let _db           = null;
    let _currentUser  = null;
    let _isMobile     = false;
    let _activeChat   = null;
    let _unsubMsg     = null;
    let _unsubTyping  = null;
    let _typingTimer  = null;
    let _isAtBottom   = true;
    let _replyTarget  = null;
    let _mediaPreview = null;
    let _chatList     = [];
    let _unreadMap    = {};
    let _lastMsgTsMap = {};
    let _chatListReady = false;
    let _activeTab    = 'all';
    let _searchQuery  = '';
    let _lastMsgDate  = null;

    /* ══════════════════════════════════════════════════════════
       INIT — window load এর পরে চালু হয়
    ══════════════════════════════════════════════════════════ */
    window.addEventListener('load', function () {
        (window.TM_READY || Promise.resolve()).then(function () {
            setTimeout(_init, 600);
        });
    });

    function _init() {
        _currentUser = _getSessionUser();
        _isMobile = /Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    window.innerWidth <= 768;

        if (_isMobile) document.documentElement.classList.add('is-mobile');
        else document.documentElement.classList.remove('is-mobile');

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function () {
                document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
                const ov = document.getElementById('tmv3-modal-overlay');
                if (ov && ov.classList.contains('open')) {
                    ov.style.height = window.visualViewport.height + 'px';
                    ov.style.top    = window.visualViewport.offsetTop + 'px';
                }
            });
        }

        window.addEventListener('resize', function () {
            const nm = /Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 900;
            document.documentElement.classList.toggle('is-mobile', nm);
        });

        _initFirebase();
        _injectCSS();
        _buildMainUI();
        _injectButtons();
        _bindHotkey();

        if (_currentUser) {
            if (_db) { _loadChatList(); _ensurePublicGroup(); }
            if (!_db && typeof window._getChatDBAsync === 'function') {
                window._getChatDBAsync().then(function (db) {
                    if (db) { _db = db; _loadChatList(); _ensurePublicGroup(); }
                });
            }
        }

        /* ১৫ দিনের পুরনো message auto-delete */
        if (_db) {
            setTimeout(function () {
                try {
                    const cutoff   = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
                    const cutoffTs = firebase.firestore.Timestamp.fromDate(cutoff);
                    _db.collectionGroup('messages').where('expireAt', '<', cutoffTs).limit(200).get()
                        .then(function (snap) {
                            if (snap.empty) return;
                            const batch = _db.batch();
                            snap.docs.forEach(function (doc) { batch.delete(doc.ref); });
                            return batch.commit();
                        }).catch(function () {});
                } catch (e) {}
            }, 5000);
        }

        /* ব্যাকগ্রাউন্ড restore */
        setTimeout(function () {
            try {
                const BG_META_KEY = 'TM_CHAT_BG_META';
                const BG_IMG_KEY  = 'TM_CHAT_BG_IMG';
                const meta = JSON.parse(localStorage.getItem(BG_META_KEY) || 'null');
                if (!meta) return;
                const area = document.getElementById('tmv3-messages');
                if (!area) return;
                if (meta.type === 'gradient') {
                    area.style.background = meta.value;
                } else if (meta.type === 'color') {
                    area.style.backgroundImage = 'none';
                    area.style.backgroundColor = meta.value;
                } else if (meta.type === 'image' && window._TMDB) {
                    window._TMDB.get(BG_IMG_KEY).then(function (val) {
                        if (!val) return;
                        const a2 = document.getElementById('tmv3-messages');
                        if (!a2) return;
                        const blob   = new Blob([val], { type: meta.mime || 'image/jpeg' });
                        const objUrl = URL.createObjectURL(blob);
                        a2.style.backgroundImage    = `url('${objUrl}')`;
                        a2.style.backgroundRepeat   = 'no-repeat';
                        a2.style.backgroundSize     = 'cover';
                        a2.style.backgroundPosition = 'center';
                    }).catch(function () {});
                }
            } catch (e) {}
        }, 900);
    }

    /* ══════════════════════════════════════════════════════════
       SESSION USER
    ══════════════════════════════════════════════════════════ */
    function _getSessionUser() {
        try {
            const s = localStorage.getItem('TM_SESSION_USER');
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    /* ══════════════════════════════════════════════════════════
       FIREBASE HELPERS
    ══════════════════════════════════════════════════════════ */
    function _getUsersDb() {
        try { if (window._TM_FB_DBS && window._TM_FB_DBS['fb1_users']) return window._TM_FB_DBS['fb1_users']; } catch (e) {}
        try { if (typeof window._getDBForCollection === 'function') { const d = window._getDBForCollection('users'); if (d) return d; } } catch (e) {}
        try {
            const a = firebase.apps.find(function (ap) { return ap.options && ap.options.projectId === 'digitalshoptm-2008'; });
            if (a) return firebase.firestore(a);
        } catch (e) {}
        return _db;
    }

    function _initFirebase() {
        if (typeof firebase === 'undefined') return;
        if (typeof window._getChatDBAsync === 'function') {
            window._getChatDBAsync().then(function (db) {
                if (db && !_db) {
                    _db = db;
                    if (_currentUser) { _loadChatList(); _ensurePublicGroup(); }
                }
            });
        }
        if (typeof window._getChatDB === 'function') _db = window._getChatDB();
        if (!_db && firebase.apps && firebase.apps.length) _db = firebase.firestore();
    }

    /* ══════════════════════════════════════════════════════════
       PUBLIC GROUP — অটো সদস্য যোগ
    ══════════════════════════════════════════════════════════ */
    function _ensurePublicGroup() {
        if (!_db || !_currentUser) return;
        const uid         = String(_currentUser.id);
        const isMainAdmin = _currentUser.role === 'admin';

        _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).get().then(function (doc) {
            if (doc.exists) {
                const upd = { members: firebase.firestore.FieldValue.arrayUnion(uid), isPublic: true };
                if (isMainAdmin) { upd.adminId = uid; upd.name = PUBLIC_GROUP_NAME; }
                _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).update(upd).catch(function () {});
            } else {
                _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).set({
                    name: PUBLIC_GROUP_NAME,
                    isPublic: true,
                    adminId: isMainAdmin ? uid : 'system',
                    allowMemberAdd: false,
                    allowMemberMsg: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    members: [uid],
                    lastMsg: 'Digital Shop TM সাবজনীন গ্রুপে স্বাগতম! 🎉',
                    lastMsgTs: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(function () {});
            }
            _syncAllUsersToPublicGroup();
        }).catch(function () {
            _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).set({
                name: PUBLIC_GROUP_NAME, isPublic: true,
                adminId: isMainAdmin ? uid : 'system',
                allowMemberAdd: false, allowMemberMsg: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                members: firebase.firestore.FieldValue.arrayUnion(uid)
            }, { merge: true }).then(function () { _syncAllUsersToPublicGroup(); }).catch(function () {});
        });
    }

    function _syncAllUsersToPublicGroup() {
        if (!_db) return;
        function chunkArray(arr, size) {
            const out = [];
            for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
            return out;
        }
        function pushIds(ids) {
            if (!ids || !ids.length) return;
            chunkArray(ids, 400).forEach(function (chunk) {
                _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).update({
                    members: firebase.firestore.FieldValue.arrayUnion(...chunk)
                }).catch(function () {});
            });
        }
        let localIds = [];
        try {
            const raw = localStorage.getItem('TM_DB_USERS_V2');
            if (raw) localIds = JSON.parse(raw).map(function (u) { return String(u.id || u.uid || ''); }).filter(Boolean);
        } catch (e) {}
        if (!localIds.length) {
            try {
                const raw2 = localStorage.getItem('TM_USERS');
                if (raw2) localIds = JSON.parse(raw2).map(function (u) { return String(u.id || u.uid || ''); }).filter(Boolean);
            } catch (e) {}
        }
        if (localIds.length) pushIds(localIds);

        let usersDb = null;
        try { if (window._TM_FB_DBS && window._TM_FB_DBS['fb1_users']) usersDb = window._TM_FB_DBS['fb1_users']; } catch (e) {}
        if (!usersDb) { try { if (typeof window._getDBForCollection === 'function') usersDb = window._getDBForCollection('users'); } catch (e) {} }
        if (!usersDb) {
            try {
                const fb1 = firebase.apps.find(function (a) { return a.options && a.options.projectId === 'digitalshoptm-2008'; });
                if (fb1) usersDb = firebase.firestore(fb1);
            } catch (e) {}
        }
        if (!usersDb) return;
        usersDb.collection('users').get().then(function (snap) {
            const fbIds = [];
            snap.forEach(function (doc) {
                const id = String(doc.id);
                if (id && !localIds.includes(id)) fbIds.push(id);
            });
            if (fbIds.length) pushIds(fbIds);
        }).catch(function () {});
    }

    /* ══════════════════════════════════════════════════════════
       CSS — 3D Blue-Purple Theme
    ══════════════════════════════════════════════════════════ */
    function _injectCSS() {
        if (document.getElementById('tmv4-style')) return;
        const s = document.createElement('style');
        s.id = 'tmv4-style';
        s.textContent = `
/* ══ CSS Variables — Blue-Purple Palette ══ */
:root {
    --tm-bg-deep:      #0a0b1a;
    --tm-bg-dark:      #0f1029;
    --tm-bg-panel:     #131428;
    --tm-bg-card:      #1a1c3a;
    --tm-bg-hover:     #1f2244;
    --tm-bg-active:    #232650;
    --tm-accent:       #6c63ff;
    --tm-accent2:      #8b5cf6;
    --tm-accent-glow:  rgba(108,99,255,.35);
    --tm-accent-soft:  rgba(108,99,255,.12);
    --tm-blue:         #3b82f6;
    --tm-blue-soft:    rgba(59,130,246,.12);
    --tm-border:       rgba(108,99,255,.18);
    --tm-border2:      rgba(139,92,246,.1);
    --tm-text:         #e2e8f0;
    --tm-text-muted:   #7c85b0;
    --tm-text-dim:     #4a5280;
    --tm-bubble-own:   #2d1b69;
    --tm-bubble-own2:  #3b2380;
    --tm-bubble-other: #161830;
    --tm-bubble-other2:#1a1e3a;
    --tm-shadow:       0 8px 32px rgba(0,0,0,.6);
    --tm-shadow-sm:    0 4px 16px rgba(0,0,0,.4);
    --tm-radius:       16px;
    --tm-radius-sm:    10px;
    --tm-radius-xs:    6px;
    --tm-3d-top:       rgba(255,255,255,.07);
    --tm-3d-bottom:    rgba(0,0,0,.3);
    --tm-glow-purple:  0 0 20px rgba(108,99,255,.4);
    --tm-glow-blue:    0 0 16px rgba(59,130,246,.3);
}

/* ══ Reset ══ */
#tmv3-root * { box-sizing:border-box; margin:0; padding:0; }
#tmv3-root, #tmv3-root input, #tmv3-root textarea, #tmv3-root button {
    font-family:'Noto Sans Bengali','Segoe UI',system-ui,sans-serif;
}

/* ══ Overlay ══ */
#tmv3-overlay {
    display:none; position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,.72);
    backdrop-filter:blur(6px);
    align-items:center; justify-content:center;
}
#tmv3-overlay.open { display:flex; animation:tmFadeIn .2s ease; }
@keyframes tmFadeIn { from { opacity:0; } to { opacity:1; } }

/* ══ Root Container ══ */
#tmv3-root {
    width:min(1100px,96vw); height:min(700px,92vh);
    background:var(--tm-bg-deep);
    border-radius:20px;
    border:1px solid var(--tm-border);
    box-shadow:0 24px 80px rgba(0,0,0,.8), 0 0 0 1px rgba(108,99,255,.15), inset 0 1px 0 var(--tm-3d-top);
    display:flex; overflow:hidden; position:relative;
    animation:tmSlideUp .25s cubic-bezier(.4,0,.2,1);
}
@keyframes tmSlideUp { from { opacity:0; transform:translateY(24px) scale(.97); } to { opacity:1; transform:none; } }

.is-mobile #tmv3-overlay { align-items:stretch; justify-content:stretch; }
.is-mobile #tmv3-root {
    width:100%; height:100%; border-radius:0; border:none;
    max-width:none; max-height:none;
}

/* ══ LEFT PANEL ══ */
#tmv3-left {
    width:360px; min-width:320px; max-width:380px;
    background:linear-gradient(180deg, var(--tm-bg-panel) 0%, var(--tm-bg-dark) 100%);
    border-right:1px solid var(--tm-border);
    display:flex; flex-direction:column;
    position:relative; flex-shrink:0;
}
#tmv3-left::before {
    content:''; position:absolute; top:0; left:0; right:0; height:1px;
    background:linear-gradient(90deg, transparent, var(--tm-accent), transparent);
}
.is-mobile #tmv3-left { width:100%; max-width:none; min-width:0; }
.is-mobile #tmv3-left.hidden { display:none; }

/* LEFT Header */
#tmv3-left-header {
    display:flex; align-items:center; gap:10px;
    padding:14px 16px;
    background:linear-gradient(135deg, #1a1c3e 0%, #0f1029 100%);
    border-bottom:1px solid var(--tm-border);
    flex-shrink:0;
    box-shadow:0 4px 20px rgba(0,0,0,.4), inset 0 1px 0 var(--tm-3d-top);
}
#tmv3-left-header-title {
    flex:1; font-size:17px; font-weight:700; color:var(--tm-text);
    letter-spacing:.3px;
    background:linear-gradient(90deg, #a78bfa, #60a5fa);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
.is-mobile #tmv3-left-header { padding:18px 16px; }
.is-mobile #tmv3-left-header-title { font-size:28px; }

/* Header icon buttons */
.tmv3-icon-btn {
    background:none; border:none; cursor:pointer;
    color:var(--tm-text-muted); width:38px; height:38px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:16px; transition:all .18s;
}
.tmv3-icon-btn:hover {
    background:var(--tm-accent-soft); color:var(--tm-accent);
    box-shadow:var(--tm-glow-purple);
}
.is-mobile .tmv3-icon-btn { width:60px; height:60px; font-size:26px; }

/* Close button */
#tmv3-main-close-btn {
    background:rgba(239,68,68,.12) !important;
    border:1.5px solid rgba(239,68,68,.3) !important;
    color:#ef4444 !important;
}
#tmv3-main-close-btn:hover { background:rgba(239,68,68,.22) !important; box-shadow:0 0 14px rgba(239,68,68,.4) !important; }

/* Left 3-dot dropdown */
.tmv3-dropdown { position:relative; }
.tmv3-dropdown-menu {
    position:absolute; right:0; top:calc(100% + 8px);
    background:linear-gradient(160deg, #1e2048, #141630);
    border:1px solid var(--tm-border);
    border-radius:var(--tm-radius-sm);
    box-shadow:var(--tm-shadow), inset 0 1px 0 var(--tm-3d-top);
    min-width:200px; z-index:9999; overflow:hidden; display:none;
}
.tmv3-dropdown-menu.open { display:block; animation:tmDropIn .12s ease; }
@keyframes tmDropIn { from { opacity:0; transform:translateY(-6px) scale(.97); } to { opacity:1; transform:none; } }
.tmv3-dropdown-item {
    padding:13px 18px; color:var(--tm-text); font-size:14px;
    cursor:pointer; display:flex; align-items:center; gap:14px;
    transition:background .12s; border-bottom:1px solid var(--tm-border2);
}
.tmv3-dropdown-item:last-child { border-bottom:none; }
.tmv3-dropdown-item:hover { background:var(--tm-accent-soft); }
.tmv3-dropdown-item i { width:18px; text-align:center; color:var(--tm-accent); font-size:14px; }
.tmv3-dropdown-item.danger { color:#f87171; }
.tmv3-dropdown-item.danger i { color:#f87171; }
.is-mobile .tmv3-dropdown-item { font-size:22px; padding:20px 24px; gap:20px; }
.is-mobile .tmv3-dropdown-item i { font-size:22px; }

/* Search */
.tmv3-search-wrap { padding:10px 12px 6px; flex-shrink:0; }
.tmv3-search-bar {
    display:flex; align-items:center; gap:10px;
    background:var(--tm-bg-card);
    border:1px solid var(--tm-border);
    border-radius:100px; padding:10px 16px;
    box-shadow:inset 0 2px 6px rgba(0,0,0,.3);
    transition:border-color .2s, box-shadow .2s;
}
.tmv3-search-bar:focus-within {
    border-color:var(--tm-accent);
    box-shadow:inset 0 2px 6px rgba(0,0,0,.3), 0 0 0 3px var(--tm-accent-soft);
}
.tmv3-search-bar i { color:var(--tm-text-dim); font-size:14px; flex-shrink:0; }
.tmv3-search-bar input {
    flex:1; background:none; border:none; outline:none;
    color:var(--tm-text); font-size:14px; line-height:1.4;
}
.tmv3-search-bar input::placeholder { color:var(--tm-text-dim); }
.is-mobile .tmv3-search-bar { padding:16px 22px; gap:14px; border-radius:100px; min-height:80px; }
.is-mobile .tmv3-search-bar i { font-size:24px; }
.is-mobile .tmv3-search-bar input { font-size:26px; }

/* User search results */
#tmv3-user-search-results {
    display:none; margin:0 12px 6px;
    background:var(--tm-bg-card);
    border:1px solid var(--tm-border);
    border-radius:var(--tm-radius-sm);
    overflow:hidden; max-height:320px; overflow-y:auto;
    box-shadow:var(--tm-shadow-sm);
}
.tmv3-usr-srch-label {
    padding:9px 14px 6px; color:var(--tm-accent); font-size:11px; font-weight:700;
    letter-spacing:.6px; text-transform:uppercase; border-bottom:1px solid var(--tm-border2);
}
.tmv3-usr-srch-item {
    display:flex; align-items:center; gap:11px; padding:10px 14px;
    cursor:pointer; transition:background .15s; border-bottom:1px solid var(--tm-border2);
}
.tmv3-usr-srch-item:last-child { border-bottom:none; }
.tmv3-usr-srch-item:hover { background:var(--tm-accent-soft); }
.tmv3-usr-srch-av {
    width:40px; height:40px; border-radius:50%;
    background:var(--tm-bg-hover); display:flex; align-items:center; justify-content:center;
    font-size:18px; flex-shrink:0; overflow:hidden; border:2px solid var(--tm-border);
}
.tmv3-usr-srch-av img { width:100%; height:100%; object-fit:cover; }
.tmv3-usr-srch-info { flex:1; min-width:0; }
.tmv3-usr-srch-name { color:var(--tm-text); font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tmv3-usr-srch-sub { color:var(--tm-text-muted); font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tmv3-usr-srch-action {
    color:var(--tm-accent); font-size:12px; font-weight:600;
    background:var(--tm-accent-soft); padding:5px 10px; border-radius:20px;
    border:1px solid var(--tm-border); flex-shrink:0;
}
.tmv3-usr-search-loading { padding:14px; color:var(--tm-text-muted); font-size:13px; text-align:center; }

/* Filter tabs */
.tmv3-tabs {
    display:flex; gap:7px; padding:7px 12px 9px;
    flex-shrink:0; overflow-x:auto; scrollbar-width:none;
}
.tmv3-tabs::-webkit-scrollbar { display:none; }
.tmv3-tab {
    background:var(--tm-bg-card); border:1.5px solid var(--tm-border);
    color:var(--tm-text-muted); padding:6px 18px; border-radius:28px;
    cursor:pointer; font-size:13px; white-space:nowrap; font-family:inherit;
    transition:all .18s; font-weight:500;
    box-shadow:0 2px 8px rgba(0,0,0,.2), inset 0 1px 0 var(--tm-3d-top);
}
.tmv3-tab.active {
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; border-color:transparent;
    box-shadow:var(--tm-glow-purple), 0 4px 12px rgba(108,99,255,.4), inset 0 1px 0 rgba(255,255,255,.15);
    font-weight:700;
}
.tmv3-tab:hover:not(.active) {
    background:var(--tm-bg-hover); color:var(--tm-text); border-color:var(--tm-accent);
}
.is-mobile .tmv3-tab { font-size:20px; padding:12px 26px; }

/* Chat List */
#tmv3-chat-list { flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--tm-bg-hover) transparent; }
#tmv3-chat-list::-webkit-scrollbar { width:4px; }
#tmv3-chat-list::-webkit-scrollbar-thumb { background:var(--tm-bg-hover); border-radius:4px; }

.tmv3-chat-item {
    display:flex; align-items:center; gap:13px;
    padding:11px 14px; cursor:pointer;
    border-bottom:1px solid var(--tm-border2);
    transition:background .15s; position:relative;
}
.tmv3-chat-item:hover { background:var(--tm-bg-hover); }
.tmv3-chat-item.active {
    background:linear-gradient(90deg, rgba(108,99,255,.18) 0%, rgba(108,99,255,.06) 100%);
    border-bottom-color:transparent;
}
.tmv3-chat-item.active::before {
    content:''; position:absolute; left:0; top:50%; transform:translateY(-50%);
    width:3px; height:60%;
    background:linear-gradient(180deg, var(--tm-accent), var(--tm-blue));
    border-radius:0 3px 3px 0;
}
.is-mobile .tmv3-chat-item { padding:16px 18px; gap:16px; }

/* Avatars */
.tmv3-avatar {
    width:48px; height:48px; border-radius:50%;
    background:linear-gradient(135deg, var(--tm-bg-hover), var(--tm-bg-card));
    display:flex; align-items:center; justify-content:center;
    font-size:20px; color:var(--tm-text-muted); flex-shrink:0;
    overflow:hidden; position:relative;
    border:2px solid var(--tm-border);
    box-shadow:0 2px 10px rgba(0,0,0,.4), inset 0 1px 0 var(--tm-3d-top);
}
.tmv3-avatar img { width:100%; height:100%; object-fit:cover; }
.tmv3-avatar.group {
    background:linear-gradient(135deg, #2d1b69, #3b2380);
    border-color:rgba(139,92,246,.35);
    box-shadow:0 2px 10px rgba(0,0,0,.4), 0 0 12px rgba(139,92,246,.2);
}
.tmv3-avatar.public {
    background:linear-gradient(135deg, #1e40af, #3b82f6);
    border-color:rgba(59,130,246,.35);
    box-shadow:0 2px 10px rgba(0,0,0,.4), var(--tm-glow-blue);
}
.is-mobile .tmv3-avatar { width:64px; height:64px; font-size:26px; }

.tmv3-chat-info { flex:1; min-width:0; }
.tmv3-chat-name {
    color:var(--tm-text); font-size:15px; font-weight:500;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3;
}
.tmv3-chat-name.has-unread { font-weight:700; color:#fff; }
.tmv3-chat-preview {
    color:var(--tm-text-muted); font-size:13px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;
}
.tmv3-chat-preview.has-unread { color:var(--tm-text); }
.is-mobile .tmv3-chat-name { font-size:22px; font-weight:600; }
.is-mobile .tmv3-chat-preview { font-size:18px; }

.tmv3-chat-meta { display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0; min-width:50px; }
.tmv3-chat-time { color:var(--tm-text-dim); font-size:11px; white-space:nowrap; }
.tmv3-chat-time.has-unread { color:var(--tm-accent); }
.tmv3-unread-badge {
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; font-size:11px; font-weight:700;
    min-width:20px; height:20px; border-radius:10px;
    display:flex; align-items:center; justify-content:center; padding:0 5px;
    box-shadow:0 2px 8px rgba(108,99,255,.5);
}
.is-mobile .tmv3-chat-time { font-size:18px; }
.is-mobile .tmv3-unread-badge { font-size:16px; min-width:28px; height:28px; }

/* Empty chat list */
.tmv3-empty-msg {
    color:var(--tm-text-muted); text-align:center;
    padding:40px 20px; font-size:14px; line-height:1.7;
}

/* ══ RIGHT PANEL ══ */
#tmv3-right {
    flex:1; display:flex; flex-direction:column;
    background:linear-gradient(180deg, var(--tm-bg-dark) 0%, var(--tm-bg-deep) 100%);
    min-width:0; position:relative; overflow:hidden;
}
.is-mobile #tmv3-right {
    width:100%; height:100%; position:absolute; inset:0;
    transform:translateX(100%); transition:transform .28s cubic-bezier(.4,0,.2,1); z-index:3;
}
.is-mobile #tmv3-right.open { transform:translateX(0); }

/* Empty right (no chat selected) */
#tmv3-empty-right {
    flex:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:18px;
}
.tmv3-empty-icon-wrap {
    width:90px; height:90px; border-radius:50%;
    background:linear-gradient(135deg, var(--tm-bg-card), var(--tm-bg-hover));
    border:2px solid var(--tm-border);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 0 16px rgba(108,99,255,.05), 0 0 0 32px rgba(108,99,255,.025), var(--tm-glow-purple);
}
.tmv3-empty-icon-wrap i { font-size:38px; color:var(--tm-accent); opacity:.7; }
#tmv3-empty-right p { font-size:13.5px; color:var(--tm-text-muted); text-align:center; line-height:1.7; }

/* Chat Header */
#tmv3-chat-header {
    background:linear-gradient(135deg, #1a1c3e 0%, #131428 100%);
    padding:11px 14px;
    display:flex; align-items:center; gap:11px;
    border-bottom:1px solid var(--tm-border);
    flex-shrink:0; cursor:pointer;
    box-shadow:0 4px 20px rgba(0,0,0,.4), inset 0 1px 0 var(--tm-3d-top);
}
.is-mobile #tmv3-chat-header { padding:18px 16px; }

#tmv3-back-btn {
    display:none; background:none; border:none; color:var(--tm-accent);
    font-size:18px; cursor:pointer; width:36px; height:36px;
    border-radius:50%; align-items:center; justify-content:center; transition:.2s;
}
#tmv3-back-btn:hover { background:var(--tm-accent-soft); }
.is-mobile #tmv3-back-btn { display:flex; width:56px; height:56px; font-size:26px; }
#tmv3-chat-close-btn { display:none !important; }

#tmv3-header-info { flex:1; min-width:0; pointer-events:none; }
#tmv3-header-name {
    color:var(--tm-text); font-size:15.5px; font-weight:700;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#tmv3-header-sub {
    font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    background:linear-gradient(90deg, var(--tm-accent), var(--tm-blue));
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
.is-mobile #tmv3-header-name { font-size:26px; }
.is-mobile #tmv3-header-sub { font-size:20px; }

.tmv3-header-actions-right { display:flex; align-items:center; gap:4px; }

/* Messages Area */
#tmv3-messages {
    flex:1; min-height:0; overflow-y:auto; padding:14px 16px;
    display:flex; flex-direction:column; gap:3px;
    background:var(--tm-bg-deep);
    background-image:
        radial-gradient(ellipse 70% 50% at 50% 0%, rgba(108,99,255,.04) 0%, transparent 60%),
        radial-gradient(ellipse 50% 30% at 80% 100%, rgba(59,130,246,.03) 0%, transparent 60%);
    scrollbar-width:thin; scrollbar-color:var(--tm-bg-hover) transparent;
}
#tmv3-messages::-webkit-scrollbar { width:5px; }
#tmv3-messages::-webkit-scrollbar-thumb { background:var(--tm-bg-hover); border-radius:10px; }

/* Date Dividers */
.tmv3-date-div { display:flex; align-items:center; justify-content:center; margin:12px 0; }
.tmv3-date-div span {
    background:var(--tm-bg-card); color:var(--tm-text-muted); font-size:11px;
    padding:4px 14px; border-radius:20px;
    border:1px solid var(--tm-border2);
    box-shadow:0 2px 8px rgba(0,0,0,.3);
}

/* Message Bubbles */
.tmv3-msg-wrap {
    display:flex; gap:8px; max-width:78%; animation:tmMsgIn .18s ease;
    align-items:flex-end;
}
@keyframes tmMsgIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
.tmv3-msg-wrap.own { align-self:flex-end; flex-direction:row-reverse; }
.tmv3-msg-wrap.other { align-self:flex-start; }

.tmv3-msg-av {
    width:32px; height:32px; border-radius:50%; flex-shrink:0;
    background:var(--tm-bg-card); display:flex; align-items:center; justify-content:center;
    font-size:14px; color:var(--tm-text-muted); overflow:hidden;
    border:1.5px solid var(--tm-border); align-self:flex-end;
}
.tmv3-msg-av img { width:100%; height:100%; object-fit:cover; }

.tmv3-bubble {
    padding:9px 13px 7px; border-radius:16px;
    max-width:100%; word-break:break-word;
    position:relative;
    box-shadow:0 3px 12px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05);
}
.tmv3-msg-wrap.own .tmv3-bubble {
    background:linear-gradient(135deg, var(--tm-bubble-own), var(--tm-bubble-own2));
    border:1px solid rgba(139,92,246,.2);
    border-top-right-radius:4px;
    box-shadow:0 3px 12px rgba(0,0,0,.35), 0 0 14px rgba(108,99,255,.15), inset 0 1px 0 rgba(255,255,255,.06);
}
.tmv3-msg-wrap.other .tmv3-bubble {
    background:linear-gradient(135deg, var(--tm-bubble-other), var(--tm-bubble-other2));
    border:1px solid var(--tm-border2);
    border-bottom-left-radius:4px;
}

.tmv3-sender {
    font-size:12px; font-weight:700; margin-bottom:4px;
    letter-spacing:.2px;
}
.tmv3-reply-quote {
    background:rgba(0,0,0,.3); border-left:3px solid var(--tm-accent);
    border-radius:var(--tm-radius-xs); padding:6px 10px; margin-bottom:7px;
    font-size:12px; color:var(--tm-text-muted); line-height:1.5;
}
.tmv3-reply-quote strong { color:var(--tm-accent); display:block; margin-bottom:2px; }

.tmv3-msg-img {
    max-width:260px; max-height:220px; border-radius:10px;
    cursor:pointer; display:block; margin-bottom:5px;
    box-shadow:0 3px 12px rgba(0,0,0,.4);
    transition:transform .15s; object-fit:cover;
}
.tmv3-msg-img:hover { transform:scale(1.02); }

.tmv3-msg-text { font-size:14.5px; color:var(--tm-text); line-height:1.55; }
.is-mobile .tmv3-msg-text { font-size:20px; line-height:1.6; }

.tmv3-msg-time {
    font-size:10.5px; color:var(--tm-text-dim); text-align:right;
    margin-top:4px; display:flex; align-items:center; justify-content:flex-end; gap:3px;
}
.tmv3-tick { color:var(--tm-text-dim); }
.tmv3-tick.seen { color:var(--tm-blue); }

/* Scroll-to-bottom btn */
#tmv3-scroll-down {
    position:absolute; right:18px; bottom:90px;
    width:38px; height:38px; border-radius:50%;
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; border:none; cursor:pointer; font-size:15px;
    display:none; align-items:center; justify-content:center;
    box-shadow:var(--tm-glow-purple);
    transition:transform .15s;
}
#tmv3-scroll-down.show { display:flex; }
#tmv3-scroll-down:hover { transform:scale(1.08); }

/* Typing indicator */
#tmv3-typing {
    display:none; padding:5px 18px 3px; min-height:24px;
    font-size:12px; color:var(--tm-text-muted); font-style:italic;
    align-items:center; gap:6px;
}
.tmv3-typing-dots { display:flex; gap:3px; }
.tmv3-typing-dots span {
    width:5px; height:5px; border-radius:50%;
    background:var(--tm-accent); opacity:.6;
    animation:tmTypeDot 1.2s infinite ease-in-out;
}
.tmv3-typing-dots span:nth-child(2) { animation-delay:.2s; }
.tmv3-typing-dots span:nth-child(3) { animation-delay:.4s; }
@keyframes tmTypeDot { 0%,80%,100% { transform:scale(.8); opacity:.4; } 40% { transform:scale(1.1); opacity:1; } }

/* Admin banner */
#tmv3-admin-banner {
    display:none; padding:11px 18px; text-align:center;
    background:rgba(108,99,255,.08); border-top:1px solid var(--tm-border);
    color:var(--tm-text-muted); font-size:13.5px;
}
#tmv3-admin-banner.show { display:block; }

/* Reply / Media bars */
#tmv3-reply-bar, #tmv3-media-bar {
    display:none; padding:8px 14px; gap:10px; align-items:center;
    background:var(--tm-bg-card); border-top:2px solid var(--tm-accent);
    flex-shrink:0;
}
#tmv3-reply-bar.show, #tmv3-media-bar.show { display:flex; }
#tmv3-reply-prev { flex:1; font-size:13px; color:var(--tm-text-muted); line-height:1.5; }
#tmv3-reply-prev strong { color:var(--tm-accent); }
#tmv3-media-thumb { width:48px; height:48px; object-fit:cover; border-radius:var(--tm-radius-xs); border:1.5px solid var(--tm-border); }

.tmv3-act-btn {
    background:none; border:none; cursor:pointer; color:var(--tm-text-muted);
    width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-size:15px; transition:all .15s;
}
.tmv3-act-btn:hover { background:var(--tm-accent-soft); color:var(--tm-accent); }

/* Input Area */
#tmv3-input-area {
    display:none; padding:10px 14px;
    background:linear-gradient(180deg, transparent, var(--tm-bg-panel));
    border-top:1px solid var(--tm-border);
    align-items:flex-end; gap:10px; flex-shrink:0;
}
#tmv3-input-area label.tmv3-act-btn { font-size:18px; margin-bottom:2px; }
#tmv3-msg-input {
    flex:1; background:var(--tm-bg-card); border:1px solid var(--tm-border);
    border-radius:22px; padding:10px 16px; color:var(--tm-text);
    font-size:14px; resize:none; outline:none; max-height:130px;
    font-family:inherit; transition:border-color .2s, box-shadow .2s;
    box-shadow:inset 0 2px 6px rgba(0,0,0,.3);
}
#tmv3-msg-input::placeholder { color:var(--tm-text-dim); }
#tmv3-msg-input:focus {
    border-color:var(--tm-accent);
    box-shadow:inset 0 2px 6px rgba(0,0,0,.3), 0 0 0 3px var(--tm-accent-soft);
}
.is-mobile #tmv3-msg-input { font-size:22px; padding:14px 20px; }

#tmv3-send-btn {
    width:44px; height:44px; border-radius:50%; border:none; cursor:pointer;
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; font-size:16px;
    display:flex; align-items:center; justify-content:center;
    box-shadow:var(--tm-glow-purple);
    transition:transform .15s, box-shadow .15s;
    flex-shrink:0;
}
#tmv3-send-btn:hover { transform:scale(1.08); box-shadow:0 0 24px rgba(108,99,255,.6); }
#tmv3-send-btn:disabled { opacity:.5; transform:none; }
.is-mobile #tmv3-send-btn { width:62px; height:62px; font-size:24px; }

/* Side Panel (Group/User Info) */
#tmv3-side-panel {
    position:absolute; right:0; top:0; bottom:0; width:340px;
    background:linear-gradient(180deg, var(--tm-bg-panel), var(--tm-bg-dark));
    border-left:1px solid var(--tm-border);
    transform:translateX(100%); transition:transform .28s cubic-bezier(.4,0,.2,1);
    overflow-y:auto; z-index:10;
    box-shadow:-8px 0 32px rgba(0,0,0,.5);
}
#tmv3-side-panel.open { transform:translateX(0); }
.is-mobile #tmv3-side-panel { width:100%; }

.tmv3-sp-header {
    display:flex; align-items:center; gap:10px;
    padding:14px 16px;
    background:linear-gradient(135deg, #1a1c3e, #131428);
    border-bottom:1px solid var(--tm-border); flex-shrink:0;
    box-shadow:inset 0 1px 0 var(--tm-3d-top);
}
.tmv3-sp-title { flex:1; font-size:16px; font-weight:700; color:var(--tm-text); }
.tmv3-sp-body { padding:16px; }
.tmv3-sp-avatar-wrap { display:flex; justify-content:center; padding:20px 0 14px; }
.tmv3-sp-avatar {
    width:88px; height:88px; border-radius:50%;
    background:linear-gradient(135deg, var(--tm-bg-card), var(--tm-bg-hover));
    border:3px solid var(--tm-border);
    display:flex; align-items:center; justify-content:center;
    font-size:40px; overflow:hidden; position:relative;
    box-shadow:var(--tm-glow-purple), 0 6px 20px rgba(0,0,0,.5);
}
.tmv3-sp-avatar.group { background:linear-gradient(135deg, #2d1b69, #3b2380); border-color:rgba(139,92,246,.4); }
.tmv3-sp-avatar.public { background:linear-gradient(135deg, #1e40af, #3b82f6); border-color:rgba(59,130,246,.4); }
.tmv3-sp-avatar img { width:100%; height:100%; object-fit:cover; }
.tmv3-sp-avatar-edit {
    position:absolute; bottom:0; right:0; width:28px; height:28px; border-radius:50%;
    background:var(--tm-accent); color:#fff; font-size:12px;
    display:flex; align-items:center; justify-content:center;
}
.tmv3-sp-name { text-align:center; font-size:18px; font-weight:700; color:var(--tm-text); margin-bottom:5px; }
.tmv3-sp-sub { text-align:center; font-size:13px; color:var(--tm-text-muted); margin-bottom:14px; }
.tmv3-sp-section { margin-bottom:14px; }
.tmv3-sp-row {
    display:flex; align-items:center; gap:14px;
    padding:13px 14px; cursor:pointer;
    background:var(--tm-bg-card); border:1px solid var(--tm-border2);
    border-radius:var(--tm-radius-sm); margin-bottom:6px;
    transition:background .15s;
    box-shadow:0 2px 8px rgba(0,0,0,.2), inset 0 1px 0 var(--tm-3d-top);
}
.tmv3-sp-row:hover { background:var(--tm-bg-hover); border-color:var(--tm-accent); }
.tmv3-sp-row i { color:var(--tm-accent); width:18px; text-align:center; font-size:15px; }
.tmv3-sp-row .label { flex:1; color:var(--tm-text); font-size:14px; }
.tmv3-sp-row.danger i, .tmv3-sp-row.danger .label { color:#f87171; }
.tmv3-sp-row.danger:hover { background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.3); }

.tmv3-bio-box {
    background:var(--tm-bg-card); border:1px solid var(--tm-border2);
    border-radius:var(--tm-radius-sm); padding:12px 14px; margin-bottom:10px;
}
.tmv3-bio-box p { font-size:13.5px; color:var(--tm-text-muted); line-height:1.6; }

/* Member items */
.tmv3-member-item {
    display:flex; align-items:center; gap:12px;
    padding:10px 0; border-bottom:1px solid var(--tm-border2);
}
.tmv3-member-item:last-child { border-bottom:none; }
.tmv3-member-av {
    width:42px; height:42px; border-radius:50%;
    background:var(--tm-bg-card); border:1.5px solid var(--tm-border);
    display:flex; align-items:center; justify-content:center;
    font-size:19px; overflow:hidden; flex-shrink:0;
}
.tmv3-member-av img { width:100%; height:100%; object-fit:cover; }
.tmv3-member-info { flex:1; min-width:0; }
.tmv3-member-name { color:var(--tm-text); font-size:14px; font-weight:600; }
.tmv3-member-role { color:var(--tm-accent); font-size:11px; margin-top:2px; }

/* Context Menu */
#tmv3-ctx-menu {
    position:fixed; z-index:999999; display:none;
    background:linear-gradient(160deg, #1e2048, #141630);
    border:1px solid var(--tm-border);
    border-radius:var(--tm-radius-sm);
    box-shadow:var(--tm-shadow), inset 0 1px 0 var(--tm-3d-top);
    overflow:hidden; min-width:160px;
    animation:tmDropIn .1s ease;
}
.tmv3-ctx-item {
    padding:12px 18px; cursor:pointer; color:var(--tm-text);
    font-size:14px; display:flex; align-items:center; gap:12px;
    transition:background .1s; border-bottom:1px solid var(--tm-border2);
}
.tmv3-ctx-item:last-child { border-bottom:none; }
.tmv3-ctx-item:hover { background:var(--tm-accent-soft); }
.tmv3-ctx-item i { color:var(--tm-accent); width:16px; }
.tmv3-ctx-item.danger, .tmv3-ctx-item.danger i { color:#f87171; }

/* Modal */
#tmv3-modal-overlay {
    display:none; position:fixed; inset:0; z-index:999998;
    background:rgba(0,0,0,.65); backdrop-filter:blur(4px);
    align-items:center; justify-content:center;
}
#tmv3-modal-overlay.open { display:flex; animation:tmFadeIn .18s ease; }
#tmv3-modal {
    background:linear-gradient(160deg, #1a1c3e, #0f1029);
    border:1px solid var(--tm-border);
    border-radius:20px; padding:0;
    width:min(500px,92vw); max-height:85vh; overflow-y:auto;
    box-shadow:var(--tm-shadow), 0 0 0 1px rgba(108,99,255,.15), inset 0 1px 0 var(--tm-3d-top);
    animation:tmSlideUp .2s ease;
}
.tmv3-modal-header {
    padding:18px 20px; border-bottom:1px solid var(--tm-border);
    display:flex; align-items:center; gap:12px;
    background:linear-gradient(135deg, rgba(108,99,255,.12), transparent);
}
.tmv3-modal-title { flex:1; font-size:17px; font-weight:700; color:var(--tm-text); }
.tmv3-modal-body { padding:20px; }
.tmv3-input-group { margin-bottom:16px; }
.tmv3-input-group label { display:block; font-size:12.5px; color:var(--tm-text-muted); margin-bottom:7px; font-weight:600; letter-spacing:.4px; text-transform:uppercase; }
.tmv3-input-group input, .tmv3-input-group textarea {
    width:100%; background:var(--tm-bg-card); border:1.5px solid var(--tm-border);
    border-radius:var(--tm-radius-sm); padding:11px 14px; color:var(--tm-text);
    font-size:14px; font-family:inherit; outline:none;
    transition:border-color .2s, box-shadow .2s;
    box-shadow:inset 0 2px 6px rgba(0,0,0,.3);
}
.tmv3-input-group input:focus, .tmv3-input-group textarea:focus {
    border-color:var(--tm-accent); box-shadow:inset 0 2px 6px rgba(0,0,0,.3), 0 0 0 3px var(--tm-accent-soft);
}
.tmv3-input-group textarea { resize:vertical; min-height:70px; }

.tmv3-btn {
    padding:11px 22px; border-radius:22px; border:none; cursor:pointer;
    font-size:14px; font-weight:600; font-family:inherit;
    transition:all .18s; display:inline-flex; align-items:center; gap:8px;
}
.tmv3-btn.primary {
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; box-shadow:var(--tm-glow-purple);
}
.tmv3-btn.primary:hover { transform:translateY(-1px); box-shadow:0 0 24px rgba(108,99,255,.6); }
.tmv3-btn.secondary {
    background:var(--tm-bg-card); color:var(--tm-text-muted);
    border:1px solid var(--tm-border);
}
.tmv3-btn.secondary:hover { background:var(--tm-bg-hover); color:var(--tm-text); }
.tmv3-btn.danger {
    background:rgba(239,68,68,.12); color:#f87171; border:1px solid rgba(239,68,68,.3);
}
.tmv3-btn.danger:hover { background:rgba(239,68,68,.22); }
.tmv3-modal-footer {
    display:flex; gap:10px; justify-content:flex-end;
    padding:14px 20px; border-top:1px solid var(--tm-border2);
    flex-wrap:wrap;
}

/* Spinner */
.tmv3-spinner {
    display:flex; justify-content:center; align-items:center;
    height:80px; color:var(--tm-accent); font-size:22px;
    animation:tmSpin 1s linear infinite;
}
@keyframes tmSpin { to { transform:rotate(360deg); } }
.tmv3-spinner i { animation:tmSpin 1s linear infinite; }

/* Toggle Switch */
.tmv3-toggle-row {
    display:flex; align-items:center; justify-content:space-between;
    padding:12px 0; border-bottom:1px solid var(--tm-border2);
}
.tmv3-toggle-row:last-child { border-bottom:none; }
.tmv3-toggle-label { font-size:14px; color:var(--tm-text); }
.tmv3-toggle-sub { font-size:12px; color:var(--tm-text-muted); margin-top:2px; }
.tmv3-switch { position:relative; width:46px; height:24px; flex-shrink:0; }
.tmv3-switch input { opacity:0; width:0; height:0; }
.tmv3-switch-slider {
    position:absolute; cursor:pointer; inset:0;
    background:var(--tm-bg-hover); border-radius:24px; transition:.3s;
    border:1.5px solid var(--tm-border);
}
.tmv3-switch-slider::before {
    content:''; position:absolute; height:16px; width:16px;
    left:3px; bottom:3px; background:#fff; border-radius:50%;
    transition:.3s; box-shadow:0 1px 4px rgba(0,0,0,.4);
}
.tmv3-switch input:checked + .tmv3-switch-slider {
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    border-color:transparent;
}
.tmv3-switch input:checked + .tmv3-switch-slider::before { transform:translateX(22px); }

/* Lightbox */
#tmv3-lightbox {
    display:none; position:fixed; inset:0; z-index:9999999;
    background:rgba(0,0,0,.93); align-items:center; justify-content:center;
}
#tmv3-lightbox.open { display:flex; animation:tmFadeIn .18s ease; }
#tmv3-lb-img { max-width:92vw; max-height:88vh; border-radius:10px; box-shadow:var(--tm-shadow); object-fit:contain; }
#tmv3-lb-close {
    position:absolute; top:18px; right:18px; background:rgba(0,0,0,.6);
    border:1px solid var(--tm-border); color:var(--tm-text); width:40px; height:40px;
    border-radius:50%; cursor:pointer; font-size:16px;
    display:flex; align-items:center; justify-content:center;
    transition:background .15s;
}
#tmv3-lb-close:hover { background:rgba(239,68,68,.5); }

/* Toast */
#tmv3-toast {
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%) translateY(80px);
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; padding:11px 24px; border-radius:100px;
    font-size:14px; font-weight:500; z-index:9999999;
    box-shadow:var(--tm-glow-purple), 0 8px 24px rgba(0,0,0,.5);
    transition:transform .3s cubic-bezier(.4,0,.2,1), opacity .3s; opacity:0;
    max-width:88vw; text-align:center; white-space:nowrap;
}
#tmv3-toast.show { transform:translateX(-50%) translateY(0); opacity:1; }

/* Chat button (PC header) */
#tmChatBtnPC {
    position:relative; background:none; border:none; cursor:pointer;
    padding:6px; border-radius:50%; transition:all .18s;
    display:flex; align-items:center; justify-content:center;
}
#tmChatBtnPC:hover { background:var(--tm-accent-soft); }
.tmv3-badge {
    position:absolute; top:2px; right:2px; min-width:14px; height:14px;
    background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; font-size:9px; font-weight:700; border-radius:7px; padding:0 3px;
    display:none; align-items:center; justify-content:center;
    box-shadow:var(--tm-glow-purple);
}
.tmv3-badge.show { display:flex; }

/* Mobile nav item */
.tmv3-mob-item {
    display:flex; flex-direction:column; align-items:center; gap:5px;
    padding:10px 14px; cursor:pointer; font-size:12px; color:var(--tm-text-muted);
    border-radius:var(--tm-radius-sm); transition:all .15s; position:relative;
}
.tmv3-mob-item:hover { background:var(--tm-accent-soft); color:var(--tm-accent); }
.tmv3-mob-badge {
    position:absolute; top:6px; right:10px;
    min-width:14px; height:14px; background:linear-gradient(135deg, var(--tm-accent), var(--tm-accent2));
    color:#fff; font-size:9px; font-weight:700; border-radius:7px; padding:0 3px;
    display:none; align-items:center; justify-content:center;
}
.tmv3-mob-badge.show { display:flex; }

/* Profile panel */
.tmv3-prof-av-wrap {
    display:flex; justify-content:center; padding:24px 0 16px;
    flex-direction:column; align-items:center; gap:12px;
}
.tmv3-prof-av {
    width:90px; height:90px; border-radius:50%; cursor:pointer;
    background:linear-gradient(135deg, var(--tm-bg-card), var(--tm-bg-hover));
    border:3px solid var(--tm-accent); overflow:hidden;
    display:flex; align-items:center; justify-content:center; font-size:42px;
    position:relative;
    box-shadow:var(--tm-glow-purple), 0 6px 20px rgba(0,0,0,.5);
    transition:box-shadow .2s;
}
.tmv3-prof-av:hover { box-shadow:0 0 30px rgba(108,99,255,.6), 0 6px 20px rgba(0,0,0,.5); }
.tmv3-prof-av img { width:100%; height:100%; object-fit:cover; }
.tmv3-prof-av-edit {
    position:absolute; inset:0; background:rgba(0,0,0,.5);
    display:flex; align-items:center; justify-content:center;
    font-size:28px; color:#fff; opacity:0; transition:opacity .15s;
}
.tmv3-prof-av:hover .tmv3-prof-av-edit { opacity:1; }

/* Scrollbar (mobile adjustment) */
.is-mobile #tmv3-chat-list { padding-bottom:0; }

/* Find users modal */
.tmv3-find-user-item {
    display:flex; align-items:center; gap:12px; padding:12px 0;
    border-bottom:1px solid var(--tm-border2); cursor:pointer;
    transition:background .12s; border-radius:var(--tm-radius-xs);
}
.tmv3-find-user-item:last-child { border-bottom:none; }
.tmv3-find-user-item:hover { background:var(--tm-accent-soft); padding:12px 10px; }

/* Group settings input */
.cg-av-wrap {
    width:70px; height:70px; border-radius:50%; cursor:pointer;
    background:var(--tm-bg-card); border:2px dashed var(--tm-border);
    display:flex; align-items:center; justify-content:center; overflow:hidden;
    transition:border-color .2s; position:relative;
}
.cg-av-wrap:hover { border-color:var(--tm-accent); }
.cg-av-wrap img { width:100%; height:100%; object-fit:cover; }

/* ══ Mobile overrides ══ */
.is-mobile #tmv3-messages { padding:12px 14px; }
.is-mobile .tmv3-msg-wrap { max-width:88%; }
.is-mobile .tmv3-bubble { padding:12px 15px 9px; border-radius:18px; }
.is-mobile .tmv3-msg-av { width:40px; height:40px; }
.is-mobile .tmv3-msg-time { font-size:14px; }
.is-mobile #tmv3-input-area { padding:12px 14px; gap:10px; }
.is-mobile #tmv3-input-area label.tmv3-act-btn { width:54px; height:54px; font-size:26px; margin-bottom:2px; }
.is-mobile .tmv3-act-btn { width:54px; height:54px; font-size:22px; }
.is-mobile .tmv3-date-div span { font-size:16px; padding:7px 18px; }
.is-mobile .tmv3-sender { font-size:17px; }
.is-mobile .tmv3-reply-quote { font-size:16px; }
.is-mobile .tmv3-msg-img { max-width:220px; max-height:200px; }
.is-mobile #tmv3-typing { font-size:18px; padding:7px 18px; }
.is-mobile #tmv3-admin-banner { font-size:20px; padding:16px; }
.is-mobile .tmv3-sp-name { font-size:26px; }
.is-mobile .tmv3-sp-sub { font-size:18px; }
.is-mobile .tmv3-sp-row { padding:18px 16px; }
.is-mobile .tmv3-sp-row .label { font-size:20px; }
.is-mobile .tmv3-sp-row i { font-size:20px; }
.is-mobile .tmv3-member-name { font-size:20px; }
.is-mobile .tmv3-member-role { font-size:15px; }
.is-mobile .tmv3-modal-title { font-size:24px; }
.is-mobile .tmv3-input-group label { font-size:18px; }
.is-mobile .tmv3-input-group input, .is-mobile .tmv3-input-group textarea { font-size:22px; padding:15px 18px; }
.is-mobile .tmv3-btn { font-size:21px; padding:16px 28px; }
.is-mobile .tmv3-ctx-item { font-size:20px; padding:16px 22px; }
.is-mobile #tmv3-left-3dot { width:60px; height:60px; font-size:28px; }
`;
        document.head.appendChild(s);
    }

    /* ══════════════════════════════════════════════════════════
       BUILD MAIN UI
    ══════════════════════════════════════════════════════════ */
    function _buildMainUI() {
        if (document.getElementById('tmv3-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'tmv3-overlay';
        overlay.innerHTML = `
<div id="tmv3-root">

  <!-- LEFT PANEL -->
  <div id="tmv3-left">
    <div id="tmv3-left-header">
      <div id="tmv3-left-header-title">💬 চ্যাট</div>
      <div class="tmv3-dropdown">
        <button class="tmv3-icon-btn" id="tmv3-left-3dot" title="মেনু"><i class="fa fa-ellipsis-v"></i></button>
        <div class="tmv3-dropdown-menu" id="tmv3-left-menu">
          <div class="tmv3-dropdown-item" id="tmv3-btn-find-users"><i class="fa fa-search"></i> ইউজার খুঁজুন</div>
          <div class="tmv3-dropdown-item" id="tmv3-btn-new-group"><i class="fa fa-users"></i> নতুন গ্রুপ</div>
          <div class="tmv3-dropdown-item" id="tmv3-btn-profile"><i class="fa fa-user-circle"></i> প্রোফাইল</div>
        </div>
      </div>
      <button class="tmv3-icon-btn" id="tmv3-main-close-btn" title="বন্ধ করুন"><i class="fa fa-times"></i></button>
    </div>

    <div class="tmv3-search-wrap">
      <div class="tmv3-search-bar">
        <i class="fa fa-search"></i>
        <input type="text" id="tmv3-search" placeholder="চ্যাট বা ইউজার খুঁজুন...">
      </div>
    </div>
    <div id="tmv3-user-search-results"></div>

    <div class="tmv3-tabs">
      <button class="tmv3-tab active" data-tab="all">সব</button>
      <button class="tmv3-tab" data-tab="unread">অপঠিত</button>
      <button class="tmv3-tab" data-tab="groups">গ্রুপ</button>
    </div>

    <div id="tmv3-chat-list">
      <div class="tmv3-spinner"><i class="fa fa-circle-notch"></i></div>
    </div>
  </div>

  <!-- RIGHT PANEL -->
  <div id="tmv3-right">
    <div id="tmv3-empty-right">
      <div class="tmv3-empty-icon-wrap"><i class="fa fa-lock"></i></div>
      <p>আপনার মেসেজগুলো প্রাইভেট।<br>চ্যাট শুরু করতে একটি কথোপকথন বেছে নিন।</p>
    </div>

    <div id="tmv3-chat-header" style="display:none;">
      <button id="tmv3-back-btn"><i class="fa fa-arrow-left"></i></button>
      <div class="tmv3-avatar" id="tmv3-hdr-av" style="width:42px;height:42px;font-size:18px;"></div>
      <div id="tmv3-header-info">
        <div id="tmv3-header-name"></div>
        <div id="tmv3-header-sub"></div>
      </div>
      <div class="tmv3-header-actions-right">
        <div class="tmv3-dropdown" id="tmv3-chat-menu-wrap">
          <button class="tmv3-icon-btn" id="tmv3-chat-3dot"><i class="fa fa-ellipsis-v"></i></button>
          <div class="tmv3-dropdown-menu" id="tmv3-chat-menu">
            <div class="tmv3-dropdown-item" id="tmv3-btn-view-info"><i class="fa fa-info-circle"></i> বিস্তারিত দেখুন</div>
            <div class="tmv3-dropdown-item danger" id="tmv3-btn-clear-chat"><i class="fa fa-eraser"></i> চ্যাট মুছুন</div>
            <div class="tmv3-dropdown-item danger" id="tmv3-btn-delete-chat"><i class="fa fa-trash"></i> চ্যাট ডিলিট</div>
          </div>
        </div>
        <button id="tmv3-chat-close-btn" title="বন্ধ করুন">✕</button>
      </div>
    </div>

    <div id="tmv3-messages" style="display:none;"></div>

    <button id="tmv3-scroll-down" onclick="window._tmv3.scrollToBottom()">
      <i class="fa fa-chevron-down"></i>
    </button>

    <div id="tmv3-typing" style="display:none;"></div>
    <div id="tmv3-admin-banner">শুধু <strong style="color:var(--tm-accent);">এডমিন</strong> মেসেজ পাঠাতে পারবেন</div>

    <div id="tmv3-reply-bar">
      <div id="tmv3-reply-prev"></div>
      <button class="tmv3-act-btn" onclick="window._tmv3.cancelReply()"><i class="fa fa-times"></i></button>
    </div>
    <div id="tmv3-media-bar">
      <img id="tmv3-media-thumb" src="" alt="preview">
      <span style="color:var(--tm-text-muted);font-size:13px;flex:1;">ছবি পাঠানো হবে</span>
      <button class="tmv3-act-btn" style="color:#f87171;" onclick="window._tmv3.cancelMedia()"><i class="fa fa-trash"></i></button>
    </div>

    <div id="tmv3-input-area" style="display:none;">
      <label class="tmv3-act-btn" for="tmv3-img-input" title="ছবি পাঠান"><i class="fa fa-image"></i></label>
      <input type="file" id="tmv3-img-input" accept="image/*" style="display:none;">
      <textarea id="tmv3-msg-input" rows="1" placeholder="মেসেজ লিখুন..."></textarea>
      <button id="tmv3-send-btn"><i class="fa fa-paper-plane"></i></button>
    </div>
  </div>

  <!-- SIDE PANEL -->
  <div id="tmv3-side-panel"></div>
</div>

<!-- Context Menu -->
<div id="tmv3-ctx-menu">
  <div class="tmv3-ctx-item" id="tmv3-ctx-reply"><i class="fa fa-reply"></i> রিপ্লাই</div>
  <div class="tmv3-ctx-item" id="tmv3-ctx-copy"><i class="fa fa-copy"></i> কপি করুন</div>
  <div class="tmv3-ctx-item danger" id="tmv3-ctx-delete" style="display:none"><i class="fa fa-trash"></i> মুছুন</div>
</div>

<!-- Lightbox -->
<div id="tmv3-lightbox">
  <img id="tmv3-lb-img" src="" alt="">
  <button id="tmv3-lb-close"><i class="fa fa-times"></i></button>
</div>

<!-- Modal -->
<div id="tmv3-modal-overlay">
  <div id="tmv3-modal"></div>
</div>

<!-- Toast -->
<div id="tmv3-toast"></div>
`;
        document.body.appendChild(overlay);

        /* Mobile height fix */
        if (_isMobile) {
            function _fixMobileHeight() {
                const ov   = document.getElementById('tmv3-overlay');
                const root = document.getElementById('tmv3-root');
                if (!ov || !root) return;
                if (window.visualViewport) {
                    const vv = window.visualViewport;
                    ov.style.top = vv.offsetTop + 'px'; ov.style.left = vv.offsetLeft + 'px';
                    ov.style.width = vv.width + 'px'; ov.style.height = vv.height + 'px';
                    root.style.width = vv.width + 'px'; root.style.height = vv.height + 'px';
                } else {
                    ov.style.top = '0'; ov.style.left = '0';
                    ov.style.width = window.innerWidth + 'px'; ov.style.height = window.innerHeight + 'px';
                    root.style.width = window.innerWidth + 'px'; root.style.height = window.innerHeight + 'px';
                }
            }
            _fixMobileHeight();
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', _fixMobileHeight);
                window.visualViewport.addEventListener('scroll', _fixMobileHeight);
            }
            window.addEventListener('resize', _fixMobileHeight);
            window._tmFixMobileHeight = _fixMobileHeight;
        }

        _bindEvents();
    }

    /* ══════════════════════════════════════════════════════════
       EVENT BINDINGS
    ══════════════════════════════════════════════════════════ */
    function _bindEvents() {
        document.getElementById('tmv3-overlay').addEventListener('click', function (e) {
            if (e.target === this) _closeApp();
        });
        document.getElementById('tmv3-main-close-btn').addEventListener('click', function (e) {
            e.stopPropagation(); _closeApp();
        });
        document.getElementById('tmv3-back-btn').addEventListener('click', _closeActiveChat);
        document.getElementById('tmv3-chat-close-btn').addEventListener('click', function (e) {
            e.stopPropagation(); _closeActiveChat();
        });

        /* Left 3-dot */
        document.getElementById('tmv3-left-3dot').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('tmv3-left-menu').classList.toggle('open');
        });
        document.getElementById('tmv3-btn-find-users').addEventListener('click', function () {
            document.getElementById('tmv3-left-menu').classList.remove('open');
            _showFindUsersModal();
        });
        document.getElementById('tmv3-btn-new-group').addEventListener('click', function () {
            document.getElementById('tmv3-left-menu').classList.remove('open');
            _showCreateGroupModal();
        });
        document.getElementById('tmv3-btn-profile').addEventListener('click', function () {
            document.getElementById('tmv3-left-menu').classList.remove('open');
            _showProfilePanel();
        });

        /* Chat 3-dot */
        document.getElementById('tmv3-chat-3dot').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('tmv3-chat-menu').classList.toggle('open');
        });
        document.getElementById('tmv3-btn-view-info').addEventListener('click', function () {
            document.getElementById('tmv3-chat-menu').classList.remove('open');
            if (_activeChat) _showInfoPanel(_activeChat);
        });
        document.getElementById('tmv3-btn-clear-chat').addEventListener('click', function () {
            document.getElementById('tmv3-chat-menu').classList.remove('open');
            _clearChat();
        });
        document.getElementById('tmv3-btn-delete-chat').addEventListener('click', function () {
            document.getElementById('tmv3-chat-menu').classList.remove('open');
            _deleteChat();
        });

        /* Chat header click */
        document.getElementById('tmv3-chat-header').addEventListener('click', function (e) {
            if (e.target.closest('.tmv3-icon-btn') || e.target.closest('#tmv3-back-btn')) return;
            if (_activeChat) _showInfoPanel(_activeChat);
        });

        /* Tabs */
        document.querySelectorAll('.tmv3-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.tmv3-tab').forEach(function (b) { b.classList.remove('active'); });
                this.classList.add('active');
                _activeTab = this.dataset.tab;
                _renderChatList();
            });
        });

        /* Search */
        const searchInp = document.getElementById('tmv3-search');
        searchInp.addEventListener('input', function () {
            const q = this.value.trim();
            _searchQuery = q;
            _renderChatList();
            if (q.length >= 1) _searchUsersInMain(q);
            else _hideUserSearchResults();
        });

        /* Send */
        document.getElementById('tmv3-send-btn').addEventListener('click', _sendMessage);

        /* Textarea */
        const ta = document.getElementById('tmv3-msg-input');
        ta.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 130) + 'px';
            _sendTyping();
        });
        ta.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
        });

        /* Image input */
        document.getElementById('tmv3-img-input').addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                _mediaPreview = e.target.result;
                document.getElementById('tmv3-media-thumb').src = _mediaPreview;
                document.getElementById('tmv3-media-bar').classList.add('show');
            };
            reader.readAsDataURL(this.files[0]);
            this.value = '';
        });

        /* Scroll */
        document.getElementById('tmv3-messages').addEventListener('scroll', function () {
            _isAtBottom = (this.scrollHeight - this.scrollTop - this.clientHeight) < 60;
            document.getElementById('tmv3-scroll-down').classList.toggle('show', !_isAtBottom);
        });

        /* Close dropdowns on click outside */
        document.addEventListener('click', function () {
            document.getElementById('tmv3-ctx-menu').style.display = 'none';
            document.querySelectorAll('.tmv3-dropdown-menu').forEach(function (m) { m.classList.remove('open'); });
        });

        /* Lightbox */
        document.getElementById('tmv3-lightbox').addEventListener('click', function (e) {
            if (e.target === this) this.classList.remove('open');
        });
        document.getElementById('tmv3-lb-close').addEventListener('click', function () {
            document.getElementById('tmv3-lightbox').classList.remove('open');
        });

        /* Modal backdrop */
        document.getElementById('tmv3-modal-overlay').addEventListener('click', function (e) {
            if (e.target === this) _closeModal();
        });
    }

    /* ══════════════════════════════════════════════════════════
       OPEN / CLOSE APP
    ══════════════════════════════════════════════════════════ */
    function _openApp() {
        _currentUser = _getSessionUser();
        if (!_currentUser) { _toast('চ্যাট করতে লগইন করুন।'); return; }
        document.getElementById('tmv3-overlay').classList.add('open');
        if (_isMobile && typeof window._tmFixMobileHeight === 'function') {
            window._tmFixMobileHeight();
            setTimeout(window._tmFixMobileHeight, 100);
        }
        if (!_db && typeof window._getChatDBAsync === 'function') {
            window._getChatDBAsync().then(function (db) {
                if (db) { _db = db; }
                _loadChatList(); _ensurePublicGroup();
            });
        } else {
            if (!_db && typeof window._getChatDB === 'function') _db = window._getChatDB();
            _loadChatList();
        }
    }

    function _closeApp() {
        document.getElementById('tmv3-overlay').classList.remove('open');
        _unsubscribeAll();
    }

    function _unsubscribeAll() {
        if (_unsubMsg)    { _unsubMsg();    _unsubMsg    = null; }
        if (_unsubTyping) { _unsubTyping(); _unsubTyping = null; }
        if (_typingTimer) { clearTimeout(_typingTimer); }
        _clearTypingDoc();
    }

    /* ══════════════════════════════════════════════════════════
       CHAT LIST
    ══════════════════════════════════════════════════════════ */
    function _loadChatList() {
        if (!_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        let _latestGroups   = null;
        let _latestPersonals = null;

        function _mergeAndRender() {
            if (_latestGroups === null || _latestPersonals === null) return;
            const hasPublic = _latestGroups.some(function (g) { return g.id === PUBLIC_GROUP_ID; });
            if (!hasPublic) {
                _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).get().then(function (doc) {
                    let groups = _latestGroups;
                    if (doc.exists) {
                        const pubGroup = Object.assign({ id: doc.id, type: 'group' }, doc.data());
                        _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).update({
                            members: firebase.firestore.FieldValue.arrayUnion(uid)
                        }).catch(function () {});
                        groups = [pubGroup].concat(_latestGroups);
                    }
                    _doRender(groups, _latestPersonals);
                }).catch(function () { _doRender(_latestGroups, _latestPersonals); });
                return;
            }
            _doRender(_latestGroups, _latestPersonals);
        }

        function _doRender(groups, personals) {
            const combined = groups.concat(personals);
            combined.sort(function (a, b) {
                const ta = a.lastMsgTs ? (a.lastMsgTs.toDate ? a.lastMsgTs.toDate() : new Date(a.lastMsgTs)) : new Date(0);
                const tb = b.lastMsgTs ? (b.lastMsgTs.toDate ? b.lastMsgTs.toDate() : new Date(b.lastMsgTs)) : new Date(0);
                return tb - ta;
            });
            const pubIdx = combined.findIndex(function (c) { return c.id === PUBLIC_GROUP_ID; });
            if (pubIdx > 0) { const [pub] = combined.splice(pubIdx, 1); combined.unshift(pub); }

            if (!_chatListReady) {
                combined.forEach(function (chat) {
                    const ts = chat.lastMsgTs ? (chat.lastMsgTs.toDate ? chat.lastMsgTs.toDate().getTime() : new Date(chat.lastMsgTs).getTime()) : 0;
                    if (_lastMsgTsMap[chat.id] === undefined) _lastMsgTsMap[chat.id] = ts;
                });
                _chatListReady = true;
            } else {
                combined.forEach(function (chat) {
                    const ts = chat.lastMsgTs ? (chat.lastMsgTs.toDate ? chat.lastMsgTs.toDate().getTime() : new Date(chat.lastMsgTs).getTime()) : 0;
                    const prev = _lastMsgTsMap[chat.id] || 0;
                    if (ts > prev) {
                        _lastMsgTsMap[chat.id] = ts;
                        if (!_activeChat || _activeChat.id !== chat.id) {
                            _unreadMap[chat.id] = (_unreadMap[chat.id] || 0) + 1;
                        }
                    }
                });
            }
            _chatList = combined;
            _renderChatList();
        }

        _db.collection('tm_groups').where('members', 'array-contains', uid)
            .onSnapshot(function (snap) {
                _latestGroups = snap.docs.map(function (doc) {
                    return Object.assign({ id: doc.id, type: 'group' }, doc.data());
                });
                _mergeAndRender();
            }, function () { if (_latestGroups === null) { _latestGroups = []; _mergeAndRender(); } });

        _db.collection('tm_personal_chats').where('members', 'array-contains', uid)
            .onSnapshot(function (psnap) {
                _latestPersonals = psnap.docs.map(function (doc) {
                    return Object.assign({ id: doc.id, type: 'personal' }, doc.data());
                });
                _mergeAndRender();
            }, function () { if (_latestPersonals === null) { _latestPersonals = []; _mergeAndRender(); } });
    }

    function _renderChatList() {
        const list = document.getElementById('tmv3-chat-list');
        if (!list) return;
        let filtered = _chatList.slice();

        if (_activeTab === 'unread') filtered = filtered.filter(function (c) { return (_unreadMap[c.id] || 0) > 0; });
        else if (_activeTab === 'groups') filtered = filtered.filter(function (c) { return c.type === 'group'; });

        if (_searchQuery) {
            const q = _searchQuery.toLowerCase();
            filtered = filtered.filter(function (c) {
                if (c.type === 'personal' && c.memberInfo && _currentUser) {
                    const uid   = String(_currentUser.id);
                    const oUid  = Object.keys(c.memberInfo).find(function (k) { return k !== uid; });
                    const oName = oUid ? (c.memberInfo[oUid].name || '').toLowerCase() : '';
                    if (oName && oName.includes(q)) return true;
                }
                return (c.name || c.displayName || '').toLowerCase().includes(q);
            });
        }

        if (!filtered.length) {
            list.innerHTML = '<div class="tmv3-empty-msg">কোনো চ্যাট নেই</div>';
            return;
        }

        list.innerHTML = '';
        filtered.forEach(function (chat) {
            const item     = document.createElement('div');
            const isGroup  = chat.type === 'group';
            const isPublic = chat.isPublic;
            const unread   = _unreadMap[chat.id] || 0;

            let name;
            if (!isGroup && chat.memberInfo && _currentUser) {
                const uid  = String(_currentUser.id);
                const oUid = Object.keys(chat.memberInfo).find(function (k) { return k !== uid; });
                name = oUid ? (chat.memberInfo[oUid].name || 'User') : (chat.name || 'Chat');
            } else {
                name = chat.name || chat.displayName || 'Chat';
            }
            const avatar  = chat.avatarData || chat.avatarUrl || '';
            const lastMsg = chat.lastMsg || '';
            const lastTs  = chat.lastMsgTs ? _formatTime(chat.lastMsgTs.toDate ? chat.lastMsgTs.toDate() : new Date(chat.lastMsgTs)) : '';
            let avClass   = 'tmv3-avatar' + (isPublic ? ' public' : isGroup ? ' group' : '');
            const avHtml  = avatar ? `<img src="${avatar}" alt="">` : (isGroup ? '👥' : '👤');

            item.className = 'tmv3-chat-item' + (_activeChat && _activeChat.id === chat.id ? ' active' : '');
            item.dataset.id = chat.id;
            item.innerHTML = `
                <div class="${avClass}">${avHtml}</div>
                <div class="tmv3-chat-info">
                    <div class="tmv3-chat-name${unread > 0 ? ' has-unread' : ''}">${_esc(name)}</div>
                    <div class="tmv3-chat-preview${unread > 0 ? ' has-unread' : ''}">${_esc(lastMsg)}</div>
                </div>
                <div class="tmv3-chat-meta">
                    <div class="tmv3-chat-time${unread > 0 ? ' has-unread' : ''}">${lastTs}</div>
                    ${unread > 0 ? `<div class="tmv3-unread-badge">${unread > 99 ? '99+' : unread}</div>` : ''}
                </div>
            `;
            item.addEventListener('click', function () { _openChat(chat); });
            list.appendChild(item);
        });

        /* Unread badge update */
        const total = Object.values(_unreadMap).reduce(function (a, b) { return a + b; }, 0);
        ['tmv3-badge-pc', 'tmv3-badge-mob'].forEach(function (id) {
            const el = document.getElementById(id);
            if (!el) return;
            if (total > 0) { el.textContent = total > 99 ? '99+' : String(total); el.classList.add('show'); }
            else { el.textContent = ''; el.classList.remove('show'); }
        });
    }

    /* ══════════════════════════════════════════════════════════
       USER SEARCH
    ══════════════════════════════════════════════════════════ */
    let _userSearchTimer = null;
    function _searchUsersInMain(q) {
        clearTimeout(_userSearchTimer);
        _userSearchTimer = setTimeout(function () {
            const resultBox = document.getElementById('tmv3-user-search-results');
            if (!resultBox) return;
            resultBox.innerHTML = '<div class="tmv3-usr-search-loading"><i class="fa fa-spinner fa-spin"></i> খুঁজছি...</div>';
            resultBox.style.display = 'block';
            if (!_db) { resultBox.style.display = 'none'; return; }

            let allUsers = [];
            try { const raw = localStorage.getItem('TM_USERS'); if (raw) allUsers = JSON.parse(raw); } catch (e) {}

            const ql = q.toLowerCase();
            const localMatches = allUsers.filter(function (u) {
                return (u.name || u.fullName || '').toLowerCase().includes(ql) ||
                       (u.email || '').toLowerCase().includes(ql) ||
                       (u.phone || u.mobile || '').toLowerCase().includes(ql);
            });

            const usDb = (function () {
                try { if (window._TM_FB_DBS && window._TM_FB_DBS['fb1_users']) return window._TM_FB_DBS['fb1_users']; } catch (e) {}
                try { if (typeof window._getDBForCollection === 'function') { const d = window._getDBForCollection('users'); if (d) return d; } } catch (e) {}
                return _db;
            })();

            usDb.collection('users').get().then(function (snap) {
                const fbUsers = [];
                snap.forEach(function (doc) {
                    const d = doc.data();
                    const name  = (d.name || d.fullName || '').toLowerCase();
                    const email = (d.email || '').toLowerCase();
                    const phone = (d.phone || d.mobile || '').toLowerCase();
                    if (name.includes(ql) || email.includes(ql) || phone.includes(ql)) {
                        fbUsers.push({ id: doc.id, name: d.name || d.fullName || doc.id, email: d.email || '', phone: d.phone || '', avatar: d.avatarData || d.avatar || '' });
                    }
                });
                let merged = fbUsers.slice();
                localMatches.forEach(function (lu) {
                    if (!merged.find(function (fu) { return String(fu.id) === String(lu.id); })) {
                        merged.push({ id: lu.id, name: lu.name || String(lu.id), email: lu.email || '', phone: lu.phone || '', avatar: lu.avatarData || lu.avatar || '' });
                    }
                });
                if (_currentUser) merged = merged.filter(function (u) { return String(u.id) !== String(_currentUser.id); });
                merged = merged.filter(function (u) { return u.accountLocked !== true && u.accountLocked !== 'true'; });
                _renderUserSearchResults(merged, resultBox);
            }).catch(function () {
                const filtered = localMatches.filter(function (u) {
                    return !_currentUser || String(u.id) !== String(_currentUser.id);
                });
                _renderUserSearchResults(filtered.map(function (u) {
                    return { id: u.id, name: u.name || String(u.id), email: u.email || '', avatar: u.avatarData || u.avatar || '' };
                }), resultBox);
            });
        }, 350);
    }

    function _renderUserSearchResults(users, resultBox) {
        if (!users || !users.length) { resultBox.style.display = 'none'; return; }
        let html = '<div class="tmv3-usr-srch-label">👤 ইউজার পাওয়া গেছে</div>';
        users.slice(0, 8).forEach(function (u) {
            const av  = u.avatar ? `<img src="${u.avatar}" alt="">` : '👤';
            const sub = u.email || u.phone || '';
            html += `<div class="tmv3-usr-srch-item" data-uid="${_esc(String(u.id))}">
                <div class="tmv3-usr-srch-av">${av}</div>
                <div class="tmv3-usr-srch-info">
                    <div class="tmv3-usr-srch-name">${_esc(u.name)}</div>
                    ${sub ? `<div class="tmv3-usr-srch-sub">${_esc(sub)}</div>` : ''}
                </div>
                <div class="tmv3-usr-srch-action"><i class="fa fa-comment"></i> চ্যাট</div>
            </div>`;
        });
        resultBox.innerHTML = html;
        resultBox.style.display = 'block';
        resultBox.querySelectorAll('.tmv3-usr-srch-item').forEach(function (item) {
            item.addEventListener('click', function () {
                const uid = this.dataset.uid;
                const user = users.find(function (u) { return String(u.id) === uid; });
                if (user) { _hideUserSearchResults(); document.getElementById('tmv3-search').value = ''; _searchQuery = ''; _openPersonalChat(user); }
            });
        });
    }

    function _hideUserSearchResults() {
        const box = document.getElementById('tmv3-user-search-results');
        if (box) box.style.display = 'none';
    }

    /* ══════════════════════════════════════════════════════════
       OPEN CHAT
    ══════════════════════════════════════════════════════════ */
    function _openChat(chat) {
        _activeChat = chat;
        _unsubscribeAll();
        _isAtBottom = true; _replyTarget = null; _mediaPreview = null;

        document.querySelectorAll('.tmv3-chat-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.id === chat.id);
        });

        const right = document.getElementById('tmv3-right');
        right.querySelector('#tmv3-empty-right').style.display = 'none';
        document.getElementById('tmv3-chat-header').style.display = 'flex';
        document.getElementById('tmv3-messages').style.display   = 'flex';
        document.getElementById('tmv3-typing').style.display     = 'flex';

        if (_isMobile) {
            document.getElementById('tmv3-left').classList.add('hidden');
            right.classList.add('open');
        }

        const isGroup = chat.type === 'group';
        let name;
        if (!isGroup && chat.memberInfo && _currentUser) {
            const uid  = String(_currentUser.id);
            const oUid = Object.keys(chat.memberInfo).find(function (k) { return k !== uid; });
            name = oUid ? (chat.memberInfo[oUid].name || 'User') : (chat.name || 'Chat');
        } else { name = chat.name || chat.displayName || 'Chat'; }

        const avatar = chat.avatarData || chat.avatarUrl || '';
        const hdrAv  = document.getElementById('tmv3-hdr-av');
        hdrAv.className = 'tmv3-avatar' + (chat.isPublic ? ' public' : isGroup ? ' group' : '');
        hdrAv.style.cssText = 'width:42px;height:42px;font-size:18px;flex-shrink:0;';
        hdrAv.innerHTML = avatar ? `<img src="${avatar}" alt="">` : (isGroup ? '👥' : '👤');
        document.getElementById('tmv3-header-name').textContent = name;
        document.getElementById('tmv3-header-sub').textContent  = isGroup ? ((chat.members ? chat.members.length : 0) + ' জন সদস্য') : 'online';

        document.getElementById('tmv3-reply-bar').classList.remove('show');
        document.getElementById('tmv3-media-bar').classList.remove('show');
        _checkSendPermission(chat);
        _subscribeMessages(chat);
        _unreadMap[chat.id] = 0;
        _renderChatList();
    }

    function _closeActiveChat() {
        _activeChat = null;
        _unsubscribeAll();
        if (_isMobile) {
            document.getElementById('tmv3-left').classList.remove('hidden');
            document.getElementById('tmv3-right').classList.remove('open');
        }
        document.getElementById('tmv3-chat-header').style.display = 'none';
        document.getElementById('tmv3-messages').style.display    = 'none';
        document.getElementById('tmv3-typing').style.display      = 'none';
        document.getElementById('tmv3-input-area').style.display  = 'none';
        document.getElementById('tmv3-admin-banner').classList.remove('show');
        document.getElementById('tmv3-empty-right').style.display = 'flex';
        _closeSidePanel();
    }

    function _checkSendPermission(chat) {
        const banner    = document.getElementById('tmv3-admin-banner');
        const inputArea = document.getElementById('tmv3-input-area');
        if (chat.type === 'group' && chat.allowMemberMsg === false) {
            const uid = String(_currentUser.id);
            const isAdmin = chat.adminId === uid || _currentUser.role === 'admin';
            if (!isAdmin) { banner.classList.add('show'); inputArea.style.display = 'none'; return; }
        }
        banner.classList.remove('show');
        inputArea.style.display = 'flex';
    }

    /* ══════════════════════════════════════════════════════════
       MESSAGES
    ══════════════════════════════════════════════════════════ */
    function _getMessagesPath(chat) {
        if (chat.type === 'group') return _db.collection('tm_groups').doc(chat.id).collection('messages');
        return _db.collection('tm_personal_chats').doc(chat.id).collection('messages');
    }

    function _subscribeMessages(chat) {
        if (!_db) return;
        const area = document.getElementById('tmv3-messages');
        area.innerHTML = '<div class="tmv3-spinner"><i class="fa fa-circle-notch"></i></div>';
        _unsubMsg = _getMessagesPath(chat).orderBy('ts', 'asc').limitToLast(MAX_MSG)
            .onSnapshot(function (snap) {
                _renderMessages(snap.docs, chat);
                _listenTyping(chat);
                _markSeen(snap.docs, chat);
            }, function () {
                area.innerHTML = '<div class="tmv3-empty-msg">মেসেজ লোড করতে সমস্যা হচ্ছে।</div>';
            });
    }

    function _renderMessages(docs, chat) {
        const area = document.getElementById('tmv3-messages');
        if (!area) return;
        _lastMsgDate = null;
        if (!docs.length) {
            area.innerHTML = '<div class="tmv3-empty-msg" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;"><i class="fa fa-comments" style="font-size:48px;opacity:.15;color:var(--tm-accent);"></i><p>এখনো কোনো মেসেজ নেই।<br>প্রথম মেসেজ পাঠান! 👋</p></div>';
            return;
        }
        const frag = document.createDocumentFragment();
        docs.forEach(function (doc) { frag.appendChild(_createMsgEl(doc.id, doc.data())); });
        area.innerHTML = '';
        area.appendChild(frag);
        if (_isAtBottom) area.scrollTop = area.scrollHeight;
    }

    function _createMsgEl(docId, data) {
        const frag  = document.createDocumentFragment();
        const isOwn = _currentUser && String(data.senderId) === String(_currentUser.id);

        if (data.ts) {
            const d  = data.ts.toDate ? data.ts.toDate() : new Date(data.ts);
            const ds = _formatDate(d);
            if (ds !== _lastMsgDate) {
                _lastMsgDate = ds;
                const div = document.createElement('div');
                div.className = 'tmv3-date-div';
                div.innerHTML = `<span>${ds}</span>`;
                frag.appendChild(div);
            }
        }

        const wrap = document.createElement('div');
        wrap.className = 'tmv3-msg-wrap ' + (isOwn ? 'own' : 'other');
        wrap.dataset.id = docId;

        const av = document.createElement('div');
        av.className = 'tmv3-msg-av';
        av.innerHTML = data.senderAvatar ? `<img src="${data.senderAvatar}" alt="">` : '<i class="fa fa-user"></i>';

        const bubble = document.createElement('div');
        bubble.className = 'tmv3-bubble';

        if (!isOwn) {
            const nameEl = document.createElement('div');
            nameEl.className = 'tmv3-sender';
            nameEl.style.color = _nameColor(data.senderId);
            nameEl.textContent = data.senderName || 'User';
            bubble.appendChild(nameEl);
        }

        if (data.replyTo) {
            const q = document.createElement('div');
            q.className = 'tmv3-reply-quote';
            q.innerHTML = `<strong>${_esc(data.replyTo.senderName || '')}</strong>${_esc(data.replyTo.text || '📷 ছবি')}`;
            bubble.appendChild(q);
        }

        if (data.imgData || data.imgUrl) {
            const img = document.createElement('img');
            img.className = 'tmv3-msg-img';
            const src = data.imgUrl || data.imgData;
            img.src = src; img.alt = '📷'; img.loading = 'lazy';
            img.addEventListener('click', function () { _openLightbox(src); });
            bubble.appendChild(img);
        }

        if (data.text) {
            const txt = document.createElement('div');
            txt.className = 'tmv3-msg-text';
            txt.textContent = data.text;
            bubble.appendChild(txt);
        }

        const timeRow = document.createElement('div');
        timeRow.className = 'tmv3-msg-time';
        const ts = data.ts ? (data.ts.toDate ? data.ts.toDate() : new Date(data.ts)) : new Date();
        timeRow.textContent = _formatTime(ts);
        if (isOwn) {
            const seen = data.seenBy && data.seenBy.length > 1;
            const tick = document.createElement('span');
            tick.className = 'tmv3-tick' + (seen ? ' seen' : '');
            tick.textContent = ' ✓✓';
            timeRow.appendChild(tick);
        }
        bubble.appendChild(timeRow);

        wrap.innerHTML = '';
        if (isOwn) { wrap.appendChild(bubble); wrap.appendChild(av); }
        else       { wrap.appendChild(av); wrap.appendChild(bubble); }

        _bindCtxMenu(wrap, docId, data, isOwn);
        frag.appendChild(wrap);
        return frag;
    }

    function _bindCtxMenu(el, docId, data, isOwn) {
        let timer;
        function show(x, y) {
            const menu = document.getElementById('tmv3-ctx-menu');
            document.getElementById('tmv3-ctx-reply').onclick = function () {
                menu.style.display = 'none';
                _replyTarget = { id: docId, senderName: data.senderName || 'User', text: data.text || '📷 ছবি' };
                document.getElementById('tmv3-reply-prev').innerHTML = `<strong>${_esc(_replyTarget.senderName)}</strong> ${_esc(_replyTarget.text)}`;
                document.getElementById('tmv3-reply-bar').classList.add('show');
                document.getElementById('tmv3-msg-input').focus();
            };
            document.getElementById('tmv3-ctx-copy').onclick = function () {
                menu.style.display = 'none';
                if (data.text) navigator.clipboard.writeText(data.text).catch(function () {});
            };
            const delBtn = document.getElementById('tmv3-ctx-delete');
            delBtn.style.display = isOwn ? 'flex' : 'none';
            delBtn.onclick = function () { menu.style.display = 'none'; _deleteMsg(docId); };
            menu.style.cssText = `display:block;left:${Math.min(x, window.innerWidth - 180)}px;top:${Math.min(y, window.innerHeight - 130)}px;`;
        }
        el.addEventListener('contextmenu', function (e) { e.preventDefault(); show(e.clientX, e.clientY); });
        el.addEventListener('touchstart', function (e) { timer = setTimeout(function () { show(e.touches[0].clientX, e.touches[0].clientY); }, 600); }, { passive: true });
        el.addEventListener('touchend',  function () { clearTimeout(timer); });
        el.addEventListener('touchmove', function () { clearTimeout(timer); });
    }

    /* ══════════════════════════════════════════════════════════
       SEND MESSAGE
    ══════════════════════════════════════════════════════════ */
    function _sendMessage() {
        if (!_db || !_currentUser || !_activeChat) return;
        const ta   = document.getElementById('tmv3-msg-input');
        const text = ta.value.trim();
        if (!text && !_mediaPreview) return;

        const chat = _activeChat;
        if (chat.type === 'group' && chat.allowMemberMsg === false) {
            const uid = String(_currentUser.id);
            if (chat.adminId !== uid && _currentUser.role !== 'admin') { _toast('শুধু এডমিন মেসেজ পাঠাতে পারবেন।'); return; }
        }

        if (_mediaPreview) {
            const sendBtn = document.getElementById('tmv3-send-btn');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; }
            _toast('ছবি আপলোড হচ্ছে...');
            const base64 = _mediaPreview.includes(',') ? _mediaPreview.split(',')[1] : _mediaPreview;
            const fd = new FormData();
            fd.append('image', base64);
            fetch('https://api.imgbb.com/1/upload?key=5be9029fcab9d8ab514eeeb3563af84d', { method: 'POST', body: fd })
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    if (!json.success) throw new Error('fail');
                    _doSendMessage(text, json.data.display_url || json.data.url);
                })
                .catch(function () {
                    _toast('❌ ছবি আপলোড ব্যর্থ! আবার চেষ্টা করুন।');
                    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>'; }
                });
            return;
        }
        _doSendMessage(text, null);
    }

    function _doSendMessage(text, imgUrl) {
        const chat    = _activeChat;
        const ta      = document.getElementById('tmv3-msg-input');
        const sendBtn = document.getElementById('tmv3-send-btn');
        const now     = new Date();
        const expireAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

        const msg = {
            text:        text,
            senderId:    String(_currentUser.id),
            senderName:  _currentUser.name || _currentUser.email || String(_currentUser.id),
            senderAvatar: _currentUser.avatar || _currentUser.profileImage || '',
            ts:          firebase.firestore.FieldValue.serverTimestamp(),
            seenBy:      [String(_currentUser.id)],
            expireAt:    firebase.firestore.Timestamp.fromDate(expireAt)
        };
        if (_replyTarget) msg.replyTo = { id: _replyTarget.id, senderName: _replyTarget.senderName, text: _replyTarget.text };
        if (imgUrl) msg.imgUrl = imgUrl;

        const lastMsg = text || '📷 ছবি';
        _getMessagesPath(chat).add(msg).then(function () {
            ta.value = ''; ta.style.height = 'auto';
            _cancelReply(); _cancelMedia(); _clearTypingDoc();
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>'; }
            const ref = chat.type === 'group'
                ? _db.collection('tm_groups').doc(chat.id)
                : _db.collection('tm_personal_chats').doc(chat.id);
            ref.update({ lastMsg, lastMsgTs: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
            setTimeout(function () {
                const area = document.getElementById('tmv3-messages');
                if (area) { area.scrollTop = area.scrollHeight; _isAtBottom = true; }
            }, 100);
        }).catch(function (err) {
            console.error('[send]', err);
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>'; }
        });
    }

    function _deleteMsg(docId) {
        if (!_db || !_activeChat) return;
        if (!confirm('এই মেসেজ মুছে ফেলবেন?')) return;
        _getMessagesPath(_activeChat).doc(docId).delete();
    }

    function _markSeen(docs, chat) {
        if (!_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        docs.forEach(function (doc) {
            const d = doc.data();
            if (d.senderId !== uid && (!d.seenBy || !d.seenBy.includes(uid))) {
                doc.ref.update({ seenBy: firebase.firestore.FieldValue.arrayUnion(uid) }).catch(function () {});
            }
        });
    }

    function _clearChat() {
        if (!_db || !_activeChat) return;
        if (!confirm('এই চ্যাটের সব মেসেজ ক্লিয়ার করবেন?')) return;
        _getMessagesPath(_activeChat).get().then(function (snap) {
            const batch = _db.batch();
            snap.docs.forEach(function (doc) { batch.delete(doc.ref); });
            return batch.commit();
        }).then(function () { _toast('চ্যাট ক্লিয়ার হয়েছে ✅'); }).catch(function () {});
    }

    function _deleteChat() {
        if (!_db || !_activeChat) return;
        const chat = _activeChat;
        if (chat.type === 'group' && chat.isPublic) { _toast('সাবজনীন গ্রুপ মুছতে পারবেন না।'); return; }
        if (!confirm('পুরো চ্যাট ডিলিট করবেন?')) return;
        if (chat.type === 'group') {
            _db.collection('tm_groups').doc(chat.id).update({
                members: firebase.firestore.FieldValue.arrayRemove(String(_currentUser.id))
            }).then(function () { _closeActiveChat(); _toast('গ্রুপ থেকে বের হয়েছেন ✅'); }).catch(function () {});
        } else {
            _db.collection('tm_personal_chats').doc(chat.id).delete()
                .then(function () { _closeActiveChat(); _toast('চ্যাট ডিলিট হয়েছে ✅'); }).catch(function () {});
        }
    }

    /* ══════════════════════════════════════════════════════════
       TYPING INDICATOR
    ══════════════════════════════════════════════════════════ */
    function _sendTyping() {
        if (!_db || !_currentUser || !_activeChat) return;
        const uid  = String(_currentUser.id);
        const name = _currentUser.name || 'User';
        const ref  = _activeChat.type === 'group'
            ? _db.collection('tm_groups').doc(_activeChat.id).collection('typing').doc(uid)
            : _db.collection('tm_personal_chats').doc(_activeChat.id).collection('typing').doc(uid);
        ref.set({ name, ts: Date.now() }).catch(function () {});
        clearTimeout(_typingTimer);
        _typingTimer = setTimeout(_clearTypingDoc, TYPING_TTL);
    }

    function _clearTypingDoc() {
        if (!_db || !_currentUser || !_activeChat) return;
        const uid = String(_currentUser.id);
        const ref = _activeChat.type === 'group'
            ? _db.collection('tm_groups').doc(_activeChat.id).collection('typing').doc(uid)
            : _db.collection('tm_personal_chats').doc(_activeChat.id).collection('typing').doc(uid);
        ref.delete().catch(function () {});
    }

    function _listenTyping(chat) {
        if (_unsubTyping) { _unsubTyping(); _unsubTyping = null; }
        const uid    = String(_currentUser.id);
        const typCol = chat.type === 'group'
            ? _db.collection('tm_groups').doc(chat.id).collection('typing')
            : _db.collection('tm_personal_chats').doc(chat.id).collection('typing');
        _unsubTyping = typCol.onSnapshot(function (snap) {
            const now     = Date.now();
            const typers  = [];
            snap.docs.forEach(function (doc) {
                if (doc.id === uid) return;
                const d = doc.data();
                if (now - d.ts < TYPING_TTL) typers.push(d.name || 'User');
            });
            const el = document.getElementById('tmv3-typing');
            if (!el) return;
            if (typers.length) {
                el.innerHTML = `<div class="tmv3-typing-dots"><span></span><span></span><span></span></div><span>${_esc(typers.join(', '))} টাইপ করছেন...</span>`;
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        }, function () {});
    }

    /* ══════════════════════════════════════════════════════════
       CREATE GROUP
    ══════════════════════════════════════════════════════════ */
    function _showCreateGroupModal() {
        _openModal(`
            <div class="tmv3-modal-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-times"></i></button>
                <span class="tmv3-modal-title">নতুন গ্রুপ</span>
            </div>
            <div class="tmv3-modal-body">
                <div style="display:flex;justify-content:center;margin-bottom:18px;">
                    <label class="cg-av-wrap" id="cg-av-label">
                        <i class="fa fa-camera" style="font-size:28px;color:var(--tm-text-muted);"></i>
                        <img id="cg-av-img" src="" alt="" style="display:none;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
                        <input type="file" id="cg-av-input" accept="image/*" style="display:none;">
                    </label>
                </div>
                <div class="tmv3-input-group">
                    <label>গ্রুপের নাম</label>
                    <input type="text" id="cg-name" placeholder="যেমন: আমার গ্রুপ">
                </div>
                <div class="tmv3-input-group">
                    <label>বিবরণ (ঐচ্ছিক)</label>
                    <textarea id="cg-desc" placeholder="গ্রুপের সম্পর্কে লিখুন..."></textarea>
                </div>
            </div>
            <div class="tmv3-modal-footer">
                <button class="tmv3-btn secondary" onclick="window._tmv3._closeModal()">বাতিল</button>
                <button class="tmv3-btn primary" id="cg-next-btn"><i class="fa fa-users"></i> তৈরি করুন</button>
            </div>
        `);

        let cgAvData = '';
        document.getElementById('cg-av-input').addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const r = new FileReader();
            r.onload = function (e) {
                cgAvData = e.target.result;
                const img = document.getElementById('cg-av-img');
                img.src = cgAvData; img.style.display = 'block';
                document.getElementById('cg-av-label').querySelector('i').style.display = 'none';
            };
            r.readAsDataURL(this.files[0]);
            this.value = '';
        });
        document.getElementById('cg-av-label').addEventListener('click', function () {
            document.getElementById('cg-av-input').click();
        });
        document.getElementById('cg-next-btn').addEventListener('click', function () {
            const name = document.getElementById('cg-name').value.trim();
            if (!name) { _toast('গ্রুপের নাম দিন।'); return; }
            const desc = document.getElementById('cg-desc').value.trim();
            _createGroup(name, desc, cgAvData);
        });
    }

    function _createGroup(name, desc, avatarData) {
        if (!_db || !_currentUser) return;
        const uid       = String(_currentUser.id);
        const groupData = {
            name, desc, avatarData: avatarData || '', isPublic: false,
            adminId: uid, members: [uid],
            allowMemberAdd: false, allowMemberMsg: true,
            createdBy: uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMsg: '', lastMsgTs: firebase.firestore.FieldValue.serverTimestamp()
        };
        _db.collection('tm_groups').add(groupData).then(function (ref) {
            _closeModal();
            _toast('গ্রুপ তৈরি হয়েছে! 🎉');
            setTimeout(function () { _openChat(Object.assign({ id: ref.id, type: 'group' }, groupData)); }, 500);
        }).catch(function () { _toast('গ্রুপ তৈরিতে সমস্যা হয়েছে।'); });
    }

    /* ══════════════════════════════════════════════════════════
       PERSONAL CHAT
    ══════════════════════════════════════════════════════════ */
    function _openPersonalChat(otherUser) {
        if (!_db || !_currentUser) return;
        const uid    = String(_currentUser.id);
        const oid    = String(otherUser.id);
        const chatId = uid < oid ? uid + '_' + oid : oid + '_' + uid;
        _db.collection('tm_personal_chats').doc(chatId).set({
            members: [uid, oid],
            memberInfo: {
                [uid]: { name: _currentUser.name || '', avatar: _currentUser.avatar || '' },
                [oid]: { name: otherUser.name || '', avatar: otherUser.avatar || '' }
            },
            type: 'personal',
            lastMsg: '', lastMsgTs: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(function () {
            _openChat({ id: chatId, type: 'personal', name: otherUser.name || oid, displayName: otherUser.name || oid, avatarData: otherUser.avatar || '', members: [uid, oid] });
            _closeModal();
        }).catch(function () {});
    }

    /* ══════════════════════════════════════════════════════════
       FIND USERS MODAL
    ══════════════════════════════════════════════════════════ */
    function _showFindUsersModal() {
        _openModal(`
            <div class="tmv3-modal-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-times"></i></button>
                <span class="tmv3-modal-title">ইউজার খুঁজুন</span>
            </div>
            <div class="tmv3-modal-body">
                <div class="tmv3-input-group">
                    <label>নাম বা ইমেইল</label>
                    <input type="text" id="fu-search" placeholder="ইউজার খুঁজুন...">
                </div>
                <div id="fu-results"></div>
            </div>
        `);
        const inp     = document.getElementById('fu-search');
        const results = document.getElementById('fu-results');
        let timer;
        inp.addEventListener('input', function () {
            clearTimeout(timer);
            const q = this.value.trim();
            if (!q) { results.innerHTML = ''; return; }
            timer = setTimeout(function () {
                results.innerHTML = '<div class="tmv3-spinner" style="height:60px;"><i class="fa fa-circle-notch"></i></div>';
                const usDb = (function () {
                    try { if (window._TM_FB_DBS && window._TM_FB_DBS['fb1_users']) return window._TM_FB_DBS['fb1_users']; } catch (e) {}
                    return _db;
                })();
                usDb.collection('users').get().then(function (snap) {
                    const ql = q.toLowerCase();
                    const users = [];
                    snap.forEach(function (doc) {
                        const d = doc.data();
                        if (_currentUser && String(doc.id) === String(_currentUser.id)) return;
                        const name  = (d.name || d.fullName || '').toLowerCase();
                        const email = (d.email || '').toLowerCase();
                        if (name.includes(ql) || email.includes(ql)) {
                            users.push({ id: doc.id, name: d.name || d.fullName || doc.id, email: d.email || '', avatar: d.avatarData || d.avatar || '' });
                        }
                    });
                    if (!users.length) { results.innerHTML = '<div class="tmv3-empty-msg">কোনো ইউজার পাওয়া যায়নি</div>'; return; }
                    results.innerHTML = '';
                    users.slice(0, 12).forEach(function (u) {
                        const item = document.createElement('div');
                        item.className = 'tmv3-find-user-item';
                        item.innerHTML = `
                            <div class="tmv3-avatar" style="width:44px;height:44px;font-size:19px;flex-shrink:0;">${u.avatar ? `<img src="${u.avatar}" alt="">` : '👤'}</div>
                            <div style="flex:1;min-width:0;">
                                <div style="color:var(--tm-text);font-size:14px;font-weight:600;">${_esc(u.name)}</div>
                                ${u.email ? `<div style="color:var(--tm-text-muted);font-size:12px;">${_esc(u.email)}</div>` : ''}
                            </div>
                            <div style="color:var(--tm-accent);font-size:13px;background:var(--tm-accent-soft);padding:6px 12px;border-radius:20px;border:1px solid var(--tm-border);">চ্যাট</div>
                        `;
                        item.addEventListener('click', function () { _openPersonalChat(u); });
                        results.appendChild(item);
                    });
                }).catch(function () { results.innerHTML = '<div class="tmv3-empty-msg">লোড করতে সমস্যা হচ্ছে।</div>'; });
            }, 400);
        });
    }

    /* ══════════════════════════════════════════════════════════
       INFO PANEL
    ══════════════════════════════════════════════════════════ */
    function _showInfoPanel(chat) {
        const panel = document.getElementById('tmv3-side-panel');
        panel.classList.add('open');
        chat.type === 'group' ? _buildGroupInfoPanel(chat, panel) : _buildPersonalInfoPanel(chat, panel);
    }

    function _closeSidePanel() {
        document.getElementById('tmv3-side-panel').classList.remove('open');
    }

    function _buildGroupInfoPanel(chat, panel) {
        const uid      = String(_currentUser.id);
        const isAdmin  = chat.adminId === uid || _currentUser.role === 'admin';
        const isPublic = chat.isPublic === true;
        const members  = chat.members || [];
        const name     = chat.name || 'Group';
        const avatar   = chat.avatarData || '';

        panel.innerHTML = `
            <div class="tmv3-sp-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeSidePanel()"><i class="fa fa-times"></i></button>
                <span class="tmv3-sp-title">Group Info</span>
                ${isAdmin && !isPublic ? `<button class="tmv3-icon-btn" id="sp-edit-group"><i class="fa fa-edit"></i></button>` : ''}
            </div>
            <div class="tmv3-sp-body">
                <div class="tmv3-sp-avatar-wrap">
                    <div class="tmv3-sp-avatar ${isPublic ? 'public' : 'group'}" id="sp-av">
                        ${avatar ? `<img src="${avatar}" alt="">` : '👥'}
                        ${isAdmin && !isPublic ? '<span class="tmv3-sp-avatar-edit"><i class="fa fa-camera"></i></span>' : ''}
                    </div>
                </div>
                <div class="tmv3-sp-name">${_esc(name)}</div>
                <div class="tmv3-sp-sub">${isPublic ? '🌐 সাবজনীন গ্রুপ · ' : 'গ্রুপ · '}<span style="color:var(--tm-accent);">${members.length} সদস্য</span></div>
                ${chat.desc ? `<div class="tmv3-bio-box"><p>${_esc(chat.desc)}</p></div>` : ''}
                ${isAdmin ? `
                <div class="tmv3-sp-section">
                    <div class="tmv3-sp-row" id="sp-group-settings">
                        <i class="fa fa-cog"></i><span class="label">Group Settings</span>
                        <i class="fa fa-chevron-right" style="color:var(--tm-text-dim);"></i>
                    </div>
                </div>` : ''}
                <div class="tmv3-sp-section">
                    <div style="color:var(--tm-text-muted);font-size:12px;padding:14px 0 8px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">${members.length} সদস্য</div>
                    ${(isAdmin || chat.allowMemberAdd) ? `
                    <div class="tmv3-member-item" id="sp-add-member-btn" style="cursor:pointer;">
                        <div class="tmv3-member-av" style="background:linear-gradient(135deg,var(--tm-accent),var(--tm-accent2));border-color:transparent;">
                            <i class="fa fa-user-plus" style="color:#fff;"></i>
                        </div>
                        <div class="tmv3-member-info"><div class="tmv3-member-name" style="color:var(--tm-accent);">সদস্য যোগ করুন</div></div>
                    </div>` : ''}
                    <div id="sp-members-list"><div class="tmv3-spinner" style="height:60px;"><i class="fa fa-circle-notch"></i></div></div>
                </div>
                <div class="tmv3-sp-section">
                    ${!isPublic ? `<div class="tmv3-sp-row danger" id="sp-leave-group"><i class="fa fa-sign-out-alt"></i><span class="label">গ্রুপ ছেড়ে দিন</span></div>` : ''}
                    ${isAdmin && !isPublic ? `<div class="tmv3-sp-row danger" id="sp-delete-group"><i class="fa fa-trash"></i><span class="label">গ্রুপ ডিলিট করুন</span></div>` : ''}
                </div>
            </div>
        `;

        _loadGroupMembers(chat, isAdmin);

        const addBtn = panel.querySelector('#sp-add-member-btn');
        if (addBtn) addBtn.addEventListener('click', function () { _showAddMemberModal(chat); });

        const settingsBtn = panel.querySelector('#sp-group-settings');
        if (settingsBtn) settingsBtn.addEventListener('click', function () { _showGroupSettingsModal(chat); });

        const leaveBtn = panel.querySelector('#sp-leave-group');
        if (leaveBtn) leaveBtn.addEventListener('click', function () {
            if (!confirm('গ্রুপ থেকে বের হবেন?')) return;
            _db.collection('tm_groups').doc(chat.id).update({
                members: firebase.firestore.FieldValue.arrayRemove(uid)
            }).then(function () { _closeActiveChat(); _closeSidePanel(); _toast('গ্রুপ থেকে বের হয়েছেন।'); }).catch(function () {});
        });

        const deleteGBtn = panel.querySelector('#sp-delete-group');
        if (deleteGBtn) deleteGBtn.addEventListener('click', function () {
            if (!confirm('গ্রুপ পুরোপুরি ডিলিট করবেন?')) return;
            _getMessagesPath(chat).get().then(function (snap) {
                const batch = _db.batch();
                snap.docs.forEach(function (doc) { batch.delete(doc.ref); });
                return batch.commit();
            }).then(function () {
                return _db.collection('tm_groups').doc(chat.id).delete();
            }).then(function () { _closeActiveChat(); _closeSidePanel(); _toast('গ্রুপ ডিলিট হয়েছে ✅'); }).catch(function () {});
        });
    }

    function _loadGroupMembers(chat, isAdmin) {
        const listEl = document.getElementById('sp-members-list');
        if (!listEl || !_db) return;
        const members = chat.members || [];
        if (!members.length) { listEl.innerHTML = '<div class="tmv3-empty-msg">কোনো সদস্য নেই</div>'; return; }

        const usDb = (function () {
            try { if (window._TM_FB_DBS && window._TM_FB_DBS['fb1_users']) return window._TM_FB_DBS['fb1_users']; } catch (e) {}
            return _db;
        })();

        usDb.collection('users').get().then(function (snap) {
            const userMap = {};
            snap.forEach(function (doc) { userMap[doc.id] = doc.data(); });
            listEl.innerHTML = '';
            members.forEach(function (mid) {
                const d    = userMap[mid] || {};
                const name = d.name || d.fullName || mid;
                const av   = d.avatarData || d.avatar || '';
                const isAdm = chat.adminId === mid;
                const item = document.createElement('div');
                item.className = 'tmv3-member-item';
                item.innerHTML = `
                    <div class="tmv3-member-av">${av ? `<img src="${av}" alt="">` : '👤'}</div>
                    <div class="tmv3-member-info">
                        <div class="tmv3-member-name">${_esc(name)}</div>
                        ${isAdm ? '<div class="tmv3-member-role">⭐ এডমিন</div>' : ''}
                    </div>
                    ${isAdmin && mid !== String(_currentUser.id) && !chat.isPublic ? `<button class="tmv3-btn danger" style="padding:6px 12px;font-size:12px;" data-uid="${mid}">বাদ দিন</button>` : ''}
                `;
                const rmBtn = item.querySelector('[data-uid]');
                if (rmBtn) rmBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const uidToRemove = this.dataset.uid;
                    if (!confirm(name + ' কে বাদ দেবেন?')) return;
                    _db.collection('tm_groups').doc(chat.id).update({
                        members: firebase.firestore.FieldValue.arrayRemove(uidToRemove)
                    }).then(function () { _toast(name + ' বাদ দেওয়া হয়েছে।'); _showInfoPanel(chat); }).catch(function () {});
                });
                listEl.appendChild(item);
            });
        }).catch(function () {
            listEl.innerHTML = '';
            members.forEach(function (mid) {
                const item = document.createElement('div');
                item.className = 'tmv3-member-item';
                item.innerHTML = `<div class="tmv3-member-av">👤</div><div class="tmv3-member-info"><div class="tmv3-member-name">${_esc(mid)}</div></div>`;
                listEl.appendChild(item);
            });
        });
    }

    function _buildPersonalInfoPanel(chat, panel) {
        const uid  = String(_currentUser.id);
        let oName  = 'User', oAvatar = '';
        if (chat.memberInfo) {
            const oUid = Object.keys(chat.memberInfo).find(function (k) { return k !== uid; });
            if (oUid) { oName = chat.memberInfo[oUid].name || 'User'; oAvatar = chat.memberInfo[oUid].avatar || ''; }
        }
        panel.innerHTML = `
            <div class="tmv3-sp-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeSidePanel()"><i class="fa fa-times"></i></button>
                <span class="tmv3-sp-title">Contact Info</span>
            </div>
            <div class="tmv3-sp-body">
                <div class="tmv3-sp-avatar-wrap">
                    <div class="tmv3-sp-avatar">${oAvatar ? `<img src="${oAvatar}" alt="">` : '👤'}</div>
                </div>
                <div class="tmv3-sp-name">${_esc(oName)}</div>
                <div class="tmv3-sp-sub">ব্যক্তিগত চ্যাট</div>
                <div class="tmv3-sp-section" style="margin-top:20px;">
                    <div class="tmv3-sp-row danger" id="sp-del-personal"><i class="fa fa-trash"></i><span class="label">চ্যাট ডিলিট করুন</span></div>
                </div>
            </div>
        `;
        const delBtn = panel.querySelector('#sp-del-personal');
        if (delBtn) delBtn.addEventListener('click', function () { _deleteChat(); _closeSidePanel(); });
    }

    /* ══════════════════════════════════════════════════════════
       ADD MEMBER MODAL
    ══════════════════════════════════════════════════════════ */
    function _showAddMemberModal(chat) {
        _openModal(`
            <div class="tmv3-modal-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-times"></i></button>
                <span class="tmv3-modal-title">সদস্য যোগ করুন</span>
            </div>
            <div class="tmv3-modal-body">
                <div class="tmv3-input-group">
                    <label>নাম বা ইমেইল</label>
                    <input type="text" id="am-search" placeholder="ইউজার খুঁজুন...">
                </div>
                <div id="am-results"></div>
            </div>
        `);
        const inp = document.getElementById('am-search');
        let timer;
        inp.addEventListener('input', function () {
            clearTimeout(timer);
            const q = this.value.trim();
            const results = document.getElementById('am-results');
            if (!q) { results.innerHTML = ''; return; }
            timer = setTimeout(function () {
                results.innerHTML = '<div class="tmv3-spinner" style="height:60px;"><i class="fa fa-circle-notch"></i></div>';
                const usDb = (function () {
                    try { if (window._TM_FB_DBS && window._TM_FB_DBS['fb1_users']) return window._TM_FB_DBS['fb1_users']; } catch (e) {}
                    return _db;
                })();
                usDb.collection('users').get().then(function (snap) {
                    const ql = q.toLowerCase();
                    const users = [];
                    snap.forEach(function (doc) {
                        const d = doc.data();
                        if (chat.members && chat.members.includes(doc.id)) return;
                        const name = (d.name || d.fullName || '').toLowerCase();
                        if (name.includes(ql) || (d.email || '').toLowerCase().includes(ql)) {
                            users.push({ id: doc.id, name: d.name || d.fullName || doc.id, avatar: d.avatarData || d.avatar || '' });
                        }
                    });
                    results.innerHTML = '';
                    users.slice(0, 10).forEach(function (u) {
                        const item = document.createElement('div');
                        item.className = 'tmv3-find-user-item';
                        item.innerHTML = `
                            <div class="tmv3-avatar" style="width:40px;height:40px;font-size:17px;flex-shrink:0;">${u.avatar ? `<img src="${u.avatar}" alt="">` : '👤'}</div>
                            <div style="flex:1;min-width:0;">
                                <div style="color:var(--tm-text);font-size:14px;font-weight:600;">${_esc(u.name)}</div>
                            </div>
                            <div style="color:var(--tm-accent);font-size:12px;background:var(--tm-accent-soft);padding:5px 10px;border-radius:20px;border:1px solid var(--tm-border);">যোগ করুন</div>
                        `;
                        item.addEventListener('click', function () {
                            _db.collection('tm_groups').doc(chat.id).update({
                                members: firebase.firestore.FieldValue.arrayUnion(String(u.id))
                            }).then(function () { _closeModal(); _toast(u.name + ' যোগ হয়েছেন! ✅'); }).catch(function () {});
                        });
                        results.appendChild(item);
                    });
                    if (!users.length) results.innerHTML = '<div class="tmv3-empty-msg">কোনো ইউজার পাওয়া যায়নি</div>';
                }).catch(function () {});
            }, 400);
        });
    }

    /* ══════════════════════════════════════════════════════════
       GROUP SETTINGS MODAL
    ══════════════════════════════════════════════════════════ */
    function _showGroupSettingsModal(chat) {
        _openModal(`
            <div class="tmv3-modal-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-times"></i></button>
                <span class="tmv3-modal-title">Group Settings</span>
            </div>
            <div class="tmv3-modal-body">
                <div class="tmv3-toggle-row">
                    <div>
                        <div class="tmv3-toggle-label">সদস্যরা মেসেজ পাঠাতে পারবে</div>
                        <div class="tmv3-toggle-sub">বন্ধ করলে শুধু এডমিন মেসেজ পাঠাতে পারবেন</div>
                    </div>
                    <label class="tmv3-switch">
                        <input type="checkbox" id="gs-allow-msg" ${chat.allowMemberMsg !== false ? 'checked' : ''}>
                        <span class="tmv3-switch-slider"></span>
                    </label>
                </div>
                <div class="tmv3-toggle-row">
                    <div>
                        <div class="tmv3-toggle-label">সদস্যরা নতুন মেম্বার যোগ করতে পারবে</div>
                    </div>
                    <label class="tmv3-switch">
                        <input type="checkbox" id="gs-allow-add" ${chat.allowMemberAdd ? 'checked' : ''}>
                        <span class="tmv3-switch-slider"></span>
                    </label>
                </div>
                <div class="tmv3-input-group" style="margin-top:16px;">
                    <label>গ্রুপের নাম পরিবর্তন</label>
                    <input type="text" id="gs-name" value="${_esc(chat.name || '')}" placeholder="গ্রুপের নাম">
                </div>
            </div>
            <div class="tmv3-modal-footer">
                <button class="tmv3-btn secondary" onclick="window._tmv3._closeModal()">বাতিল</button>
                <button class="tmv3-btn primary" id="gs-save-btn"><i class="fa fa-save"></i> সংরক্ষণ</button>
            </div>
        `);
        document.getElementById('gs-save-btn').addEventListener('click', function () {
            const allowMsg = document.getElementById('gs-allow-msg').checked;
            const allowAdd = document.getElementById('gs-allow-add').checked;
            const newName  = document.getElementById('gs-name').value.trim();
            if (!newName) { _toast('গ্রুপের নাম দিন।'); return; }
            _db.collection('tm_groups').doc(chat.id).update({
                allowMemberMsg: allowMsg,
                allowMemberAdd: allowAdd,
                name: newName
            }).then(function () {
                _closeModal();
                _toast('সেটিং সংরক্ষিত হয়েছে ✅');
                if (_activeChat && _activeChat.id === chat.id) {
                    _activeChat.allowMemberMsg = allowMsg;
                    _activeChat.allowMemberAdd = allowAdd;
                    _activeChat.name = newName;
                    _checkSendPermission(_activeChat);
                }
            }).catch(function () {});
        });
    }

    /* ══════════════════════════════════════════════════════════
       PROFILE PANEL
    ══════════════════════════════════════════════════════════ */
    function _showProfilePanel() {
        if (!_currentUser) return;
        const panel = document.getElementById('tmv3-side-panel');
        panel.classList.add('open');

        const name   = _currentUser.name   || '';
        const bio    = _currentUser.bio    || '';
        const avatar = _currentUser.avatar || _currentUser.profileImage || '';
        const blockGroup = _currentUser.blockGroupAdd === true;
        const accLock    = _currentUser.accountLocked === true;

        panel.innerHTML = `
            <div class="tmv3-sp-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeSidePanel()"><i class="fa fa-times"></i></button>
                <span class="tmv3-sp-title">আমার প্রোফাইল</span>
            </div>
            <div class="tmv3-sp-body">
                <div class="tmv3-prof-av-wrap">
                    <label class="tmv3-prof-av" id="pr-av-wrap">
                        ${avatar ? `<img src="${avatar}" alt="" id="pr-av-img">` : `<span id="pr-av-img">${(name[0] || '👤').toUpperCase()}</span>`}
                        <span class="tmv3-prof-av-edit"><i class="fa fa-camera"></i></span>
                        <input type="file" id="pr-av-input" accept="image/*" style="display:none;">
                    </label>
                </div>
                <div class="tmv3-input-group">
                    <label>নাম</label>
                    <input type="text" id="pr-name" value="${_esc(name)}" placeholder="আপনার নাম">
                </div>
                <div class="tmv3-input-group">
                    <label>বায়ো</label>
                    <textarea id="pr-bio" placeholder="নিজের সম্পর্কে লিখুন...">${_esc(bio)}</textarea>
                </div>
                <div class="tmv3-sp-section">
                    <div class="tmv3-toggle-row">
                        <div>
                            <div class="tmv3-toggle-label">গ্রুপে যোগ করতে বাধা দিন</div>
                            <div class="tmv3-toggle-sub">অন্যরা আপনাকে গ্রুপে যোগ করতে পারবে না</div>
                        </div>
                        <label class="tmv3-switch">
                            <input type="checkbox" id="pr-block-group" ${blockGroup ? 'checked' : ''}>
                            <span class="tmv3-switch-slider"></span>
                        </label>
                    </div>
                    <div class="tmv3-toggle-row">
                        <div>
                            <div class="tmv3-toggle-label">অ্যাকাউন্ট লক করুন</div>
                            <div class="tmv3-toggle-sub">অন্যরা আপনাকে ব্যক্তিগত চ্যাটে মেসেজ পাঠাতে পারবে না</div>
                        </div>
                        <label class="tmv3-switch">
                            <input type="checkbox" id="pr-acc-lock" ${accLock ? 'checked' : ''}>
                            <span class="tmv3-switch-slider"></span>
                        </label>
                    </div>
                </div>
                <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="tmv3-btn primary" id="pr-save-btn"><i class="fa fa-save"></i> সংরক্ষণ</button>
                </div>
            </div>
        `;

        /* Avatar upload */
        document.getElementById('pr-av-input').addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const r = new FileReader();
            r.onload = function (e) {
                _currentUser.avatar = e.target.result;
                const avWrap = document.getElementById('pr-av-wrap');
                if (avWrap) avWrap.innerHTML = `<img src="${e.target.result}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"><span class="tmv3-prof-av-edit"><i class="fa fa-camera"></i></span><input type="file" id="pr-av-input" accept="image/*" style="display:none;">`;
            };
            r.readAsDataURL(this.files[0]);
            this.value = '';
        });

        document.getElementById('pr-save-btn').addEventListener('click', function () {
            const newName    = (document.getElementById('pr-name').value || '').trim();
            const newBio     = (document.getElementById('pr-bio').value || '').trim();
            const blockGroup = document.getElementById('pr-block-group').checked;
            const accLock    = document.getElementById('pr-acc-lock').checked;

            if (newName) _currentUser.name = newName;
            _currentUser.bio = newBio;
            _currentUser.blockGroupAdd = blockGroup;
            _currentUser.accountLocked = accLock;
            localStorage.setItem('TM_SESSION_USER', JSON.stringify(_currentUser));

            if (_db) {
                _getUsersDb().collection('users').doc(String(_currentUser.id)).update({
                    name: _currentUser.name || '',
                    bio:  _currentUser.bio || '',
                    avatar: _currentUser.avatar || '',
                    blockGroupAdd: blockGroup,
                    accountLocked: accLock
                }).catch(function () {});
            }
            _toast('প্রোফাইল সংরক্ষিত হয়েছে ✅');
        });
    }

    /* ══════════════════════════════════════════════════════════
       INJECT BUTTONS (PC & Mobile)
    ══════════════════════════════════════════════════════════ */
    function _injectButtons() {
        /* PC */
        const searchBox = document.getElementById('headerSearchBox');
        if (searchBox) {
            const btn = document.createElement('button');
            btn.id = 'tmChatBtnPC'; btn.title = 'Chat';
            btn.innerHTML = `${_chatIcon()}<span class="tmv3-badge" id="tmv3-badge-pc"></span>`;
            btn.addEventListener('click', _openApp);
            searchBox.parentNode.insertBefore(btn, searchBox.nextSibling);
            const uc = searchBox.closest('.user-controls');
            if (uc) uc.style.display = 'flex';
        }
        _injectMobileBtn();
    }

    function _injectMobileBtn() {
        const list = document.getElementById('mobileSheetList');
        if (!list) { setTimeout(_injectMobileBtn, 500); return; }
        const item = document.createElement('div');
        item.className = 'tmv3-mob-item';
        item.innerHTML = `<div class="mob-icon">${_chatIcon(26)}</div>Chat<span class="tmv3-mob-badge" id="tmv3-badge-mob"></span>`;
        item.addEventListener('click', function () {
            if (typeof closeMobileAccountMenu === 'function') closeMobileAccountMenu();
            setTimeout(_openApp, 320);
        });
        list.appendChild(item);
    }

    function _chatIcon(size) {
        size = size || 22;
        return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="url(#tmChatGrad)">
            <defs><linearGradient id="tmChatGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6c63ff"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>
            <path d="M16 2C8.268 2 2 8.268 2 16c0 2.527.676 4.9 1.857 6.945L2 30l7.258-1.832A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2zm-4 13h-2v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>
        </svg>`;
    }

    /* ══════════════════════════════════════════════════════════
       HOTKEY
    ══════════════════════════════════════════════════════════ */
    function _bindHotkey() {
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                const ov = document.getElementById('tmv3-overlay');
                if (ov.classList.contains('open')) _closeApp(); else _openApp();
            }
            if (e.key === 'Escape') {
                if (document.getElementById('tmv3-modal-overlay').classList.contains('open')) { _closeModal(); return; }
                if (document.getElementById('tmv3-side-panel').classList.contains('open')) { _closeSidePanel(); return; }
                if (document.getElementById('tmv3-overlay').classList.contains('open')) _closeApp();
            }
        });
    }

    /* ══════════════════════════════════════════════════════════
       MODAL HELPERS
    ══════════════════════════════════════════════════════════ */
    function _openModal(html) {
        document.getElementById('tmv3-modal').innerHTML = html;
        document.getElementById('tmv3-modal-overlay').classList.add('open');
    }

    function _closeModal() {
        document.getElementById('tmv3-modal-overlay').classList.remove('open');
        document.getElementById('tmv3-modal').innerHTML = '';
    }

    /* ══════════════════════════════════════════════════════════
       LIGHTBOX
    ══════════════════════════════════════════════════════════ */
    function _openLightbox(src) {
        document.getElementById('tmv3-lb-img').src = src;
        document.getElementById('tmv3-lightbox').classList.add('open');
    }

    /* ══════════════════════════════════════════════════════════
       TOAST
    ══════════════════════════════════════════════════════════ */
    function _toast(msg, duration) {
        const el = document.getElementById('tmv3-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(function () { el.classList.remove('show'); }, duration || 2500);
    }

    /* ══════════════════════════════════════════════════════════
       HELPERS
    ══════════════════════════════════════════════════════════ */
    function _cancelReply() {
        _replyTarget = null;
        document.getElementById('tmv3-reply-bar').classList.remove('show');
    }

    function _cancelMedia() {
        _mediaPreview = null;
        document.getElementById('tmv3-media-bar').classList.remove('show');
        document.getElementById('tmv3-media-thumb').src = '';
    }

    function scrollToBottom() {
        const area = document.getElementById('tmv3-messages');
        if (area) { area.scrollTop = area.scrollHeight; _isAtBottom = true; }
        document.getElementById('tmv3-scroll-down').classList.remove('show');
    }

    function _esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _formatTime(d) {
        if (!d) return '';
        const h = d.getHours(), m = d.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function _formatDate(d) {
        const now   = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yest  = new Date(today - 86400000);
        const day   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (+day === +today) return 'আজ';
        if (+day === +yest)  return 'গতকাল';
        return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function _nameColor(id) {
        const colors = ['#a78bfa', '#60a5fa', '#34d399', '#f472b6', '#fb923c', '#e879f9', '#38bdf8', '#4ade80'];
        let h = 0;
        String(id || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) & 0xffff; });
        return colors[h % colors.length];
    }

    /* ══════════════════════════════════════════════════════════
       PUBLIC API
    ══════════════════════════════════════════════════════════ */
    window._tmv3 = {
        open:          _openApp,
        close:         _closeApp,
        sendMessage:   _sendMessage,
        cancelReply:   _cancelReply,
        cancelMedia:   _cancelMedia,
        scrollToBottom: scrollToBottom,
        _closeModal:   _closeModal,
        _closeSidePanel: _closeSidePanel,
        _toast:        _toast
    };

})();
