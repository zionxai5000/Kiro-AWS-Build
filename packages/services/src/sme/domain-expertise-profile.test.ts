/**
 * Unit tests for the Domain Expertise Profile Service.
 *
 * Validates: Requirements 23.1, 23.2, 23.7, 23.8, 19.1
 *
 * - 23.1: Maintain domain expertise profiles for each sub-agent
 * - 23.2: Load agent's domain expertise profile into working context
 * - 23.7: Update profile with new findings, flag contradictions
 * - 23.8: Update profile and propagate cross-domain insights
 * - 19.1: Test suite validates correctness
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomainExpertiseProfileService } from './domain-expertise-profile.js';
import type {
  DomainExpertiseProfileServiceConfig,
  SeedProfileInput,
  ProfileUpdateInput,
  DomainExpertiseProfile,
} from './domain-expertise-profile.js';
import type { ZikaronService } from '@seraphim/core';
import type { MemoryResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-001';
const AGENT_ID = 'agent-zionx-001';

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id'),
    storeWorking: vi.fn().mockResolvedValue('working-id'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: AGENT_ID,
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createSeedInput(overrides: Partial<SeedProfileInput> = {}): SeedProfileInput {
  return {
    agentId: overrides.agentId ?? AGENT_ID,
    domain: overrides.domain ?? 'app-development',
    knowledgeEntries: overrides.knowledgeEntries ?? [
      {
        topic: 'App Store Optimization',
        content: 'Keywords in title have 10x weight vs description',
        source: 'apple-developer-docs',
        confidence: 0.9,
        lastVerified: new Date('2025-01-01'),
        tags: ['aso', 'keywords'],
      },
      {
        topic: 'Monetization Models',
        content: 'Subscription apps have 3x higher LTV than IAP-only apps',
        source: 'sensor-tower-report-2024',
        confidence: 0.85,
        lastVerified: new Date('2025-01-15'),
        tags: ['monetization', 'subscription'],
      },
    ],
    decisionFrameworks: overrides.decisionFrameworks ?? [
      {
        name: 'Monetization Model Selection',
        description: 'Choose optimal monetization model based on app category and target audience',
        inputs: ['app_category', 'target_audience', 'content_type'],
        decisionTree: [
          {
            condition: 'Is content consumable (e.g., news, media)?',
            trueAction: 'Use subscription model',
            falseAction: {
              condition: 'Is app utility-focused?',
              trueAction: 'Use one-time purchase or freemium',
              falseAction: 'Use IAP + ads hybrid',
            },
          },
        ],
        historicalAccuracy: 0.78,
        lastCalibrated: new Date('2025-01-01'),
      },
    ],
    qualityBenchmarks: overrides.qualityBenchmarks ?? [
      {
        metric: 'Day-1 Retention',
        worldClass: 0.45,
        current: 0.25,
        unit: 'percentage',
        source: 'industry-benchmark-2024',
        lastUpdated: new Date('2025-01-01'),
      },
    ],
    competitiveIntelligence: overrides.competitiveIntelligence,
    bestPractices: overrides.bestPractices,
    learnedPatterns: overrides.learnedPatterns,
    researchBacklog: overrides.researchBacklog,
    knowledgeGaps: overrides.knowledgeGaps,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DomainExpertiseProfileService', () => {
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

  // -------------------------------------------------------------------------
  // createProfile
  // -------------------------------------------------------------------------

  describe('createProfile', () => {
    it('creates a profile with seed knowledge entries', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);

      expect(profile.agentId).toBe(AGENT_ID);
      expect(profile.domain).toBe('app-development');
      expect(profile.version).toBe(1);
      expect(profile.knowledgeBase).toHaveLength(2);
      expect(profile.knowledgeBase[0].topic).toBe('App Store Optimization');
      expect(profile.knowledgeBase[1].topic).toBe('Monetization Models');
    });

    it('stores knowledge entries in Zikaron semantic memory', async () => {
      const seed = createSeedInput();
      await service.createProfile(seed);

      expect(mockZikaron.storeSemantic).toHaveBeenCalledTimes(2);
      const firstCall = vi.mocked(mockZikaron.storeSemantic).mock.calls[0][0];
      expect(firstCall.layer).toBe('semantic');
      expect(firstCall.sourceAgentId).toBe(AGENT_ID);
      expect(firstCall.tags).toContain('domain-expertise');
      expect(firstCall.tags).toContain('knowledge-entry');
      expect(firstCall.confidence).toBe(0.9);
    });

    it('stores decision frameworks in Zikaron procedural memory', async () => {
      const seed = createSeedInput();
      await service.createProfile(seed);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = vi.mocked(mockZikaron.storeProcedural).mock.calls[0][0];
      expect(call.layer).toBe('procedural');
      expect(call.workflowPattern).toBe('decision-framework:Monetization Model Selection');
      expect(call.sourceAgentId).toBe(AGENT_ID);
    });

    it('includes quality benchmarks in the profile', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);

      expect(profile.qualityBenchmarks).toHaveLength(1);
      expect(profile.qualityBenchmarks[0].metric).toBe('Day-1 Retention');
      expect(profile.qualityBenchmarks[0].worldClass).toBe(0.45);
    });

    it('assigns unique IDs to knowledge entries', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);

      const ids = profile.knowledgeBase.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id).toBeTruthy());
    });

    it('stores best practices in semantic memory when provided', async () => {
      const seed = createSeedInput({
        bestPractices: [
          {
            title: 'Onboarding Flow',
            description: 'Keep onboarding to 3 screens max',
            domain: 'app-development',
            source: 'ux-research',
            confidence: 0.88,
            tags: ['ux', 'onboarding'],
          },
        ],
      });

      const profile = await service.createProfile(seed);

      expect(profile.industryBestPractices).toHaveLength(1);
      expect(profile.industryBestPractices[0].title).toBe('Onboarding Flow');
      // 2 knowledge entries + 1 best practice = 3 semantic calls
      expect(mockZikaron.storeSemantic).toHaveBeenCalledTimes(3);
    });

    it('initializes profile with empty conflicts', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);

      expect(profile.conflicts).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------

  describe('updateProfile', () => {
    let baseProfile: DomainExpertiseProfile;

    beforeEach(async () => {
      baseProfile = await service.createProfile(createSeedInput());
      vi.clearAllMocks();
    });

    it('increments version on update', async () => {
      const update: ProfileUpdateInput = {
        knowledgeEntries: [
          {
            topic: 'New ASO Strategy',
            content: 'Localized screenshots increase conversion by 30%',
            source: 'a/b-test-results',
            confidence: 0.92,
            lastVerified: new Date(),
            tags: ['aso', 'screenshots'],
          },
        ],
      };

      const updated = await service.updateProfile(baseProfile, update);
      expect(updated.version).toBe(baseProfile.version + 1);
    });

    it('adds new knowledge entries to the profile', async () => {
      const update: ProfileUpdateInput = {
        knowledgeEntries: [
          {
            topic: 'Push Notification Timing',
            content: 'Notifications sent at 9am local time have 2x open rate',
            source: 'analytics-data',
            confidence: 0.87,
            lastVerified: new Date(),
            tags: ['notifications', 'engagement'],
          },
        ],
      };

      const updated = await service.updateProfile(baseProfile, update);
      expect(updated.knowledgeBase).toHaveLength(baseProfile.knowledgeBase.length + 1);
      expect(updated.knowledgeBase[updated.knowledgeBase.length - 1].topic).toBe(
        'Push Notification Timing',
      );
    });

    it('stores new entries in Zikaron semantic memory', async () => {
      const update: ProfileUpdateInput = {
        knowledgeEntries: [
          {
            topic: 'Review Guidelines',
            content: 'Apps must not use private APIs',
            source: 'apple-guidelines',
            confidence: 1.0,
            lastVerified: new Date(),
            tags: ['guidelines'],
          },
        ],
      };

      await service.updateProfile(baseProfile, update);
      expect(mockZikaron.storeSemantic).toHaveBeenCalledTimes(1);
    });

    it('adds competitive intelligence to the profile', async () => {
      const update: ProfileUpdateInput = {
        competitiveIntelligence: [
          {
            competitor: 'Calm App',
            domain: 'meditation',
            metrics: { revenue: { value: 200_000_000, unit: 'USD/year' } },
            strategies: ['subscription-first', 'celebrity-narration'],
            strengths: ['brand recognition', 'content library'],
            weaknesses: ['high price point'],
            lastUpdated: new Date(),
          },
        ],
      };

      const updated = await service.updateProfile(baseProfile, update);
      expect(updated.competitiveIntelligence).toHaveLength(1);
      expect(updated.competitiveIntelligence[0].competitor).toBe('Calm App');
    });

    it('adds learned patterns and stores in semantic memory', async () => {
      const update: ProfileUpdateInput = {
        learnedPatterns: [
          {
            pattern: 'Dark mode increases session duration',
            context: 'Observed across 5 apps in productivity category',
            outcome: 'positive',
            confidence: 0.82,
            occurrences: 5,
            firstObserved: new Date('2025-01-01'),
            lastObserved: new Date('2025-03-01'),
          },
        ],
      };

      const updated = await service.updateProfile(baseProfile, update);
      expect(updated.learnedPatterns).toHaveLength(1);
      expect(updated.learnedPatterns[0].pattern).toBe('Dark mode increases session duration');
      expect(mockZikaron.storeSemantic).toHaveBeenCalledTimes(1);
    });

    it('updates lastUpdated timestamp', async () => {
      const before = new Date();
      const updated = await service.updateProfile(baseProfile, {
        knowledgeEntries: [
          {
            topic: 'Test',
            content: 'Test content',
            source: 'test',
            confidence: 0.5,
            lastVerified: new Date(),
            tags: [],
          },
        ],
      });

      expect(updated.lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // loadProfile
  // -------------------------------------------------------------------------

  describe('loadProfile', () => {
    it('assembles knowledge from semantic memory results', async () => {
      const semanticResults: MemoryResult[] = [
        {
          id: 'sem-1',
          layer: 'semantic',
          content: '[app-development] ASO Keywords: Use long-tail keywords in subtitle',
          similarity: 0.95,
          metadata: {
            entityType: 'domain-knowledge',
            confidence: 0.88,
            source: 'research',
            tags: ['aso'],
          },
          sourceAgentId: AGENT_ID,
          timestamp: new Date('2025-02-01'),
        },
        {
          id: 'sem-2',
          layer: 'semantic',
          content: '[app-development] Best Practice: Onboarding — Keep to 3 screens',
          similarity: 0.9,
          metadata: {
            entityType: 'best-practice',
            confidence: 0.85,
            source: 'ux-research',
            tags: ['ux'],
          },
          sourceAgentId: AGENT_ID,
          timestamp: new Date('2025-02-15'),
        },
      ];

      vi.mocked(mockZikaron.queryByAgent).mockImplementation(
        async (_agentId, _query, layers) => {
          if (layers?.includes('semantic')) return semanticResults;
          return [];
        },
      );

      const profile = await service.loadProfile(AGENT_ID, 'app-development');

      expect(profile.agentId).toBe(AGENT_ID);
      expect(profile.domain).toBe('app-development');
      expect(profile.knowledgeBase).toHaveLength(1);
      expect(profile.knowledgeBase[0].id).toBe('sem-1');
      expect(profile.industryBestPractices).toHaveLength(1);
      expect(profile.industryBestPractices[0].id).toBe('sem-2');
    });

    it('loads decision frameworks from procedural memory', async () => {
      const proceduralResults: MemoryResult[] = [
        {
          id: 'proc-1',
          layer: 'procedural',
          content: '[app-development] Framework: Revenue Model — Choose monetization approach',
          similarity: 0.92,
          metadata: {
            workflowPattern: 'decision-framework:Revenue Model',
            prerequisites: ['app_category', 'audience_size'],
            successRate: 0.8,
            decisionTree: [
              {
                condition: 'Is audience > 1M?',
                trueAction: 'Use ads',
                falseAction: 'Use subscription',
              },
            ],
          },
          sourceAgentId: AGENT_ID,
          timestamp: new Date('2025-01-20'),
        },
      ];

      vi.mocked(mockZikaron.queryByAgent).mockImplementation(
        async (_agentId, _query, layers) => {
          if (layers?.includes('procedural')) return proceduralResults;
          return [];
        },
      );

      const profile = await service.loadProfile(AGENT_ID, 'app-development');

      expect(profile.decisionFrameworks).toHaveLength(1);
      expect(profile.decisionFrameworks[0].name).toBe('Revenue Model');
      expect(profile.decisionFrameworks[0].historicalAccuracy).toBe(0.8);
    });

    it('queries Zikaron with correct agent and layers', async () => {
      await service.loadProfile(AGENT_ID, 'app-development');

      expect(mockZikaron.queryByAgent).toHaveBeenCalledWith(
        AGENT_ID,
        expect.stringContaining('domain-expertise'),
        ['semantic'],
      );
      expect(mockZikaron.queryByAgent).toHaveBeenCalledWith(
        AGENT_ID,
        expect.stringContaining('decision-framework'),
        ['procedural'],
      );
    });
  });

  // -------------------------------------------------------------------------
  // resolveConflicts / conflict detection
  // -------------------------------------------------------------------------

  describe('resolveConflicts', () => {
    it('flags contradicting entries on the same topic', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);
      vi.clearAllMocks();

      const newEntry = {
        topic: 'App Store Optimization',
        content: 'Keywords in title have only 5x weight vs description (updated research)',
        source: 'new-study-2025',
        confidence: 0.95,
        lastVerified: new Date(),
        tags: ['aso', 'keywords'],
      };

      const conflicts = await service.resolveConflicts(profile, newEntry);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingContent).toBe(
        'Keywords in title have 10x weight vs description',
      );
      expect(conflicts[0].newContent).toBe(
        'Keywords in title have only 5x weight vs description (updated research)',
      );
      expect(conflicts[0].existingConfidence).toBe(0.9);
      expect(conflicts[0].newConfidence).toBe(0.95);
    });

    it('calls flagConflict on Zikaron service', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);
      vi.clearAllMocks();

      const newEntry = {
        topic: 'App Store Optimization',
        content: 'Different content about ASO',
        source: 'new-source',
        confidence: 0.8,
        lastVerified: new Date(),
        tags: ['aso'],
      };

      await service.resolveConflicts(profile, newEntry);

      expect(mockZikaron.flagConflict).toHaveBeenCalledTimes(1);
      expect(mockZikaron.flagConflict).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          reason: expect.stringContaining('App Store Optimization'),
          detectedBy: AGENT_ID,
        }),
      );
    });

    it('returns empty array when no conflicts exist', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);
      vi.clearAllMocks();

      const newEntry = {
        topic: 'Completely New Topic',
        content: 'Brand new information',
        source: 'new-source',
        confidence: 0.9,
        lastVerified: new Date(),
        tags: ['new'],
      };

      const conflicts = await service.resolveConflicts(profile, newEntry);
      expect(conflicts).toHaveLength(0);
      expect(mockZikaron.flagConflict).not.toHaveBeenCalled();
    });

    it('detects conflicts during updateProfile and adds to profile', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);
      vi.clearAllMocks();

      const update: ProfileUpdateInput = {
        knowledgeEntries: [
          {
            topic: 'App Store Optimization',
            content: 'Updated: Keywords have 7x weight (revised study)',
            source: 'revised-study',
            confidence: 0.93,
            lastVerified: new Date(),
            tags: ['aso'],
          },
        ],
      };

      const updated = await service.updateProfile(profile, update);

      expect(updated.conflicts).toHaveLength(1);
      expect(updated.conflicts[0].reason).toContain('App Store Optimization');
      // The new entry should have contradicts field set
      const newEntry = updated.knowledgeBase[updated.knowledgeBase.length - 1];
      expect(newEntry.contradicts).toBeDefined();
      expect(newEntry.contradicts!.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-domain insight propagation (Req 23.8)
  // -------------------------------------------------------------------------

  describe('cross-domain insight propagation', () => {
    it('stores learned patterns with domain tag for cross-domain discovery', async () => {
      const seed = createSeedInput();
      const profile = await service.createProfile(seed);
      vi.clearAllMocks();

      const update: ProfileUpdateInput = {
        learnedPatterns: [
          {
            pattern: 'Gamification increases engagement',
            context: 'Observed in app development, applicable to content creation',
            outcome: 'positive',
            confidence: 0.9,
            occurrences: 3,
            firstObserved: new Date('2025-01-01'),
            lastObserved: new Date('2025-03-01'),
          },
        ],
      };

      await service.updateProfile(profile, update);

      const semanticCall = vi.mocked(mockZikaron.storeSemantic).mock.calls[0][0];
      expect(semanticCall.tags).toContain('domain-expertise');
      expect(semanticCall.tags).toContain('learned-pattern');
      expect(semanticCall.tags).toContain('app-development');
      // The pattern is stored in semantic memory, making it discoverable
      // by other agents querying for cross-domain insights
      expect(semanticCall.content).toContain('Gamification increases engagement');
    });
  });
});
