// ============ Window Detection ============

export interface WindowInfo {
  hwnd: number;
  title: string;
  bounds: WindowBounds;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============ Table & Seats ============

export type TableFormat = '6max' | '9max' | 'headsup';

export interface TableInfo {
  id: string;           // unique key: hwnd or generated
  hwnd: number;
  title: string;
  bounds: WindowBounds;
  format: TableFormat;
  site: string;         // 'ignition', 'bovada', etc.
}

export interface SeatInfo {
  seatIndex: number;
  playerName: string;
  chipStack: number;
  isActive: boolean;
  isDealer: boolean;
  holeCards: string[] | null;  // e.g. ["Ah", "Kd"]
}

// ============ Game State ============

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type GamePhase = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in' | 'post_blind';

export interface PlayerAction {
  seatIndex: number;
  playerName: string;
  action: ActionType;
  amount: number;
  street: Street;
  order: number;
}

export interface HandRecord {
  id?: number;
  tableId: string;
  site: string;
  timestamp: number;
  numSeats: number;
  dealerSeat: number;
  potTotal: number;
  communityCards: string[];
  heroCards: string[] | null;
  wentToShowdown: boolean;
  players: HandPlayer[];
  actions: PlayerAction[];
}

export interface HandPlayer {
  seatIndex: number;
  playerName: string;
  holeCards: string[] | null;
  startingStack: number;
  finalStack: number;
  isWinner: boolean;
}

// ============ OCR ============

export interface ROIRect {
  x: number;      // percentage 0-1 of table width
  y: number;      // percentage 0-1 of table height
  width: number;
  height: number;
}

export interface SeatROI {
  seatIndex: number;
  playerName: ROIRect;
  chipStack: ROIRect;
  betAmount: ROIRect;
  cards: ROIRect;
  actionText: ROIRect;
}

export interface TableLayout {
  id: string;
  name: string;
  clientPattern: string;     // regex for window title
  seats: number;
  regions: {
    pot: ROIRect;
    communityCards: ROIRect;
    dealerButton: ROIRect;
    seats: SeatROI[];
  };
}

export interface OCRResult {
  text: string;
  confidence: number;
}

export interface TableOCRSnapshot {
  timestamp: number;
  pot: string;
  communityCards: string;
  seats: Array<{
    seatIndex: number;
    playerName: string;
    chipStack: string;
    betAmount: string;
    actionText: string;
    cards: string;
  }>;
}

// ============ Stats ============

export interface PlayerStats {
  playerName: string;
  seatIndex: number;
  handsPlayed: number;
  vpip: number;        // percentage 0-100
  pfr: number;         // percentage 0-100
  threeBet: number;    // percentage 0-100
  af: number;          // ratio (bets+raises)/calls
  foldTo3Bet: number;  // percentage 0-100
  foldToFlopCbet: number; // percentage 0-100
  foldTo4Bet: number;     // percentage 0-100
  botScore?: number;       // 0-100 composite bot likelihood
  botReasons?: string[];   // human-readable reasons for bot suspicion
}

export interface PnLPoint {
  timestamp: number;
  amount: number;  // cumulative PnL in dollars
}

export interface SessionInfo {
  startTime: number;
  stake: string;
  gameType: string;
  rebuys: number;
  duration: number;  // milliseconds
}

export interface HudUpdate {
  tableId: string;
  seats: PlayerStats[];
  handsPlayed: number;
  pnlHistory: PnLPoint[];
  heroSeatIndex: number;
  sessionInfo?: SessionInfo;
}

// ============ Events ============

export type TableEvent =
  | { type: 'table-found'; table: TableInfo }
  | { type: 'table-lost'; tableId: string }
  | { type: 'table-moved'; tableId: string; bounds: WindowBounds };

export type GameEvent =
  | { type: 'hand-start'; tableId: string; dealerSeat: number }
  | { type: 'hand-complete'; tableId: string; hand: HandRecord }
  | { type: 'action'; tableId: string; action: PlayerAction }
  | { type: 'street-change'; tableId: string; street: GamePhase };
