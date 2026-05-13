/**
 * ZXMG Video Development Studio — Hook Integration
 *
 * Provides event-driven hook system for the video pipeline. Emits lifecycle
 * events to the Event Bus and sends WebSocket notifications for real-time
 * UI updates. Supports all video pipeline lifecycle events.
 *
 * Requirements: 44f.29, 44f.30, 44f.31, 44f.32
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoHookName =
  | 'video.idea.generated'
  | 'video.script.created'
  | 'video.scene.rendered'
  | 'video.assembled'
  | 'video.thumbnail.generated'
  | 'video.scheduled'
  | 'video.published'
  | 'video.performance.update'
  | 'video.pipeline.updated';

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface EventBus {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
}

export interface WebSocketNotifier {
  notify(channel: string, event: string, payload: Record<string, unknown>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface VideoHookService {
  emit(hookName: VideoHookName, payload: Record<string, unknown>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of VideoHookService.
 *
 * Emits hook events to both the Event Bus (for backend consumers) and
 * WebSocket (for real-time UI notifications). Each hook emission includes
 * the hook name, timestamp, and original payload.
 */
export class DefaultVideoHookService implements VideoHookService {
  constructor(
    private readonly eventBus: EventBus,
    private readonly wsNotifier: WebSocketNotifier,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Emits a video lifecycle hook event.
   * Publishes to Event Bus and sends WebSocket notification concurrently.
   */
  async emit(hookName: VideoHookName, payload: Record<string, unknown>): Promise<void> {
    const enrichedPayload: Record<string, unknown> = {
      ...payload,
      hookName,
      timestamp: Date.now(),
    };

    await Promise.all([
      this.eventBus.publish(`zxmg.hooks.${hookName}`, enrichedPayload),
      this.wsNotifier.notify('zxmg-studio', hookName, enrichedPayload),
    ]);
  }
}
