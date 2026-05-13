/**
 * Unit tests for King's View — Briefing Card
 *
 * Validates: Requirements 46a.1, 9.1
 *
 * Tests briefing card rendering, session continuity, relative time,
 * WebSocket refresh, and empty states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KingsBriefingCard,
  type BriefingCardData,
  type Priority,
  type Blocker,
  type RecentEvent,
} from './BriefingCard.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestData(overrides?: Partial<BriefingCardData>): BriefingCardData {
  return {
    priorities: [
      { id: 'p1', title: 'Launch App X', urgency: 'critical' },
      { id: 'p2', title: 'Fix revenue drop', urgency: 'high' },
      { id: 'p3', title: 'Review new hires', urgency: 'medium' },
    ],
    blockers: [
      { id: 'b1', title: 'App Store rejection', severity: 'critical', source: 'ZionX' },
      { id: 'b2', title: 'API rate limit', severity: 'high', source: 'ZXMG' },
    ],
    revenue: {
      mrr: 45000,
      trend: 'up',
      changePercent: 12.5,
    },
    recentEvents: [
      { id: 'e1', description: 'New app published', timestamp: new Date(Date.now() - 3600000).toISOString(), source: 'ZionX' },
      { id: 'e2', description: 'Video went viral', timestamp: new Date(Date.now() - 7200000).toISOString(), source: 'ZXMG' },
    ],
    lastLoginAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    sessionContinuity: { hasGap: false },
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
// Briefing Card Renders Priorities, Blockers, Revenue, and Events
// ---------------------------------------------------------------------------

describe('KingsBriefingCard — Rendering', () => {
  it('should render briefing card with title', () => {
    const card = new KingsBriefingCard(container, createTestData());
    card.mount();

    expect(container.querySelector('.briefing-card__title')?.textContent).toContain("King's Briefing");
  });

  it('should render top 3 priorities', () => {
    const card = new KingsBriefingCard(container, createTestData());
    card.mount();

    const items = container.querySelectorAll('.briefing-card__priority-item');
    expect(items.length).toBe(3);
    expect(items[0].querySelector('.briefing-card__priority-title')?.textContent).toBe('Launch App X');
    expect(items[0].querySelector('.briefing-card__priority-urgency')?.textContent?.trim()).toBe('critical');
  });

  it('should render blocker count and highest severity', () => {
    const card = new KingsBriefingCard(container, createTestData());
    card.mount();

    const countEl = container.querySelector('.briefing-card__blocker-count');
    expect(countEl?.textContent).toContain('2 blockers');
    expect(countEl?.getAttribute('data-blocker-count')).toBe('2');

    const severityEl = container.querySelector('.briefing-card__blocker-severity');
    expect(severityEl?.textContent).toContain('critical');
  });

  it('should render revenue MRR and trend', () => {
    const card = new KingsBriefingCard(container, createTestData());
    card.mount();

    const mrrEl = container.querySelector('[data-metric="mrr"]');
    expect(mrrEl?.textContent).toContain('$45K');

    const trendEl = container.querySelector('.briefing-card__revenue-trend');
    expect(trendEl?.textContent).toContain('↑');
    expect(trendEl?.textContent).toContain('+12.5%');
  });

  it('should render recent events with descriptions', () => {
    const card = new KingsBriefingCard(container, createTestData());
    card.mount();

    const events = container.querySelectorAll('.briefing-card__event-item');
    expect(events.length).toBe(2);
    expect(events[0].querySelector('.briefing-card__event-desc')?.textContent).toBe('New app published');
  });

  it('should only show top 3 priorities even if more exist', () => {
    const data = createTestData({
      priorities: [
        { id: 'p1', title: 'Priority 1', urgency: 'critical' },
        { id: 'p2', title: 'Priority 2', urgency: 'high' },
        { id: 'p3', title: 'Priority 3', urgency: 'medium' },
        { id: 'p4', title: 'Priority 4', urgency: 'low' },
        { id: 'p5', title: 'Priority 5', urgency: 'low' },
      ],
    });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const items = container.querySelectorAll('.briefing-card__priority-item');
    expect(items.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Session Continuity Indicator
// ---------------------------------------------------------------------------

describe('KingsBriefingCard — Session Continuity', () => {
  it('should show gap indicator when session gap detected', () => {
    const data = createTestData({
      sessionContinuity: {
        hasGap: true,
        gapStart: new Date(Date.now() - 7200000).toISOString(),
        gapEnd: new Date(Date.now() - 3600000).toISOString(),
        recoveredAt: new Date(Date.now() - 1800000).toISOString(),
      },
    });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const continuity = container.querySelector('.briefing-card__continuity--gap');
    expect(continuity).toBeTruthy();
    expect(continuity?.textContent).toContain('Session gap detected');
  });

  it('should not show gap indicator when no gap', () => {
    const data = createTestData({ sessionContinuity: { hasGap: false } });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const continuity = container.querySelector('.briefing-card__continuity--gap');
    expect(continuity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Since Last Login Relative Time
// ---------------------------------------------------------------------------

describe('KingsBriefingCard — Relative Time', () => {
  it('should display relative time for last login', () => {
    const data = createTestData({
      lastLoginAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const lastLogin = container.querySelector('.briefing-card__last-login');
    expect(lastLogin?.textContent).toContain('1d ago');
  });

  it('should show hours for recent login', () => {
    const data = createTestData({
      lastLoginAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const lastLogin = container.querySelector('.briefing-card__last-login');
    expect(lastLogin?.textContent).toContain('2h ago');
  });

  it('should show minutes for very recent login', () => {
    const data = createTestData({
      lastLoginAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const lastLogin = container.querySelector('.briefing-card__last-login');
    expect(lastLogin?.textContent).toContain('5m ago');
  });
});

// ---------------------------------------------------------------------------
// WebSocket Updates Refresh the Card
// ---------------------------------------------------------------------------

describe('KingsBriefingCard — WebSocket Updates', () => {
  it('should update card when update() is called with new data', () => {
    const data = createTestData();
    const card = new KingsBriefingCard(container, data);
    card.mount();

    expect(container.querySelector('[data-metric="mrr"]')?.textContent).toContain('$45K');

    // Simulate WebSocket update
    const updatedData = createTestData({
      revenue: { mrr: 52000, trend: 'up', changePercent: 15.5 },
    });
    card.update(updatedData);

    expect(container.querySelector('[data-metric="mrr"]')?.textContent).toContain('$52K');
  });

  it('should update blockers on refresh', () => {
    const data = createTestData();
    const card = new KingsBriefingCard(container, data);
    card.mount();

    expect(container.querySelector('.briefing-card__blocker-count')?.textContent).toContain('2');

    const updatedData = createTestData({
      blockers: [
        { id: 'b1', title: 'New blocker', severity: 'high', source: 'ZionX' },
      ],
    });
    card.update(updatedData);

    expect(container.querySelector('.briefing-card__blocker-count')?.textContent).toContain('1 blocker');
  });
});

// ---------------------------------------------------------------------------
// Empty States
// ---------------------------------------------------------------------------

describe('KingsBriefingCard — Empty States', () => {
  it('should show empty state when no blockers', () => {
    const data = createTestData({ blockers: [] });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const blockersSection = container.querySelector('.briefing-card__section--blockers');
    expect(blockersSection?.querySelector('.briefing-card__empty')?.textContent).toContain('No active blockers');
  });

  it('should show empty state when no events since last login', () => {
    const data = createTestData({ recentEvents: [] });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const eventsSection = container.querySelector('.briefing-card__section--events');
    expect(eventsSection?.querySelector('.briefing-card__empty')?.textContent).toContain('No events since last login');
  });

  it('should show empty state when no priorities', () => {
    const data = createTestData({ priorities: [] });
    const card = new KingsBriefingCard(container, data);
    card.mount();

    const prioritiesSection = container.querySelector('.briefing-card__section--priorities');
    expect(prioritiesSection?.querySelector('.briefing-card__empty')?.textContent).toContain('No active priorities');
  });

  it('should clean up on unmount', () => {
    const card = new KingsBriefingCard(container, createTestData());
    card.mount();

    expect(container.innerHTML).not.toBe('');
    card.unmount();
    expect(container.innerHTML).toBe('');
  });
});
