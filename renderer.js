const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell, ipcRenderer } = require('electron');

const tabsContainer = document.getElementById('tabs-container');
const viewsContainer = document.getElementById('views-container');
const newTabBtn = document.getElementById('new-tab-btn');
const loadingBar = document.getElementById('loading-bar');
const appSplash = document.getElementById('app-splash');

// ==========================================
// --- DATA.JSON SETTINGS ENGINE ---
// ==========================================
const dataDir = path.join(__dirname, 'other');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const settingsPath = path.join(dataDir, 'data.json');

// Default Settings Blueprint
const defaultSettings = {
  hasOnboarded: false,
  startupDashboard: true,
  quickStart: true,
  exportHistory: true,
  zenMode: false,
  bananaTheme: false,
  theme: 'system',
  userName: 'Matthew'
};

// Global Memory Cache
let appSettings = { ...defaultSettings };

// Load settings on boot
function loadSettings() {
  if (fs.existsSync(settingsPath)) {
    try {
      const savedData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      appSettings = { ...defaultSettings, ...savedData };
    } catch (e) {
      console.error("Error reading data.json, using defaults.", e);
    }
  } else {
    saveSettings(); // Create the file if it doesn't exist
  }
}

// Save settings to disk
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
  } catch (e) {
    console.error("Error writing to data.json", e);
  }
}

// Initialize settings on boot
loadSettings();

// ==========================================
// --- FOCUS MANAGEMENT ENGINE ---
// ==========================================
function forceFocusOnWebview(viewEl) {
  if (!viewEl) return;
  viewEl.focus();
  
  if (viewEl.getURL().includes('welcome.html')) {
    viewEl.executeJavaScript(`
      window.focus();
      document.body.focus();
      var searchInput = document.getElementById('global-search');
      if(searchInput) searchInput.focus();
    `).catch(() => {});
  }
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const activeView = document.querySelector('webview.active');
  if (activeView && document.getElementById('lucid-backdrop').classList.contains('hidden')) {
    forceFocusOnWebview(activeView);
  }
});

// ==========================================
// --- GLOBAL LUCIDSEARCH ENGINE ---
// ==========================================
const lucidBackdrop = document.getElementById('lucid-backdrop');
const lucidWrapper = document.getElementById('lucid-wrapper');
const lucidInput = document.getElementById('lucid-input');
const lucidDropdown = document.getElementById('lucid-dropdown');
const lucidSearchBtn = document.getElementById('lucid-search-btn');

let lucidSearchResults = [];
let lucidSelectedIndex = -1;

const quickCreateOptions = [
  { title: 'Video Studio', url: 'https://www.canva.com/create/videos/', icon: '🎬', tags: ['video', 'mp4', 'movie', 'clip'] },
  { title: 'Presentation', url: 'https://www.canva.com/create/presentations/', icon: '📐', tags: ['slides', 'powerpoint', 'deck', 'pitch'] },
  { title: 'A4 Poster', url: 'https://www.canva.com/create/posters/', icon: '📄', tags: ['flyer', 'print', 'sign'] },
  { title: 'A3 Poster', url: 'https://www.canva.com/create/posters/', icon: '📄', tags: ['flyer', 'print', 'large'] },
  { title: 'A4 Document', url: 'https://www.canva.com/create/documents/', icon: '📃', tags: ['doc', 'pdf', 'letter', 'resume'] },
  { title: 'Brand Logo', url: 'https://www.canva.com/create/logos/', icon: '🖼️', tags: ['branding', 'icon', 'symbol'] }
];

function openLucidSearch() {
  lucidBackdrop.classList.remove('hidden');
  lucidInput.value = '';
  lucidWrapper.classList.remove('has-results');
  lucidDropdown.classList.add('hidden');
  lucidDropdown.innerHTML = '';
  lucidSearchResults = [];
  lucidSelectedIndex = -1;
  setTimeout(() => lucidInput.focus(), 50);
}

function closeLucidSearch() {
  // We aggressively reset all classes and arrays so no UI stays stuck
  lucidBackdrop.classList.add('hidden');
  lucidWrapper.classList.remove('has-results');
  lucidDropdown.classList.add('hidden');
  lucidDropdown.innerHTML = '';
  lucidInput.value = '';
  lucidSearchResults = [];
  lucidSelectedIndex = -1;
  lucidInput.blur();
  
  const activeView = document.querySelector('webview.active');
  if (activeView) forceFocusOnWebview(activeView);
}

