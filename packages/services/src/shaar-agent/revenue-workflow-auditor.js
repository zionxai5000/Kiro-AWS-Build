"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueWorkflowAuditor = void 0;
class RevenueWorkflowAuditor {
    /**
     * Audit a page for revenue workflow effectiveness.
     */
    audit(observation) {
        const pillar = this.detectPillar(observation);
        const issues = [];
        const workflowChecks = [];
        // Run pillar-specific audits
        switch (pillar) {
            case 'zionx':
                issues.push(...this.auditZionX(observation));
                workflowChecks.push(...this.checkZionXWorkflows(observation));
                break;
            case 'zxmg':
                issues.push(...this.auditZXMG(observation));
                workflowChecks.push(...this.checkZXMGWorkflows(observation));
                break;
            case 'alpha':
                issues.push(...this.auditZionAlpha(observation));
                workflowChecks.push(...this.checkAlphaWorkflows(observation));
                break;
            case 'eretz':
                issues.push(...this.auditEretz(observation));
                workflowChecks.push(...this.checkEretzWorkflows(observation));
                break;
            default:
                issues.push(...this.auditGeneral(observation));
                break;
        }
        // Check revenue metrics
        const { present, missing } = this.checkRevenueMetrics(observation, pillar);
        // Calculate revenue score
        const workflowScore = workflowChecks.length > 0
            ? workflowChecks.reduce((sum, w) => sum + w.completeness, 0) / workflowChecks.length
            : 50;
        const metricScore = present.length > 0
            ? (present.length / (present.length + missing.length)) * 100
            : 0;
        const issuePenalty = Math.min(40, issues.filter(i => i.severity === 'critical' || i.severity === 'high').length * 10);
        const overallRevenueScore = Math.max(0, Math.round((workflowScore + metricScore) / 2 - issuePenalty));
        // Determine money-making capability
        let moneyMakingCapability;
        if (overallRevenueScore >= 75)
            moneyMakingCapability = 'strong';
        else if (overallRevenueScore >= 50)
            moneyMakingCapability = 'partial';
        else if (overallRevenueScore >= 25)
            moneyMakingCapability = 'weak';
        else
            moneyMakingCapability = 'none';
        return {
            pageUrl: observation.url,
            timestamp: observation.timestamp,
            pillar,
            overallRevenueScore,
            issues,
            workflowCompleteness: workflowChecks,
            revenueMetricsPresent: present,
            revenueMetricsMissing: missing,
            moneyMakingCapability,
        };
    }
    // -------------------------------------------------------------------------
    // Pillar Detection
    // -------------------------------------------------------------------------
    detectPillar(observation) {
        const { url, html } = observation;
        if (/zionx|app.?factory|pipeline/i.test(url) || /zionx|app.?factory/i.test(html))
            return 'zionx';
        if (/zxmg|media|video/i.test(url) || /zxmg|media.?production/i.test(html))
            return 'zxmg';
        if (/alpha|trading|position/i.test(url) || /zion.?alpha|trading/i.test(html))
            return 'alpha';
        if (/eretz|portfolio|business/i.test(url) || /eretz|portfolio/i.test(html))
            return 'eretz';
        return 'general';
    }
    // -------------------------------------------------------------------------
    // ZionX Audit (App Factory)
    // -------------------------------------------------------------------------
    auditZionX(observation) {
        const issues = [];
        const { html } = observation;
        // Check for app store submission workflow
        if (!/submit|submission|app.?store|google.?play/i.test(html)) {
            issues.push({
                id: 'zionx-no-submission',
                severity: 'high',
                category: 'missing-workflow',
                pillar: 'zionx',
                description: 'No app store submission workflow visible',
                recommendation: 'Add clear submission pipeline with status tracking',
                evidence: 'No submission/app store/google play references found',
                revenueImpact: 'blocking',
                impactScore: 80,
            });
        }
        // Check for revenue/monetization tracking
        if (!/revenue|monetiz|subscription|in.?app.?purchase|IAP/i.test(html)) {
            issues.push({
                id: 'zionx-no-revenue-tracking',
                severity: 'high',
                category: 'no-revenue-metrics',
                pillar: 'zionx',
                description: 'No revenue or monetization tracking visible',
                recommendation: 'Add MRR, subscription count, and revenue per app metrics',
                evidence: 'No revenue/monetization/subscription references found',
                revenueImpact: 'direct',
                impactScore: 75,
            });
        }
        // Check for screenshot/preview capability
        if (!/screenshot|preview|mockup|store.?listing/i.test(html)) {
            issues.push({
                id: 'zionx-no-preview',
                severity: 'medium',
                category: 'incomplete-pipeline',
                pillar: 'zionx',
                description: 'No app preview or screenshot management visible',
                recommendation: 'Add screenshot preview and store listing management',
                evidence: 'No screenshot/preview/mockup references found',
                revenueImpact: 'indirect',
                impactScore: 55,
            });
        }
        return issues;
    }
    checkZionXWorkflows(observation) {
        const { html } = observation;
        const workflows = [{
                workflow: 'App-to-Revenue Pipeline',
                steps: [
                    { name: 'Ideation', present: /idea|concept/i.test(html), functional: true, evidence: '' },
                    { name: 'Development', present: /develop|build|code/i.test(html), functional: true, evidence: '' },
                    { name: 'Testing', present: /test|QA|quality/i.test(html), functional: true, evidence: '' },
                    { name: 'Store Submission', present: /submit|submission/i.test(html), functional: true, evidence: '' },
                    { name: 'Marketing', present: /market|ads|campaign/i.test(html), functional: true, evidence: '' },
                    { name: 'Revenue Tracking', present: /revenue|MRR|income/i.test(html), functional: true, evidence: '' },
                ],
                completeness: 0,
                blockers: [],
            }];
        for (const wf of workflows) {
            wf.completeness = Math.round((wf.steps.filter(s => s.present).length / wf.steps.length) * 100);
            wf.blockers = wf.steps.filter(s => !s.present).map(s => s.name);
        }
        return workflows;
    }
    // -------------------------------------------------------------------------
    // ZXMG Audit (Media Production)
    // -------------------------------------------------------------------------
    auditZXMG(observation) {
        const issues = [];
        const { html } = observation;
        if (!/video|content|production/i.test(html)) {
            issues.push({
                id: 'zxmg-no-production',
                severity: 'high',
                category: 'missing-workflow',
                pillar: 'zxmg',
                description: 'No video/content production workflow visible',
                recommendation: 'Add content production pipeline with status tracking',
                evidence: 'No video/content/production references found',
                revenueImpact: 'blocking',
                impactScore: 75,
            });
        }
        if (!/publish|upload|distribute/i.test(html)) {
            issues.push({
                id: 'zxmg-no-distribution',
                severity: 'high',
                category: 'incomplete-pipeline',
                pillar: 'zxmg',
                description: 'No content distribution/publishing workflow visible',
                recommendation: 'Add multi-platform publishing with scheduling',
                evidence: 'No publish/upload/distribute references found',
                revenueImpact: 'blocking',
                impactScore: 70,
            });
        }
        if (!/analytics|views|engagement|CPM|ad.?revenue/i.test(html)) {
            issues.push({
                id: 'zxmg-no-analytics',
                severity: 'medium',
                category: 'no-revenue-metrics',
                pillar: 'zxmg',
                description: 'No content performance analytics visible',
                recommendation: 'Add views, engagement, CPM, and ad revenue metrics',
                evidence: 'No analytics/views/engagement references found',
                revenueImpact: 'indirect',
                impactScore: 60,
            });
        }
        return issues;
    }
    checkZXMGWorkflows(observation) {
        const { html } = observation;
        const workflows = [{
                workflow: 'Content-to-Revenue Pipeline',
                steps: [
                    { name: 'Content Planning', present: /plan|schedule|calendar/i.test(html), functional: true, evidence: '' },
                    { name: 'Video Production', present: /video|production|generate/i.test(html), functional: true, evidence: '' },
                    { name: 'Thumbnail/Assets', present: /thumbnail|asset|image/i.test(html), functional: true, evidence: '' },
                    { name: 'Publishing', present: /publish|upload|post/i.test(html), functional: true, evidence: '' },
                    { name: 'Distribution', present: /distribut|platform|channel/i.test(html), functional: true, evidence: '' },
                    { name: 'Monetization', present: /monetiz|revenue|ad.?revenue|CPM/i.test(html), functional: true, evidence: '' },
                ],
                completeness: 0,
                blockers: [],
            }];
        for (const wf of workflows) {
            wf.completeness = Math.round((wf.steps.filter(s => s.present).length / wf.steps.length) * 100);
            wf.blockers = wf.steps.filter(s => !s.present).map(s => s.name);
        }
        return workflows;
    }
    // -------------------------------------------------------------------------
    // Zion Alpha Audit (Trading)
    // -------------------------------------------------------------------------
    auditZionAlpha(observation) {
        const issues = [];
        const { html } = observation;
        if (!/position|portfolio|holding/i.test(html)) {
            issues.push({
                id: 'alpha-no-positions',
                severity: 'high',
                category: 'missing-workflow',
                pillar: 'alpha',
                description: 'No position/portfolio tracking visible',
                recommendation: 'Add real-time position tracking with P&L',
                evidence: 'No position/portfolio/holding references found',
                revenueImpact: 'direct',
                impactScore: 80,
            });
        }
        if (!/risk|stop.?loss|max.?loss|drawdown/i.test(html)) {
            issues.push({
                id: 'alpha-no-risk',
                severity: 'critical',
                category: 'blocked-action',
                pillar: 'alpha',
                description: 'No risk management controls visible',
                recommendation: 'Add risk limits, stop-loss, and drawdown indicators',
                evidence: 'No risk/stop-loss/max-loss references found',
                revenueImpact: 'blocking',
                impactScore: 90,
            });
        }
        if (!/P&?L|profit|loss|return/i.test(html)) {
            issues.push({
                id: 'alpha-no-pnl',
                severity: 'high',
                category: 'no-revenue-metrics',
                pillar: 'alpha',
                description: 'No P&L or return metrics visible',
                recommendation: 'Add daily/weekly/monthly P&L with win rate',
                evidence: 'No P&L/profit/loss/return references found',
                revenueImpact: 'direct',
                impactScore: 75,
            });
        }
        return issues;
    }
    checkAlphaWorkflows(observation) {
        const { html } = observation;
        const workflows = [{
                workflow: 'Trading Pipeline',
                steps: [
                    { name: 'Market Analysis', present: /market|analysis|signal/i.test(html), functional: true, evidence: '' },
                    { name: 'Position Entry', present: /entry|buy|trade|order/i.test(html), functional: true, evidence: '' },
                    { name: 'Risk Management', present: /risk|stop|limit/i.test(html), functional: true, evidence: '' },
                    { name: 'Position Monitoring', present: /monitor|track|position/i.test(html), functional: true, evidence: '' },
                    { name: 'Exit/Close', present: /exit|close|sell/i.test(html), functional: true, evidence: '' },
                    { name: 'P&L Reporting', present: /P&?L|profit|return|performance/i.test(html), functional: true, evidence: '' },
                ],
                completeness: 0,
                blockers: [],
            }];
        for (const wf of workflows) {
            wf.completeness = Math.round((wf.steps.filter(s => s.present).length / wf.steps.length) * 100);
            wf.blockers = wf.steps.filter(s => !s.present).map(s => s.name);
        }
        return workflows;
    }
    // -------------------------------------------------------------------------
    // Eretz Audit (Business Portfolio)
    // -------------------------------------------------------------------------
    auditEretz(observation) {
        const issues = [];
        const { html } = observation;
        if (!/MRR|revenue|income|portfolio.?value/i.test(html)) {
            issues.push({
                id: 'eretz-no-revenue',
                severity: 'high',
                category: 'no-revenue-metrics',
                pillar: 'eretz',
                description: 'No portfolio revenue metrics visible',
                recommendation: 'Add total MRR, per-subsidiary revenue, and growth rate',
                evidence: 'No MRR/revenue/income references found',
                revenueImpact: 'direct',
                impactScore: 80,
            });
        }
        if (!/synerg|cross.?promot|opportunity/i.test(html)) {
            issues.push({
                id: 'eretz-no-synergies',
                severity: 'medium',
                category: 'missing-automation',
                pillar: 'eretz',
                description: 'No cross-subsidiary synergy tracking visible',
                recommendation: 'Add synergy opportunities and cross-promotion effectiveness',
                evidence: 'No synergy/cross-promotion references found',
                revenueImpact: 'indirect',
                impactScore: 55,
            });
        }
        return issues;
    }
    checkEretzWorkflows(observation) {
        const { html } = observation;
        const workflows = [{
                workflow: 'Portfolio Management',
                steps: [
                    { name: 'Revenue Overview', present: /revenue|MRR|income/i.test(html), functional: true, evidence: '' },
                    { name: 'Subsidiary Status', present: /subsidiary|pillar|agent/i.test(html), functional: true, evidence: '' },
                    { name: 'Resource Allocation', present: /allocat|budget|resource/i.test(html), functional: true, evidence: '' },
                    { name: 'Growth Tracking', present: /growth|trend|trajectory/i.test(html), functional: true, evidence: '' },
                    { name: 'Synergy Detection', present: /synerg|cross|opportunity/i.test(html), functional: true, evidence: '' },
                ],
                completeness: 0,
                blockers: [],
            }];
        for (const wf of workflows) {
            wf.completeness = Math.round((wf.steps.filter(s => s.present).length / wf.steps.length) * 100);
            wf.blockers = wf.steps.filter(s => !s.present).map(s => s.name);
        }
        return workflows;
    }
    // -------------------------------------------------------------------------
    // General Audit
    // -------------------------------------------------------------------------
    auditGeneral(observation) {
        const issues = [];
        const { html } = observation;
        // Check if page has any revenue-related content
        if (!/revenue|money|profit|income|MRR|subscription|payment/i.test(html)) {
            issues.push({
                id: 'general-no-revenue-context',
                severity: 'low',
                category: 'poor-visibility',
                pillar: 'general',
                description: 'Page has no revenue context — unclear how it helps make money',
                recommendation: 'Add revenue impact indicators or link to revenue-generating workflows',
                evidence: 'No revenue-related terms found on page',
                revenueImpact: 'indirect',
                impactScore: 30,
            });
        }
        return issues;
    }
    // -------------------------------------------------------------------------
    // Revenue Metrics Check
    // -------------------------------------------------------------------------
    checkRevenueMetrics(observation, pillar) {
        const { html } = observation;
        const present = [];
        const missing = [];
        const metrics = {
            'MRR': /MRR|monthly.?recurring/i,
            'Revenue': /revenue|\$\d/i,
            'Growth Rate': /growth.?rate|%.*growth/i,
            'Customer Count': /customer|subscriber|user.?count/i,
            'Conversion Rate': /conversion|convert/i,
            'Cost': /cost|spend|expense/i,
            'Profit Margin': /margin|profit/i,
            'ROI': /ROI|return.?on/i,
        };
        // Add pillar-specific metrics
        if (pillar === 'alpha') {
            Object.assign(metrics, {
                'P&L': /P&?L|profit.?loss/i,
                'Win Rate': /win.?rate/i,
                'Sharpe Ratio': /sharpe/i,
                'Max Drawdown': /drawdown/i,
            });
        }
        for (const [name, pattern] of Object.entries(metrics)) {
            if (pattern.test(html)) {
                present.push(name);
            }
            else {
                missing.push(name);
            }
        }
        return { present, missing };
    }
}
exports.RevenueWorkflowAuditor = RevenueWorkflowAuditor;
//# sourceMappingURL=revenue-workflow-auditor.js.map