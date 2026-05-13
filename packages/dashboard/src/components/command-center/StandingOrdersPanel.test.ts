/**
 * Unit tests for Eretz Command Center — Standing Orders Panel
 *
 * Validates: Requirements 46j.24, 46g.15
 *
 * Tests panel rendering, add/modify/cancel orders,
 * completion tracking, and history section.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StandingOrdersPanel,
  type StandingOrdersPanelData,
  type StandingOrder,
} from './StandingOrdersPanel.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestData(overrides?: Partial<StandingOrdersPanelData>): StandingOrdersPanelData {
  return {
    orders: [
      {
        id: 'ord-1',
        text: 'Maintain 95% uptime across all apps',
        assignedAgent: 'ZionX Monitor',
        status: 'active',
        progress: 78,
        createdAt: new Date(Date.now() - 604800000).toISOString(),
        lastActivityAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'ord-2',
        text: 'Publish 3 videos per channel per week',
        assignedAgent: 'ZXMG Producer',
        status: 'active',
        progress: 45,
        createdAt: new Date(Date.now() - 1209600000).toISOString(),
        lastActivityAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'ord-3',
        text: 'Complete market research for Q2',
        assignedAgent: 'Market Scanner',
        status: 'completed',
        progress: 100,
        createdAt: new Date(Date.now() - 2592000000).toISOString(),
        completedAt: new Date(Date.now() - 86400000).toISOString(),
        lastActivityAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    availableAgents: ['ZionX Monitor', 'ZXMG Producer', 'Market Scanner', 'Zion Alpha Trader'],
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
// Panel Renders Active Orders with Correct Status and Agent
// ---------------------------------------------------------------------------

describe('StandingOrdersPanel — Rendering', () => {
  it('should render panel with title', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    expect(container.querySelector('.standing-orders__title')?.textContent).toContain('Standing Orders');
  });

  it('should render active orders', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const orders = container.querySelectorAll('.standing-orders__order');
    expect(orders.length).toBe(2); // 2 active orders
  });

  it('should show order text and assigned agent', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const firstOrder = container.querySelector('[data-order-id="ord-1"]');
    expect(firstOrder?.querySelector('.standing-orders__order-text')?.textContent).toContain('Maintain 95% uptime');
    expect(firstOrder?.querySelector('.standing-orders__order-agent')?.textContent).toBe('ZionX Monitor');
  });

  it('should show order status', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const firstOrder = container.querySelector('[data-order-id="ord-1"]');
    expect(firstOrder?.querySelector('.standing-orders__order-status--active')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Add New Order Creates Entry with Correct Metadata
// ---------------------------------------------------------------------------

describe('StandingOrdersPanel — Add Order', () => {
  it('should show add form when New Order button is clicked', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const addBtn = container.querySelector('[data-action="show-add"]') as HTMLElement;
    addBtn.click();

    expect(container.querySelector('.standing-orders__add-form')).toBeTruthy();
  });

  it('should call onAddOrder with text and agent when submitted', () => {
    const onAddOrder = vi.fn();
    const panel = new StandingOrdersPanel(container, createTestData(), { onAddOrder });
    panel.mount();

    // Show form
    const addBtn = container.querySelector('[data-action="show-add"]') as HTMLElement;
    addBtn.click();

    // Fill form
    const textInput = container.querySelector('#new-order-text') as HTMLTextAreaElement;
    textInput.value = 'New standing order';
    const agentSelect = container.querySelector('#new-order-agent') as HTMLSelectElement;
    agentSelect.value = 'ZionX Monitor';

    // Submit
    const submitBtn = container.querySelector('[data-action="submit-add"]') as HTMLElement;
    submitBtn.click();

    expect(onAddOrder).toHaveBeenCalledWith('New standing order', 'ZionX Monitor');
  });

  it('should hide form after cancel', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const addBtn = container.querySelector('[data-action="show-add"]') as HTMLElement;
    addBtn.click();
    expect(container.querySelector('.standing-orders__add-form')).toBeTruthy();

    const cancelBtn = container.querySelector('[data-action="cancel-add"]') as HTMLElement;
    cancelBtn.click();
    expect(container.querySelector('.standing-orders__add-form')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Modify Updates Order Text
// ---------------------------------------------------------------------------

describe('StandingOrdersPanel — Modify Order', () => {
  it('should show edit form when modify button is clicked', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const modifyBtn = container.querySelector('[data-modify-id="ord-1"]') as HTMLElement;
    modifyBtn.click();

    expect(container.querySelector('[data-edit-id="ord-1"]')).toBeTruthy();
  });

  it('should call onModifyOrder with new text when saved', () => {
    const onModifyOrder = vi.fn();
    const panel = new StandingOrdersPanel(container, createTestData(), { onModifyOrder });
    panel.mount();

    // Open edit
    const modifyBtn = container.querySelector('[data-modify-id="ord-1"]') as HTMLElement;
    modifyBtn.click();

    // Change text
    const textInput = container.querySelector('#edit-order-text-ord-1') as HTMLTextAreaElement;
    textInput.value = 'Updated order text';

    // Save
    const saveBtn = container.querySelector('[data-action="submit-edit"]') as HTMLElement;
    saveBtn.click();

    expect(onModifyOrder).toHaveBeenCalledWith('ord-1', 'Updated order text');
  });
});

// ---------------------------------------------------------------------------
// Cancel Marks Order as Cancelled (Not Deleted)
// ---------------------------------------------------------------------------

describe('StandingOrdersPanel — Cancel Order', () => {
  it('should call onCancelOrder when cancel button is clicked', () => {
    const onCancelOrder = vi.fn();
    const panel = new StandingOrdersPanel(container, createTestData(), { onCancelOrder });
    panel.mount();

    const cancelBtn = container.querySelector('[data-cancel-id="ord-1"]') as HTMLElement;
    cancelBtn.click();

    expect(onCancelOrder).toHaveBeenCalledWith('ord-1');
  });

  it('should move cancelled order to cancelled section', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const cancelBtn = container.querySelector('[data-cancel-id="ord-1"]') as HTMLElement;
    cancelBtn.click();

    // Should now appear in cancelled section
    expect(container.querySelector('.standing-orders__cancelled')).toBeTruthy();
    // Should no longer be in active orders
    const activeOrders = container.querySelectorAll('.standing-orders__order');
    const activeIds = Array.from(activeOrders).map((el) => (el as HTMLElement).dataset.orderId);
    expect(activeIds).not.toContain('ord-1');
  });
});

// ---------------------------------------------------------------------------
// Completion Tracking Shows Progress Percentage
// ---------------------------------------------------------------------------

describe('StandingOrdersPanel — Completion Tracking', () => {
  it('should show progress percentage for active orders', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const firstOrder = container.querySelector('[data-order-id="ord-1"]');
    const progress = firstOrder?.querySelector('.standing-orders__progress-label');
    expect(progress?.textContent).toContain('78%');
  });

  it('should render progress bar with correct width', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const firstOrder = container.querySelector('[data-order-id="ord-1"]');
    const fill = firstOrder?.querySelector('.standing-orders__progress-fill') as HTMLElement;
    expect(fill?.style.width).toBe('78%');
  });
});

// ---------------------------------------------------------------------------
// Completed Orders Move to History Section
// ---------------------------------------------------------------------------

describe('StandingOrdersPanel — Completed Orders', () => {
  it('should show completed orders in separate section', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const completedSection = container.querySelector('.standing-orders__completed');
    expect(completedSection).toBeTruthy();
    expect(completedSection?.textContent).toContain('Complete market research');
  });

  it('should show completion date for completed orders', () => {
    const panel = new StandingOrdersPanel(container, createTestData());
    panel.mount();

    const completedSection = container.querySelector('.standing-orders__completed');
    const dateEl = completedSection?.querySelector('.standing-orders__history-date');
    expect(dateEl?.textContent).toBeTruthy();
  });
});