lucidSearchBtn.addEventListener('click', openLucidSearch);
lucidBackdrop.addEventListener('click', (e) => {
  if (e.target === lucidBackdrop) closeLucidSearch();
});

// Host-level Shortcut Catcher
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && e.code === 'Space') {
    e.preventDefault();
    if (lucidBackdrop.classList.contains('hidden')) openLucidSearch();
    else closeLucidSearch();
  }
  if (e.key === 'Escape' && !lucidBackdrop.classList.contains('hidden')) {
    closeLucidSearch();
  }
});

lucidInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  
  if (!query) {
    lucidWrapper.classList.remove('has-results');
    lucidDropdown.classList.add('hidden');
    lucidSearchResults = [];
    lucidSelectedIndex = -1;
    return;
  }

  lucidWrapper.classList.add('has-results');
  lucidDropdown.classList.remove('hidden');
  
  let results = [];

  // 1. Filter Quick Creates
  quickCreateOptions.forEach(opt => {
    if (opt.title.toLowerCase().includes(query) || opt.tags.some(t => t.includes(query))) {
      results.push({ ...opt, isRecent: false });
    }
  });

  // 2. Fetch and Filter Recent Designs
  let recents = [];
  const recentsPath = path.join(dataDir, 'recent_designs.json');
  if (fs.existsSync(recentsPath)) {
    try { recents = JSON.parse(fs.readFileSync(recentsPath, 'utf8')); } catch(err){}
  }

  recents.forEach(design => {
    if (design.title.toLowerCase().includes(query)) {
      results.push({ ...design, isRecent: true });
    }
  });

  lucidSearchResults = results;
  lucidSelectedIndex = results.length > 0 ? 0 : -1;
  renderLucidDropdown();
});

lucidInput.addEventListener('keydown', (e) => {
  if (lucidSearchResults.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    lucidSelectedIndex = (lucidSelectedIndex + 1) % lucidSearchResults.length;
    updateLucidHighlight();
  } 
  else if (e.key === 'ArrowUp') {
    e.preventDefault();
    lucidSelectedIndex = (lucidSelectedIndex - 1 + lucidSearchResults.length) % lucidSearchResults.length;
    updateLucidHighlight();
  } 
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (lucidSelectedIndex >= 0 && lucidSelectedIndex < lucidSearchResults.length) {
      const item = lucidSearchResults[lucidSelectedIndex];
      // CRITICAL FIX: Close search immediately before navigating
      closeLucidSearch();
      createTab(item.url, item.title);
    }
  }
});

function renderLucidDropdown() {
  lucidDropdown.innerHTML = '';
  
  if (lucidSearchResults.length === 0) {
    lucidDropdown.innerHTML = `<div class="lr-empty">No results found for "${lucidInput.value}"</div>`;
    return;
  }

  lucidSearchResults.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'lucid-result-item' + (index === lucidSelectedIndex ? ' keyboard-active' : '');
    
    // CRITICAL FIX: Use mousedown to prevent blur issues and close immediately
    div.onmousedown = (e) => { 
      e.preventDefault();
      closeLucidSearch(); 
      createTab(item.url, item.title); 
    };

    if (item.isRecent) {
      const imgHtml = item.img ? `<img class="lr-img" src="${item.img}" alt="Thumb">` : `<div class="lr-icon" style="font-size:16px;">📄</div>`;
      div.innerHTML = `
        ${imgHtml}
        <div class="lr-details">
          <span class="lr-title">${item.title}</span>
          <span class="lr-type">Workspace Design</span>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="lr-icon">${item.icon}</div>
        <div class="lr-details">
          <span class="lr-title">${item.title}</span>
          <span class="lr-type">Quick Launch</span>
        </div>
      `;
    }
    lucidDropdown.appendChild(div);
  });
}

