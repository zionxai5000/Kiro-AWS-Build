/**
 * WebSocket Broadcaster — forwards display-worthy app-dev events to dashboard clients.
 *
 * Subscribes to a selective subset of app-dev events and broadcasts them
 * via the shaar WebSocket handler as 'workflow.progress' events with
 * data.domain = 'app-development' as discriminator.
 *
 * BROADCAST (display-worthy):
 * - appdev.hook.started
 * - appdev.hook.completed
 * - appdev.build.status.changed
 * - appdev.project.created
 * - appdev.project.updated
 *
 * DO NOT BROADCAST (too noisy):
 * - appdev.workspace.file.changed
 */

import type { EventBusService, SeraphimEvent } from '@seraphim/core';
import { APPDEV_EVENTS } from './event-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface for the WebSocket handler (avoids importing the full shaar type) */
export interface WebSocketBroadcastTarget {
  broadcast(message: { type: string; data: Record<string, unknown>; timestamp: string }, tenantId?: string): string[];
}

// ---------------------------------------------------------------------------
// Display-worthy event types
// ---------------------------------------------------------------------------

const BROADCAST_EVENT_TYPES = [
  APPDEV_EVENTS.HOOK_STARTED,
  APPDEV_EVENTS.HOOK_COMPLETED,
  APPDEV_EVENTS.BUILD_STATUS_CHANGED,
  APPDEV_EVENTS.PROJECT_CREATED,
  APPDEV_EVENTS.PROJECT_UPDATED,
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class WebSocketBroadcaster {
  private readonly eventBus: EventBusService;
  private readonly wsHandler: WebSocketBroadcastTarget;
  private subscriptionIds: string[] = [];

  constructor(eventBus: EventBusService, wsHandler: WebSocketBroadcastTarget) {
    this.eventBus = eventBus;
    this.wsHandler = wsHandler;
  }

  /**
   * Start subscribing to display-worthy events and forwarding to WebSocket clients.
   */
  async start(): Promise<string[]> {
    for (const eventType of BROADCAST_EVENT_TYPES) {
      const subId = await this.eventBus.subscribe(
        { type: [eventType] },
        async (event: SeraphimEvent) => {
          this.forwardToWebSocket(event);
        },
      );
      this.subscriptionIds.push(subId);
    }
    return [...this.subscriptionIds];
  }

  /**
   * Stop broadcasting — unsubscribe from all events.
   */
  async stop(): Promise<void> {
    for (const subId of this.subscriptionIds) {
      await this.eventBus.unsubscribe(subId);
    }
    this.subscriptionIds = [];
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private forwardToWebSocket(event: SeraphimEvent): void {
    try {
      const tenantId = event.tenantId ?? (event as unknown as { metadata?: { tenantId?: string } }).metadata?.tenantId;
      this.wsHandler.broadcast(
        {
          type: 'workflow.progress',
          data: {
            domain: 'app-development',
            detail: event.detail,
            source: event.source,
            type: event.type,
            tenantId: tenantId,
          },
          timestamp: new Date().toISOString(),
        },
        tenantId,
      );
    } catch (error) {
      // Broadcast errors are non-fatal — log and continue
      console.error('[WebSocketBroadcaster] Broadcast error:', (error as Error).message);
    }
  }
}
