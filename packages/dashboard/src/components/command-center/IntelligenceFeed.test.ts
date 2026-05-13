/**
 * Unit tests for Eretz Command Center — Intelligence Feed
 *
 * Validates: Requirements 46g.15, 46a.1
 *
 * Tests feed rendering, approve/dismiss/bookmark actions,
 * compounding score, and real-time updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IntelligenceFeed,
  type IntelligenceFeedData,
  type AgentInsight,
} from './IntelligenceFeed.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestInsight(overrides?: Partial<AgentInsight>): AgentInsight {
  return {
    id: 'ins-1',
    summary: 'Revenue drop detected in ZionX apps',
    detail: 'Three apps showing 15% revenue decline over 7 days',
    priority: 'high',
    sourceAgent: 'ZionX Monitor',
    timestamp: new Date(Date.now() - 600000).toISOString(), // 10 min ago
    status: 'pending',
    ...overrides,
  };
}

function createTestData(overrides?: Partial<IntelligenceFeedData>): IntelligenceFeedData {
  return {
    insights: [
      createTestInsight({ id: 'ins-1', priority: 'critical', sourceAgent: 'ZionX Monitor' }),
      createTestInsight({ id: 'ins-2', summary: 'New market opportunity found', priority: 'medium', sourceAgent: 'Market Scanner' }),
      createTestInsight({ id: 'ins-3', summary: 'Video performance spike', priority: 'low', sourceAgent: 'ZXMG Analytics' }),
    ],
    score: {
      totalGenerated: 100,
      actedOn: 45,
      measuredImpact: 72,
    },
    ...overrides,
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
// Feed Renders Insights with Priority Badges and Source Agent
// ---------------------------------------------------------------------------

describe('IntelligenceFeed — Rendering', () => {
  it('should render feed with title', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    expect(container.querySelector('.intelligence-feed__title')?.textContent).toContain('Intelligence Feed');
  });

  it('should render insights with priority badges', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const items = container.querySelectorAll('.intelligence-feed__item');
    expect(items.length).toBe(3);

    const firstBadge = items[0].querySelector('.intelligence-feed__item-badge--critical');
    expect(firstBadge).toBeTruthy();
  });

  it('should show source agent on each insight', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const sources = container.querySelectorAll('.intelligence-feed__item-source');
    const sourceTexts = Array.from(sources).map((el) => el.textContent);
    expect(sourceTexts).toContain('ZionX Monitor');
    expect(sourceTexts).toContain('Market Scanner');
  });

  it('should show insight summary', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const summaries = container.querySelectorAll('.intelligence-feed__item-summary');
    expect(summaries[0]?.textContent).toContain('Revenue drop detected');
  });
});

// ---------------------------------------------------------------------------
// Approve Action Triggers Execution Workflow
// ---------------------------------------------------------------------------

describe('IntelligenceFeed — Approve Action', () => {
  it('should call onApprove when approve button is clicked', () => {
    const onApprove = vi.fn();
    const feed = new IntelligenceFeed(container, createTestData(), { onApprove });
    feed.mount();

    const approveBtn = container.querySelector('[data-approve-id="ins-1"]') as HTMLElement;
    approveBtn.click();

    expect(onApprove).toHaveBeenCalledWith('ins-1');
  });

  it('should remove insight from pending list after approval', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    expect(container.querySelectorAll('.intelligence-feed__item').length).toBe(3);

    const approveBtn = container.querySelector('[data-approve-id="ins-1"]') as HTMLElement;
    approveBtn.click();

    expect(container.querySelectorAll('.intelligence-feed__item').length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Dismiss Removes from Feed
// ---------------------------------------------------------------------------

describe('IntelligenceFeed — Dismiss Action', () => {
  it('should call onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const feed = new IntelligenceFeed(container, createTestData(), { onDismiss });
    feed.mount();

    const dismissBtn = container.querySelector('[data-dismiss-id="ins-2"]') as HTMLElement;
    dismissBtn.click();

    expect(onDismiss).toHaveBeenCalledWith('ins-2');
  });

  it('should remove insight from feed after dismiss', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const dismissBtn = container.querySelector('[data-dismiss-id="ins-2"]') as HTMLElement;
    dismissBtn.click();

    expect(container.querySelector('[data-insight-id="ins-2"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bookmark Persists for Later Review
// ---------------------------------------------------------------------------

describe('IntelligenceFeed — Bookmark Action', () => {
  it('should call onBookmark when bookmark button is clicked', () => {
    const onBookmark = vi.fn();
    const feed = new IntelligenceFeed(container, createTestData(), { onBookmark });
    feed.mount();

    const bookmarkBtn = container.querySelector('[data-bookmark-id="ins-3"]') as HTMLElement;
    bookmarkBtn.click();

    expect(onBookmark).toHaveBeenCalledWith('ins-3');
  });

  it('should move insight to bookmarked section', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const bookmarkBtn = container.querySelector('[data-bookmark-id="ins-3"]') as HTMLElement;
    bookmarkBtn.click();

    // Should appear in bookmarks section
    const bookmarks = container.querySelector('.intelligence-feed__bookmarks');
    expect(bookmarks).toBeTruthy();
    expect(bookmarks?.textContent).toContain('Video performance spike');
  });
});

// ---------------------------------------------------------------------------
// Compounding Score Calculates Correctly
// ---------------------------------------------------------------------------

describe('IntelligenceFeed — Compounding Score', () => {
  it('should display compounding intelligence score', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const scoreEl = container.querySelector('.intelligence-feed__score-value');
    // Score = (45/100) * 72 = 32.4 → 32
    expect(scoreEl?.textContent).toBe('32');
  });

  it('should show acted on vs total in score detail', () => {
    const feed = new IntelligenceFeed(container, createTestData());
    feed.mount();

    const detail = container.querySelector('.intelligence-feed__score-detail');
    expect(detail?.textContent).toContain('45/100 acted');
    expect(detail?.textContent).toContain('72% impact');
  });

  it('should handle zero total generated', () => {
    const data = createTestData({
      score: { totalGenerated: 0, actedOn: 0, measuredImpact: 0 },
    });
    const feed = new IntelligenceFeed(container, data);
    feed.mount();

    const scoreEl = container.querySelector('.intelligence-feed__score-value');
    expect(scoreEl?.textContent).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Real-Time Updates via WebSocket Push New Insights
// ---------------------------------------------------------------------------

describe('IntelligenceFeed — Real-Time Updates', () => {
  it('should update feed when update() is called with new insights', () => {
    const data = createTestData();
    const feed = new IntelligenceFeed(container, data);
    feed.mount();

    expect(container.querySelectorAll('.intelligence-feed__item').length).toBe(3);

    // Simulate WebSocket push with new insight
    const updatedData = createTestData({
      insights: [
        ...data.insights,
        createTestInsight({ id: 'ins-4', summary: 'New insight from WebSocket', priority: 'high' }),
      ],
    });
    feed.update(updatedData);

    expect(container.querySelectorAll('.intelligence-feed__item').length).toBe(4);
    const summaries = Array.from(container.querySelectorAll('.intelligence-feed__item-summary'))
      .map((el) => el.textContent);
    expect(summaries).toContain('New insight from WebSocket');
  });
});
