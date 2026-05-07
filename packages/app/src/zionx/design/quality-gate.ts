/**
 * ZionX Design Excellence — Design Quality Gate
 *
 * Evaluates an app's design against top-10 competitors in its niche,
 * scoring visual polish, interaction design, information architecture,
 * and onboarding effectiveness.
 *
 * Requirements: 11c.7
 */

import type { GateResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { AppCategory, DesignIntelligenceEngine } from './design-intelligence.js';
import type { DesignSystem } from './design-system-generator.js';
import type { UserJourneyMap } from './user-journey-engine.js';
import type { AccessibilityReport } from './ui-component-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DesignQualityScore {
  overall: number;
  visualPolish: number;
  interactionDesign: number;
  informationArchitecture: number;
  onboardingEffectiveness: number;
  accessibilityCompliance: number;
}

export interface CompetitorBenchmark {
  appName: string;
  estimatedScore: number;
  strengths: string[];
  weaknesses: string[];
}

export interface DesignQualityReport {
  appId: string;
  category: AppCategory;
  scores: DesignQualityScore;
  competitorBenchmarks: CompetitorBenchmark[];
  averageCompetitorScore: number;
  percentileRank: number;
  gateResult: GateResult;
  improvements: DesignImprovement[];
  evaluatedAt: string;
}

export interface DesignImprovement {
  area: 'visual_polish' | 'interaction_design' | 'information_architecture' | 'onboarding' | 'accessibility';
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedImpact: number;
}

export interface DesignQualityInput {
  appId: string;
  appName: string;
  category: AppCategory;
  platform: 'ios' | 'android';
  designSystem: DesignSystem;
  journeyMap: UserJourneyMap;
  accessibilityReport: AccessibilityReport;
}

// ---------------------------------------------------------------------------
// Scoring Thresholds
// ---------------------------------------------------------------------------

const MINIMUM_QUALITY_SCORE = 70;
const MINIMUM_ACCESSIBILITY_SCORE = 80;

// ---------------------------------------------------------------------------
// Design Quality Gate
// ---------------------------------------------------------------------------

