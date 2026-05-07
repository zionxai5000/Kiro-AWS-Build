/**
 * ZionX Ads — Ad Revenue Tracker
 *
 * Tracks ad revenue per app alongside subscription revenue, reports combined
 * ARPU, and auto-reinvests ad revenue into paid acquisition when threshold
 * is exceeded.
 *
 * Requirements: 11d.4
 */

import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RevenueSource = 'ad_banner' | 'ad_interstitial' | 'ad_rewarded' | 'ad_native' | 'subscription' | 'iap' | 'paid_download';

export interface RevenueEntry {
  id: string;
  appId: string;
  source: RevenueSource;
  amount: number;
  currency: string;
  network?: string;
  timestamp: string;
}

export interface AppRevenueSnapshot {
  appId: string;
  period: { start: string; end: string };
  adRevenue: number;
  subscriptionRevenue: number;
  iapRevenue: number;
  totalRevenue: number;
  activeUsers: number;
  combinedArpu: number;
  adArpu: number;
  subscriptionArpu: number;
  adRevenueBreakdown: Record<string, number>;
  networkBreakdown: Record<string, number>;
}

export interface ReinvestmentConfig {
  appId: string;
  enabled: boolean;
  thresholdAmount: number;
  thresholdCurrency: string;
  reinvestmentPercent: number;
  maxReinvestmentAmount: number;
  targetChannel: 'google_ads' | 'social_media' | 'both';
  cooldownDays: number;
}

export interface ReinvestmentAction {
  id: string;
  appId: string;
  adRevenueAccumulated: number;
  reinvestmentAmount: number;
  targetChannel: string;
  status: 'pending' | 'executed' | 'failed';
  triggeredAt: string;
  executedAt?: string;
}

export interface CombinedRevenueReport {
  appId: string;
  period: { start: string; end: string };
  snapshot: AppRevenueSnapshot;
  reinvestmentActions: ReinvestmentAction[];
  trends: RevenueTrend[];
  generatedAt: string;
}

export interface RevenueTrend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  period: string;
}

// ---------------------------------------------------------------------------
// Ad Revenue Tracker
// ---------------------------------------------------------------------------

export class AdRevenueTracker {
  private revenueEntries: Map<string, RevenueEntry[]> = new Map();
  private reinvestmentConfigs: Map<string, ReinvestmentConfig> = new Map();
  private reinvestmentActions: Map<string, ReinvestmentAction[]> = new Map();

