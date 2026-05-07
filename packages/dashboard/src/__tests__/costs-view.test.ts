import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CostsView } from '../views/costs.js';
import { MockDashboardWebSocket } from './helpers.js';
import type { CostReport } from '../api.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    fetchCosts: vi.fn(),
  };
});

import { fetchCosts } from '../api.js';

const mockFetchCosts = vi.mocked(fetchCosts);

const sampleCosts: CostReport = {
  totalSpend: 1234.56,
  projectedDaily: 45.67,
  projectedMonthly: 1370.10,
  perAgent: [
    { agentId: 'agent-1', spend: 500.0 },
    { agentId: 'agent-2', spend: 734.56 },
  ],
  perPillar: [
    { pillar: 'zionx', spend: 800.0 },
    { pillar: 'zxmg', spend: 434.56 },
  ],
  modelUtilization: [
    { model: 'claude-sonnet', tokens: 100000, cost: 300.0 },
    { model: 'gpt-4o-mini', tokens: 500000, cost: 50.0 },
  ],
};

describe('CostsView', () => {
  let container: HTMLElement;
  let mockWs: MockDashboardWebSocket;

  beforeEach(() => {
    container = document.createElement('div');
    mockWs = new MockDashboardWebSocket();
    mockFetchCosts.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchCosts.mockReturnValue(new Promise(() => {}));
    const view = new CostsView(container, mockWs as any);
    view.mount();

    expect(container.querySelector('.view-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading costs');
  });

  it('renders cost summary cards (total spend, projected daily, projected monthly)', async () => {
    mockFetchCosts.mockResolvedValue(sampleCosts);
    const view = new CostsView(container, mockWs as any);
    await view.mount();

    const summaryCards = container.querySelectorAll('.cost-summary-card');
    expect(summaryCards.length).toBe(3);

    expect(container.textContent).toContain('1234.56');
    expect(container.textContent).toContain('45.67');
    expect(container.textContent).toContain('1370.10');
    expect(container.textContent).toContain('Total Spend');
    expect(container.textContent).toContain('Projected Daily');
    expect(container.textContent).toContain('Projected Monthly');
  });

  it('renders per-agent spend table', async () => {
    mockFetchCosts.mockResolvedValue(sampleCosts);
    const view = new CostsView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('Per-Agent Spend');
    expect(container.textContent).toContain('agent-1');
    expect(container.textContent).toContain('500.00');
    expect(container.textContent).toContain('agent-2');
    expect(container.textContent).toContain('734.56');
  });

  it('renders per-pillar spend table', async () => {
    mockFetchCosts.mockResolvedValue(sampleCosts);
    const view = new CostsView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('Per-Pillar Spend');
    expect(container.textContent).toContain('zionx');
    expect(container.textContent).toContain('800.00');
    expect(container.textContent).toContain('zxmg');
    expect(container.textContent).toContain('434.56');
  });

  it('renders model utilization table', async () => {
    mockFetchCosts.mockResolvedValue(sampleCosts);
    const view = new CostsView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('Model Utilization');
    expect(container.textContent).toContain('claude-sonnet');
    expect(container.textContent).toContain('100,000');
    expect(container.textContent).toContain('300.00');
    expect(container.textContent).toContain('gpt-4o-mini');
  });

  it('updates display when WebSocket cost.updated message received', async () => {
    mockFetchCosts.mockResolvedValue(sampleCosts);
    const view = new CostsView(container, mockWs as any);
    await view.mount();

    expect(container.textContent).toContain('1234.56');

    const updatedCosts: CostReport = {
      ...sampleCosts,
      totalSpend: 9999.99,
      projectedDaily: 100.0,
      projectedMonthly: 3000.0,
    };

    mockWs.simulateMessage('cost.updated', { costs: updatedCosts });

    expect(container.textContent).toContain('9999.99');
    expect(container.textContent).toContain('100.00');
  });

  it('cleans up WebSocket subscription on unmount', async () => {
    mockFetchCosts.mockResolvedValue(sampleCosts);
    const view = new CostsView(container, mockWs as any);
    await view.mount();

    expect(mockWs.hasHandlers('cost.updated')).toBe(true);

    view.unmount();

    expect(mockWs.handlerCount('cost.updated')).toBe(0);
  });
});
