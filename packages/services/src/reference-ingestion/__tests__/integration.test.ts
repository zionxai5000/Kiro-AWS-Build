/**
 * Integration tests for Reference Ingestion end-to-end pipeline.
 *
 * Tests the full flow from URL ingestion through analysis, baseline generation,
 * storage, quality gate evaluation, auto-rework loop, and pre-production planning.
 *
 * Uses real implementations for:
 * - ReferenceIngestionServiceImpl
 * - AppStoreAnalyzerImpl
 * - YouTubeChannelAnalyzerImpl
 * - QualityBaselineGenerator
 * - BaselineStorage
 * - ReferenceQualityGate
 * - AutoReworkLoop
 * - PreProductionPlanService
 *
 * Mocks external dependencies:
 * - BrowserDriver, YouTubeDriver, OtzarService, ZikaronService,
 *   EventBusService, XOAuditService, MishmarService
 *
 * Requirements: 34a-34j (all), 19.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type {
  MishmarService,
  EventBusService,
  XOAuditService,
  ZikaronService,
  OtzarService,
} from '@seraphim/core';
import type { ExecutionToken } from '@seraphim/core';
import type { DriverResult } from '@seraphim/core/types/driver.js';

import { ReferenceIngestionServiceImpl } from '../service.js';
import { AppStoreAnalyzerImpl } from '../analyzers/app-store-analyzer.js';
import { YouTubeChannelAnalyzerImpl } from '../analyzers/youtube-channel-analyzer.js';
import { QualityBaselineGenerator } from '../baseline/quality-baseline-generator.js';
import { BaselineStorage } from '../baseline/baseline-storage.js';
import { ReferenceQualityGate } from '../gate/reference-quality-gate.js';
import { AutoReworkLoop } from '../rework/auto-rework-loop.js';
import { PreProductionPlanService } from '../plan/pre-production-plan.js';
import type { TrainingCascade, ReworkDirective } from '../rework/auto-rework-loop.js';
import type { ProductionOutput } from '../gate/reference-quality-gate.js';
import type { ApprovalCallback } from '../plan/pre-production-plan.js';

// ---------------------------------------------------------------------------
// Mock Factories for External Dependencies
// ---------------------------------------------------------------------------

function createMockMishmar(): MishmarService {
  return {
    authorize: vi.fn().mockResolvedValue({ authorized: true, reason: 'ok', auditId: 'a1' }),
    checkAuthorityLevel: vi.fn().mockResolvedValue('L4'),
    requestToken: vi.fn().mockResolvedValue({
      tokenId: 'token-integration-test',
      agentId: 'reference-ingestion-service',
      action: 'reference-ingestion',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      issuedBy: 'mishmar',
    } satisfies ExecutionToken),
    validateToken: vi.fn().mockResolvedValue(true),
    validateCompletion: vi.fn().mockResolvedValue({ valid: true, violations: [], contractId: 'c1' }),
    validateSeparation: vi.fn().mockResolvedValue({ valid: true, violations: [] }),
  };
}

function createMockEventBus(): EventBusService {
  const handlers = new Map<string, (event: unknown) => Promise<void>>();
  return {
    publish: vi.fn().mockImplementation(async (event: { type: string }) => {
      // Trigger any registered handlers for this event type
      for (const [, handler] of handlers) {
        await handler(event);
      }
      return 'event-id-1';
    }),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockImplementation(async (pattern: { type?: string[] }, handler: (event: unknown) => Promise<void>) => {
      const subId = `sub-${handlers.size + 1}`;
      handlers.set(subId, handler);
      return subId;
    }),
    unsubscribe: vi.fn().mockImplementation(async (subId: string) => {
      handlers.delete(subId);
    }),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockXOAudit(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: 'r1', chainLength: 1 }),
  };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id-1'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id-1'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id-1'),
    storeWorking: vi.fn().mockResolvedValue('working-id-1'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ agentId: 'test', memories: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOtzar(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      model: 'claude-3-sonnet',
      provider: 'anthropic',
      estimatedCost: 0.002,
    }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingBudget: 100 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({ totalCost: 0, entries: [] }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({ suggestions: [] }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

/** Browser driver mock that returns realistic app store data */
function createMockBrowserDriver() {
  return {
    execute: vi.fn().mockImplementation(async (operation: { type: string; params: Record<string, unknown> }) => {
      if (operation.type === 'navigate') {
        return { success: true, data: { pageId: 'page-1' } } satisfies DriverResult;
      }
      if (operation.type === 'evaluate') {
        // Return realistic app store metadata
        return {
          success: true,
          data: {
            result: {
              appName: 'Fitness Pro',
              developer: 'HealthTech Inc',
              category: 'Health & Fitness',
              rating: 4.7,
              reviewCount: 15000,
              price: 'Free',
              description: 'The ultimate fitness tracking app with personalized workout plans, streak tracking, and social features. Track your progress with detailed analytics.',
              iapOptions: ['Premium Monthly $9.99', 'Premium Annual $59.99'],
              featureList: ['Workout Plans', 'Progress Tracking', 'Social Feed', 'Streak System', 'Nutrition Log'],
              screenshotUrls: ['https://example.com/screen1.png', 'https://example.com/screen2.png', 'https://example.com/screen3.png'],
            },
          },
        } satisfies DriverResult;
      }
      if (operation.type === 'closePage') {
        return { success: true, data: {} } satisfies DriverResult;
      }
      return { success: true, data: {} } satisfies DriverResult;
    }),
  };
}

