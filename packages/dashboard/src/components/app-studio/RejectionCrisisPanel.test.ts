/**
 * Unit tests for ZionX App Studio — Rejection Crisis Panel
 *
 * Validates: Requirements 11.3, 11.4, 2.3
 *
 * Tests crisis panel activation, rejection display, fix checklist,
 * resubmission timeline, panel hiding, and historical rejections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RejectionCrisisPanel,
  type RejectionCrisisPanelData,
  type RejectedApp,
} from './RejectionCrisisPanel.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestData(overrides?: Partial<RejectionCrisisPanelData>): RejectionCrisisPanelData {
  return {
    activeRejections: [
      {
        id: 'rej-1',
        appName: 'ZenFocus',
        rejectionReason: 'Guideline 4.3 - Spam: duplicate app functionality',
        rootCause: 'App description too similar to existing timer apps',
        issues: [
          { id: 'issue-1', description: 'Update app description', status: 'fixed' },
          { id: 'issue-2', description: 'Add unique feature screenshots', status: 'in_progress' },
          { id: 'issue-3', description: 'Differentiate UI from competitors', status: 'pending' },
        ],
        rejectedAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        estimatedResubmissionDays: 5,
      },
    ],
    historicalRejections: [
      {
        id: 'hist-1',
        appName: 'PetPal',
        reason: 'Missing privacy policy',
        rejectedAt: new Date(Date.now() - 604800000).toISOString(),
        resolvedAt: new Date(Date.now() - 432000000).toISOString(),
        resolutionDays: 2,
      },
    ],
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
// Crisis Panel Appears When App Enters Rejected State
// ---------------------------------------------------------------------------

describe('RejectionCrisisPanel — Activation', () => {
  it('should render crisis panel when active rejections exist', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    expect(container.querySelector('.rejection-crisis')).toBeTruthy();
    expect(container.querySelector('.rejection-crisis__title')?.textContent).toContain('Rejection Crisis');
  });

  it('should show count of rejected apps', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    expect(container.querySelector('.rejection-crisis__count')?.textContent).toContain('1 app rejected');
  });
});

// ---------------------------------------------------------------------------
// Rejection Reason and Root Cause Display
// ---------------------------------------------------------------------------

describe('RejectionCrisisPanel — Rejection Details', () => {
  it('should display rejection reason', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const reason = container.querySelector('.rejection-crisis__reason-text');
    expect(reason?.textContent).toContain('Guideline 4.3');
  });

  it('should display root cause analysis', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const rootCause = container.querySelector('.rejection-crisis__root-cause-text');
    expect(rootCause?.textContent).toContain('App description too similar');
  });
});

// ---------------------------------------------------------------------------
// Fix Checklist Tracks Progress Per Issue
// ---------------------------------------------------------------------------

describe('RejectionCrisisPanel — Fix Checklist', () => {
  it('should render all issues in checklist', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const issues = container.querySelectorAll('.rejection-crisis__issue');
    expect(issues.length).toBe(3);
  });

  it('should show correct status for each issue', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const statuses = container.querySelectorAll('.rejection-crisis__issue-status');
    expect(statuses[0]?.textContent).toContain('Fixed');
    expect(statuses[1]?.textContent).toContain('In Progress');
    expect(statuses[2]?.textContent).toContain('Pending');
  });

  it('should show fix progress percentage', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const progress = container.querySelector('.rejection-crisis__progress-label');
    // 1 fixed out of 3 = 33%
    expect(progress?.textContent).toContain('1/3');
    expect(progress?.textContent).toContain('33%');
  });

  it('should advance issue status on click', () => {
    const onFixStatusChange = vi.fn();
    const panel = new RejectionCrisisPanel(container, createTestData(), { onFixStatusChange });
    panel.mount();

    // Click the pending issue to advance to in_progress
    const pendingIssue = container.querySelector('[data-issue-id="issue-3"]') as HTMLElement;
    pendingIssue.click();

    expect(onFixStatusChange).toHaveBeenCalledWith('rej-1', 'issue-3', 'in_progress');
  });
});

// ---------------------------------------------------------------------------
// Resubmission Timeline Estimate
// ---------------------------------------------------------------------------

describe('RejectionCrisisPanel — Resubmission Timeline', () => {
  it('should display estimated resubmission days', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const timeline = container.querySelector('.rejection-crisis__timeline-value');
    expect(timeline?.textContent).toContain('5 days');
  });

  it('should disable resubmit button when not all issues are fixed', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const btn = container.querySelector('[data-resubmit-id]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('should enable resubmit button when all issues are fixed/verified', () => {
    const data = createTestData({
      activeRejections: [{
        id: 'rej-1',
        appName: 'ZenFocus',
        rejectionReason: 'Test',
        rootCause: 'Test',
        issues: [
          { id: 'i1', description: 'Fix 1', status: 'verified' },
          { id: 'i2', description: 'Fix 2', status: 'fixed' },
        ],
        rejectedAt: new Date().toISOString(),
        estimatedResubmissionDays: 1,
      }],
    });
    const panel = new RejectionCrisisPanel(container, data);
    panel.mount();

    const btn = container.querySelector('[data-resubmit-id]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('should call onResubmit when resubmit button is clicked', () => {
    const onResubmit = vi.fn();
    const data = createTestData({
      activeRejections: [{
        id: 'rej-1',
        appName: 'ZenFocus',
        rejectionReason: 'Test',
        rootCause: 'Test',
        issues: [{ id: 'i1', description: 'Fix 1', status: 'fixed' }],
        rejectedAt: new Date().toISOString(),
        estimatedResubmissionDays: 1,
      }],
    });
    const panel = new RejectionCrisisPanel(container, data, { onResubmit });
    panel.mount();

    const btn = container.querySelector('[data-resubmit-id]') as HTMLButtonElement;
    btn.click();

    expect(onResubmit).toHaveBeenCalledWith('rej-1');
  });
});

// ---------------------------------------------------------------------------
// Panel Hides When No Apps Are Rejected
// ---------------------------------------------------------------------------

describe('RejectionCrisisPanel — Hidden State', () => {
  it('should render nothing when no active rejections', () => {
    const data = createTestData({ activeRejections: [] });
    const panel = new RejectionCrisisPanel(container, data);
    panel.mount();

    expect(container.querySelector('.rejection-crisis')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('should hide panel when rejections are resolved via update', () => {
    const data = createTestData();
    const panel = new RejectionCrisisPanel(container, data);
    panel.mount();

    expect(container.querySelector('.rejection-crisis')).toBeTruthy();

    panel.update({ activeRejections: [], historicalRejections: [] });
    expect(container.querySelector('.rejection-crisis')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Historical Rejections Display
// ---------------------------------------------------------------------------

describe('RejectionCrisisPanel — Historical Rejections', () => {
  it('should display historical rejections with resolution times', () => {
    const panel = new RejectionCrisisPanel(container, createTestData());
    panel.mount();

    const historyRows = container.querySelectorAll('.rejection-crisis__history-row');
    expect(historyRows.length).toBe(1);

    expect(historyRows[0].querySelector('.rejection-crisis__history-app')?.textContent).toBe('PetPal');
    expect(historyRows[0].querySelector('.rejection-crisis__history-resolution')?.textContent).toBe('2d');
  });
});
