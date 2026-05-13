/**
 * Eretz Command Center — Pattern Library Browser
 *
 * Searchable pattern list showing: pattern name, category, source subsidiary,
 * adoption count, and effectiveness score. Clicking a pattern shows full details
 * including description, implementation examples, adoption history, and measured impact.
 *
 * Requirements: 46e.11, 46e.12
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Pattern {
  id: string;
  name: string;
  category: string;
  sourceSubsidiary: string;
  adoptionCount: number;
  effectivenessScore: number;
  description: string;
  implementationExamples: string[];
  adoptionHistory: Array<{ subsidiary: string; date: string; outcome: string }>;
  measuredImpact: string;
}

export interface PatternLibraryData {
  patterns: Pattern[];
}

// ---------------------------------------------------------------------------
// PatternLibraryBrowser
// ---------------------------------------------------------------------------

export class PatternLibraryBrowser {
  private container: HTMLElement;
  private data: PatternLibraryData;
  private searchQuery: string = '';
  private selectedPatternId: string | null = null;

  constructor(container: HTMLElement, data: PatternLibraryData) {
    this.container = container;
    this.data = data;
  }

  mount(): void {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: PatternLibraryData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  private getFilteredPatterns(): Pattern[] {
    if (!this.searchQuery) return this.data.patterns;
    const query = this.searchQuery.toLowerCase();
    return this.data.patterns.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query),
    );
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const selectedPattern = this.selectedPatternId
      ? this.data.patterns.find((p) => p.id === this.selectedPatternId) ?? null
      : null;

    if (selectedPattern) {
      this.container.innerHTML = this.renderDetailView(selectedPattern);
    } else {
      this.container.innerHTML = this.renderListView();
    }
  }

  private renderListView(): string {
    const filtered = this.getFilteredPatterns();

    return `
      <div class="pattern-library" role="region" aria-label="Pattern Library">
        <div class="pattern-library__header">
          <h4 class="pattern-library__title">📚 Pattern Library</h4>
          <span class="pattern-library__count">${filtered.length} patterns</span>
        </div>
        <div class="pattern-library__search">
          <input
            type="search"
            class="pattern-library__search-input"
            id="pattern-search"
            placeholder="Search patterns by name or category..."
            value="${this.searchQuery}"
            aria-label="Search patterns"
          />
        </div>
        <div class="pattern-library__list">
          ${filtered.length > 0
            ? filtered.map((p) => this.renderPatternItem(p)).join('')
            : '<div class="pattern-library__empty">No patterns match your search.</div>'
          }
        </div>
      </div>
    `;
  }

  private renderPatternItem(pattern: Pattern): string {
    return `
      <div class="pattern-library__item" data-pattern-id="${pattern.id}" role="button" tabindex="0" aria-label="View details for ${pattern.name}">
        <div class="pattern-library__item-header">
          <span class="pattern-library__item-name">${pattern.name}</span>
          <span class="pattern-library__item-score">${pattern.effectivenessScore}/100</span>
        </div>
        <div class="pattern-library__item-meta">
          <span class="pattern-library__item-category">${pattern.category}</span>
          <span class="pattern-library__item-source">from ${pattern.sourceSubsidiary}</span>
          <span class="pattern-library__item-adoption">${pattern.adoptionCount} adoptions</span>
        </div>
      </div>
    `;
  }

  private renderDetailView(pattern: Pattern): string {
    const adoptionHistoryHtml = pattern.adoptionHistory.map((h) =>
      `<li class="pattern-library__history-item">${h.subsidiary} — ${h.date}: ${h.outcome}</li>`,
    ).join('');

    const examplesHtml = pattern.implementationExamples.map((ex) =>
      `<li class="pattern-library__example-item">${ex}</li>`,
    ).join('');

    return `
      <div class="pattern-library pattern-library--detail" role="region" aria-label="Pattern Detail">
        <div class="pattern-library__detail-header">
          <button class="pattern-library__back-btn" id="pattern-back" aria-label="Back to pattern list">← Back</button>
        </div>
        <div class="pattern-library__detail-content">
          <h4 class="pattern-library__detail-title">${pattern.name}</h4>
          <div class="pattern-library__detail-meta">
            <span class="pattern-library__detail-category">${pattern.category}</span>
            <span class="pattern-library__detail-source">Source: ${pattern.sourceSubsidiary}</span>
            <span class="pattern-library__detail-score">Effectiveness: ${pattern.effectivenessScore}/100</span>
            <span class="pattern-library__detail-adoption">${pattern.adoptionCount} adoptions</span>
          </div>

          <div class="pattern-library__detail-section">
            <h5>Description</h5>
            <p class="pattern-library__detail-description">${pattern.description}</p>
          </div>

          <div class="pattern-library__detail-section">
            <h5>Implementation Examples</h5>
            <ul class="pattern-library__examples">${examplesHtml}</ul>
          </div>

          <div class="pattern-library__detail-section">
            <h5>Adoption History</h5>
            <ul class="pattern-library__history">${adoptionHistoryHtml}</ul>
          </div>

          <div class="pattern-library__detail-section">
            <h5>Measured Impact</h5>
            <p class="pattern-library__detail-impact">${pattern.measuredImpact}</p>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Search input
    const searchInput = this.container.querySelector('#pattern-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value;
        this.render();
        this.attachListeners();
        // Re-focus the search input after re-render
        const newInput = this.container.querySelector('#pattern-search') as HTMLInputElement;
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    // Pattern item click → detail view
    this.container.querySelectorAll('[data-pattern-id]').forEach((item) => {
      item.addEventListener('click', () => {
        this.selectedPatternId = (item as HTMLElement).dataset.patternId!;
        this.render();
        this.attachListeners();
      });
    });

    // Back button
    this.container.querySelector('#pattern-back')?.addEventListener('click', () => {
      this.selectedPatternId = null;
      this.render();
      this.attachListeners();
    });
  }
}
