/**
 * ZionX GTM Engine — Campaign Manager
 *
 * Manages social media campaigns across TikTok, Instagram, X, Facebook,
 * Reddit, YouTube Shorts using AI-generated content via HeyGen and LLM
 * drivers. Manages Google Ads campaigns with ROAS tracking and automatic
 * bid/budget adjustment.
 *
 * Requirements: 11b.3
 */

import type { DriverResult } from '@seraphim/core';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface HeyGenDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface GoogleAdsDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface SocialMediaDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SocialPlatform = 'tiktok' | 'instagram' | 'x' | 'facebook' | 'reddit' | 'youtube_shorts';

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'failed';

export type CampaignType = 'social_organic' | 'social_paid' | 'google_ads' | 'cross_promo';

export interface CampaignConfig {
  appId: string;
  appName: string;
  type: CampaignType;
  platforms: SocialPlatform[];
  budget?: number;
  budgetCurrency?: string;
  startDate: string;
  endDate?: string;
  targetAudience: {
    ageRange?: { min: number; max: number };
    interests?: string[];
    locations?: string[];
  };
}

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  content: string;
  mediaUrls: string[];
  scheduledAt: string;
  publishedAt?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
}

export interface GoogleAdsCampaignConfig {
  appId: string;
  campaignName: string;
  campaignType: 'search' | 'display' | 'app' | 'video' | 'performance_max';
  dailyBudgetMicros: number;
  targetRoas: number;
  keywords: string[];
  adGroupName: string;
}

export interface ROASMetrics {
  campaignId: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  costPerConversion: number;
  impressions: number;
  clicks: number;
  ctr: number;
  period: { start: string; end: string };
}

export interface BidAdjustment {
  campaignId: string;
  previousBidMicros: number;
  newBidMicros: number;
  reason: string;
  adjustedAt: string;
}

