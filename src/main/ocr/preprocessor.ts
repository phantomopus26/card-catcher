import sharp from 'sharp';
import { ROIRect } from '../../shared/types';

export interface PreprocessOptions {
  invert?: boolean;     // invert colors (for light text on dark bg)
  scaleFactor?: number; // upscale factor (default 3)
  threshold?: number;   // binarize threshold (0-255, default 128)
  sharpen?: boolean;
}

const DEFAULT_OPTIONS: PreprocessOptions = {
  invert: true,         // most poker UIs have light text on dark
  scaleFactor: 3,
  threshold: 128,
  sharpen: true,
};

/**
 * Crop an ROI from the full table image and preprocess for OCR.
 */
export async function preprocessROI(
  tableImageBuffer: Buffer,
  tableWidth: number,
  tableHeight: number,
  roi: ROIRect,
  options: PreprocessOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Calculate pixel coordinates from percentage-based ROI
  const left = Math.round(roi.x * tableWidth);
  const top = Math.round(roi.y * tableHeight);
  const width = Math.round(roi.width * tableWidth);
  const height = Math.round(roi.height * tableHeight);

  // Ensure dimensions are valid
  const safeWidth = Math.max(1, Math.min(width, tableWidth - left));
  const safeHeight = Math.max(1, Math.min(height, tableHeight - top));

  let pipeline = sharp(tableImageBuffer)
    .extract({ left, top, width: safeWidth, height: safeHeight });

  // Upscale for better OCR accuracy on small text
  if (opts.scaleFactor && opts.scaleFactor > 1) {
    pipeline = pipeline.resize(
      safeWidth * opts.scaleFactor,
      safeHeight * opts.scaleFactor,
      { kernel: 'lanczos3' }
    );
  }

  // Convert to grayscale
  pipeline = pipeline.grayscale();

  // Invert if text is light on dark background
  if (opts.invert) {
    pipeline = pipeline.negate({ alpha: false });
  }

  // Sharpen edges
  if (opts.sharpen) {
    pipeline = pipeline.sharpen({ sigma: 1.5 });
  }

  // Binarize (threshold)
  if (opts.threshold) {
    pipeline = pipeline.threshold(opts.threshold);
  }

  return pipeline.png().toBuffer();
}

/**
 * Preprocess specifically for amount/number regions.
 * Higher contrast, no inversion needed for some UIs.
 */
export async function preprocessAmountROI(
  tableImageBuffer: Buffer,
  tableWidth: number,
  tableHeight: number,
  roi: ROIRect
): Promise<Buffer> {
  return preprocessROI(tableImageBuffer, tableWidth, tableHeight, roi, {
    invert: true,
    scaleFactor: 4,   // extra upscale for small numbers
    threshold: 140,
    sharpen: true,
  });
}

/**
 * Compute a simple hash of a cropped ROI for change detection.
 * Returns a hex string. If two frames produce the same hash for an ROI,
 * the region hasn't changed and OCR can be skipped.
 */
export async function roiPixelHash(
  tableImageBuffer: Buffer,
  tableWidth: number,
  tableHeight: number,
  roi: ROIRect
): Promise<string> {
  const left = Math.round(roi.x * tableWidth);
  const top = Math.round(roi.y * tableHeight);
  const width = Math.max(1, Math.round(roi.width * tableWidth));
  const height = Math.max(1, Math.round(roi.height * tableHeight));

  // Downsample to tiny size for fast hashing
  const raw = await sharp(tableImageBuffer)
    .extract({
      left: Math.min(left, tableWidth - 1),
      top: Math.min(top, tableHeight - 1),
      width: Math.min(width, tableWidth - left),
      height: Math.min(height, tableHeight - top),
    })
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  // Simple hash: average pixel values into 64-bit string
  let hash = '';
  const avg = raw.reduce((sum, val) => sum + val, 0) / raw.length;
  for (let i = 0; i < raw.length; i++) {
    hash += raw[i] > avg ? '1' : '0';
  }
  return hash;
}
