import { PlayerStats, PlayerAction, HandRecord } from '../../shared/types';

// ============ Types ============

export interface BotScore {
  score: number;               // 0-100 composite score
  reasons: string[];           // human-readable reasons
  classification: 'normal' | 'suspicious' | 'likely_bot';
}

interface BetSizingRecord {
  betAmount: number;
  potAtTime: number;
  ratio: number;   // bet / pot
}

interface BotAnalysis {
  seatIndex: number;

  // Timing: count of hands where the player acted on every captured frame
  consecutiveActionFrames: number;
  totalFramesTracked: number;

  // Bet sizing: ratios of bet-to-pot
  betSizings: BetSizingRecord[];

  // Session continuity: hands played without a gap (sitting out)
  handsWithoutBreak: number;
  lastHandTimestamp: number;

  // Cached per-hand action counts (for timing heuristic)
  actionsPerHand: number[];
}

// ============ Constants ============

const WEIGHTS = {
  timingConsistency: 0.25,
  vpipPfrPrecision: 0.20,
  betSizingConsistency: 0.20,
  sessionLength: 0.15,
  foldTo3BetConsistency: 0.10,
  multiTabling: 0.10,
} as const;

const THRESHOLDS = {
  normal: 30,
  suspicious: 60,
} as const;

// GTO-ish VPIP/PFR ranges that bots tend to cluster around
const GTO_VPIP_RANGE = { low: 22, high: 24 };
const GTO_PFR_RANGE = { low: 17, high: 19 };
const GTO_FOLD_TO_3BET_RANGE = { low: 55, high: 65 };

// Minimum sample sizes before indicators kick in
const MIN_HANDS_VPIP_PFR = 50;
const MIN_HANDS_FOLD_3BET = 30;
const MIN_BET_SIZINGS = 10;
const MIN_HANDS_TIMING = 10;
const SESSION_LENGTH_THRESHOLD = 200;

// ============ BotDetector ============

export class BotDetector {
  private playerData: Map<number, BotAnalysis> = new Map();

  /**
   * Called after each hand completes to update bot analysis for a player.
   */
  analyzePlayer(
    seatIndex: number,
    stats: PlayerStats,
    hand: HandRecord,
  ): BotScore {
    let analysis = this.playerData.get(seatIndex);
    if (!analysis) {
      analysis = this.createAnalysis(seatIndex);
      this.playerData.set(seatIndex, analysis);
    }

    // Update tracking data from this hand
    this.updateFromHand(analysis, seatIndex, hand);

    // Calculate individual indicator scores
    const timingScore = this.calcTimingScore(analysis);
    const vpipPfrScore = this.calcVpipPfrPrecisionScore(stats);
    const betSizingScore = this.calcBetSizingScore(analysis);
    const sessionScore = this.calcSessionLengthScore(analysis);
    const fold3BetScore = this.calcFoldTo3BetScore(stats);
    // Multi-tabling: skip for anonymous sites (Ignition/Bovada)
    const multiTableScore = 0;

    // Weighted composite
    const score = Math.round(
      timingScore * WEIGHTS.timingConsistency +
      vpipPfrScore * WEIGHTS.vpipPfrPrecision +
      betSizingScore * WEIGHTS.betSizingConsistency +
      sessionScore * WEIGHTS.sessionLength +
      fold3BetScore * WEIGHTS.foldTo3BetConsistency +
      multiTableScore * WEIGHTS.multiTabling
    );

    // Build reasons list
    const reasons: string[] = [];
    if (timingScore > 50) reasons.push(`Mechanical timing pattern (${timingScore})`);
    if (vpipPfrScore > 50) reasons.push(`GTO-precise VPIP/PFR (${stats.vpip}/${stats.pfr})`);
    if (betSizingScore > 50) reasons.push(`Repetitive bet sizing (${betSizingScore})`);
    if (sessionScore > 50) reasons.push(`${analysis.handsWithoutBreak} hands without break`);
    if (fold3BetScore > 50) reasons.push(`GTO fold-to-3bet (${stats.foldTo3Bet}%)`);

    const classification =
      score > THRESHOLDS.suspicious ? 'likely_bot' :
      score > THRESHOLDS.normal ? 'suspicious' :
      'normal';

    return { score, reasons, classification };
  }

