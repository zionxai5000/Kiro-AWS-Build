/**
 * Unit tests for ZXMG Video Development Studio — Hook Integration
 *
 * Validates: Requirements 44f.29, 44f.30, 44f.31, 44f.32
 *
 * Tests that each hook emits the correct payload to the Event Bus and
 * sends WebSocket notifications for real-time UI updates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultVideoHookService,
  type VideoHookService,
  type EventBus,
  type WebSocketNotifier,
  type VideoHookName,
} from '../hooks.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockWebSocketNotifier(): WebSocketNotifier {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultVideoHookService', () => {
  let hookService: VideoHookService;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let wsNotifier: ReturnType<typeof createMockWebSocketNotifier>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    wsNotifier = createMockWebSocketNotifier();
    hookService = new DefaultVideoHookService(eventBus, wsNotifier);
  });

  // -------------------------------------------------------------------------
  // Hook Emission — Event Bus
  // -------------------------------------------------------------------------

  describe('emit to Event Bus', () => {
    const hookNames: VideoHookName[] = [
      'video.idea.generated',
      'video.script.created',
      'video.scene.rendered',
      'video.assembled',
      'video.thumbnail.generated',
      'video.scheduled',
      'video.published',
      'video.performance.update',
      'video.pipeline.updated',
    ];

    it.each(hookNames)('emits %s hook to Event Bus with correct topic', async (hookName) => {
      const payload = { videoId: 'vid-1', channelId: 'ch-1' };

      await hookService.emit(hookName, payload);

      expect(eventBus.publish).toHaveBeenCalledWith(
        `zxmg.hooks.${hookName}`,
        expect.objectContaining({
          videoId: 'vid-1',
          channelId: 'ch-1',
          hookName,
        }),
      );
    });

    it('includes timestamp in Event Bus payload', async () => {
      const before = Date.now();
      await hookService.emit('video.idea.generated', { videoId: 'vid-1' });
      const after = Date.now();

      const call = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[1];
      expect(payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(payload.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // -------------------------------------------------------------------------
  // Hook Emission — WebSocket Notification
  // -------------------------------------------------------------------------

  describe('emit to WebSocket', () => {
    const hookNames: VideoHookName[] = [
      'video.idea.generated',
      'video.script.created',
      'video.scene.rendered',
      'video.assembled',
      'video.thumbnail.generated',
      'video.scheduled',
      'video.published',
      'video.performance.update',
      'video.pipeline.updated',
    ];

    it.each(hookNames)('sends %s WebSocket notification', async (hookName) => {
      const payload = { videoId: 'vid-2', status: 'complete' };

      await hookService.emit(hookName, payload);

      expect(wsNotifier.notify).toHaveBeenCalledWith(
        'zxmg-studio',
        hookName,
        expect.objectContaining({
          videoId: 'vid-2',
          status: 'complete',
          hookName,
        }),
      );
    });

    it('sends WebSocket notification with timestamp', async () => {
      const before = Date.now();
      await hookService.emit('video.published', { videoId: 'vid-3' });
      const after = Date.now();

      const call = (wsNotifier.notify as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = call[2];
      expect(payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(payload.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent Emission
  // -------------------------------------------------------------------------

  describe('concurrent emission', () => {
    it('emits to both Event Bus and WebSocket concurrently', async () => {
      await hookService.emit('video.assembled', { videoId: 'vid-4' });

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(wsNotifier.notify).toHaveBeenCalledTimes(1);
    });

    it('preserves original payload fields in enriched payload', async () => {
      const payload = { videoId: 'vid-5', duration: 120, format: 'mp4' };

      await hookService.emit('video.scene.rendered', payload);

      const busPayload = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(busPayload.videoId).toBe('vid-5');
      expect(busPayload.duration).toBe(120);
      expect(busPayload.format).toBe('mp4');
    });
  });
});
