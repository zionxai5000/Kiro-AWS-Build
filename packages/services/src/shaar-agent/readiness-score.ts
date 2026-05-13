/**
 * Shaar Agent — Readiness Score Calculator
 *
 * Composite score across all evaluation dimensions:
 * - UX Quality (friction score)
 * - Visual Design (design evaluator score)
 * - Data Truth (data truth auditor score)
 * - Agentic Visibility (agentic auditor score)
 * - Revenue Workflow (revenue auditor score)
 * - Workflow Clarity
 * - Permission Safety
 * - Mobile Responsiveness
 * - Cost Visibility
 *
 * Generates Top 5 improvements to reach next threshold.
 */

import type { FrictionReport } from './ux-friction-detector.js';
import type { DesignReport } from './design-evaluator.js';
import type { DataTruthReport } from './data-truth-auditor.js';
import type { AgenticVisibilityReport } from './agentic-visibility-auditor.js';
import type { RevenueWorkflowReport } from './revenue-workflow-auditor.js';

export interface ReadinessScore {
  overall: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: ReadinessDimension[];
  topImprovements: ReadinessImprovement[];
  nextThreshold: number;
  pointsToNextGrade: number;
  trend: 'improving' | 'stable' | 'declining';
  timestamp: string;
}

export interface ReadinessDimension {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1 (how much this contributes to overall)
  status: 'excellent' | 'good' | 'needs-work' | 'critical';
  summary: string;
}

export interface ReadinessImprovement {
  rank: number;
  dimension: string;
  title: string;
  description: string;
  estimatedImpact: number; // Points gained
  effort: 'low' | 'medium' | 'high';
  category: string;
}

export interface ReadinessHistory {
  scores: Array<{ timestamp: string; overall: number; grade: string }>;
  improvements: Array<{ timestamp: string; improvement: string; pointsGained: number }>;
}

export class ReadinessScoreCalculator {
  private history: ReadinessHistory = { scores: [], improvements: [] };

