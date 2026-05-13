/**
 * PresenceIndicator — Agent presence status indicator component.
 *
 * Displays the real-time status of an agent (idle, working, thinking, etc.)
 * with visual indicators and optional task description.
 *
 * Requirements: 37e.15, 37e.16
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentPresenceStatus =
  | 'idle'
  | 'working'
  | 'waiting_input'
  | 'thinking'
  | 'parallel_processing'
  | 'degraded';

export interface PresenceIndicatorProps {
  agentId: string;
  status: AgentPresenceStatus;
  currentTask?: string;
  parallelTaskCount?: number;
  queueDepth?: number;
}

// ---------------------------------------------------------------------------
// Status display mapping
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<AgentPresenceStatus, { label: string; color: string; icon: string }> = {
  idle: { label: 'Idle', color: '#6b7280', icon: '⚪' },
  working: { label: 'Working', color: '#10b981', icon: '🟢' },
  waiting_input: { label: 'Waiting for Input', color: '#f59e0b', icon: '🟡' },
  thinking: { label: 'Thinking', color: '#3b82f6', icon: '🔵' },
  parallel_processing: { label: 'Parallel Processing', color: '#8b5cf6', icon: '🟣' },
  degraded: { label: 'Degraded', color: '#ef4444', icon: '🔴' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class PresenceIndicator {
  private container: HTMLElement;
  private props: PresenceIndicatorProps;

  constructor(container: HTMLElement, props: PresenceIndicatorProps) {
    this.container = container;
    this.props = props;
    this.render();
  }

  /** Update the presence status. */
  updateStatus(status: AgentPresenceStatus, details?: { currentTask?: string; parallelTaskCount?: number }): void {
    this.props.status = status;
    if (details?.currentTask !== undefined) this.props.currentTask = details.currentTask;
    if (details?.parallelTaskCount !== undefined) this.props.parallelTaskCount = details.parallelTaskCount;
    this.render();
  }

  /** Update the queue depth display. */
  setQueueDepth(depth: number): void {
    this.props.queueDepth = depth;
    this.render();
  }

  /** Get the current status. */
  getStatus(): AgentPresenceStatus {
    return this.props.status;
  }

  /** Render the presence indicator. */
  render(): void {
    const { status, currentTask, parallelTaskCount, queueDepth } = this.props;
    const display = STATUS_DISPLAY[status];

    const taskInfo = currentTask
      ? `<span class="presence-task" title="${currentTask}">${currentTask}</span>`
      : '';

    const parallelInfo =
      parallelTaskCount && parallelTaskCount > 1
        ? `<span class="presence-parallel">(${parallelTaskCount} tasks)</span>`
        : '';

    const queueInfo =
      queueDepth !== undefined && queueDepth > 0
        ? `<span class="presence-queue">${queueDepth} queued</span>`
        : '';

    this.container.innerHTML = `
      <div class="presence-indicator presence-indicator--${status}" role="status" aria-label="Agent status: ${display.label}">
        <span class="presence-icon">${display.icon}</span>
        <span class="presence-label" style="color: ${display.color}">${display.label}</span>
        ${taskInfo}
        ${parallelInfo}
        ${queueInfo}
      </div>
    `;
  }

  /** Destroy the component. */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
