import { BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    title: 'Card Catcher',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const preloadPath = path.join(__dirname, '..', '..', 'preload', 'main-preload.js');
  console.log('[CardCatcher] Preload path:', preloadPath);
  console.log('[CardCatcher] Preload exists:', require('fs').existsSync(preloadPath));

  // Load the main renderer
  // __dirname is dist/main/main/windows/ when compiled
  const indexHtml = path.join(__dirname, '..', '..', '..', 'renderer', 'renderer', 'index.html');
  console.log('[CardCatcher] Loading main window from:', indexHtml);

  mainWindow.loadFile(indexHtml).catch((err) => {
    console.error('[CardCatcher] Failed to load file, trying dev server:', err.message);
    mainWindow!.loadURL('http://localhost:5173/src/renderer/index.html').catch(console.error);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[CardCatcher] Main window loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[CardCatcher] Main window failed to load:', code, desc);
  });

  // DevTools: use Ctrl+Shift+I to open manually when needed
  // (auto-open disabled to reduce window clutter on restart)

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}
