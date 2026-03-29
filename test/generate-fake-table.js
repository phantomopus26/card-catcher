/**
 * Fake Ignition Table Generator v2
 * Uses composited text images for better OCR accuracy.
 * Each ROI region gets text rendered at the right size with proper contrast.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const TABLE_WIDTH = 1074;
const TABLE_HEIGHT = 709;

// ROI positions from roi-definitions.ts (IGNITION_6MAX)
const ROIS = {
  pot: { x: 0.350, y: 0.295, width: 0.300, height: 0.055 },
  communityCards: { x: 0.300, y: 0.400, width: 0.400, height: 0.100 },
  seats: [
    { seatIndex: 0, chipStack: { x: 0.400, y: 0.650, width: 0.140, height: 0.050 }, betAmount: { x: 0.440, y: 0.540, width: 0.120, height: 0.040 }, cards: { x: 0.430, y: 0.560, width: 0.130, height: 0.080 } },
    { seatIndex: 1, chipStack: { x: 0.180, y: 0.570, width: 0.105, height: 0.048 }, betAmount: { x: 0.270, y: 0.510, width: 0.100, height: 0.040 } },
    { seatIndex: 2, chipStack: { x: 0.125, y: 0.298, width: 0.115, height: 0.040 }, betAmount: { x: 0.230, y: 0.360, width: 0.100, height: 0.040 } },
    { seatIndex: 3, chipStack: { x: 0.445, y: 0.215, width: 0.115, height: 0.040 }, betAmount: { x: 0.440, y: 0.290, width: 0.120, height: 0.040 } },
    { seatIndex: 4, chipStack: { x: 0.765, y: 0.298, width: 0.115, height: 0.040 }, betAmount: { x: 0.640, y: 0.360, width: 0.100, height: 0.040 } },
    { seatIndex: 5, chipStack: { x: 0.750, y: 0.570, width: 0.100, height: 0.048 }, betAmount: { x: 0.650, y: 0.470, width: 0.100, height: 0.040 } },
  ],
};

// Expected values — what the OCR should return
const EXPECTED = {
  pot: 'Total pot: $12.75',
  communityCards: 'Ah Kd 9c',
  seats: [
    { chipStack: '$25.50', betAmount: '$2.00', cards: 'Ac Kh' },
    { chipStack: '$48.30', betAmount: '$0.50' },
    { chipStack: '$100.00', betAmount: '' },
    { chipStack: '$37.25', betAmount: '$1.00' },
    { chipStack: '$62.10', betAmount: '' },
    { chipStack: '$29.85', betAmount: '$0.25' },
  ],
};

function roiToPixels(roi) {
  return {
    x: Math.round(roi.x * TABLE_WIDTH),
    y: Math.round(roi.y * TABLE_HEIGHT),
    width: Math.round(roi.width * TABLE_WIDTH),
    height: Math.round(roi.height * TABLE_HEIGHT),
  };
}

/**
 * Create a text image that fills the given pixel dimensions.
 * White text on transparent background, ready to composite onto the table.
 */
