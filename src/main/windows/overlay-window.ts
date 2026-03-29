import { BrowserWindow, globalShortcut } from 'electron';
import path from 'path';
import { WindowBounds } from '../../shared/types';

const overlays = new Map<string, BrowserWindow>();

export function createOverlayWindow(tableId: string, bounds: WindowBounds): BrowserWindow {
  // Clean up existing overlay for this table if any
  destroyOverlayWindow(tableId);

  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Make clicks pass through to the poker client
  overlay.setIgnoreMouseEvents(true, { forward: true });

  // Prevent the overlay from appearing in taskbar/alt-tab
  overlay.setSkipTaskbar(true);

  // Load the overlay renderer
  // __dirname is dist/main/main/windows/ when compiled
  // HTML is at dist/renderer/overlay/index.html
  const overlayHtml = path.join(__dirname, '..', '..', '..', 'renderer', 'overlay', 'index.html');
  console.log(`[Overlay] __dirname: ${__dirname}`);
  console.log(`[Overlay] Loading HTML from: ${overlayHtml}`);
  console.log(`[Overlay] File exists: ${require('fs').existsSync(overlayHtml)}`);
  overlay.loadFile(overlayHtml).catch((err) => {
    console.error(`[Overlay] Failed to load overlay HTML: ${err.message}`);
    // In dev mode, might load from vite dev server
    overlay.loadURL('http://localhost:5173/src/overlay/index.html').catch(console.error);
  });

  // Pass table ID to the overlay
  overlay.webContents.once('did-finish-load', () => {
    overlay.webContents.send('init', { tableId });
  });

  overlays.set(tableId, overlay);
  return overlay;
}

export function moveOverlayWindow(tableId: string, bounds: WindowBounds): void {
  const overlay = overlays.get(tableId);
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
}

export function destroyOverlayWindow(tableId: string): void {
  const overlay = overlays.get(tableId);
  if (overlay && !overlay.isDestroyed()) {
    overlay.destroy();
  }
  overlays.delete(tableId);
}

export function getOverlayWindow(tableId: string): BrowserWindow | undefined {
  const overlay = overlays.get(tableId);
  if (overlay && !overlay.isDestroyed()) return overlay;
  return undefined;
}

export function destroyAllOverlays(): void {
  for (const [id, overlay] of overlays) {
    if (!overlay.isDestroyed()) overlay.destroy();
  }
  overlays.clear();
}

/**
 * Register Alt key to toggle click-through on overlays.
 * When Alt is held, overlays become interactive (for repositioning HUD elements).
 */
export function registerInteractionToggle(): void {
  // Note: Electron's globalShortcut doesn't support keydown/keyup natively.
  // We use a polling approach or iohook in a future version.
  // For now, we provide a toggle shortcut.
  globalShortcut.register('Alt+H', () => {
    for (const overlay of overlays.values()) {
      if (overlay.isDestroyed()) continue;
      // Toggle between interactive and pass-through
      const isIgnoring = !overlay.isFocusable();
      if (isIgnoring) {
        overlay.setIgnoreMouseEvents(false);
        overlay.setFocusable(true);
      } else {
        overlay.setIgnoreMouseEvents(true, { forward: true });
        overlay.setFocusable(false);
      }
    }
  });
}
