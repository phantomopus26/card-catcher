import { ActionType, PlayerAction, Street, TableOCRSnapshot } from '../../shared/types';
import { parseAction, parseAmount } from '../ocr/text-parser';

interface SeatState {
  playerName: string;
  lastActionText: string;
  lastBetAmount: number;
  lastChipStack: number;
  confirmedStack: number;   // stack value confirmed by 2+ consecutive reads
  stackConfirmCount: number; // how many consecutive frames show the same stack
  hasActed: boolean;
}

/**
 * Compares consecutive OCR snapshots to detect player actions.
 * Uses stack confirmation (2+ matching reads) to filter OCR noise.
 * Blind-aware: ignores SB/BB posts so they don't count as voluntary actions.
 */
export class ActionRecognizer {
  private seatStates: Map<number, SeatState> = new Map();
  private actionOrder = 0;
  private bigBlind: number;
  private smallBlind: number;
  private blindsDetected = 0; // count of blind posts detected this hand

  constructor(bigBlind: number = 0.25) {
    this.bigBlind = bigBlind;
    this.smallBlind = bigBlind / 2; // works for most structures including $0.10/$0.25
  }

  /**
   * Reset for a new hand.
   */
  resetHand(): void {
    for (const state of this.seatStates.values()) {
      state.lastActionText = '';
      state.lastBetAmount = 0;
      state.hasActed = false;
      state.stackConfirmCount = 0;
    }
    this.actionOrder = 0;
    this.blindsDetected = 0;
    this.baselineFrame = true; // first frame sets baselines only
  }
  private baselineFrame = true;

  /**
   * Reset for a new street within the same hand.
   */
  resetStreet(): void {
    for (const state of this.seatStates.values()) {
      state.lastActionText = '';
      state.lastBetAmount = 0;
      state.hasActed = false;
    }
    // Don't reset actionOrder — it continues across streets
    // Don't reset confirmedStack — stacks persist across streets
  }

  /**
   * Compare a new OCR snapshot against the previous state.
   * Returns any newly detected actions.
   */
  processSnapshot(snapshot: TableOCRSnapshot, currentStreet: Street): PlayerAction[] {
    const actions: PlayerAction[] = [];

    // Baseline frame: first snapshot after hand reset.
    // Set current bet/stack as baseline WITHOUT detecting actions.
    // This prevents static OCR artifacts (like seat labels) from triggering false actions.
    if (this.baselineFrame) {
      this.baselineFrame = false;
      for (const seatData of snapshot.seats) {
        const currentBet = this.fixAmount(parseAmount(seatData.betAmount));
        const currentStack = this.fixAmount(parseAmount(seatData.chipStack));
        const prev = this.seatStates.get(seatData.seatIndex);
        if (prev) {
          prev.lastBetAmount = currentBet;
          prev.lastChipStack = currentStack;
          if (currentStack > 0) prev.confirmedStack = currentStack;
          prev.lastActionText = seatData.actionText.trim();
        } else {
          this.seatStates.set(seatData.seatIndex, {
            playerName: seatData.playerName,
            lastActionText: seatData.actionText.trim(),
            lastBetAmount: currentBet,
            lastChipStack: currentStack,
            confirmedStack: currentStack,
            stackConfirmCount: 1,
            hasActed: false,
          });
        }
      }
      return actions; // no actions on baseline frame
    }

    for (const seatData of snapshot.seats) {
      const prev = this.seatStates.get(seatData.seatIndex);
      const currentBet = this.fixAmount(parseAmount(seatData.betAmount));
      const currentStack = this.fixAmount(parseAmount(seatData.chipStack));
      const actionText = seatData.actionText.trim();

      if (!prev) {
        // First time seeing this seat — initialize state
        this.seatStates.set(seatData.seatIndex, {
          playerName: seatData.playerName,
          lastActionText: actionText,
          lastBetAmount: currentBet,
          lastChipStack: currentStack,
          confirmedStack: currentStack,
          stackConfirmCount: 1,
          hasActed: false,
        });
        continue;
      }

      // Stack confirmation: only accept a new stack value after 2+ matching reads
      // This filters single-frame OCR glitches (e.g., $25 → $4 → $25)
      if (currentStack > 0) {
        if (this.stacksMatch(currentStack, prev.lastChipStack)) {
          prev.stackConfirmCount++;
          if (prev.stackConfirmCount >= 2) {
            prev.confirmedStack = currentStack;
          }
        } else {
          // Stack changed — reset confirmation counter
          prev.stackConfirmCount = 1;
        }
      }

      // Use confirmed stack for action detection (more stable than raw OCR)
      const stableStack = prev.confirmedStack;

      // Detect action change
      const detectedAction = this.detectAction(prev, actionText, currentBet, currentStack, stableStack, currentStreet);

      if (detectedAction) {
        actions.push({
          seatIndex: seatData.seatIndex,
          playerName: prev.playerName || seatData.playerName,
          action: detectedAction.type,
          amount: detectedAction.amount,
          street: currentStreet,
          order: this.actionOrder++,
        });
      }

      // Update seat state
      prev.playerName = seatData.playerName || prev.playerName;
      prev.lastActionText = actionText;
      prev.lastBetAmount = currentBet;
      prev.lastChipStack = currentStack;
    }

    return actions;
  }

