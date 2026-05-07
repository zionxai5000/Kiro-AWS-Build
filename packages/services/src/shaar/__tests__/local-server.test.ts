/**
 * Integration tests for SeraphimOS Local Development Server
 *
 * Validates: Requirements 19.1, 19.2
 *
 * Tests the full boot sequence with in-memory repositories and real service
 * implementations. Verifies all API endpoints return real data from actual
 * service code — not mocks.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

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
import { MishmarServiceImpl } from '../../mishmar/service.js';
import { ZikaronServiceImpl } from '../../zikaron/service.js';
import { OtzarServiceImpl } from '../../otzar/service.js';

// In-memory services (no AWS dependencies)
import { InMemoryAuditService } from '../../xo-audit/in-memory-audit.js';
import { InMemoryEventBusService } from '../../event-bus/in-memory-event-bus.js';

// API Router
import { ShaarAPIRouter, type APIRequest } from '../api-routes.js';

// Agent programs
import { ZIONX_AGENT_PROGRAM } from '@seraphim/app/zionx/agent-program.js';
import { ZXMG_AGENT_PROGRAM } from '@seraphim/app/zxmg/agent-program.js';
import { ZION_ALPHA_AGENT_PROGRAM } from '@seraphim/app/zion-alpha/agent-program.js';

import type { AgentProgram } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Stub Embedding Provider (same as local-server.ts)
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
// Agent Programs (inline, same as local-server.ts)
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
  systemPrompt: 'You are the Eretz Business Orchestrator.',
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

const MISHMAR_AGENT_PROGRAM: AgentProgram = {
  id: 'mishmar-governance',
  name: 'Mishmar',
  version: '1.0.0',
  pillar: 'system',
  systemPrompt: 'You are the Mishmar governance agent.',
  tools: [
    { name: 'check_authority', description: 'Check agent authority level', inputSchema: { type: 'object', properties: {} } },
    { name: 'validate_separation', description: 'Validate role separation', inputSchema: { type: 'object', properties: {} } },
    { name: 'validate_completion', description: 'Validate completion contracts', inputSchema: { type: 'object', properties: {} } },
    { name: 'issue_execution_token', description: 'Issue execution tokens', inputSchema: { type: 'object', properties: {} } },
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
  systemPrompt: 'You are the Otzar resource manager agent.',
  tools: [
    { name: 'check_budget', description: 'Check budget allocation', inputSchema: { type: 'object', properties: {} } },
    { name: 'route_model', description: 'Route task to optimal model', inputSchema: { type: 'object', properties: {} } },
    { name: 'record_usage', description: 'Record token usage', inputSchema: { type: 'object', properties: {} } },
    { name: 'generate_cost_report', description: 'Generate cost report', inputSchema: { type: 'object', properties: {} } },
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
// Helper
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<APIRequest> = {}): APIRequest {
  return {
    method: 'GET',
    path: '/agents',
    params: {},
    query: {},
    body: undefined,
    headers: {},
    tenantId: 'system',
    userId: 'local-dev',
    role: 'king',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared state — boot once, test many
// ---------------------------------------------------------------------------

let router: ShaarAPIRouter;
let auditService: InMemoryAuditService;
let otzarService: OtzarServiceImpl;
let deployedAgents: Array<{ id: string; name: string; pillar: string }>;

const ALL_AGENT_PROGRAMS: AgentProgram[] = [
  SERAPHIM_CORE_AGENT_PROGRAM,
  ERETZ_AGENT_PROGRAM,
  ZIONX_AGENT_PROGRAM,
  ZXMG_AGENT_PROGRAM,
  ZION_ALPHA_AGENT_PROGRAM,
  MISHMAR_AGENT_PROGRAM,
  OTZAR_AGENT_PROGRAM,
];

beforeAll(async () => {
  // 1. Create in-memory repositories
  const agentProgramRepo = new InMemoryAgentProgramRepository();
  const smDefRepo = new InMemoryStateMachineDefinitionRepository();
  const smInstanceRepo = new InMemoryStateMachineInstanceRepository();
  const memoryRepo = new InMemoryMemoryRepository();
  const tokenUsageRepo = new InMemoryTokenUsageRepository();

  // 2. Create in-memory services
  auditService = new InMemoryAuditService();
  const eventBusService = new InMemoryEventBusService();

  // 3. Create the state machine engine
  const stateMachineEngine = new DefaultStateMachineEngine({
    definitionRepo: smDefRepo as any,
    instanceRepo: smInstanceRepo as any,
    auditLogger: auditService as any,
    eventPublisher: eventBusService as any,
  });

  // 4. Create Zikaron service
  const zikaronService = new ZikaronServiceImpl({
    tenantId: 'system',
    memoryRepository: memoryRepo as any,
    embeddingProvider: new StubEmbeddingProvider(),
    eventBus: eventBusService as any,
  });

  // 5. Create Otzar service
  otzarService = new OtzarServiceImpl({
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

  // 6. Create Mishmar service
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

  // 7. Create the Agent Runtime
  const agentRuntime = new DefaultAgentRuntime({
    programRepo: agentProgramRepo as any,
    stateMachineEngine: stateMachineEngine as any,
    mishmarService: mishmarService as any,
    otzarService: otzarService as any,
    zikaronService: zikaronService as any,
    xoAuditService: auditService as any,
    eventBusService: eventBusService as any,
  });

  // 8. Create the API Router
  router = new ShaarAPIRouter(
    agentRuntime as any,
    auditService as any,
    otzarService as any,
    mishmarService as any,
  );

  // 9. Deploy all 7 agent programs
  deployedAgents = [];
  for (const program of ALL_AGENT_PROGRAMS) {
    const instance = await agentRuntime.deploy(program);
    deployedAgents.push({ id: instance.id, name: program.name, pillar: program.pillar });
  }

  // 10. Execute sample tasks
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
      await agentRuntime.execute(agent.id, {
        id: randomUUID(),
        type: task.type,
        description: task.description,
        priority: task.priority,
        params: { sample: true },
        createdAt: new Date(),
        createdBy: 'seed-script',
      } as any);
    } catch {
      // Some tasks may fail — that's fine for seeding
    }
  }

  // 11. Record governance audit entries
  const governanceEntries = [
    { agentId: 'seraphim-core', agentName: 'Seraphim Core', action: 'coordinate_pillars', target: 'eretz', outcome: 'success' as const, governanceType: 'authorization' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', action: 'validate_separation', target: 'zionx-submission-workflow', outcome: 'success' as const, governanceType: 'role_separation' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', action: 'validate_completion', target: 'zxmg-video-pipeline', outcome: 'success' as const, governanceType: 'completion_contract' },
    { agentId: 'mishmar-governance', agentName: 'Mishmar', action: 'block_action', target: 'unauthorized-agent-access', outcome: 'blocked' as const, governanceType: 'authorization' },
  ];

  for (const entry of governanceEntries) {
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
  }

  // 12. Record state transition audit entries
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
  }

  // 13. Record additional token usage
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
  }
}, 30_000);

// ===========================================================================
// Tests
// ===========================================================================

describe('Local Dev Server — API Endpoints with Real Service Data', () => {
  it('GET /agents returns 200 with all 7 deployed agents', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/agents' }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { agents: any[] };
    expect(body.agents).toHaveLength(7);
  });

  it('GET /agents/:id returns 200 with a specific agent state', async () => {
    const agentId = deployedAgents[0]!.id;
    const res = await router.handleRequest(makeRequest({ path: `/agents/${agentId}` }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { agent: any };
    expect(body.agent).toBeDefined();
  });

  it('GET /pillars returns 200 with pillar metrics from real agents', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/pillars' }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { pillars: any[] };
    expect(body.pillars.length).toBeGreaterThan(0);
    // Each pillar should have agentCount and activeAgents
    for (const pillar of body.pillars) {
      expect(pillar).toHaveProperty('name');
      expect(pillar).toHaveProperty('agentCount');
      expect(pillar).toHaveProperty('activeAgents');
      expect(pillar.agentCount).toBeGreaterThan(0);
    }
  });

  it('GET /costs returns 200 with cost report from real Otzar tracking', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/costs', query: {} }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { costs: any };
    expect(body.costs).toBeDefined();
    expect(body.costs.totalCostUsd).toBeGreaterThan(0);
  });

  it('GET /audit returns 200 with audit entries from real XO Audit', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/audit', query: {} }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { entries: any[] };
    expect(body.entries).toBeDefined();
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it('GET /health returns 200 with healthy status and correct agent counts', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/health' }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { status: string; totalAgents: number; healthyAgents: number; timestamp: string };
    expect(body.status).toBe('healthy');
    expect(body.totalAgents).toBe(7);
    expect(body.healthyAgents).toBeGreaterThan(0);
    expect(body.timestamp).toBeDefined();
  });

  it('GET /unknown returns 404', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/unknown' }));
    expect(res.statusCode).toBe(404);
  });
});

describe('Local Dev Server — Seed Data Creates Agents in Correct States', () => {
  it('all 7 agents are deployed', () => {
    expect(deployedAgents).toHaveLength(7);
  });

  it('deployed agents include all expected names', () => {
    const names = deployedAgents.map((a) => a.name);
    expect(names).toContain('Seraphim Core');
    expect(names).toContain('Eretz Business Orchestrator');
    expect(names).toContain('ZionX App Factory');
    expect(names).toContain('ZXMG Media Production');
    expect(names).toContain('Zion Alpha Trading');
    expect(names).toContain('Mishmar');
    expect(names).toContain('Otzar');
  });

  it('each agent has the correct pillar assignment', () => {
    const pillarMap = new Map(deployedAgents.map((a) => [a.name, a.pillar]));
    expect(pillarMap.get('Seraphim Core')).toBe('system');
    expect(pillarMap.get('Eretz Business Orchestrator')).toBe('eretz');
    expect(pillarMap.get('ZionX App Factory')).toBe('eretz');
    expect(pillarMap.get('ZXMG Media Production')).toBe('eretz');
    expect(pillarMap.get('Zion Alpha Trading')).toBe('otzar');
    expect(pillarMap.get('Mishmar')).toBe('system');
    expect(pillarMap.get('Otzar')).toBe('system');
  });

  it('agents are in ready state after deployment and task execution', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/agents' }));
    const body = res.body as { agents: any[] };
    // After executing tasks, agents should be back in 'ready' state
    for (const agent of body.agents) {
      expect(['ready', 'executing']).toContain(agent.state);
    }
  });

  it('agents have correct pillar in the API response', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/agents' }));
    const body = res.body as { agents: any[] };
    const pillars = new Set(body.agents.map((a: any) => a.pillar));
    expect(pillars.has('system')).toBe(true);
    expect(pillars.has('eretz')).toBe(true);
  });
});

describe('Local Dev Server — Audit Entries Are Real XO Audit Records', () => {
  it('audit entries have proper structure', () => {
    const records = auditService.getRecords();
    expect(records.length).toBeGreaterThan(0);

    const record = records[0]!;
    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('tenantId');
    expect(record).toHaveProperty('timestamp');
    expect(record).toHaveProperty('type');
    expect(record).toHaveProperty('actingAgentId');
    expect(record).toHaveProperty('actionType');
    expect(record).toHaveProperty('outcome');
    expect(record).toHaveProperty('hash');
    expect(record).toHaveProperty('previousHash');
  });

  it('audit entries include governance decisions', () => {
    const records = auditService.getRecords();
    const governanceRecords = records.filter((r) => r.type === 'governance');
    expect(governanceRecords.length).toBeGreaterThan(0);

    // Check for specific governance types
    const governanceTypes = governanceRecords.map((r) => (r.details as any)?.governanceType);
    expect(governanceTypes).toContain('authorization');
    expect(governanceTypes).toContain('role_separation');
    expect(governanceTypes).toContain('completion_contract');
  });

  it('audit entries include state transitions with previousState and newState', () => {
    const records = auditService.getRecords();
    const transitionRecords = records.filter((r) => r.type === 'transition');
    expect(transitionRecords.length).toBeGreaterThan(0);

    for (const record of transitionRecords) {
      const details = record.details as any;
      expect(details).toHaveProperty('previousState');
      expect(details).toHaveProperty('newState');
      expect(typeof details.previousState).toBe('string');
      expect(typeof details.newState).toBe('string');
    }
  });

  it('audit entries have SHA-256 hash chain integrity', async () => {
    const records = auditService.getRecords();
    expect(records.length).toBeGreaterThan(0);

    // Verify integrity of the last record (walks the full chain)
    const lastRecord = records[records.length - 1]!;
    const integrityResult = await auditService.verifyIntegrity(lastRecord.id);
    expect(integrityResult.valid).toBe(true);
    expect(integrityResult.chainLength).toBeGreaterThan(1);
  });

  it('audit entries can be filtered by agentId', async () => {
    const res = await router.handleRequest(
      makeRequest({ path: '/audit', query: { agentId: 'mishmar-governance' } }),
    );
    const body = res.body as { entries: any[] };
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry.actingAgentId).toBe('mishmar-governance');
    }
  });

  it('audit entries can be filtered by actionType', async () => {
    const res = await router.handleRequest(
      makeRequest({ path: '/audit', query: { actionType: 'state_transition' } }),
    );
    const body = res.body as { entries: any[] };
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry.actionType).toBe('state_transition');
    }
  });
});

describe('Local Dev Server — Cost Data From Real Otzar Token Tracking', () => {
  it('cost report has totalCostUsd > 0', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/costs', query: {} }));
    const body = res.body as { costs: any };
    expect(body.costs.totalCostUsd).toBeGreaterThan(0);
  });

  it('cost report has byAgent breakdown with real agent IDs', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/costs', query: {} }));
    const body = res.body as { costs: any };
    const byAgent = body.costs.byAgent as Record<string, number>;
    expect(Object.keys(byAgent).length).toBeGreaterThan(0);

    // Should include agents that had token usage recorded
    const agentIds = Object.keys(byAgent);
    expect(agentIds.some((id) => id === 'seraphim-core' || id.includes('seraphim'))).toBe(true);
  });

  it('cost report has byPillar breakdown', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/costs', query: {} }));
    const body = res.body as { costs: any };
    const byPillar = body.costs.byPillar as Record<string, number>;
    expect(Object.keys(byPillar).length).toBeGreaterThan(0);
    // Should include 'system' pillar at minimum (from seraphim-core, mishmar, otzar usage)
    expect(byPillar).toHaveProperty('system');
    expect(byPillar['system']).toBeGreaterThan(0);
  });

  it('cost report has byModel breakdown with real model names', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/costs', query: {} }));
    const body = res.body as { costs: any };
    const byModel = body.costs.byModel as Record<string, number>;
    expect(Object.keys(byModel).length).toBeGreaterThan(0);

    // The model keys are in "provider/model" format
    const modelKeys = Object.keys(byModel);
    const hasAnthropicModel = modelKeys.some((k) => k.includes('claude'));
    const hasOpenAIModel = modelKeys.some((k) => k.includes('gpt'));
    expect(hasAnthropicModel || hasOpenAIModel).toBe(true);
  });

  it('cost report has a period with start and end dates', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/costs', query: {} }));
    const body = res.body as { costs: any };
    expect(body.costs).toHaveProperty('period');
    expect(body.costs.period).toHaveProperty('start');
    expect(body.costs.period).toHaveProperty('end');
  });
});
