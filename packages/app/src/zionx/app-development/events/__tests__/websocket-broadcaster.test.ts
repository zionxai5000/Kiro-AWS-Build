import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocketBroadcaster, type WebSocketBroadcastTarget } from '../websocket-broadcaster.js';
import { APPDEV_EVENTS, createAppDevEvent } from '../event-types.js';
import { InMemoryEventBusService } from '@seraphim/services/event-bus/in-memory-event-bus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWsHandler(): WebSocketBroadcastTarget & { calls: Array<{ message: any; tenantId?: string }> } {
  const result = {
    calls: [] as Array<{ message: any; tenantId?: string }>,
    broadcast(message: any, tenantId?: string) {
      result.calls.push({ message, tenantId });
      return ['conn-1'];
    },
  };
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocketBroadcaster', () => {
  let eventBus: InMemoryEventBusService;
  let wsHandler: ReturnType<typeof createMockWsHandler>;
  let broadcaster: WebSocketBroadcaster;

  beforeEach(async () => {
    eventBus = new InMemoryEventBusService();
    wsHandler = createMockWsHandler();
    broadcaster = new WebSocketBroadcaster(eventBus, wsHandler);
    await broadcaster.start();
  });

  describe('forwards display-worthy events', () => {
    it('forwards appdev.hook.started', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.HOOK_STARTED,
        { projectId: 'p1', hookId: 'code-generator', executionId: 'e1', dryRun: false },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(1);
      expect(wsHandler.calls[0]!.message.type).toBe('workflow.progress');
      expect(wsHandler.calls[0]!.message.data.domain).toBe('app-development');
      expect(wsHandler.calls[0]!.message.data.type).toBe(APPDEV_EVENTS.HOOK_STARTED);
    });

    it('forwards appdev.hook.completed', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.HOOK_COMPLETED,
        { projectId: 'p1', hookId: 'code-generator', executionId: 'e1', success: true, dryRun: false, durationMs: 100 },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(1);
      expect(wsHandler.calls[0]!.message.data.type).toBe(APPDEV_EVENTS.HOOK_COMPLETED);
    });

    it('forwards appdev.build.status.changed', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.BUILD_STATUS_CHANGED,
        { projectId: 'p1', buildId: 'b1', status: 'building', platform: 'ios' },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(1);
      expect(wsHandler.calls[0]!.message.data.type).toBe(APPDEV_EVENTS.BUILD_STATUS_CHANGED);
    });

    it('forwards appdev.project.created', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.PROJECT_CREATED,
        { projectId: 'p1', name: 'MyApp', platform: 'ios' },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(1);
      expect(wsHandler.calls[0]!.message.data.type).toBe(APPDEV_EVENTS.PROJECT_CREATED);
    });

    it('forwards appdev.project.updated', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.PROJECT_UPDATED,
        { projectId: 'p1', field: 'name', newValue: 'NewName' },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(1);
      expect(wsHandler.calls[0]!.message.data.type).toBe(APPDEV_EVENTS.PROJECT_UPDATED);
    });
  });

  describe('does NOT forward noisy events', () => {
    it('does NOT forward appdev.workspace.file.changed', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'p1', filePath: 'src/index.ts', changeType: 'add' },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(0);
    });
  });

  describe('message shape', () => {
    it('always includes domain: app-development', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.HOOK_STARTED,
        { projectId: 'p1', hookId: 'h1', executionId: 'e1', dryRun: false },
        'tenant-1',
      ));

      const msg = wsHandler.calls[0]!.message;
      expect(msg.data.domain).toBe('app-development');
      expect(msg.data.source).toBe('seraphim.app-development');
      expect(msg.timestamp).toBeDefined();
    });

    it('passes tenantId to broadcast for scoping', async () => {
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.PROJECT_CREATED,
        { projectId: 'p1', name: 'App', platform: 'both' },
        'tenant-xyz',
      ));

      expect(wsHandler.calls[0]!.tenantId).toBe('tenant-xyz');
    });
  });

  describe('error handling', () => {
    it('broadcast errors do NOT propagate', async () => {
      const errorHandler = createMockWsHandler();
      errorHandler.broadcast = () => { throw new Error('ws crashed'); };

      const errorBroadcaster = new WebSocketBroadcaster(eventBus, errorHandler);
      await errorBroadcaster.start();

      // Should not throw
      await expect(eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.HOOK_STARTED,
        { projectId: 'p1', hookId: 'h1', executionId: 'e1', dryRun: false },
        'tenant-1',
      ))).resolves.toBeDefined();
    });
  });

  describe('stop', () => {
    it('unsubscribes and stops forwarding', async () => {
      await broadcaster.stop();

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.HOOK_STARTED,
        { projectId: 'p1', hookId: 'h1', executionId: 'e1', dryRun: false },
        'tenant-1',
      ));

      expect(wsHandler.calls).toHaveLength(0);
    });
  });
});
