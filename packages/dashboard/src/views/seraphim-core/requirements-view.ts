/**
 * Shaar Dashboard — Requirements Document View
 *
 * Renders the requirements.md spec document as formatted HTML
 * using the MarkdownRenderer. The document content is bundled
 * statically via Vite's ?raw import — no backend API required.
 *
 * Requirements: 47e.19, 47e.21
 */

import { MarkdownRenderer } from './markdown-renderer.js';
import { requirementsContent } from '../../data/spec-documents.js';

/**
 * RequirementsView renders the requirements.md spec document
 * as styled HTML within the dashboard.
 */
export class RequirementsView {
  private container: HTMLElement;
  private renderer: MarkdownRenderer;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new MarkdownRenderer();
  }

  /**
   * Mount the Requirements view into the container.
   * Renders the bundled document content as HTML.
   */
  async mount(): Promise<void> {
    this.showLoading();

    const html = await this.renderer.render(requirementsContent);
    this.renderContent(html);
  }

  /**
   * Unmount the view and clean up DOM content.
   */
  unmount(): void {
    this.container.innerHTML = '';
  }

  private showLoading(): void {
    this.container.innerHTML = `
      <div class="view-header">
        <h2>Requirements Document</h2>
        <p class="view-description">SeraphimOS core platform requirements specification</p>
      </div>
      <div class="document-loading" role="status" aria-label="Loading requirements document">
        <div class="loading-spinner"></div>
        <p>Loading requirements document…</p>
      </div>
    `;
  }

  private renderContent(html: string): void {
    const styles = this.renderer.getStyles();

    this.container.innerHTML = `
      <style>${styles}</style>
      <div class="view-header">
        <h2>Requirements Document</h2>
        <p class="view-description">SeraphimOS core platform requirements specification</p>
      </div>
      <div class="document-content">
        ${html}
      </div>
    `;

    const contentEl = this.container.querySelector('.document-content');
    if (contentEl) {
      this.renderer.attachCopyHandlers(contentEl as HTMLElement);
    }
  }
}
