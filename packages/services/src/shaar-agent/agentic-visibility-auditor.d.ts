/**
 * Shaar Agent — Agentic Behavior Visibility Auditor
 *
 * Verifies that agent screens properly display agentic behavior:
 * - Execution traces visible
 * - Memory indicators present
 * - Tool usage shown
 * - Delegation status displayed
 * - Planning/reasoning visible
 * - Autonomy level indicators
 * - Cost/token usage shown
 *
 * Flags screens where agents appear as simple chatbots without agentic context.
 */
import type { PageObservation } from './browser-observer.js';
export interface AgenticVisibilityIssue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: AgenticCategory;
    description: string;
    recommendation: string;
    evidence: string;
    impactScore: number;
}
export type AgenticCategory = 'execution-trace' | 'memory-indicator' | 'tool-usage' | 'delegation-status' | 'planning-visibility' | 'autonomy-level' | 'cost-visibility' | 'chatbot-appearance';
export interface AgenticVisibilityReport {
    pageUrl: string;
    timestamp: string;
    overallVisibilityScore: number;
    isChatbotLike: boolean;
    issues: AgenticVisibilityIssue[];
    presentIndicators: string[];
    missingIndicators: string[];
    agenticFeatures: AgenticFeatureCheck[];
}
export interface AgenticFeatureCheck {
    feature: string;
    present: boolean;
    quality: 'good' | 'partial' | 'missing';
    evidence: string;
}
export declare class AgenticVisibilityAuditor {
    /**
     * Audit a page for agentic behavior visibility.
     */
    audit(observation: PageObservation): AgenticVisibilityReport;
    private checkAgenticFeatures;
    private generateIssues;
    private detectChatbotAppearance;
}
//# sourceMappingURL=agentic-visibility-auditor.d.ts.map