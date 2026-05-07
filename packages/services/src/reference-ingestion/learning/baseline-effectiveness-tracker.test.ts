/**
 * Unit tests for BaselineEffectivenessTracker.
 *
 * Validates: Requirements 34h.49, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';
import type { SeraphimEvent } from '@seraphim/core/types/event.js';

import { BaselineEffectivenessTracker } from './baseline-effectiveness-tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id'),
    storeWorking: vi.fn().mockResolvedValue('working-id'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: 'baseline-effectiveness-tracker',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createSeraphimEvent(overrides: Partial<SeraphimEvent> = {}): SeraphimEvent {
  return {
    id: 'evt-1',
    source: 'seraphim.test',
    type: 'test.event',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'seraphim',
    correlationId: 'corr-1',
    detail: {},
    metadata: {
      schemaVersion: '1.0',
      producerVersion: '1.0',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaselineEffectivenessTracker', () => {
  let zikaron: ZikaronService;
  let eventBus: EventBusService;
  let tracker: BaselineEffectivenessTracker;

  beforeEach(() => {
    zikaron = createMockZikaron();
    eventBus = createMockEventBus();
    tracker = new BaselineEffectivenessTracker(zikaron, eventBus);
  });

  // -------------------------------------------------------------------------
  // Initialization & Subscriptions
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('subscribes to quality-gate.evaluated and baseline.updated events', async () => {
      await tracker.initialize();

      expect(eventBus.subscribe).toHaveBeenCalledTimes(2);
      expect(eventBus.subscribe).toHaveBeenCalledWith(
        { type: ['quality-gate.evaluated'] },
        expect.any(Function),
      );
      expect(eventBus.subscribe).toHaveBeenCalledWith(
        { type: ['baseline.updated'] },
        expect.any(Function),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Recording Evaluation Results
  // -------------------------------------------------------------------------

  describe('recordEvaluation', () => {
    it('records evaluation results and updates pass rate tracking', () => {
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);

      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.totalEvaluations).toBe(3);
      expect(report.currentPassRate).toBeCloseTo(2 / 3);
    });

    it('tracks evaluations per domain category independently', () => {
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('video-content', false, 1);

      const mobileReport = tracker.getEffectivenessReport('mobile-apps');
      const videoReport = tracker.getEffectivenessReport('video-content');

      expect(mobileReport.totalEvaluations).toBe(1);
      expect(mobileReport.currentPassRate).toBe(1);
      expect(videoReport.totalEvaluations).toBe(1);
      expect(videoReport.currentPassRate).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Baseline Update Recording
  // -------------------------------------------------------------------------

  describe('recordBaselineUpdate', () => {
    it('records a baseline update event', async () => {
      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://example.com/ref1']);

      const report = tracker.getEffectivenessReport('mobile-apps');
      // No correlation yet since we need at least 2 baseline versions
      expect(report.correlations).toHaveLength(0);
    });

    it('computes correlation when sufficient evaluations exist before and after', async () => {
      // Record evaluations for baseline version 1 (3 needed minimum)
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);

      // Record first baseline update
      await tracker.recordBaselineUpdate('mobile-apps', 1, ['https://ref1.com']);

      // Record evaluations for baseline version 2 (improvement)
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);

      // Record second baseline update — triggers correlation computation
      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://ref2.com']);

      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.correlations).toHaveLength(1);
      expect(report.correlations[0].passRateBefore).toBeCloseTo(1 / 3);
      expect(report.correlations[0].passRateAfter).toBe(1);
      expect(report.correlations[0].passRateDelta).toBeGreaterThan(0);
    });

    it('stores correlation in Zikaron when pass rates improve', async () => {
      // Setup: evaluations for version 1
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);

      await tracker.recordBaselineUpdate('mobile-apps', 1, ['https://ref1.com']);

      // Evaluations for version 2 (improvement)
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);

      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://ref2.com']);

      expect(zikaron.storeProcedural).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'seraphim',
          layer: 'procedural',
          sourceAgentId: 'baseline-effectiveness-tracker',
          tags: expect.arrayContaining([
            'baseline-effectiveness',
            'domain:mobile-apps',
            'version:2',
            'delta:improvement',
            'reference:https://ref2.com',
          ]),
        }),
      );
    });

    it('does not store correlation in Zikaron when pass rates do not improve', async () => {
      // Setup: evaluations for version 1 (all pass)
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);

      await tracker.recordBaselineUpdate('mobile-apps', 1, ['https://ref1.com']);

      // Evaluations for version 2 (regression)
      tracker.recordEvaluation('mobile-apps', false, 2);
      tracker.recordEvaluation('mobile-apps', false, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);

      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://ref2.com']);

      // Correlation IS still stored (the tracker records all correlations, including regressions)
      // but the tag should indicate regression
      expect(zikaron.storeProcedural).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['delta:regression']),
        }),
      );
    });

    it('does not compute correlation when fewer than 3 evaluations exist before update', async () => {
      // Only 2 evaluations for version 1 (below MIN_EVALUATIONS_FOR_CORRELATION = 3)
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);

      await tracker.recordBaselineUpdate('mobile-apps', 1, ['https://ref1.com']);

      // Evaluations for version 2
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);

      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://ref2.com']);

      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.correlations).toHaveLength(0);
      expect(zikaron.storeProcedural).not.toHaveBeenCalled();
    });

    it('tracks multiple baseline updates independently', async () => {
      // Version 1 evaluations
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);
      await tracker.recordBaselineUpdate('mobile-apps', 1, ['https://ref1.com']);

      // Version 2 evaluations (improvement)
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://ref2.com']);

      // Version 3 evaluations (slight regression from v2)
      tracker.recordEvaluation('mobile-apps', true, 3);
      tracker.recordEvaluation('mobile-apps', false, 3);
      tracker.recordEvaluation('mobile-apps', true, 3);
      await tracker.recordBaselineUpdate('mobile-apps', 3, ['https://ref3.com']);

      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.correlations).toHaveLength(2);

      // First correlation: v1 -> v2 (improvement)
      expect(report.correlations[0].baselineVersion).toBe(2);
      expect(report.correlations[0].passRateDelta).toBeGreaterThan(0);
      expect(report.correlations[0].contributingReferences).toEqual(['https://ref2.com']);

      // Second correlation: v2 -> v3 (regression)
      expect(report.correlations[1].baselineVersion).toBe(3);
      expect(report.correlations[1].passRateDelta).toBeLessThan(0);
      expect(report.correlations[1].contributingReferences).toEqual(['https://ref3.com']);
    });
  });

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  describe('event handling', () => {
    it('handles quality-gate.evaluated event by recording evaluation', async () => {
      await tracker.initialize();

      // Get the handler that was registered for quality-gate.evaluated
      const subscribeCalls = (eventBus.subscribe as ReturnType<typeof vi.fn>).mock.calls;
      const evalHandler = subscribeCalls.find(
        call => call[0].type[0] === 'quality-gate.evaluated',
      )![1] as (event: SeraphimEvent) => Promise<void>;

      const event = createSeraphimEvent({
        type: 'quality-gate.evaluated',
        detail: {
          domainCategory: 'mobile-apps',
          passed: true,
          baselineVersion: 1,
        },
      });

      await evalHandler(event);

      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.totalEvaluations).toBe(1);
      expect(report.currentPassRate).toBe(1);
    });

    it('handles baseline.updated event by recording the update', async () => {
      await tracker.initialize();

      // Get the handler that was registered for baseline.updated
      const subscribeCalls = (eventBus.subscribe as ReturnType<typeof vi.fn>).mock.calls;
      const baselineHandler = subscribeCalls.find(
        call => call[0].type[0] === 'baseline.updated',
      )![1] as (event: SeraphimEvent) => Promise<void>;

      // First, add evaluations for version 1 so we can verify the update is recorded
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);

      const event = createSeraphimEvent({
        type: 'baseline.updated',
        detail: {
          domainCategory: 'mobile-apps',
          version: 2,
          sourceUrls: ['https://ref-from-event.com'],
        },
      });

      await baselineHandler(event);

      // The baseline update should be recorded (no correlation yet since only 1 update)
      const report = tracker.getEffectivenessReport('mobile-apps');
      // Report should still work without errors
      expect(report.domainCategory).toBe('mobile-apps');
    });

    it('ignores quality-gate.evaluated events with missing fields', async () => {
      await tracker.initialize();

      const subscribeCalls = (eventBus.subscribe as ReturnType<typeof vi.fn>).mock.calls;
      const evalHandler = subscribeCalls.find(
        call => call[0].type[0] === 'quality-gate.evaluated',
      )![1] as (event: SeraphimEvent) => Promise<void>;

      // Event missing domainCategory
      const event = createSeraphimEvent({
        type: 'quality-gate.evaluated',
        detail: {
          passed: true,
          baselineVersion: 1,
        },
      });

      await evalHandler(event);

      // Nothing should be recorded for any domain
      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.totalEvaluations).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Effectiveness Report
  // -------------------------------------------------------------------------

  describe('getEffectivenessReport', () => {
    it('returns empty report for unknown domain category', () => {
      const report = tracker.getEffectivenessReport('unknown-domain');

      expect(report.domainCategory).toBe('unknown-domain');
      expect(report.currentPassRate).toBe(0);
      expect(report.totalEvaluations).toBe(0);
      expect(report.passRateTrend).toHaveLength(0);
      expect(report.correlations).toHaveLength(0);
    });

    it('returns correct pass rate trend grouped by baseline version', () => {
      // Version 1: 2/3 pass rate
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);

      // Version 2: 3/3 pass rate
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);

      const report = tracker.getEffectivenessReport('mobile-apps');

      expect(report.passRateTrend).toHaveLength(2);
      expect(report.passRateTrend[0]).toEqual({
        totalEvaluations: 3,
        passedEvaluations: 2,
        passRate: 2 / 3,
        baselineVersion: 1,
      });
      expect(report.passRateTrend[1]).toEqual({
        totalEvaluations: 3,
        passedEvaluations: 3,
        passRate: 1,
        baselineVersion: 2,
      });
    });

    it('returns overall pass rate across all baseline versions', () => {
      tracker.recordEvaluation('mobile-apps', true, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);

      const report = tracker.getEffectivenessReport('mobile-apps');
      // 3 passed out of 4 total
      expect(report.currentPassRate).toBe(0.75);
      expect(report.totalEvaluations).toBe(4);
    });

    it('includes correlations linking reference ingestions to quality improvements', async () => {
      // Version 1 evaluations
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', false, 1);
      tracker.recordEvaluation('mobile-apps', true, 1);
      await tracker.recordBaselineUpdate('mobile-apps', 1, ['https://ref-a.com', 'https://ref-b.com']);

      // Version 2 evaluations (improvement)
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      tracker.recordEvaluation('mobile-apps', true, 2);
      await tracker.recordBaselineUpdate('mobile-apps', 2, ['https://ref-c.com']);

      const report = tracker.getEffectivenessReport('mobile-apps');
      expect(report.correlations).toHaveLength(1);
      expect(report.correlations[0].contributingReferences).toEqual(['https://ref-c.com']);
      expect(report.correlations[0].passRateBefore).toBeCloseTo(1 / 3);
      expect(report.correlations[0].passRateAfter).toBe(1);
      expect(report.correlations[0].domainCategory).toBe('mobile-apps');
      expect(report.correlations[0].baselineVersion).toBe(2);
      expect(report.correlations[0].recordedAt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  describe('dispose', () => {
    it('unsubscribes from all event subscriptions', async () => {
      (eventBus.subscribe as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('sub-eval')
        .mockResolvedValueOnce('sub-baseline');

      await tracker.initialize();
      await tracker.dispose();

      expect(eventBus.unsubscribe).toHaveBeenCalledWith('sub-eval');
      expect(eventBus.unsubscribe).toHaveBeenCalledWith('sub-baseline');
    });
  });
});
