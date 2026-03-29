import { HandRecord, PlayerStats, PnLPoint, SessionInfo } from '../../shared/types';
import {
  StatAccumulator,
  AFAccumulator,
  didVPIP,
  didPFR,
  did3Bet,
  had3BetOpportunity,
  didFoldTo3Bet,
  faced3Bet,
  facedFlopCbet,
  foldToFlopCbet,
  faced4Bet,
  foldTo4Bet,
} from './stat-definitions';
import { BotDetector } from './bot-detector';

interface PlayerAccumulators {
  playerName: string;
  seatIndex: number;
  handsPlayed: number;
  vpip: StatAccumulator;
  pfr: StatAccumulator;
  threeBet: StatAccumulator;
  foldTo3Bet: StatAccumulator;
  foldToFlopCbet: StatAccumulator;
  foldTo4Bet: StatAccumulator;
  af: AFAccumulator;
}

/**
 * Maintains running stat accumulators for all players at a table session.
 */
export class SessionStats {
  // Key: seatIndex (for anonymous tables) or playerName
  private players: Map<string, PlayerAccumulators> = new Map();
  private pnlHistory: PnLPoint[] = [];
  private cumulativePnL = 0;
  private totalHands = 0;
  private heroSeatIndex = 0; // updated from hand-tracker's hero detection
  private botDetector: BotDetector = new BotDetector();

  // Session tracking
  private sessionStartTime: number = Date.now();
  private stake: string = '';
  private gameType: string = 'cash';
  private rebuys: number = 0;
  private lastHeroStack: number = 0; // for rebuy detection

  /**
   * Process a completed hand and update all player stats.
   */
  processHand(hand: HandRecord): void {
    this.totalHands++;

    for (const player of hand.players) {
      const key = this.getPlayerKey(player.seatIndex, player.playerName);
      let accum = this.players.get(key);

      if (!accum) {
        accum = this.createAccumulators(player.playerName, player.seatIndex);
        this.players.set(key, accum);
      }

      accum.handsPlayed++;

      // VPIP
      accum.vpip.add(didVPIP(hand, player.seatIndex));

      // PFR
      accum.pfr.add(didPFR(hand, player.seatIndex));

      // 3-Bet
      const had3BetOpp = had3BetOpportunity(hand, player.seatIndex);
      if (had3BetOpp) {
        accum.threeBet.add(did3Bet(hand, player.seatIndex));
      }

      // Fold to 3-Bet
      const faced = faced3Bet(hand, player.seatIndex);
      if (faced) {
        accum.foldTo3Bet.add(didFoldTo3Bet(hand, player.seatIndex));
      }

      // Fold to Flop C-Bet
      const facedCbet = facedFlopCbet(hand, player.seatIndex);
      if (facedCbet) {
        accum.foldToFlopCbet.add(foldToFlopCbet(hand, player.seatIndex));
      }

      // Fold to 4-Bet
      const faced4 = faced4Bet(hand, player.seatIndex);
      if (faced4) {
        accum.foldTo4Bet.add(foldTo4Bet(hand, player.seatIndex));
      }

      // Aggression Factor (postflop actions)
      for (const action of hand.actions) {
        if (action.seatIndex === player.seatIndex) {
          accum.af.addAction(action.action, action.street);
        }
      }

      // Bot detection: analyze after accumulating stats for this hand
      const currentStats = this.buildPlayerStats(accum);
      this.botDetector.analyzeAndCache(player.seatIndex, currentStats, hand);

      // Track hero PnL (uses detected hero seat, defaults to 0)
      if (player.seatIndex === this.heroSeatIndex) {
        // Rebuy detection: if hero's starting stack jumped UP significantly
        // compared to the previous hand's final stack, and the hero didn't
        // win the previous hand (stack increase without winning = rebuy).
        if (this.lastHeroStack > 0 && player.startingStack > this.lastHeroStack * 1.5) {
          this.rebuys++;
          console.log(`[SessionStats] Rebuy detected: lastStack=$${this.lastHeroStack.toFixed(2)} newStart=$${player.startingStack.toFixed(2)} rebuys=${this.rebuys}`);
        }

        const pnl = player.finalStack - player.startingStack;
        console.log(`[SessionStats] Hero PnL: seat=${player.seatIndex} start=$${player.startingStack.toFixed(2)} final=$${player.finalStack.toFixed(2)} handPnL=$${pnl.toFixed(2)} cumulative=$${(this.cumulativePnL + pnl).toFixed(2)}`);
        this.cumulativePnL += pnl;
        this.pnlHistory.push({
          timestamp: hand.timestamp,
          amount: Math.round(this.cumulativePnL * 100) / 100,
        });
        this.lastHeroStack = player.finalStack;
      }
    }
  }

