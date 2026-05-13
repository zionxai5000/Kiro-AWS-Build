/**
 * ZionX App Development Studio — Testing Panel Component
 *
 * Displays unit test, UI test, and accessibility results with pass/fail indicators.
 * Includes design quality score visualization (progress bar), store readiness
 * checklist with gate status, and a "Run Tests" button.
 *
 * Requirements: 42f.16, 42f.17, 42f.18
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'running' | 'pending';
export type GateStatus = 'pass' | 'fail' | 'pending' | 'not-started';

export interface TestResultItem {
  name: string;
  status: TestStatus;
  duration?: number;
  error?: string;
}

export interface TestSuite {
  name: string;
  type: 'unit' | 'ui' | 'accessibility';
  results: TestResultItem[];
}

export interface ReadinessGate {
  id: string;
  label: string;
  status: GateStatus;
  detail?: string;
}

export interface TestingPanelProps {
  suites: TestSuite[];
  designQualityScore: number;
  readinessGates: ReadinessGate[];
  isRunning: boolean;
  onRunTests?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<TestStatus, string> = {
  passed: '✅',
  failed: '❌',
  skipped: '⏭️',
  running: '🔄',
  pending: '⏳',
};

const GATE_ICONS: Record<GateStatus, string> = {
  pass: '✅',
  fail: '❌',
  pending: '⏳',
  'not-started': '⬜',
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function renderTestSuite(suite: TestSuite): string {
  const passed = suite.results.filter((r) => r.status === 'passed').length;
  const total = suite.results.length;

  const resultsHtml = suite.results
    .map(
      (result) => `
      <div class="testing-panel__result" data-status="${result.status}">
        <span class="testing-panel__result-icon">${STATUS_ICONS[result.status]}</span>
        <span class="testing-panel__result-name">${result.name}</span>
        ${result.duration !== undefined ? `<span class="testing-panel__result-duration">${result.duration}ms</span>` : ''}
        ${result.error ? `<span class="testing-panel__result-error">${result.error}</span>` : ''}
      </div>
    `,
    )
    .join('');

  return `
    <div class="testing-panel__suite" data-suite-type="${suite.type}">
      <div class="testing-panel__suite-header">
        <span class="testing-panel__suite-name">${suite.name}</span>
        <span class="testing-panel__suite-count">${passed}/${total}</span>
      </div>
      <div class="testing-panel__suite-results">
        ${resultsHtml}
      </div>
    </div>
  `;
}

function renderDesignQualityScore(score: number): string {
  const percentage = Math.min(100, Math.max(0, score));
  const color =
    percentage >= 80 ? 'var(--color-success, #22c55e)' :
    percentage >= 60 ? 'var(--color-warning, #f59e0b)' :
    'var(--color-error, #ef4444)';

  return `
    <div class="testing-panel__quality-score">
      <div class="testing-panel__quality-header">
        <span class="testing-panel__quality-label">Design Quality Score</span>
        <span class="testing-panel__quality-value">${percentage}%</span>
      </div>
      <div class="testing-panel__progress-bar">
        <div class="testing-panel__progress-fill" style="width: ${percentage}%; background-color: ${color};"></div>
      </div>
    </div>
  `;
}

function renderReadinessChecklist(gates: ReadinessGate[]): string {
  const gatesHtml = gates
    .map(
      (gate) => `
      <div class="testing-panel__gate" data-gate-status="${gate.status}">
        <span class="testing-panel__gate-icon">${GATE_ICONS[gate.status]}</span>
        <span class="testing-panel__gate-label">${gate.label}</span>
        ${gate.detail ? `<span class="testing-panel__gate-detail">${gate.detail}</span>` : ''}
      </div>
    `,
    )
    .join('');

  return `
    <div class="testing-panel__readiness">
      <h4 class="testing-panel__readiness-title">Store Readiness</h4>
      <div class="testing-panel__gates">
        ${gatesHtml}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the testing panel as an HTML string.
 */
export function renderTestingPanel(props: TestingPanelProps): string {
  const suitesHtml = props.suites.map(renderTestSuite).join('');

  return `
    <div class="studio-testing-panel">
      <div class="testing-panel__header">
        <h3 class="testing-panel__title">Testing</h3>
        <button
          class="testing-panel__run-btn"
          data-run-tests
          ${props.isRunning ? 'disabled' : ''}
        >
          ${props.isRunning ? '🔄 Running...' : '▶ Run Tests'}
        </button>
      </div>
      <div class="testing-panel__suites">
        ${suitesHtml}
      </div>
      ${renderDesignQualityScore(props.designQualityScore)}
      ${renderReadinessChecklist(props.readinessGates)}
    </div>
  `;
}

/**
 * Creates a DOM element for the testing panel.
 */
export function createTestingPanelElement(props: TestingPanelProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderTestingPanel(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches event listeners for the Run Tests button.
 */
export function attachTestingPanelListeners(
  root: HTMLElement,
  props: TestingPanelProps,
): void {
  const runBtn = root.querySelector<HTMLButtonElement>('[data-run-tests]');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      props.onRunTests?.();
    });
  }
}
