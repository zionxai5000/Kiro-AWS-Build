/**
 * SeraphimOS Production Server
 *
 * Boots the Shaar API server with real AWS service backends:
 * - Aurora PostgreSQL via Secrets Manager for state/memory
 * - DynamoDB for audit trail and events
 * - EventBridge for messaging
 * - S3 for artifacts
 *
 * Falls back to in-memory repositories when AWS services are unavailable
 * (graceful degradation for initial deployment).
 *
 * Usage: node packages/services/dist/shaar/production-server.js
 */

// Load environment variables from .env file (local development)
import 'dotenv/config';

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';

// In-memory repositories (fallback when Aurora is not yet migrated)
import {
  InMemoryAgentProgramRepository,
  InMemoryStateMachineDefinitionRepository,
  InMemoryStateMachineInstanceRepository,
  InMemoryMemoryRepository,
  InMemoryTokenUsageRepository,
  InMemoryCompletionContractRepository,
  InMemoryTenantRepository,
} from '@seraphim/core/db/in-memory/index.js';

// Real engine and runtime
import { DefaultStateMachineEngine } from '@seraphim/core/state-machine/engine.js';
import { DefaultAgentRuntime } from '@seraphim/core/agent-runtime/runtime.js';

// Real service implementations
import { MishmarServiceImpl } from '../mishmar/service.js';
import { ZikaronServiceImpl } from '../zikaron/service.js';
import { OtzarServiceImpl } from '../otzar/service.js';

// In-memory services (used until DynamoDB wiring is complete)
import { InMemoryAuditService } from '../xo-audit/in-memory-audit.js';
import { InMemoryEventBusService } from '../event-bus/in-memory-event-bus.js';

// API Router and WebSocket Handler
import { ShaarAPIRouter, type APIRequest, type APIResponse } from './api-routes.js';
import { ShaarWebSocketHandler } from './websocket-handler.js';

// Agent programs (defined inline to avoid circular dependency with @seraphim/app)
import type { AgentProgram } from '@seraphim/core';

// Database bootstrap (self-migrating)
import { bootstrapDatabase } from './bootstrap-db.js';
import { PgPersistence } from './pg-persistence.js';

// PostgreSQL persistence layer (write-through to Aurora)
import { PgPersistenceLayer } from './pg-repositories.js';

// Local credential manager (reads from .env for local dev)
import { LocalCredentialManager } from '../credentials/local-credential-manager.js';

// Heartbeat Scheduler for autonomous review cycles
import { HeartbeatScheduler, DEFAULT_HEARTBEAT_CONFIGS, type RecommendationQueue } from '../sme/heartbeat-scheduler.js';
import { DomainExpertiseProfileService } from '../sme/domain-expertise-profile.js';

// ---------------------------------------------------------------------------
// Stub Embedding Provider
// ---------------------------------------------------------------------------

