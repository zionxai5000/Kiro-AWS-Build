/**
 * SeraphimOS Local Development Server
 *
 * Boots the full system with in-memory repositories and real service
 * implementations. Serves the Shaar API on port 3000 with WebSocket
 * support on /ws for real-time updates.
 *
 * Usage: npx tsx packages/services/src/shaar/local-server.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';

// In-memory repositories
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

// In-memory services (no AWS dependencies)
import { InMemoryAuditService } from '../xo-audit/in-memory-audit.js';
import { InMemoryEventBusService } from '../event-bus/in-memory-event-bus.js';

// API Router and WebSocket Handler
import { ShaarAPIRouter, type APIRequest, type APIResponse } from './api-routes.js';
import { ShaarWebSocketHandler } from './websocket-handler.js';

// Agent programs
import { ZIONX_AGENT_PROGRAM } from '@seraphim/app/zionx/agent-program.js';
import { ZXMG_AGENT_PROGRAM } from '@seraphim/app/zxmg/agent-program.js';
import { ZION_ALPHA_AGENT_PROGRAM } from '@seraphim/app/zion-alpha/agent-program.js';

import type { AgentProgram } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Stub Embedding Provider (returns random vectors for local dev)
// ---------------------------------------------------------------------------

class StubEmbeddingProvider {
  async generateEmbedding(_text: string): Promise<number[]> {
    // Return a deterministic-ish 16-dim vector based on text hash
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
// Seraphim Core + Eretz Agent Programs (not in app/ yet)
// ---------------------------------------------------------------------------

const SERAPHIM_CORE_AGENT_PROGRAM: AgentProgram = {
  id: 'seraphim-core',
  name: 'Seraphim Core',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Seraphim Core orchestrator. You coordinate all pillars, manage system health, and enforce governance policies across the entire platform.',
  tools: [
    { name: 'system_health_check', description: 'Check system-wide health', inputSchema: { type: 'object', properties: {} } },
    { name: 'coordinate_pillars', description: 'Coordinate cross-pillar operations', inputSchema: { type: 'object', properties: {} } },
  ],
  stateMachine: {
    id: 'seraphim-core-lifecycle',
    name: 'Seraphim Core Lifecycle',
    version: '1.0.0',
    states: {
      monitoring: { name: 'monitoring', type: 'initial' },
      coordinating: { name: 'coordinating', type: 'active' },
      idle: { name: 'idle', type: 'terminal' },
    },
    initialState: 'monitoring',
    terminalStates: ['idle'],
    transitions: [
      { from: 'monitoring', to: 'coordinating', event: 'coordinate', gates: [] },
      { from: 'coordinating', to: 'monitoring', event: 'done', gates: [] },
    ],
    metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Seraphim Core lifecycle' },
  },
  completionContracts: [],
  authorityLevel: 'L1',
  allowedActions: ['system_health_check', 'coordinate_pillars', 'manage_agents', 'enforce_governance'],
  deniedActions: [],
  modelPreference: { preferred: 'claude-sonnet-4-20250514', fallback: 'gpt-4o', costCeiling: 10.0 },
  tokenBudget: { daily: 1000000, monthly: 20000000 },
  testSuite: { suiteId: 'seraphim-core-tests', path: 'packages/core/__tests__', requiredCoverage: 90 },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01T00:00:00Z'), author: 'system', description: 'Initial Seraphim Core agent.' }],
};

const ERETZ_AGENT_PROGRAM: AgentProgram = {
  id: 'eretz-business-orchestrator',
  name: 'Eretz Business Orchestrator',
  version: '1.0.0',
  pillar: 'eretz',
  systemPrompt: 'You are the Eretz Business Orchestrator. You manage all business operations, coordinate ZionX and ZXMG agents, and optimize revenue across the portfolio.',
  tools: [
    { name: 'manage_portfolio', description: 'Manage the app and content portfolio', inputSchema: { type: 'object', properties: {} } },
    { name: 'optimize_revenue', description: 'Optimize revenue across all products', inputSchema: { type: 'object', properties: {} } },
  ],
  stateMachine: {
    id: 'eretz-orchestrator-lifecycle',
    name: 'Eretz Orchestrator Lifecycle',
    version: '1.0.0',
    states: {
      planning: { name: 'planning', type: 'initial' },
      executing: { name: 'executing', type: 'active' },
      reviewing: { name: 'reviewing', type: 'active' },
      idle: { name: 'idle', type: 'terminal' },
    },
    initialState: 'planning',
    terminalStates: ['idle'],
    transitions: [
      { from: 'planning', to: 'executing', event: 'start', gates: [] },
      { from: 'executing', to: 'reviewing', event: 'review', gates: [] },
      { from: 'reviewing', to: 'planning', event: 'plan', gates: [] },
    ],
    metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Eretz orchestrator lifecycle' },
  },
  completionContracts: [],
  authorityLevel: 'L2',
  allowedActions: ['manage_portfolio', 'optimize_revenue', 'coordinate_agents', 'approve_submissions'],
  deniedActions: ['modify_system_config'],
  modelPreference: { preferred: 'gpt-4o', fallback: 'claude-sonnet-4-20250514', costCeiling: 5.0 },
  tokenBudget: { daily: 500000, monthly: 10000000 },
  testSuite: { suiteId: 'eretz-tests', path: 'packages/app/__tests__', requiredCoverage: 80 },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01T00:00:00Z'), author: 'system', description: 'Initial Eretz Business Orchestrator.' }],
};

// ---------------------------------------------------------------------------
// Mishmar + Otzar Agent Programs (system-level governance and resource agents)
// ---------------------------------------------------------------------------

const MISHMAR_AGENT_PROGRAM: AgentProgram = {
  id: 'mishmar-governance',
  name: 'Mishmar',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Mishmar governance agent. You enforce authorization policies, role separation, completion contracts, and audit all governance decisions across the platform.',
  tools: [
    { name: 'check_authority', description: 'Check agent authority level against action requirements', inputSchema: { type: 'object', properties: {} } },
    { name: 'validate_separation', description: 'Validate role separation for controlled actions', inputSchema: { type: 'object', properties: {} } },
    { name: 'validate_completion', description: 'Validate workflow outputs against completion contracts', inputSchema: { type: 'object', properties: {} } },
    { name: 'issue_execution_token', description: 'Issue execution tokens for controlled actions', inputSchema: { type: 'object', properties: {} } },
  ],
  stateMachine: {
    id: 'mishmar-lifecycle',
    name: 'Mishmar Governance Lifecycle',
    version: '1.0.0',
    states: {
      monitoring: { name: 'monitoring', type: 'initial' },
      enforcing: { name: 'enforcing', type: 'active' },
      idle: { name: 'idle', type: 'terminal' },
    },
    initialState: 'monitoring',
    terminalStates: ['idle'],
    transitions: [
      { from: 'monitoring', to: 'enforcing', event: 'enforce', gates: [] },
      { from: 'enforcing', to: 'monitoring', event: 'done', gates: [] },
    ],
    metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Mishmar governance lifecycle' },
  },
  completionContracts: [],
  authorityLevel: 'L1',
  allowedActions: ['check_authority', 'validate_separation', 'validate_completion', 'issue_execution_token', 'block_action', 'escalate'],
  deniedActions: [],
  modelPreference: { preferred: 'claude-sonnet-4-20250514', fallback: 'gpt-4o', costCeiling: 5.0 },
  tokenBudget: { daily: 200000, monthly: 4000000 },
  testSuite: { suiteId: 'mishmar-tests', path: 'packages/services/__tests__', requiredCoverage: 95 },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01T00:00:00Z'), author: 'system', description: 'Initial Mishmar governance agent.' }],
};

const OTZAR_AGENT_PROGRAM: AgentProgram = {
  id: 'otzar-resource-manager',
  name: 'Otzar',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Otzar resource manager agent. You manage token budgets, route tasks to optimal LLM models, track costs, and enforce spend limits across the platform.',
  tools: [
    { name: 'check_budget', description: 'Check agent or pillar budget allocation', inputSchema: { type: 'object', properties: {} } },
    { name: 'route_model', description: 'Route a task to the optimal LLM model based on cost and complexity', inputSchema: { type: 'object', properties: {} } },
    { name: 'record_usage', description: 'Record token usage and cost for a completed task', inputSchema: { type: 'object', properties: {} } },
    { name: 'generate_cost_report', description: 'Generate cost optimization report', inputSchema: { type: 'object', properties: {} } },
  ],
  stateMachine: {
    id: 'otzar-lifecycle',
    name: 'Otzar Resource Manager Lifecycle',
    version: '1.0.0',
    states: {
      monitoring: { name: 'monitoring', type: 'initial' },
      optimizing: { name: 'optimizing', type: 'active' },
      idle: { name: 'idle', type: 'terminal' },
    },
    initialState: 'monitoring',
    terminalStates: ['idle'],
    transitions: [
      { from: 'monitoring', to: 'optimizing', event: 'optimize', gates: [] },
      { from: 'optimizing', to: 'monitoring', event: 'done', gates: [] },
    ],
    metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'Otzar resource manager lifecycle' },
  },
  completionContracts: [],
  authorityLevel: 'L2',
  allowedActions: ['check_budget', 'route_model', 'record_usage', 'generate_cost_report', 'enforce_budget_limit', 'block_overspend'],
  deniedActions: ['modify_system_config'],
  modelPreference: { preferred: 'gpt-4o-mini', fallback: 'gpt-4o', costCeiling: 2.0 },
  tokenBudget: { daily: 100000, monthly: 2000000 },
  testSuite: { suiteId: 'otzar-tests', path: 'packages/services/__tests__', requiredCoverage: 90 },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [{ version: '1.0.0', date: new Date('2026-01-01T00:00:00Z'), author: 'system', description: 'Initial Otzar resource manager agent.' }],
};

// ---------------------------------------------------------------------------
// Minimal WebSocket frame helpers (no external ws dependency)
// ---------------------------------------------------------------------------

/** Compute the Sec-WebSocket-Accept value for the handshake. */
function computeWebSocketAccept(key: string): string {
  return createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-5AB9DC85B11D')
    .digest('base64');
}

