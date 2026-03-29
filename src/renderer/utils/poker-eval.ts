// ============================================================
// Poker Hand Evaluator & Monte Carlo Equity Calculator
// Runs entirely in the renderer process — no external APIs.
// ============================================================

const RANKS = '23456789TJQKA';
const SUITS = 'hdcs';

// --------------- helpers ---------------

function rankIndex(r: string): number {
  return RANKS.indexOf(r);
}

function cardToIndex(card: string): number {
  // card e.g. "Ah" -> rank=12, suit=0 -> index 12*4+0
  const r = rankIndex(card[0]);
  const s = SUITS.indexOf(card[1]);
  return r * 4 + s;
}

function indexToCard(i: number): string {
  return RANKS[Math.floor(i / 4)] + SUITS[i % 4];
}

function buildDeck(): number[] {
  const d: number[] = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

function shufflePartial(arr: number[], n: number): void {
  // Fisher-Yates partial shuffle — only need first n elements
  for (let i = 0; i < n && i < arr.length - 1; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// --------------- 5-card evaluator ---------------

interface HandRank {
  category: number; // 0=high card .. 8=straight flush
  ranks: number[];  // tie-break kickers, descending
}

function evaluate5(cards: number[]): HandRank {
  const rs = cards.map(c => Math.floor(c / 4)).sort((a, b) => b - a);
  const ss = cards.map(c => c % 4);

  const isFlush = ss.every(s => s === ss[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = -1;

  // Normal straight check
  if (rs[0] - rs[4] === 4 && new Set(rs).size === 5) {
    isStraight = true;
    straightHigh = rs[0];
  }
  // Wheel (A-2-3-4-5): ranks sorted desc would be [12, 3, 2, 1, 0]
  if (!isStraight && rs[0] === 12 && rs[1] === 3 && rs[2] === 2 && rs[3] === 1 && rs[4] === 0) {
    isStraight = true;
    straightHigh = 3; // 5-high straight
  }

  if (isStraight && isFlush) return { category: 8, ranks: [straightHigh] };

  // Count rank frequencies
  const freq = new Map<number, number>();
  for (const r of rs) freq.set(r, (freq.get(r) || 0) + 1);
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const pattern = groups.map(g => g[1]).join('');

  if (pattern === '41') return { category: 7, ranks: [groups[0][0], groups[1][0]] }; // four of a kind
  if (pattern === '32') return { category: 6, ranks: [groups[0][0], groups[1][0]] }; // full house
  if (isFlush) return { category: 5, ranks: rs };
  if (isStraight) return { category: 4, ranks: [straightHigh] };
  if (pattern === '311') return { category: 3, ranks: [groups[0][0], groups[1][0], groups[2][0]] }; // trips
  if (pattern === '221') return { category: 2, ranks: [groups[0][0], groups[1][0], groups[2][0]] }; // two pair
  if (pattern === '2111') return { category: 1, ranks: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] }; // one pair
  return { category: 0, ranks: rs }; // high card
}

function bestOf7(cards7: number[]): HandRank {
  let best: HandRank | null = null;
  // C(7,5) = 21 combos
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      // exclude cards i and j
      const five = cards7.filter((_, k) => k !== i && k !== j);
      const hr = evaluate5(five);
      if (!best || compareRanks(hr, best) > 0) best = hr;
    }
  }
  return best!;
}

function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.min(a.ranks.length, b.ranks.length); i++) {
    if (a.ranks[i] !== b.ranks[i]) return a.ranks[i] - b.ranks[i];
  }
  return 0;
}

// --------------- Public API: evaluateHand ---------------

/**
 * Evaluate a 5-7 card hand and return a numeric rank (higher = better).
 * Cards are strings like "Ah", "Kd", etc.
 */
export function evaluateHand(cards: string[]): number {
  const indices = cards.map(cardToIndex);
  let hr: HandRank;
  if (indices.length === 5) {
    hr = evaluate5(indices);
  } else if (indices.length === 6 || indices.length === 7) {
    hr = bestOf7(indices);
  } else {
    return 0;
  }
  // Encode as a single number: category * 10^10 + rank[0]*10^8 + rank[1]*10^6 ...
  let val = hr.category * 1e10;
  for (let i = 0; i < hr.ranks.length; i++) {
    val += hr.ranks[i] * Math.pow(100, 4 - i);
  }
  return val;
}

// --------------- Range Parsing ---------------