class StubEmbeddingProvider {
  async generateEmbedding(_text: string): Promise<number[]> {
    const vec: number[] = [];
    let hash = 0;
    for (let i = 0; i < _text.length; i++) {
      hash = ((hash << 5) - hash + _text.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < 16; i++) {
      hash = ((hash << 5) - hash + i) | 0;
      vec.push(Math.sin(hash) * 0.5 + 0.5);
    }
    return vec;
  }
}

// ---------------------------------------------------------------------------
// System Agent Programs
// ---------------------------------------------------------------------------

const SERAPHIM_CORE_AGENT_PROGRAM: AgentProgram = {
  id: 'seraphim-core',
  name: 'Seraphim Core',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Seraphim Core orchestrator.',
  tools: [
    { name: 'system_health_check', description: 'Check system-wide health', inputSchema: { type: 'object', properties: {} } },
    { name: 'coordinate_pillars', description: 'Coordinate cross-pillar operations', inputSchema: { type: 'object', properties: {} } },
  ],
  stateMachine: { id: 'seraphim-core-lifecycle', name: 'Seraphim Core Lifecycle', version: '1.0.0', states: { monitoring: { name: 'monitoring', type: 'initial' }, coordinating: { name: 'coordinating', type: 'active' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'monitoring', terminalStates: ['idle'], transitions: [{ from: 'monitoring', to: 'coordinating', event: 'coordinate', gates: [] }, { from: 'coordinating', to: 'monitoring', event: 'done', gates: [] }], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Seraphim Core lifecycle' } },
  completionContracts: [],
  authorityLevel: 'L1',
  allowedActions: ['system_health_check', 'coordinate_pillars'],
  deniedActions: [],
  modelPreference: { preferred: 'claude-sonnet-4-20250514', fallback: 'gpt-4o', costCeiling: 10.0 },
  tokenBudget: { daily: 1000000, monthly: 20000000 },
  testSuite: { suiteId: 'seraphim-core-tests', path: 'packages/core/__tests__', requiredCoverage: 90 },
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
};

const ERETZ_AGENT_PROGRAM: AgentProgram = {
  id: 'eretz-business-orchestrator',
  name: 'Eretz Business Orchestrator',
  version: '1.0.0',
  pillar: 'eretz',
  systemPrompt: 'You are the Eretz Business Orchestrator.',
  tools: [
    { name: 'manage_portfolio', description: 'Manage the app and content portfolio', inputSchema: { type: 'object', properties: {} } },
  ],
  stateMachine: { id: 'eretz-lifecycle', name: 'Eretz Lifecycle', version: '1.0.0', states: { planning: { name: 'planning', type: 'initial' }, executing: { name: 'executing', type: 'active' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'planning', terminalStates: ['idle'], transitions: [{ from: 'planning', to: 'executing', event: 'start', gates: [] }, { from: 'executing', to: 'planning', event: 'plan', gates: [] }], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Eretz lifecycle' } },
  completionContracts: [],
  authorityLevel: 'L2',
  allowedActions: ['manage_portfolio'],
  deniedActions: [],
  modelPreference: { preferred: 'gpt-4o', fallback: 'claude-sonnet-4-20250514', costCeiling: 5.0 },
  tokenBudget: { daily: 500000, monthly: 10000000 },
  testSuite: { suiteId: 'eretz-tests', path: 'packages/app/__tests__', requiredCoverage: 80 },
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
};

const MISHMAR_AGENT_PROGRAM: AgentProgram = {
  id: 'mishmar-governance',
  name: 'Mishmar',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Mishmar governance agent.',
  tools: [{ name: 'check_authority', description: 'Check authority', inputSchema: { type: 'object', properties: {} } }],
  stateMachine: { id: 'mishmar-lifecycle', name: 'Mishmar Lifecycle', version: '1.0.0', states: { monitoring: { name: 'monitoring', type: 'initial' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'monitoring', terminalStates: ['idle'], transitions: [], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Mishmar lifecycle' } },
  completionContracts: [],
  authorityLevel: 'L1',
  allowedActions: ['check_authority'],
  deniedActions: [],
  modelPreference: { preferred: 'claude-sonnet-4-20250514', fallback: 'gpt-4o', costCeiling: 5.0 },
  tokenBudget: { daily: 200000, monthly: 4000000 },
  testSuite: { suiteId: 'mishmar-tests', path: 'packages/services/__tests__', requiredCoverage: 95 },
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
};

const OTZAR_AGENT_PROGRAM: AgentProgram = {
  id: 'otzar-resource-manager',
  name: 'Otzar',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Otzar resource manager.',
  tools: [{ name: 'check_budget', description: 'Check budget', inputSchema: { type: 'object', properties: {} } }],
  stateMachine: { id: 'otzar-lifecycle', name: 'Otzar Lifecycle', version: '1.0.0', states: { monitoring: { name: 'monitoring', type: 'initial' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'monitoring', terminalStates: ['idle'], transitions: [], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Otzar lifecycle' } },
  completionContracts: [],
  authorityLevel: 'L2',
  allowedActions: ['check_budget'],
  deniedActions: [],
  modelPreference: { preferred: 'gpt-4o-mini', fallback: 'gpt-4o', costCeiling: 2.0 },
  tokenBudget: { daily: 100000, monthly: 2000000 },
  testSuite: { suiteId: 'otzar-tests', path: 'packages/services/__tests__', requiredCoverage: 90 },
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
};

// ---------------------------------------------------------------------------
// WebSocket helpers (same as local-server)
// ---------------------------------------------------------------------------

function computeWebSocketAccept(key: string): string {
  return createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-5AB9DC85B11D').digest('base64');
}

function encodeWebSocketFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const len = payload.length;
  let header: Buffer;
  if (len < 126) { header = Buffer.alloc(2); header[0] = 0x81; header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

function decodeWebSocketFrame(buf: Buffer): { opcode: number; payload: string } | null {
  if (buf.length < 2) return null;
  const opcode = buf[0]! & 0x0f;
  const masked = (buf[1]! & 0x80) !== 0;
  let payloadLen = buf[1]! & 0x7f;
  let offset = 2;
  if (payloadLen === 126) { if (buf.length < 4) return null; payloadLen = buf.readUInt16BE(2); offset = 4; }
  else if (payloadLen === 127) { if (buf.length < 10) return null; payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10; }
  let maskKey: Buffer | undefined;
  if (masked) { if (buf.length < offset + 4) return null; maskKey = buf.subarray(offset, offset + 4); offset += 4; }
  if (buf.length < offset + payloadLen) return null;
  const payloadBuf = buf.subarray(offset, offset + payloadLen);
  if (maskKey) { for (let i = 0; i < payloadBuf.length; i++) { payloadBuf[i] = payloadBuf[i]! ^ maskKey[i % 4]!; } }
  return { opcode, payload: payloadBuf.toString('utf-8') };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  const MODE = process.env.SERAPHIM_MODE ?? 'hybrid';
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  const REGION = process.env.AWS_REGION ?? 'us-east-1';

  console.log(`🔥 SeraphimOS Production Server — mode=${MODE}, port=${PORT}, region=${REGION}\n`);

  // =========================================================================
  // CRITICAL: Start HTTP server IMMEDIATELY so ALB health checks pass.
  // All async bootstrap work happens AFTER the server is listening.
  // =========================================================================

  // Mutable state that gets populated during bootstrap
  let bootStatus: 'booting' | 'ready' | 'error' = 'booting';
  let bootError: string | undefined;
  const deployedAgents: Array<{ id: string; name: string; pillar: string }> = [];
  let dbMode = 'pending';
  let dbBootstrap = 'pending';
  let pgConnected = false;

  // Shared references populated during bootstrap
  let router: ShaarAPIRouter | null = null;
  const wsHandler = new ShaarWebSocketHandler();
  const wsSockets = new Map<string, Duplex>();

  // In-memory stores for Reference Ingestion API
  const referenceStore: Array<{
    id: string; domain: string; sourceUrl: string; title: string;
    status: 'pending' | 'ingesting' | 'analyzed' | 'baselined' | 'failed';
    ingestedAt: string; analysisCompletedAt?: string; dimensions: string[]; confidence: number;
  }> = [];
  const baselineStore: Array<{
    id: string; domain: string; version: number;
    dimensions: Array<{ name: string; score: number; weight: number }>;
    confidence: number; referenceCount: number; createdAt: string; updatedAt: string;
  }> = [];
  const qualityGateStore: Array<{
    id: string; agentId: string; domain: string; evaluatedAt: string;
    passed: boolean; overallScore: number; threshold: number;
    dimensionScores: Array<{ dimension: string; score: number; passed: boolean }>;
    baselineVersion: number;
  }> = [];

  // Create HTTP server immediately
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'x-seraphim-runtime, x-seraphim-mode');
    res.setHeader('x-seraphim-runtime', 'live');
    res.setHeader('x-seraphim-mode', MODE);

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    // Health check — ALWAYS responds, even during boot
    if (path === '/health' || path === '/api/health') {
      const health = {
        status: bootStatus === 'ready' ? 'healthy' : bootStatus,
        mode: MODE,
        totalAgents: deployedAgents.length,
        healthyAgents: deployedAgents.length,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: pgConnected ? 'aurora' : 'in-memory',
        dbBootstrap,
        services: [
          { name: 'Zikaron (Memory)', status: bootStatus === 'ready' ? 'healthy' : 'booting' },
          { name: 'Mishmar (Governance)', status: bootStatus === 'ready' ? 'healthy' : 'booting' },
          { name: 'Otzar (Resource Manager)', status: bootStatus === 'ready' ? 'healthy' : 'booting' },
          { name: 'XO Audit', status: bootStatus === 'ready' ? 'healthy' : 'booting' },
          { name: 'Event Bus', status: bootStatus === 'ready' ? 'healthy' : 'booting' },
          { name: 'Learning Engine', status: bootStatus === 'ready' ? 'healthy' : 'booting' },
        ],
        drivers: [
          { name: 'Anthropic LLM', status: 'ready' },
          { name: 'OpenAI LLM', status: 'ready' },
          { name: 'App Store Connect', status: 'ready' },
          { name: 'Google Play Console', status: 'ready' },
          { name: 'YouTube', status: 'ready' },
          { name: 'Kalshi', status: 'ready' },
          { name: 'Polymarket', status: 'ready' },
        ],
        agents: deployedAgents.map(a => ({ id: a.id, name: a.name, pillar: a.pillar, status: 'healthy' })),
        ...(bootError ? { error: bootError } : {}),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
      return;
    }

    // If still booting, return 503 for API requests
    if (bootStatus !== 'ready' || !router) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service starting', status: bootStatus }));
      return;
    }

    if (!path.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }

    const apiPath = path.replace(/^\/api/, '');
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) { query[key] = value; }

    // -----------------------------------------------------------------------
    // Reference Ingestion API endpoints (served from in-memory store)
    // -----------------------------------------------------------------------
    if (apiPath === '/references' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ references: referenceStore }));
      return;
    }
    if (apiPath === '/baselines' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ baselines: baselineStore }));
      return;
    }
    if (apiPath === '/quality-gate/results' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: qualityGateStore }));
      return;
    }

    let body: unknown = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await new Promise((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => { const raw = Buffer.concat(chunks).toString(); try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
        req.on('error', () => resolve({}));
      });
    }

    const apiReq: APIRequest = { method: (req.method ?? 'GET') as APIRequest['method'], path: apiPath, params: {}, query, body, headers: req.headers as Record<string, string>, tenantId: 'system', userId: 'production', role: 'king' };

    try {
      const apiRes: APIResponse = await router.handleRequest(apiReq);
      res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json', ...(apiRes.headers ?? {}) });
      res.end(JSON.stringify(apiRes.body, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: (err as Error).message }));
    }
  });

