import { EventEmitter } from 'events';
import { HandRecord, HandPlayer, PlayerAction, TableOCRSnapshot } from '../../shared/types';
import { GameStateMachine } from './game-state-machine';
import { ActionRecognizer } from './action-recognizer';
import { parseAmount, parseCards, isSeatOccupied } from '../ocr/text-parser';

/**
 * Tracks individual hands at a table, building complete HandRecords
 * from OCR snapshots and game state transitions.
 *
 * Events:
 * - 'hand-start': new hand detected
 * - 'hand-complete': full hand record available
 * - 'action': new player action detected
 */
export class HandTracker extends EventEmitter {
  private stateMachine: GameStateMachine;
  private actionRecognizer: ActionRecognizer;
  private currentHand: Partial<HandRecord> | null = null;
  private currentActions: PlayerAction[] = [];
  private handCount = 0;
  private tableId: string;
  private site: string;
  private maxBuyIn: number;
  private bigBlind: number; // parsed from table title for VPIP inference

  // Collect ALL stack readings per seat during a hand — use median for finalStack
  private stackHistory: Map<number, number[]> = new Map();
  private peakPot = 0; // track highest pot seen during hand (pot goes to 0 at collection)
  private framesInHand = 0; // count frames since hand start for player init retries
  private heroSeatIndex = 0; // detected from hole cards visibility

  constructor(tableId: string, site: string, maxBuyIn: number = 10000, bigBlind: number = 0.25) {
    super();
    this.tableId = tableId;
    this.site = site;
    this.maxBuyIn = maxBuyIn;
    this.bigBlind = bigBlind;
    this.stateMachine = new GameStateMachine();
    this.actionRecognizer = new ActionRecognizer(bigBlind);

    this.stateMachine.on('hand-start', () => this.onHandStart());
    this.stateMachine.on('hand-end', () => this.onHandEnd());
    this.stateMachine.on('phase-change', (newPhase: string, oldPhase: string) => {
      if (['flop', 'turn', 'river'].includes(newPhase)) {
        this.actionRecognizer.resetStreet();
      }
    });
  }

  processSnapshot(snapshot: TableOCRSnapshot): void {
    if (this.currentHand) {
      this.framesInHand++;

      // Keep trying to add players for first 5 frames (OCR may fail on any single frame)
      if (this.framesInHand <= 5) {
        this.addNewPlayers(snapshot);
      }

      // Detect hero from hole cards: only the hero's cards are face-up on Ignition
      this.detectHeroSeat(snapshot);
    }

    // CRITICAL: Update stacks BEFORE state machine check.
    // When pot=0 triggers hand-end, the winner's stack already includes the pot.
    if (this.currentHand) {
      const potVal = this.fixAmount(parseAmount(snapshot.pot));
      // Sanity: pot can't exceed max buy-in * 6 players
      if (potVal > 0 && potVal <= this.maxBuyIn * 6 && potVal > this.peakPot) {
        this.peakPot = potVal;
      }
      this.currentHand.potTotal = this.peakPot;
      this.currentHand.communityCards = parseCards(snapshot.communityCards);

      for (const seatData of snapshot.seats) {
        const existing = this.currentHand.players?.find(p => p.seatIndex === seatData.seatIndex);
        if (!existing) continue;

        const stack = this.fixAmount(parseAmount(seatData.chipStack));
        if (stack > 0) {
          let history = this.stackHistory.get(seatData.seatIndex);
          if (!history) {
            history = [];
            this.stackHistory.set(seatData.seatIndex, history);
          }
          history.push(stack);

          // Use last reading directly for finalStack
          existing.finalStack = stack;
        }

        if (seatData.cards) {
          const cards = parseCards(seatData.cards);
          if (cards.length > 0) existing.holeCards = cards;
        }
      }
    }

    // Now check state machine — hand-end may fire here, using the stacks we just updated
    const phaseChanged = this.stateMachine.update(snapshot.communityCards, snapshot.pot);

    const street = this.stateMachine.getStreet();
    if (!street) return;

    const newActions = this.actionRecognizer.processSnapshot(snapshot, street);
    for (const action of newActions) {
      this.currentActions.push(action);
      this.emit('action', { tableId: this.tableId, action });
    }
  }

