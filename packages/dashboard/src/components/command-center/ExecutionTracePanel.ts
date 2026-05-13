/**
 * ExecutionTracePanel — Displays execution traces for agent actions.
 * Shows timeline of: plan → tools → memory → governance → actions → results.
 *
 * Requirements: 49.4, 50.6, 52.6, 54.3
 */

export interface ExecutionTraceData {
  id: string;
  agentId: string;
  agentName: string;
  taskId: string;
  timestamp: string;
  durationMs: number;
  autonomyMode: 'crawl' | 'walk' | 'run';

  steps: Array<{
    type: 'plan' | 'memory' | 'governance' | 'budget' | 'tool' | 'delegation' | 'synthesis';
    label: string;
    detail: string;
    status: 'success' | 'failed' | 'skipped' | 'blocked';
    durationMs: number;
  }>;

  degradedComponents: string[];
  envelopeHash: string;
}

export class ExecutionTracePanel {
  private container: HTMLElement;
  private traces: ExecutionTraceData[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setTraces(traces: ExecutionTraceData[]): void {
    this.traces = traces;
    this.render();
  }

  private render(): void {
    if (this.traces.length === 0) {
      this.container.innerHTML = '<div class="trace-empty">No execution traces available.</div>';
      return;
    }

    this.container.innerHTML = `
      <div class="execution-traces">
        <h3 class="traces-title">Execution Traces</h3>
        ${this.traces.map(trace => this.renderTrace(trace)).join('')}
      </div>
    `;
  }

  private renderTrace(trace: ExecutionTraceData): string {
    const modeColors: Record<string, string> = { crawl: '#fbbf24', walk: '#60a5fa', run: '#34d399' };
    const modeColor = modeColors[trace.autonomyMode] || '#8b90a5';

    return `
      <div class="trace-card">
        <div class="trace-header">
          <span class="trace-agent">${trace.agentName}</span>
          <span class="trace-mode" style="color: ${modeColor}">${trace.autonomyMode.toUpperCase()}</span>
          <span class="trace-duration">${trace.durationMs}ms</span>
          <span class="trace-time">${new Date(trace.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="trace-timeline">
          ${trace.steps.map(step => `
            <div class="trace-step trace-step--${step.status}">
              <span class="trace-step-icon">${this.getStepIcon(step.type)}</span>
              <span class="trace-step-label">${step.label}</span>
              <span class="trace-step-detail">${step.detail}</span>
              <span class="trace-step-duration">${step.durationMs}ms</span>
            </div>
          `).join('')}
        </div>
        ${trace.degradedComponents.length > 0 ? `
          <div class="trace-degraded">⚠️ Degraded: ${trace.degradedComponents.join(', ')}</div>
        ` : ''}
        <div class="trace-hash">Envelope: ${trace.envelopeHash}</div>
      </div>
    `;
  }

  private getStepIcon(type: string): string {
    const icons: Record<string, string> = {
      plan: '📋', memory: '🧠', governance: '🛡️', budget: '💰',
      tool: '🔧', delegation: '→', synthesis: '✨',
    };
    return icons[type] || '•';
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