export class DesignQualityGate {
  constructor(
    private readonly designIntelligence: DesignIntelligenceEngine,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Evaluate an app's design quality against competitors and return
   * a gate result (pass/fail) with detailed scoring.
   */
  async evaluate(input: DesignQualityInput): Promise<DesignQualityReport> {
    // 1. Analyze competitors for benchmarking
    const analysis = await this.designIntelligence.analyzeCategory(input.category, input.platform);

    // 2. Score the app's design
    const scores = this.scoreDesign(input);

    // 3. Benchmark against competitors
    const competitorBenchmarks = this.benchmarkCompetitors(analysis.appsAnalyzed);
    const averageCompetitorScore = competitorBenchmarks.length > 0
      ? competitorBenchmarks.reduce((sum, c) => sum + c.estimatedScore, 0) / competitorBenchmarks.length
      : 70;

    // 4. Calculate percentile rank
    const allScores = [...competitorBenchmarks.map((c) => c.estimatedScore), scores.overall].sort((a, b) => a - b);
    const rank = allScores.indexOf(scores.overall);
    const percentileRank = Math.round((rank / allScores.length) * 100);

    // 5. Generate gate result
    const gateResult = this.generateGateResult(scores, averageCompetitorScore);

    // 6. Generate improvement suggestions
    const improvements = this.generateImprovements(scores);

    // 7. Store evaluation in Zikaron
    await this.storeEvaluation(input.appId, scores, gateResult);

    return {
      appId: input.appId,
      category: input.category,
      scores,
      competitorBenchmarks,
      averageCompetitorScore,
      percentileRank,
      gateResult,
      improvements,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Score the app's design across all dimensions.
   */
  scoreDesign(input: DesignQualityInput): DesignQualityScore {
    const visualPolish = this.scoreVisualPolish(input.designSystem);
    const interactionDesign = this.scoreInteractionDesign(input.designSystem);
    const informationArchitecture = this.scoreInformationArchitecture(input.journeyMap);
    const onboardingEffectiveness = this.scoreOnboarding(input.journeyMap);
    const accessibilityCompliance = this.scoreAccessibility(input.accessibilityReport);

    const overall = Math.round(
      visualPolish * 0.25 +
      interactionDesign * 0.2 +
      informationArchitecture * 0.2 +
      onboardingEffectiveness * 0.2 +
      accessibilityCompliance * 0.15,
    );

    return {
      overall,
      visualPolish,
      interactionDesign,
      informationArchitecture,
      onboardingEffectiveness,
      accessibilityCompliance,
    };
  }

  /**
   * Score visual polish based on design system completeness.
   */
  private scoreVisualPolish(ds: DesignSystem): number {
    let score = 0;

    // Color palette completeness
    if (ds.colorPalette.primary && ds.colorPalette.secondary && ds.colorPalette.accent) score += 20;
    if (ds.colorPalette.error && ds.colorPalette.warning && ds.colorPalette.success) score += 10;

    // Typography completeness
    if (ds.typography.fontFamily.primary) score += 15;
    if (ds.typography.sizes.h1 && ds.typography.sizes.body1 && ds.typography.sizes.caption) score += 15;

    // Spacing system
    if (ds.spacing.unit > 0 && Object.keys(ds.spacing.scale).length >= 5) score += 15;

    // Animation specs
    if (ds.animations.durations && ds.animations.easings) score += 15;

    // Similarity check (lower is better — means more unique)
    if (ds.similarityScore < 70) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Score interaction design based on animation and component specs.
   */
  private scoreInteractionDesign(ds: DesignSystem): number {
    let score = 0;

    // Has animation specs
    if (ds.animations.transitions.pageEnter) score += 25;
    if (ds.animations.transitions.elementEnter) score += 25;

    // Has component library
    if (ds.components.length >= 3) score += 25;
    if (ds.components.length >= 5) score += 15;

    // Has iconography spec
    if (ds.iconography.style) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Score information architecture based on journey map structure.
   */
  private scoreInformationArchitecture(journeyMap: UserJourneyMap): number {
    let score = 0;

    // Has defined core loop
    if (journeyMap.coreLoop.trigger && journeyMap.coreLoop.action && journeyMap.coreLoop.reward) score += 30;

    // Has retention mechanics
    if (journeyMap.retentionMechanics.length >= 2) score += 20;
    if (journeyMap.retentionMechanics.length >= 4) score += 10;

    // Has monetization touchpoints
    if (journeyMap.monetizationTouchpoints.length >= 2) score += 20;

    // Reasonable total steps (not too complex)
    if (journeyMap.totalSteps >= 5 && journeyMap.totalSteps <= 20) score += 20;

    return Math.min(score, 100);
  }

  /**
   * Score onboarding effectiveness.
   */
  private scoreOnboarding(journeyMap: UserJourneyMap): number {
    let score = 0;
    const onboarding = journeyMap.onboarding;

    // Has skip option
    if (onboarding.hasSkipOption) score += 15;

    // Shows value proposition
    if (onboarding.showsValueProp) score += 20;

    // Collects preferences for personalization
    if (onboarding.collectsPreferences) score += 15;

    // Reasonable number of steps (3-5 is ideal)
    if (onboarding.totalSteps >= 3 && onboarding.totalSteps <= 5) score += 20;

    // Reasonable duration
    if (onboarding.estimatedDurationSeconds <= 60) score += 15;

    // First session has aha moment
    if (journeyMap.firstSession.endsWithAhamoment) score += 15;

    return Math.min(score, 100);
  }

  /**
   * Score accessibility compliance.
   */
  private scoreAccessibility(report: AccessibilityReport): number {
    if (report.totalComponents === 0) return 0;

    const complianceRate = report.compliantComponents / report.totalComponents;
    const errorCount = report.issues.filter((i) => i.severity === 'error').length;

    let score = Math.round(complianceRate * 80);

    // Bonus for zero errors
    if (errorCount === 0) score += 20;

    // Penalty for errors
    score -= errorCount * 5;

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Benchmark against competitors (structural estimates).
   */
  private benchmarkCompetitors(appsAnalyzed: number): CompetitorBenchmark[] {
    // In production, this would use actual competitor analysis data
    const benchmarks: CompetitorBenchmark[] = [];

    for (let i = 0; i < Math.min(appsAnalyzed, 10); i++) {
      benchmarks.push({
        appName: `Competitor ${i + 1}`,
        estimatedScore: 65 + Math.round(Math.random() * 25),
        strengths: ['Visual polish', 'Smooth animations'],
        weaknesses: ['Complex onboarding', 'Limited accessibility'],
      });
    }

    return benchmarks.sort((a, b) => b.estimatedScore - a.estimatedScore);
  }

  /**
   * Generate the gate result (pass/fail).
   */
  private generateGateResult(
    scores: DesignQualityScore,
    averageCompetitorScore: number,
  ): GateResult {
    const issues: string[] = [];

    if (scores.overall < MINIMUM_QUALITY_SCORE) {
      issues.push(`Overall score ${scores.overall} is below minimum ${MINIMUM_QUALITY_SCORE}`);
    }

    if (scores.accessibilityCompliance < MINIMUM_ACCESSIBILITY_SCORE) {
      issues.push(`Accessibility score ${scores.accessibilityCompliance} is below minimum ${MINIMUM_ACCESSIBILITY_SCORE}`);
    }

    if (scores.overall < averageCompetitorScore - 10) {
      issues.push(`Overall score ${scores.overall} is significantly below competitor average ${Math.round(averageCompetitorScore)}`);
    }

    return {
      gateId: 'gate-design-quality',
      gateName: 'Design Quality Gate',
      passed: issues.length === 0,
      details: issues.length === 0
        ? `Design quality score ${scores.overall}/100 meets all thresholds`
        : `Design quality issues: ${issues.join('; ')}`,
    };
  }

  /**
   * Generate improvement suggestions for low-scoring areas.
   */
  private generateImprovements(scores: DesignQualityScore): DesignImprovement[] {
    const improvements: DesignImprovement[] = [];

    if (scores.visualPolish < 70) {
      improvements.push({
        area: 'visual_polish',
        priority: 'high',
        description: 'Enhance color palette consistency and add missing typography variants.',
        estimatedImpact: 15,
      });
    }

    if (scores.interactionDesign < 70) {
      improvements.push({
        area: 'interaction_design',
        priority: 'high',
        description: 'Add micro-interactions and transition animations to key components.',
        estimatedImpact: 12,
      });
    }

    if (scores.informationArchitecture < 70) {
      improvements.push({
        area: 'information_architecture',
        priority: 'medium',
        description: 'Simplify navigation structure and strengthen the core engagement loop.',
        estimatedImpact: 10,
      });
    }

    if (scores.onboardingEffectiveness < 70) {
      improvements.push({
        area: 'onboarding',
        priority: 'medium',
        description: 'Reduce onboarding steps and ensure the aha moment is reached in the first session.',
        estimatedImpact: 8,
      });
    }

    if (scores.accessibilityCompliance < 80) {
      improvements.push({
        area: 'accessibility',
        priority: 'high',
        description: 'Fix contrast ratio issues and ensure all interactive elements meet minimum touch target sizes.',
        estimatedImpact: 10,
      });
    }

    return improvements.sort((a, b) => b.estimatedImpact - a.estimatedImpact);
  }

  /**
   * Store evaluation in Zikaron.
   */
  private async storeEvaluation(
    appId: string,
    scores: DesignQualityScore,
    gateResult: GateResult,
  ): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `design-quality-${appId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'episodic',
      content: `Design quality evaluation for ${appId}: ${scores.overall}/100, gate ${gateResult.passed ? 'passed' : 'failed'}`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['design-quality', gateResult.passed ? 'passed' : 'failed'],
      createdAt: new Date(),
      eventType: 'design_quality_evaluation',
      participants: ['zionx-app-factory'],
      outcome: gateResult.passed ? 'success' : 'failure',
      relatedEntities: [{ entityId: appId, entityType: 'app', role: 'target' }],
    });
  }
}
