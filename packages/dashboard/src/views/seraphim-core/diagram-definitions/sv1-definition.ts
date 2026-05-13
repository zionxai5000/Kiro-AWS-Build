/**
 * Shaar Dashboard — SV-1 System View Diagram Definition
 *
 * INCOSE SV-1 structure defining the system decomposition of SeraphimOS
 * as a 6-layer architecture with component-to-component data flows:
 *
 * Layer 1 — Interface Layer (Shaar): Web Dashboard, REST API, WebSocket API, CLI, Voice, Messaging
 * Layer 2 — Kernel (Seraphim Core): Agent Runtime, State Machine Engine, Permission System, Lifecycle Manager, IPC Router
 * Layer 3 — System Services: Zikaron (Memory), Mishmar (Governance), Otzar (Resources), XO Audit, Event Bus, Learning Engine
 * Layer 4 — Application Layer: ZionX (App Factory), ZXMG (Media), Zion Alpha (Trading), Eretz (Business)
 * Layer 5 — Driver Layer: App Store Connect, Google Play, YouTube, Kalshi, Gmail, GitHub, LLM Providers
 * Layer 6 — Data Layer: Aurora PostgreSQL + pgvector, DynamoDB, S3, Secrets Manager
 *
 * Requirements: 47c.8, 47c.9, 47c.10, 47c.11, 47c.12
 */

import type { DiagramDefinition, DiagramNode, DiagramConnection, DiagramLayer } from '../diagram-renderer.js';

// --- Layout Constants ---

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1100;

const NODE_WIDTH = 145;
const NODE_HEIGHT = 48;
const SMALL_NODE_WIDTH = 135;
const SMALL_NODE_HEIGHT = 44;

// Vertical positions for each layer's nodes (increased gaps between layers)
const LAYER_1_Y = 60;
const LAYER_2_Y = 230;
const LAYER_3_Y = 400;
const LAYER_4_Y = 570;
const LAYER_5_Y = 740;
const LAYER_6_Y = 910;

// --- Layer 1: Interface Layer (Shaar) ---

