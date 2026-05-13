/**
 * ZionX App Development Studio — Preview Server
 *
 * Manages preview build sessions for the in-browser app development experience.
 * Provides URL generation for preview iframes, hot-reload triggering via WebSocket,
 * and screenshot capture from the preview runtime.
 *
 * Requirements: 42b.4, 42b.5, 42b.6, 42j.31
 */

import type { DeviceProfile } from './device-profiles.js';

// ---------------------------------------------------------------------------
// WebSocket Message Types
// ---------------------------------------------------------------------------

export interface PreviewWebSocketMessage {
  type: 'preview.reload' | 'preview.error' | 'preview.ready';
  sessionId: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Preview Session State
// ---------------------------------------------------------------------------

export interface PreviewSession {
  sessionId: string;
  port: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  createdAt: Date;
  lastReloadAt?: Date;
}

// ---------------------------------------------------------------------------
// WebSocket Sender Interface (for dependency injection)
// ---------------------------------------------------------------------------

export interface WebSocketSender {
  send(sessionId: string, message: PreviewWebSocketMessage): void;
  isConnected(sessionId: string): boolean;
}

// ---------------------------------------------------------------------------
// Screenshot Renderer Interface (for dependency injection)
// ---------------------------------------------------------------------------

export interface ScreenshotRenderer {
  capture(
    previewUrl: string,
    width: number,
    height: number,
  ): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// Preview Server Configuration
// ---------------------------------------------------------------------------

export interface PreviewServerConfig {
  baseUrl: string;
  portRangeStart: number;
  portRangeEnd: number;
}

const DEFAULT_CONFIG: PreviewServerConfig = {
  baseUrl: 'http://localhost',
  portRangeStart: 19000,
  portRangeEnd: 19999,
};

// ---------------------------------------------------------------------------
// Preview Server Implementation
// ---------------------------------------------------------------------------

/**
 * Manages preview build sessions for the ZionX App Development Studio.
 *
 * Each session gets a unique port and URL. The server handles hot-reload
 * signaling via WebSocket and screenshot capture for store asset generation.
 */
export class PreviewServer {
  private readonly sessions: Map<string, PreviewSession> = new Map();
  private readonly config: PreviewServerConfig;
  private readonly wsSender: WebSocketSender;
  private readonly renderer: ScreenshotRenderer;
  private nextPort: number;

  constructor(
    wsSender: WebSocketSender,
    renderer: ScreenshotRenderer,
    config: Partial<PreviewServerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.wsSender = wsSender;
    this.renderer = renderer;
    this.nextPort = this.config.portRangeStart;
  }

  /**
   * Create a new preview session and allocate a port for it.
   */
  createSession(sessionId: string): PreviewSession {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const port = this.allocatePort();
    const session: PreviewSession = {
      sessionId,
      port,
      status: 'running',
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get the preview URL for a given session.
   * The URL points to the locally-served React Native Web build.
   */
  getPreviewUrl(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Auto-create session if it doesn't exist
      const newSession = this.createSession(sessionId);
      return `${this.config.baseUrl}:${newSession.port}`;
    }
    return `${this.config.baseUrl}:${session.port}`;
  }

  /**
   * Trigger a hot-reload for the given session by sending a WebSocket message.
   * The preview iframe listens for 'preview.reload' messages and refreshes.
   */
  triggerReload(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Preview session not found: ${sessionId}`);
    }

    const message: PreviewWebSocketMessage = {
      type: 'preview.reload',
      sessionId,
      timestamp: Date.now(),
    };

    this.wsSender.send(sessionId, message);
    session.lastReloadAt = new Date();
  }

  /**
   * Capture a screenshot of the preview at the device profile's native resolution.
   * Returns a Buffer containing the PNG image data.
   */
  async captureScreenshot(
    sessionId: string,
    deviceProfile: DeviceProfile,
  ): Promise<Buffer> {
    const previewUrl = this.getPreviewUrl(sessionId);

    const buffer = await this.renderer.capture(
      previewUrl,
      deviceProfile.screenshotWidth,
      deviceProfile.screenshotHeight,
    );

    return buffer;
  }

  /**
   * Get the current session state.
   */
  getSession(sessionId: string): PreviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Stop and remove a preview session.
   */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * List all active preview sessions.
   */
  listSessions(): PreviewSession[] {
    return [...this.sessions.values()];
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private allocatePort(): number {
    const port = this.nextPort;
    this.nextPort += 1;
    if (this.nextPort > this.config.portRangeEnd) {
      this.nextPort = this.config.portRangeStart;
    }
    return port;
  }
}
