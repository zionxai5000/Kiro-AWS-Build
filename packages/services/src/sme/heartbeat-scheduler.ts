/**
 * Heartbeat Scheduler and Review Cycle Engine — proactive domain research,
 * benchmarking, gap analysis, and recommendation generation.
 *
 * Each sub-agent has a scheduled heartbeat that triggers a full review cycle:
 * 1. Load domain expertise profile
 * 2. Execute domain research phase (via LLM + drivers)
 * 3. Benchmark against world-class performance
 * 4. Perform gap analysis
 * 5. Generate prioritized recommendations
 * 6. Submit to Recommendation Queue
 *
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
 */

import { randomUUID } from 'node:crypto';
import type { OtzarService } from '@seraphim/core';
import type { BudgetCheckResult, TokenUsage } from '@seraphim/core';
import type {
  DomainExpertiseProfile,
  QualityBenchmark,
} from './domain-expertise-profile.js';
import { DomainExpertiseProfileService } from './domain-expertise-profile.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResearchDepth = 'shallow' | 'standard' | 'deep';

export interface ResearchSource {
  name: string;
  type: 'rss_feed' | 'api' | 'web_scrape' | 'github_releases';
  url: string;
  scanFrequency: string;
  relevantDomains: string[];
  enabled: boolean;
}

export interface HeartbeatConfig {
  agentId: string;
  intervalMs: number;
  researchDepth: ResearchDepth;
  maxResearchBudgetUsd: number;
  enabled: boolean;
  researchSources: ResearchSource[];
}

export interface MetricValue {
  value: number;
  unit: string;
  context?: string;
}

export interface DomainAssessment {
  domain: string;
  metrics: Record<string, MetricValue>;
  strengths: string[];
  weaknesses: string[];
  overallScore: number;
}

export interface Benchmark {
  name: string;
  source: string;
  metrics: Record<string, MetricValue>;
  lastUpdated: Date;
}

export interface GapAnalysisEntry {
  metric: string;
  currentValue: MetricValue;
  worldClassValue: MetricValue;
  gapPercentage: number;
  priority: number;
  closingStrategy: string;
}

export interface ActionStep {
  order: number;
  description: string;
  type: 'research' | 'code_change' | 'configuration' | 'driver_operation' | 'analysis';
  estimatedDuration: string;
  dependencies: number[];
}

export interface Recommendation {
  id: string;
  agentId: string;
  domain: string;
  priority: number;
  submittedAt: Date;
  worldClassBenchmark: {
    description: string;
    source: string;
    metrics: Record<string, MetricValue>;
  };
  currentState: {
    description: string;
    metrics: Record<string, MetricValue>;
  };
  gapAnalysis: {
    description: string;
    gapPercentage: number;
    keyGaps: string[];
  };
  actionPlan: {
    summary: string;
    steps: ActionStep[];
    estimatedEffort: string;
    estimatedImpact: Record<string, MetricValue>;
    requiresCodeChanges: boolean;
    requiresBudget: number;
  };
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    risks: string[];
    mitigations: string[];
  };
  rollbackPlan: string;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
}

export interface HeartbeatReviewResult {
  id: string;
  agentId: string;
  domain: string;
  timestamp: Date;
  durationMs: number;
  costUsd: number;
  currentStateAssessment: DomainAssessment;
  worldClassBenchmarks: Benchmark[];
  gapAnalysis: GapAnalysisEntry[];
  recommendations: Recommendation[];
  researchSourcesUsed: string[];
  confidenceScore: number;
}

export interface ResearchFindings {
  sources: string[];
  findings: Array<{
    topic: string;
    content: string;
    source: string;
    confidence: number;
  }>;
  costUsd: number;
}

/**
 * Interface for domain-specific research drivers.
 * Each sub-agent domain has its own research driver that knows how to
 * gather relevant data from external sources.
 */
export interface DomainResearchDriver {
  research(
    profile: DomainExpertiseProfile,
    depth: ResearchDepth,
    budgetRemainingUsd: number,
  ): Promise<ResearchFindings>;
}

/**
 * Interface for the Recommendation Queue that receives generated recommendations.
 */
export interface RecommendationQueue {
  submit(recommendation: Recommendation): Promise<string>;
}

// ---------------------------------------------------------------------------
// Default Intervals
// ---------------------------------------------------------------------------

