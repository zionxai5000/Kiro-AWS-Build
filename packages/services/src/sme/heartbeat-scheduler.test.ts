/**
 * Unit tests for the Heartbeat Scheduler and Review Cycle Engine.
 *
 * Validates: Requirements 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 19.1
 *
 * - 21.1: Scheduled heartbeat review per sub-agent with configurable intervals
 * - 21.2: Full review cycle orchestration
 * - 21.3: Domain research phase
 * - 21.4: Benchmark against world-class performance
 * - 21.5: Gap analysis with priority scores
 * - 21.6: Generate prioritized recommendations
 * - 21.7: Enforce research budget cap per cycle
 * - 19.1: Test suite validates correctness
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HeartbeatScheduler,
  DEFAULT_HEARTBEAT_CONFIGS,
} from './heartbeat-scheduler.js';
import type {
  HeartbeatSchedulerConfig,
  HeartbeatConfig,
  DomainResearchDriver,
  RecommendationQueue,
  ResearchFindings,
  Recommendation,
} from './heartbeat-scheduler.js';
import type { DomainExpertiseProfile } from './domain-expertise-profile.js';
import { DomainExpertiseProfileService } from './domain-expertise-profile.js';
import type { OtzarService } from '@seraphim/core';
import type { BudgetCheckResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-001';
const ZIONX_AGENT_ID = 'agent-zionx';
const ZXMG_AGENT_ID = 'agent-zxmg';
const ZION_ALPHA_AGENT_ID = 'agent-zion-alpha';
const SERAPHIM_CORE_AGENT_ID = 'agent-seraphim-core';
const ERETZ_AGENT_ID = 'agent-eretz';

function createMockProfile(agentId: string = ZIONX_AGENT_ID): DomainExpertiseProfile {
  return {
    agentId,
    domain: 'app-development',
    version: 1,
    lastUpdated: new Date(),
    knowledgeBase: [
      {
        id: 'kb-1',
        topic: 'ASO Keywords',
        content: 'Title keywords have 10x weight',
        source: 'apple-docs',
        confidence: 0.9,
        lastVerified: new Date(),
        tags: ['aso', 'keywords'],
      },
    ],
    competitiveIntelligence: [],
    decisionFrameworks: [],
    qualityBenchmarks: [
      {
        metric: 'Day-1 Retention',
        worldClass: 0.45,
        current: 0.25,
        unit: 'percentage',
        source: 'industry-benchmark-2024',
        lastUpdated: new Date(),
      },
      {
        metric: 'App Store Rating',
        worldClass: 4.8,
        current: 4.2,
        unit: 'stars',
        source: 'industry-benchmark-2024',
        lastUpdated: new Date(),
      },
      {
        metric: 'Monthly Revenue',
        worldClass: 500000,
        current: 10000,
        unit: 'USD',
        source: 'sensor-tower-2024',
        lastUpdated: new Date(),
      },
    ],
    industryBestPractices: [
      {
        id: 'bp-1',
        title: 'Onboarding Optimization',
        description: 'Keep onboarding to 3 screens max',
        domain: 'app-development',
        source: 'ux-research',
        confidence: 0.88,
        tags: ['retention', 'onboarding'],
      },
    ],
    learnedPatterns: [
      {
        id: 'lp-1',
        pattern: 'Dark mode increases session duration',
        context: 'Observed across productivity apps',
        outcome: 'positive',
        confidence: 0.82,
        occurrences: 5,
        firstObserved: new Date('2025-01-01'),
        lastObserved: new Date('2025-03-01'),
      },
    ],
    lastResearchCycle: null,
    researchBacklog: [],
    knowledgeGaps: ['Competitor pricing strategies'],
    conflicts: [],
  };
}

function createMockOtzarService(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-3-haiku',
      estimatedCost: 0.01,
      rationale: 'Cost-effective for research',
    }),
    checkBudget: vi.fn().mockResolvedValue({
      allowed: true,
      remainingDaily: 5.0,
      remainingMonthly: 50.0,
    } satisfies BudgetCheckResult),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({
      totalCostUsd: 10,
      byAgent: {},
      byPillar: {},
      byModel: {},
      period: { start: new Date(), end: new Date() },
    }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({
      date: new Date(),
      totalSpend: 5,
      wastePatterns: [],
      savingsOpportunities: [],
      estimatedSavings: 0,
    }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockResearchDriver(findings?: Partial<ResearchFindings>): DomainResearchDriver {
  return {
    research: vi.fn().mockResolvedValue({
      sources: findings?.sources ?? ['app-store-connect', 'sensor-tower'],
      findings: findings?.findings ?? [
        {
          topic: 'Competitor Analysis',
          content: 'Top meditation apps average 4.8 stars',
          source: 'app-store-connect',
          confidence: 0.85,
        },
      ],
      costUsd: findings?.costUsd ?? 0.15,
    } satisfies ResearchFindings),
  };
}

function createMockRecommendationQueue(): RecommendationQueue {
  return {
    submit: vi.fn().mockResolvedValue('rec-id-001'),
  };
}

function createMockProfileService(profile?: DomainExpertiseProfile): DomainExpertiseProfileService {
  const service = {
    loadProfile: vi.fn().mockResolvedValue(profile ?? createMockProfile()),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    resolveConflicts: vi.fn(),
  } as unknown as DomainExpertiseProfileService;
  return service;
}

function createScheduler(overrides: Partial<HeartbeatSchedulerConfig> = {}): {
  scheduler: HeartbeatScheduler;
  otzar: OtzarService;
  queue: RecommendationQueue;
  driver: DomainResearchDriver;
  profileService: DomainExpertiseProfileService;
} {
  const otzar = createMockOtzarService();
  const queue = createMockRecommendationQueue();
  const driver = createMockResearchDriver();
  const profileService = createMockProfileService();

  const config: HeartbeatSchedulerConfig = {
    tenantId: TENANT_ID,
    profileService: overrides.profileService ?? profileService,
    otzarService: overrides.otzarService ?? otzar,
    recommendationQueue: overrides.recommendationQueue ?? queue,
    researchDrivers: overrides.researchDrivers ?? {
      [ZIONX_AGENT_ID]: driver,
    },
  };

  const scheduler = new HeartbeatScheduler(config);
  return { scheduler, otzar, queue, driver, profileService: config.profileService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HeartbeatScheduler', () => {
  // -------------------------------------------------------------------------
  // Configuration (Requirement 21.1)
  // -------------------------------------------------------------------------

  describe('configure()', () => {
    it('configures heartbeat with default intervals per sub-agent', async () => {
      const { scheduler } = createScheduler();

      await scheduler.configure(ERETZ_AGENT_ID);
      await scheduler.configure(ZIONX_AGENT_ID);
      await scheduler.configure(ZXMG_AGENT_ID);
      await scheduler.configure(ZION_ALPHA_AGENT_ID);
      await scheduler.configure(SERAPHIM_CORE_AGENT_ID);

      const eretzConfig = await scheduler.getConfig(ERETZ_AGENT_ID);
      const zionxConfig = await scheduler.getConfig(ZIONX_AGENT_ID);
      const zxmgConfig = await scheduler.getConfig(ZXMG_AGENT_ID);
      const alphaConfig = await scheduler.getConfig(ZION_ALPHA_AGENT_ID);
      const coreConfig = await scheduler.getConfig(SERAPHIM_CORE_AGENT_ID);

      // Eretz: daily (24h)
      expect(eretzConfig.intervalMs).toBe(24 * 60 * 60 * 1000);
      // ZionX: daily (24h)
      expect(zionxConfig.intervalMs).toBe(24 * 60 * 60 * 1000);
      // ZXMG: daily (24h)
      expect(zxmgConfig.intervalMs).toBe(24 * 60 * 60 * 1000);
      // Zion Alpha: hourly (1h)
      expect(alphaConfig.intervalMs).toBe(60 * 60 * 1000);
      // Seraphim Core: weekly (168h)
      expect(coreConfig.intervalMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('allows overriding default configuration', async () => {
      const { scheduler } = createScheduler();

      await scheduler.configure(ZIONX_AGENT_ID, {
        intervalMs: 12 * 60 * 60 * 1000, // 12 hours
        researchDepth: 'deep',
        maxResearchBudgetUsd: 3.0,
      });

      const config = await scheduler.getConfig(ZIONX_AGENT_ID);
      expect(config.intervalMs).toBe(12 * 60 * 60 * 1000);
      expect(config.researchDepth).toBe('deep');
      expect(config.maxResearchBudgetUsd).toBe(3.0);
    });

    it('sets correct default research depth per agent', async () => {
      const { scheduler } = createScheduler();

      await scheduler.configure(ZIONX_AGENT_ID);
      await scheduler.configure(SERAPHIM_CORE_AGENT_ID);

      const zionxConfig = await scheduler.getConfig(ZIONX_AGENT_ID);
      const coreConfig = await scheduler.getConfig(SERAPHIM_CORE_AGENT_ID);

      expect(zionxConfig.researchDepth).toBe('standard');
      expect(coreConfig.researchDepth).toBe('deep');
    });

    it('sets correct default budget caps per agent', async () => {
      const { scheduler } = createScheduler();

      await scheduler.configure(ZION_ALPHA_AGENT_ID);
      await scheduler.configure(SERAPHIM_CORE_AGENT_ID);

      const alphaConfig = await scheduler.getConfig(ZION_ALPHA_AGENT_ID);
      const coreConfig = await scheduler.getConfig(SERAPHIM_CORE_AGENT_ID);

      expect(alphaConfig.maxResearchBudgetUsd).toBe(0.5);
      expect(coreConfig.maxResearchBudgetUsd).toBe(5.0);
    });

    it('throws when getting config for unconfigured agent', async () => {
      const { scheduler } = createScheduler();

      await expect(scheduler.getConfig('agent-unknown')).rejects.toThrow(
        'No heartbeat configuration found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Review Cycle (Requirements 21.2, 21.3, 21.4, 21.5, 21.6)
  // -------------------------------------------------------------------------

  describe('triggerReview()', () => {
    it('executes all phases in order: research → benchmark → gap analysis → recommend', async () => {
      const { scheduler, driver, queue, profileService } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      // Phase 1: Profile loaded
      expect(profileService.loadProfile).toHaveBeenCalledWith(ZIONX_AGENT_ID, 'app-development');

      // Phase 2: Research executed
      expect(driver.research).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: ZIONX_AGENT_ID }),
        'standard',
        expect.any(Number),
      );

      // Phase 3 & 4: Benchmarks and assessment present
      expect(result.worldClassBenchmarks.length).toBeGreaterThan(0);
      expect(result.currentStateAssessment).toBeDefined();
      expect(result.currentStateAssessment.domain).toBe('app-development');

      // Phase 5: Gap analysis performed
      expect(result.gapAnalysis.length).toBeGreaterThan(0);

      // Phase 6: Recommendations generated and submitted
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(queue.submit).toHaveBeenCalledTimes(result.recommendations.length);
    });

    it('returns a complete HeartbeatReviewResult', async () => {
      const { scheduler } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      expect(result.id).toBeTruthy();
      expect(result.agentId).toBe(ZIONX_AGENT_ID);
      expect(result.domain).toBe('app-development');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.costUsd).toBeGreaterThanOrEqual(0);
      expect(result.researchSourcesUsed).toEqual(['app-store-connect', 'sensor-tower']);
      expect(result.confidenceScore).toBeGreaterThan(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(1);
    });

    it('performs gap analysis with correct priority scoring', async () => {
      const { scheduler } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      // Monthly Revenue gap: (500000 - 10000) / 500000 = 98% → priority ~10
      const revenueGap = result.gapAnalysis.find((g) => g.metric === 'Monthly Revenue');
      expect(revenueGap).toBeDefined();
      expect(revenueGap!.gapPercentage).toBeGreaterThan(90);
      expect(revenueGap!.priority).toBeGreaterThanOrEqual(9);

      // Day-1 Retention gap: (0.45 - 0.25) / 0.45 = 44% → priority ~4
      const retentionGap = result.gapAnalysis.find((g) => g.metric === 'Day-1 Retention');
      expect(retentionGap).toBeDefined();
      expect(retentionGap!.gapPercentage).toBeCloseTo(44.44, 1);
      expect(retentionGap!.priority).toBeGreaterThanOrEqual(4);

      // Gaps should be sorted by priority descending
      for (let i = 1; i < result.gapAnalysis.length; i++) {
        expect(result.gapAnalysis[i - 1].priority).toBeGreaterThanOrEqual(
          result.gapAnalysis[i].priority,
        );
      }
    });

    it('throws when triggering review for unconfigured agent', async () => {
      const { scheduler } = createScheduler();

      await expect(scheduler.triggerReview('agent-unknown')).rejects.toThrow(
        'No heartbeat configuration found',
      );
    });

    it('handles missing research driver gracefully', async () => {
      const { scheduler } = createScheduler({
        researchDrivers: {}, // No drivers
      });
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      // Should still complete with empty research
      expect(result.researchSourcesUsed).toEqual([]);
      expect(result.costUsd).toBe(0);
      // Gap analysis and recommendations still work from profile data
      expect(result.gapAnalysis.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Budget Enforcement (Requirement 21.7)
  // -------------------------------------------------------------------------

  describe('research budget enforcement', () => {
    it('checks budget via Otzar before research', async () => {
      const { scheduler, otzar } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      await scheduler.triggerReview(ZIONX_AGENT_ID);

      expect(otzar.checkBudget).toHaveBeenCalledWith(
        ZIONX_AGENT_ID,
        expect.any(Number),
      );
    });

    it('skips research when budget is exhausted', async () => {
      const otzar = createMockOtzarService();
      vi.mocked(otzar.checkBudget).mockResolvedValue({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: 'Daily budget exhausted',
      });

      const driver = createMockResearchDriver();
      const { scheduler } = createScheduler({
        otzarService: otzar,
        researchDrivers: { [ZIONX_AGENT_ID]: driver },
      });
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      // Research driver should NOT be called
      expect(driver.research).not.toHaveBeenCalled();
      expect(result.costUsd).toBe(0);
      expect(result.researchSourcesUsed).toEqual([]);
    });

    it('records usage with Otzar after research completes', async () => {
      const { scheduler, otzar } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      await scheduler.triggerReview(ZIONX_AGENT_ID);

      expect(otzar.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: ZIONX_AGENT_ID,
          tenantId: TENANT_ID,
          pillar: 'sme-research',
          costUsd: 0.15,
        }),
      );
    });

    it('caps research budget to configured maximum', async () => {
      const otzar = createMockOtzarService();
      vi.mocked(otzar.checkBudget).mockResolvedValue({
        allowed: true,
        remainingDaily: 100.0, // Large daily budget
        remainingMonthly: 500.0,
      });

      const driver = createMockResearchDriver();
      const { scheduler } = createScheduler({
        otzarService: otzar,
        researchDrivers: { [ZIONX_AGENT_ID]: driver },
      });
      await scheduler.configure(ZIONX_AGENT_ID, {
        maxResearchBudgetUsd: 1.5,
      });

      await scheduler.triggerReview(ZIONX_AGENT_ID);

      // Driver should be called with budget capped at config max (1.5), not daily remaining (100)
      expect(driver.research).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        1.5,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Recommendation Structure (Requirement 21.6)
  // -------------------------------------------------------------------------

  describe('recommendation generation', () => {
    it('submits recommendations to queue with correct structure', async () => {
      const { scheduler, queue } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      expect(result.recommendations.length).toBeGreaterThan(0);

      for (const rec of result.recommendations) {
        // Verify benchmark → current → gap → plan structure
        expect(rec.worldClassBenchmark).toBeDefined();
        expect(rec.worldClassBenchmark.description).toBeTruthy();
        expect(rec.worldClassBenchmark.source).toBeTruthy();
        expect(rec.worldClassBenchmark.metrics).toBeDefined();

        expect(rec.currentState).toBeDefined();
        expect(rec.currentState.description).toBeTruthy();
        expect(rec.currentState.metrics).toBeDefined();

        expect(rec.gapAnalysis).toBeDefined();
        expect(rec.gapAnalysis.description).toBeTruthy();
        expect(rec.gapAnalysis.gapPercentage).toBeGreaterThan(0);
        expect(rec.gapAnalysis.keyGaps.length).toBeGreaterThan(0);

        expect(rec.actionPlan).toBeDefined();
        expect(rec.actionPlan.summary).toBeTruthy();
        expect(rec.actionPlan.steps.length).toBeGreaterThan(0);
        expect(rec.actionPlan.estimatedEffort).toBeTruthy();
        expect(rec.actionPlan.estimatedImpact).toBeDefined();

        expect(rec.riskAssessment).toBeDefined();
        expect(rec.riskAssessment.level).toMatch(/^(low|medium|high)$/);
        expect(rec.riskAssessment.risks.length).toBeGreaterThan(0);
        expect(rec.riskAssessment.mitigations.length).toBeGreaterThan(0);

        expect(rec.rollbackPlan).toBeTruthy();
        expect(rec.status).toBe('pending');
        expect(rec.agentId).toBe(ZIONX_AGENT_ID);
        expect(rec.domain).toBe('app-development');
        expect(rec.priority).toBeGreaterThanOrEqual(1);
        expect(rec.priority).toBeLessThanOrEqual(10);
      }

      // Each recommendation was submitted to queue
      expect(queue.submit).toHaveBeenCalledTimes(result.recommendations.length);
      for (const call of vi.mocked(queue.submit).mock.calls) {
        const submitted = call[0] as Recommendation;
        expect(submitted.id).toBeTruthy();
        expect(submitted.submittedAt).toBeInstanceOf(Date);
      }
    });

    it('generates recommendations sorted by priority', async () => {
      const { scheduler } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      const result = await scheduler.triggerReview(ZIONX_AGENT_ID);

      for (let i = 1; i < result.recommendations.length; i++) {
        expect(result.recommendations[i - 1].priority).toBeGreaterThanOrEqual(
          result.recommendations[i].priority,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Review History Persistence
  // -------------------------------------------------------------------------

  describe('review history', () => {
    it('persists review results and retrieves them', async () => {
      const { scheduler } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      const result1 = await scheduler.triggerReview(ZIONX_AGENT_ID);
      const result2 = await scheduler.triggerReview(ZIONX_AGENT_ID);

      const history = await scheduler.getReviewHistory(ZIONX_AGENT_ID);
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(result1.id);
      expect(history[1].id).toBe(result2.id);
    });

    it('getLastReview returns the most recent review', async () => {
      const { scheduler } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      await scheduler.triggerReview(ZIONX_AGENT_ID);
      const result2 = await scheduler.triggerReview(ZIONX_AGENT_ID);

      const lastReview = await scheduler.getLastReview(ZIONX_AGENT_ID);
      expect(lastReview).not.toBeNull();
      expect(lastReview!.id).toBe(result2.id);
    });

    it('getLastReview returns null when no reviews exist', async () => {
      const { scheduler } = createScheduler();

      const lastReview = await scheduler.getLastReview(ZIONX_AGENT_ID);
      expect(lastReview).toBeNull();
    });

    it('getReviewHistory respects limit parameter', async () => {
      const { scheduler } = createScheduler();
      await scheduler.configure(ZIONX_AGENT_ID);

      await scheduler.triggerReview(ZIONX_AGENT_ID);
      await scheduler.triggerReview(ZIONX_AGENT_ID);
      const result3 = await scheduler.triggerReview(ZIONX_AGENT_ID);

      const history = await scheduler.getReviewHistory(ZIONX_AGENT_ID, 1);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(result3.id);
    });

    it('returns empty history for agents with no reviews', async () => {
      const { scheduler } = createScheduler();

      const history = await scheduler.getReviewHistory(ZIONX_AGENT_ID);
      expect(history).toEqual([]);
    });
  });
});
