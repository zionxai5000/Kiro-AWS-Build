/**
 * Shaar Dashboard — SV-1 System View
 *
 * Renders the INCOSE SV-1 System Architecture diagram showing the
 * six-layer decomposition of SeraphimOS: Interface, Kernel, System Services,
 * Application, Driver, and Data layers with component-to-component
 * data flows, directional indicators, and labeled connections.
 *
 * Uses DiagramRenderer to generate a responsive SVG from the structured
 * SV-1 diagram definition. Text labels are sized for legibility at
 * default zoom level (13px minimum on a 1200px viewBox).
 *
 * Requirements: 47c.8, 47c.9, 47c.10, 47c.11, 47c.12
 */

import { DiagramRenderer } from './diagram-renderer.js';
import { sv1Definition } from './diagram-definitions/sv1-definition.js';
import { DiagramModal } from './diagram-modal.js';

export class SV1View {
  private container: HTMLElement;
  private renderer: DiagramRenderer;
  private modal: DiagramModal;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new DiagramRenderer();
    this.modal = new DiagramModal();
  }

  /**
   * Mount the SV-1 view into the container.
   * Renders the system architecture diagram as an SVG.
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
    const svgContent = this.renderer.render(sv1Definition);

    this.container.innerHTML = `
      <div class="view-header">
        <h2>SV-1 System View</h2>
        <p class="view-description">INCOSE system architecture — six-layer decomposition with component data flows</p>
      </div>
      <div class="diagram-container" data-diagram="sv1" role="figure" aria-label="SV-1 System View diagram showing six architectural layers: Interface, Kernel, System Services, Application, Driver, and Data with inter-layer connections">
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
        <div class="legend-layers">
          <div class="legend-item">
            <span class="legend-swatch" style="background:#DBEAFE"></span>
            <span class="legend-label">Interface Layer (Shaar)</span>
          </div>
          <div class="legend-item">
            <span class="legend-swatch" style="background:#7C3AED"></span>
            <span class="legend-label">Kernel (Seraphim Core)</span>
          </div>
          <div class="legend-item">
            <span class="legend-swatch" style="background:#047857"></span>
            <span class="legend-label">System Services</span>
          </div>
          <div class="legend-item">
            <span class="legend-swatch" style="background:#F59E0B"></span>
            <span class="legend-label">Application Layer</span>
          </div>
          <div class="legend-item">
            <span class="legend-swatch" style="background:#475569"></span>
            <span class="legend-label">Driver Layer</span>
          </div>
          <div class="legend-item">
            <span class="legend-swatch" style="background:#4338CA"></span>
            <span class="legend-label">Data Layer</span>
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