  /**
   * Fix amounts where OCR dropped the decimal point.
   * Same logic as ActionRecognizer — keeps stack/PnL values sane.
   * Uses higher thresholds for stacks (400x BB) since stacks can be legitimately large.
   */
  private fixAmount(raw: number): number {
    if (raw <= 0 || this.bigBlind <= 0) return raw;
    const ratio = raw / this.bigBlind;

    // Integer values > 20x BB — almost certainly missing a decimal point
    if (ratio > 20 && raw === Math.floor(raw)) {
      const fixed = raw / 100;
      const fixedRatio = fixed / this.bigBlind;
      if (fixedRatio >= 0.1 && fixedRatio <= 400) {
        console.log(`[HandTracker] fixAmount: $${raw} → $${fixed.toFixed(2)} (integer, BB=$${this.bigBlind})`);
        return fixed;
      }
    }

    // Non-integer values that are unreasonably large for the stakes.
    // For stacks, use 400x BB threshold (a deep stack at $0.25 BB could be $100).
    // E.g., $93.21 at BB=$0.25 → 372.8x BB → borderline, leave it alone
    // E.g., $930.21 at BB=$0.25 → 3721x BB → try $93.021 (372x BB) ✓
    if (ratio > 400 && raw !== Math.floor(raw)) {
      // Try dividing by 10 first
      const div10 = raw / 10;
      const ratio10 = div10 / this.bigBlind;
      if (ratio10 >= 0.1 && ratio10 <= 400) {
        console.log(`[HandTracker] fixAmount: $${raw} → $${div10.toFixed(4)} (÷10, BB=$${this.bigBlind})`);
        return Math.round(div10 * 100) / 100;
      }
      // Try dividing by 100
      const div100 = raw / 100;
      const ratio100 = div100 / this.bigBlind;
      if (ratio100 >= 0.1 && ratio100 <= 400) {
        console.log(`[HandTracker] fixAmount: $${raw} → $${div100.toFixed(4)} (÷100, BB=$${this.bigBlind})`);
        return Math.round(div100 * 100) / 100;
      }
    }

    return raw;
  }

  /**
   * Return the median of the last N values in an array.
   * Median is much more robust to outliers than mean or last-value.
   */
  private medianOfLastN(values: number[], n: number): number {
    const slice = values.slice(-n);
    slice.sort((a, b) => a - b);
    const mid = Math.floor(slice.length / 2);
    if (slice.length % 2 === 0) {
      return (slice[mid - 1] + slice[mid]) / 2;
    }
    return slice[mid];
  }

  private onHandStart(): void {
    this.handCount++;
    this.currentActions = [];
    this.actionRecognizer.resetHand();
    this.stackHistory.clear();
    this.peakPot = 0;
    this.framesInHand = 0;

    this.currentHand = {
      tableId: this.tableId,
      site: this.site,
      timestamp: Date.now(),
      numSeats: 0,
      dealerSeat: -1,
      potTotal: 0,
      communityCards: [],
      heroCards: null,
      wentToShowdown: false,
      players: [],
      actions: [],
    };

    this.emit('hand-start', { tableId: this.tableId, handNumber: this.handCount });
  }

  private onHandEnd(): void {
    if (!this.currentHand) return;

    console.log(`[HandTracker] onHandEnd: ${this.currentHand.players?.length || 0} players, ${this.currentActions.length} actions, heroSeat=${this.heroSeatIndex}, frames=${this.framesInHand}`);

    const heroPlayer = this.currentHand.players?.find(p => p.seatIndex === this.heroSeatIndex);
    const heroCards = heroPlayer?.holeCards || this.currentHand.heroCards || null;

    const hand: HandRecord = {
      tableId: this.currentHand.tableId || this.tableId,
      site: this.currentHand.site || this.site,
      timestamp: this.currentHand.timestamp || Date.now(),
      numSeats: this.currentHand.players?.length || 0,
      dealerSeat: this.currentHand.dealerSeat || 0,
      potTotal: this.currentHand.potTotal || 0,
      communityCards: this.currentHand.communityCards || [],
      heroCards,
      wentToShowdown: (this.currentHand.communityCards?.length || 0) >= 5,
      players: this.currentHand.players || [],
      actions: this.currentActions,
    };

    // PnL sanity: reject swings that exceed the table max buy-in
    for (const player of hand.players) {
      const pnl = player.finalStack - player.startingStack;
      if (Math.abs(pnl) > this.maxBuyIn) {
        console.log(`[HandTracker] PnL sanity: seat ${player.seatIndex} pnl=$${pnl.toFixed(2)} exceeds max buy-in $${this.maxBuyIn}, resetting`);
        player.finalStack = player.startingStack;
      }
    }

    // Post-hand VPIP inference: if a player's stack decreased beyond the big blind
    // but no voluntary action was recorded, synthesize one.
    this.inferMissingActions(hand);

    // Fold inference: players with no recorded preflop action folded
    this.inferFolds(hand);

    const heroPnL = heroPlayer ? (heroPlayer.finalStack - heroPlayer.startingStack) : 0;
    // Detailed PnL diagnostics
    for (const p of hand.players) {
      const pnl = p.finalStack - p.startingStack;
      const hist = this.stackHistory.get(p.seatIndex) || [];
      console.log(`[HandTracker] Seat ${p.seatIndex}: start=$${p.startingStack.toFixed(2)} final=$${p.finalStack.toFixed(2)} pnl=$${pnl.toFixed(2)} readings=${hist.length} last3=[${hist.slice(-3).map(v => v.toFixed(2)).join(',')}]`);
    }
    console.log(`[HandTracker] Hand #${this.handCount}: ${hand.players.length} players, ${hand.actions.length} actions, pot=$${hand.potTotal}, hero PnL=$${heroPnL.toFixed(2)}`);
    this.emit('hand-complete', { tableId: this.tableId, hand });
    this.currentHand = null;
    this.currentActions = [];
  }