  /**
   * Check if two stack values are "close enough" to be considered the same reading.
   */
  private stacksMatch(a: number, b: number): boolean {
    if (a === 0 && b === 0) return true;
    if (a === 0 || b === 0) return false;
    const diff = Math.abs(a - b);
    const threshold = Math.max(this.bigBlind * 0.5, 0.01);
    return diff < threshold || diff / Math.max(a, b) < 0.05;
  }

  /**
   * Check if a bet amount looks like a blind post.
   * SB = bigBlind/2 (or bigBlind * 0.4 for $0.10/$0.25), BB = bigBlind.
   * Allow 20% tolerance for OCR imprecision.
   */
  private isBlindPost(betAmount: number, street: string): boolean {
    if (street !== 'preflop') return false;
    if (this.blindsDetected >= 2) return false; // max 2 blinds per hand

    const sbTolerance = this.smallBlind * 0.3;
    const bbTolerance = this.bigBlind * 0.3;

    const isSB = Math.abs(betAmount - this.smallBlind) <= sbTolerance;
    const isBB = Math.abs(betAmount - this.bigBlind) <= bbTolerance;

    return isSB || isBB;
  }

  private detectAction(
    prev: SeatState,
    newActionText: string,
    newBet: number,
    rawStack: number,
    confirmedStack: number,
    street: Street
  ): { type: ActionType; amount: number } | null {
    const bb = this.bigBlind;
    // Cap action at player's confirmed stack (can't bet more than you have)
    const maxActionAmount = confirmedStack > 0 ? confirmedStack : bb * 100;

    // Check if action text changed (rare on Ignition, but use it if available)
    if (newActionText && newActionText !== prev.lastActionText) {
      const parsed = parseAction(newActionText);
      if (parsed) {
        const amount = parsed === 'fold' || parsed === 'check'
          ? 0
          : Math.max(0, newBet - prev.lastBetAmount);
        prev.hasActed = true;
        return { type: parsed, amount };
      }
    }

    // All-in check: only if stack is genuinely near zero relative to BB
    const isAllIn = rawStack === 0 || (confirmedStack > bb * 2 && rawStack > 0 && rawStack < bb * 0.5);

    // Detect from bet amount changes (most reliable signal)
    if (newBet > 0 && newBet !== prev.lastBetAmount) {
      const betChange = Math.abs(newBet - prev.lastBetAmount);

      // Sanity: reject if bet change exceeds player's stack
      if (betChange > maxActionAmount) {
        console.log(`[ActionRecognizer] Rejected: $${betChange.toFixed(2)} > stack $${maxActionAmount.toFixed(2)}`);
        return null;
      }

      // Blind detection: if this looks like a blind post, skip it
      if (prev.lastBetAmount === 0 && this.isBlindPost(newBet, street)) {
        this.blindsDetected++;
        console.log(`[ActionRecognizer] Blind post: $${newBet.toFixed(2)} (blind #${this.blindsDetected})`);
        prev.hasActed = false; // blind doesn't count as acting
        return null;
      }

      prev.hasActed = true;
      if (prev.lastBetAmount === 0) {
        if (isAllIn) {
          return { type: 'all_in', amount: newBet };
        }
        return { type: 'bet', amount: newBet };
      } else if (newBet > prev.lastBetAmount) {
        if (isAllIn) {
          return { type: 'all_in', amount: newBet };
        }
        return { type: 'raise', amount: newBet };
      }
    }

    // Detect from stack decrease without bet amount change
    // Only trigger if stack dropped by more than 1 BB (filters OCR noise)
    if (confirmedStack > bb * 2 && rawStack > 0 && !prev.hasActed) {
      const stackDrop = confirmedStack - rawStack;
      if (stackDrop > bb && stackDrop <= maxActionAmount) {
        prev.hasActed = true;
        prev.confirmedStack = rawStack;
        if (isAllIn) {
          return { type: 'all_in', amount: stackDrop };
        }
        return { type: 'call', amount: stackDrop };
      }
    }

    return null;
  }

