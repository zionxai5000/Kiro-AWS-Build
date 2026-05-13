/**
 * Unit tests for ZionX App Idea Pipeline Manager
 *
 * Validates: Requirements 45c.8, 45c.9, 45c.10, 45c.11, 45d.12, 45d.13, 45d.14, 45d.15
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AppIdeaPipelineManagerImpl,
  type EventBusPublisher,
  type AppIdea,
} from '../pipeline-manager.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusPublisher & { published: any[] } {
  const published: any[] = [];
  return {
    published,
    async publish(event: any) {
      published.push(event);
    },
  };
}

function createManager(staleThresholdDays?: number) {
  const eventBus = createMockEventBus();
  const manager = new AppIdeaPipelineManagerImpl({
    eventBus,
    staleThresholdDays,
  });
  return { manager, eventBus };
}

function createIdeaInput(overrides?: Partial<Omit<AppIdea, 'id' | 'status' | 'createdAt' | 'lastActionAt'>>) {
  return {
    name: 'Test App',
    valueProposition: 'Solve a problem',
    targetAudience: 'Developers',
    monetizationModel: 'freemium',
    category: 'productivity',
    predictedDownloads: 50000,
    predictedRevenue: 5000,
    competitionLevel: 'medium' as const,
    nicheScore: 72,
    technicalFeasibility: 80,
    source: 'autonomous' as const,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppIdeaPipelineManager', () => {
  describe('addIdea', () => {
    it('adds ideas from autonomous source with correct metadata', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput({ source: 'autonomous' }));

      expect(idea.id).toBeDefined();
      expect(idea.source).toBe('autonomous');
      expect(idea.status).toBe('pipeline');
      expect(idea.createdAt).toBeInstanceOf(Date);
      expect(idea.lastActionAt).toBeInstanceOf(Date);
    });

    it('adds ideas from manual source with correct metadata', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput({ source: 'manual' }));

      expect(idea.source).toBe('manual');
      expect(idea.status).toBe('pipeline');
    });

    it('emits app.idea.ranked hook on add', async () => {
      const { manager, eventBus } = createManager();

      const idea = await manager.addIdea(createIdeaInput());

      const rankedEvent = eventBus.published.find((e) => e.type === 'app.idea.ranked');
      expect(rankedEvent).toBeDefined();
      expect(rankedEvent.detail.ideaId).toBe(idea.id);
      expect(rankedEvent.detail.action).toBe('added');
    });

    it('emits app.pipeline.updated hook on add', async () => {
      const { manager, eventBus } = createManager();

      await manager.addIdea(createIdeaInput());

      const pipelineEvent = eventBus.published.find((e) => e.type === 'app.pipeline.updated');
      expect(pipelineEvent).toBeDefined();
      expect(pipelineEvent.detail.action).toBe('idea_added');
    });
  });

  describe('rankPipeline', () => {
    it('sorts by composite score correctly', async () => {
      const { manager } = createManager();

      await manager.addIdea(createIdeaInput({ name: 'Low', predictedDownloads: 1000, predictedRevenue: 100 }));
      await manager.addIdea(createIdeaInput({ name: 'High', predictedDownloads: 90000, predictedRevenue: 9000 }));
      await manager.addIdea(createIdeaInput({ name: 'Mid', predictedDownloads: 50000, predictedRevenue: 5000 }));

      const ranked = manager.rankPipeline();

      expect(ranked[0].name).toBe('High');
      expect(ranked[ranked.length - 1].name).toBe('Low');
    });

    it('only includes pipeline and bookmarked ideas', async () => {
      const { manager } = createManager();

      const idea1 = await manager.addIdea(createIdeaInput({ name: 'Active' }));
      const idea2 = await manager.addIdea(createIdeaInput({ name: 'Dismissed' }));
      await manager.dismissIdea(idea2.id);

      const ranked = manager.rankPipeline();

      expect(ranked.map((i) => i.name)).toContain('Active');
      expect(ranked.map((i) => i.name)).not.toContain('Dismissed');
    });
  });

  describe('getPipeline with filters', () => {
    it('filters by category', async () => {
      const { manager } = createManager();

      await manager.addIdea(createIdeaInput({ name: 'Prod', category: 'productivity' }));
      await manager.addIdea(createIdeaInput({ name: 'Health', category: 'health' }));

      const filtered = manager.getPipeline({ category: 'productivity' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Prod');
    });

    it('filters by minimum revenue', async () => {
      const { manager } = createManager();

      await manager.addIdea(createIdeaInput({ name: 'Low Rev', predictedRevenue: 100 }));
      await manager.addIdea(createIdeaInput({ name: 'High Rev', predictedRevenue: 10000 }));

      const filtered = manager.getPipeline({ minRevenue: 5000 });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('High Rev');
    });

    it('filters by max competition level', async () => {
      const { manager } = createManager();

      await manager.addIdea(createIdeaInput({ name: 'Low Comp', competitionLevel: 'low' }));
      await manager.addIdea(createIdeaInput({ name: 'High Comp', competitionLevel: 'high' }));

      const filtered = manager.getPipeline({ maxCompetition: 'medium' });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Low Comp');
    });

    it('filters by minimum feasibility', async () => {
      const { manager } = createManager();

      await manager.addIdea(createIdeaInput({ name: 'Easy', technicalFeasibility: 90 }));
      await manager.addIdea(createIdeaInput({ name: 'Hard', technicalFeasibility: 30 }));

      const filtered = manager.getPipeline({ minFeasibility: 50 });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Easy');
    });
  });

  describe('refreshPipeline', () => {
    it('removes stale ideas older than threshold without action', async () => {
      const { manager } = createManager(30);

      const idea = await manager.addIdea(createIdeaInput({ name: 'Stale' }));
      // Manually set lastActionAt to 31 days ago
      (idea as any).lastActionAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      await manager.refreshPipeline();

      const pipeline = manager.getPipeline();
      expect(pipeline.map((i) => i.name)).not.toContain('Stale');
    });

    it('adds new ideas from research during refresh', async () => {
      const { manager } = createManager();

      await manager.refreshPipeline([
        createIdeaInput({ name: 'New Idea 1' }),
        createIdeaInput({ name: 'New Idea 2' }),
      ]);

      const pipeline = manager.getPipeline();
      expect(pipeline.map((i) => i.name)).toContain('New Idea 1');
      expect(pipeline.map((i) => i.name)).toContain('New Idea 2');
    });

    it('emits app.idea.ranked hook on re-rank', async () => {
      const { manager, eventBus } = createManager();

      await manager.refreshPipeline([createIdeaInput({ name: 'Fresh' })]);

      const reRankEvents = eventBus.published.filter(
        (e) => e.type === 'app.idea.ranked' && e.detail.action === 're-ranked',
      );
      expect(reRankEvents.length).toBeGreaterThan(0);
    });
  });

  describe('status transitions', () => {
    it('transitions pipeline → generating → generated → published', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput());
      expect(idea.status).toBe('pipeline');

      const generating = await manager.markAsGenerating(idea.id);
      expect(generating.status).toBe('generating');

      const generated = await manager.markAsGenerated(idea.id);
      expect(generated.status).toBe('generated');

      const published = await manager.markAsPublished(idea.id);
      expect(published.status).toBe('published');
    });

    it('emits app.pipeline.updated on all state changes', async () => {
      const { manager, eventBus } = createManager();

      const idea = await manager.addIdea(createIdeaInput());
      eventBus.published.length = 0; // Clear previous events

      await manager.markAsGenerating(idea.id);
      await manager.markAsGenerated(idea.id);
      await manager.markAsPublished(idea.id);

      const pipelineEvents = eventBus.published.filter((e) => e.type === 'app.pipeline.updated');
      expect(pipelineEvents).toHaveLength(3);
    });

    it('throws error for non-existent idea', async () => {
      const { manager } = createManager();

      await expect(manager.markAsGenerating('non-existent')).rejects.toThrow('Idea not found');
    });
  });

  describe('dismiss and bookmark', () => {
    it('dismiss updates idea status to dismissed', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput());
      const dismissed = await manager.dismissIdea(idea.id);

      expect(dismissed.status).toBe('dismissed');
    });

    it('bookmark updates idea status to bookmarked', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput());
      const bookmarked = await manager.bookmarkIdea(idea.id);

      expect(bookmarked.status).toBe('bookmarked');
    });

    it('dismissed ideas are excluded from pipeline ranking', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput({ name: 'Dismissed' }));
      await manager.dismissIdea(idea.id);

      const pipeline = manager.rankPipeline();
      expect(pipeline.map((i) => i.name)).not.toContain('Dismissed');
    });

    it('bookmarked ideas remain in pipeline ranking', async () => {
      const { manager } = createManager();

      const idea = await manager.addIdea(createIdeaInput({ name: 'Bookmarked' }));
      await manager.bookmarkIdea(idea.id);

      const pipeline = manager.rankPipeline();
      expect(pipeline.map((i) => i.name)).toContain('Bookmarked');
    });
  });
});