function createTextOverlay(text, widthPx, heightPx, color = '#ffffff') {
  // Font size = 70% of height for good fill
  const fontSize = Math.max(10, Math.round(heightPx * 0.70));
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg">
    <text x="${widthPx/2}" y="${heightPx * 0.72}" text-anchor="middle" 
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" 
          fill="${color}" font-weight="bold">${escapeXml(text)}</text>
  </svg>`;
  return Buffer.from(svg);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function generateFakeTable(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Create dark green table background with oval
  const bgSvg = `<svg width="${TABLE_WIDTH}" height="${TABLE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${TABLE_WIDTH}" height="${TABLE_HEIGHT}" fill="#0a3d1c"/>
    <ellipse cx="${TABLE_WIDTH/2}" cy="${TABLE_HEIGHT/2}" rx="${TABLE_WIDTH*0.42}" ry="${TABLE_HEIGHT*0.38}" fill="#0d5a28" stroke="#1a7a3a" stroke-width="3"/>
  </svg>`;

  // Start with the background
  let composites = [];

  // Add text overlays for each ROI
  // Pot
  {
    const px = roiToPixels(ROIS.pot);
    composites.push({
      input: createTextOverlay(EXPECTED.pot, px.width, px.height),
      left: px.x, top: px.y,
    });
  }

  // Community cards
  {
    const px = roiToPixels(ROIS.communityCards);
    composites.push({
      input: createTextOverlay(EXPECTED.communityCards, px.width, px.height),
      left: px.x, top: px.y,
    });
  }

  // Seats
  for (let i = 0; i < ROIS.seats.length; i++) {
    const seat = ROIS.seats[i];
    const expected = EXPECTED.seats[i];

    // Chip stack
    {
      const px = roiToPixels(seat.chipStack);
      composites.push({
        input: createTextOverlay(expected.chipStack, px.width, px.height),
        left: px.x, top: px.y,
      });
    }

    // Bet amount
    if (expected.betAmount) {
      const px = roiToPixels(seat.betAmount);
      composites.push({
        input: createTextOverlay(expected.betAmount, px.width, px.height, '#ffdd00'),
        left: px.x, top: px.y,
      });
    }

    // Cards (seat 0 only)
    if (i === 0 && expected.cards) {
      const px = roiToPixels(seat.cards);
      composites.push({
        input: createTextOverlay(expected.cards, px.width, px.height),
        left: px.x, top: px.y,
      });
    }
  }

  const tableImage = await sharp(Buffer.from(bgSvg))
    .composite(composites)
    .png()
    .toBuffer();

  const tablePath = path.join(outputDir, 'fake-table.png');
  fs.writeFileSync(tablePath, tableImage);
  console.log(`Saved fake table: ${tablePath} (${TABLE_WIDTH}x${TABLE_HEIGHT})`);

  // Save ROI crops for inspection
  await saveROICrops(tableImage, outputDir);

  return { tablePath, tableImage, expected: EXPECTED };
}

async function saveROICrops(tableImage, outputDir) {
  const cropsDir = path.join(outputDir, 'crops');
  fs.mkdirSync(cropsDir, { recursive: true });

  async function cropAndSave(roi, name) {
    const px = roiToPixels(roi);
    const safeW = Math.max(1, Math.min(px.width, TABLE_WIDTH - px.x));
    const safeH = Math.max(1, Math.min(px.height, TABLE_HEIGHT - px.y));

    // Raw crop
    const raw = await sharp(tableImage)
      .extract({ left: px.x, top: px.y, width: safeW, height: safeH })
      .png().toBuffer();
    fs.writeFileSync(path.join(cropsDir, `${name}-raw.png`), raw);

    // Preprocessed: OCR worker pipeline with negate fix
    const scaleFactor = 4;
    const processed = await sharp(tableImage)
      .extract({ left: px.x, top: px.y, width: safeW, height: safeH })
      .resize(safeW * scaleFactor, safeH * scaleFactor, { kernel: 'cubic' })
      .grayscale()
      .negate({ alpha: false })
      .normalise()
      .png().toBuffer();
    fs.writeFileSync(path.join(cropsDir, `${name}-processed.png`), processed);

    console.log(`  Saved crops for ${name}: ${safeW}x${safeH} → ${safeW*scaleFactor}x${safeH*scaleFactor}`);
  }

  await cropAndSave(ROIS.pot, 'pot');
  await cropAndSave(ROIS.communityCards, 'community-cards');

  for (const seat of ROIS.seats) {
    await cropAndSave(seat.chipStack, `seat${seat.seatIndex}-stack`);
    await cropAndSave(seat.betAmount, `seat${seat.seatIndex}-bet`);
    if (seat.seatIndex === 0 && seat.cards) {
      await cropAndSave(seat.cards, `seat0-cards`);
    }
  }
}

module.exports = { generateFakeTable, EXPECTED, ROIS, TABLE_WIDTH, TABLE_HEIGHT };

if (require.main === module) {
  const outputDir = path.join(__dirname, 'output');
  generateFakeTable(outputDir).then(() => {
    console.log('\nDone! Check test/output/ for generated images.');
  }).catch(err => {
    console.error('Failed:', err);
    process.exit(1);
  });
}
