/**
 * Unit tests for Eretz Command Center — Synergy Map and Pattern Library
 *
 * Validates: Requirements 46d.9, 46d.10, 46e.11, 46e.12, 21.1
 *
 * Tests synergy map rendering, revenue impact display, pattern library browser,
 * pattern detail view, and search filtering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SynergyMapVisualization, type SynergyMapData, type Synergy } from './SynergyMapVisualization.js';
import { PatternLibraryBrowser, type PatternLibraryData, type Pattern } from './PatternLibraryBrowser.js';

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createSynergy(overrides?: Partial<Synergy>): Synergy {
  return {
    id: 'syn-1',
    source: 'zxmg',
    target: 'zionx',
    type: 'Content-to-App',
    description: 'ZXMG videos include ZionX app commercials driving installs',
    revenueImpact: 3500,
    active: true,
    ...overrides,
  };
}

function createSynergyMapData(overrides?: Partial<SynergyMapData>): SynergyMapData {
  return {
    synergies: [
      createSynergy({ id: 'syn-1', source: 'zxmg', target: 'zionx', type: 'Content-to-App', revenueImpact: 3500 }),
      createSynergy({ id: 'syn-2', source: 'zion-alpha', target: 'zionx', type: 'Insight-to-Idea', revenueImpact: 2000, description: 'Trading insights inform app ideas for finance category' }),
      createSynergy({ id: 'syn-3', source: 'zionx', target: 'zxmg', type: 'App-to-Content', revenueImpact: 1500, description: 'App launches generate video content opportunities' }),
    ],
    totalSynergyRevenue: 7000,
    ...overrides,
  };
}

function createPattern(overrides?: Partial<Pattern>): Pattern {
  return {
    id: 'pat-1',
    name: 'Freemium Conversion Funnel',
    category: 'Monetization',
    sourceSubsidiary: 'ZionX',
    adoptionCount: 3,
    effectivenessScore: 85,
    description: 'A structured approach to converting free users to paid subscribers using progressive value revelation.',
    implementationExamples: ['ZenFocus: 7-day premium trial', 'PetPal: Feature gating after 3 uses'],
    adoptionHistory: [
      { subsidiary: 'ZionX', date: '2024-01-15', outcome: 'Increased conversion by 23%' },
      { subsidiary: 'ZXMG', date: '2024-02-01', outcome: 'Applied to membership model' },
    ],
    measuredImpact: 'Average 20% increase in conversion rate across adopting subsidiaries.',
    ...overrides,
  };
}

function createPatternLibraryData(): PatternLibraryData {
  return {
    patterns: [
      createPattern({ id: 'pat-1', name: 'Freemium Conversion Funnel', category: 'Monetization' }),
      createPattern({ id: 'pat-2', name: 'Retention Loop Design', category: 'Engagement', sourceSubsidiary: 'ZXMG', effectivenessScore: 78 }),
      createPattern({ id: 'pat-3', name: 'Cross-Platform Launch', category: 'Growth', sourceSubsidiary: 'ZionX', effectivenessScore: 92 }),
    ],
  };
}

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Synergy Map Tests (Req 46d.9, 46d.10)
// ---------------------------------------------------------------------------

describe('SynergyMapVisualization — Rendering', () => {
  it('should render active synergies with correct source/target subsidiaries', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, createSynergyMapData());
    map.mount();

    const connections = container.querySelectorAll('.synergy-map__connection');
    expect(connections.length).toBe(3);

    const firstConnection = connections[0];
    expect(firstConnection.getAttribute('data-source')).toBe('zxmg');
    expect(firstConnection.getAttribute('data-target')).toBe('zionx');
  });

  it('should display synergy revenue impact total', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, createSynergyMapData({ totalSynergyRevenue: 7000 }));
    map.mount();

    const revenueEl = container.querySelector('[data-metric="synergy-revenue"]');
    expect(revenueEl?.textContent).toContain('$7K');
  });

  it('should display revenue impact per synergy connection', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, createSynergyMapData());
    map.mount();

    const impacts = container.querySelectorAll('.synergy-map__connection-impact');
    expect(impacts.length).toBe(3);
    expect(impacts[0].textContent).toContain('$4K');
  });

  it('should display synergy items with type and description', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, createSynergyMapData());
    map.mount();

    const items = container.querySelectorAll('.synergy-map__item');
    expect(items.length).toBe(3);

    const firstItem = items[0];
    expect(firstItem.querySelector('.synergy-map__item-type')?.textContent).toBe('Content-to-App');
    expect(firstItem.querySelector('.synergy-map__item-description')?.textContent).toContain('ZXMG videos');
  });

  it('should only display active synergies', () => {
    const container = createContainer();
    const data = createSynergyMapData();
    data.synergies.push(createSynergy({ id: 'syn-inactive', active: false }));
    const map = new SynergyMapVisualization(container, data);
    map.mount();

    const connections = container.querySelectorAll('.synergy-map__connection');
    expect(connections.length).toBe(3); // Only the 3 active ones
  });

  it('should show empty state when no active synergies', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, { synergies: [], totalSynergyRevenue: 0 });
    map.mount();

    const emptyEl = container.querySelector('.synergy-map__empty');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl?.textContent).toContain('No active synergies');
  });

  it('should display subsidiary nodes', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, createSynergyMapData());
    map.mount();

    expect(container.querySelector('[data-node="zionx"]')).toBeTruthy();
    expect(container.querySelector('[data-node="zxmg"]')).toBeTruthy();
    expect(container.querySelector('[data-node="zion-alpha"]')).toBeTruthy();
  });

  it('should update when new data is provided', () => {
    const container = createContainer();
    const map = new SynergyMapVisualization(container, createSynergyMapData({ totalSynergyRevenue: 7000 }));
    map.mount();

    map.update({ synergies: [createSynergy()], totalSynergyRevenue: 12000 });

    const revenueEl = container.querySelector('[data-metric="synergy-revenue"]');
    expect(revenueEl?.textContent).toContain('$12K');
  });
});

// ---------------------------------------------------------------------------
// Pattern Library Browser Tests (Req 46e.11, 46e.12)
// ---------------------------------------------------------------------------

describe('PatternLibraryBrowser — List View', () => {
  it('should render searchable list with correct metrics', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const items = container.querySelectorAll('.pattern-library__item');
    expect(items.length).toBe(3);

    const firstItem = items[0];
    expect(firstItem.querySelector('.pattern-library__item-name')?.textContent).toBe('Freemium Conversion Funnel');
    expect(firstItem.querySelector('.pattern-library__item-category')?.textContent).toBe('Monetization');
    expect(firstItem.querySelector('.pattern-library__item-source')?.textContent).toContain('ZionX');
    expect(firstItem.querySelector('.pattern-library__item-adoption')?.textContent).toContain('3 adoptions');
    expect(firstItem.querySelector('.pattern-library__item-score')?.textContent).toContain('85/100');
  });

  it('should display pattern count', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const count = container.querySelector('.pattern-library__count');
    expect(count?.textContent).toContain('3 patterns');
  });

  it('should have a search input', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const searchInput = container.querySelector('#pattern-search') as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    expect(searchInput.type).toBe('search');
  });
});

describe('PatternLibraryBrowser — Search', () => {
  it('should filter patterns by name', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const searchInput = container.querySelector('#pattern-search') as HTMLInputElement;
    searchInput.value = 'Freemium';
    searchInput.dispatchEvent(new Event('input'));

    const items = container.querySelectorAll('.pattern-library__item');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.pattern-library__item-name')?.textContent).toBe('Freemium Conversion Funnel');
  });

  it('should filter patterns by category', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const searchInput = container.querySelector('#pattern-search') as HTMLInputElement;
    searchInput.value = 'Growth';
    searchInput.dispatchEvent(new Event('input'));

    const items = container.querySelectorAll('.pattern-library__item');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.pattern-library__item-name')?.textContent).toBe('Cross-Platform Launch');
  });

  it('should show empty state when no patterns match search', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const searchInput = container.querySelector('#pattern-search') as HTMLInputElement;
    searchInput.value = 'nonexistent';
    searchInput.dispatchEvent(new Event('input'));

    const emptyEl = container.querySelector('.pattern-library__empty');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl?.textContent).toContain('No patterns match');
  });

  it('should be case-insensitive', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const searchInput = container.querySelector('#pattern-search') as HTMLInputElement;
    searchInput.value = 'freemium';
    searchInput.dispatchEvent(new Event('input'));

    const items = container.querySelectorAll('.pattern-library__item');
    expect(items.length).toBe(1);
  });
});

describe('PatternLibraryBrowser — Detail View', () => {
  it('should show full information on click', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const firstItem = container.querySelector('[data-pattern-id="pat-1"]') as HTMLElement;
    firstItem.click();

    expect(container.querySelector('.pattern-library--detail')).toBeTruthy();
    expect(container.querySelector('.pattern-library__detail-title')?.textContent).toBe('Freemium Conversion Funnel');
  });

  it('should display description in detail view', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const firstItem = container.querySelector('[data-pattern-id="pat-1"]') as HTMLElement;
    firstItem.click();

    const description = container.querySelector('.pattern-library__detail-description');
    expect(description?.textContent).toContain('structured approach');
  });

  it('should display implementation examples', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const firstItem = container.querySelector('[data-pattern-id="pat-1"]') as HTMLElement;
    firstItem.click();

    const examples = container.querySelectorAll('.pattern-library__example-item');
    expect(examples.length).toBe(2);
    expect(examples[0].textContent).toContain('ZenFocus');
  });

  it('should display adoption history', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const firstItem = container.querySelector('[data-pattern-id="pat-1"]') as HTMLElement;
    firstItem.click();

    const history = container.querySelectorAll('.pattern-library__history-item');
    expect(history.length).toBe(2);
    expect(history[0].textContent).toContain('ZionX');
    expect(history[0].textContent).toContain('Increased conversion');
  });

  it('should display measured impact', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const firstItem = container.querySelector('[data-pattern-id="pat-1"]') as HTMLElement;
    firstItem.click();

    const impact = container.querySelector('.pattern-library__detail-impact');
    expect(impact?.textContent).toContain('20% increase');
  });

  it('should navigate back to list when back button is clicked', () => {
    const container = createContainer();
    const browser = new PatternLibraryBrowser(container, createPatternLibraryData());
    browser.mount();

    const firstItem = container.querySelector('[data-pattern-id="pat-1"]') as HTMLElement;
    firstItem.click();
    expect(container.querySelector('.pattern-library--detail')).toBeTruthy();

    const backBtn = container.querySelector('#pattern-back') as HTMLElement;
    backBtn.click();

    expect(container.querySelector('.pattern-library--detail')).toBeNull();
    expect(container.querySelector('.pattern-library__list')).toBeTruthy();
  });
});
