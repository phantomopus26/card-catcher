/**
 * OCR Pipeline Test
 * Generates a fake table, runs it through the OCR worker's exact pipeline,
 * and compares results to expected values.
 *
 * Usage: node test/test-ocr-pipeline.js
 */
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const { generateFakeTable, EXPECTED, ROIS, TABLE_WIDTH, TABLE_HEIGHT } = require('./generate-fake-table');

// From shared/constants.ts
const OCR_WHITELISTS = {
  playerName: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_ .',
  amount: '0123456789$,.',
  pot: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$,.: ',
  action: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /-',
  cards: '23456789TJQKAshdc♠♥♦♣',
};

// parseAmount from text-parser.ts
function parseAmount(raw) {
  if (!raw || raw.trim().length === 0) return 0;
  const dollarMatch = raw.match(/\$\s*([\d,.]+)/);
  if (dollarMatch) {
    const num = parseFloat(dollarMatch[1].replace(/,/g, ''));
    if (!isNaN(num) && num < 100000) return num;
  }
  let cleaned = raw.replace(/[$,\s]/g, '').replace(/[oO]/g, '0').replace(/[lI]/g, '1').replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num > 100000) return 0;
  return num;
}

async function recognizeROI(worker, tableImage, roi, tableWidth, tableHeight, whitelist, scaleFactor, invert, name) {
  const left = Math.round(roi.x * tableWidth);
  const top = Math.round(roi.y * tableHeight);
  const width = Math.max(1, Math.min(Math.round(roi.width * tableWidth), tableWidth - left));
  const height = Math.max(1, Math.min(Math.round(roi.height * tableHeight), tableHeight - top));

  // Pipeline from ocr-worker-process.ts:
  // extract → resize(cubic) → grayscale → negate → normalise → NO threshold
  let pipeline = sharp(tableImage)
    .extract({ left, top, width, height })
    .resize(width * scaleFactor, height * scaleFactor, { kernel: 'cubic' })
    .grayscale();

  if (invert) pipeline = pipeline.negate({ alpha: false });
  pipeline = pipeline.normalise();

  const processed = await pipeline.png().toBuffer();

  // Save processed image
  const outDir = path.join(__dirname, 'output', 'ocr-input');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}-ocr-input.png`), processed);

  const isShortText = whitelist.includes('$') && !whitelist.includes('T');
  await worker.setParameters({
    tessedit_char_whitelist: whitelist,
    tessedit_pageseg_mode: isShortText ? Tesseract.PSM.SINGLE_WORD : Tesseract.PSM.SINGLE_LINE,
  });

  const result = await worker.recognize(processed);
  return {
    text: result.data.text.trim(),
    confidence: result.data.confidence,
  };
}

async function runTests() {
  console.log('=== Card Catcher OCR Pipeline Test ===\n');

  // Step 1: Generate fake table
  console.log('--- Step 1: Generating fake table ---');
  const outputDir = path.join(__dirname, 'output');
  const { tableImage } = await generateFakeTable(outputDir);
  console.log('');

  // Step 2: Initialize Tesseract
  console.log('--- Step 2: Initializing Tesseract ---');
  const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY);
  console.log('Tesseract worker ready\n');

  // Step 3: Test each ROI
  console.log('--- Step 3: OCR Recognition Results ---\n');

  const results = [];

  // Test pot
  console.log('=== POT ===');
  const potResult = await recognizeROI(
    worker, tableImage, ROIS.pot,
    TABLE_WIDTH, TABLE_HEIGHT,
    OCR_WHITELISTS.pot, 4, true, 'pot'
  );
  const potExpected = EXPECTED.pot;
  const potParsed = parseAmount(potResult.text);
  const potExpectedParsed = parseAmount(potExpected);
  console.log(`  Expected:   "${potExpected}" → $${potExpectedParsed}`);
  console.log(`  OCR Raw:    "${potResult.text}" (confidence: ${potResult.confidence.toFixed(1)}%)`);
  console.log(`  OCR Parsed: $${potParsed}`);
  console.log(`  Match: ${Math.abs(potParsed - potExpectedParsed) < 0.01 ? '✓ PASS' : '✗ FAIL'}\n`);
  results.push({ name: 'pot', expected: potExpectedParsed, got: potParsed, raw: potResult.text, confidence: potResult.confidence });

  // Test community cards
  console.log('=== COMMUNITY CARDS ===');
  const ccResult = await recognizeROI(
    worker, tableImage, ROIS.communityCards,
    TABLE_WIDTH, TABLE_HEIGHT,
    OCR_WHITELISTS.cards, 2, true, 'community-cards'
  );
  console.log(`  Expected: "${EXPECTED.communityCards}"`);
  console.log(`  OCR Raw:  "${ccResult.text}" (confidence: ${ccResult.confidence.toFixed(1)}%)`);
  console.log(`  Match: ${ccResult.text.replace(/\s+/g, '').toUpperCase() === EXPECTED.communityCards.replace(/\s+/g, '').toUpperCase() ? '✓ PASS' : '✗ FAIL (card OCR is known-unreliable)'}\n`);

  // Test seat chip stacks
  for (let i = 0; i < ROIS.seats.length; i++) {
    const seat = ROIS.seats[i];
    const expected = EXPECTED.seats[i];

    console.log(`=== SEAT ${i} CHIP STACK ===`);
    const stackResult = await recognizeROI(
      worker, tableImage, seat.chipStack,
      TABLE_WIDTH, TABLE_HEIGHT,
      OCR_WHITELISTS.amount, 4, true, `seat${i}-stack`
    );
    const stackParsed = parseAmount(stackResult.text);
    const stackExpected = parseAmount(expected.chipStack);
    console.log(`  Expected:   "${expected.chipStack}" → $${stackExpected}`);
    console.log(`  OCR Raw:    "${stackResult.text}" (confidence: ${stackResult.confidence.toFixed(1)}%)`);
    console.log(`  OCR Parsed: $${stackParsed}`);
    console.log(`  Match: ${Math.abs(stackParsed - stackExpected) < 0.01 ? '✓ PASS' : '✗ FAIL'}\n`);
    results.push({ name: `seat${i}-stack`, expected: stackExpected, got: stackParsed, raw: stackResult.text, confidence: stackResult.confidence });

    if (expected.betAmount) {
      console.log(`=== SEAT ${i} BET AMOUNT ===`);
      const betResult = await recognizeROI(
        worker, tableImage, seat.betAmount,
        TABLE_WIDTH, TABLE_HEIGHT,
        OCR_WHITELISTS.amount, 4, true, `seat${i}-bet`
      );
      const betParsed = parseAmount(betResult.text);
      const betExpected = parseAmount(expected.betAmount);
      console.log(`  Expected:   "${expected.betAmount}" → $${betExpected}`);
      console.log(`  OCR Raw:    "${betResult.text}" (confidence: ${betResult.confidence.toFixed(1)}%)`);
      console.log(`  OCR Parsed: $${betParsed}`);
      console.log(`  Match: ${Math.abs(betParsed - betExpected) < 0.01 ? '✓ PASS' : '✗ FAIL'}\n`);
      results.push({ name: `seat${i}-bet`, expected: betExpected, got: betParsed, raw: betResult.text, confidence: betResult.confidence });
    }
  }

  // Test hero cards
  if (ROIS.seats[0].cards) {
    console.log('=== HERO CARDS ===');
    const cardsResult = await recognizeROI(
      worker, tableImage, ROIS.seats[0].cards,
      TABLE_WIDTH, TABLE_HEIGHT,
      OCR_WHITELISTS.cards, 3, true, 'seat0-cards'
    );
    console.log(`  Expected: "${EXPECTED.seats[0].cards}"`);
    console.log(`  OCR Raw:  "${cardsResult.text}" (confidence: ${cardsResult.confidence.toFixed(1)}%)\n`);
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  let passed = 0, failed = 0;
  for (const r of results) {
    const ok = Math.abs(r.expected - r.got) < 0.01;
    if (ok) passed++; else failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${r.name}: expected=$${r.expected} got=$${r.got} raw="${r.raw}" conf=${r.confidence.toFixed(1)}%`);
  }
  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length} tests`);

  // Step 4: Test with alternative preprocessing
  if (failed > 0) {
    console.log('\n--- Step 4: Testing alternative preprocessing ---\n');
    await testAlternativePreprocessing(worker, tableImage, results.filter(r => Math.abs(r.expected - r.got) >= 0.01));
  }

  await worker.terminate();
  console.log('\nDone! Check test/output/ for all generated images.');
}

async function testAlternativePreprocessing(worker, tableImage, failedResults) {
  const configs = [
    { name: 'threshold-100', threshold: 100, sharpen: false },
    { name: 'threshold-150', threshold: 150, sharpen: false },
    { name: 'threshold-180', threshold: 180, sharpen: false },
    { name: 'no-invert', invert: false, threshold: null },
    { name: 'scale-2', scaleFactor: 2 },
    { name: 'scale-6', scaleFactor: 6 },
    { name: 'lanczos3', kernel: 'lanczos3' },
    { name: 'sharp-then-thresh', sharpen: true, threshold: 140 },
  ];

  for (const failed of failedResults) {
    const roiKey = failed.name;
    let roi;
    if (roiKey === 'pot') roi = ROIS.pot;
    else {
      const match = roiKey.match(/seat(\d+)-(stack|bet)/);
      if (match) {
        const seatIdx = parseInt(match[1]);
        const field = match[2];
        roi = field === 'stack' ? ROIS.seats[seatIdx].chipStack : ROIS.seats[seatIdx].betAmount;
      }
    }
    if (!roi) continue;

    console.log(`  Testing alternatives for ${roiKey} (expected: $${failed.expected}):`);

    for (const config of configs) {
      const left = Math.round(roi.x * TABLE_WIDTH);
      const top = Math.round(roi.y * TABLE_HEIGHT);
      const width = Math.max(1, Math.min(Math.round(roi.width * TABLE_WIDTH), TABLE_WIDTH - left));
      const height = Math.max(1, Math.min(Math.round(roi.height * TABLE_HEIGHT), TABLE_HEIGHT - top));

      const sf = config.scaleFactor || 4;
      const kernel = config.kernel || 'cubic';
      const invert = config.invert !== false;

      let pipeline = sharp(tableImage)
        .extract({ left, top, width, height })
        .resize(width * sf, height * sf, { kernel })
        .grayscale();

      if (invert) pipeline = pipeline.negate({ alpha: false });

      if (config.sharpen) pipeline = pipeline.sharpen({ sigma: 1.5 });
      if (config.threshold) pipeline = pipeline.threshold(config.threshold);
      else pipeline = pipeline.normalise();

      const processed = await pipeline.png().toBuffer();

      const isAmount = roiKey.includes('stack') || roiKey.includes('bet');
      const whitelist = isAmount ? OCR_WHITELISTS.amount : OCR_WHITELISTS.pot;

      await worker.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: isAmount ? Tesseract.PSM.SINGLE_WORD : Tesseract.PSM.SINGLE_LINE,
      });

      const result = await worker.recognize(processed);
      const text = result.data.text.trim();
      const parsed = parseAmount(text);
      const ok = Math.abs(parsed - failed.expected) < 0.01;

      if (ok) {
        console.log(`    ✓ ${config.name}: "${text}" → $${parsed} (conf: ${result.data.confidence.toFixed(1)}%) ← WORKS!`);
        // Save the working preprocessed image
        const outDir = path.join(__dirname, 'output', 'alternatives');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${roiKey}-${config.name}-PASS.png`), processed);
      } else {
        console.log(`    ✗ ${config.name}: "${text}" → $${parsed}`);
      }
    }
    console.log('');
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
