import { ActionType, TableOCRSnapshot } from '../../shared/types';

/**
 * Parse a dollar amount string from OCR output.
 * Handles common OCR errors (O→0, l→1, etc.)
 */
export function parseAmount(raw: string): number {
  if (!raw || raw.trim().length === 0) return 0;

  // If the string contains a $ sign, extract the number after it
  // Handle OCR garbage before $ like "1$29.85" → extract "$29.85"
  const dollarMatch = raw.match(/\$\s*([\d,.]+)/);
  if (dollarMatch) {
    const num = parseFloat(dollarMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num < 100000) return maybeFixDecimal(num);
  }

  // Otherwise try to clean and parse
  let cleaned = raw
    .replace(/[$,\s]/g, '')  // remove $, commas, spaces
    .replace(/[oO]/g, '0')   // O → 0
    .replace(/[lI]/g, '1')   // l/I → 1
    .replace(/[^0-9.]/g, ''); // strip remaining non-numeric

  const num = parseFloat(cleaned);
  if (isNaN(num) || num > 100000) return 0;
  return maybeFixDecimal(num);
}

/**
 * Fix missing decimal points — common Tesseract error.
 * "2465" → 24.65, "2556" → 25.56, "10" → 0.10
 * Heuristic: if value > 200 and has no decimal, try inserting one 2 places from end.
 * For small values (10-99 with no decimal in original), could be $0.10-$0.99.
 */
function maybeFixDecimal(num: number): number {
  // Already has a decimal — trust it
  if (num !== Math.floor(num)) return num;

  // Values like 2465, 2556, 3010 — likely missing decimal: $24.65, $25.56, $30.10
  if (num >= 100 && num < 100000) {
    const fixed = num / 100;
    // Only apply if the result looks like a reasonable poker amount ($0.50 - $999)
    if (fixed >= 0.50 && fixed < 1000) return fixed;
  }

  // Values like 10, 25, 35 — could be $0.10, $0.25, $0.35 (bet amounts)
  // But also could be legit $10, $25 stacks. Don't auto-fix these — too ambiguous.
  return num;
}

/**
 * Parse a player action from OCR text.
 */
export function parseAction(raw: string): ActionType | null {
  if (!raw || raw.trim().length === 0) return null;

  const text = raw.toLowerCase().trim();

  // Direct matches
  if (/fold/i.test(text)) return 'fold';
  if (/check/i.test(text)) return 'check';
  if (/call/i.test(text)) return 'call';
  if (/raise/i.test(text)) return 'raise';
  if (/all[\s-]?in/i.test(text)) return 'all_in';
  if (/^bet$/i.test(text) || /\bbet\b/i.test(text)) return 'bet';

  // Fuzzy matches for common OCR errors
  if (levenshtein(text, 'fold') <= 1) return 'fold';
  if (levenshtein(text, 'check') <= 1) return 'check';
  if (levenshtein(text, 'call') <= 1) return 'call';
  if (levenshtein(text, 'raise') <= 2) return 'raise';

  return null;
}

/**
 * Parse card notation from OCR text.
 * Input might be like "Ah Kd" or "AhKd" or "A h K d"
 */
export function parseCards(raw: string): string[] {
  if (!raw || raw.trim().length === 0) return [];

  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  const cards: string[] = [];

  const ranks = '23456789TJQKA';
  const suits = 'SHDC';

  for (let i = 0; i < cleaned.length - 1; i++) {
    const rank = cleaned[i];
    const suit = cleaned[i + 1];
    if (ranks.includes(rank) && suits.includes(suit)) {
      cards.push(rank + suit.toLowerCase());
      i++; // skip suit char
    }
  }

  return cards;
}

/**
 * Fuzzy match a player name against known names.
 * Returns the matched name or the original if no close match.
 */
export function matchPlayerName(ocr: string, knownNames: string[]): string {
  if (!ocr || ocr.trim().length === 0) return '';

  const text = ocr.trim();

  // Exact match
  const exact = knownNames.find(n => n === text);
  if (exact) return exact;

  // Case-insensitive match
  const ci = knownNames.find(n => n.toLowerCase() === text.toLowerCase());
  if (ci) return ci;

  // Fuzzy match (Levenshtein distance ≤ 2)
  let bestMatch = '';
  let bestDist = 3;
  for (const name of knownNames) {
    const dist = levenshtein(text.toLowerCase(), name.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = name;
    }
  }

  return bestMatch || text;
}

/**
 * Determine the number of community cards from OCR output.
 */
export function countCommunityCards(raw: string): number {
  return parseCards(raw).length;
}

/**
 * Check if an OCR snapshot indicates a seat is occupied.
 * On Ignition, all seats have a hardcoded "Seat N" name from our code,
 * so we require a positive chip stack as the real signal.
 */
export function isSeatOccupied(seatData: { playerName: string; chipStack: string }): boolean {
  // Require a readable chip stack — the "Seat N" playerName is always set by our code
  // and can't distinguish occupied from empty seats
  return parseAmount(seatData.chipStack) > 0;
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}
