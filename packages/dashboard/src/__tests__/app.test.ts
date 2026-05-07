import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../app.js';

// Mock all API functions and the DashboardWebSocket class
vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();

  class MockWebSocket {
    private handlers = new Map<string, Set<Function>>();
    private connected = false;

    on(eventType: string, handler: Function): void {
      if (!this.handlers.has(eventType)) {
        this.handlers.set(eventType, new Set());
      }
      this.handlers.get(eventType)!.add(handler);
    }

    off(eventType: string, handler: Function): void {
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
  }

  return {
    ...actual,
    DashboardWebSocket: MockWebSocket,
    fetchAgents: vi.fn().mockResolvedValue([]),
    fetchPillars: vi.fn().mockResolvedValue([]),
    fetchCosts: vi.fn().mockResolvedValue({
      totalSpend: 0,
      projectedDaily: 0,
      projectedMonthly: 0,
      perAgent: [],
      perPillar: [],
      modelUtilization: [],
    }),
    fetchAudit: vi.fn().mockResolvedValue([]),
    fetchHealth: vi.fn().mockResolvedValue({
      status: 'healthy',
      totalAgents: 0,
      healthyAgents: 0,
      timestamp: new Date().toISOString(),
    }),
  };
});

describe('App', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds layout with nav, alerts, and view containers', async () => {
    const app = new App(root);
    await app.init();

    expect(root.querySelector('#dashboard-nav')).not.toBeNull();
    expect(root.querySelector('#dashboard-alerts')).not.toBeNull();
    expect(root.querySelector('#dashboard-view')).not.toBeNull();
    expect(root.querySelector('.dashboard-app')).not.toBeNull();
  });

  it('defaults to agents view on init', async () => {
    const app = new App(root);
    await app.init();

    // The nav should show agents as active
    const activeLink = root.querySelector('.nav-link.active');
    expect(activeLink).not.toBeNull();
    expect(activeLink!.getAttribute('data-view')).toBe('agents');
  });

  it('navigateTo() unmounts current view and mounts new one', async () => {
    const app = new App(root);
    await app.init();

    // Initially on agents view
    const viewContainer = root.querySelector('#dashboard-view')!;
    const initialContent = viewContainer.innerHTML;

    // Navigate to audit
    await app.navigateTo('audit');

    // The active nav link should change
    const activeLink = root.querySelector('.nav-link.active');
    expect(activeLink!.getAttribute('data-view')).toBe('audit');

    // View content should have changed
    expect(viewContainer.textContent).toContain('Audit');
  });

  it('destroy() cleans up WebSocket and views', async () => {
    const app = new App(root);
    await app.init();

    // Should not throw
    app.destroy();
  });
});
