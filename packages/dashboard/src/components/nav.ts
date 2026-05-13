/**
 * Shaar Dashboard — Navigation Component
 *
 * Left sidebar navigation with collapsible section headers.
 * Sections: King's View, Seraphim Core, Eretz Business, ZionX, ZXMG, Zion Alpha, SME Intelligence.
 *
 * Requirements: 9.1
 */

import { logout } from '../auth.js';

export type ViewName =
  | 'kings-view'
  // Seraphim Core
  | 'seraphim-command-center'
  | 'seraphim-governance'
  | 'seraphim-memory'
  | 'seraphim-resources'
  | 'seraphim-audit-trail'
  | 'seraphim-learning'
  | 'seraphim-self-improvement'
  | 'seraphim-decisions'
  | 'seraphim-ov1'
  | 'seraphim-sv1'
  | 'seraphim-requirements'
  | 'seraphim-design'
  | 'seraphim-capabilities'
  // Eretz Business
  | 'eretz-portfolio'
  | 'eretz-synergies'
  | 'eretz-patterns'
  | 'eretz-training'
  | 'eretz-directives'
  | 'eretz-standing-orders'
  // ZionX
  | 'zionx-pipeline'
  | 'zionx-app-development'
  | 'zionx-app-store'
  | 'zionx-marketing'
  | 'zionx-design'
  | 'zionx-revenue'
  // ZXMG
  | 'zxmg-video-production'
  | 'zxmg-content-pipeline'
  | 'zxmg-performance'
  | 'zxmg-distribution'
  | 'zxmg-monetization'
  | 'zxmg-intelligence'
  // Zion Alpha
  | 'alpha-positions'
  | 'alpha-performance'
  | 'alpha-markets'
  | 'alpha-risk'
  | 'alpha-journal'
  // Shaar Agent
  | 'shaar-agent'
  // SME Intelligence
  | 'sme-recommendations'
  | 'sme-world-class'
  | 'sme-industry-scanner'
  | 'sme-capability-maturity'
  | 'sme-heartbeat-history'
  // Reference Ingestion
  | 'ref-ingestion-status'
  | 'ref-quality-gate'
  | 'ref-baselines'
  // Legacy views (kept for backward compat)
  | 'agents'
  | 'pillars'
  | 'costs'
  | 'audit'
  | 'health'
  | 'recommendations'
  | 'world-class'
  | 'industry-scanner'
  | 'capability-maturity'
  | 'heartbeat-history';

export interface NavOptions {
  onNavigate: (view: ViewName) => void;
}

interface NavSection {
  id: string;
  label: string;
  items: Array<{ id: ViewName; label: string }> | null; // null = no sub-items (landing page)
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: 'kings-view',
    label: "King's View",
    items: null,
  },
  {
    id: 'seraphim-core',
    label: 'Seraphim Core',
    items: [
      { id: 'seraphim-command-center', label: 'Command Center' },
      { id: 'seraphim-governance', label: 'Governance' },
      { id: 'seraphim-memory', label: 'Memory' },
      { id: 'seraphim-resources', label: 'Resources' },
      { id: 'seraphim-audit-trail', label: 'Audit Trail' },
      { id: 'seraphim-learning', label: 'Learning' },
      { id: 'seraphim-self-improvement', label: 'Self-Improvement' },
      { id: 'seraphim-decisions', label: 'Decisions' },
      { id: 'seraphim-ov1', label: 'OV-1 Operational' },
      { id: 'seraphim-sv1', label: 'SV-1 System' },
      { id: 'seraphim-requirements', label: 'Requirements' },
      { id: 'seraphim-design', label: 'Design' },
      { id: 'seraphim-capabilities', label: 'Capabilities' },
    ],
  },
  {
    id: 'eretz-business',
    label: 'Eretz Business',
    items: [
      { id: 'eretz-portfolio', label: 'Portfolio' },
      { id: 'eretz-synergies', label: 'Synergies' },
      { id: 'eretz-patterns', label: 'Patterns' },
      { id: 'eretz-training', label: 'Training' },
      { id: 'eretz-directives', label: 'Directives' },
      { id: 'eretz-standing-orders', label: 'Standing Orders' },
    ],
  },
  {
    id: 'zionx',
    label: 'ZionX',
    items: [
      { id: 'zionx-pipeline', label: 'Pipeline' },
      { id: 'zionx-app-development', label: '⚡ App Development' },
      { id: 'zionx-app-store', label: 'App Store' },
      { id: 'zionx-marketing', label: 'Marketing' },
      { id: 'zionx-design', label: 'Design' },
      { id: 'zionx-revenue', label: 'Revenue' },
    ],
  },
  {
    id: 'zxmg',
    label: 'ZXMG',
    items: [
      { id: 'zxmg-video-production', label: '🎬 Video Production' },
      { id: 'zxmg-content-pipeline', label: 'Content Pipeline' },
      { id: 'zxmg-performance', label: 'Performance' },
      { id: 'zxmg-distribution', label: 'Distribution' },
      { id: 'zxmg-monetization', label: 'Monetization' },
      { id: 'zxmg-intelligence', label: 'Intelligence' },
    ],
  },
  {
    id: 'zion-alpha',
    label: 'Zion Alpha',
    items: [
      { id: 'alpha-positions', label: 'Positions' },
      { id: 'alpha-performance', label: 'Performance' },
      { id: 'alpha-markets', label: 'Markets' },
      { id: 'alpha-risk', label: 'Risk' },
      { id: 'alpha-journal', label: 'Journal' },
    ],
  },
  {
    id: 'shaar-agent',
    label: 'Shaar Agent',
    items: null,
  },
  {
    id: 'sme-intelligence',
    label: 'SME Intelligence',
    items: [
      { id: 'sme-recommendations', label: 'Recommendations' },
      { id: 'sme-world-class', label: 'Path to World-Class' },
      { id: 'sme-industry-scanner', label: 'Industry Scanner' },
      { id: 'sme-capability-maturity', label: 'Capability Maturity' },
      { id: 'sme-heartbeat-history', label: 'Heartbeat History' },
    ],
  },
  {
    id: 'reference-ingestion',
    label: 'Reference Ingestion',
    items: [
      { id: 'ref-ingestion-status', label: 'Ingestion Status' },
      { id: 'ref-quality-gate', label: 'Quality Gate' },
      { id: 'ref-baselines', label: 'Baselines' },
    ],
  },
];

