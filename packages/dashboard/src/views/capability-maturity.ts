/**
 * Shaar Dashboard — Capability Maturity View
 *
 * Displays capability maturity assessment:
 * - Overall maturity score
 * - Per-domain maturity scores
 * - Trend charts (text-based representation)
 * - Gap analysis
 * - Estimated time to target
 *
 * Data comes from GET /sme/maturity.
 *
 * Requirements: 24.3, 26.6
 */

export interface MaturityDomain {
  domain: string;
  score: number;
  targetScore: number;
  trend: number[];
  gaps: string[];
  estimatedTimeToTarget: string;
}

export interface MaturityData {
  overallScore: number;
  overallTarget: number;
  domains: MaturityDomain[];
}

async function fetchMaturity(): Promise<MaturityData> {
  const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
  const response = await fetch(`${apiUrl}/sme/maturity`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const result = await response.json();
  return result;
}

export class CapabilityMaturityView {
  private container: HTMLElement;
  private data: MaturityData | null = null;
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
      this.data = await fetchMaturity();
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
        <h2>Capability Maturity</h2>
      </div>
      ${this.renderContent()}
    `;
  }

  private renderContent(): string {
    if (this.loading) {
      return '<div class="view-loading" role="status">Loading capability maturity…</div>';
    }

    if (this.error) {
      return `<div class="view-error" role="alert">No data available</div>`;
    }

    if (!this.data) {
      return '<div class="view-empty">No maturity data available.</div>';
    }

    const { overallScore, overallTarget, domains } = this.data;
    const overallPct = Math.min(100, Math.round((overallScore / overallTarget) * 100));

    let html = `
      <div class="maturity-overview">
        <div class="overall-score-card">
          <h3>Overall Maturity</h3>
          <div class="overall-score">${overallScore}%</div>
          <div class="overall-target">Target: ${overallTarget}%</div>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${overallPct}%" role="progressbar" aria-valuenow="${overallScore}" aria-valuemin="0" aria-valuemax="${overallTarget}"></div>
          </div>
        </div>
      </div>
      <div class="maturity-domains">
        <h3>Per-Domain Maturity</h3>
        <div class="maturity-grid">`;

    for (const domain of domains) {
      const domainPct = Math.min(100, Math.round((domain.score / domain.targetScore) * 100));
      const trendDisplay = domain.trend.map((v) => `${v}%`).join(' → ');

      html += `
        <div class="maturity-domain-card" data-domain="${escapeHtml(domain.domain)}">
          <h4>${escapeHtml(domain.domain)}</h4>
          <div class="domain-score">
            <span class="score-value">${domain.score}%</span>
            <span class="score-target">/ ${domain.targetScore}%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${domainPct}%" role="progressbar" aria-valuenow="${domain.score}" aria-valuemin="0" aria-valuemax="${domain.targetScore}"></div>
          </div>
          <div class="domain-trend">
            <span class="trend-label">Trend:</span>
            <span class="trend-values">${trendDisplay || 'No data'}</span>
          </div>
          <div class="domain-gaps">
            <span class="gaps-label">Gaps:</span>
            ${domain.gaps.length > 0
              ? `<ul class="gaps-list">${domain.gaps.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>`
              : '<span class="no-gaps">None identified</span>'
            }
          </div>
          <div class="domain-eta">
            <span class="eta-label">Est. time to target:</span>
            <span class="eta-value">${escapeHtml(domain.estimatedTimeToTarget)}</span>
          </div>
        </div>`;
    }

    html += '</div></div>';
    return html;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
