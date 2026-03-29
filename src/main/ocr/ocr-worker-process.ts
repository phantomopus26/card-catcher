/**
 * OCR Worker — runs in a child process to avoid blocking the main Electron thread.
 * Receives image buffers + ROI definitions via IPC, returns OCR results.
 */
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

let worker: Tesseract.Worker | null = null;

async function initWorker(): Promise<void> {
  if (worker) return;
  worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY);
}

async function recognizeROI(
  tableImageBase64: string,
  roi: { x: number; y: number; width: number; height: number },
  tableWidth: number,
  tableHeight: number,
  whitelist: string,
  scaleFactor: number = 3,
  invert: boolean = true
): Promise<string> {
  if (!worker) await initWorker();

  const tableImage = Buffer.from(tableImageBase64, 'base64');

  const left = Math.round(roi.x * tableWidth);
  const top = Math.round(roi.y * tableHeight);
  const width = Math.max(1, Math.min(Math.round(roi.width * tableWidth), tableWidth - left));
  const height = Math.max(1, Math.min(Math.round(roi.height * tableHeight), tableHeight - top));

  // Preprocessing for Tesseract LSTM:
  // 1. Extract + upscale with cubic (lanczos3 can ring on small text)
  // 2. Grayscale
  // 3. Negate (light-on-dark → dark-on-light for Tesseract)
  // 4. Normalise (auto-stretch contrast to full 0-255 range)
  // 5. NO fixed threshold — LSTM works better on clean grayscale than binary
  let pipeline = sharp(tableImage)
    .extract({ left, top, width, height })
    .resize(width * scaleFactor, height * scaleFactor, { kernel: 'cubic' })
    .grayscale();

  if (invert) pipeline = pipeline.negate({ alpha: false });
  pipeline = pipeline.normalise(); // auto-stretch contrast

  const processed = await pipeline.png().toBuffer();

  // Use SINGLE_WORD for short dollar amounts, SINGLE_LINE for longer text
  const isShortText = whitelist.includes('$') && !whitelist.includes('T'); // amount vs pot/cards
  await worker!.setParameters({
    tessedit_char_whitelist: whitelist,
    tessedit_pageseg_mode: isShortText ? Tesseract.PSM.SINGLE_WORD : Tesseract.PSM.SINGLE_LINE,
  });

  const result = await worker!.recognize(processed);
  return result.data.text.trim();
}

// Listen for messages from parent
process.on('message', async (msg: any) => {
  if (msg.type === 'init') {
    try {
      await initWorker();
      process.send!({ type: 'init-done' });
    } catch (err: any) {
      process.send!({ type: 'init-error', error: err.message });
    }
    return;
  }

  if (msg.type === 'process-frame') {
    try {
      const { id, tableImageBase64, tableWidth, tableHeight, rois } = msg;

      const results: Record<string, string> = {};
      for (const roi of rois) {
        try {
          results[roi.key] = await recognizeROI(
            tableImageBase64,
            roi.rect,
            tableWidth,
            tableHeight,
            roi.whitelist,
            roi.scaleFactor || 3,
            roi.invert !== false
          );
        } catch {
          results[roi.key] = '';
        }
      }

      process.send!({ type: 'frame-result', id, results });
    } catch (err: any) {
      process.send!({ type: 'frame-error', id: msg.id, error: err.message });
    }
    return;
  }

  if (msg.type === 'shutdown') {
    if (worker) await worker.terminate();
    process.exit(0);
  }
});

process.send!({ type: 'ready' });
