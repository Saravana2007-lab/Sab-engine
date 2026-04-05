let tabs = [];
let currentTabId = null;
let tabCounter = 0;

const tabsContainer = document.getElementById('tabs-container');
const iframesContainer = document.getElementById('iframes-container');
const urlInput = document.getElementById('url-input');

function createNewTab(url = "https://example.com") {
    tabCounter++;
    const id = "tab-" + tabCounter;

    const tab = { id, url };
    tabs.push(tab);

    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.display = "none";
    iframesContainer.appendChild(iframe);

    tab.iframe = iframe;

    renderTabs();
    switchTab(id);
}

function renderTabs() {
    tabsContainer.innerHTML = "";

    tabs.forEach(t => {
        const div = document.createElement("div");
        div.className = "tab" + (t.id === currentTabId ? " active" : "");
        div.innerText = t.url;

        div.onclick = () => switchTab(t.id);
        tabsContainer.appendChild(div);
    });

    document.getElementById("status-right").innerText = tabs.length + " tabs";
}

function switchTab(id) {
    currentTabId = id;

    tabs.forEach(t => {
        t.iframe.style.display = t.id === id ? "block" : "none";
    });

    const tab = tabs.find(t => t.id === id);
    urlInput.value = tab.url;

    renderTabs();
}

function navigate() {
    let url = urlInput.value;

    if (!url.startsWith("http")) {
        url = "https://" + url;
    }

    const tab = tabs.find(t => t.id === currentTabId);
    tab.url = url;
    tab.iframe.src = url;

    renderTabs();
}

/* Events */
document.getElementById("new-tab-btn").onclick = () => createNewTab();
document.getElementById("go-btn").onclick = navigate;

urlInput.addEventListener("keypress", e => {
    if (e.key === "Enter") navigate();
});

/* Init */
createNewTab();