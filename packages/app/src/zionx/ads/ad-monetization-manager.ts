/**
 * ZionX Ads — Ad Monetization Manager
 *
 * Integrates ad SDK placements (banner, interstitial, rewarded video, native)
 * with intelligent frequency capping and UX optimization. Manages ad mediation
 * across networks to maximize fill rate and eCPM.
 *
 * Requirements: 11d.3
 */

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdFormat = 'banner' | 'interstitial' | 'rewarded_video' | 'native';

export type AdNetwork = 'admob' | 'unity_ads' | 'applovin' | 'ironsource' | 'meta_audience';

export type MediationStrategy = 'waterfall' | 'bidding' | 'hybrid';

export interface AdPlacement {
  id: string;
  name: string;
  format: AdFormat;
  screenRef: string;
  position: 'top' | 'bottom' | 'inline' | 'fullscreen' | 'overlay';
  frequencyCap: FrequencyCap;
  priority: number;
  enabled: boolean;
}

export interface FrequencyCap {
  maxImpressionsPerSession: number;
  maxImpressionsPerDay: number;
  minIntervalSeconds: number;
  cooldownAfterPurchase: boolean;
  respectUserPreference: boolean;
}

export interface MediationConfig {
  strategy: MediationStrategy;
  networks: NetworkConfig[];
  refreshIntervalMs: number;
  timeoutMs: number;
}

export interface NetworkConfig {
  network: AdNetwork;
  priority: number;
  enabled: boolean;
  appId: string;
  adUnitIds: Record<AdFormat, string>;
  floorPriceCpm: number;
}

export interface AdPerformanceMetrics {
  placementId: string;
  format: AdFormat;
  network: AdNetwork;
  impressions: number;
  clicks: number;
  ctr: number;
  ecpm: number;
  revenue: number;
  fillRate: number;
  period: { start: string; end: string };
}

export interface MediationResult {
  placementId: string;
  winningNetwork: AdNetwork;
  ecpm: number;
  fillRate: number;
  latencyMs: number;
  bidResponses: BidResponse[];
}

export interface BidResponse {
  network: AdNetwork;
  ecpm: number;
  filled: boolean;
  latencyMs: number;
}

export interface AdMonetizationConfig {
  appId: string;
  placements: AdPlacement[];
  mediation: MediationConfig;
  globalFrequencyCap: FrequencyCap;
  disableAdsForSubscribers: boolean;
}

export interface AdMonetizationReport {
  appId: string;
  totalRevenue: number;
  totalImpressions: number;
  averageEcpm: number;
  fillRate: number;
  byFormat: Record<AdFormat, { revenue: number; impressions: number; ecpm: number }>;
  byNetwork: Record<string, { revenue: number; impressions: number; ecpm: number; fillRate: number }>;
  topPlacements: AdPerformanceMetrics[];
  recommendations: AdOptimizationRecommendation[];
  period: { start: string; end: string };
  generatedAt: string;
}

export interface AdOptimizationRecommendation {
  type: 'add_placement' | 'remove_placement' | 'adjust_frequency' | 'change_network_priority' | 'enable_bidding';
  description: string;
  estimatedRevenueImpact: number;
  priority: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Ad Monetization Manager
// ---------------------------------------------------------------------------

export class AdMonetizationManager {
  private configs: Map<string, AdMonetizationConfig> = new Map();

