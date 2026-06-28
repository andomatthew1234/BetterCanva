const { app, BrowserWindow, Tray, Menu, session, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ==========================================
// --- 1. SINGLE INSTANCE LOCK ---
// Prevents duplicate processes, duplicate tray icons, and forces 
// the existing Quick Start instance to simply un-hide itself instantly.
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow;
  let tray = null; 
  let forceQuit = false; // Proper lifecycle tracking

  // --- 2. SECOND INSTANCE HANDLER ---
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // If the user clicks the app shortcut while it's in the background, 
    // instantly restore the existing window instead of booting a new one.
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // --- DIRECT SETTINGS READ ---
  // Read settings immediately on boot so the background process knows its state
  let isQuickStartEnabled = true;
  let exportHistoryEnabled = true;
  let currentDesignId = 'unknown-design';

  const dataDir = path.join(os.homedir(), 'Documents', 'BetterCanva', 'Data');
  const settingsPath = path.join(dataDir, 'data.json');

  function loadMainSettings() {
    if (fs.existsSync(settingsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (data.quickStart !== undefined) isQuickStartEnabled = data.quickStart;
        if (data.exportHistory !== undefined) exportHistoryEnabled = data.exportHistory;
      } catch(e) {}
    }
  }
  loadMainSettings();

  // Listen for live updates from renderer if user toggles them while app is open
  ipcMain.on('set-quick-start', (event, state) => { isQuickStartEnabled = state; });
  ipcMain.on('set-export-history-state', (event, state) => { exportHistoryEnabled = state; });
  ipcMain.on('set-current-design', (event, designId) => { currentDesignId = designId || 'unknown-design'; });

  // Handle copying a version native dialog
  ipcMain.handle('copy-file-dialog', async (event, sourcePath, defaultFilename) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultFilename,
      title: 'Copy Export Version'
    });
    if (!canceled && filePath) {
      fs.copyFileSync(sourcePath, filePath);
      return true;
    }
    return false;
  });

  function createWindow () {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      title: 'BetterCanva',
      icon: path.join(__dirname, 'Icon.png'), // CAPITAL 'I' for ASAR case-sensitivity
      webPreferences: {
        nodeIntegration: true, 
        contextIsolation: false, 
        webviewTag: true,
        backgroundThrottling: false 
      }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.loadFile('index.html');

    // --- WINDOW CLOSE BEHAVIOR ---
    mainWindow.on('close', function (event) {
      if (isQuickStartEnabled && !forceQuit) {
        // QUICK START ON: Intercept close, hide window to system tray
        event.preventDefault(); 
        mainWindow.hide();      
      }
      // If Quick Start is OFF, or forceQuit is true (tray Quit clicked), let it close normally.
    });

    // --- NATIVE DOWNLOAD INTERCEPTOR ---
    session.fromPartition('persist:canva').on('will-download', (event, item, webContents) => {
      if (!exportHistoryEnabled || currentDesignId === 'unknown-design') {
        return; // Do nothing, let it prompt the user normally
      }

      // Intercept and auto-route to Documents so it can write safely in compiled .exe
      const baseDir = path.join(os.homedir(), 'Documents', 'BetterCanva', 'Export History', currentDesignId);
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      const historyJsonPath = path.join(baseDir, 'history.json');
      let history = [];
      if (fs.existsSync(historyJsonPath)) {
        try { history = JSON.parse(fs.readFileSync(historyJsonPath, 'utf8')); } catch(e){}
      }

      const nextVersion = history.length > 0 ? Math.max(...history.map(h => h.version)) + 1 : 1;
      let originalExt = path.extname(item.getFilename()).toLowerCase();
      if (!originalExt) originalExt = '.png'; // Fallback
      
      const newFilename = `${nextVersion}${originalExt}`;
      const savePath = path.join(baseDir, newFilename);

      item.setSavePath(savePath);

      item.once('done', (event, state) => {
        if (state === 'completed') {
          const newEntry = {
            version: nextVersion,
            filename: newFilename,
            createdAt: new Date().toISOString(),
            fileType: originalExt.replace('.', ''),
            fileSize: item.getReceivedBytes()
          };
          history.unshift(newEntry); // Put newest at the top
          fs.writeFileSync(historyJsonPath, JSON.stringify(history, null, 2));
          
          // Tell the frontend to refresh the sidebar
          mainWindow.webContents.send('export-downloaded');
        }
      });
    });
  }

  // Catch the official app termination signal
  app.on('before-quit', () => {
    forceQuit = true;
  });

  app.whenReady().then(() => {
    createWindow();

    // --- SYSTEM TRAY INIT ---
    // CAPITAL 'I' for ASAR case-sensitivity!
    const iconPath = path.join(__dirname, 'Icon.png');
    
    // Using nativeImage prevents the "invisible/failed icon" bug on Windows compiled .exe
    let trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 32, height: 32 }); // Force size to standard Windows tray specs

    tray = new Tray(trayIcon);
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open BetterCanva', click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
      }},
      { type: 'separator' },
      { label: 'Quit BetterCanva', click: () => { forceQuit = true; app.quit(); } }
    ]);

    tray.setToolTip('BetterCanva');
    tray.setContextMenu(contextMenu);
    
    // Left click tray icon opens app
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Intercept new window requests (like popups) to force them into webview logic
    app.on('web-contents-created', (event, contents) => {
      if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          contents.loadURL(url);
          return { action: 'deny' };
        });
      }
    });
  });

  // Explicitly handle all windows closing
  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}