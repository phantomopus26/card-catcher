import { TableLayout, SeatROI } from '../../shared/types';

/**
 * Ignition Poker 6-max table layout.
 * ROI coordinates are percentages (0-1) of the FULL WINDOW capture (including title bar).
 * Calibrated from actual captures: ~1074x709px.
 *
 * Ignition 6-max seat layout (numbered circles on table):
 *   Seat 1 = Bottom-center (hero)   (seatIndex 0)
 *   Seat 2 = Lower-left             (seatIndex 1)
 *   Seat 3 = Upper-left             (seatIndex 2)
 *   Seat 4 = Top-center             (seatIndex 3)
 *   Seat 5 = Upper-right            (seatIndex 4)
 *   Seat 6 = Lower-right            (seatIndex 5)
 *
 * Players are anonymous on Ignition. Chip stacks show as "$XX.XX" next to numbered circles.
 * "Total pot: $X.XX" appears center-top. Bet amounts like "$0.50" appear near center.
 * Action text (Check/Fold, Check, etc.) appears in bottom area buttons.
 */
const IGNITION_6MAX_SEATS: SeatROI[] = [
  {
    // seatIndex 0 = Seat 1: Bottom-center (hero)
    // "$26.89" text at ~(460-565, 435-460) in 1070x656 capture
    // Shifted left from 0.460 — user confirmed rectangle was too far right
    seatIndex: 0,
    playerName: { x: 0.415, y: 0.650, width: 0.040, height: 0.040 },
    chipStack:  { x: 0.400, y: 0.650, width: 0.140, height: 0.050 },
    betAmount:  { x: 0.440, y: 0.540, width: 0.120, height: 0.040 },
    cards:      { x: 0.430, y: 0.560, width: 0.130, height: 0.080 },
    actionText: { x: 0.390, y: 0.710, width: 0.220, height: 0.040 },
  },
  {
    // seatIndex 1 = Seat 2: Lower-left
    // "$29.56" text at ~(190-270, 378-400) in 1070x656 capture
    // chipStack starts at x=0.180 to avoid circle number "0"
    seatIndex: 1,
    playerName: { x: 0.140, y: 0.570, width: 0.040, height: 0.040 },
    chipStack:  { x: 0.180, y: 0.570, width: 0.105, height: 0.048 },
    betAmount:  { x: 0.270, y: 0.510, width: 0.100, height: 0.040 },
    cards:      { x: 0.095, y: 0.490, width: 0.100, height: 0.070 },
    actionText: { x: 0.130, y: 0.620, width: 0.180, height: 0.040 },
  },
  {
    // seatIndex 2 = Seat 3: Upper-left
    // Circle ~(108,225), stack "$50" ~(145-230,218-238)
    seatIndex: 2,
    playerName: { x: 0.080, y: 0.298, width: 0.040, height: 0.040 },
    chipStack:  { x: 0.125, y: 0.298, width: 0.115, height: 0.040 },
    betAmount:  { x: 0.230, y: 0.360, width: 0.100, height: 0.040 },
    cards:      { x: 0.095, y: 0.220, width: 0.100, height: 0.070 },
    actionText: { x: 0.080, y: 0.345, width: 0.180, height: 0.040 },
  },
  {
    // seatIndex 3 = Seat 4: Top-center
    // Circle ~(455,162), stack "$58.05" ~(480-570,155-175)
    seatIndex: 3,
    playerName: { x: 0.415, y: 0.215, width: 0.040, height: 0.040 },
    chipStack:  { x: 0.445, y: 0.215, width: 0.115, height: 0.040 },
    betAmount:  { x: 0.440, y: 0.290, width: 0.120, height: 0.040 },
    cards:      { x: 0.430, y: 0.120, width: 0.120, height: 0.080 },
    actionText: { x: 0.400, y: 0.260, width: 0.200, height: 0.040 },
  },
  {
    // seatIndex 4 = Seat 5: Upper-right
    // Circle ~(790,225), stack "$44.51" ~(820-900,218-238), D button ~(760,228)
    seatIndex: 4,
    playerName: { x: 0.725, y: 0.298, width: 0.040, height: 0.040 },
    chipStack:  { x: 0.765, y: 0.298, width: 0.115, height: 0.040 },
    betAmount:  { x: 0.640, y: 0.360, width: 0.100, height: 0.040 },
    cards:      { x: 0.755, y: 0.220, width: 0.100, height: 0.070 },
    actionText: { x: 0.720, y: 0.345, width: 0.180, height: 0.040 },
  },
  {
    // seatIndex 5 = Seat 6: Lower-right
    // "$26.95" text at ~(800-870, 378-400) in 1070x656 capture
    // chipStack starts at x=0.750 to avoid circle number "4"
    seatIndex: 5,
    playerName: { x: 0.725, y: 0.570, width: 0.040, height: 0.040 },
    chipStack:  { x: 0.750, y: 0.570, width: 0.100, height: 0.048 },
    betAmount:  { x: 0.650, y: 0.470, width: 0.100, height: 0.040 },
    cards:      { x: 0.755, y: 0.490, width: 0.100, height: 0.070 },
    actionText: { x: 0.720, y: 0.620, width: 0.180, height: 0.040 },
  },
];

