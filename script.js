import { auth } from "./firebase.js";
import {
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

/* 🔐 GOOGLE LOGIN */
const provider = new GoogleAuthProvider();
const authScreen = document.getElementById("auth-screen");

document.getElementById("login-btn").onclick = () => {
    document.getElementById("login-btn").disabled = true;
    document.getElementById("login-btn").innerText = "Signing in...";
    signInWithPopup(auth, provider)
        .then(result => {
            console.log("Signed in as:", result.user.displayName);
        })
        .catch(err => {
            console.error("Login error:", err);
            document.getElementById("login-btn").disabled = false;
            document.getElementById("login-btn").innerText = "Sign in with Google";
        });
};

document.getElementById("logout-btn").onclick = () => {
    signOut(auth);
};

onAuthStateChanged(auth, user => {
    if (user) {
        authScreen.style.display = "none";
        console.log("Welcome King 👑:", user.displayName);
    } else {
        authScreen.style.display = "flex";
    }
});

/* 🌐 BROWSER SYSTEM */
let tabs = [];
let currentTabId = null;
let tabCounter = 0;

const tabsContainer = document.getElementById('tabs-container');
const iframesContainer = document.getElementById('iframes-wrapper');
const urlInput = document.getElementById('url-input');
const loadingOverlay = document.getElementById('loading-overlay');
const shortcutsGrid = document.getElementById('shortcuts-grid');
const bookmarksList = document.getElementById('bookmarks-list');
const historyList = document.getElementById('history-list');
const sidebar = document.getElementById('sidebar');

/* Utilities */
function shortLabel(url) {
    try {
        const u = new URL(url);
        return u.hostname.replace('www.', '') + (u.pathname && u.pathname !== '/' ? u.pathname.split('/')[1] ? '/' + u.pathname.split('/')[1] : '' : '');
    } catch (e) {
        return url;
    }
}

function normalizeUrl(input) {
    if (!input) return 'about:blank';
    if (!input.startsWith('http://') && !input.startsWith('https://') && !input.startsWith('about:')) {
        return 'https://' + input;
    }
    return input;
}

/* Tab management */
function createNewTab(url = 'https://www.google.com', switchTo = true) {
    tabCounter++;
    const id = 'tab-' + tabCounter;

    const tab = {
        id,
        url: normalizeUrl(url),
        history: [normalizeUrl(url)],
        historyIndex: 0,
        iframe: null
    };

    // create iframe
    const iframe = document.createElement('iframe');
    iframe.src = tab.url;
    iframe.style.display = 'none';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');

    // show overlay when loading
    iframe.addEventListener('load', () => {
        // hide loading if this is current tab
        if (currentTabId === id) hideLoading();
        renderHistory();
    });

    iframesContainer.appendChild(iframe);
    tab.iframe = iframe;

    tabs.push(tab);
    renderTabs();

    if (switchTo) switchTab(id);
    saveSession();
}

function closeTab(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    // remove iframe
    const t = tabs[index];
    if (t.iframe && t.iframe.parentNode) t.iframe.parentNode.removeChild(t.iframe);

    tabs.splice(index, 1);

    if (currentTabId === id) {
        // switch to previous tab or next
        if (tabs.length) {
            const newIndex = Math.max(0, index - 1);
            switchTab(tabs[newIndex].id);
        } else {
            currentTabId = null;
            urlInput.value = '';
            renderTabs();
        }
    } else {
        renderTabs();
    }

    saveSession();
}

function renderTabs() {
    tabsContainer.innerHTML = '';

    tabs.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tab' + (t.id === currentTabId ? ' active' : '');
        div.onclick = () => switchTab(t.id);

        const icon = document.createElement('i');
        icon.className = 'ph ph-globe tab-icon';

        const label = document.createElement('span');
        label.className = 'tab-title';
        label.innerText = shortLabel(t.url);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '<i class="ph ph-x"></i>';
        closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };

        div.appendChild(icon);
        div.appendChild(label);
        div.appendChild(closeBtn);

        tabsContainer.appendChild(div);
    });

    document.getElementById('status-right').innerText = tabs.length + (tabs.length === 1 ? ' tab open' : ' tabs open');
}

function switchTab(id) {
    currentTabId = id;

    tabs.forEach(t => {
        t.iframe.style.display = t.id === id ? 'block' : 'none';
    });

    const tab = tabs.find(t => t.id === id);
    if (tab) urlInput.value = tab.url;
    renderTabs();
}

