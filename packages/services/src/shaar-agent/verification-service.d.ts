/**
 * Shaar Agent — Post-Implementation Verification Service
 *
 * After Kiro implements changes:
 * - Retest the affected page
 * - Compare before/after observations
 * - Verify acceptance criteria are met
 * - Mark recommendation as verified or reopen with failure evidence
 */
import { type PageObservation } from './browser-observer.js';
import type { Recommendation } from './recommendation-generator.js';
export interface VerificationResult {
    recommendationId: string;
    passed: boolean;
    timestamp: string;
    beforeObservation: PageObservation | null;
    afterObservation: PageObservation;
    comparison: VerificationComparison;
    acceptanceCriteriaResults: AcceptanceCriteriaResult[];
    summary: string;
}
export interface VerificationComparison {
    frictionScoreBefore: number;
    frictionScoreAfter: number;
    frictionImprovement: number;
    designScoreBefore: number;
    designScoreAfter: number;
    designImprovement: number;
    dataTruthScoreBefore: number;
    dataTruthScoreAfter: number;
    dataTruthImprovement: number;
    issueResolved: boolean;
    newIssuesIntroduced: number;
}
export interface AcceptanceCriteriaResult {
    criterion: string;
    passed: boolean;
    evidence: string;
}
export declare class VerificationService {
    private observer;
    private frictionDetector;
    private designEvaluator;
    private dataTruthAuditor;
    private beforeSnapshots;
    constructor(dashboardUrl: string);
    /**
     * Capture a "before" snapshot for a recommendation before implementation.
     */
    captureBeforeSnapshot(recommendation: Recommendation): Promise<void>;
    /**
     * Verify a recommendation after implementation.
     * Compares before/after state and checks acceptance criteria.
     */
    verify(recommendation: Recommendation): Promise<VerificationResult>;
    private checkIssueResolved;
    private countNewIssues;
    private checkAcceptanceCriteria;
    private generateSummary;
}
//# sourceMappingURL=verification-service.d.ts.map