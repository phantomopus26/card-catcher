import { fork, ChildProcess } from 'child_process';
import path from 'path';
import sharp from 'sharp';
import { OCR_WHITELISTS } from '../../shared/constants';
import { TableLayout, TableOCRSnapshot } from '../../shared/types';

export class OCREngine {
  private worker: ChildProcess | null = null;
  private initialized = false;
  private pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private requestId = 0;
  private lastFullImageHash: Map<string, string> = new Map();

  async initialize(_numWorkers: number = 1): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      // Fork the OCR worker as a child process
      const workerPath = path.join(__dirname, '..', 'ocr', 'ocr-worker-process.js');
      this.worker = fork(workerPath, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

      this.worker.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          this.worker!.send({ type: 'init' });
          return;
        }
        if (msg.type === 'init-done') {
          this.initialized = true;
          resolve();
          return;
        }
        if (msg.type === 'init-error') {
          reject(new Error(msg.error));
          return;
        }
        if (msg.type === 'frame-result' || msg.type === 'frame-error') {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            this.pendingRequests.delete(msg.id);
            if (msg.type === 'frame-result') {
              pending.resolve(msg.results);
            } else {
              pending.reject(new Error(msg.error));
            }
          }
        }
      });

      this.worker.on('error', (err) => {
        console.error('[OCREngine] Worker error:', err);
      });

      this.worker.on('exit', (code) => {
        console.log('[OCREngine] Worker exited with code', code);
        this.initialized = false;
        this.worker = null;
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!this.initialized) {
          reject(new Error('OCR worker init timeout'));
        }
      }, 30000);
    });
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      this.worker.send({ type: 'shutdown' });
      this.worker = null;
    }
    this.initialized = false;
  }

  /**
   * Quick check: has the full table image changed since last frame?
   */
  private async hasTableChanged(tableImage: Buffer, tableId: string): Promise<boolean> {
    try {
      const tiny = await sharp(tableImage)
        .resize(16, 16, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      const avg = tiny.reduce((s, v) => s + v, 0) / tiny.length;
      let hash = '';
      for (let i = 0; i < tiny.length; i++) {
        hash += tiny[i] > avg ? '1' : '0';
      }

      const prev = this.lastFullImageHash.get(tableId);
      this.lastFullImageHash.set(tableId, hash);
      if (!prev) return true;

      let diff = 0;
      for (let i = 0; i < hash.length; i++) {
        if (hash[i] !== prev[i]) diff++;
      }
      return diff > hash.length * 0.08;
    } catch {
      return true;
    }
  }

  /**
   * Send a frame to the OCR worker process for recognition.
   */
  private sendToWorker(tableImageBase64: string, tableWidth: number, tableHeight: number, rois: any[]): Promise<Record<string, string>> {
    if (!this.worker || !this.initialized) {
      return Promise.reject(new Error('OCR worker not initialized'));
    }

    const id = String(++this.requestId);
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.send({
        type: 'process-frame',
        id,
        tableImageBase64,
        tableWidth,
        tableHeight,
        rois,
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('OCR timeout'));
        }
      }, 15000);
    });
  }

  /**
   * Process a full table screenshot — runs in child process, doesn't block main thread.
   */
  async processTableFrame(
    tableImage: Buffer,
    tableWidth: number,
    tableHeight: number,
    layout: TableLayout,
    tableId: string
  ): Promise<TableOCRSnapshot> {
    const snapshot: TableOCRSnapshot = {
      timestamp: Date.now(),
      pot: '',
      communityCards: '',
      seats: [],
    };

    // Change detection disabled — OCR runs in child process so it doesn't block main thread.
    // The previous 16x16 hash approach was too aggressive and classified nearly every
    // frame as "unchanged", causing live tracking to never read any data.

    // Build list of all ROIs to process
    const rois: any[] = [];

    // Pot
    rois.push({
      key: 'pot',
      rect: layout.regions.pot,
      whitelist: OCR_WHITELISTS.pot,
      scaleFactor: 4,
      invert: true,
    });

    // Community cards
    rois.push({
      key: 'cc',
      rect: layout.regions.communityCards,
      whitelist: OCR_WHITELISTS.cards,
      scaleFactor: 2,
      invert: true,
    });

    // Per-seat: chip stack + bet amount (2 ROIs per seat)
    for (const seat of layout.regions.seats) {
      rois.push({
        key: `s${seat.seatIndex}-stack`,
        rect: seat.chipStack,
        whitelist: OCR_WHITELISTS.amount,
        scaleFactor: 4,
        invert: true,
      });

      // Bet amount (needed for action detection)
      rois.push({
        key: `s${seat.seatIndex}-bet`,
        rect: seat.betAmount,
        whitelist: OCR_WHITELISTS.amount,
        scaleFactor: 4,
        invert: true,
      });
    }

    // Hero cards (seat 0 only)
    const heroSeat = layout.regions.seats.find(s => s.seatIndex === 0);
    if (heroSeat) {
      rois.push({
        key: 's0-cards',
        rect: heroSeat.cards,
        whitelist: OCR_WHITELISTS.cards,
        scaleFactor: 3,
        invert: true,
      });
    }

    try {
      const base64 = tableImage.toString('base64');
      const results = await this.sendToWorker(base64, tableWidth, tableHeight, rois);

      snapshot.pot = results['pot'] || '';
      snapshot.communityCards = results['cc'] || '';

      for (const seat of layout.regions.seats) {
        snapshot.seats.push({
          seatIndex: seat.seatIndex,
          playerName: `Seat ${seat.seatIndex + 1}`,
          chipStack: results[`s${seat.seatIndex}-stack`] || '',
          betAmount: results[`s${seat.seatIndex}-bet`] || '',
          actionText: '',
          cards: seat.seatIndex === 0 ? (results['s0-cards'] || '') : '',
        });
      }
    } catch (err) {
      console.error('[OCREngine] Frame processing error:', err);
      snapshot.seats = layout.regions.seats.map(s => ({
        seatIndex: s.seatIndex,
        playerName: `Seat ${s.seatIndex + 1}`,
        chipStack: '',
        betAmount: '',
        actionText: '',
        cards: '',
      }));
    }

    return snapshot;
  }
}
