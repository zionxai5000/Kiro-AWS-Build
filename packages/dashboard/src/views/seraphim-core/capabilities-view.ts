/**
 * Shaar Dashboard — Capabilities Document View
 *
 * Renders the capabilities.md spec document as formatted HTML
 * using the MarkdownRenderer. The document content is bundled
 * statically via Vite's ?raw import — no backend API required.
 *
 * Requirements: 47g.25, 47g.27
 */

import { MarkdownRenderer } from './markdown-renderer.js';
import { capabilitiesContent } from '../../data/spec-documents.js';

/**
 * CapabilitiesView renders the capabilities.md spec document
 * as styled HTML within the dashboard.
 */
export class CapabilitiesView {
  private container: HTMLElement;
  private renderer: MarkdownRenderer;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new MarkdownRenderer();
  }

  /**
   * Mount the Capabilities view into the container.
   * Renders the bundled document content as HTML.
   */
  async mount(): Promise<void> {
    this.showLoading();

    const html = await this.renderer.render(capabilitiesContent);
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
        <h2>Capabilities Document</h2>
        <p class="view-description">SeraphimOS core platform capabilities specification</p>
      </div>
      <div class="document-loading" role="status" aria-label="Loading capabilities document">
        <div class="loading-spinner"></div>
        <p>Loading capabilities document…</p>
      </div>
    `;
  }

  private renderContent(html: string): void {
    const styles = this.renderer.getStyles();

    this.container.innerHTML = `
      <style>${styles}</style>
      <div class="view-header">
        <h2>Capabilities Document</h2>
        <p class="view-description">SeraphimOS core platform capabilities specification</p>
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
