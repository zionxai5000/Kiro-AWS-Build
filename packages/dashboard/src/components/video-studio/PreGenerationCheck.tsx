/**
 * ZXMG Video Studio — Pre-Generation Compliance Check
 *
 * Modal/panel that appears before any video render is triggered.
 * Displays diversity checklist with pass/fail per category.
 * Warning with suggestions on failure. Override and Accept Suggestion buttons.
 *
 * Requirements: 44b.7, 44c.12
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'fail';

export interface DiversityCheck {
  id: string;
  category: string; // avatar, voice, background, style
  status: CheckStatus;
  currentSelection: string;
  lastUsedVideoIndex?: number;
  suggestedAlternative?: string;
}

export interface PreGenerationCheckData {
  checks: DiversityCheck[];
  videoTitle: string;
}

export interface PreGenerationCheckOptions {
  onOverride?: () => void;
  onAcceptSuggestion?: (checkId: string, alternative: string) => void;
  onAllPass?: () => void;
}

// ---------------------------------------------------------------------------
// PreGenerationComplianceCheck
// ---------------------------------------------------------------------------

export class PreGenerationComplianceCheck {
  private container: HTMLElement;
  private data: PreGenerationCheckData;
  private options: PreGenerationCheckOptions;
  private visible: boolean = false;

  constructor(container: HTMLElement, data: PreGenerationCheckData, options: PreGenerationCheckOptions = {}) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.visible = true;
    this.render();
    this.attachListeners();
    this.checkAutoPass();
  }

  unmount(): void {
    this.visible = false;
    this.container.innerHTML = '';
  }

  update(data: PreGenerationCheckData): void {
    this.data = data;
    this.render();
    this.attachListeners();
    this.checkAutoPass();
  }

  show(): void {
    this.visible = true;
    this.render();
    this.attachListeners();
    this.checkAutoPass();
  }

  hide(): void {
    this.visible = false;
    this.container.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    if (!this.visible) {
      this.container.innerHTML = '';
      return;
    }

    const allPass = this.data.checks.every((c) => c.status === 'pass');
    const failedChecks = this.data.checks.filter((c) => c.status === 'fail');

    this.container.innerHTML = `
      <div class="pre-gen-check" role="dialog" aria-label="Pre-Generation Compliance Check" aria-modal="true">
        <div class="pre-gen-check__overlay"></div>
        <div class="pre-gen-check__modal">
          <div class="pre-gen-check__header">
            <h3 class="pre-gen-check__title">🔍 Pre-Generation Compliance Check</h3>
            <span class="pre-gen-check__subtitle">Video: ${this.data.videoTitle}</span>
          </div>
          <div class="pre-gen-check__checklist">
            ${this.data.checks.map((check) => this.renderCheck(check)).join('')}
          </div>
          ${allPass ? this.renderAllPass() : this.renderFailures(failedChecks)}
        </div>
      </div>
    `;
  }

  private renderCheck(check: DiversityCheck): string {
    const icon = check.status === 'pass' ? '✓' : '✗';
    const statusClass = `pre-gen-check__check--${check.status}`;

    return `
      <div class="pre-gen-check__check ${statusClass}" data-check-id="${check.id}">
        <span class="pre-gen-check__check-icon">${icon}</span>
        <span class="pre-gen-check__check-category">${check.category} diversity</span>
        <span class="pre-gen-check__check-selection">${check.currentSelection}</span>
        ${check.status === 'fail' && check.lastUsedVideoIndex !== undefined
          ? `<span class="pre-gen-check__check-warning">Used ${check.lastUsedVideoIndex} video${check.lastUsedVideoIndex !== 1 ? 's' : ''} ago</span>`
          : ''
        }
      </div>
    `;
  }

  private renderAllPass(): string {
    return `
      <div class="pre-gen-check__result pre-gen-check__result--pass" role="status">
        <span class="pre-gen-check__result-icon">✅</span>
        <span class="pre-gen-check__result-text">All diversity checks passed!</span>
      </div>
      <div class="pre-gen-check__actions">
        <button class="pre-gen-check__btn pre-gen-check__btn--proceed" data-action="proceed" aria-label="Proceed with render">
          🚀 Proceed
        </button>
      </div>
    `;
  }

  private renderFailures(failedChecks: DiversityCheck[]): string {
    const suggestions = failedChecks
      .filter((c) => c.suggestedAlternative)
      .map((c) => `
        <div class="pre-gen-check__suggestion" data-suggestion-check="${c.id}" data-suggestion-alt="${c.suggestedAlternative}">
          <span class="pre-gen-check__suggestion-category">${c.category}:</span>
          <span class="pre-gen-check__suggestion-current">${c.currentSelection}</span>
          <span class="pre-gen-check__suggestion-arrow">→</span>
          <span class="pre-gen-check__suggestion-alt">${c.suggestedAlternative}</span>
        </div>
      `).join('');

    return `
      <div class="pre-gen-check__result pre-gen-check__result--fail" role="alert">
        <span class="pre-gen-check__result-icon">⚠️</span>
        <span class="pre-gen-check__result-text">${failedChecks.length} check${failedChecks.length !== 1 ? 's' : ''} failed</span>
      </div>
      ${suggestions ? `<div class="pre-gen-check__suggestions">${suggestions}</div>` : ''}
      <div class="pre-gen-check__actions">
        <button class="pre-gen-check__btn pre-gen-check__btn--override" data-action="override" aria-label="Override and proceed anyway">
          ⚡ Override
        </button>
        <button class="pre-gen-check__btn pre-gen-check__btn--accept" data-action="accept" aria-label="Accept suggested alternatives">
          ✓ Accept Suggestions
        </button>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Override button
    this.container.querySelector('[data-action="override"]')?.addEventListener('click', () => {
      this.options.onOverride?.();
      this.hide();
    });

    // Accept suggestions button
    this.container.querySelector('[data-action="accept"]')?.addEventListener('click', () => {
      const suggestions = this.container.querySelectorAll('[data-suggestion-check]');
      suggestions.forEach((el) => {
        const checkId = (el as HTMLElement).dataset.suggestionCheck!;
        const alt = (el as HTMLElement).dataset.suggestionAlt!;
        this.options.onAcceptSuggestion?.(checkId, alt);
      });
      this.hide();
    });

    // Proceed button (all pass)
    this.container.querySelector('[data-action="proceed"]')?.addEventListener('click', () => {
      this.options.onAllPass?.();
      this.hide();
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private checkAutoPass(): void {
    const allPass = this.data.checks.every((c) => c.status === 'pass');
    if (allPass && this.visible) {
      // Auto-proceed is available but user must click
    }
  }
}
