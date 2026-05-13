/**
 * Shaar Dashboard — Diagram Renderer (SVG Generation Engine)
 *
 * Generates WCAG 2.1 AA compliant SVG diagrams from structured definitions.
 * Used by OV-1 Operational View and SV-1 System View to render architecture
 * diagrams with color-coded layers, labeled nodes, and typed connections.
 *
 * Features:
 * - Gradient fills with subtle top-to-bottom shading
 * - Drop shadows via SVG filters
 * - Bezier curve connections for smooth flow lines
 * - Modern rounded corners and refined typography
 *
 * Requirements: 47b.4, 47c.8, 47i.33, 47i.34, 47i.35, 47i.36, 47j.37
 */

// --- Types ---

export type LayerType = 'interface' | 'kernel' | 'system' | 'application' | 'driver' | 'data';

export type FlowType = 'command' | 'data' | 'event' | 'information';

export interface DiagramNode {
  id: string;
  label: string;
  layer: LayerType;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface DiagramConnection {
  from: string;
  to: string;
  type: FlowType;
  label?: string;
}

export interface DiagramLayer {
  id: string;
  label: string;
  type: LayerType;
  y: number;
  height: number;
}

export interface DiagramDefinition {
  title?: string;
  width: number;
  height: number;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  layers?: DiagramLayer[];
}

// --- Color Palette (WCAG 2.1 AA Compliant) ---

export interface LayerColors {
  background: string;
  backgroundLight: string;
  text: string;
  stroke: string;
}

export const LAYER_COLORS: Record<LayerType, LayerColors> = {
  interface: { background: '#DBEAFE', backgroundLight: '#EFF6FF', text: '#1E3A5F', stroke: '#93C5FD' },
  kernel: { background: '#7C3AED', backgroundLight: '#8B5CF6', text: '#FFFFFF', stroke: '#6D28D9' },
  system: { background: '#047857', backgroundLight: '#059669', text: '#FFFFFF', stroke: '#065F46' },
  application: { background: '#F59E0B', backgroundLight: '#FBBF24', text: '#451A03', stroke: '#D97706' },
  driver: { background: '#475569', backgroundLight: '#64748B', text: '#FFFFFF', stroke: '#334155' },
  data: { background: '#4338CA', backgroundLight: '#6366F1', text: '#FFFFFF', stroke: '#3730A3' },
};

export interface ConnectionStyle {
  color: string;
  dashArray: string;
}

export const CONNECTION_STYLES: Record<FlowType, ConnectionStyle> = {
  command: { color: '#DC2626', dashArray: '' },
  data: { color: '#2563EB', dashArray: '' },
  event: { color: '#16A34A', dashArray: '8,4' },
  information: { color: '#9333EA', dashArray: '4,4' },
};

// --- Renderer ---

export class DiagramRenderer {
  private readonly defaultNodeWidth = 140;
  private readonly defaultNodeHeight = 50;
  private readonly nodeCornerRadius = 12;
  private readonly fontSize = 14;
  private readonly fontWeight = 500;
  private readonly layerLabelFontSize = 16;
  private readonly arrowSize = 8;
  private readonly padding = 20;
  private readonly layerPadding = 30;
  private readonly connectionStrokeWidth = 2;

  /**
   * Render a structured diagram definition to an SVG string.
   * The SVG uses viewBox-based scaling to fit any container width responsively.
   */
  render(definition: DiagramDefinition): string {
    const { width, height, nodes, connections, layers, title } = definition;

    const svgParts: string[] = [];

    // Open SVG with responsive viewBox
    svgParts.push(this.openSvg(width, height, title));

    // Render defs (arrowheads, gradients, filters)
    svgParts.push(this.renderDefs(nodes));

    // Render layer backgrounds if defined
    if (layers && layers.length > 0) {
      svgParts.push(this.renderLayers(layers, width));
    }

    // Render connections (bezier curves with arrows)
    svgParts.push(this.renderConnections(connections, nodes));

    // Render nodes
    svgParts.push(this.renderNodes(nodes));

    // Close SVG
    svgParts.push('</svg>');

    return svgParts.join('\n');
  }

