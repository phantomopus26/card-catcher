import { EventEmitter } from 'events';
import { HandRecord, PlayerStats } from '../../shared/types';

/**
 * Central stats engine that receives hand-complete events
 * and coordinates stat updates + database persistence.
 */
export class StatsEngine extends EventEmitter {
  private handHistory: HandRecord[] = [];

  /**
   * Process a completed hand.
   * The actual stat calculation is done by SessionStats per table.
   * This engine handles cross-table aggregation and persistence.
   */
  processHand(hand: HandRecord): void {
    this.handHistory.push(hand);
    this.emit('hand-processed', hand);

    // Keep memory bounded — only store last 10000 hands in memory
    if (this.handHistory.length > 10000) {
      this.handHistory = this.handHistory.slice(-5000);
    }
  }

  /**
   * Get total hands tracked this session.
   */
  getTotalHands(): number {
    return this.handHistory.length;
  }

  /**
   * Get hands for a specific table.
   */
  getHandsForTable(tableId: string): HandRecord[] {
    return this.handHistory.filter(h => h.tableId === tableId);
  }

  /**
   * Get recent hands (last N).
   */
  getRecentHands(count: number = 50): HandRecord[] {
    return this.handHistory.slice(-count);
  }
}
