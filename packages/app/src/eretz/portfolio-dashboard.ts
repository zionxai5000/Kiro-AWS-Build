/**
 * Eretz Portfolio Intelligence Dashboard
 *
 * Aggregates real-time business metrics across all subsidiaries (ZionX, ZXMG,
 * Zion Alpha), detects declining metrics, generates weekly reports, and
 * maintains portfolio-level strategy with resource allocation.
 *
 * Requirements: 29d.13, 29d.14, 29d.15, 29d.16
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService } from '@seraphim/core';
import type {
  Recommendation,
  RecommendationQueue,
  ActionStep,
} from '@seraphim/services/sme/heartbeat-scheduler.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface MetricValue {
  value: number;
  unit: string;
}

export interface PortfolioMetrics {
  totalMRR: number;
  mrrBySubsidiary: Record<string, number>;
  totalGrowthRate: number;
  growthBySubsidiary: Record<string, number>;
  portfolioCAC: number;
  portfolioLTV: number;
  portfolioChurn: number;
  totalMarketingSpend: number;
  portfolioROAS: number;
  tradingPnL: number;
  contentRevenue: number;
  appRevenue: number;
  lastUpdated: Date;
}

export interface SubsidiaryMetrics {
  subsidiary: string;
  mrr: number;
  growthRate: number;
  cac: number;
  ltv: number;
  arpu: number;
  churn: number;
  marketingSpend: number;
  roas: number;
  revenue: number;
  customMetrics: Record<string, MetricValue>;
  benchmarkComparison: Record<string, {
    current: number;
    benchmark: number;
    gap: number;
  }>;
  strategyRecommendation: 'scale' | 'maintain' | 'optimize' | 'deprecate';
  strategyRationale: string;
}

export interface DeclineAlert {
  subsidiary: string;
  metric: string;
  currentValue: number;
  previousValue: number;
  declinePercentage: number;
  threshold: number;
  severity: 'warning' | 'critical';
  interventionPlan: string;
  recommendationId?: string;
}

export interface SubsidiaryReport {
  subsidiary: string;
  metrics: SubsidiaryMetrics;
  targetComparison: Record<string, { actual: number; target: number; gap: number }>;
  benchmarkComparison: Record<string, { actual: number; benchmark: number; gap: number }>;
  highlights: string[];
  concerns: string[];
}

export interface PortfolioReport {
  reportDate: Date;
  subsidiaryReports: SubsidiaryReport[];
  portfolioSummary: {
    totalMRR: number;
    totalGrowthRate: number;
    overallHealth: 'strong' | 'stable' | 'at_risk' | 'critical';
    topPerformer: string;
    bottomPerformer: string;
  };
  recommendations: string[];
}

export interface PortfolioStrategy {
  subsidiaryStrategies: Record<string, {
    strategy: 'scale' | 'maintain' | 'optimize' | 'deprecate';
    rationale: string;
    keyActions: string[];
    resourceAllocation: number;
  }>;
  portfolioThesis: string;
  topPriorities: string[];
  riskFactors: string[];
  lastReviewed: Date;
}

export interface SubsidiaryData {
  subsidiary: string;
  mrr: number;
  previousMrr: number;
  cac: number;
  ltv: number;
  arpu: number;
  churn: number;
  marketingSpend: number;
  roas: number;
  revenue: number;
  customMetrics?: Record<string, MetricValue>;
}

export interface IndustryBenchmarks {
  cac: number;
  ltv: number;
  arpu: number;
  churn: number;
  roas: number;
  growthRate: number;
}

export interface SubsidiaryTarget {
  mrr: number;
  growthRate: number;
  cac: number;
  churn: number;
  roas: number;
}

export interface EretzPortfolioDashboard {
  getPortfolioMetrics(): Promise<PortfolioMetrics>;
  getSubsidiaryMetrics(subsidiary: string): Promise<SubsidiaryMetrics>;
  generateWeeklyReport(): Promise<PortfolioReport>;
  checkDeclineAlerts(): Promise<DeclineAlert[]>;
  getPortfolioStrategy(): Promise<PortfolioStrategy>;
  updateSubsidiaryData(data: SubsidiaryData): void;
  setTargets(subsidiary: string, targets: SubsidiaryTarget): void;
  setBenchmarks(benchmarks: IndustryBenchmarks): void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PortfolioDashboardConfig {
  eventBus: EventBusService;
  recommendationQueue: RecommendationQueue;
}

// ---------------------------------------------------------------------------
// Decline Thresholds
// ---------------------------------------------------------------------------

const DECLINE_THRESHOLDS = {
  mrrDropPercent: 10,   // MRR drop >10% MoM
  churnPercent: 5,      // churn >5%
  roasMinimum: 1.0,     // ROAS <1.0
} as const;

// ---------------------------------------------------------------------------
// Default Industry Benchmarks
// ---------------------------------------------------------------------------

const DEFAULT_BENCHMARKS: IndustryBenchmarks = {
  cac: 50,
  ltv: 500,
  arpu: 15,
  churn: 3,
  roas: 3.0,
  growthRate: 10,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EretzPortfolioDashboardImpl implements EretzPortfolioDashboard {
  private readonly eventBus: EventBusService;
  private readonly recommendationQueue: RecommendationQueue;

  private readonly subsidiaryData = new Map<string, SubsidiaryData>();
  private readonly targets = new Map<string, SubsidiaryTarget>();
  private benchmarks: IndustryBenchmarks = { ...DEFAULT_BENCHMARKS };
  private strategy: PortfolioStrategy | null = null;

  constructor(config: PortfolioDashboardConfig) {
    this.eventBus = config.eventBus;
    this.recommendationQueue = config.recommendationQueue;
  }

  /**
   * Update subsidiary data for metrics aggregation.
   */
  updateSubsidiaryData(data: SubsidiaryData): void {
    this.subsidiaryData.set(data.subsidiary, data);
  }

  /**
   * Set performance targets for a subsidiary.
   */
  setTargets(subsidiary: string, targets: SubsidiaryTarget): void {
    this.targets.set(subsidiary, targets);
  }

  /**
   * Set industry benchmarks for comparison.
   */
  setBenchmarks(benchmarks: IndustryBenchmarks): void {
    this.benchmarks = { ...benchmarks };
  }

  /**
   * Aggregate real-time business metrics across all subsidiaries.
   * Requirement 29d.13
   */
  async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const allData = Array.from(this.subsidiaryData.values());

    const mrrBySubsidiary: Record<string, number> = {};
    const growthBySubsidiary: Record<string, number> = {};
    let totalMRR = 0;
    let totalMarketingSpend = 0;
    let totalRevenue = 0;
    let totalCACWeighted = 0;
    let totalLTVWeighted = 0;
    let totalChurnWeighted = 0;
    let tradingPnL = 0;
    let contentRevenue = 0;
    let appRevenue = 0;

    for (const data of allData) {
      mrrBySubsidiary[data.subsidiary] = data.mrr;
      const growth = data.previousMrr > 0
        ? ((data.mrr - data.previousMrr) / data.previousMrr) * 100
        : 0;
      growthBySubsidiary[data.subsidiary] = growth;
      totalMRR += data.mrr;
      totalMarketingSpend += data.marketingSpend;
      totalRevenue += data.revenue;
      totalCACWeighted += data.cac * data.mrr;
      totalLTVWeighted += data.ltv * data.mrr;
      totalChurnWeighted += data.churn * data.mrr;

      if (data.subsidiary === 'zion_alpha') {
        tradingPnL = data.revenue;
      } else if (data.subsidiary === 'zxmg') {
        contentRevenue = data.revenue;
      } else if (data.subsidiary === 'zionx') {
        appRevenue = data.revenue;
      }
    }

    const totalPreviousMRR = allData.reduce((sum, d) => sum + d.previousMrr, 0);
    const totalGrowthRate = totalPreviousMRR > 0
      ? ((totalMRR - totalPreviousMRR) / totalPreviousMRR) * 100
      : 0;

    const portfolioCAC = totalMRR > 0 ? totalCACWeighted / totalMRR : 0;
    const portfolioLTV = totalMRR > 0 ? totalLTVWeighted / totalMRR : 0;
    const portfolioChurn = totalMRR > 0 ? totalChurnWeighted / totalMRR : 0;
    const portfolioROAS = totalMarketingSpend > 0
      ? totalRevenue / totalMarketingSpend
      : 0;

    const metrics: PortfolioMetrics = {
      totalMRR,
      mrrBySubsidiary,
      totalGrowthRate,
      growthBySubsidiary,
      portfolioCAC,
      portfolioLTV,
      portfolioChurn,
      totalMarketingSpend,
      portfolioROAS,
      tradingPnL,
      contentRevenue,
      appRevenue,
      lastUpdated: new Date(),
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'portfolio.metrics_updated',
      detail: {
        totalMRR,
        totalGrowthRate,
        subsidiaryCount: allData.length,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return metrics;
  }

  /**
   * Get detailed metrics for a specific subsidiary with benchmark comparison
   * and strategy recommendation.
   * Requirement 29d.14
   */
  async getSubsidiaryMetrics(subsidiary: string): Promise<SubsidiaryMetrics> {
    const data = this.subsidiaryData.get(subsidiary);
    if (!data) {
      throw new Error(`No data available for subsidiary: ${subsidiary}`);
    }

    const growthRate = data.previousMrr > 0
      ? ((data.mrr - data.previousMrr) / data.previousMrr) * 100
      : 0;

    const benchmarkComparison: Record<string, { current: number; benchmark: number; gap: number }> = {
      cac: {
        current: data.cac,
        benchmark: this.benchmarks.cac,
        gap: data.cac - this.benchmarks.cac,
      },
      ltv: {
        current: data.ltv,
        benchmark: this.benchmarks.ltv,
        gap: data.ltv - this.benchmarks.ltv,
      },
      arpu: {
        current: data.arpu,
        benchmark: this.benchmarks.arpu,
        gap: data.arpu - this.benchmarks.arpu,
      },
      churn: {
        current: data.churn,
        benchmark: this.benchmarks.churn,
        gap: data.churn - this.benchmarks.churn,
      },
      roas: {
        current: data.roas,
        benchmark: this.benchmarks.roas,
        gap: data.roas - this.benchmarks.roas,
      },
      growthRate: {
        current: growthRate,
        benchmark: this.benchmarks.growthRate,
        gap: growthRate - this.benchmarks.growthRate,
      },
    };

    const { recommendation, rationale } = this.determineStrategy(data, growthRate);

    return {
      subsidiary: data.subsidiary,
      mrr: data.mrr,
      growthRate,
      cac: data.cac,
      ltv: data.ltv,
      arpu: data.arpu,
      churn: data.churn,
      marketingSpend: data.marketingSpend,
      roas: data.roas,
      revenue: data.revenue,
      customMetrics: data.customMetrics ?? {},
      benchmarkComparison,
      strategyRecommendation: recommendation,
      strategyRationale: rationale,
    };
  }

  /**
   * Generate a weekly portfolio intelligence report comparing each subsidiary
   * against targets and industry benchmarks.
   * Requirement 29d.15
   */
  async generateWeeklyReport(): Promise<PortfolioReport> {
    const allData = Array.from(this.subsidiaryData.values());
    const subsidiaryReports: SubsidiaryReport[] = [];

    for (const data of allData) {
      const metrics = await this.getSubsidiaryMetrics(data.subsidiary);
      const target = this.targets.get(data.subsidiary);
      const growthRate = data.previousMrr > 0
        ? ((data.mrr - data.previousMrr) / data.previousMrr) * 100
        : 0;

      const targetComparison: Record<string, { actual: number; target: number; gap: number }> = {};
      if (target) {
        targetComparison.mrr = { actual: data.mrr, target: target.mrr, gap: data.mrr - target.mrr };
        targetComparison.growthRate = { actual: growthRate, target: target.growthRate, gap: growthRate - target.growthRate };
        targetComparison.cac = { actual: data.cac, target: target.cac, gap: data.cac - target.cac };
        targetComparison.churn = { actual: data.churn, target: target.churn, gap: data.churn - target.churn };
        targetComparison.roas = { actual: data.roas, target: target.roas, gap: data.roas - target.roas };
      }

      const benchmarkComp: Record<string, { actual: number; benchmark: number; gap: number }> = {
        cac: { actual: data.cac, benchmark: this.benchmarks.cac, gap: data.cac - this.benchmarks.cac },
        churn: { actual: data.churn, benchmark: this.benchmarks.churn, gap: data.churn - this.benchmarks.churn },
        roas: { actual: data.roas, benchmark: this.benchmarks.roas, gap: data.roas - this.benchmarks.roas },
      };

      const highlights: string[] = [];
      const concerns: string[] = [];

      if (growthRate > this.benchmarks.growthRate) {
        highlights.push(`Growth rate ${growthRate.toFixed(1)}% exceeds benchmark ${this.benchmarks.growthRate}%`);
      }
      if (data.roas > this.benchmarks.roas) {
        highlights.push(`ROAS ${data.roas.toFixed(2)} exceeds benchmark ${this.benchmarks.roas}`);
      }
      if (data.churn > this.benchmarks.churn) {
        concerns.push(`Churn ${data.churn.toFixed(1)}% exceeds benchmark ${this.benchmarks.churn}%`);
      }
      if (data.cac > this.benchmarks.cac) {
        concerns.push(`CAC $${data.cac} exceeds benchmark $${this.benchmarks.cac}`);
      }

      subsidiaryReports.push({
        subsidiary: data.subsidiary,
        metrics,
        targetComparison,
        benchmarkComparison: benchmarkComp,
        highlights,
        concerns,
      });
    }

    const totalMRR = allData.reduce((sum, d) => sum + d.mrr, 0);
    const totalPreviousMRR = allData.reduce((sum, d) => sum + d.previousMrr, 0);
    const totalGrowthRate = totalPreviousMRR > 0
      ? ((totalMRR - totalPreviousMRR) / totalPreviousMRR) * 100
      : 0;

    const sortedByMRR = [...allData].sort((a, b) => b.mrr - a.mrr);
    const topPerformer = sortedByMRR[0]?.subsidiary ?? 'none';
    const bottomPerformer = sortedByMRR[sortedByMRR.length - 1]?.subsidiary ?? 'none';

    const overallHealth = this.assessOverallHealth(totalGrowthRate, allData);

    const recommendations = this.generateReportRecommendations(subsidiaryReports);

    const report: PortfolioReport = {
      reportDate: new Date(),
      subsidiaryReports,
      portfolioSummary: {
        totalMRR,
        totalGrowthRate,
        overallHealth,
        topPerformer,
        bottomPerformer,
      },
      recommendations,
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'portfolio.weekly_report_generated',
      detail: {
        reportDate: report.reportDate.toISOString(),
        subsidiaryCount: subsidiaryReports.length,
        totalMRR,
        overallHealth,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return report;
  }

  /**
   * Detect declining metrics and generate intervention plans.
   * Escalates to Recommendation Queue when thresholds are exceeded.
   * Requirement 29d.16
   */
  async checkDeclineAlerts(): Promise<DeclineAlert[]> {
    const alerts: DeclineAlert[] = [];

    for (const data of this.subsidiaryData.values()) {
      const growthRate = data.previousMrr > 0
        ? ((data.mrr - data.previousMrr) / data.previousMrr) * 100
        : 0;

      // MRR decline >10% MoM
      if (growthRate < -DECLINE_THRESHOLDS.mrrDropPercent) {
        const alert: DeclineAlert = {
          subsidiary: data.subsidiary,
          metric: 'mrr',
          currentValue: data.mrr,
          previousValue: data.previousMrr,
          declinePercentage: Math.abs(growthRate),
          threshold: DECLINE_THRESHOLDS.mrrDropPercent,
          severity: Math.abs(growthRate) > 20 ? 'critical' : 'warning',
          interventionPlan: `Investigate MRR decline in ${data.subsidiary}: review churn drivers, assess product-market fit, evaluate pricing strategy`,
        };
        alerts.push(alert);
      }

      // Churn exceeding threshold
      if (data.churn > DECLINE_THRESHOLDS.churnPercent) {
        const alert: DeclineAlert = {
          subsidiary: data.subsidiary,
          metric: 'churn',
          currentValue: data.churn,
          previousValue: DECLINE_THRESHOLDS.churnPercent,
          declinePercentage: ((data.churn - DECLINE_THRESHOLDS.churnPercent) / DECLINE_THRESHOLDS.churnPercent) * 100,
          threshold: DECLINE_THRESHOLDS.churnPercent,
          severity: data.churn > DECLINE_THRESHOLDS.churnPercent * 2 ? 'critical' : 'warning',
          interventionPlan: `Address high churn in ${data.subsidiary}: analyze exit surveys, improve onboarding, enhance retention features`,
        };
        alerts.push(alert);
      }

      // ROAS below minimum
      if (data.roas < DECLINE_THRESHOLDS.roasMinimum && data.marketingSpend > 0) {
        const alert: DeclineAlert = {
          subsidiary: data.subsidiary,
          metric: 'roas',
          currentValue: data.roas,
          previousValue: DECLINE_THRESHOLDS.roasMinimum,
          declinePercentage: ((DECLINE_THRESHOLDS.roasMinimum - data.roas) / DECLINE_THRESHOLDS.roasMinimum) * 100,
          threshold: DECLINE_THRESHOLDS.roasMinimum,
          severity: data.roas < 0.5 ? 'critical' : 'warning',
          interventionPlan: `Optimize marketing spend in ${data.subsidiary}: pause underperforming campaigns, reallocate budget to high-ROAS channels`,
        };
        alerts.push(alert);
      }
    }

    // Escalate alerts to Recommendation Queue
    for (const alert of alerts) {
      const recommendation = this.buildDeclineRecommendation(alert);
      const recId = await this.recommendationQueue.submit(recommendation);
      alert.recommendationId = recId;
    }

    if (alerts.length > 0) {
      await this.eventBus.publish({
        source: 'eretz',
        type: 'portfolio.decline_alerts',
        detail: {
          alertCount: alerts.length,
          criticalCount: alerts.filter((a) => a.severity === 'critical').length,
          affectedSubsidiaries: [...new Set(alerts.map((a) => a.subsidiary))],
          metrics: alerts.map((a) => a.metric),
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    }

    return alerts;
  }

  /**
   * Maintain portfolio-level strategy with per-subsidiary resource allocation,
   * priorities, and risk factors.
   * Requirement 29d.13, 29d.14
   */
  async getPortfolioStrategy(): Promise<PortfolioStrategy> {
    const allData = Array.from(this.subsidiaryData.values());

    const subsidiaryStrategies: PortfolioStrategy['subsidiaryStrategies'] = {};
    const riskFactors: string[] = [];
    const topPriorities: string[] = [];

    let totalMRR = 0;
    for (const data of allData) {
      totalMRR += data.mrr;
    }

    for (const data of allData) {
      const growthRate = data.previousMrr > 0
        ? ((data.mrr - data.previousMrr) / data.previousMrr) * 100
        : 0;

      const { recommendation, rationale } = this.determineStrategy(data, growthRate);
      const resourceAllocation = totalMRR > 0
        ? this.calculateResourceAllocation(recommendation, data.mrr, totalMRR)
        : Math.round(100 / Math.max(allData.length, 1));

      const keyActions = this.generateKeyActions(recommendation, data);

      subsidiaryStrategies[data.subsidiary] = {
        strategy: recommendation,
        rationale,
        keyActions,
        resourceAllocation,
      };

      // Identify risks
      if (data.churn > DECLINE_THRESHOLDS.churnPercent) {
        riskFactors.push(`High churn in ${data.subsidiary} (${data.churn.toFixed(1)}%)`);
      }
      if (growthRate < -DECLINE_THRESHOLDS.mrrDropPercent) {
        riskFactors.push(`MRR decline in ${data.subsidiary} (${growthRate.toFixed(1)}% MoM)`);
      }
      if (data.roas < DECLINE_THRESHOLDS.roasMinimum && data.marketingSpend > 0) {
        riskFactors.push(`Negative ROAS in ${data.subsidiary} (${data.roas.toFixed(2)})`);
      }

      // Identify priorities
      if (recommendation === 'scale') {
        topPriorities.push(`Scale ${data.subsidiary}: high growth potential with strong unit economics`);
      } else if (recommendation === 'optimize') {
        topPriorities.push(`Optimize ${data.subsidiary}: improve unit economics before scaling`);
      }
    }

    const portfolioThesis = this.generatePortfolioThesis(allData, subsidiaryStrategies);

    this.strategy = {
      subsidiaryStrategies,
      portfolioThesis,
      topPriorities,
      riskFactors,
      lastReviewed: new Date(),
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'portfolio.strategy_updated',
      detail: {
        subsidiaryCount: allData.length,
        strategies: Object.fromEntries(
          Object.entries(subsidiaryStrategies).map(([k, v]) => [k, v.strategy]),
        ),
        riskCount: riskFactors.length,
        priorityCount: topPriorities.length,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return this.strategy;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private determineStrategy(
    data: SubsidiaryData,
    growthRate: number,
  ): { recommendation: 'scale' | 'maintain' | 'optimize' | 'deprecate'; rationale: string } {
    const ltvCacRatio = data.cac > 0 ? data.ltv / data.cac : 0;

    // Scale: high growth + good unit economics
    if (growthRate > 15 && ltvCacRatio > 3 && data.churn < DECLINE_THRESHOLDS.churnPercent) {
      return {
        recommendation: 'scale',
        rationale: `Strong growth (${growthRate.toFixed(1)}% MoM) with healthy LTV/CAC ratio (${ltvCacRatio.toFixed(1)}x) and low churn (${data.churn.toFixed(1)}%)`,
      };
    }

    // Deprecate: negative growth + poor economics + high churn
    if (growthRate < -20 && ltvCacRatio < 1 && data.churn > DECLINE_THRESHOLDS.churnPercent * 2) {
      return {
        recommendation: 'deprecate',
        rationale: `Severe decline (${growthRate.toFixed(1)}% MoM) with unsustainable economics (LTV/CAC ${ltvCacRatio.toFixed(1)}x) and critical churn (${data.churn.toFixed(1)}%)`,
      };
    }

    // Optimize: moderate growth but poor unit economics
    if (ltvCacRatio < 3 || data.churn > DECLINE_THRESHOLDS.churnPercent || data.roas < this.benchmarks.roas) {
      return {
        recommendation: 'optimize',
        rationale: `Unit economics need improvement: LTV/CAC ${ltvCacRatio.toFixed(1)}x, churn ${data.churn.toFixed(1)}%, ROAS ${data.roas.toFixed(2)}`,
      };
    }

    // Maintain: stable performance
    return {
      recommendation: 'maintain',
      rationale: `Stable performance with acceptable metrics: growth ${growthRate.toFixed(1)}%, LTV/CAC ${ltvCacRatio.toFixed(1)}x, churn ${data.churn.toFixed(1)}%`,
    };
  }

  private calculateResourceAllocation(
    strategy: 'scale' | 'maintain' | 'optimize' | 'deprecate',
    subsidiaryMRR: number,
    totalMRR: number,
  ): number {
    const baseAllocation = totalMRR > 0 ? (subsidiaryMRR / totalMRR) * 100 : 0;

    switch (strategy) {
      case 'scale':
        return Math.round(Math.min(baseAllocation * 1.5, 60));
      case 'maintain':
        return Math.round(baseAllocation);
      case 'optimize':
        return Math.round(baseAllocation * 0.8);
      case 'deprecate':
        return Math.round(Math.max(baseAllocation * 0.3, 5));
    }
  }

  private generateKeyActions(
    strategy: 'scale' | 'maintain' | 'optimize' | 'deprecate',
    data: SubsidiaryData,
  ): string[] {
    switch (strategy) {
      case 'scale':
        return [
          `Increase marketing budget for ${data.subsidiary}`,
          'Expand product offerings',
          'Hire additional resources',
          'Explore new market segments',
        ];
      case 'maintain':
        return [
          `Maintain current operations for ${data.subsidiary}`,
          'Focus on customer retention',
          'Incremental product improvements',
        ];
      case 'optimize':
        return [
          `Reduce CAC for ${data.subsidiary} through channel optimization`,
          'Improve retention to reduce churn',
          'Optimize pricing for better ARPU',
          'A/B test marketing campaigns for ROAS improvement',
        ];
      case 'deprecate':
        return [
          `Wind down marketing spend for ${data.subsidiary}`,
          'Migrate valuable customers to other subsidiaries',
          'Extract reusable patterns before shutdown',
          'Document lessons learned',
        ];
    }
  }

  private assessOverallHealth(
    totalGrowthRate: number,
    allData: SubsidiaryData[],
  ): 'strong' | 'stable' | 'at_risk' | 'critical' {
    const avgChurn = allData.length > 0
      ? allData.reduce((sum, d) => sum + d.churn, 0) / allData.length
      : 0;

    if (totalGrowthRate > 10 && avgChurn < DECLINE_THRESHOLDS.churnPercent) {
      return 'strong';
    }
    if (totalGrowthRate > 0 && avgChurn <= DECLINE_THRESHOLDS.churnPercent * 1.5) {
      return 'stable';
    }
    if (totalGrowthRate > -10) {
      return 'at_risk';
    }
    return 'critical';
  }

  private generateReportRecommendations(reports: SubsidiaryReport[]): string[] {
    const recommendations: string[] = [];

    for (const report of reports) {
      if (report.concerns.length > 0) {
        recommendations.push(
          `Address concerns in ${report.subsidiary}: ${report.concerns[0]}`,
        );
      }
      if (report.metrics.strategyRecommendation === 'scale') {
        recommendations.push(
          `Increase investment in ${report.subsidiary} — strong growth trajectory`,
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('All subsidiaries performing within acceptable parameters');
    }

    return recommendations;
  }

  private generatePortfolioThesis(
    allData: SubsidiaryData[],
    strategies: PortfolioStrategy['subsidiaryStrategies'],
  ): string {
    const scaleCount = Object.values(strategies).filter((s) => s.strategy === 'scale').length;
    const optimizeCount = Object.values(strategies).filter((s) => s.strategy === 'optimize').length;
    const totalMRR = allData.reduce((sum, d) => sum + d.mrr, 0);

    if (scaleCount > optimizeCount) {
      return `Growth-focused portfolio with $${totalMRR} MRR. ${scaleCount} subsidiaries in scale mode — prioritize aggressive expansion while maintaining unit economics.`;
    }
    if (optimizeCount > scaleCount) {
      return `Optimization-focused portfolio with $${totalMRR} MRR. ${optimizeCount} subsidiaries need unit economics improvement before scaling.`;
    }
    return `Balanced portfolio with $${totalMRR} MRR. Maintain current trajectory while seeking optimization opportunities.`;
  }

  private buildDeclineRecommendation(alert: DeclineAlert): Recommendation {
    const actionSteps: ActionStep[] = [
      {
        order: 1,
        description: `Diagnose root cause of ${alert.metric} decline in ${alert.subsidiary}`,
        type: 'analysis',
        estimatedDuration: '1 day',
        dependencies: [],
      },
      {
        order: 2,
        description: `Develop intervention plan for ${alert.subsidiary}`,
        type: 'analysis',
        estimatedDuration: '2 days',
        dependencies: [1],
      },
      {
        order: 3,
        description: `Execute intervention: ${alert.interventionPlan}`,
        type: 'configuration',
        estimatedDuration: '1 week',
        dependencies: [2],
      },
    ];

    return {
      id: randomUUID(),
      agentId: 'eretz-business-pillar',
      domain: 'portfolio-intelligence',
      priority: alert.severity === 'critical' ? 9 : 7,
      submittedAt: new Date(),
      worldClassBenchmark: {
        description: 'Top-performing SaaS portfolios maintain <3% monthly churn and >15% MoM growth',
        source: 'SaaS Capital Annual Report 2025',
        metrics: {
          churn: { value: 3, unit: 'percent' },
          growth: { value: 15, unit: 'percent' },
        },
      },
      currentState: {
        description: `${alert.metric} in ${alert.subsidiary} has declined ${alert.declinePercentage.toFixed(1)}%, exceeding ${alert.threshold}% threshold`,
        metrics: {
          [alert.metric]: { value: alert.currentValue, unit: alert.metric === 'mrr' ? 'usd' : 'percent' },
        },
      },
      gapAnalysis: {
        description: `${alert.subsidiary} ${alert.metric} is ${alert.declinePercentage.toFixed(1)}% below acceptable threshold`,
        gapPercentage: alert.declinePercentage,
        keyGaps: [
          `${alert.metric} at ${alert.currentValue} vs threshold ${alert.threshold}`,
          alert.interventionPlan,
        ],
      },
      actionPlan: {
        summary: `Intervene on ${alert.metric} decline in ${alert.subsidiary}`,
        steps: actionSteps,
        estimatedEffort: '1-2 weeks',
        estimatedImpact: {
          recovery: { value: alert.previousValue - alert.currentValue, unit: alert.metric === 'mrr' ? 'usd' : 'percent' },
        },
        requiresCodeChanges: false,
        requiresBudget: 0,
      },
      riskAssessment: {
        level: alert.severity === 'critical' ? 'high' : 'medium',
        risks: ['Continued decline if intervention delayed', 'Customer loss may be irreversible'],
        mitigations: ['Immediate root cause analysis', 'Proactive customer outreach'],
      },
      rollbackPlan: 'Revert any pricing or product changes if metrics worsen',
      status: 'pending',
    };
  }
}
