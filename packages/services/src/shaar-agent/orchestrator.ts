/**
 * Shaar Agent — Orchestrator
 *
 * Top-level orchestrator that coordinates all Shaar Agent services
 * to perform a complete dashboard review cycle.
 *
 * Usage:
 *   const shaar = new ShaarAgentOrchestrator({ dashboardUrl: '...' });
 *   const result = await shaar.reviewPage('/kings-view');
 *   const fullReview = await shaar.reviewAllPages();
 */

import { BrowserObserver, type PageObservation } from './browser-observer.js';
import { type PlaywrightObserver } from './playwright-observer.js';
import { UXFrictionDetector, type FrictionReport } from './ux-friction-detector.js';
import { DesignEvaluator, type DesignReport } from './design-evaluator.js';
import { DataTruthAuditor, type DataTruthReport } from './data-truth-auditor.js';
import { AgenticVisibilityAuditor, type AgenticVisibilityReport } from './agentic-visibility-auditor.js';
import { RevenueWorkflowAuditor, type RevenueWorkflowReport } from './revenue-workflow-auditor.js';
import { ReadinessScoreCalculator, type ReadinessScore } from './readiness-score.js';
import { RecommendationGenerator, type RecommendationBatch, type Recommendation } from './recommendation-generator.js';
import { VerificationService, type VerificationResult } from './verification-service.js';

export interface ShaarAgentConfig {
  dashboardUrl: string;
  s3Bucket?: string;
  /** When true, uses Playwright (real browser) instead of HTTP fetch. Default: false */
  usePlaywright?: boolean;
  /** Directory for Playwright screenshots. Default: ./screenshots/shaar-agent/ */
  screenshotDir?: string;
}

export interface ShaarReviewResult {
  pageUrl: string;
  timestamp: string;
  observation: PageObservation;
  friction: FrictionReport;
  design: DesignReport;
  dataTruth: DataTruthReport;
  agenticVisibility: AgenticVisibilityReport;
  revenueWorkflow: RevenueWorkflowReport;
  readinessScore: ReadinessScore;
  recommendations: RecommendationBatch;
  summary: string;
}

export class ShaarAgentOrchestrator {
  private observer: BrowserObserver | PlaywrightObserver;
  private frictionDetector: UXFrictionDetector;
  private designEvaluator: DesignEvaluator;
  private dataTruthAuditor: DataTruthAuditor;
  private agenticAuditor: AgenticVisibilityAuditor;
  private revenueAuditor: RevenueWorkflowAuditor;
  private readinessCalculator: ReadinessScoreCalculator;
  private recommendationGenerator: RecommendationGenerator;
  private verificationService: VerificationService;
  private observerReady: Promise<void>;

  constructor(config: ShaarAgentConfig) {
    // Default to BrowserObserver; replaced by PlaywrightObserver once loaded
    this.observer = new BrowserObserver({
      dashboardUrl: config.dashboardUrl,
      s3Bucket: config.s3Bucket,
    });

    if (config.usePlaywright) {
      this.observerReady = import('./playwright-observer.js').then(({ PlaywrightObserver: PW }) => {
        this.observer = new PW({
          dashboardUrl: config.dashboardUrl,
          s3Bucket: config.s3Bucket,
          screenshotDir: config.screenshotDir,
        });
      });
    } else {
      this.observerReady = Promise.resolve();
    }

    this.frictionDetector = new UXFrictionDetector();
    this.designEvaluator = new DesignEvaluator();
    this.dataTruthAuditor = new DataTruthAuditor();
    this.agenticAuditor = new AgenticVisibilityAuditor();
    this.revenueAuditor = new RevenueWorkflowAuditor();
    this.readinessCalculator = new ReadinessScoreCalculator();
    this.recommendationGenerator = new RecommendationGenerator();
    this.verificationService = new VerificationService(config.dashboardUrl);
  }

  /**
   * Perform a complete review of a single page.
   */
  async reviewPage(path: string = '/'): Promise<ShaarReviewResult> {
    // Ensure the observer is ready (handles async Playwright loading)
    await this.observerReady;

    // 1. Observe the page
    const observation = await this.observer.observePage(path);

    // 2. Run all auditors
    const friction = this.frictionDetector.analyze(observation);
    const design = this.designEvaluator.evaluate(observation);
    const dataTruth = this.dataTruthAuditor.audit(observation);
    const agenticVisibility = this.agenticAuditor.audit(observation);
    const revenueWorkflow = this.revenueAuditor.audit(observation);

    // 3. Calculate readiness score
    const readinessScore = this.readinessCalculator.calculate({
      friction,
      design,
      dataTruth,
      agenticVisibility,
      revenueWorkflow,
    });

    // 4. Generate recommendations
    const recommendations = this.recommendationGenerator.generate({
      friction,
      design,
      dataTruth,
      agenticVisibility,
      revenueWorkflow,
      readinessScore,
    });

    // 5. Generate summary
    const summary = this.generateSummary(readinessScore, recommendations, observation.url);

    return {
      pageUrl: observation.url,
      timestamp: new Date().toISOString(),
      observation,
      friction,
      design,
      dataTruth,
      agenticVisibility,
      revenueWorkflow,
      readinessScore,
      recommendations,
      summary,
    };
  }

