import { ipcMain } from 'electron';
import { IPC } from '../shared/ipc-channels';
import { WindowTracker } from './capture/window-tracker';
import { TableSession } from './game/table-session';
import { OCREngine } from './ocr/ocr-engine';
import { StatsEngine } from './stats/stats-engine';
import {
  saveHand,
  getRecentHands,
  getHands,
  getHandById,
  getPinnedHands,
  pinHand,
  unpinHand,
  getLifetimePnL,
  getHandCount,
} from './db/database';
import { getOverlayWindow } from './windows/overlay-window';
import { getMainWindow } from './windows/main-window';
import { LAYOUTS, getLayoutForTable } from './ocr/roi-definitions';
import { listAllWindows, getWindowPosition } from './capture/window-detector';
import { parseAmount } from './ocr/text-parser';
import { captureRegion } from './capture/screen-capture';
import sharp from 'sharp';
import type { HudUpdate, HandRecord } from '../shared/types';

const sessions = new Map<string, TableSession>();

/** Update capture bounds when a table window moves/resizes */
export function updateSessionBounds(tableId: string, bounds: { x: number; y: number; width: number; height: number }): void {
  const session = sessions.get(tableId);
  if (session) session.updateBounds(bounds);
}

// Debug log buffer — sent to renderer
const debugLogs: string[] = [];
function debugLog(msg: string): void {
  const line = `[${new Date().toISOString().substring(11, 19)}] ${msg}`;
  console.log(line);
  pushToDebugPanel(line);
}

function pushToDebugPanel(line: string): void {
  debugLogs.push(line);
  if (debugLogs.length > 500) debugLogs.splice(0, 250);
  const main = getMainWindow();
  if (main && !main.isDestroyed()) {
    main.webContents.send(IPC.DEBUG_LOG, line);
  }
}

// Intercept console.log to route critical game logs to debug panel
const origLog = console.log;
console.log = (...args: any[]) => {
  origLog.apply(console, args);
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  // Only route game-critical messages (not generic noise)
  if (msg.startsWith('[HAND]') || msg.startsWith('[HERO]') || msg.startsWith('[HandTracker]') ||
      msg.startsWith('[SessionStats]') || msg.startsWith('[TableSession]') || msg.startsWith('[Capture') ||
      msg.startsWith('[Overlay]') || msg.startsWith('[GSM]')) {
    const line = `[${new Date().toISOString().substring(11, 19)}] ${msg}`;
    pushToDebugPanel(line);
  }
};

