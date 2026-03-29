import { WindowBounds } from '../../shared/types';

let screenshotModule: any = null;

async function getScreenshotModule() {
  if (!screenshotModule) {
    // node-screenshots provides native window capture
    // Fallback to electron desktopCapturer if not available
    try {
      // @ts-ignore — optional native dependency
      screenshotModule = await import(/* webpackIgnore: true */ 'node-screenshots');
    } catch {
      screenshotModule = null;
    }
  }
  return screenshotModule;
}

/**
 * Capture a region of the screen as a PNG buffer.
 * Uses native screenshot APIs for performance.
 */
export async function captureRegion(bounds: WindowBounds): Promise<Buffer> {
  const mod = await getScreenshotModule();

  if (mod) {
    // Use node-screenshots native capture
    const monitors = mod.Monitor.all();
    // Find the monitor containing this region
    for (const monitor of monitors) {
      const img = monitor.captureArea(bounds.x, bounds.y, bounds.width, bounds.height);
      if (img) return Buffer.from(img.toPng());
    }
  }

  // Fallback: use Electron's desktopCapturer
  return captureWithElectron(bounds);
}

async function captureWithElectron(bounds: WindowBounds): Promise<Buffer> {
  const { desktopCapturer, screen } = require('electron');

  const primaryDisplay = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: primaryDisplay.workAreaSize.width,
      height: primaryDisplay.workAreaSize.height,
    },
  });

  if (sources.length === 0) {
    throw new Error('No screen sources available');
  }

  // Get the full screen thumbnail and crop to bounds
  const fullScreen = sources[0].thumbnail;
  const cropped = fullScreen.crop({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });

  return cropped.toPNG();
}

/**
 * Capture a specific sub-region within an already-captured table image.
 * roi coordinates are percentages (0-1) of the table dimensions.
 */
export function cropROI(
  tableImage: Buffer,
  tableWidth: number,
  tableHeight: number,
  roi: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(roi.x * tableWidth),
    y: Math.round(roi.y * tableHeight),
    width: Math.round(roi.width * tableWidth),
    height: Math.round(roi.height * tableHeight),
  };
}
