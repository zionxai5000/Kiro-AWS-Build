/**
 * Unit tests for ZionX App Studio — Market Opportunity Heatmap
 *
 * Validates: Requirements 45a.1, 45b.5
 *
 * Tests heatmap rendering, bubble positioning, color coding,
 * drill-down, filters, and empty state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MarketOpportunityHeatmap,
  type MarketHeatmapData,
  type MarketOpportunity,
} from './MarketHeatmap.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestOpportunity(overrides?: Partial<MarketOpportunity>): MarketOpportunity {
  return {
    id: 'opp-1',
    category: 'Productivity',
    revenueTier: 'tier2',
    opportunityScore: 75,
    opportunityLevel: 'high',
    competitorCount: 8,
    reviewGap: 35,
    estimatedDownloads: 50000,
    nicheDetails: {
      topCompetitors: ['AppA', 'AppB'],
      avgRating: 3.8,
      marketSize: '$2.5B',
    },
    ...overrides,
  };
}

function createTestData(): MarketHeatmapData {
  return {
    categories: ['Productivity', 'Health', 'Finance', 'Education'],
    opportunities: [
      createTestOpportunity({ id: 'opp-1', category: 'Productivity', revenueTier: 'tier2', opportunityLevel: 'high', opportunityScore: 85, competitorCount: 8 }),
      createTestOpportunity({ id: 'opp-2', category: 'Health', revenueTier: 'tier1', opportunityLevel: 'moderate', opportunityScore: 55, competitorCount: 20 }),
      createTestOpportunity({ id: 'opp-3', category: 'Finance', revenueTier: 'tier3', opportunityLevel: 'saturated', opportunityScore: 25, competitorCount: 45 }),
      createTestOpportunity({ id: 'opp-4', category: 'Education', revenueTier: 'tier4', opportunityLevel: 'high', opportunityScore: 90, competitorCount: 5 }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let container: HTMLElement;

beforeEach(() => {
  container = createContainer();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Heatmap Renders Bubbles with Correct Positioning
// ---------------------------------------------------------------------------

describe('MarketOpportunityHeatmap — Rendering', () => {
  it('should render heatmap with title', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    expect(container.querySelector('.market-heatmap__title')?.textContent).toContain('Market Opportunity Heatmap');
  });

  it('should render bubbles for each opportunity', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubbles = container.querySelectorAll('.market-heatmap__bubble');
    expect(bubbles.length).toBe(4);
  });

  it('should show opportunity count', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    expect(container.querySelector('.market-heatmap__count')?.textContent).toContain('4 opportunities');
  });

  it('should render x-axis category labels', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const xLabels = container.querySelectorAll('.market-heatmap__x-label');
    const texts = Array.from(xLabels).map((el) => el.textContent);
    expect(texts).toContain('Productivity');
    expect(texts).toContain('Health');
    expect(texts).toContain('Finance');
    expect(texts).toContain('Education');
  });

  it('should render y-axis revenue tier labels', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const yLabels = container.querySelectorAll('.market-heatmap__y-label');
    expect(yLabels.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Bubble Size Correlates with Opportunity Score
// ---------------------------------------------------------------------------

describe('MarketOpportunityHeatmap — Bubble Size', () => {
  it('should render larger bubbles for higher opportunity scores', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const highScoreBubble = container.querySelector('[data-opportunity-id="opp-4"]') as HTMLElement; // score 90
    const lowScoreBubble = container.querySelector('[data-opportunity-id="opp-3"]') as HTMLElement; // score 25

    const highSize = parseInt(highScoreBubble.style.width);
    const lowSize = parseInt(lowScoreBubble.style.width);
    expect(highSize).toBeGreaterThan(lowSize);
  });
});

// ---------------------------------------------------------------------------
// Color Coding Reflects Opportunity Level
// ---------------------------------------------------------------------------

describe('MarketOpportunityHeatmap — Color Coding', () => {
  it('should apply green color for high opportunity', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-1"]') as HTMLElement;
    expect(bubble.classList.contains('market-heatmap__bubble--high')).toBe(true);
    // happy-dom may keep hex format rather than converting to rgb
    expect(bubble.style.backgroundColor).toMatch(/(#22c55e|rgb\(34,\s*197,\s*94\))/);
  });

  it('should apply yellow color for moderate opportunity', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-2"]') as HTMLElement;
    expect(bubble.classList.contains('market-heatmap__bubble--moderate')).toBe(true);
  });

  it('should apply red color for saturated opportunity', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-3"]') as HTMLElement;
    expect(bubble.classList.contains('market-heatmap__bubble--saturated')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Click-on-Bubble Shows Niche Detail Drill-Down
// ---------------------------------------------------------------------------

describe('MarketOpportunityHeatmap — Drill-Down', () => {
  it('should show drill-down panel when bubble is clicked', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-1"]') as HTMLElement;
    bubble.click();

    const drilldown = container.querySelector('.market-heatmap__drilldown');
    expect(drilldown).toBeTruthy();
  });

  it('should display competitors, review gaps, and estimated downloads in drill-down', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-1"]') as HTMLElement;
    bubble.click();

    const drilldown = container.querySelector('.market-heatmap__drilldown');
    expect(drilldown?.textContent).toContain('AppA');
    expect(drilldown?.textContent).toContain('AppB');
    expect(drilldown?.textContent).toContain('35%');
    expect(drilldown?.textContent).toContain('50K');
  });

  it('should call onBubbleClick callback', () => {
    const onBubbleClick = vi.fn();
    const heatmap = new MarketOpportunityHeatmap(container, createTestData(), { onBubbleClick });
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-2"]') as HTMLElement;
    bubble.click();

    expect(onBubbleClick).toHaveBeenCalledWith('opp-2');
  });

  it('should close drill-down when close button is clicked', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const bubble = container.querySelector('[data-opportunity-id="opp-1"]') as HTMLElement;
    bubble.click();
    expect(container.querySelector('.market-heatmap__drilldown')).toBeTruthy();

    const closeBtn = container.querySelector('[data-close-drilldown]') as HTMLElement;
    closeBtn.click();
    expect(container.querySelector('.market-heatmap__drilldown')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filters Narrow Displayed Bubbles
// ---------------------------------------------------------------------------

describe('MarketOpportunityHeatmap — Filters', () => {
  it('should filter by competition level', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const competitionFilter = container.querySelector('#heatmap-competition-filter') as HTMLSelectElement;
    competitionFilter.value = '10';
    competitionFilter.dispatchEvent(new Event('change'));

    const bubbles = container.querySelectorAll('.market-heatmap__bubble');
    // Only opp-1 (8 competitors) and opp-4 (5 competitors) should show
    expect(bubbles.length).toBe(2);
  });

  it('should filter by category', () => {
    const heatmap = new MarketOpportunityHeatmap(container, createTestData());
    heatmap.mount();

    const categoryFilter = container.querySelector('#heatmap-category-filter') as HTMLSelectElement;
    categoryFilter.value = 'Productivity';
    categoryFilter.dispatchEvent(new Event('change'));

    const bubbles = container.querySelectorAll('.market-heatmap__bubble');
    expect(bubbles.length).toBe(1);
  });

  it('should show empty state when no opportunities match filters', () => {
    const data: MarketHeatmapData = {
      categories: ['Productivity'],
      opportunities: [
        createTestOpportunity({ id: 'opp-1', competitorCount: 100 }),
      ],
    };
    const heatmap = new MarketOpportunityHeatmap(container, data);
    heatmap.mount();

    const competitionFilter = container.querySelector('#heatmap-competition-filter') as HTMLSelectElement;
    competitionFilter.value = '10';
    competitionFilter.dispatchEvent(new Event('change'));

    expect(container.querySelector('.market-heatmap__empty')).toBeTruthy();
  });
});