export class Nav {
  private container: HTMLElement;
  private activeView: ViewName = 'kings-view';
  private onNavigate: (view: ViewName) => void;
  private expandedSections: Set<string> = new Set();

  constructor(container: HTMLElement, options: NavOptions) {
    this.container = container;
    this.onNavigate = options.onNavigate;
    this.render();
  }

  setActive(view: ViewName): void {
    this.activeView = view;
    // Auto-expand the section containing the active view
    for (const section of NAV_SECTIONS) {
      if (section.items) {
        for (const item of section.items) {
          if (item.id === view) {
            this.expandedSections.add(section.id);
          }
        }
      }
    }
    this.render();
  }

  private render(): void {
    const sectionsHtml = NAV_SECTIONS.map((section) => {
      if (!section.items) {
        // Landing page link (King's View)
        const activeClass = this.activeView === section.id ? ' active' : '';
        return `
          <div class="sidebar-section">
            <a href="#" class="sidebar-link sidebar-landing-link${activeClass}" data-view="${section.id}">
              ${section.label}
            </a>
          </div>`;
      }

      const isExpanded = this.expandedSections.has(section.id);
      const hasActiveChild = section.items.some((item) => item.id === this.activeView);
      const expandedClass = isExpanded || hasActiveChild ? ' expanded' : '';

      const itemsHtml = section.items
        .map((item) => {
          const activeClass = item.id === this.activeView ? ' active' : '';
          return `<a href="#" class="sidebar-link${activeClass}" data-view="${item.id}">${item.label}</a>`;
        })
        .join('');

      return `
        <div class="sidebar-section${expandedClass}">
          <div class="sidebar-section-header" data-section="${section.id}">
            <span>${section.label}</span>
            <span class="sidebar-chevron">${isExpanded || hasActiveChild ? '▾' : '▸'}</span>
          </div>
          <div class="sidebar-section-items" ${isExpanded || hasActiveChild ? '' : 'style="display:none"'}>
            ${itemsHtml}
          </div>
        </div>`;
    }).join('');

    this.container.innerHTML = `
      <nav class="sidebar-nav" role="navigation" aria-label="Main navigation">
        <div class="nav-brand">SeraphimOS</div>
        <div class="sidebar-sections">${sectionsHtml}</div>
        <div class="sidebar-footer">
          <button class="sidebar-logout-btn" id="nav-logout-btn">Sign Out</button>
        </div>
      </nav>
    `;

    this.attachHandlers();
  }

  private attachHandlers(): void {
    // Section header click to toggle expand/collapse
    const headers = this.container.querySelectorAll<HTMLElement>('.sidebar-section-header');
    for (const header of headers) {
      header.addEventListener('click', () => {
        const sectionId = header.dataset.section!;
        if (this.expandedSections.has(sectionId)) {
          this.expandedSections.delete(sectionId);
        } else {
          this.expandedSections.add(sectionId);
        }
        this.render();
      });
    }

    // Link clicks for navigation
    const links = this.container.querySelectorAll<HTMLAnchorElement>('a.sidebar-link');
    for (const link of links) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view as ViewName;
        this.activeView = view;
        this.render();
        this.onNavigate(view);
      });
    }

    // Logout button
    const logoutBtn = this.container.querySelector('#nav-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        logout();
      });
    }
  }
}
