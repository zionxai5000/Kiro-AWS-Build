/**
 * Shaar Agent — Revenue Workflow Auditor
 *
 * Inspects revenue-generating screens for completeness and effectiveness:
 * - ZionX: app preview, screenshots, ads, payments, store readiness
 * - ZXMG: video generation, thumbnails, publish gates, analytics
 * - Zion Alpha: trading positions, P&L, risk management
 * - Eretz: portfolio overview, MRR tracking, synergy opportunities
 *
 * Evaluates whether screens help the King make money.
 */
import type { PageObservation } from './browser-observer.js';
export interface RevenueIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: RevenueCategory;
    pillar: string;
    description: string;
    recommendation: string;
    evidence: string;
    revenueImpact: 'direct' | 'indirect' | 'blocking';
    impactScore: number;
}
export type RevenueCategory = 'missing-workflow' | 'incomplete-pipeline' | 'no-revenue-metrics' | 'blocked-action' | 'missing-automation' | 'poor-visibility' | 'no-conversion-path';
export interface RevenueWorkflowReport {
    pageUrl: string;
    timestamp: string;
    pillar: string;
    overallRevenueScore: number;
    issues: RevenueIssue[];
    workflowCompleteness: WorkflowCheck[];
    revenueMetricsPresent: string[];
    revenueMetricsMissing: string[];
    moneyMakingCapability: 'strong' | 'partial' | 'weak' | 'none';
}
export interface WorkflowCheck {
    workflow: string;
    steps: WorkflowStep[];
    completeness: number;
    blockers: string[];
}
export interface WorkflowStep {
    name: string;
    present: boolean;
    functional: boolean;
    evidence: string;
}
export declare class RevenueWorkflowAuditor {
    /**
     * Audit a page for revenue workflow effectiveness.
     */
    audit(observation: PageObservation): RevenueWorkflowReport;
    private detectPillar;
    private auditZionX;
    private checkZionXWorkflows;
    private auditZXMG;
    private checkZXMGWorkflows;
    private auditZionAlpha;
    private checkAlphaWorkflows;
    private auditEretz;
    private checkEretzWorkflows;
    private auditGeneral;
    private checkRevenueMetrics;
}
//# sourceMappingURL=revenue-workflow-auditor.d.ts.map