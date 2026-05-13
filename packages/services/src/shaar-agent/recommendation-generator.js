"use strict";
/**
 * Shaar Agent — Recommendation Generator & Kiro Task Dispatcher
 *
 * Generates structured improvement recommendations with:
 * - Evidence (what was observed)
 * - Acceptance criteria (how to verify the fix)
 * - Implementation guidance (how to fix it)
 * - Priority ranking
 *
 * Converts approved recommendations to Kiro tasks via the Agent-to-Kiro bridge.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationGenerator = void 0;
class RecommendationGenerator {
    recommendations = new Map();
    dispatchedTasks = new Map();
    /**
     * Generate recommendations from all audit reports.
     */
    generate(reports) {
        const recommendations = [];
        let priority = 1;
        // Generate from friction issues
        if (reports.friction) {
            for (const issue of reports.friction.issues.filter(i => i.severity === 'critical' || i.severity === 'high')) {
                recommendations.push(this.fromFrictionIssue(issue, reports.friction.pageUrl, priority++));
            }
        }
        // Generate from design issues
        if (reports.design) {
            for (const issue of reports.design.issues.filter(i => i.severity === 'critical' || i.severity === 'high')) {
                recommendations.push(this.fromDesignIssue(issue, reports.design.pageUrl, priority++));
            }
        }
        // Generate from data truth issues
        if (reports.dataTruth) {
            for (const issue of reports.dataTruth.issues.filter(i => i.severity === 'critical' || i.severity === 'high')) {
                recommendations.push(this.fromDataTruthIssue(issue, reports.dataTruth.pageUrl, priority++));
            }
        }
        // Generate from agentic visibility issues
        if (reports.agenticVisibility) {
            for (const issue of reports.agenticVisibility.issues.filter(i => i.severity === 'critical' || i.severity === 'high')) {
                recommendations.push(this.fromAgenticIssue(issue, reports.agenticVisibility.pageUrl, priority++));
            }
        }
        // Generate from revenue workflow issues
        if (reports.revenueWorkflow) {
            for (const issue of reports.revenueWorkflow.issues.filter(i => i.severity === 'critical' || i.severity === 'high')) {
                recommendations.push(this.fromRevenueIssue(issue, reports.revenueWorkflow.pageUrl, priority++));
            }
        }
        // Sort by severity then impact
        recommendations.sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            const sDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (sDiff !== 0)
                return sDiff;
            return b.estimatedImpact - a.estimatedImpact;
        });
        // Re-assign priorities after sorting
        recommendations.forEach((r, i) => { r.priority = i + 1; });
        // Store recommendations
        for (const rec of recommendations) {
            this.recommendations.set(rec.id, rec);
        }
        return {
            timestamp: new Date().toISOString(),
            readinessScore: reports.readinessScore?.overall || 0,
            recommendations,
            totalCount: recommendations.length,
            criticalCount: recommendations.filter(r => r.severity === 'critical').length,
            highCount: recommendations.filter(r => r.severity === 'high').length,
        };
    }
    /**
     * Approve a recommendation for dispatch to Kiro.
     */
    approve(recommendationId) {
        const rec = this.recommendations.get(recommendationId);
        if (!rec)
            return null;
        rec.status = 'approved';
        rec.approvedAt = new Date().toISOString();
        return rec;
    }
    /**
     * Convert an approved recommendation to a Kiro task and dispatch it.
     */
    dispatchToKiro(recommendationId) {
        const rec = this.recommendations.get(recommendationId);
        if (!rec || rec.status !== 'approved')
            return null;
        const task = this.convertToKiroTask(rec);
        rec.status = 'dispatched';
        rec.kiroTaskId = `kiro-${rec.id}`;
        this.dispatchedTasks.set(rec.kiroTaskId, task);
        return task;
    }
    /**
     * Mark a recommendation as implemented.
     */
    markImplemented(recommendationId) {
        const rec = this.recommendations.get(recommendationId);
        if (rec) {
            rec.status = 'implemented';
            rec.implementedAt = new Date().toISOString();
        }
    }
    /**
     * Mark a recommendation as verified (post-implementation check passed).
     */
    markVerified(recommendationId) {
        const rec = this.recommendations.get(recommendationId);
        if (rec) {
            rec.status = 'verified';
            rec.verifiedAt = new Date().toISOString();
        }
    }
    /**
     * Get all recommendations.
     */
    getAll() {
        return [...this.recommendations.values()];
    }
    /**
     * Get recommendations by status.
     */
    getByStatus(status) {
        return [...this.recommendations.values()].filter(r => r.status === status);
    }
    // -------------------------------------------------------------------------
    // Converters
    // -------------------------------------------------------------------------
    fromFrictionIssue(issue, pageUrl, priority) {
        return {
            id: `rec-friction-${issue.id}`,
            priority,
            title: issue.description,
            description: issue.recommendation,
            category: issue.category,
            dimension: 'UX Quality',
            severity: issue.severity,
            evidence: {
                pageUrl,
                observation: issue.evidence,
                elementSelector: issue.element,
                beforeState: `Friction issue: ${issue.description}`,
            },
            acceptanceCriteria: [
                `The ${issue.category} issue is resolved`,
                `No regression in surrounding UX`,
                `Page passes re-audit without this issue`,
            ],
            implementationGuidance: [
                issue.recommendation,
                `Target element: ${issue.element || 'See evidence'}`,
                `Category: ${issue.category}`,
            ],
            estimatedEffort: issue.impactScore > 70 ? 'high' : issue.impactScore > 40 ? 'medium' : 'low',
            estimatedImpact: Math.round(issue.impactScore / 10),
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
    }
    fromDesignIssue(issue, pageUrl, priority) {
        return {
            id: `rec-design-${issue.id}`,
            priority,
            title: issue.description,
            description: `${issue.recommendation} (Design principle: ${issue.designPrinciple})`,
            category: issue.category,
            dimension: 'Visual Design',
            severity: issue.severity,
            evidence: {
                pageUrl,
                observation: issue.evidence,
                beforeState: `Design issue: ${issue.description}`,
            },
            acceptanceCriteria: [
                `Design principle "${issue.designPrinciple}" is satisfied`,
                `Visual quality improved`,
                `No regression in other design dimensions`,
            ],
            implementationGuidance: [
                issue.recommendation,
                `Design principle: ${issue.designPrinciple}`,
                `Category: ${issue.category}`,
            ],
            estimatedEffort: issue.impactScore > 60 ? 'medium' : 'low',
            estimatedImpact: Math.round(issue.impactScore / 10),
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
    }
    fromDataTruthIssue(issue, pageUrl, priority) {
        return {
            id: `rec-data-${issue.id}`,
            priority,
            title: issue.description,
            description: issue.recommendation,
            category: issue.category,
            dimension: 'Data Truth',
            severity: issue.severity,
            evidence: {
                pageUrl,
                observation: issue.evidence,
                elementSelector: issue.element,
                beforeState: `Data truth issue: ${issue.description}`,
            },
            acceptanceCriteria: [
                `Data is sourced from real backend services`,
                `No mock/placeholder data visible`,
                `Data freshness is within acceptable range`,
            ],
            implementationGuidance: [
                issue.recommendation,
                `Connect to real data source`,
                `Add "last updated" indicator if data is not real-time`,
            ],
            estimatedEffort: issue.impactScore > 70 ? 'high' : 'medium',
            estimatedImpact: Math.round(issue.impactScore / 10),
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
    }
    fromAgenticIssue(issue, pageUrl, priority) {
        return {
            id: `rec-agentic-${issue.id}`,
            priority,
            title: issue.description,
            description: issue.recommendation,
            category: issue.category,
            dimension: 'Agentic Visibility',
            severity: issue.severity,
            evidence: {
                pageUrl,
                observation: issue.evidence,
                beforeState: `Agentic visibility issue: ${issue.description}`,
            },
            acceptanceCriteria: [
                `Agent screen shows agentic behavior indicators`,
                `Agent does NOT appear as a simple chatbot`,
                `Execution traces, memory, and tools are visible`,
            ],
            implementationGuidance: [
                issue.recommendation,
                `Add execution trace panel showing agent reasoning`,
                `Show memory indicators (what the agent remembers)`,
                `Display tool usage and delegation status`,
            ],
            estimatedEffort: 'medium',
            estimatedImpact: Math.round(issue.impactScore / 10),
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
    }
    fromRevenueIssue(issue, pageUrl, priority) {
        return {
            id: `rec-revenue-${issue.id}`,
            priority,
            title: issue.description,
            description: issue.recommendation,
            category: issue.category,
            dimension: 'Revenue Workflow',
            severity: issue.severity,
            evidence: {
                pageUrl,
                observation: issue.evidence,
                beforeState: `Revenue workflow issue: ${issue.description}`,
            },
            acceptanceCriteria: [
                `Revenue workflow step is functional`,
                `Screen helps the King make money or make decisions`,
                `Revenue metrics are visible and connected to real data`,
            ],
            implementationGuidance: [
                issue.recommendation,
                `Revenue impact: ${issue.revenueImpact}`,
                `Pillar: ${issue.pillar}`,
            ],
            estimatedEffort: issue.revenueImpact === 'blocking' ? 'high' : 'medium',
            estimatedImpact: Math.round(issue.impactScore / 10),
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
    }
    // -------------------------------------------------------------------------
    // Kiro Task Conversion
    // -------------------------------------------------------------------------
    convertToKiroTask(rec) {
        return {
            title: rec.title,
            description: `${rec.description}\n\nEvidence: ${rec.evidence.observation}\nPage: ${rec.evidence.pageUrl}`,
            steps: rec.implementationGuidance,
            acceptanceCriteria: rec.acceptanceCriteria,
            files: this.inferAffectedFiles(rec),
            priority: rec.severity,
            category: rec.dimension,
        };
    }
    inferAffectedFiles(rec) {
        const files = [];
        // Infer files based on dimension and category
        if (rec.dimension === 'Visual Design' || rec.dimension === 'UX Quality') {
            files.push('packages/dashboard/src/styles.css');
            files.push('packages/dashboard/src/views/pillar-views.ts');
        }
        if (rec.dimension === 'Data Truth') {
            files.push('packages/services/src/shaar/production-server.ts');
            files.push('packages/dashboard/src/views/pillar-views.ts');
        }
        if (rec.dimension === 'Agentic Visibility') {
            files.push('packages/dashboard/src/views/pillar-views.ts');
            files.push('packages/dashboard/src/components/');
        }
        if (rec.dimension === 'Revenue Workflow') {
            files.push('packages/dashboard/src/views/pillar-views.ts');
            files.push('packages/app/src/');
        }
        return files;
    }
}
exports.RecommendationGenerator = RecommendationGenerator;
//# sourceMappingURL=recommendation-generator.js.map