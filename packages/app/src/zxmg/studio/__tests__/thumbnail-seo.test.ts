/**
 * Unit tests for ZXMG Video Development Studio — Thumbnail & SEO Generator
 *
 * Validates: Requirements 44d.21, 44d.22, 44d.23
 *
 * Tests thumbnail generation (minimum 3 variants), SEO metadata generation
 * with scoring, A/B test result recording, and learned pattern retrieval
 * from Zikaron.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultThumbnailSEOGenerator,
  type ThumbnailSEOGenerator,
  type ThumbnailRenderer,
  type SEOAnalyzer,
  type ABTestStore,
  type ZikaronPatternStore,
  type ABTestResult,
} from '../thumbnail-seo.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockRenderer(): ThumbnailRenderer {
  let callCount = 0;
  return {
    render: vi.fn(async (_videoId, _title, style) => {
      callCount++;
      return {
        url: `https://cdn.example.com/thumb-${callCount}.jpg`,
        predictedCTR: 5 + callCount * 2, // varying CTR values
      };
    }),
  };
}

function createMockSEOAnalyzer(): SEOAnalyzer {
  return {
    analyze: vi.fn().mockResolvedValue({
      optimizedTitle: 'Optimized: Amazing Tech Review 2024',
      optimizedDescription: 'SEO-optimized description with keywords',
      suggestedTags: ['tech', 'review', '2024', 'gadget', 'best'],
      suggestedHashtags: ['#TechReview', '#Gadgets', '#BestOf2024'],
      score: 82,
    }),
  };
}

function createMockABTestStore(): ABTestStore {
  const data = new Map<string, { videoId: string; results: ABTestResult[] }>();
  return {
    save: vi.fn(async (videoId, results) => {
      data.set(videoId, { videoId, results });
    }),
    getByChannel: vi.fn().mockResolvedValue([]),
  };
}

function createMockPatternStore(): ZikaronPatternStore {
  const patterns = new Map<string, { pattern: string; effectiveness: number }[]>();
  return {
    storePattern: vi.fn(async (channelId, pattern, effectiveness) => {
      const existing = patterns.get(channelId) ?? [];
      existing.push({ pattern, effectiveness });
      patterns.set(channelId, existing);
    }),
    getPatterns: vi.fn().mockResolvedValue([
      { pattern: 'bold-text-overlay', effectiveness: 85 },
      { pattern: 'face-close-up', effectiveness: 72 },
      { pattern: 'bright-colors', effectiveness: 68 },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultThumbnailSEOGenerator', () => {
  let generator: ThumbnailSEOGenerator;
  let renderer: ReturnType<typeof createMockRenderer>;
  let seoAnalyzer: ReturnType<typeof createMockSEOAnalyzer>;
  let abTestStore: ReturnType<typeof createMockABTestStore>;
  let patternStore: ReturnType<typeof createMockPatternStore>;

  beforeEach(() => {
    renderer = createMockRenderer();
    seoAnalyzer = createMockSEOAnalyzer();
    abTestStore = createMockABTestStore();
    patternStore = createMockPatternStore();
    generator = new DefaultThumbnailSEOGenerator(
      renderer,
      seoAnalyzer,
      abTestStore,
      patternStore,
    );
  });

  // -------------------------------------------------------------------------
  // Thumbnail Generation
  // -------------------------------------------------------------------------

  describe('generateThumbnails', () => {
    it('generates minimum 3 thumbnail variants', async () => {
      const thumbnails = await generator.generateThumbnails('video-1', 'Tech Review', 'modern');

      expect(thumbnails.length).toBeGreaterThanOrEqual(3);
      for (const thumb of thumbnails) {
        expect(thumb.id).toBeTruthy();
        expect(thumb.id).toMatch(/^thumb-/);
        expect(thumb.url).toBeTruthy();
        expect(thumb.style).toBeTruthy();
        expect(thumb.predictedCTR).toBeGreaterThan(0);
      }
    });

    it('generates requested count when above minimum', async () => {
      const thumbnails = await generator.generateThumbnails('video-1', 'Title', 'style', 5);

      expect(thumbnails.length).toBe(5);
      expect(renderer.render).toHaveBeenCalledTimes(5);
    });

    it('enforces minimum of 3 even when count is lower', async () => {
      const thumbnails = await generator.generateThumbnails('video-1', 'Title', 'style', 1);

      expect(thumbnails.length).toBe(3);
    });

    it('sorts thumbnails by predicted CTR descending', async () => {
      const thumbnails = await generator.generateThumbnails('video-1', 'Title', 'modern');

      for (let i = 0; i < thumbnails.length - 1; i++) {
        expect(thumbnails[i].predictedCTR).toBeGreaterThanOrEqual(thumbnails[i + 1].predictedCTR);
      }
    });

    it('generates unique IDs for each variant', async () => {
      const thumbnails = await generator.generateThumbnails('video-1', 'Title', 'style');

      const ids = thumbnails.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('uses style variations for each variant', async () => {
      const thumbnails = await generator.generateThumbnails('video-1', 'Title', 'modern');

      const styles = thumbnails.map((t) => t.style);
      // All styles should be based on the input style
      for (const style of styles) {
        expect(style).toContain('modern');
      }
      // Styles should be distinct
      const uniqueStyles = new Set(styles);
      expect(uniqueStyles.size).toBe(styles.length);
    });
  });

  // -------------------------------------------------------------------------
  // SEO Metadata Generation
  // -------------------------------------------------------------------------

  describe('generateSEO', () => {
    it('generates SEO metadata with score', async () => {
      const seo = await generator.generateSEO(
        'video-1',
        'Amazing Tech Review',
        'A detailed review of the latest gadget',
        'technology',
      );

      expect(seo.title).toBeTruthy();
      expect(seo.description).toBeTruthy();
      expect(seo.tags.length).toBeGreaterThan(0);
      expect(seo.hashtags.length).toBeGreaterThan(0);
      expect(seo.seoScore).toBeGreaterThanOrEqual(0);
      expect(seo.seoScore).toBeLessThanOrEqual(100);
    });

    it('returns optimized title and description', async () => {
      const seo = await generator.generateSEO(
        'video-1',
        'Tech Review',
        'Review description',
        'tech',
      );

      expect(seo.title).toBe('Optimized: Amazing Tech Review 2024');
      expect(seo.description).toBe('SEO-optimized description with keywords');
    });

    it('passes correct parameters to SEO analyzer', async () => {
      await generator.generateSEO('video-1', 'My Title', 'My Description', 'gaming');

      expect(seoAnalyzer.analyze).toHaveBeenCalledWith('My Title', 'My Description', 'gaming');
    });

    it('includes tags and hashtags from analyzer', async () => {
      const seo = await generator.generateSEO('video-1', 'Title', 'Desc', 'tech');

      expect(seo.tags).toEqual(['tech', 'review', '2024', 'gadget', 'best']);
      expect(seo.hashtags).toEqual(['#TechReview', '#Gadgets', '#BestOf2024']);
    });

    it('returns score from analyzer', async () => {
      const seo = await generator.generateSEO('video-1', 'Title', 'Desc', 'tech');

      expect(seo.seoScore).toBe(82);
    });
  });

  // -------------------------------------------------------------------------
  // A/B Test Results
  // -------------------------------------------------------------------------

  describe('recordABTestResult', () => {
    it('stores A/B test results', async () => {
      const results: ABTestResult[] = [
        { variantId: 'thumb-1', impressions: 10000, clicks: 800, ctr: 8.0, winner: true },
        { variantId: 'thumb-2', impressions: 10000, clicks: 500, ctr: 5.0, winner: false },
        { variantId: 'thumb-3', impressions: 10000, clicks: 300, ctr: 3.0, winner: false },
      ];

      await generator.recordABTestResult('video-1', results);

      expect(abTestStore.save).toHaveBeenCalledWith('video-1', results);
    });

    it('learns from winning variants', async () => {
      const results: ABTestResult[] = [
        { variantId: 'thumb-1', impressions: 10000, clicks: 800, ctr: 8.0, winner: true },
        { variantId: 'thumb-2', impressions: 10000, clicks: 500, ctr: 5.0, winner: false },
      ];

      await generator.recordABTestResult('video-1', results);

      expect(patternStore.storePattern).toHaveBeenCalledTimes(1);
      expect(patternStore.storePattern).toHaveBeenCalledWith(
        'video-1',
        expect.stringContaining('thumb-1'),
        expect.any(Number),
      );
    });

    it('learns from multiple winners', async () => {
      const results: ABTestResult[] = [
        { variantId: 'thumb-1', impressions: 5000, clicks: 400, ctr: 8.0, winner: true },
        { variantId: 'thumb-2', impressions: 5000, clicks: 350, ctr: 7.0, winner: true },
        { variantId: 'thumb-3', impressions: 5000, clicks: 100, ctr: 2.0, winner: false },
      ];

      await generator.recordABTestResult('video-1', results);

      expect(patternStore.storePattern).toHaveBeenCalledTimes(2);
    });

    it('does not learn from results with no winners', async () => {
      const results: ABTestResult[] = [
        { variantId: 'thumb-1', impressions: 100, clicks: 5, ctr: 5.0, winner: false },
        { variantId: 'thumb-2', impressions: 100, clicks: 3, ctr: 3.0, winner: false },
      ];

      await generator.recordABTestResult('video-1', results);

      expect(patternStore.storePattern).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Learned Patterns from Zikaron
  // -------------------------------------------------------------------------

  describe('getLearnedPatterns', () => {
    it('returns patterns sorted by effectiveness', async () => {
      const patterns = await generator.getLearnedPatterns('ch-1');

      expect(patterns.length).toBe(3);
      expect(patterns[0].pattern).toBe('bold-text-overlay');
      expect(patterns[0].effectiveness).toBe(85);
      expect(patterns[1].effectiveness).toBe(72);
      expect(patterns[2].effectiveness).toBe(68);
    });

    it('queries pattern store with channel ID', async () => {
      await generator.getLearnedPatterns('ch-42');

      expect(patternStore.getPatterns).toHaveBeenCalledWith('ch-42');
    });

    it('returns empty array when no patterns exist', async () => {
      (patternStore.getPatterns as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const patterns = await generator.getLearnedPatterns('new-channel');

      expect(patterns).toEqual([]);
    });

    it('patterns have required fields', async () => {
      const patterns = await generator.getLearnedPatterns('ch-1');

      for (const pattern of patterns) {
        expect(pattern.pattern).toBeTruthy();
        expect(typeof pattern.effectiveness).toBe('number');
        expect(pattern.effectiveness).toBeGreaterThanOrEqual(0);
        expect(pattern.effectiveness).toBeLessThanOrEqual(100);
      }
    });
  });
});
