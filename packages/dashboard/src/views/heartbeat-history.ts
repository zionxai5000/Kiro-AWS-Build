/**
 * Shaar Dashboard — Heartbeat History View
 *
 * Displays SME agent heartbeat history:
 * - Review cycle history per agent
 * - Research findings
 * - Recommendation generation stats
 *
 * Data comes from GET /sme/heartbeat-history.
 *
 * Requirements: 22.3, 26.6
 */

export interface HeartbeatEntry {
  agentId: string;
  agentName: string;
  cycleNumber: number;
  timestamp: string;
  researchFindings: number;
  recommendationsGenerated: number;
  domainsReviewed: string[];
  status: 'completed' | 'in-progress' | 'failed';
}

async function fetchHeartbeatHistory(): Promise<HeartbeatEntry[]> {
  const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
  const response = await fetch(`${apiUrl}/sme/heartbeat-history`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const result = await response.json();
  return result.entries ?? [];
}

export class HeartbeatHistoryView {
  private container: HTMLElement;
  private entries: HeartbeatEntry[] = [];
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
      this.entries = await fetchHeartbeatHistory();
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
        <h2>Heartbeat History</h2>
      </div>
      ${this.renderContent()}
    `;
  }

  private renderContent(): string {
    if (this.loading) {
      return '<div class="view-loading" role="status">Loading heartbeat history…</div>';
    }

    if (this.error) {
      return `<div class="view-error" role="alert">No data available</div>`;
    }

    if (this.entries.length === 0) {
      return '<div class="view-empty">No heartbeat history available.</div>';
    }

    // Group by agent
    const grouped = new Map<string, HeartbeatEntry[]>();
    for (const entry of this.entries) {
      const key = entry.agentName || entry.agentId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }

    let html = '<div class="heartbeat-history-content">';

    // Summary stats
    const totalCycles = this.entries.length;
    const totalFindings = this.entries.reduce((sum, e) => sum + e.researchFindings, 0);
    const totalRecs = this.entries.reduce((sum, e) => sum + e.recommendationsGenerated, 0);

    html += `
      <div class="heartbeat-summary">
        <div class="summary-stat">
          <span class="stat-value">${totalCycles}</span>
          <span class="stat-label">Total Cycles</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">${totalFindings}</span>
          <span class="stat-label">Research Findings</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">${totalRecs}</span>
          <span class="stat-label">Recommendations Generated</span>
        </div>
      </div>
    `;

    // Per-agent history
    for (const [agentName, agentEntries] of grouped) {
      const sorted = [...agentEntries].sort((a, b) => b.cycleNumber - a.cycleNumber);

      html += `
        <div class="heartbeat-agent-section">
          <h3 class="agent-name">${escapeHtml(agentName)}</h3>
          <table class="heartbeat-table">
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Timestamp</th>
                <th>Findings</th>
                <th>Recommendations</th>
                <th>Domains</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>`;

      for (const entry of sorted) {
        const time = new Date(entry.timestamp).toLocaleString();
        const statusClass = `heartbeat-status-${entry.status}`;
        html += `
              <tr>
                <td>${entry.cycleNumber}</td>
                <td>${time}</td>
                <td>${entry.researchFindings}</td>
                <td>${entry.recommendationsGenerated}</td>
                <td>${entry.domainsReviewed.map((d) => escapeHtml(d)).join(', ')}</td>
                <td class="${statusClass}">${entry.status}</td>
              </tr>`;
      }

      html += `</tbody></table></div>`;
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
