/**
 * Shaar Dashboard — Industry Scanner View
 *
 * Displays technology roadmap visualization:
 * - Timeline of technology discoveries
 * - Recent discoveries with assessment details
 * - Roadmap items with status and timeline
 *
 * Data comes from GET /sme/roadmap.
 *
 * Requirements: 25.6, 26.6
 */

export interface RoadmapItem {
  id: string;
  technology: string;
  domain: string;
  status: 'discovered' | 'evaluating' | 'recommended' | 'adopted';
  discoveredAt: string;
  assessment: string;
  impact: 'high' | 'medium' | 'low';
  timelineQuarter: string;
}

async function fetchRoadmap(): Promise<RoadmapItem[]> {
  const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
  const response = await fetch(`${apiUrl}/sme/roadmap`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const result = await response.json();
  return result.roadmap ?? [];
}

export class IndustryScannerView {
  private container: HTMLElement;
  private roadmap: RoadmapItem[] = [];
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
      this.roadmap = await fetchRoadmap();
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
        <h2>Industry Scanner</h2>
      </div>
      ${this.renderContent()}
    `;
  }

  private renderContent(): string {
    if (this.loading) {
      return '<div class="view-loading" role="status">Loading industry scanner…</div>';
    }

    if (this.error) {
      return `<div class="view-error" role="alert">No data available</div>`;
    }

    if (this.roadmap.length === 0) {
      return '<div class="view-empty">No roadmap data available.</div>';
    }

    // Sort by discoveredAt descending for recent discoveries
    const sorted = [...this.roadmap].sort(
      (a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime()
    );

    let html = '<div class="industry-scanner-content">';

    // Roadmap timeline
    html += `<div class="roadmap-timeline">
      <h3>Technology Roadmap</h3>
      <div class="timeline-items">`;

    for (const item of sorted) {
      const date = new Date(item.discoveredAt).toLocaleDateString();
      html += `
        <div class="timeline-item status-${item.status}" data-id="${item.id}">
          <div class="timeline-marker"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="technology-name">${escapeHtml(item.technology)}</span>
              <span class="timeline-date">${date}</span>
            </div>
            <div class="timeline-meta">
              <span class="timeline-domain">${escapeHtml(item.domain)}</span>
              <span class="timeline-status status-badge-${item.status}">${item.status}</span>
              <span class="timeline-impact impact-${item.impact}">${item.impact} impact</span>
              <span class="timeline-quarter">${escapeHtml(item.timelineQuarter)}</span>
            </div>
            <div class="timeline-assessment">${escapeHtml(item.assessment)}</div>
          </div>
        </div>`;
    }

    html += `</div></div>`;

    // Recent discoveries section
    const recent = sorted.slice(0, 5);
    html += `<div class="recent-discoveries">
      <h3>Recent Discoveries</h3>
      <div class="discoveries-list">`;

    for (const item of recent) {
      html += `
        <div class="discovery-card impact-${item.impact}">
          <div class="discovery-title">${escapeHtml(item.technology)}</div>
          <div class="discovery-domain">${escapeHtml(item.domain)}</div>
          <div class="discovery-assessment">${escapeHtml(item.assessment)}</div>
        </div>`;
    }

    html += `</div></div></div>`;
    return html;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
