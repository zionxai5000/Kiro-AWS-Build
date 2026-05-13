/**
 * Shaar Agent — Main Service Index
 *
 * The Shaar Agent is the Human Interface Intelligence layer of SeraphimOS.
 * It autonomously observes the dashboard, evaluates UX quality, detects friction,
 * audits data truth, and generates improvement recommendations.
 *
 * Architecture:
 * - BrowserObserver: Fetches and parses dashboard HTML
 * - UXFrictionDetector: Analyzes DOM for friction patterns
 * - DesignEvaluator: Evaluates visual design quality
 * - DataTruthAuditor: Checks for mock/stale data
 * - AgenticVisibilityAuditor: Verifies agent screens show agentic behavior
 * - RevenueWorkflowAuditor: Checks revenue-generating screens
 * - ReadinessScoreCalculator: Composite scoring across all dimensions
 * - RecommendationGenerator: Generates structured improvement tasks
 * - VerificationService: Before/after comparison after implementation
 */

export { BrowserObserver, type PageObservation, type DOMElement, type NavigationItem, type BrowserObserverConfig } from './browser-observer.js';
export { PlaywrightObserver, type PlaywrightObserverConfig } from './playwright-observer.js';
export { UXFrictionDetector, type FrictionReport, type FrictionIssue, type FrictionCategory } from './ux-friction-detector.js';
export { DesignEvaluator, type DesignReport, type DesignIssue, type DesignCategory, type DesignRecommendation } from './design-evaluator.js';
export { DataTruthAuditor, type DataTruthReport, type DataTruthIssue, type DataTruthCategory, type MetricAudit } from './data-truth-auditor.js';
export { AgenticVisibilityAuditor, type AgenticVisibilityReport, type AgenticVisibilityIssue, type AgenticCategory, type AgenticFeatureCheck } from './agentic-visibility-auditor.js';
export { RevenueWorkflowAuditor, type RevenueWorkflowReport, type RevenueIssue, type RevenueCategory, type WorkflowCheck } from './revenue-workflow-auditor.js';
export { ReadinessScoreCalculator, type ReadinessScore, type ReadinessDimension, type ReadinessImprovement } from './readiness-score.js';
export { RecommendationGenerator, type Recommendation, type RecommendationBatch, type KiroTask, type RecommendationEvidence } from './recommendation-generator.js';
export { VerificationService, type VerificationResult, type VerificationComparison, type AcceptanceCriteriaResult } from './verification-service.js';
export { ShaarAgentOrchestrator, type ShaarReviewResult, type ShaarAgentConfig } from './orchestrator.js';
