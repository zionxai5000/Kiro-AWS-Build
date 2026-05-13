/**
 * Shaar Agent — Data Truth Auditor
 *
 * Checks every metric, chart, and data display for:
 * - Real data source vs mock/placeholder data
 * - Data freshness (stale indicators)
 * - Disconnected or broken data bindings
 * - Placeholder values (0, N/A, ---, "Coming soon")
 * - Mock data patterns (sequential IDs, lorem ipsum, test data)
 */
import type { PageObservation } from './browser-observer.js';
export interface DataTruthIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: DataTruthCategory;
    description: string;
    element?: string;
    evidence: string;
    recommendation: string;
    impactScore: number;
}
export type DataTruthCategory = 'mock-data' | 'placeholder' | 'stale-data' | 'disconnected' | 'hardcoded' | 'test-data';
export interface DataTruthReport {
    pageUrl: string;
    timestamp: string;
    overallTruthScore: number;
    totalIssues: number;
    mockDataCount: number;
    placeholderCount: number;
    staleDataCount: number;
    disconnectedCount: number;
    issues: DataTruthIssue[];
    metrics: MetricAudit[];
}
export interface MetricAudit {
    label: string;
    value: string;
    isReal: boolean;
    confidence: number;
    reason: string;
}
export declare class DataTruthAuditor {
    /**
     * Audit a page for data truth.
     */
    audit(observation: PageObservation): DataTruthReport;
    private detectMockData;
    private detectPlaceholders;
    private detectStaleData;
    private detectDisconnectedData;
    private detectHardcodedValues;
    private detectTestData;
    private auditMetrics;
    private auditSingleMetric;
}
//# sourceMappingURL=data-truth-auditor.d.ts.map