  /**
   * Get stats for all tracked players (includes bot scores).
   */
  getAllStats(): PlayerStats[] {
    const stats: PlayerStats[] = [];
    const botScores = this.botDetector.getAllScores();

    for (const accum of this.players.values()) {
      const ps = this.buildPlayerStats(accum);
      const botResult = botScores.get(accum.seatIndex);
      if (botResult) {
        ps.botScore = botResult.score;
        ps.botReasons = botResult.reasons;
      }
      stats.push(ps);
    }

    return stats;
  }

  setHeroSeat(seatIndex: number): void {
    if (seatIndex !== this.heroSeatIndex) {
      console.log(`[SessionStats] Hero seat changed: ${this.heroSeatIndex} → ${seatIndex}`);
      this.heroSeatIndex = seatIndex;
    }
  }

  getHeroSeat(): number {
    return this.heroSeatIndex;
  }

  getTotalHands(): number {
    return this.totalHands;
  }

  getPnLHistory(): PnLPoint[] {
    return this.pnlHistory;
  }

  /**
   * Get stats for a specific player by seat index.
   */
  getStatsBySeat(seatIndex: number): PlayerStats | null {
    for (const accum of this.players.values()) {
      if (accum.seatIndex === seatIndex) {
        const ps = this.buildPlayerStats(accum);
        const botResult = this.botDetector.getAllScores().get(seatIndex);
        if (botResult) {
          ps.botScore = botResult.score;
          ps.botReasons = botResult.reasons;
        }
        return ps;
      }
    }
    return null;
  }

  /**
   * Reset stats for a specific seat (e.g., when player leaves).
   */
  resetSeat(seatIndex: number): void {
    for (const [key, accum] of this.players) {
      if (accum.seatIndex === seatIndex) {
        this.players.delete(key);
        break;
      }
    }
    this.botDetector.resetSeat(seatIndex);
  }

  /**
   * Build a PlayerStats object from accumulators (without bot scores).
   */
  private buildPlayerStats(accum: PlayerAccumulators): PlayerStats {
    return {
      playerName: accum.playerName,
      seatIndex: accum.seatIndex,
      handsPlayed: accum.handsPlayed,
      vpip: Math.round(accum.vpip.getValue()),
      pfr: Math.round(accum.pfr.getValue()),
      threeBet: Math.round(accum.threeBet.getValue()),
      af: Math.round(accum.af.getValue() * 10) / 10,
      foldTo3Bet: Math.round(accum.foldTo3Bet.getValue()),
      foldToFlopCbet: Math.round(accum.foldToFlopCbet.getValue()),
      foldTo4Bet: Math.round(accum.foldTo4Bet.getValue()),
    };
  }

  private getPlayerKey(seatIndex: number, playerName: string): string {
    // For anonymous tables (Ignition), key by seat index
    // For named tables, key by player name
    if (!playerName || playerName.startsWith('Player') || playerName.startsWith('Seat')) {
      return `seat-${seatIndex}`;
    }
    return `name-${playerName}`;
  }

  // ============ Session tracking ============

  setStake(stake: string): void {
    this.stake = stake;
  }

  setGameType(gameType: string): void {
    this.gameType = gameType;
  }

  getSessionInfo(): SessionInfo {
    return {
      startTime: this.sessionStartTime,
      stake: this.stake,
      gameType: this.gameType,
      rebuys: this.rebuys,
      duration: Date.now() - this.sessionStartTime,
    };
  }

  private createAccumulators(playerName: string, seatIndex: number): PlayerAccumulators {
    return {
      playerName,
      seatIndex,
      handsPlayed: 0,
      vpip: new StatAccumulator(),
      pfr: new StatAccumulator(),
      threeBet: new StatAccumulator(),
      foldTo3Bet: new StatAccumulator(),
      foldToFlopCbet: new StatAccumulator(),
      foldTo4Bet: new StatAccumulator(),
      af: new AFAccumulator(),
    };
  }
}
