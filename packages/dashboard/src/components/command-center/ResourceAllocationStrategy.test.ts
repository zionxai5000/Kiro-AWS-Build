/**
 * Unit tests for Eretz Command Center — Resource Allocation and Strategy
 *
 * Validates: Requirements 46i.22, 46i.23, 46j.24, 46j.25, 21.1
 *
 * Tests resource allocation view, allocation adjustment, strategic priorities panel,
 * risk factors, and key actions rendering.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ResourceAllocationView, type ResourceAllocationData } from './ResourceAllocationView.js';
import { StrategicPrioritiesPanel, type StrategicPrioritiesData } from './StrategicPrioritiesPanel.js';

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createAllocationData(): ResourceAllocationData {
  return {
    totalBudget: 50000,
    allocations: [
      { subsidiary: 'zionx', label: 'ZionX', percentage: 50, actualSpend: 24000, recommendedPercentage: 55 },
      { subsidiary: 'zxmg', label: 'ZXMG', percentage: 30, actualSpend: 14000, recommendedPercentage: 25 },
      { subsidiary: 'zion-alpha', label: 'Zion Alpha', percentage: 20, actualSpend: 9000, recommendedPercentage: 20 },
    ],
  };
}

function createStrategyData(): StrategicPrioritiesData {
  return {
    portfolioThesis: 'Diversified digital portfolio with ZionX as growth engine, ZXMG as content moat, and Zion Alpha as alpha generator.',
    topPriorities: [
      'Scale ZionX app pipeline to 20 apps by Q3',
      'Optimize ZXMG content-to-revenue conversion',
      'Maintain Zion Alpha win rate above 65%',
    ],
    subsidiaryStrategies: [
      {
        subsidiary: 'zionx',
        label: 'ZionX',
        strategy: 'scale',
        rationale: 'Strong growth metrics and high LTV/CAC ratio justify aggressive scaling.',
        keyActions: [
          { id: 'ka-1', description: 'Launch 5 new apps this quarter', subsidiary: 'zionx', progress: 40, priority: 'high' },
          { id: 'ka-2', description: 'Increase marketing spend by 20%', subsidiary: 'zionx', progress: 75, priority: 'medium' },
        ],
      },
      {
        subsidiary: 'zxmg',
        label: 'ZXMG',
        strategy: 'optimize',
        rationale: 'Churn above threshold requires optimization before further scaling.',
        keyActions: [
          { id: 'ka-3', description: 'Reduce churn to below 3%', subsidiary: 'zxmg', progress: 20, priority: 'high' },
          { id: 'ka-4', description: 'Improve thumbnail CTR by 15%', subsidiary: 'zxmg', progress: 60, priority: 'low' },
        ],
      },
      {
        subsidiary: 'zion-alpha',
        label: 'Zion Alpha',
        strategy: 'maintain',
        rationale: 'Stable performance with acceptable risk. Maintain current strategy.',
        keyActions: [
          { id: 'ka-5', description: 'Maintain win rate above 65%', subsidiary: 'zion-alpha', progress: 90, priority: 'medium' },
        ],
      },
    ],
    riskFactors: [
      'ZXMG churn trending upward — may require intervention',
      'ZionX pipeline concentration in Productivity category',
      'Zion Alpha exposure to market volatility during earnings season',
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
// Resource Allocation View Tests (Req 46i.22, 46i.23)
// ---------------------------------------------------------------------------

describe('ResourceAllocationView — Display', () => {
  it('should render correct budget distribution per subsidiary', () => {
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData());
    view.mount();

    const bars = container.querySelectorAll('.resource-allocation__bar');
    expect(bars.length).toBe(3);

    const zionxBar = container.querySelector('[data-bar="zionx"]') as HTMLElement;
    expect(zionxBar.style.width).toBe('50%');
    expect(zionxBar.textContent).toContain('50%');
  });

  it('should display total budget', () => {
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData());
    view.mount();

    const total = container.querySelector('[data-metric="total-budget"]');
    expect(total?.textContent).toContain('$50K');
  });

  it('should display actual spend per subsidiary', () => {
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData());
    view.mount();

    const zionxControl = container.querySelector('[data-allocation="zionx"]');
    expect(zionxControl?.querySelector('.resource-allocation__actual-spend')?.textContent).toContain('$24K');
  });

  it('should display recommended allocation', () => {
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData());
    view.mount();

    const zionxControl = container.querySelector('[data-allocation="zionx"]');
    expect(zionxControl?.querySelector('.resource-allocation__recommended')?.textContent).toContain('55%');
  });

  it('should display difference from recommended', () => {
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData());
    view.mount();

    const zionxControl = container.querySelector('[data-allocation="zionx"]');
    const diff = zionxControl?.querySelector('.resource-allocation__diff');
    expect(diff?.textContent?.trim()).toBe('-5%');
  });
});

describe('ResourceAllocationView — Adjustment', () => {
  it('should propagate changes on slider input', () => {
    const onAllocationChange = vi.fn();
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData(), { onAllocationChange });
    view.mount();

    const slider = container.querySelector('[data-slider="zionx"]') as HTMLInputElement;
    slider.value = '60';
    slider.dispatchEvent(new Event('input'));

    expect(onAllocationChange).toHaveBeenCalledWith('zionx', 60);
  });

  it('should propagate changes on number input change', () => {
    const onAllocationChange = vi.fn();
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData(), { onAllocationChange });
    view.mount();

    const numberInput = container.querySelector('[data-number="zxmg"]') as HTMLInputElement;
    numberInput.value = '35';
    numberInput.dispatchEvent(new Event('change'));

    expect(onAllocationChange).toHaveBeenCalledWith('zxmg', 35);
  });

  it('should update bar chart after allocation change', () => {
    const container = createContainer();
    const view = new ResourceAllocationView(container, createAllocationData());
    view.mount();

    const slider = container.querySelector('[data-slider="zionx"]') as HTMLInputElement;
    slider.value = '65';
    slider.dispatchEvent(new Event('input'));

    const zionxBar = container.querySelector('[data-bar="zionx"]') as HTMLElement;
    expect(zionxBar.style.width).toBe('65%');
  });
});

// ---------------------------------------------------------------------------
// Strategic Priorities Panel Tests (Req 46j.24, 46j.25)
// ---------------------------------------------------------------------------

describe('StrategicPrioritiesPanel — Display', () => {
  it('should display portfolio thesis', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    const thesis = container.querySelector('[data-content="thesis"]');
    expect(thesis?.textContent).toContain('Diversified digital portfolio');
  });

  it('should display top priorities list', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    const priorities = container.querySelectorAll('.strategic-priorities__priority-item');
    expect(priorities.length).toBe(3);
    expect(priorities[0].textContent).toContain('Scale ZionX');
  });

  it('should display per-subsidiary strategies', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    const strategies = container.querySelectorAll('.strategic-priorities__subsidiary-strategy');
    expect(strategies.length).toBe(3);

    const zionxStrategy = container.querySelector('[data-strategy-subsidiary="zionx"]');
    const badge = zionxStrategy?.querySelector('.strategic-priorities__strategy-badge');
    expect(badge?.textContent?.trim()).toBe('scale');
    expect(badge?.classList.contains('strategic-priorities__strategy-badge--scale')).toBe(true);
  });

  it('should display risk factors', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    const risks = container.querySelectorAll('.strategic-priorities__risk-item');
    expect(risks.length).toBe(3);
    expect(risks[0].textContent).toContain('ZXMG churn');
  });

  it('should display key actions with progress indicators', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    const actions = container.querySelectorAll('.strategic-priorities__action');
    expect(actions.length).toBe(5); // 2 + 2 + 1

    const firstAction = actions[0];
    expect(firstAction.querySelector('.strategic-priorities__action-desc')?.textContent).toBeTruthy();
    expect(firstAction.querySelector('.strategic-priorities__progress-value')?.textContent).toContain('%');
  });

  it('should order key actions by priority (high first)', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    // Within ZionX, high priority action should come first
    const zionxStrategy = container.querySelector('[data-strategy-subsidiary="zionx"]');
    const actions = zionxStrategy?.querySelectorAll('.strategic-priorities__action');
    // ka-1 is high priority (40%), ka-2 is medium (75%)
    expect(actions?.[0].querySelector('.strategic-priorities__progress-value')?.textContent).toContain('40%');
  });

  it('should update when new data is provided', () => {
    const container = createContainer();
    const panel = new StrategicPrioritiesPanel(container, createStrategyData());
    panel.mount();

    const updatedData = createStrategyData();
    updatedData.portfolioThesis = 'Updated thesis for Q2';
    panel.update(updatedData);

    const thesis = container.querySelector('[data-content="thesis"]');
    expect(thesis?.textContent).toContain('Updated thesis for Q2');
  });
});