  /**
   * Perform a complete review of all dashboard pages.
   */
  async reviewAllPages(): Promise<ShaarReviewResult[]> {
    await this.observerReady;
    const results: ShaarReviewResult[] = [];
    const pages = await this.observer.getAvailablePages();

    for (const page of pages) {
      try {
        const result = await this.reviewPage(page);
        results.push(result);
      } catch (error) {
        console.error(`[ShaarAgent] Failed to review page ${page}: ${(error as Error).message}`);
      }
    }

    return results;
  }

  /**
   * Get the current readiness score without running a full review.
   */
  getReadinessScore(): ReadinessScore | null {
    const history = this.readinessCalculator.getHistory();
    if (history.scores.length === 0) return null;
    // Return the most recent calculation
    return null; // Would need to store last full result
  }

  /**
   * Approve a recommendation and dispatch to Kiro.
   */
  approveAndDispatch(recommendationId: string): { recommendation: Recommendation | null; kiroTask: any } {
    const approved = this.recommendationGenerator.approve(recommendationId);
    if (!approved) return { recommendation: null, kiroTask: null };

    const kiroTask = this.recommendationGenerator.dispatchToKiro(recommendationId);
    return { recommendation: approved, kiroTask };
  }

  /**
   * Verify a recommendation after implementation.
   */
  async verifyImplementation(recommendation: Recommendation): Promise<VerificationResult> {
    return this.verificationService.verify(recommendation);
  }

  /**
   * Get all pending recommendations.
   */
  getPendingRecommendations(): Recommendation[] {
    return this.recommendationGenerator.getByStatus('pending');
  }

  /**
   * Get all dispatched (in-progress) recommendations.
   */
  getDispatchedRecommendations(): Recommendation[] {
    return this.recommendationGenerator.getByStatus('dispatched');
  }

  // -------------------------------------------------------------------------
  // Summary Generation
  // -------------------------------------------------------------------------

  private generateSummary(
    readinessScore: ReadinessScore,
    recommendations: RecommendationBatch,
    pageUrl: string,
  ): string {
    const lines: string[] = [];

    lines.push(`## Shaar Guardian Review: ${pageUrl}`);
    lines.push('');
    lines.push(`**Readiness Score: ${readinessScore.overall}/100 (Grade: ${readinessScore.grade})**`);
    lines.push(`Trend: ${readinessScore.trend} | Points to next grade: ${readinessScore.pointsToNextGrade}`);
    lines.push('');

    // Dimension breakdown
    lines.push('### Dimension Scores');
    for (const dim of readinessScore.dimensions) {
      const statusEmoji = dim.status === 'excellent' ? '✅' : dim.status === 'good' ? '🟢' : dim.status === 'needs-work' ? '🟡' : '🔴';
      lines.push(`${statusEmoji} **${dim.name}**: ${dim.score}/100 — ${dim.summary}`);
    }
    lines.push('');

    // Top recommendations
    if (recommendations.totalCount > 0) {
      lines.push(`### Top Recommendations (${recommendations.totalCount} total, ${recommendations.criticalCount} critical)`);
      for (const rec of recommendations.recommendations.slice(0, 5)) {
        const severityEmoji = rec.severity === 'critical' ? '🚨' : rec.severity === 'high' ? '⚠️' : '💡';
        lines.push(`${severityEmoji} **${rec.title}**`);
        lines.push(`   ${rec.description}`);
        lines.push(`   Effort: ${rec.estimatedEffort} | Impact: +${rec.estimatedImpact} points`);
        lines.push('');
      }
    } else {
      lines.push('### No critical recommendations — page is in good shape! 🎉');
    }

    // Top improvements to reach next grade
    if (readinessScore.topImprovements.length > 0) {
      lines.push('### Path to Next Grade');
      for (const imp of readinessScore.topImprovements.slice(0, 3)) {
        lines.push(`${imp.rank}. **${imp.title}** (+${imp.estimatedImpact} pts, ${imp.effort} effort)`);
      }
    }

    return lines.join('\n');
  }
}