export const IGNITION_6MAX: TableLayout = {
  id: 'ignition-6max',
  name: 'Ignition 6-Max',
  clientPattern: 'ignition|bovada|bodog|no.limit.hold|\\$[\\d.]+\\/\\$[\\d.]+',
  seats: 6,
  regions: {
    // "Total pot: $0.75" centered at ~(370-620, 220-250)
    // Widened ROI and adjusted Y to capture the full "Total pot: $X.XX" text
    pot: { x: 0.350, y: 0.295, width: 0.300, height: 0.055 },
    // Community cards in center oval ~(300-750, 300-400)
    communityCards: { x: 0.300, y: 0.400, width: 0.400, height: 0.100 },
    dealerButton: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
    seats: IGNITION_6MAX_SEATS,
  },
};

// 9-max layout (rough, needs real calibration)
const IGNITION_9MAX_SEATS: SeatROI[] = [
  { seatIndex: 0, playerName: { x: 0.42, y: 0.80, width: 0.04, height: 0.04 }, chipStack: { x: 0.46, y: 0.80, width: 0.12, height: 0.04 }, betAmount: { x: 0.44, y: 0.68, width: 0.12, height: 0.04 }, cards: { x: 0.45, y: 0.72, width: 0.10, height: 0.07 }, actionText: { x: 0.42, y: 0.84, width: 0.16, height: 0.04 } },
  { seatIndex: 1, playerName: { x: 0.14, y: 0.72, width: 0.04, height: 0.04 }, chipStack: { x: 0.18, y: 0.72, width: 0.12, height: 0.04 }, betAmount: { x: 0.26, y: 0.62, width: 0.12, height: 0.04 }, cards: { x: 0.17, y: 0.64, width: 0.10, height: 0.07 }, actionText: { x: 0.14, y: 0.76, width: 0.16, height: 0.04 } },
  { seatIndex: 2, playerName: { x: 0.04, y: 0.50, width: 0.04, height: 0.04 }, chipStack: { x: 0.08, y: 0.50, width: 0.12, height: 0.04 }, betAmount: { x: 0.18, y: 0.45, width: 0.12, height: 0.04 }, cards: { x: 0.07, y: 0.42, width: 0.10, height: 0.07 }, actionText: { x: 0.04, y: 0.54, width: 0.16, height: 0.04 } },
  { seatIndex: 3, playerName: { x: 0.14, y: 0.22, width: 0.04, height: 0.04 }, chipStack: { x: 0.18, y: 0.22, width: 0.12, height: 0.04 }, betAmount: { x: 0.26, y: 0.30, width: 0.12, height: 0.04 }, cards: { x: 0.17, y: 0.28, width: 0.10, height: 0.07 }, actionText: { x: 0.14, y: 0.26, width: 0.16, height: 0.04 } },
  { seatIndex: 4, playerName: { x: 0.42, y: 0.10, width: 0.04, height: 0.04 }, chipStack: { x: 0.46, y: 0.10, width: 0.12, height: 0.04 }, betAmount: { x: 0.44, y: 0.22, width: 0.12, height: 0.04 }, cards: { x: 0.45, y: 0.16, width: 0.10, height: 0.07 }, actionText: { x: 0.42, y: 0.14, width: 0.16, height: 0.04 } },
  { seatIndex: 5, playerName: { x: 0.70, y: 0.22, width: 0.04, height: 0.04 }, chipStack: { x: 0.74, y: 0.22, width: 0.12, height: 0.04 }, betAmount: { x: 0.62, y: 0.30, width: 0.12, height: 0.04 }, cards: { x: 0.73, y: 0.28, width: 0.10, height: 0.07 }, actionText: { x: 0.70, y: 0.26, width: 0.16, height: 0.04 } },
  { seatIndex: 6, playerName: { x: 0.80, y: 0.50, width: 0.04, height: 0.04 }, chipStack: { x: 0.84, y: 0.50, width: 0.12, height: 0.04 }, betAmount: { x: 0.70, y: 0.45, width: 0.12, height: 0.04 }, cards: { x: 0.83, y: 0.42, width: 0.10, height: 0.07 }, actionText: { x: 0.80, y: 0.54, width: 0.16, height: 0.04 } },
  { seatIndex: 7, playerName: { x: 0.70, y: 0.72, width: 0.04, height: 0.04 }, chipStack: { x: 0.74, y: 0.72, width: 0.12, height: 0.04 }, betAmount: { x: 0.62, y: 0.62, width: 0.12, height: 0.04 }, cards: { x: 0.73, y: 0.64, width: 0.10, height: 0.07 }, actionText: { x: 0.70, y: 0.76, width: 0.16, height: 0.04 } },
  { seatIndex: 8, playerName: { x: 0.64, y: 0.80, width: 0.04, height: 0.04 }, chipStack: { x: 0.68, y: 0.80, width: 0.12, height: 0.04 }, betAmount: { x: 0.60, y: 0.68, width: 0.12, height: 0.04 }, cards: { x: 0.67, y: 0.72, width: 0.10, height: 0.07 }, actionText: { x: 0.64, y: 0.84, width: 0.16, height: 0.04 } },
];

