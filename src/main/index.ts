import { app, BrowserWindow, globalShortcut } from 'electron';
import { createMainWindow } from './windows/main-window';
import {
  createOverlayWindow,
  moveOverlayWindow,
  destroyOverlayWindow,
  destroyAllOverlays,
  registerInteractionToggle,
} from './windows/overlay-window';
import { WindowTracker } from './capture/window-tracker';
import { OCREngine } from './ocr/ocr-engine';
import { StatsEngine } from './stats/stats-engine';
import { initDatabase, closeDatabase } from './db/database';
import { registerIPCHandlers, stopAllSessions, updateSessionBounds } from './ipc-handlers';
import { IPC } from '../shared/ipc-channels';
import type { TableInfo, WindowBounds } from '../shared/types';

// Disable hardware acceleration for transparent windows
// This is needed for some Windows configurations
app.disableHardwareAcceleration();

let windowTracker: WindowTracker;
let ocrEngine: OCREngine;
let statsEngine: StatsEngine;

app.whenReady().then(async () => {
  console.log('[CardCatcher] Starting up...');

  // Initialize database
  try {
    initDatabase();
    console.log('[CardCatcher] Database initialized');
  } catch (err) {
    console.error('[CardCatcher] Database init failed:', err);
  }

  // Initialize OCR engine
  ocrEngine = new OCREngine();
  try {
    await ocrEngine.initialize(2);
    console.log('[CardCatcher] OCR engine initialized');
  } catch (err) {
    console.error('[CardCatcher] OCR init failed:', err);
  }

  // Load saved ROI calibration
  try {
    const { loadSavedCalibration } = require('./ocr/roi-definitions');
    loadSavedCalibration(app.getPath('userData'));
  } catch (err) {
    console.error('[CardCatcher] ROI calibration load failed:', err);
  }

  // Initialize stats engine
  statsEngine = new StatsEngine();

  // Initialize window tracker
  windowTracker = new WindowTracker();

  // Register IPC handlers
  registerIPCHandlers(windowTracker, ocrEngine, statsEngine);

  // Create the main dashboard window
  const mainWindow = createMainWindow();

  // Wire up window tracker events
  windowTracker.on('table-found', (table: TableInfo) => {
    console.log(`[CardCatcher] Table found: ${table.title} (${table.id})`);

    // Create overlay for this table
    createOverlayWindow(table.id, table.bounds);

    // Notify main window
    mainWindow.webContents.send(IPC.TABLE_FOUND, table);
  });

  windowTracker.on('table-lost', (tableId: string) => {
    console.log(`[CardCatcher] Table lost: ${tableId}`);

    // Destroy overlay
    destroyOverlayWindow(tableId);

    // Notify main window
    mainWindow.webContents.send(IPC.TABLE_LOST, tableId);
  });

  windowTracker.on('table-moved', (tableId: string, bounds: WindowBounds) => {
    // Reposition overlay and update capture bounds
    moveOverlayWindow(tableId, bounds);
    updateSessionBounds(tableId, bounds);
  });

  // Start scanning for poker windows
  windowTracker.start();
  console.log('[CardCatcher] Window tracker started');

  // Register the Alt+H shortcut for overlay interaction toggle
  registerInteractionToggle();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close — keep running in system tray
  // (Could add tray icon here in the future)
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
});

function cleanup(): void {
  console.log('[CardCatcher] Shutting down...');
  windowTracker?.stop();
  stopAllSessions();
  destroyAllOverlays();
  ocrEngine?.shutdown();
  closeDatabase();
  globalShortcut.unregisterAll();
}
