/**
 * Quality Baseline Generator — converts raw reference analysis reports into
 * structured, measurable quality baselines with scored dimensions.
 *
 * Key behaviors:
 * - Generates App_Quality_Baseline from AppReferenceReport
 * - Generates Video_Quality_Baseline from ChannelReferenceReport
 * - Monotonic merge: thresholds only go UP, never down
 * - Weighted synthesis: higher-performing references contribute more
 * - Core principle elevation: patterns across multiple references get higher confidence
 * - Contradiction flagging: conflicting patterns are retained with metadata
 *
 * All dimensions are measurable and evaluatable — no subjective criteria.
 */

import { randomUUID } from 'node:crypto';

import type { AppReferenceReport, ChannelReferenceReport } from '../types.js';
import type {
  AppQualityBaseline,
  VideoQualityBaseline,
  QualityBaseline,
  ScoredDimension,
  ReferenceSource,
  CorePrinciple,
  BaselineContradiction,
  AppDimensionName,
  VideoDimensionName,
} from './types.js';
import { APP_DIMENSIONS, VIDEO_DIMENSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Score Extraction Helpers
// ---------------------------------------------------------------------------

/**
 * Clamps a value to the 1-10 range.
 */
function clampScore(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

/**
 * Computes a weight for an app reference based on its performance metrics.
 * Higher-rated apps with more reviews contribute more.
 */
function computeAppWeight(report: AppReferenceReport): number {
  const ratingWeight = report.listing.rating / 5; // 0-1 scale
  const reviewWeight = Math.min(report.listing.reviewCount / 10000, 1); // cap at 10k
  return (ratingWeight * 0.7) + (reviewWeight * 0.3);
}

/**
 * Computes a weight for a channel reference based on its performance metrics.
 * Higher-view channels with better engagement contribute more.
 */
function computeChannelWeight(report: ChannelReferenceReport): number {
  const viewWeight = Math.min(report.channelMetrics.avgViewsPerVideo / 1000000, 1);
  const engagementWeight = Math.min(report.channelMetrics.engagementRate / 0.1, 1);
  const subscriberWeight = Math.min(report.channelMetrics.subscriberCount / 1000000, 1);
  return (viewWeight * 0.4) + (engagementWeight * 0.3) + (subscriberWeight * 0.3);
}

// ---------------------------------------------------------------------------
// App Dimension Scoring
// ---------------------------------------------------------------------------

/**
 * Scores app dimensions from an AppReferenceReport.
 * Each dimension is derived from measurable report data.
 */
function scoreAppDimensions(report: AppReferenceReport): Map<AppDimensionName, { score: number; patterns: string[] }> {
  const scores = new Map<AppDimensionName, { score: number; patterns: string[] }>();

  // Visual polish: based on screen count, layout patterns, color usage, typography
  const visualScore = clampScore(
    Math.min(report.visualAnalysis.screenCount, 10) * 0.3 +
    report.visualAnalysis.layoutPatterns.length * 1.5 +
    report.visualAnalysis.colorUsage.length * 0.8 +
    report.visualAnalysis.typography.length * 1.2
  );
  scores.set('visual_polish', {
    score: visualScore,
    patterns: [
      `Layout: ${report.visualAnalysis.layoutPatterns.join(', ')}`,
      `Navigation: ${report.visualAnalysis.navigationStructure}`,
      `Density: ${report.visualAnalysis.informationDensity}`,
    ],
  });

  // Interaction complexity: based on interaction patterns count and navigation
  const interactionScore = clampScore(
    report.inferredPatterns.interactionPatterns.length * 2 +
    (report.visualAnalysis.navigationStructure === 'tab-bar' ? 3 : 1) +
    report.listing.featureList.length * 0.5
  );
  scores.set('interaction_complexity', {
    score: interactionScore,
    patterns: [
      `Patterns: ${report.inferredPatterns.interactionPatterns.join(', ')}`,
      `Features: ${report.listing.featureList.length} features`,
    ],
  });

  // Content depth: based on feature list, description length, category
  const contentScore = clampScore(
    report.listing.featureList.length * 1.2 +
    Math.min(report.listing.description.length / 100, 5) +
    (report.visualAnalysis.informationDensity === 'high' ? 3 : report.visualAnalysis.informationDensity === 'medium' ? 2 : 1)
  );
  scores.set('content_depth', {
    score: contentScore,
    patterns: [
      `Features: ${report.listing.featureList.join(', ')}`,
      `Info density: ${report.visualAnalysis.informationDensity}`,
    ],
  });

  // Monetization sophistication: based on IAP options, pricing model
  const monetizationScore = clampScore(
    report.listing.iapOptions.length * 2 +
    (report.inferredPatterns.monetizationModel === 'freemium' ? 4 : 2) +
    (report.listing.pricingModel !== 'free' ? 2 : 0)
  );
  scores.set('monetization_sophistication', {
    score: monetizationScore,
    patterns: [
      `Model: ${report.inferredPatterns.monetizationModel}`,
      `IAPs: ${report.listing.iapOptions.join(', ')}`,
      `Pricing: ${report.listing.pricingModel}`,
    ],
  });

  // Retention mechanic strength: based on retention mechanics count and notification strategy
  const retentionScore = clampScore(
    report.inferredPatterns.retentionMechanics.length * 2.5 +
    (report.inferredPatterns.notificationStrategy === 'aggressive' ? 3 :
     report.inferredPatterns.notificationStrategy === 'moderate' ? 2 : 1)
  );
  scores.set('retention_mechanic_strength', {
    score: retentionScore,
    patterns: [
      `Mechanics: ${report.inferredPatterns.retentionMechanics.join(', ')}`,
      `Notifications: ${report.inferredPatterns.notificationStrategy}`,
    ],
  });

  // Onboarding effectiveness: based on onboarding complexity and praised features
  const onboardingScore = clampScore(
    (report.inferredPatterns.onboardingComplexity === 'simple' ? 7 :
     report.inferredPatterns.onboardingComplexity === 'moderate' ? 5 : 3) +
    (report.reviewInsights.topPraisedFeatures.some(f => f.toLowerCase().includes('easy')) ? 2 : 0) +
    (report.listing.rating >= 4.5 ? 1 : 0)
  );
  scores.set('onboarding_effectiveness', {
    score: onboardingScore,
    patterns: [
      `Complexity: ${report.inferredPatterns.onboardingComplexity}`,
      `Praised: ${report.reviewInsights.topPraisedFeatures.join(', ')}`,
    ],
  });

  return scores;
}

// ---------------------------------------------------------------------------
// Video Dimension Scoring
// ---------------------------------------------------------------------------

/**
 * Scores video dimensions from a ChannelReferenceReport.
 * Each dimension is derived from measurable report data.
 */
function scoreVideoDimensions(report: ChannelReferenceReport): Map<VideoDimensionName, { score: number; patterns: string[] }> {
  const scores = new Map<VideoDimensionName, { score: number; patterns: string[] }>();

  // Hook strength: based on hook patterns count and variety
  const hookScore = clampScore(
    report.productionFormula.commonHookPatterns.length * 2 +
    (report.videoBreakdowns.length > 0 ?
      report.videoBreakdowns.filter(v => v.hookStructure.length > 0).length * 0.5 : 2)
  );
  scores.set('hook_strength', {
    score: hookScore,
    patterns: [
      `Hook patterns: ${report.productionFormula.commonHookPatterns.join(', ')}`,
    ],
  });

  // Pacing quality: based on pacing rhythm and editing pace
  const avgEditingPace = report.videoBreakdowns.length > 0
    ? report.videoBreakdowns.reduce((sum, v) => sum + v.editingPace, 0) / report.videoBreakdowns.length
    : 5;
  const pacingScore = clampScore(
    (report.productionFormula.pacingRhythm === 'fast' ? 7 :
     report.productionFormula.pacingRhythm === 'medium' ? 5 : 3) +
    Math.min(avgEditingPace / 2, 3)
  );
  scores.set('pacing_quality', {
    score: pacingScore,
    patterns: [
      `Rhythm: ${report.productionFormula.pacingRhythm}`,
      `Avg editing pace: ${avgEditingPace.toFixed(1)}`,
    ],
  });

  // Thumbnail effectiveness: based on thumbnail rules count
  const thumbnailScore = clampScore(
    report.productionFormula.thumbnailRules.length * 2.5 +
    (report.videoBreakdowns.length > 0 ?
      report.videoBreakdowns.reduce((sum, v) => sum + v.thumbnailComposition.length, 0) /
      report.videoBreakdowns.length : 1)
  );
  scores.set('thumbnail_effectiveness', {
    score: thumbnailScore,
    patterns: [
      `Rules: ${report.productionFormula.thumbnailRules.join(', ')}`,
    ],
  });

  // Title optimization: based on title patterns count
  const titleScore = clampScore(
    report.productionFormula.titlePatterns.length * 2.5 +
    (report.channelMetrics.avgViewsPerVideo > 100000 ? 3 :
     report.channelMetrics.avgViewsPerVideo > 10000 ? 2 : 1)
  );
  scores.set('title_optimization', {
    score: titleScore,
    patterns: [
      `Patterns: ${report.productionFormula.titlePatterns.join(', ')}`,
      `Avg views: ${report.channelMetrics.avgViewsPerVideo}`,
    ],
  });

  // Production value: based on video count, upload frequency, optimal length range
  const productionScore = clampScore(
    Math.min(report.channelMetrics.totalVideos / 50, 3) +
    Math.min(report.channelMetrics.uploadFrequency, 3) +
    (report.productionFormula.optimalLengthRange.max > 0 ? 3 : 1) +
    (report.channelMetrics.engagementRate > 0.05 ? 2 : 1)
  );
  scores.set('production_value', {
    score: productionScore,
    patterns: [
      `Videos: ${report.channelMetrics.totalVideos}`,
      `Upload freq: ${report.channelMetrics.uploadFrequency}/week`,
      `Length range: ${report.productionFormula.optimalLengthRange.min}-${report.productionFormula.optimalLengthRange.max} min`,
    ],
  });

  // Engagement trigger density: based on engagement triggers count
  const engagementScore = clampScore(
    report.productionFormula.engagementTriggers.length * 2 +
    (report.channelMetrics.engagementRate > 0.05 ? 3 :
     report.channelMetrics.engagementRate > 0.02 ? 2 : 1)
  );
  scores.set('engagement_trigger_density', {
    score: engagementScore,
    patterns: [
      `Triggers: ${report.productionFormula.engagementTriggers.join(', ')}`,
      `Engagement rate: ${(report.channelMetrics.engagementRate * 100).toFixed(1)}%`,
    ],
  });

  return scores;
}

// ---------------------------------------------------------------------------
// Quality Baseline Generator
// ---------------------------------------------------------------------------

export class QualityBaselineGenerator {
  /**
   * Generates an App Quality Baseline from an AppReferenceReport.
   * Produces scored dimensions (1-10) for all app quality dimensions.
   */
  generateAppBaseline(report: AppReferenceReport, existing?: AppQualityBaseline): AppQualityBaseline {
    const scores = scoreAppDimensions(report);
    const weight = computeAppWeight(report);
    const source: ReferenceSource = {
      url: report.url,
      extractionDate: report.analyzedAt,
      weight,
    };

    if (existing) {
      return this.mergeAppBaseline(existing, scores, source, report);
    }

    const dimensions: ScoredDimension[] = APP_DIMENSIONS.map(name => {
      const scored = scores.get(name)!;
      return {
        name,
        score: scored.score,
        referenceCount: 1,
        confidence: this.computeDimensionConfidence(1, scored.score),
        examplePatterns: scored.patterns,
      };
    });

    return {
      id: randomUUID(),
      type: 'app',
      domainCategory: report.listing.category.toLowerCase(),
      dimensions,
      sources: [source],
      corePrinciples: [],
      contradictions: [],
      overallConfidence: this.computeOverallConfidence(dimensions),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Generates a Video Quality Baseline from a ChannelReferenceReport.
   * Produces scored dimensions (1-10) for all video quality dimensions.
   */
  generateVideoBaseline(report: ChannelReferenceReport, existing?: VideoQualityBaseline): VideoQualityBaseline {
    const scores = scoreVideoDimensions(report);
    const weight = computeChannelWeight(report);
    const source: ReferenceSource = {
      url: report.url,
      extractionDate: report.analyzedAt,
      weight,
    };

    if (existing) {
      return this.mergeVideoBaseline(existing, scores, source, report);
    }

    const dimensions: ScoredDimension[] = VIDEO_DIMENSIONS.map(name => {
      const scored = scores.get(name)!;
      return {
        name,
        score: scored.score,
        referenceCount: 1,
        confidence: this.computeDimensionConfidence(1, scored.score),
        examplePatterns: scored.patterns,
      };
    });

    return {
      id: randomUUID(),
      type: 'video',
      domainCategory: 'video-content',
      dimensions,
      sources: [source],
      corePrinciples: [],
      contradictions: [],
      overallConfidence: this.computeOverallConfidence(dimensions),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Monotonic Merge
  // -------------------------------------------------------------------------

  /**
   * Merges a new app reference into an existing baseline.
   * Monotonic: thresholds only go UP, never down.
   * Weighted: higher-performing references contribute more.
   */
  private mergeAppBaseline(
    existing: AppQualityBaseline,
    newScores: Map<AppDimensionName, { score: number; patterns: string[] }>,
    source: ReferenceSource,
    report: AppReferenceReport,
  ): AppQualityBaseline {
    const mergedDimensions = existing.dimensions.map(dim => {
      const newScore = newScores.get(dim.name as AppDimensionName);
      if (!newScore) return dim;

      // Weighted new score based on reference performance
      const weightedNewScore = this.applyWeight(newScore.score, source.weight);

      // Monotonic merge: only raise, never lower
      const mergedScore = Math.max(dim.score, weightedNewScore);
      const newRefCount = dim.referenceCount + 1;

      return {
        ...dim,
        score: mergedScore,
        referenceCount: newRefCount,
        confidence: this.computeDimensionConfidence(newRefCount, mergedScore),
        examplePatterns: [...dim.examplePatterns, ...newScore.patterns].slice(-10),
      };
    });

    // Detect contradictions
    const contradictions = this.detectAppContradictions(existing, newScores, report);

    // Elevate core principles
    const corePrinciples = this.elevateCorePrinciples(
      existing,
      newScores,
      existing.sources.length + 1,
    );

    return {
      ...existing,
      dimensions: mergedDimensions,
      sources: [...existing.sources, source],
      corePrinciples,
      contradictions: [...existing.contradictions, ...contradictions],
      overallConfidence: this.computeOverallConfidence(mergedDimensions),
      version: existing.version + 1,
      updatedAt: new Date(),
    };
  }

  /**
   * Merges a new video reference into an existing baseline.
   * Monotonic: thresholds only go UP, never down.
   * Weighted: higher-performing references contribute more.
   */
  private mergeVideoBaseline(
    existing: VideoQualityBaseline,
    newScores: Map<VideoDimensionName, { score: number; patterns: string[] }>,
    source: ReferenceSource,
    report: ChannelReferenceReport,
  ): VideoQualityBaseline {
    const mergedDimensions = existing.dimensions.map(dim => {
      const newScore = newScores.get(dim.name as VideoDimensionName);
      if (!newScore) return dim;

      // Weighted new score based on reference performance
      const weightedNewScore = this.applyWeight(newScore.score, source.weight);

      // Monotonic merge: only raise, never lower
      const mergedScore = Math.max(dim.score, weightedNewScore);
      const newRefCount = dim.referenceCount + 1;

      return {
        ...dim,
        score: mergedScore,
        referenceCount: newRefCount,
        confidence: this.computeDimensionConfidence(newRefCount, mergedScore),
        examplePatterns: [...dim.examplePatterns, ...newScore.patterns].slice(-10),
      };
    });

    // Detect contradictions
    const contradictions = this.detectVideoContradictions(existing, newScores, report);

    // Elevate core principles
    const corePrinciples = this.elevateCorePrinciples(
      existing,
      newScores,
      existing.sources.length + 1,
    );

    return {
      ...existing,
      dimensions: mergedDimensions,
      sources: [...existing.sources, source],
      corePrinciples,
      contradictions: [...existing.contradictions, ...contradictions],
      overallConfidence: this.computeOverallConfidence(mergedDimensions),
      version: existing.version + 1,
      updatedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Weighted Synthesis
  // -------------------------------------------------------------------------

  /**
   * Applies weight to a score. Higher-weight references push the score
   * closer to their actual value; lower-weight references have less impact.
   */
  private applyWeight(score: number, weight: number): number {
    // Weight scales the score's influence. A weight of 1.0 means full score,
    // lower weights reduce the effective score contribution.
    return clampScore(Math.round(score * weight));
  }

  // -------------------------------------------------------------------------
  // Core Principle Elevation
  // -------------------------------------------------------------------------

  /**
   * Identifies patterns appearing across multiple references and elevates
   * them to core principles with higher confidence scores.
   */
  private elevateCorePrinciples(
    existing: QualityBaseline,
    newScores: Map<string, { score: number; patterns: string[] }>,
    totalReferences: number,
  ): CorePrinciple[] {
    const patternCounts = new Map<string, { count: number; dimension: string }>();

    // Count patterns from existing dimensions
    for (const dim of existing.dimensions) {
      for (const pattern of dim.examplePatterns) {
        const normalized = this.normalizePattern(pattern);
        const current = patternCounts.get(normalized) ?? { count: 0, dimension: dim.name };
        patternCounts.set(normalized, { count: current.count + 1, dimension: dim.name });
      }
    }

    // Count patterns from new scores
    for (const [dimName, scored] of newScores) {
      for (const pattern of scored.patterns) {
        const normalized = this.normalizePattern(pattern);
        const current = patternCounts.get(normalized) ?? { count: 0, dimension: dimName };
        patternCounts.set(normalized, { count: current.count + 1, dimension: dimName });
      }
    }

    // Elevate patterns appearing in 2+ references to core principles
    const principles: CorePrinciple[] = [];
    for (const [pattern, { count, dimension }] of patternCounts) {
      if (count >= 2) {
        principles.push({
          pattern,
          occurrenceCount: count,
          totalReferences,
          confidence: Math.min(count / totalReferences, 1),
          dimension,
        });
      }
    }

    return principles;
  }

  /**
   * Normalizes a pattern string for comparison.
   */
  private normalizePattern(pattern: string): string {
    return pattern.toLowerCase().trim();
  }

  // -------------------------------------------------------------------------
  // Contradiction Detection
  // -------------------------------------------------------------------------

  /**
   * Detects contradictions between existing baseline and new app reference.
   * A contradiction occurs when a successful reference uses a pattern that
   * conflicts with the existing baseline's established patterns.
   */
  private detectAppContradictions(
    existing: AppQualityBaseline,
    newScores: Map<AppDimensionName, { score: number; patterns: string[] }>,
    report: AppReferenceReport,
  ): BaselineContradiction[] {
    const contradictions: BaselineContradiction[] = [];

    for (const dim of existing.dimensions) {
      const newScore = newScores.get(dim.name as AppDimensionName);
      if (!newScore) continue;

      // If the new reference scores significantly lower on a dimension
      // but the app is still highly rated, flag as contradiction
      if (newScore.score < dim.score - 3 && report.listing.rating >= 4.5) {
        contradictions.push({
          dimension: dim.name,
          existingPattern: dim.examplePatterns[0] ?? 'high threshold',
          conflictingPattern: newScore.patterns[0] ?? 'lower threshold from high-rated app',
          sourceUrl: report.url,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    return contradictions;
  }

  /**
   * Detects contradictions between existing baseline and new video reference.
   */
  private detectVideoContradictions(
    existing: VideoQualityBaseline,
    newScores: Map<VideoDimensionName, { score: number; patterns: string[] }>,
    report: ChannelReferenceReport,
  ): BaselineContradiction[] {
    const contradictions: BaselineContradiction[] = [];

    for (const dim of existing.dimensions) {
      const newScore = newScores.get(dim.name as VideoDimensionName);
      if (!newScore) continue;

      // If the new reference scores significantly lower on a dimension
      // but the channel has high engagement, flag as contradiction
      if (newScore.score < dim.score - 3 && report.channelMetrics.engagementRate > 0.05) {
        contradictions.push({
          dimension: dim.name,
          existingPattern: dim.examplePatterns[0] ?? 'high threshold',
          conflictingPattern: newScore.patterns[0] ?? 'lower threshold from high-engagement channel',
          sourceUrl: report.url,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    return contradictions;
  }

  // -------------------------------------------------------------------------
  // Confidence Computation
  // -------------------------------------------------------------------------

  /**
   * Computes confidence for a single dimension based on reference count
   * and score stability.
   */
  private computeDimensionConfidence(referenceCount: number, score: number): number {
    // More references = higher confidence, capped at 1.0
    // Base confidence from reference count (logarithmic growth)
    const refConfidence = Math.min(Math.log2(referenceCount + 1) / 3, 0.8);
    // Score extremes (very high or very low) have slightly higher confidence
    const scoreConfidence = score >= 7 || score <= 3 ? 0.2 : 0.1;
    return Math.min(refConfidence + scoreConfidence, 1.0);
  }

  /**
   * Computes overall baseline confidence from all dimensions.
   */
  private computeOverallConfidence(dimensions: ScoredDimension[]): number {
    if (dimensions.length === 0) return 0;
    const totalConfidence = dimensions.reduce((sum, d) => sum + d.confidence, 0);
    return totalConfidence / dimensions.length;
  }
}
