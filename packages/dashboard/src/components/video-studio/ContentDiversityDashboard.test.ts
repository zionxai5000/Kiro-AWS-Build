/**
 * Unit tests for ZXMG Video Studio — Content Diversity Dashboard
 *
 * Validates: Requirements 44b.7, 44f.30
 *
 * Tests grid rendering, duplicate detection, diversity score,
 * suggest alternative, and per-channel tracking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContentDiversityDashboard,
  type ContentDiversityData,
  type ContentAsset,
  type AssetType,
} from './ContentDiversityDashboard.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestData(overrides?: Partial<ContentDiversityData>): ContentDiversityData {
  return {
    assets: [
      { id: 'av-1', name: 'Avatar Alpha', type: 'avatar', lastUsedVideoIndex: 2, usageCount: 5 },
      { id: 'av-2', name: 'Avatar Beta', type: 'avatar', lastUsedVideoIndex: 8, usageCount: 3 },
      { id: 'vo-1', name: 'Voice Deep', type: 'voice', lastUsedVideoIndex: 1, usageCount: 7 },
      { id: 'vo-2', name: 'Voice Bright', type: 'voice', lastUsedVideoIndex: 10, usageCount: 2 },
      { id: 'st-1', name: 'Neon Style', type: 'style', lastUsedVideoIndex: 0, usageCount: 4 },
      { id: 'mu-1', name: 'Upbeat Track', type: 'music', lastUsedVideoIndex: 3, usageCount: 6 },
    ],
    channels: [
      { channelId: 'ch-1', channelName: 'Tech Reviews', diversityScore: 82 },
      { channelId: 'ch-2', channelName: 'Cooking Tips', diversityScore: 45 },
    ],
    recentVideoCount: 20,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let container: HTMLElement;

beforeEach(() => {
  container = createContainer();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Grid Renders All Used Assets
// ---------------------------------------------------------------------------

describe('ContentDiversityDashboard — Rendering', () => {
  it('should render dashboard with title', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    expect(container.querySelector('.diversity-dashboard__title')?.textContent).toContain('Content Diversity');
  });

  it('should render sections for all asset types', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    const sections = container.querySelectorAll('[data-asset-type]');
    expect(sections.length).toBe(4);

    const types = Array.from(sections).map((s) => (s as HTMLElement).dataset.assetType);
    expect(types).toContain('avatar');
    expect(types).toContain('voice');
    expect(types).toContain('style');
    expect(types).toContain('music');
  });

  it('should render asset items with names and usage counts', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    const assets = container.querySelectorAll('.diversity-dashboard__asset');
    expect(assets.length).toBe(6);

    const firstAsset = container.querySelector('[data-asset-id="av-1"]');
    expect(firstAsset?.querySelector('.diversity-dashboard__asset-name')?.textContent).toBe('Avatar Alpha');
    expect(firstAsset?.querySelector('.diversity-dashboard__asset-usage')?.textContent).toContain('5x');
  });
});

// ---------------------------------------------------------------------------
// Duplicate Detection Highlights Recently-Used Elements
// ---------------------------------------------------------------------------

describe('ContentDiversityDashboard — Duplicate Detection', () => {
  it('should highlight assets used in last 5 videos with duplicate class', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    // av-1 (lastUsedVideoIndex: 2) should be highlighted
    const duplicateAsset = container.querySelector('[data-asset-id="av-1"]');
    expect(duplicateAsset?.classList.contains('diversity-dashboard__asset--duplicate')).toBe(true);

    // av-2 (lastUsedVideoIndex: 8) should NOT be highlighted
    const safeAsset = container.querySelector('[data-asset-id="av-2"]');
    expect(safeAsset?.classList.contains('diversity-dashboard__asset--duplicate')).toBe(false);
  });

  it('should show warning label on duplicate assets', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    const warning = container.querySelector('[data-asset-id="av-1"] .diversity-dashboard__asset-warning');
    expect(warning?.textContent).toContain('2 videos ago');
  });

  it('should highlight asset used in current video', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    const currentAsset = container.querySelector('[data-asset-id="st-1"]');
    expect(currentAsset?.classList.contains('diversity-dashboard__asset--duplicate')).toBe(true);
    expect(currentAsset?.querySelector('.diversity-dashboard__asset-warning')?.textContent).toContain('in current');
  });
});

// ---------------------------------------------------------------------------
// Diversity Score Calculates Correctly
// ---------------------------------------------------------------------------

describe('ContentDiversityDashboard — Diversity Score', () => {
  it('should display diversity scores per channel', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    const channels = container.querySelectorAll('.diversity-dashboard__channel');
    expect(channels.length).toBe(2);

    const firstChannel = container.querySelector('[data-channel-id="ch-1"]');
    expect(firstChannel?.querySelector('.diversity-dashboard__channel-name')?.textContent).toBe('Tech Reviews');
    expect(firstChannel?.querySelector('.diversity-dashboard__channel-score')?.textContent).toContain('82/100');
  });

  it('should apply good/moderate/poor class based on score', () => {
    const dashboard = new ContentDiversityDashboard(container, createTestData());
    dashboard.mount();

    const goodScore = container.querySelector('[data-channel-id="ch-1"] .diversity-dashboard__channel-score');
    expect(goodScore?.classList.contains('diversity-dashboard__channel-score--good')).toBe(true);

    const moderateScore = container.querySelector('[data-channel-id="ch-2"] .diversity-dashboard__channel-score');
    expect(moderateScore?.classList.contains('diversity-dashboard__channel-score--moderate')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suggest Alternative Returns Unused Combinations
// ---------------------------------------------------------------------------

describe('ContentDiversityDashboard — Suggest Alternative', () => {
  it('should call onSuggestAlternative when suggest button is clicked', () => {
    const onSuggestAlternative = vi.fn().mockReturnValue({
      assetId: 'av-new',
      name: 'Avatar Gamma',
      type: 'avatar',
      reason: 'Not used in last 20 videos',
    });
    const dashboard = new ContentDiversityDashboard(container, createTestData(), { onSuggestAlternative });
    dashboard.mount();

    const suggestBtn = container.querySelector('[data-suggest-type="avatar"]') as HTMLElement;
    suggestBtn.click();

    expect(onSuggestAlternative).toHaveBeenCalledWith('avatar');
  });

  it('should display suggestion when returned', () => {
    const onSuggestAlternative = vi.fn().mockReturnValue({
      assetId: 'av-new',
      name: 'Avatar Gamma',
      type: 'avatar',
      reason: 'Not used in last 20 videos',
    });
    const dashboard = new ContentDiversityDashboard(container, createTestData(), { onSuggestAlternative });
    dashboard.mount();

    const suggestBtn = container.querySelector('[data-suggest-type="avatar"]') as HTMLElement;
    suggestBtn.click();

    const suggestion = container.querySelector('.diversity-dashboard__suggestion');
    expect(suggestion).toBeTruthy();
    expect(suggestion?.textContent).toContain('Avatar Gamma');
    expect(suggestion?.textContent).toContain('Not used in last 20 videos');
  });
});

// ---------------------------------------------------------------------------
// Per-Channel Diversity Tracking
// ---------------------------------------------------------------------------

describe('ContentDiversityDashboard — Per-Channel Tracking', () => {
  it('should render each channel independently', () => {
    const data = createTestData({
      channels: [
        { channelId: 'ch-1', channelName: 'Channel A', diversityScore: 90 },
        { channelId: 'ch-2', channelName: 'Channel B', diversityScore: 30 },
        { channelId: 'ch-3', channelName: 'Channel C', diversityScore: 60 },
      ],
    });
    const dashboard = new ContentDiversityDashboard(container, data);
    dashboard.mount();

    const channels = container.querySelectorAll('.diversity-dashboard__channel');
    expect(channels.length).toBe(3);

    const poorChannel = container.querySelector('[data-channel-id="ch-2"] .diversity-dashboard__channel-score');
    expect(poorChannel?.classList.contains('diversity-dashboard__channel-score--poor')).toBe(true);
  });
});
