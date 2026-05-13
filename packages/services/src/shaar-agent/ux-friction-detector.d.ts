/**
 * Shaar Agent — UX Friction Detector
 *
 * Analyzes dashboard DOM for UX friction patterns:
 * - Missing labels on interactive elements
 * - Dead-end workflows (no clear next action)
 * - Hidden status indicators
 * - Missing loading/error feedback
 * - Unclear navigation
 * - High cognitive load
 * - Poor information hierarchy
 */
import type { PageObservation } from './browser-observer.js';
export interface FrictionIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: FrictionCategory;
    description: string;
    element?: string;
    recommendation: string;
    evidence: string;
    impactScore: number;
}
export type FrictionCategory = 'missing-label' | 'dead-end' | 'hidden-status' | 'missing-feedback' | 'unclear-navigation' | 'cognitive-overload' | 'poor-hierarchy' | 'accessibility' | 'empty-state' | 'error-handling';
export interface FrictionReport {
    pageUrl: string;
    timestamp: string;
    totalIssues: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    overallFrictionScore: number;
    issues: FrictionIssue[];
    cognitiveLoadScore: number;
    informationHierarchyScore: number;
}
export declare class UXFrictionDetector {
    /**
     * Analyze a page observation for UX friction.
     */
    analyze(observation: PageObservation): FrictionReport;
    private detectMissingLabels;
    private detectDeadEnds;
    private detectHiddenStatus;
    private detectMissingFeedback;
    private detectUnclearNavigation;
    private detectCognitiveOverload;
    private detectPoorHierarchy;
    private detectAccessibilityIssues;
    private detectEmptyStates;
    private detectErrorHandling;
    private calculateCognitiveLoad;
    private calculateHierarchyScore;
}
//# sourceMappingURL=ux-friction-detector.d.ts.map