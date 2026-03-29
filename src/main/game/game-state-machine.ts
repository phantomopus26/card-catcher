import { EventEmitter } from 'events';
import { GamePhase, Street } from '../../shared/types';
import { parseAmount } from '../ocr/text-parser';

/**
 * Tracks poker hand lifecycle using pot amount changes.
 *
 * Community card OCR is unreliable on Ignition (cards are graphical images,
 * not text), so we detect hand phases purely from pot changes:
 *
 *   idle → preflop:  pot goes from 0 to >0 (blinds posted)
 *   preflop → flop:  pot increases significantly (preflop betting round complete)
 *   in-hand → idle:  pot drops to 0 (hand ended, chips collected)
 *
 * We don't try to distinguish flop/turn/river since the community card OCR
 * can't reliably count cards. Instead we use 'preflop' for the first street
 * and 'flop' as a catch-all for all postflop action.
 */
export class GameStateMachine extends EventEmitter {
  private phase: GamePhase = 'idle';
  private lastPot = 0;
  private potZeroFrames = 0;
  private potPositiveFrames = 0;
  private handPotPeak = 0;
  private framesInHand = 0;

  getPhase(): GamePhase {
    return this.phase;
  }

  getStreet(): Street | null {
    if (this.phase === 'idle' || this.phase === 'showdown') return null;
    return this.phase as Street;
  }

  /**
   * Feed a new OCR frame. Returns true if phase changed.
   */
  update(_communityCardsText: string, potText: string): boolean {
    // Extract pot amount — handle "Total pot: $X.XX" and plain "$X.XX"
    const pot = parseAmount(potText);

    if (this.phase === 'idle') {
      // Waiting for a hand to start: pot goes from 0 to >0
      if (pot > 0) {
        this.potPositiveFrames++;
        console.log(`[GSM] idle: pot=$${pot} (positive frame ${this.potPositiveFrames}/2)`);
        // Require 2 consecutive frames with pot > 0 to confirm hand start
        if (this.potPositiveFrames >= 2) {
          this.handPotPeak = pot;
          this.potZeroFrames = 0;
          this.potPositiveFrames = 0;
          this.framesInHand = 0;
          return this.transitionTo('preflop');
        }
      } else {
        this.potPositiveFrames = 0;
      }
    } else {
      // In a hand
      this.framesInHand++;

      if (pot > 0) {
        // Pot-drop heuristic: if pot was large and suddenly drops to a small value
        // (e.g. peak was $5.50 and now reads $0.35), the hand ended and new blinds posted.
        // Only trigger after we've been in the hand for at least 3 frames (9 seconds).
        if (this.framesInHand >= 3 && this.handPotPeak > 0 && pot < this.handPotPeak * 0.25 && pot < this.lastPot * 0.4) {
          console.log(`[GSM] Pot drop detected: peak=$${this.handPotPeak}, last=$${this.lastPot}, now=$${pot} → hand end + new hand`);
          // End current hand, then start new one
          this.handPotPeak = 0;
          this.potZeroFrames = 0;
          this.potPositiveFrames = 0;
          this.framesInHand = 0;
          this.transitionTo('idle');
          // Immediately start tracking the new hand (pot is already positive)
          this.potPositiveFrames = 1;
          this.lastPot = pot;
          return true;
        }

        this.potZeroFrames = 0;
        if (pot > this.handPotPeak) {
          this.handPotPeak = pot;
        }
      } else {
        // Pot reads 0 — might be OCR noise or hand ending
        this.potZeroFrames++;
        console.log(`[GSM] in-hand: pot=0 (zero frame ${this.potZeroFrames}/2, peak=$${this.handPotPeak})`);
        // Require 2 consecutive zero-pot frames to confirm hand end
        // (reduced from 3 — at 3s capture, 3 frames = 9s which is too long)
        if (this.potZeroFrames >= 2) {
          console.log(`[GSM] Hand end confirmed: peak was $${this.handPotPeak}, ${this.framesInHand} frames in hand`);
          this.handPotPeak = 0;
          this.potZeroFrames = 0;
          this.potPositiveFrames = 0;
          this.framesInHand = 0;
          return this.transitionTo('idle');
        }
      }
    }

    this.lastPot = pot;
    return false;
  }

  reset(): void {
    this.phase = 'idle';
    this.lastPot = 0;
    this.potZeroFrames = 0;
    this.potPositiveFrames = 0;
    this.handPotPeak = 0;
    this.framesInHand = 0;
    this.emit('phase-change', 'idle');
  }

  private transitionTo(newPhase: GamePhase): boolean {
    const oldPhase = this.phase;
    this.phase = newPhase;
    console.log(`[GSM] Phase: ${oldPhase} → ${newPhase}`);

    this.emit('phase-change', newPhase, oldPhase);

    if (oldPhase === 'idle' && newPhase === 'preflop') {
      console.log(`[GSM] >>> HAND START`);
      this.emit('hand-start');
    }
    if (newPhase === 'idle' && oldPhase !== 'idle') {
      console.log(`[GSM] >>> HAND END`);
      this.emit('hand-end');
    }

    return true;
  }
}
