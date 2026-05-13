/**
 * Shaar Dashboard — Diagram Modal
 *
 * Full-viewport overlay for viewing architecture diagrams with pan/zoom
 * interaction. Opens when the King clicks on an OV-1 or SV-1 diagram,
 * displaying the SVG at full viewport size with a toolbar for zoom
 * controls and a percentage indicator.
 *
 * Closes on: Escape key, close button click, or backdrop click.
 * Animates open/close with 200ms transition.
 *
 * Requirements: 47d.13, 47d.14, 47d.15, 47d.16, 47d.17, 47d.18
 */

import { PanZoomController } from './pan-zoom-controller.js';

export class DiagramModal {
  private overlay: HTMLElement | null = null;
  private controller: PanZoomController | null = null;
  private zoomIndicator: HTMLElement | null = null;
  private contentWrapper: HTMLElement | null = null;

  // Bound handlers for cleanup
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private boundHandleBackdropClick: (e: MouseEvent) => void;

  constructor() {
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleBackdropClick = this.handleBackdropClick.bind(this);
  }

  /**
   * Open the modal with the given SVG content.
   * Animates in over 200ms.
   */
  open(svgContent: string): void {
    if (this.overlay) return; // Already open

    this.createOverlay(svgContent);
    this.setupController();
    this.addEventListeners();

    // Trigger open animation on next frame
    requestAnimationFrame(() => {
      if (this.overlay) {
        this.overlay.classList.add('diagram-modal--open');
      }
    });
  }

  /**
   * Close the modal with 200ms animation.
   */
  close(): void {
    if (!this.overlay) return;

    this.overlay.classList.remove('diagram-modal--open');
    this.overlay.classList.add('diagram-modal--closing');

    // Remove after animation completes
    setTimeout(() => {
      this.destroy();
    }, 200);
  }

  /**
   * Check if the modal is currently open.
   */
  isOpen(): boolean {
    return this.overlay !== null;
  }

  /**
   * Clean up all resources immediately (no animation).
   */
  destroy(): void {
    this.removeEventListeners();

    if (this.controller) {
      this.controller.detach();
      this.controller = null;
    }

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    this.overlay = null;
    this.zoomIndicator = null;
    this.contentWrapper = null;
  }

  // --- Private methods ---

  private createOverlay(svgContent: string): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'diagram-modal';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Diagram zoom view');

    this.overlay.innerHTML = `
      <div class="diagram-modal__backdrop"></div>
      <div class="diagram-modal__container">
        <div class="diagram-modal__toolbar">
          <button class="diagram-modal__btn diagram-modal__btn--zoom-out" aria-label="Zoom out" data-action="zoom-out">−</button>
          <span class="diagram-modal__zoom-indicator" aria-live="polite">100%</span>
          <button class="diagram-modal__btn diagram-modal__btn--zoom-in" aria-label="Zoom in" data-action="zoom-in">+</button>
          <button class="diagram-modal__btn diagram-modal__btn--reset" aria-label="Reset zoom" data-action="reset">Reset</button>
          <button class="diagram-modal__btn diagram-modal__btn--close" aria-label="Close diagram" data-action="close">✕</button>
        </div>
        <div class="diagram-modal__viewport" style="cursor: grab;">
          <div class="diagram-modal__content">
            ${svgContent}
          </div>
        </div>
      </div>
    `;

    this.zoomIndicator = this.overlay.querySelector('.diagram-modal__zoom-indicator');
    this.contentWrapper = this.overlay.querySelector('.diagram-modal__content');

    // Toolbar button handlers
    const toolbar = this.overlay.querySelector('.diagram-modal__toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', (e: Event) => {
        const target = (e.target as HTMLElement).closest('[data-action]');
        if (!target) return;

        const action = (target as HTMLElement).dataset.action;
        switch (action) {
          case 'zoom-in':
            this.controller?.zoomIn();
            break;
          case 'zoom-out':
            this.controller?.zoomOut();
            break;
          case 'reset':
            this.controller?.reset();
            break;
          case 'close':
            this.close();
            break;
        }
      });
    }

    document.body.appendChild(this.overlay);
  }

  private setupController(): void {
    const viewport = this.overlay?.querySelector('.diagram-modal__viewport') as HTMLElement | null;
    if (!viewport) return;

    this.controller = new PanZoomController({
      minZoom: 0.25,
      maxZoom: 4,
      zoomStep: 0.1,
      onStateChange: (state) => {
        this.updateTransform();
        this.updateZoomIndicator(state.zoom);
      },
    });

    this.controller.attach(viewport);
  }

  private updateTransform(): void {
    if (!this.contentWrapper || !this.controller) return;
    this.contentWrapper.style.transform = this.controller.getTransform();
  }

  private updateZoomIndicator(zoom: number): void {
    if (!this.zoomIndicator) return;
    this.zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
  }

  private addEventListeners(): void {
    document.addEventListener('keydown', this.boundHandleKeyDown);

    const backdrop = this.overlay?.querySelector('.diagram-modal__backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', this.boundHandleBackdropClick);
    }
  }

  private removeEventListeners(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);

    const backdrop = this.overlay?.querySelector('.diagram-modal__backdrop');
    if (backdrop) {
      backdrop.removeEventListener('click', this.boundHandleBackdropClick);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    }
  }

  private handleBackdropClick(_e: MouseEvent): void {
    this.close();
  }
}
