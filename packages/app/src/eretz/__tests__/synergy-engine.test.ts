/**
 * Unit tests for Eretz Cross-Business Synergy Engine
 *
 * Validates: Requirements 29b.5, 29b.6, 29b.7, 29b.8, 19.1
 *
 * Tests synergy detection, activation plan generation, standing rule
 * enforcement, dashboard metrics, and Recommendation Queue submission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EretzSynergyEngineImpl,
} from '../synergy-engine.js';
import type {
  SynergyEngineConfig,
  BusinessEvent,
  StandingRule,
} from '../synergy-engine.js';
import type { SynergyOpportunity } from '../agent-program.js';
import type { EventBusService, ZikaronService } from '@seraphim/core';
import type { RecommendationQueue } from '@seraphim/services/sme/heartbeat-scheduler.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-id-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('entry-id'),
    storeSemantic: vi.fn().mockResolvedValue('entry-id'),
    storeProcedural: vi.fn().mockResolvedValue('entry-id'),
    storeWorking: vi.fn().mockResolvedValue('entry-id'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([
      { id: 'mem-1', content: 'recent app launch', score: 0.9 },
    ]),
    loadAgentContext: vi.fn().mockResolvedValue({ agentId: 'test', memories: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRecommendationQueue(): RecommendationQueue {
  return {
    submit: vi.fn().mockResolvedValue('rec-id-001'),
  };
}

function createConfig(overrides?: Partial<SynergyEngineConfig>): SynergyEngineConfig {
  return {
    eventBus: createMockEventBus(),
    zikaron: createMockZikaron(),
    recommendationQueue: createMockRecommendationQueue(),
    ...overrides,
  };
}

function createSampleSynergy(overrides?: Partial<SynergyOpportunity>): SynergyOpportunity {
  return {
    id: 'syn-001',
    type: 'revenue',
    sourceSubsidiary: 'zxmg',
    targetSubsidiary: 'zionx',
    description: 'ZXMG video content can promote ZionX apps',
    estimatedRevenueImpact: 500,
    confidence: 0.85,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Synergy Detection Tests
// ---------------------------------------------------------------------------

describe('EretzSynergyEngine — Synergy Detection', () => {
  let engine: EretzSynergyEngineImpl;
  let config: SynergyEngineConfig;

  beforeEach(() => {
    config = createConfig();
    engine = new EretzSynergyEngineImpl(config);
  });

  it('should detect cross-business synergies from business events (app_launch)', async () => {
    const event: BusinessEvent = {
      type: 'app_launch',
      subsidiary: 'zionx',
      detail: { appName: 'wellness-tracker' },
      timestamp: new Date(),
    };

    const synergy = await engine.detectSynergy(event);

    expect(synergy).not.toBeNull();
    expect(synergy!.type).toBe('revenue');
    expect(synergy!.sourceSubsidiary).toBe('zionx');
    expect(synergy!.targetSubsidiary).toBe('zxmg');
    expect(synergy!.estimatedRevenueImpact).toBeGreaterThan(0);
  });

  it('should detect synergy from content_published event', async () => {
    const event: BusinessEvent = {
      type: 'content_published',
      subsidiary: 'zxmg',
      detail: { videoId: 'vid-123' },
      timestamp: new Date(),
    };

    const synergy = await engine.detectSynergy(event);

    expect(synergy).not.toBeNull();
    expect(synergy!.type).toBe('revenue');
    expect(synergy!.sourceSubsidiary).toBe('zxmg');
    expect(synergy!.targetSubsidiary).toBe('zionx');
  });

  it('should detect synergy from trade_executed event', async () => {
    const event: BusinessEvent = {
      type: 'trade_executed',
      subsidiary: 'zion_alpha',
      detail: { market: 'polymarket' },
      timestamp: new Date(),
    };

    const synergy = await engine.detectSynergy(event);

    expect(synergy).not.toBeNull();
    expect(synergy!.type).toBe('strategic');
    expect(synergy!.sourceSubsidiary).toBe('zion_alpha');
    expect(synergy!.targetSubsidiary).toBe('zionx');
  });

  it('should publish synergy.detected event when synergy found', async () => {
    const event: BusinessEvent = {
      type: 'app_launch',
      subsidiary: 'zionx',
      detail: {},
      timestamp: new Date(),
    };

    await engine.detectSynergy(event);

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'synergy.detected',
        detail: expect.objectContaining({
          type: 'revenue',
          sourceSubsidiary: 'zionx',
          targetSubsidiary: 'zxmg',
          triggerEvent: 'app_launch',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
        }),
      }),
    );
  });

  it('should analyze synergies across all subsidiaries using Zikaron', async () => {
    const synergies = await engine.analyzeSynergies();

    expect(synergies.length).toBeGreaterThan(0);
    expect(config.zikaron.queryByAgent).toHaveBeenCalled();

    // Should have synergies between different subsidiaries
    const sources = new Set(synergies.map((s) => s.sourceSubsidiary));
    expect(sources.size).toBeGreaterThan(1);
  });

  it('should publish synergy.analysis_complete event after analysis', async () => {
    await engine.analyzeSynergies();

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'synergy.analysis_complete',
        detail: expect.objectContaining({
          synergiesFound: expect.any(Number),
          totalEstimatedImpact: expect.any(Number),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Activation Plan Tests
// ---------------------------------------------------------------------------

describe('EretzSynergyEngine — Activation Plans', () => {
  let engine: EretzSynergyEngineImpl;
  let config: SynergyEngineConfig;

  beforeEach(() => {
    config = createConfig();
    engine = new EretzSynergyEngineImpl(config);
  });

  it('should generate activation plan with revenue impact estimate', async () => {
    const synergy = createSampleSynergy();
    const plan = await engine.createActivationPlan(synergy);

    expect(plan).toBeDefined();
    expect(plan.synergyId).toBe(synergy.id);
    expect(plan.estimatedRevenueImpact).toBe(500);
    expect(plan.responsibleSubsidiary).toBe('zionx');
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should include ordered steps in activation plan', async () => {
    const synergy = createSampleSynergy();
    const plan = await engine.createActivationPlan(synergy);

    for (let i = 0; i < plan.steps.length; i++) {
      expect(plan.steps[i].order).toBe(i + 1);
      expect(plan.steps[i].description).toBeTruthy();
      expect(plan.steps[i].responsibleSubsidiary).toBeTruthy();
      expect(plan.steps[i].estimatedDuration).toBeTruthy();
    }
  });

  it('should submit activation plan to Recommendation Queue', async () => {
    const synergy = createSampleSynergy();
    await engine.createActivationPlan(synergy);

    expect(config.recommendationQueue.submit).toHaveBeenCalledTimes(1);
    const call = (config.recommendationQueue.submit as ReturnType<typeof vi.fn>).mock.calls[0];
    const recommendation = call[0];

    expect(recommendation.agentId).toBe('eretz-business-pillar');
    expect(recommendation.domain).toBe('cross-business-synergy');
    expect(recommendation.status).toBe('pending');
    expect(recommendation.actionPlan.summary).toContain('revenue');
    expect(recommendation.actionPlan.steps.length).toBeGreaterThan(0);
  });

  it('should set plan status to submitted after queue submission', async () => {
    const synergy = createSampleSynergy();
    const plan = await engine.createActivationPlan(synergy);

    expect(plan.status).toBe('submitted');
  });

  it('should publish synergy.plan_created event', async () => {
    const synergy = createSampleSynergy();
    await engine.createActivationPlan(synergy);

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'synergy.plan_created',
        detail: expect.objectContaining({
          synergyId: synergy.id,
          estimatedRevenueImpact: 500,
          responsibleSubsidiary: 'zionx',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: synergy.id,
        }),
      }),
    );
  });

  it('should include world-class benchmark in recommendation', async () => {
    const synergy = createSampleSynergy();
    await engine.createActivationPlan(synergy);

    const call = (config.recommendationQueue.submit as ReturnType<typeof vi.fn>).mock.calls[0];
    const recommendation = call[0];

    expect(recommendation.worldClassBenchmark).toBeDefined();
    expect(recommendation.worldClassBenchmark.description).toBeTruthy();
    expect(recommendation.worldClassBenchmark.source).toBeTruthy();
  });

  it('should include gap analysis in recommendation', async () => {
    const synergy = createSampleSynergy();
    await engine.createActivationPlan(synergy);

    const call = (config.recommendationQueue.submit as ReturnType<typeof vi.fn>).mock.calls[0];
    const recommendation = call[0];

    expect(recommendation.gapAnalysis).toBeDefined();
    expect(recommendation.gapAnalysis.keyGaps.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Standing Rule Enforcement Tests
// ---------------------------------------------------------------------------

describe('EretzSynergyEngine — Standing Rule Enforcement', () => {
  let engine: EretzSynergyEngineImpl;
  let config: SynergyEngineConfig;

  beforeEach(async () => {
    config = createConfig();
    engine = new EretzSynergyEngineImpl(config);

    // Add a standing rule: every ZXMG video must include ZionX app commercial
    await engine.addStandingRule({
      name: 'ZXMG Video ZionX Commercial',
      description: 'Every ZXMG YouTube video includes at least one ZionX app commercial',
      sourceSubsidiary: 'zxmg',
      targetSubsidiary: 'zionx',
      condition: 'video_published',
      action: 'include_zionx_commercial',
      createdBy: 'king',
      enabled: true,
    });
  });

  it('should detect non-compliance with standing rules', async () => {
    const violations = await engine.enforceStandingRules('zxmg', 'video_published');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleName).toBe('ZXMG Video ZionX Commercial');
    expect(violations[0].subsidiary).toBe('zxmg');
  });

  it('should not report violations for unrelated actions', async () => {
    const violations = await engine.enforceStandingRules('zxmg', 'thumbnail_created');

    expect(violations.length).toBe(0);
  });

  it('should not report violations for unrelated subsidiaries', async () => {
    const violations = await engine.enforceStandingRules('zion_alpha', 'video_published');

    expect(violations.length).toBe(0);
  });

  it('should publish synergy.rule_violation event on non-compliance', async () => {
    await engine.enforceStandingRules('zxmg', 'video_published');

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'synergy.rule_violation',
        detail: expect.objectContaining({
          subsidiary: 'zxmg',
          action: 'video_published',
          violationCount: 1,
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
        }),
      }),
    );
  });

  it('should not enforce disabled rules', async () => {
    await engine.addStandingRule({
      name: 'Disabled Rule',
      description: 'This rule is disabled',
      sourceSubsidiary: 'zionx',
      targetSubsidiary: 'zxmg',
      condition: 'app_published',
      action: 'notify_zxmg',
      createdBy: 'eretz',
      enabled: false,
    });

    const violations = await engine.enforceStandingRules('zionx', 'app_published');

    expect(violations.length).toBe(0);
  });

  it('should add standing rules with correct structure', async () => {
    const rules = await engine.getStandingRules();

    expect(rules.length).toBeGreaterThanOrEqual(1);
    const rule = rules[0];
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe('ZXMG Video ZionX Commercial');
    expect(rule.createdAt).toBeInstanceOf(Date);
    expect(rule.enabled).toBe(true);
    expect(rule.sourceSubsidiary).toBe('zxmg');
    expect(rule.targetSubsidiary).toBe('zionx');
  });

  it('should publish synergy.rule_added event when adding a rule', async () => {
    // The beforeEach already added one rule, check the event was published
    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'synergy.rule_added',
        detail: expect.objectContaining({
          name: 'ZXMG Video ZionX Commercial',
          sourceSubsidiary: 'zxmg',
          targetSubsidiary: 'zionx',
          createdBy: 'king',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Synergy Dashboard Tests
// ---------------------------------------------------------------------------

describe('EretzSynergyEngine — Dashboard', () => {
  let engine: EretzSynergyEngineImpl;
  let config: SynergyEngineConfig;

  beforeEach(() => {
    config = createConfig();
    engine = new EretzSynergyEngineImpl(config);
  });

  it('should return empty dashboard when no synergies exist', async () => {
    const dashboard = await engine.getSynergyDashboard();

    expect(dashboard.totalIdentified).toBe(0);
    expect(dashboard.totalActivated).toBe(0);
    expect(dashboard.totalRevenueImpact).toBe(0);
    expect(dashboard.missedOpportunities).toBe(0);
    expect(dashboard.standingRuleCompliance).toBe(100);
  });

  it('should aggregate identified synergies count', async () => {
    // Detect some synergies
    await engine.detectSynergy({
      type: 'app_launch',
      subsidiary: 'zionx',
      detail: {},
      timestamp: new Date(),
    });
    await engine.detectSynergy({
      type: 'content_published',
      subsidiary: 'zxmg',
      detail: {},
      timestamp: new Date(),
    });

    const dashboard = await engine.getSynergyDashboard();

    expect(dashboard.totalIdentified).toBe(2);
  });

  it('should track missed opportunities (synergies without plans)', async () => {
    // Detect synergies but don't create plans
    await engine.detectSynergy({
      type: 'app_launch',
      subsidiary: 'zionx',
      detail: {},
      timestamp: new Date(),
    });

    const dashboard = await engine.getSynergyDashboard();

    expect(dashboard.missedOpportunities).toBe(1);
  });

  it('should calculate standing rule compliance percentage', async () => {
    // Add two rules
    await engine.addStandingRule({
      name: 'Rule A',
      description: 'Test rule A',
      sourceSubsidiary: 'zxmg',
      targetSubsidiary: 'zionx',
      condition: 'video_published',
      action: 'include_commercial',
      createdBy: 'king',
      enabled: true,
    });
    await engine.addStandingRule({
      name: 'Rule B',
      description: 'Test rule B',
      sourceSubsidiary: 'zionx',
      targetSubsidiary: 'zxmg',
      condition: 'app_published',
      action: 'notify_content_team',
      createdBy: 'king',
      enabled: true,
    });

    // Violate one rule
    await engine.enforceStandingRules('zxmg', 'video_published');

    const dashboard = await engine.getSynergyDashboard();

    // 1 out of 2 rules violated → 50% compliance
    expect(dashboard.standingRuleCompliance).toBe(50);
  });

  it('should calculate total revenue impact from activated plans', async () => {
    // Detect and create activation plan
    const synergy = await engine.detectSynergy({
      type: 'app_launch',
      subsidiary: 'zionx',
      detail: {},
      timestamp: new Date(),
    });

    // Create plan (status becomes 'submitted' which is not 'activated')
    await engine.createActivationPlan(synergy!);

    const dashboard = await engine.getSynergyDashboard();

    // Submitted plans are not yet activated (need approved/executing/completed)
    expect(dashboard.totalActivated).toBe(0);
    expect(dashboard.totalRevenueImpact).toBe(0);
  });
});