export const IGNITION_9MAX: TableLayout = {
  id: 'ignition-9max',
  name: 'Ignition 9-Max',
  clientPattern: 'ignition.*(?:hold|no.?limit|table)',
  seats: 9,
  regions: {
    pot: { x: 0.42, y: 0.36, width: 0.16, height: 0.04 },
    communityCards: { x: 0.30, y: 0.40, width: 0.40, height: 0.10 },
    dealerButton: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
    seats: IGNITION_9MAX_SEATS,
  },
};

// All available layouts
export const LAYOUTS: TableLayout[] = [IGNITION_6MAX, IGNITION_9MAX];

/**
 * Apply calibrated ROI positions from the visual calibrator.
 * Updates the 6-max layout in-place (takes effect immediately for new captures).
 */
export function applyCalibration(rois: { key: string; x: number; y: number; width: number; height: number }[]): void {
  const layout = IGNITION_6MAX;
  for (const roi of rois) {
    const rect = { x: roi.x, y: roi.y, width: roi.width, height: roi.height };
    if (roi.key === 'pot') {
      layout.regions.pot = rect;
    } else if (roi.key === 'cc') {
      layout.regions.communityCards = rect;
    } else {
      // Parse "s0-stack", "s0-bet", etc.
      const match = roi.key.match(/^s(\d+)-(stack|bet)$/);
      if (match) {
        const seatIdx = parseInt(match[1]);
        const field = match[2];
        const seat = layout.regions.seats.find(s => s.seatIndex === seatIdx);
        if (seat) {
          if (field === 'stack') seat.chipStack = rect;
          else if (field === 'bet') seat.betAmount = rect;
        }
      }
    }
  }
  console.log('[ROI] Calibration applied to ignition-6max layout');
}

/**
 * Load saved calibration from disk (called at startup).
 */
export function loadSavedCalibration(userDataPath: string): void {
  try {
    const fs = require('fs');
    const path = require('path');
    const calibPath = path.join(userDataPath, 'roi-calibration.json');
    if (fs.existsSync(calibPath)) {
      const rois = JSON.parse(fs.readFileSync(calibPath, 'utf-8'));
      applyCalibration(rois);
      console.log('[ROI] Loaded saved calibration from', calibPath);
    }
  } catch (err) {
    console.error('[ROI] Failed to load calibration:', err);
  }
}

export function getLayoutForTable(windowTitle: string, numSeats?: number): TableLayout {
  for (const layout of LAYOUTS) {
    const pattern = new RegExp(layout.clientPattern, 'i');
    if (pattern.test(windowTitle)) {
      if (!numSeats || layout.seats === numSeats) {
        return layout;
      }
    }
  }
  // Default to 6-max
  return IGNITION_6MAX;
}
