/**
 * Unit tests for ZionX App Development Studio — Preview Server
 *
 * Validates: Requirements 42b.4, 42b.5, 42b.6, 42j.31
 *
 * Tests preview URL generation, hot-reload WebSocket messaging,
 * screenshot capture with correct device dimensions, and session management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PreviewServer,
  type WebSocketSender,
  type ScreenshotRenderer,
  type PreviewWebSocketMessage,
} from '../preview-server.js';
import {
  IPHONE_15_PRO_MAX,
  IPHONE_SE,
  PIXEL_8,
  type DeviceProfile,
} from '../device-profiles.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockWsSender(): WebSocketSender & {
  sentMessages: Array<{ sessionId: string; message: PreviewWebSocketMessage }>;
} {
  const sentMessages: Array<{ sessionId: string; message: PreviewWebSocketMessage }> = [];
  return {
    sentMessages,
    send(sessionId: string, message: PreviewWebSocketMessage) {
      sentMessages.push({ sessionId, message });
    },
    isConnected(sessionId: string) {
      return true;
    },
  };
}

function createMockRenderer(
  bufferSize?: number,
): ScreenshotRenderer & { capturedCalls: Array<{ url: string; width: number; height: number }> } {
  const capturedCalls: Array<{ url: string; width: number; height: number }> = [];
  return {
    capturedCalls,
    async capture(url: string, width: number, height: number): Promise<Buffer> {
      capturedCalls.push({ url, width, height });
      // Return a buffer of the expected size (width * height * 4 bytes for RGBA)
      const size = bufferSize ?? width * height * 4;
      return Buffer.alloc(size);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreviewServer', () => {
  let wsSender: ReturnType<typeof createMockWsSender>;
  let renderer: ReturnType<typeof createMockRenderer>;
  let server: PreviewServer;

  beforeEach(() => {
    wsSender = createMockWsSender();
    renderer = createMockRenderer();
    server = new PreviewServer(wsSender, renderer, {
      baseUrl: 'http://localhost',
      portRangeStart: 19000,
      portRangeEnd: 19999,
    });
  });

  describe('getPreviewUrl', () => {
    it('returns a valid URL for a session', () => {
      server.createSession('session-1');
      const url = server.getPreviewUrl('session-1');

      expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    });

    it('returns URL with port in the configured range', () => {
      server.createSession('session-1');
      const url = server.getPreviewUrl('session-1');
      const port = parseInt(url.split(':').pop()!, 10);

      expect(port).toBeGreaterThanOrEqual(19000);
      expect(port).toBeLessThanOrEqual(19999);
    });

    it('returns consistent URL for the same session', () => {
      server.createSession('session-1');
      const url1 = server.getPreviewUrl('session-1');
      const url2 = server.getPreviewUrl('session-1');

      expect(url1).toBe(url2);
    });

    it('returns different URLs for different sessions', () => {
      server.createSession('session-1');
      server.createSession('session-2');
      const url1 = server.getPreviewUrl('session-1');
      const url2 = server.getPreviewUrl('session-2');

      expect(url1).not.toBe(url2);
    });

    it('auto-creates session if it does not exist', () => {
      const url = server.getPreviewUrl('new-session');

      expect(url).toMatch(/^http:\/\/localhost:\d+$/);
      expect(server.getSession('new-session')).toBeDefined();
    });

    it('allocates sequential ports', () => {
      server.createSession('session-1');
      server.createSession('session-2');
      server.createSession('session-3');

      const url1 = server.getPreviewUrl('session-1');
      const url2 = server.getPreviewUrl('session-2');
      const url3 = server.getPreviewUrl('session-3');

      const port1 = parseInt(url1.split(':').pop()!, 10);
      const port2 = parseInt(url2.split(':').pop()!, 10);
      const port3 = parseInt(url3.split(':').pop()!, 10);

      expect(port2).toBe(port1 + 1);
      expect(port3).toBe(port2 + 1);
    });
  });

  describe('triggerReload', () => {
    it('sends a WebSocket message with type preview.reload', () => {
      server.createSession('session-1');
      server.triggerReload('session-1');

      expect(wsSender.sentMessages).toHaveLength(1);
      expect(wsSender.sentMessages[0].message.type).toBe('preview.reload');
    });

    it('sends the message to the correct session', () => {
      server.createSession('session-1');
      server.createSession('session-2');
      server.triggerReload('session-2');

      expect(wsSender.sentMessages).toHaveLength(1);
      expect(wsSender.sentMessages[0].sessionId).toBe('session-2');
      expect(wsSender.sentMessages[0].message.sessionId).toBe('session-2');
    });

    it('includes a timestamp in the message', () => {
      server.createSession('session-1');
      const before = Date.now();
      server.triggerReload('session-1');
      const after = Date.now();

      const timestamp = wsSender.sentMessages[0].message.timestamp;
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('updates lastReloadAt on the session', () => {
      server.createSession('session-1');
      const sessionBefore = server.getSession('session-1');
      expect(sessionBefore!.lastReloadAt).toBeUndefined();

      server.triggerReload('session-1');

      const sessionAfter = server.getSession('session-1');
      expect(sessionAfter!.lastReloadAt).toBeInstanceOf(Date);
    });

    it('throws for non-existent session', () => {
      expect(() => server.triggerReload('non-existent')).toThrow(
        'Preview session not found: non-existent',
      );
    });

    it('can trigger multiple reloads for the same session', () => {
      server.createSession('session-1');
      server.triggerReload('session-1');
      server.triggerReload('session-1');
      server.triggerReload('session-1');

      expect(wsSender.sentMessages).toHaveLength(3);
      for (const msg of wsSender.sentMessages) {
        expect(msg.message.type).toBe('preview.reload');
        expect(msg.sessionId).toBe('session-1');
      }
    });
  });

  describe('captureScreenshot', () => {
    it('returns a buffer for iPhone 15 Pro Max dimensions', async () => {
      server.createSession('session-1');
      const buffer = await server.captureScreenshot('session-1', IPHONE_15_PRO_MAX);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('passes correct dimensions for iPhone 15 Pro Max', async () => {
      server.createSession('session-1');
      await server.captureScreenshot('session-1', IPHONE_15_PRO_MAX);

      expect(renderer.capturedCalls).toHaveLength(1);
      expect(renderer.capturedCalls[0].width).toBe(1290);
      expect(renderer.capturedCalls[0].height).toBe(2796);
    });

    it('passes correct dimensions for iPhone SE', async () => {
      server.createSession('session-1');
      await server.captureScreenshot('session-1', IPHONE_SE);

      expect(renderer.capturedCalls).toHaveLength(1);
      expect(renderer.capturedCalls[0].width).toBe(750);
      expect(renderer.capturedCalls[0].height).toBe(1334);
    });

    it('passes correct dimensions for Pixel 8', async () => {
      server.createSession('session-1');
      await server.captureScreenshot('session-1', PIXEL_8);

      expect(renderer.capturedCalls).toHaveLength(1);
      expect(renderer.capturedCalls[0].width).toBe(1080);
      expect(renderer.capturedCalls[0].height).toBe(2400);
    });

    it('passes the preview URL to the renderer', async () => {
      server.createSession('session-1');
      const expectedUrl = server.getPreviewUrl('session-1');
      await server.captureScreenshot('session-1', IPHONE_15_PRO_MAX);

      expect(renderer.capturedCalls[0].url).toBe(expectedUrl);
    });

    it('auto-creates session if it does not exist', async () => {
      const buffer = await server.captureScreenshot('new-session', IPHONE_SE);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(server.getSession('new-session')).toBeDefined();
    });
  });

  describe('session management', () => {
    it('createSession returns a session with running status', () => {
      const session = server.createSession('session-1');

      expect(session.sessionId).toBe('session-1');
      expect(session.status).toBe('running');
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('createSession returns existing session if already created', () => {
      const session1 = server.createSession('session-1');
      const session2 = server.createSession('session-1');

      expect(session1).toBe(session2);
      expect(session1.port).toBe(session2.port);
    });

    it('getSession returns undefined for non-existent session', () => {
      expect(server.getSession('non-existent')).toBeUndefined();
    });

    it('destroySession removes the session', () => {
      server.createSession('session-1');
      server.destroySession('session-1');

      expect(server.getSession('session-1')).toBeUndefined();
    });

    it('listSessions returns all active sessions', () => {
      server.createSession('session-1');
      server.createSession('session-2');
      server.createSession('session-3');

      const sessions = server.listSessions();
      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionId).sort()).toEqual([
        'session-1',
        'session-2',
        'session-3',
      ]);
    });

    it('listSessions returns empty array when no sessions exist', () => {
      expect(server.listSessions()).toEqual([]);
    });
  });
});