  /**
   * Calculate the composite readiness score from all audit reports.
   */
  calculate(reports: {
    friction?: FrictionReport;
    design?: DesignReport;
    dataTruth?: DataTruthReport;
    agenticVisibility?: AgenticVisibilityReport;
    revenueWorkflow?: RevenueWorkflowReport;
  }): ReadinessScore {
    const dimensions: ReadinessDimension[] = [];

    // 1. UX Quality (from friction detector) — weight: 0.20
    if (reports.friction) {
      const uxScore = Math.max(0, 100 - reports.friction.overallFrictionScore);
      dimensions.push({
        name: 'UX Quality',
        score: uxScore,
        weight: 0.20,
        status: this.getStatus(uxScore),
        summary: `${reports.friction.totalIssues} friction issues found (${reports.friction.criticalCount} critical)`,
      });
    } else {
      dimensions.push({ name: 'UX Quality', score: 50, weight: 0.20, status: 'needs-work', summary: 'Not yet audited' });
    }

    // 2. Visual Design (from design evaluator) — weight: 0.15
    if (reports.design) {
      dimensions.push({
        name: 'Visual Design',
        score: reports.design.overallDesignScore,
        weight: 0.15,
        status: this.getStatus(reports.design.overallDesignScore),
        summary: `${reports.design.issues.length} design issues, ${reports.design.strengths.length} strengths identified`,
      });
    } else {
      dimensions.push({ name: 'Visual Design', score: 50, weight: 0.15, status: 'needs-work', summary: 'Not yet audited' });
    }

    // 3. Data Truth (from data truth auditor) — weight: 0.20
    if (reports.dataTruth) {
      dimensions.push({
        name: 'Data Truth',
        score: reports.dataTruth.overallTruthScore,
        weight: 0.20,
        status: this.getStatus(reports.dataTruth.overallTruthScore),
        summary: `${reports.dataTruth.mockDataCount} mock data, ${reports.dataTruth.placeholderCount} placeholders, ${reports.dataTruth.disconnectedCount} disconnected`,
      });
    } else {
      dimensions.push({ name: 'Data Truth', score: 50, weight: 0.20, status: 'needs-work', summary: 'Not yet audited' });
    }

    // 4. Agentic Visibility (from agentic auditor) — weight: 0.20
    if (reports.agenticVisibility) {
      dimensions.push({
        name: 'Agentic Visibility',
        score: reports.agenticVisibility.overallVisibilityScore,
        weight: 0.20,
        status: this.getStatus(reports.agenticVisibility.overallVisibilityScore),
        summary: reports.agenticVisibility.isChatbotLike
          ? 'CRITICAL: Agent appears as simple chatbot'
          : `${reports.agenticVisibility.presentIndicators.length}/${reports.agenticVisibility.presentIndicators.length + reports.agenticVisibility.missingIndicators.length} agentic features visible`,
      });
    } else {
      dimensions.push({ name: 'Agentic Visibility', score: 50, weight: 0.20, status: 'needs-work', summary: 'Not yet audited' });
    }

    // 5. Revenue Workflow (from revenue auditor) — weight: 0.25
    if (reports.revenueWorkflow) {
      dimensions.push({
        name: 'Revenue Workflow',
        score: reports.revenueWorkflow.overallRevenueScore,
        weight: 0.25,
        status: this.getStatus(reports.revenueWorkflow.overallRevenueScore),
        summary: `Money-making capability: ${reports.revenueWorkflow.moneyMakingCapability}. ${reports.revenueWorkflow.revenueMetricsMissing.length} metrics missing.`,
      });
    } else {
      dimensions.push({ name: 'Revenue Workflow', score: 50, weight: 0.25, status: 'needs-work', summary: 'Not yet audited' });
    }

    // Calculate weighted overall score
    const overall = Math.round(
      dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
    );

    // Determine grade
    const grade = this.getGrade(overall);

    // Calculate next threshold
    const thresholds = [90, 80, 70, 60, 50];
    const nextThreshold = thresholds.find(t => t > overall) || 100;
    const pointsToNextGrade = nextThreshold - overall;

    // Generate top improvements
    const topImprovements = this.generateTopImprovements(dimensions, reports);

    // Determine trend
    const trend = this.calculateTrend(overall);

    // Store in history
    const timestamp = new Date().toISOString();
    this.history.scores.push({ timestamp, overall, grade });

    return {
      overall,
      grade,
      dimensions,
      topImprovements,
      nextThreshold,
      pointsToNextGrade,
      trend,
      timestamp,
    };
  }