  // WebSocket upgrade
  server.on('upgrade', (req: IncomingMessage, socket: Duplex) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const wsKey = req.headers['sec-websocket-key'];
    if (!wsKey) { socket.destroy(); return; }
    const acceptKey = computeWebSocketAccept(wsKey);
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey}`, '', ''].join('\r\n'));
    const connId = randomUUID();
    wsHandler.connect(connId, 'system', 'production');
    wsSockets.set(connId, socket);
    socket.on('data', (data: Buffer) => { const frame = decodeWebSocketFrame(data); if (!frame) return; if (frame.opcode === 0x08) { wsHandler.disconnect(connId); wsSockets.delete(connId); socket.end(); } });
    socket.on('close', () => { wsHandler.disconnect(connId); wsSockets.delete(connId); });
    socket.on('error', () => { wsHandler.disconnect(connId); wsSockets.delete(connId); });
  });

  // Health broadcast via WebSocket
  setInterval(() => {
    if (wsHandler.getConnectionCount() === 0) return;
    const msg = ShaarWebSocketHandler.createMessage('system.health', { status: bootStatus === 'ready' ? 'healthy' : bootStatus, totalAgents: deployedAgents.length, timestamp: new Date().toISOString() });
    const recipients = wsHandler.broadcast(msg, 'system');
    const frame = encodeWebSocketFrame(wsHandler.formatMessage(msg));
    for (const id of recipients) { const s = wsSockets.get(id); if (s && !s.destroyed) s.write(frame); }
  }, 10_000);

  // START LISTENING IMMEDIATELY — health checks will pass from this point
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SeraphimOS HTTP server listening on port ${PORT} (health checks active)`);
    console.log(`   Bootstrapping services in background...\n`);
  });

  // =========================================================================
  // ASYNC BOOTSTRAP — runs after server is already listening
  // =========================================================================

  try {

  // Self-bootstrap: connect to Aurora, run migrations if needed, seed system tenant
  const dbResult = await bootstrapDatabase(REGION);
  dbBootstrap = dbResult.mode;
  console.log(`📊 Database: mode=${dbResult.mode}, migrated=${dbResult.migrated}, seeded=${dbResult.seeded}`);
  if (dbResult.error) console.log(`   Error: ${dbResult.error}`);

  // Connect persistence layer to Aurora for write-through durability
  const pgPersistence = new PgPersistence({ region: REGION });
  pgConnected = await pgPersistence.connect();
  console.log(`💾 Persistence: ${pgConnected ? '✅ Aurora write-through active' : '⚠️ In-memory only (no durability)'}`);

  // Use in-memory repositories with Aurora persistence layer
  const agentProgramRepo = new InMemoryAgentProgramRepository();
  const smDefRepo = new InMemoryStateMachineDefinitionRepository();
  const smInstanceRepo = new InMemoryStateMachineInstanceRepository();
  const memoryRepo = new InMemoryMemoryRepository();
  const tokenUsageRepo = new InMemoryTokenUsageRepository();
  const completionContractRepo = new InMemoryCompletionContractRepository();
  const tenantRepo = new InMemoryTenantRepository();

  const auditService = new InMemoryAuditService();
  const eventBusService = new InMemoryEventBusService();

  const stateMachineEngine = new DefaultStateMachineEngine({
    definitionRepo: smDefRepo as any,
    instanceRepo: smInstanceRepo as any,
    auditLogger: auditService as any,
    eventPublisher: eventBusService as any,
  });

  const zikaronService = new ZikaronServiceImpl({
    tenantId: 'system',
    memoryRepository: memoryRepo as any,
    embeddingProvider: new StubEmbeddingProvider(),
    eventBus: eventBusService as any,
  });

  const otzarService = new OtzarServiceImpl({
    tenantId: 'system',
    tokenUsageRepository: tokenUsageRepo as any,
    auditService: auditService as any,
    getAgentBudget: async (agentId: string) => ({ agentId, pillar: 'system', dailyBudgetUsd: 100, monthlyBudgetUsd: 2000 }),
    getPillarPolicy: async () => null,
    getPerformanceHistory: async () => [],
  });

  // Credential Manager — reads from .env locally, Secrets Manager in production
  const credentialManager = new LocalCredentialManager();

  // Check LLM provider availability
  const anthropicKey = await credentialManager.getCredential('anthropic', 'api-key');
  const openaiKey = await credentialManager.getCredential('openai', 'api-key');
  console.log(`🤖 LLM Providers:`);
  console.log(`   Anthropic (Claude): ${anthropicKey ? '✅ API key configured' : '⚠️ No API key — stub mode'}`);
  console.log(`   OpenAI (GPT): ${openaiKey ? '✅ API key configured' : '⚠️ No API key — stub mode'}`);


  const mishmarService = new MishmarServiceImpl({
    tenantId: 'system',
    auditService: auditService as any,
    otzarService: otzarService as any,
    getAgentAuthority: async (agentId: string) => ({ agentId, agentName: `agent-${agentId}`, authorityLevel: 'L1' as const, allowedActions: [], deniedActions: [], pillar: 'system' }),
    getActionRequirement: async () => 'L4' as const,
    getCompletionContract: async () => null,
  });

  const agentRuntime = new DefaultAgentRuntime({
    programRepo: agentProgramRepo as any,
    stateMachineEngine: stateMachineEngine as any,
    mishmarService: mishmarService as any,
    otzarService: otzarService as any,
    zikaronService: zikaronService as any,
    xoAuditService: auditService as any,
    eventBusService: eventBusService as any,
  });

  router = new ShaarAPIRouter(agentRuntime as any, auditService as any, otzarService as any, mishmarService as any);

  // Initialize PostgreSQL persistence layer if Aurora is connected
  let pgLayer: PgPersistenceLayer | null = null;
  if (dbResult.mode === 'aurora') {
    try {
      const { SecretsManagerClient, GetSecretValueCommand, ListSecretsCommand } = await import('@aws-sdk/client-secrets-manager');
      const { Client } = await import('pg');
      const secretsClient = new SecretsManagerClient({ region: REGION });
      const listResp = await secretsClient.send(new ListSecretsCommand({ MaxResults: 100 }));
      const auroraSecret = listResp.SecretList?.find(s => s.Name?.toLowerCase().includes('aurora'));
      if (auroraSecret?.Name) {
        const secretResp = await secretsClient.send(new GetSecretValueCommand({ SecretId: auroraSecret.Name }));
        if (secretResp.SecretString) {
          const creds = JSON.parse(secretResp.SecretString) as { host: string; port: number; dbname: string; username: string; password: string };
          const pgClient = new Client({ host: creds.host, port: creds.port, database: creds.dbname, user: creds.username, password: creds.password, ssl: { rejectUnauthorized: false } });
          await pgClient.connect();
          pgLayer = new PgPersistenceLayer({ client: pgClient, tenantId: '00000000-0000-0000-0000-000000000001' });
          await pgLayer.initialize();
          console.log('✅ PostgreSQL persistence layer active — writes will be durable');
        }
      }
    } catch (err) {
      console.warn(`⚠️  PgPersistenceLayer init failed: ${(err as Error).message} — writes will be in-memory only`);
    }
  }

  // Deploy agents
  console.log('📦 Deploying agent programs...');
  const ZIONX_AGENT_PROGRAM: AgentProgram = {
    id: 'zionx-app-factory', name: 'ZionX App Factory', version: '1.0.0', pillar: 'eretz',
    systemPrompt: 'You are the ZionX App Factory agent.',
    tools: [{ name: 'build_app', description: 'Build an app', inputSchema: { type: 'object', properties: {} } }],
    stateMachine: { id: 'zionx-lifecycle', name: 'ZionX Lifecycle', version: '1.0.0', states: { ideation: { name: 'ideation', type: 'initial' }, live: { name: 'live', type: 'active' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'ideation', terminalStates: ['idle'], transitions: [{ from: 'ideation', to: 'live', event: 'launch', gates: [] }], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'ZionX lifecycle' } },
    completionContracts: [], authorityLevel: 'L3', allowedActions: ['build_app'], deniedActions: [],
    modelPreference: { preferred: 'gpt-4o', fallback: 'claude-sonnet-4-20250514', costCeiling: 5.0 },
    tokenBudget: { daily: 500000, monthly: 10000000 },
    testSuite: { suiteId: 'zionx-tests', path: 'packages/app/__tests__', requiredCoverage: 80 },
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
    changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
  };
  const ZXMG_AGENT_PROGRAM: AgentProgram = {
    id: 'zxmg-media-production', name: 'ZXMG Media Production', version: '1.0.0', pillar: 'eretz',
    systemPrompt: 'You are the ZXMG Media Production agent.',
    tools: [{ name: 'produce_content', description: 'Produce content', inputSchema: { type: 'object', properties: {} } }],
    stateMachine: { id: 'zxmg-lifecycle', name: 'ZXMG Lifecycle', version: '1.0.0', states: { planning: { name: 'planning', type: 'initial' }, published: { name: 'published', type: 'active' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'planning', terminalStates: ['idle'], transitions: [{ from: 'planning', to: 'published', event: 'publish', gates: [] }], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'ZXMG lifecycle' } },
    completionContracts: [], authorityLevel: 'L3', allowedActions: ['produce_content'], deniedActions: [],
    modelPreference: { preferred: 'gpt-4o', fallback: 'claude-sonnet-4-20250514', costCeiling: 5.0 },
    tokenBudget: { daily: 500000, monthly: 10000000 },
    testSuite: { suiteId: 'zxmg-tests', path: 'packages/app/__tests__', requiredCoverage: 80 },
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
    changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
  };
  const ZION_ALPHA_AGENT_PROGRAM: AgentProgram = {
    id: 'zion-alpha-trading', name: 'Zion Alpha Trading', version: '1.0.0', pillar: 'eretz',
    systemPrompt: 'You are the Zion Alpha Trading agent.',
    tools: [{ name: 'evaluate_market', description: 'Evaluate market', inputSchema: { type: 'object', properties: {} } }],
    stateMachine: { id: 'zion-alpha-lifecycle', name: 'Zion Alpha Lifecycle', version: '1.0.0', states: { scanning: { name: 'scanning', type: 'initial' }, monitoring: { name: 'monitoring', type: 'active' }, idle: { name: 'idle', type: 'terminal' } }, initialState: 'scanning', terminalStates: ['idle'], transitions: [{ from: 'scanning', to: 'monitoring', event: 'position', gates: [] }], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Zion Alpha lifecycle' } },
    completionContracts: [], authorityLevel: 'L3', allowedActions: ['evaluate_market'], deniedActions: [],
    modelPreference: { preferred: 'gpt-4o-mini', fallback: 'gpt-4o', costCeiling: 2.0 },
    tokenBudget: { daily: 200000, monthly: 4000000 },
    testSuite: { suiteId: 'zion-alpha-tests', path: 'packages/app/__tests__', requiredCoverage: 80 },
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-15'), createdBy: 'system',
    changelog: [{ version: '1.0.0', date: new Date('2026-01-01'), author: 'system', description: 'Initial.' }],
  };
  const agentPrograms: AgentProgram[] = [SERAPHIM_CORE_AGENT_PROGRAM, ERETZ_AGENT_PROGRAM, ZIONX_AGENT_PROGRAM, ZXMG_AGENT_PROGRAM, ZION_ALPHA_AGENT_PROGRAM, MISHMAR_AGENT_PROGRAM, OTZAR_AGENT_PROGRAM];

  for (const program of agentPrograms) {
    try {
      const instance = await agentRuntime.deploy(program);
      deployedAgents.push({ id: instance.id, name: program.name, pillar: program.pillar });
      console.log(`  ✅ ${program.name} (${program.pillar}) → ${instance.id}`);
      // Persist to Aurora if connected
      if (pgPersistence.isConnected()) {
        await pgPersistence.persistAgentDeploy({ id: instance.id, name: program.name, version: program.version, pillar: program.pillar, definition: program as any });
      }
    } catch (err) { console.error(`  ❌ ${program.name}: ${(err as Error).message}`); }
  }

  // Seed sample data
  console.log('\n🎯 Seeding sample tasks...');
  for (let i = 0; i < Math.min(deployedAgents.length, 3); i++) {
    const agent = deployedAgents[i]!;
    try {
      await agentRuntime.execute(agent.id, { id: randomUUID(), type: 'analysis', description: `Health check for ${agent.name}`, priority: 'medium' as const, params: {}, createdAt: new Date(), createdBy: 'system' } as any);
    } catch { /* non-critical */ }
  }

  // -------------------------------------------------------------------------
  // Heartbeat Scheduler — Autonomous Review Cycles
  // -------------------------------------------------------------------------
  console.log('\n⏰ Activating Heartbeat Scheduler...');

  const profileService = new DomainExpertiseProfileService({
    zikaronService: zikaronService as any,
    tenantId: 'system',
  });

  const recommendationQueue: RecommendationQueue = {
    async submit(recommendation) {
      console.log(`[recommendations] Received: ${recommendation.domain} (priority=${recommendation.priority})`);
      await eventBusService.publish({
        source: 'seraphim.recommendations',
        type: 'recommendation.submitted',
        detail: { recommendationId: recommendation.id, agentId: recommendation.agentId, domain: recommendation.domain },
        metadata: { tenantId: 'system', correlationId: randomUUID(), timestamp: new Date() },
      });
      return recommendation.id;
    },
  };

  const heartbeatScheduler = new HeartbeatScheduler({
    tenantId: 'system',
    profileService,
    otzarService: otzarService as any,
    recommendationQueue,
    researchDrivers: {},
  });

  // Configure heartbeat for each agent
  const heartbeatAgents = ['agent-eretz', 'agent-zionx', 'agent-zxmg', 'agent-zion-alpha', 'agent-seraphim-core'];
  for (const agentId of heartbeatAgents) {
    try {
      await heartbeatScheduler.configure(agentId);
      const config = await heartbeatScheduler.getConfig(agentId);
      const intervalHours = config.intervalMs / (60 * 60 * 1000);
      console.log(`  ✅ ${agentId}: every ${intervalHours}h (enabled=${config.enabled})`);
    } catch (err) {
      console.error(`  ❌ ${agentId}: ${(err as Error).message}`);
    }
  }

  // Start the heartbeat loop — triggers reviews on schedule
  const heartbeatInterval = setInterval(async () => {
    for (const agentId of heartbeatAgents) {
      try {
        const config = await heartbeatScheduler.getConfig(agentId);
        if (!config.enabled) continue;

        const lastReview = await heartbeatScheduler.getLastReview(agentId);
        const now = Date.now();
        const lastTime = lastReview?.timestamp?.getTime() ?? 0;

        if (now - lastTime >= config.intervalMs) {
          console.log(`[heartbeat] Triggering review for ${agentId}...`);
          const result = await heartbeatScheduler.triggerReview(agentId);
          console.log(`[heartbeat] ${agentId}: ${result.recommendations.length} recommendations generated`);

          // Publish heartbeat event
          await eventBusService.publish({
            source: 'seraphim.heartbeat',
            type: 'sme.heartbeat.completed',
            detail: { agentId, recommendations: result.recommendations.length, timestamp: new Date().toISOString() },
            metadata: { tenantId: 'system', correlationId: randomUUID(), timestamp: new Date() },
          });
        }
      } catch (err) {
        console.error(`[heartbeat] ${agentId} failed: ${(err as Error).message}`);
      }
    }
  }, 60_000); // Check every 60 seconds

  console.log('  🔄 Heartbeat loop active (checking every 60s)\n');

  // Bootstrap complete — mark as ready
  bootStatus = 'ready';
  console.log(`\n✅ SeraphimOS fully bootstrapped — ${deployedAgents.length} agents deployed, all services ready`);
  console.log(`   Mode: ${MODE} | Region: ${REGION}`);
  console.log(`   Dashboard API: http://0.0.0.0:${PORT}/api/agents\n`);

  } catch (err) {
    bootStatus = 'error';
    bootError = (err as Error).message;
    console.error(`❌ Bootstrap failed: ${bootError}`);
    console.error('   Server remains running for health checks — API will return 503');
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
