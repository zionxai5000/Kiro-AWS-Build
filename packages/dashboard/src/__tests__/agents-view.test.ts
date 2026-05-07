import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentsView } from '../views/agents.js';
import { MockDashboardWebSocket, flushPromises } from './helpers.js';
import type { AgentData } from '../api.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    fetchAgents: vi.fn(),
  };
});

import { fetchAgents } from '../api.js';

const mockFetchAgents = vi.mocked(fetchAgents);

const sampleAgents: AgentData[] = [
  {
    id: 'agent-1',
    programId: 'zionx-main',
    version: '1.0.0',
    state: 'ready',
    pillar: 'zionx',
    resourceUsage: { cpuPercent: 25.5, memoryMB: 512, tokensUsed: 10000 },
    lastHeartbeat: new Date().toISOString(),
    name: 'ZionX Agent',
  },
  {
    id: 'agent-2',
    programId: 'zxmg-main',
    version: '2.1.0',
    state: 'executing',
    pillar: 'zxmg',
    resourceUsage: { cpuPercent: 80.0, memoryMB: 1024, tokensUsed: 50000 },
    lastHeartbeat: new Date().toISOString(),
    name: 'ZXMG Agent',
  },
];

describe('AgentsView', () => {
  let container: HTMLElement;
  let mockWs: MockDashboardWebSocket;

  beforeEach(() => {
    container = document.createElement('div');
    mockWs = new MockDashboardWebSocket();
    mockFetchAgents.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchAgents.mockReturnValue(new Promise(() => {})); // never resolves
    const view = new AgentsView(container, mockWs as any);
    view.mount(); // don't await

    expect(container.querySelector('.view-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading agents');
  });

  it('renders agent cards with correct data after fetch', async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const view = new AgentsView(container, mockWs as any);
    await view.mount();

    const cards = container.querySelectorAll('.agent-card');
    expect(cards.length).toBe(2);

    expect(container.textContent).toContain('ZionX Agent');
    expect(container.textContent).toContain('ZXMG Agent');
    expect(container.textContent).toContain('zionx');
    expect(container.textContent).toContain('25.5%');
  });

  it('renders empty state when no agents', async () => {
    mockFetchAgents.mockResolvedValue([]);
    const view = new AgentsView(container, mockWs as any);
    await view.mount();

    expect(container.querySelector('.view-empty')).not.toBeNull();
    expect(container.textContent).toContain('No agents');
  });

  it('renders error state on fetch failure', async () => {
    mockFetchAgents.mockRejectedValue(new Error('Network error'));
    const view = new AgentsView(container, mockWs as any);
    await view.mount();

    expect(container.querySelector('.view-error')).not.toBeNull();
    expect(container.textContent).toContain('Network error');
  });

  it('updates agent card when WebSocket agent.state.changed message received', async () => {
    mockFetchAgents.mockResolvedValue([...sampleAgents]);
    const view = new AgentsView(container, mockWs as any);
    await view.mount();

    // Verify initial state
    expect(container.textContent).toContain('ready');

    // Simulate state change
    mockWs.simulateMessage('agent.state.changed', {
      agentId: 'agent-1',
      state: 'executing',
    });

    // The card for agent-1 should now show 'executing'
    const card = container.querySelector('[data-agent-id="agent-1"]')!;
    expect(card.textContent).toContain('executing');
  });

  it('adds new agent card when WebSocket message has unknown agentId', async () => {
    mockFetchAgents.mockResolvedValue([sampleAgents[0]!]);
    const view = new AgentsView(container, mockWs as any);
    await view.mount();

    expect(container.querySelectorAll('.agent-card').length).toBe(1);

    mockWs.simulateMessage('agent.state.changed', {
      agentId: 'agent-new',
      programId: 'new-program',
      version: '1.0.0',
      state: 'initializing',
      pillar: 'eretz',
      resourceUsage: { cpuPercent: 0, memoryMB: 128, tokensUsed: 0 },
      lastHeartbeat: new Date().toISOString(),
    });

    expect(container.querySelectorAll('.agent-card').length).toBe(2);
  });

  it('cleans up WebSocket subscription on unmount', async () => {
    mockFetchAgents.mockResolvedValue(sampleAgents);
    const view = new AgentsView(container, mockWs as any);
    await view.mount();

    expect(mockWs.hasHandlers('agent.state.changed')).toBe(true);

    view.unmount();

    expect(mockWs.handlerCount('agent.state.changed')).toBe(0);
  });
});
