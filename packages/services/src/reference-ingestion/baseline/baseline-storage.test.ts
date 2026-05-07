/**
 * Unit tests for Baseline Storage.
 *
 * Tests cover:
 * - App baselines route to ZionX Domain_Expertise_Profile
 * - Video baselines route to ZXMG Domain_Expertise_Profile
 * - Versioning retains full history (multiple stores create multiple versions)
 * - Tagging includes reference type, source URL, domain category, timestamp
 * - queryByCategory retrieves correct baseline for domain
 * - `baseline.updated` event is published on every store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';
import type { ProceduralEntry } from '@seraphim/core/types/memory.js';
import type { SystemEvent } from '@seraphim/core/types/event.js';

import type { AppQualityBaseline, VideoQualityBaseline } from './types.js';
import { BaselineStorage } from './baseline-storage.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id'),
    storeWorking: vi.fn().mockResolvedValue('working-id'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ agentId: '', workingMemory: null, recentEpisodic: [], proceduralPatterns: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEventBusService(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createAppBaseline(overrides: Partial<AppQualityBaseline> = {}): AppQualityBaseline {
  return {
    id: 'app-baseline-1',
    type: 'app',
    domainCategory: 'wellness apps',
    dimensions: [
      { name: 'visual_polish', score: 7, referenceCount: 1, confidence: 0.5, examplePatterns: ['clean layout'] },
      { name: 'interaction_complexity', score: 6, referenceCount: 1, confidence: 0.5, examplePatterns: ['swipe gestures'] },
    ],
    sources: [{ url: 'https://apps.apple.com/us/app/wellness/id123', extractionDate: new Date('2024-01-15'), weight: 0.8 }],
    corePrinciples: [],
    contradictions: [],
    overallConfidence: 0.5,
    version: 1,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

function createVideoBaseline(overrides: Partial<VideoQualityBaseline> = {}): VideoQualityBaseline {
  return {
    id: 'video-baseline-1',
    type: 'video',
    domainCategory: 'tech review channels',
    dimensions: [
      { name: 'hook_strength', score: 8, referenceCount: 1, confidence: 0.6, examplePatterns: ['question hook'] },
      { name: 'pacing_quality', score: 7, referenceCount: 1, confidence: 0.5, examplePatterns: ['fast rhythm'] },
    ],
    sources: [{ url: 'https://youtube.com/@techreviewer', extractionDate: new Date('2024-01-15'), weight: 0.7 }],
    corePrinciples: [],
    contradictions: [],
    overallConfidence: 0.55,
    version: 1,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaselineStorage', () => {
  let zikaronService: ZikaronService;
  let eventBusService: EventBusService;
  let storage: BaselineStorage;

  beforeEach(() => {
    zikaronService = createMockZikaronService();
    eventBusService = createMockEventBusService();
    storage = new BaselineStorage(zikaronService, eventBusService);
  });

  // -------------------------------------------------------------------------
  // Routing: App baselines → ZionX
  // -------------------------------------------------------------------------

  describe('app baseline routing', () => {
    it('routes app baselines to ZionX Domain_Expertise_Profile', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      expect(zikaronService.storeProcedural).toHaveBeenCalledTimes(1);
      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProceduralEntry;
      expect(storedEntry.sourceAgentId).toBe('zionx');
      expect(storedEntry.tags).toContain('Domain_Expertise_Profile');
    });
  });

  // -------------------------------------------------------------------------
  // Routing: Video baselines → ZXMG
  // -------------------------------------------------------------------------

  describe('video baseline routing', () => {
    it('routes video baselines to ZXMG Domain_Expertise_Profile', async () => {
      const baseline = createVideoBaseline();

      await storage.store(baseline, 'zxmg');

      expect(zikaronService.storeProcedural).toHaveBeenCalledTimes(1);
      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProceduralEntry;
      expect(storedEntry.sourceAgentId).toBe('zxmg');
      expect(storedEntry.tags).toContain('Domain_Expertise_Profile');
    });
  });

  // -------------------------------------------------------------------------
  // Versioning
  // -------------------------------------------------------------------------

  describe('versioning', () => {
    it('retains full history - multiple stores create multiple versions', async () => {
      const baseline1 = createAppBaseline({ version: 1 });
      const baseline2 = createAppBaseline({ id: 'app-baseline-2', version: 2 });
      const baseline3 = createAppBaseline({ id: 'app-baseline-3', version: 3 });

      await storage.store(baseline1, 'zionx');
      await storage.store(baseline2, 'zionx');
      await storage.store(baseline3, 'zionx');

      const history = storage.getVersionHistory('wellness apps');
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
    });

    it('each store creates a new version entry in Zikaron', async () => {
      const baseline1 = createAppBaseline({ version: 1 });
      const baseline2 = createAppBaseline({ id: 'app-baseline-2', version: 2 });

      await storage.store(baseline1, 'zionx');
      await storage.store(baseline2, 'zionx');

      expect(zikaronService.storeProcedural).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Tagging
  // -------------------------------------------------------------------------

  describe('tagging', () => {
    it('tags include reference type', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProceduralEntry;
      expect(storedEntry.tags).toContain('type:app');
    });

    it('tags include source URL', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProceduralEntry;
      expect(storedEntry.tags).toContain('source:https://apps.apple.com/us/app/wellness/id123');
    });

    it('tags include domain category', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProceduralEntry;
      expect(storedEntry.tags).toContain('domain:wellness apps');
    });

    it('tags include extraction timestamp', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProceduralEntry;
      const timestampTag = storedEntry.tags.find(t => t.startsWith('timestamp:'));
      expect(timestampTag).toBeDefined();
      // Verify it's a valid ISO timestamp
      const isoDate = timestampTag!.replace('timestamp:', '');
      expect(new Date(isoDate).toISOString()).toBe(isoDate);
    });
  });

  // -------------------------------------------------------------------------
  // queryByCategory
  // -------------------------------------------------------------------------

  describe('queryByCategory', () => {
    it('retrieves correct baseline for domain category', async () => {
      const appBaseline = createAppBaseline({ domainCategory: 'wellness apps' });
      const videoBaseline = createVideoBaseline({ domainCategory: 'tech review channels' });

      await storage.store(appBaseline, 'zionx');
      await storage.store(videoBaseline, 'zxmg');

      const result = await storage.queryByCategory('wellness apps');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('app');
      expect(result!.domainCategory).toBe('wellness apps');
    });

    it('returns the latest version for a category', async () => {
      const baseline1 = createAppBaseline({ version: 1 });
      const baseline2 = createAppBaseline({ id: 'app-baseline-2', version: 2, overallConfidence: 0.8 });

      await storage.store(baseline1, 'zionx');
      await storage.store(baseline2, 'zionx');

      const result = await storage.queryByCategory('wellness apps');
      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.overallConfidence).toBe(0.8);
    });

    it('returns null for unknown category', async () => {
      const result = await storage.queryByCategory('unknown category');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Event Publishing
  // -------------------------------------------------------------------------

  describe('baseline.updated event', () => {
    it('publishes baseline.updated event on every store', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      expect(eventBusService.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = (eventBusService.publish as ReturnType<typeof vi.fn>).mock.calls[0][0] as SystemEvent;
      expect(publishedEvent.type).toBe('baseline.updated');
    });

    it('event includes affected domain category', async () => {
      const baseline = createAppBaseline({ domainCategory: 'wellness apps' });

      await storage.store(baseline, 'zionx');

      const publishedEvent = (eventBusService.publish as ReturnType<typeof vi.fn>).mock.calls[0][0] as SystemEvent;
      expect(publishedEvent.detail.domainCategory).toBe('wellness apps');
    });

    it('event includes baseline version', async () => {
      const baseline = createAppBaseline({ version: 3 });

      await storage.store(baseline, 'zionx');

      const publishedEvent = (eventBusService.publish as ReturnType<typeof vi.fn>).mock.calls[0][0] as SystemEvent;
      expect(publishedEvent.detail.version).toBe(3);
    });

    it('event includes changed dimensions', async () => {
      const baseline = createAppBaseline();

      await storage.store(baseline, 'zionx');

      const publishedEvent = (eventBusService.publish as ReturnType<typeof vi.fn>).mock.calls[0][0] as SystemEvent;
      expect(publishedEvent.detail.changedDimensions).toEqual(['visual_polish', 'interaction_complexity']);
    });

    it('publishes event for every store call', async () => {
      const baseline1 = createAppBaseline({ version: 1 });
      const baseline2 = createAppBaseline({ id: 'app-baseline-2', version: 2 });

      await storage.store(baseline1, 'zionx');
      await storage.store(baseline2, 'zionx');

      expect(eventBusService.publish).toHaveBeenCalledTimes(2);
    });
  });
});
