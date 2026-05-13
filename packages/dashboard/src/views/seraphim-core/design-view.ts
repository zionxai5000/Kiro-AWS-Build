/**
 * Shaar Dashboard — Design Document View
 *
 * Renders the design.md spec document as formatted HTML
 * using the MarkdownRenderer. The document content is bundled
 * statically via Vite's ?raw import — no backend API required.
 *
 * Requirements: 47f.22, 47f.24
 */

import { MarkdownRenderer } from './markdown-renderer.js';
import { designContent } from '../../data/spec-documents.js';

/**
 * DesignView renders the design.md spec document
 * as styled HTML within the dashboard.
 */
export class DesignView {
  private container: HTMLElement;
  private renderer: MarkdownRenderer;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new MarkdownRenderer();
  }

  /**
   * Mount the Design view into the container.
   * Renders the bundled document content as HTML.
   */
  async mount(): Promise<void> {
    this.showLoading();

    const html = await this.renderer.render(designContent);
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
        <h2>Design Document</h2>
        <p class="view-description">SeraphimOS core platform architecture and design specification</p>
      </div>
      <div class="document-loading" role="status" aria-label="Loading design document">
        <div class="loading-spinner"></div>
        <p>Loading design document…</p>
      </div>
    `;
  }

  private renderContent(html: string): void {
    const styles = this.renderer.getStyles();

    this.container.innerHTML = `
      <style>${styles}</style>
      <div class="view-header">
        <h2>Design Document</h2>
        <p class="view-description">SeraphimOS core platform architecture and design specification</p>
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