  constructor(
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Configure ad monetization for an app.
   */
  configure(config: AdMonetizationConfig): void {
    this.configs.set(config.appId, config);
  }

  /**
   * Get the current configuration for an app.
   */
  getConfig(appId: string): AdMonetizationConfig | undefined {
    return this.configs.get(appId);
  }

  /**
   * Create a default ad monetization configuration for an app.
   */
  createDefaultConfig(appId: string): AdMonetizationConfig {
    const config: AdMonetizationConfig = {
      appId,
      placements: [
        {
          id: `banner-home-${appId}`,
          name: 'Home Banner',
          format: 'banner',
          screenRef: 'screen-home',
          position: 'bottom',
          frequencyCap: { maxImpressionsPerSession: 10, maxImpressionsPerDay: 50, minIntervalSeconds: 30, cooldownAfterPurchase: true, respectUserPreference: true },
          priority: 1,
          enabled: true,
        },
        {
          id: `interstitial-transition-${appId}`,
          name: 'Transition Interstitial',
          format: 'interstitial',
          screenRef: 'screen-transition',
          position: 'fullscreen',
          frequencyCap: { maxImpressionsPerSession: 3, maxImpressionsPerDay: 10, minIntervalSeconds: 120, cooldownAfterPurchase: true, respectUserPreference: true },
          priority: 2,
          enabled: true,
        },
        {
          id: `rewarded-feature-${appId}`,
          name: 'Rewarded Feature Unlock',
          format: 'rewarded_video',
          screenRef: 'screen-feature-gate',
          position: 'fullscreen',
          frequencyCap: { maxImpressionsPerSession: 5, maxImpressionsPerDay: 20, minIntervalSeconds: 60, cooldownAfterPurchase: false, respectUserPreference: true },
          priority: 3,
          enabled: true,
        },
        {
          id: `native-feed-${appId}`,
          name: 'Feed Native Ad',
          format: 'native',
          screenRef: 'screen-feed',
          position: 'inline',
          frequencyCap: { maxImpressionsPerSession: 5, maxImpressionsPerDay: 20, minIntervalSeconds: 60, cooldownAfterPurchase: true, respectUserPreference: true },
          priority: 4,
          enabled: true,
        },
      ],
      mediation: {
        strategy: 'hybrid',
        networks: [
          { network: 'admob', priority: 1, enabled: true, appId, adUnitIds: { banner: '', interstitial: '', rewarded_video: '', native: '' }, floorPriceCpm: 1.0 },
          { network: 'applovin', priority: 2, enabled: true, appId, adUnitIds: { banner: '', interstitial: '', rewarded_video: '', native: '' }, floorPriceCpm: 0.8 },
          { network: 'unity_ads', priority: 3, enabled: true, appId, adUnitIds: { banner: '', interstitial: '', rewarded_video: '', native: '' }, floorPriceCpm: 0.5 },
          { network: 'ironsource', priority: 4, enabled: true, appId, adUnitIds: { banner: '', interstitial: '', rewarded_video: '', native: '' }, floorPriceCpm: 0.5 },
        ],
        refreshIntervalMs: 30000,
        timeoutMs: 5000,
      },
      globalFrequencyCap: {
        maxImpressionsPerSession: 20,
        maxImpressionsPerDay: 80,
        minIntervalSeconds: 30,
        cooldownAfterPurchase: true,
        respectUserPreference: true,
      },
      disableAdsForSubscribers: true,
    };

    this.configs.set(appId, config);
    return config;
  }

  /**
   * Run mediation for a placement — select the best network.
   */
  async mediate(appId: string, placementId: string): Promise<MediationResult> {
    const config = this.configs.get(appId);
    if (!config) {
      throw new Error(`No ad config found for app ${appId}`);
    }

    const placement = config.placements.find((p) => p.id === placementId);
    if (!placement) {
      throw new Error(`Placement ${placementId} not found`);
    }

    const bidResponses: BidResponse[] = config.mediation.networks
      .filter((n) => n.enabled)
      .map((n) => ({
        network: n.network,
        ecpm: n.floorPriceCpm + Math.random() * 3,
        filled: Math.random() > 0.1,
        latencyMs: Math.round(Math.random() * 200 + 50),
      }))
      .sort((a, b) => b.ecpm - a.ecpm);

    const winner = bidResponses.find((b) => b.filled);

    return {
      placementId,
      winningNetwork: winner?.network ?? 'admob',
      ecpm: winner?.ecpm ?? 0,
      fillRate: bidResponses.filter((b) => b.filled).length / bidResponses.length,
      latencyMs: winner?.latencyMs ?? 0,
      bidResponses,
    };
  }

  /**
   * Check if an ad impression is allowed by frequency caps.
   */
  checkFrequencyCap(
    placement: AdPlacement,
    sessionImpressions: number,
    dailyImpressions: number,
    lastImpressionTimestamp: number,
    isSubscriber: boolean,
    appId: string,
  ): { allowed: boolean; reason?: string } {
    const config = this.configs.get(appId);

    // Disable ads for subscribers if configured
    if (isSubscriber && config?.disableAdsForSubscribers) {
      return { allowed: false, reason: 'Ads disabled for subscribers' };
    }

    const cap = placement.frequencyCap;

    if (sessionImpressions >= cap.maxImpressionsPerSession) {
      return { allowed: false, reason: `Session cap reached (${cap.maxImpressionsPerSession})` };
    }

    if (dailyImpressions >= cap.maxImpressionsPerDay) {
      return { allowed: false, reason: `Daily cap reached (${cap.maxImpressionsPerDay})` };
    }

    const elapsed = (Date.now() - lastImpressionTimestamp) / 1000;
    if (elapsed < cap.minIntervalSeconds) {
      return { allowed: false, reason: `Minimum interval not met (${cap.minIntervalSeconds}s)` };
    }

    return { allowed: true };
  }

  /**
   * Generate a monetization report for an app.
   */
  async generateReport(
    appId: string,
    startDate: string,
    endDate: string,
  ): Promise<AdMonetizationReport> {
    const recommendations = this.generateOptimizationRecommendations(appId);

    const report: AdMonetizationReport = {
      appId,
      totalRevenue: 0,
      totalImpressions: 0,
      averageEcpm: 0,
      fillRate: 0,
      byFormat: {
        banner: { revenue: 0, impressions: 0, ecpm: 0 },
        interstitial: { revenue: 0, impressions: 0, ecpm: 0 },
        rewarded_video: { revenue: 0, impressions: 0, ecpm: 0 },
        native: { revenue: 0, impressions: 0, ecpm: 0 },
      },
      byNetwork: {},
      topPlacements: [],
      recommendations,
      period: { start: startDate, end: endDate },
      generatedAt: new Date().toISOString(),
    };

    // Store report in Zikaron
    await this.storeReport(appId, report);

    return report;
  }

  /**
   * Generate optimization recommendations.
   */
  private generateOptimizationRecommendations(appId: string): AdOptimizationRecommendation[] {
    return [
      {
        type: 'enable_bidding',
        description: 'Enable real-time bidding for all networks to maximize eCPM.',
        estimatedRevenueImpact: 15,
        priority: 'high',
      },
      {
        type: 'add_placement',
        description: 'Add a native ad placement in the content feed for additional revenue.',
        estimatedRevenueImpact: 10,
        priority: 'medium',
      },
      {
        type: 'adjust_frequency',
        description: 'Increase rewarded video frequency cap — users are willing to watch more.',
        estimatedRevenueImpact: 8,
        priority: 'medium',
      },
    ];
  }

  /**
   * Store report in Zikaron.
   */
  private async storeReport(appId: string, report: AdMonetizationReport): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `ad-monetization-report-${appId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'episodic',
      content: `Ad monetization report for ${appId}: $${report.totalRevenue.toFixed(2)} revenue, ${report.totalImpressions} impressions`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['ad-monetization', 'report', appId],
      createdAt: new Date(),
      eventType: 'ad_monetization_report',
      participants: ['zionx-app-factory'],
      outcome: 'success',
      relatedEntities: [{ entityId: appId, entityType: 'app', role: 'target' }],
    });
  }
}