/** Encode a UTF-8 string into a WebSocket text frame. */
function encodeWebSocketFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

/** Decode a WebSocket frame from a client (masked). Returns null for non-text or close frames. */
function decodeWebSocketFrame(buf: Buffer): { opcode: number; payload: string } | null {
  if (buf.length < 2) return null;

  const opcode = buf[0]! & 0x0f;
  const masked = (buf[1]! & 0x80) !== 0;
  let payloadLen = buf[1]! & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  let maskKey: Buffer | undefined;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + payloadLen) return null;

  const payloadBuf = buf.subarray(offset, offset + payloadLen);
  if (maskKey) {
    for (let i = 0; i < payloadBuf.length; i++) {
      payloadBuf[i] = payloadBuf[i]! ^ maskKey[i % 4]!;
    }
  }

  return { opcode, payload: payloadBuf.toString('utf-8') };
}

// ---------------------------------------------------------------------------
// Boot the system
// ---------------------------------------------------------------------------

async function main() {
  console.log('🔥 SeraphimOS Local Server — booting...\n');

  // 1. Create in-memory repositories
  const agentProgramRepo = new InMemoryAgentProgramRepository();
  const smDefRepo = new InMemoryStateMachineDefinitionRepository();
  const smInstanceRepo = new InMemoryStateMachineInstanceRepository();
  const memoryRepo = new InMemoryMemoryRepository();
  const tokenUsageRepo = new InMemoryTokenUsageRepository();
  const completionContractRepo = new InMemoryCompletionContractRepository();
  const tenantRepo = new InMemoryTenantRepository();

  // 2. Create in-memory services
  const auditService = new InMemoryAuditService();
  const eventBusService = new InMemoryEventBusService();

  // 3. Create the state machine engine
  const stateMachineEngine = new DefaultStateMachineEngine({
    definitionRepo: smDefRepo as any,
    instanceRepo: smInstanceRepo as any,
    auditLogger: auditService as any,
    eventPublisher: eventBusService as any,
  });

  // 4. Create Zikaron (memory) service
  const zikaronService = new ZikaronServiceImpl({
    tenantId: 'system',
    memoryRepository: memoryRepo as any,
    embeddingProvider: new StubEmbeddingProvider(),
    eventBus: eventBusService as any,
  });

  // 5. Create XO Audit service (use in-memory version)
  // We use the in-memory audit service directly since the real one needs DynamoDB

  // 6. Create Otzar (resource manager) service
  const otzarService = new OtzarServiceImpl({
    tenantId: 'system',
    tokenUsageRepository: tokenUsageRepo as any,
    auditService: auditService as any,
    getAgentBudget: async (agentId: string) => ({
      agentId,
      pillar: 'system',
      dailyBudgetUsd: 100,
      monthlyBudgetUsd: 2000,
    }),
    getPillarPolicy: async () => null,
    getPerformanceHistory: async () => [],
  });

  // 7. Create Mishmar (governance) service
  const mishmarService = new MishmarServiceImpl({
    tenantId: 'system',
    auditService: auditService as any,
    otzarService: otzarService as any,
    getAgentAuthority: async (agentId: string) => ({
      agentId,
      agentName: `agent-${agentId}`,
      authorityLevel: 'L1' as const,
      allowedActions: [],
      deniedActions: [],
      pillar: 'system',
    }),
    getActionRequirement: async () => 'L4' as const,
    getCompletionContract: async () => null,
  });

  // 8. Create the Agent Runtime
  const agentRuntime = new DefaultAgentRuntime({
    programRepo: agentProgramRepo as any,
    stateMachineEngine: stateMachineEngine as any,
    mishmarService: mishmarService as any,
    otzarService: otzarService as any,
    zikaronService: zikaronService as any,
    xoAuditService: auditService as any,
    eventBusService: eventBusService as any,
  });

  // 9. Create the API Router (no auth middleware for local dev)
  const router = new ShaarAPIRouter(
    agentRuntime as any,
    auditService as any,
    otzarService as any,
    mishmarService as any,
  );

  // 10. Create the WebSocket handler
  const wsHandler = new ShaarWebSocketHandler();

  // Track raw sockets for WebSocket connections so we can send frames
  const wsSockets = new Map<string, Duplex>();

  // 11. Seed: deploy all 7 agent programs
  console.log('📦 Deploying agent programs...');

  const agentPrograms: AgentProgram[] = [
    SERAPHIM_CORE_AGENT_PROGRAM,
    ERETZ_AGENT_PROGRAM,
    ZIONX_AGENT_PROGRAM,
    ZXMG_AGENT_PROGRAM,
    ZION_ALPHA_AGENT_PROGRAM,
    MISHMAR_AGENT_PROGRAM,
    OTZAR_AGENT_PROGRAM,
  ];

  const deployedAgents: Array<{ id: string; name: string; pillar: string }> = [];

  for (const program of agentPrograms) {
    try {
      const instance = await agentRuntime.deploy(program);
      deployedAgents.push({ id: instance.id, name: program.name, pillar: program.pillar });
      console.log(`  ✅ ${program.name} (${program.pillar}, ${program.authorityLevel}) → ${instance.id}`);
    } catch (err) {
      console.error(`  ❌ Failed to deploy ${program.name}:`, (err as Error).message);
    }
  }

  // 12. Seed: execute sample tasks to generate audit entries, token usage, and memory
  console.log('\n🎯 Executing sample tasks...');

  const sampleTasks = [
    { type: 'analysis', description: 'Analyze system health metrics', priority: 'medium' as const },
    { type: 'classification', description: 'Classify incoming support request', priority: 'low' as const },
    { type: 'code_generation', description: 'Generate landing page component', priority: 'high' as const },
    { type: 'creative', description: 'Generate video script for product launch', priority: 'medium' as const },
    { type: 'analysis', description: 'Evaluate market opportunity for fitness app niche', priority: 'high' as const },
    { type: 'classification', description: 'Validate governance policy compliance', priority: 'high' as const },
    { type: 'analysis', description: 'Analyze token spend across all pillars', priority: 'medium' as const },
  ];

  for (let i = 0; i < deployedAgents.length && i < sampleTasks.length; i++) {
    const agent = deployedAgents[i]!;
    const task = sampleTasks[i]!;
    try {
      const result = await agentRuntime.execute(agent.id, {
        id: randomUUID(),
        type: task.type,
        description: task.description,
        priority: task.priority,
        params: { sample: true },
        createdAt: new Date(),
        createdBy: 'seed-script',
      } as any);
      console.log(`  ✅ ${agent.name}: ${task.type} → ${result.success ? 'success' : 'failed'}`);
    } catch (err) {
      console.error(`  ❌ ${agent.name}: ${task.type} → ${(err as Error).message}`);
    }
  }

  // 13. Seed: record additional audit entries for governance decisions and state transitions
  console.log('\n📝 Recording additional audit entries...');

  const governanceEntries = [
    { agentId: 'seraphim-core', agentName: 'Seraphim Core', action: 'coordinate_pillars', target: 'eretz', outcome: 'success' as const, governanceType: 'authorization' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', action: 'validate_separation', target: 'zionx-submission-workflow', outcome: 'success' as const, governanceType: 'role_separation' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', action: 'validate_completion', target: 'zxmg-video-pipeline', outcome: 'success' as const, governanceType: 'completion_contract' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', action: 'block_action', target: 'unauthorized-agent-access', outcome: 'blocked' as const, governanceType: 'authorization' },
  ];

  for (const entry of governanceEntries) {
    try {
      await auditService.recordGovernanceDecision({
        tenantId: 'system',
        actingAgentId: entry.agentId,
        actingAgentName: entry.agentName,
        actionType: entry.action,
        target: entry.target,
        authorizationChain: [{ agentId: entry.agentId, level: 'L1', decision: 'approved', timestamp: new Date() }],
        executionTokens: [],
        outcome: entry.outcome,
        details: { pillar: 'system', source: 'seed' },
        governanceType: entry.governanceType as 'authorization' | 'escalation' | 'completion_validation' | 'token_grant',
      });
      console.log(`  ✅ Governance: ${entry.agentName} → ${entry.action} (${entry.outcome})`);
    } catch (err) {
      console.error(`  ❌ Governance audit: ${(err as Error).message}`);
    }
  }

  const transitionEntries = [
    { agentId: 'seraphim-core', agentName: 'Seraphim Core', from: 'monitoring', to: 'coordinating', smId: 'seraphim-core-lifecycle' },
    { agentId: 'seraphim-core', agentName: 'Seraphim Core', from: 'coordinating', to: 'monitoring', smId: 'seraphim-core-lifecycle' },
    { agentId: 'eretz-business-orchestrator', agentName: 'Eretz Business Orchestrator', from: 'planning', to: 'executing', smId: 'eretz-orchestrator-lifecycle' },
    { agentId: 'eretz-business-orchestrator', agentName: 'Eretz Business Orchestrator', from: 'executing', to: 'reviewing', smId: 'eretz-orchestrator-lifecycle' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', from: 'monitoring', to: 'enforcing', smId: 'mishmar-lifecycle' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', from: 'enforcing', to: 'monitoring', smId: 'mishmar-lifecycle' },
    { agentId: 'otzar-resource-manager', agentName: 'Otzar', from: 'monitoring', to: 'optimizing', smId: 'otzar-lifecycle' },
    { agentId: 'otzar-resource-manager', agentName: 'Otzar', from: 'optimizing', to: 'monitoring', smId: 'otzar-lifecycle' },
  ];

  for (const entry of transitionEntries) {
    try {
      await auditService.recordStateTransition({
        tenantId: 'system',
        actingAgentId: entry.agentId,
        actingAgentName: entry.agentName,
        actionType: 'state_transition',
        target: entry.smId,
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: { pillar: 'system', source: 'seed' },
        stateMachineId: entry.smId,
        instanceId: randomUUID(),
        previousState: entry.from,
        newState: entry.to,
        gateResults: [],
      });
      console.log(`  ✅ Transition: ${entry.agentName} ${entry.from} → ${entry.to}`);
    } catch (err) {
      console.error(`  ❌ Transition audit: ${(err as Error).message}`);
    }
  }

  // 14. Seed: record additional token usage across different models and task types
  console.log('\n💰 Recording additional token usage...');

  const tokenEntries = [
    { agentId: 'seraphim-core', pillar: 'system', provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputTokens: 2500, outputTokens: 800, costUsd: 0.0285, taskType: 'analysis' },
    { agentId: 'eretz-business-orchestrator', pillar: 'eretz', provider: 'openai', model: 'gpt-4o', inputTokens: 1800, outputTokens: 600, costUsd: 0.018, taskType: 'analysis' },
    { agentId: 'mishmar-governance', pillar: 'system', provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputTokens: 1200, outputTokens: 400, costUsd: 0.012, taskType: 'classification' },
    { agentId: 'otzar-resource-manager', pillar: 'system', provider: 'openai', model: 'gpt-4o-mini', inputTokens: 800, outputTokens: 200, costUsd: 0.0008, taskType: 'classification' },
    { agentId: 'seraphim-core', pillar: 'system', provider: 'anthropic', model: 'claude-sonnet-4-20250514', inputTokens: 3200, outputTokens: 1100, costUsd: 0.038, taskType: 'creative' },
    { agentId: 'eretz-business-orchestrator', pillar: 'eretz', provider: 'openai', model: 'gpt-4o', inputTokens: 4000, outputTokens: 1500, costUsd: 0.045, taskType: 'code_generation' },
    { agentId: 'otzar-resource-manager', pillar: 'system', provider: 'openai', model: 'gpt-4o-mini', inputTokens: 500, outputTokens: 150, costUsd: 0.0005, taskType: 'analysis' },
  ];

  for (const entry of tokenEntries) {
    try {
      await otzarService.recordUsage({
        agentId: entry.agentId,
        pillar: entry.pillar,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
        taskType: entry.taskType,
        tenantId: 'system',
      } as any);
      console.log(`  ✅ Token usage: ${entry.agentId} → ${entry.model} ($${entry.costUsd})`);
    } catch (err) {
      console.error(`  ❌ Token usage: ${(err as Error).message}`);
    }
  }

  // 15. Create the HTTP server
  const PORT = 3000;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for dashboard
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Identify this as the real SeraphimOS runtime (dashboard checks this header)
    res.setHeader('x-seraphim-runtime', 'live');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    // Only handle /api/* routes
    if (!path.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. API routes are under /api/' }));
      return;
    }

    // Strip /api prefix for the router
    const apiPath = path.replace(/^\/api/, '');

    // Parse query params
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      query[key] = value;
    }

    // Parse body for POST/PUT
    let body: unknown = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await parseBody(req);
    }

    // Build APIRequest
    const apiReq: APIRequest = {
      method: (req.method ?? 'GET') as APIRequest['method'],
      path: apiPath,
      params: {},
      query,
      body,
      headers: req.headers as Record<string, string>,
      tenantId: 'system',
      userId: 'local-dev',
      role: 'king',
    };

    try {
      const apiRes: APIResponse = await router.handleRequest(apiReq);
      res.writeHead(apiRes.statusCode, {
        'Content-Type': 'application/json',
        ...(apiRes.headers ?? {}),
      });
      res.end(JSON.stringify(apiRes.body, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: (err as Error).message }));
    }
  });

  // 16. Handle WebSocket upgrade on /ws
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Perform WebSocket handshake (RFC 6455)
    const wsKey = req.headers['sec-websocket-key'];
    if (!wsKey) {
      socket.destroy();
      return;
    }

    const acceptKey = computeWebSocketAccept(wsKey);
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    socket.write(responseHeaders);

    // Register connection with ShaarWebSocketHandler
    const connId = randomUUID();
    wsHandler.connect(connId, 'system', 'local-dev');
    wsSockets.set(connId, socket);

    console.log(`  🔌 WebSocket connected: ${connId}`);

    // Handle incoming messages
    socket.on('data', (data: Buffer) => {
      const frame = decodeWebSocketFrame(data);
      if (!frame) return;

      // Close frame
      if (frame.opcode === 0x08) {
        wsHandler.disconnect(connId);
        wsSockets.delete(connId);
        socket.end();
        return;
      }

      // Text frame — handle subscribe/unsubscribe commands
      if (frame.opcode === 0x01) {
        try {
          const msg = JSON.parse(frame.payload);
          if (msg.action === 'subscribe' && Array.isArray(msg.events)) {
            wsHandler.subscribe(connId, msg.events);
          } else if (msg.action === 'unsubscribe' && Array.isArray(msg.events)) {
            wsHandler.unsubscribe(connId, msg.events);
          }
        } catch {
          // Ignore malformed messages
        }
      }
    });

    socket.on('close', () => {
      wsHandler.disconnect(connId);
      wsSockets.delete(connId);
      console.log(`  🔌 WebSocket disconnected: ${connId}`);
    });

    socket.on('error', () => {
      wsHandler.disconnect(connId);
      wsSockets.delete(connId);
    });
  });

  // 17. Periodically broadcast system health via WebSocket
  setInterval(() => {
    if (wsHandler.getConnectionCount() === 0) return;

    const healthMsg = ShaarWebSocketHandler.createMessage('system.health', {
      status: 'healthy',
      totalAgents: deployedAgents.length,
      healthyAgents: deployedAgents.length,
      timestamp: new Date().toISOString(),
    });

    const recipients = wsHandler.broadcast(healthMsg, 'system');
    const frameData = encodeWebSocketFrame(wsHandler.formatMessage(healthMsg));

    for (const recipientId of recipients) {
      const sock = wsSockets.get(recipientId);
      if (sock && !sock.destroyed) {
        sock.write(frameData);
      }
    }
  }, 10_000);

  server.listen(PORT, () => {
    console.log(`\n🚀 SeraphimOS Local Server running on http://localhost:${PORT}`);
    console.log(`\n   API endpoints:`);
    console.log(`   GET  http://localhost:${PORT}/api/agents   — List all agents`);
    console.log(`   GET  http://localhost:${PORT}/api/pillars  — Pillar metrics`);
    console.log(`   GET  http://localhost:${PORT}/api/costs    — Cost report`);
    console.log(`   GET  http://localhost:${PORT}/api/audit    — Audit trail`);
    console.log(`   GET  http://localhost:${PORT}/api/health   — System health`);
    console.log(`   WS   ws://localhost:${PORT}/ws             — WebSocket (real-time updates)`);
    console.log(`\n   ${deployedAgents.length} agents deployed (including Mishmar + Otzar), ready for requests.\n`);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
