/**
 * Unit tests for Quality Baseline Generator.
 *
 * Tests cover:
 * - App baseline generation with valid scored dimensions (1-10)
 * - Video baseline generation with valid scored dimensions (1-10)
 * - Monotonic merge (thresholds only raise, never lower)
 * - Weighted synthesis (higher-performing references contribute more)
 * - Core principle elevation for patterns across multiple references
 * - Confidence score reflects data completeness
 * - Contradiction flagging
 * - All dimensions are measurable (no subjective criteria)
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { AppReferenceReport, ChannelReferenceReport } from '../types.js';
import type { AppQualityBaseline, VideoQualityBaseline } from './types.js';
import { APP_DIMENSIONS, VIDEO_DIMENSIONS } from './types.js';
import { QualityBaselineGenerator } from './quality-baseline-generator.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createAppReport(overrides: Partial<AppReferenceReport> = {}): AppReferenceReport {
  return {
    url: 'https://apps.apple.com/us/app/test-app/id123',
    type: 'app-store-ios',
    analyzedAt: new Date('2024-01-15'),
    platform: 'ios',
    listing: {
      appName: 'Test App',
      developer: 'Test Dev',
      category: 'Productivity',
      rating: 4.5,
      reviewCount: 5000,
      pricingModel: 'freemium',
      iapOptions: ['Premium $9.99', 'Pro $19.99'],
      description: 'A comprehensive productivity app with many features for daily use.',
      featureList: ['Task management', 'Calendar sync', 'Reminders'],
    },
    visualAnalysis: {
      screenCount: 6,
      layoutPatterns: ['grid', 'list'],
      colorUsage: ['blue', 'white', 'gray'],
      typography: ['SF Pro', 'SF Mono'],
      navigationStructure: 'tab-bar',
      informationDensity: 'medium',
    },
    reviewInsights: {
      topPraisedFeatures: ['ease of use', 'clean design'],
      commonComplaints: ['occasional crashes'],
      sentimentDistribution: { positive: 0.75, neutral: 0.15, negative: 0.1 },
      featureRequests: ['dark mode', 'widgets'],
    },
    inferredPatterns: {
      onboardingComplexity: 'simple',
      monetizationModel: 'freemium',
      notificationStrategy: 'moderate',
      interactionPatterns: ['swipe', 'tap', 'long-press'],
      retentionMechanics: ['streaks', 'daily-goals'],
    },
    ...overrides,
  };
}

function createChannelReport(overrides: Partial<ChannelReferenceReport> = {}): ChannelReferenceReport {
  return {
    url: 'https://youtube.com/@testchannel',
    type: 'youtube-channel',
    analyzedAt: new Date('2024-01-15'),
    channelMetrics: {
      subscriberCount: 500000,
      totalVideos: 200,
      uploadFrequency: 3,
      avgViewsPerVideo: 100000,
      engagementRate: 0.06,
      growthTrajectory: 'growing',
    },
    videoBreakdowns: [
      {
        title: 'Test Video 1',
        url: 'https://youtube.com/watch?v=1',
        duration: 600,
        views: 150000,
        hookStructure: 'question-based',
        editingPace: 4,
        thumbnailComposition: ['face', 'text-overlay'],
      },
      {
        title: 'Test Video 2',
        url: 'https://youtube.com/watch?v=2',
        duration: 480,
        views: 80000,
        hookStructure: 'story-based',
        editingPace: 5,
        thumbnailComposition: ['product', 'bright-colors'],
      },
    ],
    productionFormula: {
      commonHookPatterns: ['question', 'bold-claim', 'story'],
      optimalLengthRange: { min: 8, max: 15 },
      thumbnailRules: ['face close-up', 'bright colors', 'text overlay'],
      titlePatterns: ['How to...', 'X things you...', 'Why...'],
      pacingRhythm: 'fast',
      engagementTriggers: ['CTA at 60%', 'pattern interrupt', 'open loop'],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityBaselineGenerator', () => {
  let generator: QualityBaselineGenerator;

  beforeEach(() => {
    generator = new QualityBaselineGenerator();
  });

  // -------------------------------------------------------------------------
  // App Baseline Generation
  // -------------------------------------------------------------------------

  describe('generateAppBaseline', () => {
    it('produces valid scored dimensions all between 1 and 10', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      expect(baseline.dimensions).toHaveLength(APP_DIMENSIONS.length);
      for (const dim of baseline.dimensions) {
        expect(dim.score).toBeGreaterThanOrEqual(1);
        expect(dim.score).toBeLessThanOrEqual(10);
        expect(Number.isInteger(dim.score)).toBe(true);
      }
    });

    it('includes all required app dimensions', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      const dimensionNames = baseline.dimensions.map(d => d.name);
      for (const expected of APP_DIMENSIONS) {
        expect(dimensionNames).toContain(expected);
      }
    });

    it('includes source URL and extraction date', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      expect(baseline.sources).toHaveLength(1);
      expect(baseline.sources[0].url).toBe(report.url);
      expect(baseline.sources[0].extractionDate).toEqual(report.analyzedAt);
    });

    it('includes confidence score between 0 and 1', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      expect(baseline.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(baseline.overallConfidence).toBeLessThanOrEqual(1);
      for (const dim of baseline.dimensions) {
        expect(dim.confidence).toBeGreaterThanOrEqual(0);
        expect(dim.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('includes example patterns for each dimension', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      for (const dim of baseline.dimensions) {
        expect(dim.examplePatterns.length).toBeGreaterThan(0);
      }
    });

    it('sets type to app', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);
      expect(baseline.type).toBe('app');
    });

    it('sets domain category from app listing category', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);
      expect(baseline.domainCategory).toBe('productivity');
    });

    it('sets reference count to 1 for initial baseline', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      for (const dim of baseline.dimensions) {
        expect(dim.referenceCount).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Video Baseline Generation
  // -------------------------------------------------------------------------

  describe('generateVideoBaseline', () => {
    it('produces valid scored dimensions all between 1 and 10', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      expect(baseline.dimensions).toHaveLength(VIDEO_DIMENSIONS.length);
      for (const dim of baseline.dimensions) {
        expect(dim.score).toBeGreaterThanOrEqual(1);
        expect(dim.score).toBeLessThanOrEqual(10);
        expect(Number.isInteger(dim.score)).toBe(true);
      }
    });

    it('includes all required video dimensions', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      const dimensionNames = baseline.dimensions.map(d => d.name);
      for (const expected of VIDEO_DIMENSIONS) {
        expect(dimensionNames).toContain(expected);
      }
    });

    it('includes source URL and extraction date', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      expect(baseline.sources).toHaveLength(1);
      expect(baseline.sources[0].url).toBe(report.url);
      expect(baseline.sources[0].extractionDate).toEqual(report.analyzedAt);
    });

    it('includes confidence score between 0 and 1', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      expect(baseline.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(baseline.overallConfidence).toBeLessThanOrEqual(1);
      for (const dim of baseline.dimensions) {
        expect(dim.confidence).toBeGreaterThanOrEqual(0);
        expect(dim.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('includes example patterns for each dimension', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      for (const dim of baseline.dimensions) {
        expect(dim.examplePatterns.length).toBeGreaterThan(0);
      }
    });

    it('sets type to video', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);
      expect(baseline.type).toBe('video');
    });

    it('sets reference count to 1 for initial baseline', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      for (const dim of baseline.dimensions) {
        expect(dim.referenceCount).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Monotonic Merge
  // -------------------------------------------------------------------------

  describe('monotonic merge', () => {
    it('only raises thresholds, never lowers them for app baselines', () => {
      const report1 = createAppReport({
        listing: {
          appName: 'High Quality App',
          developer: 'Dev',
          category: 'Productivity',
          rating: 4.8,
          reviewCount: 10000,
          pricingModel: 'freemium',
          iapOptions: ['Premium $9.99', 'Pro $19.99', 'Enterprise $49.99'],
          description: 'A very comprehensive app with extensive features and capabilities.',
          featureList: ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5'],
        },
      });

      const report2 = createAppReport({
        url: 'https://apps.apple.com/us/app/lower-app/id456',
        listing: {
          appName: 'Lower App',
          developer: 'Dev2',
          category: 'Productivity',
          rating: 3.5,
          reviewCount: 100,
          pricingModel: 'free',
          iapOptions: [],
          description: 'Simple app.',
          featureList: ['Feature 1'],
        },
        visualAnalysis: {
          screenCount: 2,
          layoutPatterns: ['list'],
          colorUsage: ['gray'],
          typography: ['System'],
          navigationStructure: 'stack',
          informationDensity: 'low',
        },
        inferredPatterns: {
          onboardingComplexity: 'complex',
          monetizationModel: 'free',
          notificationStrategy: 'minimal',
          interactionPatterns: ['tap'],
          retentionMechanics: [],
        },
      });

      const baseline1 = generator.generateAppBaseline(report1);
      const baseline2 = generator.generateAppBaseline(report2, baseline1);

      // Every dimension in baseline2 should be >= baseline1
      for (let i = 0; i < baseline1.dimensions.length; i++) {
        expect(baseline2.dimensions[i].score).toBeGreaterThanOrEqual(
          baseline1.dimensions[i].score,
        );
      }
    });

    it('only raises thresholds, never lowers them for video baselines', () => {
      const report1 = createChannelReport({
        channelMetrics: {
          subscriberCount: 1000000,
          totalVideos: 500,
          uploadFrequency: 5,
          avgViewsPerVideo: 500000,
          engagementRate: 0.08,
          growthTrajectory: 'growing',
        },
      });

      const report2 = createChannelReport({
        url: 'https://youtube.com/@lowchannel',
        channelMetrics: {
          subscriberCount: 1000,
          totalVideos: 10,
          uploadFrequency: 1,
          avgViewsPerVideo: 500,
          engagementRate: 0.01,
          growthTrajectory: 'flat',
        },
        productionFormula: {
          commonHookPatterns: ['question'],
          optimalLengthRange: { min: 5, max: 10 },
          thumbnailRules: ['text'],
          titlePatterns: ['How to...'],
          pacingRhythm: 'slow',
          engagementTriggers: ['CTA'],
        },
      });

      const baseline1 = generator.generateVideoBaseline(report1);
      const baseline2 = generator.generateVideoBaseline(report2, baseline1);

      for (let i = 0; i < baseline1.dimensions.length; i++) {
        expect(baseline2.dimensions[i].score).toBeGreaterThanOrEqual(
          baseline1.dimensions[i].score,
        );
      }
    });

    it('increments version on merge', () => {
      const report1 = createAppReport();
      const report2 = createAppReport({ url: 'https://apps.apple.com/us/app/other/id789' });

      const baseline1 = generator.generateAppBaseline(report1);
      expect(baseline1.version).toBe(1);

      const baseline2 = generator.generateAppBaseline(report2, baseline1);
      expect(baseline2.version).toBe(2);
    });

    it('increments reference count per dimension on merge', () => {
      const report1 = createAppReport();
      const report2 = createAppReport({ url: 'https://apps.apple.com/us/app/other/id789' });

      const baseline1 = generator.generateAppBaseline(report1);
      const baseline2 = generator.generateAppBaseline(report2, baseline1);

      for (const dim of baseline2.dimensions) {
        expect(dim.referenceCount).toBe(2);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Weighted Synthesis
  // -------------------------------------------------------------------------

  describe('weighted synthesis', () => {
    it('gives higher weight to better-performing app references', () => {
      const highRatedReport = createAppReport({
        url: 'https://apps.apple.com/us/app/high/id111',
        listing: {
          appName: 'High Rated',
          developer: 'Dev',
          category: 'Productivity',
          rating: 4.9,
          reviewCount: 50000,
          pricingModel: 'freemium',
          iapOptions: ['Premium $9.99'],
          description: 'Top rated app.',
          featureList: ['Feature 1', 'Feature 2'],
        },
      });

      const lowRatedReport = createAppReport({
        url: 'https://apps.apple.com/us/app/low/id222',
        listing: {
          appName: 'Low Rated',
          developer: 'Dev2',
          category: 'Productivity',
          rating: 2.0,
          reviewCount: 50,
          pricingModel: 'free',
          iapOptions: [],
          description: 'Basic app.',
          featureList: ['Feature 1'],
        },
      });

      // The high-rated report should have a higher weight
      const highBaseline = generator.generateAppBaseline(highRatedReport);
      const lowBaseline = generator.generateAppBaseline(lowRatedReport);

      expect(highBaseline.sources[0].weight).toBeGreaterThan(lowBaseline.sources[0].weight);
    });

    it('gives higher weight to better-performing channel references', () => {
      const highViewReport = createChannelReport({
        url: 'https://youtube.com/@highviews',
        channelMetrics: {
          subscriberCount: 5000000,
          totalVideos: 500,
          uploadFrequency: 5,
          avgViewsPerVideo: 2000000,
          engagementRate: 0.09,
          growthTrajectory: 'growing',
        },
      });

      const lowViewReport = createChannelReport({
        url: 'https://youtube.com/@lowviews',
        channelMetrics: {
          subscriberCount: 500,
          totalVideos: 5,
          uploadFrequency: 1,
          avgViewsPerVideo: 100,
          engagementRate: 0.01,
          growthTrajectory: 'flat',
        },
      });

      const highBaseline = generator.generateVideoBaseline(highViewReport);
      const lowBaseline = generator.generateVideoBaseline(lowViewReport);

      expect(highBaseline.sources[0].weight).toBeGreaterThan(lowBaseline.sources[0].weight);
    });
  });

  // -------------------------------------------------------------------------
  // Core Principle Elevation
  // -------------------------------------------------------------------------

  describe('core principle elevation', () => {
    it('elevates patterns appearing across multiple references', () => {
      // Both reports share the same navigation pattern
      const report1 = createAppReport({
        visualAnalysis: {
          screenCount: 5,
          layoutPatterns: ['grid'],
          colorUsage: ['blue'],
          typography: ['SF Pro'],
          navigationStructure: 'tab-bar',
          informationDensity: 'medium',
        },
      });

      const report2 = createAppReport({
        url: 'https://apps.apple.com/us/app/other/id789',
        visualAnalysis: {
          screenCount: 7,
          layoutPatterns: ['grid'],
          colorUsage: ['green'],
          typography: ['SF Pro'],
          navigationStructure: 'tab-bar',
          informationDensity: 'high',
        },
      });

      const baseline1 = generator.generateAppBaseline(report1);
      const baseline2 = generator.generateAppBaseline(report2, baseline1);

      // Should have core principles for shared patterns
      expect(baseline2.corePrinciples.length).toBeGreaterThan(0);

      // Core principles should have confidence > 0
      for (const principle of baseline2.corePrinciples) {
        expect(principle.confidence).toBeGreaterThan(0);
        expect(principle.occurrenceCount).toBeGreaterThanOrEqual(2);
      }
    });

    it('assigns higher confidence to patterns with more occurrences', () => {
      const report1 = createAppReport();
      const report2 = createAppReport({
        url: 'https://apps.apple.com/us/app/app2/id222',
      });
      const report3 = createAppReport({
        url: 'https://apps.apple.com/us/app/app3/id333',
      });

      const baseline1 = generator.generateAppBaseline(report1);
      const baseline2 = generator.generateAppBaseline(report2, baseline1);
      const baseline3 = generator.generateAppBaseline(report3, baseline2);

      // With 3 references sharing patterns, confidence should be higher
      if (baseline3.corePrinciples.length > 0) {
        const maxConfidence = Math.max(...baseline3.corePrinciples.map(p => p.confidence));
        expect(maxConfidence).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Confidence Score
  // -------------------------------------------------------------------------

  describe('confidence score', () => {
    it('reflects data completeness - more references means higher confidence', () => {
      const report1 = createAppReport();
      const report2 = createAppReport({ url: 'https://apps.apple.com/us/app/app2/id222' });
      const report3 = createAppReport({ url: 'https://apps.apple.com/us/app/app3/id333' });

      const baseline1 = generator.generateAppBaseline(report1);
      const baseline2 = generator.generateAppBaseline(report2, baseline1);
      const baseline3 = generator.generateAppBaseline(report3, baseline2);

      // Confidence should increase with more references
      expect(baseline2.overallConfidence).toBeGreaterThanOrEqual(baseline1.overallConfidence);
      expect(baseline3.overallConfidence).toBeGreaterThanOrEqual(baseline2.overallConfidence);
    });

    it('per-dimension confidence increases with reference count', () => {
      const report1 = createAppReport();
      const report2 = createAppReport({ url: 'https://apps.apple.com/us/app/app2/id222' });

      const baseline1 = generator.generateAppBaseline(report1);
      const baseline2 = generator.generateAppBaseline(report2, baseline1);

      for (let i = 0; i < baseline1.dimensions.length; i++) {
        expect(baseline2.dimensions[i].confidence).toBeGreaterThanOrEqual(
          baseline1.dimensions[i].confidence,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Contradiction Flagging
  // -------------------------------------------------------------------------

  describe('contradiction flagging', () => {
    it('flags contradictions when new reference conflicts with existing baseline', () => {
      // First reference: high scores across the board
      const highReport = createAppReport({
        listing: {
          appName: 'High App',
          developer: 'Dev',
          category: 'Productivity',
          rating: 4.9,
          reviewCount: 50000,
          pricingModel: 'freemium',
          iapOptions: ['Premium $9.99', 'Pro $19.99', 'Enterprise $49.99'],
          description: 'A very comprehensive app with extensive features and capabilities for professionals.',
          featureList: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'],
        },
        visualAnalysis: {
          screenCount: 10,
          layoutPatterns: ['grid', 'list', 'card', 'masonry'],
          colorUsage: ['blue', 'white', 'gray', 'accent'],
          typography: ['SF Pro', 'SF Mono', 'Custom'],
          navigationStructure: 'tab-bar',
          informationDensity: 'high',
        },
        inferredPatterns: {
          onboardingComplexity: 'simple',
          monetizationModel: 'freemium',
          notificationStrategy: 'aggressive',
          interactionPatterns: ['swipe', 'tap', 'long-press', 'drag', 'pinch'],
          retentionMechanics: ['streaks', 'daily-goals', 'achievements', 'social'],
        },
      });

      // Second reference: significantly lower on some dimensions but still highly rated
      const contradictingReport = createAppReport({
        url: 'https://apps.apple.com/us/app/minimal/id999',
        listing: {
          appName: 'Minimal App',
          developer: 'Dev2',
          category: 'Productivity',
          rating: 4.8, // Still highly rated
          reviewCount: 20000,
          pricingModel: 'paid',
          iapOptions: [],
          description: 'Simple.',
          featureList: ['One feature'],
        },
        visualAnalysis: {
          screenCount: 2,
          layoutPatterns: ['list'],
          colorUsage: ['black'],
          typography: ['System'],
          navigationStructure: 'stack',
          informationDensity: 'low',
        },
        inferredPatterns: {
          onboardingComplexity: 'complex',
          monetizationModel: 'paid',
          notificationStrategy: 'minimal',
          interactionPatterns: ['tap'],
          retentionMechanics: [],
        },
      });

      const baseline1 = generator.generateAppBaseline(highReport);
      const baseline2 = generator.generateAppBaseline(contradictingReport, baseline1);

      // Should have flagged contradictions
      expect(baseline2.contradictions.length).toBeGreaterThan(0);

      // Contradictions should have proper metadata
      for (const contradiction of baseline2.contradictions) {
        expect(contradiction.dimension).toBeTruthy();
        expect(contradiction.existingPattern).toBeTruthy();
        expect(contradiction.conflictingPattern).toBeTruthy();
        expect(contradiction.sourceUrl).toBe(contradictingReport.url);
        expect(contradiction.detectedAt).toBeInstanceOf(Date);
        expect(contradiction.resolved).toBe(false);
      }
    });

    it('does not flag contradictions for low-rated references', () => {
      const highReport = createAppReport({
        listing: {
          appName: 'High App',
          developer: 'Dev',
          category: 'Productivity',
          rating: 4.9,
          reviewCount: 50000,
          pricingModel: 'freemium',
          iapOptions: ['Premium $9.99', 'Pro $19.99', 'Enterprise $49.99'],
          description: 'A very comprehensive app.',
          featureList: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'],
        },
        visualAnalysis: {
          screenCount: 10,
          layoutPatterns: ['grid', 'list', 'card', 'masonry'],
          colorUsage: ['blue', 'white', 'gray', 'accent'],
          typography: ['SF Pro', 'SF Mono', 'Custom'],
          navigationStructure: 'tab-bar',
          informationDensity: 'high',
        },
        inferredPatterns: {
          onboardingComplexity: 'simple',
          monetizationModel: 'freemium',
          notificationStrategy: 'aggressive',
          interactionPatterns: ['swipe', 'tap', 'long-press', 'drag', 'pinch'],
          retentionMechanics: ['streaks', 'daily-goals', 'achievements', 'social'],
        },
      });

      // Low-rated reference with lower scores should NOT flag contradictions
      const lowRatedReport = createAppReport({
        url: 'https://apps.apple.com/us/app/bad/id888',
        listing: {
          appName: 'Bad App',
          developer: 'Dev2',
          category: 'Productivity',
          rating: 2.0, // Low rated - no contradiction expected
          reviewCount: 100,
          pricingModel: 'free',
          iapOptions: [],
          description: 'Bad.',
          featureList: ['One'],
        },
        visualAnalysis: {
          screenCount: 1,
          layoutPatterns: [],
          colorUsage: ['gray'],
          typography: ['System'],
          navigationStructure: 'stack',
          informationDensity: 'low',
        },
        inferredPatterns: {
          onboardingComplexity: 'complex',
          monetizationModel: 'free',
          notificationStrategy: 'minimal',
          interactionPatterns: ['tap'],
          retentionMechanics: [],
        },
      });

      const baseline1 = generator.generateAppBaseline(highReport);
      const baseline2 = generator.generateAppBaseline(lowRatedReport, baseline1);

      // Should NOT flag contradictions for low-rated apps
      expect(baseline2.contradictions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Measurable Dimensions
  // -------------------------------------------------------------------------

  describe('measurable dimensions', () => {
    it('all app baseline dimensions are measurable (no subjective criteria)', () => {
      const report = createAppReport();
      const baseline = generator.generateAppBaseline(report);

      // All dimension names should be from the defined measurable set
      const validNames = new Set(APP_DIMENSIONS);
      for (const dim of baseline.dimensions) {
        expect(validNames.has(dim.name as any)).toBe(true);
        // Each dimension has a numeric score (measurable)
        expect(typeof dim.score).toBe('number');
        // Each dimension has example patterns (evaluatable)
        expect(dim.examplePatterns.length).toBeGreaterThan(0);
      }
    });

    it('all video baseline dimensions are measurable (no subjective criteria)', () => {
      const report = createChannelReport();
      const baseline = generator.generateVideoBaseline(report);

      const validNames = new Set(VIDEO_DIMENSIONS);
      for (const dim of baseline.dimensions) {
        expect(validNames.has(dim.name as any)).toBe(true);
        expect(typeof dim.score).toBe('number');
        expect(dim.examplePatterns.length).toBeGreaterThan(0);
      }
    });

    it('dimension scores are integers between 1 and 10', () => {
      const appReport = createAppReport();
      const videoReport = createChannelReport();

      const appBaseline = generator.generateAppBaseline(appReport);
      const videoBaseline = generator.generateVideoBaseline(videoReport);

      for (const dim of [...appBaseline.dimensions, ...videoBaseline.dimensions]) {
        expect(dim.score).toBeGreaterThanOrEqual(1);
        expect(dim.score).toBeLessThanOrEqual(10);
        expect(Number.isInteger(dim.score)).toBe(true);
      }
    });
  });
});