  constructor(
    private readonly otzarService: OtzarService,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Record a revenue entry.
   */
  recordRevenue(entry: RevenueEntry): void {
    const entries = this.revenueEntries.get(entry.appId) ?? [];
    entries.push(entry);
    this.revenueEntries.set(entry.appId, entries);
  }

  /**
   * Configure auto-reinvestment for an app.
   */
  configureReinvestment(config: ReinvestmentConfig): void {
    this.reinvestmentConfigs.set(config.appId, config);
  }

  /**
   * Get a revenue snapshot for an app over a period.
   */
  getSnapshot(appId: string, startDate: string, endDate: string, activeUsers: number): AppRevenueSnapshot {
    const entries = (this.revenueEntries.get(appId) ?? []).filter((e) => {
      return e.timestamp >= startDate && e.timestamp <= endDate;
    });

    const adSources: RevenueSource[] = ['ad_banner', 'ad_interstitial', 'ad_rewarded', 'ad_native'];

    const adRevenue = entries
      .filter((e) => adSources.includes(e.source))
      .reduce((sum, e) => sum + e.amount, 0);

    const subscriptionRevenue = entries
      .filter((e) => e.source === 'subscription')
      .reduce((sum, e) => sum + e.amount, 0);

    const iapRevenue = entries
      .filter((e) => e.source === 'iap')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalRevenue = adRevenue + subscriptionRevenue + iapRevenue;

    // Ad revenue breakdown by source
    const adRevenueBreakdown: Record<string, number> = {};
    for (const source of adSources) {
      const amount = entries
        .filter((e) => e.source === source)
        .reduce((sum, e) => sum + e.amount, 0);
      if (amount > 0) {
        adRevenueBreakdown[source] = amount;
      }
    }

    // Network breakdown
    const networkBreakdown: Record<string, number> = {};
    for (const entry of entries.filter((e) => e.network)) {
      networkBreakdown[entry.network!] = (networkBreakdown[entry.network!] ?? 0) + entry.amount;
    }

    const safeUsers = Math.max(activeUsers, 1);

    return {
      appId,
      period: { start: startDate, end: endDate },
      adRevenue,
      subscriptionRevenue,
      iapRevenue,
      totalRevenue,
      activeUsers,
      combinedArpu: totalRevenue / safeUsers,
      adArpu: adRevenue / safeUsers,
      subscriptionArpu: subscriptionRevenue / safeUsers,
      adRevenueBreakdown,
      networkBreakdown,
    };
  }

  /**
   * Check if auto-reinvestment should be triggered and execute if so.
   */
  async checkAndReinvest(appId: string): Promise<ReinvestmentAction | null> {
    const config = this.reinvestmentConfigs.get(appId);
    if (!config || !config.enabled) return null;

    // Calculate accumulated ad revenue since last reinvestment
    const actions = this.reinvestmentActions.get(appId) ?? [];
    const lastAction = actions[actions.length - 1];

    // Check cooldown
    if (lastAction) {
      const daysSinceLastAction = (Date.now() - new Date(lastAction.triggeredAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLastAction < config.cooldownDays) return null;
    }

    const sinceDate = lastAction?.triggeredAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const entries = (this.revenueEntries.get(appId) ?? []).filter(
      (e) => e.timestamp > sinceDate && ['ad_banner', 'ad_interstitial', 'ad_rewarded', 'ad_native'].includes(e.source),
    );

    const accumulatedAdRevenue = entries.reduce((sum, e) => sum + e.amount, 0);

    if (accumulatedAdRevenue < config.thresholdAmount) return null;

    // Calculate reinvestment amount
    const reinvestmentAmount = Math.min(
      accumulatedAdRevenue * (config.reinvestmentPercent / 100),
      config.maxReinvestmentAmount,
    );

    const action: ReinvestmentAction = {
      id: `reinvest-${appId}-${Date.now()}`,
      appId,
      adRevenueAccumulated: accumulatedAdRevenue,
      reinvestmentAmount,
      targetChannel: config.targetChannel,
      status: 'pending',
      triggeredAt: new Date().toISOString(),
    };

    // Record the reinvestment in Otzar
    await this.otzarService.recordUsage({
      agentId: 'zionx-app-factory',
      tenantId: 'system',
      pillar: 'eretz',
      provider: 'ad_reinvestment',
      model: 'auto',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: reinvestmentAmount,
      taskType: 'ad_reinvestment',
    });

    action.status = 'executed';
    action.executedAt = new Date().toISOString();

    // Store action
    actions.push(action);
    this.reinvestmentActions.set(appId, actions);

    // Store in Zikaron
    await this.storeReinvestmentAction(action);

    return action;
  }

  /**
   * Generate a combined revenue report.
   */
  async generateReport(
    appId: string,
    startDate: string,
    endDate: string,
    activeUsers: number,
  ): Promise<CombinedRevenueReport> {
    const snapshot = this.getSnapshot(appId, startDate, endDate, activeUsers);
    const actions = this.reinvestmentActions.get(appId) ?? [];

    const trends = this.calculateTrends(appId, startDate, endDate);

    const report: CombinedRevenueReport = {
      appId,
      period: { start: startDate, end: endDate },
      snapshot,
      reinvestmentActions: actions.filter(
        (a) => a.triggeredAt >= startDate && a.triggeredAt <= endDate,
      ),
      trends,
      generatedAt: new Date().toISOString(),
    };

    // Store report in Zikaron
    await this.storeReport(appId, report);

    return report;
  }

  /**
   * Calculate revenue trends.
   */
  private calculateTrends(appId: string, startDate: string, endDate: string): RevenueTrend[] {
    // Structural implementation — in production this would compare
    // current period vs previous period
    return [
      { metric: 'total_revenue', direction: 'stable', changePercent: 0, period: `${startDate} to ${endDate}` },
      { metric: 'ad_revenue', direction: 'stable', changePercent: 0, period: `${startDate} to ${endDate}` },
      { metric: 'combined_arpu', direction: 'stable', changePercent: 0, period: `${startDate} to ${endDate}` },
    ];
  }

  /**
   * Store reinvestment action in Zikaron.
   */
  private async storeReinvestmentAction(action: ReinvestmentAction): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `reinvestment-${action.id}`,
      tenantId: 'system',
      layer: 'episodic',
      content: `Auto-reinvestment for ${action.appId}: $${action.reinvestmentAmount.toFixed(2)} from $${action.adRevenueAccumulated.toFixed(2)} ad revenue into ${action.targetChannel}`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['reinvestment', action.appId, action.targetChannel],
      createdAt: new Date(),
      eventType: 'ad_reinvestment',
      participants: ['zionx-app-factory'],
      outcome: action.status === 'executed' ? 'success' : 'failure',
      relatedEntities: [{ entityId: action.appId, entityType: 'app', role: 'target' }],
    });
  }

  /**
   * Store report in Zikaron.
   */
  private async storeReport(appId: string, report: CombinedRevenueReport): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `combined-revenue-report-${appId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'episodic',
      content: `Combined revenue report for ${appId}: $${report.snapshot.totalRevenue.toFixed(2)} total, ARPU $${report.snapshot.combinedArpu.toFixed(2)}`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['revenue-report', appId],
      createdAt: new Date(),
      eventType: 'combined_revenue_report',
      participants: ['zionx-app-factory'],
      outcome: 'success',
      relatedEntities: [{ entityId: appId, entityType: 'app', role: 'target' }],
    });
  }
}
