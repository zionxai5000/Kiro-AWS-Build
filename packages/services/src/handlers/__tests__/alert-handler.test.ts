/**
 * Unit tests for the Alert Lambda Event Handler (createAlertHandler).
 *
 * Validates: Requirements 6.1, 6.2, 19.1
 *
 * - 6.1: Deliver messages between system components with at-least-once delivery
 * - 6.2: Route undeliverable messages to dead-letter queue after retry exhaustion
 *         (partial batch failure reporting via batchItemFailures)
 * - 19.1: Test suite validates handler behavior before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAlertHandler } from '../alert-handler.js';
import type { AlertHandlerConfig, FormattedAlert } from '../alert-handler.js';
import type { SQSEvent } from '../audit-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeraphimEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-alert-001',
    source: 'seraphim.monitoring',
    type: 'alert.system.threshold',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    detail: {
      severity: 'high',
      title: 'CPU threshold exceeded',
      message: 'Agent agent-1 CPU usage at 95%',
      description: 'High CPU usage detected',
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

describe('createAlertHandler', () => {
  let deliverAlert: ReturnType<typeof vi.fn<(alert: FormattedAlert) => Promise<void>>>;
  let config: AlertHandlerConfig;

  beforeEach(() => {
    deliverAlert = vi.fn<(alert: FormattedAlert) => Promise<void>>().mockResolvedValue(undefined);
    config = { deliverAlert, processedEventIds: new Set<string>() };
  });

  // -----------------------------------------------------------------------
  // 1. Happy path — alert processing
  // -----------------------------------------------------------------------

  describe('alert event processing', () => {
    it('should process a valid alert event and call deliverAlert', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(deliverAlert).toHaveBeenCalledTimes(1);
    });

    it('should format the alert with correct fields', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent();
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.id).toBe('evt-alert-001');
      expect(alert.severity).toBe('high');
      expect(alert.title).toBe('CPU threshold exceeded');
      expect(alert.message).toBe('Agent agent-1 CPU usage at 95%');
      expect(alert.source).toBe('seraphim.monitoring');
      expect(alert.tenantId).toBe('tenant-1');
      expect(alert.timestamp).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Severity level formatting
  // -----------------------------------------------------------------------

  describe('severity levels', () => {
    it.each(['critical', 'high', 'medium', 'low', 'info'] as const)(
      'should correctly resolve severity "%s"',
      async (severity) => {
        const handler = createAlertHandler(config);
        const seraphimEvent = makeSeraphimEvent({
          id: `evt-${severity}`,
          detail: {
            severity,
            title: `${severity} alert`,
            message: `Alert with ${severity} severity`,
          },
        });
        const event = makeSQSEvent([
          { messageId: `msg-${severity}`, body: JSON.stringify(seraphimEvent) },
        ]);

        await handler(event);

        const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
        expect(alert.severity).toBe(severity);
      },
    );

    it('should default to "info" severity when severity is not specified', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          title: 'No severity alert',
          message: 'Alert without severity field',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.severity).toBe('info');
    });

    it('should default to "info" for unrecognized severity values', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          severity: 'unknown-severity',
          title: 'Bad severity',
          message: 'test',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.severity).toBe('info');
    });

    it('should resolve severity from alertSeverity field', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          alertSeverity: 'critical',
          title: 'Critical via alertSeverity',
          message: 'test',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.severity).toBe('critical');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Custom deliverAlert function
  // -----------------------------------------------------------------------

  describe('custom deliverAlert', () => {
    it('should use the provided deliverAlert function', async () => {
      const customDeliver = vi.fn<(alert: FormattedAlert) => Promise<void>>().mockResolvedValue(undefined);
      const handler = createAlertHandler({
        deliverAlert: customDeliver,
        processedEventIds: new Set(),
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      await handler(event);

      expect(customDeliver).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Default console logging (no deliverAlert provided)
  // -----------------------------------------------------------------------

  describe('default console logging', () => {
    it('should use default console logging when no deliverAlert is provided', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const handler = createAlertHandler({ processedEventIds: new Set() });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Alert title/message fallbacks
  // -----------------------------------------------------------------------

  describe('alert field fallbacks', () => {
    it('should use alertTitle when title is not present', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          severity: 'medium',
          alertTitle: 'Fallback title',
          message: 'test message',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.title).toBe('Fallback title');
    });

    it('should generate default title from severity and event type when no title fields exist', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        type: 'alert.custom.event',
        detail: {
          severity: 'critical',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.title).toContain('CRITICAL');
      expect(alert.title).toContain('alert.custom.event');
    });

    it('should use description as message fallback', async () => {
      const handler = createAlertHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          severity: 'low',
          title: 'Test',
          description: 'Fallback description as message',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const alert: FormattedAlert = deliverAlert.mock.calls[0][0];
      expect(alert.message).toBe('Fallback description as message');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Idempotency — duplicate events are safely ignored
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip duplicate events with the same id', async () => {
      const handler = createAlertHandler(config);
      const body = JSON.stringify(makeSeraphimEvent({ id: 'dup-alert-1' }));
      const event = makeSQSEvent([
        { messageId: 'msg-1', body },
        { messageId: 'msg-2', body },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(deliverAlert).toHaveBeenCalledTimes(1);
    });

    it('should skip events already in processedEventIds', async () => {
      config.processedEventIds!.add('pre-processed-alert');
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-1',
          body: JSON.stringify(makeSeraphimEvent({ id: 'pre-processed-alert' })),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(deliverAlert).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Partial batch failure — batchItemFailures reporting
  // -----------------------------------------------------------------------

  describe('partial batch failure', () => {
    it('should report only failed records in batchItemFailures', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-good', body: JSON.stringify(makeSeraphimEvent({ id: 'good-1' })) },
        { messageId: 'msg-bad', body: 'not-json' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
      expect(deliverAlert).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Invalid JSON body handling
  // -----------------------------------------------------------------------

  describe('invalid JSON body', () => {
    it('should report record as failed when body is not valid JSON', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-bad', body: '<<<invalid>>>' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Missing required fields
  // -----------------------------------------------------------------------

  describe('missing required fields', () => {
    it('should report record as failed when id is missing', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-id',
          body: JSON.stringify({ type: 'alert', detail: {} }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('should report record as failed when type is missing', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-type',
          body: JSON.stringify({ id: 'evt-1', detail: {} }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('should report record as failed when detail is missing', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-detail',
          body: JSON.stringify({ id: 'evt-1', type: 'alert' }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Service error handling
  // -----------------------------------------------------------------------

  describe('service error handling', () => {
    it('should report record as failed when deliverAlert throws', async () => {
      deliverAlert.mockRejectedValueOnce(new Error('Delivery channel unavailable'));
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should continue processing remaining records after a delivery error', async () => {
      deliverAlert
        .mockRejectedValueOnce(new Error('Channel error'))
        .mockResolvedValueOnce(undefined);
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-fail', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-fail' })) },
        { messageId: 'msg-ok', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-ok' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-fail');
      expect(deliverAlert).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 11. Batch processing
  // -----------------------------------------------------------------------

  describe('batch processing', () => {
    it('should process multiple valid records successfully', async () => {
      const handler = createAlertHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-1' })) },
        { messageId: 'msg-2', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-2' })) },
        { messageId: 'msg-3', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-3' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(deliverAlert).toHaveBeenCalledTimes(3);
    });

    it('should return empty batchItemFailures for empty Records array', async () => {
      const handler = createAlertHandler(config);
      const event: SQSEvent = { Records: [] };

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });
});
