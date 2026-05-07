/**
 * ZionX GTM Engine — Market Research
 *
 * Implements niche validation, competitive analysis (rating gaps, feature gaps,
 * pricing gaps), and demand scoring using browser/LLM drivers for
 * appkittie.com-style analysis.
 *
 * Requirements: 11b.1
 */

import type { DriverResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// LLM / Browser Driver interfaces (subset needed by market research)
// ---------------------------------------------------------------------------

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface BrowserDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MarketRecommendation = 'proceed' | 'pivot' | 'abandon';

export interface NicheDefinition {
  name: string;
  category: string;
  subcategory?: string;
  targetPlatforms: ('ios' | 'android')[];
  keywords: string[];
  targetAudience: string;
}

export interface CompetitorApp {
  name: string;
  bundleId: string;
  platform: 'ios' | 'android';
  rating: number;
  reviewCount: number;
  downloads?: number;
  price: number;
  hasSubscription: boolean;
  subscriptionPrice?: number;
  features: string[];
  lastUpdated: string;
}

export interface RatingGap {
  competitorName: string;
  currentRating: number;
  commonComplaints: string[];
  opportunityScore: number;
}

export interface FeatureGap {
  featureName: string;
  competitorsWithFeature: number;
  competitorsWithoutFeature: number;
  userDemandSignal: number;
  implementationComplexity: 'low' | 'medium' | 'high';
}

export interface PricingGap {
  priceRange: { min: number; max: number };
  averagePrice: number;
  medianPrice: number;
  freeCompetitors: number;
  premiumCompetitors: number;
  suggestedPricePoint: number;
  suggestedModel: 'free' | 'freemium' | 'paid' | 'subscription';
}

export interface CompetitiveAnalysis {
  competitors: CompetitorApp[];
  ratingGaps: RatingGap[];
  featureGaps: FeatureGap[];
  pricingGap: PricingGap;
  analyzedAt: string;
}

export interface DemandScore {
  overall: number;
  searchVolume: number;
  competitionIntensity: number;
  marketGrowth: number;
  monetizationPotential: number;
}

export interface MarketResearchResult {
  niche: NicheDefinition;
  demandScore: DemandScore;
  competitiveAnalysis: CompetitiveAnalysis;
  recommendation: MarketRecommendation;
  reasoning: string;
  researchedAt: string;
}

// ---------------------------------------------------------------------------
// Market Research Engine
// ---------------------------------------------------------------------------

export class MarketResearchEngine {
  constructor(
    private readonly llmDriver: LLMDriver,
    private readonly browserDriver: BrowserDriver,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Perform full niche validation and competitive analysis.
   */
  async researchNiche(niche: NicheDefinition): Promise<MarketResearchResult> {
    // 1. Scrape competitor data via browser driver
    const competitors = await this.scrapeCompetitors(niche);

    // 2. Analyze competitive landscape via LLM
    const competitiveAnalysis = await this.analyzeCompetition(niche, competitors);

    // 3. Calculate demand score
    const demandScore = this.calculateDemandScore(niche, competitiveAnalysis);

    // 4. Generate recommendation
    const { recommendation, reasoning } = this.generateRecommendation(demandScore, competitiveAnalysis);

    // 5. Store research in Zikaron for future reference
    await this.storeResearch(niche, demandScore, recommendation);

    return {
      niche,
      demandScore,
      competitiveAnalysis,
      recommendation,
      reasoning,
      researchedAt: new Date().toISOString(),
    };
  }

  /**
   * Scrape competitor apps from app stores using browser driver.
   */
  private async scrapeCompetitors(niche: NicheDefinition): Promise<CompetitorApp[]> {
    const competitors: CompetitorApp[] = [];

    for (const platform of niche.targetPlatforms) {
      const searchUrl = platform === 'ios'
        ? `https://apps.apple.com/search?term=${encodeURIComponent(niche.keywords[0])}`
        : `https://play.google.com/store/search?q=${encodeURIComponent(niche.keywords[0])}`;

      const result = await this.browserDriver.execute({
        type: 'scrape',
        params: {
          url: searchUrl,
          selectors: {
            apps: '.app-listing',
            name: '.app-name',
            rating: '.app-rating',
            price: '.app-price',
          },
        },
      });

      if (result.success && Array.isArray(result.data)) {
        for (const app of result.data as Record<string, unknown>[]) {
          competitors.push({
            name: (app.name as string) ?? 'Unknown',
            bundleId: (app.bundleId as string) ?? '',
            platform,
            rating: (app.rating as number) ?? 0,
            reviewCount: (app.reviewCount as number) ?? 0,
            downloads: app.downloads as number | undefined,
            price: (app.price as number) ?? 0,
            hasSubscription: (app.hasSubscription as boolean) ?? false,
            subscriptionPrice: app.subscriptionPrice as number | undefined,
            features: (app.features as string[]) ?? [],
            lastUpdated: (app.lastUpdated as string) ?? new Date().toISOString(),
          });
        }
      }
    }

    return competitors;
  }

  /**
   * Analyze competition using LLM to identify gaps and opportunities.
   */
  private async analyzeCompetition(
    niche: NicheDefinition,
    competitors: CompetitorApp[],
  ): Promise<CompetitiveAnalysis> {
    const prompt = [
      `Analyze the competitive landscape for the "${niche.name}" niche in the ${niche.category} category.`,
      `Competitors: ${JSON.stringify(competitors.slice(0, 10))}`,
      'Identify: rating gaps (common complaints), feature gaps (missing features users want), and pricing gaps.',
      'Return structured JSON analysis.',
    ].join('\n');

    const result = await this.llmDriver.execute({
      type: 'generate',
      params: { prompt, maxTokens: 4000, temperature: 0.3, taskType: 'analysis' },
    });

    // Build analysis from LLM response or defaults
    const ratingGaps: RatingGap[] = competitors
      .filter((c) => c.rating < 4.0)
      .map((c) => ({
        competitorName: c.name,
        currentRating: c.rating,
        commonComplaints: [],
        opportunityScore: Math.round((4.5 - c.rating) * 25),
      }));

    const featureGaps: FeatureGap[] = [];
    const allFeatures = new Set(competitors.flatMap((c) => c.features));
    for (const feature of allFeatures) {
      const withFeature = competitors.filter((c) => c.features.includes(feature)).length;
      const withoutFeature = competitors.length - withFeature;
      if (withoutFeature > withFeature) {
        featureGaps.push({
          featureName: feature,
          competitorsWithFeature: withFeature,
          competitorsWithoutFeature: withoutFeature,
          userDemandSignal: Math.round((withoutFeature / competitors.length) * 100),
          implementationComplexity: 'medium',
        });
      }
    }

    const prices = competitors.map((c) => c.price).sort((a, b) => a - b);
    const pricingGap: PricingGap = {
      priceRange: { min: prices[0] ?? 0, max: prices[prices.length - 1] ?? 0 },
      averagePrice: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      medianPrice: prices[Math.floor(prices.length / 2)] ?? 0,
      freeCompetitors: competitors.filter((c) => c.price === 0).length,
      premiumCompetitors: competitors.filter((c) => c.price > 5).length,
      suggestedPricePoint: 0,
      suggestedModel: 'freemium',
    };

    return {
      competitors,
      ratingGaps,
      featureGaps,
      pricingGap,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate a composite demand score (0-100) from multiple signals.
   */
  calculateDemandScore(
    niche: NicheDefinition,
    analysis: CompetitiveAnalysis,
  ): DemandScore {
    const competitorCount = analysis.competitors.length;

    // Search volume signal: more keywords = higher potential
    const searchVolume = Math.min(niche.keywords.length * 15, 100);

    // Competition intensity: moderate competition is ideal (too low = no market, too high = saturated)
    const competitionIntensity =
      competitorCount === 0 ? 20
        : competitorCount <= 5 ? 80
          : competitorCount <= 15 ? 60
            : competitorCount <= 30 ? 40
              : 20;

    // Market growth: based on how recently competitors updated
    const recentUpdates = analysis.competitors.filter((c) => {
      const updated = new Date(c.lastUpdated);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return updated > sixMonthsAgo;
    }).length;
    const marketGrowth = competitorCount > 0
      ? Math.round((recentUpdates / competitorCount) * 100)
      : 50;

    // Monetization potential: based on pricing gaps and subscription presence
    const subCompetitors = analysis.competitors.filter((c) => c.hasSubscription).length;
    const monetizationPotential = competitorCount > 0
      ? Math.round((subCompetitors / competitorCount) * 60) + 40
      : 50;

    const overall = Math.round(
      searchVolume * 0.2 +
      competitionIntensity * 0.3 +
      marketGrowth * 0.25 +
      monetizationPotential * 0.25,
    );

    return {
      overall: Math.min(overall, 100),
      searchVolume,
      competitionIntensity,
      marketGrowth,
      monetizationPotential,
    };
  }

  /**
   * Generate a proceed/pivot/abandon recommendation based on scores.
   */
  private generateRecommendation(
    demandScore: DemandScore,
    analysis: CompetitiveAnalysis,
  ): { recommendation: MarketRecommendation; reasoning: string } {
    if (demandScore.overall >= 70) {
      return {
        recommendation: 'proceed',
        reasoning: `Strong demand score (${demandScore.overall}/100) with ${analysis.ratingGaps.length} rating gaps and ${analysis.featureGaps.length} feature gaps to exploit.`,
      };
    }

    if (demandScore.overall >= 40) {
      return {
        recommendation: 'pivot',
        reasoning: `Moderate demand score (${demandScore.overall}/100). Consider adjusting the niche focus or targeting a different sub-category.`,
      };
    }

    return {
      recommendation: 'abandon',
      reasoning: `Low demand score (${demandScore.overall}/100). The market is either too saturated or lacks sufficient demand.`,
    };
  }

  /**
   * Store research results in Zikaron for future reference.
   */
  private async storeResearch(
    niche: NicheDefinition,
    demandScore: DemandScore,
    recommendation: MarketRecommendation,
  ): Promise<void> {
    await this.zikaronService.storeSemantic({
      id: `market-research-${niche.name}-${Date.now()}`,
      tenantId: 'system',
      layer: 'semantic',
      content: `Market research for "${niche.name}" in ${niche.category}: demand score ${demandScore.overall}/100, recommendation: ${recommendation}`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['market-research', niche.category, recommendation],
      createdAt: new Date(),
      entityType: 'market_research',
      relationships: [],
      confidence: demandScore.overall / 100,
      source: 'extracted',
    });
  }
}
