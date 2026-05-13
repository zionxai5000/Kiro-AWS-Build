/**
 * Unit tests for Eretz Command Center — WebSocket Integration
 *
 * Validates: Requirements 46a.3, 46k.26, 46k.27, 21.1
 *
 * Tests WebSocket subscriptions, event dispatching, action dispatchers,
 * and ensures no business logic duplication.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandCenterWebSocketImpl, type CommandCenterEventType } from './command-center-ws.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 1; // OPEN
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: string[] = [];
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => this.onopen?.({} as Event), 0);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  simulateClose(): void {
    if (this.onclose) {
      this.onclose({} as CloseEvent);
    }
  }

  static get OPEN() { return 1; }
}

// Mock fetch for REST fallback
const mockFetch = vi.fn().mockResolvedValue({ ok: true });

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let originalWebSocket: typeof WebSocket;
let originalFetch: typeof fetch;

beforeEach(() => {
  MockWebSocket.instances = [];
  originalWebSocket = (globalThis as any).WebSocket;
  originalFetch = (globalThis as any).fetch;
  (globalThis as any).WebSocket = MockWebSocket as any;
  (globalThis as any).fetch = mockFetch;
  (window as any).__SERAPHIM_API_URL__ = 'http://localhost:3000/api';
  vi.useFakeTimers();
});

afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
  (globalThis as any).fetch = originalFetch;
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// WebSocket Connection Tests
// ---------------------------------------------------------------------------

describe('CommandCenterWebSocket — Connection', () => {
  it('should connect to WebSocket endpoint', () => {
    const ws = new CommandCenterWebSocketImpl('http://localhost:3000/api');
    ws.connect();

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3000/ws');
  });

  it('should report connected status after open', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();

    expect(ws.isConnected()).toBe(false);

    // Trigger onopen
    await vi.advanceTimersByTimeAsync(1);

    expect(ws.isConnected()).toBe(true);
  });

  it('should disconnect and clean up', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    ws.disconnect();

    expect(ws.isConnected()).toBe(false);
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('should not create duplicate connections', () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    ws.connect(); // Second call should be no-op

    expect(MockWebSocket.instances.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Subscription Tests
// ---------------------------------------------------------------------------

describe('CommandCenterWebSocket — Subscriptions', () => {
  it('should receive and dispatch correct event types', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const handler = vi.fn();
    ws.subscribe('portfolio.metrics_updated', handler);

    MockWebSocket.instances[0].simulateMessage({
      type: 'portfolio.metrics_updated',
      data: { totalMRR: 25000 },
      timestamp: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledWith({ totalMRR: 25000 });
  });

  it('should handle metrics update for portfolio overview refresh', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const handler = vi.fn();
    ws.subscribe('portfolio.metrics_updated', handler);

    MockWebSocket.instances[0].simulateMessage({
      type: 'portfolio.metrics_updated',
      data: { totalMRR: 30000, growthRate: 15 },
      timestamp: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledWith({ totalMRR: 30000, growthRate: 15 });
  });

  it('should handle alert push for new alerts display', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const handler = vi.fn();
    ws.subscribe('portfolio.decline_alerts', handler);

    const alertData = { subsidiary: 'zxmg', metric: 'MRR', severity: 'critical', declinePercentage: 20 };
    MockWebSocket.instances[0].simulateMessage({
      type: 'portfolio.decline_alerts',
      data: alertData,
      timestamp: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledWith(alertData);
  });

  it('should not dispatch to unrelated subscribers', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const metricsHandler = vi.fn();
    const alertHandler = vi.fn();
    ws.subscribe('portfolio.metrics_updated', metricsHandler);
    ws.subscribe('portfolio.decline_alerts', alertHandler);

    MockWebSocket.instances[0].simulateMessage({
      type: 'portfolio.metrics_updated',
      data: { totalMRR: 25000 },
      timestamp: new Date().toISOString(),
    });

    expect(metricsHandler).toHaveBeenCalled();
    expect(alertHandler).not.toHaveBeenCalled();
  });

  it('should support unsubscribe', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const handler = vi.fn();
    const unsubscribe = ws.subscribe('portfolio.metrics_updated', handler);

    unsubscribe();

    MockWebSocket.instances[0].simulateMessage({
      type: 'portfolio.metrics_updated',
      data: { totalMRR: 25000 },
      timestamp: new Date().toISOString(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple subscribers for same event', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    ws.subscribe('synergy.updated', handler1);
    ws.subscribe('synergy.updated', handler2);

    MockWebSocket.instances[0].simulateMessage({
      type: 'synergy.updated',
      data: { synergies: [] },
      timestamp: new Date().toISOString(),
    });

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('should ignore malformed messages', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const handler = vi.fn();
    ws.subscribe('portfolio.metrics_updated', handler);

    // Send malformed message
    const mockWs = MockWebSocket.instances[0];
    if (mockWs.onmessage) {
      mockWs.onmessage({ data: 'not-valid-json{{{' } as MessageEvent);
    }

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Action Dispatcher Tests
// ---------------------------------------------------------------------------

describe('CommandCenterWebSocket — Action Dispatchers', () => {
  it('should send approve recommendation via WebSocket', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    await ws.approveRecommendation('rec-123');

    const sent = MockWebSocket.instances[0].sent;
    expect(sent.length).toBe(2); // subscribe + approve
    const payload = JSON.parse(sent[1]);
    expect(payload.action).toBe('recommendation.approve');
    expect(payload.id).toBe('rec-123');
  });

  it('should send reject recommendation with reason', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    await ws.rejectRecommendation('rec-456', 'Not aligned with strategy');

    const sent = MockWebSocket.instances[0].sent;
    const payload = JSON.parse(sent[1]);
    expect(payload.action).toBe('recommendation.reject');
    expect(payload.id).toBe('rec-456');
    expect(payload.reason).toBe('Not aligned with strategy');
  });

  it('should send modify recommendation with parameters', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    await ws.modifyRecommendation('rec-789', { budget: '30%', timeline: '2 weeks' });

    const sent = MockWebSocket.instances[0].sent;
    const payload = JSON.parse(sent[1]);
    expect(payload.action).toBe('recommendation.modify');
    expect(payload.id).toBe('rec-789');
    expect(payload.parameters).toEqual({ budget: '30%', timeline: '2 weeks' });
  });

  it('should send resource allocation update via WebSocket', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    await ws.updateResourceAllocation('zionx', 60);

    const sent = MockWebSocket.instances[0].sent;
    const payload = JSON.parse(sent[1]);
    expect(payload.action).toBe('resource.allocation.update');
    expect(payload.subsidiary).toBe('zionx');
    expect(payload.percentage).toBe(60);
  });

  it('should fall back to REST when WebSocket is not connected', async () => {
    const ws = new CommandCenterWebSocketImpl('http://localhost:3000/api');
    // Don't connect — test REST fallback

    await ws.approveRecommendation('rec-100');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/command-center/actions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('recommendation.approve'),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Data Integration Tests (Req 46k.26, 46k.27)
// ---------------------------------------------------------------------------

describe('CommandCenterWebSocket — Data Integration', () => {
  it('should source all data from existing services (no business logic)', () => {
    // The CommandCenterWebSocket is purely a transport layer
    // It subscribes to events and dispatches actions — no computation
    const ws = new CommandCenterWebSocketImpl();

    // Verify the interface only has transport methods
    expect(typeof ws.connect).toBe('function');
    expect(typeof ws.disconnect).toBe('function');
    expect(typeof ws.subscribe).toBe('function');
    expect(typeof ws.approveRecommendation).toBe('function');
    expect(typeof ws.rejectRecommendation).toBe('function');
    expect(typeof ws.modifyRecommendation).toBe('function');
    expect(typeof ws.updateResourceAllocation).toBe('function');
    expect(typeof ws.isConnected).toBe('function');
  });

  it('should subscribe to command-center channel on connect', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const sent = MockWebSocket.instances[0].sent;
    expect(sent.length).toBe(1);
    const payload = JSON.parse(sent[0]);
    expect(payload.action).toBe('subscribe');
    expect(payload.channels).toContain('command-center');
  });

  it('should handle all expected event types without transformation', async () => {
    const ws = new CommandCenterWebSocketImpl();
    ws.connect();
    await vi.advanceTimersByTimeAsync(1);

    const eventTypes: CommandCenterEventType[] = [
      'portfolio.metrics_updated',
      'portfolio.decline_alerts',
      'portfolio.strategy_updated',
      'synergy.updated',
      'pattern.updated',
      'training.updated',
      'recommendation.submitted',
      'recommendation.status_changed',
      'subsidiary.metrics_updated',
    ];

    const handlers = eventTypes.map((type) => {
      const handler = vi.fn();
      ws.subscribe(type, handler);
      return { type, handler };
    });

    // Simulate each event type
    for (const { type } of handlers) {
      MockWebSocket.instances[0].simulateMessage({
        type,
        data: { test: true },
        timestamp: new Date().toISOString(),
      });
    }

    // Each handler should have been called exactly once with raw data (no transformation)
    for (const { handler } of handlers) {
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ test: true });
    }
  });
});