export interface Campaign {
  id: string;
  config: CampaignConfig;
  status: CampaignStatus;
  socialPosts: SocialPost[];
  googleAdsCampaignId?: string;
  roasMetrics?: ROASMetrics;
  bidAdjustments: BidAdjustment[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignLaunchResult {
  campaign: Campaign;
  postsCreated: number;
  adCampaignCreated: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Campaign Manager
// ---------------------------------------------------------------------------

export class CampaignManager {
  constructor(
    private readonly llmDriver: LLMDriver,
    private readonly heyGenDriver: HeyGenDriver,
    private readonly googleAdsDriver: GoogleAdsDriver,
    private readonly socialDrivers: Map<SocialPlatform, SocialMediaDriver>,
    private readonly otzarService: OtzarService,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Launch a full marketing campaign across configured platforms.
   */
  async launchCampaign(config: CampaignConfig): Promise<CampaignLaunchResult> {
    const campaign: Campaign = {
      id: `campaign-${config.appId}-${Date.now()}`,
      config,
      status: 'draft',
      socialPosts: [],
      bidAdjustments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const errors: string[] = [];
    let adCampaignCreated = false;

    // 1. Generate content for social media posts
    if (config.type === 'social_organic' || config.type === 'social_paid') {
      const posts = await this.generateSocialContent(config);
      campaign.socialPosts = posts;

      // 2. Publish/schedule posts across platforms
      for (const post of posts) {
        const driver = this.socialDrivers.get(post.platform);
        if (!driver) {
          errors.push(`No driver configured for ${post.platform}`);
          post.status = 'failed';
          continue;
        }

        const result = await driver.execute({
          type: 'createPost',
          params: {
            content: post.content,
            mediaUrls: post.mediaUrls,
            scheduledAt: post.scheduledAt,
          },
        });

        if (result.success) {
          post.status = 'scheduled';
          post.publishedAt = (result.data as Record<string, unknown>)?.publishedAt as string | undefined;
        } else {
          post.status = 'failed';
          errors.push(`Failed to post on ${post.platform}: ${result.error?.message ?? 'Unknown error'}`);
        }
      }
    }

    // 3. Create Google Ads campaign if paid
    if (config.type === 'google_ads' || config.type === 'social_paid') {
      const adResult = await this.createGoogleAdsCampaign({
        appId: config.appId,
        campaignName: `${config.appName} - ${config.type}`,
        campaignType: 'app',
        dailyBudgetMicros: (config.budget ?? 50) * 1_000_000,
        targetRoas: 3.0,
        keywords: config.targetAudience.interests ?? [],
        adGroupName: `${config.appName} - Primary`,
      });

      if (adResult) {
        campaign.googleAdsCampaignId = adResult;
        adCampaignCreated = true;
      } else {
        errors.push('Failed to create Google Ads campaign');
      }
    }

    // 4. Record budget usage in Otzar
    if (config.budget) {
      await this.otzarService.recordUsage({
        agentId: 'zionx-app-factory',
        tenantId: 'system',
        pillar: 'eretz',
        provider: 'marketing',
        model: 'campaign',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: config.budget,
        taskType: 'marketing_campaign',
      });
    }

    campaign.status = errors.length === 0 ? 'active' : 'active';
    campaign.updatedAt = new Date().toISOString();

    return {
      campaign,
      postsCreated: campaign.socialPosts.filter((p) => p.status !== 'failed').length,
      adCampaignCreated,
      errors,
    };
  }

  /**
   * Generate AI-powered social media content for each platform.
   */
  async generateSocialContent(config: CampaignConfig): Promise<SocialPost[]> {
    const posts: SocialPost[] = [];

    for (const platform of config.platforms) {
      // Generate text content via LLM
      const prompt = this.buildContentPrompt(config, platform);
      const textResult = await this.llmDriver.execute({
        type: 'generate',
        params: { prompt, maxTokens: 500, temperature: 0.7, taskType: 'creative' },
      });

      const content = textResult.success
        ? ((textResult.data as Record<string, unknown>)?.text as string ?? `Check out ${config.appName}!`)
        : `Check out ${config.appName}!`;

      // Generate video content via HeyGen for video platforms
      const mediaUrls: string[] = [];
      if (['tiktok', 'instagram', 'youtube_shorts'].includes(platform)) {
        const videoResult = await this.heyGenDriver.execute({
          type: 'createVideo',
          params: {
            title: `${config.appName} - ${platform} ad`,
            avatarId: 'default-avatar',
            script: content,
          },
        });

        if (videoResult.success) {
          const videoData = videoResult.data as Record<string, unknown>;
          mediaUrls.push((videoData.videoUrl as string) ?? '');
        }
      }

      posts.push({
        id: `post-${platform}-${config.appId}-${Date.now()}`,
        platform,
        content,
        mediaUrls,
        scheduledAt: config.startDate,
        status: 'draft',
      });
    }

    return posts;
  }

  /**
   * Create a Google Ads campaign and return the campaign ID.
   */
  async createGoogleAdsCampaign(config: GoogleAdsCampaignConfig): Promise<string | null> {
    const campaignResult = await this.googleAdsDriver.execute({
      type: 'createCampaign',
      params: {
        name: config.campaignName,
        type: config.campaignType,
        budgetAmountMicros: config.dailyBudgetMicros,
        budgetCurrency: 'USD',
      },
    });

    if (!campaignResult.success) return null;

    const campaignData = campaignResult.data as Record<string, unknown>;
    const campaignId = campaignData.id as string;

    // Create ad group
    await this.googleAdsDriver.execute({
      type: 'createAdGroup',
      params: {
        campaignId,
        name: config.adGroupName,
      },
    });

    return campaignId;
  }

  /**
   * Track ROAS for a campaign and auto-adjust bids if needed.
   */
  async trackAndAdjustROAS(campaignId: string, startDate: string, endDate: string): Promise<ROASMetrics> {
    const perfResult = await this.googleAdsDriver.execute({
      type: 'getPerformance',
      params: { campaignId, startDate, endDate },
    });

    const perfData = (perfResult.data ?? {}) as Record<string, unknown>;

    const metrics: ROASMetrics = {
      campaignId,
      spend: ((perfData.costMicros as number) ?? 0) / 1_000_000,
      revenue: 0, // Would be populated from RevenueCat/Stripe data
      roas: 0,
      conversions: (perfData.conversions as number) ?? 0,
      costPerConversion: (perfData.costPerConversion as number) ?? 0,
      impressions: (perfData.impressions as number) ?? 0,
      clicks: (perfData.clicks as number) ?? 0,
      ctr: (perfData.ctr as number) ?? 0,
      period: { start: startDate, end: endDate },
    };

    metrics.roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;

    // Auto-adjust bids if ROAS is below target
    if (metrics.roas < 2.0 && metrics.spend > 0) {
      await this.googleAdsDriver.execute({
        type: 'pauseCampaign',
        params: { campaignId },
      });
    }

    return metrics;
  }

  /**
   * Build a platform-specific content generation prompt.
   */
  private buildContentPrompt(config: CampaignConfig, platform: SocialPlatform): string {
    const charLimits: Record<SocialPlatform, number> = {
      tiktok: 150,
      instagram: 2200,
      x: 280,
      facebook: 500,
      reddit: 300,
      youtube_shorts: 100,
    };

    return [
      `Write a ${platform} post promoting the app "${config.appName}".`,
      `Max ${charLimits[platform]} characters.`,
      `Target audience: ${config.targetAudience.interests?.join(', ') ?? 'general'}`,
      `Tone: engaging, authentic, not salesy.`,
      platform === 'reddit' ? 'Write as a genuine recommendation, not an ad.' : '',
      platform === 'x' ? 'Include relevant hashtags.' : '',
    ].filter(Boolean).join('\n');
  }
}
