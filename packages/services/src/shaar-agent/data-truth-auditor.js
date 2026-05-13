"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTruthAuditor = void 0;
class DataTruthAuditor {
    /**
     * Audit a page for data truth.
     */
    audit(observation) {
        const issues = [];
        const metrics = [];
        // Run all auditors
        issues.push(...this.detectMockData(observation));
        issues.push(...this.detectPlaceholders(observation));
        issues.push(...this.detectStaleData(observation));
        issues.push(...this.detectDisconnectedData(observation));
        issues.push(...this.detectHardcodedValues(observation));
        issues.push(...this.detectTestData(observation));
        // Audit individual metrics
        metrics.push(...this.auditMetrics(observation));
        const mockDataCount = issues.filter(i => i.category === 'mock-data').length;
        const placeholderCount = issues.filter(i => i.category === 'placeholder').length;
        const staleDataCount = issues.filter(i => i.category === 'stale-data').length;
        const disconnectedCount = issues.filter(i => i.category === 'disconnected').length;
        // Calculate truth score
        const realMetrics = metrics.filter(m => m.isReal).length;
        const totalMetrics = metrics.length;
        const metricTruthRatio = totalMetrics > 0 ? realMetrics / totalMetrics : 1;
        const issuePenalty = Math.min(50, issues.length * 5);
        const overallTruthScore = Math.max(0, Math.round(metricTruthRatio * 100 - issuePenalty));
        return {
            pageUrl: observation.url,
            timestamp: observation.timestamp,
            overallTruthScore,
            totalIssues: issues.length,
            mockDataCount,
            placeholderCount,
            staleDataCount,
            disconnectedCount,
            issues,
            metrics,
        };
    }
    // -------------------------------------------------------------------------
    // Detectors
    // -------------------------------------------------------------------------
    detectMockData(observation) {
        const issues = [];
        const { html } = observation;
        // Detect lorem ipsum
        if (/lorem ipsum/i.test(html)) {
            issues.push({
                id: 'mock-lorem-ipsum',
                severity: 'critical',
                category: 'mock-data',
                description: 'Lorem ipsum placeholder text detected',
                evidence: 'Found "lorem ipsum" text in page content',
                recommendation: 'Replace with real content or meaningful placeholder',
                impactScore: 90,
            });
        }
        // Detect common mock data patterns
        const mockPatterns = [
            { pattern: /\btest\s*data\b/gi, name: 'test data label' },
            { pattern: /\bsample\s*(data|text|content)\b/gi, name: 'sample data label' },
            { pattern: /\bplaceholder\b/gi, name: 'placeholder label' },
            { pattern: /\bfoo\b|\bbar\b|\bbaz\b/gi, name: 'foo/bar/baz test values' },
            { pattern: /\bjohn\s*doe\b|\bjane\s*doe\b/gi, name: 'John/Jane Doe test names' },
            { pattern: /example\.com|test\.com/gi, name: 'example/test domain' },
        ];
        for (const { pattern, name } of mockPatterns) {
            if (pattern.test(html)) {
                issues.push({
                    id: `mock-${name.replace(/\s+/g, '-')}`,
                    severity: 'high',
                    category: 'mock-data',
                    description: `Mock data pattern detected: ${name}`,
                    evidence: `Found "${name}" pattern in page content`,
                    recommendation: 'Replace with real data from backend services',
                    impactScore: 75,
                });
            }
        }
        // Detect sequential IDs (1, 2, 3, 4, 5) which often indicate mock data
        const sequentialRegex = />\s*1\s*<[^>]*>\s*2\s*<[^>]*>\s*3\s*<[^>]*>\s*4\s*</;
        if (sequentialRegex.test(html)) {
            issues.push({
                id: 'mock-sequential-ids',
                severity: 'medium',
                category: 'mock-data',
                description: 'Sequential numeric values detected — possible mock data',
                evidence: 'Found sequential numbers (1, 2, 3, 4) in data display',
                recommendation: 'Verify these are real data values, not auto-generated mock IDs',
                impactScore: 50,
            });
        }
        return issues;
    }
    detectPlaceholders(observation) {
        const issues = [];
        const { html } = observation;
        // Detect common placeholder patterns
        const placeholderPatterns = [
            { pattern: />\s*—\s*</g, name: 'em-dash placeholder' },
            { pattern: />\s*N\/A\s*</gi, name: 'N/A value' },
            { pattern: />\s*-{2,}\s*</g, name: 'dashes placeholder' },
            { pattern: />\s*\.\.\.\s*</g, name: 'ellipsis placeholder' },
            { pattern: /coming\s*soon/gi, name: '"Coming soon" text' },
            { pattern: /not\s*available/gi, name: '"Not available" text' },
            { pattern: />\s*0\s*<\/div/g, name: 'zero metric value' },
            { pattern: />\s*\$0(\.00)?\s*</g, name: '$0 revenue value' },
            { pattern: />\s*TBD\s*</gi, name: 'TBD placeholder' },
            { pattern: />\s*TODO\s*</gi, name: 'TODO placeholder' },
        ];
        for (const { pattern, name } of placeholderPatterns) {
            const matches = html.match(pattern);
            if (matches && matches.length > 0) {
                // Don't flag single zero values (might be real), but flag multiple
                if (name === 'zero metric value' && matches.length < 3)
                    continue;
                issues.push({
                    id: `placeholder-${name.replace(/[^a-z0-9]/gi, '-')}`,
                    severity: matches.length > 3 ? 'high' : 'medium',
                    category: 'placeholder',
                    description: `${name} detected (${matches.length} instances)`,
                    evidence: `Found ${matches.length} instances of ${name} in page`,
                    recommendation: 'Connect to real data source or show meaningful empty state',
                    impactScore: matches.length > 3 ? 70 : 50,
                });
            }
        }
        return issues;
    }
    detectStaleData(observation) {
        const issues = [];
        const { html } = observation;
        // Look for timestamps that are old
        const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/g;
        const now = new Date();
        let match;
        while ((match = dateRegex.exec(html)) !== null) {
            try {
                const date = new Date(match[1]);
                const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff > 30 && daysDiff < 3650) { // More than 30 days old, less than 10 years
                    issues.push({
                        id: `stale-date-${match.index}`,
                        severity: daysDiff > 90 ? 'high' : 'medium',
                        category: 'stale-data',
                        description: `Data appears ${Math.round(daysDiff)} days old`,
                        evidence: `Found date "${match[1]}" which is ${Math.round(daysDiff)} days ago`,
                        recommendation: 'Verify data freshness — update or show "last updated" indicator',
                        impactScore: daysDiff > 90 ? 65 : 45,
                    });
                    break; // Only flag once per page
                }
            }
            catch {
                // Invalid date, skip
            }
        }
        // Check for "last updated" indicators showing old times
        const lastUpdatedRegex = /last\s*updated[^<]*(\d+\s*(hours?|days?|weeks?|months?)\s*ago)/gi;
        while ((match = lastUpdatedRegex.exec(html)) !== null) {
            if (/months?|weeks?/i.test(match[1])) {
                issues.push({
                    id: `stale-last-updated-${match.index}`,
                    severity: 'medium',
                    category: 'stale-data',
                    description: `Stale data indicator: "${match[1]}"`,
                    evidence: `Found "last updated ${match[1]}" on page`,
                    recommendation: 'Refresh data or explain why it\'s not updating',
                    impactScore: 55,
                });
            }
        }
        return issues;
    }
    detectDisconnectedData(observation) {
        const issues = [];
        const { html } = observation;
        // Check for "connection error" or "failed to load" messages
        const disconnectedPatterns = [
            /connection\s*error/gi,
            /failed\s*to\s*(load|fetch)/gi,
            /unable\s*to\s*connect/gi,
            /service\s*unavailable/gi,
            /timeout/gi,
            /network\s*error/gi,
        ];
        for (const pattern of disconnectedPatterns) {
            if (pattern.test(html)) {
                issues.push({
                    id: `disconnected-${pattern.source.substring(0, 20)}`,
                    severity: 'critical',
                    category: 'disconnected',
                    description: 'Data source appears disconnected or erroring',
                    evidence: `Found "${pattern.source}" pattern in page content`,
                    recommendation: 'Fix backend connection or show graceful degradation',
                    impactScore: 85,
                });
            }
        }
        // Check for empty data containers (divs with data-related classes but no content)
        const emptyDataRegex = /class="[^"]*(?:chart|graph|metric|data|stats)[^"]*"[^>]*>\s*<\/div>/gi;
        const emptyMatches = html.match(emptyDataRegex);
        if (emptyMatches && emptyMatches.length > 0) {
            issues.push({
                id: 'disconnected-empty-containers',
                severity: 'high',
                category: 'disconnected',
                description: `${emptyMatches.length} empty data containers detected`,
                evidence: `Found ${emptyMatches.length} data-related elements with no content`,
                recommendation: 'Connect to data source or show loading/empty state',
                impactScore: 70,
            });
        }
        return issues;
    }
    detectHardcodedValues(observation) {
        const issues = [];
        const { html } = observation;
        // Detect suspiciously round numbers that might be hardcoded
        const roundNumberRegex = />\s*\$?(1,000|5,000|10,000|100,000|1,000,000)\s*</g;
        const matches = html.match(roundNumberRegex);
        if (matches && matches.length > 2) {
            issues.push({
                id: 'hardcoded-round-numbers',
                severity: 'medium',
                category: 'hardcoded',
                description: 'Multiple suspiciously round numbers — possible hardcoded values',
                evidence: `Found ${matches.length} very round numbers: ${matches.slice(0, 3).join(', ')}`,
                recommendation: 'Verify these values come from real data sources',
                impactScore: 55,
            });
        }
        // Detect percentage values that are all multiples of 10 or 25
        const percentRegex = />\s*(\d+)%\s*</g;
        const percentValues = [];
        let match;
        while ((match = percentRegex.exec(html)) !== null) {
            percentValues.push(parseInt(match[1]));
        }
        if (percentValues.length > 3) {
            const allRound = percentValues.every(v => v % 10 === 0 || v % 25 === 0);
            if (allRound) {
                issues.push({
                    id: 'hardcoded-round-percentages',
                    severity: 'medium',
                    category: 'hardcoded',
                    description: 'All percentage values are round numbers — possible hardcoded data',
                    evidence: `Found percentages: ${percentValues.join('%, ')}% — all multiples of 10 or 25`,
                    recommendation: 'Verify percentages are calculated from real data',
                    impactScore: 50,
                });
            }
        }
        return issues;
    }
    detectTestData(observation) {
        const issues = [];
        const { html } = observation;
        // Detect test/dev environment indicators
        const testPatterns = [
            { pattern: /\[dev\]|\[test\]|\[staging\]/gi, name: 'environment tag' },
            { pattern: /localhost:\d+/gi, name: 'localhost URL' },
            { pattern: /debug\s*mode/gi, name: 'debug mode indicator' },
            { pattern: /mock\s*(api|server|data)/gi, name: 'mock service reference' },
        ];
        for (const { pattern, name } of testPatterns) {
            if (pattern.test(html)) {
                issues.push({
                    id: `test-data-${name.replace(/\s+/g, '-')}`,
                    severity: 'high',
                    category: 'test-data',
                    description: `Test/development indicator found: ${name}`,
                    evidence: `Found "${name}" pattern in production page`,
                    recommendation: 'Remove test/dev indicators from production build',
                    impactScore: 70,
                });
            }
        }
        return issues;
    }
    // -------------------------------------------------------------------------
    // Metric Auditing
    // -------------------------------------------------------------------------
    auditMetrics(observation) {
        const metrics = [];
        const { html } = observation;
        // Find metric cards (common dashboard pattern)
        const metricCardRegex = /class="[^"]*metric[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*label[^"]*"[^>]*>([^<]*)<[\s\S]*?<[^>]*class="[^"]*value[^"]*"[^>]*>([^<]*)</gi;
        let match;
        while ((match = metricCardRegex.exec(html)) !== null) {
            const label = match[1].trim();
            const value = match[2].trim();
            const audit = this.auditSingleMetric(label, value);
            metrics.push(audit);
        }
        // Also look for simpler metric patterns
        const simpleMetricRegex = /metric-label[^>]*>([^<]*)<[\s\S]*?metric-value[^>]*>([^<]*)</gi;
        while ((match = simpleMetricRegex.exec(html)) !== null) {
            const label = match[1].trim();
            const value = match[2].trim();
            // Avoid duplicates
            if (!metrics.some(m => m.label === label)) {
                metrics.push(this.auditSingleMetric(label, value));
            }
        }
        return metrics;
    }
    auditSingleMetric(label, value) {
        // Check if value looks real
        const isPlaceholder = /^[—\-]+$|^N\/A$|^TBD$|^0$|^\$0(\.00)?$/i.test(value);
        const isRoundNumber = /^[\$]?\d+,?000(,000)*$/.test(value.replace(/\s/g, ''));
        const isEmpty = value.trim() === '' || value.trim() === '—';
        if (isEmpty || isPlaceholder) {
            return {
                label,
                value,
                isReal: false,
                confidence: 90,
                reason: 'Value is a placeholder or empty',
            };
        }
        if (isRoundNumber) {
            return {
                label,
                value,
                isReal: false,
                confidence: 60,
                reason: 'Suspiciously round number — may be hardcoded',
            };
        }
        // Value looks real (has decimals, specific numbers, etc.)
        return {
            label,
            value,
            isReal: true,
            confidence: 70,
            reason: 'Value appears to be from a real data source',
        };
    }
}
exports.DataTruthAuditor = DataTruthAuditor;
//# sourceMappingURL=data-truth-auditor.js.map