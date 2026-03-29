import { EventEmitter } from 'events';
import { detectPokerWindows, getWindowPosition, isWindowStillOpen } from './window-detector';
import { TableInfo, WindowBounds, TableFormat } from '../../shared/types';
import { WINDOW_POLL_INTERVAL_MS } from '../../shared/constants';

function boundsEqual(a: WindowBounds, b: WindowBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function detectSite(title: string): string {
  // Ignition tables don't always say "Ignition" — they show blind levels like "$0.25/$0.50 No Limit Hold'em"
  if (/ignition/i.test(title)) return 'ignition';
  if (/bovada/i.test(title)) return 'bovada';
  if (/pokerstars/i.test(title)) return 'pokerstars';
  // Default to ignition for unbranded Hold'em tables (Ignition's format)
  if (/\$[\d.]+\/\$[\d.]+/.test(title) || /hold'?em/i.test(title)) return 'ignition';
  return 'unknown';
}

function detectFormat(title: string): TableFormat {
  if (/heads\s*up|hu\b/i.test(title)) return 'headsup';
  if (/9[- ]?max|full\s*ring/i.test(title)) return '9max';
  return '6max'; // default
}

export class WindowTracker extends EventEmitter {
  private trackedTables: Map<number, TableInfo> = new Map(); // hwnd → TableInfo
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.pollTimer) return;
    this.poll(); // run immediately
    this.pollTimer = setInterval(() => this.poll(), WINDOW_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getTrackedTables(): TableInfo[] {
    return Array.from(this.trackedTables.values());
  }

  getTable(tableId: string): TableInfo | undefined {
    for (const table of this.trackedTables.values()) {
      if (table.id === tableId) return table;
    }
    return undefined;
  }

  private poll(): void {
    const currentWindows = detectPokerWindows();
    const currentHwnds = new Set(currentWindows.map(w => w.hwnd));

    // Check for lost tables
    for (const [hwnd, table] of this.trackedTables) {
      if (!currentHwnds.has(hwnd) || !isWindowStillOpen(hwnd)) {
        this.trackedTables.delete(hwnd);
        this.emit('table-lost', table.id);
      }
    }

    // Check for new and moved tables
    for (const win of currentWindows) {
      const existing = this.trackedTables.get(win.hwnd);

      if (!existing) {
        // New table found
        const table: TableInfo = {
          id: `table-${win.hwnd}`,
          hwnd: win.hwnd,
          title: win.title,
          bounds: win.bounds,
          format: detectFormat(win.title),
          site: detectSite(win.title),
        };
        this.trackedTables.set(win.hwnd, table);
        this.emit('table-found', table);
      } else {
        // Check if moved/resized
        const newBounds = getWindowPosition(win.hwnd);
        if (newBounds && !boundsEqual(existing.bounds, newBounds)) {
          existing.bounds = newBounds;
          this.emit('table-moved', existing.id, newBounds);
        }
      }
    }
  }
}