  /**
   * Fix amounts where OCR dropped the decimal point.
   * At a $0.10/$0.25 table, "25" is almost certainly $0.25, not $25.
   * Also catches non-integer values that are unreasonably large (e.g., $7.50 should be $0.75).
   */
  private fixAmount(raw: number): number {
    if (raw <= 0 || this.bigBlind <= 0) return raw;
    const ratio = raw / this.bigBlind;

    // Integer values > 20x BB — almost certainly missing a decimal point
    if (ratio > 20 && raw === Math.floor(raw)) {
      const fixed = raw / 100;
      const fixedRatio = fixed / this.bigBlind;
      if (fixedRatio >= 0.1 && fixedRatio <= 50) {
        console.log(`[ActionRecognizer] fixAmount: $${raw} → $${fixed.toFixed(2)} (integer, BB=$${this.bigBlind})`);
        return fixed;
      }
    }

    // Non-integer values that are unreasonably large for the stakes.
    // E.g., $7.50 at BB=$0.25 → 30x BB → try $0.75 (3x BB) ✓
    // E.g., $30.25 at BB=$0.25 → 121x BB → try $3.025 (12.1x BB) ✓
    // Use 50x BB threshold: no single action at micro-stakes should exceed this.
    if (ratio > 50 && raw !== Math.floor(raw)) {
      // Try dividing by 10 first
      const div10 = raw / 10;
      const ratio10 = div10 / this.bigBlind;
      if (ratio10 >= 0.1 && ratio10 <= 50) {
        console.log(`[ActionRecognizer] fixAmount: $${raw} → $${div10.toFixed(4)} (÷10, BB=$${this.bigBlind})`);
        return Math.round(div10 * 100) / 100;
      }
      // Try dividing by 100
      const div100 = raw / 100;
      const ratio100 = div100 / this.bigBlind;
      if (ratio100 >= 0.1 && ratio100 <= 50) {
        console.log(`[ActionRecognizer] fixAmount: $${raw} → $${div100.toFixed(4)} (÷100, BB=$${this.bigBlind})`);
        return Math.round(div100 * 100) / 100;
      }
    }

    return raw;
  }

  /**
   * Update the player name for a seat (e.g., when OCR corrects it).
   */
  updatePlayerName(seatIndex: number, name: string): void {
    const state = this.seatStates.get(seatIndex);
    if (state) state.playerName = name;
  }
}
