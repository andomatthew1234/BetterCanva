const { app, BrowserWindow, Tray, Menu, session, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null; 

// --- STATE MANAGEMENT ---
let exportHistoryEnabled = false;
let currentDesignId = 'unknown-design';
let isQuickStartEnabled = true; // Default to true as requested

ipcMain.on('set-export-history-state', (event, state) => {
  exportHistoryEnabled = state;
});

ipcMain.on('set-current-design', (event, designId) => {
  currentDesignId = designId || 'unknown-design';
});

// Receive the setting from the frontend UI toggle
ipcMain.on('set-quick-start', (event, state) => {
  isQuickStartEnabled = state;
});

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
    icon: path.join(__dirname, 'icon.png'),
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
    if (app.isQuiting) {
      // If the app is actively trying to quit (e.g., from the tray menu), let it close.
      return true;
    }

    if (isQuickStartEnabled) {
      // QUICK START ON: Prevent standard quit, hide window, keep process alive in tray
      event.preventDefault(); 
      mainWindow.hide();      
    } else {
      // QUICK START OFF: Proceed with normal shutdown sequence
      app.isQuiting = true;
    }
  });

  // --- NATIVE DOWNLOAD INTERCEPTOR ---
  session.fromPartition('persist:canva').on('will-download', (event, item, webContents) => {
    if (!exportHistoryEnabled || currentDesignId === 'unknown-design') {
      return; // Do nothing, let it prompt the user normally
    }

    // Intercept and auto-route
    const baseDir = path.join(__dirname, 'other', 'Export History', currentDesignId);
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

app.whenReady().then(() => {
  createWindow();

  // --- SYSTEM TRAY INIT ---
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open BetterCanva', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit BetterCanva', click: () => { app.isQuiting = true; app.quit(); } }
  ]);

  tray.setToolTip('BetterCanva');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());

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