function allCombosOfRanks(r1: number, r2: number, suited: 'suited' | 'offsuit' | 'both'): string[][] {
  const combos: string[][] = [];
  if (r1 === r2) {
    // Pocket pair — all suit combos
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) {
        combos.push([RANKS[r1] + SUITS[s1], RANKS[r2] + SUITS[s2]]);
      }
    }
  } else {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = 0; s2 < 4; s2++) {
        const isSuited = s1 === s2;
        if (suited === 'suited' && !isSuited) continue;
        if (suited === 'offsuit' && isSuited) continue;
        combos.push([RANKS[r1] + SUITS[s1], RANKS[r2] + SUITS[s2]]);
      }
    }
  }
  return combos;
}

function parseRankChar(c: string): number {
  const i = RANKS.indexOf(c.toUpperCase());
  if (i < 0) throw new Error(`Invalid rank: ${c}`);
  return i;
}

/**
 * Parse a range string into an array of [card1, card2] combos.
 * Supports:
 *  - Specific hands: "AhKd"
 *  - Notations: "AKs", "AKo", "AK" (all combos)
 *  - Range+: "QQ+" means QQ,KK,AA  /  "ATs+" means ATs,AJs,AQs,AKs
 *  - Range dash: "22-55" means 22,33,44,55  /  "ATo-AKo"
 *  - Comma separated: "AKs,QQ+"
 */
export function parseRange(rangeStr: string): string[][] {
  const s = rangeStr.trim();
  if (!s) return []; // empty = random

  const combos: string[][] = [];
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    combos.push(...parseSingleRange(part));
  }

  return combos;
}

function parseSingleRange(part: string): string[][] {
  // Specific hand: "AhKd" (4 chars with suits)
  if (part.length === 4 && SUITS.includes(part[1]) && SUITS.includes(part[3])) {
    return [[part.slice(0, 2), part.slice(2, 4)]];
  }

  // Dash range: "22-55" or "ATo-AKo"
  if (part.includes('-')) {
    const [lo, hi] = part.split('-');
    return expandDashRange(lo.trim(), hi.trim());
  }

  // Plus range: "QQ+", "ATs+"
  if (part.endsWith('+')) {
    return expandPlusRange(part.slice(0, -1));
  }

  // Simple notation: "AKs", "AKo", "AK", "QQ"
  return expandSimple(part);
}

function parseSuitedness(s: string): 'suited' | 'offsuit' | 'both' {
  if (s.length >= 3) return s[2].toLowerCase() === 's' ? 'suited' : 'offsuit';
  return 'both';
}

function expandSimple(part: string): string[][] {
  if (part.length < 2) return [];
  const r1 = parseRankChar(part[0]);
  const r2 = parseRankChar(part[1]);
  const suitedness = parseSuitedness(part);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  return allCombosOfRanks(high, low, suitedness);
}

function expandPlusRange(base: string): string[][] {
  if (base.length < 2) return [];
  const r1 = parseRankChar(base[0]);
  const r2 = parseRankChar(base[1]);
  const suitedness = parseSuitedness(base);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);

  const combos: string[][] = [];
  if (high === low) {
    // Pair+: "QQ+" means QQ, KK, AA
    for (let r = low; r <= 12; r++) {
      combos.push(...allCombosOfRanks(r, r, 'both'));
    }
  } else {
    // e.g. "ATs+" with A=12, T=8 -> ATs, AJs, AQs, AKs
    for (let r = low; r < high; r++) {
      combos.push(...allCombosOfRanks(high, r, suitedness));
    }
  }
  return combos;
}

function expandDashRange(lo: string, hi: string): string[][] {
  const loR1 = parseRankChar(lo[0]);
  const loR2 = parseRankChar(lo[1]);
  const hiR1 = parseRankChar(hi[0]);
  const hiR2 = parseRankChar(hi[1]);
  const suitedness = parseSuitedness(lo);

  const combos: string[][] = [];

  if (loR1 === loR2 && hiR1 === hiR2) {
    // Pair range: "22-55"
    const start = Math.min(loR1, hiR1);
    const end = Math.max(loR1, hiR1);
    for (let r = start; r <= end; r++) {
      combos.push(...allCombosOfRanks(r, r, 'both'));
    }
  } else {
    // Non-pair range: "ATo-AKo" — the high card stays the same, low card varies
    const anchor = Math.max(loR1, hiR1);
    const startLow = Math.min(loR2, hiR2);
    const endLow = Math.max(loR2, hiR2);
    for (let r = startLow; r <= endLow; r++) {
      if (r === anchor) continue;
      combos.push(...allCombosOfRanks(anchor, r, suitedness));
    }
  }
  return combos;
}

