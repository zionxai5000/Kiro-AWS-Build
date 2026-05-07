import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditView } from '../views/audit.js';
import type { AuditEntry } from '../api.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    fetchAudit: vi.fn(),
  };
});

import { fetchAudit } from '../api.js';

const mockFetchAudit = vi.mocked(fetchAudit);

const sampleEntries: AuditEntry[] = [
  {
    id: 'audit-1',
    timestamp: '2025-01-15T10:30:00Z',
    actingAgentId: 'agent-1',
    actingAgentName: 'ZionX Agent',
    actionType: 'app.submit',
    target: 'app-123',
    outcome: 'success',
    pillar: 'zionx',
    details: {},
  },
  {
    id: 'audit-2',
    timestamp: '2025-01-15T11:00:00Z',
    actingAgentId: 'agent-2',
    actingAgentName: 'ZXMG Agent',
    actionType: 'video.upload',
    target: 'video-456',
    outcome: 'failure',
    details: {},
  },
  {
    id: 'audit-3',
    timestamp: '2025-01-15T11:30:00Z',
    actingAgentId: 'agent-3',
    actingAgentName: 'Alpha Agent',
    actionType: 'trade.execute',
    target: 'trade-789',
    outcome: 'blocked',
    pillar: 'zion-alpha',
    details: {},
  },
];

describe('AuditView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    mockFetchAudit.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchAudit.mockReturnValue(new Promise(() => {}));
    const view = new AuditView(container);
    view.mount();

    expect(container.querySelector('.view-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading audit');
  });

  it('renders audit table with entries after fetch', async () => {
    mockFetchAudit.mockResolvedValue(sampleEntries);
    const view = new AuditView(container);
    await view.mount();

    expect(container.querySelector('.audit-table')).not.toBeNull();
    const rows = container.querySelectorAll('.audit-table tbody tr');
    expect(rows.length).toBe(3);

    expect(container.textContent).toContain('ZionX Agent');
    expect(container.textContent).toContain('app.submit');
  });

  it('renders empty state when no entries', async () => {
    mockFetchAudit.mockResolvedValue([]);
    const view = new AuditView(container);
    await view.mount();

    expect(container.querySelector('.view-empty')).not.toBeNull();
    expect(container.textContent).toContain('No audit entries');
  });

  it('renders error state on fetch failure', async () => {
    mockFetchAudit.mockRejectedValue(new Error('Server error'));
    const view = new AuditView(container);
    await view.mount();

    expect(container.querySelector('.view-error')).not.toBeNull();
    expect(container.textContent).toContain('Server error');
  });

  it('apply filters calls fetchAudit with correct params', async () => {
    mockFetchAudit.mockResolvedValue(sampleEntries);
    const view = new AuditView(container);
    await view.mount();

    // Reset to track the filter call
    mockFetchAudit.mockResolvedValue([]);

    // Fill in filter inputs
    const agentInput = container.querySelector<HTMLInputElement>('#filter-agent')!;
    const actionInput = container.querySelector<HTMLInputElement>('#filter-action')!;
    const pillarInput = container.querySelector<HTMLInputElement>('#filter-pillar')!;

    // Set values using property assignment (happy-dom supports this)
    agentInput.value = 'agent-1';
    actionInput.value = 'app.submit';
    pillarInput.value = 'zionx';

    // Click apply
    const applyBtn = container.querySelector<HTMLButtonElement>('#apply-filters')!;
    applyBtn.click();

    // Wait for async applyFilters
    await vi.waitFor(() => {
      expect(mockFetchAudit).toHaveBeenCalledTimes(2); // initial + filter
    });

    const lastCall = mockFetchAudit.mock.calls[1]![0];
    expect(lastCall).toEqual(
      expect.objectContaining({
        agentId: 'agent-1',
        actionType: 'app.submit',
        pillar: 'zionx',
      }),
    );
  });

  it('clear filters resets and refetches', async () => {
    mockFetchAudit.mockResolvedValue(sampleEntries);
    const view = new AuditView(container);
    await view.mount();

    mockFetchAudit.mockResolvedValue([]);

    const clearBtn = container.querySelector<HTMLButtonElement>('#clear-filters')!;
    clearBtn.click();

    await vi.waitFor(() => {
      expect(mockFetchAudit).toHaveBeenCalledTimes(2);
    });

    // Clear should call fetchAudit with empty filters
    const lastCall = mockFetchAudit.mock.calls[1]![0];
    expect(lastCall).toEqual({});
  });

  it('renders correct outcome CSS classes', async () => {
    mockFetchAudit.mockResolvedValue(sampleEntries);
    const view = new AuditView(container);
    await view.mount();

    expect(container.querySelector('.outcome-success')).not.toBeNull();
    expect(container.querySelector('.outcome-failure')).not.toBeNull();
    expect(container.querySelector('.outcome-blocked')).not.toBeNull();
  });
});
