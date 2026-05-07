/**
 * Unit tests for seed Domain Expertise Profiles.
 *
 * Validates: Requirements 23.3, 23.4, 23.5, 23.6, 19.1
 *
 * - 23.3: ZionX expertise profile encodes app store knowledge
 * - 23.4: ZXMG expertise profile encodes media production knowledge
 * - 23.5: Zion Alpha expertise profile encodes prediction market knowledge
 * - 23.6: Seraphim Core expertise profile encodes AI orchestration knowledge
 * - 19.1: Test suite validates correctness
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomainExpertiseProfileService } from '../domain-expertise-profile.js';
import type { DomainExpertiseProfileServiceConfig, SeedProfileInput, KnowledgeEntry } from '../domain-expertise-profile.js';
import type { ZikaronService } from '@seraphim/core';
import { zionxExpertiseSeed, ZIONX_AGENT_ID } from './zionx-expertise.js';
import { zxmgExpertiseSeed, ZXMG_AGENT_ID } from './zxmg-expertise.js';
import { zionAlphaExpertiseSeed, ZION_ALPHA_AGENT_ID } from './zion-alpha-expertise.js';
import { seraphimCoreExpertiseSeed, SERAPHIM_CORE_AGENT_ID } from './seraphim-core-expertise.js';
import { eretzExpertiseSeed, ERETZ_AGENT_ID } from './eretz-expertise.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-seeds';

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id'),
    storeWorking: vi.fn().mockResolvedValue('working-id'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: '',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function validateKnowledgeEntry(entry: Omit<KnowledgeEntry, 'id'>): void {
  expect(entry.topic).toBeTruthy();
  expect(entry.content).toBeTruthy();
  expect(entry.source).toBeTruthy();
  expect(entry.confidence).toBeGreaterThanOrEqual(0);
  expect(entry.confidence).toBeLessThanOrEqual(1);
  expect(entry.lastVerified).toBeInstanceOf(Date);
  expect(Array.isArray(entry.tags)).toBe(true);
  expect(entry.tags.length).toBeGreaterThan(0);
}

function validateSeedStructure(seed: SeedProfileInput): void {
  expect(seed.agentId).toBeTruthy();
  expect(seed.domain).toBeTruthy();
  expect(seed.knowledgeEntries.length).toBeGreaterThan(0);
  expect(seed.decisionFrameworks.length).toBeGreaterThan(0);
  expect(seed.qualityBenchmarks.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Seed Expertise Profiles — Structure Validation', () => {
  describe('ZionX Seed Profile (Req 23.3)', () => {
    it('contains required knowledge categories', () => {
      const tags = zionxExpertiseSeed.knowledgeEntries.flatMap((e) => e.tags);

      expect(tags).toContain('aso');
      expect(tags).toContain('monetization');
      expect(tags).toContain('user-acquisition');
      expect(tags).toContain('retention');
      expect(tags).toContain('review-guidelines');
    });

    it('has valid structure and confidence scores', () => {
      validateSeedStructure(zionxExpertiseSeed);
      zionxExpertiseSeed.knowledgeEntries.forEach(validateKnowledgeEntry);
    });

    it('has correct agent ID and domain', () => {
      expect(zionxExpertiseSeed.agentId).toBe(ZIONX_AGENT_ID);
      expect(zionxExpertiseSeed.domain).toBe('app-development');
    });

    it('includes monetization model benchmarks', () => {
      const monetizationEntries = zionxExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('monetization'),
      );
      expect(monetizationEntries.length).toBeGreaterThanOrEqual(3);
      const topics = monetizationEntries.map((e) => e.topic.toLowerCase());
      expect(topics.some((t) => t.includes('subscription'))).toBe(true);
      expect(topics.some((t) => t.includes('iap'))).toBe(true);
      expect(topics.some((t) => t.includes('ad'))).toBe(true);
    });

    it('includes Apple and Google review guidelines', () => {
      const guidelineEntries = zionxExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('review-guidelines'),
      );
      expect(guidelineEntries.length).toBeGreaterThanOrEqual(2);
      const tags = guidelineEntries.flatMap((e) => e.tags);
      expect(tags).toContain('apple');
      expect(tags).toContain('google');
    });

    it('includes competitive analysis data', () => {
      expect(zionxExpertiseSeed.competitiveIntelligence).toBeDefined();
      expect(zionxExpertiseSeed.competitiveIntelligence!.length).toBeGreaterThan(0);
    });

    it('includes decision frameworks', () => {
      expect(zionxExpertiseSeed.decisionFrameworks.length).toBeGreaterThanOrEqual(2);
      const names = zionxExpertiseSeed.decisionFrameworks.map((f) => f.name);
      expect(names.some((n) => n.toLowerCase().includes('monetization'))).toBe(true);
    });
  });

  describe('ZXMG Seed Profile (Req 23.4)', () => {
    it('contains required knowledge categories', () => {
      const tags = zxmgExpertiseSeed.knowledgeEntries.flatMap((e) => e.tags);

      expect(tags).toContain('algorithm');
      expect(tags).toContain('thumbnail');
      expect(tags).toContain('content-structure');
      expect(tags).toContain('cadence');
      expect(tags).toContain('cross-platform');
      expect(tags).toContain('monetization');
    });

    it('has valid structure and confidence scores', () => {
      validateSeedStructure(zxmgExpertiseSeed);
      zxmgExpertiseSeed.knowledgeEntries.forEach(validateKnowledgeEntry);
    });

    it('has correct agent ID and domain', () => {
      expect(zxmgExpertiseSeed.agentId).toBe(ZXMG_AGENT_ID);
      expect(zxmgExpertiseSeed.domain).toBe('media-production');
    });

    it('includes YouTube algorithm signals', () => {
      const algorithmEntries = zxmgExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('algorithm'),
      );
      expect(algorithmEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('includes thumbnail and title optimization', () => {
      const thumbnailEntries = zxmgExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('thumbnail') || e.tags.includes('title'),
      );
      expect(thumbnailEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('includes monetization benchmarks (CPM, RPM)', () => {
      const monetizationEntries = zxmgExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('monetization'),
      );
      expect(monetizationEntries.length).toBeGreaterThanOrEqual(2);
      const content = monetizationEntries.map((e) => e.content.toLowerCase()).join(' ');
      expect(content).toContain('cpm');
      expect(content).toContain('rpm');
    });
  });

  describe('Zion Alpha Seed Profile (Req 23.5)', () => {
    it('contains required knowledge categories', () => {
      const tags = zionAlphaExpertiseSeed.knowledgeEntries.flatMap((e) => e.tags);

      expect(tags).toContain('kalshi');
      expect(tags).toContain('polymarket');
      expect(tags).toContain('risk-management');
      expect(tags).toContain('position-sizing');
      expect(tags).toContain('microstructure');
      expect(tags).toContain('forecasting');
    });

    it('has valid structure and confidence scores', () => {
      validateSeedStructure(zionAlphaExpertiseSeed);
      zionAlphaExpertiseSeed.knowledgeEntries.forEach(validateKnowledgeEntry);
    });

    it('has correct agent ID and domain', () => {
      expect(zionAlphaExpertiseSeed.agentId).toBe(ZION_ALPHA_AGENT_ID);
      expect(zionAlphaExpertiseSeed.domain).toBe('prediction-markets');
    });

    it('includes position sizing models (Kelly criterion)', () => {
      const positionEntries = zionAlphaExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('position-sizing'),
      );
      expect(positionEntries.length).toBeGreaterThanOrEqual(3);
      const content = positionEntries.map((e) => e.content.toLowerCase()).join(' ');
      expect(content).toContain('kelly');
      const tags = positionEntries.flatMap((e) => e.tags);
      expect(tags).toContain('fractional-kelly');
    });

    it('includes risk management frameworks', () => {
      const riskEntries = zionAlphaExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('risk-management'),
      );
      expect(riskEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes prediction market mechanics for both platforms', () => {
      const kalshiEntries = zionAlphaExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('kalshi'),
      );
      const polymarketEntries = zionAlphaExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('polymarket'),
      );
      expect(kalshiEntries.length).toBeGreaterThanOrEqual(1);
      expect(polymarketEntries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Seraphim Core Seed Profile (Req 23.6)', () => {
    it('contains required knowledge categories', () => {
      const tags = seraphimCoreExpertiseSeed.knowledgeEntries.flatMap((e) => e.tags);

      expect(tags).toContain('architecture');
      expect(tags).toContain('coordination');
      expect(tags).toContain('llm');
      expect(tags).toContain('infrastructure');
      expect(tags).toContain('self-improvement');
    });

    it('has valid structure and confidence scores', () => {
      validateSeedStructure(seraphimCoreExpertiseSeed);
      seraphimCoreExpertiseSeed.knowledgeEntries.forEach(validateKnowledgeEntry);
    });

    it('has correct agent ID and domain', () => {
      expect(seraphimCoreExpertiseSeed.agentId).toBe(SERAPHIM_CORE_AGENT_ID);
      expect(seraphimCoreExpertiseSeed.domain).toBe('ai-orchestration');
    });

    it('includes autonomous agent architecture patterns', () => {
      const archEntries = seraphimCoreExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('architecture'),
      );
      expect(archEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes multi-agent coordination designs', () => {
      const coordEntries = seraphimCoreExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('coordination'),
      );
      expect(coordEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes LLM orchestration frameworks', () => {
      const llmEntries = seraphimCoreExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('llm'),
      );
      expect(llmEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes infrastructure cost optimization', () => {
      const infraEntries = seraphimCoreExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('infrastructure'),
      );
      expect(infraEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('includes self-improving system design principles', () => {
      const selfImprovEntries = seraphimCoreExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('self-improvement'),
      );
      expect(selfImprovEntries.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Eretz Seed Profile (Req 29g.23)', () => {
    it('contains required knowledge categories', () => {
      const tags = eretzExpertiseSeed.knowledgeEntries.flatMap((e) => e.tags);

      expect(tags).toContain('conglomerate-strategy');
      expect(tags).toContain('synergy-frameworks');
      expect(tags).toContain('pattern-extraction');
      expect(tags).toContain('portfolio-metrics');
      expect(tags).toContain('training-cascade');
      expect(tags).toContain('operational-excellence');
      expect(tags).toContain('world-class-benchmarks');
    });

    it('has valid structure and confidence scores', () => {
      validateSeedStructure(eretzExpertiseSeed);
      eretzExpertiseSeed.knowledgeEntries.forEach(validateKnowledgeEntry);
    });

    it('has correct agent ID and domain', () => {
      expect(eretzExpertiseSeed.agentId).toBe(ERETZ_AGENT_ID);
      expect(ERETZ_AGENT_ID).toBe('agent-eretz');
      expect(eretzExpertiseSeed.domain).toBe('business-orchestration');
    });

    it('includes conglomerate management strategies', () => {
      const strategyEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('conglomerate-strategy'),
      );
      expect(strategyEntries.length).toBeGreaterThanOrEqual(3);
      const content = strategyEntries.map((e) => e.content.toLowerCase()).join(' ');
      expect(content).toContain('bcg');
      expect(content).toContain('mckinsey');
      expect(content).toContain('portfolio');
    });

    it('includes cross-business synergy frameworks', () => {
      const synergyEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('synergy-frameworks'),
      );
      expect(synergyEntries.length).toBeGreaterThanOrEqual(3);
      const topics = synergyEntries.map((e) => e.topic.toLowerCase());
      expect(topics.some((t) => t.includes('revenue'))).toBe(true);
      expect(topics.some((t) => t.includes('cost'))).toBe(true);
      expect(topics.some((t) => t.includes('knowledge'))).toBe(true);
    });

    it('includes business pattern extraction methodologies', () => {
      const patternEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('pattern-extraction'),
      );
      expect(patternEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes portfolio metrics benchmarks', () => {
      const metricsEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('portfolio-metrics'),
      );
      expect(metricsEntries.length).toBeGreaterThanOrEqual(3);
      const content = metricsEntries.map((e) => e.content.toLowerCase()).join(' ');
      expect(content).toContain('mrr');
      expect(content).toContain('ltv');
      expect(content).toContain('cohort');
    });

    it('includes training cascade best practices', () => {
      const trainingEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('training-cascade'),
      );
      expect(trainingEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes operational excellence benchmarks', () => {
      const opsEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('operational-excellence'),
      );
      expect(opsEntries.length).toBeGreaterThanOrEqual(3);
    });

    it('includes world-class conglomerate benchmarks', () => {
      const benchmarkEntries = eretzExpertiseSeed.knowledgeEntries.filter((e) =>
        e.tags.includes('world-class-benchmarks'),
      );
      expect(benchmarkEntries.length).toBeGreaterThanOrEqual(4);
      const tags = benchmarkEntries.flatMap((e) => e.tags);
      expect(tags).toContain('capital-allocation');
      expect(tags).toContain('technology-portfolio');
      expect(tags).toContain('operational-scale');
      expect(tags).toContain('brand-portfolio');
    });

    it('includes competitive intelligence', () => {
      expect(eretzExpertiseSeed.competitiveIntelligence).toBeDefined();
      expect(eretzExpertiseSeed.competitiveIntelligence!.length).toBeGreaterThan(0);
    });

    it('includes decision frameworks', () => {
      expect(eretzExpertiseSeed.decisionFrameworks.length).toBeGreaterThanOrEqual(2);
      const names = eretzExpertiseSeed.decisionFrameworks.map((f) => f.name.toLowerCase());
      expect(names.some((n) => n.includes('allocation') || n.includes('portfolio'))).toBe(true);
      expect(names.some((n) => n.includes('synergy'))).toBe(true);
    });
  });
});

describe('Seed Expertise Profiles — Zikaron Integration', () => {
  let mockZikaron: ZikaronService;
  let service: DomainExpertiseProfileService;

  beforeEach(() => {
    mockZikaron = createMockZikaronService();
    const config: DomainExpertiseProfileServiceConfig = {
      tenantId: TENANT_ID,
      zikaronService: mockZikaron,
    };
    service = new DomainExpertiseProfileService(config);
  });

  it('ZionX seed loads correctly into Zikaron memory layers', async () => {
    const profile = await service.createProfile(zionxExpertiseSeed);

    // Knowledge entries stored in semantic memory
    const semanticCalls = vi.mocked(mockZikaron.storeSemantic).mock.calls;
    expect(semanticCalls.length).toBeGreaterThan(0);
    semanticCalls.forEach((call) => {
      expect(call[0].layer).toBe('semantic');
      expect(call[0].sourceAgentId).toBe(ZIONX_AGENT_ID);
    });

    // Decision frameworks stored in procedural memory
    const proceduralCalls = vi.mocked(mockZikaron.storeProcedural).mock.calls;
    expect(proceduralCalls.length).toBe(zionxExpertiseSeed.decisionFrameworks.length);
    proceduralCalls.forEach((call) => {
      expect(call[0].layer).toBe('procedural');
      expect(call[0].sourceAgentId).toBe(ZIONX_AGENT_ID);
    });

    expect(profile.agentId).toBe(ZIONX_AGENT_ID);
    expect(profile.version).toBe(1);
  });

  it('ZXMG seed loads correctly into Zikaron memory layers', async () => {
    const profile = await service.createProfile(zxmgExpertiseSeed);

    const semanticCalls = vi.mocked(mockZikaron.storeSemantic).mock.calls;
    expect(semanticCalls.length).toBeGreaterThan(0);

    const proceduralCalls = vi.mocked(mockZikaron.storeProcedural).mock.calls;
    expect(proceduralCalls.length).toBe(zxmgExpertiseSeed.decisionFrameworks.length);

    expect(profile.agentId).toBe(ZXMG_AGENT_ID);
    expect(profile.domain).toBe('media-production');
  });

  it('Zion Alpha seed loads correctly into Zikaron memory layers', async () => {
    const profile = await service.createProfile(zionAlphaExpertiseSeed);

    const semanticCalls = vi.mocked(mockZikaron.storeSemantic).mock.calls;
    expect(semanticCalls.length).toBeGreaterThan(0);

    const proceduralCalls = vi.mocked(mockZikaron.storeProcedural).mock.calls;
    expect(proceduralCalls.length).toBe(zionAlphaExpertiseSeed.decisionFrameworks.length);

    expect(profile.agentId).toBe(ZION_ALPHA_AGENT_ID);
    expect(profile.domain).toBe('prediction-markets');
  });

  it('Seraphim Core seed loads correctly into Zikaron memory layers', async () => {
    const profile = await service.createProfile(seraphimCoreExpertiseSeed);

    const semanticCalls = vi.mocked(mockZikaron.storeSemantic).mock.calls;
    expect(semanticCalls.length).toBeGreaterThan(0);

    const proceduralCalls = vi.mocked(mockZikaron.storeProcedural).mock.calls;
    expect(proceduralCalls.length).toBe(seraphimCoreExpertiseSeed.decisionFrameworks.length);

    expect(profile.agentId).toBe(SERAPHIM_CORE_AGENT_ID);
    expect(profile.domain).toBe('ai-orchestration');
  });

  it('all seed profiles store entries with valid confidence scores', async () => {
    const seeds = [zionxExpertiseSeed, zxmgExpertiseSeed, zionAlphaExpertiseSeed, seraphimCoreExpertiseSeed, eretzExpertiseSeed];

    for (const seed of seeds) {
      vi.clearAllMocks();
      await service.createProfile(seed);

      const semanticCalls = vi.mocked(mockZikaron.storeSemantic).mock.calls;
      semanticCalls.forEach((call) => {
        const entry = call[0];
        expect(entry.confidence).toBeGreaterThanOrEqual(0);
        expect(entry.confidence).toBeLessThanOrEqual(1);
      });
    }
  });

  it('Eretz seed loads correctly into Zikaron memory layers', async () => {
    const profile = await service.createProfile(eretzExpertiseSeed);

    // Knowledge entries stored in semantic memory
    const semanticCalls = vi.mocked(mockZikaron.storeSemantic).mock.calls;
    expect(semanticCalls.length).toBeGreaterThan(0);
    semanticCalls.forEach((call) => {
      expect(call[0].layer).toBe('semantic');
      expect(call[0].sourceAgentId).toBe(ERETZ_AGENT_ID);
    });

    // Decision frameworks stored in procedural memory
    const proceduralCalls = vi.mocked(mockZikaron.storeProcedural).mock.calls;
    expect(proceduralCalls.length).toBe(eretzExpertiseSeed.decisionFrameworks.length);
    proceduralCalls.forEach((call) => {
      expect(call[0].layer).toBe('procedural');
      expect(call[0].sourceAgentId).toBe(ERETZ_AGENT_ID);
    });

    expect(profile.agentId).toBe(ERETZ_AGENT_ID);
    expect(profile.domain).toBe('business-orchestration');
    expect(profile.version).toBe(1);
  });
});
