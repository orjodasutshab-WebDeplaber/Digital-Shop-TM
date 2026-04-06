/* ================================================================
   DIGITAL SHOP TM — Group Chat  v1.0
   WhatsApp-style real-time group chat using Firebase Firestore
   ================================================================ */

(function () {
    'use strict';

    /* ── Constants ─────────────────────────────────────────────── */
    const GROUP_ID   = 'digital_shop_tm_main';
    const GROUP_NAME = 'Digital Shop TM';
    const MAX_MSG    = 100;   // messages to load at once
    const TYPING_TTL = 4000;  // ms before typing indicator clears

    let _db            = null;
    let _unsubscribe   = null;
    let _typingTimer   = null;
    let _isOpen        = false;
    let _currentUser   = null;
    let _lastMsgDate   = null;
    let _replyTarget   = null;   // { id, senderName, text }
    let _mediaPreview  = null;   // base64 image to send
    let _unreadCount   = 0;
    let _isAtBottom    = true;

    /* ── Wait for app to be ready, then init ───────────────────── */
    window.addEventListener('load', function () {
        (window.TM_READY || Promise.resolve()).then(function () {
            setTimeout(_init, 600);
        });
    });

    function _init() {
        _currentUser = _getSessionUser();
        _initFirebase();
        _buildUI();
        _bindHotkey();
    }

    /* ── Get current user from session ─────────────────────────── */
    function _getSessionUser() {
        try {
            const s = localStorage.getItem('TM_SESSION_USER');
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    /* ── Firebase init ─────────────────────────────────────────── */
    function _initFirebase() {
        if (typeof firebase === 'undefined') return;
        if (firebase.apps && firebase.apps.length) {
            _db = firebase.firestore();
        } else {
            const cfg = {
                apiKey: "AIzaSyCRJ6kN1nvr1RxKdIiBnxWVJGXm6U2kRr0",
                authDomain: "digitalshoptm-2008.firebaseapp.com",
                projectId: "digitalshoptm-2008",
                storageBucket: "digitalshoptm-2008.firebasestorage.app",
                messagingSenderId: "627378095856",
                appId: "1:627378095856:web:b705f4f75e0512646ca435"
            };
            firebase.initializeApp(cfg);
            _db = firebase.firestore();
        }
        /* ensure group doc exists */
        _db.collection('tm_groups').doc(GROUP_ID).set({
            name: GROUP_NAME,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    /* ═══════════════════════════════════════════════════════════
       BUILD UI
    ═══════════════════════════════════════════════════════════ */
    function _buildUI() {
        _injectCSS();
        _buildOverlay();
        _injectButtons();
    }

    /* ── CSS ─────────────────────────────────────────────────── */
    function _injectCSS() {
        const s = document.createElement('style');
        s.id = 'tm-chat-style';
        s.textContent = `
/* ════ Chat Button ════ */
#tmChatBtnPC {
    display: none;
    align-items: center;
    justify-content: center;
    width: 40px; height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg,#25d366 0%,#128c7e 100%);
    border: none;
    cursor: pointer;
    position: relative;
    box-shadow: 0 4px 15px rgba(37,211,102,0.4);
    transition: opacity .2s, transform .2s;
    flex-shrink: 0;
}
#tmChatBtnPC:hover { opacity:.85; transform:scale(1.08); }
#tmChatBtnPC svg { width:22px; height:22px; fill:#fff; }

/* Mobile — bottom-sheet account menu এ item হিসেবে inject */
.tm-chat-mob-item {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 22px 28px;
    color: #ebebf5;
    cursor: pointer;
    font-size: 28px;
    font-weight: 500;
    border-bottom: 1px solid #2c2c2e;
    -webkit-tap-highlight-color: rgba(255,255,255,.08);
    transition: background .15s;
    font-family: 'Hind Siliguri', sans-serif;
}
.tm-chat-mob-item:active { background:#2c2c2e; }
.tm-chat-mob-item .mob-icon-wrap {
    width:60px; height:60px;
    border-radius:16px;
    background:rgba(37,211,102,.18);
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0; font-size:26px;
}

/* unread badge */
.tm-chat-badge {
    position:absolute;
    top:-4px; right:-4px;
    background:#ef4444;
    color:#fff;
    font-size:10px;
    font-weight:700;
    border-radius:50%;
    width:18px; height:18px;
    display:none;
    align-items:center; justify-content:center;
    border:2px solid #0f172a;
    line-height:1;
}
.tm-chat-badge.show { display:flex; }

/* mobile badge (text span next to label) */
.tm-mob-badge {
    background:#ef4444;
    color:#fff;
    font-size:20px;
    font-weight:700;
    border-radius:50px;
    padding:2px 10px;
    display:none;
    margin-left:auto;
}
.tm-mob-badge.show { display:block; }

/* ════ Overlay / Modal ════ */
#tmChatOverlay {
    display:none;
    position:fixed;
    inset:0;
    z-index:99999990;
    background:rgba(0,0,0,.6);
    backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
    align-items:center;
    justify-content:center;
    font-family:'Hind Siliguri',sans-serif;
}
#tmChatOverlay.open { display:flex; }

#tmChatModal {
    background:#111b21;
    width:min(800px,100vw);
    height:min(700px,100vh);
    border-radius:20px;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,.7);
    position:relative;
}

/* Mobile — fullscreen */
html.is-mobile #tmChatModal {
    width:100vw !important;
    height:100vh !important;
    border-radius:0 !important;
}

/* ── Header ── */
#tmChatHeader {
    background:#1f2c34;
    padding:14px 18px;
    display:flex;
    align-items:center;
    gap:14px;
    border-bottom:1px solid #2a3942;
    flex-shrink:0;
}
html.is-mobile #tmChatHeader { padding:20px 24px; }

#tmChatAvatar {
    width:46px; height:46px;
    border-radius:50%;
    background:linear-gradient(135deg,#25d366,#128c7e);
    display:flex; align-items:center; justify-content:center;
    font-size:22px; color:#fff;
    flex-shrink:0;
}
html.is-mobile #tmChatAvatar { width:70px; height:70px; font-size:32px; }

#tmChatHeaderInfo { flex:1; min-width:0; }
#tmChatHeaderTitle {
    color:#e9edef;
    font-size:16px;
    font-weight:700;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
html.is-mobile #tmChatHeaderTitle { font-size:26px; }
#tmChatMemberCount { color:#8696a0; font-size:12px; }
html.is-mobile #tmChatMemberCount { font-size:20px; }

#tmChatCloseBtn {
    background:none;
    border:none;
    color:#8696a0;
    font-size:22px;
    cursor:pointer;
    width:40px; height:40px;
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    transition:.2s;
}
#tmChatCloseBtn:hover { background:#2a3942; color:#e9edef; }
html.is-mobile #tmChatCloseBtn { width:60px; height:60px; font-size:32px; }

/* ── Messages area ── */
#tmChatMessages {
    flex:1;
    overflow-y:auto;
    padding:16px;
    display:flex;
    flex-direction:column;
    gap:4px;
    background:#0b141a;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpath d='M30 5 L55 20 L55 40 L30 55 L5 40 L5 20 Z' fill='none' stroke='rgba(255,255,255,0.015)' stroke-width='1'/%3E%3C/svg%3E");
}
#tmChatMessages::-webkit-scrollbar { width:5px; }
#tmChatMessages::-webkit-scrollbar-track { background:transparent; }
#tmChatMessages::-webkit-scrollbar-thumb { background:#2a3942; border-radius:10px; }

/* date divider */
.tm-date-div {
    display:flex; align-items:center; justify-content:center;
    margin:10px 0;
}
.tm-date-div span {
    background:#1f2c34;
    color:#8696a0;
    font-size:11px;
    padding:4px 14px;
    border-radius:20px;
}
html.is-mobile .tm-date-div span { font-size:18px; padding:6px 20px; }

/* message bubble */
.tm-msg-wrap {
    display:flex;
    align-items:flex-end;
    gap:8px;
    max-width:72%;
}
.tm-msg-wrap.own { align-self:flex-end; flex-direction:row-reverse; }
.tm-msg-wrap.other { align-self:flex-start; }

.tm-msg-avatar {
    width:30px; height:30px;
    border-radius:50%;
    background:#2a3942;
    display:flex; align-items:center; justify-content:center;
    font-size:13px; color:#8696a0;
    flex-shrink:0; align-self:flex-end;
    overflow:hidden;
}
.tm-msg-avatar img { width:100%; height:100%; object-fit:cover; }
html.is-mobile .tm-msg-avatar { width:48px; height:48px; font-size:20px; }

.tm-bubble {
    padding:8px 12px;
    border-radius:12px;
    position:relative;
    word-break:break-word;
    max-width:100%;
    box-shadow:0 1px 2px rgba(0,0,0,.3);
}
.tm-msg-wrap.own .tm-bubble {
    background:#005c4b;
    border-bottom-right-radius:4px;
    color:#e9edef;
}
.tm-msg-wrap.other .tm-bubble {
    background:#1f2c34;
    border-bottom-left-radius:4px;
    color:#e9edef;
}
html.is-mobile .tm-bubble { padding:12px 18px; border-radius:18px; }

.tm-sender-name {
    font-size:12px;
    font-weight:700;
    margin-bottom:3px;
}
html.is-mobile .tm-sender-name { font-size:20px; }

.tm-msg-text { font-size:14px; line-height:1.5; }
html.is-mobile .tm-msg-text { font-size:24px; }

.tm-msg-time {
    font-size:11px;
    color:rgba(233,237,239,.55);
    text-align:right;
    margin-top:3px;
    display:flex; align-items:center; justify-content:flex-end; gap:4px;
}
html.is-mobile .tm-msg-time { font-size:18px; }

/* seen ticks */
.tm-tick { font-size:12px; }
html.is-mobile .tm-tick { font-size:18px; }
.tm-tick.seen { color:#53bdeb; }

/* reply quote inside bubble */
.tm-reply-quote {
    background:rgba(0,0,0,.25);
    border-left:3px solid #25d366;
    border-radius:6px;
    padding:5px 10px;
    margin-bottom:6px;
    font-size:12px;
}
html.is-mobile .tm-reply-quote { font-size:20px; }
.tm-reply-quote strong { color:#25d366; }

/* image message */
.tm-msg-img {
    max-width:220px;
    border-radius:10px;
    cursor:pointer;
    display:block;
}
html.is-mobile .tm-msg-img { max-width:380px; }

/* swipe-to-reply (tap+hold → right-swipe) — visual hint */
.tm-msg-wrap:active .tm-bubble { filter:brightness(1.15); }

/* context menu */
#tmContextMenu {
    position:fixed;
    background:#233138;
    border-radius:12px;
    box-shadow:0 8px 30px rgba(0,0,0,.5);
    z-index:999999999;
    overflow:hidden;
    display:none;
    min-width:160px;
}
.tm-ctx-item {
    padding:12px 18px;
    color:#e9edef;
    font-size:14px;
    cursor:pointer;
    display:flex; align-items:center; gap:10px;
    transition:.15s;
}
.tm-ctx-item:hover { background:#2a3942; }
.tm-ctx-item.danger { color:#ef4444; }
html.is-mobile .tm-ctx-item { font-size:22px; padding:18px 26px; }

/* ── Reply preview bar (above input) ── */
#tmReplyBar {
    display:none;
    background:#1f2c34;
    border-top:1px solid #2a3942;
    padding:10px 18px;
    align-items:center;
    gap:12px;
    flex-shrink:0;
}
#tmReplyBar.show { display:flex; }
#tmReplyPreview {
    flex:1;
    border-left:3px solid #25d366;
    padding-left:10px;
    color:#8696a0;
    font-size:13px;
    overflow:hidden;
    white-space:nowrap;
    text-overflow:ellipsis;
}
html.is-mobile #tmReplyPreview { font-size:22px; }
#tmReplyPreview strong { color:#25d366; display:block; }
#tmReplyClose {
    background:none; border:none;
    color:#8696a0; font-size:18px; cursor:pointer;
    width:30px; height:30px;
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
}
html.is-mobile #tmReplyClose { width:50px; height:50px; font-size:28px; }

/* ── Media preview bar ── */
#tmMediaBar {
    display:none;
    background:#1f2c34;
    border-top:1px solid #2a3942;
    padding:10px 18px;
    align-items:center;
    gap:12px;
    flex-shrink:0;
}
#tmMediaBar.show { display:flex; }
#tmMediaThumb {
    width:60px; height:60px;
    border-radius:10px;
    object-fit:cover;
}
html.is-mobile #tmMediaThumb { width:90px; height:90px; }
#tmMediaClear {
    background:none; border:none;
    color:#ef4444; font-size:20px; cursor:pointer;
    margin-left:auto;
}

/* ── Typing indicator ── */
#tmTypingBar {
    height:22px;
    padding:0 18px;
    display:flex; align-items:center;
    flex-shrink:0;
}
.tm-typing-text {
    color:#8696a0;
    font-size:12px;
    font-style:italic;
}
html.is-mobile .tm-typing-text { font-size:20px; }

/* ── Input area ── */
#tmChatInputArea {
    background:#1f2c34;
    padding:10px 14px;
    display:flex;
    align-items:flex-end;
    gap:10px;
    border-top:1px solid #2a3942;
    flex-shrink:0;
}
html.is-mobile #tmChatInputArea { padding:16px 18px; gap:16px; }

#tmMsgInput {
    flex:1;
    background:#2a3942;
    border:none;
    border-radius:24px;
    padding:10px 16px;
    color:#e9edef;
    font-size:14px;
    font-family:'Hind Siliguri',sans-serif;
    resize:none;
    outline:none;
    max-height:120px;
    line-height:1.5;
    scrollbar-width:none;
}
html.is-mobile #tmMsgInput { font-size:24px; padding:16px 22px; border-radius:36px; }

.tm-action-btn {
    background:none;
    border:none;
    color:#8696a0;
    font-size:22px;
    cursor:pointer;
    width:42px; height:42px;
    border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    transition:.2s;
    flex-shrink:0;
}
.tm-action-btn:hover { background:#2a3942; color:#e9edef; }
html.is-mobile .tm-action-btn { width:66px; height:66px; font-size:34px; }

#tmSendBtn {
    background:linear-gradient(135deg,#25d366 0%,#128c7e 100%);
    border:none;
    color:#fff;
    width:44px; height:44px;
    border-radius:50%;
    cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    font-size:18px;
    transition:.2s;
    flex-shrink:0;
    box-shadow:0 4px 15px rgba(37,211,102,.35);
}
#tmSendBtn:hover { opacity:.85; transform:scale(1.05); }
html.is-mobile #tmSendBtn { width:68px; height:68px; font-size:28px; }

/* scroll-to-bottom fab */
#tmScrollDownBtn {
    position:absolute;
    bottom:80px; right:18px;
    background:#1f2c34;
    border:1px solid #2a3942;
    border-radius:50%;
    width:40px; height:40px;
    color:#8696a0;
    font-size:18px;
    cursor:pointer;
    display:none;
    align-items:center; justify-content:center;
    box-shadow:0 4px 15px rgba(0,0,0,.4);
    z-index:10;
    transition:.2s;
}
#tmScrollDownBtn.show { display:flex; }
html.is-mobile #tmScrollDownBtn { width:64px; height:64px; font-size:28px; bottom:110px; right:24px; }
#tmScrollDownBadge {
    position:absolute;
    top:-5px; right:-5px;
    background:#25d366;
    color:#fff;
    font-size:10px;
    font-weight:700;
    border-radius:50%;
    width:18px; height:18px;
    display:none;
    align-items:center; justify-content:center;
}
html.is-mobile #tmScrollDownBadge { width:28px; height:28px; font-size:16px; top:-8px; right:-8px; }

/* image lightbox */
#tmLightbox {
    display:none;
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.9);
    z-index:9999999999;
    align-items:center;
    justify-content:center;
}
#tmLightbox.open { display:flex; }
#tmLightbox img {
    max-width:95vw;
    max-height:92vh;
    border-radius:8px;
    object-fit:contain;
}
#tmLightboxClose {
    position:absolute;
    top:16px; right:16px;
    background:#1f2c34;
    border:none;
    color:#e9edef;
    width:44px; height:44px;
    border-radius:50%;
    font-size:20px;
    cursor:pointer;
    display:flex; align-items:center; justify-content:center;
}

/* empty state */
#tmEmptyState {
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:14px;
    height:100%;
    color:#8696a0;
}
#tmEmptyState i { font-size:48px; opacity:.4; }
html.is-mobile #tmEmptyState i { font-size:80px; }
#tmEmptyState p { font-size:14px; opacity:.6; }
html.is-mobile #tmEmptyState p { font-size:24px; }

/* loading spinner */
.tm-spinner {
    display:flex; align-items:center; justify-content:center;
    height:100%;
}
.tm-spinner i { font-size:28px; color:#25d366; animation:tm-spin 1s linear infinite; }
@keyframes tm-spin { to { transform:rotate(360deg); } }
        `;
        document.head.appendChild(s);
    }

    /* ── Build main overlay HTML ─────────────────────────────── */
    function _buildOverlay() {
        /* Overlay backdrop */
        const overlay = document.createElement('div');
        overlay.id = 'tmChatOverlay';
        overlay.innerHTML = `
<div id="tmChatModal">
    <!-- Header -->
    <div id="tmChatHeader">
        <div id="tmChatAvatar">💬</div>
        <div id="tmChatHeaderInfo">
            <div id="tmChatHeaderTitle">${GROUP_NAME}</div>
            <div id="tmChatMemberCount">সদস্য লোড হচ্ছে...</div>
        </div>
        <button id="tmChatCloseBtn" title="বন্ধ করুন"><i class="fa fa-times"></i></button>
    </div>

    <!-- Typing bar -->
    <div id="tmTypingBar"></div>

    <!-- Messages -->
    <div id="tmChatMessages">
        <div class="tm-spinner"><i class="fa fa-circle-notch"></i></div>
    </div>

    <!-- Scroll-to-bottom btn -->
    <button id="tmScrollDownBtn" onclick="window._tmChat.scrollToBottom()">
        <i class="fa fa-chevron-down"></i>
        <span id="tmScrollDownBadge"></span>
    </button>

    <!-- Reply bar -->
    <div id="tmReplyBar">
        <div id="tmReplyPreview"></div>
        <button id="tmReplyClose" onclick="window._tmChat.cancelReply()">
            <i class="fa fa-times"></i>
        </button>
    </div>

    <!-- Media preview bar -->
    <div id="tmMediaBar">
        <img id="tmMediaThumb" src="" alt="preview">
        <span style="color:#e9edef;font-size:13px;flex:1;">ছবি পাঠানো হবে</span>
        <button id="tmMediaClear" onclick="window._tmChat.cancelMedia()">
            <i class="fa fa-trash"></i>
        </button>
    </div>

    <!-- Input area -->
    <div id="tmChatInputArea">
        <label for="tmImgInput" class="tm-action-btn" title="ছবি পাঠান" style="cursor:pointer;">
            <i class="fa fa-image"></i>
        </label>
        <input type="file" id="tmImgInput" accept="image/*" style="display:none;">

        <textarea id="tmMsgInput" rows="1" placeholder="মেসেজ লিখুন..."></textarea>

        <button id="tmSendBtn" onclick="window._tmChat.sendMessage()">
            <i class="fa fa-paper-plane"></i>
        </button>
    </div>
</div>

<!-- Context menu -->
<div id="tmContextMenu">
    <div class="tm-ctx-item" id="tmCtxReply"><i class="fa fa-reply"></i> রিপ্লাই</div>
    <div class="tm-ctx-item" id="tmCtxCopy"><i class="fa fa-copy"></i> কপি</div>
    <div class="tm-ctx-item danger" id="tmCtxDelete" style="display:none"><i class="fa fa-trash"></i> মুছুন</div>
</div>

<!-- Lightbox -->
<div id="tmLightbox" onclick="document.getElementById('tmLightbox').classList.remove('open')">
    <img id="tmLightboxImg" src="" alt="">
    <button id="tmLightboxClose"><i class="fa fa-times"></i></button>
</div>
        `;
        document.body.appendChild(overlay);

        /* Close on overlay backdrop click */
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) _closeChatModal();
        });

        /* Close btn */
        document.getElementById('tmChatCloseBtn').addEventListener('click', _closeChatModal);

        /* Image input */
        document.getElementById('tmImgInput').addEventListener('change', function () {
            if (!this.files || !this.files[0]) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                _mediaPreview = e.target.result;
                const bar   = document.getElementById('tmMediaBar');
                const thumb = document.getElementById('tmMediaThumb');
                thumb.src = _mediaPreview;
                bar.classList.add('show');
            };
            reader.readAsDataURL(this.files[0]);
            this.value = '';
        });

        /* Textarea auto-grow & send on Enter (Shift+Enter = newline) */
        const textarea = document.getElementById('tmMsgInput');
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            _sendTyping();
        });
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window._tmChat.sendMessage();
            }
        });

        /* Messages scroll listener */
        const msgArea = document.getElementById('tmChatMessages');
        msgArea.addEventListener('scroll', function () {
            const isBottom = (this.scrollHeight - this.scrollTop - this.clientHeight) < 60;
            _isAtBottom = isBottom;
            const btn = document.getElementById('tmScrollDownBtn');
            if (isBottom) {
                btn.classList.remove('show');
                _unreadCount = 0;
                document.getElementById('tmScrollDownBadge').style.display = 'none';
            } else {
                btn.classList.add('show');
            }
        });

        /* Context menu hide on click outside */
        document.addEventListener('click', function (e) {
            const menu = document.getElementById('tmContextMenu');
            if (!e.target.closest('#tmContextMenu')) {
                menu.style.display = 'none';
            }
        });
    }

    /* ── Inject buttons into header & mobile sheet ────────────── */
    function _injectButtons() {
        /* ── PC: inject button next to search btn ── */
        const searchBox = document.getElementById('headerSearchBox');
        if (searchBox) {
            const btn = document.createElement('button');
            btn.id = 'tmChatBtnPC';
            btn.title = 'গ্রুপ চ্যাট';
            btn.innerHTML = `
                ${_waIcon()}
                <span class="tm-chat-badge" id="tmChatBadgePC"></span>
            `;
            btn.addEventListener('click', _openChatModal);
            searchBox.parentNode.insertBefore(btn, searchBox.nextSibling);
            /* ensure flex display */
            const uc = searchBox.closest('.user-controls');
            if (uc) uc.style.display = 'flex';
        }

        /* ── Mobile: inject into bottom sheet list ── */
        _injectMobileItem();
    }

    function _injectMobileItem() {
        /* try now, retry if sheet not yet ready */
        const list = document.getElementById('mobileSheetList');
        if (!list) {
            setTimeout(_injectMobileItem, 500);
            return;
        }
        /* insert before logout button (last child) */
        const item = document.createElement('div');
        item.className = 'tm-chat-mob-item';
        item.id = 'tmChatMobItem';
        item.innerHTML = `
            <div class="mob-icon-wrap">
                ${_waIcon(26)}
            </div>
            গ্রুপ চ্যাট
            <span class="tm-mob-badge" id="tmChatBadgeMob"></span>
        `;
        item.addEventListener('click', function () {
            /* close mobile account sheet first */
            if (typeof closeMobileAccountMenu === 'function') closeMobileAccountMenu();
            setTimeout(_openChatModal, 320);
        });
        list.appendChild(item);
    }

    /* ── WhatsApp SVG icon ─────────────────────────────────────── */
    function _waIcon(size) {
        size = size || 22;
        return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="#fff">
<path d="M16 2C8.268 2 2 8.268 2 16c0 2.527.676 4.9 1.857 6.945L2 30l7.258-1.832A13.93 13.93 0 0016 30c7.732 0 14-6.268 14-14S23.732 2 16 2zm0 25.6a11.548 11.548 0 01-5.896-1.614l-.42-.252-4.31 1.089 1.113-4.194-.273-.432A11.551 11.551 0 014.4 16c0-6.396 5.204-11.6 11.6-11.6S27.6 9.604 27.6 16 22.396 27.6 16 27.6zm6.368-8.67c-.35-.175-2.066-1.02-2.387-1.137-.32-.116-.553-.175-.785.175-.233.35-.9 1.137-1.103 1.37-.204.233-.407.262-.756.087-.35-.175-1.476-.544-2.812-1.737-1.04-.927-1.74-2.073-1.944-2.423-.203-.35-.022-.538.153-.712.157-.157.35-.408.524-.612.175-.204.233-.35.35-.583.116-.233.058-.437-.029-.612-.087-.175-.785-1.893-1.075-2.592-.283-.683-.57-.59-.785-.6l-.668-.012c-.233 0-.61.087-.93.437-.32.35-1.22 1.193-1.22 2.91 0 1.718 1.25 3.378 1.424 3.611.175.233 2.46 3.754 5.962 5.265.833.36 1.483.575 1.99.735.836.266 1.597.228 2.198.138.67-.1 2.066-.845 2.358-1.661.29-.816.29-1.515.204-1.661-.087-.146-.32-.233-.67-.408z"/>
</svg>`;
    }

    /* ═══════════════════════════════════════════════════════════
       OPEN / CLOSE
    ═══════════════════════════════════════════════════════════ */
    function _openChatModal() {
        _currentUser = _getSessionUser();
        if (!_currentUser) { alert('চ্যাট করতে লগইন করুন।'); return; }

        document.getElementById('tmChatOverlay').classList.add('open');
        _isOpen = true;
        _unreadCount = 0;
        _updateBadge(0);
        document.getElementById('tmScrollDownBtn').classList.remove('show');

        /* load member count */
        _loadMemberCount();

        /* subscribe to messages */
        _subscribeMessages();

        /* focus textarea */
        setTimeout(function () {
            const ta = document.getElementById('tmMsgInput');
            if (ta) ta.focus();
        }, 300);
    }

    function _closeChatModal() {
        document.getElementById('tmChatOverlay').classList.remove('open');
        _isOpen = false;
        if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
        _clearTypingDoc();
    }

    /* ═══════════════════════════════════════════════════════════
       FIREBASE OPERATIONS
    ═══════════════════════════════════════════════════════════ */
    function _loadMemberCount() {
        if (!_db) return;
        _db.collection('users').get().then(function (snap) {
            const el = document.getElementById('tmChatMemberCount');
            if (el) el.textContent = snap.size + ' জন সদস্য';
        }).catch(function () { });
    }

    function _subscribeMessages() {
        if (!_db) {
            document.getElementById('tmChatMessages').innerHTML = `
                <div id="tmEmptyState">
                    <i class="fa fa-wifi" style="color:#ef4444;"></i>
                    <p>ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না।</p>
                </div>`;
            return;
        }

        /* show spinner */
        document.getElementById('tmChatMessages').innerHTML = `<div class="tm-spinner"><i class="fa fa-circle-notch"></i></div>`;

        if (_unsubscribe) _unsubscribe();

        _unsubscribe = _db.collection('tm_groups')
            .doc(GROUP_ID)
            .collection('messages')
            .orderBy('ts', 'asc')
            .limitToLast(MAX_MSG)
            .onSnapshot(function (snap) {
                _renderMessages(snap.docs);
                /* listen typing separately */
                _listenTyping();
            }, function (err) {
                console.error('[Chat]', err);
                document.getElementById('tmChatMessages').innerHTML = `
                    <div id="tmEmptyState">
                        <i class="fa fa-exclamation-circle" style="color:#ef4444;"></i>
                        <p>মেসেজ লোড করতে সমস্যা হচ্ছে।</p>
                    </div>`;
            });
    }

    /* ── Render all messages ─────────────────────────────────── */
    function _renderMessages(docs) {
        const area = document.getElementById('tmChatMessages');
        if (!area) return;

        if (!docs.length) {
            area.innerHTML = `<div id="tmEmptyState"><i class="fa fa-comments"></i><p>এখনো কোনো মেসেজ নেই। প্রথম মেসেজ পাঠান! 👋</p></div>`;
            return;
        }

        _lastMsgDate = null;
        const fragment = document.createDocumentFragment();

        docs.forEach(function (doc) {
            const data = doc.data();
            const el   = _createMsgElement(doc.id, data);
            fragment.appendChild(el);
        });

        area.innerHTML = '';
        area.appendChild(fragment);

        if (_isAtBottom) {
            area.scrollTop = area.scrollHeight;
        } else {
            _unreadCount++;
            const badge = document.getElementById('tmScrollDownBadge');
            badge.textContent = _unreadCount > 9 ? '9+' : _unreadCount;
            badge.style.display = 'flex';
        }

        /* mark own messages as seen */
        _markSeen(docs);
    }

    /* ── Create a single message element ────────────────────── */
    function _createMsgElement(docId, data) {
        const wrap = document.createDocumentFragment();
        const isOwn = _currentUser && String(data.senderId) === String(_currentUser.id);

        /* date divider */
        if (data.ts) {
            const d = data.ts.toDate ? data.ts.toDate() : new Date(data.ts);
            const dateStr = _formatDate(d);
            if (dateStr !== _lastMsgDate) {
                _lastMsgDate = dateStr;
                const div = document.createElement('div');
                div.className = 'tm-date-div';
                div.innerHTML = `<span>${dateStr}</span>`;
                wrap.appendChild(div);
            }
        }

        const msgWrap = document.createElement('div');
        msgWrap.className = 'tm-msg-wrap ' + (isOwn ? 'own' : 'other');
        msgWrap.dataset.id = docId;

        /* avatar */
        const avatar = document.createElement('div');
        avatar.className = 'tm-msg-avatar';
        if (data.senderAvatar) {
            avatar.innerHTML = `<img src="${data.senderAvatar}" alt="">`;
        } else {
            avatar.innerHTML = `<i class="fa fa-user"></i>`;
        }

        /* bubble */
        const bubble = document.createElement('div');
        bubble.className = 'tm-bubble';

        /* sender name (only for others) */
        if (!isOwn) {
            const nameEl = document.createElement('div');
            nameEl.className = 'tm-sender-name';
            nameEl.style.color = _nameColor(data.senderId);
            nameEl.textContent = data.senderName || 'User';
            bubble.appendChild(nameEl);
        }

        /* reply quote */
        if (data.replyTo) {
            const q = document.createElement('div');
            q.className = 'tm-reply-quote';
            q.innerHTML = `<strong>${_esc(data.replyTo.senderName || '')}</strong>${_esc(data.replyTo.text || '📷 ছবি')}`;
            bubble.appendChild(q);
        }

        /* image or text */
        if (data.imgData) {
            const img = document.createElement('img');
            img.className = 'tm-msg-img';
            img.src = data.imgData;
            img.alt = '📷';
            img.loading = 'lazy';
            img.addEventListener('click', function () { _openLightbox(data.imgData); });
            bubble.appendChild(img);
        }
        if (data.text) {
            const txt = document.createElement('div');
            txt.className = 'tm-msg-text';
            txt.textContent = data.text;
            bubble.appendChild(txt);
        }

        /* time + ticks */
        const timeRow = document.createElement('div');
        timeRow.className = 'tm-msg-time';
        const ts = data.ts ? (data.ts.toDate ? data.ts.toDate() : new Date(data.ts)) : new Date();
        timeRow.innerHTML = _formatTime(ts);
        if (isOwn) {
            const seen = data.seenBy && data.seenBy.length > 1;
            timeRow.innerHTML += `<span class="tm-tick${seen ? ' seen' : ''}">✓✓</span>`;
        }
        bubble.appendChild(timeRow);

        /* assemble */
        if (isOwn) {
            msgWrap.appendChild(bubble);
            msgWrap.appendChild(avatar);
        } else {
            msgWrap.appendChild(avatar);
            msgWrap.appendChild(bubble);
        }

        /* long-press / right-click context menu */
        _bindContextMenu(msgWrap, docId, data, isOwn);

        wrap.appendChild(msgWrap);
        return wrap;
    }

    /* ── Context menu binding ────────────────────────────────── */
    function _bindContextMenu(el, docId, data, isOwn) {
        let timer;
        function showMenu(x, y) {
            const menu     = document.getElementById('tmContextMenu');
            const replyBtn = document.getElementById('tmCtxReply');
            const copyBtn  = document.getElementById('tmCtxCopy');
            const delBtn   = document.getElementById('tmCtxDelete');

            replyBtn.onclick = function () {
                menu.style.display = 'none';
                _setReply(docId, data);
            };
            copyBtn.onclick = function () {
                menu.style.display = 'none';
                if (data.text) navigator.clipboard && navigator.clipboard.writeText(data.text);
            };
            if (isOwn) {
                delBtn.style.display = 'flex';
                delBtn.onclick = function () {
                    menu.style.display = 'none';
                    _deleteMsg(docId);
                };
            } else {
                delBtn.style.display = 'none';
            }

            menu.style.display = 'block';
            /* position */
            const vw = window.innerWidth, vh = window.innerHeight;
            let left = x, top = y;
            if (left + 200 > vw) left = vw - 210;
            if (top + 150 > vh) top = vh - 160;
            menu.style.left = left + 'px';
            menu.style.top  = top + 'px';
        }

        /* touch long-press */
        el.addEventListener('touchstart', function (e) {
            timer = setTimeout(function () {
                const t = e.touches[0];
                showMenu(t.clientX, t.clientY);
            }, 500);
        }, { passive: true });
        el.addEventListener('touchend',  function () { clearTimeout(timer); }, { passive: true });
        el.addEventListener('touchmove', function () { clearTimeout(timer); }, { passive: true });

        /* right-click */
        el.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            showMenu(e.clientX, e.clientY);
        });
    }

    /* ── Send message ────────────────────────────────────────── */
    function sendMessage() {
        if (!_db || !_currentUser) return;
        const ta   = document.getElementById('tmMsgInput');
        const text = (ta.value || '').trim();

        if (!text && !_mediaPreview) return;

        const msg = {
            senderId:   String(_currentUser.id),
            senderName: _currentUser.name || 'User',
            senderAvatar: localStorage.getItem('user_profile_pic') || '',
            text:       text,
            ts:         firebase.firestore.FieldValue.serverTimestamp(),
            seenBy:     [String(_currentUser.id)]
        };

        if (_replyTarget) {
            msg.replyTo = {
                id:         _replyTarget.id,
                senderName: _replyTarget.senderName,
                text:       _replyTarget.text
            };
        }

        if (_mediaPreview) {
            msg.imgData = _mediaPreview;
        }

        _db.collection('tm_groups').doc(GROUP_ID)
           .collection('messages').add(msg)
           .then(function () {
               ta.value = '';
               ta.style.height = 'auto';
               _cancelReply();
               _cancelMedia();
               _clearTypingDoc();
               /* scroll to bottom */
               setTimeout(function () {
                   const area = document.getElementById('tmChatMessages');
                   if (area) area.scrollTop = area.scrollHeight;
                   _isAtBottom = true;
               }, 100);
           })
           .catch(function (err) { console.error('[Chat send]', err); });
    }

    /* ── Delete message ─────────────────────────────────────── */
    function _deleteMsg(docId) {
        if (!_db) return;
        if (!confirm('এই মেসেজ মুছে ফেলবেন?')) return;
        _db.collection('tm_groups').doc(GROUP_ID)
           .collection('messages').doc(docId).delete();
    }

    /* ── Mark seen ──────────────────────────────────────────── */
    function _markSeen(docs) {
        if (!_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        docs.forEach(function (doc) {
            const d = doc.data();
            if (d.senderId !== uid && (!d.seenBy || !d.seenBy.includes(uid))) {
                doc.ref.update({
                    seenBy: firebase.firestore.FieldValue.arrayUnion(uid)
                }).catch(function () { });
            }
        });
    }

    /* ── Typing indicator ────────────────────────────────────── */
    let _typingListenerUnsub = null;

    function _sendTyping() {
        if (!_db || !_currentUser) return;
        clearTimeout(_typingTimer);
        _db.collection('tm_groups').doc(GROUP_ID)
           .collection('typing').doc(String(_currentUser.id))
           .set({ name: _currentUser.name, ts: firebase.firestore.FieldValue.serverTimestamp() })
           .catch(function () { });
        _typingTimer = setTimeout(_clearTypingDoc, TYPING_TTL);
    }

    function _clearTypingDoc() {
        if (!_db || !_currentUser) return;
        _db.collection('tm_groups').doc(GROUP_ID)
           .collection('typing').doc(String(_currentUser.id))
           .delete().catch(function () { });
    }

    function _listenTyping() {
        if (!_db || _typingListenerUnsub) return;
        _typingListenerUnsub = _db.collection('tm_groups').doc(GROUP_ID)
            .collection('typing')
            .onSnapshot(function (snap) {
                const bar = document.getElementById('tmTypingBar');
                if (!bar) return;
                const uid = _currentUser ? String(_currentUser.id) : '';
                const names = [];
                snap.docs.forEach(function (d) {
                    if (d.id !== uid) names.push(d.data().name);
                });
                if (names.length === 0) {
                    bar.innerHTML = '';
                } else if (names.length === 1) {
                    bar.innerHTML = `<span class="tm-typing-text">${_esc(names[0])} টাইপ করছে...</span>`;
                } else {
                    bar.innerHTML = `<span class="tm-typing-text">${names.length} জন টাইপ করছে...</span>`;
                }
            }, function () { });
    }

    /* ── Reply helpers ─────────────────────────────────────── */
    function _setReply(docId, data) {
        _replyTarget = {
            id:         docId,
            senderName: data.senderName || 'User',
            text:       data.text || '📷 ছবি'
        };
        const bar  = document.getElementById('tmReplyBar');
        const prev = document.getElementById('tmReplyPreview');
        prev.innerHTML = `<strong>${_esc(_replyTarget.senderName)}</strong>${_esc(_replyTarget.text)}`;
        bar.classList.add('show');
        document.getElementById('tmMsgInput').focus();
    }

    function cancelReply() {
        _replyTarget = null;
        document.getElementById('tmReplyBar').classList.remove('show');
    }

    function cancelMedia() {
        _mediaPreview = null;
        document.getElementById('tmMediaBar').classList.remove('show');
        document.getElementById('tmMediaThumb').src = '';
    }

    /* ── Lightbox ─────────────────────────────────────────── */
    function _openLightbox(src) {
        document.getElementById('tmLightboxImg').src = src;
        document.getElementById('tmLightbox').classList.add('open');
    }

    /* ── Hotkey: Ctrl/Cmd + Shift + C ──────────────────────── */
    function _bindHotkey() {
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                if (_isOpen) _closeChatModal(); else _openChatModal();
            }
            if (e.key === 'Escape' && _isOpen) _closeChatModal();
        });
    }

    /* ── Badge update ──────────────────────────────────────── */
    function _updateBadge(n) {
        const pcBadge  = document.getElementById('tmChatBadgePC');
        const mobBadge = document.getElementById('tmChatBadgeMob');
        if (pcBadge)  { pcBadge.textContent  = n > 9 ? '9+' : n; pcBadge.classList.toggle('show',  n > 0); }
        if (mobBadge) { mobBadge.textContent  = n > 9 ? '9+' : n; mobBadge.classList.toggle('show', n > 0); }
    }

    /* scroll to bottom */
    function scrollToBottom() {
        const area = document.getElementById('tmChatMessages');
        if (area) { area.scrollTop = area.scrollHeight; _isAtBottom = true; _unreadCount = 0; }
        document.getElementById('tmScrollDownBtn').classList.remove('show');
        document.getElementById('tmScrollDownBadge').style.display = 'none';
    }

    /* ── Utilities ─────────────────────────────────────────── */
    function _esc(str) {
        return String(str || '')
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;');
    }

    function _formatTime(d) {
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
        return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
    }

    /* deterministic color per senderId */
    function _nameColor(id) {
        const colors = ['#e91e63','#9c27b0','#3f51b5','#2196f3','#009688','#ff5722','#795548','#607d8b'];
        let h = 0;
        String(id).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) & 0xffff; });
        return colors[h % colors.length];
    }

    /* ── Public API ─────────────────────────────────────────── */
    window._tmChat = {
        open:          _openChatModal,
        close:         _closeChatModal,
        sendMessage:   sendMessage,
        cancelReply:   cancelReply,
        cancelMedia:   cancelMedia,
        scrollToBottom:scrollToBottom
    };

    /* background unread counter (when modal is closed) */
    setInterval(function () {
        if (_isOpen || !_db || !_currentUser) return;
        const uid = String(_currentUser.id);
        _db.collection('tm_groups').doc(GROUP_ID)
           .collection('messages')
           .orderBy('ts','desc').limit(20)
           .get().then(function (snap) {
               let n = 0;
               snap.docs.forEach(function (d) {
                   const data = d.data();
                   if (data.senderId !== uid && (!data.seenBy || !data.seenBy.includes(uid))) n++;
               });
               _updateBadge(n);
           }).catch(function () { });
    }, 30000);

})();
