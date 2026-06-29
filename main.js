const { app, BrowserWindow, Tray, Menu, session, ipcMain, dialog, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ==========================================
// --- VERSION BYPASS HACK ---
// Forces electron-updater to ALWAYS see the GitHub release as "newer",
// ensuring the update button always downloads the latest remote files.
// ==========================================
app.getVersion = () => '0.0.0';

// ==========================================
// --- 1. SINGLE INSTANCE LOCK ---
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
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // --- DIRECT SETTINGS READ ---
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

  ipcMain.on('set-quick-start', (event, state) => { isQuickStartEnabled = state; });
  ipcMain.on('set-export-history-state', (event, state) => { exportHistoryEnabled = state; });
  ipcMain.on('set-current-design', (event, designId) => { currentDesignId = designId || 'unknown-design'; });

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
      icon: path.join(__dirname, 'Icon.png'),
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
        event.preventDefault(); 
        mainWindow.hide();      
      }
    });

    // --- NATIVE DOWNLOAD INTERCEPTOR ---
    session.fromPartition('persist:canva').on('will-download', (event, item, webContents) => {
      if (!exportHistoryEnabled || currentDesignId === 'unknown-design') {
        return; 
      }

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
      if (!originalExt) originalExt = '.png';
      
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
          history.unshift(newEntry);
          fs.writeFileSync(historyJsonPath, JSON.stringify(history, null, 2));
          mainWindow.webContents.send('export-downloaded');
        }
      });
    });
  }

  // --- AUTO UPDATER EVENTS ---
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Manual Trigger from Welcome.html
  ipcMain.on('start-update', () => {
    autoUpdater.checkForUpdates();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if(mainWindow) mainWindow.webContents.send('update-progress', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    if(mainWindow) mainWindow.webContents.send('update-downloaded');
  });

  ipcMain.on('install-update', () => {
    forceQuit = true;
    autoUpdater.quitAndInstall();
  });

  app.on('before-quit', () => {
    forceQuit = true;
  });

  app.whenReady().then(() => {
    createWindow();

    const iconPath = path.join(__dirname, 'Icon.png');
    let trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 32, height: 32 });

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
    
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.on('web-contents-created', (event, contents) => {
      if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
          contents.loadURL(url);
          return { action: 'deny' };
        });
      }
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}