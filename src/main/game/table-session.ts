import { EventEmitter } from 'events';
import { TableInfo, TableLayout, TableOCRSnapshot, HandRecord, PlayerStats, HudUpdate } from '../../shared/types';
import { HandTracker } from './hand-tracker';
import { SessionStats } from '../stats/session-stats';
import { OCREngine } from '../ocr/ocr-engine';
import { getLayoutForTable } from '../ocr/roi-definitions';
import { captureRegion } from '../capture/screen-capture';
import { parseAmount } from '../ocr/text-parser';
import { CAPTURE_INTERVAL_MS } from '../../shared/constants';
import sharp from 'sharp';

/**
 * Manages the full capture→OCR→track→stats pipeline for a single table.
 */
export class TableSession extends EventEmitter {
  private table: TableInfo;
  private layout: TableLayout;
  private ocrEngine: OCREngine;
  private handTracker: HandTracker;
  private sessionStats: SessionStats;
  private captureTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastSnapshot: TableOCRSnapshot | null = null;
  private ocrPending = false; // guard against overlapping OCR requests
  private maxReasonableStack: number; // parsed from table title

  constructor(table: TableInfo, ocrEngine: OCREngine) {
    super();
    this.table = table;
    this.layout = getLayoutForTable(table.title);
    this.ocrEngine = ocrEngine;
    this.maxReasonableStack = this.parseMaxStack(table.title);
    const bigBlind = this.parseBigBlind(table.title);
    this.handTracker = new HandTracker(table.id, table.site, this.maxReasonableStack, bigBlind);
    this.sessionStats = new SessionStats();

    // Initialize session tracking with stake from table title
    const stakeMatch = table.title.match(/\$[\d.]+\/\$[\d.]+/);
    if (stakeMatch) {
      this.sessionStats.setStake(stakeMatch[0]);
    }
    this.sessionStats.setGameType('cash');

    // Wire up events
    this.handTracker.on('hand-complete', ({ hand }: { hand: HandRecord }) => {
      // Sync hero seat from hand tracker to session stats
      const heroSeat = this.handTracker.getHeroSeat();
      this.sessionStats.setHeroSeat(heroSeat);

      // Log critical diagnostics (these go to debug panel via console.log → debugLog in ipc-handlers)
      const playerInfo = hand.players.map(p => `S${p.seatIndex}($${p.startingStack.toFixed(2)}→$${p.finalStack.toFixed(2)})`).join(', ');
      console.log(`[HAND] #${this.sessionStats.getTotalHands() + 1} complete: ${hand.players.length} players [${playerInfo}], ${hand.actions.length} actions, pot=$${hand.potTotal}, hero=seat${heroSeat}`);

      const heroPlayer = hand.players.find(p => p.seatIndex === heroSeat);
      if (heroPlayer) {
        const heroPnL = heroPlayer.finalStack - heroPlayer.startingStack;
        console.log(`[HERO] seat${heroSeat}: $${heroPlayer.startingStack.toFixed(2)} → $${heroPlayer.finalStack.toFixed(2)} = ${heroPnL >= 0 ? '+' : ''}$${heroPnL.toFixed(2)}`);
      } else {
        console.log(`[HERO] WARNING: hero seat ${heroSeat} NOT FOUND in players! Available seats: [${hand.players.map(p => p.seatIndex).join(',')}]`);
      }

      this.sessionStats.processHand(hand);
      this.emit('hand-complete', hand);
      this.emitHudUpdate();
    });

    this.handTracker.on('action', (data: any) => {
      this.emit('action', data);
    });

    this.handTracker.on('hand-start', () => {
      this.emit('hand-start', { tableId: table.id });
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start the capture loop
    this.captureTimer = setInterval(() => this.captureAndProcess(), CAPTURE_INTERVAL_MS);

    // Do an immediate capture
    await this.captureAndProcess();
  }

  stop(): void {
    this.running = false;
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
  }

  getStats(): PlayerStats[] {
    return this.sessionStats.getAllStats();
  }

  getHudUpdate(): HudUpdate {
    return {
      tableId: this.table.id,
      seats: this.sessionStats.getAllStats(),
      handsPlayed: this.sessionStats.getTotalHands(),
      pnlHistory: this.sessionStats.getPnLHistory(),
      heroSeatIndex: this.sessionStats.getHeroSeat(),
      sessionInfo: this.sessionStats.getSessionInfo(),
    };
  }

  getTable(): TableInfo {
    return this.table;
  }

  updateBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.table.bounds = bounds;
  }

  /**
   * Parse big blind from table title like "$0.10/$0.25 No Limit Hold'em"
   * Returns max reasonable stack (400 BB, capped at $10000)
   */
  private parseMaxStack(title: string): number {
    const blindMatch = title.match(/\$([\d.]+)\/\$([\d.]+)/);
    if (blindMatch) {
      const bb = parseFloat(blindMatch[2]);
      if (!isNaN(bb) && bb > 0) {
        // Max reasonable stack = 400 big blinds
        return Math.max(bb * 400, 100); // at least $100
      }
    }
    return 10000; // fallback — no limit
  }

  private parseBigBlind(title: string): number {
    const blindMatch = title.match(/\$([\d.]+)\/\$([\d.]+)/);
    if (blindMatch) {
      const bb = parseFloat(blindMatch[2]);
      if (!isNaN(bb) && bb > 0) return bb;
    }
    return 0.25; // fallback
  }

  private captureCount = 0;

  private async captureAndProcess(): Promise<void> {
    if (!this.running) return;

    // Prevent overlapping OCR requests
    if (this.ocrPending) return;
    this.ocrPending = true;

    try {
      // Capture the table region
      const screenshotBuffer = await captureRegion(this.table.bounds);

      // Get image dimensions
      const metadata = await sharp(screenshotBuffer).metadata();
      const width = metadata.width || this.table.bounds.width;
      const height = metadata.height || this.table.bounds.height;

      // Run OCR on the screenshot
      const snapshot = await this.ocrEngine.processTableFrame(
        screenshotBuffer,
        width,
        height,
        this.layout,
        this.table.id
      );

      // Validate and sanitize OCR values
      this.sanitizeSnapshot(snapshot);

      // Merge with previous snapshot (keep values for unchanged ROIs)
      const merged = this.mergeSnapshots(this.lastSnapshot, snapshot);
      this.lastSnapshot = merged;

      // Log captures: every frame for first 10, then every 5th
      this.captureCount++;
      const shouldLog = this.captureCount <= 10 || this.captureCount % 5 === 1;
      if (shouldLog) {
        const stacks = merged.seats.map(s => s.chipStack || '-').join(', ');
        const bets = merged.seats.map(s => s.betAmount || '-').join(', ');
        console.log(`[Capture #${this.captureCount}] pot="${merged.pot}" stacks=[${stacks}] bets=[${bets}] phase=${this.handTracker.isInHand() ? 'in-hand' : 'idle'} hands=${this.sessionStats.getTotalHands()}`);
      }

      // Feed to hand tracker (player initialization happens inside processSnapshot)
      this.handTracker.processSnapshot(merged);

      // Emit periodic HUD update
      this.emitHudUpdate();
    } catch (err) {
      console.error(`[TableSession ${this.table.id}] Capture error:`, err);
    } finally {
      this.ocrPending = false;
    }
  }

  /**
   * Validate OCR output against reasonable bounds.
   * Reject obviously wrong values that would corrupt stats.
   */
  private sanitizeSnapshot(snapshot: TableOCRSnapshot): void {
    for (const seat of snapshot.seats) {
      // Validate chip stack — reject values above max reasonable for this table
      const stackVal = parseAmount(seat.chipStack);
      if (stackVal > this.maxReasonableStack) {
        seat.chipStack = ''; // clear garbage value
      }

      // Validate bet amount — bets can't exceed a reasonable buy-in
      const betVal = parseAmount(seat.betAmount);
      if (betVal > this.maxReasonableStack) {
        seat.betAmount = '';
      }
    }

    // Validate pot — pot can't exceed sum of all reasonable stacks
    const potVal = parseAmount(snapshot.pot);
    if (potVal > this.maxReasonableStack * 6) { // 6 players max
      snapshot.pot = '';
    }
  }

  /**
   * Merge current snapshot with previous one.
   * Only carry forward chip stacks (stable between frames).
   * Pot, bets, and cards use current values only (they change rapidly).
   */
  private mergeSnapshots(
    prev: TableOCRSnapshot | null,
    current: TableOCRSnapshot
  ): TableOCRSnapshot {
    if (!prev) return current;

    // Check if this is a "no change" frame (OCR skipped entirely)
    const isSkipped = current.pot === '' &&
      current.seats.every(s => s.chipStack === '' && s.betAmount === '');

    if (isSkipped) {
      // OCR skipped this frame — carry forward everything from previous
      return { ...prev, timestamp: current.timestamp };
    }

    // OCR ran — use current values, carry forward stacks if empty
    // NOTE: pot is NOT carried forward — game state machine uses pot=0 to detect hand-end
    // and has its own 3-frame zero-pot buffer to handle transient OCR errors
    return {
      timestamp: current.timestamp,
      pot: current.pot,
      communityCards: current.communityCards,
      seats: current.seats.map((seat, i) => {
        const prevSeat = prev.seats[i];
        if (!prevSeat) return seat;
        return {
          seatIndex: seat.seatIndex,
          playerName: seat.playerName || prevSeat.playerName,
          chipStack: seat.chipStack || prevSeat.chipStack, // carry forward stacks
          betAmount: seat.betAmount, // DON'T carry forward — bets are transient
          actionText: seat.actionText,
          cards: seat.cards || prevSeat.cards,
        };
      }),
    };
  }

  private hudUpdateCount = 0;
  private emitHudUpdate(): void {
    this.hudUpdateCount++;
    const update = this.getHudUpdate();
    // Log every 10th HUD update to avoid spam
    if (this.hudUpdateCount % 10 === 1 || update.handsPlayed > 0) {
      console.log(`[TableSession] HUD update #${this.hudUpdateCount}: hands=${update.handsPlayed}, seats=${update.seats.length}, pnl=${update.pnlHistory.length} points`);
    }
    this.emit('hud-update', update);
  }
}
