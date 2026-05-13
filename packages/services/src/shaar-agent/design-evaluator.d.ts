/**
 * Shaar Agent — UI/UX Design Evaluator
 *
 * Evaluates visual design quality from DOM/CSS analysis:
 * - Layout quality and consistency
 * - Visual hierarchy effectiveness
 * - Spacing and alignment
 * - Typography quality
 * - Color usage and contrast
 * - CTA effectiveness
 * - Navigation clarity
 * - Empty/loading/error state handling
 */
import type { PageObservation } from './browser-observer.js';
export interface DesignIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: DesignCategory;
    description: string;
    recommendation: string;
    evidence: string;
    designPrinciple: string;
    impactScore: number;
}
export type DesignCategory = 'layout' | 'hierarchy' | 'spacing' | 'typography' | 'color' | 'cta' | 'navigation' | 'states' | 'consistency' | 'responsiveness';
export interface DesignReport {
    pageUrl: string;
    timestamp: string;
    overallDesignScore: number;
    categoryScores: Record<DesignCategory, number>;
    issues: DesignIssue[];
    strengths: string[];
    recommendations: DesignRecommendation[];
}
export interface DesignRecommendation {
    priority: number;
    title: string;
    description: string;
    category: DesignCategory;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
}
export declare class DesignEvaluator {
    /**
     * Evaluate the visual design quality of a page.
     */
    evaluate(observation: PageObservation): DesignReport;
    private evaluateLayout;
    private evaluateHierarchy;
    private evaluateSpacing;
    private evaluateTypography;
    private evaluateColor;
    private evaluateCTAs;
    private evaluateNavigation;
    private evaluateStates;
    private evaluateConsistency;
    private identifyStrengths;
    private calculateCategoryScores;
    private generateRecommendations;
}
//# sourceMappingURL=design-evaluator.d.ts.map