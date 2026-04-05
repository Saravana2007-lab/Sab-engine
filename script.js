import { auth } from "./firebase.js";
import {
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

/* ═══════════════════════════════════════════════════
   🔐 AUTH
═══════════════════════════════════════════════════ */
const provider = new GoogleAuthProvider();
const authScreen = document.getElementById("auth-screen");

document.getElementById("login-btn").onclick = () => {
    const btn = document.getElementById("login-btn");
    btn.disabled = true; btn.innerText = "Signing in…";
    signInWithPopup(auth, provider).catch(err => {
        console.error(err); btn.disabled = false; btn.innerText = "Sign in with Google";
    });
};
document.getElementById("logout-btn").onclick = () => signOut(auth);

onAuthStateChanged(auth, user => {
    if (user) {
        authScreen.style.display = "none";
        const av = document.querySelector('.user-avatar img');
        if (av) { if (user.photoURL) av.src = user.photoURL; av.title = user.displayName || ""; }
        const g = document.getElementById('dashboard-greeting');
        if (g) {
            const h = new Date().getHours();
            const tod = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
            g.textContent = `Good ${tod}, ${user.displayName?.split(' ')[0] || 'King'} 👑`;
        }
    } else { authScreen.style.display = "flex"; }
});

/* ═══════════════════════════════════════════════════
   🚫 KNOWN BLOCKED DOMAINS
   These sites set frame-ancestors CSP — skip trying
   to load them and go straight to the handler.
═══════════════════════════════════════════════════ */
const BLOCKED_DOMAINS = new Set([
    'github.com','www.github.com','gist.github.com',
    'reddit.com','www.reddit.com','old.reddit.com',
    'chatgpt.com','chat.openai.com',
    'twitter.com','www.twitter.com','x.com','www.x.com',
    'facebook.com','www.facebook.com',
    'instagram.com','www.instagram.com',
    'linkedin.com','www.linkedin.com',
    'tiktok.com','www.tiktok.com',
    'netflix.com','www.netflix.com',
    'amazon.com','www.amazon.com',
    'google.com','www.google.com','accounts.google.com',
    'gmail.com','mail.google.com',
    'discord.com','www.discord.com',
    'slack.com','app.slack.com',
    'notion.so','www.notion.so',
    'figma.com','www.figma.com',
    'twitch.tv','www.twitch.tv',
    'spotify.com','open.spotify.com',
    'zoom.us','app.zoom.us',
    'dropbox.com','www.dropbox.com',
    'microsoft.com','www.microsoft.com',
    'apple.com','www.apple.com',
]);

function isKnownBlocked(url) {
    try { return BLOCKED_DOMAINS.has(new URL(url).hostname); }
    catch { return false; }
}

/* ═══════════════════════════════════════════════════
   🌐 CORE STATE
═══════════════════════════════════════════════════ */
let tabs = [], currentTabId = null, tabCounter = 0;

const tabsContainer    = document.getElementById('tabs-container');
const iframesContainer = document.getElementById('iframes-container');
const urlInput         = document.getElementById('url-input');
const loadingOverlay   = document.getElementById('loading-overlay');
const shortcutsGrid    = document.getElementById('shortcuts-grid');
const bookmarksList    = document.getElementById('bookmarks-list');
const historyList      = document.getElementById('history-list');
const sidebar          = document.getElementById('sidebar');
const dashboardEl      = document.getElementById('dashboard-container');

/* ── URL helpers ─────────────────────────────────────────────────────── */

function looksLikeUrl(raw) {
    if (!raw) return false;
    if (/^(https?:\/\/|about:|file:)/i.test(raw)) return true;
    return /^[a-zA-Z0-9][a-zA-Z0-9\-\.]*\.[a-zA-Z]{2,}([\/\?#].*)?$/.test(raw) && !raw.includes(' ');
}

function resolveInput(raw) {
    if (!raw) return null;
    raw = raw.trim();
    if (!raw || raw === 'about:newtab') return null;
    if (looksLikeUrl(raw)) return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    return `https://duckduckgo.com/?q=${encodeURIComponent(raw)}&ia=web`;
}

function shortLabel(url) {
    if (!url) return 'New Tab';
    try { return new URL(url).hostname.replace('www.', '') || url; }
    catch { return url.slice(0, 30); }
}

function getFavicon(url) {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
    catch { return null; }
}

/* ═══════════════════════════════════════════════════
   🔄 PROXY LOADER
   Uses allorigins to fetch the page HTML server-side.
   The browser never sees the frame-ancestors header,
   so the content can be injected via iframe srcdoc.
═══════════════════════════════════════════════════ */

async function loadViaProxy(tab) {
    const statusEl = document.getElementById('proxy-overlay-' + tab.id);
    if (statusEl) statusEl.textContent = '⏳ Connecting to proxy…';

    try {
        const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(tab.url)}`;
        const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.contents) throw new Error('Empty response from proxy');

        let html = data.contents;

        // Inject <base> so relative paths resolve against the real domain
        const baseTag = `<base href="${tab.url}" target="_blank">`;
        if (/<head[\s>]/i.test(html)) {
            html = html.replace(/<head(\s[^>]*)?>/i, m => m + baseTag);
        } else {
            html = baseTag + html;
        }

        // Strip any inline CSP meta tags
        html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

        removeBlockedPage(tab.id);

        if (!tab.iframe) {
            tab.iframe = document.createElement('iframe');
            iframesContainer.appendChild(tab.iframe);
        }
        tab.iframe.removeAttribute('sandbox');
        tab.iframe.setAttribute('allowfullscreen', '');
        tab.iframe.srcdoc = html;
        tab.iframe.style.display = 'block';
        tab.proxyMode = true;

        dashboardEl.classList.add('hidden');
        iframesContainer.classList.remove('hidden');
        hideLoading();
        updateSecurityBadge(tab.url);
        showProxyPill(tab);

    } catch (err) {
        const el = document.getElementById('proxy-overlay-' + tab.id);
        if (el) {
            el.innerHTML = `<span style="color:#ff8a8a">❌ Proxy failed: ${err.message}</span><br>
                <small>Try "Open as Popup" for full access.</small>`;
        }
    }
}

function showProxyPill(tab) {
    if (document.getElementById('proxy-pill-' + tab.id)) return;
    const pill = document.createElement('div');
    pill.id = 'proxy-pill-' + tab.id;
    pill.className = 'proxy-pill';
    pill.style.display = (currentTabId === tab.id) ? 'flex' : 'none';
    pill.innerHTML = `<i class="ph ph-swap"></i> Proxy mode — login & JS may be limited
        <button onclick="document.getElementById('proxy-pill-${tab.id}').remove()">
            <i class="ph ph-x"></i>
        </button>`;
    iframesContainer.appendChild(pill);
}

/* ═══════════════════════════════════════════════════
   📑 TAB MANAGEMENT
═══════════════════════════════════════════════════ */

function createNewTab(rawUrl = null, switchTo = true) {
    tabCounter++;
    const id  = 'tab-' + tabCounter;
    const url = rawUrl != null ? resolveInput(rawUrl) : null;

    const tab = {
        id, url,
        title: url ? shortLabel(url) : 'New Tab',
        history: url ? [url] : [],
        historyIndex: 0,
        iframe: null,
        proxyMode: false
    };

    if (url) {
        if (isKnownBlocked(url)) {
            tab.iframe = document.createElement('iframe');
            tab.iframe.style.display = 'none';
            iframesContainer.appendChild(tab.iframe);
        } else {
            tab.iframe = buildIframe(tab.id, url, tab);
            iframesContainer.appendChild(tab.iframe);
        }
    }

    tabs.push(tab);
    renderTabs();
    if (switchTo) switchTab(id);
    saveSession();
}

function buildIframe(id, url, tab) {
    const f = document.createElement('iframe');
    f.src   = url;
    f.style.display = 'none';
    f.setAttribute('sandbox',
        'allow-scripts allow-forms allow-same-origin allow-popups ' +
        'allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation');
    f.setAttribute('allowfullscreen', '');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

    f.addEventListener('load', () => {
        if (currentTabId === id) hideLoading();
        tryReadTitle(tab, f);
        detectBlockedByContent(tab, f);
        renderHistory();
    });
    return f;
}

function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    const t = tabs[idx];
    t.iframe?.parentNode?.removeChild(t.iframe);
    removeBlockedPage(id);
    document.getElementById('proxy-pill-' + id)?.remove();
    tabs.splice(idx, 1);
    if (!tabs.length) createNewTab(null);
    else if (currentTabId === id) switchTab(tabs[Math.max(0, idx - 1)].id);
    else renderTabs();
    saveSession();
}

function renderTabs() {
    tabsContainer.innerHTML = '';
    tabs.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tab' + (t.id === currentTabId ? ' active' : '');
        div.onclick = () => switchTab(t.id);

        const favUrl = t.url ? getFavicon(t.url) : null;
        if (favUrl) {
            const img = document.createElement('img');
            img.className = 'tab-favicon';
            img.src = favUrl;
            img.onerror = () => img.replaceWith(globeIcon());
            div.appendChild(img);
        } else {
            div.appendChild(globeIcon());
        }

        const lbl = document.createElement('span');
        lbl.className = 'tab-title';
        lbl.textContent = t.title || shortLabel(t.url);

        const x = document.createElement('button');
        x.className = 'tab-close';
        x.innerHTML = '<i class="ph ph-x"></i>';
        x.onclick = e => { e.stopPropagation(); closeTab(t.id); };

        div.append(lbl, x);
        tabsContainer.appendChild(div);
    });
    const n = tabs.length;
    document.getElementById('status-right').textContent = n + (n === 1 ? ' tab open' : ' tabs open');
}

function globeIcon() {
    const i = document.createElement('i');
    i.className = 'ph ph-globe tab-icon';
    return i;
}

function switchTab(id) {
    currentTabId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    tabs.forEach(t => {
        if (t.iframe) t.iframe.style.display = t.id === id ? 'block' : 'none';
        const bp = document.getElementById('blocked-page-' + t.id);
        if (bp) bp.style.display = t.id === id ? 'flex' : 'none';
        const pp = document.getElementById('proxy-pill-' + t.id);
        if (pp) pp.style.display = t.id === id ? 'flex' : 'none';
    });

    if (tab.url) {
        urlInput.value = tab.url;
        dashboardEl.classList.add('hidden');
        iframesContainer.classList.remove('hidden');
        if (isKnownBlocked(tab.url) && !tab.proxyMode &&
            !document.getElementById('blocked-page-' + tab.id)) {
            showBlockedPage(tab);
        }
    } else {
        urlInput.value = '';
        urlInput.placeholder = 'Search or enter address';
        dashboardEl.classList.remove('hidden');
        iframesContainer.classList.add('hidden');
    }

    updateSecurityBadge(tab.url);
    renderTabs();
}

/* ── Navigate ─────────────────────────────────────────────────────────── */

function navigateTo(rawInput, addToHistory = true) {
    const url = resolveInput(rawInput);

    if (!url) {
        if (!currentTabId) { createNewTab(null); return; }
        const tab = tabs.find(t => t.id === currentTabId);
        if (!tab) return;
        if (tab.iframe) tab.iframe.style.display = 'none';
        removeBlockedPage(tab.id);
        document.getElementById('proxy-pill-' + tab.id)?.remove();
        tab.url = null; tab.title = 'New Tab'; tab.proxyMode = false;
        dashboardEl.classList.remove('hidden');
        iframesContainer.classList.add('hidden');
        urlInput.value = '';
        renderTabs(); saveSession(); return;
    }

    if (!currentTabId) { createNewTab(rawInput); return; }
    const tab = tabs.find(t => t.id === currentTabId);
    if (!tab) return;

    if (addToHistory && url !== tab.url) {
        tab.history = tab.history.slice(0, tab.historyIndex + 1);
        tab.history.push(url);
        tab.historyIndex = tab.history.length - 1;
    }

    tab.url = url; tab.title = shortLabel(url); tab.proxyMode = false;
    removeBlockedPage(tab.id);
    document.getElementById('proxy-pill-' + tab.id)?.remove();
    showLoading();
    dashboardEl.classList.add('hidden');
    iframesContainer.classList.remove('hidden');
    urlInput.value = url;
    updateSecurityBadge(url);
    renderTabs();
    saveHistoryRecord(url);
    saveSession();

    if (isKnownBlocked(url)) {
        hideLoading();
        if (!tab.iframe) {
            tab.iframe = document.createElement('iframe');
            tab.iframe.style.display = 'none';
            iframesContainer.appendChild(tab.iframe);
        }
        showBlockedPage(tab);
        return;
    }

    if (!tab.iframe) {
        tab.iframe = buildIframe(tab.id, url, tab);
        iframesContainer.appendChild(tab.iframe);
    } else {
        tab.iframe.setAttribute('sandbox',
            'allow-scripts allow-forms allow-same-origin allow-popups ' +
            'allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation');
        tab.iframe.srcdoc = '';
        tab.iframe.src = url;
    }
    tab.iframe.style.display = 'block';
}

function navigateBack() {
    const tab = tabs.find(t => t.id === currentTabId);
    if (!tab || tab.historyIndex <= 0) return;
    tab.historyIndex--;
    doLoad(tab, tab.history[tab.historyIndex]);
}

function navigateForward() {
    const tab = tabs.find(t => t.id === currentTabId);
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;
    tab.historyIndex++;
    doLoad(tab, tab.history[tab.historyIndex]);
}

function refreshTab() {
    const tab = tabs.find(t => t.id === currentTabId);
    if (!tab || !tab.url) return;
    navigateTo(tab.url, false);
}

function doLoad(tab, url) {
    tab.url = url; tab.title = shortLabel(url); tab.proxyMode = false;
    removeBlockedPage(tab.id);
    document.getElementById('proxy-pill-' + tab.id)?.remove();
    showLoading();
    dashboardEl.classList.add('hidden');
    iframesContainer.classList.remove('hidden');
    urlInput.value = url;
    updateSecurityBadge(url);
    renderTabs(); saveSession();

    if (isKnownBlocked(url)) { hideLoading(); showBlockedPage(tab); return; }
    if (tab.iframe) {
        tab.iframe.setAttribute('sandbox',
            'allow-scripts allow-forms allow-same-origin allow-popups ' +
            'allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation');
        tab.iframe.src = url;
        tab.iframe.style.display = 'block';
    }
}

/* ── Title / content-based blocked detection ──────────────────────────── */

function tryReadTitle(tab, iframe) {
    try {
        const title = iframe.contentDocument?.title?.trim();
        if (title) { tab.title = title; renderTabs(); }
    } catch { /* cross-origin */ }
}

function detectBlockedByContent(tab, iframe) {
    setTimeout(() => {
        try {
            const doc = iframe.contentDocument;
            if (doc?.body && doc.body.innerHTML.trim() === '' && tab.url && !tab.proxyMode) {
                showBlockedPage(tab);
            }
        } catch { /* cross-origin = loaded fine */ }
    }, 500);
}

/* ═══════════════════════════════════════════════════
   🚫 BLOCKED PAGE UI
═══════════════════════════════════════════════════ */

function showBlockedPage(tab) {
    if (document.getElementById('blocked-page-' + tab.id)) return;
    if (tab.iframe) tab.iframe.style.display = 'none';

    const host = shortLabel(tab.url);
    const page = document.createElement('div');
    page.id        = 'blocked-page-' + tab.id;
    page.className = 'blocked-page';
    page.style.display = (currentTabId === tab.id) ? 'flex' : 'none';

    page.innerHTML = `
        <div class="blocked-inner">
            <div class="blocked-icon"><i class="ph ph-shield-slash"></i></div>
            <h2>Blocked by ${host}</h2>
            <p>
                <strong>${host}</strong> uses <code>frame-ancestors</code> CSP to prevent embedding.<br>
                This is enforced by your browser — no iframe trick can bypass it.
            </p>
            <div class="blocked-actions">
                <button class="blocked-btn primary" id="bp-proxy-${tab.id}">
                    <i class="ph ph-swap"></i>
                    <span><strong>Load with Proxy</strong><small>Strips headers, works for reading</small></span>
                </button>
                <button class="blocked-btn secondary" id="bp-popup-${tab.id}">
                    <i class="ph ph-browsers"></i>
                    <span><strong>Open as Popup</strong><small>Full site, looks like a tab</small></span>
                </button>
                <button class="blocked-btn ghost" onclick="window.open('${tab.url}','_blank')">
                    <i class="ph ph-arrow-square-out"></i>
                    <span><strong>New Window</strong></span>
                </button>
            </div>
            <div class="proxy-status" id="proxy-overlay-${tab.id}"></div>
        </div>
    `;

    iframesContainer.appendChild(page);

    document.getElementById('bp-proxy-' + tab.id)?.addEventListener('click', async function() {
        this.disabled = true;
        this.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 1s linear infinite"></i> Fetching…';
        await loadViaProxy(tab);
        if (tab.proxyMode) removeBlockedPage(tab.id);
    });

    document.getElementById('bp-popup-' + tab.id)?.addEventListener('click', () => openPopupWindow(tab.url));

    tab.title = '🔒 ' + host;
    renderTabs();
}

function removeBlockedPage(id) {
    document.getElementById('blocked-page-' + id)?.remove();
}

function openPopupWindow(url) {
    const w = Math.min(1280, screen.width * 0.85);
    const h = Math.min(820, screen.height * 0.85);
    const l = (screen.width - w) / 2;
    const t = (screen.height - h) / 2;
    window.open(url, '_blank',
        `width=${w},height=${h},left=${l},top=${t},` +
        `toolbar=yes,menubar=yes,scrollbars=yes,resizable=yes,location=yes,status=yes`);
}

/* ── Security badge ───────────────────────────────────────────────────── */

function updateSecurityBadge(url) {
    const b = document.querySelector('.security-badge i');
    if (!b) return;
    if (!url)                        b.className = 'ph ph-house';
    else if (url.startsWith('https')) b.className = 'ph ph-lock-key';
    else if (url.startsWith('http'))  b.className = 'ph ph-lock-key-open';
    else                              b.className = 'ph ph-globe';
}

/* ── Loading ──────────────────────────────────────────────────────────── */
function showLoading() { if (loadingOverlay) loadingOverlay.style.display = 'flex'; }
function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = 'none'; }

/* ═══════════════════════════════════════════════════
   📌 BOOKMARKS
═══════════════════════════════════════════════════ */

function loadBookmarks() { try { return JSON.parse(localStorage.getItem('sab_bookmarks') || '[]'); } catch { return []; } }
function saveBookmarks(l) { localStorage.setItem('sab_bookmarks', JSON.stringify(l)); }

function addBookmark() {
    const tab = tabs.find(t => t.id === currentTabId);
    if (!tab?.url) return;
    const list = loadBookmarks();
    if (list.find(b => b.url === tab.url)) return;
    list.push({ title: tab.title || shortLabel(tab.url), url: tab.url });
    saveBookmarks(list); renderBookmarks();
    const btn = document.getElementById('bookmark-btn');
    btn.innerHTML = '<i class="ph-fill ph-star" style="color:var(--accent)"></i>';
    setTimeout(() => btn.innerHTML = '<i class="ph ph-star"></i>', 1200);
}

function renderBookmarks() {
    const list = loadBookmarks();
    bookmarksList.innerHTML = list.length ? '' : '<div class="empty-state">No bookmarks yet</div>';
    list.forEach(b => {
        const el = document.createElement('div');
        el.className = 'bookmark-item';
        const f = getFavicon(b.url);
        el.innerHTML = `
            ${f ? `<img src="${f}" class="item-favicon" onerror="this.style.display='none'">` : '<i class="ph ph-bookmark-simple item-icon"></i>'}
            <span class="item-text">${b.title || shortLabel(b.url)}</span>
            <button class="item-delete" onclick="event.stopPropagation();window.removeBookmark('${encodeURIComponent(b.url)}')"><i class="ph ph-x"></i></button>`;
        el.onclick = () => navigateTo(b.url);
        bookmarksList.appendChild(el);
    });
}
window.removeBookmark = url => { saveBookmarks(loadBookmarks().filter(b => b.url !== decodeURIComponent(url))); renderBookmarks(); };

/* ═══════════════════════════════════════════════════
   🕑 HISTORY
═══════════════════════════════════════════════════ */

function saveHistoryRecord(url) {
    try {
        const a = JSON.parse(localStorage.getItem('sab_history') || '[]');
        a.unshift({ url, time: Date.now() });
        const u = []; for (const i of a) { if (!u.find(x => x.url === i.url)) u.push(i); if (u.length >= 100) break; }
        localStorage.setItem('sab_history', JSON.stringify(u));
    } catch {}
}

function renderHistory() {
    try {
        const a = JSON.parse(localStorage.getItem('sab_history') || '[]');
        historyList.innerHTML = a.length ? '' : '<div class="empty-state">No history yet</div>';
        a.slice(0, 25).forEach(h => {
            const el = document.createElement('div'); el.className = 'history-item';
            const f = getFavicon(h.url);
            el.innerHTML = `${f ? `<img src="${f}" class="item-favicon" onerror="this.style.display='none'">` : '<i class="ph ph-clock item-icon"></i>'}<span class="item-text">${shortLabel(h.url)}</span>`;
            el.onclick = () => navigateTo(h.url);
            historyList.appendChild(el);
        });
    } catch {}
}

/* ═══════════════════════════════════════════════════
   ⚡ SHORTCUTS
═══════════════════════════════════════════════════ */

function renderShortcuts() {
    const S = [
        { title:'DuckDuckGo', url:'https://duckduckgo.com',       icon:'ph-magnifying-glass', color:'#de5833' },
        { title:'YouTube',    url:'https://www.youtube.com',      icon:'ph-youtube-logo',     color:'#ff0000' },
        { title:'Wikipedia',  url:'https://www.wikipedia.org',    icon:'ph-book-open',        color:'#aaaaaa' },
        { title:'GitHub',     url:'https://github.com',           icon:'ph-github-logo',      color:'#ffffff' },
        { title:'ChatGPT',    url:'https://chatgpt.com',          icon:'ph-robot',             color:'#10a37f' },
        { title:'Reddit',     url:'https://www.reddit.com',       icon:'ph-reddit-logo',      color:'#ff4500' },
    ];
    shortcutsGrid.innerHTML = '';
    S.forEach(s => {
        const b = document.createElement('div');
        b.className = 'shortcut';
        b.innerHTML = `<div style="font-size:22px;margin-bottom:6px"><i class="ph ${s.icon}" style="color:${s.color}"></i></div><div style="font-size:12px;font-weight:500">${s.title}</div>`;
        b.onclick = () => navigateTo(s.url);
        shortcutsGrid.appendChild(b);
    });
}

/* ═══════════════════════════════════════════════════
   ⚙️  SETTINGS
═══════════════════════════════════════════════════ */

let settingsModal = null;
function toggleSettings() {
    if (settingsModal) { settingsModal.remove(); settingsModal = null; return; }
    settingsModal = document.createElement('div');
    settingsModal.className = 'settings-modal';
    settingsModal.innerHTML = `
        <div class="settings-header">
            <span><i class="ph ph-gear" style="margin-right:8px"></i>Settings</span>
            <div class="close-settings" onclick="toggleSettings()"><i class="ph ph-x"></i></div>
        </div>
        <button class="settings-btn danger" id="s-ch"><i class="ph ph-trash"></i> Clear History</button>
        <button class="settings-btn danger" id="s-cb"><i class="ph ph-bookmark-simple"></i> Clear Bookmarks</button>
        <div class="settings-info">
            <div class="shortcuts-title">⌨ Keyboard Shortcuts</div>
            <div class="shortcut-row"><span>Ctrl+T</span><span>New Tab</span></div>
            <div class="shortcut-row"><span>Ctrl+W</span><span>Close Tab</span></div>
            <div class="shortcut-row"><span>Ctrl+L</span><span>Focus Address Bar</span></div>
            <div class="shortcut-row"><span>Ctrl+R / F5</span><span>Refresh</span></div>
            <div class="shortcut-row"><span>Ctrl+Tab</span><span>Next Tab</span></div>
            <div class="shortcut-row"><span>Alt+← / →</span><span>Back / Forward</span></div>
            <div class="shortcut-row"><span>Ctrl+K</span><span>Command Palette</span></div>
        </div>`;
    document.body.appendChild(settingsModal);
    document.getElementById('s-ch').onclick = () => { localStorage.removeItem('sab_history'); renderHistory(); };
    document.getElementById('s-cb').onclick = () => { saveBookmarks([]); renderBookmarks(); };
}
window.toggleSettings = toggleSettings;
function toggleSidebar() { sidebar?.classList.toggle('collapsed'); }

/* ═══════════════════════════════════════════════════
   💾 SESSION
═══════════════════════════════════════════════════ */

function saveSession() {
    try {
        localStorage.setItem('sab_session_tabs',
            JSON.stringify(tabs.map(t => ({ id: t.id, url: t.url, title: t.title, history: t.history, historyIndex: t.historyIndex }))));
    } catch {}
}

function restoreSession() {
    try {
        const saved = JSON.parse(localStorage.getItem('sab_session_tabs') || '[]');
        if (!saved.length) return createNewTab(null);
        saved.forEach(d => {
            tabCounter++;
            const id = d.id || ('tab-' + tabCounter), url = d.url || null;
            let iframe = null;
            if (url && !isKnownBlocked(url)) {
                iframe = buildIframe(id, url, { id, url, proxyMode: false });
                iframe.style.display = 'none';
                iframesContainer.appendChild(iframe);
            } else if (url) {
                iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframesContainer.appendChild(iframe);
            }
            const tab = { id, url, title: d.title || shortLabel(url), history: d.history || (url ? [url] : []), historyIndex: d.historyIndex || 0, iframe, proxyMode: false };
            if (iframe && url && !isKnownBlocked(url)) {
                iframe.addEventListener('load', () => {
                    if (currentTabId === id) hideLoading();
                    tryReadTitle(tab, iframe);
                    detectBlockedByContent(tab, iframe);
                    renderHistory();
                });
            }
            tabs.push(tab);
        });
        renderTabs(); switchTab(tabs[0].id);
    } catch { createNewTab(null); }
}

/* ═══════════════════════════════════════════════════
   🎛  UI WIRING
═══════════════════════════════════════════════════ */

document.getElementById('new-tab-btn').onclick    = () => createNewTab(null);
document.getElementById('go-btn').onclick         = () => { navigateTo(urlInput.value); urlInput.blur(); };
document.getElementById('back-btn').onclick       = () => navigateBack();
document.getElementById('forward-btn').onclick    = () => navigateForward();
document.getElementById('refresh-btn').onclick    = () => refreshTab();
document.getElementById('bookmark-btn').onclick   = () => addBookmark();
document.getElementById('sidebar-toggle').onclick = () => toggleSidebar();
document.getElementById('settings-btn').onclick   = () => toggleSettings();

document.getElementById('dash-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { navigateTo(v); e.target.value = ''; } }
});
document.getElementById('dash-search-btn')?.addEventListener('click', () => {
    const v = document.getElementById('dash-search-input')?.value.trim();
    if (v) { navigateTo(v); document.getElementById('dash-search-input').value = ''; }
});

urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { navigateTo(urlInput.value); urlInput.blur(); }
    if (e.key === 'Escape') { const t = tabs.find(t => t.id === currentTabId); urlInput.value = t?.url || ''; urlInput.blur(); }
});
urlInput.addEventListener('focus', () => urlInput.select());

/* ═══════════════════════════════════════════════════
   ⌨  KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════ */

window.addEventListener('keydown', e => {
    const typing = ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);
    if ((e.ctrlKey||e.metaKey)&&e.key==='t') { e.preventDefault(); createNewTab(null); }
    if ((e.ctrlKey||e.metaKey)&&e.key==='w') { e.preventDefault(); if(currentTabId) closeTab(currentTabId); }
    if ((e.ctrlKey||e.metaKey)&&e.key==='l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
    if (((e.ctrlKey||e.metaKey)&&e.key==='r')||e.key==='F5') { if(!typing){e.preventDefault();refreshTab();} }
    if (e.altKey&&e.key==='ArrowLeft')  { e.preventDefault(); navigateBack(); }
    if (e.altKey&&e.key==='ArrowRight') { e.preventDefault(); navigateForward(); }
    if ((e.ctrlKey||e.metaKey)&&e.key==='Tab') {
        e.preventDefault();
        if(tabs.length<2)return;
        const idx=tabs.findIndex(t=>t.id===currentTabId);
        switchTab(tabs[e.shiftKey?(idx-1+tabs.length)%tabs.length:(idx+1)%tabs.length].id);
    }
    if ((e.ctrlKey||e.metaKey)&&e.key==='k') {
        e.preventDefault();
        cmdBackdrop.classList.toggle('active');
        if(cmdBackdrop.classList.contains('active')){cmdInput.focus();renderCmdResults('');}
    }
    if (e.key==='Escape') {
        cmdBackdrop.classList.remove('active');
        if(settingsModal){settingsModal.remove();settingsModal=null;}
    }
});

/* ═══════════════════════════════════════════════════
   🔍 COMMAND PALETTE
═══════════════════════════════════════════════════ */

const cmdBackdrop = document.getElementById('cmd-palette-backdrop');
const cmdInput    = document.getElementById('cmd-input');
const cmdResults  = document.getElementById('cmd-results');

cmdBackdrop.addEventListener('click', e => { if(e.target===cmdBackdrop) cmdBackdrop.classList.remove('active'); });

function renderCmdResults(val) {
    if (!val) {
        cmdResults.innerHTML = `<div class="cmd-hint"><i class="ph ph-lightning"></i> Type to search or enter a URL</div>
            <div class="cmd-hint-row"><span>Ctrl+T</span><span>New Tab</span></div>
            <div class="cmd-hint-row"><span>Ctrl+W</span><span>Close Tab</span></div>`;
        return;
    }
    const isUrl = looksLikeUrl(val);
    const items = [
        { icon:'ph-magnifying-glass', label:`Search for "<b>${val}</b>"`,  fn:()=>navigateTo(val) },
        ...(isUrl?[{ icon:'ph-globe', label:`Go to <b>${val}</b>`, fn:()=>navigateTo(val) }]:[]),
        { icon:'ph-plus-circle', label:`New tab: <b>${val}</b>`, fn:()=>createNewTab(val) },
    ];
    cmdResults.innerHTML='';
    items.forEach((item,i)=>{
        const el=document.createElement('div');
        el.className='cmd-result-item'+(i===0?' selected':'');
        el.innerHTML=`<i class="ph ${item.icon}"></i><span>${item.label}</span>`;
        el.addEventListener('click',()=>{item.fn();cmdBackdrop.classList.remove('active');cmdInput.value='';});
        cmdResults.appendChild(el);
    });
}
cmdInput.addEventListener('input', e=>renderCmdResults(e.target.value.trim()));
cmdInput.addEventListener('keydown', e=>{ if(e.key==='Enter') cmdResults.querySelector('.selected')?.click(); });

/* ═══════════════════════════════════════════════════
   ✨ TILT CARDS + RIPPLE + CLOCK + CURSOR
═══════════════════════════════════════════════════ */

document.querySelectorAll('.tilt-card').forEach(card=>{
    card.addEventListener('mousemove',e=>{
        const r=card.getBoundingClientRect();
        const rx=((e.clientY-r.top-r.height/2)/r.height)*-20;
        const ry=((e.clientX-r.left-r.width/2)/r.width)*20;
        card.style.transform=`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.04,1.04,1.04)`;
    });
    card.addEventListener('mouseleave',()=>{ card.style.transform='perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)'; });
    card.addEventListener('click',e=>{ addRipple(card,e); if(card.dataset.url) navigateTo(card.dataset.url); });
});

function addRipple(el,e){
    const r=document.createElement('div'); r.className='ripple';
    const rect=el.getBoundingClientRect(),d=Math.max(rect.width,rect.height);
    r.style.cssText=`width:${d}px;height:${d}px;left:${e.clientX-rect.left-d/2}px;top:${e.clientY-rect.top-d/2}px`;
    el.appendChild(r); setTimeout(()=>r.remove(),600);
}
document.querySelectorAll('button').forEach(btn=>{
    if(btn.className.includes('nav-btn')||btn.className.includes('new-tab-btn')){
        btn.style.position='relative'; btn.style.overflow='hidden';
        btn.addEventListener('mousedown',e=>addRipple(btn,e));
    }
});

function updateClock(){
    const n=new Date();
    const te=document.getElementById('clock-time'),de=document.getElementById('clock-date');
    if(te) te.textContent=n.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(de) de.textContent=n.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
}
setInterval(updateClock,1000); updateClock();

const cc={x:0,y:0},circles=document.querySelectorAll('.circle');
circles.forEach(c=>{c.x=0;c.y=0;});
window.addEventListener('mousemove',e=>{cc.x=e.clientX;cc.y=e.clientY;});
window.addEventListener('mouseout',e=>{if(!e.relatedTarget)circles.forEach(c=>c.style.opacity='0');});
window.addEventListener('mouseover',()=>circles.forEach(c=>c.style.opacity='1'));
(function anim(){
    let x=cc.x,y=cc.y;
    circles.forEach((c,i)=>{
        const s=(circles.length-i)/circles.length;
        c.style.transform=`translate3d(${x-12}px,${y-12}px,0) scale(${s})`;
        c.x=x;c.y=y;
        const n=circles[i+1]||circles[0];
        x+=(n.x-x)*0.3; y+=(n.y-y)*0.3;
    });
    requestAnimationFrame(anim);
})();

const addrBar=document.querySelector('.address-bar');
urlInput?.addEventListener('focus',()=>addrBar?.classList.add('neon-focus'));
urlInput?.addEventListener('blur', ()=>addrBar?.classList.remove('neon-focus'));

/* ═══════════════════════════════════════════════════
   🚀 INIT
═══════════════════════════════════════════════════ */
window.createNewTab=createNewTab;
window.navigateTo=navigateTo;
renderShortcuts(); renderBookmarks(); renderHistory(); hideLoading(); restoreSession();