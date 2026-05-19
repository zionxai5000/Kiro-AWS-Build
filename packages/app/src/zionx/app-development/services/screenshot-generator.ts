/**
 * Screenshot Generator — Programmatic placeholder screenshots via sharp.
 *
 * Generates solid-color PNG images with text overlays for use as
 * placeholder screenshots during App Store submission pipeline testing.
 * These are NOT production screenshots — they satisfy ASC's technical
 * upload requirement while clearly signaling to the operator that
 * real screenshots are needed before actual submission.
 *
 * iOS: 1290×2796 (iPhone 6.7" portrait)
 * Android: 1080×1920 (standard portrait)
 * Cost: $0 (no AI calls)
 */

import sharp from 'sharp';
import type { Workspace } from '../workspace/workspace.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenshotGeneratorInput {
  appName: string;
  appDescription: string;
  screenshotCount: number;     // 3-5 recommended
  platform: 'ios' | 'android';
  workspace: Workspace;
  projectId: string;
}

export interface ScreenshotResult {
  screenshots: Array<{
    filename: string;
    width: number;
    height: number;
    isPlaceholder: true;
  }>;
  costUsd: number;             // Always 0 for placeholders
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IOS_WIDTH = 1290;
const IOS_HEIGHT = 2796;
const ANDROID_WIDTH = 1080;
const ANDROID_HEIGHT = 1920;

const SCREEN_LABELS = ['Home', 'Detail', 'Settings', 'Profile', 'Action'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic background color from app name.
 * Same app name always produces the same color.
 */
export function getBackgroundColor(appName: string): string {
  let hash = 0;
  for (let i = 0; i < appName.length; i++) {
    hash = ((hash << 5) - hash + appName.charCodeAt(i)) | 0;
  }
  // Generate a muted, pleasant color (HSL with fixed saturation/lightness)
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 35%)`;
}

/**
 * Convert HSL string to hex for sharp.
 */
function hslToHex(hsl: string): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return '#2a4a6b'; // fallback blue

  const h = parseInt(match[1]!, 10) / 360;
  const s = parseInt(match[2]!, 10) / 100;
  const l = parseInt(match[3]!, 10) / 100;

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate SVG text overlay for a placeholder screenshot.
 */
function buildSvgOverlay(
  width: number,
  height: number,
  appName: string,
  screenLabel: string,
): string {
  // Escape XML special characters
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedName = escape(appName);
  const escapedLabel = escape(screenLabel);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="40%" text-anchor="middle" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="white">${escapedName}</text>
  <text x="50%" y="50%" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="rgba(255,255,255,0.8)">${escapedLabel}</text>
  <text x="50%" y="90%" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.5)">PLACEHOLDER — Replace before submission</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Generate placeholder screenshots using sharp (text-on-solid-color).
 *
 * Each placeholder contains:
 * - Solid background color (deterministic from appName)
 * - App name in large centered text
 * - Screen label (e.g., "Home", "Detail", "Settings")
 * - "PLACEHOLDER — Replace before submission" watermark
 *
 * Files are written to workspace at `assets/screenshots/screenshot-{n}.png`.
 */
export async function generatePlaceholderScreenshots(
  input: ScreenshotGeneratorInput,
): Promise<ScreenshotResult> {
  const { appName, screenshotCount, platform, workspace, projectId } = input;

  const width = platform === 'ios' ? IOS_WIDTH : ANDROID_WIDTH;
  const height = platform === 'ios' ? IOS_HEIGHT : ANDROID_HEIGHT;
  const bgColor = hslToHex(getBackgroundColor(appName));

  const screenshots: ScreenshotResult['screenshots'] = [];

  for (let i = 0; i < screenshotCount; i++) {
    const screenLabel = SCREEN_LABELS[i % SCREEN_LABELS.length]!;
    const filename = `screenshot-${i + 1}.png`;
    const filePath = `assets/screenshots/${filename}`;

    const svgOverlay = buildSvgOverlay(width, height, appName, screenLabel);

    const pngBuffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: bgColor,
      },
    })
      .composite([{
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer();

    await workspace.writeBinaryFile(projectId, filePath, pngBuffer);

    screenshots.push({
      filename,
      width,
      height,
      isPlaceholder: true,
    });
  }

  return {
    screenshots,
    costUsd: 0,
  };
}