  /**
   * Get current bot scores for all tracked players.
   */
  getAllScores(): Map<number, BotScore> {
    // This returns the latest cached results — actual scores
    // are computed in analyzePlayer() which is called per-hand.
    // For a simple "get all" we'd need cached scores, so we store them.
    return this.cachedScores;
  }

  /** Cache of last-computed scores per seat */
  private cachedScores: Map<number, BotScore> = new Map();

  /**
   * Convenience: run analysis and cache the result.
   */
  analyzeAndCache(
    seatIndex: number,
    stats: PlayerStats,
    hand: HandRecord,
  ): BotScore {
    const score = this.analyzePlayer(seatIndex, stats, hand);
    this.cachedScores.set(seatIndex, score);
    return score;
  }

  /**
   * Reset data for a seat (when player leaves).
   */
  resetSeat(seatIndex: number): void {
    this.playerData.delete(seatIndex);
    this.cachedScores.delete(seatIndex);
  }

  // ============ Private: Update tracking from hand ============

  private updateFromHand(analysis: BotAnalysis, seatIndex: number, hand: HandRecord): void {
    const playerActions = hand.actions.filter(a => a.seatIndex === seatIndex);

    // Track actions-per-hand for timing heuristic
    analysis.actionsPerHand.push(playerActions.length);

    // Track bet sizings (bet/raise amounts relative to pot)
    this.trackBetSizings(analysis, playerActions, hand);

    // Session continuity: check if there was a gap
    const now = hand.timestamp;
    // If more than 10 minutes since last hand, consider it a break
    if (analysis.lastHandTimestamp > 0 &&
        (now - analysis.lastHandTimestamp) > 10 * 60 * 1000) {
      analysis.handsWithoutBreak = 1;
    } else {
      analysis.handsWithoutBreak++;
    }
    analysis.lastHandTimestamp = now;

    // Timing: count consecutive frames with actions
    // Since we capture every ~3s, a player who acts on every single hand
    // without sitting out is suspicious. We approximate by checking if
    // the player had actions in every hand.
    analysis.totalFramesTracked++;
    if (playerActions.length > 0) {
      analysis.consecutiveActionFrames++;
    }
  }

  private trackBetSizings(
    analysis: BotAnalysis,
    actions: PlayerAction[],
    hand: HandRecord,
  ): void {
    for (const action of actions) {
      if ((action.action === 'bet' || action.action === 'raise') && action.amount > 0) {
        // Estimate pot at time of action: use total pot as rough proxy
        // (precise pot tracking would require replaying the hand)
        const potEstimate = hand.potTotal > 0 ? hand.potTotal : 1;
        const ratio = action.amount / potEstimate;

        // Only track reasonable ratios (0.1x to 5x pot)
        if (ratio >= 0.1 && ratio <= 5.0) {
          analysis.betSizings.push({
            betAmount: action.amount,
            potAtTime: potEstimate,
            ratio,
          });

          // Keep last 100 sizings to avoid memory growth
          if (analysis.betSizings.length > 100) {
            analysis.betSizings.shift();
          }
        }
      }
    }
  }

  // ============ Private: Indicator scoring ============

  /**
   * Timing consistency: if a player acts in nearly every hand (never sits out),
   * that suggests automated play. Score based on action participation rate.
   */
  private calcTimingScore(analysis: BotAnalysis): number {
    if (analysis.totalFramesTracked < MIN_HANDS_TIMING) return 0;

    const participationRate = analysis.consecutiveActionFrames / analysis.totalFramesTracked;

    // Also check consistency of actions-per-hand
    // Bots tend to have very consistent action counts
    if (analysis.actionsPerHand.length >= MIN_HANDS_TIMING) {
      const mean = analysis.actionsPerHand.reduce((a, b) => a + b, 0) / analysis.actionsPerHand.length;
      const variance = analysis.actionsPerHand.reduce((sum, v) => sum + (v - mean) ** 2, 0) / analysis.actionsPerHand.length;
      const stdDev = Math.sqrt(variance);

      // Very low variance in action counts is suspicious
      // Combined with high participation
      if (stdDev < 0.5 && participationRate > 0.95) return 90;
      if (stdDev < 0.8 && participationRate > 0.90) return 60;
      if (participationRate > 0.95) return 40;
    }

    // Participation alone: playing every hand without sitting out
    if (participationRate > 0.98) return 50;
    if (participationRate > 0.90) return 25;
    return 0;
  }

