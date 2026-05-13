/**
 * Unit tests for ZXMG Video Development Studio — Trend Intelligence Engine
 *
 * Validates: Requirements 44e.24, 44e.25, 44e.26, 44e.27, 44e.28, 44e.29
 *
 * Tests trending topic analysis, algorithm signal detection, competitor analysis,
 * retention curve analysis, content gap identification, viral pattern detection,
 * and Zikaron storage integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultTrendIntelligenceEngine,
  type TrendIntelligenceEngine,
  type PlatformResearcher,
  type ZikaronStore,
  type TrendingTopic,
  type AlgorithmSignal,
  type CompetitorInsight,
  type RetentionAnalysis,
  type TrendResearchReport,
} from '../trend-engine.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockTrendingTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  return {
    id: 'topic-1',
    topic: 'AI productivity tools',
    platform: 'youtube',
    velocity: 75,
    relevanceScore: 85,
    competition: 'low',
    searchVolume: 5000,
    detectedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

function createMockAlgorithmSignal(overrides: Partial<AlgorithmSignal> = {}): AlgorithmSignal {
  return {
    id: 'signal-1',
    platform: 'youtube',
    signalType: 'format_boost',
    description: 'Short-form vertical video getting 2x impressions',
    confidence: 85,
    detectedAt: new Date('2024-01-15'),
    recommendation: 'Create more Shorts under 60 seconds',
    ...overrides,
  };
}

function createMockCompetitorInsight(overrides: Partial<CompetitorInsight> = {}): CompetitorInsight {
  return {
    channelId: 'channel-abc',
    channelName: 'TechReviewer',
    platform: 'youtube',
    subscribers: 500000,
    avgViews: 100000,
    engagementRate: 8.5,
    topStrategies: ['listicles', 'comparison videos', 'tutorials'],
    contentFrequency: '3x per week',
    bestPerformingTopics: ['AI tools', 'productivity apps'],
    ...overrides,
  };
}

function createMockRetentionAnalysis(overrides: Partial<RetentionAnalysis> = {}): RetentionAnalysis {
  return {
    videoId: 'video-123',
    avgRetention: 55,
    dropOffPoints: [
      { timestamp: 15, dropPercentage: 25, reason: 'Intro too long' },
      { timestamp: 120, dropPercentage: 15, reason: 'Topic transition' },
    ],
    recommendations: [],
    ...overrides,
  };
}

function createMockResearcher(): PlatformResearcher {
  return {
    analyzeTrends: vi.fn().mockResolvedValue([createMockTrendingTopic()]),
    detectAlgorithmSignals: vi.fn().mockResolvedValue([createMockAlgorithmSignal()]),
    analyzeCompetitors: vi.fn().mockResolvedValue([createMockCompetitorInsight()]),
    analyzeRetention: vi.fn().mockResolvedValue([createMockRetentionAnalysis()]),
  };
}

function createMockStore(): ZikaronStore {
  return {
    storeProcedural: vi.fn().mockResolvedValue('entry-id-1'),
    query: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultTrendIntelligenceEngine', () => {
  let engine: TrendIntelligenceEngine;
  let researcher: ReturnType<typeof createMockResearcher>;
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    researcher = createMockResearcher();
    store = createMockStore();
    engine = new DefaultTrendIntelligenceEngine(researcher, store);
  });

  // -------------------------------------------------------------------------
  // 44e.24: Trending Topic Analysis
  // -------------------------------------------------------------------------

  describe('analyzeTrendingTopics', () => {
    it('returns structured results with velocity and relevance scores', async () => {
      const topics = await engine.analyzeTrendingTopics('tech');

      expect(topics.length).toBeGreaterThan(0);
      for (const topic of topics) {
        expect(topic.id).toBeTruthy();
        expect(topic.topic).toBeTruthy();
        expect(topic.platform).toMatch(/^(youtube|tiktok|instagram)$/);
        expect(topic.velocity).toBeGreaterThanOrEqual(0);
        expect(topic.velocity).toBeLessThanOrEqual(100);
        expect(topic.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(topic.relevanceScore).toBeLessThanOrEqual(100);
        expect(['low', 'medium', 'high']).toContain(topic.competition);
        expect(topic.searchVolume).toBeGreaterThanOrEqual(0);
        expect(topic.detectedAt).toBeInstanceOf(Date);
      }
    });

    it('queries all three platforms', async () => {
      await engine.analyzeTrendingTopics('tech');

      expect(researcher.analyzeTrends).toHaveBeenCalledWith('youtube', 'tech');
      expect(researcher.analyzeTrends).toHaveBeenCalledWith('tiktok', 'tech');
      expect(researcher.analyzeTrends).toHaveBeenCalledWith('instagram', 'tech');
      expect(researcher.analyzeTrends).toHaveBeenCalledTimes(3);
    });

    it('sorts results by relevance score descending', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([createMockTrendingTopic({ id: 'yt-1', relevanceScore: 60 })])
        .mockResolvedValueOnce([createMockTrendingTopic({ id: 'tt-1', relevanceScore: 90 })])
        .mockResolvedValueOnce([createMockTrendingTopic({ id: 'ig-1', relevanceScore: 75 })]);

      const topics = await engine.analyzeTrendingTopics('tech');

      expect(topics[0].relevanceScore).toBe(90);
      expect(topics[1].relevanceScore).toBe(75);
      expect(topics[2].relevanceScore).toBe(60);
    });

    it('returns empty array when no trends found', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const topics = await engine.analyzeTrendingTopics('obscure-niche');

      expect(topics).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 44e.25: Algorithm Signal Detection
  // -------------------------------------------------------------------------

  describe('detectAlgorithmSignals', () => {
    it('identifies format and topic boosts with confidence levels', async () => {
      (researcher.detectAlgorithmSignals as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ id: 's1', signalType: 'format_boost', confidence: 90 }),
        ])
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ id: 's2', signalType: 'topic_boost', confidence: 70 }),
        ])
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ id: 's3', signalType: 'length_preference', confidence: 60 }),
        ]);

      const signals = await engine.detectAlgorithmSignals();

      expect(signals.length).toBe(3);
      for (const signal of signals) {
        expect(signal.id).toBeTruthy();
        expect(signal.platform).toMatch(/^(youtube|tiktok|instagram)$/);
        expect([
          'format_boost',
          'topic_boost',
          'length_preference',
          'engagement_signal',
        ]).toContain(signal.signalType);
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(100);
        expect(signal.recommendation).toBeTruthy();
      }
    });

    it('queries all three platforms for signals', async () => {
      await engine.detectAlgorithmSignals();

      expect(researcher.detectAlgorithmSignals).toHaveBeenCalledWith('youtube');
      expect(researcher.detectAlgorithmSignals).toHaveBeenCalledWith('tiktok');
      expect(researcher.detectAlgorithmSignals).toHaveBeenCalledWith('instagram');
    });

    it('sorts signals by confidence descending', async () => {
      (researcher.detectAlgorithmSignals as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([createMockAlgorithmSignal({ id: 's1', confidence: 50 })])
        .mockResolvedValueOnce([createMockAlgorithmSignal({ id: 's2', confidence: 95 })])
        .mockResolvedValueOnce([createMockAlgorithmSignal({ id: 's3', confidence: 72 })]);

      const signals = await engine.detectAlgorithmSignals();

      expect(signals[0].confidence).toBe(95);
      expect(signals[1].confidence).toBe(72);
      expect(signals[2].confidence).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // 44e.26: Competitor Channel Analysis
  // -------------------------------------------------------------------------

  describe('analyzeCompetitors', () => {
    it('extracts engagement strategies from channel data', async () => {
      const insights = await engine.analyzeCompetitors(['channel-abc']);

      expect(insights.length).toBe(1);
      expect(insights[0].channelId).toBe('channel-abc');
      expect(insights[0].channelName).toBeTruthy();
      expect(insights[0].engagementRate).toBeGreaterThan(0);
      expect(insights[0].topStrategies.length).toBeGreaterThan(0);
      expect(insights[0].bestPerformingTopics.length).toBeGreaterThan(0);
    });

    it('identifies above-average engagement channels', async () => {
      (researcher.analyzeCompetitors as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockCompetitorInsight({
          channelId: 'high-eng',
          engagementRate: 12.0,
          topStrategies: ['strategy-a', 'strategy-b', 'strategy-c'],
        }),
        createMockCompetitorInsight({
          channelId: 'low-eng',
          engagementRate: 2.0,
          topStrategies: ['strategy-x', 'strategy-y', 'strategy-z'],
        }),
      ]);

      const insights = await engine.analyzeCompetitors(['high-eng', 'low-eng']);

      // Above-average channel keeps all strategies
      const highEng = insights.find((i) => i.channelId === 'high-eng')!;
      expect(highEng.topStrategies).toEqual(['strategy-a', 'strategy-b', 'strategy-c']);

      // Below-average channel gets truncated strategies
      const lowEng = insights.find((i) => i.channelId === 'low-eng')!;
      expect(lowEng.topStrategies.length).toBe(1);
    });

    it('returns empty array for empty input', async () => {
      const insights = await engine.analyzeCompetitors([]);

      expect(insights).toEqual([]);
      expect(researcher.analyzeCompetitors).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 44e.27: Retention Curve Analysis
  // -------------------------------------------------------------------------

  describe('analyzeRetentionCurves', () => {
    it('identifies drop-off points and generates recommendations', async () => {
      const analyses = await engine.analyzeRetentionCurves(['video-123']);

      expect(analyses.length).toBe(1);
      expect(analyses[0].videoId).toBe('video-123');
      expect(analyses[0].avgRetention).toBe(55);
      expect(analyses[0].dropOffPoints.length).toBe(2);
      expect(analyses[0].recommendations.length).toBeGreaterThan(0);
    });

    it('generates hook improvement recommendation for early drop-offs', async () => {
      (researcher.analyzeRetention as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockRetentionAnalysis({
          dropOffPoints: [{ timestamp: 10, dropPercentage: 30, reason: 'Weak hook' }],
        }),
      ]);

      const analyses = await engine.analyzeRetentionCurves(['video-1']);

      expect(analyses[0].recommendations[0]).toContain('hook');
      expect(analyses[0].recommendations[0]).toContain('10s');
    });

    it('generates pattern interrupt recommendation for major mid-video drops', async () => {
      (researcher.analyzeRetention as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockRetentionAnalysis({
          dropOffPoints: [{ timestamp: 180, dropPercentage: 25, reason: 'Boring section' }],
        }),
      ]);

      const analyses = await engine.analyzeRetentionCurves(['video-1']);

      expect(analyses[0].recommendations[0]).toContain('pattern interrupt');
    });

    it('recommends shorter format for low overall retention', async () => {
      (researcher.analyzeRetention as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockRetentionAnalysis({
          avgRetention: 30,
          dropOffPoints: [{ timestamp: 60, dropPercentage: 10, reason: 'Gradual decline' }],
        }),
      ]);

      const analyses = await engine.analyzeRetentionCurves(['video-1']);

      const hasShortFormatRec = analyses[0].recommendations.some(
        (r) => r.includes('shorter format') || r.includes('retention below 40%'),
      );
      expect(hasShortFormatRec).toBe(true);
    });

    it('returns empty array for empty input', async () => {
      const analyses = await engine.analyzeRetentionCurves([]);

      expect(analyses).toEqual([]);
      expect(researcher.analyzeRetention).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 44e.28: Content Gap Identification
  // -------------------------------------------------------------------------

  describe('identifyContentGaps', () => {
    it('finds high-demand low-supply topics', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockTrendingTopic({
          id: 'gap-topic',
          topic: 'AI video editing',
          competition: 'low',
          searchVolume: 8000,
          velocity: 80,
          relevanceScore: 90,
        }),
      ]);

      const gaps = await engine.identifyContentGaps('tech');

      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0].topic).toBe('AI video editing');
      expect(gaps[0].supplyLevel).toBe('low');
      expect(gaps[0].searchDemand).toBe(8000);
      expect(gaps[0].opportunityScore).toBeGreaterThan(0);
      expect(gaps[0].suggestedAngle).toBeTruthy();
    });

    it('filters out high-competition topics', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockTrendingTopic({ id: 't1', competition: 'high' }),
        createMockTrendingTopic({ id: 't2', competition: 'low' }),
      ]);

      const gaps = await engine.identifyContentGaps('tech');

      // Only low/medium competition topics become gaps
      expect(gaps.every((g) => g.supplyLevel !== 'high')).toBe(true);
    });

    it('sorts gaps by opportunity score descending', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          createMockTrendingTopic({
            id: 't1',
            competition: 'low',
            velocity: 30,
            relevanceScore: 40,
            searchVolume: 1000,
          }),
          createMockTrendingTopic({
            id: 't2',
            competition: 'low',
            velocity: 90,
            relevanceScore: 95,
            searchVolume: 9000,
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const gaps = await engine.identifyContentGaps('tech');

      expect(gaps.length).toBe(2);
      expect(gaps[0].opportunityScore).toBeGreaterThanOrEqual(gaps[1].opportunityScore);
    });
  });

  // -------------------------------------------------------------------------
  // 44e.29: Viral Pattern Detection
  // -------------------------------------------------------------------------

  describe('detectViralPatterns', () => {
    it('extracts hooks, pacing, and format patterns', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockTrendingTopic({ velocity: 85 }),
      ]);
      (researcher.detectAlgorithmSignals as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ signalType: 'format_boost' }),
        ])
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ signalType: 'length_preference' }),
        ])
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ signalType: 'topic_boost' }),
        ]);

      const patterns = await engine.detectViralPatterns('tech');

      expect(patterns.length).toBeGreaterThan(0);

      const patternTypes = patterns.map((p) => p.patternType);
      expect(patternTypes).toContain('hook');

      for (const pattern of patterns) {
        expect(pattern.id).toBeTruthy();
        expect(['hook', 'pacing', 'format', 'thumbnail', 'title']).toContain(
          pattern.patternType,
        );
        expect(pattern.description).toBeTruthy();
        expect(pattern.examples.length).toBeGreaterThan(0);
        expect(pattern.effectiveness).toBeGreaterThanOrEqual(0);
        expect(pattern.effectiveness).toBeLessThanOrEqual(100);
        expect(pattern.applicableNiches).toContain('tech');
      }
    });

    it('returns empty patterns when no high-velocity topics or signals', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockTrendingTopic({ velocity: 30 }), // below threshold
      ]);
      (researcher.detectAlgorithmSignals as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const patterns = await engine.detectViralPatterns('tech');

      expect(patterns).toEqual([]);
    });

    it('sorts patterns by effectiveness descending', async () => {
      (researcher.analyzeTrends as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockTrendingTopic({ velocity: 80 }),
      ]);
      (researcher.detectAlgorithmSignals as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ signalType: 'format_boost', confidence: 60 }),
        ])
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ signalType: 'length_preference', confidence: 95 }),
        ])
        .mockResolvedValueOnce([
          createMockAlgorithmSignal({ signalType: 'topic_boost', confidence: 40 }),
        ]);

      const patterns = await engine.detectViralPatterns('tech');

      for (let i = 0; i < patterns.length - 1; i++) {
        expect(patterns[i].effectiveness).toBeGreaterThanOrEqual(
          patterns[i + 1].effectiveness,
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Zikaron Integration
  // -------------------------------------------------------------------------

  describe('storeFindings', () => {
    it('stores findings in Zikaron with correct metadata', async () => {
      const report: TrendResearchReport = {
        channelId: 'ch-1',
        channelNiche: 'tech',
        generatedAt: new Date('2024-01-15'),
        trendingTopics: [createMockTrendingTopic()],
        algorithmSignals: [createMockAlgorithmSignal()],
        competitorInsights: [createMockCompetitorInsight()],
        contentGaps: [],
        viralPatterns: [],
        topRecommendations: ['Create AI content'],
      };

      await engine.storeFindings(report);

      expect(store.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (store.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(call.tags).toContain('trend-research');
      expect(call.tags).toContain('tech');
      expect(call.tags).toContain('ch-1');
      expect(call.metadata.type).toBe('trend_research_report');
      expect(call.metadata.channelId).toBe('ch-1');
      expect(call.metadata.channelNiche).toBe('tech');
      expect(call.metadata.confidence).toBeGreaterThan(0);
      expect(call.metadata.topicCount).toBe(1);
      expect(call.metadata.signalCount).toBe(1);

      // Content should be valid JSON
      const parsed = JSON.parse(call.content);
      expect(parsed.channelId).toBe('ch-1');
    });

    it('calculates confidence score from report data', async () => {
      const report: TrendResearchReport = {
        channelId: 'ch-1',
        channelNiche: 'tech',
        generatedAt: new Date(),
        trendingTopics: [
          createMockTrendingTopic({ relevanceScore: 80 }),
          createMockTrendingTopic({ relevanceScore: 90 }),
        ],
        algorithmSignals: [createMockAlgorithmSignal({ confidence: 85 })],
        competitorInsights: [],
        contentGaps: [],
        viralPatterns: [],
        topRecommendations: [],
      };

      await engine.storeFindings(report);

      const call = (store.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Average of (80+90)/2=85 for topics and 85 for signals = (85+85)/2 = 85
      expect(call.metadata.confidence).toBe(85);
    });
  });

  describe('getStoredInsights', () => {
    it('returns null when no stored insights exist', async () => {
      const result = await engine.getStoredInsights('tech');

      expect(result).toBeNull();
      expect(store.query).toHaveBeenCalledWith('trend research tech', [
        'trend-research',
        'tech',
      ]);
    });

    it('returns parsed report from stored data', async () => {
      const storedReport: TrendResearchReport = {
        channelId: 'ch-1',
        channelNiche: 'tech',
        generatedAt: new Date('2024-01-15'),
        trendingTopics: [createMockTrendingTopic()],
        algorithmSignals: [],
        competitorInsights: [],
        contentGaps: [],
        viralPatterns: [],
        topRecommendations: [],
      };

      (store.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { content: JSON.stringify(storedReport), similarity: 0.95 },
      ]);

      const result = await engine.getStoredInsights('tech');

      expect(result).not.toBeNull();
      expect(result!.channelId).toBe('ch-1');
      expect(result!.channelNiche).toBe('tech');
    });

    it('returns null for invalid stored JSON', async () => {
      (store.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { content: 'not-valid-json', similarity: 0.9 },
      ]);

      const result = await engine.getStoredInsights('tech');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Full Research Cycle
  // -------------------------------------------------------------------------

  describe('runFullResearch', () => {
    it('returns a comprehensive research report', async () => {
      const report = await engine.runFullResearch('ch-1', 'tech', ['comp-1']);

      expect(report.channelId).toBe('ch-1');
      expect(report.channelNiche).toBe('tech');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.trendingTopics).toBeDefined();
      expect(report.algorithmSignals).toBeDefined();
      expect(report.competitorInsights).toBeDefined();
      expect(report.contentGaps).toBeDefined();
      expect(report.viralPatterns).toBeDefined();
      expect(report.topRecommendations.length).toBeGreaterThan(0);
    });

    it('calls all research methods', async () => {
      await engine.runFullResearch('ch-1', 'tech', ['comp-1', 'comp-2']);

      // analyzeTrends called for trending topics + content gaps + viral patterns
      expect(researcher.analyzeTrends).toHaveBeenCalled();
      expect(researcher.detectAlgorithmSignals).toHaveBeenCalled();
      expect(researcher.analyzeCompetitors).toHaveBeenCalledWith(['comp-1', 'comp-2']);
    });
  });
});
