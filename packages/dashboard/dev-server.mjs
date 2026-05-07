/**
 * Development mock API server for the SeraphimOS Dashboard.
 *
 * Serves realistic mock data on localhost:3000 so the Vite dev server
 * (port 5173) can proxy /api/* requests here and render real content.
 *
 * Usage: node packages/dashboard/dev-server.mjs
 */

import http from 'node:http';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const agents = [
  {
    id: 'agent-seraphim-core',
    programId: 'seraphim-core',
    name: 'Seraphim Core',
    version: '1.2.0',
    state: 'ready',
    pillar: 'system',
    resourceUsage: { cpuPercent: 12.4, memoryMB: 256, tokensUsed: 48200 },
    lastHeartbeat: new Date(Date.now() - 15000).toISOString(),
  },
  {
    id: 'agent-eretz',
    programId: 'eretz-business',
    name: 'Eretz — Business Orchestrator',
    version: '1.1.0',
    state: 'executing',
    pillar: 'eretz',
    resourceUsage: { cpuPercent: 34.7, memoryMB: 512, tokensUsed: 125800 },
    lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
  },
  {
    id: 'agent-zionx',
    programId: 'zionx-app-factory',
    name: 'ZionX — App Factory',
    version: '2.0.1',
    state: 'executing',
    pillar: 'zionx',
    resourceUsage: { cpuPercent: 67.2, memoryMB: 1024, tokensUsed: 312400 },
    lastHeartbeat: new Date(Date.now() - 3000).toISOString(),
  },
  {
    id: 'agent-zxmg',
    programId: 'zxmg-media',
    name: 'ZXMG — Media Production',
    version: '1.3.0',
    state: 'ready',
    pillar: 'zxmg',
    resourceUsage: { cpuPercent: 8.1, memoryMB: 384, tokensUsed: 89600 },
    lastHeartbeat: new Date(Date.now() - 22000).toISOString(),
  },
  {
    id: 'agent-zion-alpha',
    programId: 'zion-alpha-trading',
    name: 'Zion Alpha — Trading',
    version: '1.0.4',
    state: 'executing',
    pillar: 'zion_alpha',
    resourceUsage: { cpuPercent: 45.3, memoryMB: 448, tokensUsed: 67300 },
    lastHeartbeat: new Date(Date.now() - 8000).toISOString(),
  },
  {
    id: 'agent-mishmar',
    programId: 'mishmar-governance',
    name: 'Mishmar — Governance',
    version: '1.0.0',
    state: 'ready',
    pillar: 'system',
    resourceUsage: { cpuPercent: 3.2, memoryMB: 128, tokensUsed: 15400 },
    lastHeartbeat: new Date(Date.now() - 12000).toISOString(),
  },
  {
    id: 'agent-otzar',
    programId: 'otzar-resource-mgr',
    name: 'Otzar — Resource Manager',
    version: '1.1.2',
    state: 'ready',
    pillar: 'system',
    resourceUsage: { cpuPercent: 5.8, memoryMB: 192, tokensUsed: 22100 },
    lastHeartbeat: new Date(Date.now() - 18000).toISOString(),
  },
  {
    id: 'agent-zionx-gtm',
    programId: 'zionx-gtm-engine',
    name: 'ZionX GTM Engine',
    version: '1.0.0',
    state: 'degraded',
    pillar: 'zionx',
    resourceUsage: { cpuPercent: 0.0, memoryMB: 64, tokensUsed: 4200 },
    lastHeartbeat: new Date(Date.now() - 120000).toISOString(),
  },
];

const pillars = [
  { name: 'zionx', agentCount: 3, activeAgents: 2 },
  { name: 'zxmg', agentCount: 1, activeAgents: 1 },
  { name: 'zion_alpha', agentCount: 1, activeAgents: 1 },
  { name: 'eretz', agentCount: 1, activeAgents: 1 },
  { name: 'system', agentCount: 3, activeAgents: 3 },
];

const costs = {
  totalSpend: 47.82,
  projectedDaily: 63.50,
  projectedMonthly: 1905.00,
  perAgent: [
    { agentId: 'ZionX — App Factory', spend: 18.45 },
    { agentId: 'Eretz — Business Orchestrator', spend: 9.12 },
    { agentId: 'ZXMG — Media Production', spend: 7.88 },
    { agentId: 'Zion Alpha — Trading', spend: 5.63 },
    { agentId: 'Seraphim Core', spend: 3.92 },
    { agentId: 'Otzar — Resource Manager', spend: 1.74 },
    { agentId: 'Mishmar — Governance', spend: 1.08 },
  ],
  perPillar: [
    { pillar: 'ZionX', spend: 22.37 },
    { pillar: 'Eretz', spend: 9.12 },
    { pillar: 'ZXMG', spend: 7.88 },
    { pillar: 'Zion Alpha', spend: 5.63 },
    { pillar: 'System', spend: 2.82 },
  ],
  modelUtilization: [
    { model: 'claude-sonnet-4-20250514', tokens: 284000, cost: 22.14 },
    { model: 'gpt-4o-mini', tokens: 512000, cost: 8.96 },
    { model: 'gpt-4o', tokens: 98000, cost: 11.42 },
    { model: 'claude-haiku', tokens: 340000, cost: 3.06 },
    { model: 'text-embedding-3-small', tokens: 1200000, cost: 2.24 },
  ],
};

