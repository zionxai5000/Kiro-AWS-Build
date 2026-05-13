/**
 * ZionX App Studio — Visual Pipeline Board
 *
 * Horizontal Kanban-style pipeline visualization showing app progression
 * through stages: Ideation → Market Research → Development → Testing →
 * Gate Review → Submission → In Review → Live → Marketing → Revenue Optimizing
 *
 * Features: app cards with name/days-in-stage/gate-check/health,
 * gate checkpoint markers, click-to-expand, drag-and-drop reorder.
 *
 * Requirements: 11.1, 11.2, 2.1
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStage =
  | 'ideation'
  | 'market_research'
  | 'development'
  | 'testing'
  | 'gate_review'
  | 'submission'
  | 'in_review'
  | 'live'
  | 'marketing'
  | 'revenue_optimizing';

export type HealthIndicator = 'healthy' | 'warning' | 'critical';

export interface GateCheckStatus {
  passed: number;
  total: number;
  warnings: number;
}

export interface PipelineApp {
  id: string;
  name: string;
  stage: PipelineStage;
  daysInStage: number;
  gateCheck: GateCheckStatus;
  health: HealthIndicator;
  priority: number;
}

export interface GateCheckpoint {
  afterStage: PipelineStage;
  passCount: number;
  failCount: number;
}

export interface VisualPipelineBoardData {
  apps: PipelineApp[];
  gateCheckpoints: GateCheckpoint[];
}

export interface VisualPipelineBoardOptions {
  onAppClick?: (appId: string) => void;
  onReorder?: (stage: PipelineStage, appIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_ORDER: PipelineStage[] = [
  'ideation',
  'market_research',
  'development',
  'testing',
  'gate_review',
  'submission',
  'in_review',
  'live',
  'marketing',
  'revenue_optimizing',
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  ideation: 'Ideation',
  market_research: 'Market Research',
  development: 'Development',
  testing: 'Testing',
  gate_review: 'Gate Review',
  submission: 'Submission',
  in_review: 'In Review',
  live: 'Live',
  marketing: 'Marketing',
  revenue_optimizing: 'Revenue Optimizing',
};

// ---------------------------------------------------------------------------
// VisualPipelineBoard
// ---------------------------------------------------------------------------

export class VisualPipelineBoard {
  private container: HTMLElement;
  private data: VisualPipelineBoardData;
  private options: VisualPipelineBoardOptions;
  private expandedAppId: string | null = null;
  private draggedAppId: string | null = null;

  constructor(container: HTMLElement, data: VisualPipelineBoardData, options: VisualPipelineBoardOptions = {}) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: VisualPipelineBoardData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="pipeline-board" role="region" aria-label="Visual Pipeline Board">
        <div class="pipeline-board__header">
          <h3 class="pipeline-board__title">📊 App Pipeline</h3>
          <span class="pipeline-board__count">${this.data.apps.length} apps in pipeline</span>
        </div>
        <div class="pipeline-board__columns">
          ${STAGE_ORDER.map((stage, idx) => this.renderColumn(stage, idx)).join('')}
        </div>
      </div>
    `;
  }

  private renderColumn(stage: PipelineStage, index: number): string {
    const apps = this.data.apps
      .filter((a) => a.stage === stage)
      .sort((a, b) => a.priority - b.priority);

    const checkpoint = this.data.gateCheckpoints.find((g) => g.afterStage === stage);

    return `
      <div class="pipeline-board__column" data-stage="${stage}">
        <div class="pipeline-board__column-header">
          <span class="pipeline-board__column-title">${STAGE_LABELS[stage]}</span>
          <span class="pipeline-board__column-count">${apps.length}</span>
        </div>
        <div class="pipeline-board__column-body" data-drop-stage="${stage}">
          ${apps.map((app) => this.renderAppCard(app)).join('')}
        </div>
        ${checkpoint ? this.renderGateCheckpoint(checkpoint) : ''}
      </div>
    `;
  }

  private renderAppCard(app: PipelineApp): string {
    const healthClass = `pipeline-board__health--${app.health}`;
    const isExpanded = this.expandedAppId === app.id;
    const gateLabel = `${app.gateCheck.passed}/${app.gateCheck.total} passed${app.gateCheck.warnings > 0 ? `, ${app.gateCheck.warnings} warnings` : ''}`;

    return `
      <div class="pipeline-board__card ${isExpanded ? 'pipeline-board__card--expanded' : ''}"
           data-app-id="${app.id}"
           draggable="true"
           role="button"
           tabindex="0"
           aria-label="${app.name} - ${app.daysInStage} days in stage">
        <div class="pipeline-board__card-header">
          <span class="pipeline-board__card-name">${app.name}</span>
          <span class="pipeline-board__card-health ${healthClass}" title="${app.health}">●</span>
        </div>
        <div class="pipeline-board__card-meta">
          <span class="pipeline-board__card-days">${app.daysInStage}d</span>
          <span class="pipeline-board__card-gate">${gateLabel}</span>
        </div>
        ${isExpanded ? this.renderExpandedDetails(app) : ''}
      </div>
    `;
  }

  private renderExpandedDetails(app: PipelineApp): string {
    return `
      <div class="pipeline-board__card-details">
        <div class="pipeline-board__detail-row">
          <span class="pipeline-board__detail-label">Stage:</span>
          <span class="pipeline-board__detail-value">${STAGE_LABELS[app.stage]}</span>
        </div>
        <div class="pipeline-board__detail-row">
          <span class="pipeline-board__detail-label">Days in Stage:</span>
          <span class="pipeline-board__detail-value">${app.daysInStage}</span>
        </div>
        <div class="pipeline-board__detail-row">
          <span class="pipeline-board__detail-label">Gate Checks:</span>
          <span class="pipeline-board__detail-value">${app.gateCheck.passed}/${app.gateCheck.total} passed, ${app.gateCheck.warnings} warnings</span>
        </div>
        <div class="pipeline-board__detail-row">
          <span class="pipeline-board__detail-label">Health:</span>
          <span class="pipeline-board__detail-value">${app.health}</span>
        </div>
      </div>
    `;
  }

  private renderGateCheckpoint(checkpoint: GateCheckpoint): string {
    return `
      <div class="pipeline-board__gate" data-gate-after="${checkpoint.afterStage}">
        <span class="pipeline-board__gate-icon">⛩️</span>
        <span class="pipeline-board__gate-pass">✓ ${checkpoint.passCount}</span>
        <span class="pipeline-board__gate-fail">✗ ${checkpoint.failCount}</span>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Click to expand
    this.container.querySelectorAll('[data-app-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const appId = (card as HTMLElement).dataset.appId!;
        if (this.expandedAppId === appId) {
          this.expandedAppId = null;
        } else {
          this.expandedAppId = appId;
          this.options.onAppClick?.(appId);
        }
        this.render();
        this.attachListeners();
      });
    });

    // Drag and drop
    this.container.querySelectorAll('[data-app-id]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        this.draggedAppId = (card as HTMLElement).dataset.appId!;
        (e as DragEvent).dataTransfer?.setData('text/plain', this.draggedAppId);
      });

      card.addEventListener('dragend', () => {
        this.draggedAppId = null;
      });
    });

    this.container.querySelectorAll('[data-drop-stage]').forEach((col) => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        (col as HTMLElement).classList.add('pipeline-board__column-body--dragover');
      });

      col.addEventListener('dragleave', () => {
        (col as HTMLElement).classList.remove('pipeline-board__column-body--dragover');
      });

      col.addEventListener('drop', (e) => {
        e.preventDefault();
        (col as HTMLElement).classList.remove('pipeline-board__column-body--dragover');
        const stage = (col as HTMLElement).dataset.dropStage as PipelineStage;
        if (this.draggedAppId && stage) {
          // Reorder within same stage
          const appsInStage = this.data.apps
            .filter((a) => a.stage === stage)
            .sort((a, b) => a.priority - b.priority);
          const appIds = appsInStage.map((a) => a.id);
          // Move dragged app to end of column
          const idx = appIds.indexOf(this.draggedAppId);
          if (idx >= 0) {
            appIds.splice(idx, 1);
            appIds.push(this.draggedAppId);
            this.options.onReorder?.(stage, appIds);
          }
        }
        this.draggedAppId = null;
      });
    });
  }
}
