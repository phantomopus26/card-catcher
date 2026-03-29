import { HandRecord, PlayerAction, ActionType } from '../../shared/types';

/**
 * Accumulator for a single stat, tracking numerator/denominator.
 */
export class StatAccumulator {
  numerator = 0;
  denominator = 0;

  add(hit: boolean, opportunity: boolean = true): void {
    if (opportunity) this.denominator++;
    if (hit) this.numerator++;
  }

  getValue(): number {
    if (this.denominator === 0) return 0;
    return (this.numerator / this.denominator) * 100;
  }

  getRatio(): number {
    if (this.denominator === 0) return 0;
    return this.numerator / this.denominator;
  }
}

/**
 * Aggression Factor accumulator: (bets + raises) / calls
 */
export class AFAccumulator {
  aggressiveActions = 0; // bets + raises
  passiveActions = 0;    // calls

  addAction(action: ActionType, street: string): void {
    // AF is postflop only
    if (street === 'preflop') return;

    if (action === 'bet' || action === 'raise') {
      this.aggressiveActions++;
    } else if (action === 'call') {
      this.passiveActions++;
    }
  }

  getValue(): number {
    if (this.passiveActions === 0) {
      return this.aggressiveActions > 0 ? 99 : 0; // "infinity" capped
    }
    return this.aggressiveActions / this.passiveActions;
  }
}

// ============ Helper functions for hand analysis ============

/**
 * Get all preflop actions for a specific seat in a hand.
 */
export function getPreflopActions(hand: HandRecord, seatIndex: number): PlayerAction[] {
  return hand.actions.filter(a => a.seatIndex === seatIndex && a.street === 'preflop');
}

/**
 * Did the player voluntarily put money in the pot preflop?
 * (Called or raised — posting blinds doesn't count)
 */
export function didVPIP(hand: HandRecord, seatIndex: number): boolean {
  const actions = getPreflopActions(hand, seatIndex);
  return actions.some(a =>
    a.action === 'call' || a.action === 'raise' || a.action === 'bet' || a.action === 'all_in'
  );
}

/**
 * Did the player raise preflop?
 */
export function didPFR(hand: HandRecord, seatIndex: number): boolean {
  const actions = getPreflopActions(hand, seatIndex);
  return actions.some(a => a.action === 'raise' || a.action === 'all_in');
}

/**
 * Did the player 3-bet preflop?
 * A 3-bet is a re-raise of an initial raise.
 */
