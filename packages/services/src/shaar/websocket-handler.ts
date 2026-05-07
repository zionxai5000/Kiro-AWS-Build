/**
 * Shaar API Layer — WebSocket Handler
 *
 * WebSocket connection handler for real-time updates: agent state changes,
 * cost updates, alert notifications, workflow progress.
 *
 * Supports authenticated connections, tenant-scoped broadcasting,
 * event subscription/unsubscription, and targeted messaging.
 *
 * Requirements: 9.1, 9.3
 */

import type { AuthMiddleware, MiddlewareResult } from '../auth/middleware.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebSocketEventType =
  | 'agent.state.changed'
  | 'cost.updated'
  | 'alert.triggered'
  | 'workflow.progress'
  | 'system.health';

export interface WebSocketMessage {
  type: WebSocketEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WebSocketConnection {
  connectionId: string;
  tenantId: string;
  userId: string;
  subscribedEvents: WebSocketEventType[];
  connectedAt: string;
  authenticated: boolean;
}

export interface WebSocketConnectResult {
  success: boolean;
  connection?: WebSocketConnection;
  error?: string;
}

// ---------------------------------------------------------------------------
// WebSocket Handler
// ---------------------------------------------------------------------------

export class ShaarWebSocketHandler {
  private connections = new Map<string, WebSocketConnection>();
  private authMiddleware?: AuthMiddleware;

  constructor(authMiddleware?: AuthMiddleware) {
    this.authMiddleware = authMiddleware;
  }

  /**
   * Handle a new WebSocket connection with optional authentication.
   *
   * When an AuthMiddleware is configured, the token is validated before
   * accepting the connection. Tenant and user info are extracted from
   * the validated token.
   */
  async authenticateAndConnect(
    connectionId: string,
    token?: string,
  ): Promise<WebSocketConnectResult> {
    if (!this.authMiddleware) {
      // No auth middleware — reject unauthenticated connections
      return { success: false, error: 'Authentication not configured' };
    }

    const authHeader = token ? `Bearer ${token}` : undefined;
    const authResult: MiddlewareResult = await this.authMiddleware.authenticate(authHeader);

    if (!authResult.authorized || !authResult.context) {
      return { success: false, error: authResult.error ?? 'Authentication failed' };
    }

    const connection = this.connect(
      connectionId,
      authResult.context.tenantId,
      authResult.context.user.userId,
    );
    connection.authenticated = true;

    return { success: true, connection };
  }

  /**
   * Handle a new WebSocket connection (direct, without token validation).
   * Used when authentication is handled externally or for backward compatibility.
   */
  connect(connectionId: string, tenantId: string, userId: string): WebSocketConnection {
    const connection: WebSocketConnection = {
      connectionId,
      tenantId,
      userId,
      subscribedEvents: ['agent.state.changed', 'cost.updated', 'alert.triggered', 'workflow.progress', 'system.health'],
      connectedAt: new Date().toISOString(),
      authenticated: false,
    };
    this.connections.set(connectionId, connection);
    return connection;
  }

  /**
   * Handle WebSocket disconnection.
   */
  disconnect(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * Subscribe a connection to specific event types.
   */
  subscribe(connectionId: string, events: WebSocketEventType[]): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      // Merge new events with existing subscriptions (deduplicated)
      const merged = new Set([...conn.subscribedEvents, ...events]);
      conn.subscribedEvents = Array.from(merged);
    }
  }

  /**
   * Unsubscribe a connection from specific event types.
   */
  unsubscribe(connectionId: string, events: WebSocketEventType[]): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.subscribedEvents = conn.subscribedEvents.filter(
        (e) => !events.includes(e),
      );
    }
  }

  /**
   * Broadcast a message to all connections subscribed to the event type.
   * When tenantId is provided, only connections for that tenant receive the message.
   * Returns the list of connection IDs that should receive the message.
   */
  broadcast(message: WebSocketMessage, tenantId?: string): string[] {
    const recipients: string[] = [];
    for (const [id, conn] of this.connections) {
      if (tenantId && conn.tenantId !== tenantId) continue;
      if (conn.subscribedEvents.includes(message.type)) {
        recipients.push(id);
      }
    }
    return recipients;
  }

  /**
   * Send a message to a specific connection.
   * Returns the formatted message payload.
   */
  formatMessage(message: WebSocketMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Get all active connections.
   */
  getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connections for a specific tenant.
   */
  getConnectionsByTenant(tenantId: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.tenantId === tenantId,
    );
  }

  /**
   * Get connection count.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get a specific connection by ID.
   */
  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Create a standard WebSocket message.
   */
  static createMessage(type: WebSocketEventType, data: Record<string, unknown>): WebSocketMessage {
    return {
      type,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
