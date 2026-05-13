/**
 * Eretz Command Center — Strategic Priorities Panel
 *
 * Displays portfolio thesis, top priorities list, per-subsidiary strategy
 * (scale/maintain/optimize/deprecate), risk factors, and key actions
 * with progress indicators.
 *
 * Requirements: 46j.24, 46j.25
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubsidiaryStrategy = 'scale' | 'maintain' | 'optimize' | 'deprecate';

export interface KeyAction {
  id: string;
  description: string;
  subsidiary: string;
  progress: number; // 0-100
  priority: 'high' | 'medium' | 'low';
}

export interface SubsidiaryStrategyData {
  subsidiary: string;
  label: string;
  strategy: SubsidiaryStrategy;
  rationale: string;
  keyActions: KeyAction[];
}

export interface StrategicPrioritiesData {
  portfolioThesis: string;
  topPriorities: string[];
  subsidiaryStrategies: SubsidiaryStrategyData[];
  riskFactors: string[];
}

// ---------------------------------------------------------------------------
// StrategicPrioritiesPanel
// ---------------------------------------------------------------------------

export class StrategicPrioritiesPanel {
  private container: HTMLElement;
  private data: StrategicPrioritiesData;

  constructor(container: HTMLElement, data: StrategicPrioritiesData) {
    this.container = container;
    this.data = data;
  }

  mount(): void {
    this.render();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: StrategicPrioritiesData): void {
    this.data = data;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="strategic-priorities" role="region" aria-label="Strategic Priorities">
        <div class="strategic-priorities__header">
          <h4 class="strategic-priorities__title">🎯 Strategic Priorities</h4>
        </div>

        <div class="strategic-priorities__thesis">
          <h5 class="strategic-priorities__section-title">Portfolio Thesis</h5>
          <p class="strategic-priorities__thesis-text" data-content="thesis">${this.data.portfolioThesis}</p>
        </div>

        <div class="strategic-priorities__priorities">
          <h5 class="strategic-priorities__section-title">Top Priorities</h5>
          <ol class="strategic-priorities__priority-list">
            ${this.data.topPriorities.map((p) => `<li class="strategic-priorities__priority-item">${p}</li>`).join('')}
          </ol>
        </div>

        <div class="strategic-priorities__strategies">
          <h5 class="strategic-priorities__section-title">Per-Subsidiary Strategy</h5>
          ${this.data.subsidiaryStrategies.map((s) => this.renderSubsidiaryStrategy(s)).join('')}
        </div>

        <div class="strategic-priorities__risks">
          <h5 class="strategic-priorities__section-title">Risk Factors</h5>
          <ul class="strategic-priorities__risk-list">
            ${this.data.riskFactors.map((r) => `<li class="strategic-priorities__risk-item">${r}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  private renderSubsidiaryStrategy(strategy: SubsidiaryStrategyData): string {
    const strategyClass = `strategic-priorities__strategy-badge--${strategy.strategy}`;

    const actionsHtml = strategy.keyActions
      .sort((a, b) => this.priorityOrder(a.priority) - this.priorityOrder(b.priority))
      .map((action) => `
        <div class="strategic-priorities__action" data-action-id="${action.id}">
          <span class="strategic-priorities__action-desc">${action.description}</span>
          <div class="strategic-priorities__action-progress">
            <div class="strategic-priorities__progress-bar">
              <div class="strategic-priorities__progress-fill" style="width: ${action.progress}%"></div>
            </div>
            <span class="strategic-priorities__progress-value">${action.progress}%</span>
          </div>
        </div>
      `).join('');

    return `
      <div class="strategic-priorities__subsidiary-strategy" data-strategy-subsidiary="${strategy.subsidiary}">
        <div class="strategic-priorities__subsidiary-header">
          <span class="strategic-priorities__subsidiary-name">${strategy.label}</span>
          <span class="strategic-priorities__strategy-badge ${strategyClass}">${strategy.strategy}</span>
        </div>
        <p class="strategic-priorities__strategy-rationale">${strategy.rationale}</p>
        <div class="strategic-priorities__actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private priorityOrder(priority: 'high' | 'medium' | 'low'): number {
    const order = { high: 0, medium: 1, low: 2 };
    return order[priority];
  }
}
