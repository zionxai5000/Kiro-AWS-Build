/**
 * Shaar Agent — Readiness Score Calculator
 *
 * Composite score across all evaluation dimensions:
 * - UX Quality (friction score)
 * - Visual Design (design evaluator score)
 * - Data Truth (data truth auditor score)
 * - Agentic Visibility (agentic auditor score)
 * - Revenue Workflow (revenue auditor score)
 * - Workflow Clarity
 * - Permission Safety
 * - Mobile Responsiveness
 * - Cost Visibility
 *
 * Generates Top 5 improvements to reach next threshold.
 */
import type { FrictionReport } from './ux-friction-detector.js';
import type { DesignReport } from './design-evaluator.js';
import type { DataTruthReport } from './data-truth-auditor.js';
import type { AgenticVisibilityReport } from './agentic-visibility-auditor.js';
import type { RevenueWorkflowReport } from './revenue-workflow-auditor.js';
export interface ReadinessScore {
    overall: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    dimensions: ReadinessDimension[];
    topImprovements: ReadinessImprovement[];
    nextThreshold: number;
    pointsToNextGrade: number;
    trend: 'improving' | 'stable' | 'declining';
    timestamp: string;
}
export interface ReadinessDimension {
    name: string;
    score: number;
    weight: number;
    status: 'excellent' | 'good' | 'needs-work' | 'critical';
    summary: string;
}
export interface ReadinessImprovement {
    rank: number;
    dimension: string;
    title: string;
    description: string;
    estimatedImpact: number;
    effort: 'low' | 'medium' | 'high';
    category: string;
}
export interface ReadinessHistory {
    scores: Array<{
        timestamp: string;
        overall: number;
        grade: string;
    }>;
    improvements: Array<{
        timestamp: string;
        improvement: string;
        pointsGained: number;
    }>;
}
export declare class ReadinessScoreCalculator {
    private history;
    /**
     * Calculate the composite readiness score from all audit reports.
     */
    calculate(reports: {
        friction?: FrictionReport;
        design?: DesignReport;
        dataTruth?: DataTruthReport;
        agenticVisibility?: AgenticVisibilityReport;
        revenueWorkflow?: RevenueWorkflowReport;
    }): ReadinessScore;
    /**
     * Get historical readiness scores.
     */
    getHistory(): ReadinessHistory;
    private getStatus;
    private getGrade;
    private calculateTrend;
    private generateTopImprovements;
    private getImprovementForDimension;
}
//# sourceMappingURL=readiness-score.d.ts.map