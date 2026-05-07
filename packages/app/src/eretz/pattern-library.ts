/**
 * Eretz Reusable Business Pattern Library
 *
 * Extracts successful business patterns from subsidiary execution outcomes,
 * generalizes them for cross-subsidiary application, and stores them with
 * effectiveness metrics. Provides semantic similarity search and proactive
 * pattern recommendations when subsidiaries face matching challenges.
 *
 * Requirements: 29c.9, 29c.10, 29c.11, 29c.12
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService, ZikaronService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatternCategory =
  | 'monetization'
  | 'user_acquisition'
  | 'retention'
  | 'content_strategy'
  | 'market_entry'
  | 'operational_process';

export interface PatternStep {
  order: number;
  action: string;
  description: string;
  expectedOutcome: string;
}

export interface BusinessPattern {
  id: string;
  name: string;
  description: string;
  type: PatternCategory;
  sourceSubsidiary: string;
  generalizedInsight: string;
  confidence: number;
  adoptionCount: number;
  successRate: number;
  steps: PatternStep[];
  prerequisites: string[];
  applicabilityCriteria: string[];
  contraindications: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PatternSource {
  subsidiary: string;
  action: string;
  outcome: Record<string, unknown>;
  metrics: Record<string, unknown>;
  context: string;
}

export interface PatternQuery {
  challenge: string;
  subsidiary?: string;
  type?: PatternCategory;
  minConfidence?: number;
}

export interface PatternRecommendation {
  pattern: BusinessPattern;
  relevanceScore: number;
  adaptationGuidance: string;
}

export interface PatternOutcome {
  subsidiary: string;
  success: boolean;
  metrics: Record<string, unknown>;
  notes?: string;
}

export interface PatternAdoption {
  patternId: string;
  subsidiary: string;
  adoptedAt: Date;
  outcomes: PatternOutcome[];
}

export interface PatternLibraryMetrics {
  totalPatterns: number;
  patternsByCategory: Record<string, number>;
  mostAdoptedPatterns: BusinessPattern[];
  highestImpactPatterns: BusinessPattern[];
  recentExtractions: BusinessPattern[];
  crossSubsidiaryAdoptions: number;
}

export interface EretzPatternLibrary {
  extractPattern(source: PatternSource): Promise<BusinessPattern>;
  storePattern(pattern: BusinessPattern): Promise<string>;
  findPatterns(query: PatternQuery): Promise<BusinessPattern[]>;
  recommendPattern(subsidiary: string, challenge: string): Promise<PatternRecommendation[]>;
  trackAdoption(patternId: string, subsidiary: string): Promise<void>;
  updateEffectiveness(patternId: string, outcome: PatternOutcome): Promise<void>;
  getPatternMetrics(): Promise<PatternLibraryMetrics>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PatternLibraryConfig {
  eventBus: EventBusService;
  zikaron: ZikaronService;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EretzPatternLibraryImpl implements EretzPatternLibrary {
  private readonly eventBus: EventBusService;
  private readonly zikaron: ZikaronService;

  private readonly patterns = new Map<string, BusinessPattern>();
  private readonly adoptions = new Map<string, PatternAdoption[]>();

  constructor(config: PatternLibraryConfig) {
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
  }

  /**
   * Extract a successful business pattern from a subsidiary execution outcome,
   * generalize it for cross-subsidiary application, and store with effectiveness metrics.
   * Requirement 29c.9
   */
  async extractPattern(source: PatternSource): Promise<BusinessPattern> {
    const category = this.inferCategory(source);
    const generalizedInsight = this.generalize(source);
    const steps = this.deriveSteps(source);

    const pattern: BusinessPattern = {
      id: randomUUID(),
      name: `${this.capitalize(category)} pattern from ${source.subsidiary}`,
      description: `Extracted from ${source.subsidiary}: ${source.context}`,
      type: category,
      sourceSubsidiary: source.subsidiary,
      generalizedInsight,
      confidence: 0.7,
      adoptionCount: 0,
      successRate: 0,
      steps,
      prerequisites: this.derivePrerequisites(source),
      applicabilityCriteria: this.deriveApplicability(source),
      contraindications: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storePattern(pattern);

    await this.eventBus.publish({
      source: 'eretz',
      type: 'pattern.extracted',
      detail: {
        patternId: pattern.id,
        name: pattern.name,
        category: pattern.type,
        sourceSubsidiary: pattern.sourceSubsidiary,
        confidence: pattern.confidence,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: pattern.id,
        timestamp: new Date(),
      },
    });

    return pattern;
  }

  /**
   * Persist a pattern in Zikaron procedural memory with vector embeddings
   * for similarity search. Categorize by type.
   * Requirement 29c.10
   */
  async storePattern(pattern: BusinessPattern): Promise<string> {
    this.patterns.set(pattern.id, pattern);

    const embedding = this.generateEmbedding(pattern);

    await this.zikaron.storeProcedural({
      id: pattern.id,
      tenantId: 'house-of-zion',
      layer: 'procedural',
      content: JSON.stringify({
        name: pattern.name,
        description: pattern.description,
        type: pattern.type,
        generalizedInsight: pattern.generalizedInsight,
        sourceSubsidiary: pattern.sourceSubsidiary,
        applicabilityCriteria: pattern.applicabilityCriteria,
        contraindications: pattern.contraindications,
      }),
      embedding,
      sourceAgentId: 'eretz-business-pillar',
      tags: ['business-pattern', pattern.type, pattern.sourceSubsidiary],
      createdAt: pattern.createdAt,
      workflowPattern: pattern.type,
      successRate: pattern.successRate,
      executionCount: pattern.adoptionCount,
      prerequisites: pattern.prerequisites,
      steps: pattern.steps.map((s) => ({
        order: s.order,
        action: s.action,
        description: s.description,
        expectedOutcome: s.expectedOutcome,
      })),
    });

    return pattern.id;
  }

  /**
   * Semantic similarity search for patterns matching a given business challenge or context.
   * Requirement 29c.10, 29c.11
   */
  async findPatterns(query: PatternQuery): Promise<BusinessPattern[]> {
    // Query Zikaron for semantically similar patterns
    const results = await this.zikaron.query({
      text: query.challenge,
      layers: ['procedural'],
      tenantId: 'house-of-zion',
      limit: 10,
    });

    // Also search in-memory patterns for matching criteria
    let candidates = Array.from(this.patterns.values());

    if (query.type) {
      candidates = candidates.filter((p) => p.type === query.type);
    }

    if (query.minConfidence !== undefined) {
      candidates = candidates.filter((p) => p.confidence >= query.minConfidence!);
    }

    // Merge Zikaron results with in-memory patterns
    const zikaronPatternIds = new Set(results.map((r) => r.id));
    const matchedFromMemory = candidates.filter(
      (p) =>
        zikaronPatternIds.has(p.id) ||
        this.textMatchesChallenge(p, query.challenge),
    );

    // Sort by confidence descending
    return matchedFromMemory.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Proactively recommend applicable patterns when a subsidiary faces a challenge
   * matching existing patterns. Provides adaptation guidance specific to the subsidiary's context.
   * Requirement 29c.11
   */
  async recommendPattern(
    subsidiary: string,
    challenge: string,
  ): Promise<PatternRecommendation[]> {
    const matchingPatterns = await this.findPatterns({
      challenge,
      minConfidence: 0.3,
    });

    const recommendations: PatternRecommendation[] = matchingPatterns.map((pattern) => {
      const relevanceScore = this.calculateRelevance(pattern, subsidiary, challenge);
      const adaptationGuidance = this.generateAdaptationGuidance(
        pattern,
        subsidiary,
        challenge,
      );

      return {
        pattern,
        relevanceScore,
        adaptationGuidance,
      };
    });

    // Sort by relevance and filter out low-relevance recommendations
    const filtered = recommendations
      .filter((r) => r.relevanceScore > 0.3)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    if (filtered.length > 0) {
      await this.eventBus.publish({
        source: 'eretz',
        type: 'pattern.recommended',
        detail: {
          subsidiary,
          challenge,
          recommendationCount: filtered.length,
          topPattern: filtered[0].pattern.name,
          topRelevance: filtered[0].relevanceScore,
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    }

    return filtered;
  }

  /**
   * Track pattern adoption across subsidiaries.
   * Requirement 29c.12
   */
  async trackAdoption(patternId: string, subsidiary: string): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const adoption: PatternAdoption = {
      patternId,
      subsidiary,
      adoptedAt: new Date(),
      outcomes: [],
    };

    const existing = this.adoptions.get(patternId) ?? [];
    existing.push(adoption);
    this.adoptions.set(patternId, existing);

    pattern.adoptionCount += 1;
    pattern.updatedAt = new Date();

    await this.eventBus.publish({
      source: 'eretz',
      type: 'pattern.adopted',
      detail: {
        patternId,
        patternName: pattern.name,
        subsidiary,
        totalAdoptions: pattern.adoptionCount,
        isCrossSubsidiary: subsidiary !== pattern.sourceSubsidiary,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: patternId,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Update confidence scores based on real outcomes.
   * Requirement 29c.12
   */
  async updateEffectiveness(
    patternId: string,
    outcome: PatternOutcome,
  ): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    // Record the outcome in adoptions
    const adoptions = this.adoptions.get(patternId) ?? [];
    const adoption = adoptions.find((a) => a.subsidiary === outcome.subsidiary);
    if (adoption) {
      adoption.outcomes.push(outcome);
    }

    // Recalculate success rate and confidence from all outcomes
    const allOutcomes = adoptions.flatMap((a) => a.outcomes);
    if (allOutcomes.length > 0) {
      const successCount = allOutcomes.filter((o) => o.success).length;
      pattern.successRate = successCount / allOutcomes.length;
      // Confidence increases with more data points and higher success rate
      pattern.confidence = Math.min(
        1.0,
        0.5 + pattern.successRate * 0.3 + Math.min(allOutcomes.length / 10, 0.2),
      );
    }

    pattern.updatedAt = new Date();

    await this.eventBus.publish({
      source: 'eretz',
      type: 'pattern.effectiveness_updated',
      detail: {
        patternId,
        patternName: pattern.name,
        newConfidence: pattern.confidence,
        newSuccessRate: pattern.successRate,
        outcomeSubsidiary: outcome.subsidiary,
        outcomeSuccess: outcome.success,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: patternId,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Aggregate pattern library metrics — total patterns, adoption counts,
   * success rates, cross-subsidiary adoptions.
   * Requirement 29c.10, 29c.12
   */
  async getPatternMetrics(): Promise<PatternLibraryMetrics> {
    const allPatterns = Array.from(this.patterns.values());

    // Patterns by category
    const patternsByCategory: Record<string, number> = {};
    for (const pattern of allPatterns) {
      patternsByCategory[pattern.type] = (patternsByCategory[pattern.type] ?? 0) + 1;
    }

    // Most adopted patterns (top 5)
    const mostAdoptedPatterns = [...allPatterns]
      .sort((a, b) => b.adoptionCount - a.adoptionCount)
      .slice(0, 5);

    // Highest impact patterns (by success rate * confidence, top 5)
    const highestImpactPatterns = [...allPatterns]
      .sort((a, b) => b.successRate * b.confidence - a.successRate * a.confidence)
      .slice(0, 5);

    // Recent extractions (last 5 by creation date)
    const recentExtractions = [...allPatterns]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    // Cross-subsidiary adoptions: count adoptions where subsidiary !== sourceSubsidiary
    let crossSubsidiaryAdoptions = 0;
    for (const [patternId, adoptionList] of this.adoptions.entries()) {
      const pattern = this.patterns.get(patternId);
      if (!pattern) continue;
      crossSubsidiaryAdoptions += adoptionList.filter(
        (a) => a.subsidiary !== pattern.sourceSubsidiary,
      ).length;
    }

    return {
      totalPatterns: allPatterns.length,
      patternsByCategory,
      mostAdoptedPatterns,
      highestImpactPatterns,
      recentExtractions,
      crossSubsidiaryAdoptions,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private inferCategory(source: PatternSource): PatternCategory {
    const context = `${source.action} ${source.context}`.toLowerCase();

    if (context.includes('revenue') || context.includes('monetiz') || context.includes('pricing')) {
      return 'monetization';
    }
    if (context.includes('acquisition') || context.includes('growth') || context.includes('user')) {
      return 'user_acquisition';
    }
    if (context.includes('retention') || context.includes('churn') || context.includes('engagement')) {
      return 'retention';
    }
    if (context.includes('content') || context.includes('video') || context.includes('media')) {
      return 'content_strategy';
    }
    if (context.includes('market') || context.includes('launch') || context.includes('entry')) {
      return 'market_entry';
    }
    return 'operational_process';
  }

  private generalize(source: PatternSource): string {
    return `Pattern derived from ${source.subsidiary}'s successful ${source.action}: ${source.context}. ` +
      `This approach can be adapted for other subsidiaries facing similar challenges.`;
  }

  private deriveSteps(source: PatternSource): PatternStep[] {
    return [
      {
        order: 1,
        action: 'assess_applicability',
        description: `Evaluate if the pattern from ${source.subsidiary} applies to target context`,
        expectedOutcome: 'Applicability assessment complete',
      },
      {
        order: 2,
        action: 'adapt_pattern',
        description: `Adapt the ${source.action} approach to target subsidiary context`,
        expectedOutcome: 'Adapted implementation plan',
      },
      {
        order: 3,
        action: 'execute_pattern',
        description: `Execute the adapted pattern with monitoring`,
        expectedOutcome: 'Pattern execution complete with metrics',
      },
      {
        order: 4,
        action: 'measure_outcomes',
        description: `Measure outcomes and update pattern effectiveness`,
        expectedOutcome: 'Outcome metrics recorded',
      },
    ];
  }

  private derivePrerequisites(source: PatternSource): string[] {
    return [
      `Similar business context to ${source.subsidiary}`,
      `Capability to execute ${source.action}`,
      `Sufficient resources for implementation`,
    ];
  }

  private deriveApplicability(source: PatternSource): string[] {
    return [
      `Subsidiary facing challenge similar to: ${source.context}`,
      `Business model compatible with ${source.action} approach`,
    ];
  }

  private generateEmbedding(pattern: BusinessPattern): number[] {
    // In production, this would call an embedding model.
    // For now, generate a deterministic pseudo-embedding from pattern content.
    const text = `${pattern.name} ${pattern.description} ${pattern.generalizedInsight} ${pattern.type}`;
    const embedding: number[] = [];
    for (let i = 0; i < 1536; i++) {
      embedding.push(Math.sin(i * 0.01 + text.charCodeAt(i % text.length) * 0.001));
    }
    return embedding;
  }

  private textMatchesChallenge(pattern: BusinessPattern, challenge: string): boolean {
    const challengeLower = challenge.toLowerCase();
    const patternText = `${pattern.name} ${pattern.description} ${pattern.generalizedInsight} ${pattern.type}`.toLowerCase();

    // Simple keyword overlap check
    const challengeWords = challengeLower.split(/\s+/).filter((w) => w.length > 3);
    const matchCount = challengeWords.filter((word) => patternText.includes(word)).length;

    return matchCount > 0;
  }

  private calculateRelevance(
    pattern: BusinessPattern,
    subsidiary: string,
    challenge: string,
  ): number {
    let score = pattern.confidence * 0.4;

    // Boost if pattern has been successfully used elsewhere
    if (pattern.adoptionCount > 0 && pattern.successRate > 0.5) {
      score += 0.2;
    }

    // Boost if pattern is from a different subsidiary (cross-pollination value)
    if (pattern.sourceSubsidiary !== subsidiary) {
      score += 0.1;
    }

    // Text relevance
    const challengeLower = challenge.toLowerCase();
    const patternText = `${pattern.name} ${pattern.description} ${pattern.generalizedInsight}`.toLowerCase();
    const challengeWords = challengeLower.split(/\s+/).filter((w) => w.length > 3);
    const matchCount = challengeWords.filter((word) => patternText.includes(word)).length;
    score += Math.min(matchCount * 0.1, 0.3);

    return Math.min(score, 1.0);
  }

  private generateAdaptationGuidance(
    pattern: BusinessPattern,
    subsidiary: string,
    challenge: string,
  ): string {
    if (pattern.sourceSubsidiary === subsidiary) {
      return `This pattern was originally developed in your subsidiary. ` +
        `Review the steps and apply directly to the current challenge: ${challenge}`;
    }

    return `This pattern was proven in ${pattern.sourceSubsidiary}. ` +
      `Adapt for ${subsidiary} by considering your specific context. ` +
      `Key insight: ${pattern.generalizedInsight}`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }
}
