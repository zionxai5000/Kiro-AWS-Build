/**
 * Unit tests for the Agent Runtime (DefaultAgentRuntime).
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.5, 5.1, 19.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultAgentRuntime, classifyError } from './runtime.js';
import type { AgentRuntimeDeps } from './runtime.js';
import type { AgentProgram } from '../types/agent.js';
import type { Task } from '../types/task.js';
import type { StateMachineEngine } from '../interfaces/state-machine-engine.js';
import type { AgentProgramRepository } from '../db/agent-program.repository.js';
import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { OtzarService } from '../interfaces/otzar-service.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';
import type { XOAuditService } from '../interfaces/xo-audit-service.js';
import type { EventBusService } from '../interfaces/event-bus-service.js';
import type { AgentMemoryContext } from '../types/memory.js';
import type { BudgetCheckResult, CacheResult } from '../types/otzar.js';
import type { TransitionResult } from '../types/state-machine.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let smInstanceCounter = 0;

function createProgram(overrides: Partial<AgentProgram> = {}): AgentProgram {
  return {
    id: 'prog-1',
    name: 'TestAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are a test agent.',
    tools: [],
    stateMachine: {
      id: 'sm-1',
      name: 'test-sm',
      version: '1.0.0',
      states: {},
      initialState: 'idle',
      terminalStates: ['done'],
      transitions: [],
      metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'test' },
    },
    completionContracts: [],
    authorityLevel: 'L4',
    allowedActions: ['read', 'write'],
    deniedActions: ['delete'],
    modelPreference: { preferred: 'claude-sonnet-4-20250514', fallback: 'gpt-4o', costCeiling: 1 },
    tokenBudget: { daily: 10000, monthly: 100000 },
    testSuite: { suiteId: 'ts-1', path: '/tests', requiredCoverage: 80 },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'king',
    changelog: [],
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'analysis',
    description: 'Analyze data',
    params: {},
    priority: 'medium',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function createMockDeps() {
  const stateMachineEngine = {
    register: vi.fn<AnyFn>().mockResolvedValue('sm-def-id'),
    createInstance: vi.fn<AnyFn>().mockImplementation(async () => {
      smInstanceCounter++;
      return {
        id: `sm-inst-${smInstanceCounter}`,
        definitionId: 'sm-def-id',
        entityId: 'entity-1',
        tenantId: 'system',
        currentState: 'initializing',
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
    transition: vi.fn<AnyFn>().mockResolvedValue({
      success: true,
      previousState: 'initializing',
      newState: 'ready',
      gateResults: [],
      auditId: 'audit-1',
    } satisfies TransitionResult),
    update: vi.fn<AnyFn>().mockResolvedValue(undefined),
    getState: vi.fn<AnyFn>().mockResolvedValue({
      id: 'sm-inst-1',
      definitionId: 'sm-def-id',
      entityId: 'entity-1',
      tenantId: 'system',
      currentState: 'ready',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    listInstances: vi.fn<AnyFn>().mockResolvedValue([]),
    getHistory: vi.fn<AnyFn>().mockResolvedValue([]),
  };

  const mishmarService = {
    authorize: vi.fn<AnyFn>().mockResolvedValue({
      authorized: true,
      reason: 'Allowed',
      auditId: 'audit-auth-1',
    }),
    checkAuthorityLevel: vi.fn<AnyFn>().mockResolvedValue('L4'),
    requestToken: vi.fn<AnyFn>().mockResolvedValue({
      tokenId: 'tok-1',
      agentId: 'a',
      action: 'a',
      issuedAt: new Date(),
      expiresAt: new Date(),
      issuedBy: 'system',
    }),
    validateToken: vi.fn<AnyFn>().mockResolvedValue(true),
    validateCompletion: vi.fn<AnyFn>().mockResolvedValue({
      valid: true,
      violations: [],
      contractId: 'c-1',
    }),
    validateSeparation: vi.fn<AnyFn>().mockResolvedValue({
      valid: true,
      violations: [],
    }),
  };

  const otzarService = {
    routeTask: vi.fn<AnyFn>().mockResolvedValue({
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-20250514',
      estimatedCost: 0.002,
      rationale: 'Best fit for analysis',
    }),
    checkBudget: vi.fn<AnyFn>().mockResolvedValue({
      allowed: true,
      remainingDaily: 9000,
      remainingMonthly: 99000,
    } satisfies BudgetCheckResult),
    recordUsage: vi.fn<AnyFn>().mockResolvedValue(undefined),
    getCostReport: vi.fn<AnyFn>().mockResolvedValue({
      totalCostUsd: 0,
      byAgent: {},
      byPillar: {},
      byModel: {},
      period: { start: new Date(), end: new Date() },
    }),
    getDailyOptimizationReport: vi.fn<AnyFn>().mockResolvedValue({
      date: new Date(),
      totalSpend: 0,
      wastePatterns: [],
      savingsOpportunities: [],
      estimatedSavings: 0,
    }),
    checkCache: vi.fn<AnyFn>().mockResolvedValue(null as CacheResult | null),
    storeCache: vi.fn<AnyFn>().mockResolvedValue(undefined),
  };

  const zikaronService = {
    storeEpisodic: vi.fn<AnyFn>().mockResolvedValue('mem-ep-1'),
    storeSemantic: vi.fn<AnyFn>().mockResolvedValue('mem-sem-1'),
    storeProcedural: vi.fn<AnyFn>().mockResolvedValue('mem-proc-1'),
    storeWorking: vi.fn<AnyFn>().mockResolvedValue('mem-work-1'),
    query: vi.fn<AnyFn>().mockResolvedValue([]),
    queryByAgent: vi.fn<AnyFn>().mockResolvedValue([]),
    loadAgentContext: vi.fn<AnyFn>().mockResolvedValue({
      agentId: 'test',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    } as AgentMemoryContext),
    flagConflict: vi.fn<AnyFn>().mockResolvedValue(undefined),
  };

  const xoAuditService = {
    recordAction: vi.fn<AnyFn>().mockResolvedValue('audit-action-1'),
    recordGovernanceDecision: vi.fn<AnyFn>().mockResolvedValue('audit-gov-1'),
    recordStateTransition: vi.fn<AnyFn>().mockResolvedValue('audit-trans-1'),
    query: vi.fn<AnyFn>().mockResolvedValue([]),
    verifyIntegrity: vi.fn<AnyFn>().mockResolvedValue({
      valid: true,
      recordId: 'r-1',
      chainLength: 1,
    }),
  };

  const eventBusService = {
    publish: vi.fn<AnyFn>().mockResolvedValue('event-1'),
    publishBatch: vi.fn<AnyFn>().mockResolvedValue(['event-1']),
    subscribe: vi.fn<AnyFn>().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn<AnyFn>().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn<AnyFn>().mockResolvedValue([]),
    retryDeadLetter: vi.fn<AnyFn>().mockResolvedValue(undefined),
  };

  const programRepo = {} as AgentProgramRepository;

  const deps: AgentRuntimeDeps = {
    programRepo,
    stateMachineEngine: stateMachineEngine as unknown as StateMachineEngine,
    mishmarService: mishmarService as unknown as MishmarService,
    otzarService: otzarService as unknown as OtzarService,
    zikaronService: zikaronService as unknown as ZikaronService,
    xoAuditService: xoAuditService as unknown as XOAuditService,
    eventBusService: eventBusService as unknown as EventBusService,
  };

  return {
    deps,
    stateMachineEngine,
    mishmarService,
    otzarService,
    zikaronService,
    xoAuditService,
    eventBusService,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultAgentRuntime', () => {
  let runtime: DefaultAgentRuntime;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    smInstanceCounter = 0;
    mocks = createMockDeps();
    runtime = new DefaultAgentRuntime(mocks.deps);
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
  });

  // -----------------------------------------------------------------------
  // deploy() — Agent deployment lifecycle (Requirements 1.1, 1.6)
  // -----------------------------------------------------------------------

  describe('deploy() — agent deployment lifecycle', () => {
    it('deploys an agent and returns an AgentInstance in ready state', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      expect(instance).toBeDefined();
      expect(instance.id).toBeTruthy();
      expect(instance.programId).toBe('prog-1');
      expect(instance.version).toBe('1.0.0');
      expect(instance.state).toBe('ready');
      expect(instance.pillar).toBe('eretz');
    });

    it('registers a lifecycle state machine definition', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      expect(mocks.stateMachineEngine.register).toHaveBeenCalledOnce();
      const smDef = mocks.stateMachineEngine.register.mock.calls[0][0];
      expect(smDef.name).toContain('Agent Lifecycle');
      expect(smDef.initialState).toBe('initializing');
      expect(smDef.terminalStates).toContain('terminated');
    });

    it('creates a state machine instance and transitions to ready', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      expect(mocks.stateMachineEngine.createInstance).toHaveBeenCalledOnce();
      expect(mocks.stateMachineEngine.transition).toHaveBeenCalledWith(
        expect.any(String),
        'initialized',
        expect.objectContaining({ triggeredBy: 'agent-runtime', tenantId: 'system' }),
      );
    });

    it('loads agent memory context from Zikaron on deploy', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      expect(mocks.zikaronService.loadAgentContext).toHaveBeenCalled();
    });

    it('stores initial working memory in Zikaron on deploy', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      expect(mocks.zikaronService.storeWorking).toHaveBeenCalled();
    });

    it('publishes a deployment event via EventBusService', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      expect(mocks.eventBusService.publish).toHaveBeenCalled();
      const event = mocks.eventBusService.publish.mock.calls[0][0];
      expect(event.type).toBe('agent.deployed');
      expect(event.detail.programId).toBe('prog-1');
    });

    it('logs deployment to XO Audit via recordAction', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalled();
      const entry = mocks.xoAuditService.recordAction.mock.calls[0][0];
      expect(entry.actionType).toBe('agent_deploy');
      expect(entry.outcome).toBe('success');
    });

    it('initializes resource usage to zero', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      expect(instance.resourceUsage).toEqual({
        cpuPercent: 0,
        memoryMb: 0,
        activeTaskCount: 0,
        tokenUsageToday: 0,
      });
    });

    it('throws when program is missing id', async () => {
      const program = createProgram({ id: '' });
      await expect(runtime.deploy(program)).rejects.toThrow('AgentProgram must have an id');
    });

    it('throws when program is missing name', async () => {
      const program = createProgram({ name: '' });
      await expect(runtime.deploy(program)).rejects.toThrow('AgentProgram must have a name');
    });

    it('throws when program is missing version', async () => {
      const program = createProgram({ version: '' });
      await expect(runtime.deploy(program)).rejects.toThrow('AgentProgram must have a version');
    });

    it('throws when program is missing pillar', async () => {
      const program = createProgram({ pillar: '' });
      await expect(runtime.deploy(program)).rejects.toThrow('AgentProgram must have a pillar');
    });

    it('throws when program is missing systemPrompt', async () => {
      const program = createProgram({ systemPrompt: '' });
      await expect(runtime.deploy(program)).rejects.toThrow('AgentProgram must have a systemPrompt');
    });
  });

  // -----------------------------------------------------------------------
  // execute() — Full execution flow (Requirements 1.3, 1.4, 3.5, 5.1)
  // -----------------------------------------------------------------------

  describe('execute() — full execution flow with services', () => {
    it('executes a task successfully with all service interactions', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.tokenUsage).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('checks Mishmar authorization with full AuthorizationRequest', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask({ type: 'write' });

      await runtime.execute(instance.id, task);

      expect(mocks.mishmarService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: instance.id,
          action: 'write',
          target: task.id,
          authorityLevel: 'L4',
          context: expect.objectContaining({ taskId: task.id, taskType: 'write' }),
        }),
      );
    });

    it('blocks execution when Mishmar denies permission', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask({ type: 'delete' });

      mocks.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Action not allowed for this agent',
        auditId: 'audit-deny-1',
      });

      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('logs blocked action to XO Audit when Mishmar denies', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Unauthorized',
        auditId: 'audit-deny-1',
      });

      mocks.xoAuditService.recordAction.mockClear();
      await runtime.execute(instance.id, task);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalled();
      const entry = mocks.xoAuditService.recordAction.mock.calls[0][0];
      expect(entry.outcome).toBe('blocked');
    });

    it('checks Otzar budget before executing', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      await runtime.execute(instance.id, task);

      expect(mocks.otzarService.checkBudget).toHaveBeenCalledWith(instance.id, expect.any(Number));
    });

    it('blocks execution when Otzar budget is exceeded', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: 'Daily limit reached',
      });

      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Budget exceeded');
    });

    it('routes task to LLM model via Otzar', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask({ type: 'code_generation' });

      await runtime.execute(instance.id, task);

      expect(mocks.otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'code_writing',
          agentId: instance.id,
          pillar: 'eretz',
        }),
      );
    });

    it('checks Otzar cache before execution', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      await runtime.execute(instance.id, task);

      expect(mocks.otzarService.checkCache).toHaveBeenCalledWith(task.type, task.params);
    });

    it('uses cached result when cache hit', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.otzarService.checkCache.mockResolvedValueOnce({
        hit: true,
        data: { cached: true },
        cachedAt: new Date(),
        ttlRemaining: 3600,
      });

      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ cached: true });
      expect(result.tokenUsage.inputTokens).toBe(0);
      // recordUsage should NOT be called for cache hits
      expect(mocks.otzarService.recordUsage).not.toHaveBeenCalled();
    });

    it('records usage via Otzar after execution', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      await runtime.execute(instance.id, task);

      expect(mocks.otzarService.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: instance.id,
          pillar: 'eretz',
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        }),
      );
    });

    it('stores cache result via Otzar after execution', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      await runtime.execute(instance.id, task);

      expect(mocks.otzarService.storeCache).toHaveBeenCalledWith(
        task.type,
        task.params,
        expect.any(Object),
      );
    });

    it('stores episodic memory in Zikaron after task completion', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.zikaronService.storeEpisodic.mockClear();
      await runtime.execute(instance.id, task);

      expect(mocks.zikaronService.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: 'episodic',
          eventType: 'task_completion',
          outcome: 'success',
        }),
      );
    });

    it('persists working memory in Zikaron after task completion', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.zikaronService.storeWorking.mockClear();
      await runtime.execute(instance.id, task);

      expect(mocks.zikaronService.storeWorking).toHaveBeenCalledWith(
        instance.id,
        expect.objectContaining({ layer: 'working' }),
      );
    });

    it('publishes completion event via EventBusService', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.eventBusService.publish.mockClear();
      await runtime.execute(instance.id, task);

      const completionCalls = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.task.completed',
      );
      expect(completionCalls.length).toBe(1);
    });

    it('logs success to XO Audit via recordAction', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.xoAuditService.recordAction.mockClear();
      await runtime.execute(instance.id, task);

      const successCalls = mocks.xoAuditService.recordAction.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).outcome === 'success',
      );
      expect(successCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('transitions agent to executing then back to ready', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.stateMachineEngine.transition.mockClear();
      await runtime.execute(instance.id, task);

      expect(mocks.stateMachineEngine.transition).toHaveBeenCalledTimes(2);
      expect(mocks.stateMachineEngine.transition.mock.calls[0][1]).toBe('task_assigned');
      expect(mocks.stateMachineEngine.transition.mock.calls[1][1]).toBe('task_completed');
    });

    it('updates token usage after successful execution', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      await runtime.execute(instance.id, task);

      const agents = await runtime.listAgents();
      const agent = agents.find((a) => a.id === instance.id);
      expect(agent!.resourceUsage.tokenUsageToday).toBeGreaterThan(0);
    });

    it('throws when agent is not found', async () => {
      const task = createTask();
      await expect(runtime.execute('nonexistent', task)).rejects.toThrow(
        "Agent 'nonexistent' not found in registry",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error handling tiers (Requirements 1.3)
  // -----------------------------------------------------------------------

  describe('execute() — error handling tiers', () => {
    it('transitions to degraded on systemic error', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(false);
      const state = await runtime.getState(instance.id);
      expect(state).toBe('degraded');
    });

    it('logs systemic error to XO Audit with tier info', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      mocks.xoAuditService.recordAction.mockClear();
      await runtime.execute(instance.id, task);

      const failureCalls = mocks.xoAuditService.recordAction.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).outcome === 'failure',
      );
      expect(failureCalls.length).toBeGreaterThanOrEqual(1);
      expect((failureCalls[0][0] as Record<string, Record<string, unknown>>).details.tier).toBe('systemic');
    });

    it('stores failure in episodic memory on systemic error', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      mocks.zikaronService.storeEpisodic.mockClear();
      await runtime.execute(instance.id, task);

      expect(mocks.zikaronService.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'failure',
          eventType: 'task_failure',
        }),
      );
    });

    it('stays ready on operational error (log and continue)', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      // Operational error: a validation failure (not matching transient or systemic patterns)
      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('validation failed: invalid input format');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(false);
      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });

    it('logs operational error with tier info', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('validation failed: bad input');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      mocks.xoAuditService.recordAction.mockClear();
      await runtime.execute(instance.id, task);

      const failureCalls = mocks.xoAuditService.recordAction.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).outcome === 'failure',
      );
      expect(failureCalls.length).toBeGreaterThanOrEqual(1);
      expect((failureCalls[0][0] as Record<string, Record<string, unknown>>).details.tier).toBe('operational');
    });

    it('increments error count on unrecoverable error', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      await runtime.execute(instance.id, task);

      const health = await runtime.getHealth(instance.id);
      expect(health.errorCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // classifyError — Error classification
  // -----------------------------------------------------------------------

  describe('classifyError()', () => {
    it('classifies timeout errors as transient', () => {
      expect(classifyError(new Error('ETIMEDOUT'))).toBe('transient');
      expect(classifyError(new Error('request timeout'))).toBe('transient');
    });

    it('classifies rate limit errors as transient', () => {
      expect(classifyError(new Error('rate limit exceeded'))).toBe('transient');
      expect(classifyError(new Error('429 Too Many Requests'))).toBe('transient');
    });

    it('classifies service unavailable as systemic', () => {
      expect(classifyError(new Error('service unavailable'))).toBe('systemic');
    });

    it('classifies circuit open as systemic', () => {
      expect(classifyError(new Error('circuit open'))).toBe('systemic');
    });

    it('classifies unknown errors as operational', () => {
      expect(classifyError(new Error('validation failed'))).toBe('operational');
      expect(classifyError(new Error('invalid input'))).toBe('operational');
    });
  });

  // -----------------------------------------------------------------------
  // upgrade() — Rolling upgrade with state preservation (Requirement 1.5)
  // -----------------------------------------------------------------------

  describe('upgrade() — agent upgrade with state preservation', () => {
    it('deploys a new version and terminates the old one', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const newProgram = createProgram({ id: 'prog-2', name: 'TestAgent', version: '2.0.0' });
      await runtime.upgrade(instance.id, newProgram);

      const oldState = await runtime.getState(instance.id);
      expect(oldState).toBe('terminated');

      const agents = await runtime.listAgents({ state: 'ready' });
      expect(agents.length).toBe(1);
      expect(agents[0].version).toBe('2.0.0');
    });

    it('preserves resource metrics from old agent to new agent', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.execute(instance.id, createTask());

      const oldAgents = await runtime.listAgents();
      const oldAgent = oldAgents.find((a) => a.id === instance.id)!;
      const oldTokenUsage = oldAgent.resourceUsage.tokenUsageToday;

      const newProgram = createProgram({ id: 'prog-2', name: 'TestAgent', version: '2.0.0' });
      await runtime.upgrade(instance.id, newProgram);

      const readyAgents = await runtime.listAgents({ state: 'ready' });
      expect(readyAgents.length).toBe(1);
      expect(readyAgents[0].resourceUsage.tokenUsageToday).toBe(oldTokenUsage);
    });

    it('migrates Zikaron memory references during upgrade', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // The upgrade flow calls deploy() internally which calls loadAgentContext once,
      // then the migration code calls loadAgentContext again for the old agent.
      // Set up mock to return working memory on the second call (migration).
      mocks.zikaronService.loadAgentContext
        .mockResolvedValueOnce({
          agentId: 'new-agent',
          workingMemory: null,
          recentEpisodic: [],
          proceduralPatterns: [],
        })
        .mockResolvedValueOnce({
          agentId: instance.id,
          workingMemory: {
            id: 'wm-1',
            tenantId: 'system',
            layer: 'working' as const,
            content: 'test context',
            embedding: [],
            sourceAgentId: instance.id,
            tags: [],
            createdAt: new Date(),
            agentId: instance.id,
            sessionId: 'sess-1',
            taskContext: { foo: 'bar' },
            conversationHistory: [],
            activeGoals: [],
          },
          recentEpisodic: [],
          proceduralPatterns: [],
        });

      mocks.zikaronService.storeWorking.mockClear();

      const newProgram = createProgram({ id: 'prog-2', name: 'TestAgent', version: '2.0.0' });
      await runtime.upgrade(instance.id, newProgram);

      // storeWorking should be called for the new agent with migrated context
      const migrationCalls = mocks.zikaronService.storeWorking.mock.calls.filter(
        (call: unknown[]) => {
          const ctx = call[1] as Record<string, Record<string, unknown>>;
          return ctx.taskContext?.migratedFrom === instance.id;
        },
      );
      expect(migrationCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('publishes an upgrade event', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      mocks.eventBusService.publish.mockClear();

      const newProgram = createProgram({ id: 'prog-2', name: 'TestAgent', version: '2.0.0' });
      await runtime.upgrade(instance.id, newProgram);

      const upgradeCalls = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.upgraded',
      );
      expect(upgradeCalls.length).toBe(1);
      const upgradeEvent = upgradeCalls[0][0] as Record<string, Record<string, unknown>>;
      expect(upgradeEvent.detail.oldVersion).toBe('1.0.0');
      expect(upgradeEvent.detail.newVersion).toBe('2.0.0');
    });
  });

  // -----------------------------------------------------------------------
  // terminate() — Agent termination (Requirement 1.3)
  // -----------------------------------------------------------------------

  describe('terminate() — agent termination', () => {
    it('transitions agent to terminated state', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.terminate(instance.id, 'Manual shutdown');

      const state = await runtime.getState(instance.id);
      expect(state).toBe('terminated');
    });

    it('clears working memory from Zikaron on termination', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      mocks.zikaronService.storeWorking.mockClear();
      await runtime.terminate(instance.id, 'Shutdown');

      expect(mocks.zikaronService.storeWorking).toHaveBeenCalledWith(
        instance.id,
        expect.objectContaining({
          tags: ['terminated'],
          taskContext: expect.objectContaining({ terminated: true }),
        }),
      );
    });

    it('logs termination to XO Audit via recordAction', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      mocks.xoAuditService.recordAction.mockClear();
      await runtime.terminate(instance.id, 'Cleanup');

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalled();
      const entry = mocks.xoAuditService.recordAction.mock.calls[0][0];
      expect(entry.actionType).toBe('agent_terminate');
      expect(entry.outcome).toBe('success');
    });

    it('publishes a termination event', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      mocks.eventBusService.publish.mockClear();
      await runtime.terminate(instance.id, 'Shutdown');

      const terminateCalls = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.terminated',
      );
      expect(terminateCalls.length).toBe(1);
      const event = terminateCalls[0][0] as Record<string, Record<string, unknown>>;
      expect(event.detail.reason).toBe('Shutdown');
    });

    it('throws when terminating a nonexistent agent', async () => {
      await expect(runtime.terminate('nonexistent', 'reason')).rejects.toThrow(
        "Agent 'nonexistent' not found in registry",
      );
    });
  });

  // -----------------------------------------------------------------------
  // listAgents() — Registry queries (Requirement 1.6)
  // -----------------------------------------------------------------------

  describe('listAgents() — agent registry filtering', () => {
    it('returns all agents when no filter is provided', async () => {
      await runtime.deploy(createProgram({ id: 'p1', name: 'A1', pillar: 'eretz' }));
      await runtime.deploy(createProgram({ id: 'p2', name: 'A2', pillar: 'otzar' }));

      const agents = await runtime.listAgents();
      expect(agents).toHaveLength(2);
    });

    it('filters agents by pillar', async () => {
      await runtime.deploy(createProgram({ id: 'p1', name: 'A1', pillar: 'eretz' }));
      await runtime.deploy(createProgram({ id: 'p2', name: 'A2', pillar: 'otzar' }));

      const agents = await runtime.listAgents({ pillar: 'eretz' });
      expect(agents).toHaveLength(1);
      expect(agents[0].pillar).toBe('eretz');
    });

    it('filters agents by state', async () => {
      const instance = await runtime.deploy(createProgram({ id: 'p1', name: 'A1' }));
      await runtime.deploy(createProgram({ id: 'p2', name: 'A2' }));

      await runtime.terminate(instance.id, 'test');

      const readyAgents = await runtime.listAgents({ state: 'ready' });
      expect(readyAgents).toHaveLength(1);

      const terminatedAgents = await runtime.listAgents({ state: 'terminated' });
      expect(terminatedAgents).toHaveLength(1);
    });

    it('filters agents by programId', async () => {
      await runtime.deploy(createProgram({ id: 'p1', name: 'A1' }));
      await runtime.deploy(createProgram({ id: 'p2', name: 'A2' }));

      const agents = await runtime.listAgents({ programId: 'p1' });
      expect(agents).toHaveLength(1);
      expect(agents[0].programId).toBe('p1');
    });

    it('returns empty array when no agents match filter', async () => {
      await runtime.deploy(createProgram({ id: 'p1', name: 'A1', pillar: 'eretz' }));

      const agents = await runtime.listAgents({ pillar: 'nonexistent' });
      expect(agents).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getHealth() — Agent health status (Requirement 1.6)
  // -----------------------------------------------------------------------

  describe('getHealth() — agent health reporting', () => {
    it('reports healthy for a freshly deployed agent', async () => {
      const instance = await runtime.deploy(createProgram());

      const health = await runtime.getHealth(instance.id);

      expect(health.healthy).toBe(true);
      expect(health.status).toBe('ready');
      expect(health.errorCount).toBe(0);
    });

    it('reports unhealthy for a terminated agent', async () => {
      const instance = await runtime.deploy(createProgram());
      await runtime.terminate(instance.id, 'test');

      const health = await runtime.getHealth(instance.id);

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('disconnected');
      expect(health.message).toContain('terminated');
    });

    it('reports unhealthy for a degraded agent', async () => {
      const instance = await runtime.deploy(createProgram());

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      await runtime.execute(instance.id, createTask());

      const health = await runtime.getHealth(instance.id);

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('error');
      expect(health.message).toContain('degraded');
    });

    it('throws when checking health of nonexistent agent', async () => {
      await expect(runtime.getHealth('nonexistent')).rejects.toThrow(
        "Agent 'nonexistent' not found in registry",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Heartbeat mechanism (Requirement 1.6)
  // -----------------------------------------------------------------------

  describe('heartbeat — detection and stale agent handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('recordHeartbeat updates the agent lastHeartbeat timestamp', async () => {
      const instance = await runtime.deploy(createProgram());

      const agentsBefore = await runtime.listAgents();
      const heartbeatBefore = agentsBefore[0].lastHeartbeat;

      vi.advanceTimersByTime(5000);
      runtime.recordHeartbeat(instance.id);

      const agentsAfter = await runtime.listAgents();
      const heartbeatAfter = agentsAfter[0].lastHeartbeat;

      expect(heartbeatAfter.getTime()).toBeGreaterThan(heartbeatBefore.getTime());
    });

    it('recordHeartbeat is a no-op for nonexistent agent', () => {
      expect(() => runtime.recordHeartbeat('nonexistent')).not.toThrow();
    });

    it('stale agents are transitioned to degraded by heartbeat checker', async () => {
      const instance = await runtime.deploy(createProgram());

      runtime.startHeartbeatChecker();

      await vi.advanceTimersByTimeAsync(120_000);

      const state = await runtime.getState(instance.id);
      expect(state).toBe('degraded');
    });

    it('agents with recent heartbeats are not marked stale', async () => {
      const instance = await runtime.deploy(createProgram());

      runtime.startHeartbeatChecker();

      await vi.advanceTimersByTimeAsync(25_000);
      runtime.recordHeartbeat(instance.id);

      await vi.advanceTimersByTimeAsync(25_000);
      runtime.recordHeartbeat(instance.id);

      await vi.advanceTimersByTimeAsync(5_000);

      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });

    it('stopHeartbeatChecker stops the periodic check', async () => {
      const instance = await runtime.deploy(createProgram());

      runtime.startHeartbeatChecker();
      runtime.stopHeartbeatChecker();

      await vi.advanceTimersByTimeAsync(100_000);

      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });

    it('stale agent heartbeat check publishes an event', async () => {
      const instance = await runtime.deploy(createProgram());

      mocks.eventBusService.publish.mockClear();

      runtime.startHeartbeatChecker();

      await vi.advanceTimersByTimeAsync(120_000);

      const staleCalls = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.heartbeat.stale',
      );
      expect(staleCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('already terminated agents are skipped by heartbeat checker', async () => {
      const instance = await runtime.deploy(createProgram());
      await runtime.terminate(instance.id, 'test');

      mocks.stateMachineEngine.transition.mockClear();

      runtime.startHeartbeatChecker();

      await vi.advanceTimersByTimeAsync(91_000);

      const unrecoverableCalls = mocks.stateMachineEngine.transition.mock.calls.filter(
        (call: unknown[]) => call[1] === 'unrecoverable_error',
      );
      expect(unrecoverableCalls).toHaveLength(0);
    });

    it('already degraded agents are skipped by heartbeat checker', async () => {
      const instance = await runtime.deploy(createProgram());

      mocks.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });
      await runtime.execute(instance.id, createTask());

      mocks.stateMachineEngine.transition.mockResolvedValue({
        success: true, previousState: 'degraded', newState: 'degraded', gateResults: [], auditId: 'a-1',
      });
      mocks.stateMachineEngine.transition.mockClear();

      runtime.startHeartbeatChecker();

      await vi.advanceTimersByTimeAsync(91_000);

      const unrecoverableCalls = mocks.stateMachineEngine.transition.mock.calls.filter(
        (call: unknown[]) => call[1] === 'unrecoverable_error',
      );
      expect(unrecoverableCalls).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getState() — State query (Requirement 1.6)
  // -----------------------------------------------------------------------

  describe('getState() — agent state query', () => {
    it('returns ready for a freshly deployed agent', async () => {
      const instance = await runtime.deploy(createProgram());
      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });

    it('returns terminated after termination', async () => {
      const instance = await runtime.deploy(createProgram());
      await runtime.terminate(instance.id, 'test');
      const state = await runtime.getState(instance.id);
      expect(state).toBe('terminated');
    });

    it('throws for nonexistent agent', async () => {
      await expect(runtime.getState('nonexistent')).rejects.toThrow(
        "Agent 'nonexistent' not found in registry",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle: deploy -> execute -> terminate
  // -----------------------------------------------------------------------

  describe('full lifecycle — deploy -> execute -> terminate', () => {
    it('completes the full agent lifecycle', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      expect(instance.state).toBe('ready');

      const result = await runtime.execute(instance.id, createTask());
      expect(result.success).toBe(true);

      const stateAfterExec = await runtime.getState(instance.id);
      expect(stateAfterExec).toBe('ready');

      await runtime.terminate(instance.id, 'Done');
      const finalState = await runtime.getState(instance.id);
      expect(finalState).toBe('terminated');
    });
  });
});
