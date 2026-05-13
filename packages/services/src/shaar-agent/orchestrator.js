"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShaarAgentOrchestrator = void 0;
const browser_observer_js_1 = require("./browser-observer.js");
const ux_friction_detector_js_1 = require("./ux-friction-detector.js");
const design_evaluator_js_1 = require("./design-evaluator.js");
const data_truth_auditor_js_1 = require("./data-truth-auditor.js");
const agentic_visibility_auditor_js_1 = require("./agentic-visibility-auditor.js");
const revenue_workflow_auditor_js_1 = require("./revenue-workflow-auditor.js");
const readiness_score_js_1 = require("./readiness-score.js");
const recommendation_generator_js_1 = require("./recommendation-generator.js");
const verification_service_js_1 = require("./verification-service.js");
class ShaarAgentOrchestrator {
    observer;
    frictionDetector;
    designEvaluator;
    dataTruthAuditor;
    agenticAuditor;
    revenueAuditor;
    readinessCalculator;
    recommendationGenerator;
    verificationService;
    observerReady;
    constructor(config) {
        // Default to BrowserObserver; replaced by PlaywrightObserver once loaded
        this.observer = new browser_observer_js_1.BrowserObserver({
            dashboardUrl: config.dashboardUrl,
            s3Bucket: config.s3Bucket,
        });
        if (config.usePlaywright) {
            this.observerReady = import('./playwright-observer.js').then(({ PlaywrightObserver: PW }) => {
                this.observer = new PW({
                    dashboardUrl: config.dashboardUrl,
                    s3Bucket: config.s3Bucket,
                    screenshotDir: config.screenshotDir,
                });
            });
        }
        else {
            this.observerReady = Promise.resolve();
        }
        this.frictionDetector = new ux_friction_detector_js_1.UXFrictionDetector();
        this.designEvaluator = new design_evaluator_js_1.DesignEvaluator();
        this.dataTruthAuditor = new data_truth_auditor_js_1.DataTruthAuditor();
        this.agenticAuditor = new agentic_visibility_auditor_js_1.AgenticVisibilityAuditor();
        this.revenueAuditor = new revenue_workflow_auditor_js_1.RevenueWorkflowAuditor();
        this.readinessCalculator = new readiness_score_js_1.ReadinessScoreCalculator();
        this.recommendationGenerator = new recommendation_generator_js_1.RecommendationGenerator();
        this.verificationService = new verification_service_js_1.VerificationService(config.dashboardUrl);
    }
    /**
     * Perform a complete review of a single page.
     */
    async reviewPage(path = '/') {
        // Ensure the observer is ready (handles async Playwright loading)
        await this.observerReady;
        // 1. Observe the page
        const observation = await this.observer.observePage(path);
        // 2. Run all auditors
        const friction = this.frictionDetector.analyze(observation);
        const design = this.designEvaluator.evaluate(observation);
        const dataTruth = this.dataTruthAuditor.audit(observation);
        const agenticVisibility = this.agenticAuditor.audit(observation);
        const revenueWorkflow = this.revenueAuditor.audit(observation);
        // 3. Calculate readiness score
        const readinessScore = this.readinessCalculator.calculate({
            friction,
            design,
            dataTruth,
            agenticVisibility,
            revenueWorkflow,
        });
        // 4. Generate recommendations
        const recommendations = this.recommendationGenerator.generate({
            friction,
            design,
            dataTruth,
            agenticVisibility,
            revenueWorkflow,
            readinessScore,
        });
        // 5. Generate summary
        const summary = this.generateSummary(readinessScore, recommendations, observation.url);
        return {
            pageUrl: observation.url,
            timestamp: new Date().toISOString(),
            observation,
            friction,
            design,
            dataTruth,
            agenticVisibility,
            revenueWorkflow,
            readinessScore,
            recommendations,
            summary,
        };
    }
    /**
     * Perform a complete review of all dashboard pages.
     */
    async reviewAllPages() {
        await this.observerReady;
        const results = [];
        const pages = await this.observer.getAvailablePages();
        for (const page of pages) {
            try {
                const result = await this.reviewPage(page);
                results.push(result);
            }
            catch (error) {
                console.error(`[ShaarAgent] Failed to review page ${page}: ${error.message}`);
            }
        }
        return results;
    }
    /**
     * Get the current readiness score without running a full review.
     */
    getReadinessScore() {
        const history = this.readinessCalculator.getHistory();
        if (history.scores.length === 0)
            return null;
        // Return the most recent calculation
        return null; // Would need to store last full result
    }
    /**
     * Approve a recommendation and dispatch to Kiro.
     */
    approveAndDispatch(recommendationId) {
        const approved = this.recommendationGenerator.approve(recommendationId);
        if (!approved)
            return { recommendation: null, kiroTask: null };
        const kiroTask = this.recommendationGenerator.dispatchToKiro(recommendationId);
        return { recommendation: approved, kiroTask };
    }
    /**
     * Verify a recommendation after implementation.
     */
    async verifyImplementation(recommendation) {
        return this.verificationService.verify(recommendation);
    }
    /**
     * Get all pending recommendations.
     */
    getPendingRecommendations() {
        return this.recommendationGenerator.getByStatus('pending');
    }
    /**
     * Get all dispatched (in-progress) recommendations.
     */
    getDispatchedRecommendations() {
        return this.recommendationGenerator.getByStatus('dispatched');
    }
    // -------------------------------------------------------------------------
    // Summary Generation
    // -------------------------------------------------------------------------
    generateSummary(readinessScore, recommendations, pageUrl) {
        const lines = [];
        lines.push(`## Shaar Guardian Review: ${pageUrl}`);
        lines.push('');
        lines.push(`**Readiness Score: ${readinessScore.overall}/100 (Grade: ${readinessScore.grade})**`);
        lines.push(`Trend: ${readinessScore.trend} | Points to next grade: ${readinessScore.pointsToNextGrade}`);
        lines.push('');
        // Dimension breakdown
        lines.push('### Dimension Scores');
        for (const dim of readinessScore.dimensions) {
            const statusEmoji = dim.status === 'excellent' ? '✅' : dim.status === 'good' ? '🟢' : dim.status === 'needs-work' ? '🟡' : '🔴';
            lines.push(`${statusEmoji} **${dim.name}**: ${dim.score}/100 — ${dim.summary}`);
        }
        lines.push('');
        // Top recommendations
        if (recommendations.totalCount > 0) {
            lines.push(`### Top Recommendations (${recommendations.totalCount} total, ${recommendations.criticalCount} critical)`);
            for (const rec of recommendations.recommendations.slice(0, 5)) {
                const severityEmoji = rec.severity === 'critical' ? '🚨' : rec.severity === 'high' ? '⚠️' : '💡';
                lines.push(`${severityEmoji} **${rec.title}**`);
                lines.push(`   ${rec.description}`);
                lines.push(`   Effort: ${rec.estimatedEffort} | Impact: +${rec.estimatedImpact} points`);
                lines.push('');
            }
        }
        else {
            lines.push('### No critical recommendations — page is in good shape! 🎉');
        }
        // Top improvements to reach next grade
        if (readinessScore.topImprovements.length > 0) {
            lines.push('### Path to Next Grade');
            for (const imp of readinessScore.topImprovements.slice(0, 3)) {
                lines.push(`${imp.rank}. **${imp.title}** (+${imp.estimatedImpact} pts, ${imp.effort} effort)`);
            }
        }
        return lines.join('\n');
    }
}
exports.ShaarAgentOrchestrator = ShaarAgentOrchestrator;
//# sourceMappingURL=orchestrator.js.map