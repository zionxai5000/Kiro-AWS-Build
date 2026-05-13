/**
 * ExecutionTraceView — Displays execution traces for agent actions.
 * Shows timeline of: plan → tools → memory → governance → actions → results.
 *
 * Requirements: 49.4, 50.6, 52.6, 54.3
 */

export interface TraceStep {
  type: 'memory' | 'governance' | 'budget' | 'tool' | 'delegation' | 'action' | 'synthesis';
  label: string;
  detail: string;
  success: boolean;
  durationMs?: number;
}

export interface TraceViewData {
  traceId: string;
  agentName: string;
  taskId: string;
  autonomyMode: string;
  envelopeHash: string;
  success: boolean;
  totalDurationMs: number;
  steps: TraceStep[];
}

export class ExecutionTraceView {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(data: TraceViewData): void {
    this.container.innerHTML = `
      <div class="execution-trace" role="region" aria-label="Execution Trace for ${this.escapeHtml(data.agentName)}">
        <div class="trace-header">
          <h3>Execution Trace</h3>
          <div class="trace-meta">
            <span class="trace-agent">${this.escapeHtml(data.agentName)}</span>
            <span class="trace-mode">${this.escapeHtml(data.autonomyMode)}</span>
            <span class="trace-duration">${data.totalDurationMs}ms</span>
            <span class="trace-status trace-status--${data.success ? 'success' : 'failed'}" aria-label="${data.success ? 'Succeeded' : 'Failed'}">${data.success ? '✓' : '✗'}</span>
          </div>
        </div>
        <div class="trace-timeline" role="list" aria-label="Trace steps">
          ${data.steps.map((step, i) => `
            <div class="trace-step trace-step--${this.escapeHtml(step.type)} trace-step--${step.success ? 'pass' : 'fail'}" role="listitem">
              <div class="trace-step-marker" aria-hidden="true">${i + 1}</div>
              <div class="trace-step-content">
                <div class="trace-step-label">${this.escapeHtml(step.label)}</div>
                <div class="trace-step-detail">${this.escapeHtml(step.detail)}</div>
                ${step.durationMs !== undefined ? `<div class="trace-step-duration">${step.durationMs}ms</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="trace-footer">
          <span class="trace-hash">Envelope: ${this.escapeHtml(data.envelopeHash)}</span>
        </div>
      </div>
    `;
  }

  clear(): void {
    this.container.innerHTML = '';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
