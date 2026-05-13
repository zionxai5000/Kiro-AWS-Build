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
import { type PageObservation } from './browser-observer.js';
import { type FrictionReport } from './ux-friction-detector.js';
import { type DesignReport } from './design-evaluator.js';
import { type DataTruthReport } from './data-truth-auditor.js';
import { type AgenticVisibilityReport } from './agentic-visibility-auditor.js';
import { type RevenueWorkflowReport } from './revenue-workflow-auditor.js';
import { type ReadinessScore } from './readiness-score.js';
import { type RecommendationBatch, type Recommendation } from './recommendation-generator.js';
import { type VerificationResult } from './verification-service.js';
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
export declare class ShaarAgentOrchestrator {
    private observer;
    private frictionDetector;
    private designEvaluator;
    private dataTruthAuditor;
    private agenticAuditor;
    private revenueAuditor;
    private readinessCalculator;
    private recommendationGenerator;
    private verificationService;
    private observerReady;
    constructor(config: ShaarAgentConfig);
    /**
     * Perform a complete review of a single page.
     */
    reviewPage(path?: string): Promise<ShaarReviewResult>;
    /**
     * Perform a complete review of all dashboard pages.
     */
    reviewAllPages(): Promise<ShaarReviewResult[]>;
    /**
     * Get the current readiness score without running a full review.
     */
    getReadinessScore(): ReadinessScore | null;
    /**
     * Approve a recommendation and dispatch to Kiro.
     */
    approveAndDispatch(recommendationId: string): {
        recommendation: Recommendation | null;
        kiroTask: any;
    };
    /**
     * Verify a recommendation after implementation.
     */
    verifyImplementation(recommendation: Recommendation): Promise<VerificationResult>;
    /**
     * Get all pending recommendations.
     */
    getPendingRecommendations(): Recommendation[];
    /**
     * Get all dispatched (in-progress) recommendations.
     */
    getDispatchedRecommendations(): Recommendation[];
    private generateSummary;
}
//# sourceMappingURL=orchestrator.d.ts.map