const interfaceNodes: DiagramNode[] = [
  {
    id: 'webDashboard',
    label: 'Web Dashboard',
    layer: 'interface',
    x: 55,
    y: LAYER_1_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'restApi',
    label: 'REST API',
    layer: 'interface',
    x: 245,
    y: LAYER_1_Y,
    width: SMALL_NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'websocketApi',
    label: 'WebSocket API',
    layer: 'interface',
    x: 425,
    y: LAYER_1_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'cli',
    label: 'CLI',
    layer: 'interface',
    x: 615,
    y: LAYER_1_Y,
    width: 110,
    height: NODE_HEIGHT,
  },
  {
    id: 'voice',
    label: 'Voice',
    layer: 'interface',
    x: 775,
    y: LAYER_1_Y,
    width: 110,
    height: NODE_HEIGHT,
  },
  {
    id: 'messaging',
    label: 'Messaging',
    layer: 'interface',
    x: 935,
    y: LAYER_1_Y,
    width: SMALL_NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

// --- Layer 2: Kernel (Seraphim Core) ---

const kernelNodes: DiagramNode[] = [
  {
    id: 'agentRuntime',
    label: 'Agent Runtime',
    layer: 'kernel',
    x: 80,
    y: LAYER_2_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'stateMachine',
    label: 'State Machine Engine',
    layer: 'kernel',
    x: 285,
    y: LAYER_2_Y,
    width: 160,
    height: NODE_HEIGHT,
  },
  {
    id: 'permissionSystem',
    label: 'Permission System',
    layer: 'kernel',
    x: 505,
    y: LAYER_2_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'lifecycleManager',
    label: 'Lifecycle Manager',
    layer: 'kernel',
    x: 710,
    y: LAYER_2_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'ipcRouter',
    label: 'IPC Router',
    layer: 'kernel',
    x: 915,
    y: LAYER_2_Y,
    width: SMALL_NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

// --- Layer 3: System Services ---

const systemServiceNodes: DiagramNode[] = [
  {
    id: 'zikaron',
    label: 'Zikaron (Memory)',
    layer: 'system',
    x: 50,
    y: LAYER_3_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'mishmar',
    label: 'Mishmar (Governance)',
    layer: 'system',
    x: 240,
    y: LAYER_3_Y,
    width: 160,
    height: NODE_HEIGHT,
  },
  {
    id: 'otzar',
    label: 'Otzar (Resources)',
    layer: 'system',
    x: 445,
    y: LAYER_3_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'xoAudit',
    label: 'XO Audit',
    layer: 'system',
    x: 635,
    y: LAYER_3_Y,
    width: SMALL_NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'eventBus',
    label: 'Event Bus',
    layer: 'system',
    x: 815,
    y: LAYER_3_Y,
    width: SMALL_NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'learningEngine',
    label: 'Learning Engine',
    layer: 'system',
    x: 995,
    y: LAYER_3_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

// --- Layer 4: Application Layer ---

const applicationNodes: DiagramNode[] = [
  {
    id: 'zionx',
    label: 'ZionX (App Factory)',
    layer: 'application',
    x: 100,
    y: LAYER_4_Y,
    width: 165,
    height: NODE_HEIGHT,
  },
  {
    id: 'zxmg',
    label: 'ZXMG (Media)',
    layer: 'application',
    x: 365,
    y: LAYER_4_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 'zionAlpha',
    label: 'Zion Alpha (Trading)',
    layer: 'application',
    x: 610,
    y: LAYER_4_Y,
    width: 165,
    height: NODE_HEIGHT,
  },
  {
    id: 'eretz',
    label: 'Eretz (Business)',
    layer: 'application',
    x: 875,
    y: LAYER_4_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

// --- Layer 5: Driver Layer ---

const driverNodes: DiagramNode[] = [
  {
    id: 'appStoreConnect',
    label: 'App Store Connect',
    layer: 'driver',
    x: 40,
    y: LAYER_5_Y,
    width: NODE_WIDTH,
    height: SMALL_NODE_HEIGHT,
  },
  {
    id: 'googlePlay',
    label: 'Google Play',
    layer: 'driver',
    x: 215,
    y: LAYER_5_Y,
    width: SMALL_NODE_WIDTH,
    height: SMALL_NODE_HEIGHT,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    layer: 'driver',
    x: 380,
    y: LAYER_5_Y,
    width: 115,
    height: SMALL_NODE_HEIGHT,
  },
  {
    id: 'kalshi',
    label: 'Kalshi',
    layer: 'driver',
    x: 525,
    y: LAYER_5_Y,
    width: 115,
    height: SMALL_NODE_HEIGHT,
  },
  {
    id: 'gmail',
    label: 'Gmail',
    layer: 'driver',
    x: 670,
    y: LAYER_5_Y,
    width: 115,
    height: SMALL_NODE_HEIGHT,
  },
  {
    id: 'github',
    label: 'GitHub',
    layer: 'driver',
    x: 815,
    y: LAYER_5_Y,
    width: 115,
    height: SMALL_NODE_HEIGHT,
  },
  {
    id: 'llmProviders',
    label: 'LLM Providers',
    layer: 'driver',
    x: 960,
    y: LAYER_5_Y,
    width: SMALL_NODE_WIDTH,
    height: SMALL_NODE_HEIGHT,
  },
];

// --- Layer 6: Data Layer ---

const dataNodes: DiagramNode[] = [
  {
    id: 'aurora',
    label: 'Aurora PG + pgvector',
    layer: 'data',
    x: 100,
    y: LAYER_6_Y,
    width: 170,
    height: NODE_HEIGHT,
  },
  {
    id: 'dynamodb',
    label: 'DynamoDB',
    layer: 'data',
    x: 370,
    y: LAYER_6_Y,
    width: SMALL_NODE_WIDTH,
    height: NODE_HEIGHT,
  },
  {
    id: 's3',
    label: 'S3',
    layer: 'data',
    x: 605,
    y: LAYER_6_Y,
    width: 110,
    height: NODE_HEIGHT,
  },
  {
    id: 'secretsManager',
    label: 'Secrets Manager',
    layer: 'data',
    x: 820,
    y: LAYER_6_Y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  },
];

// --- Connections (Inter-Layer Data Flows) ---

const connections: DiagramConnection[] = [
  // Interface → Kernel (Layer 1 → Layer 2)
  { from: 'webDashboard', to: 'restApi', type: 'data', label: 'HTTP/WS' },
  { from: 'restApi', to: 'agentRuntime', type: 'command', label: 'Commands' },
  { from: 'websocketApi', to: 'ipcRouter', type: 'event', label: 'Real-time Events' },
  { from: 'cli', to: 'agentRuntime', type: 'command', label: 'CLI Commands' },

  // Kernel → System Services (Layer 2 → Layer 3)
  { from: 'agentRuntime', to: 'zikaron', type: 'data', label: 'Memory Ops' },
  { from: 'agentRuntime', to: 'mishmar', type: 'command', label: 'Auth Checks' },
  { from: 'agentRuntime', to: 'otzar', type: 'data', label: 'Budget/Route' },
  { from: 'stateMachine', to: 'xoAudit', type: 'event', label: 'Transitions' },
  { from: 'ipcRouter', to: 'eventBus', type: 'event', label: 'Message Routing' },
  { from: 'permissionSystem', to: 'mishmar', type: 'command', label: 'Policy Enforce' },
  { from: 'lifecycleManager', to: 'learningEngine', type: 'data', label: 'Metrics' },

  // System Services → Application Layer (Layer 3 → Layer 4)
  { from: 'eventBus', to: 'zionx', type: 'event', label: 'Task Events' },
  { from: 'eventBus', to: 'zxmg', type: 'event', label: 'Content Events' },
  { from: 'eventBus', to: 'zionAlpha', type: 'event', label: 'Market Events' },
  { from: 'otzar', to: 'eretz', type: 'data', label: 'Resource Alloc' },

  // Application → Driver Layer (Layer 4 → Layer 5)
  { from: 'zionx', to: 'appStoreConnect', type: 'data', label: 'Submissions' },
  { from: 'zionx', to: 'googlePlay', type: 'data', label: 'Submissions' },
  { from: 'zxmg', to: 'youtube', type: 'data', label: 'Publishing' },
  { from: 'zionAlpha', to: 'kalshi', type: 'data', label: 'Trades' },
  { from: 'eretz', to: 'gmail', type: 'information', label: 'Notifications' },
  { from: 'agentRuntime', to: 'llmProviders', type: 'command', label: 'LLM Calls' },

  // Driver/System → Data Layer (Layer 5/3 → Layer 6)
  { from: 'zikaron', to: 'aurora', type: 'data', label: 'Vector Store' },
  { from: 'xoAudit', to: 'dynamodb', type: 'data', label: 'Audit Records' },
  { from: 'otzar', to: 's3', type: 'data', label: 'Asset Storage' },
  { from: 'permissionSystem', to: 'secretsManager', type: 'data', label: 'Credentials' },
];

// --- Layers (Background Regions) ---

const layers: DiagramLayer[] = [
  {
    id: 'interface-layer',
    label: 'Interface Layer (Shaar)',
    type: 'interface',
    y: 30,
    height: 105,
  },
  {
    id: 'kernel-layer',
    label: 'Kernel (Seraphim Core)',
    type: 'kernel',
    y: 200,
    height: 105,
  },
  {
    id: 'system-services-layer',
    label: 'System Services',
    type: 'system',
    y: 370,
    height: 105,
  },
  {
    id: 'application-layer',
    label: 'Application Layer',
    type: 'application',
    y: 540,
    height: 105,
  },
  {
    id: 'driver-layer',
    label: 'Driver Layer',
    type: 'driver',
    y: 710,
    height: 100,
  },
  {
    id: 'data-layer',
    label: 'Data Layer',
    type: 'data',
    y: 880,
    height: 105,
  },
];

// --- Assembled Definition ---

export const sv1Definition: DiagramDefinition = {
  title: 'SV-1 System View — SeraphimOS Architecture',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  nodes: [
    ...interfaceNodes,
    ...kernelNodes,
    ...systemServiceNodes,
    ...applicationNodes,
    ...driverNodes,
    ...dataNodes,
  ],
  connections,
  layers,
};
