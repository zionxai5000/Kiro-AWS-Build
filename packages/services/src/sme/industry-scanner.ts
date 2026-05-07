/**
 * Industry Scanner — monitors external technology sources, assesses relevance
 * to SeraphimOS, maintains a technology roadmap, and auto-submits high-impact
 * adoption recommendations.
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService, ZikaronService } from '@seraphim/core';
import type { RecommendationQueue, Recommendation, ResearchSource } from './heartbeat-scheduler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TechnologyCategory = 'model' | 'framework' | 'infrastructure' | 'technique' | 'service';

export type AdoptionComplexity = 'low' | 'medium' | 'high';

export type RecommendedTimeline = 'immediate' | '3_months' | '6_months' | '12_months' | 'monitor';

export interface TechnologyDiscovery {
  id: string;
  name: string;
  description: string;
  source: string;
  discoveredAt: Date;
  category: TechnologyCategory;
}

export interface TechnologyAssessment {
  id: string;
  technology: TechnologyDiscovery;
  relevanceScore: number; // 0.0 - 1.0
  relevantDomains: string[]; // which sub-agents benefit
  adoptionComplexity: AdoptionComplexity;
  estimatedBenefit: string;
  competitiveAdvantage: string;
  recommendedTimeline: RecommendedTimeline;
  integrationPlan?: string;
  assessedAt: Date;
}

export interface TechnologyRoadmap {
  lastUpdated: Date;
  availableNow: TechnologyAssessment[];
  threeMonths: TechnologyAssessment[];
  sixMonths: TechnologyAssessment[];
  twelveMonths: TechnologyAssessment[];
  monitoring: TechnologyAssessment[];
}

export interface ScanResult {
  id: string;
  timestamp: Date;
  sourcesScanned: number;
  discoveries: TechnologyDiscovery[];
  assessments: TechnologyAssessment[];
  errors: Array<{ source: string; error: string }>;
}

export interface AssessmentFilter {
  domain?: string;
  minRelevance?: number;
  timeline?: RecommendedTimeline;
  category?: TechnologyCategory;
}

/**
 * LLM provider interface for classification and assessment tasks.
 */
export interface LLMProvider {
  /**
   * Classify whether a discovery is relevant to SeraphimOS and sub-agent domains.
   * Returns relevant domain names or empty array if not relevant.
   */
  classifyRelevance(discovery: TechnologyDiscovery): Promise<{
    relevant: boolean;
    domains: string[];
    confidence: number;
  }>;

  /**
   * Generate a structured technology assessment via LLM analysis.
   */
  assessTechnology(discovery: TechnologyDiscovery): Promise<{
    relevanceScore: number;
    relevantDomains: string[];
    adoptionComplexity: AdoptionComplexity;
    estimatedBenefit: string;
    competitiveAdvantage: string;
    recommendedTimeline: RecommendedTimeline;
    integrationPlan: string;
  }>;

  /**
   * Extract technology discoveries from raw source content.
   */
  extractDiscoveries(sourceContent: string, sourceName: string): Promise<TechnologyDiscovery[]>;
}

/**
 * Source fetcher interface — abstracts fetching content from external sources.
 */
export interface SourceFetcher {
  fetch(source: ResearchSource): Promise<string>;
}

// ---------------------------------------------------------------------------
// IndustryScanner Interface
// ---------------------------------------------------------------------------