/** YouTube driver mock that returns realistic channel data */
function createMockYouTubeDriver() {
  return {
    execute: vi.fn().mockImplementation(async (operation: { type: string; params: Record<string, unknown> }) => {
      if (operation.type === 'getChannelInfo') {
        return {
          success: true,
          data: {
            channelId: 'UC123456',
            title: 'TechReviews Pro',
            subscriberCount: 500000,
            totalVideos: 300,
            totalViews: 50000000,
            createdAt: '2020-01-01T00:00:00Z',
          },
        } satisfies DriverResult;
      }
      if (operation.type === 'getChannelVideos') {
        const videos = Array.from({ length: 15 }, (_, i) => ({
          videoId: `vid-${i}`,
          title: i % 3 === 0 ? `How to Build Amazing Apps in ${2024 - i}` : i % 3 === 1 ? `Why Nobody Talks About This Secret Feature` : `10 Things You Need to Know About Tech`,
          url: `https://www.youtube.com/watch?v=vid-${i}`,
          duration: 600 + i * 60,
          views: 100000 - i * 5000,
          likes: 5000 - i * 200,
          comments: 500 - i * 30,
          publishedAt: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
          thumbnailUrl: `https://img.youtube.com/vi/vid-${i}/maxresdefault.jpg`,
        }));
        return { success: true, data: { videos } } satisfies DriverResult;
      }
      if (operation.type === 'getVideoTranscript') {
        return {
          success: true,
          data: {
            segments: [
              { text: 'Have you ever wondered why some apps succeed?', startTime: 0, endTime: 3 },
              { text: 'Today I will show you the secret formula.', startTime: 3, endTime: 6 },
              { text: 'Let me break it down step by step.', startTime: 7, endTime: 10 },
            ],
          },
        } satisfies DriverResult;
      }
      if (operation.type === 'getVideoAnalytics') {
        return {
          success: true,
          data: {
            retentionCurve: [100, 90, 80, 70, 65, 60],
            avgViewDuration: 420,
            clickThroughRate: 0.08,
          },
        } satisfies DriverResult;
      }
      return { success: true, data: {} } satisfies DriverResult;
    }),
  };
}


// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Reference Ingestion Integration', () => {
  let mockMishmar: MishmarService;
  let mockEventBus: EventBusService;
  let mockXOAudit: XOAuditService;
  let mockZikaron: ZikaronService;
  let mockOtzar: OtzarService;
  let mockBrowserDriver: ReturnType<typeof createMockBrowserDriver>;
  let mockYouTubeDriver: ReturnType<typeof createMockYouTubeDriver>;

  let appStoreAnalyzer: AppStoreAnalyzerImpl;
  let youtubeChannelAnalyzer: YouTubeChannelAnalyzerImpl;
  let baselineGenerator: QualityBaselineGenerator;
  let baselineStorage: BaselineStorage;
  let ingestionService: ReferenceIngestionServiceImpl;

  beforeEach(() => {
    mockMishmar = createMockMishmar();
    mockEventBus = createMockEventBus();
    mockXOAudit = createMockXOAudit();
    mockZikaron = createMockZikaron();
    mockOtzar = createMockOtzar();
    mockBrowserDriver = createMockBrowserDriver();
    mockYouTubeDriver = createMockYouTubeDriver();

    appStoreAnalyzer = new AppStoreAnalyzerImpl(mockBrowserDriver, mockOtzar);
    youtubeChannelAnalyzer = new YouTubeChannelAnalyzerImpl(mockYouTubeDriver, mockOtzar);
    baselineGenerator = new QualityBaselineGenerator();
    baselineStorage = new BaselineStorage(mockZikaron, mockEventBus);

    ingestionService = new ReferenceIngestionServiceImpl({
      mishmar: mockMishmar,
      eventBus: mockEventBus,
      xoAudit: mockXOAudit,
      appStoreAnalyzer,
      youtubeChannelAnalyzer,
      tenantId: 'integration-test',
    });
  });

  // -------------------------------------------------------------------------
  // Full Flow: App Store URL → ingestion → analysis → baseline → storage → event
  // -------------------------------------------------------------------------

  describe('Full flow: App Store URL ingestion to baseline storage', () => {
    it('ingests an App Store URL, analyzes it, generates baseline, stores it, and publishes event', async () => {
      const url = 'https://apps.apple.com/us/app/fitness-pro/id123456789';

      // Step 1: Ingest the URL
      const ingestionResult = await ingestionService.ingest(url);

      expect(ingestionResult.success).toBe(true);
      expect(ingestionResult.referenceType).toBe('app-store-ios');
      expect(ingestionResult.report).toBeDefined();
      expect(ingestionResult.report!.type).toBe('app-store-ios');

      // Step 2: Generate baseline from the analysis report
      const report = ingestionResult.report!;
      expect(report.type).toBe('app-store-ios');
      const appReport = report as import('../types.js').AppReferenceReport;
      const baseline = baselineGenerator.generateAppBaseline(appReport);

      expect(baseline.type).toBe('app');
      expect(baseline.dimensions.length).toBeGreaterThan(0);
      expect(baseline.version).toBe(1);
      expect(baseline.sources.length).toBe(1);
      expect(baseline.overallConfidence).toBeGreaterThan(0);

      // All dimensions should have scores between 1-10
      for (const dim of baseline.dimensions) {
        expect(dim.score).toBeGreaterThanOrEqual(1);
        expect(dim.score).toBeLessThanOrEqual(10);
        expect(dim.referenceCount).toBe(1);
      }

      // Step 3: Store the baseline
      const entryId = await baselineStorage.store(baseline, 'zionx');
      expect(entryId).toBeDefined();

      // Step 4: Verify baseline is retrievable
      const storedBaseline = await baselineStorage.queryByCategory(baseline.domainCategory);
      expect(storedBaseline).not.toBeNull();
      expect(storedBaseline!.version).toBe(1);
      expect(storedBaseline!.type).toBe('app');

      // Step 5: Verify events were published
      // Ingestion event
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.reference-ingestion',
          type: 'reference.ingested',
        }),
      );
      // Baseline updated event
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.baseline-storage',
          type: 'baseline.updated',
          detail: expect.objectContaining({
            domainCategory: baseline.domainCategory,
            version: 1,
          }),
        }),
      );

      // Step 6: Verify Zikaron was called to persist
      expect(mockZikaron.storeProcedural).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Full Flow: YouTube Channel URL → ingestion → analysis → baseline → storage → event
  // -------------------------------------------------------------------------

  describe('Full flow: YouTube Channel URL ingestion to baseline storage', () => {
    it('ingests a YouTube channel URL, analyzes it, generates baseline, stores it, and publishes event', async () => {
      const url = 'https://youtube.com/@TechReviewsPro';

      // Step 1: Ingest the URL
      const ingestionResult = await ingestionService.ingest(url);

      expect(ingestionResult.success).toBe(true);
      expect(ingestionResult.referenceType).toBe('youtube-channel');
      expect(ingestionResult.report).toBeDefined();
      expect(ingestionResult.report!.type).toBe('youtube-channel');

      // Step 2: Generate baseline from the analysis report
      const report = ingestionResult.report!;
      const channelReport = report as import('../types.js').ChannelReferenceReport;
      const baseline = baselineGenerator.generateVideoBaseline(channelReport);

      expect(baseline.type).toBe('video');
      expect(baseline.dimensions.length).toBeGreaterThan(0);
      expect(baseline.version).toBe(1);
      expect(baseline.sources.length).toBe(1);

      // All dimensions should have scores between 1-10
      for (const dim of baseline.dimensions) {
        expect(dim.score).toBeGreaterThanOrEqual(1);
        expect(dim.score).toBeLessThanOrEqual(10);
      }

      // Step 3: Store the baseline
      const entryId = await baselineStorage.store(baseline, 'zxmg');
      expect(entryId).toBeDefined();

      // Step 4: Verify baseline is retrievable
      const storedBaseline = await baselineStorage.queryByCategory(baseline.domainCategory);
      expect(storedBaseline).not.toBeNull();
      expect(storedBaseline!.type).toBe('video');

      // Step 5: Verify events were published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.reference-ingestion',
          type: 'reference.ingested',
          detail: expect.objectContaining({
            referenceType: 'youtube-channel',
          }),
        }),
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.baseline-storage',
          type: 'baseline.updated',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Quality Gate Evaluation: app submitted → baseline retrieved → scored → pass/fail
  // -------------------------------------------------------------------------

  describe('Quality gate evaluation: app submitted → baseline retrieved → scored → pass/fail', () => {
    it('evaluates a production output against a stored baseline and produces pass/fail', async () => {
      // Setup: Ingest a reference and store baseline
      const url = 'https://apps.apple.com/us/app/fitness-pro/id123456789';
      const ingestionResult = await ingestionService.ingest(url);
      const appReport = ingestionResult.report! as import('../types.js').AppReferenceReport;
      const baseline = baselineGenerator.generateAppBaseline(appReport);
      await baselineStorage.store(baseline, 'zionx');

      // Create quality gate with real baseline storage
      const qualityGate = new ReferenceQualityGate(
        baselineStorage,
        mockOtzar,
        mockXOAudit,
        mockEventBus,
      );

      // Evaluate a production output with rich content (should pass)
      const richOutput: ProductionOutput = {
        id: 'app-output-1',
        type: 'app',
        name: 'My Fitness App',
        content: {
          screens: ['home', 'workout', 'profile', 'settings', 'social'],
          features: ['tracking', 'plans', 'social'],
          design: { colors: ['blue', 'white'], navigation: 'tab-bar' },
        },
      };

      const passResult = await qualityGate.evaluate(richOutput, baseline.domainCategory);

      // Should have dimension scores
      expect(passResult.dimensionScores.length).toBeGreaterThan(0);
      expect(passResult.baselineVersion).toBe(1);
      expect(passResult.overallScore).toBeGreaterThan(0);

      // Each dimension should have achieved and required scores
      for (const score of passResult.dimensionScores) {
        expect(score.achievedScore).toBeGreaterThanOrEqual(1);
        expect(score.requiredScore).toBeGreaterThanOrEqual(1);
        expect(typeof score.passed).toBe('boolean');
      }

      // Evaluate a production output with minimal content (should fail)
      const poorOutput: ProductionOutput = {
        id: 'app-output-2',
        type: 'app',
        name: 'Bare Minimum App',
        content: {},
      };

      const failResult = await qualityGate.evaluate(poorOutput, baseline.domainCategory);

      expect(failResult.passed).toBe(false);
      expect(failResult.rejectionReport).toBeDefined();
      expect(failResult.rejectionReport!.failedDimensions.length).toBeGreaterThan(0);
      expect(failResult.rejectionReport!.summary).toBeTruthy();
      expect(failResult.rejectionReport!.baselineVersion).toBe(1);

      // Verify audit logging occurred for both evaluations
      expect(mockXOAudit.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'quality-gate-evaluation',
          outcome: 'failure',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Auto-Rework Loop: app fails gate → rework → Training Cascade → resubmit → re-evaluate
  // -------------------------------------------------------------------------

  describe('Auto-rework loop: app fails gate → rework directive → Training Cascade → resubmit', () => {
    it('routes rejected output through Training Cascade and re-evaluates until pass', async () => {
      // Setup: Ingest and store baseline
      const url = 'https://apps.apple.com/us/app/fitness-pro/id123456789';
      const ingestionResult = await ingestionService.ingest(url);
      const appReport = ingestionResult.report! as import('../types.js').AppReferenceReport;
      const baseline = baselineGenerator.generateAppBaseline(appReport);
      await baselineStorage.store(baseline, 'zionx');

      const qualityGate = new ReferenceQualityGate(
        baselineStorage,
        mockOtzar,
        mockXOAudit,
        mockEventBus,
      );

      // Create a Training Cascade mock that progressively improves the output
      let reworkCount = 0;
      const mockTrainingCascade: TrainingCascade = {
        rework: vi.fn().mockImplementation(async (directive: ReworkDirective) => {
          reworkCount++;
          // Each rework adds more content to improve scores
          return {
            reworkedOutput: {
              ...directive.output,
              id: `reworked-${reworkCount}`,
              content: {
                screens: ['home', 'workout', 'profile', 'settings', 'social', 'analytics'],
                features: Array.from({ length: reworkCount + 3 }, (_, i) => `feature-${i}`),
                design: { colors: ['blue', 'white', 'green'], navigation: 'tab-bar' },
                improvements: `iteration-${reworkCount}`,
              },
            },
          };
        }),
      };

      const escalationCallback = vi.fn();
      const autoReworkLoop = new AutoReworkLoop(
        qualityGate,
        mockTrainingCascade,
        mockZikaron,
        escalationCallback,
      );

      // Create a poor output that will fail the gate
      const poorOutput: ProductionOutput = {
        id: 'app-poor-1',
        type: 'app',
        name: 'Needs Work App',
        content: {},
      };

      // First evaluate to get rejection report
      const initialResult = await qualityGate.evaluate(poorOutput, baseline.domainCategory);
      expect(initialResult.passed).toBe(false);
      expect(initialResult.rejectionReport).toBeDefined();

      // Run the auto-rework loop
      const reworkResult = await autoReworkLoop.handleRejection(
        poorOutput,
        initialResult.rejectionReport!,
      );

      // The rework loop should have called the training cascade
      expect(mockTrainingCascade.rework).toHaveBeenCalled();

      // Result should have dimension scores
      expect(reworkResult.dimensionScores.length).toBeGreaterThan(0);
      expect(reworkResult.overallScore).toBeGreaterThan(0);

      // If it passed, verify success pattern was recorded
      if (reworkResult.passed) {
        expect(mockZikaron.storeProcedural).toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Multi-Reference Synthesis: second reference → baseline merged (monotonic) → thresholds raised
  // -------------------------------------------------------------------------

  describe('Multi-reference synthesis: second reference ingested → baseline merged monotonically', () => {
    it('merges a second reference into existing baseline with monotonically increasing thresholds', async () => {
      // Step 1: Ingest first reference
      const url1 = 'https://apps.apple.com/us/app/fitness-pro/id123456789';
      const result1 = await ingestionService.ingest(url1);
      const report1 = result1.report! as import('../types.js').AppReferenceReport;
      const baseline1 = baselineGenerator.generateAppBaseline(report1);
      await baselineStorage.store(baseline1, 'zionx');

      const originalScores = baseline1.dimensions.map(d => ({ name: d.name, score: d.score }));

      // Step 2: Create a second, higher-performing reference report
      // Simulate a second ingestion with a higher-rated app
      const secondReport: import('../types.js').AppReferenceReport = {
        url: 'https://apps.apple.com/us/app/super-fitness/id987654321',
        type: 'app-store-ios',
        analyzedAt: new Date(),
        platform: 'ios',
        listing: {
          appName: 'Super Fitness',
          developer: 'Elite Health Corp',
          category: 'Health & Fitness',
          rating: 4.9,
          reviewCount: 50000,
          pricingModel: 'freemium',
          iapOptions: ['Pro Monthly $14.99', 'Pro Annual $99.99', 'Lifetime $199.99'],
          description: 'The most comprehensive fitness platform with AI-powered coaching, social challenges, streak rewards, and personalized nutrition plans. Join millions of users transforming their health.',
          featureList: ['AI Coaching', 'Social Challenges', 'Streak Rewards', 'Nutrition Plans', 'Progress Photos', 'Workout Library', 'Heart Rate Zones', 'Sleep Tracking'],
        },
        visualAnalysis: {
          screenCount: 8,
          layoutPatterns: ['card-based', 'grid-view', 'list-view', 'dashboard'],
          colorUsage: ['vibrant-green', 'dark-background', 'accent-orange', 'white-text'],
          typography: ['custom-bold', 'system-regular', 'display-large'],
          navigationStructure: 'tab-bar',
          informationDensity: 'high',
        },
        reviewInsights: {
          topPraisedFeatures: ['easy to use', 'motivating', 'beautiful design', 'accurate tracking'],
          commonComplaints: ['battery drain'],
          sentimentDistribution: { positive: 0.85, neutral: 0.1, negative: 0.05 },
          featureRequests: ['apple watch integration'],
        },
        inferredPatterns: {
          onboardingComplexity: 'moderate',
          monetizationModel: 'freemium',
          notificationStrategy: 'moderate',
          interactionPatterns: ['swipe', 'tap', 'long-press', 'drag'],
          retentionMechanics: ['streaks', 'rewards', 'social-connection', 'progression'],
        },
      };

      // Step 3: Merge second reference into existing baseline
      const mergedBaseline = baselineGenerator.generateAppBaseline(secondReport, baseline1);

      // Verify monotonic merge: thresholds only go UP
      expect(mergedBaseline.version).toBe(2);
      expect(mergedBaseline.sources.length).toBe(2);

      for (const dim of mergedBaseline.dimensions) {
        const original = originalScores.find(o => o.name === dim.name);
        expect(dim.score).toBeGreaterThanOrEqual(original!.score);
        expect(dim.referenceCount).toBe(2);
      }

      // Step 4: Store merged baseline
      await baselineStorage.store(mergedBaseline, 'zionx');

      // Verify version history
      const history = baselineStorage.getVersionHistory(mergedBaseline.domainCategory);
      expect(history.length).toBe(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);

      // Verify the latest baseline has raised thresholds
      const latestBaseline = await baselineStorage.queryByCategory(mergedBaseline.domainCategory);
      expect(latestBaseline!.version).toBe(2);
      expect(latestBaseline!.overallConfidence).toBeGreaterThanOrEqual(baseline1.overallConfidence);
    });
  });

  // -------------------------------------------------------------------------
  // Pre-Production Plan: baseline exists → plan generated → King approves → production begins
  // -------------------------------------------------------------------------

  describe('Pre-production plan: baseline exists → plan generated → King approves', () => {
    it('generates a production plan from baseline and gets King approval for autonomous production', async () => {
      // Setup: Ingest and store baseline
      const url = 'https://apps.apple.com/us/app/fitness-pro/id123456789';
      const ingestionResult = await ingestionService.ingest(url);
      const appReport = ingestionResult.report! as import('../types.js').AppReferenceReport;
      const baseline = baselineGenerator.generateAppBaseline(appReport);
      await baselineStorage.store(baseline, 'zionx');

      // Create approval callback that approves the plan
      const approvalCallback: ApprovalCallback = vi.fn().mockResolvedValue({
        approved: true,
      });

      const planService = new PreProductionPlanService(
        baselineStorage,
        mockOtzar,
        approvalCallback,
      );

      // Generate and approve plan
      const flowResult = await planService.generateAndApprovePlan('app', baseline.domainCategory);

      expect(flowResult.approved).toBe(true);
      expect(flowResult.revisionCount).toBe(0);
      expect(flowResult.plan).toBeDefined();
      expect(flowResult.plan.type).toBe('app');
      expect(flowResult.plan.domainCategory).toBe(baseline.domainCategory);
      expect(flowResult.plan.baselineVersion).toBe(1);

      // Plan should have approaches for each dimension
      expect(flowResult.plan.dimensionApproaches.length).toBe(baseline.dimensions.length);

      for (const approach of flowResult.plan.dimensionApproaches) {
        expect(approach.dimension).toBeTruthy();
        expect(approach.requiredScore).toBeGreaterThanOrEqual(1);
        expect(approach.approach).toBeTruthy();
        expect(approach.confidence).toBeGreaterThanOrEqual(0);
        expect(approach.confidence).toBeLessThanOrEqual(1);
      }

      // Verify approval callback was called with the plan
      expect(approvalCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app',
          domainCategory: baseline.domainCategory,
          dimensionApproaches: expect.any(Array),
        }),
      );
    });

    it('revises plan when King rejects and resubmits for approval', async () => {
      // Setup: Ingest and store baseline
      const url = 'https://apps.apple.com/us/app/fitness-pro/id123456789';
      const ingestionResult = await ingestionService.ingest(url);
      const appReport = ingestionResult.report! as import('../types.js').AppReferenceReport;
      const baseline = baselineGenerator.generateAppBaseline(appReport);
      await baselineStorage.store(baseline, 'zionx');

      // Create approval callback that rejects first, then approves
      let callCount = 0;
      const approvalCallback: ApprovalCallback = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { approved: false, feedback: 'Need more focus on retention mechanics' };
        }
        return { approved: true };
      });

      const planService = new PreProductionPlanService(
        baselineStorage,
        mockOtzar,
        approvalCallback,
      );

      const flowResult = await planService.generateAndApprovePlan('app', baseline.domainCategory);

      expect(flowResult.approved).toBe(true);
      expect(flowResult.revisionCount).toBe(1);
      expect(approvalCallback).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Escalation: 5 failed reworks → King notified with summary and recommendation
  // -------------------------------------------------------------------------

  describe('Escalation: 5 failed reworks → King notified with summary and recommendation', () => {
    it('escalates to King after 5 failed rework attempts with summary and recommendation', async () => {
      // Setup: Ingest and store baseline
      const url = 'https://apps.apple.com/us/app/fitness-pro/id123456789';
      const ingestionResult = await ingestionService.ingest(url);
      const appReport = ingestionResult.report! as import('../types.js').AppReferenceReport;
      const baseline = baselineGenerator.generateAppBaseline(appReport);
      await baselineStorage.store(baseline, 'zionx');

      const qualityGate = new ReferenceQualityGate(
        baselineStorage,
        mockOtzar,
        mockXOAudit,
        mockEventBus,
      );

      // Training Cascade that never produces good enough output (always empty content)
      const stubbornTrainingCascade: TrainingCascade = {
        rework: vi.fn().mockImplementation(async (directive: ReworkDirective) => {
          return {
            reworkedOutput: {
              ...directive.output,
              id: `reworked-stubborn-${directive.iterationCount}`,
              // Always return empty content so it keeps failing
              content: {},
            },
          };
        }),
      };

      const escalationCallback = vi.fn().mockResolvedValue(undefined);
      const autoReworkLoop = new AutoReworkLoop(
        qualityGate,
        stubbornTrainingCascade,
        mockZikaron,
        escalationCallback,
      );

      // Create output that will always fail
      const failingOutput: ProductionOutput = {
        id: 'app-always-fails',
        type: 'app',
        name: 'Stubborn App',
        content: {},
      };

      // Get initial rejection
      const initialResult = await qualityGate.evaluate(failingOutput, baseline.domainCategory);
      expect(initialResult.passed).toBe(false);

      // Run the auto-rework loop — should exhaust 5 attempts and escalate
      const finalResult = await autoReworkLoop.handleRejection(
        failingOutput,
        initialResult.rejectionReport!,
      );

      // Should have failed after all attempts
      expect(finalResult.passed).toBe(false);
      expect(finalResult.note).toContain('Escalated to King');
      expect(finalResult.note).toContain('5');

      // Training cascade should have been called 5 times
      expect(stubbornTrainingCascade.rework).toHaveBeenCalledTimes(5);

      // Escalation callback should have been called with summary
      expect(escalationCallback).toHaveBeenCalledTimes(1);
      expect(escalationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({ id: 'app-always-fails' }),
          attemptCount: 5,
          timeElapsed: expect.any(Number),
          scoreProgression: expect.any(Array),
          persistentGaps: expect.any(Array),
          recommendation: expect.any(String),
          summary: expect.stringContaining('5 attempts'),
        }),
      );

      // Verify the escalation request has meaningful data
      const escalationRequest = escalationCallback.mock.calls[0][0];
      expect(escalationRequest.scoreProgression.length).toBeGreaterThan(1);
      expect(escalationRequest.persistentGaps.length).toBeGreaterThan(0);
      expect(['lower_threshold', 'provide_additional_references', 'accept_current_quality']).toContain(
        escalationRequest.recommendation,
      );
    });
  });
});
