/**
 * Unit tests for ZXMG Video Development Studio — Autonomous Content Engine
 *
 * Validates: Requirements 44a.1, 44a.2, 44a.3, 44a.4, 44a.5, 44a.6, 44f.35, 44f.36
 *
 * Tests content calendar generation, idea ranking, human-gated generation/publishing,
 * King overrides, channel-scoped pipelines, and hook emissions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultAutonomousContentEngine,
  type AutonomousContentEngine,
  type TrendResearchProvider,
  type ZikaronPerformanceStore,
  type VideoEventBus,
  type VideoGenerator,
  type VideoPublisher,
  type PipelineItem,
} from '../autonomous-engine.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockTrendResearch(): TrendResearchProvider {
  return {
    getTopics: vi.fn().mockResolvedValue([
      { topic: 'AI productivity tools', velocity: 85, relevanceScore: 90, searchVolume: 8000 },
      { topic: 'Remote work setups', velocity: 70, relevanceScore: 75, searchVolume: 6000 },
      { topic: 'Coding tutorials', velocity: 60, relevanceScore: 80, searchVolume: 5000 },
      { topic: 'Tech reviews 2024', velocity: 50, relevanceScore: 65, searchVolume: 4000 },
      { topic: 'Startup advice', velocity: 45, relevanceScore: 60, searchVolume: 3500 },
      { topic: 'Cloud computing', velocity: 40, relevanceScore: 55, searchVolume: 3000 },
      { topic: 'Machine learning basics', velocity: 75, relevanceScore: 85, searchVolume: 7000 },
      { topic: 'Web development trends', velocity: 55, relevanceScore: 70, searchVolume: 4500 },
      { topic: 'Cybersecurity tips', velocity: 65, relevanceScore: 72, searchVolume: 5500 },
      { topic: 'DevOps practices', velocity: 35, relevanceScore: 50, searchVolume: 2500 },
    ]),
  };
}

function createMockPerformanceStore(): ZikaronPerformanceStore {
  return {
    getPerformancePatterns: vi.fn().mockResolvedValue([
      { style: 'tutorial', avgViews: 50000, avgEngagement: 8.5, avgRevenue: 120, avgDuration: 600 },
      { style: 'cinematic', avgViews: 80000, avgEngagement: 6.0, avgRevenue: 200, avgDuration: 900 },
    ]),
  };
}

function createMockEventBus(): VideoEventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockVideoGenerator(): VideoGenerator {
  return {
    generate: vi.fn().mockResolvedValue({
      videoUrl: 'https://cdn.example.com/video-123.mp4',
      thumbnailVariants: [
        'https://cdn.example.com/thumb-1.jpg',
        'https://cdn.example.com/thumb-2.jpg',
        'https://cdn.example.com/thumb-3.jpg',
      ],
      metadata: {
        title: 'Generated Video Title',
        description: 'Generated video description',
        tags: ['tech', 'ai'],
      },
    }),
  };
}

function createMockVideoPublisher(): VideoPublisher {
  return {
    upload: vi.fn().mockResolvedValue({ publishedUrl: 'https://youtube.com/watch?v=abc123' }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultAutonomousContentEngine', () => {
  let engine: AutonomousContentEngine;
  let trendResearch: ReturnType<typeof createMockTrendResearch>;
  let performanceStore: ReturnType<typeof createMockPerformanceStore>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let videoGenerator: ReturnType<typeof createMockVideoGenerator>;
  let videoPublisher: ReturnType<typeof createMockVideoPublisher>;

  beforeEach(() => {
    trendResearch = createMockTrendResearch();
    performanceStore = createMockPerformanceStore();
    eventBus = createMockEventBus();
    videoGenerator = createMockVideoGenerator();
    videoPublisher = createMockVideoPublisher();
    engine = new DefaultAutonomousContentEngine(
      trendResearch,
      performanceStore,
      eventBus,
      videoGenerator,
      videoPublisher,
    );
  });

  // -------------------------------------------------------------------------
  // 44a.2, 44a.3: Content calendar generates 7-14 days of ranked ideas
  // -------------------------------------------------------------------------

  describe('generateIdeas', () => {
    it('generates 7-14 days of ranked ideas per channel', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech', 10);

      expect(ideas.length).toBeGreaterThan(0);
      expect(ideas.length).toBeLessThanOrEqual(14);

      // All ideas should have publish dates within 7-14 day window
      const now = new Date();
      const minDate = new Date();
      minDate.setDate(now.getDate() + 7);
      const maxDate = new Date();
      maxDate.setDate(now.getDate() + 14);

      for (const idea of ideas) {
        expect(idea.concept.suggestedPublishDate.getTime()).toBeGreaterThanOrEqual(minDate.getTime() - 86400000); // 1 day tolerance
        expect(idea.concept.suggestedPublishDate.getTime()).toBeLessThanOrEqual(maxDate.getTime() + 86400000);
        expect(idea.channelId).toBe('channel-1');
        expect(idea.status).toBe('ideated');
      }
    });

    it('ranks ideas by predicted views, engagement rate, and revenue potential', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech', 10);

      // Ideas should be sorted by composite rank score (views + engagement + revenue)
      for (let i = 0; i < ideas.length - 1; i++) {
        const scoreA = ideas[i].concept.predictedViews / 100000 +
          ideas[i].concept.predictedEngagement * 10 +
          ideas[i].concept.predictedRevenue / 10;
        const scoreB = ideas[i + 1].concept.predictedViews / 100000 +
          ideas[i + 1].concept.predictedEngagement * 10 +
          ideas[i + 1].concept.predictedRevenue / 10;
        expect(scoreA).toBeGreaterThanOrEqual(scoreB);
      }
    });

    it('uses trend data and Zikaron performance patterns for ranking', async () => {
      await engine.generateIdeas('channel-1', 'tech');

      expect(trendResearch.getTopics).toHaveBeenCalledWith('tech');
      expect(performanceStore.getPerformancePatterns).toHaveBeenCalledWith('channel-1');
    });

    it('each idea has predicted views, engagement, and revenue', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');

      for (const idea of ideas) {
        expect(idea.concept.predictedViews).toBeGreaterThan(0);
        expect(idea.concept.predictedEngagement).toBeGreaterThan(0);
        expect(idea.concept.predictedRevenue).toBeGreaterThan(0);
        expect(idea.concept.title).toBeTruthy();
        expect(idea.concept.description).toBeTruthy();
        expect(idea.concept.style).toBeTruthy();
        expect(idea.concept.duration).toBeGreaterThan(0);
        expect(idea.concept.tags.length).toBeGreaterThan(0);
      }
    });

    it('stores generated ideas in the channel pipeline', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      const pipeline = await engine.getPipeline('channel-1');

      expect(pipeline.length).toBe(ideas.length);
      for (const idea of ideas) {
        const found = pipeline.find((p) => p.id === idea.id);
        expect(found).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 44a.4: King clicks "Generate" triggers production
  // -------------------------------------------------------------------------

  describe('triggerGeneration', () => {
    let ideas: PipelineItem[];

    beforeEach(async () => {
      ideas = await engine.generateIdeas('channel-1', 'tech');
    });

    it('triggers production for a pipeline item when King clicks Generate', async () => {
      const item = ideas[0];
      const result = await engine.triggerGeneration(item.id);

      expect(result.status).toBe('generated');
      expect(result.generatedVideoUrl).toBe('https://cdn.example.com/video-123.mp4');
      expect(result.thumbnailVariants).toHaveLength(3);
      expect(result.metadata).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('calls video generator with correct concept and channel', async () => {
      const item = ideas[0];
      await engine.triggerGeneration(item.id);

      expect(videoGenerator.generate).toHaveBeenCalledWith(item.concept, 'channel-1');
    });

    it('throws if item is not in ideated or approved status', async () => {
      const item = ideas[0];
      // Generate it first
      await engine.triggerGeneration(item.id);

      // Try to generate again — should fail since it's now "generated"
      await expect(engine.triggerGeneration(item.id)).rejects.toThrow(
        /Cannot generate item in status "generated"/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 44a.5: King clicks "Publish" pushes video to assigned channel
  // -------------------------------------------------------------------------

  describe('triggerPublish', () => {
    let readyItem: PipelineItem;

    beforeEach(async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.triggerGeneration(ideas[0].id);
      readyItem = await engine.markReadyToPublish(ideas[0].id);
    });

    it('publishes video to assigned channel when King clicks Publish', async () => {
      const result = await engine.triggerPublish(readyItem.id);

      expect(result.status).toBe('published');
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(videoPublisher.upload).toHaveBeenCalledWith(
        'channel-1',
        'https://cdn.example.com/video-123.mp4',
        expect.objectContaining({
          title: 'Generated Video Title',
          description: 'Generated video description',
          tags: ['tech', 'ai'],
        }),
      );
    });

    it('throws if item is not in ready_to_publish status', async () => {
      const ideas = await engine.generateIdeas('channel-2', 'tech');
      // Item is in "ideated" status — cannot publish
      await expect(engine.triggerPublish(ideas[0].id)).rejects.toThrow(
        /Cannot publish item in status "ideated"/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 44a.6: King rejection removes item from pipeline and emits hook
  // -------------------------------------------------------------------------

  describe('rejectItem', () => {
    it('rejects item and emits pipeline updated hook', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      const item = ideas[0];

      await engine.rejectItem(item.id, 'Not relevant to our audience');

      const updated = await engine.getPipelineItem(item.id);
      expect(updated!.status).toBe('rejected');

      // Verify hook was emitted
      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const rejectionHook = publishCalls.find(
        (call) =>
          call[0].type === 'video.pipeline.updated' &&
          call[0].detail.newStatus === 'rejected',
      );
      expect(rejectionHook).toBeDefined();
      expect(rejectionHook![0].detail.reason).toBe('Not relevant to our audience');
    });
  });

  // -------------------------------------------------------------------------
  // 44a.6: King modification updates item and recalculates schedule
  // -------------------------------------------------------------------------

  describe('modifyItem', () => {
    it('updates item concept and recalculates schedule', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      const item = ideas[0];
      const originalDate = item.concept.suggestedPublishDate;

      const modified = await engine.modifyItem(item.id, {
        title: 'Updated Title',
        predictedViews: 999999,
      });

      expect(modified.concept.title).toBe('Updated Title');
      expect(modified.concept.predictedViews).toBe(999999);
      // Schedule should be recalculated
      expect(modified.concept.suggestedPublishDate).toBeInstanceOf(Date);
    });

    it('emits pipeline updated hook with modification details', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.modifyItem(ideas[0].id, { title: 'New Title' });

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const modifyHook = publishCalls.find(
        (call) =>
          call[0].type === 'video.pipeline.updated' &&
          call[0].detail.modifications !== undefined,
      );
      expect(modifyHook).toBeDefined();
      expect(modifyHook![0].detail.modifications).toContain('title');
    });
  });

  // -------------------------------------------------------------------------
  // 44a.7: video.idea.generated hook emits with correct payload
  // -------------------------------------------------------------------------

  describe('video.idea.generated hook', () => {
    it('emits with correct payload for each generated idea', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ideaHooks = publishCalls.filter(
        (call) => call[0].type === 'video.idea.generated',
      );

      expect(ideaHooks.length).toBe(ideas.length);

      for (const hook of ideaHooks) {
        const detail = hook[0].detail;
        expect(detail.channelId).toBe('channel-1');
        expect(detail.itemId).toBeTruthy();
        expect(detail.title).toBeTruthy();
        expect(detail.predictedViews).toBeGreaterThan(0);
        expect(detail.predictedEngagement).toBeGreaterThan(0);
        expect(detail.predictedRevenue).toBeGreaterThan(0);
        expect(detail.timestamp).toBeGreaterThan(0);
      }
    });

    it('hook source is zxmg.studio.autonomous', async () => {
      await engine.generateIdeas('channel-1', 'tech');

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ideaHook = publishCalls.find(
        (call) => call[0].type === 'video.idea.generated',
      );
      expect(ideaHook![0].source).toBe('zxmg.studio.autonomous');
    });
  });

  // -------------------------------------------------------------------------
  // video.pipeline.updated hook emits on state changes
  // -------------------------------------------------------------------------

  describe('video.pipeline.updated hook', () => {
    it('emits on generation state change', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      // Clear previous calls from generateIdeas
      (eventBus.publish as ReturnType<typeof vi.fn>).mockClear();

      await engine.triggerGeneration(ideas[0].id);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const pipelineHooks = publishCalls.filter(
        (call) => call[0].type === 'video.pipeline.updated',
      );

      // Should emit for 'generating' and 'generated' transitions
      expect(pipelineHooks.length).toBe(2);
      expect(pipelineHooks[0][0].detail.newStatus).toBe('generating');
      expect(pipelineHooks[1][0].detail.newStatus).toBe('generated');
    });

    it('emits on publish state change', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.triggerGeneration(ideas[0].id);
      await engine.markReadyToPublish(ideas[0].id);
      (eventBus.publish as ReturnType<typeof vi.fn>).mockClear();

      await engine.triggerPublish(ideas[0].id);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const pipelineHooks = publishCalls.filter(
        (call) => call[0].type === 'video.pipeline.updated',
      );

      expect(pipelineHooks.length).toBe(2);
      expect(pipelineHooks[0][0].detail.newStatus).toBe('publishing');
      expect(pipelineHooks[1][0].detail.newStatus).toBe('published');
    });

    it('emits on rejection', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      (eventBus.publish as ReturnType<typeof vi.fn>).mockClear();

      await engine.rejectItem(ideas[0].id, 'Bad idea');

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const rejectionHook = publishCalls.find(
        (call) => call[0].detail.newStatus === 'rejected',
      );
      expect(rejectionHook).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 44f.35, 44f.36: Pipeline is scoped by channel
  // -------------------------------------------------------------------------

  describe('channel-scoped pipeline', () => {
    it('different channels have independent pipelines', async () => {
      await engine.generateIdeas('channel-A', 'tech');
      await engine.generateIdeas('channel-B', 'gaming');

      const pipelineA = await engine.getPipeline('channel-A');
      const pipelineB = await engine.getPipeline('channel-B');

      // Pipelines should be independent
      expect(pipelineA.length).toBeGreaterThan(0);
      expect(pipelineB.length).toBeGreaterThan(0);

      // All items in pipeline A belong to channel-A
      for (const item of pipelineA) {
        expect(item.channelId).toBe('channel-A');
      }

      // All items in pipeline B belong to channel-B
      for (const item of pipelineB) {
        expect(item.channelId).toBe('channel-B');
      }

      // No overlap
      const idsA = new Set(pipelineA.map((i) => i.id));
      const idsB = new Set(pipelineB.map((i) => i.id));
      for (const id of idsA) {
        expect(idsB.has(id)).toBe(false);
      }
    });

    it('reorderPipeline only affects the specified channel', async () => {
      await engine.generateIdeas('channel-A', 'tech');
      await engine.generateIdeas('channel-B', 'gaming');

      const pipelineA = await engine.getPipeline('channel-A');
      const pipelineB = await engine.getPipeline('channel-B');

      // Reorder channel A
      const reversedIds = [...pipelineA].reverse().map((i) => i.id);
      await engine.reorderPipeline('channel-A', reversedIds);

      // Channel A should be reordered
      const reorderedA = await engine.getPipeline('channel-A');
      expect(reorderedA[0].id).toBe(reversedIds[0]);

      // Channel B should be unchanged
      const unchangedB = await engine.getPipeline('channel-B');
      expect(unchangedB.map((i) => i.id)).toEqual(pipelineB.map((i) => i.id));
    });

    it('reorderPipeline throws if item does not belong to channel', async () => {
      await engine.generateIdeas('channel-A', 'tech');
      await engine.generateIdeas('channel-B', 'gaming');

      const pipelineB = await engine.getPipeline('channel-B');

      // Try to reorder channel-A with an item from channel-B
      await expect(
        engine.reorderPipeline('channel-A', [pipelineB[0].id]),
      ).rejects.toThrow(/not found in channel/);
    });

    it('getPipeline returns empty array for unknown channel', async () => {
      const pipeline = await engine.getPipeline('nonexistent-channel');
      expect(pipeline).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Edit feedback
  // -------------------------------------------------------------------------

  describe('provideFeedback', () => {
    it('transitions item to editing status and stores feedback', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.triggerGeneration(ideas[0].id);

      const result = await engine.provideFeedback(ideas[0].id, 'Make the intro shorter');

      expect(result.status).toBe('editing');
      expect(result.feedback).toContain('Make the intro shorter');
    });

    it('supports multiple feedback rounds', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.triggerGeneration(ideas[0].id);

      await engine.provideFeedback(ideas[0].id, 'Make the intro shorter');
      const result = await engine.provideFeedback(ideas[0].id, 'Change the music');

      expect(result.feedback).toHaveLength(2);
      expect(result.feedback).toContain('Make the intro shorter');
      expect(result.feedback).toContain('Change the music');
    });

    it('throws if item is not in generated or editing status', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      // Item is in "ideated" status
      await expect(
        engine.provideFeedback(ideas[0].id, 'feedback'),
      ).rejects.toThrow(/Cannot provide feedback/);
    });
  });

  // -------------------------------------------------------------------------
  // markReadyToPublish
  // -------------------------------------------------------------------------

  describe('markReadyToPublish', () => {
    it('transitions generated item to ready_to_publish', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.triggerGeneration(ideas[0].id);

      const result = await engine.markReadyToPublish(ideas[0].id);

      expect(result.status).toBe('ready_to_publish');
    });

    it('transitions editing item to ready_to_publish', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      await engine.triggerGeneration(ideas[0].id);
      await engine.provideFeedback(ideas[0].id, 'Looks good now');

      const result = await engine.markReadyToPublish(ideas[0].id);

      expect(result.status).toBe('ready_to_publish');
    });
  });

  // -------------------------------------------------------------------------
  // getPipelineItem
  // -------------------------------------------------------------------------

  describe('getPipelineItem', () => {
    it('returns item by id', async () => {
      const ideas = await engine.generateIdeas('channel-1', 'tech');
      const item = await engine.getPipelineItem(ideas[0].id);

      expect(item).not.toBeNull();
      expect(item!.id).toBe(ideas[0].id);
    });

    it('returns null for unknown id', async () => {
      const item = await engine.getPipelineItem('nonexistent-id');
      expect(item).toBeNull();
    });
  });
});
