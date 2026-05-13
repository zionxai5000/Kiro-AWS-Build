import { describe, it, expect, beforeEach } from 'vitest';
import {
  DiagramRenderer,
  LAYER_COLORS,
  CONNECTION_STYLES,
  type DiagramDefinition,
  type DiagramNode,
  type DiagramConnection,
  type DiagramLayer,
  type LayerType,
  type FlowType,
} from '../views/seraphim-core/diagram-renderer.js';

/**
 * Calculate relative luminance of a hex color per WCAG 2.1 spec.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('DiagramRenderer', () => {
  let renderer: DiagramRenderer;

  beforeEach(() => {
    renderer = new DiagramRenderer();
  });

  describe('SVG structure', () => {
    it('should produce a valid SVG element with viewBox for responsive scaling', () => {
      const def: DiagramDefinition = {
        width: 800,
        height: 600,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);

      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 800 600"');
      expect(svg).toContain('width="100%"');
      expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(svg).toContain('</svg>');
    });

    it('should include role="img" for accessibility', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('role="img"');
    });

    it('should include a title element when title is provided', () => {
      const def: DiagramDefinition = {
        title: 'OV-1 Operational View',
        width: 800,
        height: 600,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('<title id="diagram-title">OV-1 Operational View</title>');
      expect(svg).toContain('aria-labelledby="diagram-title"');
    });

    it('should include aria-label when no title is provided', () => {
      const def: DiagramDefinition = {
        width: 800,
        height: 600,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('aria-label="Architecture diagram"');
    });

    it('should render arrowhead marker defs for each flow type', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('<defs>');
      expect(svg).toContain('id="arrow-command"');
      expect(svg).toContain('id="arrow-data"');
      expect(svg).toContain('id="arrow-event"');
      expect(svg).toContain('id="arrow-information"');
    });
  });

  describe('WCAG 2.1 AA color palette', () => {
    it('should define correct colors for Interface layer', () => {
      expect(LAYER_COLORS.interface).toEqual({ background: '#DBEAFE', text: '#1E3A5F' });
    });

    it('should define correct colors for Kernel layer', () => {
      expect(LAYER_COLORS.kernel).toEqual({ background: '#7C3AED', text: '#FFFFFF' });
    });

    it('should define correct colors for System Services layer', () => {
      expect(LAYER_COLORS.system).toEqual({ background: '#047857', text: '#FFFFFF' });
    });

    it('should define correct colors for Application layer', () => {
      expect(LAYER_COLORS.application).toEqual({ background: '#F59E0B', text: '#451A03' });
    });

    it('should define correct colors for Driver layer', () => {
      expect(LAYER_COLORS.driver).toEqual({ background: '#475569', text: '#FFFFFF' });
    });

    it('should define correct colors for Data layer', () => {
      expect(LAYER_COLORS.data).toEqual({ background: '#4338CA', text: '#FFFFFF' });
    });
  });

  describe('node rendering', () => {
    it('should render a node with correct layer colors', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [
          { id: 'n1', label: 'Agent Runtime', layer: 'kernel', x: 100, y: 100 },
        ],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('data-node-id="n1"');
      expect(svg).toContain('fill="#7C3AED"');
      expect(svg).toContain('Agent Runtime');
      // Text color for kernel is white
      expect(svg).toContain('fill="#FFFFFF"');
    });

    it('should render nodes with custom width and height', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [
          { id: 'n1', label: 'Wide Node', layer: 'interface', x: 50, y: 50, width: 200, height: 70 },
        ],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('width="200"');
      expect(svg).toContain('height="70"');
    });

    it('should use default dimensions when width/height not specified', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [
          { id: 'n1', label: 'Default', layer: 'system', x: 50, y: 50 },
        ],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('width="140"');
      expect(svg).toContain('height="50"');
    });

    it('should include aria-label on each node for accessibility', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [
          { id: 'n1', label: 'Zikaron Memory', layer: 'system', x: 50, y: 50 },
        ],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('aria-label="Zikaron Memory"');
    });

    it('should escape special XML characters in labels', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 300,
        nodes: [
          { id: 'n1', label: 'A & B <test>', layer: 'data', x: 50, y: 50 },
        ],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('A &amp; B &lt;test&gt;');
    });

    it('should render multiple nodes from different layers', () => {
      const def: DiagramDefinition = {
        width: 800,
        height: 600,
        nodes: [
          { id: 'n1', label: 'Dashboard', layer: 'interface', x: 100, y: 50 },
          { id: 'n2', label: 'Seraphim Core', layer: 'kernel', x: 100, y: 150 },
          { id: 'n3', label: 'Otzar', layer: 'system', x: 100, y: 250 },
        ],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('data-node-id="n1"');
      expect(svg).toContain('data-node-id="n2"');
      expect(svg).toContain('data-node-id="n3"');
      // Check each layer's background color appears
      expect(svg).toContain('#DBEAFE');
      expect(svg).toContain('#7C3AED');
      expect(svg).toContain('#047857');
    });
  });

  describe('connection rendering', () => {
    const twoNodes: DiagramNode[] = [
      { id: 'a', label: 'Source', layer: 'kernel', x: 50, y: 100 },
      { id: 'b', label: 'Target', layer: 'system', x: 50, y: 250 },
    ];

    it('should render a command connection with solid red line', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 400,
        nodes: twoNodes,
        connections: [{ from: 'a', to: 'b', type: 'command' }],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('stroke="#DC2626"');
      expect(svg).toContain('marker-end="url(#arrow-command)"');
      // Solid line: no stroke-dasharray
      expect(svg).not.toMatch(/data-type="command"[\s\S]*?stroke-dasharray/);
    });

    it('should render a data connection with solid blue line', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 400,
        nodes: twoNodes,
        connections: [{ from: 'a', to: 'b', type: 'data' }],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('stroke="#2563EB"');
      expect(svg).toContain('marker-end="url(#arrow-data)"');
    });

    it('should render an event connection with dashed green line', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 400,
        nodes: twoNodes,
        connections: [{ from: 'a', to: 'b', type: 'event' }],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('stroke="#16A34A"');
      expect(svg).toContain('stroke-dasharray="8,4"');
      expect(svg).toContain('marker-end="url(#arrow-event)"');
    });

    it('should render an information connection with dotted purple line', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 400,
        nodes: twoNodes,
        connections: [{ from: 'a', to: 'b', type: 'information' }],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('stroke="#9333EA"');
      expect(svg).toContain('stroke-dasharray="4,4"');
      expect(svg).toContain('marker-end="url(#arrow-information)"');
    });

    it('should render connection labels at midpoint', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 400,
        nodes: twoNodes,
        connections: [{ from: 'a', to: 'b', type: 'command', label: 'Directives' }],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('Directives');
    });

    it('should skip connections referencing non-existent nodes', () => {
      const def: DiagramDefinition = {
        width: 400,
        height: 400,
        nodes: twoNodes,
        connections: [{ from: 'a', to: 'nonexistent', type: 'data' }],
      };

      const svg = renderer.render(def);
      // Should not throw, just skip the connection
      expect(svg).toContain('<svg');
      expect(svg).not.toContain('data-to="nonexistent"');
    });

    it('should render horizontal connections when nodes are side by side', () => {
      const horizontalNodes: DiagramNode[] = [
        { id: 'left', label: 'Left', layer: 'interface', x: 50, y: 100 },
        { id: 'right', label: 'Right', layer: 'interface', x: 300, y: 100 },
      ];

      const def: DiagramDefinition = {
        width: 500,
        height: 300,
        nodes: horizontalNodes,
        connections: [{ from: 'left', to: 'right', type: 'data' }],
      };

      const svg = renderer.render(def);
      // Connection should exit from right side of left node (x=50+140=190)
      expect(svg).toContain('x1="190"');
      // Connection should enter left side of right node (x=300)
      expect(svg).toContain('x2="300"');
    });
  });

  describe('layer rendering', () => {
    it('should render layer background rectangles', () => {
      const def: DiagramDefinition = {
        width: 800,
        height: 600,
        nodes: [],
        connections: [],
        layers: [
          { id: 'interface', label: 'Interface Layer', type: 'interface', y: 20, height: 100 },
          { id: 'kernel', label: 'Kernel Layer', type: 'kernel', y: 130, height: 100 },
        ],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('data-layer="interface"');
      expect(svg).toContain('data-layer="kernel"');
      expect(svg).toContain('Interface Layer');
      expect(svg).toContain('Kernel Layer');
    });

    it('should apply layer colors with reduced opacity for backgrounds', () => {
      const def: DiagramDefinition = {
        width: 800,
        height: 600,
        nodes: [],
        connections: [],
        layers: [
          { id: 'system', label: 'System Services', type: 'system', y: 50, height: 120 },
        ],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('fill="#047857"');
      expect(svg).toContain('opacity="0.15"');
    });
  });

  describe('responsive scaling', () => {
    it('should use width="100%" for responsive container fitting', () => {
      const def: DiagramDefinition = {
        width: 1200,
        height: 800,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('width="100%"');
      expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    });

    it('should set max-width:100% and height:auto in style', () => {
      const def: DiagramDefinition = {
        width: 1000,
        height: 700,
        nodes: [],
        connections: [],
      };

      const svg = renderer.render(def);
      expect(svg).toContain('style="max-width:100%;height:auto;"');
    });
  });

  describe('connection style constants', () => {
    it('should define command as solid red', () => {
      expect(CONNECTION_STYLES.command).toEqual({ color: '#DC2626', dashArray: '' });
    });

    it('should define data as solid blue', () => {
      expect(CONNECTION_STYLES.data).toEqual({ color: '#2563EB', dashArray: '' });
    });

    it('should define event as dashed green', () => {
      expect(CONNECTION_STYLES.event).toEqual({ color: '#16A34A', dashArray: '8,4' });
    });

    it('should define information as dotted purple', () => {
      expect(CONNECTION_STYLES.information).toEqual({ color: '#9333EA', dashArray: '4,4' });
    });
  });

  describe('full diagram integration', () => {
    it('should render a complete diagram with layers, nodes, and connections', () => {
      const def: DiagramDefinition = {
        title: 'SV-1 System View',
        width: 1000,
        height: 700,
        layers: [
          { id: 'interface', label: 'Interface Layer (Shaar)', type: 'interface', y: 20, height: 120 },
          { id: 'kernel', label: 'Kernel (Seraphim Core)', type: 'kernel', y: 160, height: 120 },
          { id: 'system', label: 'System Services', type: 'system', y: 300, height: 120 },
        ],
        nodes: [
          { id: 'dashboard', label: 'Web Dashboard', layer: 'interface', x: 100, y: 50 },
          { id: 'api', label: 'REST API', layer: 'interface', x: 300, y: 50 },
          { id: 'runtime', label: 'Agent Runtime', layer: 'kernel', x: 200, y: 190 },
          { id: 'memory', label: 'Zikaron (Memory)', layer: 'system', x: 150, y: 330 },
          { id: 'governance', label: 'Mishmar (Governance)', layer: 'system', x: 350, y: 330 },
        ],
        connections: [
          { from: 'dashboard', to: 'api', type: 'data', label: 'HTTP/WS' },
          { from: 'api', to: 'runtime', type: 'command', label: 'Commands' },
          { from: 'runtime', to: 'memory', type: 'data', label: 'Memory Ops' },
          { from: 'runtime', to: 'governance', type: 'command', label: 'Auth Checks' },
        ],
      };

      const svg = renderer.render(def);

      // Structure
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('viewBox="0 0 1000 700"');

      // Title
      expect(svg).toContain('SV-1 System View');

      // Layers
      expect(svg).toContain('Interface Layer (Shaar)');
      expect(svg).toContain('Kernel (Seraphim Core)');
      expect(svg).toContain('System Services');

      // Nodes
      expect(svg).toContain('Web Dashboard');
      expect(svg).toContain('REST API');
      expect(svg).toContain('Agent Runtime');
      expect(svg).toContain('Zikaron (Memory)');
      expect(svg).toContain('Mishmar (Governance)');

      // Connections
      expect(svg).toContain('HTTP/WS');
      expect(svg).toContain('Commands');
      expect(svg).toContain('Memory Ops');
      expect(svg).toContain('Auth Checks');

      // Flow type colors present
      expect(svg).toContain('#DC2626'); // command
      expect(svg).toContain('#2563EB'); // data
    });

    it('should render every node from the definition (completeness check)', () => {
      const nodes: DiagramNode[] = [
        { id: 'n1', label: 'Node One', layer: 'interface', x: 50, y: 50 },
        { id: 'n2', label: 'Node Two', layer: 'kernel', x: 200, y: 50 },
        { id: 'n3', label: 'Node Three', layer: 'system', x: 350, y: 50 },
        { id: 'n4', label: 'Node Four', layer: 'application', x: 500, y: 50 },
        { id: 'n5', label: 'Node Five', layer: 'driver', x: 50, y: 150 },
        { id: 'n6', label: 'Node Six', layer: 'data', x: 200, y: 150 },
      ];

      const def: DiagramDefinition = {
        width: 800,
        height: 400,
        nodes,
        connections: [],
      };

      const svg = renderer.render(def);

      // Every node must appear in the output
      for (const node of nodes) {
        expect(svg).toContain(`data-node-id="${node.id}"`);
        expect(svg).toContain(node.label);
      }
    });

    it('should render every connection from the definition (completeness check)', () => {
      const nodes: DiagramNode[] = [
        { id: 'a', label: 'A', layer: 'interface', x: 50, y: 50 },
        { id: 'b', label: 'B', layer: 'kernel', x: 50, y: 200 },
        { id: 'c', label: 'C', layer: 'system', x: 250, y: 50 },
        { id: 'd', label: 'D', layer: 'application', x: 250, y: 200 },
      ];

      const connections: DiagramConnection[] = [
        { from: 'a', to: 'b', type: 'command', label: 'Cmd Flow' },
        { from: 'a', to: 'c', type: 'data', label: 'Data Flow' },
        { from: 'b', to: 'd', type: 'event', label: 'Event Flow' },
        { from: 'c', to: 'd', type: 'information', label: 'Info Flow' },
      ];

      const def: DiagramDefinition = {
        width: 600,
        height: 400,
        nodes,
        connections,
      };

      const svg = renderer.render(def);

      // Every connection must appear in the output
      for (const conn of connections) {
        expect(svg).toContain(`data-from="${conn.from}"`);
        expect(svg).toContain(`data-to="${conn.to}"`);
        expect(svg).toContain(`data-type="${conn.type}"`);
        if (conn.label) {
          expect(svg).toContain(conn.label);
        }
      }
    });
  });

  describe('WCAG 2.1 AA contrast ratio compliance (Requirement 47i.35)', () => {
    const WCAG_AA_MIN_RATIO = 4.5;

    it('should meet 4.5:1 contrast ratio for Interface layer (text on background)', () => {
      const { background, text } = LAYER_COLORS.interface;
      const ratio = contrastRatio(background, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    });

    it('should meet 4.5:1 contrast ratio for Kernel layer (text on background)', () => {
      const { background, text } = LAYER_COLORS.kernel;
      const ratio = contrastRatio(background, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    });

    it('should meet 4.5:1 contrast ratio for System Services layer (text on background)', () => {
      const { background, text } = LAYER_COLORS.system;
      const ratio = contrastRatio(background, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    });

    it('should meet 4.5:1 contrast ratio for Application layer (text on background)', () => {
      const { background, text } = LAYER_COLORS.application;
      const ratio = contrastRatio(background, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    });

    it('should meet 4.5:1 contrast ratio for Driver layer (text on background)', () => {
      const { background, text } = LAYER_COLORS.driver;
      const ratio = contrastRatio(background, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    });

    it('should meet 4.5:1 contrast ratio for Data layer (text on background)', () => {
      const { background, text } = LAYER_COLORS.data;
      const ratio = contrastRatio(background, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
    });

    it('should meet 4.5:1 contrast ratio for all layers (comprehensive check)', () => {
      const layerTypes: LayerType[] = ['interface', 'kernel', 'system', 'application', 'driver', 'data'];

      for (const layer of layerTypes) {
        const { background, text } = LAYER_COLORS[layer];
        const ratio = contrastRatio(background, text);
        expect(
          ratio,
          `Layer "${layer}" (text ${text} on bg ${background}) has contrast ratio ${ratio.toFixed(2)}, needs >= ${WCAG_AA_MIN_RATIO}`
        ).toBeGreaterThanOrEqual(WCAG_AA_MIN_RATIO);
      }
    });
  });
});
