import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PillarsView } from '../views/pillars.js';
import type { PillarData } from '../api.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    fetchPillars: vi.fn(),
  };
});

import { fetchPillars } from '../api.js';

const mockFetchPillars = vi.mocked(fetchPillars);

const samplePillars: PillarData[] = [
  { name: 'zionx', agentCount: 3, activeAgents: 2 },
  { name: 'zxmg', agentCount: 2, activeAgents: 2 },
  { name: 'zion-alpha', agentCount: 1, activeAgents: 0 },
  { name: 'otzar', agentCount: 1, activeAgents: 1 },
  { name: 'eretz', agentCount: 1, activeAgents: 1 },
];

describe('PillarsView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    mockFetchPillars.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockFetchPillars.mockReturnValue(new Promise(() => {}));
    const view = new PillarsView(container);
    view.mount();

    expect(container.querySelector('.view-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading pillars');
  });

  it('renders pillar cards with metrics', async () => {
    mockFetchPillars.mockResolvedValue(samplePillars);
    const view = new PillarsView(container);
    await view.mount();

    const cards = container.querySelectorAll('.pillar-card');
    expect(cards.length).toBe(5);

    expect(container.textContent).toContain('Total Agents');
    expect(container.textContent).toContain('Active Agents');
    expect(container.textContent).toContain('Active Rate');
  });

  it('renders empty state when no pillars', async () => {
    mockFetchPillars.mockResolvedValue([]);
    const view = new PillarsView(container);
    await view.mount();

    expect(container.querySelector('.view-empty')).not.toBeNull();
    expect(container.textContent).toContain('No pillars');
  });

  it('renders error state on fetch failure', async () => {
    mockFetchPillars.mockRejectedValue(new Error('Fetch failed'));
    const view = new PillarsView(container);
    await view.mount();

    expect(container.querySelector('.view-error')).not.toBeNull();
    expect(container.textContent).toContain('Fetch failed');
  });

  it('formats pillar names correctly', async () => {
    mockFetchPillars.mockResolvedValue(samplePillars);
    const view = new PillarsView(container);
    await view.mount();

    expect(container.textContent).toContain('ZionX — App Factory');
    expect(container.textContent).toContain('ZXMG — Media Production');
    expect(container.textContent).toContain('Zion Alpha — Trading');
    expect(container.textContent).toContain('Otzar — Finance');
    expect(container.textContent).toContain('Eretz — Business');
  });
});