/** 1 hour in milliseconds */
const HOURLY_MS = 60 * 60 * 1000;
/** 24 hours in milliseconds */
const DAILY_MS = 24 * HOURLY_MS;
/** 7 days in milliseconds */
const WEEKLY_MS = 7 * DAILY_MS;

export const DEFAULT_HEARTBEAT_CONFIGS: Record<string, Omit<HeartbeatConfig, 'agentId'>> = {
  'agent-eretz': {
    intervalMs: DAILY_MS,
    researchDepth: 'standard',
    maxResearchBudgetUsd: 2.0,
    enabled: true,
    researchSources: [],
  },
  'agent-zionx': {
    intervalMs: DAILY_MS,
    researchDepth: 'standard',
    maxResearchBudgetUsd: 1.5,
    enabled: true,
    researchSources: [],
  },
  'agent-zxmg': {
    intervalMs: DAILY_MS,
    researchDepth: 'standard',
    maxResearchBudgetUsd: 1.5,
    enabled: true,
    researchSources: [],
  },
  'agent-zion-alpha': {
    intervalMs: HOURLY_MS,
    researchDepth: 'standard',
    maxResearchBudgetUsd: 0.5,
    enabled: true,
    researchSources: [],
  },
  'agent-seraphim-core': {
    intervalMs: WEEKLY_MS,
    researchDepth: 'deep',
    maxResearchBudgetUsd: 5.0,
    enabled: true,
    researchSources: [],
  },
};

// ---------------------------------------------------------------------------
// Heartbeat Scheduler Configuration
// ---------------------------------------------------------------------------

