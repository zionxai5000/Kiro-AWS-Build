/**
 * Eretz Command Center — Resource Allocation View
 *
 * Visual budget breakdown (bar chart/treemap) with per-subsidiary percentage,
 * actual spend, and recommended allocation. King can adjust percentages
 * with changes propagated to Eretz portfolio strategy.
 *
 * Requirements: 46i.22, 46i.23
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubsidiaryAllocation {
  subsidiary: string;
  label: string;
  percentage: number;
  actualSpend: number;
  recommendedPercentage: number;
}

export interface ResourceAllocationData {
  totalBudget: number;
  allocations: SubsidiaryAllocation[];
}

export interface ResourceAllocationOptions {
  onAllocationChange?: (subsidiary: string, newPercentage: number) => void;
}

// ---------------------------------------------------------------------------
// ResourceAllocationView
// ---------------------------------------------------------------------------

export class ResourceAllocationView {
  private container: HTMLElement;
  private data: ResourceAllocationData;
  private options: ResourceAllocationOptions;

  constructor(container: HTMLElement, data: ResourceAllocationData, options: ResourceAllocationOptions = {}) {
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

  update(data: ResourceAllocationData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="resource-allocation" role="region" aria-label="Resource Allocation">
        <div class="resource-allocation__header">
          <h4 class="resource-allocation__title">💰 Resource Allocation</h4>
          <span class="resource-allocation__total" data-metric="total-budget">Total: ${this.formatCurrency(this.data.totalBudget)}</span>
        </div>
        <div class="resource-allocation__chart">
          ${this.renderBarChart()}
        </div>
        <div class="resource-allocation__controls">
          ${this.data.allocations.map((a) => this.renderAllocationControl(a)).join('')}
        </div>
      </div>
    `;
  }

  private renderBarChart(): string {
    const bars = this.data.allocations.map((a) => {
      const barClass = `resource-allocation__bar--${a.subsidiary}`;
      return `
        <div class="resource-allocation__bar ${barClass}" data-bar="${a.subsidiary}" style="width: ${a.percentage}%" title="${a.label}: ${a.percentage}%">
          <span class="resource-allocation__bar-label">${a.label}</span>
          <span class="resource-allocation__bar-pct">${a.percentage}%</span>
        </div>
      `;
    }).join('');

    return `<div class="resource-allocation__bar-chart">${bars}</div>`;
  }

  private renderAllocationControl(allocation: SubsidiaryAllocation): string {
    const diff = allocation.percentage - allocation.recommendedPercentage;
    const diffClass = diff > 0 ? 'resource-allocation__diff--over' : diff < 0 ? 'resource-allocation__diff--under' : '';

    return `
      <div class="resource-allocation__control" data-allocation="${allocation.subsidiary}">
        <span class="resource-allocation__control-label">${allocation.label}</span>
        <div class="resource-allocation__control-input">
          <input
            type="range"
            class="resource-allocation__slider"
            data-slider="${allocation.subsidiary}"
            min="0"
            max="100"
            value="${allocation.percentage}"
            aria-label="Allocation for ${allocation.label}"
          />
          <input
            type="number"
            class="resource-allocation__number"
            data-number="${allocation.subsidiary}"
            min="0"
            max="100"
            value="${allocation.percentage}"
            aria-label="Allocation percentage for ${allocation.label}"
          />
          <span class="resource-allocation__pct-sign">%</span>
        </div>
        <div class="resource-allocation__control-meta">
          <span class="resource-allocation__actual-spend">Spend: ${this.formatCurrency(allocation.actualSpend)}</span>
          <span class="resource-allocation__recommended">Recommended: ${allocation.recommendedPercentage}%</span>
          ${diff !== 0 ? `<span class="resource-allocation__diff ${diffClass}">${diff > 0 ? '+' : ''}${diff}%</span>` : ''}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Slider changes
    this.container.querySelectorAll<HTMLInputElement>('[data-slider]').forEach((slider) => {
      slider.addEventListener('input', () => {
        const subsidiary = slider.dataset.slider!;
        const newValue = parseInt(slider.value, 10);
        this.handleAllocationChange(subsidiary, newValue);
      });
    });

    // Number input changes
    this.container.querySelectorAll<HTMLInputElement>('[data-number]').forEach((input) => {
      input.addEventListener('change', () => {
        const subsidiary = input.dataset.number!;
        const newValue = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
        this.handleAllocationChange(subsidiary, newValue);
      });
    });
  }

  private handleAllocationChange(subsidiary: string, newPercentage: number): void {
    const allocation = this.data.allocations.find((a) => a.subsidiary === subsidiary);
    if (allocation) {
      allocation.percentage = newPercentage;
      this.options.onAllocationChange?.(subsidiary, newPercentage);
      this.render();
      this.attachListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatCurrency(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  }
}
