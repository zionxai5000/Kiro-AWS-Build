/**
 * Unit tests for ZionX App Studio — Visual Pipeline Board
 *
 * Validates: Requirements 11.1, 11.2, 2.1
 *
 * Tests pipeline rendering, gate checkpoints, click-to-expand,
 * state transitions, and drag-and-drop reorder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VisualPipelineBoard,
  type VisualPipelineBoardData,
  type PipelineApp,
  type PipelineStage,
} from './VisualPipelineBoard.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createTestApp(overrides?: Partial<PipelineApp>): PipelineApp {
  return {
    id: 'app-1',
    name: 'Test App',
    stage: 'development',
    daysInStage: 5,
    gateCheck: { passed: 67, total: 70, warnings: 3 },
    health: 'healthy',
    priority: 1,
    ...overrides,
  };
}

function createTestData(overrides?: Partial<VisualPipelineBoardData>): VisualPipelineBoardData {
  return {
    apps: [
      createTestApp({ id: 'app-1', name: 'ZenFocus', stage: 'development', priority: 1 }),
      createTestApp({ id: 'app-2', name: 'PetPal', stage: 'testing', priority: 1 }),
      createTestApp({ id: 'app-3', name: 'BudgetBuddy', stage: 'live', priority: 1, health: 'warning' }),
      createTestApp({ id: 'app-4', name: 'MealPrep', stage: 'development', priority: 2 }),
    ],
    gateCheckpoints: [
      { afterStage: 'testing', passCount: 12, failCount: 2 },
      { afterStage: 'gate_review', passCount: 8, failCount: 0 },
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
// Pipeline Renders All Stage Columns with Correct App Cards
// ---------------------------------------------------------------------------

describe('VisualPipelineBoard — Rendering', () => {
  it('should render all 10 stage columns', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const columns = container.querySelectorAll('.pipeline-board__column');
    expect(columns.length).toBe(10);
  });

  it('should render column titles for all stages', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const titles = Array.from(container.querySelectorAll('.pipeline-board__column-title'))
      .map((el) => el.textContent);
    expect(titles).toContain('Ideation');
    expect(titles).toContain('Development');
    expect(titles).toContain('Testing');
    expect(titles).toContain('Live');
    expect(titles).toContain('Revenue Optimizing');
  });

  it('should render app cards in correct columns', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const devColumn = container.querySelector('[data-stage="development"]');
    const devCards = devColumn?.querySelectorAll('[data-app-id]');
    expect(devCards?.length).toBe(2);

    const testColumn = container.querySelector('[data-stage="testing"]');
    const testCards = testColumn?.querySelectorAll('[data-app-id]');
    expect(testCards?.length).toBe(1);
  });

  it('should show app name, days in stage, and gate check on cards', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const card = container.querySelector('[data-app-id="app-1"]');
    expect(card?.querySelector('.pipeline-board__card-name')?.textContent).toBe('ZenFocus');
    expect(card?.querySelector('.pipeline-board__card-days')?.textContent).toBe('5d');
    expect(card?.querySelector('.pipeline-board__card-gate')?.textContent).toContain('67/70 passed');
  });

  it('should show health indicator on cards', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const healthyCard = container.querySelector('[data-app-id="app-1"]');
    expect(healthyCard?.querySelector('.pipeline-board__health--healthy')).toBeTruthy();

    const warningCard = container.querySelector('[data-app-id="app-3"]');
    expect(warningCard?.querySelector('.pipeline-board__health--warning')).toBeTruthy();
  });

  it('should show column counts', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const devColumn = container.querySelector('[data-stage="development"]');
    expect(devColumn?.querySelector('.pipeline-board__column-count')?.textContent).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// Gate Checkpoint Markers Show Pass/Fail Counts
// ---------------------------------------------------------------------------

describe('VisualPipelineBoard — Gate Checkpoints', () => {
  it('should render gate checkpoints after specified stages', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const gates = container.querySelectorAll('.pipeline-board__gate');
    expect(gates.length).toBe(2);
  });

  it('should show pass and fail counts on gate checkpoints', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const gate = container.querySelector('[data-gate-after="testing"]');
    expect(gate?.querySelector('.pipeline-board__gate-pass')?.textContent).toContain('12');
    expect(gate?.querySelector('.pipeline-board__gate-fail')?.textContent).toContain('2');
  });
});

// ---------------------------------------------------------------------------
// App Card Click Expands to Detail View
// ---------------------------------------------------------------------------

describe('VisualPipelineBoard — Click to Expand', () => {
  it('should expand card on click showing details', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const card = container.querySelector('[data-app-id="app-1"]') as HTMLElement;
    card.click();

    const expandedCard = container.querySelector('[data-app-id="app-1"]');
    expect(expandedCard?.classList.contains('pipeline-board__card--expanded')).toBe(true);
    expect(expandedCard?.querySelector('.pipeline-board__card-details')).toBeTruthy();
  });

  it('should collapse card on second click', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const card = container.querySelector('[data-app-id="app-1"]') as HTMLElement;
    card.click(); // expand
    card.click(); // collapse — need to re-query after re-render

    const collapsedCard = container.querySelector('[data-app-id="app-1"]');
    expect(collapsedCard?.classList.contains('pipeline-board__card--expanded')).toBe(false);
  });

  it('should call onAppClick callback when card is clicked', () => {
    const onAppClick = vi.fn();
    const board = new VisualPipelineBoard(container, createTestData(), { onAppClick });
    board.mount();

    const card = container.querySelector('[data-app-id="app-2"]') as HTMLElement;
    card.click();

    expect(onAppClick).toHaveBeenCalledWith('app-2');
  });
});

// ---------------------------------------------------------------------------
// Cards Move Between Columns on State Transition
// ---------------------------------------------------------------------------

describe('VisualPipelineBoard — State Transitions', () => {
  it('should move card to new column when stage changes via update', () => {
    const data = createTestData();
    const board = new VisualPipelineBoard(container, data);
    board.mount();

    // Verify app-2 is in testing
    let testColumn = container.querySelector('[data-stage="testing"]');
    expect(testColumn?.querySelector('[data-app-id="app-2"]')).toBeTruthy();

    // Update: move app-2 to gate_review
    const updatedData = createTestData({
      apps: data.apps.map((a) =>
        a.id === 'app-2' ? { ...a, stage: 'gate_review' as PipelineStage } : a
      ),
    });
    board.update(updatedData);

    testColumn = container.querySelector('[data-stage="testing"]');
    expect(testColumn?.querySelector('[data-app-id="app-2"]')).toBeNull();

    const gateColumn = container.querySelector('[data-stage="gate_review"]');
    expect(gateColumn?.querySelector('[data-app-id="app-2"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Drag-and-Drop Reorders Within a Column
// ---------------------------------------------------------------------------

describe('VisualPipelineBoard — Drag and Drop', () => {
  it('should have draggable attribute on cards', () => {
    const board = new VisualPipelineBoard(container, createTestData());
    board.mount();

    const cards = container.querySelectorAll('[data-app-id]');
    cards.forEach((card) => {
      expect(card.getAttribute('draggable')).toBe('true');
    });
  });

  it('should call onReorder when drop occurs in same column', () => {
    const onReorder = vi.fn();
    const board = new VisualPipelineBoard(container, createTestData(), { onReorder });
    board.mount();

    // Simulate drag start on app-1
    const card = container.querySelector('[data-app-id="app-1"]') as HTMLElement;
    const dragStartEvent = new Event('dragstart') as any;
    dragStartEvent.dataTransfer = { setData: vi.fn() };
    card.dispatchEvent(dragStartEvent);

    // Simulate drop on development column
    const devDropZone = container.querySelector('[data-drop-stage="development"]') as HTMLElement;
    const dropEvent = new Event('drop') as any;
    dropEvent.preventDefault = vi.fn();
    devDropZone.dispatchEvent(dropEvent);

    expect(onReorder).toHaveBeenCalledWith('development', expect.any(Array));
  });
});
