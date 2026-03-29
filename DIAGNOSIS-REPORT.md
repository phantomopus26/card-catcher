# Card Catcher - Diagnosis & Fix Report

## Root Cause: `sharp.negate()` Inverting Alpha Channel

**The entire OCR pipeline was broken by a single bug.** Every call to `sharp().negate()` was also inverting the alpha channel on RGBA images, turning the preprocessed OCR input into fully transparent (invisible) images. Tesseract received blank white images and returned empty strings for every single ROI — pot, chip stacks, bet amounts, cards, everything.

### Why This Happened

Sharp's `.negate()` method inverts ALL channels by default, including alpha. When the source image has an alpha channel (RGBA — which PNG screenshots do), negate turns `alpha=255` (fully opaque) into `alpha=0` (fully transparent). The image data is still there but invisible.

### The Fix

One argument: `{ alpha: false }`

```typescript
// BEFORE (broken):
pipeline = pipeline.negate();

// AFTER (fixed):
pipeline = pipeline.negate({ alpha: false });
```

### Files Changed (5 call sites in 3 files)

1. **`src/main/ocr/ocr-worker-process.ts`** — Primary OCR pipeline (line 44)
2. **`src/main/ocr/preprocessor.ts`** — preprocessROI utility (line 57)
3. **`src/main/ipc-handlers.ts`** — Debug ROI dump + lobby balance OCR (lines 261, 435, 456)

## Test Results After Fix

Using a fake Ignition table generator with known values:

| ROI | Expected | OCR Raw | Parsed | Status |
|-----|----------|---------|--------|--------|
| Pot | $12.75 | "Total pot2$12.75" | $12.75 | ✅ PASS |
| Seat 0 Stack | $25.50 | "$2550" | $25.50* | ✅ PASS* |
| Seat 0 Bet | $2.00 | "$2.00" | $2.00 | ✅ PASS |
| Seat 1 Stack | $48.30 | "$48.30" | $48.30 | ✅ PASS |
| Seat 1 Bet | $0.50 | "$0.50" | $0.50 | ✅ PASS |
| Seat 2 Stack | $100.00 | "$100.00" | $100.00 | ✅ PASS |
| Seat 3 Stack | $37.25 | "$37.25" | $37.25 | ✅ PASS |
| Seat 4 Stack | $62.10 | "$62.10" | $62.10 | ✅ PASS |
| Seat 5 Stack | $29.85 | "$29.85" | $29.85 | ✅ PASS |
| Seat 5 Bet | $0.25 | "$0.25" | $0.25 | ✅ PASS |

*The `maybeFixDecimal()` function in text-parser.ts correctly converts "2550" → 25.50 when there's no decimal point.

## Why Dashboard Wasn't Displaying Data

**Because OCR was returning empty strings for everything.** The data pipeline chain is:

```
Screen Capture → OCR (broken here) → Game State Machine → Database → IPC → React Dashboard
```

Since OCR returned "" for pot, the `GameStateMachine` never detected `pot > 0`, so it never transitioned from `idle` → `preflop`. No hands were ever started. No data was ever written to SQLite. The dashboard had nothing to display.

With the negate fix, the full pipeline should work:
1. ✅ OCR reads pot value (e.g., "Total pot: $12.75")
2. ✅ GameStateMachine detects pot > 0 → transitions to `preflop`
3. ✅ HandTracker records players, stacks, actions
4. ✅ On hand-end → HandRecord saved to SQLite via `saveHand()`
5. ✅ SessionStats computes VPIP/PFR/3Bet/AF/PnL
6. ✅ HUD update sent to renderer via IPC `STATS_UPDATED`
7. ✅ Dashboard receives update and renders stats

## How to Run Tests

```bash
cd C:\Users\vamor\card-catcher

# Generate a fake table image
node test/generate-fake-table.js

# Run OCR pipeline test (compares OCR output to expected values)
node test/test-ocr-pipeline.js
```

Test output files are saved to `test/output/`:
- `fake-table.png` — The generated 1074x709 fake Ignition table
- `crops/` — Raw and preprocessed ROI crops for visual inspection
- `ocr-input/` — Exact images that Tesseract receives

## Remaining Items for Val to Test with Real Ignition

1. **ROI positions** — The percentage-based coordinates in `roi-definitions.ts` were calibrated from actual captures and look reasonable. But the built-in calibrator tool (Debug Panel → "Calibrate" button) lets you visually drag ROI boxes over a real table screenshot. Use this if text isn't being captured at the right positions.

2. **Card OCR** — Community cards and hero cards use graphical card images on Ignition, not text. The current OCR reads card labels when they're text-based. This is a known limitation noted in the code comments. Consider image-based card recognition for production use.

3. **Decimal point dropping** — Tesseract occasionally drops decimal points (e.g., "$25.50" → "$2550"). The `maybeFixDecimal()` heuristic and `ActionRecognizer.fixAmount()` handle most cases at micro-stakes. At higher stakes, this could misinterpret values. The median stack history + PnL sanity checks add robustness.

4. **Build and run the app**:
   ```bash
   npm run build
   npm start
   ```
   Open the Debug Panel, scan for windows, capture a real Ignition table, and test OCR. Use "Calibrate" to fine-tune ROI positions if needed.