function navigateTo(url, addToHistory = true) {
    if (!currentTabId) {
        createNewTab(url);
        return;
    }

    const tab = tabs.find(t => t.id === currentTabId);
    url = normalizeUrl(url);

    // update history
    if (addToHistory) {
        // truncate forward history
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
        tab.history.push(url);
        tab.historyIndex = tab.history.length - 1;
    }

    tab.url = url;
    showLoading();
    tab.iframe.src = url;
    urlInput.value = url;

    renderTabs();
    saveHistoryRecord(url);
    saveSession();
}

function navigateBack() {
    if (!currentTabId) return;
    const tab = tabs.find(t => t.id === currentTabId);
    if (tab.historyIndex > 0) {
        tab.historyIndex--;
        const url = tab.history[tab.historyIndex];
        tab.url = url;
        showLoading();
        tab.iframe.src = url;
        urlInput.value = url;
        renderTabs();
        saveSession();
    }
}

function navigateForward() {
    if (!currentTabId) return;
    const tab = tabs.find(t => t.id === currentTabId);
    if (tab.historyIndex < tab.history.length - 1) {
        tab.historyIndex++;
        const url = tab.history[tab.historyIndex];
        tab.url = url;
        showLoading();
        tab.iframe.src = url;
        urlInput.value = url;
        renderTabs();
        saveSession();
    }
}

function refreshTab() {
    if (!currentTabId) return;
    const tab = tabs.find(t => t.id === currentTabId);
    if (tab) {
        showLoading();
        // force reload by resetting src
        const src = tab.iframe.src;
        tab.iframe.src = src;
    }
}

/* Loading overlay */
function showLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}
function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

/* Bookmarks */
function loadBookmarks() {
    try {
        return JSON.parse(localStorage.getItem('sab_bookmarks') || '[]');
    } catch (e) {
        return [];
    }
}

function saveBookmarks(list) {
    localStorage.setItem('sab_bookmarks', JSON.stringify(list));
}

function addBookmark() {
    if (!currentTabId) return;
    const tab = tabs.find(t => t.id === currentTabId);
    const bookmarks = loadBookmarks();
    if (!bookmarks.find(b => b.url === tab.url)) {
        bookmarks.push({ title: shortLabel(tab.url), url: tab.url });
        saveBookmarks(bookmarks);
        renderBookmarks();
        
        // Visual feedback
        const btn = document.getElementById('bookmark-btn');
        btn.innerHTML = '<i class="ph-fill ph-star" style="color: var(--accent)"></i>';
        setTimeout(() => {
            btn.innerHTML = '<i class="ph ph-star"></i>';
        }, 1000);
    }
}

function renderBookmarks() {
    const bookmarks = loadBookmarks();
    bookmarksList.innerHTML = '';
    bookmarks.forEach(b => {
        const el = document.createElement('div');
        el.className = 'bookmark-item';
        
        const icon = document.createElement('i');
        icon.className = 'ph ph-bookmark-simple item-icon';
        
        const text = document.createElement('span');
        text.innerText = b.title;
        
        el.appendChild(icon);
        el.appendChild(text);
        
        el.onclick = () => navigateTo(b.url);
        bookmarksList.appendChild(el);
    });
}

/* History */
function saveHistoryRecord(url) {
    try {
        const key = 'sab_history';
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        arr.unshift({ url, time: Date.now() });
        // keep unique and limit
        const unique = [];
        for (const item of arr) {
            if (!unique.find(u => u.url === item.url)) unique.push(item);
            if (unique.length >= 50) break;
        }
        localStorage.setItem(key, JSON.stringify(unique));
    } catch (e) { }
}

function renderHistory() {
    try {
        const arr = JSON.parse(localStorage.getItem('sab_history') || '[]');
        historyList.innerHTML = '';
        arr.forEach(h => {
            const el = document.createElement('div');
            el.className = 'history-item';
            
            const icon = document.createElement('i');
            icon.className = 'ph ph-clock item-icon';
            
            const text = document.createElement('span');
            text.innerText = shortLabel(h.url);
            
            el.appendChild(icon);
            el.appendChild(text);
            
            el.onclick = () => navigateTo(h.url);
            historyList.appendChild(el);
        });
    } catch (e) { }
}

/* Shortcuts */
function renderShortcuts() {
    const shortcuts = [
        { title: 'Google', url: 'https://www.google.com' },
        { title: 'YouTube', url: 'https://www.youtube.com' },
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'ChatGPT', url: 'https://chat.openai.com' }
    ];

    shortcutsGrid.innerHTML = '';
    shortcuts.forEach(s => {
        const b = document.createElement('div');
        b.className = 'shortcut';
        
        const iconContainer = document.createElement('div');
        iconContainer.style.marginBottom = '8px';
        iconContainer.style.fontSize = '24px';
        iconContainer.innerHTML = '<i class="ph ph-globe"></i>';
        
        const text = document.createElement('div');
        text.innerText = s.title;
        text.style.fontWeight = '500';
        
        b.appendChild(iconContainer);
        b.appendChild(text);
        
        b.onclick = () => createNewTab(s.url, true);
        shortcutsGrid.appendChild(b);
    });
}

