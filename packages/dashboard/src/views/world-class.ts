/**
 * Shaar Dashboard — Path to World-Class View
 *
 * Per-domain progress visualization showing:
 * - Current score vs target (world-class benchmark)
 * - Cumulative improvement trend
 * - Top pending recommendations per domain
 *
 * Data comes from GET /sme/maturity.
 *
 * Requirements: 24.3, 26.6
 */

export interface DomainProgress {
  domain: string;
  currentScore: number;
  targetScore: number;
  improvementTrend: number[];
  topRecommendations: Array<{ title: string; priority: string }>;
}

async function fetchWorldClassProgress(): Promise<DomainProgress[]> {
  const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
  const response = await fetch(`${apiUrl}/sme/world-class`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const result = await response.json();
  return result.domains ?? [];
}

export class WorldClassView {
  private container: HTMLElement;
  private domains: DomainProgress[] = [];
  private loading = true;
  private error: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      this.domains = await fetchWorldClassProgress();
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="view-header">
        <h2>Path to World-Class</h2>
      </div>
      ${this.renderContent()}
    `;
  }

  private renderContent(): string {
    if (this.loading) {
      return '<div class="view-loading" role="status">Loading world-class progress…</div>';
    }

    if (this.error) {
      return `<div class="view-error" role="alert">No data available</div>`;
    }

    if (this.domains.length === 0) {
      return '<div class="view-empty">No domain progress data available.</div>';
    }

    let html = '<div class="world-class-grid">';

    for (const domain of this.domains) {
      const progressPct = Math.min(100, Math.round((domain.currentScore / domain.targetScore) * 100));
      const trendStr = domain.improvementTrend.map((v) => `${v}%`).join(' → ');

      html += `
        <div class="world-class-card" data-domain="${escapeHtml(domain.domain)}">
          <h3 class="domain-name">${escapeHtml(domain.domain)}</h3>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${progressPct}%" role="progressbar" aria-valuenow="${domain.currentScore}" aria-valuemin="0" aria-valuemax="${domain.targetScore}">
              ${domain.currentScore}%
            </div>
          </div>
          <div class="score-labels">
            <span class="current-score">Current: ${domain.currentScore}%</span>
            <span class="target-score">Target: ${domain.targetScore}%</span>
          </div>
          <div class="improvement-trend">
            <span class="trend-label">Trend:</span>
            <span class="trend-values">${trendStr || 'No data'}</span>
          </div>
          <div class="top-recommendations">
            <h4>Top Recommendations</h4>
            ${domain.topRecommendations.length > 0
              ? `<ul>${domain.topRecommendations.map((r) => `<li class="priority-${r.priority}">${escapeHtml(r.title)}</li>`).join('')}</ul>`
              : '<p class="no-recommendations">None pending</p>'
            }
          </div>
        </div>`;
    }

    html += '</div>';
    return html;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
