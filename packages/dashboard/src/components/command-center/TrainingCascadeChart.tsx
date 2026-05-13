/**
 * Eretz Command Center — Training Cascade Chart
 *
 * Per-subsidiary quality trend line charts showing before/after training,
 * completion rates, and quality score improvements.
 *
 * Requirements: 46f.13, 46f.14
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingDataPoint {
  period: string;
  qualityScore: number;
}

export interface SubsidiaryTrainingData {
  subsidiary: string;
  label: string;
  completionRate: number;
  qualityImprovement: number;
  dataPoints: TrainingDataPoint[];
}

export interface TrainingCascadeData {
  subsidiaries: SubsidiaryTrainingData[];
}

// ---------------------------------------------------------------------------
// TrainingCascadeChart
// ---------------------------------------------------------------------------

export class TrainingCascadeChart {
  private container: HTMLElement;
  private data: TrainingCascadeData;

  constructor(container: HTMLElement, data: TrainingCascadeData) {
    this.container = container;
    this.data = data;
  }

  mount(): void {
    this.render();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: TrainingCascadeData): void {
    this.data = data;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="training-cascade" role="region" aria-label="Training Cascade Effectiveness">
        <div class="training-cascade__header">
          <h4 class="training-cascade__title">📈 Training Cascade Effectiveness</h4>
        </div>
        <div class="training-cascade__charts">
          ${this.data.subsidiaries.map((sub) => this.renderSubsidiaryChart(sub)).join('')}
        </div>
      </div>
    `;
  }

  private renderSubsidiaryChart(sub: SubsidiaryTrainingData): string {
    const improvementClass = sub.qualityImprovement >= 0
      ? 'training-cascade__improvement--positive'
      : 'training-cascade__improvement--negative';

    return `
      <div class="training-cascade__subsidiary" data-subsidiary="${sub.subsidiary}">
        <div class="training-cascade__subsidiary-header">
          <span class="training-cascade__subsidiary-name">${sub.label}</span>
          <span class="training-cascade__completion-rate" data-metric="completion-rate">${sub.completionRate}%</span>
          <span class="training-cascade__improvement ${improvementClass}" data-metric="quality-improvement">
            ${sub.qualityImprovement >= 0 ? '+' : ''}${sub.qualityImprovement}%
          </span>
        </div>
        <div class="training-cascade__chart" aria-label="Quality trend for ${sub.label}">
          ${this.renderTrendLine(sub.dataPoints)}
        </div>
      </div>
    `;
  }

  private renderTrendLine(dataPoints: TrainingDataPoint[]): string {
    if (dataPoints.length === 0) return '<span class="training-cascade__no-data">No data</span>';

    const max = Math.max(...dataPoints.map((d) => d.qualityScore));
    const min = Math.min(...dataPoints.map((d) => d.qualityScore));
    const range = max - min || 1;
    const height = 40;
    const width = dataPoints.length * 20;

    const points = dataPoints
      .map((d, i) => {
        const x = i * 20;
        const y = height - ((d.qualityScore - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return `<svg class="training-cascade__svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  }
}
