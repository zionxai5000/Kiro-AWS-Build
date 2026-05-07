import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthView } from '../views/health.js';
import { MockDashboardWebSocket } from './helpers.js';
import type { HealthData } from '../api.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    fetchHealth: vi.fn(),
  };
});

import { fetchHealth } from '../api.js';

const mockFetchHealth = vi.mocked(fetchHealth);

const sampleHealth: HealthData = {
  status: 'healthy',
  totalAgents: 5,
  healthyAgents: 4,
  timestamp: '2025-01-15T12:00:00Z',
  services: [
    { name: 'Zikaron', status: 'healthy' },
    { name: 'Mishmar', status: 'healthy' },
    { name: 'Otzar', status: 'degraded' },
  ],
  drivers: [
    { name: 'App Store Connect', status: 'ready' },
    { name: 'YouTube API', status: 'error' },
  ],
  agents: [
    { id: 'agent-1', name: 'ZionX Agent', state: 'ready' },
    { id: 'agent-2', name: 'ZXMG Agent', state: 'executing' },
    { id: 'agent-3', name: 'Alpha Agent', state: 'degraded' },
  ],
};

describe('HealthView', () => {
  let container: HTMLElement;
  let mockWs: MockDashboardWebSocket;

  beforeEach(() => {
    container = document.createElement('div');
    mockWs = new MockDashboardWebSocket();
    mockFetchHealth.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchHealth.mockReturnValue(new Promise(() => {}));
    const view = new HealthView(container, mockWs as any);
    view.mount();

    expect(container.querySelector('.view-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading system health');
  });

  it('renders health overview with status, agent counts', async () => {
    mockFetchHealth.mockResolvedValue(sampleHealth);
    const view = new HealthView(container, mockWs as any);
    await view.mount();

    expect(container.querySelector('.health-overview')).not.toBeNull();
    expect(container.textContent).toContain('HEALTHY');
    expect(container.textContent).toContain('5'); // total agents
    expect(container.textContent).toContain('4'); // healthy agents
    expect(container.textContent).toContain('1'); // unhealthy agents
  });

  it('renders services list', async () => {
    mockFetchHealth.mockResolvedValue(sampleHealth);
    const view = new HealthView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('Core Services');
    expect(container.textContent).toContain('Zikaron');
    expect(container.textContent).toContain('Mishmar');
    expect(container.textContent).toContain('Otzar');
  });

  it('renders drivers list', async () => {
    mockFetchHealth.mockResolvedValue(sampleHealth);
    const view = new HealthView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('Drivers');
    expect(container.textContent).toContain('App Store Connect');
    expect(container.textContent).toContain('YouTube API');
  });

  it('renders agents list', async () => {
    mockFetchHealth.mockResolvedValue(sampleHealth);
    const view = new HealthView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('Active Agents');
    expect(container.textContent).toContain('ZionX Agent');
    expect(container.textContent).toContain('ZXMG Agent');
    expect(container.textContent).toContain('Alpha Agent');
  });

  it('updates display when WebSocket system.health message received', async () => {
    mockFetchHealth.mockResolvedValue(sampleHealth);
    const view = new HealthView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('HEALTHY');

    mockWs.simulateMessage('system.health', {
      status: 'degraded',
      totalAgents: 5,
      healthyAgents: 2,
      timestamp: '2025-01-15T13:00:00Z',
    });

    expect(container.textContent).toContain('DEGRADED');
    expect(container.textContent).toContain('2'); // healthy agents updated
  });

  it('cleans up WebSocket subscription on unmount', async () => {
    mockFetchHealth.mockResolvedValue(sampleHealth);
    const view = new HealthView(container, mockWs as any);
    await view.mount();

    expect(mockWs.hasHandlers('system.health')).toBe(true);

    view.unmount();

    expect(mockWs.handlerCount('system.health')).toBe(0);
  });
});
