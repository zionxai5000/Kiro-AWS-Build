/**
 * Unit tests for Eretz Command Center — Training, Recommendations, and Alerts
 *
 * Validates: Requirements 46f.13, 46f.14, 46g.15, 46g.16, 46g.17, 46g.18, 46h.19, 46h.20, 46h.21, 21.1
 *
 * Tests training cascade chart, recommendation queue actions, and decline alerts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { TrainingCascadeChart, type TrainingCascadeData } from './TrainingCascadeChart.js';
import { RecommendationQueuePanel, type RecommendationQueueData, type Recommendation } from './RecommendationQueuePanel.js';
import { DeclineAlertsPanel, type DeclineAlertsData, type DeclineAlert } from './DeclineAlertsPanel.js';

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createTrainingData(): TrainingCascadeData {
  return {
    subsidiaries: [
      {
        subsidiary: 'zionx',
        label: 'ZionX',
        completionRate: 92,
        qualityImprovement: 15,
        dataPoints: [
          { period: 'W1', qualityScore: 72 },
          { period: 'W2', qualityScore: 75 },
          { period: 'W3', qualityScore: 80 },
          { period: 'W4', qualityScore: 87 },
        ],
      },
      {
        subsidiary: 'zxmg',
        label: 'ZXMG',
        completionRate: 85,
        qualityImprovement: 8,
        dataPoints: [
          { period: 'W1', qualityScore: 68 },
          { period: 'W2', qualityScore: 70 },
          { period: 'W3', qualityScore: 73 },
          { period: 'W4', qualityScore: 76 },
        ],
      },
      {
        subsidiary: 'zion-alpha',
        label: 'Zion Alpha',
        completionRate: 78,
        qualityImprovement: -2,
        dataPoints: [
          { period: 'W1', qualityScore: 80 },
          { period: 'W2', qualityScore: 79 },
          { period: 'W3', qualityScore: 78 },
          { period: 'W4', qualityScore: 78 },
        ],
      },
    ],
  };
}

function createRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: 'rec-1',
    summary: 'Increase ZionX marketing budget by 20%',
    priority: 'high',
    sourceAgent: 'Eretz Portfolio Analyzer',
    submittedDate: '2024-03-15T10:00:00Z',
    parameters: { budgetIncrease: '20%', targetSubsidiary: 'zionx' },
    status: 'pending',
    ...overrides,
  };
}

function createRecommendationData(): RecommendationQueueData {
  return {
    recommendations: [
      createRecommendation({ id: 'rec-1', priority: 'high', summary: 'Increase ZionX marketing budget by 20%' }),
      createRecommendation({ id: 'rec-2', priority: 'critical', summary: 'Urgent: ZXMG churn exceeds threshold' }),
      createRecommendation({ id: 'rec-3', priority: 'medium', summary: 'Optimize Zion Alpha position sizing' }),
    ],
  };
}

function createDeclineAlert(overrides?: Partial<DeclineAlert>): DeclineAlert {
  return {
    id: 'alert-1',
    subsidiary: 'ZXMG',
    metric: 'MRR',
    severity: 'warning',
    declinePercentage: 12,
    interventionPlan: 'Increase content output frequency and optimize thumbnails for higher CTR.',
    acknowledged: false,
    timestamp: '2024-03-15T10:00:00Z',
    ...overrides,
  };
}

function createDeclineAlertsData(): DeclineAlertsData {
  return {
    alerts: [
      createDeclineAlert({ id: 'alert-1', severity: 'critical', subsidiary: 'ZXMG', metric: 'MRR', declinePercentage: 22 }),
      createDeclineAlert({ id: 'alert-2', severity: 'warning', subsidiary: 'ZionX', metric: 'churn', declinePercentage: 8 }),
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
// Training Cascade Chart Tests (Req 46f.13, 46f.14)
// ---------------------------------------------------------------------------

describe('TrainingCascadeChart — Rendering', () => {
  it('should render per-subsidiary quality trends', () => {
    const container = createContainer();
    const chart = new TrainingCascadeChart(container, createTrainingData());
    chart.mount();

    const subsidiaries = container.querySelectorAll('.training-cascade__subsidiary');
    expect(subsidiaries.length).toBe(3);
  });

  it('should display completion rate per subsidiary', () => {
    const container = createContainer();
    const chart = new TrainingCascadeChart(container, createTrainingData());
    chart.mount();

    const zionxSub = container.querySelector('[data-subsidiary="zionx"]');
    const completionRate = zionxSub?.querySelector('[data-metric="completion-rate"]');
    expect(completionRate?.textContent?.trim()).toBe('92%');
  });

  it('should display quality improvement with sign', () => {
    const container = createContainer();
    const chart = new TrainingCascadeChart(container, createTrainingData());
    chart.mount();

    const zionxSub = container.querySelector('[data-subsidiary="zionx"]');
    const improvement = zionxSub?.querySelector('[data-metric="quality-improvement"]');
    expect(improvement?.textContent?.trim()).toBe('+15%');
    expect(improvement?.classList.contains('training-cascade__improvement--positive')).toBe(true);
  });

  it('should display negative quality improvement', () => {
    const container = createContainer();
    const chart = new TrainingCascadeChart(container, createTrainingData());
    chart.mount();

    const alphaSub = container.querySelector('[data-subsidiary="zion-alpha"]');
    const improvement = alphaSub?.querySelector('[data-metric="quality-improvement"]');
    expect(improvement?.textContent?.trim()).toBe('-2%');
    expect(improvement?.classList.contains('training-cascade__improvement--negative')).toBe(true);
  });

  it('should render SVG trend line charts', () => {
    const container = createContainer();
    const chart = new TrainingCascadeChart(container, createTrainingData());
    chart.mount();

    const svgs = container.querySelectorAll('.training-cascade__svg');
    expect(svgs.length).toBe(3);
  });

  it('should update when new data is provided', () => {
    const container = createContainer();
    const chart = new TrainingCascadeChart(container, createTrainingData());
    chart.mount();

    const updatedData = createTrainingData();
    updatedData.subsidiaries[0].completionRate = 98;
    chart.update(updatedData);

    const zionxSub = container.querySelector('[data-subsidiary="zionx"]');
    const completionRate = zionxSub?.querySelector('[data-metric="completion-rate"]');
    expect(completionRate?.textContent?.trim()).toBe('98%');
  });
});

// ---------------------------------------------------------------------------
// Recommendation Queue Tests (Req 46g.15, 46g.16, 46g.17, 46g.18)
// ---------------------------------------------------------------------------

describe('RecommendationQueuePanel — Display', () => {
  it('should display pending items with correct priority ordering', () => {
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData());
    panel.mount();

    const items = container.querySelectorAll('.recommendation-queue__item');
    expect(items.length).toBe(3);

    // Critical should be first
    const firstPriority = items[0].querySelector('.recommendation-queue__item-priority');
    expect(firstPriority?.textContent?.trim()).toBe('critical');
  });

  it('should display recommendation summary and source', () => {
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData());
    panel.mount();

    const firstItem = container.querySelector('.recommendation-queue__item');
    expect(firstItem?.querySelector('.recommendation-queue__item-summary')?.textContent).toContain('ZXMG churn');
    expect(firstItem?.querySelector('.recommendation-queue__item-source')?.textContent).toContain('Eretz Portfolio Analyzer');
  });

  it('should display pending count', () => {
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData());
    panel.mount();

    const count = container.querySelector('.recommendation-queue__count');
    expect(count?.textContent).toContain('3 pending');
  });
});

describe('RecommendationQueuePanel — Actions', () => {
  it('should trigger execution and remove from pending on approve', () => {
    const onApprove = vi.fn();
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData(), { onApprove });
    panel.mount();

    const approveBtn = container.querySelector('[data-approve-id="rec-2"]') as HTMLElement;
    approveBtn.click();

    expect(onApprove).toHaveBeenCalledWith('rec-2');
    // Should be removed from pending list
    const items = container.querySelectorAll('.recommendation-queue__item');
    expect(items.length).toBe(2);
  });

  it('should mark as rejected with reason on reject', () => {
    const onReject = vi.fn();
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData(), { onReject });
    panel.mount();

    const rejectBtn = container.querySelector('[data-reject-id="rec-1"]') as HTMLElement;
    rejectBtn.click();

    expect(onReject).toHaveBeenCalledWith('rec-1', 'Rejected by King');
    // Should be removed from pending list
    const items = container.querySelectorAll('.recommendation-queue__item');
    expect(items.length).toBe(2);
  });

  it('should open inline editor on modify click', () => {
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData());
    panel.mount();

    const modifyBtn = container.querySelector('[data-modify-id="rec-1"]') as HTMLElement;
    modifyBtn.click();

    const editor = container.querySelector('[data-editor-id="rec-1"]');
    expect(editor).toBeTruthy();
    const inputs = editor?.querySelectorAll('.recommendation-queue__editor-input');
    expect(inputs?.length).toBeGreaterThan(0);
  });

  it('should submit adjusted parameters on modify submit', () => {
    const onModify = vi.fn();
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, createRecommendationData(), { onModify });
    panel.mount();

    // Open editor
    const modifyBtn = container.querySelector('[data-modify-id="rec-1"]') as HTMLElement;
    modifyBtn.click();

    // Change a parameter value
    const input = container.querySelector('[data-param-key="budgetIncrease"]') as HTMLInputElement;
    input.value = '30%';

    // Submit
    const submitBtn = container.querySelector('[data-submit-modify-id="rec-1"]') as HTMLElement;
    submitBtn.click();

    expect(onModify).toHaveBeenCalledWith('rec-1', expect.objectContaining({ budgetIncrease: '30%' }));
  });

  it('should show empty state when no pending recommendations', () => {
    const container = createContainer();
    const panel = new RecommendationQueuePanel(container, { recommendations: [] });
    panel.mount();

    const emptyEl = container.querySelector('.recommendation-queue__empty');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl?.textContent).toContain('No pending recommendations');
  });
});

// ---------------------------------------------------------------------------
// Decline Alerts Tests (Req 46h.19, 46h.20, 46h.21)
// ---------------------------------------------------------------------------

describe('DeclineAlertsPanel — Display', () => {
  it('should display alerts with subsidiary, metric, severity, and decline', () => {
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, createDeclineAlertsData());
    panel.mount();

    const items = container.querySelectorAll('.decline-alerts__item');
    expect(items.length).toBe(2);

    const firstItem = items[0];
    expect(firstItem.querySelector('.decline-alerts__item-severity')?.textContent?.trim()).toBe('CRITICAL');
    expect(firstItem.querySelector('.decline-alerts__item-subsidiary')?.textContent).toBe('ZXMG');
    expect(firstItem.querySelector('.decline-alerts__item-metric')?.textContent).toBe('MRR');
    expect(firstItem.querySelector('.decline-alerts__item-decline')?.textContent).toBe('-22%');
  });

  it('should display active alert count', () => {
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, createDeclineAlertsData());
    panel.mount();

    const count = container.querySelector('.decline-alerts__count');
    expect(count?.textContent).toContain('2 active');
  });
});

describe('DeclineAlertsPanel — WebSocket Push (Req 46h.20)', () => {
  it('should display new alerts immediately via addAlert', () => {
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, { alerts: [] });
    panel.mount();

    expect(container.querySelectorAll('.decline-alerts__item').length).toBe(0);

    // Simulate WebSocket push
    panel.addAlert(createDeclineAlert({ id: 'new-alert', subsidiary: 'ZionX', metric: 'revenue', declinePercentage: 15 }));

    const items = container.querySelectorAll('.decline-alerts__item');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.decline-alerts__item-subsidiary')?.textContent).toBe('ZionX');
  });
});

describe('DeclineAlertsPanel — Acknowledgment (Req 46h.21)', () => {
  it('should update alert state on acknowledgment', () => {
    const onAcknowledge = vi.fn();
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, createDeclineAlertsData(), { onAcknowledge });
    panel.mount();

    const ackBtn = container.querySelector('[data-acknowledge-id="alert-1"]') as HTMLElement;
    ackBtn.click();

    expect(onAcknowledge).toHaveBeenCalledWith('alert-1');
    // Should show acknowledged label instead of button
    const item = container.querySelector('[data-alert-id="alert-1"]');
    expect(item?.querySelector('.decline-alerts__acknowledged-label')).toBeTruthy();
    expect(item?.querySelector('[data-acknowledge-id]')).toBeNull();
  });

  it('should show full intervention plan on view plan click', () => {
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, createDeclineAlertsData());
    panel.mount();

    const planBtn = container.querySelector('[data-plan-id="alert-1"]') as HTMLElement;
    planBtn.click();

    const planContent = container.querySelector('[data-plan-content="alert-1"]');
    expect(planContent).toBeTruthy();
    expect(planContent?.querySelector('.decline-alerts__plan-content')?.textContent).toContain('Increase content output');
  });

  it('should toggle intervention plan visibility', () => {
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, createDeclineAlertsData());
    panel.mount();

    // Open plan
    const planBtn = container.querySelector('[data-plan-id="alert-1"]') as HTMLElement;
    planBtn.click();
    expect(container.querySelector('[data-plan-content="alert-1"]')).toBeTruthy();

    // Close plan
    const planBtn2 = container.querySelector('[data-plan-id="alert-1"]') as HTMLElement;
    planBtn2.click();
    expect(container.querySelector('[data-plan-content="alert-1"]')).toBeNull();
  });

  it('should reduce active count after acknowledgment', () => {
    const container = createContainer();
    const panel = new DeclineAlertsPanel(container, createDeclineAlertsData());
    panel.mount();

    expect(container.querySelector('.decline-alerts__count')?.textContent).toContain('2 active');

    const ackBtn = container.querySelector('[data-acknowledge-id="alert-1"]') as HTMLElement;
    ackBtn.click();

    expect(container.querySelector('.decline-alerts__count')?.textContent).toContain('1 active');
  });
});