export function did3Bet(hand: HandRecord, seatIndex: number): boolean {
  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let raiseCount = 0;

  for (const action of preflopActions) {
    if (action.action === 'raise' || action.action === 'all_in') {
      raiseCount++;
      // The second raise (3-bet) by our player
      if (raiseCount >= 2 && action.seatIndex === seatIndex) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Did the player have the opportunity to 3-bet?
 * (Faced a single raise preflop and action reached them)
 */
export function had3BetOpportunity(hand: HandRecord, seatIndex: number): boolean {
  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let raiseCount = 0;
  let facedRaise = false;

  for (const action of preflopActions) {
    if (action.action === 'raise') {
      raiseCount++;
      if (raiseCount === 1) {
        facedRaise = true;
      }
    }
    // If our player acts after the first raise, they had the opportunity
    if (facedRaise && action.seatIndex === seatIndex && raiseCount === 1) {
      return true;
    }
  }
  return false;
}

/**
 * Did the player fold to a 3-bet?
 */
export function didFoldTo3Bet(hand: HandRecord, seatIndex: number): boolean {
  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let raiseCount = 0;
  let playerRaised = false;

  for (const action of preflopActions) {
    if (action.action === 'raise') {
      raiseCount++;
      if (action.seatIndex === seatIndex) {
        playerRaised = true;
      }
    }
    // If player raised, then faced a 3-bet, and folded
    if (playerRaised && raiseCount >= 2 && action.seatIndex === seatIndex && action.action === 'fold') {
      return true;
    }
  }
  return false;
}

/**
 * Did the player face a 3-bet?
 * (They raised, and someone re-raised)
 */
export function faced3Bet(hand: HandRecord, seatIndex: number): boolean {
  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let playerRaised = false;

  for (const action of preflopActions) {
    if (action.seatIndex === seatIndex && action.action === 'raise') {
      playerRaised = true;
    }
    if (playerRaised && action.seatIndex !== seatIndex && action.action === 'raise') {
      return true; // someone 3-bet us
    }
  }
  return false;
}

// ============ 4-Bet stats ============

/**
 * Did the player face a 4-bet?
 * A 4-bet is the 4th raise preflop (open, 3bet, 4bet).
 * The player must have 3-bet and then someone raised again.
 */
export function faced4Bet(hand: HandRecord, seatIndex: number): boolean {
  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let raiseCount = 0;
  let playerMadeThirdRaise = false;

  for (const action of preflopActions) {
    if (action.action === 'raise' || action.action === 'all_in') {
      raiseCount++;
      // Player made the 3-bet (2nd raise)
      if (raiseCount === 2 && action.seatIndex === seatIndex) {
        playerMadeThirdRaise = true;
      }
      // Someone else made the 4-bet (3rd raise) after player 3-bet
      if (raiseCount >= 3 && playerMadeThirdRaise && action.seatIndex !== seatIndex) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Did the player fold to a 4-bet?
 */
export function foldTo4Bet(hand: HandRecord, seatIndex: number): boolean {
  if (!faced4Bet(hand, seatIndex)) return false;

  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let raiseCount = 0;
  let sawFourBet = false;

  for (const action of preflopActions) {
    if (action.action === 'raise' || action.action === 'all_in') {
      raiseCount++;
      if (raiseCount >= 3) {
        sawFourBet = true;
      }
    }
    // Player folded after the 4-bet
    if (sawFourBet && action.seatIndex === seatIndex && action.action === 'fold') {
      return true;
    }
  }
  return false;
}

// ============ Flop Continuation Bet stats ============

/**
 * Identify the preflop raiser (the last player to raise preflop).
 * Returns seatIndex or -1 if no preflop raiser.
 */
function getPreflopRaiser(hand: HandRecord): number {
  const preflopActions = hand.actions.filter(a => a.street === 'preflop');
  let lastRaiserSeat = -1;

  for (const action of preflopActions) {
    if (action.action === 'raise' || action.action === 'all_in') {
      lastRaiserSeat = action.seatIndex;
    }
  }
  return lastRaiserSeat;
}

/**
 * Was there a flop continuation bet opportunity for the given player?
 * A cbet opportunity exists when:
 * 1. The player was the preflop raiser (last to raise preflop)
 * 2. Action reached the flop
 * 3. No one bet before the preflop raiser on the flop
 *
 * For facedFlopCbet: did the player face a cbet on the flop?
 * The player must NOT be the preflop raiser, and the preflop raiser
 * must have made the first bet on the flop before the player acted.
 */
export function facedFlopCbet(hand: HandRecord, seatIndex: number): boolean {
  const preflopRaiser = getPreflopRaiser(hand);
  if (preflopRaiser < 0) return false;       // no preflop raise
  if (preflopRaiser === seatIndex) return false; // player IS the raiser

  const flopActions = hand.actions.filter(a => a.street === 'flop');
  if (flopActions.length === 0) return false; // hand didn't reach flop

  // Check if preflop raiser made the first bet on the flop
  for (const action of flopActions) {
    if (action.action === 'bet' || action.action === 'raise' || action.action === 'all_in') {
      if (action.seatIndex === preflopRaiser) {
        // Cbet occurred — check if our player acted after it
        const cbetOrder = action.order;
        const playerActed = flopActions.some(a =>
          a.seatIndex === seatIndex && a.order > cbetOrder
        );
        return playerActed;
      }
      return false; // someone else bet first — not a cbet
    }
  }
  return false;
}

/**
 * Did the player fold to a flop continuation bet?
 */
export function foldToFlopCbet(hand: HandRecord, seatIndex: number): boolean {
  if (!facedFlopCbet(hand, seatIndex)) return false;

  const preflopRaiser = getPreflopRaiser(hand);
  const flopActions = hand.actions.filter(a => a.street === 'flop');

  let cbetHappened = false;
  for (const action of flopActions) {
    if (!cbetHappened && action.seatIndex === preflopRaiser &&
        (action.action === 'bet' || action.action === 'raise' || action.action === 'all_in')) {
      cbetHappened = true;
      continue;
    }
    if (cbetHappened && action.seatIndex === seatIndex && action.action === 'fold') {
      return true;
    }
  }
  return false;
}