  private openSvg(width: number, height: number, title?: string): string {
    const titleElement = title
      ? `<title>${this.escapeXml(title)}</title>`
      : '';

    return [
      `<svg xmlns="http://www.w3.org/2000/svg"`,
      `  viewBox="0 0 ${width} ${height}"`,
      `  width="100%"`,
      `  preserveAspectRatio="xMidYMid meet"`,
      `  role="img"`,
      title ? `  aria-labelledby="diagram-title"` : `  aria-label="Architecture diagram"`,
      `  style="max-width:100%;height:auto;">`,
      title ? `  <title id="diagram-title">${this.escapeXml(title)}</title>` : titleElement,
    ].filter(Boolean).join('\n');
  }

  private renderDefs(nodes: DiagramNode[]): string {
    const markers = Object.entries(CONNECTION_STYLES).map(([type, style]) => {
      return [
        `    <marker id="arrow-${type}" markerWidth="${this.arrowSize}" markerHeight="${this.arrowSize}"`,
        `      refX="${this.arrowSize}" refY="${this.arrowSize / 2}"`,
        `      orient="auto" markerUnits="strokeWidth">`,
        `      <path d="M0,0 L${this.arrowSize},${this.arrowSize / 2} L0,${this.arrowSize} Z"`,
        `        fill="${style.color}" />`,
        `    </marker>`,
      ].join('\n');
    });

    // Drop shadow filter
    const shadowFilter = [
      `    <filter id="drop-shadow" x="-4%" y="-4%" width="108%" height="116%">`,
      `      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.12" />`,
      `    </filter>`,
    ].join('\n');

    // Generate gradient defs for each unique layer type used by nodes
    const layerTypes = new Set(nodes.map((n) => n.layer));
    const gradients = Array.from(layerTypes).map((layerType) => {
      const colors = LAYER_COLORS[layerType];
      return [
        `    <linearGradient id="grad-${layerType}" x1="0%" y1="0%" x2="0%" y2="100%">`,
        `      <stop offset="0%" stop-color="${colors.backgroundLight}" />`,
        `      <stop offset="100%" stop-color="${colors.background}" />`,
        `    </linearGradient>`,
      ].join('\n');
    });

    return `  <defs>\n${markers.join('\n')}\n${shadowFilter}\n${gradients.join('\n')}\n  </defs>`;
  }

  private renderLayers(layers: DiagramLayer[], svgWidth: number): string {
    const parts = layers.map((layer) => {
      const colors = LAYER_COLORS[layer.type];
      const x = this.layerPadding;
      const width = svgWidth - this.layerPadding * 2;
      return [
        `  <g class="layer" data-layer="${layer.id}">`,
        `    <rect x="${x}" y="${layer.y}" width="${width}" height="${layer.height}"`,
        `      fill="${colors.background}" opacity="0.1" rx="8" ry="8" />`,
        `    <rect x="${x}" y="${layer.y}" width="${width}" height="${layer.height}"`,
        `      fill="none" stroke="${colors.background}" stroke-width="1" opacity="0.25" rx="8" ry="8" />`,
        `    <text x="${x + 14}" y="${layer.y + 22}"`,
        `      font-size="${this.layerLabelFontSize}" font-weight="700"`,
        `      fill="${colors.background}" opacity="0.7"`,
        `      font-family="system-ui, -apple-system, sans-serif">`,
        `      ${this.escapeXml(layer.label)}`,
        `    </text>`,
        `  </g>`,
      ].join('\n');
    });

    return parts.join('\n');
  }

  private renderNodes(nodes: DiagramNode[]): string {
    const parts = nodes.map((node) => {
      const w = node.width ?? this.defaultNodeWidth;
      const h = node.height ?? this.defaultNodeHeight;
      const colors = LAYER_COLORS[node.layer];

      return [
        `  <g class="node" data-node-id="${node.id}" role="graphics-symbol" aria-label="${this.escapeXml(node.label)}">`,
        `    <rect x="${node.x}" y="${node.y}" width="${w}" height="${h}"`,
        `      rx="${this.nodeCornerRadius}" ry="${this.nodeCornerRadius}"`,
        `      fill="url(#grad-${node.layer})" stroke="${colors.stroke}" stroke-width="1.5"`,
        `      filter="url(#drop-shadow)" />`,
        `    <text x="${node.x + w / 2}" y="${node.y + h / 2}"`,
        `      text-anchor="middle" dominant-baseline="central"`,
        `      font-size="${this.fontSize}" font-weight="${this.fontWeight}" fill="${colors.text}"`,
        `      font-family="system-ui, -apple-system, sans-serif">`,
        `      ${this.escapeXml(node.label)}`,
        `    </text>`,
        `  </g>`,
      ].join('\n');
    });

    return parts.join('\n');
  }

