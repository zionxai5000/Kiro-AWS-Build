/**
 * Unit tests for ZionX Studio — Ideation Pipeline View
 *
 * Validates: Requirements 45e.16, 45e.17, 45e.18, 45e.19, 21.1
 *
 * Tests pipeline view rendering, Generate button, filters, detail view,
 * dismiss/bookmark actions, and WebSocket real-time updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IdeationPipelineView,
  type AppIdea,
  type IdeationPipelineViewOptions,
} from './IdeationPipelineView.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestIdea(overrides?: Partial<AppIdea>): AppIdea {
  return {
    id: 'test-1',
    name: 'Test App Idea',
    valueProposition: 'A great test app',
    targetAudience: 'Developers',
    monetizationModel: 'Freemium $4.99/mo',
    category: 'Productivity',
    predictedDownloads: 80000,
    predictedRevenue: 12000,
    competitionLevel: 'medium',
    nicheScore: 75,
    technicalFeasibility: 88,
    source: 'autonomous',
    status: 'pipeline',
    createdAt: new Date().toISOString(),
    lastActionAt: new Date().toISOString(),
    metadata: { researchCycleId: 'rc-test' },
    ...overrides,
  };
}

function mountView(options: IdeationPipelineViewOptions = {}): {
  container: HTMLElement;
  view: IdeationPipelineView;
} {
  const container = createContainer();
  const view = new IdeationPipelineView(container, options);
  view.mount();
  return { container, view };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let originalWebSocket: typeof WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  originalWebSocket = (globalThis as any).WebSocket;
  (globalThis as any).WebSocket = MockWebSocket as any;
  (window as any).__SERAPHIM_API_URL__ = 'http://localhost:3000/api';
});

afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Pipeline View Renders Ranked Ideas with Correct Metrics
// ---------------------------------------------------------------------------

describe('IdeationPipelineView — Rendering', () => {
  it('should render pipeline view with title and idea count', () => {
    const { container } = mountView();

    expect(container.querySelector('.pipeline-view__title')?.textContent).toContain('App Ideation Pipeline');
    expect(container.querySelector('.pipeline-view__count')).toBeTruthy();
  });

  it('should render idea cards with app name, downloads, revenue, competition, and niche score', () => {
    const { container } = mountView();

    const cards = container.querySelectorAll('.pipeline-view__card');
    expect(cards.length).toBeGreaterThan(0);

    const firstCard = cards[0];
    expect(firstCard.querySelector('.pipeline-view__card-name')?.textContent).toBeTruthy();

    const metrics = firstCard.querySelectorAll('.pipeline-view__metric');
    expect(metrics.length).toBe(4); // downloads, revenue, competition, niche score
  });

  it('should display ideas sorted by composite score (highest first)', () => {
    const { container } = mountView();

    const cardNames = Array.from(container.querySelectorAll('.pipeline-view__card-name'))
      .map((el) => el.textContent);

    // PetPal and SkillStack both score 100 (max on all factors), so they should be first two
    // BudgetBuddy (high competition, low revenue) should rank last among pipeline ideas
    const lastPipelineIdea = cardNames[cardNames.length - 1];
    expect(lastPipelineIdea).toContain('BudgetBuddy');
  });

  it('should show status label on each card', () => {
    const { container } = mountView();

    const statuses = container.querySelectorAll('.pipeline-view__card-status');
    expect(statuses.length).toBeGreaterThan(0);
    // At least one should show "In Pipeline"
    const statusTexts = Array.from(statuses).map((el) => el.textContent);
    expect(statusTexts.some((t) => t === 'In Pipeline')).toBe(true);
  });

  it('should show "Generate" button for ideas in pipeline status', () => {
    const { container } = mountView();

    const generateBtns = container.querySelectorAll('[data-generate-id]');
    expect(generateBtns.length).toBeGreaterThan(0);
  });

  it('should not show "Generate" button for ideas in generating status', () => {
    const { container } = mountView();

    // MealPrep AI has status 'generating' — should not have generate button
    const mealPrepCard = container.querySelector('[data-idea-id="4"]');
    expect(mealPrepCard).toBeTruthy();
    const generateBtn = mealPrepCard?.querySelector('[data-generate-id]');
    expect(generateBtn).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generate Button Triggers App Generation Flow
// ---------------------------------------------------------------------------

describe('IdeationPipelineView — Generate Action', () => {
  it('should call onGenerate callback when Generate button is clicked', () => {
    const onGenerate = vi.fn();
    const { container } = mountView({ onGenerate });

    const generateBtn = container.querySelector('[data-generate-id]') as HTMLElement;
    expect(generateBtn).toBeTruthy();

    generateBtn.click();

    expect(onGenerate).toHaveBeenCalledWith(expect.any(String));
  });

  it('should update idea status to generating after Generate click', () => {
    const { container } = mountView();

    const generateBtn = container.querySelector('[data-generate-id="5"]') as HTMLElement;
    if (generateBtn) {
      generateBtn.click();

      // After clicking, the card should show "Generating..." status
      const statusEls = container.querySelectorAll('.pipeline-view__card-status');
      const statusTexts = Array.from(statusEls).map((el) => el.textContent);
      expect(statusTexts.some((t) => t === 'Generating...')).toBe(true);
    }
  });

  it('should remove Generate button from card after generation starts', () => {
    const { container } = mountView();

    // Find a generate button and click it
    const firstGenerateBtn = container.querySelector('[data-generate-id]') as HTMLElement;
    const ideaId = firstGenerateBtn?.getAttribute('data-generate-id');
    firstGenerateBtn?.click();

    // After re-render, that idea should no longer have a generate button
    const remainingBtn = container.querySelector(`[data-generate-id="${ideaId}"]`);
    expect(remainingBtn).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filters Correctly Narrow Displayed Ideas
// ---------------------------------------------------------------------------

describe('IdeationPipelineView — Filters', () => {
  it('should render category filter tabs', () => {
    const { container } = mountView();

    const tabs = container.querySelectorAll('[data-filter-category]');
    expect(tabs.length).toBeGreaterThan(0);

    const tabTexts = Array.from(tabs).map((t) => t.textContent);
    expect(tabTexts).toContain('All');
    expect(tabTexts).toContain('Productivity');
    expect(tabTexts).toContain('Finance');
  });

  it('should filter ideas by category when tab is clicked', () => {
    const { container } = mountView();

    const productivityTab = container.querySelector('[data-filter-category="Productivity"]') as HTMLElement;
    productivityTab.click();

    const cards = container.querySelectorAll('.pipeline-view__card');
    const names = Array.from(cards).map((c) => c.querySelector('.pipeline-view__card-name')?.textContent);
    // Only Productivity ideas should remain (ZenFocus)
    expect(names.every((n) => n?.includes('ZenFocus'))).toBe(true);
  });

  it('should show all ideas when "All" category is selected', () => {
    const { container } = mountView();

    // First filter to Productivity
    const productivityTab = container.querySelector('[data-filter-category="Productivity"]') as HTMLElement;
    productivityTab.click();

    // Then back to All
    const allTab = container.querySelector('[data-filter-category="All"]') as HTMLElement;
    allTab.click();

    const cards = container.querySelectorAll('.pipeline-view__card');
    expect(cards.length).toBeGreaterThan(1);
  });

  it('should filter by revenue potential', () => {
    const { container } = mountView();

    const revenueSelect = container.querySelector('#filter-revenue') as HTMLSelectElement;
    expect(revenueSelect).toBeTruthy();

    // Set minimum revenue to $25K
    revenueSelect.value = '25000';
    revenueSelect.dispatchEvent(new Event('change'));

    const cards = container.querySelectorAll('.pipeline-view__card');
    // Only ideas with revenue >= 25000 should show (PetPal $28K, SkillStack $35K)
    expect(cards.length).toBe(2);
  });

  it('should filter by competition level', () => {
    const { container } = mountView();

    const competitionSelect = container.querySelector('#filter-competition') as HTMLSelectElement;
    expect(competitionSelect).toBeTruthy();

    // Set max competition to "low"
    competitionSelect.value = 'low';
    competitionSelect.dispatchEvent(new Event('change'));

    const cards = container.querySelectorAll('.pipeline-view__card');
    // Only low competition ideas should show (PetPal, SkillStack)
    expect(cards.length).toBe(2);
  });

  it('should filter by technical feasibility', () => {
    const { container } = mountView();

    const feasibilitySelect = container.querySelector('#filter-feasibility') as HTMLSelectElement;
    expect(feasibilitySelect).toBeTruthy();

    // Set minimum feasibility to 90%
    feasibilitySelect.value = '90';
    feasibilitySelect.dispatchEvent(new Event('change'));

    const cards = container.querySelectorAll('.pipeline-view__card');
    // Only ideas with feasibility >= 90 (ZenFocus 92, SkillStack 90)
    expect(cards.length).toBe(2);
  });

  it('should show empty state when no ideas match filters', () => {
    const { container } = mountView();

    // Filter to a category with no ideas
    const lifestyleTab = container.querySelector('[data-filter-category="Lifestyle"]') as HTMLElement;
    lifestyleTab.click();

    const emptyMsg = container.querySelector('.pipeline-view__empty');
    expect(emptyMsg).toBeTruthy();
    expect(emptyMsg?.textContent).toContain('No ideas match');
  });

  it('should combine multiple filters', () => {
    const { container } = mountView();

    // Set revenue >= $10K AND competition low only
    const revenueSelect = container.querySelector('#filter-revenue') as HTMLSelectElement;
    revenueSelect.value = '10000';
    revenueSelect.dispatchEvent(new Event('change'));

    const competitionSelect = container.querySelector('#filter-competition') as HTMLSelectElement;
    competitionSelect.value = 'low';
    competitionSelect.dispatchEvent(new Event('change'));

    const cards = container.querySelectorAll('.pipeline-view__card');
    // PetPal ($28K, low) and SkillStack ($35K, low) match
    expect(cards.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Idea Detail View Shows Full Market Analysis and Scoring Breakdown
// ---------------------------------------------------------------------------

describe('IdeationPipelineView — Detail View', () => {
  it('should show detail view when idea card is clicked', () => {
    const { container } = mountView();

    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    firstCard.click();

    expect(container.querySelector('.pipeline-view--detail')).toBeTruthy();
    expect(container.querySelector('.pipeline-view__detail-title')).toBeTruthy();
  });

  it('should display market analysis section with downloads, revenue, competition, niche score', () => {
    const { container } = mountView();

    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    firstCard.click();

    const detailContent = container.querySelector('.pipeline-view__detail-content');
    expect(detailContent?.textContent).toContain('Market Analysis');
    expect(detailContent?.textContent).toContain('Predicted Downloads');
    expect(detailContent?.textContent).toContain('Predicted Revenue');
    expect(detailContent?.textContent).toContain('Competition Level');
    expect(detailContent?.textContent).toContain('Niche Score');
  });

  it('should display competitor breakdown section', () => {
    const { container } = mountView();

    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    firstCard.click();

    const detailContent = container.querySelector('.pipeline-view__detail-content');
    expect(detailContent?.textContent).toContain('Competitor Breakdown');
    expect(detailContent?.textContent).toContain('Target Audience');
  });

  it('should display revenue model section', () => {
    const { container } = mountView();

    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    firstCard.click();

    const detailContent = container.querySelector('.pipeline-view__detail-content');
    expect(detailContent?.textContent).toContain('Revenue Model');
    expect(detailContent?.textContent).toContain('Monetization');
  });

  it('should display niche scoring factors with score bars', () => {
    const { container } = mountView();

    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    firstCard.click();

    const detailContent = container.querySelector('.pipeline-view__detail-content');
    expect(detailContent?.textContent).toContain('Niche Scoring Factors');

    const scoreBars = container.querySelectorAll('.pipeline-view__score-bar');
    expect(scoreBars.length).toBe(4); // Niche Score, Technical Feasibility, Market Demand, Revenue Potential
  });

  it('should navigate back to pipeline list when back button is clicked', () => {
    const { container } = mountView();

    // Navigate to detail
    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    firstCard.click();
    expect(container.querySelector('.pipeline-view--detail')).toBeTruthy();

    // Click back
    const backBtn = container.querySelector('#pipeline-back') as HTMLElement;
    backBtn.click();

    expect(container.querySelector('.pipeline-view--detail')).toBeNull();
    expect(container.querySelector('.pipeline-view__list')).toBeTruthy();
  });

  it('should show Generate button in detail view for pipeline ideas', () => {
    const { container, view } = mountView();

    // Provide fresh ideas to avoid mutation from previous tests
    const freshIdeas: AppIdea[] = [
      createTestIdea({ id: 'detail-1', name: 'Detail Test App', status: 'pipeline' }),
    ];
    view.updateIdeas(freshIdeas);

    // Click the card to navigate to detail view
    const card = container.querySelector('[data-idea-id="detail-1"]') as HTMLElement;
    expect(card).toBeTruthy();
    card.click();

    // In detail view, the generate button should be present
    expect(container.querySelector('.pipeline-view--detail')).toBeTruthy();
    const generateBtn = container.querySelector('[data-generate-id]');
    expect(generateBtn).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Dismiss and Bookmark Actions Update Pipeline State
// ---------------------------------------------------------------------------

describe('IdeationPipelineView — Dismiss and Bookmark', () => {
  it('should remove idea from list when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const { container } = mountView({ onDismiss });

    const cardsBefore = container.querySelectorAll('.pipeline-view__card').length;

    const dismissBtn = container.querySelector('[data-dismiss-id]') as HTMLElement;
    const ideaId = dismissBtn.getAttribute('data-dismiss-id');
    dismissBtn.click();

    const cardsAfter = container.querySelectorAll('.pipeline-view__card').length;
    expect(cardsAfter).toBe(cardsBefore - 1);
    expect(onDismiss).toHaveBeenCalledWith(ideaId);
  });

  it('should call onBookmark callback when bookmark button is clicked', () => {
    const onBookmark = vi.fn();
    const { container } = mountView({ onBookmark });

    const bookmarkBtn = container.querySelector('[data-bookmark-id]') as HTMLElement;
    const ideaId = bookmarkBtn.getAttribute('data-bookmark-id');
    bookmarkBtn.click();

    expect(onBookmark).toHaveBeenCalledWith(ideaId);
  });

  it('should toggle bookmark status on bookmark click', () => {
    const { container, view } = mountView();

    // Provide fresh ideas to avoid mutation from previous tests
    const freshIdeas: AppIdea[] = [
      createTestIdea({ id: 'bm-1', name: 'Bookmark Test App', status: 'pipeline' }),
      createTestIdea({ id: 'bm-2', name: 'Another App', status: 'pipeline', nicheScore: 60 }),
    ];
    view.updateIdeas(freshIdeas);

    // Find the bookmark button
    const bookmarkBtn = container.querySelector('[data-bookmark-id="bm-1"]') as HTMLElement;
    expect(bookmarkBtn).toBeTruthy();
    bookmarkBtn.click();

    // After bookmarking, the card should show bookmarked status
    const card = container.querySelector('[data-idea-id="bm-1"]');
    const status = card?.querySelector('.pipeline-view__card-status');
    expect(status?.textContent).toContain('Bookmarked');
  });

  it('should navigate back to list when idea is dismissed from detail view', () => {
    const { container } = mountView();

    // Navigate to detail view
    const firstCard = container.querySelector('[data-idea-id]') as HTMLElement;
    const ideaId = firstCard.getAttribute('data-idea-id');
    firstCard.click();
    expect(container.querySelector('.pipeline-view--detail')).toBeTruthy();

    // Dismiss from detail view
    const dismissBtn = container.querySelector(`[data-dismiss-id="${ideaId}"]`) as HTMLElement;
    dismissBtn.click();

    // Should navigate back to list
    expect(container.querySelector('.pipeline-view--detail')).toBeNull();
    expect(container.querySelector('.pipeline-view__list')).toBeTruthy();
  });

  it('should not show dismissed ideas in the pipeline list', () => {
    const { container } = mountView();

    const dismissBtn = container.querySelector('[data-dismiss-id]') as HTMLElement;
    const ideaId = dismissBtn.getAttribute('data-dismiss-id');
    dismissBtn.click();

    // The dismissed idea should not appear in the list
    const card = container.querySelector(`[data-idea-id="${ideaId}"]`);
    expect(card).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WebSocket Integration Delivers Real-Time Pipeline Updates
// ---------------------------------------------------------------------------

describe('IdeationPipelineView — WebSocket Integration', () => {
  it('should connect to WebSocket on mount', () => {
    mountView();

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain('/ws');
  });

  it('should update pipeline when receiving app.pipeline.updated message', () => {
    const { container } = mountView();

    const ws = MockWebSocket.instances[0];
    const newIdeas: AppIdea[] = [
      createTestIdea({ id: 'ws-1', name: 'WebSocket Idea Alpha', nicheScore: 95 }),
      createTestIdea({ id: 'ws-2', name: 'WebSocket Idea Beta', nicheScore: 80 }),
    ];

    ws.simulateMessage({
      type: 'app.pipeline.updated',
      data: { ideas: newIdeas },
    });

    const cardNames = Array.from(container.querySelectorAll('.pipeline-view__card-name'))
      .map((el) => el.textContent);
    expect(cardNames).toContain('WebSocket Idea Alpha');
    expect(cardNames).toContain('WebSocket Idea Beta');
  });

  it('should update pipeline when receiving app.idea.ranked message', () => {
    const { container } = mountView();

    const ws = MockWebSocket.instances[0];
    const newIdeas: AppIdea[] = [
      createTestIdea({ id: 'ranked-1', name: 'Newly Ranked Idea' }),
    ];

    ws.simulateMessage({
      type: 'app.idea.ranked',
      data: { ideas: newIdeas },
    });

    const cardNames = Array.from(container.querySelectorAll('.pipeline-view__card-name'))
      .map((el) => el.textContent);
    expect(cardNames).toContain('Newly Ranked Idea');
  });

  it('should ignore malformed WebSocket messages', () => {
    const { container } = mountView();

    const ws = MockWebSocket.instances[0];
    const cardsBefore = container.querySelectorAll('.pipeline-view__card').length;

    // Simulate malformed message (onmessage with invalid JSON)
    if (ws.onmessage) {
      ws.onmessage({ data: 'not-json{{{' } as MessageEvent);
    }

    const cardsAfter = container.querySelectorAll('.pipeline-view__card').length;
    expect(cardsAfter).toBe(cardsBefore);
  });

  it('should ignore unrelated WebSocket message types', () => {
    const { container } = mountView();

    const ws = MockWebSocket.instances[0];
    const cardsBefore = container.querySelectorAll('.pipeline-view__card').length;

    ws.simulateMessage({
      type: 'some.other.event',
      data: { ideas: [createTestIdea({ name: 'Should Not Appear' })] },
    });

    const cardsAfter = container.querySelectorAll('.pipeline-view__card').length;
    expect(cardsAfter).toBe(cardsBefore);
  });

  it('should close WebSocket on unmount', () => {
    const { view } = mountView();

    const ws = MockWebSocket.instances[0];
    view.unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('should replace all ideas with WebSocket data (full refresh)', () => {
    const { container } = mountView();

    const ws = MockWebSocket.instances[0];
    const singleIdea: AppIdea[] = [
      createTestIdea({ id: 'only-one', name: 'Only One Idea Left' }),
    ];

    ws.simulateMessage({
      type: 'app.pipeline.updated',
      data: { ideas: singleIdea },
    });

    const cards = container.querySelectorAll('.pipeline-view__card');
    expect(cards.length).toBe(1);
    expect(cards[0].querySelector('.pipeline-view__card-name')?.textContent).toBe('Only One Idea Left');
  });
});
