/**
 * ZionX GTM Engine — Portfolio Manager
 *
 * Implements portfolio health dashboard: per-app revenue, marketing spend,
 * ROAS, revenue attribution across channels, and automated recommendations
 * (scale, maintain, optimize, deprecate).
 *
 * Requirements: 11b.6
 */

import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { AppMetrics, AppHealthStatus, RevenueOptimizer } from './revenue-optimizer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortfolioRecommendation = 'scale' | 'maintain' | 'optimize' | 'deprecate';

export interface ChannelAttribution {
  channel: string;
  revenue: number;
  spend: number;
  roas: number;
  conversions: number;
  percentOfTotal: number;
}

export interface AppPortfolioEntry {
  appId: string;
  appName: string;
  platform: 'apple' | 'google' | 'both';
  metrics: AppMetrics;
  healthStatus: AppHealthStatus;
  revenue: number;
  marketingSpend: number;
  roas: number;
  channelAttribution: ChannelAttribution[];
  recommendation: PortfolioRecommendation;
  recommendationReason: string;
}

export interface PortfolioSummary {
  totalApps: number;
  totalRevenue: number;
  totalMarketingSpend: number;
  overallRoas: number;
  appsByRecommendation: Record<PortfolioRecommendation, number>;
  topPerformer: string | null;
  worstPerformer: string | null;
  generatedAt: string;
}

export interface PortfolioHealthReport {
  tenantId: string;
  apps: AppPortfolioEntry[];
  summary: PortfolioSummary;
  actionItems: PortfolioActionItem[];
  generatedAt: string;
}

export interface PortfolioActionItem {
  appId: string;
  action: PortfolioRecommendation;
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedImpact: string;
}

// ---------------------------------------------------------------------------
// Portfolio Manager
// ---------------------------------------------------------------------------