function updateLucidHighlight() {
  const items = document.querySelectorAll('.lucid-result-item');
  items.forEach((item, idx) => {
    if (idx === lucidSelectedIndex) {
      item.classList.add('keyboard-active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('keyboard-active');
    }
  });
}

// ==========================================
// --- STARTUP LOGIC ENGINE ---
// ==========================================
const getStartupUrl = () => {
  if (!appSettings.hasOnboarded) {
    return 'file://' + path.join(__dirname, 'other', 'onboarding.html');
  }
  return appSettings.startupDashboard ? 'file://' + path.join(__dirname, 'welcome.html') : 'https://www.canva.com';
};

const getStartupTitle = () => {
  if (!appSettings.hasOnboarded) return 'Welcome to BetterCanva';
  return appSettings.startupDashboard ? 'BetterCanva Launcher' : 'Home';
};

// --- CORE NAVIGATION ---
newTabBtn.addEventListener('click', () => {
  const url = appSettings.startupDashboard ? 'file://' + path.join(__dirname, 'welcome.html') : 'https://www.canva.com';
  const title = appSettings.startupDashboard ? 'BetterCanva Launcher' : 'Home';
  createTab(url, title);
});

const infoBtn = document.getElementById('info-btn');
infoBtn.addEventListener('click', () => {
  const welcomeUrl = 'file://' + path.join(__dirname, 'welcome.html');
  createTab(welcomeUrl, 'BetterCanva Launcher'); 
});

// ==========================================
// --- EXPORT HISTORY SYSTEM ---
// ==========================================
const historyBtn = document.getElementById('history-btn');
const historySidebar = document.getElementById('history-sidebar');
const historyList = document.getElementById('history-list');
const historyToggle = document.getElementById('export-history-toggle');
const previewOverlay = document.getElementById('preview-overlay');
const closePreviewBtn = document.getElementById('close-preview-btn');

let currentActiveDesignId = 'unknown-design';
historyToggle.checked = appSettings.exportHistory;

ipcRenderer.send('set-export-history-state', appSettings.exportHistory);

historyToggle.addEventListener('change', (e) => {
  appSettings.exportHistory = e.target.checked;
  saveSettings();
  ipcRenderer.send('set-export-history-state', appSettings.exportHistory);
  renderHistory();
});

historyBtn.addEventListener('click', () => {
  historySidebar.classList.toggle('hidden');
  renderHistory();
});

closePreviewBtn.addEventListener('click', () => {
  previewOverlay.classList.add('hidden');
  document.getElementById('preview-content').innerHTML = ''; 
});

function checkUrlForDesignId(url) {
  if (!url) return;
  const match = url.match(/\/design\/([^/]+)/);
  const id = match ? match[1] : 'unknown-design';
  
  if (id !== currentActiveDesignId) {
    currentActiveDesignId = id;
    ipcRenderer.send('set-current-design', currentActiveDesignId);
    if (!historySidebar.classList.contains('hidden')) renderHistory();
  }
}

ipcRenderer.on('export-downloaded', () => {
  if (!historySidebar.classList.contains('hidden')) renderHistory();
});

function getHistoryDir() {
  return path.join(dataDir, 'Export History', currentActiveDesignId);
}

function renderHistory() {
  if (currentActiveDesignId === 'unknown-design') {
    historyList.innerHTML = `<div class="empty-history">Open a design to view its history.</div>`;
    return;
  }

  if (!appSettings.exportHistory) {
    historyList.innerHTML = `<div class="empty-history">Tracking is paused. Toggle on to resume tracking exports.</div>`;
    return;
  }

  const jsonPath = path.join(getHistoryDir(), 'history.json');
  if (!fs.existsSync(jsonPath)) {
    historyList.innerHTML = `<div class="empty-history">No exports yet for this design. Export tracking active.</div>`;
    return;
  }

  let history = [];
  try { history = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch(e){}

  if (history.length === 0) {
    historyList.innerHTML = `<div class="empty-history">No exports found.</div>`;
    return;
  }

  historyList.innerHTML = '';
  history.forEach(entry => {
    const timeAgo = new Date(entry.createdAt).toLocaleString();
    const sizeMb = (entry.fileSize / 1024 / 1024).toFixed(2);
    
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-title">Version ${entry.version} <span class="history-badge">${entry.fileType.toUpperCase()}</span></div>
      <div class="history-meta">${timeAgo} • ${sizeMb} MB</div>
      <div class="history-actions">
        <button class="history-btn copy-btn" title="Export this version to another folder">💾 Export</button>
        <button class="history-btn del del-btn">🗑 Delete</button>
      </div>
    `;

    el.addEventListener('click', (e) => {
      if(e.target.tagName !== 'BUTTON') previewFile(entry);
    });

    el.querySelector('.copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const sourcePath = path.join(getHistoryDir(), entry.filename);
      const defaultName = `${currentActiveDesignId}_v${entry.version}.${entry.fileType}`;
      await ipcRenderer.invoke('copy-file-dialog', sourcePath, defaultName);
    });

    el.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if(confirm(`Delete Version ${entry.version} permanently?`)) {
        try { fs.unlinkSync(path.join(getHistoryDir(), entry.filename)); } catch(err){}
        const updatedHistory = history.filter(h => h.version !== entry.version);
        fs.writeFileSync(jsonPath, JSON.stringify(updatedHistory, null, 2));
        renderHistory();
      }
    });

    historyList.appendChild(el);
  });
}

function previewFile(entry) {
  const filePath = path.join(getHistoryDir(), entry.filename);
  if (!fs.existsSync(filePath)) {
    alert("File no longer exists on disk.");
    return;
  }

  const ext = entry.fileType.toLowerCase();
  const contentDiv = document.getElementById('preview-content');
  document.getElementById('preview-title').innerText = `Version ${entry.version} (${ext.toUpperCase()})`;
  
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    contentDiv.innerHTML = `<img src="file://${filePath}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius: 8px;">`;
  } else if (ext === 'mp4') {
    contentDiv.innerHTML = `<video src="file://${filePath}" controls autoplay style="max-width:100%; max-height:100%; border-radius: 8px;"></video>`;
  } else if (ext === 'pdf') {
    contentDiv.innerHTML = `<iframe src="file://${filePath}" style="width:100%; height:100%; border:none; border-radius: 8px; background: white;"></iframe>`;
  } else {
    contentDiv.innerHTML = `<div style="color:white;">Preview not available for .${ext} files. Export it to view.</div>`;
  }
  
  previewOverlay.classList.remove('hidden');
}


// ==========================================
// --- ASSET WATCHER (HOT FOLDER ENGINE) ---
// ==========================================
const folderBtn = document.getElementById('folder-btn');
const uploadFolder = path.join(__dirname, 'other', 'Uploads');

if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

folderBtn.addEventListener('click', () => {
  shell.openPath(uploadFolder);
});

const processedFiles = new Set();
fs.watch(uploadFolder, (eventType, filename) => {
  if (!filename || processedFiles.has(filename)) return;

  const filePath = path.join(uploadFolder, filename);
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.size > 0) {
          processedFiles.add(filename);
          
          loadingBar.style.opacity = '1';
          loadingBar.style.background = '#fbc02d';
          loadingBar.style.width = '100%';
          setTimeout(() => { 
            loadingBar.style.opacity = '0'; 
            setTimeout(() => { 
              loadingBar.style.width = '0%'; 
              loadingBar.style.background = 'linear-gradient(90deg, #00C4CC, #7D2AE8)'; 
            }, 400);
          }, 1000);

          injectFileIntoCanva(filePath, filename);
          setTimeout(() => processedFiles.delete(filename), 5000);
        }
      }
    } catch (err) {
      console.log("File lock error, ignoring:", err);
    }
  }, 500);
});

function injectFileIntoCanva(filePath, filename) {
  const activeView = document.querySelector('webview.active');
  if (!activeView) return;

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.mp4': 'video/mp4', '.svg': 'image/svg+xml'
  };
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  const base64Data = fs.readFileSync(filePath).toString('base64');
  const safeFilename = filename.replace(/'/g, "\\'").replace(/"/g, '\\"');

  const injectScript = `
    (async function() {
      try {
        const res = await fetch('data:${mimeType};base64,${base64Data}');
        const blob = await res.blob();
        const file = new File([blob], '${safeFilename}', { type: '${mimeType}' });
        
        const dt = new DataTransfer();
        dt.items.add(file);
        const target = document.body;

        ['dragenter', 'dragover', 'drop'].forEach(eventName => {
          target.dispatchEvent(new DragEvent(eventName, {
            bubbles: true, cancelable: true, dataTransfer: dt,
            clientX: window.innerWidth / 2, clientY: window.innerHeight / 2
          }));
        });
        
        setTimeout(() => {
          const fileInput = document.querySelector('input[type="file"]');
          if (fileInput) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'files').set;
            if (nativeSetter) {
               nativeSetter.call(fileInput, dt.files);
               fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, 300);
      } catch (e) {
        console.error("BetterCanva Injection Failed:", e);
      }
    })();
  `;
  activeView.executeJavaScript(injectScript).catch(e => console.error(e));
}

// ==========================================
// --- SETTINGS, OVERLAY & THEME LOGIC ---
// ==========================================
const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const settingsOverlay = document.getElementById('settings-overlay');

settingsBtn.addEventListener('click', () => {
  const isHidden = settingsMenu.classList.contains('hidden');
  if (isHidden) {
    settingsMenu.classList.remove('hidden');
    settingsOverlay.classList.remove('hidden');
    document.querySelector('.select-items').classList.add('select-hide'); 
  } else {
    closeSettings();
  }
});

settingsOverlay.addEventListener('click', closeSettings);

function closeSettings() {
  settingsMenu.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
  document.querySelector('.select-items').classList.add('select-hide');
}

const selectedDiv = document.querySelector('.select-selected');
const itemsContainer = document.querySelector('.select-items');
const itemDivs = itemsContainer.querySelectorAll('div');

selectedDiv.addEventListener('click', function(e) {
  e.stopPropagation();
  itemsContainer.classList.toggle('select-hide');
});

itemDivs.forEach(div => {
  div.addEventListener('click', function(e) {
    e.stopPropagation(); 
    selectedDiv.innerText = this.innerText; 
    const newTheme = this.getAttribute('data-value');
    applyTheme(newTheme);
    appSettings.theme = newTheme;
    saveSettings();
    itemsContainer.classList.add('select-hide');
  });
});

applyTheme(appSettings.theme);
const activeItem = document.querySelector(`.select-items div[data-value="${appSettings.theme}"]`);
if (activeItem) selectedDiv.innerText = activeItem.innerText; 

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark', 'theme-system', 'theme-terminal', 'theme-canva-glow', 'theme-sky-blues', 'theme-gaming-legacy', 'theme-celebration');
  root.classList.add(`theme-${theme}`);
}

// --- APP STARTUP TOGGLE UI INIT ---
const startupToggle = document.getElementById('startup-toggle');
if (startupToggle) {
  startupToggle.checked = appSettings.startupDashboard;
  startupToggle.addEventListener('change', (e) => {
    appSettings.startupDashboard = e.target.checked;
    saveSettings();
  });
}

// --- QUICK START TOGGLE UI INIT ---
const quickStartToggle = document.getElementById('quick-start-toggle');
if (quickStartToggle) {
  quickStartToggle.checked = appSettings.quickStart;
  ipcRenderer.send('set-quick-start', appSettings.quickStart);

  quickStartToggle.addEventListener('change', (e) => {
    appSettings.quickStart = e.target.checked;
    saveSettings();
    ipcRenderer.send('set-quick-start', appSettings.quickStart);
  });
}

// --- CELEBRATION THEME LOGIC ---
document.getElementById('tab-bar').addEventListener('mousedown', (e) => {
  if (document.documentElement.classList.contains('theme-celebration')) {
    createExplosion(e.clientX, e.clientY);
  }
});

function createExplosion(x, y) {
  const colors = ['#00C4CC', '#7D2AE8', '#ff0055', '#ffaa00', '#00ffaa']; 
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    
    const angle = Math.random() * Math.PI * 2;
    const velocity = 40 + Math.random() * 80; 
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity;
    
    particle.style.setProperty('--tx', tx + 'px');
    particle.style.setProperty('--ty', ty + 'px');
    
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 800);
  }
}

// --- STUDIO ZEN MODE ENGINE ---
const ZEN_CSS = `
  header, [role="banner"] {
    position: fixed !important;
    top: -60px !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    z-index: 99999 !important;
    transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }

  body::before {
    content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 20px;
    background: transparent; z-index: 99998;
  }

  body:hover::before, header:hover, [role="banner"]:hover,
  header:has(:hover), [role="banner"]:has(:hover) { top: 0 !important; }
`;

const zenModeBtn = document.getElementById('zen-mode-btn');

const updateZenButtonText = () => {
  zenModeBtn.innerText = appSettings.zenMode ? '🖼️ Exit Focus Canvas' : '🖼️ Focus Canvas (Zen Mode)';
};
updateZenButtonText();

zenModeBtn.addEventListener('click', () => {
  appSettings.zenMode = !appSettings.zenMode;
  saveSettings();
  updateZenButtonText();
  document.querySelectorAll('webview').forEach(viewEl => updateZenModeCSS(viewEl, appSettings.zenMode));
  closeSettings();
});

function updateZenModeCSS(viewEl, enabled) {
  if (enabled) {
    const injectScript = `(function() { let style = document.getElementById('bettercanva-zen'); if (!style) { style = document.createElement('style'); style.id = 'bettercanva-zen'; style.innerHTML = \`${ZEN_CSS}\`; document.head.appendChild(style); } })();`;
    viewEl.executeJavaScript(injectScript).catch(() => {});
  } else {
    const removeScript = `(function() { const style = document.getElementById('bettercanva-zen'); if (style) style.remove(); })();`;
    viewEl.executeJavaScript(removeScript).catch(() => {});
  }
}

// --- BANANA THEME INJECTION ENGINE ---
const BANANA_CSS = `
  :root { --b-bg: #fffde7 !important; --b-surface: #fff59d !important; --b-card: #fff9c4 !important; --b-text: #3e2723 !important; --b-accent: #fbc02d !important; }
  html body #root > div, html body #root > div > div, html body #root > div > div > div, html body .app-wrapper { background-color: var(--b-bg) !important; background-image: none !important; }
  html body div[role="navigation"], html body header, html body aside, html body [role="dialog"], html body [data-focus-lock-disabled] > div { background-color: var(--b-surface) !important; background-image: none !important; box-shadow: none !important; border-bottom: 1px solid var(--b-accent) !important; }
  html body a[href*="/design/"], html body div[role="button"][tabindex="0"], html body section > div > div { background-color: var(--b-card) !important; background-image: none !important; border: 1px solid var(--b-accent) !important; box-shadow: 0 2px 8px rgba(251, 192, 45, 0.15) !important; }
  html body h1, html body h2, html body h3, html body h4, html body p, html body span, html body a, html body label, html body div { color: var(--b-text) !important; -webkit-text-fill-color: var(--b-text) !important; }
  html body input { background-color: #ffffff !important; border: 2px solid var(--b-accent) !important; color: var(--b-text) !important; -webkit-text-fill-color: var(--b-text) !important; }
  html body input::placeholder { color: #8d6e63 !important; -webkit-text-fill-color: #8d6e63 !important; }
  html body svg { color: var(--b-text) !important; fill: currentColor !important; }
  html body iframe, html body canvas, html body [data-testid="design-canvas"], html body [data-testid="design-canvas"] * { background-color: transparent !important; background-image: initial !important; color: inherit !important; -webkit-text-fill-color: initial !important; }
  html body img, html body video { background-color: transparent !important; }
`;

function updateWebviewCSS(viewEl, enabled) {
  if (enabled) {
    const injectScript = `(function() { let style = document.getElementById('bettercanva-banana'); if (!style) { style = document.createElement('style'); style.id = 'bettercanva-banana'; style.innerHTML = \`${BANANA_CSS}\`; document.head.appendChild(style); } })();`;
    viewEl.executeJavaScript(injectScript).catch(() => {});
  } else {
    const removeScript = `(function() { const style = document.getElementById('bettercanva-banana'); if (style) style.remove(); })();`;
    viewEl.executeJavaScript(removeScript).catch(() => {});
  }
}

// ==========================================
// --- TAB LOGIC & LOADING BAR EVENTS ---
// ==========================================
let tabCounter = 0;
let isAppBooted = false;

function trackRecentDesign(rawUrl, title) {
  if (!title || title === 'Home' || title.includes('Untitled Design')) return;
  if (!rawUrl.includes('/design/DA')) return;

  let cleanUrl = rawUrl.split('?')[0];
  if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
  if (!cleanUrl.endsWith('/edit')) cleanUrl += '/edit';

  const jsonPath = path.join(dataDir, 'recent_designs.json');
  let recents = [];
  if (fs.existsSync(jsonPath)) {
    try { recents = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch(e){}
  }
  
  recents = recents.filter(d => d.url !== cleanUrl);
  
  recents.unshift({
    url: cleanUrl,
    title: title,
    img: null, 
    lastOpened: new Date().toISOString()
  });
  
  recents = recents.slice(0, 5);
  fs.writeFileSync(jsonPath, JSON.stringify(recents, null, 2));
}

function fetchRecentDesignsForDashboard(sourceWebview) {
  const jsonPath = path.join(dataDir, 'recent_designs.json');
  let recents = [];
  if (fs.existsSync(jsonPath)) {
    try { 
      recents = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); 
      let healed = false;
      recents.forEach(d => {
         if (d.url && !d.url.endsWith('/edit')) {
             if (d.url.endsWith('/')) d.url += 'edit';
             else d.url += '/edit';
             healed = true;
         }
      });
      if (healed) fs.writeFileSync(jsonPath, JSON.stringify(recents, null, 2));

    } catch(e){}
  }
  sourceWebview.send('recent-designs-data', recents);
}

function createTab(url = 'https://www.canva.com', title = 'Home') {
  const tabId = 'tab-' + tabCounter++;
  const isHome = title === 'Home';

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.target = tabId;

  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  
  const setTabTitle = (text) => {
    if (isHome) {
      titleEl.innerHTML = `<svg class="home-icon" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>${text}`;
    } else {
      titleEl.innerText = text;
    }
  };

  setTabTitle(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerText = '×';
  closeBtn.onclick = (e) => {
    e.stopPropagation(); 
    closeTab(tabId, tabEl);
  };

  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeBtn);
  tabEl.onclick = () => activateTab(tabId);
  tabsContainer.appendChild(tabEl);

  const viewEl = document.createElement('webview');
  viewEl.id = tabId;
  viewEl.src = url;
  viewEl.partition = 'persist:canva'; 
  viewEl.setAttribute('allowpopups', 'true'); 
  viewEl.setAttribute('nodeintegration', 'true');
  viewEl.setAttribute('webpreferences', 'contextIsolation=no');
  viewsContainer.appendChild(viewEl);

  // --- SEAMLESS QUICK CREATE BYPASS ---
  viewEl.addEventListener('did-start-navigation', (e) => {
    if (e.url.includes('canva.com/create/')) {
      viewEl.style.opacity = '0'; 
    } else {
      viewEl.style.opacity = '1'; 
    }
  });

  viewEl.addEventListener('ipc-message', (event) => {
    if (event.channel === 'set-theme') {
      const theme = event.args[0];
      applyTheme(theme);
      appSettings.theme = theme;
      saveSettings();
      const activeItem = document.querySelector(`.select-items div[data-value="${theme}"]`);
      if (activeItem) {
        document.querySelector('.select-selected').innerText = activeItem.innerText;
      }
    } 
    else if (event.channel === 'toggle-banana') {
      appSettings.bananaTheme = !appSettings.bananaTheme;
      saveSettings();
      document.querySelectorAll('webview').forEach(v => updateWebviewCSS(v, appSettings.bananaTheme));
    }
    else if (event.channel === 'open-tab') {
      const { url, title } = event.args[0];
      createTab(url, title);
    }
    else if (event.channel === 'request-recent-designs') {
      fetchRecentDesignsForDashboard(viewEl);
    }
    // --- ONBOARDING COMPLETION HANDLER ---
    else if (event.channel === 'complete-onboarding') {
      appSettings.hasOnboarded = true;
      appSettings.userName = event.args[0].userName;
      appSettings.startupDashboard = event.args[0].startupDashboard;
      
      // Catching the Quick Start toggle value from the new Settings card
      if (event.args[0].quickStart !== undefined) {
          appSettings.quickStart = event.args[0].quickStart;
          ipcRenderer.send('set-quick-start', appSettings.quickStart); 
          
          const qsUiToggle = document.getElementById('quick-start-toggle');
          if (qsUiToggle) qsUiToggle.checked = appSettings.quickStart;
      }

      saveSettings();
      closeTab(tabId, tabEl);
    }
    // --- NAME SYNC HANDLER ---
    else if (event.channel === 'update-user-name') {
      appSettings.userName = event.args[0];
      saveSettings();
    }
    // --- LUCID SEARCH SHORTCUT CAUGHT INSIDE WEBVIEW ---
    else if (event.channel === 'open-lucid-search') {
      openLucidSearch();
    }
  });

  viewEl.addEventListener('did-navigate-in-page', (e) => {
    if (viewEl.classList.contains('active')) checkUrlForDesignId(e.url);
  });
  viewEl.addEventListener('did-navigate', (e) => {
    if (viewEl.classList.contains('active')) checkUrlForDesignId(e.url);
  });

  viewEl.addEventListener('did-start-loading', () => {
    loadingBar.style.opacity = '1';
    loadingBar.style.width = '30%'; 
  });

  viewEl.addEventListener('did-stop-loading', () => {
    loadingBar.style.width = '100%';
    setTimeout(() => {
      loadingBar.style.opacity = '0';
      setTimeout(() => { loadingBar.style.width = '0%'; }, 400); 
    }, 300);
  });

  viewEl.addEventListener('dom-ready', () => {
    const currentUrl = viewEl.getURL();
    
    // --- INVISIBLE AUTO-CLICK CTA ---
    if (currentUrl.includes('canva.com/create/')) {
      const autoClickScript = `
        (function() {
          const directLink = document.querySelector('a[href*="/design/create"]');
          if (directLink) {
            directLink.click();
            return;
          }
          const elements = Array.from(document.querySelectorAll('a, button'));
          const cta = elements.find(el => el.innerText && (el.innerText.toLowerCase().includes('start designing') || el.innerText.toLowerCase().includes('create a ')));
          if (cta) cta.click();
        })();
      `;
      viewEl.executeJavaScript(autoClickScript).catch(()=>{});
      return; 
    }

    updateWebviewCSS(viewEl, appSettings.bananaTheme);
    updateZenModeCSS(viewEl, appSettings.zenMode);

    // --- INJECT LUCIDSEARCH SHORTCUT LISTENER INTO CANVA ---
    const lucidShortcutScript = `
      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.code === 'Space') {
          e.preventDefault();
          const { ipcRenderer } = require('electron');
          ipcRenderer.sendToHost('open-lucid-search');
        }
      }, true);
    `;
    viewEl.executeJavaScript(lucidShortcutScript).catch(() => {});

    // Provide the saved name to the welcome/onboarding pages via IPC injection
    if (currentUrl.includes('welcome.html') || currentUrl.includes('onboarding.html')) {
        viewEl.executeJavaScript(`
            window.appSettingsData = ${JSON.stringify(appSettings)};
        `).catch(() => {});
    }

    // --- ZERO-CLICK AUTOFOCUS HOOK ---
    if (currentUrl.includes('welcome.html') && viewEl.classList.contains('active')) {
      setTimeout(() => forceFocusOnWebview(viewEl), 100); 
    }
    
    if (!isAppBooted) {
      isAppBooted = true;
      if(appSplash) {
        appSplash.style.opacity = '0';
        setTimeout(() => appSplash.remove(), 800);
      }
    }
  });

  viewEl.addEventListener('page-title-updated', (e) => {
    if (e.title) {
      const cleanTitle = e.title.replace(' - Canva', '').trim();
      setTabTitle(cleanTitle);

      const currentUrl = viewEl.getURL();
      if (currentUrl.includes('/design/DA')) {
        trackRecentDesign(currentUrl, cleanTitle);
      }
    }
  });

  activateTab(tabId);
}

function activateTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('webview').forEach(v => v.classList.remove('active'));

  const targetTab = document.querySelector(`.tab[data-target="${tabId}"]`);
  const targetView = document.getElementById(tabId);
  
  if (targetTab && targetView) {
    targetTab.classList.add('active');
    targetView.classList.add('active');
    checkUrlForDesignId(targetView.getURL());

    // --- CRITICAL: GRAB KEYBOARD FOCUS ON TAB SWITCH ---
    setTimeout(() => forceFocusOnWebview(targetView), 50);
  }
}

function closeTab(tabId, tabEl) {
  const viewEl = document.getElementById(tabId);
  
  if (tabEl.classList.contains('active')) {
    const nextTab = tabEl.nextElementSibling || tabEl.previousElementSibling;
    if (nextTab) activateTab(nextTab.dataset.target);
  }

  tabEl.remove();
  viewEl.remove();

  if (tabsContainer.children.length === 0) {
    const url = appSettings.startupDashboard ? 'file://' + path.join(__dirname, 'welcome.html') : 'https://www.canva.com';
    const title = appSettings.startupDashboard ? 'BetterCanva Launcher' : 'Home';
    createTab(url, title);
  }
}

// --- BOOT PROCESS ---
createTab(getStartupUrl(), getStartupTitle());