  /**
   * Get historical readiness scores.
   */
  getHistory(): ReadinessHistory {
    return this.history;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getStatus(score: number): 'excellent' | 'good' | 'needs-work' | 'critical' {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needs-work';
    return 'critical';
  }

  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private calculateTrend(currentScore: number): 'improving' | 'stable' | 'declining' {
    if (this.history.scores.length < 2) return 'stable';
    const previous = this.history.scores[this.history.scores.length - 1].overall;
    if (currentScore > previous + 2) return 'improving';
    if (currentScore < previous - 2) return 'declining';
    return 'stable';
  }

  private generateTopImprovements(
    dimensions: ReadinessDimension[],
    reports: {
      friction?: FrictionReport;
      design?: DesignReport;
      dataTruth?: DataTruthReport;
      agenticVisibility?: AgenticVisibilityReport;
      revenueWorkflow?: RevenueWorkflowReport;
    },
  ): ReadinessImprovement[] {
    const improvements: ReadinessImprovement[] = [];

    // Sort dimensions by score (lowest first) — these need the most work
    const sorted = [...dimensions].sort((a, b) => a.score - b.score);

    for (const dim of sorted.slice(0, 5)) {
      const improvement = this.getImprovementForDimension(dim, reports);
      if (improvement) {
        improvements.push({ ...improvement, rank: improvements.length + 1 });
      }
    }

    return improvements;
  }

  private getImprovementForDimension(
    dimension: ReadinessDimension,
    reports: {
      friction?: FrictionReport;
      design?: DesignReport;
      dataTruth?: DataTruthReport;
      agenticVisibility?: AgenticVisibilityReport;
      revenueWorkflow?: RevenueWorkflowReport;
    },
  ): Omit<ReadinessImprovement, 'rank'> | null {
    switch (dimension.name) {
      case 'UX Quality':
        if (reports.friction && reports.friction.issues.length > 0) {
          const topIssue = reports.friction.issues.sort((a, b) => b.impactScore - a.impactScore)[0];
          return {
            dimension: 'UX Quality',
            title: topIssue.description,
            description: topIssue.recommendation,
            estimatedImpact: Math.round(topIssue.impactScore * dimension.weight / 5),
            effort: topIssue.severity === 'critical' ? 'high' : 'medium',
            category: topIssue.category,
          };
        }
        return { dimension: 'UX Quality', title: 'Run UX friction audit', description: 'Analyze pages for friction patterns', estimatedImpact: 5, effort: 'low', category: 'audit' };

      case 'Visual Design':
        if (reports.design && reports.design.recommendations.length > 0) {
          const topRec = reports.design.recommendations[0];
          return {
            dimension: 'Visual Design',
            title: topRec.title,
            description: topRec.description,
            estimatedImpact: Math.round(50 * dimension.weight / 5),
            effort: topRec.effort,
            category: topRec.category,
          };
        }
        return { dimension: 'Visual Design', title: 'Run design evaluation', description: 'Evaluate visual design quality', estimatedImpact: 5, effort: 'low', category: 'audit' };

      case 'Data Truth':
        if (reports.dataTruth && reports.dataTruth.issues.length > 0) {
          const topIssue = reports.dataTruth.issues.sort((a, b) => b.impactScore - a.impactScore)[0];
          return {
            dimension: 'Data Truth',
            title: topIssue.description,
            description: topIssue.recommendation,
            estimatedImpact: Math.round(topIssue.impactScore * dimension.weight / 5),
            effort: topIssue.severity === 'critical' ? 'high' : 'medium',
            category: topIssue.category,
          };
        }
        return { dimension: 'Data Truth', title: 'Run data truth audit', description: 'Check for mock/stale data', estimatedImpact: 5, effort: 'low', category: 'audit' };

      case 'Agentic Visibility':
        if (reports.agenticVisibility && reports.agenticVisibility.missingIndicators.length > 0) {
          const missing = reports.agenticVisibility.missingIndicators[0];
          return {
            dimension: 'Agentic Visibility',
            title: `Add ${missing} to agent screens`,
            description: `Agent screens are missing ${missing} indicators, making them appear as simple chatbots`,
            estimatedImpact: Math.round(70 * dimension.weight / 5),
            effort: 'medium',
            category: 'agentic-visibility',
          };
        }
        return { dimension: 'Agentic Visibility', title: 'Run agentic visibility audit', description: 'Check agent screens for agentic indicators', estimatedImpact: 5, effort: 'low', category: 'audit' };

      case 'Revenue Workflow':
        if (reports.revenueWorkflow && reports.revenueWorkflow.issues.length > 0) {
          const topIssue = reports.revenueWorkflow.issues.sort((a, b) => b.impactScore - a.impactScore)[0];
          return {
            dimension: 'Revenue Workflow',
            title: topIssue.description,
            description: topIssue.recommendation,
            estimatedImpact: Math.round(topIssue.impactScore * dimension.weight / 5),
            effort: topIssue.revenueImpact === 'blocking' ? 'high' : 'medium',
            category: topIssue.category,
          };
        }
        return { dimension: 'Revenue Workflow', title: 'Run revenue workflow audit', description: 'Check revenue-generating screens', estimatedImpact: 5, effort: 'low', category: 'audit' };

      default:
        return null;
    }
  }
}
