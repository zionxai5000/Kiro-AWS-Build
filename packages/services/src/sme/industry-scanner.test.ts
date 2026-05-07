/**
 * Unit tests for the Industry Scanner.
 *
 * Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 19.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndustryScannerImpl, DEFAULT_SCAN_SOURCES } from './industry-scanner.js';
import type {
  IndustryScannerConfig,
  LLMProvider,
  SourceFetcher,
  TechnologyDiscovery,
  TechnologyAssessment,
} from './industry-scanner.js';
import type { ResearchSource, RecommendationQueue, Recommendation } from './heartbeat-scheduler.js';
import type { EventBusService, ZikaronService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-scanner-001';

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-001'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-001']),
    subscribe: vi.fn().mockResolvedValue('sub-id-001'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('entry-id-001'),
    storeSemantic: vi.fn().mockResolvedValue('entry-id-002'),
    storeProcedural: vi.fn().mockResolvedValue('entry-id-003'),
    storeWorking: vi.fn().mockResolvedValue('entry-id-004'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: 'test',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRecommendationQueue(): RecommendationQueue {
  return {
    submit: vi.fn().mockResolvedValue('rec-id-001'),
  };
}

function createMockLLMProvider(): LLMProvider {
  return {
    classifyRelevance: vi.fn().mockResolvedValue({
      relevant: true,
      domains: ['seraphim-core'],
      confidence: 0.9,
    }),
    assessTechnology: vi.fn().mockResolvedValue({
      relevanceScore: 0.85,
      relevantDomains: ['seraphim-core', 'zionx'],
      adoptionComplexity: 'medium' as const,
      estimatedBenefit: 'Improved inference speed by 40%',
      competitiveAdvantage: 'Faster response times for all sub-agents',
      recommendedTimeline: '3_months' as const,
      integrationPlan: 'Replace current model router with new framework',
    }),
    extractDiscoveries: vi.fn().mockResolvedValue([
      {
        id: 'disc-001',
        name: 'New LLM Framework',
        description: 'A faster inference framework for LLMs',
        source: 'arXiv AI/ML',
        discoveredAt: new Date(),
        category: 'framework' as const,
      },
    ]),
  };
}

function createMockSourceFetcher(): SourceFetcher {
  return {
    fetch: vi.fn().mockResolvedValue('Sample source content with technology news'),
  };
}

function createDiscovery(overrides?: Partial<TechnologyDiscovery>): TechnologyDiscovery {
  return {
    id: 'disc-001',
    name: 'Test Technology',
    description: 'A test technology discovery',
    source: 'arXiv AI/ML',
    discoveredAt: new Date(),
    category: 'framework',
    ...overrides,
  };
}

function createScanner(overrides?: Partial<IndustryScannerConfig>): {
  scanner: IndustryScannerImpl;
  eventBus: EventBusService;
  zikaron: ZikaronService;
  recommendationQueue: RecommendationQueue;
  llmProvider: LLMProvider;
  sourceFetcher: SourceFetcher;
} {
  const eventBus = createMockEventBus();
  const zikaron = createMockZikaron();
  const recommendationQueue = createMockRecommendationQueue();
  const llmProvider = createMockLLMProvider();
  const sourceFetcher = createMockSourceFetcher();

  const config: IndustryScannerConfig = {
    tenantId: TENANT_ID,
    eventBus: overrides?.eventBus ?? eventBus,
    zikaron: overrides?.zikaron ?? zikaron,
    recommendationQueue: overrides?.recommendationQueue ?? recommendationQueue,
    llmProvider: overrides?.llmProvider ?? llmProvider,
    sourceFetcher: overrides?.sourceFetcher ?? sourceFetcher,
    highImpactThreshold: overrides?.highImpactThreshold ?? 0.8,
  };

  const scanner = new IndustryScannerImpl(config);
  return {
    scanner,
    eventBus: config.eventBus,
    zikaron: config.zikaron,
    recommendationQueue: config.recommendationQueue,
    llmProvider: config.llmProvider,
    sourceFetcher: config.sourceFetcher,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IndustryScanner', () => {
  // -------------------------------------------------------------------------
  // Source Configuration CRUD (Requirement 24.1)
  // -------------------------------------------------------------------------

  describe('configureSources()', () => {
    it('initializes with default scan sources', async () => {
      const { scanner } = createScanner();
      const sources = await scanner.getSources();
      expect(sources).toHaveLength(DEFAULT_SCAN_SOURCES.length);
      expect(sources[0].name).toBe('arXiv AI/ML');
    });

    it('replaces sources with configured list', async () => {
      const { scanner } = createScanner();
      const customSources: ResearchSource[] = [
        {
          name: 'Custom Source',
          type: 'api',
          url: 'https://example.com/api',
          scanFrequency: '0 12 * * *',
          relevantDomains: ['zionx'],
          enabled: true,
        },
      ];

      await scanner.configureSources(customSources);
      const sources = await scanner.getSources();

      expect(sources).toHaveLength(1);
      expect(sources[0].name).toBe('Custom Source');
    });

    it('returns a copy of sources (not a reference)', async () => {
      const { scanner } = createScanner();
      const sources = await scanner.getSources();
      sources.push({
        name: 'Injected',
        type: 'api',
        url: 'https://injected.com',
        scanFrequency: '* * * * *',
        relevantDomains: [],
        enabled: true,
      });

      const sourcesAgain = await scanner.getSources();
      expect(sourcesAgain).toHaveLength(DEFAULT_SCAN_SOURCES.length);
    });

    it('allows setting an empty source list', async () => {
      const { scanner } = createScanner();
      await scanner.configureSources([]);
      const sources = await scanner.getSources();
      expect(sources).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Scan Execution (Requirements 24.1, 24.2)
  // -------------------------------------------------------------------------

  describe('executeScan()', () => {
    it('processes all enabled sources', async () => {
      const { scanner, sourceFetcher } = createScanner();

      // Configure 3 sources, 2 enabled
      await scanner.configureSources([
        {
          name: 'Source A',
          type: 'rss_feed',
          url: 'https://a.com/feed',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
        {
          name: 'Source B',
          type: 'api',
          url: 'https://b.com/api',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['zionx'],
          enabled: true,
        },
        {
          name: 'Source C (disabled)',
          type: 'web_scrape',
          url: 'https://c.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['zxmg'],
          enabled: false,
        },
      ]);

      const result = await scanner.executeScan();

      expect(result.sourcesScanned).toBe(2);
      expect(sourceFetcher.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns scan result with discoveries and assessments', async () => {
      const { scanner } = createScanner();
      await scanner.configureSources([
        {
          name: 'Test Source',
          type: 'rss_feed',
          url: 'https://test.com/feed',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      const result = await scanner.executeScan();

      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.discoveries.length).toBeGreaterThan(0);
      expect(result.assessments.length).toBeGreaterThan(0);
    });

    it('records errors for sources that fail to fetch', async () => {
      const sourceFetcher = createMockSourceFetcher();
      (sourceFetcher.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Network timeout'));

      const { scanner } = createScanner({ sourceFetcher });
      await scanner.configureSources([
        {
          name: 'Failing Source',
          type: 'api',
          url: 'https://fail.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      const result = await scanner.executeScan();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].source).toBe('Failing Source');
      expect(result.errors[0].error).toBe('Network timeout');
    });

    it('filters out irrelevant discoveries via LLM classification', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.classifyRelevance as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ relevant: false, domains: [], confidence: 0.2 });

      const { scanner } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      const result = await scanner.executeScan();

      expect(result.discoveries).toHaveLength(0);
      expect(result.assessments).toHaveLength(0);
    });

    it('stores last scan result accessible via getLastScan()', async () => {
      const { scanner } = createScanner();
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      expect(await scanner.getLastScan()).toBeNull();

      const result = await scanner.executeScan();
      const lastScan = await scanner.getLastScan();

      expect(lastScan).not.toBeNull();
      expect(lastScan!.id).toBe(result.id);
    });
  });

  // -------------------------------------------------------------------------
  // Technology Assessment (Requirement 24.2)
  // -------------------------------------------------------------------------

  describe('assessTechnology()', () => {
    it('generates valid assessment structure with relevance scores', async () => {
      const { scanner } = createScanner();
      const discovery = createDiscovery();

      const assessment = await scanner.assessTechnology(discovery);

      expect(assessment.id).toBeDefined();
      expect(assessment.technology).toEqual(discovery);
      expect(assessment.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(assessment.relevanceScore).toBeLessThanOrEqual(1);
      expect(assessment.relevantDomains).toBeInstanceOf(Array);
      expect(assessment.relevantDomains.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(assessment.adoptionComplexity);
      expect(assessment.estimatedBenefit).toBeTruthy();
      expect(assessment.competitiveAdvantage).toBeTruthy();
      expect(['immediate', '3_months', '6_months', '12_months', 'monitor']).toContain(
        assessment.recommendedTimeline,
      );
      expect(assessment.assessedAt).toBeInstanceOf(Date);
    });

    it('includes integration plan from LLM assessment', async () => {
      const { scanner } = createScanner();
      const discovery = createDiscovery();

      const assessment = await scanner.assessTechnology(discovery);

      expect(assessment.integrationPlan).toBe('Replace current model router with new framework');
    });

    it('stores assessment in Zikaron semantic memory (Req 24.6)', async () => {
      const { scanner, zikaron } = createScanner();
      const discovery = createDiscovery();

      await scanner.assessTechnology(discovery);

      expect(zikaron.storeSemantic).toHaveBeenCalledTimes(1);
      const storedEntry = (zikaron.storeSemantic as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(storedEntry.tenantId).toBe(TENANT_ID);
      expect(storedEntry.layer).toBe('semantic');
      expect(storedEntry.entityType).toBe('technology_assessment');
      expect(storedEntry.tags).toContain('technology-assessment');
      expect(storedEntry.content).toContain('Test Technology');
    });
  });

  // -------------------------------------------------------------------------
  // Roadmap Categorization (Requirement 24.3)
  // -------------------------------------------------------------------------

  describe('getRoadmap() / updateRoadmap()', () => {
    it('categorizes assessments by timeline', async () => {
      const llmProvider = createMockLLMProvider();
      const timelines = ['immediate', '3_months', '6_months', '12_months', 'monitor'] as const;
      let callCount = 0;

      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const timeline = timelines[callCount % timelines.length];
        callCount++;
        return Promise.resolve({
          relevanceScore: 0.7,
          relevantDomains: ['seraphim-core'],
          adoptionComplexity: 'medium' as const,
          estimatedBenefit: 'Test benefit',
          competitiveAdvantage: 'Test advantage',
          recommendedTimeline: timeline,
          integrationPlan: 'Test plan',
        });
      });

      const { scanner } = createScanner({ llmProvider });

      // Assess 5 technologies with different timelines
      for (let i = 0; i < 5; i++) {
        await scanner.assessTechnology(createDiscovery({ id: `disc-${i}`, name: `Tech ${i}` }));
      }

      const roadmap = await scanner.updateRoadmap();

      expect(roadmap.availableNow).toHaveLength(1);
      expect(roadmap.threeMonths).toHaveLength(1);
      expect(roadmap.sixMonths).toHaveLength(1);
      expect(roadmap.twelveMonths).toHaveLength(1);
      expect(roadmap.monitoring).toHaveLength(1);
      expect(roadmap.lastUpdated).toBeInstanceOf(Date);
    });

    it('getRoadmap returns current state without rebuilding', async () => {
      const { scanner } = createScanner();

      const roadmap = await scanner.getRoadmap();

      expect(roadmap.availableNow).toHaveLength(0);
      expect(roadmap.threeMonths).toHaveLength(0);
      expect(roadmap.sixMonths).toHaveLength(0);
      expect(roadmap.twelveMonths).toHaveLength(0);
      expect(roadmap.monitoring).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // High-Impact Auto-Submit to Recommendation Queue (Requirement 24.4)
  // -------------------------------------------------------------------------

  describe('auto-submit high-impact recommendations', () => {
    it('submits to Recommendation Queue when relevance >= threshold and timeline is immediate', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockResolvedValue({
        relevanceScore: 0.95,
        relevantDomains: ['seraphim-core'],
        adoptionComplexity: 'low' as const,
        estimatedBenefit: 'Major performance improvement',
        competitiveAdvantage: 'First-mover advantage',
        recommendedTimeline: 'immediate' as const,
        integrationPlan: 'Drop-in replacement',
      });

      const { scanner, recommendationQueue } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      await scanner.executeScan();

      expect(recommendationQueue.submit).toHaveBeenCalled();
      const submitted = (recommendationQueue.submit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Recommendation;
      expect(submitted.domain).toBe('technology-adoption');
      expect(submitted.status).toBe('pending');
      expect(submitted.actionPlan.steps.length).toBeGreaterThan(0);
    });

    it('does NOT submit when relevance is below threshold', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockResolvedValue({
        relevanceScore: 0.5,
        relevantDomains: ['seraphim-core'],
        adoptionComplexity: 'medium' as const,
        estimatedBenefit: 'Minor improvement',
        competitiveAdvantage: 'Marginal',
        recommendedTimeline: 'immediate' as const,
        integrationPlan: 'Simple integration',
      });

      const { scanner, recommendationQueue } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      await scanner.executeScan();

      expect(recommendationQueue.submit).not.toHaveBeenCalled();
    });

    it('does NOT submit when timeline is not immediate even if high relevance', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockResolvedValue({
        relevanceScore: 0.95,
        relevantDomains: ['seraphim-core'],
        adoptionComplexity: 'medium' as const,
        estimatedBenefit: 'Great improvement',
        competitiveAdvantage: 'Strong advantage',
        recommendedTimeline: '3_months' as const,
        integrationPlan: 'Needs preparation',
      });

      const { scanner, recommendationQueue } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      await scanner.executeScan();

      expect(recommendationQueue.submit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Domain Notifications (Requirement 24.5)
  // -------------------------------------------------------------------------

  describe('domain-specific notifications', () => {
    it('notifies relevant sub-agents when domain-specific advances are detected', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockResolvedValue({
        relevanceScore: 0.7,
        relevantDomains: ['zionx', 'zxmg'],
        adoptionComplexity: 'low' as const,
        estimatedBenefit: 'Better UX patterns',
        competitiveAdvantage: 'Improved user experience',
        recommendedTimeline: '3_months' as const,
        integrationPlan: 'Integrate new patterns',
      });

      const { scanner, eventBus } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['zionx'],
          enabled: true,
        },
      ]);

      await scanner.executeScan();

      // Should publish events for both zionx and zxmg domains
      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const domainEvents = publishCalls.filter(
        (call) => call[0].type === 'industry.domain.advance',
      );

      expect(domainEvents.length).toBe(2);

      const domains = domainEvents.map((call) => call[0].detail.domain);
      expect(domains).toContain('zionx');
      expect(domains).toContain('zxmg');
    });

    it('includes correct agent ID in notification events', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockResolvedValue({
        relevanceScore: 0.7,
        relevantDomains: ['zion-alpha'],
        adoptionComplexity: 'low' as const,
        estimatedBenefit: 'Better predictions',
        competitiveAdvantage: 'Higher accuracy',
        recommendedTimeline: 'monitor' as const,
        integrationPlan: 'Evaluate first',
      });

      const { scanner, eventBus } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['zion-alpha'],
          enabled: true,
        },
      ]);

      await scanner.executeScan();

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const domainEvent = publishCalls.find(
        (call) => call[0].type === 'industry.domain.advance',
      );

      expect(domainEvent).toBeDefined();
      expect(domainEvent![0].detail.agentId).toBe('agent-zion-alpha');
    });
  });

  // -------------------------------------------------------------------------
  // Zikaron Storage (Requirement 24.6)
  // -------------------------------------------------------------------------

  describe('Zikaron semantic memory storage', () => {
    it('stores all assessments in Zikaron during scan', async () => {
      const llmProvider = createMockLLMProvider();
      (llmProvider.extractDiscoveries as ReturnType<typeof vi.fn>).mockResolvedValue([
        createDiscovery({ id: 'disc-1', name: 'Tech A' }),
        createDiscovery({ id: 'disc-2', name: 'Tech B' }),
      ]);

      const { scanner, zikaron } = createScanner({ llmProvider });
      await scanner.configureSources([
        {
          name: 'Source',
          type: 'rss_feed',
          url: 'https://source.com',
          scanFrequency: '0 6 * * *',
          relevantDomains: ['seraphim-core'],
          enabled: true,
        },
      ]);

      await scanner.executeScan();

      // Each assessed technology should be stored in Zikaron
      expect(zikaron.storeSemantic).toHaveBeenCalledTimes(2);
    });

    it('stores assessment with correct semantic entry structure', async () => {
      const { scanner, zikaron } = createScanner();
      const discovery = createDiscovery({ name: 'Amazing Framework' });

      await scanner.assessTechnology(discovery);

      const storedEntry = (zikaron.storeSemantic as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(storedEntry.layer).toBe('semantic');
      expect(storedEntry.entityType).toBe('technology_assessment');
      expect(storedEntry.source).toBe('extracted');
      expect(storedEntry.confidence).toBeGreaterThan(0);
      expect(storedEntry.relationships.length).toBeGreaterThan(0);
      expect(storedEntry.content).toContain('Amazing Framework');
    });
  });

  // -------------------------------------------------------------------------
  // Assessment Filtering
  // -------------------------------------------------------------------------

  describe('getAssessments()', () => {
    it('returns all assessments when no filter is provided', async () => {
      const { scanner } = createScanner();
      await scanner.assessTechnology(createDiscovery({ id: 'disc-1' }));
      await scanner.assessTechnology(createDiscovery({ id: 'disc-2' }));

      const assessments = await scanner.getAssessments();
      expect(assessments).toHaveLength(2);
    });

    it('filters by domain', async () => {
      const llmProvider = createMockLLMProvider();
      let callCount = 0;
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          relevanceScore: 0.8,
          relevantDomains: callCount === 1 ? ['zionx'] : ['zxmg'],
          adoptionComplexity: 'medium' as const,
          estimatedBenefit: 'Benefit',
          competitiveAdvantage: 'Advantage',
          recommendedTimeline: '3_months' as const,
          integrationPlan: 'Plan',
        });
      });

      const { scanner } = createScanner({ llmProvider });
      await scanner.assessTechnology(createDiscovery({ id: 'disc-1' }));
      await scanner.assessTechnology(createDiscovery({ id: 'disc-2' }));

      const zionxAssessments = await scanner.getAssessments({ domain: 'zionx' });
      expect(zionxAssessments).toHaveLength(1);
    });

    it('filters by minimum relevance score', async () => {
      const llmProvider = createMockLLMProvider();
      let callCount = 0;
      (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          relevanceScore: callCount === 1 ? 0.9 : 0.3,
          relevantDomains: ['seraphim-core'],
          adoptionComplexity: 'low' as const,
          estimatedBenefit: 'Benefit',
          competitiveAdvantage: 'Advantage',
          recommendedTimeline: '3_months' as const,
          integrationPlan: 'Plan',
        });
      });

      const { scanner } = createScanner({ llmProvider });
      await scanner.assessTechnology(createDiscovery({ id: 'disc-1' }));
      await scanner.assessTechnology(createDiscovery({ id: 'disc-2' }));

      const highRelevance = await scanner.getAssessments({ minRelevance: 0.5 });
      expect(highRelevance).toHaveLength(1);
    });
  });
});
