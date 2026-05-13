/**
 * ZionX Autonomous App Ideation Engine — Market Research Engine
 *
 * Orchestrates autonomous market research across Apple App Store and Google
 * Play Store. Scans category rankings, analyzes competitor apps, identifies
 * review gaps and emerging niches, and persists findings to Zikaron.
 *
 * Requirements: 45a.1, 45a.2, 45a.3, 45a.4
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppStore = 'apple' | 'google';

export interface CategoryRanking {
  category: string;
  store: AppStore;
  topApps: RankedApp[];
  revenueEstimate: number;
  competitionDensity: number;
  growthTrend: 'rising' | 'stable' | 'declining';
}

export interface RankedApp {
  name: string;
  rank: number;
  rating: number;
  reviewCount: number;
  revenueEstimate: number;
  downloads: number;
}

export interface CompetitorAnalysis {
  appName: string;
  store: AppStore;
  weaknesses: string[];
  missingFeatures: string[];
  userComplaints: string[];
  rating: number;
  reviewCount: number;
}

export interface ReviewGap {
  category: string;
  store: AppStore;
  unmetNeed: string;
  sentimentScore: number;
  mentionCount: number;
  confidence: number;
}

export interface EmergingNiche {
  name: string;
  category: string;
  store: AppStore;
  demandSignal: number;
  supplyLevel: number;
  growthVelocity: number;
  confidence: number;
}

export interface ResearchFinding {
  id: string;
  type: 'category_ranking' | 'competitor_analysis' | 'review_gap' | 'emerging_niche';
  source: AppStore;
  confidence: number;
  category: string;
  timestamp: Date;
  relevanceTags: string[];
  data: CategoryRanking | CompetitorAnalysis | ReviewGap | EmergingNiche;
}

export interface ResearchCycleResult {
  id: string;
  startedAt: Date;
  completedAt: Date;
  categoryRankings: CategoryRanking[];
  competitorAnalyses: CompetitorAnalysis[];
  reviewGaps: ReviewGap[];
  emergingNiches: EmergingNiche[];
  findingsCount: number;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces
// ---------------------------------------------------------------------------

export interface EventBusPublisher {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ZikaronStorage {
  store(entry: {
    id: string;
    tenantId: string;
    layer: string;
    content: string;
    tags: string[];
    sourceAgentId: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface AppStoreDataProvider {
  getCategories(store: AppStore): Promise<string[]>;
  getCategoryRankings(store: AppStore, category: string): Promise<RankedApp[]>;
  getAppReviews(store: AppStore, appName: string): Promise<{ text: string; rating: number }[]>;
  getTrendingApps(store: AppStore): Promise<RankedApp[]>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MarketResearchConfig {
  eventBus: EventBusPublisher;
  zikaron: ZikaronStorage;
  dataProvider: AppStoreDataProvider;
  categories?: string[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface MarketResearchEngine {
  runResearchCycle(): Promise<ResearchCycleResult>;
  scanAppStoreCategory(store: AppStore, category: string): Promise<CategoryRanking>;
  analyzeCompetitorApps(store: AppStore, category: string): Promise<CompetitorAnalysis[]>;
  identifyReviewGaps(store: AppStore, category: string): Promise<ReviewGap[]>;
  detectEmergingNiches(store: AppStore): Promise<EmergingNiche[]>;
  storeResearchFindings(findings: ResearchFinding[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Categories
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES = [
  'productivity',
  'health-fitness',
  'finance',
  'education',
  'entertainment',
  'social',
  'utilities',
  'lifestyle',
];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class MarketResearchEngineImpl implements MarketResearchEngine {
  private readonly eventBus: EventBusPublisher;
  private readonly zikaron: ZikaronStorage;
  private readonly dataProvider: AppStoreDataProvider;
  private readonly categories: string[];

  constructor(config: MarketResearchConfig) {
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
    this.dataProvider = config.dataProvider;
    this.categories = config.categories ?? DEFAULT_CATEGORIES;
  }

  /**
   * Orchestrate a full market scan across Apple App Store and Google Play Store.
   * Scans categories, analyzes competitors, identifies review gaps and niches.
   * Requirement 45a.1, 45a.3
   */
  async runResearchCycle(): Promise<ResearchCycleResult> {
    const startedAt = new Date();
    const stores: AppStore[] = ['apple', 'google'];

    const categoryRankings: CategoryRanking[] = [];
    const competitorAnalyses: CompetitorAnalysis[] = [];
    const reviewGaps: ReviewGap[] = [];
    const emergingNiches: EmergingNiche[] = [];

    for (const store of stores) {
      for (const category of this.categories) {
        const ranking = await this.scanAppStoreCategory(store, category);
        categoryRankings.push(ranking);

        const competitors = await this.analyzeCompetitorApps(store, category);
        competitorAnalyses.push(...competitors);

        const gaps = await this.identifyReviewGaps(store, category);
        reviewGaps.push(...gaps);
      }

      const niches = await this.detectEmergingNiches(store);
      emergingNiches.push(...niches);
    }

    // Persist all findings
    const findings = this.buildFindings(
      categoryRankings,
      competitorAnalyses,
      reviewGaps,
      emergingNiches,
    );
    await this.storeResearchFindings(findings);

    const completedAt = new Date();
    const result: ResearchCycleResult = {
      id: randomUUID(),
      startedAt,
      completedAt,
      categoryRankings,
      competitorAnalyses,
      reviewGaps,
      emergingNiches,
      findingsCount: findings.length,
    };

    // Emit app.idea.researched hook (Requirement 45a.4)
    await this.eventBus.publish({
      source: 'zionx.ideation',
      type: 'app.idea.researched',
      detail: {
        cycleId: result.id,
        categoriesScanned: this.categories.length * stores.length,
        findingsCount: findings.length,
        emergingNichesCount: emergingNiches.length,
        reviewGapsCount: reviewGaps.length,
        competitorAnalysesCount: competitorAnalyses.length,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: result.id,
        timestamp: completedAt,
      },
    });

    return result;
  }

  /**
   * Analyze category rankings, top apps, revenue data, and growth trends per store.
   * Requirement 45a.3
   */
  async scanAppStoreCategory(store: AppStore, category: string): Promise<CategoryRanking> {
    const topApps = await this.dataProvider.getCategoryRankings(store, category);

    const totalRevenue = topApps.reduce((sum, app) => sum + app.revenueEstimate, 0);
    const competitionDensity = this.calculateCompetitionDensity(topApps);
    const growthTrend = this.assessGrowthTrend(topApps);

    return {
      category,
      store,
      topApps,
      revenueEstimate: totalRevenue,
      competitionDensity,
      growthTrend,
    };
  }

  /**
   * Identify competitor weaknesses, missing features, and user complaints from reviews.
   * Requirement 45a.1
   */
  async analyzeCompetitorApps(store: AppStore, category: string): Promise<CompetitorAnalysis[]> {
    const topApps = await this.dataProvider.getCategoryRankings(store, category);
    const analyses: CompetitorAnalysis[] = [];

    for (const app of topApps.slice(0, 5)) {
      const reviews = await this.dataProvider.getAppReviews(store, app.name);

      const negativeReviews = reviews.filter((r) => r.rating <= 3);
      const complaints = this.extractComplaints(negativeReviews);
      const missingFeatures = this.extractMissingFeatures(negativeReviews);
      const weaknesses = this.identifyWeaknesses(app, negativeReviews);

      analyses.push({
        appName: app.name,
        store,
        weaknesses,
        missingFeatures,
        userComplaints: complaints,
        rating: app.rating,
        reviewCount: app.reviewCount,
      });
    }

    return analyses;
  }

  /**
   * Detect unmet user needs from review sentiment analysis.
   * Requirement 45a.1
   */
  async identifyReviewGaps(store: AppStore, category: string): Promise<ReviewGap[]> {
    const topApps = await this.dataProvider.getCategoryRankings(store, category);
    const gaps: ReviewGap[] = [];

    const allReviews: { text: string; rating: number }[] = [];
    for (const app of topApps.slice(0, 5)) {
      const reviews = await this.dataProvider.getAppReviews(store, app.name);
      allReviews.push(...reviews);
    }

    const negativeReviews = allReviews.filter((r) => r.rating <= 3);
    const needClusters = this.clusterUnmetNeeds(negativeReviews);

    for (const cluster of needClusters) {
      gaps.push({
        category,
        store,
        unmetNeed: cluster.need,
        sentimentScore: cluster.sentimentScore,
        mentionCount: cluster.count,
        confidence: Math.min(cluster.count / 10, 1.0),
      });
    }

    return gaps;
  }

  /**
   * Identify rising niches with high demand and low supply.
   * Requirement 45a.1
   */
  async detectEmergingNiches(store: AppStore): Promise<EmergingNiche[]> {
    const trending = await this.dataProvider.getTrendingApps(store);
    const categories = await this.dataProvider.getCategories(store);
    const niches: EmergingNiche[] = [];

    for (const category of categories) {
      const categoryApps = await this.dataProvider.getCategoryRankings(store, category);
      const trendingInCategory = trending.filter((t) =>
        categoryApps.some((a) => a.name === t.name),
      );

      if (trendingInCategory.length > 0) {
        const demandSignal = trendingInCategory.reduce((sum, a) => sum + a.downloads, 0);
        const supplyLevel = categoryApps.length;
        const avgGrowth = trendingInCategory.reduce((sum, a) => sum + a.downloads, 0) / trendingInCategory.length;

        if (demandSignal > 0 && supplyLevel < 20) {
          niches.push({
            name: `${category}-emerging`,
            category,
            store,
            demandSignal,
            supplyLevel,
            growthVelocity: avgGrowth,
            confidence: Math.min(demandSignal / 100000, 1.0),
          });
        }
      }
    }

    return niches;
  }

  /**
   * Persist all findings to Zikaron with structured metadata.
   * Requirement 45a.2
   */
  async storeResearchFindings(findings: ResearchFinding[]): Promise<void> {
    for (const finding of findings) {
      await this.zikaron.store({
        id: finding.id,
        tenantId: 'house-of-zion',
        layer: 'procedural',
        content: JSON.stringify(finding.data),
        tags: [
          'market-research',
          finding.type,
          finding.source,
          finding.category,
          ...finding.relevanceTags,
        ],
        sourceAgentId: 'zionx-ideation-engine',
        createdAt: finding.timestamp,
        metadata: {
          type: finding.type,
          source: finding.source,
          confidence: finding.confidence,
          category: finding.category,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private calculateCompetitionDensity(apps: RankedApp[]): number {
    if (apps.length === 0) return 0;
    const highRatedApps = apps.filter((a) => a.rating >= 4.0);
    return highRatedApps.length / Math.max(apps.length, 1);
  }

  private assessGrowthTrend(apps: RankedApp[]): 'rising' | 'stable' | 'declining' {
    if (apps.length === 0) return 'stable';
    const avgDownloads = apps.reduce((sum, a) => sum + a.downloads, 0) / apps.length;
    if (avgDownloads > 50000) return 'rising';
    if (avgDownloads < 10000) return 'declining';
    return 'stable';
  }

  private extractComplaints(reviews: { text: string; rating: number }[]): string[] {
    const complaints: string[] = [];
    for (const review of reviews) {
      if (review.text.length > 10) {
        complaints.push(review.text.slice(0, 100));
      }
    }
    return complaints.slice(0, 10);
  }

  private extractMissingFeatures(reviews: { text: string; rating: number }[]): string[] {
    const features: string[] = [];
    const featureKeywords = ['wish', 'need', 'missing', 'should have', 'would be nice', 'please add'];
    for (const review of reviews) {
      const lower = review.text.toLowerCase();
      if (featureKeywords.some((kw) => lower.includes(kw))) {
        features.push(review.text.slice(0, 100));
      }
    }
    return features.slice(0, 10);
  }

  private identifyWeaknesses(app: RankedApp, negativeReviews: { text: string; rating: number }[]): string[] {
    const weaknesses: string[] = [];
    if (app.rating < 4.0) {
      weaknesses.push('Below average rating');
    }
    if (negativeReviews.length > app.reviewCount * 0.3) {
      weaknesses.push('High proportion of negative reviews');
    }
    const bugMentions = negativeReviews.filter((r) =>
      r.text.toLowerCase().includes('bug') || r.text.toLowerCase().includes('crash'),
    );
    if (bugMentions.length > 0) {
      weaknesses.push('Stability issues reported');
    }
    return weaknesses;
  }

  private clusterUnmetNeeds(reviews: { text: string; rating: number }[]): { need: string; sentimentScore: number; count: number }[] {
    const needKeywords = ['wish', 'need', 'missing', 'want', 'should', 'please'];
    const clusters = new Map<string, { count: number; totalRating: number }>();

    for (const review of reviews) {
      const lower = review.text.toLowerCase();
      for (const keyword of needKeywords) {
        if (lower.includes(keyword)) {
          const key = keyword;
          const existing = clusters.get(key) ?? { count: 0, totalRating: 0 };
          existing.count += 1;
          existing.totalRating += review.rating;
          clusters.set(key, existing);
        }
      }
    }

    return Array.from(clusters.entries())
      .filter(([, v]) => v.count >= 2)
      .map(([need, v]) => ({
        need: `Users ${need} additional functionality`,
        sentimentScore: v.totalRating / v.count / 5,
        count: v.count,
      }));
  }

  private buildFindings(
    rankings: CategoryRanking[],
    competitors: CompetitorAnalysis[],
    gaps: ReviewGap[],
    niches: EmergingNiche[],
  ): ResearchFinding[] {
    const findings: ResearchFinding[] = [];
    const now = new Date();

    for (const ranking of rankings) {
      findings.push({
        id: randomUUID(),
        type: 'category_ranking',
        source: ranking.store,
        confidence: 0.9,
        category: ranking.category,
        timestamp: now,
        relevanceTags: ['rankings', 'revenue', ranking.growthTrend],
        data: ranking,
      });
    }

    for (const competitor of competitors) {
      findings.push({
        id: randomUUID(),
        type: 'competitor_analysis',
        source: competitor.store,
        confidence: 0.75,
        category: 'competitor',
        timestamp: now,
        relevanceTags: ['competitor', 'weaknesses', 'gaps'],
        data: competitor,
      });
    }

    for (const gap of gaps) {
      findings.push({
        id: randomUUID(),
        type: 'review_gap',
        source: gap.store,
        confidence: gap.confidence,
        category: gap.category,
        timestamp: now,
        relevanceTags: ['review-gap', 'unmet-need', 'sentiment'],
        data: gap,
      });
    }

    for (const niche of niches) {
      findings.push({
        id: randomUUID(),
        type: 'emerging_niche',
        source: niche.store,
        confidence: niche.confidence,
        category: niche.category,
        timestamp: now,
        relevanceTags: ['emerging', 'niche', 'growth'],
        data: niche,
      });
    }

    return findings;
  }
}