export interface HeartbeatSchedulerConfig {
  tenantId: string;
  profileService: DomainExpertiseProfileService;
  otzarService: OtzarService;
  recommendationQueue: RecommendationQueue;
  researchDrivers: Record<string, DomainResearchDriver>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class HeartbeatScheduler {
  private readonly tenantId: string;
  private readonly profileService: DomainExpertiseProfileService;
  private readonly otzar: OtzarService;
  private readonly recommendationQueue: RecommendationQueue;
  private readonly researchDrivers: Record<string, DomainResearchDriver>;
  private readonly configs: Map<string, HeartbeatConfig> = new Map();
  private readonly reviewHistory: Map<string, HeartbeatReviewResult[]> = new Map();

  constructor(config: HeartbeatSchedulerConfig) {
    this.tenantId = config.tenantId;
    this.profileService = config.profileService;
    this.otzar = config.otzarService;
    this.recommendationQueue = config.recommendationQueue;
    this.researchDrivers = config.researchDrivers;
  }

  /**
   * Configure heartbeat settings for a sub-agent.
   * Uses defaults from DEFAULT_HEARTBEAT_CONFIGS if not explicitly set.
   *
   * Requirement 21.1: Scheduled heartbeat review per sub-agent
   */
  async configure(agentId: string, config?: Partial<HeartbeatConfig>): Promise<void> {
    const defaults = DEFAULT_HEARTBEAT_CONFIGS[agentId];
    const baseConfig: HeartbeatConfig = defaults
      ? { agentId, ...defaults }
      : {
          agentId,
          intervalMs: DAILY_MS,
          researchDepth: 'standard',
          maxResearchBudgetUsd: 1.0,
          enabled: true,
          researchSources: [],
        };

    const merged: HeartbeatConfig = {
      ...baseConfig,
      ...config,
      agentId,
    };

    this.configs.set(agentId, merged);
  }

  /**
   * Get the current heartbeat configuration for a sub-agent.
   */
  async getConfig(agentId: string): Promise<HeartbeatConfig> {
    const config = this.configs.get(agentId);
    if (!config) {
      throw new Error(`No heartbeat configuration found for agent: ${agentId}`);
    }
    return config;
  }

  /**
   * Trigger a full heartbeat review cycle for a sub-agent.
   *
   * Orchestrates: load profile → research → benchmark → gap analysis → recommend → submit
   *
   * Requirements: 21.2, 21.3, 21.4, 21.5, 21.6, 21.7
   */
  async triggerReview(agentId: string): Promise<HeartbeatReviewResult> {
    const config = this.configs.get(agentId);
    if (!config) {
      throw new Error(`No heartbeat configuration found for agent: ${agentId}. Call configure() first.`);
    }

    const startTime = Date.now();
    let totalCostUsd = 0;

    // Phase 1: Load domain expertise profile
    const profile = await this.loadProfile(agentId);

    // Phase 2: Execute domain research (budget-capped via Otzar)
    const researchFindings = await this.executeResearch(
      agentId,
      profile,
      config,
    );
    totalCostUsd += researchFindings.costUsd;

    // Phase 3: Benchmark against world-class performance
    const benchmarks = this.buildBenchmarks(profile);

    // Phase 4: Assess current state
    const currentAssessment = this.assessCurrentState(profile, researchFindings);

    // Phase 5: Gap analysis
    const gaps = this.performGapAnalysis(profile, benchmarks, currentAssessment);

    // Phase 6: Generate recommendations
    const recommendations = this.generateRecommendations(
      agentId,
      profile.domain,
      gaps,
      benchmarks,
      currentAssessment,
    );

    // Phase 7: Submit recommendations to queue
    for (const rec of recommendations) {
      await this.recommendationQueue.submit(rec);
    }

    const durationMs = Date.now() - startTime;

    const result: HeartbeatReviewResult = {
      id: randomUUID(),
      agentId,
      domain: profile.domain,
      timestamp: new Date(),
      durationMs,
      costUsd: totalCostUsd,
      currentStateAssessment: currentAssessment,
      worldClassBenchmarks: benchmarks,
      gapAnalysis: gaps,
      recommendations,
      researchSourcesUsed: researchFindings.sources,
      confidenceScore: this.calculateConfidence(researchFindings, gaps),
    };

    // Persist review history
    const history = this.reviewHistory.get(agentId) ?? [];
    history.push(result);
    this.reviewHistory.set(agentId, history);

    return result;
  }

  /**
   * Get the most recent review result for a sub-agent.
   */
  async getLastReview(agentId: string): Promise<HeartbeatReviewResult | null> {
    const history = this.reviewHistory.get(agentId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  /**
   * Get review history for a sub-agent.
   */
  async getReviewHistory(agentId: string, limit?: number): Promise<HeartbeatReviewResult[]> {
    const history = this.reviewHistory.get(agentId) ?? [];
    if (limit !== undefined) {
      return history.slice(-limit);
    }
    return [...history];
  }

  // ---------------------------------------------------------------------------
  // Private: Phase Implementations
  // ---------------------------------------------------------------------------

  private async loadProfile(agentId: string): Promise<DomainExpertiseProfile> {
    const config = this.configs.get(agentId)!;
    // Determine domain from agent ID
    const domain = this.getDomainForAgent(agentId);
    return this.profileService.loadProfile(agentId, domain);
  }

  /**
   * Execute domain research phase with budget enforcement via Otzar.
   * Before each research call, checks remaining budget.
   *
   * Requirement 21.7: Enforce research budget cap per cycle
   */
  private async executeResearch(
    agentId: string,
    profile: DomainExpertiseProfile,
    config: HeartbeatConfig,
  ): Promise<ResearchFindings> {
    const driver = this.researchDrivers[agentId];
    if (!driver) {
      // No research driver available — return empty findings
      return { sources: [], findings: [], costUsd: 0 };
    }

    // Check budget before research
    const budgetCheck = await this.otzar.checkBudget(
      agentId,
      this.estimateTokensForDepth(config.researchDepth),
    );

    if (!budgetCheck.allowed) {
      return { sources: [], findings: [], costUsd: 0 };
    }

    const budgetRemaining = Math.min(
      config.maxResearchBudgetUsd,
      budgetCheck.remainingDaily,
    );

    // Execute research with budget cap
    const findings = await driver.research(profile, config.researchDepth, budgetRemaining);

    // Record usage with Otzar
    if (findings.costUsd > 0) {
      await this.otzar.recordUsage({
        agentId,
        tenantId: this.tenantId,
        pillar: 'sme-research',
        provider: 'anthropic',
        model: 'claude-3-haiku',
        inputTokens: Math.round(findings.costUsd * 100000),
        outputTokens: Math.round(findings.costUsd * 50000),
        costUsd: findings.costUsd,
        taskType: 'analysis',
      });
    }

    return findings;
  }

  /**
   * Build world-class benchmarks from the expertise profile.
   *
   * Requirement 21.4: Benchmark against world-class performance
   */
  private buildBenchmarks(profile: DomainExpertiseProfile): Benchmark[] {
    const benchmarks: Benchmark[] = [];

    // Group quality benchmarks by source
    const bySource = new Map<string, QualityBenchmark[]>();
    for (const qb of profile.qualityBenchmarks) {
      const existing = bySource.get(qb.source) ?? [];
      existing.push(qb);
      bySource.set(qb.source, existing);
    }

    for (const [source, qbs] of bySource) {
      const metrics: Record<string, MetricValue> = {};
      for (const qb of qbs) {
        metrics[qb.metric] = {
          value: qb.worldClass,
          unit: qb.unit,
        };
      }

      benchmarks.push({
        name: `World-Class Benchmark (${source})`,
        source,
        metrics,
        lastUpdated: qbs[0]?.lastUpdated ?? new Date(),
      });
    }

    // If no benchmarks from profile, create a generic one
    if (benchmarks.length === 0) {
      benchmarks.push({
        name: `${profile.domain} Industry Standard`,
        source: 'industry-analysis',
        metrics: {},
        lastUpdated: new Date(),
      });
    }

    return benchmarks;
  }

  /**
   * Assess the current state of the domain based on profile and research.
   *
   * Requirement 21.3: Research domain and assess current state
   */
  private assessCurrentState(
    profile: DomainExpertiseProfile,
    research: ResearchFindings,
  ): DomainAssessment {
    const metrics: Record<string, MetricValue> = {};

    // Extract current metrics from quality benchmarks
    for (const qb of profile.qualityBenchmarks) {
      metrics[qb.metric] = {
        value: qb.current,
        unit: qb.unit,
      };
    }

    // Derive strengths from high-confidence knowledge and positive patterns
    const strengths: string[] = [];
    const highConfidenceKnowledge = profile.knowledgeBase.filter((k) => k.confidence >= 0.85);
    if (highConfidenceKnowledge.length > 0) {
      strengths.push(`Strong knowledge base (${highConfidenceKnowledge.length} high-confidence entries)`);
    }
    const positivePatterns = profile.learnedPatterns.filter((p) => p.outcome === 'positive');
    for (const pattern of positivePatterns.slice(0, 3)) {
      strengths.push(pattern.pattern);
    }

    // Derive weaknesses from knowledge gaps and negative patterns
    const weaknesses: string[] = [...profile.knowledgeGaps.slice(0, 3)];
    const negativePatterns = profile.learnedPatterns.filter((p) => p.outcome === 'negative');
    for (const pattern of negativePatterns.slice(0, 2)) {
      weaknesses.push(pattern.pattern);
    }

    // Calculate overall score from benchmark coverage
    let overallScore = 0.5;
    if (profile.qualityBenchmarks.length > 0) {
      const ratios = profile.qualityBenchmarks.map((qb) =>
        qb.worldClass > 0 ? Math.min(qb.current / qb.worldClass, 1.0) : 0.5,
      );
      overallScore = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    }

    return {
      domain: profile.domain,
      metrics,
      strengths,
      weaknesses,
      overallScore,
    };
  }

  /**
   * Perform gap analysis comparing current state to world-class benchmarks.
   *
   * Requirement 21.5: Identify gaps with priority scores and closing strategies
   */
  private performGapAnalysis(
    profile: DomainExpertiseProfile,
    benchmarks: Benchmark[],
    currentAssessment: DomainAssessment,
  ): GapAnalysisEntry[] {
    const gaps: GapAnalysisEntry[] = [];

    for (const qb of profile.qualityBenchmarks) {
      if (qb.worldClass === 0) continue;

      const gapPercentage = ((qb.worldClass - qb.current) / qb.worldClass) * 100;
      if (gapPercentage <= 0) continue; // Already at or above world-class

      // Priority: larger gaps get higher priority (1-10 scale)
      const priority = Math.min(10, Math.max(1, Math.round(gapPercentage / 10)));

      gaps.push({
        metric: qb.metric,
        currentValue: { value: qb.current, unit: qb.unit },
        worldClassValue: { value: qb.worldClass, unit: qb.unit },
        gapPercentage: Math.round(gapPercentage * 100) / 100,
        priority,
        closingStrategy: this.generateClosingStrategy(qb, profile),
      });
    }

    // Sort by priority descending
    gaps.sort((a, b) => b.priority - a.priority);

    return gaps;
  }

  /**
   * Generate structured recommendations from gap analysis.
   * Each recommendation follows: benchmark → current → gap → plan format.
   *
   * Requirement 21.6: Generate prioritized recommendations
   */
  private generateRecommendations(
    agentId: string,
    domain: string,
    gaps: GapAnalysisEntry[],
    benchmarks: Benchmark[],
    currentAssessment: DomainAssessment,
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Generate one recommendation per significant gap (top 5)
    const topGaps = gaps.slice(0, 5);

    for (const gap of topGaps) {
      const benchmarkSource = benchmarks[0]?.source ?? 'industry-analysis';

      const recommendation: Recommendation = {
        id: randomUUID(),
        agentId,
        domain,
        priority: gap.priority,
        submittedAt: new Date(),
        worldClassBenchmark: {
          description: `World-class ${gap.metric}: ${gap.worldClassValue.value} ${gap.worldClassValue.unit}`,
          source: benchmarkSource,
          metrics: { [gap.metric]: gap.worldClassValue },
        },
        currentState: {
          description: `Current ${gap.metric}: ${gap.currentValue.value} ${gap.currentValue.unit}`,
          metrics: { [gap.metric]: gap.currentValue },
        },
        gapAnalysis: {
          description: `${gap.gapPercentage}% gap in ${gap.metric}`,
          gapPercentage: gap.gapPercentage,
          keyGaps: [gap.closingStrategy],
        },
        actionPlan: {
          summary: `Close ${gap.metric} gap from ${gap.currentValue.value} to ${gap.worldClassValue.value} ${gap.worldClassValue.unit}`,
          steps: [
            {
              order: 1,
              description: `Research best practices for improving ${gap.metric}`,
              type: 'research',
              estimatedDuration: '1 day',
              dependencies: [],
            },
            {
              order: 2,
              description: `Implement ${gap.closingStrategy}`,
              type: 'code_change',
              estimatedDuration: '3 days',
              dependencies: [1],
            },
            {
              order: 3,
              description: `Measure impact on ${gap.metric}`,
              type: 'analysis',
              estimatedDuration: '1 week',
              dependencies: [2],
            },
          ],
          estimatedEffort: '1-2 weeks',
          estimatedImpact: {
            [gap.metric]: {
              value: gap.worldClassValue.value * 0.8,
              unit: gap.worldClassValue.unit,
              context: 'Target 80% of world-class within first iteration',
            },
          },
          requiresCodeChanges: true,
          requiresBudget: 0,
        },
        riskAssessment: {
          level: gap.priority >= 7 ? 'medium' : 'low',
          risks: [`May not achieve full ${gap.metric} improvement in first iteration`],
          mitigations: ['Iterative approach with measurement at each step'],
        },
        rollbackPlan: `Revert changes if ${gap.metric} degrades below current level`,
        status: 'pending',
      };

      recommendations.push(recommendation);
    }

    return recommendations;
  }

  // ---------------------------------------------------------------------------
  // Private: Helpers
  // ---------------------------------------------------------------------------

  private getDomainForAgent(agentId: string): string {
    const domainMap: Record<string, string> = {
      'agent-eretz': 'business-orchestration',
      'agent-zionx': 'app-development',
      'agent-zxmg': 'media-production',
      'agent-zion-alpha': 'prediction-markets',
      'agent-seraphim-core': 'ai-orchestration',
    };
    return domainMap[agentId] ?? 'general';
  }

  private estimateTokensForDepth(depth: ResearchDepth): number {
    switch (depth) {
      case 'shallow':
        return 5000;
      case 'standard':
        return 15000;
      case 'deep':
        return 50000;
    }
  }

  private generateClosingStrategy(
    benchmark: QualityBenchmark,
    profile: DomainExpertiseProfile,
  ): string {
    // Look for relevant best practices
    const relevantPractices = profile.industryBestPractices.filter(
      (bp) =>
        bp.tags.some((tag) =>
          benchmark.metric.toLowerCase().includes(tag.toLowerCase()),
        ),
    );

    if (relevantPractices.length > 0) {
      return `Apply best practice: ${relevantPractices[0].title} — ${relevantPractices[0].description}`;
    }

    return `Research and implement improvements for ${benchmark.metric} based on world-class examples`;
  }

  private calculateConfidence(
    research: ResearchFindings,
    gaps: GapAnalysisEntry[],
  ): number {
    // Base confidence from research quality
    let confidence = 0.5;

    if (research.findings.length > 0) {
      const avgFindingConfidence =
        research.findings.reduce((sum, f) => sum + f.confidence, 0) /
        research.findings.length;
      confidence = avgFindingConfidence;
    }

    // Reduce confidence if many gaps (indicates less certainty about path forward)
    if (gaps.length > 5) {
      confidence *= 0.9;
    }

    return Math.round(confidence * 100) / 100;
  }
}
