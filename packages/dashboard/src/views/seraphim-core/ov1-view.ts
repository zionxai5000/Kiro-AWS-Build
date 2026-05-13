/**
 * Shaar Dashboard — OV-1 Operational View
 *
 * Renders the INCOSE OV-1 Operational Architecture diagram showing
 * the operational context of SeraphimOS: actors, orchestrator, pillars,
 * system services, external systems, and information flows.
 *
 * Uses DiagramRenderer to generate a responsive SVG from the structured
 * OV-1 diagram definition. Text labels are sized for legibility at
 * default zoom level (13px minimum on a 1100px viewBox).
 *
 * Requirements: 47b.4, 47b.5, 47b.6, 47b.7
 */

import { DiagramRenderer } from './diagram-renderer.js';
import { ov1Definition } from './diagram-definitions/ov1-definition.js';
import { DiagramModal } from './diagram-modal.js';

export class OV1View {
  private container: HTMLElement;
  private renderer: DiagramRenderer;
  private modal: DiagramModal;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new DiagramRenderer();
    this.modal = new DiagramModal();
  }

  /**
   * Mount the OV-1 view into the container.
   * Renders the operational architecture diagram as an SVG.
   */
  async mount(): Promise<void> {
    this.render();
    this.attachDiagramClickHandler();
  }

  /**
   * Unmount the view and clean up DOM content.
   */
  unmount(): void {
    this.modal.destroy();
    this.container.innerHTML = '';
  }

  private render(): void {
    const svgContent = this.renderer.render(ov1Definition);

    this.container.innerHTML = `
      <div class="view-header">
        <h2>OV-1 Operational View</h2>
        <p class="view-description">INCOSE operational architecture — actors, pillars, and information flows</p>
      </div>
      <div class="diagram-container" data-diagram="ov1" role="figure" aria-label="OV-1 Operational View diagram showing King, Seraphim Core, operational pillars, and external systems">
        ${svgContent}
      </div>
      <div class="diagram-legend">
        <h3>Legend</h3>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-line legend-command"></span>
            <span class="legend-label">Command Flow</span>
          </div>
          <div class="legend-item">
            <span class="legend-line legend-data"></span>
            <span class="legend-label">Data Flow</span>
          </div>
          <div class="legend-item">
            <span class="legend-line legend-event"></span>
            <span class="legend-label">Event Flow</span>
          </div>
          <div class="legend-item">
            <span class="legend-line legend-information"></span>
            <span class="legend-label">Information Flow</span>
          </div>
        </div>
      </div>
    `;
  }

  private attachDiagramClickHandler(): void {
    const diagramContainer = this.container.querySelector('.diagram-container') as HTMLElement | null;
    if (!diagramContainer) return;

    diagramContainer.style.cursor = 'pointer';
    diagramContainer.addEventListener('click', () => {
      const svgEl = diagramContainer.querySelector('svg');
      if (svgEl) {
        this.modal.open(svgEl.outerHTML);
      }
    });
  }
}
