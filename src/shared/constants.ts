export const CAPTURE_INTERVAL_MS = 3000;     // ~0.3 FPS per table — gentle on CPU
export const WINDOW_POLL_INTERVAL_MS = 3000;  // check for new/moved windows
export const OCR_DEBOUNCE_FRAMES = 2;         // confirm state change over N frames
export const MAX_TESSERACT_WORKERS = 2;

// Patterns that MUST match for a window to be considered a poker table
export const POKER_WINDOW_PATTERNS = [
  /\$[\d.]+\/\$[\d.]+/,           // "$0.25/$0.50" — blind levels in title
  /hold'?em/i,
  /no\s*limit/i,
  /pot\s*limit/i,
  /omaha/i,
  /table\s*\d+/i,
];

// Patterns to EXCLUDE even if they match above
export const POKER_WINDOW_EXCLUDE = [
  /lobby/i,
  /drivehud/i,
  /card\s*catcher/i,
];

export const ACTION_VOCABULARY = [
  'fold', 'check', 'call', 'bet', 'raise', 'all-in', 'all in',
  'folds', 'checks', 'calls', 'bets', 'raises',
  'post', 'posts', 'sit out', 'sitting out',
] as const;

export const STAT_RANGES = {
  vpip: { tight: [0, 20], average: [20, 30], loose: [30, 100] },
  pfr: { tight: [0, 15], average: [15, 22], loose: [22, 100] },
  threeBet: { low: [0, 5], average: [5, 10], high: [10, 100] },
  af: { passive: [0, 1.5], average: [1.5, 3], aggressive: [3, 100] },
  foldTo3Bet: { low: [0, 50], average: [50, 65], high: [65, 100] },
  foldToFlopCbet: { low: [0, 40], average: [40, 55], high: [55, 100] },
  foldTo4Bet: { low: [0, 40], average: [40, 60], high: [60, 100] },
} as const;

// OCR character whitelists per ROI type
export const OCR_WHITELISTS = {
  playerName: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_ .',
  amount: '0123456789$,.',
  pot: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$,.: ',
  action: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /-',
  cards: '23456789TJQKAshdc♠♥♦♣',
} as const;