  /**
   * VPIP/PFR precision: bots often converge to exact GTO frequencies.
   * Humans are messier — their stats fluctuate more.
   */
  private calcVpipPfrPrecisionScore(stats: PlayerStats): number {
    if (stats.handsPlayed < MIN_HANDS_VPIP_PFR) return 0;

    let score = 0;

    // Check if VPIP is in the suspicious GTO range
    if (stats.vpip >= GTO_VPIP_RANGE.low && stats.vpip <= GTO_VPIP_RANGE.high) {
      score += 50;
    }

    // Check if PFR is in the suspicious GTO range
    if (stats.pfr >= GTO_PFR_RANGE.low && stats.pfr <= GTO_PFR_RANGE.high) {
      score += 50;
    }

    // If both VPIP and PFR are in GTO range, that's very suspicious
    // Already would be 100 from above, but clamp
    return Math.min(score, 100);
  }

  /**
   * Bet sizing consistency: bots often use the same pot-ratio every time.
   * Humans vary their sizing more naturally.
   */
  private calcBetSizingScore(analysis: BotAnalysis): number {
    if (analysis.betSizings.length < MIN_BET_SIZINGS) return 0;

    const ratios = analysis.betSizings.map(b => b.ratio);

    // Bucket ratios into 5% increments and find the most common bucket
    const buckets = new Map<number, number>();
    for (const ratio of ratios) {
      const bucket = Math.round(ratio * 20) / 20; // round to nearest 0.05
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }

    // Find the most common bucket
    let maxCount = 0;
    for (const count of buckets.values()) {
      if (count > maxCount) maxCount = count;
    }

    const dominanceRatio = maxCount / ratios.length;

    // If >80% of bets use the same sizing, very suspicious
    if (dominanceRatio > 0.90) return 100;
    if (dominanceRatio > 0.80) return 80;
    if (dominanceRatio > 0.70) return 50;
    if (dominanceRatio > 0.60) return 25;
    return 0;
  }

  /**
   * Session length: bots play continuously for hundreds of hands.
   * Humans take breaks, check their phone, etc.
   */
  private calcSessionLengthScore(analysis: BotAnalysis): number {
    const hands = analysis.handsWithoutBreak;

    if (hands > 500) return 100;
    if (hands > SESSION_LENGTH_THRESHOLD) {
      // Linear scale from 200 to 500 hands -> 30 to 100
      return Math.round(30 + (hands - SESSION_LENGTH_THRESHOLD) / (500 - SESSION_LENGTH_THRESHOLD) * 70);
    }
    if (hands > 100) return 15;
    return 0;
  }

  /**
   * Fold-to-3bet consistency: bots converge to optimal 55-65% fold-to-3bet.
   */
  private calcFoldTo3BetScore(stats: PlayerStats): number {
    if (stats.handsPlayed < MIN_HANDS_FOLD_3BET) return 0;
    // Need enough 3-bet situations to be meaningful
    // foldTo3Bet is 0 if no samples, so only flag if hands > threshold
    if (stats.foldTo3Bet === 0 && stats.handsPlayed < 100) return 0;

    if (stats.foldTo3Bet >= GTO_FOLD_TO_3BET_RANGE.low &&
        stats.foldTo3Bet <= GTO_FOLD_TO_3BET_RANGE.high) {
      // Dead-on GTO range
      return 80;
    }

    // Close to GTO (within 5% either side)
    if (stats.foldTo3Bet >= GTO_FOLD_TO_3BET_RANGE.low - 5 &&
        stats.foldTo3Bet <= GTO_FOLD_TO_3BET_RANGE.high + 5) {
      return 40;
    }

    return 0;
  }

  // ============ Private: Factory ============

  private createAnalysis(seatIndex: number): BotAnalysis {
    return {
      seatIndex,
      consecutiveActionFrames: 0,
      totalFramesTracked: 0,
      betSizings: [],
      handsWithoutBreak: 0,
      lastHandTimestamp: 0,
      actionsPerHand: [],
    };
  }
}
