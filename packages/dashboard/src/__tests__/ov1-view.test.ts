import { describe, it, expect, beforeEach } from 'vitest';
import { ov1Definition } from '../views/seraphim-core/diagram-definitions/ov1-definition.js';
import { OV1View } from '../views/seraphim-core/ov1-view.js';
import { DiagramRenderer } from '../views/seraphim-core/diagram-renderer.js';

/**
 * OV-1 Operational View — Unit Tests
 *
 * Validates Requirements: 47b.4, 47b.5, 47b.6, 47b.7
 */
describe('OV-1 Diagram Definition', () => {
  describe('Requirement 47b.5: OV-1 depicts all required actors, pillars, and flows', () => {
    it('should include King as primary actor', () => {
      const king = ov1Definition.nodes.find((n) => n.id === 'king');
      expect(king).toBeDefined();
      expect(king!.label).toContain('King');
    });

    it('should include Seraphim Core as orchestrator', () => {
      const seraphim = ov1Definition.nodes.find((n) => n.id === 'seraphim');
      expect(seraphim).toBeDefined();
      expect(seraphim!.label).toContain('Seraphim');
      expect(seraphim!.layer).toBe('kernel');
    });

    it('should include all operational pillars: Eretz, ZionX, ZXMG, Zion Alpha', () => {
      const eretz = ov1Definition.nodes.find((n) => n.id === 'eretz');
      const zionx = ov1Definition.nodes.find((n) => n.id === 'zionx');
      const zxmg = ov1Definition.nodes.find((n) => n.id === 'zxmg');
      const zionAlpha = ov1Definition.nodes.find((n) => n.id === 'zionAlpha');

      expect(eretz).toBeDefined();
      expect(zionx).toBeDefined();
      expect(zxmg).toBeDefined();
      expect(zionAlpha).toBeDefined();
    });

    it('should include Otzar as a system service', () => {
      const otzar = ov1Definition.nodes.find((n) => n.id === 'otzar');
      expect(otzar).toBeDefined();
      expect(otzar!.layer).toBe('system');
    });

    it('should include external systems: App Stores, Social Platforms, Trading Markets', () => {
      const appStores = ov1Definition.nodes.find((n) => n.id === 'appStores');
      const socialPlatforms = ov1Definition.nodes.find((n) => n.id === 'socialPlatforms');
      const tradingMarkets = ov1Definition.nodes.find((n) => n.id === 'tradingMarkets');

      expect(appStores).toBeDefined();
      expect(socialPlatforms).toBeDefined();
      expect(tradingMarkets).toBeDefined();
    });

    it('should include information flows between King and Seraphim', () => {
      const kingToSeraphim = ov1Definition.connections.find(
        (c) => c.from === 'king' && c.to === 'seraphim'
      );
      const seraphimToKing = ov1Definition.connections.find(
        (c) => c.from === 'seraphim' && c.to === 'king'
      );

      expect(kingToSeraphim).toBeDefined();
      expect(kingToSeraphim!.label).toContain('Vision');
      expect(seraphimToKing).toBeDefined();
      expect(seraphimToKing!.label).toContain('Status');
    });

    it('should include Seraphim to Eretz strategy flow', () => {
      const flow = ov1Definition.connections.find(
        (c) => c.from === 'seraphim' && c.to === 'eretz'
      );
      expect(flow).toBeDefined();
      expect(flow!.label).toContain('Strategy');
    });

    it('should include Eretz to subsidiary directive flows', () => {
      const toZionX = ov1Definition.connections.find(
        (c) => c.from === 'eretz' && c.to === 'zionx'
      );
      const toZXMG = ov1Definition.connections.find(
        (c) => c.from === 'eretz' && c.to === 'zxmg'
      );
      const toZionAlpha = ov1Definition.connections.find(
        (c) => c.from === 'eretz' && c.to === 'zionAlpha'
      );

      expect(toZionX).toBeDefined();
      expect(toZXMG).toBeDefined();
      expect(toZionAlpha).toBeDefined();
    });

    it('should include business pillar to external system flows', () => {
      const zionxToApps = ov1Definition.connections.find(
        (c) => c.from === 'zionx' && c.to === 'appStores'
      );
      const zxmgToSocial = ov1Definition.connections.find(
        (c) => c.from === 'zxmg' && c.to === 'socialPlatforms'
      );
      const alphaToMarkets = ov1Definition.connections.find(
        (c) => c.from === 'zionAlpha' && c.to === 'tradingMarkets'
      );

      expect(zionxToApps).toBeDefined();
      expect(zxmgToSocial).toBeDefined();
      expect(alphaToMarkets).toBeDefined();
    });
  });

  describe('Requirement 47b.6: distinct colors for actor types, pillar domains, and flows', () => {
    it('should use interface layer for actors', () => {
      const king = ov1Definition.nodes.find((n) => n.id === 'king');
      expect(king!.layer).toBe('interface');
    });

    it('should use kernel layer for orchestrator', () => {
      const seraphim = ov1Definition.nodes.find((n) => n.id === 'seraphim');
      expect(seraphim!.layer).toBe('kernel');
    });

    it('should use application layer for business pillars', () => {
      const pillars = ['eretz', 'zionx', 'zxmg', 'zionAlpha'];
      for (const id of pillars) {
        const node = ov1Definition.nodes.find((n) => n.id === id);
        expect(node!.layer).toBe('application');
      }
    });

    it('should use system layer for system services', () => {
      const services = ['otzar', 'zikaron', 'mishmar'];
      for (const id of services) {
        const node = ov1Definition.nodes.find((n) => n.id === id);
        expect(node!.layer).toBe('system');
      }
    });

    it('should use driver layer for external systems', () => {
      const externals = ['appStores', 'socialPlatforms', 'tradingMarkets'];
      for (const id of externals) {
        const node = ov1Definition.nodes.find((n) => n.id === id);
        expect(node!.layer).toBe('driver');
      }
    });

    it('should use distinct flow types for different connection categories', () => {
      const commandFlows = ov1Definition.connections.filter((c) => c.type === 'command');
      const dataFlows = ov1Definition.connections.filter((c) => c.type === 'data');
      const informationFlows = ov1Definition.connections.filter((c) => c.type === 'information');

      expect(commandFlows.length).toBeGreaterThan(0);
      expect(dataFlows.length).toBeGreaterThan(0);
      expect(informationFlows.length).toBeGreaterThan(0);
    });
  });

  describe('Requirement 47b.4: renders as color SVG following INCOSE OV-1 conventions', () => {
    it('should have a title indicating OV-1', () => {
      expect(ov1Definition.title).toContain('OV-1');
    });

    it('should define layers for operational grouping', () => {
      expect(ov1Definition.layers).toBeDefined();
      expect(ov1Definition.layers!.length).toBeGreaterThanOrEqual(4);
    });

    it('should render to valid SVG via DiagramRenderer', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(ov1Definition);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('viewBox');
    });
  });

  describe('Requirement 47b.7: text labels legible at default zoom', () => {
    it('should use a canvas width of at least 1000px for adequate label spacing', () => {
      expect(ov1Definition.width).toBeGreaterThanOrEqual(1000);
    });

    it('should render text with font-size >= 13px (DiagramRenderer default)', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(ov1Definition);

      // DiagramRenderer uses font-size="13" for node labels
      expect(svg).toContain('font-size="13"');
    });

    it('should have all node labels present in rendered SVG', () => {
      const renderer = new DiagramRenderer();
      const svg = renderer.render(ov1Definition);

      for (const node of ov1Definition.nodes) {
        expect(svg).toContain(node.label);
      }
    });
  });
});

describe('OV1View', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('should mount and render the OV-1 diagram into the container', async () => {
    const view = new OV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('OV-1 Operational View');
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('data-diagram="ov1"');
  });

  it('should include a legend with all flow types', async () => {
    const view = new OV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('Command Flow');
    expect(container.innerHTML).toContain('Data Flow');
    expect(container.innerHTML).toContain('Event Flow');
    expect(container.innerHTML).toContain('Information Flow');
  });

  it('should include accessible role and aria-label on diagram container', async () => {
    const view = new OV1View(container);
    await view.mount();

    expect(container.innerHTML).toContain('role="figure"');
    expect(container.innerHTML).toContain('aria-label=');
  });

  it('should unmount and clear the container', async () => {
    const view = new OV1View(container);
    await view.mount();
    expect(container.innerHTML).not.toBe('');

    view.unmount();
    expect(container.innerHTML).toBe('');
  });
});
