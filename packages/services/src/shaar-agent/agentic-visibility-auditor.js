"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgenticVisibilityAuditor = void 0;
class AgenticVisibilityAuditor {
    /**
     * Audit a page for agentic behavior visibility.
     */
    audit(observation) {
        const issues = [];
        const presentIndicators = [];
        const missingIndicators = [];
        // Check each agentic feature
        const features = this.checkAgenticFeatures(observation);
        // Generate issues for missing features
        issues.push(...this.generateIssues(features, observation));
        // Categorize indicators
        for (const feature of features) {
            if (feature.present) {
                presentIndicators.push(feature.feature);
            }
            else {
                missingIndicators.push(feature.feature);
            }
        }
        // Determine if page looks like a simple chatbot
        const isChatbotLike = this.detectChatbotAppearance(observation, features);
        if (isChatbotLike) {
            issues.push({
                id: 'chatbot-appearance',
                severity: 'critical',
                category: 'chatbot-appearance',
                description: 'Agent screen appears as a simple chatbot without agentic context',
                recommendation: 'Add execution trace panel, memory indicators, tool usage display, and autonomy level to differentiate from a basic chatbot',
                evidence: 'Page has chat interface but lacks agentic behavior indicators (traces, memory, tools, planning)',
                impactScore: 90,
            });
        }
        // Calculate visibility score
        const presentCount = features.filter(f => f.present).length;
        const totalFeatures = features.length;
        const overallVisibilityScore = Math.round((presentCount / totalFeatures) * 100);
        return {
            pageUrl: observation.url,
            timestamp: observation.timestamp,
            overallVisibilityScore,
            isChatbotLike,
            issues,
            presentIndicators,
            missingIndicators,
            agenticFeatures: features,
        };
    }
    // -------------------------------------------------------------------------
    // Feature Checks
    // -------------------------------------------------------------------------
    checkAgenticFeatures(observation) {
        const { html } = observation;
        const features = [];
        // 1. Execution Trace
        const hasExecutionTrace = /execution.?trace|trace.?panel|cognition.?envelope|planning.?step/i.test(html);
        features.push({
            feature: 'Execution Trace',
            present: hasExecutionTrace,
            quality: hasExecutionTrace ? 'good' : 'missing',
            evidence: hasExecutionTrace
                ? 'Found execution trace or cognition envelope indicators'
                : 'No execution trace panel or indicators found',
        });
        // 2. Memory Indicators
        const hasMemory = /memory|zikaron|remember|context.?loaded|episodic|semantic|procedural|working.?memory/i.test(html);
        features.push({
            feature: 'Memory Indicators',
            present: hasMemory,
            quality: hasMemory ? 'partial' : 'missing',
            evidence: hasMemory
                ? 'Found memory-related indicators'
                : 'No memory layer indicators found',
        });
        // 3. Tool Usage Display
        const hasToolUsage = /tool.?us|mcp|function.?call|tool.?registry|available.?tools/i.test(html);
        features.push({
            feature: 'Tool Usage Display',
            present: hasToolUsage,
            quality: hasToolUsage ? 'good' : 'missing',
            evidence: hasToolUsage
                ? 'Found tool usage indicators'
                : 'No tool usage or MCP indicators found',
        });
        // 4. Delegation Status
        const hasDelegation = /delegat|a2a|agent.?to.?agent|assigned.?to|dispatched/i.test(html);
        features.push({
            feature: 'Delegation Status',
            present: hasDelegation,
            quality: hasDelegation ? 'good' : 'missing',
            evidence: hasDelegation
                ? 'Found delegation or A2A indicators'
                : 'No delegation status indicators found',
        });
        // 5. Planning/Reasoning Visibility
        const hasPlanning = /plan|reason|think|cognition|step.?\d|phase|strategy/i.test(html);
        features.push({
            feature: 'Planning Visibility',
            present: hasPlanning,
            quality: hasPlanning ? 'partial' : 'missing',
            evidence: hasPlanning
                ? 'Found planning or reasoning indicators'
                : 'No planning or reasoning visibility found',
        });
        // 6. Autonomy Level
        const hasAutonomy = /autonomy|crawl|walk|run|authority.?level|L[1-4]|permission/i.test(html);
        features.push({
            feature: 'Autonomy Level',
            present: hasAutonomy,
            quality: hasAutonomy ? 'good' : 'missing',
            evidence: hasAutonomy
                ? 'Found autonomy level indicators'
                : 'No autonomy level or authority indicators found',
        });
        // 7. Cost/Token Visibility
        const hasCost = /token|cost|\$\d|budget|usage|spend/i.test(html);
        features.push({
            feature: 'Cost/Token Visibility',
            present: hasCost,
            quality: hasCost ? 'partial' : 'missing',
            evidence: hasCost
                ? 'Found cost or token usage indicators'
                : 'No cost or token usage visibility found',
        });
        // 8. Agent Identity
        const hasIdentity = /identity|role|personality|expertise|hierarchy/i.test(html);
        features.push({
            feature: 'Agent Identity',
            present: hasIdentity,
            quality: hasIdentity ? 'good' : 'missing',
            evidence: hasIdentity
                ? 'Found agent identity indicators'
                : 'No agent identity or role indicators found',
        });
        // 9. State Machine Status
        const hasStateMachine = /state.?machine|current.?state|transition|lifecycle/i.test(html);
        features.push({
            feature: 'State Machine Status',
            present: hasStateMachine,
            quality: hasStateMachine ? 'good' : 'missing',
            evidence: hasStateMachine
                ? 'Found state machine indicators'
                : 'No state machine or lifecycle status found',
        });
        // 10. Governance Compliance
        const hasGovernance = /governance|mishmar|compliance|authority|approved|blocked/i.test(html);
        features.push({
            feature: 'Governance Compliance',
            present: hasGovernance,
            quality: hasGovernance ? 'good' : 'missing',
            evidence: hasGovernance
                ? 'Found governance compliance indicators'
                : 'No governance or compliance indicators found',
        });
        return features;
    }
    generateIssues(features, observation) {
        const issues = [];
        // Only generate issues for agent-related pages (pages with chat or agent content)
        const isAgentPage = /chat|agent|message|conversation/i.test(observation.html);
        if (!isAgentPage)
            return issues;
        const criticalFeatures = ['Execution Trace', 'Memory Indicators', 'Tool Usage Display'];
        const importantFeatures = ['Delegation Status', 'Planning Visibility', 'Autonomy Level'];
        const niceToHave = ['Cost/Token Visibility', 'Agent Identity', 'State Machine Status', 'Governance Compliance'];
        for (const feature of features) {
            if (feature.present)
                continue;
            let severity;
            let impactScore;
            if (criticalFeatures.includes(feature.feature)) {
                severity = 'high';
                impactScore = 75;
            }
            else if (importantFeatures.includes(feature.feature)) {
                severity = 'medium';
                impactScore = 55;
            }
            else {
                severity = 'low';
                impactScore = 35;
            }
            const categoryMap = {
                'Execution Trace': 'execution-trace',
                'Memory Indicators': 'memory-indicator',
                'Tool Usage Display': 'tool-usage',
                'Delegation Status': 'delegation-status',
                'Planning Visibility': 'planning-visibility',
                'Autonomy Level': 'autonomy-level',
                'Cost/Token Visibility': 'cost-visibility',
                'Agent Identity': 'chatbot-appearance',
                'State Machine Status': 'chatbot-appearance',
                'Governance Compliance': 'chatbot-appearance',
            };
            issues.push({
                id: `missing-${feature.feature.toLowerCase().replace(/\s+/g, '-')}`,
                severity,
                category: categoryMap[feature.feature] || 'chatbot-appearance',
                description: `Missing ${feature.feature} on agent screen`,
                recommendation: `Add ${feature.feature.toLowerCase()} display to differentiate from a basic chatbot`,
                evidence: feature.evidence,
                impactScore,
            });
        }
        return issues;
    }
    detectChatbotAppearance(observation, features) {
        const { html } = observation;
        // Check if this is an agent/chat page
        const isChatPage = /chat|message|conversation/i.test(html);
        if (!isChatPage)
            return false;
        // Count how many agentic features are present
        const presentCount = features.filter(f => f.present).length;
        const criticalPresent = features.filter(f => f.present && ['Execution Trace', 'Memory Indicators', 'Tool Usage Display'].includes(f.feature)).length;
        // If it's a chat page with fewer than 3 agentic features, it looks like a chatbot
        return presentCount < 3 && criticalPresent < 2;
    }
}
exports.AgenticVisibilityAuditor = AgenticVisibilityAuditor;
//# sourceMappingURL=agentic-visibility-auditor.js.map