/**
 * Shaar Dashboard — OV-1 Operational View Diagram Definition
 *
 * INCOSE OV-1 structure defining the operational context of SeraphimOS:
 * - King as primary actor (top-center, larger and more prominent)
 * - Queen as secondary actor (top-right)
 * - Seraphim Core as orchestrator (center)
 * - Eretz as business pillar head (below Seraphim)
 * - ZionX, ZXMG, Zion Alpha as business subsidiaries (below Eretz)
 * - Otzar, Zikaron, Mishmar as system services (bottom row)
 * - External systems: App Stores, Social Platforms, Trading Markets
 *
 * Requirements: 47b.4, 47b.5, 47b.6, 47b.7
 */

import type { DiagramDefinition, DiagramNode, DiagramConnection, DiagramLayer } from '../diagram-renderer.js';

// --- Layout Constants ---

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 920;

const NODE_WIDTH = 160;
const NODE_HEIGHT = 52;
const ACTOR_WIDTH = 170;
const ACTOR_HEIGHT = 56;
const EXTERNAL_WIDTH = 150;
const EXTERNAL_HEIGHT = 48;

// --- Node Definitions ---

const actors: DiagramNode[] = [
  {
    id: 'king',
    label: 'King (Primary User)',
    layer: 'interface',
    x: 490,
    y: 40,
    width: 200,
    height: 62,
  },
  {
    id: 'queen',
    label: 'Queen (Family)',
    layer: 'interface',
    x: 860,
    y: 46,
    width: ACTOR_WIDTH,
    height: ACTOR_HEIGHT,
  },
];

const orchestrator: DiagramNode[] = [
  {
    id: 'seraphim',
    label: 'Seraphim Core',
    layer: 'kernel',
    x: 500,
    y: 210,
    width: 180,
    height: 60,
  },
];

const businessPillars: DiagramNode[] = [
  {
    id: 'eretz',
    label: 'Eretz (Business)',
    layer: 'application',
    x: 510,
    y: 380,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'zionx',
    label: 'ZionX (Apps)',
    layer: 'application',
    x: 180,
    y: 510,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'zxmg',
    label: 'ZXMG (Media)',
    layer: 'application',
    x: 510,
    y: 510,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'zionAlpha',
    label: 'Zion Alpha (Trading)',
    layer: 'application',
    x: 840,
    y: 510,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

const systemServices: DiagramNode[] = [
  {
    id: 'otzar',
    label: 'Otzar (Resources)',
    layer: 'system',
    x: 180,
    y: 660,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'zikaron',
    label: 'Zikaron (Memory)',
    layer: 'system',
    x: 510,
    y: 660,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'mishmar',
    label: 'Mishmar (Governance)',
    layer: 'system',
    x: 840,
    y: 660,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

const externalSystems: DiagramNode[] = [
  {
    id: 'appStores',
    label: 'App Stores',
    layer: 'driver',
    x: 100,
    y: 820,
    width: EXTERNAL_WIDTH,
    height: EXTERNAL_HEIGHT,
  },
  {
    id: 'socialPlatforms',
    label: 'Social Platforms',
    layer: 'driver',
    x: 515,
    y: 820,
    width: EXTERNAL_WIDTH,
    height: EXTERNAL_HEIGHT,
  },
  {
    id: 'tradingMarkets',
    label: 'Trading Markets',
    layer: 'driver',
    x: 930,
    y: 820,
    width: EXTERNAL_WIDTH,
    height: EXTERNAL_HEIGHT,
  },
];

// --- Connections (Information Flows) ---

const connections: DiagramConnection[] = [
  // King ↔ Seraphim
  { from: 'king', to: 'seraphim', type: 'command', label: 'Vision & Directives' },
  { from: 'seraphim', to: 'king', type: 'information', label: 'Status & Recommendations' },

  // Queen → Seraphim
  { from: 'queen', to: 'seraphim', type: 'information', label: 'Family Requests' },

  // Seraphim → Eretz
  { from: 'seraphim', to: 'eretz', type: 'command', label: 'Strategy & Directives' },

  // Eretz → Business Pillars
  { from: 'eretz', to: 'zionx', type: 'command', label: 'App Directives' },
  { from: 'eretz', to: 'zxmg', type: 'command', label: 'Content Directives' },
  { from: 'eretz', to: 'zionAlpha', type: 'command', label: 'Trading Directives' },

  // Seraphim → System Services
  { from: 'seraphim', to: 'otzar', type: 'data', label: 'Resource Allocation' },
  { from: 'seraphim', to: 'zikaron', type: 'data', label: 'Memory Ops' },
  { from: 'seraphim', to: 'mishmar', type: 'event', label: 'Governance Events' },

  // Business Pillars → External Systems
  { from: 'zionx', to: 'appStores', type: 'data', label: 'App Submissions' },
  { from: 'zxmg', to: 'socialPlatforms', type: 'data', label: 'Content Publishing' },
  { from: 'zionAlpha', to: 'tradingMarkets', type: 'data', label: 'Trade Execution' },
];

// --- Layers (Background Regions) ---

const layers: DiagramLayer[] = [
  {
    id: 'actors-layer',
    label: 'Actors',
    type: 'interface',
    y: 20,
    height: 110,
  },
  {
    id: 'orchestrator-layer',
    label: 'Orchestrator',
    type: 'kernel',
    y: 180,
    height: 120,
  },
  {
    id: 'business-layer',
    label: 'Operational Pillars',
    type: 'application',
    y: 350,
    height: 250,
  },
  {
    id: 'services-layer',
    label: 'System Services',
    type: 'system',
    y: 635,
    height: 110,
  },
  {
    id: 'external-layer',
    label: 'External Systems',
    type: 'driver',
    y: 790,
    height: 110,
  },
];

// --- Assembled Definition ---

export const ov1Definition: DiagramDefinition = {
  title: 'OV-1 Operational View — SeraphimOS',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  nodes: [...actors, ...orchestrator, ...businessPillars, ...systemServices, ...externalSystems],
  connections,
  layers,
};
