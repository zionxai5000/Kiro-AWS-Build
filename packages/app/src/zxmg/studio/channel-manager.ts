/**
 * ZXMG Video Development Studio — Channel Manager
 *
 * Manages channel configurations, analytics tracking, and health monitoring.
 * Supports creating, updating, and deleting channels, retrieving analytics
 * data, and computing channel health status with alerts for declining metrics.
 *
 * Requirements: 44a.1, 44a.2, 44a.3
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelConfig {
  channelId: string;
  channelName: string;
  niche: string;
  toneOfVoice: string;
  postingCadence: string; // e.g., "3x per week"
  targetAudience: string;
  contentPillars: string[];
  platform: 'youtube';
  youtubeChannelId?: string;
  createdAt: Date;
}

export interface ChannelAnalytics {
  channelId: string;
  subscribers: number;
  totalViews: number;
  avgRetention: number;
  clickThroughRate: number;
  growthRate: number; // % per month
  revenue: number;
  lastUpdated: Date;
}

export type ChannelStatus = 'healthy' | 'warning' | 'declining';
export type Trend = 'up' | 'stable' | 'down';

export interface ChannelHealth {
  channelId: string;
  status: ChannelStatus;
  growthTrend: Trend;
  engagementTrend: Trend;
  alerts: string[];
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface AnalyticsProvider {
  fetchAnalytics(channelId: string): Promise<ChannelAnalytics>;
  fetchHistoricalGrowth(channelId: string): Promise<number[]>; // last N months growth rates
  fetchHistoricalEngagement(channelId: string): Promise<number[]>; // last N months CTR values
}

export interface ChannelStore {
  save(config: ChannelConfig): Promise<void>;
  get(channelId: string): Promise<ChannelConfig | null>;
  delete(channelId: string): Promise<void>;
  list(): Promise<ChannelConfig[]>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface ChannelManager {
  createChannel(config: Omit<ChannelConfig, 'channelId' | 'createdAt'>): Promise<ChannelConfig>;
  getChannel(channelId: string): Promise<ChannelConfig | null>;
  updateChannel(channelId: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig>;
  deleteChannel(channelId: string): Promise<void>;
  listChannels(): Promise<ChannelConfig[]>;
  getAnalytics(channelId: string): Promise<ChannelAnalytics>;
  getHealth(channelId: string): Promise<ChannelHealth>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of ChannelManager.
 *
 * Uses dependency injection for storage and analytics retrieval.
 * Computes health status based on growth and engagement trends with
 * configurable thresholds for alerts.
 */
export class DefaultChannelManager implements ChannelManager {
  private static readonly GROWTH_DECLINE_THRESHOLD = 0;
  private static readonly CTR_WARNING_THRESHOLD = 3;
  private static readonly RETENTION_WARNING_THRESHOLD = 40;

  private idCounter = 0;

  constructor(
    private readonly store: ChannelStore,
    private readonly analyticsProvider: AnalyticsProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Creates a new channel configuration and persists it.
   */
  async createChannel(config: Omit<ChannelConfig, 'channelId' | 'createdAt'>): Promise<ChannelConfig> {
    const channelId = this.generateId();
    const fullConfig: ChannelConfig = {
      ...config,
      channelId,
      createdAt: new Date(),
    };

    await this.store.save(fullConfig);
    return fullConfig;
  }

  /**
   * Retrieves a channel by ID.
   */
  async getChannel(channelId: string): Promise<ChannelConfig | null> {
    return this.store.get(channelId);
  }

  /**
   * Updates a channel's configuration. Throws if channel not found.
   */
  async updateChannel(channelId: string, updates: Partial<ChannelConfig>): Promise<ChannelConfig> {
    const existing = await this.store.get(channelId);
    if (!existing) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const updated: ChannelConfig = {
      ...existing,
      ...updates,
      channelId: existing.channelId, // prevent overwriting ID
      createdAt: existing.createdAt, // prevent overwriting creation date
    };

    await this.store.save(updated);
    return updated;
  }

  /**
   * Deletes a channel by ID.
   */
  async deleteChannel(channelId: string): Promise<void> {
    await this.store.delete(channelId);
  }

  /**
   * Lists all channels.
   */
  async listChannels(): Promise<ChannelConfig[]> {
    return this.store.list();
  }

  /**
   * Retrieves current analytics for a channel.
   */
  async getAnalytics(channelId: string): Promise<ChannelAnalytics> {
    return this.analyticsProvider.fetchAnalytics(channelId);
  }

  /**
   * Computes channel health based on analytics trends.
   * Generates alerts for declining metrics.
   */
  async getHealth(channelId: string): Promise<ChannelHealth> {
    const analytics = await this.analyticsProvider.fetchAnalytics(channelId);
    const growthHistory = await this.analyticsProvider.fetchHistoricalGrowth(channelId);
    const engagementHistory = await this.analyticsProvider.fetchHistoricalEngagement(channelId);

    const growthTrend = this.computeTrend(growthHistory);
    const engagementTrend = this.computeTrend(engagementHistory);
    const alerts = this.generateAlerts(analytics, growthTrend, engagementTrend);
    const status = this.computeStatus(growthTrend, engagementTrend, alerts);

    return {
      channelId,
      status,
      growthTrend,
      engagementTrend,
      alerts,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private generateId(): string {
    this.idCounter++;
    return `ch-${Date.now()}-${this.idCounter}`;
  }

  /**
   * Computes a trend direction from a series of values.
   * Looks at the last 3 values to determine direction.
   */
  private computeTrend(values: number[]): Trend {
    if (values.length < 2) return 'stable';

    const recent = values.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const diff = last - first;

    if (diff > 0.5) return 'up';
    if (diff < -0.5) return 'down';
    return 'stable';
  }

  /**
   * Generates health alerts based on current analytics and trends.
   */
  private generateAlerts(
    analytics: ChannelAnalytics,
    growthTrend: Trend,
    engagementTrend: Trend,
  ): string[] {
    const alerts: string[] = [];

    if (analytics.growthRate < DefaultChannelManager.GROWTH_DECLINE_THRESHOLD) {
      alerts.push('Subscriber growth rate is negative');
    }

    if (analytics.clickThroughRate < DefaultChannelManager.CTR_WARNING_THRESHOLD) {
      alerts.push('Click-through rate below 3% threshold');
    }

    if (analytics.avgRetention < DefaultChannelManager.RETENTION_WARNING_THRESHOLD) {
      alerts.push('Average retention below 40% threshold');
    }

    if (growthTrend === 'down') {
      alerts.push('Growth trend is declining over recent months');
    }

    if (engagementTrend === 'down') {
      alerts.push('Engagement trend is declining over recent months');
    }

    return alerts;
  }

  /**
   * Computes overall channel status from trends and alerts.
   */
  private computeStatus(growthTrend: Trend, engagementTrend: Trend, alerts: string[]): ChannelStatus {
    if (growthTrend === 'down' && engagementTrend === 'down') {
      return 'declining';
    }
    if (alerts.length >= 2) {
      return 'declining';
    }
    if (alerts.length >= 1 || growthTrend === 'down' || engagementTrend === 'down') {
      return 'warning';
    }
    return 'healthy';
  }
}
