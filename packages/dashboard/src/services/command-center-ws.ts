/**
 * Eretz Command Center — WebSocket Integration and Data Layer
 *
 * Provides WebSocket subscriptions for real-time updates and action dispatchers
 * for the Command Center. All data sourced from existing Eretz services:
 * - portfolio-dashboard.ts (metrics, alerts, strategy)
 * - synergy-engine.ts (synergies, revenue impact)
 * - pattern-library.ts (patterns, adoption)
 * - training-cascade.ts (quality trends, effectiveness)
 *
 * This is a presentation layer service — no business logic duplication.
 *
 * Requirements: 46a.3, 46k.26, 46k.27
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCenterEventType =
  | 'portfolio.metrics_updated'
  | 'portfolio.decline_alerts'
  | 'portfolio.strategy_updated'
  | 'synergy.updated'
  | 'pattern.updated'
  | 'training.updated'
  | 'recommendation.submitted'
  | 'recommendation.status_changed'
  | 'subsidiary.metrics_updated';

export interface CommandCenterMessage {
  type: CommandCenterEventType;
  data: unknown;
  timestamp: string;
}

export type EventHandler = (data: unknown) => void;

export interface CommandCenterWebSocket {
  connect(): void;
  disconnect(): void;
  subscribe(eventType: CommandCenterEventType, handler: EventHandler): () => void;
  approveRecommendation(id: string): Promise<void>;
  rejectRecommendation(id: string, reason?: string): Promise<void>;
  modifyRecommendation(id: string, parameters: Record<string, string>): Promise<void>;
  updateResourceAllocation(subsidiary: string, percentage: number): Promise<void>;
  isConnected(): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CommandCenterWebSocketImpl implements CommandCenterWebSocket {
  private ws: WebSocket | null = null;
  private subscribers: Map<CommandCenterEventType, Set<EventHandler>> = new Map();
  private apiUrl: string;
  private connected: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
  }

  connect(): void {
    if (this.ws) return;

    try {
      const wsBase = this.apiUrl.replace(/\/api$/, '').replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        // Subscribe to command center events
        this.sendMessage({ action: 'subscribe', channels: ['command-center'] });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string) as CommandCenterMessage;
          this.dispatchEvent(message.type, message.data);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        // Auto-reconnect after 5 seconds
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      };

      this.ws.onerror = () => {
        // Error handling — connection will close and trigger reconnect
      };
    } catch {
      // WebSocket not available
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  subscribe(eventType: CommandCenterEventType, handler: EventHandler): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType)?.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ---------------------------------------------------------------------------
  // Action Dispatchers
  // ---------------------------------------------------------------------------

  async approveRecommendation(id: string): Promise<void> {
    await this.sendAction('recommendation.approve', { id });
  }

  async rejectRecommendation(id: string, reason?: string): Promise<void> {
    await this.sendAction('recommendation.reject', { id, reason });
  }

  async modifyRecommendation(id: string, parameters: Record<string, string>): Promise<void> {
    await this.sendAction('recommendation.modify', { id, parameters });
  }

  async updateResourceAllocation(subsidiary: string, percentage: number): Promise<void> {
    await this.sendAction('resource.allocation.update', { subsidiary, percentage });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private dispatchEvent(type: CommandCenterEventType, data: unknown): void {
    const handlers = this.subscribers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch {
          // Don't let handler errors break the event loop
        }
      });
    }
  }

  private sendMessage(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private async sendAction(action: string, payload: unknown): Promise<void> {
    // Send via WebSocket if connected, otherwise fall back to REST
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendMessage({ action, ...payload as object });
    } else {
      // REST fallback
      await fetch(`${this.apiUrl}/command-center/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload as object }),
      });
    }
  }
}
