/* ================================================================
   DIGITAL SHOP TM — Group Chat System  v3.0
   WhatsApp-style UI | Bengali Support | Dark/Light Theme
   ================================================================ */

(function () {
    'use strict';

    /* ── Storage Keys ─────────────────────────────────────────── */
    var CHAT_GROUPS_KEY   = 'TM_CHAT_GROUPS_V1';
    var CHAT_MESSAGES_KEY = 'TM_CHAT_MESSAGES_V1';

    /* ── Default Groups (ছবিতে দেখা দুটো group) ──────────────── */
    var DEFAULT_GROUPS = [
        {
            id: 'group_mytv',
            name: 'My TV',
            icon: '📺',
            color: '#7c3aed',
            description: 'My TV গ্রুপ চ্যাট',
            createdAt: Date.now() - 86400000
        },
        {
            id: 'group_public',
            name: 'Digital Shop TM সার্বজনীন',
            icon: '🛍️',
            color: '#00b894',
            description: 'Digital Shop TM এর সবার জন্য গ্রুপ',
            createdAt: Date.now() - 172800000
        }
    ];

    /* ── State ────────────────────────────────────────────────── */
    var state = {
        groups: [],
        messages: {},      // { groupId: [ {id, userId, userName, text, time, ts} ] }
        activeGroupId: null,
        filter: 'all',     // 'all' | 'unread' | 'groups'
        searchQuery: '',
        unread: {}         // { groupId: count }
    };

    /* ══════════════════════════════════════════════════════════
       ── STORAGE HELPERS ──────────────────────────────────────
    ══════════════════════════════════════════════════════════ */
    function loadGroups() {
        try {
            var raw = localStorage.getItem(CHAT_GROUPS_KEY);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return null;
    }
    function saveGroups() {
        localStorage.setItem(CHAT_GROUPS_KEY, JSON.stringify(state.groups));
    }
    function loadMessages() {
        try {
            var raw = localStorage.getItem(CHAT_MESSAGES_KEY);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return {};
    }
    function saveMessages() {
        localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(state.messages));
    }
    function loadUnread() {
        try {
            var raw = localStorage.getItem('TM_CHAT_UNREAD_V1');
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return {};
    }
    function saveUnread() {
        localStorage.setItem('TM_CHAT_UNREAD_V1', JSON.stringify(state.unread));
    }

    /* ── Get current user from appState ─────────────────────── */
    function getCurrentUser() {
        if (window.appState && window.appState.currentUser) {
            return window.appState.currentUser;
        }
        return null;
    }
    function isAdmin() {
        var u = getCurrentUser();
        return u && (u.role === 'admin' || u.role === 'sub_admin');
    }
    function isLoggedIn() {
        return !!getCurrentUser();
    }

    /* ── Format time ─────────────────────────────────────────── */
    function fmtTime(ts) {
        var d = new Date(ts);
        var now = new Date();
        var diff = now - d;
        if (diff < 86400000 && now.getDate() === d.getDate()) {
            var h = d.getHours(), m = d.getMinutes();
            var ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
        }
        if (diff < 172800000) return 'গতকাল';
        return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
    }
    function fmtFullTime(ts) {
        var d = new Date(ts);
        var h = d.getHours(), m = d.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    /* ── Avatar initials ─────────────────────────────────────── */
    function avatarInitials(name) {
        if (!name) return '?';
        var words = name.trim().split(' ');
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    }
    function avatarColor(str) {
        var colors = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#00b894','#6366f1'];
        var hash = 0;
        for (var i = 0; i < (str||'').length; i++) hash += str.charCodeAt(i);
        return colors[hash % colors.length];
    }

    /* ══════════════════════════════════════════════════════════
       ── INJECT CSS ────────────────────────────────────────────
    ══════════════════════════════════════════════════════════ */
    function injectCSS() {
        if (document.getElementById('tm-chat-css')) return;
        var s = document.createElement('style');
        s.id = 'tm-chat-css';
        s.textContent = `
/* ── Chat Overlay ── */
#tmChatOverlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    align-items: center;
    justify-content: center;
    font-family: 'Hind Siliguri', sans-serif;
}
#tmChatOverlay.open { display: flex; }

/* ── Chat Window ── */
#tmChatWindow {
    width: 96vw;
    max-width: 960px;
    height: 90vh;
    max-height: 700px;
    background: #fff;
    border-radius: 20px;
    overflow: hidden;
    display: flex;
    box-shadow: 0 25px 60px rgba(0,0,0,0.35);
    animation: tmChatSlideIn 0.25s cubic-bezier(.34,1.56,.64,1);
}
body.dark-theme #tmChatWindow { background: #1a1f2e; }

@keyframes tmChatSlideIn {
    from { transform: scale(0.88) translateY(30px); opacity: 0; }
    to   { transform: scale(1) translateY(0);        opacity: 1; }
}

/* ══ LEFT SIDEBAR ══ */
#tmChatSidebar {
    width: 340px;
    min-width: 260px;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-right: 1px solid #e8ecf0;
    flex-shrink: 0;
}
body.dark-theme #tmChatSidebar {
    background: #1a1f2e;
    border-right-color: #2a3045;
}

/* Sidebar Header */
.tm-chat-sidebar-header {
    background: #00b894;
    padding: 16px 18px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
}
.tm-chat-sidebar-title {
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.3px;
}
.tm-chat-header-actions {
    display: flex;
    gap: 6px;
    align-items: center;
}
.tm-chat-header-btn {
    background: rgba(255,255,255,0.2);
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}
.tm-chat-header-btn:hover { background: rgba(255,255,255,0.35); }

/* Search Bar */
.tm-chat-search-wrap {
    padding: 10px 14px;
    background: #f0f4f8;
    flex-shrink: 0;
}
body.dark-theme .tm-chat-search-wrap { background: #222840; }
.tm-chat-search-bar {
    display: flex;
    align-items: center;
    background: #fff;
    border-radius: 22px;
    padding: 7px 14px;
    gap: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
body.dark-theme .tm-chat-search-bar { background: #2a3045; }
.tm-chat-search-bar i { color: #9ca3af; font-size: 14px; }
.tm-chat-search-input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 13.5px;
    flex: 1;
    color: #2d3436;
    font-family: 'Hind Siliguri', sans-serif;
}
body.dark-theme .tm-chat-search-input { color: #dfe6e9; }
.tm-chat-search-input::placeholder { color: #9ca3af; }

/* Filter Tabs */
.tm-chat-filters {
    display: flex;
    padding: 0 14px 10px;
    background: #f0f4f8;
    gap: 8px;
    flex-shrink: 0;
}
body.dark-theme .tm-chat-filters { background: #222840; }
.tm-chat-filter-btn {
    padding: 4px 14px;
    border-radius: 16px;
    font-size: 12.5px;
    font-weight: 600;
    border: 1.5px solid #d1d5db;
    background: #fff;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Hind Siliguri', sans-serif;
}
body.dark-theme .tm-chat-filter-btn {
    background: #2a3045;
    border-color: #3a4060;
    color: #9ca3af;
}
.tm-chat-filter-btn.active {
    background: #00b894;
    border-color: #00b894;
    color: #fff;
}

/* Group List */
#tmChatGroupList {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
}
#tmChatGroupList::-webkit-scrollbar { width: 3px; }
#tmChatGroupList::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

/* Group Item */
.tm-group-item {
    display: flex;
    align-items: center;
    padding: 12px 18px;
    cursor: pointer;
    transition: background 0.15s;
    gap: 12px;
    position: relative;
    border-bottom: 1px solid #f3f4f6;
}
body.dark-theme .tm-group-item { border-bottom-color: #252b3d; }
.tm-group-item:hover { background: #f0fdf9; }
body.dark-theme .tm-group-item:hover { background: #222840; }
.tm-group-item.active { background: #e6faf5; }
body.dark-theme .tm-group-item.active { background: #1e3a32; }

/* Avatar */
.tm-group-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
    font-weight: 700;
    color: #fff;
    position: relative;
}
.tm-group-avatar.text-avatar { font-size: 16px; letter-spacing: -1px; }
.tm-group-online-dot {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 13px;
    height: 13px;
    background: #22c55e;
    border-radius: 50%;
    border: 2px solid #fff;
}
body.dark-theme .tm-group-online-dot { border-color: #1a1f2e; }

/* Group Info */
.tm-group-info { flex: 1; min-width: 0; }
.tm-group-name-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
}
.tm-group-name {
    font-size: 14.5px;
    font-weight: 700;
    color: #1a202c;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
body.dark-theme .tm-group-name { color: #e2e8f0; }
.tm-group-time {
    font-size: 11.5px;
    color: #9ca3af;
    white-space: nowrap;
    margin-left: 6px;
    flex-shrink: 0;
}
.tm-group-last-msg {
    font-size: 12.5px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
}
body.dark-theme .tm-group-last-msg { color: #9ca3af; }
.tm-unread-badge {
    background: #00b894;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    flex-shrink: 0;
}

/* Add Group Button */
.tm-add-group-btn {
    margin: 10px 14px 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px;
    background: linear-gradient(135deg, #00b894, #00a884);
    color: #fff;
    border-radius: 14px;
    cursor: pointer;
    font-size: 13.5px;
    font-weight: 700;
    border: none;
    transition: all 0.2s;
    font-family: 'Hind Siliguri', sans-serif;
    box-shadow: 0 4px 12px rgba(0,184,148,0.3);
    flex-shrink: 0;
}
.tm-add-group-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,184,148,0.4); }

/* ══ RIGHT PANEL ══ */
#tmChatPanel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #f0f4f8;
    min-width: 0;
}
body.dark-theme #tmChatPanel { background: #151929; }

/* Empty State */
#tmChatEmpty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    gap: 14px;
    text-align: center;
    padding: 30px;
}
#tmChatEmpty .tm-empty-icon { font-size: 60px; opacity: 0.35; }
#tmChatEmpty p { font-size: 15px; font-weight: 600; color: #9ca3af; }
#tmChatEmpty span { font-size: 13px; color: #b0b8c4; }

/* Chat Header */
#tmChatRoomHeader {
    display: none;
    align-items: center;
    padding: 14px 20px;
    background: #00b894;
    gap: 12px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
#tmChatRoomHeader.visible { display: flex; }
.tm-room-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    background: rgba(255,255,255,0.25);
    flex-shrink: 0;
}
.tm-room-info { flex: 1; min-width: 0; }
.tm-room-name {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.tm-room-status { font-size: 12px; color: rgba(255,255,255,0.82); }
.tm-room-close-btn {
    background: rgba(255,255,255,0.2);
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    flex-shrink: 0;
}
.tm-room-close-btn:hover { background: rgba(255,255,255,0.35); }

/* Message Area */
#tmChatMessages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300b894' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}
body.dark-theme #tmChatMessages {
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300b894' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}
#tmChatMessages::-webkit-scrollbar { width: 4px; }
#tmChatMessages::-webkit-scrollbar-thumb { background: rgba(0,184,148,0.3); border-radius: 4px; }

/* Date divider */
.tm-date-divider {
    text-align: center;
    margin: 10px 0;
    position: relative;
}
.tm-date-divider span {
    background: rgba(0,0,0,0.12);
    color: #fff;
    font-size: 11.5px;
    padding: 3px 12px;
    border-radius: 10px;
    font-weight: 600;
}
body.dark-theme .tm-date-divider span { background: rgba(255,255,255,0.1); }

/* Message Bubble */
.tm-msg-wrap {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    max-width: 75%;
}
.tm-msg-wrap.mine {
    align-self: flex-end;
    flex-direction: row-reverse;
}
.tm-msg-wrap.theirs { align-self: flex-start; }

.tm-msg-user-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
    margin-bottom: 2px;
}

.tm-bubble {
    padding: 9px 13px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.55;
    word-break: break-word;
    max-width: 100%;
    box-shadow: 0 1px 2px rgba(0,0,0,0.10);
    position: relative;
}
.tm-msg-wrap.mine .tm-bubble {
    background: #00b894;
    color: #fff;
    border-bottom-right-radius: 5px;
}
.tm-msg-wrap.theirs .tm-bubble {
    background: #fff;
    color: #1a202c;
    border-bottom-left-radius: 5px;
}
body.dark-theme .tm-msg-wrap.theirs .tm-bubble {
    background: #2a3045;
    color: #e2e8f0;
}
.tm-msg-sender-name {
    font-size: 11.5px;
    font-weight: 700;
    margin-bottom: 3px;
}
.tm-msg-time {
    font-size: 10.5px;
    opacity: 0.68;
    margin-top: 4px;
    text-align: right;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
}
.tm-tick { font-size: 12px; }
.tm-tick.read { color: #a7f3d0; }

/* System message */
.tm-sys-msg {
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
    padding: 4px 0;
}

/* Input Area */
#tmChatInputArea {
    display: none;
    padding: 12px 16px;
    background: #fff;
    border-top: 1px solid #e8ecf0;
    gap: 10px;
    align-items: flex-end;
    flex-shrink: 0;
}
body.dark-theme #tmChatInputArea {
    background: #1a1f2e;
    border-top-color: #2a3045;
}
#tmChatInputArea.visible { display: flex; }

.tm-chat-input-box {
    flex: 1;
    background: #f0f4f8;
    border-radius: 24px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1.5px solid transparent;
    transition: border-color 0.2s;
}
body.dark-theme .tm-chat-input-box { background: #222840; }
.tm-chat-input-box:focus-within { border-color: #00b894; }

#tmChatTextInput {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: #1a202c;
    font-family: 'Hind Siliguri', sans-serif;
    resize: none;
    max-height: 100px;
    min-height: 20px;
    line-height: 1.4;
}
body.dark-theme #tmChatTextInput { color: #e2e8f0; }
#tmChatTextInput::placeholder { color: #9ca3af; }

#tmChatSendBtn {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: #00b894;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
    box-shadow: 0 3px 10px rgba(0,184,148,0.35);
}
#tmChatSendBtn:hover { background: #00a884; transform: scale(1.06); }
#tmChatSendBtn:active { transform: scale(0.95); }

/* Login prompt */
#tmChatLoginPrompt {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: #fff;
    border-top: 1px solid #e8ecf0;
    gap: 8px;
    flex-shrink: 0;
}
body.dark-theme #tmChatLoginPrompt { background: #1a1f2e; border-top-color: #2a3045; }
#tmChatLoginPrompt.visible { display: flex; }
#tmChatLoginPrompt p { font-size: 13px; color: #6b7280; text-align: center; }
#tmChatLoginPrompt button {
    padding: 9px 28px;
    background: #00b894;
    color: #fff;
    border: none;
    border-radius: 20px;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
    font-family: 'Hind Siliguri', sans-serif;
    transition: background 0.2s;
}
#tmChatLoginPrompt button:hover { background: #00a884; }

/* ── PC Chat Button ── */
#tmChatBtnPC {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 15px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    font-size: 12.5px;
    font-weight: 600;
    color: #1e293b;
    cursor: pointer;
    font-family: 'Hind Siliguri', sans-serif;
    transition: all 0.2s;
    position: relative;
}
body.dark-theme #tmChatBtnPC {
    background: #2d3436;
    border-color: #636e72;
    color: #dfe6e9;
}
#tmChatBtnPC:hover { background: #e6faf5; border-color: #00b894; color: #00b894; }
#tmChatBtnPC i { font-size: 14px; color: #00b894; }
#tmChatBtnPC .tm-notif-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 9px;
    height: 9px;
    background: #ef4444;
    border-radius: 50%;
    border: 2px solid #fff;
    display: none;
}
#tmChatBtnPC .tm-notif-dot.show { display: block; }

/* ── Mobile Floating Button ── */
#tmChatBtnMobile {
    position: fixed;
    bottom: 80px;
    right: 18px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #00b894, #00cec9);
    border: none;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    box-shadow: 0 6px 20px rgba(0,184,148,0.5);
    z-index: 99999;
    transition: all 0.2s;
}
html.is-mobile #tmChatBtnMobile { display: flex; }
#tmChatBtnMobile:hover { transform: scale(1.1); }
#tmChatBtnMobile .tm-mob-notif {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 18px;
    height: 18px;
    background: #ef4444;
    border-radius: 50%;
    border: 2px solid #fff;
    font-size: 10px;
    font-weight: 700;
    display: none;
    align-items: center;
    justify-content: center;
}
#tmChatBtnMobile .tm-mob-notif.show { display: flex; }

/* ── Add Group Modal ── */
#tmAddGroupModal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9999999;
    background: rgba(0,0,0,0.55);
    align-items: center;
    justify-content: center;
}
#tmAddGroupModal.open { display: flex; }
.tm-add-group-box {
    background: #fff;
    border-radius: 20px;
    width: 90%;
    max-width: 380px;
    padding: 28px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
    animation: tmChatSlideIn 0.2s ease;
}
body.dark-theme .tm-add-group-box { background: #1a1f2e; }
.tm-add-group-box h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1a202c;
    margin-bottom: 18px;
    text-align: center;
}
body.dark-theme .tm-add-group-box h3 { color: #e2e8f0; }
.tm-add-group-input {
    width: 100%;
    padding: 11px 16px;
    border-radius: 12px;
    border: 1.5px solid #e2e8f0;
    font-size: 14px;
    margin-bottom: 12px;
    outline: none;
    font-family: 'Hind Siliguri', sans-serif;
    color: #1a202c;
    background: #f8fafc;
    box-sizing: border-box;
    transition: border-color 0.2s;
}
body.dark-theme .tm-add-group-input {
    background: #222840;
    border-color: #3a4060;
    color: #e2e8f0;
}
.tm-add-group-input:focus { border-color: #00b894; }
.tm-add-group-actions {
    display: flex;
    gap: 10px;
    margin-top: 6px;
}
.tm-add-group-actions button {
    flex: 1;
    padding: 11px;
    border-radius: 12px;
    border: none;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: 'Hind Siliguri', sans-serif;
    transition: all 0.2s;
}
.tm-btn-cancel { background: #f0f4f8; color: #6b7280; }
body.dark-theme .tm-btn-cancel { background: #2a3045; color: #9ca3af; }
.tm-btn-create { background: #00b894; color: #fff; box-shadow: 0 4px 12px rgba(0,184,148,0.3); }
.tm-btn-create:hover { background: #00a884; }

/* ── Mobile full-screen adjustments ── */
@media (max-width: 640px) {
    #tmChatWindow {
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
        flex-direction: column;
    }
    #tmChatSidebar {
        width: 100%;
        height: 100%;
        border-right: none;
        display: flex;
    }
    #tmChatSidebar.mobile-hidden { display: none !important; }
    #tmChatPanel { width: 100%; }
    #tmChatPanel.mobile-hidden { display: none !important; }
    .tm-room-back-btn {
        display: flex !important;
    }
}
.tm-room-back-btn {
    display: none;
    background: rgba(255,255,255,0.2);
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
    flex-shrink: 0;
}
        `;
        document.head.appendChild(s);
    }

    /* ══════════════════════════════════════════════════════════
       ── BUILD HTML ────────────────────────────────────────────
    ══════════════════════════════════════════════════════════ */
    function buildHTML() {
        if (document.getElementById('tmChatOverlay')) return;

        /* ─ PC Nav Button ─ */
        var pcNav = document.getElementById('pcQuickNav');
        if (pcNav && !document.getElementById('tmChatBtnPC')) {
            var pcBtn = document.createElement('button');
            pcBtn.id = 'tmChatBtnPC';
            pcBtn.title = 'গ্রুপ চ্যাট খুলুন';
            pcBtn.innerHTML = '<i class="fa fa-comments"></i> Chats <span class="tm-notif-dot" id="tmPCNotifDot"></span>';
            pcBtn.onclick = openChat;
            pcNav.appendChild(pcBtn);
        }

        /* ─ Mobile Floating Button ─ */
        if (!document.getElementById('tmChatBtnMobile')) {
            var mobBtn = document.createElement('button');
            mobBtn.id = 'tmChatBtnMobile';
            mobBtn.title = 'চ্যাট';
            mobBtn.innerHTML = '<i class="fa fa-comments"></i><span class="tm-mob-notif" id="tmMobNotifBadge"></span>';
            mobBtn.onclick = openChat;
            document.body.appendChild(mobBtn);
        }

        /* ─ Main Overlay ─ */
        var overlay = document.createElement('div');
        overlay.id = 'tmChatOverlay';
        overlay.innerHTML = `
<div id="tmChatWindow">

  <!-- LEFT SIDEBAR -->
  <div id="tmChatSidebar">
    <!-- Header -->
    <div class="tm-chat-sidebar-header">
      <span class="tm-chat-sidebar-title">Chats</span>
      <div class="tm-chat-header-actions">
        <button class="tm-chat-header-btn" onclick="window.tmChat.openAddGroup()" title="নতুন গ্রুপ"><i class="fa fa-plus"></i></button>
        <button class="tm-chat-header-btn" onclick="window.tmChat.close()" title="বন্ধ করুন"><i class="fa fa-times"></i></button>
      </div>
    </div>
    <!-- Search -->
    <div class="tm-chat-search-wrap">
      <div class="tm-chat-search-bar">
        <i class="fa fa-search"></i>
        <input type="text" class="tm-chat-search-input" id="tmChatSearch" placeholder="নাম, মোবাইল বা জিসেইল দিয়ে খুঁজুন..." oninput="window.tmChat.onSearch(this.value)" />
      </div>
    </div>
    <!-- Filters -->
    <div class="tm-chat-filters">
      <button class="tm-chat-filter-btn active" id="tmFilterAll" onclick="window.tmChat.setFilter('all')">All</button>
      <button class="tm-chat-filter-btn" id="tmFilterUnread" onclick="window.tmChat.setFilter('unread')">Unread</button>
      <button class="tm-chat-filter-btn" id="tmFilterGroups" onclick="window.tmChat.setFilter('groups')">Groups</button>
    </div>
    <!-- Group List -->
    <div id="tmChatGroupList"></div>
    <!-- Add Group (admin only) -->
    <button class="tm-add-group-btn" id="tmAddGroupBtn" onclick="window.tmChat.openAddGroup()" style="display:none;">
      <i class="fa fa-plus-circle"></i> নতুন গ্রুপ তৈরি করুন
    </button>
  </div>

  <!-- RIGHT PANEL -->
  <div id="tmChatPanel">
    <!-- Empty state -->
    <div id="tmChatEmpty">
      <div class="tm-empty-icon">💬</div>
      <p>আপনার বার্তাগুলো প্রাইভেট।</p>
      <span>চ্যাট শুরু করতে একটি গ্রুপ সিলেক্ট করুন।</span>
    </div>
    <!-- Chat Room Header -->
    <div id="tmChatRoomHeader">
      <button class="tm-room-back-btn" onclick="window.tmChat.goBackToList()"><i class="fa fa-arrow-left"></i></button>
      <div class="tm-room-avatar" id="tmRoomAvatar">💬</div>
      <div class="tm-room-info">
        <div class="tm-room-name" id="tmRoomName">Group</div>
        <div class="tm-room-status" id="tmRoomStatus">সবার জন্য উন্মুক্ত</div>
      </div>
      <button class="tm-room-close-btn" onclick="window.tmChat.close()"><i class="fa fa-times"></i></button>
    </div>
    <!-- Messages -->
    <div id="tmChatMessages"></div>
    <!-- Input -->
    <div id="tmChatInputArea">
      <div class="tm-chat-input-box">
        <textarea id="tmChatTextInput" rows="1" placeholder="এখানে মেসেজ লিখুন..." onkeydown="window.tmChat.onKeyDown(event)" oninput="window.tmChat.autoResize(this)"></textarea>
      </div>
      <button id="tmChatSendBtn" onclick="window.tmChat.sendMessage()"><i class="fa fa-paper-plane"></i></button>
    </div>
    <!-- Login Prompt -->
    <div id="tmChatLoginPrompt">
      <p>মেসেজ পাঠাতে আগে লগইন করুন</p>
      <button onclick="window.tmChat.close(); if(typeof openModal==='function') openModal('loginModal');">লগইন করুন</button>
    </div>
  </div>

</div>
        `;
        overlay.onclick = function(e) {
            if (e.target === overlay) closeChat();
        };
        document.body.appendChild(overlay);

        /* ─ Add Group Modal ─ */
        var addModal = document.createElement('div');
        addModal.id = 'tmAddGroupModal';
        addModal.innerHTML = `
<div class="tm-add-group-box">
  <h3>✨ নতুন গ্রুপ তৈরি করুন</h3>
  <input type="text" class="tm-add-group-input" id="tmNewGroupName" placeholder="গ্রুপের নাম দিন" maxlength="40" />
  <input type="text" class="tm-add-group-input" id="tmNewGroupDesc" placeholder="বিবরণ (ঐচ্ছিক)" maxlength="80" />
  <input type="text" class="tm-add-group-input" id="tmNewGroupIcon" placeholder="ইমোজি আইকন (যেমন: 🎉)" maxlength="4" />
  <div class="tm-add-group-actions">
    <button class="tm-btn-cancel" onclick="window.tmChat.closeAddGroup()">বাতিল</button>
    <button class="tm-btn-create" onclick="window.tmChat.createGroup()">তৈরি করুন</button>
  </div>
</div>
        `;
        document.body.appendChild(addModal);
    }

    /* ══════════════════════════════════════════════════════════
       ── RENDER FUNCTIONS ─────────────────────────────────────
    ══════════════════════════════════════════════════════════ */
    function renderGroupList() {
        var list = document.getElementById('tmChatGroupList');
        if (!list) return;

        var filtered = state.groups.filter(function(g) {
            if (state.searchQuery) {
                return g.name.toLowerCase().indexOf(state.searchQuery.toLowerCase()) >= 0;
            }
            if (state.filter === 'unread') {
                return (state.unread[g.id] || 0) > 0;
            }
            return true;
        });

        if (!filtered.length) {
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px;">কোনো গ্রুপ পাওয়া যায়নি</div>';
            return;
        }

        list.innerHTML = filtered.map(function(g) {
            var msgs = state.messages[g.id] || [];
            var lastMsg = msgs[msgs.length - 1];
            var lastText = lastMsg ? (lastMsg.userName + ': ' + lastMsg.text) : g.description || 'কোনো মেসেজ নেই';
            var lastTime = lastMsg ? fmtTime(lastMsg.ts) : fmtTime(g.createdAt);
            var unread = state.unread[g.id] || 0;
            var isActive = g.id === state.activeGroupId;
            var bgColor = g.color || avatarColor(g.name);

            return `
<div class="tm-group-item${isActive ? ' active' : ''}" onclick="window.tmChat.selectGroup('${g.id}')">
  <div class="tm-group-avatar" style="background:${bgColor};">
    ${g.icon || avatarInitials(g.name)}
    <span class="tm-group-online-dot"></span>
  </div>
  <div class="tm-group-info">
    <div class="tm-group-name-row">
      <span class="tm-group-name">${escHtml(g.name)}</span>
      <span class="tm-group-time">${lastTime}</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span class="tm-group-last-msg">${escHtml(lastText)}</span>
      ${unread > 0 ? `<span class="tm-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>
  </div>
</div>`;
        }).join('');
    }

    function renderMessages(groupId) {
        var box = document.getElementById('tmChatMessages');
        if (!box) return;
        var msgs = state.messages[groupId] || [];
        var user = getCurrentUser();
        var myId = user ? user.id : null;

        if (!msgs.length) {
            box.innerHTML = '<div class="tm-sys-msg" style="margin-top:20px;">এই গ্রুপে এখনো কোনো মেসেজ নেই। প্রথম মেসেজ পাঠান! 👋</div>';
            return;
        }

        var html = '';
        var lastDateStr = '';
        msgs.forEach(function(m) {
            var d = new Date(m.ts);
            var dateStr = d.toLocaleDateString('bn-BD', {day:'numeric', month:'long', year:'numeric'});
            if (dateStr !== lastDateStr) {
                html += `<div class="tm-date-divider"><span>${dateStr}</span></div>`;
                lastDateStr = dateStr;
            }

            var isMine = String(m.userId) === String(myId);
            var wrapClass = isMine ? 'mine' : 'theirs';
            var aColor = avatarColor(m.userId || m.userName);
            var initials = avatarInitials(m.userName || 'ব্য');

            html += `
<div class="tm-msg-wrap ${wrapClass}">
  <div class="tm-msg-user-avatar" style="background:${aColor};">${initials}</div>
  <div>
    ${!isMine ? `<div class="tm-msg-sender-name" style="color:${aColor};">${escHtml(m.userName || 'ব্যবহারকারী')}</div>` : ''}
    <div class="tm-bubble">
      ${escHtml(m.text)}
      <div class="tm-msg-time">
        ${fmtFullTime(m.ts)}
        ${isMine ? '<span class="tm-tick read">✓✓</span>' : ''}
      </div>
    </div>
  </div>
</div>`;
        });

        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
    }

    function updateRoomHeader(group) {
        var header = document.getElementById('tmChatRoomHeader');
        var avatar = document.getElementById('tmRoomAvatar');
        var name = document.getElementById('tmRoomName');
        var status = document.getElementById('tmRoomStatus');
        if (!header) return;

        header.classList.add('visible');
        avatar.textContent = group.icon || '💬';
        avatar.style.background = 'rgba(255,255,255,0.25)';
        name.textContent = group.name;
        var count = (state.messages[group.id] || []).length;
        status.textContent = count + 'টি মেসেজ • সবার জন্য উন্মুক্ত';
    }

    function updateInputArea() {
        var inputArea = document.getElementById('tmChatInputArea');
        var loginPrompt = document.getElementById('tmChatLoginPrompt');
        var empty = document.getElementById('tmChatEmpty');
        if (!inputArea || !loginPrompt) return;

        if (!state.activeGroupId) {
            inputArea.classList.remove('visible');
            loginPrompt.classList.remove('visible');
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';
        if (isLoggedIn()) {
            inputArea.classList.add('visible');
            loginPrompt.classList.remove('visible');
        } else {
            inputArea.classList.remove('visible');
            loginPrompt.classList.add('visible');
        }
    }

    function updateNotifBadge() {
        var total = 0;
        Object.keys(state.unread).forEach(function(k) { total += state.unread[k] || 0; });
        var pcDot = document.getElementById('tmPCNotifDot');
        var mobBadge = document.getElementById('tmMobNotifBadge');
        if (pcDot) pcDot.className = 'tm-notif-dot' + (total > 0 ? ' show' : '');
        if (mobBadge) {
            mobBadge.className = 'tm-mob-notif' + (total > 0 ? ' show' : '');
            mobBadge.textContent = total > 9 ? '9+' : (total || '');
        }
    }

    function updateAdminControls() {
        var addBtn = document.getElementById('tmAddGroupBtn');
        if (addBtn) addBtn.style.display = isAdmin() ? 'flex' : 'none';
    }

    /* ══════════════════════════════════════════════════════════
       ── ACTIONS ──────────────────────────────────────────────
    ══════════════════════════════════════════════════════════ */
    function openChat() {
        var overlay = document.getElementById('tmChatOverlay');
        if (overlay) {
            overlay.classList.add('open');
            updateAdminControls();
            renderGroupList();
            updateInputArea();
        }
    }
    function closeChat() {
        var overlay = document.getElementById('tmChatOverlay');
        if (overlay) overlay.classList.remove('open');
    }

    function selectGroup(groupId) {
        state.activeGroupId = groupId;
        state.unread[groupId] = 0;
        saveUnread();

        var group = state.groups.find(function(g) { return g.id === groupId; });
        if (!group) return;

        updateRoomHeader(group);
        renderMessages(groupId);
        updateInputArea();
        renderGroupList();
        updateNotifBadge();

        // Mobile: hide sidebar, show panel
        var sidebar = document.getElementById('tmChatSidebar');
        var panel = document.getElementById('tmChatPanel');
        if (window.innerWidth <= 640) {
            if (sidebar) sidebar.classList.add('mobile-hidden');
            if (panel) panel.classList.remove('mobile-hidden');
        }

        // Focus input
        setTimeout(function() {
            var inp = document.getElementById('tmChatTextInput');
            if (inp) inp.focus();
        }, 100);
    }

    function goBackToList() {
        state.activeGroupId = null;
        var sidebar = document.getElementById('tmChatSidebar');
        var panel = document.getElementById('tmChatPanel');
        if (sidebar) sidebar.classList.remove('mobile-hidden');
        if (panel) panel.classList.add('mobile-hidden');

        var header = document.getElementById('tmChatRoomHeader');
        if (header) header.classList.remove('visible');
        var box = document.getElementById('tmChatMessages');
        if (box) box.innerHTML = '';
        updateInputArea();
        renderGroupList();
    }

    function sendMessage() {
        if (!isLoggedIn()) return;
        if (!state.activeGroupId) return;
        var inp = document.getElementById('tmChatTextInput');
        if (!inp) return;
        var text = inp.value.trim();
        if (!text) return;

        var user = getCurrentUser();
        var msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
            userId: user.id,
            userName: user.name || 'ব্যবহারকারী',
            text: text,
            time: fmtFullTime(Date.now()),
            ts: Date.now()
        };

        if (!state.messages[state.activeGroupId]) state.messages[state.activeGroupId] = [];
        state.messages[state.activeGroupId].push(msg);
        saveMessages();

        inp.value = '';
        inp.style.height = 'auto';

        renderMessages(state.activeGroupId);
        renderGroupList();

        // notify others (increment unread for other groups in memory — in real app use firebase)
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function autoResize(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }

    function setFilter(f) {
        state.filter = f;
        ['all','unread','groups'].forEach(function(id) {
            var btn = document.getElementById('tmFilter' + id.charAt(0).toUpperCase() + id.slice(1));
            if (btn) btn.classList.toggle('active', id === f);
        });
        renderGroupList();
    }

    function onSearch(q) {
        state.searchQuery = q;
        renderGroupList();
    }

    function openAddGroup() {
        if (!isAdmin()) {
            alert('শুধুমাত্র অ্যাডমিন নতুন গ্রুপ তৈরি করতে পারবেন।');
            return;
        }
        var modal = document.getElementById('tmAddGroupModal');
        if (modal) modal.classList.add('open');
    }
    function closeAddGroup() {
        var modal = document.getElementById('tmAddGroupModal');
        if (modal) modal.classList.remove('open');
    }
    function createGroup() {
        if (!isAdmin()) return;
        var nameEl = document.getElementById('tmNewGroupName');
        var descEl = document.getElementById('tmNewGroupDesc');
        var iconEl = document.getElementById('tmNewGroupIcon');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { alert('গ্রুপের নাম দিন'); return; }

        var group = {
            id: 'group_' + Date.now(),
            name: name,
            description: descEl ? descEl.value.trim() : '',
            icon: iconEl ? (iconEl.value.trim() || '💬') : '💬',
            color: avatarColor(name),
            createdAt: Date.now()
        };
        state.groups.push(group);
        saveGroups();

        if (nameEl) nameEl.value = '';
        if (descEl) descEl.value = '';
        if (iconEl) iconEl.value = '';
        closeAddGroup();
        renderGroupList();
    }

    /* ── Util ─────────────────────────────────────────────────── */
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    }

    /* ══════════════════════════════════════════════════════════
       ── INIT ─────────────────────────────────────────────────
    ══════════════════════════════════════════════════════════ */
    function init() {
        injectCSS();
        buildHTML();

        /* Load stored data */
        var stored = loadGroups();
        if (stored && stored.length) {
            state.groups = stored;
        } else {
            state.groups = DEFAULT_GROUPS.slice();
            saveGroups();
        }
        state.messages = loadMessages();
        state.unread   = loadUnread();

        updateNotifBadge();

        /* Simulate incoming messages for demo unread */
        if (!localStorage.getItem('TM_CHAT_UNREAD_V1')) {
            state.unread['group_mytv'] = 3;
            state.unread['group_public'] = 7;
            saveUnread();
            updateNotifBadge();
        }

        /* Public API */
        window.tmChat = {
            open:           openChat,
            close:          closeChat,
            selectGroup:    selectGroup,
            goBackToList:   goBackToList,
            sendMessage:    sendMessage,
            onKeyDown:      onKeyDown,
            autoResize:     autoResize,
            setFilter:      setFilter,
            onSearch:       onSearch,
            openAddGroup:   openAddGroup,
            closeAddGroup:  closeAddGroup,
            createGroup:    createGroup
        };

        console.log('[Chat] ✅ Digital Shop TM Chat v3.0 initialized');
    }

    /* ── Wait for DOM ─────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
