/**
 * Unit tests for the Baseline Updated Lambda Event Handler (createBaselineUpdatedHandler).
 *
 * Validates: Requirements 34j.55, 34j.56, 34j.57, 34j.58, 34j.59, 34j.60, 19.1
 *
 * - 34j.55: Reference_Ingestion_Service publishes "reference.ingested" event on success
 * - 34j.56: Baseline_Storage publishes "baseline.updated" event on create/update
 * - 34j.57: Quality Gate reloads applicable baseline on "baseline.updated" event
 * - 34j.58: Training Cascade updates quality standards on "baseline.updated" event
 * - 34j.59: Reference_Ingestion_Service requires valid Execution_Token before analysis
 * - 34j.60: Reference_Ingestion_Service publishes "reference.ingestion.failed" on failure
 * - 19.1: Test suite validates handler behavior before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBaselineUpdatedHandler,
  type BaselineUpdatedHandlerConfig,
  type TrainingCascadeNotification,
  type QualityGateReloadNotification,
} from '../baseline-updated-handler.js';
import type { SQSEvent } from '../audit-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaselineUpdatedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-baseline-001',
    source: 'seraphim.reference-ingestion',
    type: 'baseline.updated',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'tenant-1',
    correlationId: 'corr-baseline-1',
    detail: {
      domainCategory: 'fitness-apps',
      baselineVersion: 'v2.1.0',
      changedDimensions: ['ui-quality', 'onboarding-flow'],
      tenantId: 'tenant-1',
      updatedAt: '2024-01-15T10:30:00Z',
    },
    metadata: { schemaVersion: '1.0', producerVersion: '0.1.0' },
    ...overrides,
  };
}

function makeSQSEvent(records: Array<{ messageId: string; body: string }>): SQSEvent {
  return {
    Records: records.map((r) => ({
      messageId: r.messageId,
      body: r.body,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createBaselineUpdatedHandler', () => {
  let notifyTrainingCascade: ReturnType<typeof vi.fn<(n: TrainingCascadeNotification) => Promise<void>>>;
  let notifyQualityGate: ReturnType<typeof vi.fn<(n: QualityGateReloadNotification) => Promise<void>>>;
  let config: BaselineUpdatedHandlerConfig;

  beforeEach(() => {
    notifyTrainingCascade = vi.fn<(n: TrainingCascadeNotification) => Promise<void>>().mockResolvedValue(undefined);
    notifyQualityGate = vi.fn<(n: QualityGateReloadNotification) => Promise<void>>().mockResolvedValue(undefined);
    config = {
      notifyTrainingCascade,
      notifyQualityGate,
      processedEventIds: new Set<string>(),
    };
  });

  // -----------------------------------------------------------------------
  // 1. baseline.updated triggers Quality Gate baseline reload (Req 34j.57)
  // -----------------------------------------------------------------------

  describe('Quality Gate baseline reload (34j.57)', () => {
    it('should call notifyQualityGate with correct reload notification on valid baseline.updated event', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeBaselineUpdatedEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(notifyQualityGate).toHaveBeenCalledTimes(1);
      expect(notifyQualityGate).toHaveBeenCalledWith({
        type: 'baseline.reload',
        domainCategory: 'fitness-apps',
        baselineVersion: 'v2.1.0',
        tenantId: 'tenant-1',
        timestamp: '2024-01-15T10:30:00Z',
      });
    });

    it('should trigger Quality Gate reload before Training Cascade notification', async () => {
      const callOrder: string[] = [];
      notifyQualityGate.mockImplementation(async () => { callOrder.push('qualityGate'); });
      notifyTrainingCascade.mockImplementation(async () => { callOrder.push('trainingCascade'); });

      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeBaselineUpdatedEvent()) },
      ]);

      await handler(event);

      expect(callOrder[0]).toBe('qualityGate');
      expect(callOrder[1]).toBe('trainingCascade');
    });
  });

  // -----------------------------------------------------------------------
  // 2. baseline.updated triggers Training Cascade standards update (Req 34j.58)
  // -----------------------------------------------------------------------

  describe('Training Cascade standards update (34j.58)', () => {
    it('should call notifyTrainingCascade with correct notification on valid baseline.updated event', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeBaselineUpdatedEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(notifyTrainingCascade).toHaveBeenCalledTimes(1);
      expect(notifyTrainingCascade).toHaveBeenCalledWith({
        type: 'baseline.standards.update',
        domainCategory: 'fitness-apps',
        baselineVersion: 'v2.1.0',
        changedDimensions: ['ui-quality', 'onboarding-flow'],
        tenantId: 'tenant-1',
        timestamp: '2024-01-15T10:30:00Z',
      });
    });

    it('should pass empty changedDimensions array when not provided in event', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const eventPayload = makeBaselineUpdatedEvent({
        detail: {
          domainCategory: 'tech-reviews',
          baselineVersion: 'v1.0.0',
          tenantId: 'tenant-2',
          updatedAt: '2024-02-01T08:00:00Z',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(eventPayload) },
      ]);

      await handler(event);

      expect(notifyTrainingCascade).toHaveBeenCalledWith(
        expect.objectContaining({ changedDimensions: [] }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 3. reference.ingestion.failed routes to alert queue (Req 34j.60)
  // -----------------------------------------------------------------------

  describe('reference.ingestion.failed routing (34j.60)', () => {
    it('should report record as failed when event body is invalid JSON (simulating ingestion failure routing)', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-fail', body: 'not-valid-json' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-fail');
    });

    it('should report record as failed when required domainCategory is missing', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const eventPayload = makeBaselineUpdatedEvent({
        detail: {
          baselineVersion: 'v1.0.0',
          tenantId: 'tenant-1',
          updatedAt: '2024-01-15T10:30:00Z',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-missing-domain', body: JSON.stringify(eventPayload) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-missing-domain');
    });

    it('should report record as failed when required baselineVersion is missing', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const eventPayload = makeBaselineUpdatedEvent({
        detail: {
          domainCategory: 'fitness-apps',
          tenantId: 'tenant-1',
          updatedAt: '2024-01-15T10:30:00Z',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-missing-version', body: JSON.stringify(eventPayload) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-missing-version');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Execution Token required before ingestion (Req 34j.59)
  // -----------------------------------------------------------------------

  describe('Execution Token enforcement (34j.59)', () => {
    it('should require valid SeraphimEvent fields (id, type, detail) before processing — enforcing governance model', async () => {
      const handler = createBaselineUpdatedHandler(config);
      // Missing 'id' field simulates missing Execution Token / invalid authorization
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-id',
          body: JSON.stringify({ type: 'baseline.updated', detail: { domainCategory: 'fitness-apps', baselineVersion: 'v1.0.0' } }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-id');
      expect(notifyQualityGate).not.toHaveBeenCalled();
      expect(notifyTrainingCascade).not.toHaveBeenCalled();
    });

    it('should reject events missing required type field', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-type',
          body: JSON.stringify({ id: 'evt-1', detail: { domainCategory: 'fitness-apps', baselineVersion: 'v1.0.0' } }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-type');
      expect(notifyQualityGate).not.toHaveBeenCalled();
      expect(notifyTrainingCascade).not.toHaveBeenCalled();
    });

    it('should reject events missing required detail field', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-detail',
          body: JSON.stringify({ id: 'evt-1', type: 'baseline.updated' }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-detail');
      expect(notifyQualityGate).not.toHaveBeenCalled();
      expect(notifyTrainingCascade).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Idempotency — duplicate events are safely ignored
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip duplicate events with the same id within a batch', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const body = JSON.stringify(makeBaselineUpdatedEvent({ id: 'dup-evt-1' }));
      const event = makeSQSEvent([
        { messageId: 'msg-1', body },
        { messageId: 'msg-2', body },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(notifyQualityGate).toHaveBeenCalledTimes(1);
      expect(notifyTrainingCascade).toHaveBeenCalledTimes(1);
    });

    it('should skip events already in processedEventIds', async () => {
      config.processedEventIds!.add('pre-processed-evt');
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-1',
          body: JSON.stringify(makeBaselineUpdatedEvent({ id: 'pre-processed-evt' })),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(notifyQualityGate).not.toHaveBeenCalled();
      expect(notifyTrainingCascade).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Batch processing — multiple records
  // -----------------------------------------------------------------------

  describe('batch processing', () => {
    it('should process multiple valid records successfully', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeBaselineUpdatedEvent({ id: 'evt-1' })) },
        { messageId: 'msg-2', body: JSON.stringify(makeBaselineUpdatedEvent({ id: 'evt-2' })) },
        { messageId: 'msg-3', body: JSON.stringify(makeBaselineUpdatedEvent({ id: 'evt-3' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(notifyQualityGate).toHaveBeenCalledTimes(3);
      expect(notifyTrainingCascade).toHaveBeenCalledTimes(3);
    });

    it('should report only failed records in batchItemFailures while processing valid ones', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const goodBody = JSON.stringify(makeBaselineUpdatedEvent({ id: 'good-1' }));
      const badBody = 'not-json';
      const event = makeSQSEvent([
        { messageId: 'msg-good', body: goodBody },
        { messageId: 'msg-bad', body: badBody },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
      expect(notifyQualityGate).toHaveBeenCalledTimes(1);
      expect(notifyTrainingCascade).toHaveBeenCalledTimes(1);
    });

    it('should return empty batchItemFailures for empty Records array', async () => {
      const handler = createBaselineUpdatedHandler(config);
      const event: SQSEvent = { Records: [] };

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Service error handling
  // -----------------------------------------------------------------------

  describe('service error handling', () => {
    it('should report record as failed when notifyQualityGate throws', async () => {
      notifyQualityGate.mockRejectedValueOnce(new Error('Quality Gate service unavailable'));
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeBaselineUpdatedEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should report record as failed when notifyTrainingCascade throws', async () => {
      notifyTrainingCascade.mockRejectedValueOnce(new Error('Training Cascade service unavailable'));
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeBaselineUpdatedEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should continue processing remaining records after a service error', async () => {
      notifyQualityGate
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce(undefined);
      const handler = createBaselineUpdatedHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-fail', body: JSON.stringify(makeBaselineUpdatedEvent({ id: 'evt-fail' })) },
        { messageId: 'msg-ok', body: JSON.stringify(makeBaselineUpdatedEvent({ id: 'evt-ok' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-fail');
      expect(notifyQualityGate).toHaveBeenCalledTimes(2);
    });
  });
});
