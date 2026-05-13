/**
 * ZXMG Video Development Studio — Trend Intelligence Engine
 *
 * Performs real-time analysis of trending video styles, algorithm signals,
 * competitor performance, audience retention patterns, content gaps, and
 * viral patterns across YouTube, TikTok, and Instagram. Stores all research
 * findings in Zikaron procedural memory with confidence scores.
 *
 * Requirements: 44e.24, 44e.25, 44e.26, 44e.27, 44e.28, 44e.29
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = 'youtube' | 'tiktok' | 'instagram';

export interface TrendingTopic {
  id: string;
  topic: string;
  platform: Platform;
  velocity: number; // how fast it's growing (0-100)
  relevanceScore: number; // relevance to channel niche (0-100)
  competition: 'low' | 'medium' | 'high';
  searchVolume: number;
  detectedAt: Date;
}

export interface AlgorithmSignal {
  id: string;
  platform: Platform;
  signalType:
    | 'format_boost'
    | 'topic_boost'
    | 'length_preference'
    | 'engagement_signal';
  description: string;
  confidence: number; // 0-100
  detectedAt: Date;
  recommendation: string;
}

export interface CompetitorInsight {
  channelId: string;
  channelName: string;
  platform: string;
  subscribers: number;
  avgViews: number;
  engagementRate: number;
  topStrategies: string[];
  contentFrequency: string;
  bestPerformingTopics: string[];
}

export interface RetentionDropOff {
  timestamp: number;
  dropPercentage: number;
  reason: string;
}

export interface RetentionAnalysis {
  videoId: string;
  avgRetention: number;
  dropOffPoints: RetentionDropOff[];
  recommendations: string[];
}

export interface ContentGap {
  id: string;
  topic: string;
  searchDemand: number; // relative demand score
  supplyLevel: 'low' | 'medium' | 'high';
  opportunityScore: number; // 0-100
  suggestedAngle: string;
}

export interface ViralPattern {
  id: string;
  patternType: 'hook' | 'pacing' | 'format' | 'thumbnail' | 'title';
  description: string;
  examples: string[];
  effectiveness: number; // 0-100
  applicableNiches: string[];
}

export interface TrendResearchReport {
  channelId: string;
  channelNiche: string;
  generatedAt: Date;
  trendingTopics: TrendingTopic[];
  algorithmSignals: AlgorithmSignal[];
  competitorInsights: CompetitorInsight[];
  contentGaps: ContentGap[];
  viralPatterns: ViralPattern[];
  topRecommendations: string[];
}

// ---------------------------------------------------------------------------
// Dependency Interfaces
// ---------------------------------------------------------------------------

export interface PlatformResearcher {
  analyzeTrends(platform: string, niche: string): Promise<TrendingTopic[]>;
  detectAlgorithmSignals(platform: string): Promise<AlgorithmSignal[]>;
  analyzeCompetitors(channelIds: string[]): Promise<CompetitorInsight[]>;
  analyzeRetention(videoIds: string[]): Promise<RetentionAnalysis[]>;
}

export interface ZikaronStore {
  storeProcedural(entry: {
    content: string;
    tags: string[];
    metadata: Record<string, unknown>;
  }): Promise<string>;
  query(
    text: string,
    tags?: string[],
  ): Promise<{ content: string; similarity: number }[]>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface TrendIntelligenceEngine {
  analyzeTrendingTopics(channelNiche: string): Promise<TrendingTopic[]>;
  detectAlgorithmSignals(): Promise<AlgorithmSignal[]>;
  analyzeCompetitors(
    competitorChannelIds: string[],
  ): Promise<CompetitorInsight[]>;
  analyzeRetentionCurves(videoIds: string[]): Promise<RetentionAnalysis[]>;
  identifyContentGaps(channelNiche: string): Promise<ContentGap[]>;
  detectViralPatterns(channelNiche: string): Promise<ViralPattern[]>;
  runFullResearch(
    channelId: string,
    channelNiche: string,
    competitorIds: string[],
  ): Promise<TrendResearchReport>;
  storeFindings(report: TrendResearchReport): Promise<void>;
  getStoredInsights(channelNiche: string): Promise<TrendResearchReport | null>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

const PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram'];

/**
 * Default implementation of TrendIntelligenceEngine.
 *
 * Uses dependency injection for PlatformResearcher (browser automation / API)
 * and ZikaronStore (procedural memory persistence). Aggregates trend data
 * across all platforms, identifies content gaps and viral patterns, and stores
 * findings with confidence scores.
 */
