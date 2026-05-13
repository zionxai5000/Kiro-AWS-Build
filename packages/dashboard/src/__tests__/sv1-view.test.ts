import { describe, it, expect, beforeEach } from 'vitest';
import { sv1Definition } from '../views/seraphim-core/diagram-definitions/sv1-definition.js';
import { SV1View } from '../views/seraphim-core/sv1-view.js';
import { DiagramRenderer } from '../views/seraphim-core/diagram-renderer.js';

/**
 * SV-1 System View — Unit Tests
 *
 * Validates Requirements: 47c.8, 47c.9, 47c.10, 47c.11, 47c.12
 */
describe('SV-1 Diagram Definition', () => {
  describe('Requirement 47c.9: depicts six architectural layers with all components', () => {
    it('should define exactly 6 layers', () => {
      expect(sv1Definition.layers).toBeDefined();
      expect(sv1Definition.layers!.length).toBe(6);
    });

    it('should include Interface Layer (Shaar) with all components', () => {
      const interfaceLayer = sv1Definition.layers!.find((l) => l.type === 'interface');
      expect(interfaceLayer).toBeDefined();
      expect(interfaceLayer!.label).toContain('Interface');

      const interfaceNodes = sv1Definition.nodes.filter((n) => n.layer === 'interface');
      const labels = interfaceNodes.map((n) => n.label);
      expect(labels).toContain('Web Dashboard');
      expect(labels).toContain('REST API');
      expect(labels).toContain('WebSocket API');
      expect(labels).toContain('CLI');
      expect(labels).toContain('Voice');
      expect(labels).toContain('Messaging');
    });

    it('should include Kernel (Seraphim Core) with all components', () => {
      const kernelLayer = sv1Definition.layers!.find((l) => l.type === 'kernel');
      expect(kernelLayer).toBeDefined();
      expect(kernelLayer!.label).toContain('Kernel');

      const kernelNodes = sv1Definition.nodes.filter((n) => n.layer === 'kernel');
      const labels = kernelNodes.map((n) => n.label);
      expect(labels).toContain('Agent Runtime');
      expect(labels).toContain('State Machine Engine');
      expect(labels).toContain('Permission System');
      expect(labels).toContain('Lifecycle Manager');
      expect(labels).toContain('IPC Router');
    });

    it('should include System Services with all components', () => {
      const systemLayer = sv1Definition.layers!.find((l) => l.type === 'system');
      expect(systemLayer).toBeDefined();
      expect(systemLayer!.label).toContain('System Services');

      const systemNodes = sv1Definition.nodes.filter((n) => n.layer === 'system');
      const labels = systemNodes.map((n) => n.label);
      expect(labels.some((l) => l.includes('Zikaron'))).toBe(true);
      expect(labels.some((l) => l.includes('Mishmar'))).toBe(true);
      expect(labels.some((l) => l.includes('Otzar'))).toBe(true);
      expect(labels.some((l) => l.includes('XO Audit'))).toBe(true);
      expect(labels.some((l) => l.includes('Event Bus'))).toBe(true);
      expect(labels.some((l) => l.includes('Learning Engine'))).toBe(true);
    });

    it('should include Application Layer with all components', () => {
      const appLayer = sv1Definition.layers!.find((l) => l.type === 'application');
      expect(appLayer).toBeDefined();
      expect(appLayer!.label).toContain('Application');

      const appNodes = sv1Definition.nodes.filter((n) => n.layer === 'application');
      const labels = appNodes.map((n) => n.label);
      expect(labels.some((l) => l.includes('ZionX'))).toBe(true);
      expect(labels.some((l) => l.includes('ZXMG'))).toBe(true);
      expect(labels.some((l) => l.includes('Zion Alpha'))).toBe(true);
      expect(labels.some((l) => l.includes('Eretz'))).toBe(true);
    });

    it('should include Driver Layer with all components', () => {
      const driverLayer = sv1Definition.layers!.find((l) => l.type === 'driver');
      expect(driverLayer).toBeDefined();
      expect(driverLayer!.label).toContain('Driver');

      const driverNodes = sv1Definition.nodes.filter((n) => n.layer === 'driver');
      const labels = driverNodes.map((n) => n.label);
      expect(labels).toContain('App Store Connect');
      expect(labels).toContain('Google Play');
      expect(labels).toContain('YouTube');
      expect(labels).toContain('Kalshi');
      expect(labels).toContain('Gmail');
      expect(labels).toContain('GitHub');
      expect(labels).toContain('LLM Providers');
    });

    it('should include Data Layer with all components', () => {
      const dataLayer = sv1Definition.layers!.find((l) => l.type === 'data');
      expect(dataLayer).toBeDefined();
      expect(dataLayer!.label).toContain('Data');

      const dataNodes = sv1Definition.nodes.filter((n) => n.layer === 'data');
      const labels = dataNodes.map((n) => n.label);
      expect(labels.some((l) => l.includes('Aurora'))).toBe(true);
      expect(labels).toContain('DynamoDB');
      expect(labels).toContain('S3');
      expect(labels).toContain('Secrets Manager');
    });
  });

  describe('Requirement 47c.10: directional indicators and labeled connections', () => {
    it('should have connections with labels', () => {
      const labeledConnections = sv1Definition.connections.filter((c) => c.label);
      expect(labeledConnections.length).toBeGreaterThan(10);
    });

    it('should include inter-layer connections from Interface to Kernel', () => {
      const interfaceToKernel = sv1Definition.connections.filter(
        (c) =>
          sv1Definition.nodes.find((n) => n.id === c.from)?.layer === 'interface' &&
          sv1Definition.nodes.find((n) => n.id === c.to)?.layer === 'kernel'
      );
      expect(interfaceToKernel.length).toBeGreaterThan(0);
    });

    it('should include inter-layer connections from Kernel to System Services', () => {
      const kernelToSystem = sv1Definition.connections.filter(
        (c) =>
          sv1Definition.nodes.find((n) => n.id === c.from)?.layer === 'kernel' &&
          sv1Definition.nodes.find((n) => n.id === c.to)?.layer === 'system'
      );
      expect(kernelToSystem.length).toBeGreaterThan(0);
    });

    it('should include inter-layer connections from Application to Driver', () => {
      const appToDriver = sv1Definition.connections.filter(
        (c) =>
          sv1Definition.nodes.find((n) => n.id === c.from)?.layer === 'application' &&
          sv1Definition.nodes.find((n) => n.id === c.to)?.layer === 'driver'
      );
      expect(appToDriver.length).toBeGreaterThan(0);
    });

    it('should render directional arrows via marker-end in SVG output', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);
      expect(svg).toContain('marker-end="url(#arrow-');
    });

    it('should render connection labels in SVG output', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);
      expect(svg).toContain('Commands');
      expect(svg).toContain('Memory Ops');
      expect(svg).toContain('Auth Checks');
    });
  });

  describe('Requirement 47c.11: distinct colors per architectural layer', () => {
    it('should assign each layer a different type for color differentiation', () => {
      const layerTypes = sv1Definition.layers!.map((l) => l.type);
      const uniqueTypes = new Set(layerTypes);
      expect(uniqueTypes.size).toBe(6);
    });

    it('should render distinct background colors for each layer in SVG', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);

      // Each layer type has a distinct background color
      expect(svg).toContain('#DBEAFE'); // interface
      expect(svg).toContain('#7C3AED'); // kernel
      expect(svg).toContain('#047857'); // system
      expect(svg).toContain('#F59E0B'); // application
      expect(svg).toContain('#475569'); // driver
      expect(svg).toContain('#4338CA'); // data
    });
  });

  describe('Requirement 47c.8: renders as color SVG following INCOSE SV-1 conventions', () => {
    it('should have a title indicating SV-1', () => {
      expect(sv1Definition.title).toContain('SV-1');
    });

    it('should render to valid SVG via DiagramRenderer', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('viewBox');
    });

    it('should render all nodes from the definition', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);

      for (const node of sv1Definition.nodes) {
        expect(svg).toContain(`data-node-id="${node.id}"`);
        expect(svg).toContain(node.label);
      }
    });

    it('should render all connections from the definition', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);

      for (const conn of sv1Definition.connections) {
        expect(svg).toContain(`data-from="${conn.from}"`);
        expect(svg).toContain(`data-to="${conn.to}"`);
      }
    });
  });

  describe('Requirement 47c.12: text labels legible at default zoom', () => {
    it('should use a canvas width of at least 1000px for adequate label spacing', () => {
      expect(sv1Definition.width).toBeGreaterThanOrEqual(1000);
    });

    it('should render text with font-size >= 13px (DiagramRenderer default)', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);
      expect(svg).toContain('font-size="13"');
    });

    it('should have all node labels present in rendered SVG', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(sv1Definition);

      for (const node of sv1Definition.nodes) {
        expect(svg).toContain(node.label);
      }
    });
  });
});

describe('SV1View', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('should mount and render the SV-1 diagram into the container', async () => {
    const view = new SV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('SV-1 System View');
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('data-diagram="sv1"');
  });

  it('should include a legend with all flow types', async () => {
    const view = new SV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('Command Flow');
    expect(container.innerHTML).toContain('Data Flow');
    expect(container.innerHTML).toContain('Event Flow');
    expect(container.innerHTML).toContain('Information Flow');
  });

  it('should include layer color swatches in the legend', async () => {
    const view = new SV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('Interface Layer (Shaar)');
    expect(container.innerHTML).toContain('Kernel (Seraphim Core)');
    expect(container.innerHTML).toContain('System Services');
    expect(container.innerHTML).toContain('Application Layer');
    expect(container.innerHTML).toContain('Driver Layer');
    expect(container.innerHTML).toContain('Data Layer');
  });

  it('should include accessible role and aria-label on diagram container', async () => {
    const view = new SV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('role="figure"');
    expect(container.innerHTML).toContain('aria-label=');
  });

  it('should unmount and clear the container', async () => {
    const view = new SV1View(container);
    await view.mount();
    expect(container.innerHTML).not.toBe('');

    view.unmount();
    expect(container.innerHTML).toBe('');
  });
});