export interface IndustryScanner {
  configureSources(sources: ResearchSource[]): Promise<void>;
  getSources(): Promise<ResearchSource[]>;
  executeScan(): Promise<ScanResult>;
  getLastScan(): Promise<ScanResult | null>;
  assessTechnology(tech: TechnologyDiscovery): Promise<TechnologyAssessment>;
  getAssessments(filter?: AssessmentFilter): Promise<TechnologyAssessment[]>;
  getRoadmap(): Promise<TechnologyRoadmap>;
  updateRoadmap(): Promise<TechnologyRoadmap>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface IndustryScannerConfig {
  tenantId: string;
  eventBus: EventBusService;
  zikaron: ZikaronService;
  recommendationQueue: RecommendationQueue;
  llmProvider: LLMProvider;
  sourceFetcher: SourceFetcher;
  /** Relevance score threshold for auto-submitting recommendations (default: 0.8) */
  highImpactThreshold?: number;
}

// ---------------------------------------------------------------------------
// Default Sources
// ---------------------------------------------------------------------------

export const DEFAULT_SCAN_SOURCES: ResearchSource[] = [
  {
    name: 'arXiv AI/ML',
    type: 'rss_feed',
    url: 'https://arxiv.org/rss/cs.AI',
    scanFrequency: '0 6 * * *', // daily at 6am
    relevantDomains: ['seraphim-core', 'zionx', 'zxmg', 'zion-alpha'],
    enabled: true,
  },
  {
    name: 'Hugging Face Releases',
    type: 'api',
    url: 'https://huggingface.co/api/models',
    scanFrequency: '0 6 * * *',
    relevantDomains: ['seraphim-core', 'zionx', 'zxmg', 'zion-alpha'],
    enabled: true,
  },
  {
    name: 'AWS What\'s New',
    type: 'rss_feed',
    url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
    scanFrequency: '0 6 * * *',
    relevantDomains: ['seraphim-core'],
    enabled: true,
  },
  {
    name: 'Anthropic Blog',
    type: 'web_scrape',
    url: 'https://www.anthropic.com/blog',
    scanFrequency: '0 6 * * *',
    relevantDomains: ['seraphim-core'],
    enabled: true,
  },
  {
    name: 'OpenAI Blog',
    type: 'web_scrape',
    url: 'https://openai.com/blog',
    scanFrequency: '0 6 * * *',
    relevantDomains: ['seraphim-core'],
    enabled: true,
  },
  {
    name: 'GitHub Trending AI/ML',
    type: 'api',
    url: 'https://api.github.com/search/repositories?q=topic:ai+topic:ml&sort=stars',
    scanFrequency: '0 6 * * *',
    relevantDomains: ['seraphim-core'],
    enabled: true,
  },
  {
    name: 'App Store Algorithm Updates',
    type: 'web_scrape',
    url: 'https://developer.apple.com/news/',
    scanFrequency: '0 6 * * 1', // weekly on Monday
    relevantDomains: ['zionx'],
    enabled: true,
  },
  {
    name: 'YouTube Creator Insider',
    type: 'rss_feed',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCkRfArvrzheW2E7b6SVT7vQ',
    scanFrequency: '0 6 * * 1',
    relevantDomains: ['zxmg'],
    enabled: true,
  },
  {
    name: 'Prediction Market Research',
    type: 'web_scrape',
    url: 'https://polymarket.com/research',
    scanFrequency: '0 6 * * 1',
    relevantDomains: ['zion-alpha'],
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// Domain-to-Agent mapping
// ---------------------------------------------------------------------------

const DOMAIN_AGENT_MAP: Record<string, string> = {
  'seraphim-core': 'agent-seraphim-core',
  'zionx': 'agent-zionx',
  'zxmg': 'agent-zxmg',
  'zion-alpha': 'agent-zion-alpha',
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class IndustryScannerImpl implements IndustryScanner {
  private readonly tenantId: string;
  private readonly eventBus: EventBusService;
  private readonly zikaron: ZikaronService;
  private readonly recommendationQueue: RecommendationQueue;
  private readonly llmProvider: LLMProvider;
  private readonly sourceFetcher: SourceFetcher;
  private readonly highImpactThreshold: number;

  private sources: ResearchSource[] = [];
  private assessments: TechnologyAssessment[] = [];
  private lastScanResult: ScanResult | null = null;
  private roadmap: TechnologyRoadmap = {
    lastUpdated: new Date(),
    availableNow: [],
    threeMonths: [],
    sixMonths: [],
    twelveMonths: [],
    monitoring: [],
  };

  constructor(config: IndustryScannerConfig) {
    this.tenantId = config.tenantId;
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
    this.recommendationQueue = config.recommendationQueue;
    this.llmProvider = config.llmProvider;
    this.sourceFetcher = config.sourceFetcher;
    this.highImpactThreshold = config.highImpactThreshold ?? 0.8;

    // Initialize with default sources
    this.sources = [...DEFAULT_SCAN_SOURCES];
  }

  /**
   * Configure the list of research sources.
   * Replaces the current source list with the provided sources.
   *
   * Requirement 24.1: Monitor configurable sources
   */
  async configureSources(sources: ResearchSource[]): Promise<void> {
    this.sources = [...sources];
  }

  /**
   * Get the current list of configured sources.
   */
  async getSources(): Promise<ResearchSource[]> {
    return [...this.sources];
  }

  /**
   * Execute a full scan across all enabled sources.
   * Extracts discoveries, classifies relevance, generates assessments,
   * auto-submits high-impact recommendations, and notifies relevant sub-agents.
   *
   * Requirements: 24.1, 24.2, 24.4, 24.5
   */
  async executeScan(): Promise<ScanResult> {
    const enabledSources = this.sources.filter((s) => s.enabled);
    const discoveries: TechnologyDiscovery[] = [];
    const newAssessments: TechnologyAssessment[] = [];
    const errors: Array<{ source: string; error: string }> = [];

    // Phase 1: Fetch content from each enabled source and extract discoveries
    for (const source of enabledSources) {
      try {
        const content = await this.sourceFetcher.fetch(source);
        const sourceDiscoveries = await this.llmProvider.extractDiscoveries(content, source.name);
        discoveries.push(...sourceDiscoveries);
      } catch (err) {
        errors.push({
          source: source.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Phase 2: Filter for relevance using LLM classification
    const relevantDiscoveries: TechnologyDiscovery[] = [];
    for (const discovery of discoveries) {
      try {
        const classification = await this.llmProvider.classifyRelevance(discovery);
        if (classification.relevant) {
          relevantDiscoveries.push(discovery);
        }
      } catch {
        // Skip discoveries that fail classification
      }
    }

    // Phase 3: Assess each relevant discovery
    for (const discovery of relevantDiscoveries) {
      try {
        const assessment = await this.assessTechnology(discovery);
        newAssessments.push(assessment);
      } catch {
        // Skip discoveries that fail assessment
      }
    }

    // Phase 4: Auto-submit high-impact recommendations (Req 24.4)
    for (const assessment of newAssessments) {
      if (
        assessment.relevanceScore >= this.highImpactThreshold &&
        assessment.recommendedTimeline === 'immediate'
      ) {
        await this.submitAdoptionRecommendation(assessment);
      }
    }

    // Phase 5: Notify relevant sub-agents of domain-specific advances (Req 24.5)
    await this.notifyDomainAgents(newAssessments);

    const result: ScanResult = {
      id: randomUUID(),
      timestamp: new Date(),
      sourcesScanned: enabledSources.length,
      discoveries: relevantDiscoveries,
      assessments: newAssessments,
      errors,
    };

    this.lastScanResult = result;

    return result;
  }

  /**
   * Get the most recent scan result.
   */
  async getLastScan(): Promise<ScanResult | null> {
    return this.lastScanResult;
  }

  /**
   * Assess a single technology discovery.
   * Generates a structured assessment via LLM analysis and stores in Zikaron.
   *
   * Requirements: 24.2, 24.6
   */
  async assessTechnology(tech: TechnologyDiscovery): Promise<TechnologyAssessment> {
    const llmResult = await this.llmProvider.assessTechnology(tech);

    const assessment: TechnologyAssessment = {
      id: randomUUID(),
      technology: tech,
      relevanceScore: llmResult.relevanceScore,
      relevantDomains: llmResult.relevantDomains,
      adoptionComplexity: llmResult.adoptionComplexity,
      estimatedBenefit: llmResult.estimatedBenefit,
      competitiveAdvantage: llmResult.competitiveAdvantage,
      recommendedTimeline: llmResult.recommendedTimeline,
      integrationPlan: llmResult.integrationPlan,
      assessedAt: new Date(),
    };

    // Store assessment in Zikaron semantic memory (Req 24.6)
    await this.storeAssessmentInZikaron(assessment);

    // Add to in-memory assessments list
    this.assessments.push(assessment);

    return assessment;
  }

  /**
   * Get assessments with optional filtering.
   */
  async getAssessments(filter?: AssessmentFilter): Promise<TechnologyAssessment[]> {
    let results = [...this.assessments];

    if (filter?.domain) {
      results = results.filter((a) => a.relevantDomains.includes(filter.domain!));
    }
    if (filter?.minRelevance !== undefined) {
      results = results.filter((a) => a.relevanceScore >= filter.minRelevance!);
    }
    if (filter?.timeline) {
      results = results.filter((a) => a.recommendedTimeline === filter.timeline);
    }
    if (filter?.category) {
      results = results.filter((a) => a.technology.category === filter.category);
    }

    return results;
  }

  /**
   * Get the current technology roadmap.
   *
   * Requirement 24.3: Maintain technology roadmap by timeline
   */
  async getRoadmap(): Promise<TechnologyRoadmap> {
    return { ...this.roadmap };
  }

  /**
   * Rebuild the technology roadmap from current assessments.
   * Categorizes assessments by their recommended timeline.
   *
   * Requirement 24.3
   */
  async updateRoadmap(): Promise<TechnologyRoadmap> {
    const availableNow: TechnologyAssessment[] = [];
    const threeMonths: TechnologyAssessment[] = [];
    const sixMonths: TechnologyAssessment[] = [];
    const twelveMonths: TechnologyAssessment[] = [];
    const monitoring: TechnologyAssessment[] = [];

    for (const assessment of this.assessments) {
      switch (assessment.recommendedTimeline) {
        case 'immediate':
          availableNow.push(assessment);
          break;
        case '3_months':
          threeMonths.push(assessment);
          break;
        case '6_months':
          sixMonths.push(assessment);
          break;
        case '12_months':
          twelveMonths.push(assessment);
          break;
        case 'monitor':
          monitoring.push(assessment);
          break;
      }
    }

    this.roadmap = {
      lastUpdated: new Date(),
      availableNow,
      threeMonths,
      sixMonths,
      twelveMonths,
      monitoring,
    };

    return { ...this.roadmap };
  }

  // ---------------------------------------------------------------------------
  // Private: Recommendation Submission
  // ---------------------------------------------------------------------------

  /**
   * Submit an adoption recommendation to the Recommendation Queue when a
   * technology is assessed as high-impact and production-ready.
   *
   * Requirement 24.4
   */
  private async submitAdoptionRecommendation(assessment: TechnologyAssessment): Promise<void> {
    const recommendation: Recommendation = {
      id: randomUUID(),
      agentId: 'agent-seraphim-core',
      domain: 'technology-adoption',
      priority: Math.round(assessment.relevanceScore * 10),
      submittedAt: new Date(),
      worldClassBenchmark: {
        description: `Industry advance: ${assessment.technology.name}`,
        source: assessment.technology.source,
        metrics: {
          relevance: { value: assessment.relevanceScore, unit: 'score' },
        },
      },
      currentState: {
        description: `SeraphimOS does not yet use ${assessment.technology.name}`,
        metrics: {
          adoption: { value: 0, unit: 'boolean' },
        },
      },
      gapAnalysis: {
        description: `${assessment.technology.name} offers ${assessment.competitiveAdvantage}`,
        gapPercentage: (1 - assessment.relevanceScore) * 100,
        keyGaps: [assessment.estimatedBenefit],
      },
      actionPlan: {
        summary: `Adopt ${assessment.technology.name}: ${assessment.estimatedBenefit}`,
        steps: [
          {
            order: 1,
            description: `Evaluate ${assessment.technology.name} in sandbox environment`,
            type: 'research',
            estimatedDuration: '3 days',
            dependencies: [],
          },
          {
            order: 2,
            description: assessment.integrationPlan ?? `Integrate ${assessment.technology.name} into SeraphimOS`,
            type: 'code_change',
            estimatedDuration: '1 week',
            dependencies: [1],
          },
          {
            order: 3,
            description: `Measure impact of ${assessment.technology.name} adoption`,
            type: 'analysis',
            estimatedDuration: '1 week',
            dependencies: [2],
          },
        ],
        estimatedEffort: '2-3 weeks',
        estimatedImpact: {
          capability: { value: assessment.relevanceScore, unit: 'score' },
        },
        requiresCodeChanges: true,
        requiresBudget: 0,
      },
      riskAssessment: {
        level: assessment.adoptionComplexity === 'high' ? 'high' : assessment.adoptionComplexity === 'medium' ? 'medium' : 'low',
        risks: [`Integration complexity: ${assessment.adoptionComplexity}`],
        mitigations: ['Sandbox evaluation before production deployment'],
      },
      rollbackPlan: `Remove ${assessment.technology.name} integration if performance degrades`,
      status: 'pending',
    };

    await this.recommendationQueue.submit(recommendation);
  }

  // ---------------------------------------------------------------------------
  // Private: Domain Notifications
  // ---------------------------------------------------------------------------

  /**
   * Notify relevant sub-agents when domain-specific advances are detected.
   *
   * Requirement 24.5
   */
  private async notifyDomainAgents(assessments: TechnologyAssessment[]): Promise<void> {
    // Group assessments by domain
    const byDomain = new Map<string, TechnologyAssessment[]>();
    for (const assessment of assessments) {
      for (const domain of assessment.relevantDomains) {
        const existing = byDomain.get(domain) ?? [];
        existing.push(assessment);
        byDomain.set(domain, existing);
      }
    }

    // Publish notification event for each domain with discoveries
    for (const [domain, domainAssessments] of byDomain) {
      const agentId = DOMAIN_AGENT_MAP[domain];
      if (!agentId) continue;

      await this.eventBus.publish({
        source: 'seraphim.industry-scanner',
        type: 'industry.domain.advance',
        detail: {
          domain,
          agentId,
          discoveries: domainAssessments.map((a) => ({
            name: a.technology.name,
            category: a.technology.category,
            relevanceScore: a.relevanceScore,
            recommendedTimeline: a.recommendedTimeline,
          })),
          count: domainAssessments.length,
        },
        metadata: {
          tenantId: this.tenantId,
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Zikaron Storage
  // ---------------------------------------------------------------------------

  /**
   * Store a technology assessment in Zikaron semantic memory.
   *
   * Requirement 24.6
   */
  private async storeAssessmentInZikaron(assessment: TechnologyAssessment): Promise<void> {
    await this.zikaron.storeSemantic({
      id: assessment.id,
      tenantId: this.tenantId,
      layer: 'semantic',
      content: `Technology Assessment: ${assessment.technology.name} — ${assessment.technology.description}. ` +
        `Relevance: ${assessment.relevanceScore}, Complexity: ${assessment.adoptionComplexity}, ` +
        `Timeline: ${assessment.recommendedTimeline}, Benefit: ${assessment.estimatedBenefit}`,
      embedding: [],
      sourceAgentId: 'agent-seraphim-core',
      tags: [
        'technology-assessment',
        assessment.technology.category,
        ...assessment.relevantDomains,
      ],
      createdAt: assessment.assessedAt,
      entityType: 'technology_assessment',
      relationships: assessment.relevantDomains.map((domain) => ({
        subjectId: assessment.id,
        predicate: 'relevant_to',
        objectId: DOMAIN_AGENT_MAP[domain] ?? domain,
        confidence: assessment.relevanceScore,
      })),
      confidence: assessment.relevanceScore,
      source: 'extracted',
    });
  }
}