const auditEntries = [
  { id: 'aud-001', timestamp: new Date(Date.now() - 60000).toISOString(), actingAgentId: 'agent-zionx', actingAgentName: 'ZionX', actionType: 'app.submission', target: 'FocusFlow-iOS', outcome: 'success', pillar: 'zionx', details: {} },
  { id: 'aud-002', timestamp: new Date(Date.now() - 120000).toISOString(), actingAgentId: 'agent-mishmar', actingAgentName: 'Mishmar', actionType: 'governance.authorization', target: 'agent-zionx', outcome: 'success', pillar: 'system', details: {} },
  { id: 'aud-003', timestamp: new Date(Date.now() - 180000).toISOString(), actingAgentId: 'agent-zion-alpha', actingAgentName: 'Zion Alpha', actionType: 'trade.execute', target: 'kalshi:ECON-GDP-Q2', outcome: 'success', pillar: 'zion_alpha', details: {} },
  { id: 'aud-004', timestamp: new Date(Date.now() - 240000).toISOString(), actingAgentId: 'agent-zionx-gtm', actingAgentName: 'ZionX GTM', actionType: 'campaign.launch', target: 'FocusFlow-TikTok', outcome: 'failure', pillar: 'zionx', details: {} },
  { id: 'aud-005', timestamp: new Date(Date.now() - 300000).toISOString(), actingAgentId: 'agent-otzar', actingAgentName: 'Otzar', actionType: 'budget.enforcement', target: 'agent-zxmg', outcome: 'blocked', pillar: 'system', details: {} },
  { id: 'aud-006', timestamp: new Date(Date.now() - 360000).toISOString(), actingAgentId: 'agent-zxmg', actingAgentName: 'ZXMG', actionType: 'content.upload', target: 'youtube:vid-2847', outcome: 'success', pillar: 'zxmg', details: {} },
  { id: 'aud-007', timestamp: new Date(Date.now() - 420000).toISOString(), actingAgentId: 'agent-eretz', actingAgentName: 'Eretz', actionType: 'synergy.detection', target: 'zionx-zxmg-cross-promo', outcome: 'success', pillar: 'eretz', details: {} },
  { id: 'aud-008', timestamp: new Date(Date.now() - 500000).toISOString(), actingAgentId: 'agent-seraphim-core', actingAgentName: 'Seraphim Core', actionType: 'agent.deploy', target: 'agent-zionx-gtm', outcome: 'success', pillar: 'system', details: {} },
  { id: 'aud-009', timestamp: new Date(Date.now() - 600000).toISOString(), actingAgentId: 'agent-zion-alpha', actingAgentName: 'Zion Alpha', actionType: 'trade.execute', target: 'polymarket:PRES-2026', outcome: 'success', pillar: 'zion_alpha', details: {} },
  { id: 'aud-010', timestamp: new Date(Date.now() - 700000).toISOString(), actingAgentId: 'agent-mishmar', actingAgentName: 'Mishmar', actionType: 'governance.completion_contract', target: 'zxmg-content-pipeline', outcome: 'success', pillar: 'system', details: {} },
];

const health = {
  status: 'healthy',
  totalAgents: 8,
  healthyAgents: 7,
  timestamp: new Date().toISOString(),
  services: [
    { name: 'Zikaron (Memory)', status: 'healthy' },
    { name: 'Mishmar (Governance)', status: 'healthy' },
    { name: 'Otzar (Resource Manager)', status: 'healthy' },
    { name: 'XO Audit', status: 'healthy' },
    { name: 'Event Bus', status: 'healthy' },
    { name: 'Learning Engine', status: 'healthy' },
  ],
  drivers: [
    { name: 'Anthropic (Claude)', status: 'ready' },
    { name: 'OpenAI (GPT-4o)', status: 'ready' },
    { name: 'App Store Connect', status: 'ready' },
    { name: 'Google Play Console', status: 'ready' },
    { name: 'YouTube API', status: 'ready' },
    { name: 'Kalshi API', status: 'ready' },
    { name: 'Polymarket API', status: 'ready' },
    { name: 'HeyGen API', status: 'ready' },
    { name: 'Gmail API', status: 'ready' },
    { name: 'GitHub API', status: 'ready' },
    { name: 'Stripe API', status: 'ready' },
    { name: 'Google Ads API', status: 'degraded' },
  ],
  agents: agents.map((a) => ({ id: a.id, name: a.name, state: a.state })),
};

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const PORT = 3000;

const server = http.createServer((req, res) => {
  // CORS headers for Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/api/agents') {
    res.writeHead(200);
    res.end(JSON.stringify({ agents }));
  } else if (path.startsWith('/api/agents/')) {
    const id = path.split('/').pop();
    const agent = agents.find((a) => a.id === id);
    if (agent) {
      res.writeHead(200);
      res.end(JSON.stringify({ agent }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Agent not found' }));
    }
  } else if (path === '/api/pillars') {
    res.writeHead(200);
    res.end(JSON.stringify({ pillars }));
  } else if (path === '/api/costs') {
    res.writeHead(200);
    res.end(JSON.stringify({ costs }));
  } else if (path === '/api/audit') {
    res.writeHead(200);
    res.end(JSON.stringify({ entries: auditEntries }));
  } else if (path === '/api/health') {
    // Update timestamp on each request
    health.timestamp = new Date().toISOString();
    res.writeHead(200);
    res.end(JSON.stringify(health));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  SeraphimOS Mock API Server running at http://localhost:${PORT}`);
  console.log(`  Dashboard dev server should be at http://localhost:5173\n`);
});
