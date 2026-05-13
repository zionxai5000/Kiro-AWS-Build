/**
 * Shaar Agent — Recommendation Generator & Kiro Task Dispatcher
 *
 * Generates structured improvement recommendations with:
 * - Evidence (what was observed)
 * - Acceptance criteria (how to verify the fix)
 * - Implementation guidance (how to fix it)
 * - Priority ranking
 *
 * Converts approved recommendations to Kiro tasks via the Agent-to-Kiro bridge.
 */
import type { FrictionReport } from './ux-friction-detector.js';
import type { DesignReport } from './design-evaluator.js';
import type { DataTruthReport } from './data-truth-auditor.js';
import type { AgenticVisibilityReport } from './agentic-visibility-auditor.js';
import type { RevenueWorkflowReport } from './revenue-workflow-auditor.js';
import type { ReadinessScore } from './readiness-score.js';
export interface Recommendation {
    id: string;
    priority: number;
    title: string;
    description: string;
    category: string;
    dimension: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    evidence: RecommendationEvidence;
    acceptanceCriteria: string[];
    implementationGuidance: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
    estimatedImpact: number;
    status: 'pending' | 'approved' | 'dispatched' | 'implemented' | 'verified' | 'rejected';
    kiroTaskId?: string;
    createdAt: string;
    approvedAt?: string;
    implementedAt?: string;
    verifiedAt?: string;
}
export interface RecommendationEvidence {
    pageUrl: string;
    observation: string;
    screenshotKey?: string;
    elementSelector?: string;
    beforeState: string;
}
export interface KiroTask {
    title: string;
    description: string;
    steps: string[];
    acceptanceCriteria: string[];
    files: string[];
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
}
export interface RecommendationBatch {
    timestamp: string;
    readinessScore: number;
    recommendations: Recommendation[];
    totalCount: number;
    criticalCount: number;
    highCount: number;
}
export declare class RecommendationGenerator {
    private recommendations;
    private dispatchedTasks;
    /**
     * Generate recommendations from all audit reports.
     */
    generate(reports: {
        friction?: FrictionReport;
        design?: DesignReport;
        dataTruth?: DataTruthReport;
        agenticVisibility?: AgenticVisibilityReport;
        revenueWorkflow?: RevenueWorkflowReport;
        readinessScore?: ReadinessScore;
    }): RecommendationBatch;
    /**
     * Approve a recommendation for dispatch to Kiro.
     */
    approve(recommendationId: string): Recommendation | null;
    /**
     * Convert an approved recommendation to a Kiro task and dispatch it.
     */
    dispatchToKiro(recommendationId: string): KiroTask | null;
    /**
     * Mark a recommendation as implemented.
     */
    markImplemented(recommendationId: string): void;
    /**
     * Mark a recommendation as verified (post-implementation check passed).
     */
    markVerified(recommendationId: string): void;
    /**
     * Get all recommendations.
     */
    getAll(): Recommendation[];
    /**
     * Get recommendations by status.
     */
    getByStatus(status: Recommendation['status']): Recommendation[];
    private fromFrictionIssue;
    private fromDesignIssue;
    private fromDataTruthIssue;
    private fromAgenticIssue;
    private fromRevenueIssue;
    private convertToKiroTask;
    private inferAffectedFiles;
}
//# sourceMappingURL=recommendation-generator.d.ts.map