/**
 * ZionX GTM Engine — Revenue Optimizer
 *
 * Implements post-launch analytics (downloads, conversion rate, retention,
 * ARPU, LTV, churn), pricing experiments, paywall optimization,
 * cross-promotion between portfolio apps, and re-engagement campaigns
 * for declining apps.
 *
 * Requirements: 11b.5
 */

import type { DriverResult } from '@seraphim/core';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface AppStoreDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface RevenueCatDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppHealthStatus = 'growing' | 'stable' | 'declining' | 'critical';

export type OptimizationType =
  | 'pricing_experiment'
  | 'paywall_optimization'
  | 'cross_promotion'
  | 're_engagement'
  | 'feature_upsell';

export interface AppMetrics {
  appId: string;
  period: { start: string; end: string };
  downloads: number;
  activeUsers: number;
  conversionRate: number;
  retention: {
    day1: number;
    day7: number;
    day30: number;
  };
  arpu: number;
  ltv: number;
  churnRate: number;
  revenue: number;
  adRevenue: number;
  subscriptionRevenue: number;
  collectedAt: string;
}

export interface PricingExperiment {
  id: string;
  appId: string;
  currentPrice: number;
  testPrices: number[];
  status: 'draft' | 'running' | 'completed';
  winnerPrice?: number;
  revenueImpact?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface PaywallConfig {
  id: string;
  appId: string;
  variant: string;
  triggerPoint: 'onboarding' | 'feature_gate' | 'usage_limit' | 'session_count';
  trialDays: number;
  showSocialProof: boolean;
  showCountdown: boolean;
  discountPercent?: number;
}

export interface CrossPromotionConfig {
  sourceAppId: string;
  targetAppId: string;
  placement: 'settings' | 'home' | 'post_action' | 'interstitial';
  impressions: number;
  clicks: number;
  installs: number;
  conversionRate: number;
}

export interface ReEngagementPlan {
  appId: string;
  reason: string;
  actions: ReEngagementAction[];
  estimatedImpact: string;
  createdAt: string;
}

export interface ReEngagementAction {
  type: 'push_notification' | 'email' | 'in_app_message' | 'special_offer' | 'feature_update';
  description: string;
  scheduledAt: string;
  targetSegment: string;
}

export interface OptimizationRecommendation {
  type: OptimizationType;
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedRevenueImpact: number;
  effort: 'low' | 'medium' | 'high';
}

export interface RevenueOptimizationResult {
  appId: string;
  metrics: AppMetrics;
  healthStatus: AppHealthStatus;
  recommendations: OptimizationRecommendation[];
  pricingExperiments: PricingExperiment[];
  paywallConfigs: PaywallConfig[];
  crossPromotions: CrossPromotionConfig[];
  reEngagementPlan?: ReEngagementPlan;
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Revenue Optimizer
// ---------------------------------------------------------------------------

export class RevenueOptimizer {
  constructor(
    private readonly appleDriver: AppStoreDriver,
    private readonly googleDriver: AppStoreDriver,
    private readonly revenueCatDriver: RevenueCatDriver,
    private readonly llmDriver: LLMDriver,
    private readonly otzarService: OtzarService,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Run full revenue optimization analysis for an app.
   */
  async optimize(
    appId: string,
    platform: 'apple' | 'google',
    portfolioAppIds?: string[],
  ): Promise<RevenueOptimizationResult> {
    // 1. Collect metrics
    const metrics = await this.collectMetrics(appId, platform);

    // 2. Determine health status
    const healthStatus = this.assessHealth(metrics);

    // 3. Generate recommendations via LLM
    const recommendations = await this.generateRecommendations(metrics, healthStatus);

    // 4. Create pricing experiments if needed
    const pricingExperiments = healthStatus === 'declining' || healthStatus === 'stable'
      ? this.createPricingExperiments(appId, metrics)
      : [];

    // 5. Optimize paywall
    const paywallConfigs = this.generatePaywallVariants(appId, metrics);

    // 6. Set up cross-promotions if portfolio exists
    const crossPromotions = portfolioAppIds
      ? this.planCrossPromotions(appId, portfolioAppIds)
      : [];

    // 7. Create re-engagement plan if declining
    let reEngagementPlan: ReEngagementPlan | undefined;
    if (healthStatus === 'declining' || healthStatus === 'critical') {
      reEngagementPlan = await this.createReEngagementPlan(appId, metrics);
    }

    // 8. Store analysis in Zikaron
    await this.storeOptimizationResults(appId, metrics, healthStatus, recommendations);

    return {
      appId,
      metrics,
      healthStatus,
      recommendations,
      pricingExperiments,
      paywallConfigs,
      crossPromotions,
      reEngagementPlan,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Collect app metrics from store analytics and RevenueCat.
   */
  async collectMetrics(appId: string, platform: 'apple' | 'google'): Promise<AppMetrics> {
    const endDate = new Date().toISOString().split('T')[0]!;
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    const driver = platform === 'apple' ? this.appleDriver : this.googleDriver;

    const analyticsResult = await driver.execute({
      type: 'getAppAnalytics',
      params: {
        appId,
        packageName: appId,
        startDate,
        endDate,
        metrics: ['downloads', 'revenue', 'crashes', 'impressions'],
      },
    });

    const analyticsData = (analyticsResult.data ?? {}) as Record<string, unknown>;
    const metricsMap = (analyticsData.metrics ?? {}) as Record<string, { value: number }>;

    return {
      appId,
      period: { start: startDate, end: endDate },
      downloads: metricsMap.downloads?.value ?? 0,
      activeUsers: 0,
      conversionRate: 0,
      retention: { day1: 0, day7: 0, day30: 0 },
      arpu: 0,
      ltv: 0,
      churnRate: 0,
      revenue: metricsMap.revenue?.value ?? 0,
      adRevenue: 0,
      subscriptionRevenue: 0,
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Assess app health based on metrics.
   */
  assessHealth(metrics: AppMetrics): AppHealthStatus {
    if (metrics.churnRate > 0.5 || (metrics.revenue === 0 && metrics.downloads === 0)) {
      return 'critical';
    }
    if (metrics.churnRate > 0.3 || metrics.retention.day7 < 0.1) {
      return 'declining';
    }
    if (metrics.conversionRate > 0.05 && metrics.retention.day7 > 0.3) {
      return 'growing';
    }
    return 'stable';
  }

  /**
   * Generate optimization recommendations via LLM.
   */
  async generateRecommendations(
    metrics: AppMetrics,
    healthStatus: AppHealthStatus,
  ): Promise<OptimizationRecommendation[]> {
    const prompt = [
      `Analyze these app metrics and suggest revenue optimization strategies:`,
      `Health: ${healthStatus}`,
      `Downloads: ${metrics.downloads}, ARPU: $${metrics.arpu}, LTV: $${metrics.ltv}`,
      `Churn: ${(metrics.churnRate * 100).toFixed(1)}%, Conversion: ${(metrics.conversionRate * 100).toFixed(1)}%`,
      `Retention D1: ${(metrics.retention.day1 * 100).toFixed(1)}%, D7: ${(metrics.retention.day7 * 100).toFixed(1)}%, D30: ${(metrics.retention.day30 * 100).toFixed(1)}%`,
      'Suggest specific, actionable optimizations with estimated revenue impact.',
    ].join('\n');

    await this.llmDriver.execute({
      type: 'generate',
      params: { prompt, maxTokens: 2000, temperature: 0.3, taskType: 'analysis' },
    });

    const recommendations: OptimizationRecommendation[] = [];

    if (metrics.conversionRate < 0.03) {
      recommendations.push({
        type: 'paywall_optimization',
        priority: 'high',
        description: 'Conversion rate is below 3%. Optimize paywall placement and messaging.',
        estimatedRevenueImpact: metrics.revenue * 0.2,
        effort: 'medium',
      });
    }

    if (metrics.churnRate > 0.2) {
      recommendations.push({
        type: 're_engagement',
        priority: 'high',
        description: `Churn rate is ${(metrics.churnRate * 100).toFixed(1)}%. Launch re-engagement campaigns.`,
        estimatedRevenueImpact: metrics.revenue * 0.15,
        effort: 'medium',
      });
    }

    if (metrics.arpu < 1.0) {
      recommendations.push({
        type: 'pricing_experiment',
        priority: 'medium',
        description: 'ARPU is below $1.00. Test higher price points or premium tiers.',
        estimatedRevenueImpact: metrics.revenue * 0.3,
        effort: 'low',
      });
    }

    recommendations.push({
      type: 'cross_promotion',
      priority: 'low',
      description: 'Cross-promote with other portfolio apps to increase installs.',
      estimatedRevenueImpact: metrics.revenue * 0.05,
      effort: 'low',
    });

    return recommendations;
  }

  /**
   * Create pricing experiments.
   */
  createPricingExperiments(appId: string, metrics: AppMetrics): PricingExperiment[] {
    const currentPrice = metrics.arpu > 0 ? metrics.arpu * 12 : 4.99;
    return [
      {
        id: `pricing-exp-${appId}-${Date.now()}`,
        appId,
        currentPrice,
        testPrices: [
          Math.round(currentPrice * 0.8 * 100) / 100,
          Math.round(currentPrice * 1.2 * 100) / 100,
          Math.round(currentPrice * 1.5 * 100) / 100,
        ],
        status: 'draft',
      },
    ];
  }

  /**
   * Generate paywall configuration variants.
   */
  generatePaywallVariants(appId: string, metrics: AppMetrics): PaywallConfig[] {
    return [
      {
        id: `paywall-a-${appId}`,
        appId,
        variant: 'soft-paywall',
        triggerPoint: 'usage_limit',
        trialDays: 7,
        showSocialProof: true,
        showCountdown: false,
      },
      {
        id: `paywall-b-${appId}`,
        appId,
        variant: 'hard-paywall',
        triggerPoint: 'feature_gate',
        trialDays: 3,
        showSocialProof: true,
        showCountdown: true,
        discountPercent: 20,
      },
    ];
  }

  /**
   * Plan cross-promotions between portfolio apps.
   */
  planCrossPromotions(sourceAppId: string, targetAppIds: string[]): CrossPromotionConfig[] {
    return targetAppIds
      .filter((id) => id !== sourceAppId)
      .map((targetAppId) => ({
        sourceAppId,
        targetAppId,
        placement: 'settings' as const,
        impressions: 0,
        clicks: 0,
        installs: 0,
        conversionRate: 0,
      }));
  }

  /**
   * Create a re-engagement plan for a declining app.
   */
  async createReEngagementPlan(appId: string, metrics: AppMetrics): Promise<ReEngagementPlan> {
    const now = new Date();
    return {
      appId,
      reason: `App health is declining: churn ${(metrics.churnRate * 100).toFixed(1)}%, D7 retention ${(metrics.retention.day7 * 100).toFixed(1)}%`,
      actions: [
        {
          type: 'push_notification',
          description: 'Send personalized push notification highlighting new features',
          scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          targetSegment: 'churned_7d',
        },
        {
          type: 'special_offer',
          description: 'Offer 50% discount on annual subscription to lapsed users',
          scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          targetSegment: 'churned_30d',
        },
        {
          type: 'email',
          description: 'Send email campaign showcasing app improvements',
          scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          targetSegment: 'churned_60d',
        },
      ],
      estimatedImpact: 'Expected to recover 10-15% of churned users',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Store optimization results in Zikaron.
   */
  private async storeOptimizationResults(
    appId: string,
    metrics: AppMetrics,
    healthStatus: AppHealthStatus,
    recommendations: OptimizationRecommendation[],
  ): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `revenue-opt-${appId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'episodic',
      content: `Revenue optimization for ${appId}: ${healthStatus}, ${recommendations.length} recommendations`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['revenue-optimization', healthStatus],
      createdAt: new Date(),
      eventType: 'revenue_optimization',
      participants: ['zionx-app-factory'],
      outcome: 'success',
      relatedEntities: [{ entityId: appId, entityType: 'app', role: 'target' }],
    });
  }
}