export class PortfolioManager {
  constructor(
    private readonly revenueOptimizer: RevenueOptimizer,
    private readonly otzarService: OtzarService,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Generate a full portfolio health report with per-app analysis
   * and automated recommendations.
   */
  async generateReport(
    tenantId: string,
    apps: { appId: string; appName: string; platform: 'apple' | 'google' | 'both' }[],
  ): Promise<PortfolioHealthReport> {
    const entries: AppPortfolioEntry[] = [];

    for (const app of apps) {
      const platform = app.platform === 'both' ? 'apple' : app.platform;
      const metrics = await this.revenueOptimizer.collectMetrics(app.appId, platform);
      const healthStatus = this.revenueOptimizer.assessHealth(metrics);

      const marketingSpend = await this.getMarketingSpend(app.appId);
      const channelAttribution = this.calculateChannelAttribution(app.appId, metrics.revenue);
      const roas = marketingSpend > 0 ? metrics.revenue / marketingSpend : 0;

      const { recommendation, reason } = this.generateRecommendation(
        metrics,
        healthStatus,
        roas,
      );

      entries.push({
        appId: app.appId,
        appName: app.appName,
        platform: app.platform,
        metrics,
        healthStatus,
        revenue: metrics.revenue,
        marketingSpend,
        roas,
        channelAttribution,
        recommendation,
        recommendationReason: reason,
      });
    }

    const summary = this.buildSummary(entries);
    const actionItems = this.buildActionItems(entries);

    // Store report in Zikaron
    await this.storeReport(tenantId, summary);

    return {
      tenantId,
      apps: entries,
      summary,
      actionItems,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a recommendation for a single app based on its metrics.
   */
  generateRecommendation(
    metrics: AppMetrics,
    healthStatus: AppHealthStatus,
    roas: number,
  ): { recommendation: PortfolioRecommendation; reason: string } {
    // Scale: growing app with good ROAS
    if (healthStatus === 'growing' && roas >= 3.0) {
      return {
        recommendation: 'scale',
        reason: `App is growing with ROAS of ${roas.toFixed(1)}x. Increase marketing budget to accelerate growth.`,
      };
    }

    // Deprecate: critical health with no revenue
    if (healthStatus === 'critical' && metrics.revenue === 0 && metrics.downloads === 0) {
      return {
        recommendation: 'deprecate',
        reason: 'App has no revenue or downloads. Consider deprecating to free up resources.',
      };
    }

    // Optimize: declining or stable with room for improvement
    if (healthStatus === 'declining' || (healthStatus === 'stable' && roas < 2.0)) {
      return {
        recommendation: 'optimize',
        reason: `App is ${healthStatus} with ROAS of ${roas.toFixed(1)}x. Focus on conversion optimization and retention.`,
      };
    }

    // Maintain: stable with acceptable ROAS
    return {
      recommendation: 'maintain',
      reason: `App is ${healthStatus} with ROAS of ${roas.toFixed(1)}x. Maintain current strategy.`,
    };
  }

  /**
   * Get marketing spend for an app from Otzar cost reports.
   */
  private async getMarketingSpend(appId: string): Promise<number> {
    const report = await this.otzarService.getCostReport({
      agentId: 'zionx-app-factory',
      pillar: 'eretz',
    });

    // Marketing spend is tracked as a subset of agent costs
    return report.byAgent['zionx-app-factory'] ?? 0;
  }

  /**
   * Calculate revenue attribution across marketing channels.
   */
  private calculateChannelAttribution(
    appId: string,
    totalRevenue: number,
  ): ChannelAttribution[] {
    // Structural implementation — in production this would pull from
    // actual attribution data (AppsFlyer, Adjust, etc.)
    const channels = [
      { channel: 'organic', percentOfTotal: 0.4 },
      { channel: 'google_ads', percentOfTotal: 0.25 },
      { channel: 'social_media', percentOfTotal: 0.2 },
      { channel: 'cross_promotion', percentOfTotal: 0.1 },
      { channel: 'referral', percentOfTotal: 0.05 },
    ];

    return channels.map((ch) => ({
      channel: ch.channel,
      revenue: totalRevenue * ch.percentOfTotal,
      spend: 0,
      roas: 0,
      conversions: 0,
      percentOfTotal: ch.percentOfTotal * 100,
    }));
  }

  /**
   * Build portfolio summary from individual app entries.
   */
  private buildSummary(entries: AppPortfolioEntry[]): PortfolioSummary {
    const totalRevenue = entries.reduce((sum, e) => sum + e.revenue, 0);
    const totalMarketingSpend = entries.reduce((sum, e) => sum + e.marketingSpend, 0);

    const appsByRecommendation: Record<PortfolioRecommendation, number> = {
      scale: 0,
      maintain: 0,
      optimize: 0,
      deprecate: 0,
    };

    for (const entry of entries) {
      appsByRecommendation[entry.recommendation]++;
    }

    const sorted = [...entries].sort((a, b) => b.revenue - a.revenue);

    return {
      totalApps: entries.length,
      totalRevenue,
      totalMarketingSpend,
      overallRoas: totalMarketingSpend > 0 ? totalRevenue / totalMarketingSpend : 0,
      appsByRecommendation,
      topPerformer: sorted[0]?.appId ?? null,
      worstPerformer: sorted[sorted.length - 1]?.appId ?? null,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Build prioritized action items from portfolio entries.
   */
  private buildActionItems(entries: AppPortfolioEntry[]): PortfolioActionItem[] {
    return entries
      .filter((e) => e.recommendation !== 'maintain')
      .map((e) => ({
        appId: e.appId,
        action: e.recommendation,
        priority: e.recommendation === 'deprecate' ? 'high' as const
          : e.recommendation === 'optimize' ? 'medium' as const
            : 'low' as const,
        description: e.recommendationReason,
        estimatedImpact: e.recommendation === 'scale'
          ? `Potential ${Math.round(e.revenue * 0.5)} revenue increase`
          : e.recommendation === 'optimize'
            ? `Potential ${Math.round(e.revenue * 0.2)} revenue recovery`
            : 'Resource reallocation',
      }))
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Store portfolio report in Zikaron.
   */
  private async storeReport(tenantId: string, summary: PortfolioSummary): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `portfolio-report-${tenantId}-${Date.now()}`,
      tenantId,
      layer: 'episodic',
      content: `Portfolio report: ${summary.totalApps} apps, $${summary.totalRevenue.toFixed(2)} revenue, ROAS ${summary.overallRoas.toFixed(1)}x`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['portfolio', 'report'],
      createdAt: new Date(),
      eventType: 'portfolio_report',
      participants: ['zionx-app-factory'],
      outcome: 'success',
      relatedEntities: [],
    });
  }
}
