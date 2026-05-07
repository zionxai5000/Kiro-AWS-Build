/**
 * Unit tests for Eretz Reusable Business Pattern Library
 *
 * Validates: Requirements 29c.9, 29c.10, 29c.11, 29c.12, 19.1
 *
 * Tests pattern extraction, storage in Zikaron, semantic similarity search,
 * pattern recommendation, adoption tracking, and metrics aggregation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EretzPatternLibraryImpl,
} from '../pattern-library.js';
import type {
  PatternLibraryConfig,
  PatternSource,
  BusinessPattern,
  PatternOutcome,
} from '../pattern-library.js';
import type { EventBusService, ZikaronService } from '@seraphim/core';

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
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ agentId: 'test', memories: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createConfig(overrides?: Partial<PatternLibraryConfig>): PatternLibraryConfig {
  return {
    eventBus: createMockEventBus(),
    zikaron: createMockZikaron(),
    ...overrides,
  };
}

function createSampleSource(overrides?: Partial<PatternSource>): PatternSource {
  return {
    subsidiary: 'zionx',
    action: 'freemium_monetization',
    outcome: { revenue: 5000, conversions: 150 },
    metrics: { conversionRate: 0.03, arpu: 4.5 },
    context: 'Successful freemium monetization with in-app purchases driving revenue growth',
    ...overrides,
  };
}

function createSamplePattern(overrides?: Partial<BusinessPattern>): BusinessPattern {
  return {
    id: 'pat-001',
    name: 'Freemium monetization pattern',
    description: 'Freemium model with in-app purchases',
    type: 'monetization',
    sourceSubsidiary: 'zionx',
    generalizedInsight: 'Freemium with strategic paywalls drives conversion',
    confidence: 0.8,
    adoptionCount: 2,
    successRate: 0.75,
    steps: [
      { order: 1, action: 'assess', description: 'Assess applicability', expectedOutcome: 'Assessment done' },
      { order: 2, action: 'adapt', description: 'Adapt pattern', expectedOutcome: 'Plan ready' },
    ],
    prerequisites: ['App with user base'],
    applicabilityCriteria: ['Digital product with free tier'],
    contraindications: ['B2B enterprise only products'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pattern Extraction Tests
// ---------------------------------------------------------------------------

describe('EretzPatternLibrary — Pattern Extraction', () => {
  let library: EretzPatternLibraryImpl;
  let config: PatternLibraryConfig;

  beforeEach(() => {
    config = createConfig();
    library = new EretzPatternLibraryImpl(config);
  });

  it('should extract and generalize a pattern from subsidiary outcome', async () => {
    const source = createSampleSource();

    const pattern = await library.extractPattern(source);

    expect(pattern).toBeDefined();
    expect(pattern.id).toBeTruthy();
    expect(pattern.sourceSubsidiary).toBe('zionx');
    expect(pattern.type).toBe('monetization');
    expect(pattern.generalizedInsight).toContain('zionx');
    expect(pattern.generalizedInsight).toContain('freemium_monetization');
    expect(pattern.confidence).toBeGreaterThan(0);
  });

  it('should categorize extracted pattern by inferred type', async () => {
    const revenueSource = createSampleSource({
      action: 'revenue_optimization',
      context: 'Revenue growth through pricing strategy',
    });
    const pattern = await library.extractPattern(revenueSource);
    expect(pattern.type).toBe('monetization');

    const acquisitionSource = createSampleSource({
      action: 'user_growth',
      context: 'User acquisition through viral referral program',
    });
    const acquisitionPattern = await library.extractPattern(acquisitionSource);
    expect(acquisitionPattern.type).toBe('user_acquisition');
  });

  it('should generalize pattern for cross-subsidiary application', async () => {
    const source = createSampleSource({ subsidiary: 'zxmg' });

    const pattern = await library.extractPattern(source);

    expect(pattern.generalizedInsight).toContain('adapted for other subsidiaries');
    expect(pattern.applicabilityCriteria.length).toBeGreaterThan(0);
    expect(pattern.steps.length).toBeGreaterThan(0);
  });

  it('should publish pattern.extracted event on extraction', async () => {
    const source = createSampleSource();

    const pattern = await library.extractPattern(source);

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'pattern.extracted',
        detail: expect.objectContaining({
          patternId: pattern.id,
          category: pattern.type,
          sourceSubsidiary: 'zionx',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: pattern.id,
          timestamp: expect.any(Date),
        }),
      }),
    );
  });

  it('should store extracted pattern with effectiveness metrics', async () => {
    const source = createSampleSource();

    const pattern = await library.extractPattern(source);

    expect(pattern.confidence).toBe(0.7);
    expect(pattern.adoptionCount).toBe(0);
    expect(pattern.successRate).toBe(0);
    expect(pattern.createdAt).toBeInstanceOf(Date);
    expect(pattern.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Pattern Storage Tests
// ---------------------------------------------------------------------------

describe('EretzPatternLibrary — Pattern Storage', () => {
  let library: EretzPatternLibraryImpl;
  let config: PatternLibraryConfig;

  beforeEach(() => {
    config = createConfig();
    library = new EretzPatternLibraryImpl(config);
  });

  it('should store pattern in Zikaron procedural memory', async () => {
    const pattern = createSamplePattern();

    await library.storePattern(pattern);

    expect(config.zikaron.storeProcedural).toHaveBeenCalledTimes(1);
    const call = (config.zikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];

    expect(call.id).toBe(pattern.id);
    expect(call.tenantId).toBe('house-of-zion');
    expect(call.layer).toBe('procedural');
    expect(call.sourceAgentId).toBe('eretz-business-pillar');
    expect(call.workflowPattern).toBe('monetization');
    expect(call.successRate).toBe(0.75);
    expect(call.executionCount).toBe(2);
  });

  it('should include vector embedding for similarity search', async () => {
    const pattern = createSamplePattern();

    await library.storePattern(pattern);

    const call = (config.zikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.embedding).toBeDefined();
    expect(Array.isArray(call.embedding)).toBe(true);
    expect(call.embedding.length).toBe(1536);
  });

  it('should categorize stored pattern with correct tags', async () => {
    const pattern = createSamplePattern({ type: 'retention', sourceSubsidiary: 'zxmg' });

    await library.storePattern(pattern);

    const call = (config.zikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tags).toContain('business-pattern');
    expect(call.tags).toContain('retention');
    expect(call.tags).toContain('zxmg');
  });

  it('should store pattern content as JSON with key fields', async () => {
    const pattern = createSamplePattern();

    await library.storePattern(pattern);

    const call = (config.zikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const content = JSON.parse(call.content);

    expect(content.name).toBe(pattern.name);
    expect(content.description).toBe(pattern.description);
    expect(content.type).toBe(pattern.type);
    expect(content.generalizedInsight).toBe(pattern.generalizedInsight);
    expect(content.sourceSubsidiary).toBe(pattern.sourceSubsidiary);
  });

  it('should store prerequisites and steps in procedural entry', async () => {
    const pattern = createSamplePattern();

    await library.storePattern(pattern);

    const call = (config.zikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prerequisites).toEqual(pattern.prerequisites);
    expect(call.steps.length).toBe(pattern.steps.length);
    expect(call.steps[0].order).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Pattern Search Tests
// ---------------------------------------------------------------------------

describe('EretzPatternLibrary — Semantic Similarity Search', () => {
  let library: EretzPatternLibraryImpl;
  let config: PatternLibraryConfig;

  beforeEach(async () => {
    config = createConfig();
    library = new EretzPatternLibraryImpl(config);

    // Pre-populate with patterns
    await library.storePattern(createSamplePattern({
      id: 'pat-monetization',
      name: 'Freemium monetization',
      description: 'Freemium model with in-app purchases for revenue',
      type: 'monetization',
      generalizedInsight: 'Freemium with strategic paywalls drives revenue conversion',
      sourceSubsidiary: 'zionx',
    }));
    await library.storePattern(createSamplePattern({
      id: 'pat-retention',
      name: 'Gamification retention',
      description: 'Gamification elements to improve user retention and engagement',
      type: 'retention',
      generalizedInsight: 'Gamification loops keep users engaged and reduce churn',
      sourceSubsidiary: 'zionx',
    }));
    await library.storePattern(createSamplePattern({
      id: 'pat-content',
      name: 'Video content strategy',
      description: 'Systematic video content production for audience growth',
      type: 'content_strategy',
      generalizedInsight: 'Consistent video publishing builds audience and drives growth',
      sourceSubsidiary: 'zxmg',
    }));
  });

  it('should return relevant patterns for a monetization challenge', async () => {
    const results = await library.findPatterns({
      challenge: 'Need to improve revenue and monetization',
    });

    expect(results.length).toBeGreaterThan(0);
    const hasMonetization = results.some((p) => p.type === 'monetization');
    expect(hasMonetization).toBe(true);
  });

  it('should filter patterns by type when specified', async () => {
    const results = await library.findPatterns({
      challenge: 'general business improvement',
      type: 'retention',
    });

    expect(results.every((p) => p.type === 'retention')).toBe(true);
  });

  it('should filter patterns by minimum confidence', async () => {
    // Store a low-confidence pattern
    await library.storePattern(createSamplePattern({
      id: 'pat-low',
      name: 'Low confidence pattern',
      description: 'Experimental approach',
      type: 'monetization',
      confidence: 0.2,
      generalizedInsight: 'Experimental monetization approach',
    }));

    const results = await library.findPatterns({
      challenge: 'monetization improvement',
      minConfidence: 0.5,
    });

    expect(results.every((p) => p.confidence >= 0.5)).toBe(true);
  });

  it('should query Zikaron with correct parameters', async () => {
    await library.findPatterns({
      challenge: 'user retention problem',
    });

    expect(config.zikaron.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'user retention problem',
        layers: ['procedural'],
        tenantId: 'house-of-zion',
        limit: 10,
      }),
    );
  });

  it('should sort results by confidence descending', async () => {
    await library.storePattern(createSamplePattern({
      id: 'pat-high',
      name: 'High confidence revenue pattern',
      description: 'Proven revenue monetization approach',
      type: 'monetization',
      confidence: 0.95,
      generalizedInsight: 'Proven revenue monetization',
    }));

    const results = await library.findPatterns({
      challenge: 'revenue monetization',
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });
});

// ---------------------------------------------------------------------------
// Pattern Recommendation Tests
// ---------------------------------------------------------------------------

describe('EretzPatternLibrary — Pattern Recommendation', () => {
  let library: EretzPatternLibraryImpl;
  let config: PatternLibraryConfig;

  beforeEach(async () => {
    config = createConfig();
    library = new EretzPatternLibraryImpl(config);

    // Pre-populate with patterns
    await library.storePattern(createSamplePattern({
      id: 'pat-monetization',
      name: 'Freemium monetization',
      description: 'Freemium model with in-app purchases for revenue',
      type: 'monetization',
      confidence: 0.85,
      adoptionCount: 3,
      successRate: 0.8,
      generalizedInsight: 'Freemium with strategic paywalls drives revenue conversion',
      sourceSubsidiary: 'zionx',
    }));
    await library.storePattern(createSamplePattern({
      id: 'pat-content',
      name: 'Video content strategy',
      description: 'Systematic video content production for audience growth',
      type: 'content_strategy',
      confidence: 0.75,
      adoptionCount: 1,
      successRate: 0.6,
      generalizedInsight: 'Consistent video publishing builds audience and drives growth',
      sourceSubsidiary: 'zxmg',
    }));
  });

  it('should recommend patterns matching a subsidiary challenge', async () => {
    const recommendations = await library.recommendPattern(
      'zxmg',
      'Need to improve revenue and monetization for video content',
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].pattern).toBeDefined();
    expect(recommendations[0].relevanceScore).toBeGreaterThan(0.3);
    expect(recommendations[0].adaptationGuidance).toBeTruthy();
  });

  it('should provide adaptation guidance for cross-subsidiary patterns', async () => {
    const recommendations = await library.recommendPattern(
      'zxmg',
      'Need to improve revenue and monetization',
    );

    const crossSubRec = recommendations.find(
      (r) => r.pattern.sourceSubsidiary !== 'zxmg',
    );

    if (crossSubRec) {
      expect(crossSubRec.adaptationGuidance).toContain('zxmg');
      expect(crossSubRec.adaptationGuidance).toContain(crossSubRec.pattern.sourceSubsidiary);
    }
  });

  it('should sort recommendations by relevance score', async () => {
    const recommendations = await library.recommendPattern(
      'zion_alpha',
      'revenue monetization strategy',
    );

    for (let i = 1; i < recommendations.length; i++) {
      expect(recommendations[i - 1].relevanceScore).toBeGreaterThanOrEqual(
        recommendations[i].relevanceScore,
      );
    }
  });

  it('should filter out low-relevance recommendations', async () => {
    const recommendations = await library.recommendPattern(
      'zion_alpha',
      'revenue monetization',
    );

    for (const rec of recommendations) {
      expect(rec.relevanceScore).toBeGreaterThan(0.3);
    }
  });

  it('should publish pattern.recommended event when recommendations found', async () => {
    await library.recommendPattern(
      'zxmg',
      'Need to improve revenue and monetization',
    );

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'pattern.recommended',
        detail: expect.objectContaining({
          subsidiary: 'zxmg',
          challenge: 'Need to improve revenue and monetization',
          recommendationCount: expect.any(Number),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Adoption Tracking Tests
// ---------------------------------------------------------------------------

describe('EretzPatternLibrary — Adoption Tracking', () => {
  let library: EretzPatternLibraryImpl;
  let config: PatternLibraryConfig;

  beforeEach(async () => {
    config = createConfig();
    library = new EretzPatternLibraryImpl(config);

    await library.storePattern(createSamplePattern({
      id: 'pat-001',
      sourceSubsidiary: 'zionx',
      adoptionCount: 0,
      confidence: 0.7,
      successRate: 0,
    }));
  });

  it('should track pattern adoption by a subsidiary', async () => {
    await library.trackAdoption('pat-001', 'zxmg');

    const metrics = await library.getPatternMetrics();
    expect(metrics.mostAdoptedPatterns[0].adoptionCount).toBe(1);
  });

  it('should increment adoption count on each adoption', async () => {
    await library.trackAdoption('pat-001', 'zxmg');
    await library.trackAdoption('pat-001', 'zion_alpha');

    const metrics = await library.getPatternMetrics();
    expect(metrics.mostAdoptedPatterns[0].adoptionCount).toBe(2);
  });

  it('should publish pattern.adopted event', async () => {
    await library.trackAdoption('pat-001', 'zxmg');

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'pattern.adopted',
        detail: expect.objectContaining({
          patternId: 'pat-001',
          subsidiary: 'zxmg',
          totalAdoptions: 1,
          isCrossSubsidiary: true,
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: 'pat-001',
          timestamp: expect.any(Date),
        }),
      }),
    );
  });

  it('should update confidence scores from real outcomes', async () => {
    await library.trackAdoption('pat-001', 'zxmg');

    const successOutcome: PatternOutcome = {
      subsidiary: 'zxmg',
      success: true,
      metrics: { revenueIncrease: 2000 },
    };

    await library.updateEffectiveness('pat-001', successOutcome);

    const metrics = await library.getPatternMetrics();
    const pattern = metrics.mostAdoptedPatterns[0];
    expect(pattern.successRate).toBe(1.0);
    expect(pattern.confidence).toBeGreaterThan(0.7);
  });

  it('should decrease confidence when outcomes are negative', async () => {
    await library.trackAdoption('pat-001', 'zxmg');
    await library.trackAdoption('pat-001', 'zion_alpha');

    await library.updateEffectiveness('pat-001', {
      subsidiary: 'zxmg',
      success: false,
      metrics: {},
    });
    await library.updateEffectiveness('pat-001', {
      subsidiary: 'zion_alpha',
      success: false,
      metrics: {},
    });

    const metrics = await library.getPatternMetrics();
    const pattern = metrics.mostAdoptedPatterns[0];
    expect(pattern.successRate).toBe(0);
    // Confidence should be lower with 0% success rate
    expect(pattern.confidence).toBeLessThan(0.8);
  });

  it('should publish pattern.effectiveness_updated event', async () => {
    await library.trackAdoption('pat-001', 'zxmg');

    await library.updateEffectiveness('pat-001', {
      subsidiary: 'zxmg',
      success: true,
      metrics: { revenue: 3000 },
    });

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'pattern.effectiveness_updated',
        detail: expect.objectContaining({
          patternId: 'pat-001',
          outcomeSubsidiary: 'zxmg',
          outcomeSuccess: true,
          newSuccessRate: expect.any(Number),
          newConfidence: expect.any(Number),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: 'pat-001',
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Pattern Metrics Tests
// ---------------------------------------------------------------------------

describe('EretzPatternLibrary — Metrics Aggregation', () => {
  let library: EretzPatternLibraryImpl;
  let config: PatternLibraryConfig;

  beforeEach(async () => {
    config = createConfig();
    library = new EretzPatternLibraryImpl(config);
  });

  it('should return empty metrics when no patterns exist', async () => {
    const metrics = await library.getPatternMetrics();

    expect(metrics.totalPatterns).toBe(0);
    expect(metrics.patternsByCategory).toEqual({});
    expect(metrics.mostAdoptedPatterns).toEqual([]);
    expect(metrics.highestImpactPatterns).toEqual([]);
    expect(metrics.recentExtractions).toEqual([]);
    expect(metrics.crossSubsidiaryAdoptions).toBe(0);
  });

  it('should count total patterns correctly', async () => {
    await library.storePattern(createSamplePattern({ id: 'p1', type: 'monetization' }));
    await library.storePattern(createSamplePattern({ id: 'p2', type: 'retention' }));
    await library.storePattern(createSamplePattern({ id: 'p3', type: 'monetization' }));

    const metrics = await library.getPatternMetrics();

    expect(metrics.totalPatterns).toBe(3);
  });

  it('should aggregate patterns by category', async () => {
    await library.storePattern(createSamplePattern({ id: 'p1', type: 'monetization' }));
    await library.storePattern(createSamplePattern({ id: 'p2', type: 'retention' }));
    await library.storePattern(createSamplePattern({ id: 'p3', type: 'monetization' }));
    await library.storePattern(createSamplePattern({ id: 'p4', type: 'content_strategy' }));

    const metrics = await library.getPatternMetrics();

    expect(metrics.patternsByCategory['monetization']).toBe(2);
    expect(metrics.patternsByCategory['retention']).toBe(1);
    expect(metrics.patternsByCategory['content_strategy']).toBe(1);
  });

  it('should track cross-subsidiary adoptions', async () => {
    await library.storePattern(createSamplePattern({
      id: 'pat-cross',
      sourceSubsidiary: 'zionx',
      adoptionCount: 0,
    }));

    // Adoption by a different subsidiary = cross-subsidiary
    await library.trackAdoption('pat-cross', 'zxmg');
    // Adoption by source subsidiary = not cross-subsidiary
    await library.trackAdoption('pat-cross', 'zionx');

    const metrics = await library.getPatternMetrics();

    expect(metrics.crossSubsidiaryAdoptions).toBe(1);
  });

  it('should return most adopted patterns sorted by adoption count', async () => {
    await library.storePattern(createSamplePattern({ id: 'p1', adoptionCount: 5 }));
    await library.storePattern(createSamplePattern({ id: 'p2', adoptionCount: 10 }));
    await library.storePattern(createSamplePattern({ id: 'p3', adoptionCount: 2 }));

    const metrics = await library.getPatternMetrics();

    expect(metrics.mostAdoptedPatterns[0].id).toBe('p2');
    expect(metrics.mostAdoptedPatterns[1].id).toBe('p1');
    expect(metrics.mostAdoptedPatterns[2].id).toBe('p3');
  });

  it('should return recent extractions sorted by creation date', async () => {
    await library.storePattern(createSamplePattern({
      id: 'p1',
      createdAt: new Date('2025-01-01'),
    }));
    await library.storePattern(createSamplePattern({
      id: 'p2',
      createdAt: new Date('2025-03-01'),
    }));
    await library.storePattern(createSamplePattern({
      id: 'p3',
      createdAt: new Date('2025-02-01'),
    }));

    const metrics = await library.getPatternMetrics();

    expect(metrics.recentExtractions[0].id).toBe('p2');
    expect(metrics.recentExtractions[1].id).toBe('p3');
    expect(metrics.recentExtractions[2].id).toBe('p1');
  });
});