export class DefaultTrendIntelligenceEngine implements TrendIntelligenceEngine {
  constructor(
    private readonly researcher: PlatformResearcher,
    private readonly store: ZikaronStore,
  ) {}

  /**
   * Analyzes trending topics across YouTube, TikTok, and Instagram for a given niche.
   * Returns topics sorted by relevance score descending.
   *
   * Requirement: 44e.24
   */
  async analyzeTrendingTopics(channelNiche: string): Promise<TrendingTopic[]> {
    const results: TrendingTopic[] = [];

    for (const platform of PLATFORMS) {
      const topics = await this.researcher.analyzeTrends(
        platform,
        channelNiche,
      );
      results.push(...topics);
    }

    // Sort by relevance score descending
    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Detects algorithm signals indicating which content types are currently
   * being boosted by each platform's recommendation system.
   *
   * Requirement: 44e.25
   */
  async detectAlgorithmSignals(): Promise<AlgorithmSignal[]> {
    const results: AlgorithmSignal[] = [];

    for (const platform of PLATFORMS) {
      const signals = await this.researcher.detectAlgorithmSignals(platform);
      results.push(...signals);
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyzes competitor channels to identify content strategies generating
   * above-average engagement.
   *
   * Requirement: 44e.26
   */
  async analyzeCompetitors(
    competitorChannelIds: string[],
  ): Promise<CompetitorInsight[]> {
    if (competitorChannelIds.length === 0) {
      return [];
    }

    const insights =
      await this.researcher.analyzeCompetitors(competitorChannelIds);

    // Filter to only include channels with above-average engagement
    const avgEngagement =
      insights.reduce((sum, i) => sum + i.engagementRate, 0) /
      (insights.length || 1);

    return insights.map((insight) => ({
      ...insight,
      topStrategies:
        insight.engagementRate > avgEngagement
          ? insight.topStrategies
          : insight.topStrategies.slice(0, 1),
    }));
  }

  /**
   * Analyzes audience retention curves from existing videos to identify
   * where viewers drop off and generates recommendations for improving retention.
   *
   * Requirement: 44e.27
   */
  async analyzeRetentionCurves(
    videoIds: string[],
  ): Promise<RetentionAnalysis[]> {
    if (videoIds.length === 0) {
      return [];
    }

    const analyses = await this.researcher.analyzeRetention(videoIds);

    // Enrich with recommendations based on drop-off patterns
    return analyses.map((analysis) => ({
      ...analysis,
      recommendations: this.generateRetentionRecommendations(analysis),
    }));
  }

  /**
   * Identifies content gaps — topics with high search demand but low supply
   * of quality content.
   *
   * Requirement: 44e.28
   */
  async identifyContentGaps(channelNiche: string): Promise<ContentGap[]> {
    // Get trending topics to identify demand
    const topics = await this.analyzeTrendingTopics(channelNiche);

    // Identify gaps: high velocity + low competition = content gap
    const gaps: ContentGap[] = topics
      .filter((t) => t.competition === 'low' || t.competition === 'medium')
      .map((topic) => ({
        id: `gap-${topic.id}`,
        topic: topic.topic,
        searchDemand: topic.searchVolume,
        supplyLevel: topic.competition === 'low' ? 'low' : 'medium',
        opportunityScore: this.calculateOpportunityScore(topic),
        suggestedAngle: this.suggestContentAngle(topic, channelNiche),
      }));

    // Sort by opportunity score descending
    return gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Detects viral patterns (hooks, pacing, formats, thumbnail styles) and
   * incorporates them into content generation templates.
   *
   * Requirement: 44e.29
   */
  async detectViralPatterns(channelNiche: string): Promise<ViralPattern[]> {
    // Analyze trends across platforms to extract patterns
    const topics = await this.analyzeTrendingTopics(channelNiche);
    const signals = await this.detectAlgorithmSignals();

    const patterns: ViralPattern[] = [];

    // Extract hook patterns from high-velocity topics
    const highVelocityTopics = topics.filter((t) => t.velocity > 70);
    if (highVelocityTopics.length > 0) {
      patterns.push({
        id: `pattern-hook-${Date.now()}`,
        patternType: 'hook',
        description: `High-velocity topics in ${channelNiche} use attention-grabbing hooks`,
        examples: highVelocityTopics.slice(0, 3).map((t) => t.topic),
        effectiveness: Math.round(
          highVelocityTopics.reduce((sum, t) => sum + t.velocity, 0) /
            highVelocityTopics.length,
        ),
        applicableNiches: [channelNiche],
      });
    }

    // Extract format patterns from algorithm signals
    const formatSignals = signals.filter(
      (s) => s.signalType === 'format_boost',
    );
    if (formatSignals.length > 0) {
      patterns.push({
        id: `pattern-format-${Date.now()}`,
        patternType: 'format',
        description: `Platform algorithms are boosting specific formats`,
        examples: formatSignals.map((s) => s.description),
        effectiveness: Math.round(
          formatSignals.reduce((sum, s) => sum + s.confidence, 0) /
            formatSignals.length,
        ),
        applicableNiches: [channelNiche],
      });
    }

    // Extract pacing patterns from length preference signals
    const lengthSignals = signals.filter(
      (s) => s.signalType === 'length_preference',
    );
    if (lengthSignals.length > 0) {
      patterns.push({
        id: `pattern-pacing-${Date.now()}`,
        patternType: 'pacing',
        description: `Optimal content length and pacing detected`,
        examples: lengthSignals.map((s) => s.recommendation),
        effectiveness: Math.round(
          lengthSignals.reduce((sum, s) => sum + s.confidence, 0) /
            lengthSignals.length,
        ),
        applicableNiches: [channelNiche],
      });
    }

    // Extract thumbnail patterns from topic boosts
    const topicBoosts = signals.filter(
      (s) => s.signalType === 'topic_boost',
    );
    if (topicBoosts.length > 0) {
      patterns.push({
        id: `pattern-thumbnail-${Date.now()}`,
        patternType: 'thumbnail',
        description: `Thumbnail styles associated with boosted topics`,
        examples: topicBoosts.map((s) => s.description),
        effectiveness: Math.round(
          topicBoosts.reduce((sum, s) => sum + s.confidence, 0) /
            topicBoosts.length,
        ),
        applicableNiches: [channelNiche],
      });
    }

    return patterns.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Runs a full research cycle: trending topics, algorithm signals, competitor
   * analysis, content gaps, and viral patterns. Returns a comprehensive report.
   */
  async runFullResearch(
    channelId: string,
    channelNiche: string,
    competitorIds: string[],
  ): Promise<TrendResearchReport> {
    const [trendingTopics, algorithmSignals, competitorInsights] =
      await Promise.all([
        this.analyzeTrendingTopics(channelNiche),
        this.detectAlgorithmSignals(),
        this.analyzeCompetitors(competitorIds),
      ]);

    const [contentGaps, viralPatterns] = await Promise.all([
      this.identifyContentGaps(channelNiche),
      this.detectViralPatterns(channelNiche),
    ]);

    const topRecommendations = this.generateTopRecommendations(
      trendingTopics,
      algorithmSignals,
      contentGaps,
      viralPatterns,
    );

    return {
      channelId,
      channelNiche,
      generatedAt: new Date(),
      trendingTopics,
      algorithmSignals,
      competitorInsights,
      contentGaps,
      viralPatterns,
      topRecommendations,
    };
  }

  /**
   * Stores research findings in Zikaron procedural memory with confidence scores.
   *
   * Requirement: 44e.29 (store in Zikaron procedural memory)
   */
  async storeFindings(report: TrendResearchReport): Promise<void> {
    const confidence = this.calculateReportConfidence(report);

    await this.store.storeProcedural({
      content: JSON.stringify(report),
      tags: [
        'trend-research',
        report.channelNiche,
        report.channelId,
        `confidence-${confidence}`,
      ],
      metadata: {
        type: 'trend_research_report',
        channelId: report.channelId,
        channelNiche: report.channelNiche,
        generatedAt: report.generatedAt.toISOString(),
        confidence,
        topicCount: report.trendingTopics.length,
        signalCount: report.algorithmSignals.length,
        gapCount: report.contentGaps.length,
        patternCount: report.viralPatterns.length,
      },
    });
  }

  /**
   * Retrieves previously stored research insights for a channel niche.
   */
  async getStoredInsights(
    channelNiche: string,
  ): Promise<TrendResearchReport | null> {
    const results = await this.store.query(`trend research ${channelNiche}`, [
      'trend-research',
      channelNiche,
    ]);

    if (results.length === 0) {
      return null;
    }

    // Return the most relevant result
    const best = results.sort((a, b) => b.similarity - a.similarity)[0];

    try {
      return JSON.parse(best.content) as TrendResearchReport;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private generateRetentionRecommendations(
    analysis: RetentionAnalysis,
  ): string[] {
    const recommendations: string[] = [];

    if (analysis.dropOffPoints.length === 0) {
      return analysis.recommendations.length > 0
        ? analysis.recommendations
        : ['Retention is stable — maintain current pacing'];
    }

    for (const dropOff of analysis.dropOffPoints) {
      if (dropOff.timestamp < 30) {
        recommendations.push(
          `Improve hook in first ${dropOff.timestamp}s — ${dropOff.dropPercentage}% drop detected. ${dropOff.reason}`,
        );
      } else if (dropOff.dropPercentage > 20) {
        recommendations.push(
          `Major drop at ${dropOff.timestamp}s (${dropOff.dropPercentage}%). Consider re-engaging with a pattern interrupt. ${dropOff.reason}`,
        );
      } else {
        recommendations.push(
          `Minor drop at ${dropOff.timestamp}s (${dropOff.dropPercentage}%). ${dropOff.reason}`,
        );
      }
    }

    if (analysis.avgRetention < 40) {
      recommendations.push(
        'Overall retention below 40% — consider shorter format or stronger narrative arc',
      );
    }

    return recommendations;
  }

  private calculateOpportunityScore(topic: TrendingTopic): number {
    // High velocity + high relevance + low competition = high opportunity
    const competitionMultiplier =
      topic.competition === 'low'
        ? 1.0
        : topic.competition === 'medium'
          ? 0.6
          : 0.3;

    const rawScore =
      (topic.velocity * 0.3 +
        topic.relevanceScore * 0.4 +
        Math.min(topic.searchVolume / 100, 100) * 0.3) *
      competitionMultiplier;

    return Math.round(Math.min(100, Math.max(0, rawScore)));
  }

  private suggestContentAngle(
    topic: TrendingTopic,
    channelNiche: string,
  ): string {
    if (topic.velocity > 80) {
      return `Timely take on "${topic.topic}" from a ${channelNiche} perspective — capitalize on momentum`;
    }
    if (topic.competition === 'low') {
      return `Deep-dive into "${topic.topic}" — low competition means first-mover advantage in ${channelNiche}`;
    }
    return `Unique ${channelNiche} angle on "${topic.topic}" — differentiate from existing content`;
  }

  private generateTopRecommendations(
    topics: TrendingTopic[],
    signals: AlgorithmSignal[],
    gaps: ContentGap[],
    patterns: ViralPattern[],
  ): string[] {
    const recommendations: string[] = [];

    // Top trending topic recommendation
    if (topics.length > 0) {
      const top = topics[0];
      recommendations.push(
        `Create content about "${top.topic}" — trending on ${top.platform} with velocity ${top.velocity}/100`,
      );
    }

    // Top algorithm signal recommendation
    const highConfidenceSignals = signals.filter((s) => s.confidence > 70);
    if (highConfidenceSignals.length > 0) {
      recommendations.push(highConfidenceSignals[0].recommendation);
    }

    // Top content gap recommendation
    if (gaps.length > 0) {
      const topGap = gaps[0];
      recommendations.push(
        `Fill content gap: "${topGap.topic}" — opportunity score ${topGap.opportunityScore}/100`,
      );
    }

    // Top viral pattern recommendation
    if (patterns.length > 0) {
      const topPattern = patterns[0];
      recommendations.push(
        `Apply ${topPattern.patternType} pattern: ${topPattern.description}`,
      );
    }

    return recommendations;
  }

  private calculateReportConfidence(report: TrendResearchReport): number {
    // Confidence based on data completeness and quality
    let score = 0;
    let factors = 0;

    if (report.trendingTopics.length > 0) {
      score +=
        report.trendingTopics.reduce((s, t) => s + t.relevanceScore, 0) /
        report.trendingTopics.length;
      factors++;
    }

    if (report.algorithmSignals.length > 0) {
      score +=
        report.algorithmSignals.reduce((s, a) => s + a.confidence, 0) /
        report.algorithmSignals.length;
      factors++;
    }

    if (report.contentGaps.length > 0) {
      score +=
        report.contentGaps.reduce((s, g) => s + g.opportunityScore, 0) /
        report.contentGaps.length;
      factors++;
    }

    if (report.viralPatterns.length > 0) {
      score +=
        report.viralPatterns.reduce((s, p) => s + p.effectiveness, 0) /
        report.viralPatterns.length;
      factors++;
    }

    return factors > 0 ? Math.round(score / factors) : 0;
  }
}