// --------------- Equity Calculator ---------------

export interface EquityResult {
  equity1: number; // 0-100
  equity2: number; // 0-100
  ties: number;    // 0-100
}

function parseCards(boardStr: string): string[] {
  const trimmed = boardStr.trim();
  if (!trimmed) return [];
  // Split on spaces, or parse consecutive 2-char tokens
  if (trimmed.includes(' ')) {
    return trimmed.split(/\s+/).filter(Boolean);
  }
  const cards: string[] = [];
  for (let i = 0; i < trimmed.length; i += 2) {
    cards.push(trimmed.slice(i, i + 2));
  }
  return cards;
}

/**
 * Monte Carlo equity calculation.
 * range1/range2: range strings (or empty for random).
 * board: array of community card strings.
 * Returns equity percentages.
 */
export function calculateEquity(
  range1: string,
  range2: string,
  board: string[],
  iterations: number = 10000,
): EquityResult {
  const combos1 = parseRange(range1);
  const combos2 = parseRange(range2);
  const boardIndices = board.map(cardToIndex);
  const boardSet = new Set(boardIndices);

  let wins1 = 0;
  let wins2 = 0;
  let ties = 0;

  const deck = buildDeck();

  for (let iter = 0; iter < iterations; iter++) {
    // Pick hand for player 1
    let hand1: [number, number];
    if (combos1.length > 0) {
      const h = combos1[Math.floor(Math.random() * combos1.length)];
      hand1 = [cardToIndex(h[0]), cardToIndex(h[1])];
    } else {
      // Random hand — picked from remaining deck later
      hand1 = [-1, -1];
    }

    // Check for conflicts with board
    if (hand1[0] >= 0 && (boardSet.has(hand1[0]) || boardSet.has(hand1[1]))) continue;
    if (hand1[0] >= 0 && hand1[0] === hand1[1]) continue;

    const usedSet = new Set(boardIndices);
    if (hand1[0] >= 0) {
      usedSet.add(hand1[0]);
      usedSet.add(hand1[1]);
    }

    // Pick hand for player 2
    let hand2: [number, number];
    if (combos2.length > 0) {
      // Try up to 20 random picks to avoid conflicts
      let found = false;
      for (let t = 0; t < 20; t++) {
        const h = combos2[Math.floor(Math.random() * combos2.length)];
        const c1 = cardToIndex(h[0]);
        const c2 = cardToIndex(h[1]);
        if (!usedSet.has(c1) && !usedSet.has(c2) && c1 !== c2) {
          hand2 = [c1, c2];
          found = true;
          break;
        }
      }
      if (!found) continue;
    } else {
      hand2 = [-1, -1];
    }

    // Build remaining deck for run-out
    const remaining: number[] = [];
    const allUsed = new Set(usedSet);
    if (hand2![0] >= 0) {
      allUsed.add(hand2![0]);
      allUsed.add(hand2![1]);
    }

    for (let i = 0; i < 52; i++) {
      if (!allUsed.has(i)) remaining.push(i);
    }

    // Need to deal random hands for players and remaining board cards
    const neededCards = (hand1[0] < 0 ? 2 : 0) + (hand2![0] < 0 ? 2 : 0) + (5 - board.length);
    shufflePartial(remaining, neededCards);

    let idx = 0;
    if (hand1[0] < 0) {
      hand1 = [remaining[idx++], remaining[idx++]];
    }
    if (hand2![0] < 0) {
      hand2 = [remaining[idx++], remaining[idx++]];
    }

    // Complete board
    const fullBoard = [...boardIndices];
    while (fullBoard.length < 5) {
      fullBoard.push(remaining[idx++]);
    }

    // Evaluate
    const cards1 = [...hand1.map(indexToCard), ...fullBoard.map(indexToCard)];
    const cards2 = [...hand2!.map(indexToCard), ...fullBoard.map(indexToCard)];

    const rank1 = evaluateHand(cards1);
    const rank2 = evaluateHand(cards2);

    if (rank1 > rank2) wins1++;
    else if (rank2 > rank1) wins2++;
    else ties++;
  }

  const total = wins1 + wins2 + ties;
  if (total === 0) return { equity1: 50, equity2: 50, ties: 0 };

  return {
    equity1: (wins1 / total) * 100,
    equity2: (wins2 / total) * 100,
    ties: (ties / total) * 100,
  };
}

// Re-export helper for board parsing
export { parseCards };