export function registerIPCHandlers(
  windowTracker: WindowTracker,
  ocrEngine: OCREngine,
  statsEngine: StatsEngine
): void {

  // Table management
  ipcMain.handle(IPC.TABLE_LIST, () => {
    return windowTracker.getTrackedTables();
  });

  ipcMain.handle(IPC.START_TRACKING, async (_event, tableId: string) => {
    const table = windowTracker.getTable(tableId);
    if (!table) throw new Error(`Table ${tableId} not found`);

    if (sessions.has(tableId)) return;

    debugLog(`Starting tracking for ${table.title} (${tableId})`);
    const session = new TableSession(table, ocrEngine);

    session.on('hand-complete', (hand: HandRecord) => {
      debugLog(`Hand complete: pot=$${hand.potTotal}, actions=${hand.actions.length}`);
      statsEngine.processHand(hand);
      saveHand(hand);
    });

    session.on('hud-update', (update: HudUpdate) => {
      const overlay = getOverlayWindow(tableId);
      if (overlay) {
        overlay.webContents.send(IPC.HUD_STATS_UPDATE, update);
      }
      const main = getMainWindow();
      if (main) {
        main.webContents.send(IPC.STATS_UPDATED, update);
      }
    });

    session.on('action', (data: any) => {
      debugLog(`Action: seat ${data.action.seatIndex} ${data.action.action} $${data.action.amount} (${data.action.street})`);
    });

    session.on('hand-start', () => {
      debugLog(`New hand started on ${tableId}`);
    });

    sessions.set(tableId, session);
    await session.start();
    debugLog(`Tracking started for ${tableId}`);
  });

  ipcMain.handle(IPC.STOP_TRACKING, async (_event, tableId: string) => {
    const session = sessions.get(tableId);
    if (session) {
      session.stop();
      sessions.delete(tableId);
      debugLog(`Tracking stopped for ${tableId}`);
    }
  });

  // Stats
  ipcMain.handle(IPC.GET_SESSION_STATS, (_event, tableId: string) => {
    const session = sessions.get(tableId);
    return session ? session.getStats() : [];
  });

  // Settings
  ipcMain.handle(IPC.GET_LAYOUTS, () => LAYOUTS);

  // Database
  ipcMain.handle(IPC.GET_HAND_HISTORY, (_event, params: { tableId?: string; limit?: number; offset?: number; since?: number }) => {
    return getHands({
      tableId: params?.tableId,
      limit: params?.limit || 100,
      offset: params?.offset,
      since: params?.since,
    });
  });

  ipcMain.handle(IPC.GET_HAND_BY_ID, (_event, handId: number) => {
    return getHandById(handId);
  });

  ipcMain.handle(IPC.PIN_HAND, (_event, handId: number) => {
    pinHand(handId);
  });

  ipcMain.handle(IPC.UNPIN_HAND, (_event, handId: number) => {
    unpinHand(handId);
  });

  ipcMain.handle(IPC.GET_PINNED_HANDS, () => {
    return getPinnedHands();
  });

  ipcMain.handle(IPC.GET_LIFETIME_PNL, () => {
    return getLifetimePnL();
  });

  ipcMain.handle(IPC.GET_HAND_COUNT, () => {
    return getHandCount();
  });

  ipcMain.handle(IPC.SEARCH_PLAYERS, (_event, _query: string) => []);

  // ============ LOBBY BALANCE & ETH PRICE ============

  // ETH price cache
  let cachedEthPrice: { price: number; fetchedAt: number } | null = null;
  const ETH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  ipcMain.handle(IPC.GET_ETH_PRICE, async () => {
    if (cachedEthPrice && Date.now() - cachedEthPrice.fetchedAt < ETH_CACHE_TTL_MS) {
      return cachedEthPrice.price;
    }
    try {
      const { net } = require('electron');
      const price = await new Promise<number>((resolve, reject) => {
        const request = net.request('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        let body = '';
        request.on('response', (response: any) => {
          response.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          response.on('end', () => {
            try {
              const data = JSON.parse(body);
              const p = data?.ethereum?.usd;
              if (typeof p === 'number' && p > 0) {
                resolve(p);
              } else {
                reject(new Error('Invalid ETH price response'));
              }
            } catch (e: any) {
              reject(new Error(`ETH price parse error: ${e.message}`));
            }
          });
        });
        request.on('error', (err: any) => reject(err));
        request.end();
      });
      cachedEthPrice = { price, fetchedAt: Date.now() };
      debugLog(`ETH price fetched: $${price}`);
      return price;
    } catch (err: any) {
      debugLog(`ETH price fetch failed: ${err.message}`);
      return cachedEthPrice?.price ?? null;
    }
  });

  ipcMain.handle(IPC.GET_LOBBY_BALANCE, async () => {
    try {
      // Find the lobby window by enumerating all visible windows
      const allWindows = listAllWindows();
      const lobbyWindow = allWindows.find(w =>
        /ignition\s+casino.*poker\s+lobby/i.test(w.title) ||
        /poker\s+lobby.*ignition/i.test(w.title) ||
        (w.title.toLowerCase().includes('ignition') && w.title.toLowerCase().includes('lobby'))
      );

      if (!lobbyWindow) {
        debugLog('Lobby balance: lobby window not found');
        return null;
      }

      debugLog(`Lobby balance: found window "${lobbyWindow.title}" (hwnd: ${lobbyWindow.hwnd})`);

      // Get window bounds
      const bounds = getWindowPosition(lobbyWindow.hwnd);
      if (!bounds || bounds.width < 100 || bounds.height < 100) {
        debugLog('Lobby balance: invalid window bounds');
        return null;
      }

      // Capture the lobby window
      const screenshotBuffer = await captureRegion(bounds);
      const metadata = await sharp(screenshotBuffer).metadata();
      const width = metadata.width || bounds.width;
      const height = metadata.height || bounds.height;

      // Crop the balance region (top-right area where balance is shown)
      const balanceRoi = {
        x: 0.70,
        y: 0.02,
        width: 0.25,
        height: 0.04,
      };
      const left = Math.round(balanceRoi.x * width);
      const top = Math.round(balanceRoi.y * height);
      const roiW = Math.max(1, Math.min(Math.round(balanceRoi.width * width), width - left));
      const roiH = Math.max(1, Math.min(Math.round(balanceRoi.height * height), height - top));

      // Preprocess for OCR: upscale, grayscale, invert, normalize
      const scaleFactor = 4;
      const processed = await sharp(screenshotBuffer)
        .extract({ left, top, width: roiW, height: roiH })
        .resize(roiW * scaleFactor, roiH * scaleFactor, { kernel: 'cubic' })
        .grayscale()
        .negate({ alpha: false })
        .normalise()
        .png()
        .toBuffer();

      // Use the OCR engine to recognize the balance text
      const base64 = processed.toString('base64');
      const processedWidth = roiW * scaleFactor;
      const processedHeight = roiH * scaleFactor;

      const rois = [{
        key: 'balance',
        rect: { x: 0, y: 0, width: 1, height: 1 }, // full preprocessed image
        whitelist: '$0123456789.,',
        scaleFactor: 1, // already scaled
        invert: false,  // already inverted
      }];

      const results = await ocrEngine.processTableFrame(
        processed,
        processedWidth,
        processedHeight,
        {
          id: 'lobby-balance',
          name: 'Lobby Balance',
          seats: 0,
          regions: {
            pot: { x: 0, y: 0, width: 1, height: 1 },
            communityCards: { x: 0, y: 0, width: 0, height: 0 },
            seats: [],
          },
        } as any,
        'lobby-balance'
      );

      // The pot field will contain our balance text since we mapped the full image to it
      const rawText = results.pot || '';
      debugLog(`Lobby balance OCR raw: "${rawText}"`);

      const amount = parseAmount(rawText);
      debugLog(`Lobby balance parsed: $${amount}`);

      return amount > 0 ? amount : null;
    } catch (err: any) {
      debugLog(`Lobby balance error: ${err.message}`);
      return null;
    }
  });

  // ============ DEBUG HANDLERS ============

  // List all visible windows (to find Ignition's actual title)
  ipcMain.handle(IPC.DEBUG_LIST_WINDOWS, () => {
    const all = listAllWindows();
    debugLog(`Found ${all.length} visible windows`);
    // Log potential poker windows
    for (const w of all) {
      const title = w.title.toLowerCase();
      if (title.includes('poker') || title.includes('ignition') || title.includes('bovada') ||
          title.includes('table') || title.includes('hold') || title.includes('no limit') ||
          title.includes('casino') || title.includes('lobby')) {
        debugLog(`  POTENTIAL MATCH: "${w.title}" (hwnd: ${w.hwnd})`);
      }
    }
    return all;
  });

  // Capture a screenshot of a table and return as base64
  ipcMain.handle(IPC.DEBUG_CAPTURE_TABLE, async (_event, tableId: string) => {
    const table = windowTracker.getTable(tableId);
    if (!table) return { error: 'Table not found' };

    debugLog(`Capturing screenshot of ${table.title}...`);
    debugLog(`  Bounds: x=${table.bounds.x} y=${table.bounds.y} w=${table.bounds.width} h=${table.bounds.height}`);
    try {
      const buffer = await captureRegion(table.bounds);
      const metadata = await sharp(buffer).metadata();
      debugLog(`Captured: ${metadata.width}x${metadata.height} (${buffer.length} bytes)`);

      // Also save to disk for inspection
      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(require('electron').app.getPath('userData'), 'debug');
      fs.mkdirSync(debugDir, { recursive: true });
      const debugPath = path.join(debugDir, `capture-${Date.now()}.png`);
      fs.writeFileSync(debugPath, buffer);
      debugLog(`  Saved debug screenshot to: ${debugPath}`);

      return {
        image: buffer.toString('base64'),
        width: metadata.width,
        height: metadata.height,
        bounds: table.bounds,
      };
    } catch (err: any) {
      debugLog(`Capture failed: ${err.message}`);
      return { error: err.message };
    }
  });

  // Run OCR on a table and return results
  ipcMain.handle(IPC.DEBUG_OCR_TEST, async (_event, tableId: string) => {
    const table = windowTracker.getTable(tableId);
    if (!table) return { error: 'Table not found' };

    debugLog(`Running OCR test on ${table.title}...`);
    try {
      const buffer = await captureRegion(table.bounds);
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width || table.bounds.width;
      const height = metadata.height || table.bounds.height;

      debugLog(`Image: ${width}x${height}`);

      const layout = getLayoutForTable(table.title);
      debugLog(`Using layout: ${layout.id} (${layout.seats} seats)`);

      const snapshot = await ocrEngine.processTableFrame(buffer, width, height, layout, table.id);

      debugLog(`OCR Results:`);
      debugLog(`  Pot: "${snapshot.pot}"`);
      debugLog(`  Community cards: "${snapshot.communityCards}"`);
      for (const seat of snapshot.seats) {
        debugLog(`  Seat ${seat.seatIndex}: name="${seat.playerName}" stack="${seat.chipStack}" bet="${seat.betAmount}" action="${seat.actionText}" cards="${seat.cards}"`);
      }

      return { snapshot, layout: layout.id };
    } catch (err: any) {
      debugLog(`OCR test failed: ${err.message}`);
      return { error: err.message };
    }
  });

  // Dump preprocessed ROI images to disk for OCR debugging
  ipcMain.handle('debug:dump-rois', async (_event, tableId: string) => {
    const table = windowTracker.getTable(tableId);
    if (!table) return { error: 'Table not found' };

    debugLog(`Dumping preprocessed ROI images for ${table.title}...`);
    try {
      const buffer = await captureRegion(table.bounds);
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width || table.bounds.width;
      const height = metadata.height || table.bounds.height;
      const layout = getLayoutForTable(table.title);

      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(require('electron').app.getPath('userData'), 'debug', `rois-${Date.now()}`);
      fs.mkdirSync(debugDir, { recursive: true });

      // Save full capture
      fs.writeFileSync(path.join(debugDir, 'full-capture.png'), buffer);

      // Process each chip stack + bet ROI
      for (const seat of layout.regions.seats) {
        for (const [label, roi] of [['stack', seat.chipStack], ['bet', seat.betAmount]] as const) {
          const left = Math.round(roi.x * width);
          const top = Math.round(roi.y * height);
          const roiW = Math.max(1, Math.min(Math.round(roi.width * width), width - left));
          const roiH = Math.max(1, Math.min(Math.round(roi.height * height), height - top));

          // Raw crop
          const cropped = await sharp(buffer)
            .extract({ left, top, width: roiW, height: roiH })
            .png().toBuffer();
          fs.writeFileSync(path.join(debugDir, `seat${seat.seatIndex}-${label}-raw.png`), cropped);

          // Preprocessed (matches OCR worker pipeline)
          const scaleFactor = 4;
          const processed = await sharp(buffer)
            .extract({ left, top, width: roiW, height: roiH })
            .resize(roiW * scaleFactor, roiH * scaleFactor, { kernel: 'cubic' })
            .grayscale()
            .negate({ alpha: false })
            .normalise()
            .png().toBuffer();
          fs.writeFileSync(path.join(debugDir, `seat${seat.seatIndex}-${label}-processed.png`), processed);
        }
      }

      // Pot ROI
      const potRoi = layout.regions.pot;
      const potLeft = Math.round(potRoi.x * width);
      const potTop = Math.round(potRoi.y * height);
      const potW = Math.max(1, Math.min(Math.round(potRoi.width * width), width - potLeft));
      const potH = Math.max(1, Math.min(Math.round(potRoi.height * height), height - potTop));
      const potCropped = await sharp(buffer)
        .extract({ left: potLeft, top: potTop, width: potW, height: potH })
        .png().toBuffer();
      fs.writeFileSync(path.join(debugDir, 'pot-raw.png'), potCropped);
      const potProcessed = await sharp(buffer)
        .extract({ left: potLeft, top: potTop, width: potW, height: potH })
        .resize(potW * 4, potH * 4, { kernel: 'cubic' })
        .grayscale()
        .negate({ alpha: false })
        .normalise()
        .png().toBuffer();
      fs.writeFileSync(path.join(debugDir, 'pot-processed.png'), potProcessed);

      debugLog(`ROI images saved to: ${debugDir}`);
      return { path: debugDir };
    } catch (err: any) {
      debugLog(`ROI dump failed: ${err.message}`);
      return { error: err.message };
    }
  });

  // Save calibrated ROI positions from the visual calibrator
  ipcMain.handle('debug:save-rois', async (_event, rois: { key: string; x: number; y: number; width: number; height: number }[]) => {
    try {
      const { applyCalibration } = require('./ocr/roi-definitions');
      applyCalibration(rois);

      // Also save to disk so it persists across restarts
      const fs = require('fs');
      const path = require('path');
      const calibPath = path.join(require('electron').app.getPath('userData'), 'roi-calibration.json');
      fs.writeFileSync(calibPath, JSON.stringify(rois, null, 2));
      debugLog(`ROIs saved to ${calibPath} and applied to active layout`);
      return { ok: true };
    } catch (err: any) {
      debugLog(`ROI save error: ${err.message}`);
      return { error: err.message };
    }
  });

  // Capture screenshot with ROI rectangles drawn on it for calibration
  ipcMain.handle(IPC.DEBUG_ROI_OVERLAY, async (_event, tableId: string) => {
    const table = windowTracker.getTable(tableId);
    if (!table) return { error: 'Table not found' };

    debugLog(`Generating ROI overlay for ${table.title}...`);
    try {
      const buffer = await captureRegion(table.bounds);
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width || table.bounds.width;
      const height = metadata.height || table.bounds.height;

      const layout = getLayoutForTable(table.title);

      // Build SVG overlay with labeled rectangles
      const rects: string[] = [];
      const colors = ['#ff0000', '#00ff00', '#0088ff', '#ff8800', '#ff00ff', '#00ffff'];

      // Pot ROI
      const pr = layout.regions.pot;
      const px = Math.round(pr.x * width), py = Math.round(pr.y * height);
      const pw = Math.round(pr.width * width), ph = Math.round(pr.height * height);
      rects.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#ffff00" stroke-width="2"/>`);
      rects.push(`<text x="${px}" y="${py - 3}" fill="#ffff00" font-size="12" font-family="monospace">POT</text>`);

      // Community cards ROI
      const cr = layout.regions.communityCards;
      const cx = Math.round(cr.x * width), cy = Math.round(cr.y * height);
      const cw = Math.round(cr.width * width), ch = Math.round(cr.height * height);
      rects.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="none" stroke="#ffffff" stroke-width="2"/>`);
      rects.push(`<text x="${cx}" y="${cy - 3}" fill="#ffffff" font-size="12" font-family="monospace">CARDS</text>`);

      // Seat ROIs
      for (const seat of layout.regions.seats) {
        const color = colors[seat.seatIndex % colors.length];

        // Chip stack
        const sr = seat.chipStack;
        const sx = Math.round(sr.x * width), sy = Math.round(sr.y * height);
        const sw = Math.round(sr.width * width), sh = Math.round(sr.height * height);
        rects.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="${color}" stroke-width="2"/>`);
        rects.push(`<text x="${sx}" y="${sy - 3}" fill="${color}" font-size="11" font-family="monospace">S${seat.seatIndex}-stack</text>`);

        // Bet amount
        const br = seat.betAmount;
        const bx = Math.round(br.x * width), by = Math.round(br.y * height);
        const bw = Math.round(br.width * width), bh = Math.round(br.height * height);
        rects.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="4"/>`);
        rects.push(`<text x="${bx}" y="${by - 3}" fill="${color}" font-size="10" font-family="monospace">S${seat.seatIndex}-bet</text>`);
      }

      const svg = `<svg width="${width}" height="${height}">${rects.join('')}</svg>`;
      const overlayBuffer = Buffer.from(svg);

      const composited = await sharp(buffer)
        .composite([{ input: overlayBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();

      // Save to disk
      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(require('electron').app.getPath('userData'), 'debug');
      fs.mkdirSync(debugDir, { recursive: true });
      const debugPath = path.join(debugDir, `roi-overlay-${Date.now()}.png`);
      fs.writeFileSync(debugPath, composited);
      debugLog(`ROI overlay saved to: ${debugPath}`);

      return {
        image: composited.toString('base64'),
        width,
        height,
        path: debugPath,
      };
    } catch (err: any) {
      debugLog(`ROI overlay failed: ${err.message}`);
      return { error: err.message };
    }
  });
}

export function stopAllSessions(): void {
  for (const session of sessions.values()) {
    session.stop();
  }
  sessions.clear();
}
