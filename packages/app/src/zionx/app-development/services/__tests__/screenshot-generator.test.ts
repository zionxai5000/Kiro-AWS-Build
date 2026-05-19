/**
 * Tests for screenshot-generator.ts — placeholder screenshot generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generatePlaceholderScreenshots,
  getBackgroundColor,
  type ScreenshotGeneratorInput,
} from '../screenshot-generator.js';

// ---------------------------------------------------------------------------
// Mock workspace
// ---------------------------------------------------------------------------

const mockWriteBinaryFile = vi.fn().mockResolvedValue(undefined);
const mockWorkspace = {
  writeBinaryFile: mockWriteBinaryFile,
} as any;

beforeEach(() => {
  mockWriteBinaryFile.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePlaceholderScreenshots', () => {
  const baseInput: ScreenshotGeneratorInput = {
    appName: 'Workout Tracker',
    appDescription: 'Track your exercises',
    screenshotCount: 3,
    platform: 'ios',
    workspace: mockWorkspace,
    projectId: 'test-project',
  };

  it('generates exactly N screenshots for given count', async () => {
    const result = await generatePlaceholderScreenshots({ ...baseInput, screenshotCount: 4 });

    expect(result.screenshots).toHaveLength(4);
    expect(mockWriteBinaryFile).toHaveBeenCalledTimes(4);
  });

  it('iOS produces 1290×2796 dimensions', async () => {
    const result = await generatePlaceholderScreenshots({ ...baseInput, platform: 'ios' });

    for (const ss of result.screenshots) {
      expect(ss.width).toBe(1290);
      expect(ss.height).toBe(2796);
    }
  });

  it('Android produces 1080×1920 dimensions', async () => {
    const result = await generatePlaceholderScreenshots({ ...baseInput, platform: 'android' });

    for (const ss of result.screenshots) {
      expect(ss.width).toBe(1080);
      expect(ss.height).toBe(1920);
    }
  });

  it('files are written to workspace assets/screenshots/', async () => {
    await generatePlaceholderScreenshots(baseInput);

    expect(mockWriteBinaryFile).toHaveBeenCalledTimes(3);
    expect(mockWriteBinaryFile).toHaveBeenCalledWith(
      'test-project',
      'assets/screenshots/screenshot-1.png',
      expect.any(Buffer),
    );
    expect(mockWriteBinaryFile).toHaveBeenCalledWith(
      'test-project',
      'assets/screenshots/screenshot-2.png',
      expect.any(Buffer),
    );
    expect(mockWriteBinaryFile).toHaveBeenCalledWith(
      'test-project',
      'assets/screenshots/screenshot-3.png',
      expect.any(Buffer),
    );
  });

  it('returns costUsd: 0', async () => {
    const result = await generatePlaceholderScreenshots(baseInput);

    expect(result.costUsd).toBe(0);
  });
});

describe('getBackgroundColor', () => {
  it('same appName produces same background color (deterministic)', () => {
    const color1 = getBackgroundColor('Workout Tracker');
    const color2 = getBackgroundColor('Workout Tracker');
    const color3 = getBackgroundColor('Recipe App');

    expect(color1).toBe(color2);
    expect(color1).not.toBe(color3);
  });
});