  private renderConnections(connections: DiagramConnection[], nodes: DiagramNode[]): string {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const parts = connections.map((conn) => {
      const fromNode = nodeMap.get(conn.from);
      const toNode = nodeMap.get(conn.to);
      if (!fromNode || !toNode) return '';

      const style = CONNECTION_STYLES[conn.type];
      const { x1, y1, x2, y2 } = this.computeConnectionPoints(fromNode, toNode);

      const dashAttr = style.dashArray ? ` stroke-dasharray="${style.dashArray}"` : '';
      const labelPart = conn.label ? this.renderConnectionLabel(conn.label, x1, y1, x2, y2, style.color) : '';

      // Use bezier curve path instead of straight line
      const pathD = this.computeBezierPath(x1, y1, x2, y2);

      return [
        `  <g class="connection" data-from="${conn.from}" data-to="${conn.to}" data-type="${conn.type}">`,
        `    <path d="${pathD}"`,
        `      fill="none" stroke="${style.color}" stroke-width="${this.connectionStrokeWidth}"${dashAttr}`,
        `      stroke-linecap="round" stroke-linejoin="round"`,
        `      marker-end="url(#arrow-${conn.type})" />`,
        labelPart,
        `  </g>`,
      ].filter(Boolean).join('\n');
    });

    return parts.filter(Boolean).join('\n');
  }

  private computeBezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = x2 - x1;
    const dy = y2 - y1;

    // Determine control point offsets based on direction
    let cx1: number, cy1: number, cx2: number, cy2: number;

    if (Math.abs(dy) >= Math.abs(dx)) {
      // Vertical dominant — control points offset vertically
      const offset = Math.abs(dy) * 0.4;
      cx1 = x1;
      cy1 = y1 + (dy > 0 ? offset : -offset);
      cx2 = x2;
      cy2 = y2 - (dy > 0 ? offset : -offset);
    } else {
      // Horizontal dominant — control points offset horizontally
      const offset = Math.abs(dx) * 0.4;
      cx1 = x1 + (dx > 0 ? offset : -offset);
      cy1 = y1;
      cx2 = x2 - (dx > 0 ? offset : -offset);
      cy2 = y2;
    }

    return `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;
  }

  private computeConnectionPoints(
    from: DiagramNode,
    to: DiagramNode
  ): { x1: number; y1: number; x2: number; y2: number } {
    const fromW = from.width ?? this.defaultNodeWidth;
    const fromH = from.height ?? this.defaultNodeHeight;
    const toW = to.width ?? this.defaultNodeWidth;
    const toH = to.height ?? this.defaultNodeHeight;

    const fromCx = from.x + fromW / 2;
    const fromCy = from.y + fromH / 2;
    const toCx = to.x + toW / 2;
    const toCy = to.y + toH / 2;

    // Determine exit/entry points based on relative positions
    const dx = toCx - fromCx;
    const dy = toCy - fromCy;

    let x1: number, y1: number, x2: number, y2: number;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominant
      if (dx > 0) {
        x1 = from.x + fromW;
        y1 = fromCy;
        x2 = to.x;
        y2 = toCy;
      } else {
        x1 = from.x;
        y1 = fromCy;
        x2 = to.x + toW;
        y2 = toCy;
      }
    } else {
      // Vertical dominant
      if (dy > 0) {
        x1 = fromCx;
        y1 = from.y + fromH;
        x2 = toCx;
        y2 = to.y;
      } else {
        x1 = fromCx;
        y1 = from.y;
        x2 = toCx;
        y2 = to.y + toH;
      }
    }

    return { x1, y1, x2, y2 };
  }

  private renderConnectionLabel(
    label: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string
  ): string {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    return [
      `    <text x="${midX}" y="${midY - 8}"`,
      `      text-anchor="middle" font-size="11" font-weight="500" fill="${color}"`,
      `      font-family="system-ui, -apple-system, sans-serif"`,
      `      opacity="0.85">`,
      `      ${this.escapeXml(label)}`,
      `    </text>`,
    ].join('\n');
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