  /**
   * If a player's stack decreased meaningfully but no voluntary preflop action
   * was recorded for them, infer a VPIP action (call or bet).
   * This is the safety net for when OCR misses the bet amount appearing.
   */
  private inferMissingActions(hand: HandRecord): void {
    for (const player of hand.players) {
      const stackChange = player.startingStack - player.finalStack;

      // Only infer if stack decreased by more than the big blind
      // (SB/BB lose their blind naturally — only flag if they lost MORE)
      if (stackChange <= this.bigBlind * 1.5) continue;

      // Check if we already have a voluntary preflop action for this player
      const hasVoluntaryAction = hand.actions.some(a =>
        a.seatIndex === player.seatIndex &&
        a.street === 'preflop' &&
        (a.action === 'call' || a.action === 'raise' || a.action === 'bet' || a.action === 'all_in')
      );

      if (!hasVoluntaryAction) {
        console.log(`[HandTracker] Inferred VPIP for seat ${player.seatIndex}: stack dropped $${stackChange.toFixed(2)} but no action recorded`);
        hand.actions.push({
          seatIndex: player.seatIndex,
          playerName: player.playerName,
          action: stackChange > this.bigBlind * 3 ? 'raise' : 'call',
          amount: stackChange,
          street: 'preflop',
          order: 900 + player.seatIndex, // high order so it doesn't mess up sequencing
        });
      }
    }
  }

  /**
   * Infer folds: any player with no preflop action recorded is assumed to have folded.
   */
  private inferFolds(hand: HandRecord): void {
    for (const player of hand.players) {
      const hasAnyAction = hand.actions.some(a =>
        a.seatIndex === player.seatIndex && a.street === 'preflop'
      );
      if (!hasAnyAction) {
        hand.actions.push({
          seatIndex: player.seatIndex,
          playerName: player.playerName,
          action: 'fold',
          amount: 0,
          street: 'preflop',
          order: 800 + player.seatIndex,
        });
      }
    }
  }

  /**
   * Add any newly-detected players to the hand. Called on first 5 frames
   * so that OCR failures on a single frame don't cause empty player lists.
   */
  private addNewPlayers(snapshot: TableOCRSnapshot): void {
    if (!this.currentHand) return;
    if (!this.currentHand.players) this.currentHand.players = [];

    let added = 0;
    for (const seatData of snapshot.seats) {
      // Skip if already tracked
      if (this.currentHand.players.some(p => p.seatIndex === seatData.seatIndex)) continue;

      const stack = this.fixAmount(parseAmount(seatData.chipStack));
      if (stack <= 0) continue; // need a positive stack to be "occupied"

      this.stackHistory.set(seatData.seatIndex, [stack]);
      this.currentHand.players.push({
        seatIndex: seatData.seatIndex,
        playerName: seatData.playerName || `Seat ${seatData.seatIndex + 1}`,
        holeCards: null,
        startingStack: stack,
        finalStack: stack,
        isWinner: false,
      });
      added++;
    }

    if (added > 0) {
      this.currentHand.numSeats = this.currentHand.players.length;
      console.log(`[HandTracker] Frame ${this.framesInHand}: added ${added} players, total=${this.currentHand.players.length}: ${this.currentHand.players.map(p => `seat${p.seatIndex}($${p.startingStack.toFixed(2)})`).join(', ')}`);
    }
  }

  /**
   * Detect hero by finding which seat has visible hole cards.
   * On Ignition, only the hero's cards are face-up (opponents show card backs).
   */
  private detectHeroSeat(snapshot: TableOCRSnapshot): void {
    for (const seatData of snapshot.seats) {
      if (seatData.cards) {
        const cards = parseCards(seatData.cards);
        // Valid hole cards: exactly 2 cards with real values (not card backs)
        if (cards.length === 2 && cards.every(c => c.length >= 2)) {
          if (this.heroSeatIndex !== seatData.seatIndex) {
            console.log(`[HandTracker] Hero detected at seat ${seatData.seatIndex} (cards: ${cards.join(', ')})`);
            this.heroSeatIndex = seatData.seatIndex;
          }
          return;
        }
      }
    }
    // Fallback: seat 0 = bottom center = hero on Ignition
  }

  /** @deprecated Use addNewPlayers instead */
  initializePlayers(snapshot: TableOCRSnapshot): void {
    this.addNewPlayers(snapshot);
  }

  getHandCount(): number {
    return this.handCount;
  }

  getHeroSeat(): number {
    return this.heroSeatIndex;
  }

  isInHand(): boolean {
    return this.currentHand !== null;
  }
}
