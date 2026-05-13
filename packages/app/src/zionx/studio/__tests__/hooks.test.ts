/**
 * Unit tests for ZionX App Development Studio — Hook Integration
 *
 * Validates: Requirements 42l.38, 42l.39, 42l.40, 19.1
 *
 * Tests lifecycle hook emissions to Event Bus, gate failure handling
 * with sub-agent identification and rework task creation, submission
 * readiness with Mishmar approval, and WebSocket integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultStudioHookService,
  type EventBusPublisher,
  type WebSocketNotifier,
  type ReworkTaskCreator,
  type ApprovalRequester,
  type StudioHookName,
  type StudioHookPayload,
} from '../hooks.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

interface PublishedEvent {
  source: string;
  type: string;
  detail: Record<string, unknown>;
}

interface WsNotification {
  sessionId: string;
  event: { type: string; payload: Record<string, unknown> };
}

interface ReworkCall {
  sessionId: string;
  agentId: string;
  failureDetails: Record<string, unknown>;
}

interface ApprovalCall {
  sessionId: string;
  action: string;
  details: Record<string, unknown>;
}

function createMockEventBus(): EventBusPublisher & { published: PublishedEvent[] } {
  const published: PublishedEvent[] = [];
  return {
    published,
    async publish(event: PublishedEvent): Promise<void> {
      published.push(event);
    },
  };
}

function createMockWebSocketNotifier(): WebSocketNotifier & { notifications: WsNotification[] } {
  const notifications: WsNotification[] = [];
  return {
    notifications,
    notify(sessionId: string, event: { type: string; payload: Record<string, unknown> }): void {
      notifications.push({ sessionId, event });
    },
  };
}

function createMockReworkCreator(): ReworkTaskCreator & { calls: ReworkCall[] } {
  const calls: ReworkCall[] = [];
  let counter = 0;
  return {
    calls,
    async createReworkTask(
      sessionId: string,
      agentId: string,
      failureDetails: Record<string, unknown>,
    ): Promise<string> {
      calls.push({ sessionId, agentId, failureDetails });
      counter += 1;
      return `rework-task-${counter}`;
    },
  };
}

function createMockApprovalRequester(): ApprovalRequester & { calls: ApprovalCall[] } {
  const calls: ApprovalCall[] = [];
  return {
    calls,
    async requestApproval(
      sessionId: string,
      action: string,
      details: Record<string, unknown>,
    ): Promise<void> {
      calls.push({ sessionId, action, details });
    },
  };
}

function createService() {
  const eventBus = createMockEventBus();
  const wsNotifier = createMockWebSocketNotifier();
  const reworkCreator = createMockReworkCreator();
  const approvalRequester = createMockApprovalRequester();

  const service = new DefaultStudioHookService(
    eventBus,
    wsNotifier,
    reworkCreator,
    approvalRequester,
  );

  return { service, eventBus, wsNotifier, reworkCreator, approvalRequester };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StudioHookService', () => {
  describe('emit', () => {
    it('publishes event to Event Bus with correct source', async () => {
      const { service, eventBus } = createService();

      await service.emit('app.idea.created', {
        sessionId: 'session-1',
        timestamp: 1000,
        idea: 'fitness app',
      });

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].source).toBe('zionx.studio');
    });

    it('publishes event with correct type matching hook name', async () => {
      const { service, eventBus } = createService();

      await service.emit('app.code.changed', {
        sessionId: 'session-1',
        timestamp: 2000,
        filePath: 'src/App.tsx',
      });

      expect(eventBus.published[0].type).toBe('app.code.changed');
    });

    it('includes full payload in event detail', async () => {
      const { service, eventBus } = createService();

      const payload: StudioHookPayload = {
        sessionId: 'session-1',
        timestamp: 3000,
        screenId: 'home',
        componentCount: 5,
      };

      await service.emit('app.preview.updated', payload);

      expect(eventBus.published[0].detail).toEqual(payload);
    });

    it('sends WebSocket notification with correct sessionId', async () => {
      const { service, wsNotifier } = createService();

      await service.emit('app.screenflow.changed', {
        sessionId: 'session-42',
        timestamp: 4000,
      });

      expect(wsNotifier.notifications).toHaveLength(1);
      expect(wsNotifier.notifications[0].sessionId).toBe('session-42');
    });

    it('sends WebSocket notification with hook type and payload', async () => {
      const { service, wsNotifier } = createService();

      const payload: StudioHookPayload = {
        sessionId: 'session-1',
        timestamp: 5000,
        buildId: 'build-123',
      };

      await service.emit('app.ios.build.created', payload);

      expect(wsNotifier.notifications[0].event.type).toBe('app.ios.build.created');
      expect(wsNotifier.notifications[0].event.payload).toEqual(payload);
    });

    it('emits app.idea.created with correct payload', async () => {
      const { service, eventBus } = createService();

      await service.emit('app.idea.created', {
        sessionId: 'session-1',
        timestamp: 1000,
        idea: 'social media app',
      });

      expect(eventBus.published[0].type).toBe('app.idea.created');
      expect(eventBus.published[0].detail.idea).toBe('social media app');
    });

    it('emits app.android.build.created with correct payload', async () => {
      const { service, eventBus } = createService();

      await service.emit('app.android.build.created', {
        sessionId: 'session-1',
        timestamp: 6000,
        buildId: 'android-build-1',
        versionCode: 42,
      });

      expect(eventBus.published[0].type).toBe('app.android.build.created');
      expect(eventBus.published[0].detail.buildId).toBe('android-build-1');
      expect(eventBus.published[0].detail.versionCode).toBe(42);
    });

    it('emits app.assets.requested with correct payload', async () => {
      const { service, eventBus } = createService();

      await service.emit('app.assets.requested', {
        sessionId: 'session-1',
        timestamp: 7000,
        assetTypes: ['screenshot', 'icon'],
      });

      expect(eventBus.published[0].type).toBe('app.assets.requested');
      expect(eventBus.published[0].detail.assetTypes).toEqual(['screenshot', 'icon']);
    });

    it('emits app.marketing.state.entered with correct payload', async () => {
      const { service, eventBus } = createService();

      await service.emit('app.marketing.state.entered', {
        sessionId: 'session-1',
        timestamp: 8000,
        state: 'aso-optimization',
      });

      expect(eventBus.published[0].type).toBe('app.marketing.state.entered');
      expect(eventBus.published[0].detail.state).toBe('aso-optimization');
    });

    it('handles multiple sequential emissions', async () => {
      const { service, eventBus, wsNotifier } = createService();

      await service.emit('app.idea.created', { sessionId: 's1', timestamp: 1 });
      await service.emit('app.code.changed', { sessionId: 's1', timestamp: 2 });
      await service.emit('app.preview.updated', { sessionId: 's1', timestamp: 3 });

      expect(eventBus.published).toHaveLength(3);
      expect(wsNotifier.notifications).toHaveLength(3);
    });
  });

  describe('handleGateFailure', () => {
    it('identifies correct sub-agent from explicit agentId', async () => {
      const { service, reworkCreator } = createService();

      await service.handleGateFailure(
        'session-1',
        'apple-metadata',
        'custom-agent',
        { reason: 'metadata incomplete' },
      );

      expect(reworkCreator.calls).toHaveLength(1);
      expect(reworkCreator.calls[0].agentId).toBe('custom-agent');
    });

    it('falls back to gate-to-agent mapping when agentId is empty', async () => {
      const { service, reworkCreator } = createService();

      await service.handleGateFailure(
        'session-1',
        'apple-screenshots',
        '',
        { reason: 'wrong dimensions' },
      );

      expect(reworkCreator.calls[0].agentId).toBe('store-asset-agent');
    });

    it('maps google-metadata gate to google-play-release-agent', async () => {
      const { service, reworkCreator } = createService();

      await service.handleGateFailure(
        'session-1',
        'google-metadata',
        '',
        { reason: 'description too short' },
      );

      expect(reworkCreator.calls[0].agentId).toBe('google-play-release-agent');
    });

    it('maps asset-validation gate to store-asset-agent', async () => {
      const { service, reworkCreator } = createService();

      await service.handleGateFailure(
        'session-1',
        'asset-validation',
        '',
        { reason: 'icon too small' },
      );

      expect(reworkCreator.calls[0].agentId).toBe('store-asset-agent');
    });

    it('uses unknown-agent for unmapped gates', async () => {
      const { service, reworkCreator } = createService();

      await service.handleGateFailure(
        'session-1',
        'some-unknown-gate',
        '',
        { reason: 'unknown failure' },
      );

      expect(reworkCreator.calls[0].agentId).toBe('unknown-agent');
    });

    it('creates rework task with correct sessionId and failure details', async () => {
      const { service, reworkCreator } = createService();

      const failureDetails = { reason: 'screenshots blurry', affectedAssets: ['asset-1'] };

      await service.handleGateFailure(
        'session-99',
        'apple-screenshots',
        'store-asset-agent',
        failureDetails,
      );

      expect(reworkCreator.calls[0].sessionId).toBe('session-99');
      expect(reworkCreator.calls[0].failureDetails).toEqual(failureDetails);
    });

    it('returns the rework task ID', async () => {
      const { service } = createService();

      const result = await service.handleGateFailure(
        'session-1',
        'apple-metadata',
        'apple-release-agent',
        { reason: 'missing keywords' },
      );

      expect(result.reworkTaskId).toBe('rework-task-1');
    });

    it('emits app.store.gate.failed hook with gate details', async () => {
      const { service, eventBus } = createService();

      await service.handleGateFailure(
        'session-1',
        'google-feature-graphic',
        '',
        { reason: 'wrong size' },
      );

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].type).toBe('app.store.gate.failed');
      expect(eventBus.published[0].detail.gateId).toBe('google-feature-graphic');
      expect(eventBus.published[0].detail.agentId).toBe('store-asset-agent');
      expect(eventBus.published[0].detail.reworkTaskId).toBe('rework-task-1');
    });

    it('includes failure details in the emitted hook', async () => {
      const { service, eventBus } = createService();

      const failureDetails = { reason: 'invalid format', expected: 'png', got: 'jpeg' };

      await service.handleGateFailure(
        'session-1',
        'asset-validation',
        'store-asset-agent',
        failureDetails,
      );

      expect(eventBus.published[0].detail.failureDetails).toEqual(failureDetails);
    });

    it('sends WebSocket notification for gate failure', async () => {
      const { service, wsNotifier } = createService();

      await service.handleGateFailure(
        'session-1',
        'apple-privacy',
        '',
        { reason: 'missing privacy labels' },
      );

      expect(wsNotifier.notifications).toHaveLength(1);
      expect(wsNotifier.notifications[0].sessionId).toBe('session-1');
      expect(wsNotifier.notifications[0].event.type).toBe('app.store.gate.failed');
    });
  });

  describe('handleSubmissionReady', () => {
    it('requests approval via Mishmar with correct sessionId', async () => {
      const { service, approvalRequester } = createService();

      await service.handleSubmissionReady('session-1');

      expect(approvalRequester.calls).toHaveLength(1);
      expect(approvalRequester.calls[0].sessionId).toBe('session-1');
    });

    it('requests approval with action app.submission', async () => {
      const { service, approvalRequester } = createService();

      await service.handleSubmissionReady('session-1');

      expect(approvalRequester.calls[0].action).toBe('app.submission');
    });

    it('includes sessionId and requestedAt in approval details', async () => {
      const { service, approvalRequester } = createService();

      const before = Date.now();
      await service.handleSubmissionReady('session-1');
      const after = Date.now();

      const details = approvalRequester.calls[0].details;
      expect(details.sessionId).toBe('session-1');
      expect(details.requestedAt).toBeGreaterThanOrEqual(before);
      expect(details.requestedAt).toBeLessThanOrEqual(after);
    });

    it('emits app.submission.ready hook', async () => {
      const { service, eventBus } = createService();

      await service.handleSubmissionReady('session-1');

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].type).toBe('app.submission.ready');
      expect(eventBus.published[0].detail.sessionId).toBe('session-1');
    });

    it('sends WebSocket notification for submission ready', async () => {
      const { service, wsNotifier } = createService();

      await service.handleSubmissionReady('session-1');

      expect(wsNotifier.notifications).toHaveLength(1);
      expect(wsNotifier.notifications[0].sessionId).toBe('session-1');
      expect(wsNotifier.notifications[0].event.type).toBe('app.submission.ready');
    });

    it('includes timestamp in the emitted hook payload', async () => {
      const { service, eventBus } = createService();

      const before = Date.now();
      await service.handleSubmissionReady('session-1');
      const after = Date.now();

      const detail = eventBus.published[0].detail;
      expect(detail.timestamp).toBeGreaterThanOrEqual(before);
      expect(detail.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('WebSocket integration', () => {
    it('notifies correct session for each hook emission', async () => {
      const { service, wsNotifier } = createService();

      await service.emit('app.idea.created', { sessionId: 'session-A', timestamp: 1 });
      await service.emit('app.code.changed', { sessionId: 'session-B', timestamp: 2 });

      expect(wsNotifier.notifications[0].sessionId).toBe('session-A');
      expect(wsNotifier.notifications[1].sessionId).toBe('session-B');
    });

    it('WebSocket payload matches Event Bus detail', async () => {
      const { service, eventBus, wsNotifier } = createService();

      const payload: StudioHookPayload = {
        sessionId: 'session-1',
        timestamp: 9000,
        screens: ['home', 'profile'],
      };

      await service.emit('app.screenflow.changed', payload);

      expect(wsNotifier.notifications[0].event.payload).toEqual(eventBus.published[0].detail);
    });

    it('gate failure notification includes rework task ID', async () => {
      const { service, wsNotifier } = createService();

      await service.handleGateFailure(
        'session-1',
        'apple-metadata',
        'apple-release-agent',
        { reason: 'test' },
      );

      const wsPayload = wsNotifier.notifications[0].event.payload;
      expect(wsPayload.reworkTaskId).toBe('rework-task-1');
    });

    it('submission ready notification is sent after approval request', async () => {
      const { service, wsNotifier, approvalRequester } = createService();

      await service.handleSubmissionReady('session-1');

      // Both approval and notification should have been called
      expect(approvalRequester.calls).toHaveLength(1);
      expect(wsNotifier.notifications).toHaveLength(1);
      expect(wsNotifier.notifications[0].event.type).toBe('app.submission.ready');
    });
  });
});
