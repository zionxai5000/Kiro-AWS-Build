/**
 * Shared test helpers for dashboard tests.
 */
import type { DashboardWebSocket, WebSocketEventType, WebSocketEventHandler, WebSocketMessage } from '../api.js';

/**
 * Mock DashboardWebSocket that tracks on/off calls and can simulate dispatching messages.
 */
export class MockDashboardWebSocket implements Pick<DashboardWebSocket, 'on' | 'off' | 'connect' | 'disconnect' | 'isConnected'> {
  private handlers = new Map<WebSocketEventType, Set<WebSocketEventHandler>>();
  private connected = false;

  on(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  off(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Simulate a WebSocket message dispatch. */
  simulateMessage(type: WebSocketEventType, data: Record<string, unknown>): void {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(message);
      }
    }
  }

  /** Check if a handler is registered for a given event type. */
  hasHandlers(eventType: WebSocketEventType): boolean {
    const handlers = this.handlers.get(eventType);
    return !!handlers && handlers.size > 0;
  }

  /** Get the count of handlers for a given event type. */
  handlerCount(eventType: WebSocketEventType): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

/** Flush microtask queue so async mount() calls resolve. */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
