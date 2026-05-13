/**
 * ZionX App Development Studio — Revenue and Performance Panel
 *
 * Aggregates metrics from App Store Connect and Google Play Console drivers.
 * Displays combined subscription + ad revenue, ratings, reviews, crash rate,
 * retention metrics, and LLM token cost tracking per app via Otzar integration.
 *
 * Requirements: 42m.41, 42m.42
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueMetrics {
  downloads: { total: number; daily: number; trend: 'up' | 'down' | 'stable' };
  revenue: { subscription: number; ads: number; total: number; currency: string };
  ratings: { average: number; count: number; distribution: Record<number, number> };
  reviews: { total: number; recent: { text: string; rating: number; date: Date }[] };
  crashRate: number;
  retention: { day1: number; day7: number; day30: number };
}

export interface CostMetrics {
  totalTokenCost: number;
  costPerApp: number;
  costPerEdit: number;
  tokenUsage: { input: number; output: number; total: number };
}

export interface PerformanceRecommendation {
  action: 'scale' | 'optimize' | 'maintain' | 'kill';
  reason: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (for injection / mocking)
// ---------------------------------------------------------------------------

export interface RevenueDataSource {
  getRevenueMetrics(sessionId: string): Promise<RevenueMetrics>;
}

export interface CostDataSource {
  getCostMetrics(sessionId: string): Promise<CostMetrics>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface RevenuePanelService {
  getRevenueMetrics(sessionId: string): Promise<RevenueMetrics>;
  getCostMetrics(sessionId: string): Promise<CostMetrics>;
  getRecommendation(sessionId: string): Promise<PerformanceRecommendation>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RevenuePanelConfig {
  revenueDataSource: RevenueDataSource;
  costDataSource: CostDataSource;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultRevenuePanelService implements RevenuePanelService {
  private readonly revenueDataSource: RevenueDataSource;
  private readonly costDataSource: CostDataSource;

  constructor(config: RevenuePanelConfig) {
    this.revenueDataSource = config.revenueDataSource;
    this.costDataSource = config.costDataSource;
  }

  async getRevenueMetrics(sessionId: string): Promise<RevenueMetrics> {
    return this.revenueDataSource.getRevenueMetrics(sessionId);
  }

  async getCostMetrics(sessionId: string): Promise<CostMetrics> {
    return this.costDataSource.getCostMetrics(sessionId);
  }

  async getRecommendation(sessionId: string): Promise<PerformanceRecommendation> {
    const revenue = await this.revenueDataSource.getRevenueMetrics(sessionId);
    const cost = await this.costDataSource.getCostMetrics(sessionId);

    return this.computeRecommendation(revenue, cost);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private computeRecommendation(
    revenue: RevenueMetrics,
    cost: CostMetrics,
  ): PerformanceRecommendation {
    const netRevenue = revenue.revenue.total - cost.totalTokenCost;
    const isGrowing = revenue.downloads.trend === 'up';
    const hasGoodRatings = revenue.ratings.average >= 4.0;
    const hasLowCrashRate = revenue.crashRate < 0.02;
    const hasGoodRetention = revenue.retention.day7 >= 0.3;

    // Scale: growing, profitable, good quality
    if (netRevenue > 0 && isGrowing && hasGoodRatings && hasLowCrashRate) {
      return {
        action: 'scale',
        reason: 'App is profitable, growing, and has good quality metrics',
        confidence: this.calculateConfidence([isGrowing, hasGoodRatings, hasLowCrashRate, hasGoodRetention]),
      };
    }

    // Kill: negative revenue, declining, poor quality
    if (netRevenue < 0 && !isGrowing && !hasGoodRatings && !hasGoodRetention) {
      return {
        action: 'kill',
        reason: 'App is unprofitable with declining metrics and poor quality',
        confidence: this.calculateConfidence([!isGrowing, !hasGoodRatings, !hasGoodRetention, netRevenue < 0]),
      };
    }

    // Optimize: has potential but needs improvement
    if (netRevenue > 0 || isGrowing || hasGoodRatings) {
      return {
        action: 'optimize',
        reason: 'App shows potential but needs improvement in key areas',
        confidence: this.calculateConfidence([netRevenue > 0, isGrowing, hasGoodRatings, hasGoodRetention]),
      };
    }

    // Maintain: stable but not growing
    return {
      action: 'maintain',
      reason: 'App is stable but not showing strong growth signals',
      confidence: 0.5,
    };
  }

  private calculateConfidence(signals: boolean[]): number {
    const trueCount = signals.filter(Boolean).length;
    return Math.round((trueCount / signals.length) * 100) / 100;
  }
}