/* Sidebar toggle */
function toggleSidebar() {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
}

/* Settings */
let settingsModal = null;
function toggleSettings() {
    if (settingsModal) {
        settingsModal.remove();
        settingsModal = null;
        return;
    }

    settingsModal = document.createElement('div');
    settingsModal.className = 'settings-modal';

    const header = document.createElement('div');
    header.className = 'settings-header';
    header.innerHTML = `
        <span><i class="ph ph-gear" style="margin-right: 8px;"></i>Browser Settings</span>
        <i class="ph ph-x close-settings" style="cursor: pointer;" onclick="toggleSettings()"></i>
    `;
    settingsModal.appendChild(header);

    const clearHistoryBtn = document.createElement('button');
    clearHistoryBtn.className = 'settings-btn danger';
    clearHistoryBtn.innerHTML = '<i class="ph ph-trash"></i> Clear Browsing History';
    clearHistoryBtn.onclick = () => { 
        localStorage.removeItem('sab_history'); 
        renderHistory(); 
        const originalText = clearHistoryBtn.innerHTML;
        clearHistoryBtn.innerHTML = '<i class="ph ph-check"></i> Cleared!';
        setTimeout(() => clearHistoryBtn.innerHTML = originalText, 1500);
    };
    settingsModal.appendChild(clearHistoryBtn);

    const clearBookmarksBtn = document.createElement('button');
    clearBookmarksBtn.className = 'settings-btn danger';
    clearBookmarksBtn.innerHTML = '<i class="ph ph-bookmark-simple"></i> Clear All Bookmarks';
    clearBookmarksBtn.onclick = () => { 
        saveBookmarks([]); 
        renderBookmarks(); 
        const originalText = clearBookmarksBtn.innerHTML;
        clearBookmarksBtn.innerHTML = '<i class="ph ph-check"></i> Cleared!';
        setTimeout(() => clearBookmarksBtn.innerHTML = originalText, 1500);
    };
    settingsModal.appendChild(clearBookmarksBtn);

    document.body.appendChild(settingsModal);
}

/* Persistence for session (tabs) */
function saveSession() {
    try {
        const s = tabs.map(t => ({ id: t.id, url: t.url, history: t.history, historyIndex: t.historyIndex }));
        localStorage.setItem('sab_session_tabs', JSON.stringify(s));
    } catch (e) { }
}

function restoreSession() {
    try {
        const s = JSON.parse(localStorage.getItem('sab_session_tabs') || '[]');
        if (!s.length) return createNewTab('https://www.google.com');
        s.forEach(t => {
            tabCounter++;
            const id = t.id || ('tab-' + tabCounter);
            const iframe = document.createElement('iframe');
            const url = t.url || (t.history && t.history[0]) || 'https://www.google.com';
            iframe.src = url;
            iframe.style.display = 'none';
            iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups');
            iframe.addEventListener('load', () => { if (currentTabId === id) hideLoading(); renderHistory(); });
            iframesContainer.appendChild(iframe);
            tabs.push({ id, url, history: t.history || [url], historyIndex: t.historyIndex || 0, iframe });
        });
        // switch to first saved tab
        if (tabs.length) switchTab(tabs[0].id);
    } catch (e) { createNewTab('https://www.google.com'); }
}

/* Wiring UI buttons */
document.getElementById('new-tab-btn').onclick = () => createNewTab('https://www.google.com');
document.getElementById('go-btn').onclick = () => navigateTo(urlInput.value);

urlInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') navigateTo(urlInput.value);
});

// Select all text in URL input on focus for easy replacement
urlInput.addEventListener('focus', () => {
    urlInput.select();
});

document.getElementById('back-btn').onclick = () => navigateBack();
document.getElementById('forward-btn').onclick = () => navigateForward();
document.getElementById('refresh-btn').onclick = () => refreshTab();
document.getElementById('bookmark-btn').onclick = () => addBookmark();
document.getElementById('sidebar-toggle').onclick = () => toggleSidebar();
document.getElementById('settings-btn').onclick = () => toggleSettings();

/* Init UI */
renderShortcuts();
renderBookmarks();
renderHistory();
restoreSession();

// ensure overlay hidden initially
hideLoading();