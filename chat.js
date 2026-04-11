/* ================================================================
   DIGITAL SHOP TM — WhatsApp-Style Chat  v3.0
   ----------------------------------------------------------------
   ✅ ফিচার সমূহ:
   - WhatsApp-এর মতো ডিজাইন (Dark theme)
   - সাবজনীন (Public) গ্রুপ + কাস্টম গ্রুপ
   - পার্সোনাল চ্যাট
   - গ্রুপ সেটিং (এডমিন পরিবর্তন, মেম্বার যোগ/বাদ)
   - প্রোফাইল (ছবি, বায়ো, নাম)
   - ব্লক, ডিলিট, ক্লিয়ার চ্যাট
   - মোবাইল + পিসি রেসপন্সিভ
   ================================================================ */

(function () {
    'use strict';

    /* ── Firebase Config ─────────────────────────────────────── */
    const FB_CFG = {
        apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
        authDomain: "digitalshoptm-2008.firebaseapp.com",
        projectId: "digitalshoptm-2008",
        storageBucket: "digitalshoptm-2008.firebasestorage.app",
        messagingSenderId: "627378095856",
        appId: "1:627378095856:web:b705f4f75e0512646ca435"
    };

    const PUBLIC_GROUP_ID   = 'digital_shop_tm_main';
    const PUBLIC_GROUP_NAME = 'Digital Shop TM সাবজনীন';
    const MAX_MSG = 100;
    const TYPING_TTL = 4000;

    let _db           = null;
    let _currentUser  = null;
    let _isMobile     = false;
    let _activeChat   = null; // { type:'group'|'personal', id, name, avatar, isPublic }
    let _unsubMsg     = null;
    let _unsubTyping  = null;
    let _typingTimer  = null;
    let _isAtBottom   = true;
    let _replyTarget  = null;
    let _mediaPreview = null;
    let _chatList     = []; // loaded chats
    let _unreadMap    = {}; // chatId -> count
    let _lastMsgTsMap = {}; // chatId -> last known lastMsgTs (ms) — for background unread tracking
    let _chatListReady = false; // first load হয়েছে কিনা
    let _activeTab    = 'all'; // all|unread|groups

    /* ══════════════════════════════════════════════════════════
       INIT
    ══════════════════════════════════════════════════════════ */
    window.addEventListener('load', function () {
        (window.TM_READY || Promise.resolve()).then(function () {
            setTimeout(_init, 600);
        });
    });

    function _init() {
        _currentUser = _getSessionUser();
        _isMobile = document.documentElement.classList.contains('is-mobile') ||
                    /Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    (window.innerWidth <= 768);

        // ✅ is-mobile class HTML element এ যোগ করো — CSS selectors কাজ করবে
        if (_isMobile) {
            document.documentElement.classList.add('is-mobile');
        } else {
            document.documentElement.classList.remove('is-mobile');
        }

        // ✅ window resize এ re-check করো
        window.addEventListener('resize', function() {
            var nowMobile = /Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 900;
            if (nowMobile) {
                document.documentElement.classList.add('is-mobile');
            } else {
                document.documentElement.classList.remove('is-mobile');
            }
        });

        _initFirebase();
        _injectCSS();
        _buildMainUI();
        _injectButtons();
        _bindHotkey();
        if (_currentUser) {
            _loadChatList();
            _ensurePublicGroup();
        }
    }

    function _getSessionUser() {
        try {
            const s = localStorage.getItem('TM_SESSION_USER');
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    function _initFirebase() {
        if (typeof firebase === 'undefined') return;
        if (firebase.apps && firebase.apps.length) {
            _db = firebase.firestore();
        } else {
            firebase.initializeApp(FB_CFG);
            _db = firebase.firestore();
        }
    }

    function _ensurePublicGroup() {
        if (!_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        const isMainAdmin = _currentUser.role === 'admin';

        // সব ইউজার সাবজনীন গ্রুপে থাকবে
        _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).get().then(doc => {
            if (doc.exists) {
                // গ্রুপ আছে — user কে member এ যোগ করো
                const data = doc.data();
                const updates = {
                    members: firebase.firestore.FieldValue.arrayUnion(uid)
                };
                // মেইন এডমিন হলে adminId আপডেট করো
                if (isMainAdmin) {
                    updates.adminId = uid;
                    updates.name = PUBLIC_GROUP_NAME;
                    updates.isPublic = true;
                }
                _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).update(updates).catch(()=>{});
            } else {
                // গ্রুপ নেই — তৈরি করো
                const groupData = {
                    name: PUBLIC_GROUP_NAME,
                    isPublic: true,
                    adminId: isMainAdmin ? uid : 'system',
                    allowMemberAdd: false,
                    allowMemberMsg: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    members: [uid],
                    lastMsg: 'Digital Shop TM সাবজনীন গ্রুপে স্বাগতম! 🎉',
                    lastMsgTs: firebase.firestore.FieldValue.serverTimestamp()
                };
                _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).set(groupData, { merge: true }).catch(()=>{});
            }
        }).catch(() => {
            // Error হলেও try করো
            _db.collection('tm_groups').doc(PUBLIC_GROUP_ID).set({
                name: PUBLIC_GROUP_NAME,
                isPublic: true,
                adminId: isMainAdmin ? uid : 'system',
                allowMemberAdd: false,
                allowMemberMsg: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                members: firebase.firestore.FieldValue.arrayUnion(uid)
            }, { merge: true }).catch(()=>{});
        });
    }

    /* ══════════════════════════════════════════════════════════
       CSS
    ══════════════════════════════════════════════════════════ */
    function _injectCSS() {
        if (document.getElementById('tmv3-style')) return;
        const s = document.createElement('style');
        s.id = 'tmv3-style';
        s.textContent = `
/* ══ Reset & Base ══ */
#tmv3-root * { box-sizing:border-box; margin:0; padding:0; }
@media screen and (max-width:900px) {
    #tmv3-root { font-size:18px !important; }
}
.tmv3-bubble, .tmv3-msg-text, .tmv3-msg-time, .tmv3-sender, .tmv3-dropdown-item { padding:revert; margin:revert; }
.tmv3-bubble { padding:8px 12px 6px 12px !important; margin:0 !important; }
.tmv3-msg-text { padding:0 !important; margin:0 0 4px 0 !important; display:block !important; }
.tmv3-msg-time { padding:0 !important; margin:2px 0 0 0 !important; }
.tmv3-sender { padding:0 !important; margin:0 0 3px 0 !important; }
.tmv3-dropdown-item { padding:15px 20px !important; }
#tmv3-root, #tmv3-overlay {
    font-family:'Hind Siliguri',system-ui,sans-serif;
}

/* ══ Trigger Buttons ══ */
#tmChatBtnPC {
    display:none;
    align-items:center; justify-content:center;
    width:40px; height:40px;
    border-radius:50%;
    background:linear-gradient(135deg,#25d366,#128c7e);
    border:none; cursor:pointer;
    position:relative;
    box-shadow:0 4px 15px rgba(37,211,102,.4);
    transition:.2s; flex-shrink:0;
}
#tmChatBtnPC:hover { opacity:.85; transform:scale(1.08); }
#tmChatBtnPC svg { width:22px; height:22px; fill:#fff; }
.tmv3-badge {
    position:absolute; top:-4px; right:-4px;
    background:#ef4444; color:#fff;
    font-size:10px; font-weight:700;
    border-radius:50%; width:18px; height:18px;
    display:none; align-items:center; justify-content:center;
    border:2px solid #0f172a;
}
.tmv3-badge.show { display:flex; }
.tmv3-mob-item {
    display:flex; align-items:center; gap:24px;
    padding:22px 28px; color:#ebebf5; cursor:pointer;
    font-size:28px; font-weight:500;
    border-bottom:1px solid #2c2c2e;
    transition:background .15s;
}
.tmv3-mob-item:active { background:#2c2c2e; }
.tmv3-mob-item .mob-icon { width:60px; height:60px; border-radius:16px; background:rgba(37,211,102,.18); display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0; }
.tmv3-mob-badge { background:#ef4444; color:#fff; font-size:20px; font-weight:700; border-radius:50px; padding:2px 10px; display:none; margin-left:auto; }
.tmv3-mob-badge.show { display:block; }

/* ══ Overlay ══ */
#tmv3-overlay {
    display:none; position:fixed;
    top:0; left:0; right:0; bottom:0;
    width:100%; height:100%;
    z-index:99999990;
    background:rgba(0,0,0,.85); backdrop-filter:blur(12px);
    align-items:center; justify-content:center;
    padding:0;
    overflow:hidden;
}
#tmv3-overlay.open { display:flex; }
/* Mobile: JS দিয়ে visualViewport অনুযায়ী সাইজ ঠিক হবে */
.is-mobile #tmv3-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
}
/* ══ Close Button (PC) ══ */
#tmv3-close-btn {
    display:none;
    position:fixed;
    top:14px; right:14px;
    width:48px; height:48px;
    border-radius:50%;
    background:linear-gradient(135deg,#ef4444,#dc2626);
    border:2.5px solid rgba(255,255,255,0.95);
    color:#fff; font-size:20px;
    cursor:pointer; z-index:99999999;
    align-items:center; justify-content:center;
    box-shadow:0 4px 20px rgba(239,68,68,.55), 0 0 0 3px rgba(239,68,68,.18);
    transition:all .22s; flex-shrink:0;
}
#tmv3-close-btn:hover { 
    background:linear-gradient(135deg,#dc2626,#b91c1c); 
    transform:scale(1.12) rotate(90deg);
    box-shadow:0 8px 28px rgba(239,68,68,.7);
}
.is-mobile #tmv3-close-btn { display:none !important; }

/* ══ Main Window ══ */
#tmv3-root {
    background:#0b141a;
    width:100vw; height:100vh;
    max-width:none; border-radius:0;
    display:flex; overflow:hidden;
    box-shadow:0 40px 100px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04);
    position:relative;
}
.is-mobile #tmv3-root {
    width:100% !important;
    height:100% !important;
    border-radius:0 !important;
    flex-direction:column;
    position:relative;
}

/* ══ Left Panel ══ */
#tmv3-left {
    width:390px; min-width:300px; max-width:420px;
    display:flex; flex-direction:column;
    background:#111b21;
    border-right:1px solid rgba(42,57,66,.8);
    flex-shrink:0;
    position:relative;
}
/* subtle top accent */
#tmv3-left::before {
    content:'';
    position:absolute; top:0; left:0; right:0; height:3px;
    background:linear-gradient(90deg,#25d366,#128c7e,#075e54);
    z-index:1;
}
.is-mobile #tmv3-left {
    width:100%; max-width:100%;
    height:100%; position:absolute; inset:0; z-index:2;
    transition:transform .28s cubic-bezier(.4,0,.2,1);
}
.is-mobile #tmv3-left.hidden { transform:translateX(-100%); }

/* Left Header */
#tmv3-left-header {
    padding:16px 18px 12px;
    display:flex; align-items:center; justify-content:space-between;
    background:linear-gradient(180deg,#1a2d36 0%,#111b21 100%);
    flex-shrink:0; margin-top:3px;
    border-bottom:1px solid rgba(42,57,66,.5);
}
#tmv3-app-title {
    color:#e9edef; font-size:21px; font-weight:800;
    letter-spacing:-.3px;
    background:linear-gradient(135deg,#e9edef,#aebac1);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
.is-mobile #tmv3-app-title { font-size:32px; }
.is-mobile #tmv3-left-header { padding:20px 20px 16px; }

/* Main popup close button — mobile only */
#tmv3-main-close-btn {
    display: none;
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    border: 2.5px solid rgba(255,255,255,0.9);
    color: #fff; font-size: 20px; font-weight: 700;
    cursor: pointer; flex-shrink: 0;
    align-items: center; justify-content: center;
    box-shadow: 0 3px 14px rgba(239,68,68,.5);
    transition: all .2s; margin-left: 4px;
}
#tmv3-main-close-btn:active { transform: scale(0.88); }
.is-mobile #tmv3-main-close-btn { display: flex; }

.tmv3-icon-btn {
    background:none; border:none; color:#aebac1; cursor:pointer;
    width:38px; height:38px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:18px; transition:.2s; flex-shrink:0;
    position:relative;
}
.tmv3-icon-btn:hover { background:rgba(42,57,66,.7); color:#e9edef; transform:scale(1.08); }
.is-mobile .tmv3-icon-btn { width:60px; height:60px; font-size:28px; }
.tmv3-header-actions { display:flex; align-items:center; gap:4px; }

/* Search Bar */
.tmv3-search-wrap {
    padding:10px 14px 6px;
    flex-shrink:0;
    position:relative;
}
.tmv3-search-bar {
    background:#202c33;
    border-radius:30px;
    display:flex; align-items:center; gap:10px; padding:11px 18px;
    border:1.5px solid transparent;
    transition:background .2s, box-shadow .2s, border-color .2s;
}
.tmv3-search-bar:focus-within {
    background:#1a2631;
    box-shadow:0 0 0 3px rgba(37,211,102,.2);
    border-color:rgba(37,211,102,.35);
}
.tmv3-search-bar i { color:#25d366; font-size:16px; flex-shrink:0; }
.tmv3-search-bar input {
    flex:1; background:none; border:none; outline:none;
    color:#e9edef; font-size:15px;
    font-family:inherit;
}
.tmv3-search-bar input::placeholder { color:#8696a0; }
.is-mobile .tmv3-search-wrap { padding:12px 16px 8px; }
.is-mobile .tmv3-search-bar {
    padding:16px 22px;
    border-radius:40px;
    background:#1f2c34;
    border:1.5px solid rgba(37,211,102,.2);
    gap:14px;
}
.is-mobile .tmv3-search-bar:focus-within {
    border-color:rgba(37,211,102,.5);
    box-shadow:0 0 0 4px rgba(37,211,102,.12);
}
.is-mobile .tmv3-search-bar i { font-size:26px; }
.is-mobile .tmv3-search-bar input { font-size:24px; }

/* User Search Results dropdown */
#tmv3-user-search-results {
    display:none;
    background:#111b21;
    border-radius:14px;
    margin-top:8px;
    overflow:hidden;
    border:1px solid rgba(37,211,102,.2);
    box-shadow:0 8px 32px rgba(0,0,0,.5);
    max-height:360px;
    overflow-y:auto;
}
.tmv3-usr-srch-label {
    padding:10px 16px 6px;
    color:#25d366; font-size:12px; font-weight:700;
    letter-spacing:.5px; text-transform:uppercase;
    border-bottom:1px solid rgba(42,57,66,.5);
}
.tmv3-usr-srch-item {
    display:flex; align-items:center; gap:12px;
    padding:12px 16px;
    cursor:pointer; transition:background .15s;
    border-bottom:1px solid rgba(42,57,66,.25);
}
.tmv3-usr-srch-item:last-child { border-bottom:none; }
.tmv3-usr-srch-item:hover, .tmv3-usr-srch-item:active { background:rgba(37,211,102,.08); }
.tmv3-usr-srch-av {
    width:44px; height:44px; border-radius:50%;
    background:#1f2c34; display:flex; align-items:center;
    justify-content:center; font-size:20px; flex-shrink:0;
    overflow:hidden; border:2px solid rgba(37,211,102,.2);
}
.tmv3-usr-srch-av img { width:100%; height:100%; object-fit:cover; }
.tmv3-usr-srch-info { flex:1; min-width:0; }
.tmv3-usr-srch-name { color:#e9edef; font-size:15px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tmv3-usr-srch-sub { color:#8696a0; font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tmv3-usr-srch-action {
    color:#25d366; font-size:12px; font-weight:600; white-space:nowrap;
    background:rgba(37,211,102,.1); padding:6px 12px; border-radius:20px;
    border:1px solid rgba(37,211,102,.2); flex-shrink:0;
}
.tmv3-usr-search-loading {
    padding:16px; color:#8696a0; font-size:14px; text-align:center;
}
/* Mobile user search results — bigger */
.is-mobile #tmv3-user-search-results {
    border-radius:16px; margin-top:10px;
    max-height:420px;
}
.is-mobile .tmv3-usr-srch-label { font-size:16px; padding:14px 20px 8px; }
.is-mobile .tmv3-usr-srch-item { padding:16px 20px; gap:16px; }
.is-mobile .tmv3-usr-srch-av { width:56px; height:56px; font-size:26px; }
.is-mobile .tmv3-usr-srch-name { font-size:22px; }
.is-mobile .tmv3-usr-srch-sub { font-size:16px; }
.is-mobile .tmv3-usr-srch-action { font-size:16px; padding:8px 16px; }
.is-mobile .tmv3-usr-search-loading { font-size:20px; padding:22px; }

/* Filter tabs */
.tmv3-tabs {
    display:flex; gap:8px; padding:8px 12px 10px;
    flex-shrink:0; overflow-x:auto; scrollbar-width:none;
}
.tmv3-tabs::-webkit-scrollbar { display:none; }
.tmv3-tab {
    background:rgba(42,57,66,.4);
    border:1.5px solid rgba(42,57,66,.6);
    color:#aebac1; padding:7px 20px; border-radius:28px;
    cursor:pointer; font-size:13.5px; white-space:nowrap;
    font-family:inherit; transition:all .18s; font-weight:500;
    letter-spacing:.2px;
}
.tmv3-tab.active {
    background:rgba(37,211,102,.18);
    color:#25d366; border-color:rgba(37,211,102,.5);
    font-weight:600;
}
.tmv3-tab:hover:not(.active) {
    background:rgba(42,57,66,.65); color:#e9edef;
    border-color:rgba(42,57,66,.9);

}
.is-mobile .tmv3-tabs { padding:10px 16px 12px; gap:10px; }
.is-mobile .tmv3-tab { font-size:22px; padding:12px 28px; border-radius:35px; border-width:2px; }

/* Chat List */
#tmv3-chat-list {
    flex:1; overflow-y:auto; scrollbar-width:thin;
    scrollbar-color:#2a3942 transparent;
}
#tmv3-chat-list::-webkit-scrollbar { width:4px; }
#tmv3-chat-list::-webkit-scrollbar-thumb { background:#2a3942; border-radius:4px; }

.tmv3-chat-item {
    display:flex; align-items:center; gap:14px;
    padding:10px 16px; cursor:pointer;
    border-bottom:1px solid rgba(42,57,66,.25);
    transition:background .15s;
    position:relative;
}
.tmv3-chat-item:hover { background:rgba(32,44,51,.75); }
.tmv3-chat-item.active { background:#2a3942; }
.tmv3-chat-item.active::before {
    content:''; position:absolute; left:0; top:50%; transform:translateY(-50%);
    width:3px; height:60%; background:#25d366; border-radius:0 3px 3px 0;
}
.tmv3-chat-item:active { background:#2a3942; }
.is-mobile .tmv3-chat-item { padding:18px 20px; gap:18px; }

.tmv3-avatar {
    width:50px; height:50px; border-radius:50%;
    background:linear-gradient(135deg,#2a3942,#1a2d36);
    display:flex; align-items:center; justify-content:center;
    font-size:22px; color:#aebac1; flex-shrink:0;
    overflow:hidden; position:relative;
    box-shadow:0 1px 4px rgba(0,0,0,.35);
}
.tmv3-avatar img { width:100%; height:100%; object-fit:cover; }
.tmv3-avatar.group { background:linear-gradient(135deg,#566b76,#374f5a); font-size:22px; }
.tmv3-avatar.public { background:linear-gradient(135deg,#00a884,#075e54); }
.is-mobile .tmv3-avatar { width:64px; height:64px; font-size:28px; }

.tmv3-chat-info { flex:1; min-width:0; }
.tmv3-chat-name {
    color:#e9edef; font-size:16px; font-weight:500;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    line-height:1.3;
}
.tmv3-chat-preview {
    color:#8696a0; font-size:13.5px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    margin-top:2px; line-height:1.4;
}
.is-mobile .tmv3-chat-name { font-size:24px; font-weight:600; }
.is-mobile .tmv3-chat-preview { font-size:20px; margin-top:4px; }

.tmv3-chat-meta {
    display:flex; flex-direction:column; align-items:flex-end;
    gap:5px; flex-shrink:0; min-width:52px;
}
.tmv3-chat-time { color:#8696a0; font-size:11.5px; white-space:nowrap; }
.tmv3-unread-badge {
    background:#25d366;
    color:#111; font-size:11.5px; font-weight:700;
    min-width:20px; height:20px; border-radius:10px;
    display:flex; align-items:center; justify-content:center; padding:0 5px;
    line-height:1;
}
.tmv3-chat-item.active .tmv3-chat-time { color:#25d366; }
.is-mobile .tmv3-chat-time { font-size:18px; }
.is-mobile .tmv3-unread-badge { font-size:18px; min-width:30px; height:30px; padding:0 8px; }

/* Bottom Nav - REMOVED */
#tmv3-bottom-nav { display:none !important; }

/* ══ Right Panel ══ */
#tmv3-right {
    flex:1; display:flex; flex-direction:column;
    background:#0b141a; min-width:0; position:relative;
    overflow:hidden;
}
.is-mobile #tmv3-right {
    width:100%; height:100%; position:absolute; inset:0;
    transform:translateX(100%); transition:transform .28s cubic-bezier(.4,0,.2,1); z-index:3;
}
.is-mobile #tmv3-right.open { transform:translateX(0); }

/* Right Empty State — WhatsApp-style lock screen */
#tmv3-empty-right {
    flex:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:20px;
    background:#0b141a;
    background-image:
        radial-gradient(ellipse 60% 40% at 50% 0%, rgba(37,211,102,.06) 0%, transparent 70%),
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M40 8 L72 26 L72 54 L40 72 L8 54 L8 26 Z' fill='none' stroke='rgba(255,255,255,0.025)' stroke-width='1'/%3E%3C/svg%3E");
}
#tmv3-empty-right .tmv3-empty-icon-wrap {
    width:110px; height:110px; border-radius:50%;
    background:rgba(42,57,66,.45);
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 0 18px rgba(42,57,66,.15), 0 0 0 36px rgba(42,57,66,.07);
    flex-shrink:0;
}
#tmv3-empty-right .tmv3-empty-icon-wrap i {
    font-size:46px; color:#8696a0; opacity:.6;
}
#tmv3-empty-right p { font-size:14px; color:#8696a0; opacity:.7; text-align:center; line-height:1.6; }

/* Chat Header */
#tmv3-chat-header {
    background:linear-gradient(180deg,#1a2d36 0%,#1f2c34 100%);
    padding:12px 16px;
    display:flex; align-items:center; gap:12px;
    border-bottom:1px solid rgba(42,57,66,.7); flex-shrink:0;
    cursor:pointer;
    box-shadow:0 2px 12px rgba(0,0,0,.2);
}
.is-mobile #tmv3-chat-header { padding:20px 18px; }

#tmv3-back-btn {
    display:none; background:none; border:none;
    color:#aebac1; font-size:20px; cursor:pointer;
    width:36px; height:36px; border-radius:50%;
    align-items:center; justify-content:center; flex-shrink:0;
    transition:.2s;
}
#tmv3-back-btn:hover { background:rgba(42,57,66,.6); }
.is-mobile #tmv3-back-btn { display:flex; }

#tmv3-header-info { flex:1; min-width:0; pointer-events:none; }
#tmv3-header-name { color:#e9edef; font-size:16px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#tmv3-header-sub { color:#00a884; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500; }
.is-mobile #tmv3-header-name { font-size:28px; }
.is-mobile #tmv3-header-sub { font-size:21px; }

.tmv3-header-actions-right { display:flex; align-items:center; gap:4px; }

/* Mobile close button (X) in chat header */
#tmv3-chat-close-btn {
    display:none;
    background:linear-gradient(135deg,#ef4444,#dc2626);
    border:2px solid rgba(255,255,255,0.9);
    color:#fff; font-size:18px; font-weight:700;
    width:42px; height:42px; border-radius:50%;
    align-items:center; justify-content:center; flex-shrink:0;
    cursor:pointer; transition:all .2s;
    box-shadow:0 3px 12px rgba(239,68,68,.5);
}
#tmv3-chat-close-btn:active { transform:scale(0.9); }
.is-mobile #tmv3-chat-close-btn { display:flex; }

/* 3-dot dropdown */
.tmv3-dropdown { position:relative; }
.tmv3-dropdown-menu {
    position:absolute; right:0; top:calc(100% + 8px);
    background:#1f2c34;
    border-radius:6px;
    box-shadow:0 4px 24px rgba(0,0,0,.5), 0 1px 4px rgba(0,0,0,.3);
    border:none;
    min-width:200px; z-index:9999; overflow:hidden;
    display:none;
}
.tmv3-dropdown-menu.open { display:block; animation:tmDropIn .12s ease; }
@keyframes tmDropIn { from { opacity:0; transform:translateY(-4px) scale(.98); } to { opacity:1; transform:none; } }
.tmv3-dropdown-item {
    padding:15px 20px; color:#e9edef; font-size:14.5px;
    cursor:pointer; display:flex; align-items:center; gap:16px;
    transition:background .12s; font-family:inherit;
    border-bottom:none;
}
.tmv3-dropdown-item:hover { background:rgba(42,57,66,.7); }
.tmv3-dropdown-item.danger { color:#ef4444; }
.tmv3-dropdown-item i {
    width:20px; height:20px; text-align:center;
    font-size:16px; color:#8696a0; flex-shrink:0;
}
.tmv3-dropdown-item:hover i { color:#e9edef; }
.tmv3-dropdown-item.danger i { color:#ef4444; }
.is-mobile .tmv3-dropdown-item { font-size:24px; padding:20px 28px; gap:20px; }

/* Messages area */
#tmv3-messages {
    flex:1; min-height:0; overflow-y:auto; padding:16px 18px;
    display:flex; flex-direction:column; gap:4px;
    background:#0b141a;
    background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M40 8 L72 26 L72 54 L40 72 L8 54 L8 26 Z' fill='none' stroke='rgba(255,255,255,0.025)' stroke-width='1'/%3E%3C/svg%3E");
    scrollbar-width:thin; scrollbar-color:#2a3942 transparent;
}
#tmv3-messages::-webkit-scrollbar { width:5px; }
#tmv3-messages::-webkit-scrollbar-thumb { background:rgba(42,57,66,.8); border-radius:10px; }

.tmv3-date-div { display:flex; align-items:center; justify-content:center; margin:14px 0; }
.tmv3-date-div span {
    background:rgba(31,44,52,.95); color:#8696a0; font-size:11.5px;
    padding:5px 16px; border-radius:20px;
    border:1px solid rgba(42,57,66,.5);
    box-shadow:0 2px 8px rgba(0,0,0,.2);
}
.is-mobile .tmv3-date-div span { font-size:18px; padding:6px 20px; }

.tmv3-msg-wrap { display:flex; align-items:flex-end; gap:8px; max-width:72%; }
.tmv3-msg-wrap.own { align-self:flex-end; flex-direction:row-reverse; }
.tmv3-msg-wrap.other { align-self:flex-start; }
.is-mobile .tmv3-msg-wrap { max-width:88%; }

.tmv3-msg-av {
    width:32px; height:32px; border-radius:50%;
    background:linear-gradient(135deg,#2a3942,#1a2d36);
    display:flex; align-items:center; justify-content:center;
    font-size:13px; color:#8696a0; flex-shrink:0; overflow:hidden;
    box-shadow:0 2px 6px rgba(0,0,0,.3);
}
.tmv3-msg-av img { width:100%; height:100%; object-fit:cover; }
.is-mobile .tmv3-msg-av { width:48px; height:48px; font-size:18px; }

.tmv3-bubble {
    padding:8px 12px 6px 12px !important;
    border-radius:8px !important;
    position:relative; word-break:break-word;
    max-width:100%; min-width:60px;
    box-shadow:0 1px 2px rgba(0,0,0,.3);
}
.tmv3-msg-wrap.own .tmv3-bubble {
    background:#005c4b !important;
    border-radius:8px 8px 2px 8px !important;
    color:#e9edef !important;
}
.tmv3-msg-wrap.other .tmv3-bubble {
    background:#1f2c34 !important;
    border-radius:8px 8px 8px 2px !important;
    color:#e9edef !important;
}
.is-mobile .tmv3-bubble { padding:12px 16px 8px 16px !important; }

.tmv3-sender {
    font-size:12.5px !important; font-weight:700 !important;
    margin-bottom:3px !important; display:block !important;
}
.is-mobile .tmv3-sender { font-size:21px !important; }

.tmv3-msg-body { display:block !important; }

.tmv3-msg-text {
    font-size:14.5px !important; line-height:1.5 !important;
    white-space:pre-wrap !important; word-break:break-word !important;
    display:block !important; margin-bottom:4px !important;
    padding:0 !important;
}
.is-mobile .tmv3-msg-text { font-size:24px !important; line-height:1.5 !important; }

/* time — right aligned, below text */
.tmv3-msg-time {
    font-size:11px !important; color:rgba(233,237,239,.55) !important;
    display:flex !important; align-items:center !important;
    justify-content:flex-end !important;
    gap:3px !important; line-height:1 !important;
    white-space:nowrap !important;
    padding:0 !important; margin-top:2px !important;
}
.is-mobile .tmv3-msg-time { font-size:18px !important; }
.tmv3-tick { font-size:12px; color:rgba(233,237,239,.55); }
.tmv3-tick.seen { color:#53bdeb; }

.tmv3-reply-quote {
    background:rgba(0,0,0,.3); border-left:3px solid #25d366;
    border-radius:8px; padding:6px 10px; margin-bottom:7px; font-size:12px;
    backdrop-filter:blur(4px);
}
.tmv3-reply-quote strong { color:#25d366; display:block; margin-bottom:2px; }
.is-mobile .tmv3-reply-quote { font-size:20px; }

.tmv3-msg-img { max-width:240px; border-radius:12px; cursor:pointer; display:block; transition:.15s; }
.tmv3-msg-img:hover { opacity:.9; transform:scale(1.01); }
.is-mobile .tmv3-msg-img { max-width:380px; }

/* Typing bar */
#tmv3-typing { height:24px; padding:0 18px; display:flex; align-items:center; flex-shrink:0; }
.tmv3-typing-text {
    color:#00a884; font-size:12px; font-style:italic; font-weight:500;
}
.is-mobile .tmv3-typing-text { font-size:20px; }

/* Only-admin banner */
#tmv3-admin-banner {
    display:none;
    background:rgba(37,211,102,.08);
    border-top:1px solid rgba(37,211,102,.15);
    padding:10px 18px;
    text-align:center; color:#8696a0; font-size:13px; flex-shrink:0;
}
#tmv3-admin-banner.show { display:block; }
.is-mobile #tmv3-admin-banner { font-size:20px; }

/* Input area */
#tmv3-reply-bar {
    display:none; background:#1a2d36; border-top:1px solid rgba(42,57,66,.6);
    padding:10px 18px; align-items:center; gap:12px; flex-shrink:0;
    animation:tmSlideUp .15s ease;
}
#tmv3-reply-bar.show { display:flex; }
#tmv3-reply-prev { flex:1; border-left:3px solid #25d366; padding-left:10px; color:#8696a0; font-size:13px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
#tmv3-reply-prev strong { color:#25d366; display:block; }
@keyframes tmSlideUp { from { transform:translateY(8px); opacity:0; } to { transform:none; opacity:1; } }

#tmv3-media-bar { display:none; background:#1a2d36; border-top:1px solid rgba(42,57,66,.6); padding:10px 18px; align-items:center; gap:12px; flex-shrink:0; }
#tmv3-media-bar.show { display:flex; }
#tmv3-media-thumb { width:60px; height:60px; border-radius:10px; object-fit:cover; }

#tmv3-input-area {
    background:#1a2d36; padding:10px 14px;
    display:flex; align-items:flex-end; gap:10px;
    border-top:1px solid rgba(42,57,66,.6); flex-shrink:0;
    box-shadow:0 -2px 16px rgba(0,0,0,.2);
    position:sticky; bottom:0;
}
.is-mobile #tmv3-input-area { padding:16px 18px 22px; gap:16px; }

#tmv3-msg-input {
    flex:1; background:#2a3942; border:1.5px solid rgba(42,57,66,.5); border-radius:26px;
    padding:10px 18px; color:#e9edef; font-size:14.5px;
    font-family:inherit; resize:none; outline:none;
    min-height:44px; max-height:130px;
    line-height:1.55; scrollbar-width:none;
    overflow-y:auto; overflow-x:hidden;
    word-wrap:break-word; word-break:break-word;
    white-space:pre-wrap; box-sizing:border-box;
    transition:border-color .2s, box-shadow .2s;
}
#tmv3-msg-input:focus {
    border-color:rgba(37,211,102,.35);
    box-shadow:0 0 0 2px rgba(37,211,102,.1);
}
#tmv3-msg-input::-webkit-scrollbar { display:none; }
.is-mobile #tmv3-msg-input { font-size:25px; padding:18px 24px; border-radius:40px; min-height:60px; }

.tmv3-act-btn {
    background:none; border:none; color:#8696a0; font-size:22px;
    cursor:pointer; width:42px; height:42px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    transition:.2s; flex-shrink:0;
}
.tmv3-act-btn:hover { background:rgba(42,57,66,.7); color:#e9edef; transform:scale(1.08); }
.is-mobile .tmv3-act-btn { width:66px; height:66px; font-size:34px; }

#tmv3-send-btn {
    background:linear-gradient(135deg,#25d366,#128c7e);
    border:none; color:#fff; width:46px; height:46px; border-radius:50%;
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    font-size:18px; transition:.2s; flex-shrink:0;
    box-shadow:0 4px 16px rgba(37,211,102,.4);
}
#tmv3-send-btn:hover { transform:scale(1.08); box-shadow:0 6px 22px rgba(37,211,102,.5); }
.is-mobile #tmv3-send-btn { width:72px; height:72px; font-size:30px; }

/* Scroll down btn */
#tmv3-scroll-down {
    position:absolute; bottom:82px; right:18px;
    background:#1f2c34; border:1.5px solid rgba(42,57,66,.7); border-radius:50%;
    width:42px; height:42px; color:#aebac1; font-size:18px;
    cursor:pointer; display:none; align-items:center; justify-content:center;
    box-shadow:0 6px 20px rgba(0,0,0,.5); z-index:10; transition:.2s;
}
#tmv3-scroll-down:hover { background:#2a3942; transform:translateY(-2px); }
#tmv3-scroll-down.show { display:flex; }
.is-mobile #tmv3-scroll-down { width:64px; height:64px; font-size:28px; bottom:110px; }

/* Context menu */
#tmv3-ctx-menu {
    position:fixed; background:#233138; border-radius:14px;
    box-shadow:0 12px 40px rgba(0,0,0,.6);
    border:1px solid rgba(42,57,66,.5);
    z-index:999999999; overflow:hidden; display:none; min-width:170px;
}
.tmv3-ctx-item {
    padding:13px 18px; color:#e9edef; font-size:14px; cursor:pointer;
    display:flex; align-items:center; gap:12px; transition:.15s;
    border-bottom:1px solid rgba(42,57,66,.25);
}
.tmv3-ctx-item:last-child { border-bottom:none; }
.tmv3-ctx-item:hover { background:#2a3942; }
.tmv3-ctx-item.danger { color:#ef4444; }
.tmv3-ctx-item i { width:16px; text-align:center; opacity:.8; }
.is-mobile .tmv3-ctx-item { font-size:22px; padding:18px 26px; }

/* ══ Lightbox ══ */
#tmv3-lightbox { display:none; position:fixed; inset:0; background:rgba(0,0,0,.95); z-index:9999999999; align-items:center; justify-content:center; }
#tmv3-lightbox.open { display:flex; animation:tmFadeIn .2s ease; }
@keyframes tmFadeIn { from { opacity:0; } to { opacity:1; } }
#tmv3-lightbox img { max-width:95vw; max-height:92vh; border-radius:10px; object-fit:contain; box-shadow:0 20px 60px rgba(0,0,0,.7); }
#tmv3-lb-close { position:absolute; top:18px; right:18px; background:rgba(31,44,52,.9); border:1px solid rgba(42,57,66,.5); color:#e9edef; width:46px; height:46px; border-radius:50%; font-size:20px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:.2s; }
#tmv3-lb-close:hover { background:#2a3942; transform:scale(1.08); }

/* ══ Side Panel (Group Info / Profile) ══ */
#tmv3-side-panel {
    width:380px; background:#111b21;
    border-left:1px solid rgba(42,57,66,.7);
    display:none; flex-direction:column;
    overflow-y:auto; flex-shrink:0;
    scrollbar-width:thin; scrollbar-color:#2a3942 transparent;
}
#tmv3-side-panel.open { display:flex; }
.is-mobile #tmv3-side-panel {
    width:100%; position:absolute; inset:0; z-index:5; display:none;
}
.is-mobile #tmv3-side-panel.open { display:flex; }

/* Header */
.tmv3-sp-header {
    background:#1f2c34;
    padding:14px 16px;
    display:flex; align-items:center; gap:12px;
    border-bottom:1px solid rgba(42,57,66,.5); flex-shrink:0;
}
.tmv3-sp-title { color:#e9edef; font-size:16px; font-weight:600; flex:1; }
.is-mobile .tmv3-sp-title { font-size:30px; }
.is-mobile .tmv3-sp-header { padding:20px 18px; gap:16px; }

/* Body */
.tmv3-sp-body { padding:0; display:flex; flex-direction:column; gap:0; }

/* Avatar section — green top bg like WhatsApp */
.tmv3-sp-avatar-wrap {
    display:flex; justify-content:center;
    padding:32px 20px 20px;
    background:linear-gradient(180deg,#1a2d36 0%,#111b21 100%);
    margin-bottom:0;
}
.tmv3-sp-avatar {
    width:120px; height:120px; border-radius:50%;
    background:linear-gradient(135deg,#2a3942,#1a2d36);
    display:flex; align-items:center; justify-content:center;
    font-size:50px; color:#aebac1; overflow:hidden; cursor:pointer;
    position:relative;
    box-shadow:0 4px 20px rgba(0,0,0,.5), 0 0 0 3px rgba(37,211,102,.25);
}
.tmv3-sp-avatar img { width:100%; height:100%; object-fit:cover; }
.tmv3-sp-avatar-edit {
    position:absolute; bottom:2px; right:2px;
    width:34px; height:34px;
    background:#25d366; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:14px; color:#111; box-shadow:0 2px 8px rgba(0,0,0,.3);
}

/* Name & email */
.tmv3-sp-name {
    color:#e9edef; font-size:20px; font-weight:700;
    text-align:center; padding:14px 20px 2px;
}
.tmv3-sp-sub {
    color:#25d366; font-size:13px; text-align:center;
    padding:0 20px 16px; font-weight:500;
}
.is-mobile .tmv3-sp-name { font-size:32px; }
.is-mobile .tmv3-sp-sub { font-size:22px; }

/* Info rows — card style */
.tmv3-sp-section {
    background:#1f2c34;
    border-radius:10px;
    margin:8px 12px;
    overflow:hidden;
}
.tmv3-sp-row {
    display:flex; align-items:center; gap:14px;
    padding:14px 16px;
    border-bottom:1px solid rgba(42,57,66,.35);
    color:#e9edef; font-size:14px; cursor:pointer;
    transition:background .15s;
}
.tmv3-sp-row:last-child { border-bottom:none; }
.tmv3-sp-row:hover { background:rgba(42,57,66,.5); }
.tmv3-sp-row i { color:#25d366; width:22px; text-align:center; font-size:16px; flex-shrink:0; }
.tmv3-sp-row .label { flex:1; color:#e9edef; font-size:14px; }
.tmv3-sp-row .value { color:#8696a0; font-size:12px; }
.is-mobile .tmv3-sp-row { font-size:24px; padding:20px 18px; }
.is-mobile .tmv3-sp-row i { font-size:24px; width:30px; }
.is-mobile .tmv3-sp-row .value { font-size:20px; }
.tmv3-sp-row.danger { color:#ef4444; }
.tmv3-sp-row.danger i { color:#ef4444; }

/* Section label */
.tmv3-sp-section-label {
    color:#25d366; font-size:12.5px; font-weight:600;
    padding:14px 16px 6px; letter-spacing:.3px;
    text-transform:uppercase;
}

.tmv3-bio-box { background:#1f2c34; border-radius:10px; padding:14px 16px; margin:8px 12px; }
.tmv3-bio-box p { color:#e9edef; font-size:14px; line-height:1.6; }
.is-mobile .tmv3-bio-box p { font-size:22px; }

/* Toggle switch */
.tmv3-toggle { position:relative; width:50px; height:28px; flex-shrink:0; }
.tmv3-toggle input { display:none; }
.tmv3-toggle-slider { position:absolute; inset:0; background:#374f5a; border-radius:28px; cursor:pointer; transition:.3s; }
.tmv3-toggle-slider::before { content:''; position:absolute; width:22px; height:22px; left:3px; bottom:3px; background:#aebac1; border-radius:50%; transition:.3s; box-shadow:0 1px 3px rgba(0,0,0,.4); }
.tmv3-toggle input:checked + .tmv3-toggle-slider { background:#25d366; }
.tmv3-toggle input:checked + .tmv3-toggle-slider::before { transform:translateX(22px); background:#fff; }

/* Member list */
.tmv3-member-item {
    display:flex; align-items:center; gap:14px;
    padding:12px 0; border-bottom:1px solid rgba(42,57,66,.4);
    cursor:pointer; transition:.15s;
}
.tmv3-member-item:hover { background:rgba(42,57,66,.3); margin:0 -20px; padding:12px 20px; }
.tmv3-member-av { width:46px; height:46px; border-radius:50%; background:linear-gradient(135deg,#2a3942,#1a2d36); display:flex; align-items:center; justify-content:center; font-size:18px; color:#8696a0; overflow:hidden; flex-shrink:0; }
.tmv3-member-av img { width:100%; height:100%; object-fit:cover; }
.tmv3-member-info { flex:1; min-width:0; }
.tmv3-member-name { color:#e9edef; font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tmv3-member-sub { color:#8696a0; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
.tmv3-member-badge { background:rgba(37,211,102,.15); color:#25d366; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; flex-shrink:0; border:1px solid rgba(37,211,102,.3); }
.tmv3-member-del { background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:.2s; }
.tmv3-member-del:hover { background:rgba(239,68,68,.15); }
.is-mobile .tmv3-member-item { padding:20px 0; gap:16px; }
.is-mobile .tmv3-member-name { font-size:25px; font-weight:600; }
.is-mobile .tmv3-member-sub { font-size:19px; }

/* ══ Modal (Add Member / Create Group / Profile Edit) ══ */
#tmv3-modal-overlay {
    display:none; position:fixed;
    top:0; left:0; width:100vw; height:100vh;
    z-index:999999995;
    background:rgba(0,0,0,.75); backdrop-filter:blur(6px);
    align-items:center; justify-content:center;
    padding:20px; box-sizing:border-box;
}
#tmv3-modal-overlay.open { display:flex; }
#tmv3-modal {
    background:#111b21; border-radius:18px;
    width:min(500px,100%); max-height:90vh;
    display:flex; flex-direction:column;
    box-shadow:0 30px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(42,57,66,.5);
    overflow:hidden; margin:auto;
}
.tmv3-modal-head { background:linear-gradient(180deg,#1a2d36,#1f2c34); padding:14px 18px; display:flex; align-items:center; gap:12px; border-bottom:1px solid rgba(42,57,66,.6); flex-shrink:0; }
.tmv3-modal-title { color:#e9edef; font-size:16px; font-weight:700; flex:1; }
.tmv3-modal-body { flex:1; overflow-y:auto; padding:18px; display:flex; flex-direction:column; gap:14px; }
.tmv3-modal-footer { padding:14px 18px; border-top:1px solid rgba(42,57,66,.5); display:flex; gap:10px; justify-content:flex-end; flex-shrink:0; }

.tmv3-btn { padding:10px 22px; border-radius:10px; border:none; cursor:pointer; font-size:14px; font-weight:600; font-family:inherit; transition:.2s; }
.tmv3-btn.primary { background:linear-gradient(135deg,#25d366,#1da851); color:#111; }
.tmv3-btn.primary:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(37,211,102,.4); }
.tmv3-btn.secondary { background:#2a3942; color:#e9edef; }
.tmv3-btn.secondary:hover { background:#374f5e; }
.tmv3-btn.danger { background:#ef4444; color:#fff; }
.tmv3-btn.danger:hover { background:#dc2626; }
.is-mobile .tmv3-btn { font-size:22px; padding:14px 30px; }

.tmv3-field { display:flex; flex-direction:column; gap:6px; }
.tmv3-field label { color:#aebac1; font-size:13px; font-weight:500; }
.tmv3-field input, .tmv3-field textarea, .tmv3-field select {
    background:#1f2c34; border:1.5px solid rgba(42,57,66,.7); border-radius:10px;
    padding:10px 14px; color:#e9edef; font-size:14px; font-family:inherit;
    outline:none; transition:.2s;
}
.tmv3-field input:focus, .tmv3-field textarea:focus {
    border-color:rgba(37,211,102,.4);
    box-shadow:0 0 0 2px rgba(37,211,102,.1);
}
.tmv3-field textarea { resize:vertical; min-height:80px; }
.is-mobile .tmv3-field input, .is-mobile .tmv3-field textarea { font-size:22px; padding:14px 18px; }

.tmv3-user-select-list { display:flex; flex-direction:column; gap:0; max-height:300px; overflow-y:auto; }
.tmv3-user-sel-item { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid rgba(42,57,66,.4); cursor:pointer; transition:.15s; }
.tmv3-user-sel-item:hover { background:rgba(42,57,66,.3); }
.tmv3-sel-check { width:22px; height:22px; border-radius:50%; border:2px solid #2a3942; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:.2s; }
.tmv3-sel-check.checked { background:linear-gradient(135deg,#25d366,#1da851); border-color:#25d366; }
.tmv3-sel-check.checked::after { content:'✓'; color:#111; font-size:13px; font-weight:800; }

.tmv3-modal-search { background:#1f2c34; border:1.5px solid rgba(42,57,66,.6); border-radius:10px; padding:10px 14px; color:#e9edef; font-size:14px; font-family:inherit; outline:none; width:100%; transition:.2s; }
.tmv3-modal-search:focus { border-color:rgba(37,211,102,.4); }
.tmv3-modal-search::placeholder { color:#8696a0; }
.is-mobile .tmv3-modal-search { font-size:22px; padding:14px 18px; }

.tmv3-empty-msg { color:#8696a0; font-size:14px; text-align:center; padding:20px 0; }
.is-mobile .tmv3-empty-msg { font-size:22px; }

/* Avatar upload label */
.tmv3-av-upload { display:flex; flex-direction:column; align-items:center; gap:12px; }
.tmv3-av-preview { width:90px; height:90px; border-radius:50%; overflow:hidden; background:#1f2c34; display:flex; align-items:center; justify-content:center; font-size:36px; color:#aebac1; cursor:pointer; position:relative; box-shadow:0 4px 16px rgba(0,0,0,.3), 0 0 0 2px rgba(37,211,102,.2); }
.tmv3-av-preview img { width:100%; height:100%; object-fit:cover; display:none; }
.tmv3-av-upload-btn { background:#2a3942; color:#e9edef; padding:8px 22px; border-radius:10px; cursor:pointer; font-size:13px; font-family:inherit; border:1px solid rgba(42,57,66,.6); transition:.2s; }
.tmv3-av-upload-btn:hover { background:#374f5e; }

/* spinner */
.tmv3-spinner { display:flex; align-items:center; justify-content:center; height:100%; }
.tmv3-spinner i { font-size:28px; color:#25d366; animation:tm-spin 1s linear infinite; }
@keyframes tm-spin { to { transform:rotate(360deg); } }

/* toast */
#tmv3-toast {
    position:fixed; bottom:30px; left:50%; transform:translateX(-50%) translateY(100px);
    background:rgba(32,44,51,.98); color:#e9edef; padding:11px 24px; border-radius:12px;
    font-size:14px; z-index:9999999998; transition:.3s; pointer-events:none;
    white-space:nowrap; box-shadow:0 6px 24px rgba(0,0,0,.5);
    border:1px solid rgba(42,57,66,.5);
}
#tmv3-toast.show { transform:translateX(-50%) translateY(0); }
.is-mobile #tmv3-toast { font-size:22px; padding:14px 30px; }

/* ══════════════════════════════════════════════════════
   MOBILE — WhatsApp exact clone design
══════════════════════════════════════════════════════ */
@media screen and (max-width: 1024px) {
    /* ── Layout ── */
    #tmv3-overlay {
        position:fixed !important; top:0 !important; left:0 !important;
        width:100vw !important; height:100dvh !important;
        padding:0 !important; background:#000 !important;
        align-items:stretch !important; justify-content:stretch !important;
    }
    #tmv3-root {
        width:100% !important; height:100% !important;
        flex-direction:column !important; border-radius:0 !important;
        background:#111b21 !important;
    }
    #tmv3-left {
        width:100% !important; max-width:100% !important; height:100% !important;
        position:absolute !important; inset:0 !important; z-index:2 !important;
        transition:transform .28s cubic-bezier(.4,0,.2,1) !important;
        background:#111b21 !important;
    }
    #tmv3-left.hidden { transform:translateX(-100%) !important; }
    #tmv3-right {
        width:100% !important; height:100% !important;
        position:absolute !important; inset:0 !important;
        transform:translateX(100%) !important;
        transition:transform .28s cubic-bezier(.4,0,.2,1) !important; z-index:3 !important;
    }
    #tmv3-right.open { transform:translateX(0) !important; }
    #tmv3-side-panel { width:100% !important; max-width:100% !important; position:absolute !important; inset:0 !important; z-index:5 !important; }
    #tmv3-close-btn { display:none !important; }
    #tmv3-bottom-nav { display:none !important; }

    /* ── LEFT HEADER ── */
    #tmv3-left-header {
        padding:28px 24px 20px !important;
        background:#111b21 !important;
        border-bottom:none !important;
        min-height:110px !important;
    }
    #tmv3-left::before { display:none !important; }
    #tmv3-app-title {
        font-size:60px !important; font-weight:900 !important;
        background:linear-gradient(135deg,#e9edef,#aebac1) !important;
        -webkit-background-clip:text !important;
        -webkit-text-fill-color:transparent !important;
        background-clip:text !important;
        letter-spacing:-0.5px !important;
    }

    /* ── Header Buttons ── */
    .tmv3-icon-btn { width:72px !important; height:72px !important; font-size:32px !important; }
    #tmv3-main-close-btn {
        display:flex !important;
        width:72px !important; height:72px !important; font-size:28px !important;
        border-width:3px !important; border-radius:50% !important;
    }
    #tmv3-back-btn { display:flex !important; width:72px !important; height:72px !important; font-size:32px !important; }
    #tmv3-chat-close-btn { display:flex !important; width:68px !important; height:68px !important; font-size:28px !important; }

    /* ── Search Bar — big rounded pill ── */
    .tmv3-search-wrap { padding:16px 18px 12px !important; }
    .tmv3-search-bar {
        padding:24px 30px !important;
        border-radius:100px !important;
        background:#202c33 !important;
        border:2px solid rgba(37,211,102,.2) !important;
        box-shadow:0 2px 12px rgba(0,0,0,.2) !important;
        gap:18px !important;
        min-height:100px !important;
    }
    .tmv3-search-bar:focus-within {
        border-color:rgba(37,211,102,.55) !important;
        background:#1f2c34 !important;
        box-shadow:0 0 0 5px rgba(37,211,102,.12) !important;
    }
    .tmv3-search-bar i { font-size:34px !important; color:#25d366 !important; }
    .tmv3-search-bar input { font-size:30px !important; color:#e9edef !important; }
    .tmv3-search-bar input::placeholder { font-size:30px !important; color:#8696a0 !important; }
    #tmv3-search-clear { width:52px !important; height:52px !important; font-size:26px !important; }

    /* ── Filter Tabs — 90px pill ── */
    .tmv3-tabs { padding:14px 18px 16px !important; gap:12px !important; }
    .tmv3-tab {
        font-size:28px !important; padding:18px 42px !important;
        border-radius:90px !important; border-width:2px !important;
        font-weight:700 !important; min-height:90px !important;
        display:flex !important; align-items:center !important;
    }

    /* ── Chat List ── */
    #tmv3-chat-list { padding:0 !important; }
    .tmv3-chat-item {
        padding:20px 22px !important; gap:20px !important;
        min-height:110px !important;
        border-bottom:1px solid rgba(42,57,66,.15) !important;
    }
    .tmv3-chat-item:hover, .tmv3-chat-item:active { background:rgba(42,57,66,.4) !important; }
    .tmv3-avatar {
        width:100px !important; height:100px !important;
        font-size:42px !important; flex-shrink:0 !important;
        border-radius:50% !important;
    }
    .tmv3-chat-name { font-size:30px !important; font-weight:700 !important; line-height:1.3 !important; }
    .tmv3-chat-preview { font-size:26px !important; margin-top:5px !important; line-height:1.4 !important; color:#8696a0 !important; }
    .tmv3-chat-time { font-size:24px !important; font-weight:400 !important; color:#8696a0 !important; }
    .tmv3-chat-meta { gap:8px !important; min-width:64px !important; align-items:flex-end !important; }
    .tmv3-unread-badge {
        font-size:22px !important; min-width:36px !important; height:36px !important;
        padding:0 10px !important; border-radius:18px !important; font-weight:700 !important;
    }

    /* ── Chat Header ── */
    #tmv3-chat-header { padding:20px 18px !important; gap:16px !important; min-height:94px !important; }
    #tmv3-hdr-av { width:68px !important; height:68px !important; font-size:30px !important; flex-shrink:0 !important; }
    #tmv3-header-name { font-size:30px !important; font-weight:800 !important; }
    #tmv3-header-sub { font-size:22px !important; }

    /* ── Dropdown ── */
    .tmv3-dropdown-menu { min-width:260px !important; border-radius:16px !important; }
    .tmv3-dropdown-item { font-size:28px !important; padding:22px 28px !important; gap:20px !important; }
    .tmv3-dropdown-item i { font-size:26px !important; }

    /* ── Messages ── */
    #tmv3-messages { padding:16px 14px !important; gap:5px !important; }
    .tmv3-msg-wrap { max-width:87% !important; }
    .tmv3-msg-av { width:50px !important; height:50px !important; font-size:22px !important; }
    .tmv3-bubble { padding:14px 18px 9px !important; border-radius:14px !important; }
    .tmv3-msg-text { font-size:28px !important; line-height:1.55 !important; }
    .tmv3-msg-time { font-size:20px !important; margin-top:5px !important; }
    .tmv3-sender { font-size:22px !important; margin-bottom:4px !important; font-weight:700 !important; }
    .tmv3-date-div span { font-size:20px !important; padding:7px 20px !important; }
    .tmv3-reply-quote { font-size:20px !important; }

    /* ── Input Area ── */
    #tmv3-input-area { padding:14px 16px 24px !important; gap:14px !important; }
    .tmv3-act-btn { width:66px !important; height:66px !important; font-size:32px !important; }
    #tmv3-msg-input {
        font-size:28px !important; padding:22px 28px !important;
        border-radius:99px !important; min-height:72px !important; line-height:1.4 !important;
    }
    #tmv3-send-btn { width:110px !important; height:110px !important; font-size:44px !important; border-radius:50% !important; flex-shrink:0 !important; }

    /* ── Scroll down ── */
    #tmv3-scroll-down { width:64px !important; height:64px !important; font-size:28px !important; bottom:110px !important; }

    /* ── Toast ── */
    #tmv3-toast { font-size:24px !important; padding:16px 32px !important; border-radius:16px !important; }

    /* ── Typing ── */
    .tmv3-typing-text { font-size:22px !important; }
    #tmv3-typing { height:30px !important; padding:0 18px !important; }
    #tmv3-admin-banner { font-size:22px !important; padding:14px 20px !important; }

    /* ── Reply bar ── */
    #tmv3-reply-bar { padding:14px 18px !important; gap:14px !important; }
    #tmv3-reply-prev { font-size:22px !important; }

    /* ── Side Panel ── */
    .tmv3-sp-header { padding:24px 20px !important; gap:16px !important; min-height:88px !important; }
    .tmv3-sp-title { font-size:30px !important; font-weight:800 !important; }
    .tmv3-sp-avatar { width:140px !important; height:140px !important; font-size:60px !important; }
    .tmv3-sp-name { font-size:32px !important; font-weight:800 !important; padding:18px 22px 4px !important; }
    .tmv3-sp-sub { font-size:22px !important; padding:0 22px 20px !important; }
    .tmv3-sp-section { margin:10px 14px !important; border-radius:14px !important; }
    .tmv3-sp-section-label { font-size:18px !important; padding:14px 18px 8px !important; }
    .tmv3-sp-row { font-size:24px !important; padding:20px 20px !important; gap:18px !important; }
    .tmv3-sp-row i { font-size:24px !important; width:30px !important; }
    .tmv3-sp-row .label { font-size:24px !important; }
    .tmv3-sp-row .value { font-size:19px !important; }
    .tmv3-bio-box p { font-size:22px !important; }
    .tmv3-member-item { padding:18px 0 !important; gap:16px !important; }
    .tmv3-member-av { width:60px !important; height:60px !important; font-size:26px !important; }
    .tmv3-member-name { font-size:24px !important; font-weight:600 !important; }
    .tmv3-member-sub { font-size:19px !important; }
    .tmv3-member-badge { font-size:16px !important; padding:5px 14px !important; }

    /* ── User Search Results ── */
    #tmv3-user-search-results { margin-top:10px !important; border-radius:20px !important; max-height:460px !important; }
    .tmv3-usr-srch-label { font-size:18px !important; padding:16px 22px 10px !important; }
    .tmv3-usr-srch-item { padding:18px 22px !important; gap:16px !important; }
    .tmv3-usr-srch-av { width:60px !important; height:60px !important; font-size:26px !important; }
    .tmv3-usr-srch-name { font-size:24px !important; font-weight:700 !important; }
    .tmv3-usr-srch-sub { font-size:18px !important; }
    .tmv3-usr-srch-action { font-size:17px !important; padding:10px 18px !important; }
    .tmv3-usr-search-loading { font-size:20px !important; padding:22px !important; }

    /* ── Modal ── */
    #tmv3-modal-overlay { align-items:flex-end !important; padding:0 !important; }
    #tmv3-modal { width:100% !important; max-width:100% !important; max-height:93dvh !important; border-radius:26px 26px 0 0 !important; margin:0 !important; }
    .tmv3-modal-title { font-size:30px !important; font-weight:800 !important; }
    .tmv3-modal-head { padding:24px 24px 18px !important; position:relative !important; }
    .tmv3-modal-head::before {
        content:'' !important; position:absolute !important; top:11px !important; left:50% !important;
        transform:translateX(-50%) !important; width:48px !important; height:5px !important;
        background:rgba(37,211,102,.35) !important; border-radius:5px !important;
    }
    .tmv3-modal-body { padding:24px 22px !important; gap:22px !important; }
    .tmv3-modal-footer { padding:18px 22px 34px !important; gap:14px !important; }
    .tmv3-btn { font-size:26px !important; padding:20px 38px !important; border-radius:14px !important; font-weight:700 !important; flex:1 !important; }
    .tmv3-field label { font-size:22px !important; font-weight:600 !important; }
    .tmv3-field input, .tmv3-field textarea, .tmv3-field select { font-size:24px !important; padding:18px 20px !important; border-radius:14px !important; }
    .tmv3-modal-search { font-size:24px !important; padding:18px 20px !important; border-radius:14px !important; }
    .tmv3-user-sel-item { padding:18px 20px !important; gap:18px !important; }
    .tmv3-sel-check { width:38px !important; height:38px !important; }
    .tmv3-sel-check.checked::after { font-size:20px !important; }
    .tmv3-empty-msg { font-size:24px !important; padding:36px 0 !important; }
    .tmv3-av-preview { width:120px !important; height:120px !important; font-size:52px !important; }
    .tmv3-av-upload-btn { font-size:22px !important; padding:14px 34px !important; border-radius:12px !important; }
    .tmv3-ctx-item { font-size:22px !important; padding:18px 24px !important; }
}
        `;
        document.head.appendChild(s);
    }

    /* ══════════════════════════════════════════════════════════
       BUILD MAIN UI
    ══════════════════════════════════════════════════════════ */
    function _buildMainUI() {
        /* Overlay */
        const overlay = document.createElement('div');
        overlay.id = 'tmv3-overlay';
        overlay.innerHTML = `
<div id="tmv3-root">

  <!-- PC Close Button -->
  <button id="tmv3-close-btn" title="বন্ধ করুন"><i class="fa fa-times"></i></button>

  <!-- LEFT PANEL -->
  <div id="tmv3-left">
    <!-- Header -->
    <div id="tmv3-left-header">
      <span id="tmv3-app-title">Chats</span>
      <div class="tmv3-header-actions">
        <div class="tmv3-dropdown" id="tmv3-left-menu-wrap">
          <button class="tmv3-icon-btn" id="tmv3-left-3dot" title="মেনু"><i class="fa fa-ellipsis-v"></i></button>
          <div class="tmv3-dropdown-menu" id="tmv3-left-menu">
            <div class="tmv3-dropdown-item" id="tmv3-btn-new-group"><i class="fa fa-users"></i> নতুন গ্রুপ</div>
            <div class="tmv3-dropdown-item" id="tmv3-btn-profile"><i class="fa fa-user-circle"></i> প্রোফাইল</div>
          </div>
        </div>
        <button id="tmv3-main-close-btn" title="বন্ধ করুন"><i class="fa fa-times"></i></button>
      </div>
    </div>

    <!-- Search -->
    <div class="tmv3-search-wrap">
      <div class="tmv3-search-bar">
        <i class="fa fa-search"></i>
        <input id="tmv3-search" placeholder="Search or start new chat" autocomplete="off">
        <button id="tmv3-search-clear" title="Clear"><i class="fa fa-times"></i></button>
      </div>
      <div id="tmv3-user-search-results"></div>
    </div>

    <!-- Tabs -->
    <div class="tmv3-tabs">
      <button class="tmv3-tab active" data-tab="all">All</button>
      <button class="tmv3-tab" data-tab="unread">Unread</button>
      <button class="tmv3-tab" data-tab="groups">Groups</button>
    </div>

    <!-- Chat List -->
    <div id="tmv3-chat-list">
      <div class="tmv3-spinner"><i class="fa fa-circle-notch"></i></div>
    </div>

  </div>

  <!-- RIGHT PANEL -->
  <div id="tmv3-right">
    <div id="tmv3-empty-right">
      <div class="tmv3-empty-icon-wrap">
        <i class="fa fa-lock"></i>
      </div>
      <p>Your messages are private.<br>Select a chat to start messaging.</p>
    </div>

    <!-- Chat Header (hidden until chat opens) -->
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
            <div class="tmv3-dropdown-item danger" id="tmv3-btn-clear-chat"><i class="fa fa-eraser"></i> Clear Chat</div>
            <div class="tmv3-dropdown-item danger" id="tmv3-btn-delete-chat"><i class="fa fa-trash"></i> Delete Chat</div>
          </div>
        </div>
        <button id="tmv3-chat-close-btn" title="বন্ধ করুন">✕</button>
      </div>
    </div>

    <!-- Messages -->
    <div id="tmv3-messages" style="display:none;"></div>

    <!-- Scroll down -->
    <button id="tmv3-scroll-down" style="display:none;" onclick="window._tmv3.scrollToBottom()">
      <i class="fa fa-chevron-down"></i>
    </button>

    <!-- Typing -->
    <div id="tmv3-typing" style="display:none;"></div>

    <!-- Admin-only banner -->
    <div id="tmv3-admin-banner">Only <strong style="color:#25d366;">admins</strong> can send messages</div>

    <!-- Reply bar -->
    <div id="tmv3-reply-bar">
      <div id="tmv3-reply-prev"></div>
      <button class="tmv3-act-btn" onclick="window._tmv3.cancelReply()"><i class="fa fa-times"></i></button>
    </div>

    <!-- Media bar -->
    <div id="tmv3-media-bar">
      <img id="tmv3-media-thumb" src="" alt="preview">
      <span style="color:#e9edef;font-size:13px;flex:1;">ছবি পাঠানো হবে</span>
      <button class="tmv3-act-btn" style="color:#ef4444;" onclick="window._tmv3.cancelMedia()"><i class="fa fa-trash"></i></button>
    </div>

    <!-- Input area -->
    <div id="tmv3-input-area" style="display:none;">
      <label class="tmv3-act-btn" for="tmv3-img-input" style="cursor:pointer;" title="ছবি পাঠান">
        <i class="fa fa-image"></i>
      </label>
      <input type="file" id="tmv3-img-input" accept="image/*" style="display:none;">
      <textarea id="tmv3-msg-input" rows="1" placeholder="মেসেজ লিখুন..."></textarea>
      <button id="tmv3-send-btn"><i class="fa fa-paper-plane"></i></button>
    </div>
  </div>

  <!-- SIDE PANEL (Group Info / User Profile) -->
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

<!-- Modal overlay -->
<div id="tmv3-modal-overlay">
  <div id="tmv3-modal"></div>
</div>

<!-- Toast -->
<div id="tmv3-toast"></div>
        `;
        document.body.appendChild(overlay);

        /* Mobile viewport fix — browser chrome থেকে সঠিক height পাওয়া */
        if (_isMobile) {
            function _fixMobileHeight() {
                var ov = document.getElementById('tmv3-overlay');
                var root = document.getElementById('tmv3-root');
                if (!ov || !root) return;
                
                // Visual Viewport API ব্যবহার করি (সবচেয়ে accurate)
                if (window.visualViewport) {
                    var vv = window.visualViewport;
                    ov.style.top    = vv.offsetTop + 'px';
                    ov.style.left   = vv.offsetLeft + 'px';
                    ov.style.width  = vv.width + 'px';
                    ov.style.height = vv.height + 'px';
                    root.style.width  = vv.width + 'px';
                    root.style.height = vv.height + 'px';
                } else {
                    // fallback: window dimensions
                    ov.style.top    = '0px';
                    ov.style.left   = '0px';
                    ov.style.width  = window.innerWidth + 'px';
                    ov.style.height = window.innerHeight + 'px';
                    root.style.width  = window.innerWidth + 'px';
                    root.style.height = window.innerHeight + 'px';
                }
            }
            
            // প্রথমবার run করো
            _fixMobileHeight();
            
            // resize এবং scroll এ আবার fix করো (address bar hide/show)
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', _fixMobileHeight);
                window.visualViewport.addEventListener('scroll', _fixMobileHeight);
            }
            window.addEventListener('resize', _fixMobileHeight);
            
            // expose for _openApp to call
            window._tmFixMobileHeight = _fixMobileHeight;
        }

        /* Bind events */
        _bindEvents();
    }

    /* ══════════════════════════════════════════════════════════
       EVENT BINDINGS
    ══════════════════════════════════════════════════════════ */
    function _bindEvents() {
        /* Close overlay on backdrop */
        document.getElementById('tmv3-overlay').addEventListener('click', function (e) {
            if (e.target === this) _closeApp();
        });

        /* PC Close button */
        const closeBtn = document.getElementById('tmv3-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', _closeApp);
        }

        /* Back btn (mobile) */
        document.getElementById('tmv3-back-btn').addEventListener('click', _closeActiveChat);

        /* Mobile close btn (X) next to 3dot */
        document.getElementById('tmv3-chat-close-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            _closeActiveChat();
        });

        /* Main popup close button (mobile) */
        var mainCloseBtn = document.getElementById('tmv3-main-close-btn');
        if (mainCloseBtn) {
            mainCloseBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                _closeApp();
            });
        }

        /* Left 3-dot menu */
        document.getElementById('tmv3-left-3dot').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('tmv3-left-menu').classList.toggle('open');
        });

        /* New group */
        document.getElementById('tmv3-btn-new-group').addEventListener('click', function () {
            document.getElementById('tmv3-left-menu').classList.remove('open');
            _showCreateGroupModal();
        });

        /* Profile */
        document.getElementById('tmv3-btn-profile').addEventListener('click', function () {
            document.getElementById('tmv3-left-menu').classList.remove('open');
            _showProfilePanel();
        });

        /* Chat 3-dot menu */
        document.getElementById('tmv3-chat-3dot').addEventListener('click', function (e) {
            e.stopPropagation();
            document.getElementById('tmv3-chat-menu').classList.toggle('open');
        });

        /* View info */
        document.getElementById('tmv3-btn-view-info').addEventListener('click', function () {
            document.getElementById('tmv3-chat-menu').classList.remove('open');
            if (_activeChat) _showInfoPanel(_activeChat);
        });

        /* Clear chat */
        document.getElementById('tmv3-btn-clear-chat').addEventListener('click', function () {
            document.getElementById('tmv3-chat-menu').classList.remove('open');
            _clearChat();
        });

        /* Delete chat */
        document.getElementById('tmv3-btn-delete-chat').addEventListener('click', function () {
            document.getElementById('tmv3-chat-menu').classList.remove('open');
            _deleteChat();
        });

        /* Chat header click → info panel */
        document.getElementById('tmv3-chat-header').addEventListener('click', function (e) {
            if (e.target.closest('.tmv3-icon-btn') || e.target.closest('#tmv3-back-btn')) return;
            if (_activeChat) _showInfoPanel(_activeChat);
        });

        /* Tabs */
        document.querySelectorAll('.tmv3-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.tmv3-tab').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                _activeTab = this.dataset.tab;
                _renderChatList();
            });
        });

        /* Search */
        /* Search clear button */
        var _clearBtn = document.getElementById('tmv3-search-clear');
        var _searchInp = document.getElementById('tmv3-search');
        if (_clearBtn && _searchInp) {
            _searchInp.addEventListener('input', function () {
                _clearBtn.classList.toggle('visible', this.value.length > 0);
            });
            _clearBtn.addEventListener('click', function () {
                _searchInp.value = '';
                _clearBtn.classList.remove('visible');
                _searchQuery = '';
                _renderChatList();
                _hideUserSearchResults();
                _searchInp.focus();
            });
        }

        /* Search clear button */
        (function() {
            var _clearBtn = document.getElementById('tmv3-search-clear');
            var _searchInp = document.getElementById('tmv3-search');
            if (_clearBtn && _searchInp) {
                _searchInp.addEventListener('input', function () {
                    _clearBtn.classList.toggle('visible', this.value.length > 0);
                });
                _clearBtn.addEventListener('click', function () {
                    _searchInp.value = '';
                    _clearBtn.classList.remove('visible');
                    _searchQuery = '';
                    _renderChatList();
                    _hideUserSearchResults();
                    _searchInp.focus();
                });
            }
        })();

        document.getElementById('tmv3-search').addEventListener('input', function () {
            const q = this.value.trim();
            _renderChatList(q);
            if (q.length >= 1) {
                _searchUsersInMain(q);
            } else {
                _hideUserSearchResults();
            }
        });

        /* Send btn */
        document.getElementById('tmv3-send-btn').addEventListener('click', _sendMessage);

        /* Textarea */
        const ta = document.getElementById('tmv3-msg-input');
        ta.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 130) + 'px';
            _sendTyping();
        });
        ta.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                _sendMessage();
            }
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

        /* Messages scroll */
        const msgArea = document.getElementById('tmv3-messages');
        msgArea.addEventListener('scroll', function () {
            _isAtBottom = (this.scrollHeight - this.scrollTop - this.clientHeight) < 60;
            document.getElementById('tmv3-scroll-down').classList.toggle('show', !_isAtBottom);
        });

        /* Context menu close */
        document.addEventListener('click', function () {
            document.getElementById('tmv3-ctx-menu').style.display = 'none';
            document.querySelectorAll('.tmv3-dropdown-menu').forEach(m => m.classList.remove('open'));
        });

        /* Lightbox close */
        document.getElementById('tmv3-lightbox').addEventListener('click', function (e) {
            if (e.target === this) this.classList.remove('open');
        });
        document.getElementById('tmv3-lb-close').addEventListener('click', function () {
            document.getElementById('tmv3-lightbox').classList.remove('open');
        });

        /* Modal close on backdrop */
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
        if (!_isMobile && window._tmChatViewport) window._tmChatViewport.open();
        document.getElementById('tmv3-overlay').classList.add('open');
        // Mobile এ open হওয়ার সাথে সাথে height fix করো
        if (_isMobile && typeof window._tmFixMobileHeight === 'function') {
            window._tmFixMobileHeight();
            setTimeout(window._tmFixMobileHeight, 100);
            setTimeout(window._tmFixMobileHeight, 300);
        }
        const closeBtn = document.getElementById('tmv3-close-btn');
        if (closeBtn) closeBtn.style.display = _isMobile ? 'none' : 'flex';
        _loadChatList();
    }

    function _closeApp() {
        document.getElementById('tmv3-overlay').classList.remove('open');
        if (!_isMobile && window._tmChatViewport) window._tmChatViewport.close();
        _unsubscribeAll();
    }

    function _unsubscribeAll() {
        if (_unsubMsg) { _unsubMsg(); _unsubMsg = null; }
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

        /* Load groups where user is member */
        _db.collection('tm_groups')
            .where('members', 'array-contains', uid)
            .onSnapshot(function (snap) {
                const groups = snap.docs.map(doc => ({
                    id: doc.id,
                    type: 'group',
                    ...doc.data()
                }));

                /* Load personal chats */
                _db.collection('tm_personal_chats')
                    .where('members', 'array-contains', uid)
                    .onSnapshot(function (psnap) {
                        const personals = psnap.docs.map(doc => ({
                            id: doc.id,
                            type: 'personal',
                            ...doc.data()
                        }));
                        const combined = [...groups, ...personals];
                        combined.sort((a, b) => {
                            const ta = a.lastMsgTs ? (a.lastMsgTs.toDate ? a.lastMsgTs.toDate() : new Date(a.lastMsgTs)) : new Date(0);
                            const tb = b.lastMsgTs ? (b.lastMsgTs.toDate ? b.lastMsgTs.toDate() : new Date(b.lastMsgTs)) : new Date(0);
                            return tb - ta;
                        });

                        if (!_chatListReady) {
                            /* প্রথমবার লোড — সব চ্যাটের lastMsgTs মনে রাখো, count বাড়িও না */
                            combined.forEach(chat => {
                                const ts = chat.lastMsgTs ? (chat.lastMsgTs.toDate ? chat.lastMsgTs.toDate().getTime() : new Date(chat.lastMsgTs).getTime()) : 0;
                                if (_lastMsgTsMap[chat.id] === undefined) {
                                    _lastMsgTsMap[chat.id] = ts;
                                }
                            });
                            _chatListReady = true;
                        } else {
                            /* পরবর্তী আপডেট — lastMsgTs বাড়লে unread count বাড়াও */
                            combined.forEach(chat => {
                                const ts = chat.lastMsgTs ? (chat.lastMsgTs.toDate ? chat.lastMsgTs.toDate().getTime() : new Date(chat.lastMsgTs).getTime()) : 0;
                                const prevTs = _lastMsgTsMap[chat.id] || 0;
                                if (ts > prevTs) {
                                    _lastMsgTsMap[chat.id] = ts;
                                    /* active chat হলে count বাড়াবো না — সে নিজে দেখছে */
                                    if (!_activeChat || _activeChat.id !== chat.id) {
                                        _unreadMap[chat.id] = (_unreadMap[chat.id] || 0) + 1;
                                    }
                                }
                            });
                        }

                        _chatList = combined;
                        _renderChatList();
                    }, () => {});
            }, () => {});
    }


    /* ══════════════════════════════════════════════════════════
       USER SEARCH in main search bar
    ══════════════════════════════════════════════════════════ */
    var _userSearchTimer = null;

    function _searchUsersInMain(q) {
        clearTimeout(_userSearchTimer);
        _userSearchTimer = setTimeout(function() {
            var resultBox = document.getElementById('tmv3-user-search-results');
            if (!resultBox) return;
            resultBox.innerHTML = '<div class="tmv3-usr-search-loading"><i class="fa fa-spinner fa-spin"></i> খুঁজছি...</div>';
            resultBox.style.display = 'block';

            if (!_db) { resultBox.style.display = 'none'; return; }

            // localStorage থেকে সব users খুঁজি
            var allUsers = [];
            try {
                var usersData = localStorage.getItem('TM_USERS');
                if (usersData) allUsers = JSON.parse(usersData);
            } catch(e) {}

            var ql = q.toLowerCase();
            var localMatches = allUsers.filter(function(u) {
                var name = (u.name || u.fullName || '').toLowerCase();
                var email = (u.email || '').toLowerCase();
                var phone = (u.phone || u.mobile || '').toLowerCase();
                var id = String(u.id || '').toLowerCase();
                return name.includes(ql) || email.includes(ql) || phone.includes(ql) || id.includes(ql);
            });

            // Firebase থেকেও খুঁজি
            _db.collection('tm_users').get().then(function(snap) {
                var fbUsers = [];
                snap.forEach(function(doc) {
                    var d = doc.data();
                    var name = (d.name || d.fullName || '').toLowerCase();
                    var email = (d.email || '').toLowerCase();
                    var phone = (d.phone || d.mobile || '').toLowerCase();
                    if (name.includes(ql) || email.includes(ql) || phone.includes(ql)) {
                        fbUsers.push({ id: doc.id, name: d.name || d.fullName || doc.id, email: d.email || '', phone: d.phone || d.mobile || '', avatar: d.avatarData || d.avatar || '' });
                    }
                });

                // merge করি (duplicate বাদ)
                var merged = fbUsers.slice();
                localMatches.forEach(function(lu) {
                    var exists = merged.find(function(fu) { return String(fu.id) === String(lu.id); });
                    if (!exists) merged.push({ id: lu.id, name: lu.name || lu.fullName || String(lu.id), email: lu.email || '', phone: lu.phone || lu.mobile || '', avatar: lu.avatarData || lu.avatar || '' });
                });

                // নিজেকে বাদ দাও
                if (_currentUser) {
                    var selfId = String(_currentUser.id);
                    merged = merged.filter(function(u) { return String(u.id) !== selfId; });
                }

                // account lock করা users বাদ দাও
                merged = merged.filter(function(u) {
                    if (u.accountLocked === true || u.accountLocked === 'true') return false;
                    return true;
                });

                _renderUserSearchResults(merged, resultBox);
            }).catch(function() {
                // Firebase fail হলে local দেখাও
                var filtered = localMatches.filter(function(u) {
                    if (!_currentUser) return true;
                    return String(u.id) !== String(_currentUser.id);
                });
                _renderUserSearchResults(filtered.map(function(u) {
                    return { id: u.id, name: u.name || String(u.id), email: u.email || '', avatar: u.avatarData || u.avatar || '' };
                }), resultBox);
            });
        }, 350);
    }

    function _renderUserSearchResults(users, resultBox) {
        if (!users || users.length === 0) {
            resultBox.style.display = 'none';
            return;
        }
        var html = '<div class="tmv3-usr-srch-label">👤 ইউজার পাওয়া গেছে</div>';
        users.slice(0, 8).forEach(function(u) {
            var av = u.avatar ? '<img src="' + u.avatar + '" alt="">' : '👤';
            var sub = u.email || u.phone || '';
            html += '<div class="tmv3-usr-srch-item" data-uid="' + _esc(String(u.id)) + '">' +
                '<div class="tmv3-usr-srch-av">' + av + '</div>' +
                '<div class="tmv3-usr-srch-info">' +
                    '<div class="tmv3-usr-srch-name">' + _esc(u.name) + '</div>' +
                    (sub ? '<div class="tmv3-usr-srch-sub">' + _esc(sub) + '</div>' : '') +
                '</div>' +
                '<div class="tmv3-usr-srch-action"><i class="fa fa-comment"></i> চ্যাট</div>' +
            '</div>';
        });
        resultBox.innerHTML = html;
        resultBox.style.display = 'block';

        // click handlers
        resultBox.querySelectorAll('.tmv3-usr-srch-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var uid = this.dataset.uid;
                var user = users.find(function(u) { return String(u.id) === uid; });
                if (user) {
                    _hideUserSearchResults();
                    document.getElementById('tmv3-search').value = '';
                    _openPersonalChat(user);
                }
            });
        });
    }

    function _hideUserSearchResults() {
        var box = document.getElementById('tmv3-user-search-results');
        if (box) box.style.display = 'none';
    }

    function _renderChatList(query) {
        const list = document.getElementById('tmv3-chat-list');
        if (!list) return;

        let filtered = _chatList.slice();

        /* Tab filter */
        if (_activeTab === 'unread') {
            filtered = filtered.filter(c => (_unreadMap[c.id] || 0) > 0);
        } else if (_activeTab === 'groups') {
            filtered = filtered.filter(c => c.type === 'group');
        }

        /* Search filter */
        if (query && query.trim()) {
            const q = query.trim().toLowerCase();
            filtered = filtered.filter(c => {
                // personal chat — memberInfo থেকে অন্য ব্যক্তির নাম নাও
                if (c.type === 'personal' && c.memberInfo && _currentUser) {
                    const uid = String(_currentUser.id);
                    const otherUid = Object.keys(c.memberInfo).find(k => k !== uid);
                    const otherName = otherUid ? (c.memberInfo[otherUid].name || '').toLowerCase() : '';
                    if (otherName && otherName.includes(q)) return true;
                }
                const name = (c.name || c.displayName || '').toLowerCase();
                return name.includes(q);
            });
        }

        if (!filtered.length) {
            list.innerHTML = `<div class="tmv3-empty-msg">কোনো চ্যাট নেই</div>`;
            return;
        }

        list.innerHTML = '';
        filtered.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'tmv3-chat-item' + (_activeChat && _activeChat.id === chat.id ? ' active' : '');
            item.dataset.id = chat.id;

            const isGroup = chat.type === 'group';
            const isPublic = chat.isPublic;
            /* personal chat এ memberInfo থেকে অন্য ব্যক্তির নাম নাও */
            let name;
            if (!isGroup && chat.memberInfo) {
                const uid = String(_currentUser.id);
                const otherUid = Object.keys(chat.memberInfo).find(k => k !== uid);
                name = otherUid ? (chat.memberInfo[otherUid].name || 'User') : (chat.name || 'Chat');
            } else {
                name = chat.name || chat.displayName || 'Chat';
            }
            const avatar = chat.avatarData || chat.avatarUrl || '';
            const lastMsg = chat.lastMsg || '';
            const lastTs = chat.lastMsgTs ? _formatTime(chat.lastMsgTs.toDate ? chat.lastMsgTs.toDate() : new Date(chat.lastMsgTs)) : '';
            const unread = _unreadMap[chat.id] || 0;

            let avClass = 'tmv3-avatar';
            if (isPublic) avClass += ' public';
            else if (isGroup) avClass += ' group';

            let avContent = avatar ? `<img src="${avatar}" alt="">` : (isGroup ? '👥' : '👤');

            item.innerHTML = `
                <div class="${avClass}">${avContent}</div>
                <div class="tmv3-chat-info">
                    <div class="tmv3-chat-name${unread > 0 ? ' has-unread' : ''}">${_esc(name)}</div>
                    <div class="tmv3-chat-preview${unread > 0 ? ' has-unread' : ''}">${_esc(lastMsg)}</div>
                </div>
                <div class="tmv3-chat-meta">
                    <div class="tmv3-chat-time${unread > 0 ? ' has-unread' : ''}">${lastTs}</div>
                    ${unread > 0 ? `<div class="tmv3-unread-badge">${unread > 99 ? '99+' : unread}</div>` : ''}
                </div>
            `;

            item.addEventListener('click', function () {
                _openChat(chat);
            });
            list.appendChild(item);
        });
    }

    /* ══════════════════════════════════════════════════════════
       OPEN CHAT
    ══════════════════════════════════════════════════════════ */
    function _openChat(chat) {
        _activeChat = chat;
        _unsubscribeAll();
        _isAtBottom = true;
        _replyTarget = null;
        _mediaPreview = null;

        /* Update active in list */
        document.querySelectorAll('.tmv3-chat-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === chat.id);
        });

        /* Show right panel */
        const right = document.getElementById('tmv3-right');
        right.querySelector('#tmv3-empty-right').style.display = 'none';
        document.getElementById('tmv3-chat-header').style.display = 'flex';
        document.getElementById('tmv3-messages').style.display = 'flex';
        document.getElementById('tmv3-typing').style.display = 'flex';
        document.getElementById('tmv3-input-area').style.display = 'flex';

        if (_isMobile) {
            document.getElementById('tmv3-left').classList.add('hidden');
            right.classList.add('open');
        }

        /* Header */
        const isGroup = chat.type === 'group';
        /* personal chat এ অন্য ব্যক্তির নাম header এ দেখাও */
        let name;
        if (!isGroup && chat.memberInfo) {
            const uid2 = String(_currentUser.id);
            const otherUid2 = Object.keys(chat.memberInfo).find(k => k !== uid2);
            name = otherUid2 ? (chat.memberInfo[otherUid2].name || 'User') : (chat.name || 'Chat');
        } else {
            name = chat.name || chat.displayName || 'Chat';
        }
        const avatar = chat.avatarData || chat.avatarUrl || '';
        const hdrAv = document.getElementById('tmv3-hdr-av');
        hdrAv.className = 'tmv3-avatar' + (chat.isPublic ? ' public' : isGroup ? ' group' : '');
        hdrAv.style.cssText = 'width:42px;height:42px;font-size:18px;flex-shrink:0;';
        hdrAv.innerHTML = avatar ? `<img src="${avatar}" alt="">` : (isGroup ? '👥' : '👤');
        document.getElementById('tmv3-header-name').textContent = name;

        if (isGroup) {
            const members = chat.members ? chat.members.length : 0;
            document.getElementById('tmv3-header-sub').textContent = members + ' জন সদস্য';
        } else {
            document.getElementById('tmv3-header-sub').textContent = 'online';
        }

        /* Reply / media bar clear */
        document.getElementById('tmv3-reply-bar').classList.remove('show');
        document.getElementById('tmv3-media-bar').classList.remove('show');

        /* Check if user can send message */
        _checkSendPermission(chat);

        /* Subscribe messages */
        _subscribeMessages(chat);

        /* Unread clear */
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
        document.getElementById('tmv3-messages').style.display = 'none';
        document.getElementById('tmv3-typing').style.display = 'none';
        document.getElementById('tmv3-input-area').style.display = 'none';
        document.getElementById('tmv3-admin-banner').classList.remove('show');
        document.getElementById('tmv3-empty-right').style.display = 'flex';
        _closeSidePanel();
    }

    function _checkSendPermission(chat) {
        const banner = document.getElementById('tmv3-admin-banner');
        const inputArea = document.getElementById('tmv3-input-area');
        if (chat.type === 'group' && chat.allowMemberMsg === false) {
            const uid = String(_currentUser.id);
            const isMainAdmin = _currentUser.role === 'admin';
            const isAdmin = chat.adminId === uid || isMainAdmin;
            if (!isAdmin) {
                banner.classList.add('show');
                inputArea.style.display = 'none';
                return;
            }
        }
        banner.classList.remove('show');
        inputArea.style.display = 'flex';
    }

    /* ══════════════════════════════════════════════════════════
       MESSAGES
    ══════════════════════════════════════════════════════════ */
    function _getMessagesPath(chat) {
        if (chat.type === 'group') {
            return _db.collection('tm_groups').doc(chat.id).collection('messages');
        } else {
            return _db.collection('tm_personal_chats').doc(chat.id).collection('messages');
        }
    }

    function _subscribeMessages(chat) {
        if (!_db) return;
        const area = document.getElementById('tmv3-messages');
        area.innerHTML = '<div class="tmv3-spinner"><i class="fa fa-circle-notch"></i></div>';

        let _firstLoad = true;
        _unsubMsg = _getMessagesPath(chat)
            .orderBy('ts', 'asc').limitToLast(MAX_MSG)
            .onSnapshot(function (snap) {
                _firstLoad = false;
                _renderMessages(snap.docs, chat);
                _listenTyping(chat);
                _markSeen(snap.docs, chat);
            }, function () {
                area.innerHTML = '<div class="tmv3-empty-msg">মেসেজ লোড করতে সমস্যা হচ্ছে।</div>';
            });
    }

    let _lastMsgDate = null;

    function _renderMessages(docs, chat) {
        const area = document.getElementById('tmv3-messages');
        if (!area) return;
        _lastMsgDate = null;

        if (!docs.length) {
            area.innerHTML = `<div class="tmv3-empty-msg" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;"><i class="fa fa-comments" style="font-size:48px;opacity:.2;"></i><p>এখনো কোনো মেসেজ নেই। প্রথম মেসেজ পাঠান! 👋</p></div>`;
            return;
        }

        const frag = document.createDocumentFragment();
        docs.forEach(doc => frag.appendChild(_createMsgEl(doc.id, doc.data())));
        area.innerHTML = '';
        area.appendChild(frag);

        if (_isAtBottom) area.scrollTop = area.scrollHeight;
    }

    function _createMsgEl(docId, data) {
        const frag = document.createDocumentFragment();
        const isOwn = _currentUser && String(data.senderId) === String(_currentUser.id);

        /* Date divider */
        if (data.ts) {
            const d = data.ts.toDate ? data.ts.toDate() : new Date(data.ts);
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

        /* Avatar */
        const av = document.createElement('div');
        av.className = 'tmv3-msg-av';
        av.innerHTML = data.senderAvatar ? `<img src="${data.senderAvatar}" alt="">` : '<i class="fa fa-user"></i>';

        /* Bubble */
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

        if (data.imgData) {
            const img = document.createElement('img');
            img.className = 'tmv3-msg-img';
            img.src = data.imgData; img.alt = '📷'; img.loading = 'lazy';
            img.addEventListener('click', () => _openLightbox(data.imgData));
            bubble.appendChild(img);
        }

        if (data.text) {
            const txt = document.createElement('div');
            txt.className = 'tmv3-msg-text';
            txt.textContent = data.text;
            bubble.appendChild(txt);
        }

        /* time row — below text, right aligned */
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

        wrap.appendChild(isOwn ? bubble : av);
        wrap.appendChild(isOwn ? av : bubble);
        if (!isOwn) { wrap.removeChild(wrap.children[1]); wrap.insertBefore(bubble, wrap.children[1] || null); wrap.insertBefore(av, bubble); }

        /* fix order */
        wrap.innerHTML = '';
        if (isOwn) { wrap.appendChild(bubble); wrap.appendChild(av); }
        else { wrap.appendChild(av); wrap.appendChild(bubble); }

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
                const prev = document.getElementById('tmv3-reply-prev');
                prev.innerHTML = `<strong>${_esc(_replyTarget.senderName)}</strong>${_esc(_replyTarget.text)}`;
                document.getElementById('tmv3-reply-bar').classList.add('show');
                document.getElementById('tmv3-msg-input').focus();
            };
            document.getElementById('tmv3-ctx-copy').onclick = function () {
                menu.style.display = 'none';
                if (data.text) navigator.clipboard.writeText(data.text).catch(() => {});
            };
            const delBtn = document.getElementById('tmv3-ctx-delete');
            delBtn.style.display = isOwn ? 'flex' : 'none';
            delBtn.onclick = function () { menu.style.display = 'none'; _deleteMsg(docId); };
            menu.style.cssText = `display:block;left:${Math.min(x, window.innerWidth-180)}px;top:${Math.min(y, window.innerHeight-120)}px;`;
        }

        el.addEventListener('contextmenu', function (e) { e.preventDefault(); show(e.clientX, e.clientY); });
        el.addEventListener('touchstart', function (e) { timer = setTimeout(() => show(e.touches[0].clientX, e.touches[0].clientY), 600); }, { passive: true });
        el.addEventListener('touchend', () => clearTimeout(timer));
        el.addEventListener('touchmove', () => clearTimeout(timer));
    }

    function _sendMessage() {
        if (!_db || !_currentUser || !_activeChat) return;
        const ta = document.getElementById('tmv3-msg-input');
        const text = ta.value.trim();
        if (!text && !_mediaPreview) return;

        /* Check permission */
        const chat = _activeChat;
        if (chat.type === 'group' && chat.allowMemberMsg === false) {
            const uid = String(_currentUser.id);
            const isMainAdmin = _currentUser.role === 'admin';
            if (chat.adminId !== uid && !isMainAdmin) { _toast('শুধু এডমিন মেসেজ পাঠাতে পারবেন।'); return; }
        }

        const msg = {
            text: text,
            senderId: String(_currentUser.id),
            senderName: _currentUser.name || _currentUser.email || String(_currentUser.id),
            senderAvatar: _currentUser.avatar || _currentUser.profileImage || '',
            ts: firebase.firestore.FieldValue.serverTimestamp(),
            seenBy: [String(_currentUser.id)]
        };

        if (_replyTarget) {
            msg.replyTo = { id: _replyTarget.id, senderName: _replyTarget.senderName, text: _replyTarget.text };
        }
        if (_mediaPreview) msg.imgData = _mediaPreview;

        const lastMsg = text || '📷 ছবি';

        _getMessagesPath(chat).add(msg).then(() => {
            ta.value = ''; ta.style.height = 'auto';
            _cancelReply(); _cancelMedia(); _clearTypingDoc();
            /* update lastMsg on chat doc */
            const ref = chat.type === 'group'
                ? _db.collection('tm_groups').doc(chat.id)
                : _db.collection('tm_personal_chats').doc(chat.id);
            ref.update({ lastMsg, lastMsgTs: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
            setTimeout(() => {
                const area = document.getElementById('tmv3-messages');
                if (area) { area.scrollTop = area.scrollHeight; _isAtBottom = true; }
            }, 100);
        }).catch(err => console.error('[send]', err));
    }

    function _deleteMsg(docId) {
        if (!_db || !_activeChat) return;
        if (!confirm('এই মেসেজ মুছে ফেলবেন?')) return;
        _getMessagesPath(_activeChat).doc(docId).delete();
    }

    function _markSeen(docs, chat) {
        if (!_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        docs.forEach(doc => {
            const d = doc.data();
            if (d.senderId !== uid && (!d.seenBy || !d.seenBy.includes(uid))) {
                doc.ref.update({ seenBy: firebase.firestore.FieldValue.arrayUnion(uid) }).catch(()=>{});
            }
        });
    }

    function _clearChat() {
        if (!_db || !_activeChat) return;
        if (!confirm('এই চ্যাটের সব মেসেজ ক্লিয়ার করবেন?')) return;
        _getMessagesPath(_activeChat).get().then(snap => {
            const batch = _db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            return batch.commit();
        }).then(() => _toast('চ্যাট ক্লিয়ার হয়েছে')).catch(()=>{});
    }

    function _deleteChat() {
        if (!_db || !_activeChat) return;
        const chat = _activeChat;
        if (chat.type === 'group' && chat.isPublic) { _toast('সাবজনীন গ্রুপ মুছতে পারবেন না।'); return; }
        if (!confirm('পুরো চ্যাট ডিলিট করবেন?')) return;
        /* remove user from members or delete personal */
        if (chat.type === 'group') {
            const uid = String(_currentUser.id);
            _db.collection('tm_groups').doc(chat.id).update({
                members: firebase.firestore.FieldValue.arrayRemove(uid)
            }).then(() => { _closeActiveChat(); _toast('গ্রুপ থেকে বের হয়েছেন'); }).catch(()=>{});
        } else {
            _db.collection('tm_personal_chats').doc(chat.id).delete()
                .then(() => { _closeActiveChat(); _toast('চ্যাট ডিলিট হয়েছে'); }).catch(()=>{});
        }
    }

    /* ══════════════════════════════════════════════════════════
       TYPING
    ══════════════════════════════════════════════════════════ */
    function _sendTyping() {
        if (!_db || !_currentUser || !_activeChat) return;
        clearTimeout(_typingTimer);
        const ref = _activeChat.type === 'group'
            ? _db.collection('tm_groups').doc(_activeChat.id).collection('typing')
            : _db.collection('tm_personal_chats').doc(_activeChat.id).collection('typing');
        ref.doc(String(_currentUser.id)).set({
            name: _currentUser.name || '',
            ts: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(()=>{});
        _typingTimer = setTimeout(_clearTypingDoc, TYPING_TTL);
    }

    function _clearTypingDoc() {
        if (!_db || !_currentUser || !_activeChat) return;
        const ref = _activeChat.type === 'group'
            ? _db.collection('tm_groups').doc(_activeChat.id).collection('typing')
            : _db.collection('tm_personal_chats').doc(_activeChat.id).collection('typing');
        ref.doc(String(_currentUser.id)).delete().catch(()=>{});
    }

    function _listenTyping(chat) {
        if (!_db || _unsubTyping) return;
        const ref = chat.type === 'group'
            ? _db.collection('tm_groups').doc(chat.id).collection('typing')
            : _db.collection('tm_personal_chats').doc(chat.id).collection('typing');
        _unsubTyping = ref.onSnapshot(snap => {
            const bar = document.getElementById('tmv3-typing');
            if (!bar) return;
            const uid = String(_currentUser.id);
            const names = snap.docs.filter(d => d.id !== uid).map(d => d.data().name);
            bar.innerHTML = names.length ? `<span class="tmv3-typing-text">${names.length === 1 ? _esc(names[0]) + ' টাইপ করছে...' : names.length + ' জন টাইপ করছে...'}</span>` : '';
        }, ()=>{});
    }

    /* ══════════════════════════════════════════════════════════
       CREATE GROUP
    ══════════════════════════════════════════════════════════ */
    function _showCreateGroupModal() {
        if (!_currentUser) { _toast('লগইন করুন।'); return; }
        const modal = document.getElementById('tmv3-modal');
        modal.innerHTML = `
            <div class="tmv3-modal-head">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-arrow-left"></i></button>
                <span class="tmv3-modal-title">নতুন গ্রুপ তৈরি করুন</span>
            </div>
            <div class="tmv3-modal-body">
                <div class="tmv3-av-upload">
                    <label class="tmv3-sp-avatar" id="cg-av-label" for="cg-av-input" style="width:90px;height:90px;font-size:36px;cursor:pointer;">
                        👥
                        <img id="cg-av-img" src="" alt="" style="display:none;">
                        <span class="tmv3-sp-avatar-edit"><i class="fa fa-camera"></i></span>
                    </label>
                    <input type="file" id="cg-av-input" accept="image/*" style="display:none;">
                </div>
                <div class="tmv3-field">
                    <label>গ্রুপের নাম *</label>
                    <input type="text" id="cg-name" placeholder="গ্রুপের নাম লিখুন" maxlength="100">
                </div>
                <div class="tmv3-field">
                    <label>বিবরণ (ঐচ্ছিক)</label>
                    <textarea id="cg-desc" placeholder="গ্রুপের বিবরণ..."></textarea>
                </div>
            </div>
            <div class="tmv3-modal-footer">
                <button class="tmv3-btn secondary" onclick="window._tmv3._closeModal()">বাতিল</button>
                <button class="tmv3-btn primary" id="cg-next-btn">পরবর্তী →</button>
            </div>
        `;
        document.getElementById('tmv3-modal-overlay').classList.add('open');

        /* Avatar input */
        let cgAvData = '';
        document.getElementById('cg-av-input').addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const r = new FileReader();
            r.onload = e => {
                cgAvData = e.target.result;
                const img = document.getElementById('cg-av-img');
                img.src = cgAvData; img.style.display = 'block';
                document.getElementById('cg-av-label').querySelector('i').style.display = 'none';
            };
            r.readAsDataURL(this.files[0]);
            this.value = '';
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
        const uid = String(_currentUser.id);
        const groupData = {
            name, desc,
            avatarData: avatarData || '',
            isPublic: false,
            adminId: uid,
            members: [uid],
            allowMemberAdd: false,
            allowMemberMsg: true,
            createdBy: uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMsg: '',
            lastMsgTs: firebase.firestore.FieldValue.serverTimestamp()
        };
        _db.collection('tm_groups').add(groupData).then(ref => {
            _closeModal();
            _toast('গ্রুপ তৈরি হয়েছে! 🎉');
            /* Open the group */
            setTimeout(() => {
                _openChat({ id: ref.id, type: 'group', ...groupData });
            }, 500);
        }).catch(() => _toast('গ্রুপ তৈরিতে সমস্যা হয়েছে।'));
    }

    /* ══════════════════════════════════════════════════════════
       PERSONAL CHAT (search & open)
    ══════════════════════════════════════════════════════════ */
    function _openPersonalChat(otherUser) {
        if (!_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        const oid = String(otherUser.id);
        /* create deterministic chat id */
        const chatId = uid < oid ? uid + '_' + oid : oid + '_' + uid;

        _db.collection('tm_personal_chats').doc(chatId).set({
            members: [uid, oid],
            memberInfo: {
                [uid]: { name: _currentUser.name || '', avatar: _currentUser.avatar || '' },
                [oid]: { name: otherUser.name || '', avatar: otherUser.avatar || '' }
            },
            type: 'personal',
            lastMsg: '',
            lastMsgTs: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            const displayName = otherUser.name || otherUser.email || oid;
            _openChat({
                id: chatId, type: 'personal',
                name: displayName,
                displayName,
                avatarData: otherUser.avatar || '',
                members: [uid, oid]
            });
            _closeModal();
        }).catch(() => {});
    }

    /* ══════════════════════════════════════════════════════════
       INFO PANEL (Group / Personal)
    ══════════════════════════════════════════════════════════ */
    function _showInfoPanel(chat) {
        const panel = document.getElementById('tmv3-side-panel');
        panel.classList.add('open');

        if (chat.type === 'group') {
            _buildGroupInfoPanel(chat, panel);
        } else {
            _buildPersonalInfoPanel(chat, panel);
        }
    }

    function _closeSidePanel() {
        document.getElementById('tmv3-side-panel').classList.remove('open');
    }

    function _buildGroupInfoPanel(chat, panel) {
        const uid = String(_currentUser.id);
        // সাবজনীন গ্রুপে মেইন এডমিন (role='admin') সবসময় এডমিন
        const isMainAdmin = _currentUser.role === 'admin';
        const isAdmin = chat.adminId === uid || isMainAdmin;
        const isPublicGroup = chat.isPublic === true;
        const name = chat.name || 'Group';
        const avatar = chat.avatarData || '';
        const members = chat.members || [];

        panel.innerHTML = `
            <div class="tmv3-sp-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeSidePanel()"><i class="fa fa-times"></i></button>
                <span class="tmv3-sp-title">Group info</span>
                ${isAdmin ? `<button class="tmv3-icon-btn" id="sp-edit-group" title="সম্পাদনা করুন"><i class="fa fa-edit"></i></button>` : ''}
            </div>
            <div class="tmv3-sp-body">
                <div class="tmv3-sp-avatar-wrap">
                    <div class="tmv3-sp-avatar ${isPublicGroup ? 'public' : 'group'}" id="sp-av" ${isAdmin && !isPublicGroup ? 'style="cursor:pointer;"' : ''}>
                        ${avatar ? `<img src="${avatar}" alt="">` : '👥'}
                        ${isAdmin && !isPublicGroup ? '<span class="tmv3-sp-avatar-edit"><i class="fa fa-camera"></i></span>' : ''}
                    </div>
                </div>
                <div class="tmv3-sp-name">${_esc(name)}</div>
                <div class="tmv3-sp-sub">${isPublicGroup ? '🌐 সাবজনীন গ্রুপ · ' : 'Group · '}<span style="color:#25d366;">${members.length} members</span></div>

                ${chat.desc ? `<div class="tmv3-bio-box" style="margin-bottom:16px;"><p>${_esc(chat.desc)}</p></div>` : ''}

                ${isAdmin ? `
                <div class="tmv3-sp-section">
                    <div class="tmv3-sp-row" id="sp-group-settings">
                        <i class="fa fa-cog"></i>
                        <span class="label">Group Settings</span>
                        <i class="fa fa-chevron-right" style="color:#8696a0;"></i>
                    </div>
                </div>` : ''}

                <div class="tmv3-sp-section">
                    <div style="color:#8696a0;font-size:13px;padding:16px 0 10px;font-weight:600;">${members.length} MEMBERS</div>
                    ${isAdmin ? `
                    <div class="tmv3-member-item" id="sp-add-member-btn" style="cursor:pointer;">
                        <div class="tmv3-member-av" style="background:#25d366;"><i class="fa fa-user-plus" style="color:#fff;"></i></div>
                        <div class="tmv3-member-info"><div class="tmv3-member-name" style="color:#25d366;">Add member</div></div>
                    </div>` : (chat.allowMemberAdd ? `
                    <div class="tmv3-member-item" id="sp-add-member-btn" style="cursor:pointer;">
                        <div class="tmv3-member-av" style="background:#25d366;"><i class="fa fa-user-plus" style="color:#fff;"></i></div>
                        <div class="tmv3-member-info"><div class="tmv3-member-name" style="color:#25d366;">Add member</div></div>
                    </div>` : '')}
                    <div id="sp-members-list"><div class="tmv3-spinner" style="height:60px;"><i class="fa fa-circle-notch"></i></div></div>
                </div>

                <div class="tmv3-sp-section" style="margin-top:16px;">
                    ${!isPublicGroup ? `<div class="tmv3-sp-row danger" id="sp-leave-group"><i class="fa fa-sign-out-alt"></i><span class="label">Exit group</span></div>` : ''}
                    ${isAdmin && !isPublicGroup ? `<div class="tmv3-sp-row danger" id="sp-delete-group"><i class="fa fa-trash"></i><span class="label">Delete group</span></div>` : ''}
                </div>
            </div>
        `;

        /* Load members */
        _loadGroupMembers(chat, isAdmin);

        /* Add member btn */
        const addBtn = panel.querySelector('#sp-add-member-btn');
        if (addBtn) addBtn.addEventListener('click', () => _showAddMemberModal(chat));

        /* Group settings (admin) */
        const settingsBtn = panel.querySelector('#sp-group-settings');
        if (settingsBtn) settingsBtn.addEventListener('click', () => _showGroupSettingsModal(chat));

        /* Leave group */
        const leaveBtn = panel.querySelector('#sp-leave-group');
        if (leaveBtn) leaveBtn.addEventListener('click', () => {
            if (!confirm('গ্রুপ থেকে বের হবেন?')) return;
            _db.collection('tm_groups').doc(chat.id).update({
                members: firebase.firestore.FieldValue.arrayRemove(uid)
            }).then(() => { _closeActiveChat(); _closeSidePanel(); _toast('গ্রুপ থেকে বের হয়েছেন।'); }).catch(()=>{});
        });

        /* Delete group (admin) */
        const delBtn = panel.querySelector('#sp-delete-group');
        if (delBtn) delBtn.addEventListener('click', () => {
            if (!confirm('পুরো গ্রুপ ডিলিট করবেন? এটি সকল সদস্যের কাছ থেকে মুছে যাবে।')) return;
            _db.collection('tm_groups').doc(chat.id).delete()
                .then(() => { _closeActiveChat(); _closeSidePanel(); _toast('গ্রুপ ডিলিট হয়েছে।'); }).catch(()=>{});
        });
    }

    function _loadGroupMembers(chat, isAdmin) {
        if (!_db) return;
        const uid = String(_currentUser.id);
        const members = chat.members || [];
        const list = document.getElementById('sp-members-list');
        if (!list) return;
        list.innerHTML = '<div class="tmv3-spinner" style="height:60px;"><i class="fa fa-circle-notch"></i></div>';

        if (!members.length) { list.innerHTML = '<div class="tmv3-empty-msg">সদস্য নেই</div>'; return; }

        /* সব member-এর user data একসাথে লোড */
        const promises = members.map(mid => _db.collection('users').doc(String(mid)).get().catch(() => null));
        Promise.all(promises).then(docs => {
            list.innerHTML = '';
            docs.forEach((doc, i) => {
                const mid = members[i];
                const udata = (doc && doc.exists) ? doc.data() : {};
                const mname = udata.name || udata.email || String(mid);
                const mavatar = udata.avatar || udata.profileImage || '';
                const mbio = udata.bio || '';
                const isAdminMember = String(mid) === chat.adminId;
                const isSelf = String(mid) === uid;

                const item = document.createElement('div');
                item.className = 'tmv3-member-item';
                item.innerHTML = `
                    <div class="tmv3-member-av">${mavatar ? `<img src="${mavatar}" alt="">` : '<i class="fa fa-user"></i>'}</div>
                    <div class="tmv3-member-info">
                        <div class="tmv3-member-name">${_esc(isSelf ? 'You (' + mname + ')' : mname)}</div>
                        <div class="tmv3-member-sub">${_esc(mbio || (udata.mobile || udata.email || String(mid)))}</div>
                    </div>
                    ${isAdminMember ? '<span class="tmv3-member-badge">Admin</span>' : ''}
                    ${isAdmin && !isSelf ? `<button class="tmv3-member-del" data-mid="${_esc(String(mid))}" title="সরিয়ে দিন"><i class="fa fa-times"></i></button>` : ''}
                `;

                /* Click to open personal chat */
                item.querySelector('.tmv3-member-info').addEventListener('click', () => {
                    if (!isSelf) _openPersonalChat({ id: mid, name: mname, avatar: mavatar });
                });

                /* Remove member btn */
                const delBtn = item.querySelector('.tmv3-member-del');
                if (delBtn) delBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    const mid2 = delBtn.dataset.mid;
                    if (!confirm('এই সদস্যকে গ্রুপ থেকে বের করবেন?')) return;
                    _db.collection('tm_groups').doc(chat.id).update({
                        members: firebase.firestore.FieldValue.arrayRemove(mid2)
                    }).then(() => {
                        chat.members = chat.members.filter(m => String(m) !== mid2);
                        _loadGroupMembers(chat, isAdmin);
                        _toast('সদস্য সরানো হয়েছে।');
                    }).catch(()=>{});
                });

                list.appendChild(item);
            });
        }).catch(() => {
            list.innerHTML = '<div class="tmv3-empty-msg">সদস্য তালিকা লোড হচ্ছে না।</div>';
        });
    }

    function _buildPersonalInfoPanel(chat, panel) {
        const uid = String(_currentUser.id);
        const otherId = (chat.members || []).find(m => String(m) !== uid);
        const memberInfo = chat.memberInfo || {};
        const otherInfo = otherId ? (memberInfo[String(otherId)] || {}) : {};
        const name = chat.name || otherInfo.name || 'User';
        const avatar = chat.avatarData || otherInfo.avatar || '';

        panel.innerHTML = `
            <div class="tmv3-sp-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeSidePanel()"><i class="fa fa-times"></i></button>
                <span class="tmv3-sp-title">Contact info</span>
            </div>
            <div class="tmv3-sp-body">
                <div class="tmv3-sp-avatar-wrap">
                    <div class="tmv3-sp-avatar">
                        ${avatar ? `<img src="${avatar}" alt="">` : '👤'}
                    </div>
                </div>
                <div class="tmv3-sp-name" id="sp-other-name">${_esc(name)}</div>
                <div class="tmv3-sp-sub" id="sp-other-sub">Loading...</div>
                <div id="sp-other-bio" class="tmv3-bio-box" style="display:none;"><p></p></div>
                <div class="tmv3-sp-section">
                    <div class="tmv3-sp-row danger" id="sp-block-user"><i class="fa fa-ban"></i><span class="label">Block</span></div>
                    <div class="tmv3-sp-row danger" id="sp-delete-contact"><i class="fa fa-trash"></i><span class="label">Delete chat</span></div>
                </div>
            </div>
        `;

        /* Load other user data */
        if (otherId && _db) {
            _db.collection('users').doc(String(otherId)).get().then(doc => {
                if (!doc || !doc.exists) return;
                const d = doc.data();
                const n = d.name || d.email || String(otherId);
                document.getElementById('sp-other-name').textContent = n;
                const sub = d.mobile || d.email || '';
                document.getElementById('sp-other-sub').textContent = sub;
                if (d.bio) {
                    const bioBox = document.getElementById('sp-other-bio');
                    bioBox.style.display = 'block';
                    bioBox.querySelector('p').textContent = d.bio;
                }
            }).catch(()=>{});
        }

        /* Block */
        panel.querySelector('#sp-block-user').addEventListener('click', () => {
            if (!confirm('এই ব্যক্তিকে ব্লক করবেন?')) return;
            _toast('ব্লক করা হয়েছে।'); // implement as needed
            _closeSidePanel();
        });

        /* Delete chat */
        panel.querySelector('#sp-delete-contact').addEventListener('click', () => {
            _closeSidePanel();
            _deleteChat();
        });
    }

    /* ══════════════════════════════════════════════════════════
       GROUP SETTINGS MODAL
    ══════════════════════════════════════════════════════════ */
    function _showGroupSettingsModal(chat) {
        const uid = String(_currentUser.id);
        const isPublicGroup = chat.isPublic === true;
        const modal = document.getElementById('tmv3-modal');
        modal.innerHTML = `
            <div class="tmv3-modal-head">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-arrow-left"></i></button>
                <span class="tmv3-modal-title">Group Settings</span>
            </div>
            <div class="tmv3-modal-body">
                <div class="tmv3-sp-row" style="padding:14px 0;border-bottom:1px solid #2a3942;">
                    <i class="fa fa-user-shield" style="color:#8696a0;font-size:16px;"></i>
                    <span class="label" style="color:#e9edef;font-size:14px;">Admin পরিবর্তন করুন</span>
                    <button class="tmv3-btn secondary" id="gs-change-admin" style="padding:6px 14px;font-size:12px;">পরিবর্তন</button>
                </div>
                ${isPublicGroup ? `
                <div class="tmv3-sp-row" style="padding:14px 0;border-bottom:1px solid #2a3942;">
                    <i class="fa fa-users" style="color:#25d366;font-size:16px;"></i>
                    <div style="flex:1;">
                        <div style="color:#e9edef;font-size:14px;">সকল ইউজার সিঙ্ক করুন</div>
                        <div style="color:#8696a0;font-size:12px;">সকল registered ইউজারকে সাবজনীন গ্রুপে যোগ করুন</div>
                    </div>
                    <button class="tmv3-btn primary" id="gs-sync-users" style="padding:6px 14px;font-size:12px;">Sync</button>
                </div>` : ''}
                <div class="tmv3-sp-row" style="padding:14px 0;border-bottom:1px solid #2a3942;">
                    <i class="fa fa-user-plus" style="color:#8696a0;font-size:16px;"></i>
                    <div style="flex:1;">
                        <div style="color:#e9edef;font-size:14px;">সদস্যরা মেম্বার যোগ করতে পারবে?</div>
                        <div style="color:#8696a0;font-size:12px;">অন করলে সদস্যরাও মেম্বার যোগ করতে পারবে</div>
                    </div>
                    <label class="tmv3-toggle"><input type="checkbox" id="gs-allow-add" ${chat.allowMemberAdd ? 'checked' : ''}><span class="tmv3-toggle-slider"></span></label>
                </div>
                <div class="tmv3-sp-row" style="padding:14px 0;border-bottom:1px solid #2a3942;">
                    <i class="fa fa-comment" style="color:#8696a0;font-size:16px;"></i>
                    <div style="flex:1;">
                        <div style="color:#e9edef;font-size:14px;">সদস্যরা মেসেজ পাঠাতে পারবে?</div>
                        <div style="color:#8696a0;font-size:12px;">বন্ধ করলে শুধু এডমিন মেসেজ পাঠাতে পারবেন</div>
                    </div>
                    <label class="tmv3-toggle"><input type="checkbox" id="gs-allow-msg" ${chat.allowMemberMsg !== false ? 'checked' : ''}><span class="tmv3-toggle-slider"></span></label>
                </div>
            </div>
            <div class="tmv3-modal-footer">
                <button class="tmv3-btn secondary" onclick="window._tmv3._closeModal()">বাতিল</button>
                <button class="tmv3-btn primary" id="gs-save-btn">সেভ করুন</button>
            </div>
        `;
        document.getElementById('tmv3-modal-overlay').classList.add('open');

        document.getElementById('gs-change-admin').addEventListener('click', () => _showChangeAdminModal(chat));

        /* Sync all users to public group */
        const syncBtn = document.getElementById('gs-sync-users');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                syncBtn.textContent = 'Syncing...';
                syncBtn.disabled = true;
                _db.collection('users').get().then(snap => {
                    const allUids = snap.docs.map(d => d.id);
                    return _db.collection('tm_groups').doc(chat.id).update({
                        members: allUids
                    });
                }).then(() => {
                    _toast('✅ সকল ইউজার সাবজনীন গ্রুপে যোগ হয়েছে!');
                    syncBtn.textContent = '✓ Done';
                }).catch(() => {
                    _toast('Sync করতে সমস্যা হয়েছে।');
                    syncBtn.textContent = 'Sync';
                    syncBtn.disabled = false;
                });
            });
        }

        document.getElementById('gs-save-btn').addEventListener('click', () => {
            const allowAdd = document.getElementById('gs-allow-add').checked;
            const allowMsg = document.getElementById('gs-allow-msg').checked;
            _db.collection('tm_groups').doc(chat.id).update({ allowMemberAdd: allowAdd, allowMemberMsg: allowMsg })
                .then(() => {
                    chat.allowMemberAdd = allowAdd;
                    chat.allowMemberMsg = allowMsg;
                    _activeChat = chat;
                    _checkSendPermission(chat);
                    _closeModal();
                    _toast('সেটিং সেভ হয়েছে।');
                }).catch(() => _toast('সেটিং সেভ করতে সমস্যা।'));
        });
    }

    function _showChangeAdminModal(chat) {
        const uid = String(_currentUser.id);
        const members = (chat.members || []).filter(m => String(m) !== uid);
        const modal = document.getElementById('tmv3-modal');
        modal.innerHTML = `
            <div class="tmv3-modal-head">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-arrow-left"></i></button>
                <span class="tmv3-modal-title">Admin পরিবর্তন</span>
            </div>
            <div class="tmv3-modal-body">
                <p style="color:#8696a0;font-size:14px;margin-bottom:12px;">নিচের সদস্যদের মধ্য থেকে নতুন Admin বেছে নিন:</p>
                <div id="ca-list"><div class="tmv3-spinner" style="height:60px;"><i class="fa fa-circle-notch"></i></div></div>
            </div>
        `;
        document.getElementById('tmv3-modal-overlay').classList.add('open');

        const listEl = document.getElementById('ca-list');
        const promises = members.map(mid => _db.collection('users').doc(String(mid)).get().catch(() => null));
        Promise.all(promises).then(docs => {
            listEl.innerHTML = '';
            docs.forEach((doc, i) => {
                const mid = members[i];
                const udata = (doc && doc.exists) ? doc.data() : {};
                const mname = udata.name || udata.email || String(mid);
                const item = document.createElement('div');
                item.className = 'tmv3-member-item';
                item.style.cursor = 'pointer';
                item.innerHTML = `<div class="tmv3-member-av"><i class="fa fa-user"></i></div><div class="tmv3-member-info"><div class="tmv3-member-name">${_esc(mname)}</div></div>`;
                item.addEventListener('click', () => {
                    if (!confirm(_esc(mname) + ' কে Admin বানাবেন?')) return;
                    _db.collection('tm_groups').doc(chat.id).update({ adminId: String(mid) })
                        .then(() => { chat.adminId = String(mid); _closeModal(); _toast('Admin পরিবর্তন হয়েছে।'); }).catch(()=>{});
                });
                listEl.appendChild(item);
            });
            if (!members.length) listEl.innerHTML = '<div class="tmv3-empty-msg">অন্য কোনো সদস্য নেই</div>';
        }).catch(() => { listEl.innerHTML = '<div class="tmv3-empty-msg">লোড হচ্ছে না।</div>'; });
    }

    /* ══════════════════════════════════════════════════════════
       ADD MEMBER MODAL
    ══════════════════════════════════════════════════════════ */
    function _showAddMemberModal(chat) {
        const modal = document.getElementById('tmv3-modal');
        const existingMembers = chat.members || [];
        modal.innerHTML = `
            <div class="tmv3-modal-head">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeModal()"><i class="fa fa-arrow-left"></i></button>
                <span class="tmv3-modal-title">Add member</span>
            </div>
            <div class="tmv3-modal-body">
                <div class="tmv3-am-search-wrap">
                    <span class="tmv3-am-search-icon"><i class="fa fa-search"></i></span>
                    <input class="tmv3-am-search-input" id="am-search" placeholder="নাম, মোবাইল বা ইমেইল দিয়ে খুঁজুন..." autocomplete="off">
                    <button class="tmv3-am-clear-btn" id="am-clear-btn" style="display:none;" title="মুছুন">✕</button>
                </div>
                <div style="display:flex;justify-content:flex-end;margin:8px 0 10px;">
                    <button class="tmv3-btn secondary" id="am-public-btn" style="white-space:nowrap;font-size:12px;padding:8px 16px;">সকল ইউজার দেখুন</button>
                </div>
                <div id="am-list"><div class="tmv3-empty-msg">আপনার চ্যাটে থাকা ইউজারগুলো দেখাবে...</div></div>
                <div id="am-selected-wrap" style="display:none;margin-top:12px;border-top:1px solid #2a3942;padding-top:12px;">
                    <div style="color:#8696a0;font-size:13px;margin-bottom:8px;">নির্বাচিত:</div>
                    <div id="am-selected-names" style="color:#25d366;font-size:14px;"></div>
                </div>
            </div>
            <div class="tmv3-modal-footer">
                <button class="tmv3-btn secondary" onclick="window._tmv3._closeModal()">বাতিল</button>
                <button class="tmv3-btn primary" id="am-add-btn">যোগ করুন</button>
            </div>
        `;
        document.getElementById('tmv3-modal-overlay').classList.add('open');

        let selected = [];
        let currentUsers = [];

        function renderList(users) {
            const list = document.getElementById('am-list');
            if (!users.length) { list.innerHTML = '<div class="tmv3-empty-msg">কোনো ইউজার পাওয়া যাচ্ছে না</div>'; return; }
            list.innerHTML = '';
            users.forEach(u => {
                if (existingMembers.includes(String(u.id))) return; // already member
                const item = document.createElement('div');
                item.className = 'tmv3-user-sel-item';
                const isSelected = selected.includes(String(u.id));
                item.innerHTML = `
                    <div class="tmv3-sel-check ${isSelected ? 'checked' : ''}" data-uid="${_esc(String(u.id))}"></div>
                    <div class="tmv3-member-av">${u.avatar ? `<img src="${u.avatar}" alt="">` : '<i class="fa fa-user"></i>'}</div>
                    <div class="tmv3-member-info"><div class="tmv3-member-name">${_esc(u.name || u.email || String(u.id))}</div><div class="tmv3-member-sub">${_esc(u.email || u.mobile || '')}</div></div>
                `;
                item.addEventListener('click', () => {
                    const uid2 = String(u.id);
                    const idx = selected.indexOf(uid2);
                    if (idx > -1) selected.splice(idx, 1); else selected.push(uid2);
                    renderList(currentUsers);
                    updateSelected();
                });
                list.appendChild(item);
            });
        }

        function updateSelected() {
            const wrap = document.getElementById('am-selected-wrap');
            const names = document.getElementById('am-selected-names');
            if (selected.length > 0) {
                wrap.style.display = 'block';
                names.textContent = selected.join(', ');
            } else {
                wrap.style.display = 'none';
            }
        }

        /* Load personal chat members */
        function loadPersonalChatUsers() {
            if (!_db || !_currentUser) return;
            const uid = String(_currentUser.id);
            _db.collection('tm_personal_chats').where('members', 'array-contains', uid).get()
                .then(snap => {
                    const otherIds = [];
                    snap.docs.forEach(doc => {
                        const mems = doc.data().members || [];
                        mems.forEach(m => { if (String(m) !== uid && !otherIds.includes(String(m))) otherIds.push(String(m)); });
                    });
                    return Promise.all(otherIds.map(id => _db.collection('users').doc(id).get().catch(() => null)));
                }).then(docs => {
                    currentUsers = docs.filter(Boolean).filter(d => d.exists).map(d => ({ id: d.id, ...d.data() }));
                    renderList(currentUsers);
                }).catch(() => {});
        }

        /* Load all users */
        function loadAllUsers(q) {
            if (!_db) return;
            _db.collection('users').limit(50).get().then(snap => {
                const uid = String(_currentUser.id);
                let users = snap.docs.filter(d => d.id !== uid).map(d => ({ id: d.id, ...d.data() }));
                if (q) {
                    const qLow = q.toLowerCase();
                    users = users.filter(u => {
                        const n = (u.name || '').toLowerCase();
                        const e = (u.email || '').toLowerCase();
                        const m = (u.mobile || '').toLowerCase();
                        return n.includes(qLow) || e.includes(qLow) || m.includes(qLow);
                    });
                }
                currentUsers = users;
                renderList(users);
            }).catch(() => {});
        }

        loadPersonalChatUsers();

        document.getElementById('am-public-btn').addEventListener('click', () => loadAllUsers(''));

        /* Search input with clear button logic */
        const amSearchEl = document.getElementById('am-search');
        const amClearBtn = document.getElementById('am-clear-btn');

        amSearchEl.addEventListener('input', function () {
            const q = this.value.trim().toLowerCase();
            amClearBtn.style.display = q ? 'flex' : 'none';
            if (q) {
                /* প্রথমে currentUsers এ search, তারপর Firebase এ */
                const filtered = currentUsers.filter(u => {
                    return (u.name || '').toLowerCase().includes(q) ||
                           (u.email || '').toLowerCase().includes(q) ||
                           (u.mobile || '').toLowerCase().includes(q);
                });
                if (filtered.length > 0) {
                    renderList(filtered);
                } else {
                    /* Firebase এ search করো — personal accounts ও আসবে */
                    if (_db && _currentUser) {
                        _db.collection('users').limit(100).get().then(snap => {
                            const uid = String(_currentUser.id);
                            let fbUsers = snap.docs.filter(d => d.id !== uid).map(d => ({ id: d.id, ...d.data() }));
                            fbUsers = fbUsers.filter(u => {
                                const n = (u.name || '').toLowerCase();
                                const e = (u.email || '').toLowerCase();
                                const m = (u.mobile || '').toLowerCase();
                                return n.includes(q) || e.includes(q) || m.includes(q);
                            });
                            currentUsers = fbUsers;
                            renderList(fbUsers);
                        }).catch(() => renderList([]));
                    } else {
                        renderList([]);
                    }
                }
            } else {
                renderList(currentUsers);
            }
        });

        amClearBtn.addEventListener('click', function() {
            amSearchEl.value = '';
            amClearBtn.style.display = 'none';
            renderList(currentUsers);
            amSearchEl.focus();
        });

        document.getElementById('am-add-btn').addEventListener('click', () => {
            if (!selected.length) { _toast('কাউকে সিলেক্ট করুন।'); return; }
            const updates = {};
            selected.forEach(sid => { if (!existingMembers.includes(sid)) existingMembers.push(sid); });
            _db.collection('tm_groups').doc(chat.id).update({
                members: existingMembers
            }).then(() => {
                chat.members = existingMembers;
                document.getElementById('tmv3-header-sub').textContent = existingMembers.length + ' জন সদস্য';
                _closeModal();
                _toast(selected.length + ' জন সদস্য যোগ হয়েছে।');
                _buildGroupInfoPanel(chat, document.getElementById('tmv3-side-panel'));
            }).catch(() => _toast('যোগ করতে সমস্যা হয়েছে।'));
        });
    }

    /* ══════════════════════════════════════════════════════════
       PROFILE PANEL
    ══════════════════════════════════════════════════════════ */
    function _showProfilePanel() {
        if (!_currentUser) { _toast('লগইন করুন।'); return; }
        const panel = document.getElementById('tmv3-side-panel');
        panel.classList.add('open');

        const u = _currentUser;
        const avatar = u.avatar || u.profileImage || '';
        const name = u.name || '';
        const bio = u.bio || '';
        const email = u.email || '';
        const mobile = u.mobile || '';

        panel.innerHTML = `
            <div class="tmv3-sp-header">
                <button class="tmv3-icon-btn" onclick="window._tmv3._closeSidePanel()"><i class="fa fa-times"></i></button>
                <span class="tmv3-sp-title">Profile</span>
            </div>
            <div class="tmv3-sp-body">
                <div class="tmv3-sp-avatar-wrap">
                    <div class="tmv3-sp-avatar" id="profile-av" style="cursor:pointer;">
                        ${avatar ? `<img src="${avatar}" alt="" id="profile-av-img">` : `<span id="profile-av-icon">👤</span>`}
                        <span class="tmv3-sp-avatar-edit"><i class="fa fa-camera"></i></span>
                    </div>
                    <input type="file" id="profile-av-input" accept="image/*" style="display:none;">
                </div>
                <div class="tmv3-sp-name">${_esc(name || 'আপনার নাম')}</div>
                <div class="tmv3-sp-sub">${_esc(email || mobile || '')}</div>

                <div class="tmv3-sp-section">
                    <div class="tmv3-sp-row" id="pr-edit-name"><i class="fa fa-user"></i><div class="label">নাম: <span style="color:#8696a0;">${_esc(name)}</span></div><i class="fa fa-pencil" style="color:#8696a0;"></i></div>
                    <div class="tmv3-sp-row" id="pr-edit-bio"><i class="fa fa-info-circle"></i><div class="label">Bio: <span style="color:#8696a0;">${_esc(bio || 'যোগ করুন...')}</span></div><i class="fa fa-pencil" style="color:#8696a0;"></i></div>
                    ${email ? `<div class="tmv3-sp-row"><i class="fa fa-envelope"></i><span class="label">${_esc(email)}</span></div>` : ''}
                    ${mobile ? `<div class="tmv3-sp-row"><i class="fa fa-phone"></i><span class="label">${_esc(mobile)}</span></div>` : ''}
                </div>

                <div class="tmv3-sp-section-label">গোপনীয়তা সেটিং</div>
                <div class="tmv3-sp-section">
                    <div class="tmv3-sp-row">
                        <i class="fa fa-users"></i>
                        <div style="flex:1;">
                            <div style="font-size:14px;font-weight:500;">গ্রুপে যোগ ব্লক</div>
                            <div style="color:#8696a0;font-size:12px;margin-top:2px;">অন করলে কেউ আপনাকে গ্রুপে যোগ করতে পারবে না</div>
                        </div>
                        <label class="tmv3-toggle"><input type="checkbox" id="pr-block-group" ${u.blockGroupAdd ? 'checked' : ''}><span class="tmv3-toggle-slider"></span></label>
                    </div>
                    <div class="tmv3-sp-row">
                        <i class="fa fa-lock"></i>
                        <div style="flex:1;">
                            <div style="font-size:14px;font-weight:500;">একাউন্ট লক</div>
                            <div style="color:#8696a0;font-size:12px;margin-top:2px;">অন করলে সার্চে আপনার একাউন্ট পাওয়া যাবে না</div>
                        </div>
                        <label class="tmv3-toggle"><input type="checkbox" id="pr-acc-lock" ${u.accountLocked ? 'checked' : ''}><span class="tmv3-toggle-slider"></span></label>
                    </div>
                </div>
                <div style="padding:16px 12px 20px;">
                    <button id="pr-save-btn" style="width:100%;padding:15px;background:#25d366;color:#111;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;transition:background .2s;">সেভ করুন</button>
                </div>
            </div>
        `;

        /* Avatar upload */
        document.getElementById('profile-av').addEventListener('click', () => {
            document.getElementById('profile-av-input').click();
        });
        document.getElementById('profile-av-input').addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const r = new FileReader();
            r.onload = e => {
                const src = e.target.result;
                const avEl = document.getElementById('profile-av');
                avEl.innerHTML = `<img src="${src}" alt="" id="profile-av-img"><span class="tmv3-sp-avatar-edit"><i class="fa fa-camera"></i></span>`;
                _currentUser.avatar = src;
            };
            r.readAsDataURL(this.files[0]);
            this.value = '';
        });

        /* Edit name */
        document.getElementById('pr-edit-name').addEventListener('click', () => {
            const newName = prompt('নতুন নাম লিখুন:', _currentUser.name || '');
            if (newName === null) return;
            _currentUser.name = newName.trim();
            document.getElementById('pr-edit-name').querySelector('.label').innerHTML = `নাম: <span style="color:#8696a0;">${_esc(_currentUser.name)}</span>`;
        });

        /* Edit bio */
        document.getElementById('pr-edit-bio').addEventListener('click', () => {
            const newBio = prompt('আপনার Bio লিখুন:', _currentUser.bio || '');
            if (newBio === null) return;
            _currentUser.bio = newBio.trim();
            document.getElementById('pr-edit-bio').querySelector('.label').innerHTML = `Bio: <span style="color:#8696a0;">${_esc(_currentUser.bio || 'যোগ করুন...')}</span>`;
        });

        /* Save */
        document.getElementById('pr-save-btn').addEventListener('click', () => {
            const blockGroup = document.getElementById('pr-block-group').checked;
            const accLock = document.getElementById('pr-acc-lock').checked;
            _currentUser.blockGroupAdd = blockGroup;
            _currentUser.accountLocked = accLock;

            /* Update in localStorage */
            localStorage.setItem('TM_SESSION_USER', JSON.stringify(_currentUser));

            /* Update in Firestore */
            if (_db) {
                _db.collection('users').doc(String(_currentUser.id)).update({
                    name: _currentUser.name || '',
                    bio: _currentUser.bio || '',
                    avatar: _currentUser.avatar || '',
                    blockGroupAdd: blockGroup,
                    accountLocked: accLock
                }).catch(() => {});
            }
            _toast('প্রোফাইল সেভ হয়েছে। ✅');
        });
    }

    /* ══════════════════════════════════════════════════════════
       MODAL HELPERS
    ══════════════════════════════════════════════════════════ */
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
       INJECT BUTTONS (PC & Mobile)
    ══════════════════════════════════════════════════════════ */
    function _injectButtons() {
        /* PC */
        const searchBox = document.getElementById('headerSearchBox');
        if (searchBox) {
            const btn = document.createElement('button');
            btn.id = 'tmChatBtnPC';
            btn.title = 'Chat';
            btn.innerHTML = `${_waIcon()}<span class="tmv3-badge" id="tmv3-badge-pc"></span>`;
            btn.addEventListener('click', _openApp);
            searchBox.parentNode.insertBefore(btn, searchBox.nextSibling);
            const uc = searchBox.closest('.user-controls');
            if (uc) uc.style.display = 'flex';
        }

        /* Mobile sheet */
        _injectMobileBtn();
    }

    function _injectMobileBtn() {
        const list = document.getElementById('mobileSheetList');
        if (!list) { setTimeout(_injectMobileBtn, 500); return; }
        const item = document.createElement('div');
        item.className = 'tmv3-mob-item';
        item.innerHTML = `<div class="mob-icon">${_waIcon(26)}</div>Chat<span class="tmv3-mob-badge" id="tmv3-badge-mob"></span>`;
        item.addEventListener('click', function () {
            if (typeof closeMobileAccountMenu === 'function') closeMobileAccountMenu();
            setTimeout(_openApp, 320);
        });
        list.appendChild(item);
    }

    function _waIcon(size) {
        size = size || 22;
        return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="#fff"><path d="M16 2C8.268 2 2 8.268 2 16c0 2.527.676 4.9 1.857 6.945L2 30l7.258-1.832A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2zm0 25.6a11.548 11.548 0 01-5.896-1.614l-.42-.252-4.31 1.089 1.113-4.194-.273-.432A11.551 11.551 0 014.4 16c0-6.396 5.204-11.6 11.6-11.6S27.6 9.604 27.6 16 22.396 27.6 16 27.6zm6.368-8.67c-.35-.175-2.066-1.02-2.387-1.137-.32-.116-.553-.175-.785.175-.233.35-.9 1.137-1.103 1.37-.204.233-.407.262-.756.087-.35-.175-1.476-.544-2.812-1.737-1.04-.927-1.74-2.073-1.944-2.423-.203-.35-.022-.538.153-.712.157-.157.35-.408.524-.612.175-.204.233-.35.35-.583.116-.233.058-.437-.029-.612-.087-.175-.785-1.893-1.075-2.592-.283-.683-.57-.59-.785-.6l-.668-.012c-.233 0-.61.087-.93.437-.32.35-1.22 1.193-1.22 2.91 0 1.718 1.25 3.378 1.424 3.611.175.233 2.46 3.754 5.962 5.265.833.36 1.483.575 1.99.735.836.266 1.597.228 2.198.138.67-.1 2.066-.845 2.358-1.661.29-.816.29-1.515.204-1.661-.087-.146-.32-.233-.67-.408z"/></svg>`;
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
       TOAST
    ══════════════════════════════════════════════════════════ */
    function _toast(msg, duration) {
        const el = document.getElementById('tmv3-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), duration || 2500);
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
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _formatTime(d) {
        if (!d) return '';
        const h = d.getHours(), m = d.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function _formatDate(d) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yest = new Date(today - 86400000);
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (+day === +today) return 'আজ';
        if (+day === +yest) return 'গতকাল';
        return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
    }

    function _nameColor(id) {
        const colors = ['#e91e63','#9c27b0','#3f51b5','#2196f3','#009688','#ff5722','#795548','#607d8b'];
        let h = 0;
        String(id || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) & 0xffff; });
        return colors[h % colors.length];
    }

    /* ══════════════════════════════════════════════════════════
       PUBLIC API
    ══════════════════════════════════════════════════════════ */
    window._tmv3 = {
        open: _openApp,
        close: _closeApp,
        sendMessage: _sendMessage,
        cancelReply: _cancelReply,
        cancelMedia: _cancelMedia,
        scrollToBottom,
        _closeModal,
        _closeSidePanel,
        _toast
    };

})();
