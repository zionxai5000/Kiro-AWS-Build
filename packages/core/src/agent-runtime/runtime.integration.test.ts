/**
 * Integration tests for Agent Runtime with system services.
 *
 * These tests verify the full interaction flow between the Agent Runtime
 * and its dependent services (Mishmar, Otzar, Zikaron, XO Audit, Event Bus).
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 3.5, 5.1, 19.2
 *
 * - 1.1: Deploy agents with state machine, permissions, and memory context
 * - 1.3: Transition to degraded state on unrecoverable error, log to audit
 * - 1.4: Enforce agent operates only within permissions defined in its AgentProgram
 * - 3.5: Mishmar authorization checks before controlled actions
 * - 5.1: Otzar model routing and budget enforcement
 * - 19.2: Integration tests for service interactions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultAgentRuntime } from './runtime.js';
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
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

let smInstanceCounter = 0;

function createProgram(overrides: Partial<AgentProgram> = {}): AgentProgram {
  return {
    id: 'prog-int-1',
    name: 'IntegrationTestAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are an integration test agent.',
    tools: [],
    stateMachine: {
      id: 'sm-int-1',
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
    allowedActions: ['read', 'write', 'analysis'],
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
    id: 'task-int-1',
    type: 'analysis',
    description: 'Analyze integration data',
    params: { input: 'test-data' },
    priority: 'medium',
    ...overrides,
  };
}

function createMockServices() {
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
      reason: 'Allowed by authority level L4',
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
      estimatedCost: 0.003,
      rationale: 'Best fit for analysis task',
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
// Integration Tests
// ---------------------------------------------------------------------------

describe('Agent Runtime — Integration Tests', () => {
  let runtime: DefaultAgentRuntime;
  let services: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    smInstanceCounter = 0;
    services = createMockServices();
    runtime = new DefaultAgentRuntime(services.deps);
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
  });

  // -------------------------------------------------------------------------
  // Full agent execution flow: deploy → authorize → budget check → execute → audit
  // Validates: Requirements 1.1, 1.4, 3.5, 5.1, 19.2
  // -------------------------------------------------------------------------

  describe('full execution flow: deploy → authorize → budget → execute → audit', () => {
    it('completes the entire flow with all services called in correct order', async () => {
      const callOrder: string[] = [];

      // Track call order across services
      services.mishmarService.authorize.mockImplementation(async () => {
        callOrder.push('mishmar.authorize');
        return { authorized: true, reason: 'Allowed', auditId: 'auth-1' };
      });
      services.otzarService.checkBudget.mockImplementation(async () => {
        callOrder.push('otzar.checkBudget');
        return { allowed: true, remainingDaily: 9000, remainingMonthly: 99000 };
      });
      services.otzarService.routeTask.mockImplementation(async () => {
        callOrder.push('otzar.routeTask');
        return { provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514', estimatedCost: 0.003, rationale: 'Best fit' };
      });
      services.otzarService.checkCache.mockImplementation(async () => {
        callOrder.push('otzar.checkCache');
        return null;
      });
      services.otzarService.recordUsage.mockImplementation(async () => {
        callOrder.push('otzar.recordUsage');
      });
      services.otzarService.storeCache.mockImplementation(async () => {
        callOrder.push('otzar.storeCache');
      });
      services.zikaronService.storeEpisodic.mockImplementation(async () => {
        callOrder.push('zikaron.storeEpisodic');
        return 'mem-ep-1';
      });
      services.zikaronService.storeWorking.mockImplementation(async () => {
        callOrder.push('zikaron.storeWorking');
        return 'mem-work-1';
      });
      services.eventBusService.publish.mockImplementation(async () => {
        callOrder.push('eventBus.publish');
        return 'event-1';
      });
      services.xoAuditService.recordAction.mockImplementation(async () => {
        callOrder.push('xoAudit.recordAction');
        return 'audit-1';
      });

      // Deploy
      const program = createProgram();
      const instance = await runtime.deploy(program);
      expect(instance.state).toBe('ready');

      // Clear call order after deploy to focus on execute flow
      callOrder.length = 0;

      // Execute
      const task = createTask();
      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-int-1');
      expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify service call order: authorize → budget → route → cache check → (execute) → record usage → store cache → memory → event → audit
      expect(callOrder.indexOf('mishmar.authorize')).toBeLessThan(callOrder.indexOf('otzar.checkBudget'));
      expect(callOrder.indexOf('otzar.checkBudget')).toBeLessThan(callOrder.indexOf('otzar.routeTask'));
      expect(callOrder.indexOf('otzar.routeTask')).toBeLessThan(callOrder.indexOf('otzar.recordUsage'));
      expect(callOrder.indexOf('otzar.recordUsage')).toBeLessThan(callOrder.indexOf('xoAudit.recordAction'));
    });

    it('deploy loads memory context and publishes lifecycle events', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Zikaron: loadAgentContext called during deploy
      expect(services.zikaronService.loadAgentContext).toHaveBeenCalledWith(instance.id);

      // Zikaron: storeWorking called to persist initial working memory
      expect(services.zikaronService.storeWorking).toHaveBeenCalledWith(
        instance.id,
        expect.objectContaining({
          layer: 'working',
          tags: expect.arrayContaining(['working', 'persistence', 'session_continuity']),
        }),
      );

      // EventBus: deployment event published
      const deployEvents = services.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.deployed',
      );
      expect(deployEvents).toHaveLength(1);
      expect((deployEvents[0][0] as Record<string, Record<string, unknown>>).detail.agentId).toBe(instance.id);

      // XO Audit: deployment logged
      const auditCalls = services.xoAuditService.recordAction.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).actionType === 'agent_deploy',
      );
      expect(auditCalls).toHaveLength(1);
      expect((auditCalls[0][0] as Record<string, unknown>).outcome).toBe('success');
    });

    it('execute stores episodic memory and working memory on success', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.zikaronService.storeEpisodic.mockClear();
      services.zikaronService.storeWorking.mockClear();

      const task = createTask({ id: 'task-mem-1', type: 'analysis', description: 'Memory test' });
      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(true);

      // Episodic memory stored with task completion details
      expect(services.zikaronService.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: 'episodic',
          eventType: 'task_completion',
          outcome: 'success',
          sourceAgentId: instance.id,
        }),
      );

      // Working memory updated with last task context
      expect(services.zikaronService.storeWorking).toHaveBeenCalledWith(
        instance.id,
        expect.objectContaining({
          layer: 'working',
          taskContext: expect.objectContaining({
            currentContext: expect.objectContaining({
              lastTaskId: 'task-mem-1',
              lastTaskType: 'analysis',
            }),
          }),
        }),
      );
    });

    it('execute publishes completion event and logs to audit on success', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.eventBusService.publish.mockClear();
      services.xoAuditService.recordAction.mockClear();

      const task = createTask();
      await runtime.execute(instance.id, task);

      // Completion event published
      const completionEvents = services.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.task.completed',
      );
      expect(completionEvents).toHaveLength(1);
      const eventDetail = (completionEvents[0][0] as Record<string, Record<string, unknown>>).detail;
      expect(eventDetail.agentId).toBe(instance.id);
      expect(eventDetail.taskId).toBe('task-int-1');
      expect(eventDetail.success).toBe(true);

      // Audit record logged with success
      const successAudits = services.xoAuditService.recordAction.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).outcome === 'success',
      );
      expect(successAudits).toHaveLength(1);
      const auditEntry = successAudits[0][0] as Record<string, unknown>;
      expect(auditEntry.actionType).toBe('task_execute');
      expect(auditEntry.actingAgentId).toBe(instance.id);
    });

    it('records token usage via Otzar after successful execution', async () => {
      const program = createProgram({ pillar: 'zionx' });
      const instance = await runtime.deploy(program);

      services.otzarService.recordUsage.mockClear();

      const task = createTask();
      await runtime.execute(instance.id, task);

      expect(services.otzarService.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: instance.id,
          pillar: 'zionx',
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
          costUsd: expect.any(Number),
        }),
      );
    });

    it('full lifecycle: deploy → execute multiple tasks → terminate', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      expect(instance.state).toBe('ready');

      // Execute first task
      const result1 = await runtime.execute(instance.id, createTask({ id: 'task-1', type: 'analysis' }));
      expect(result1.success).toBe(true);

      // Execute second task
      const result2 = await runtime.execute(instance.id, createTask({ id: 'task-2', type: 'code_generation' }));
      expect(result2.success).toBe(true);

      // Agent should still be ready
      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');

      // Token usage should accumulate
      const agents = await runtime.listAgents();
      const agent = agents.find((a) => a.id === instance.id);
      expect(agent!.resourceUsage.tokenUsageToday).toBeGreaterThan(0);

      // Terminate
      await runtime.terminate(instance.id, 'Integration test complete');
      const finalState = await runtime.getState(instance.id);
      expect(finalState).toBe('terminated');

      // Termination event published
      const terminateEvents = services.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.terminated',
      );
      expect(terminateEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Mishmar blocks unauthorized actions
  // Validates: Requirements 1.4, 3.5, 19.2
  // -------------------------------------------------------------------------

  describe('Mishmar blocks unauthorized actions', () => {
    it('returns failure with permission denied when Mishmar denies authorization', async () => {
      const program = createProgram({ authorityLevel: 'L4' });
      const instance = await runtime.deploy(program);

      services.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Action exceeds L4 authority bounds',
        auditId: 'audit-deny-1',
      });

      const task = createTask({ type: 'admin_override' });
      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.error).toContain('Action exceeds L4 authority bounds');
    });

    it('does not call Otzar or execute task when Mishmar denies', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Unauthorized action',
        auditId: 'audit-deny-2',
      });

      services.otzarService.checkBudget.mockClear();
      services.otzarService.routeTask.mockClear();
      services.otzarService.recordUsage.mockClear();
      services.zikaronService.storeEpisodic.mockClear();

      await runtime.execute(instance.id, createTask());

      // Otzar should NOT be called when authorization fails
      expect(services.otzarService.checkBudget).not.toHaveBeenCalled();
      expect(services.otzarService.routeTask).not.toHaveBeenCalled();
      expect(services.otzarService.recordUsage).not.toHaveBeenCalled();

      // No episodic memory stored for blocked tasks
      expect(services.zikaronService.storeEpisodic).not.toHaveBeenCalled();
    });

    it('logs blocked action to XO Audit with correct details', async () => {
      const program = createProgram({ name: 'RestrictedAgent' });
      const instance = await runtime.deploy(program);

      services.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Insufficient authority level',
        auditId: 'audit-deny-3',
      });

      services.xoAuditService.recordAction.mockClear();

      const task = createTask({ id: 'blocked-task-1', type: 'delete' });
      await runtime.execute(instance.id, task);

      // Audit should record the blocked action
      expect(services.xoAuditService.recordAction).toHaveBeenCalled();
      const auditEntry = services.xoAuditService.recordAction.mock.calls[0][0] as Record<string, unknown>;
      expect(auditEntry.outcome).toBe('blocked');
      expect(auditEntry.actingAgentId).toBe(instance.id);
      expect(auditEntry.actionType).toBe('task_execute');
      expect(auditEntry.target).toBe('blocked-task-1');
      expect((auditEntry.details as Record<string, unknown>).reason).toContain('Insufficient authority level');
    });

    it('returns zero token usage when Mishmar blocks the action', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Blocked',
        auditId: 'audit-deny-4',
      });

      const result = await runtime.execute(instance.id, createTask());

      expect(result.tokenUsage.inputTokens).toBe(0);
      expect(result.tokenUsage.outputTokens).toBe(0);
      expect(result.tokenUsage.costUsd).toBe(0);
    });

    it('agent remains in ready state after Mishmar blocks an action', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.mishmarService.authorize.mockResolvedValueOnce({
        authorized: false,
        reason: 'Blocked',
        auditId: 'audit-deny-5',
      });

      await runtime.execute(instance.id, createTask());

      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });

    it('passes correct authorization request to Mishmar with agent context', async () => {
      const program = createProgram({
        authorityLevel: 'L3',
        pillar: 'zion-alpha',
      });
      const instance = await runtime.deploy(program);

      services.mishmarService.authorize.mockClear();

      const task = createTask({ id: 'trade-1', type: 'place_trade', description: 'Place a trade on Kalshi' });
      await runtime.execute(instance.id, task);

      expect(services.mishmarService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: instance.id,
          action: 'place_trade',
          target: 'trade-1',
          authorityLevel: 'L3',
          context: expect.objectContaining({
            taskId: 'trade-1',
            taskType: 'place_trade',
            description: 'Place a trade on Kalshi',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Otzar blocks over-budget requests
  // Validates: Requirements 5.1, 19.2
  // -------------------------------------------------------------------------

  describe('Otzar blocks over-budget requests', () => {
    it('returns failure with budget exceeded when Otzar denies budget', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 50000,
        reason: 'Daily token limit reached',
      } satisfies BudgetCheckResult);

      const task = createTask();
      const result = await runtime.execute(instance.id, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Budget exceeded');
      expect(result.error).toContain('Daily token limit reached');
    });

    it('does not route task or execute when budget is exceeded', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: 'Monthly limit reached',
      } satisfies BudgetCheckResult);

      services.otzarService.routeTask.mockClear();
      services.otzarService.recordUsage.mockClear();
      services.zikaronService.storeEpisodic.mockClear();

      await runtime.execute(instance.id, createTask());

      // No model routing or execution when budget is exceeded
      expect(services.otzarService.routeTask).not.toHaveBeenCalled();
      expect(services.otzarService.recordUsage).not.toHaveBeenCalled();
      expect(services.zikaronService.storeEpisodic).not.toHaveBeenCalled();
    });

    it('logs budget-blocked action to XO Audit', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: 'Budget exhausted',
      } satisfies BudgetCheckResult);

      services.xoAuditService.recordAction.mockClear();

      const task = createTask({ id: 'budget-task-1' });
      await runtime.execute(instance.id, task);

      expect(services.xoAuditService.recordAction).toHaveBeenCalled();
      const auditEntry = services.xoAuditService.recordAction.mock.calls[0][0] as Record<string, unknown>;
      expect(auditEntry.outcome).toBe('blocked');
      expect(auditEntry.target).toBe('budget-task-1');
      expect((auditEntry.details as Record<string, unknown>).reason).toContain('Budget exhausted');
    });

    it('returns zero token usage when budget is exceeded', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
      } satisfies BudgetCheckResult);

      const result = await runtime.execute(instance.id, createTask());

      expect(result.tokenUsage.inputTokens).toBe(0);
      expect(result.tokenUsage.outputTokens).toBe(0);
      expect(result.tokenUsage.costUsd).toBe(0);
    });

    it('Mishmar authorization passes but Otzar budget blocks — correct sequence', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Mishmar allows
      services.mishmarService.authorize.mockResolvedValueOnce({
        authorized: true,
        reason: 'Allowed',
        auditId: 'auth-ok',
      });

      // Otzar blocks
      services.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: 'Over budget',
      } satisfies BudgetCheckResult);

      const result = await runtime.execute(instance.id, createTask());

      // Mishmar was called (authorization passed)
      expect(services.mishmarService.authorize).toHaveBeenCalled();
      // But execution was blocked by budget
      expect(result.success).toBe(false);
      expect(result.error).toContain('Budget exceeded');
    });

    it('agent remains in ready state after budget block', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.otzarService.checkBudget.mockResolvedValueOnce({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
      } satisfies BudgetCheckResult);

      await runtime.execute(instance.id, createTask());

      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });
  });

  // -------------------------------------------------------------------------
  // Agent transitions to degraded state on unrecoverable error
  // Validates: Requirements 1.3, 19.2
  // -------------------------------------------------------------------------

  describe('agent transitions to degraded state on unrecoverable error', () => {
    it('transitions to degraded on systemic error during execution', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Simulate a systemic error during task execution (after task_assigned transition)
      services.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable — all retries exhausted');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      const result = await runtime.execute(instance.id, createTask());

      expect(result.success).toBe(false);
      expect(result.error).toContain('service unavailable');

      const state = await runtime.getState(instance.id);
      expect(state).toBe('degraded');
    });

    it('logs systemic error to XO Audit with failure outcome and tier info', async () => {
      const program = createProgram({ name: 'FailingAgent' });
      const instance = await runtime.deploy(program);

      services.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      services.xoAuditService.recordAction.mockClear();

      await runtime.execute(instance.id, createTask({ id: 'failing-task' }));

      const failureAudits = services.xoAuditService.recordAction.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).outcome === 'failure',
      );
      expect(failureAudits.length).toBeGreaterThanOrEqual(1);

      const auditEntry = failureAudits[0][0] as Record<string, Record<string, unknown>>;
      expect(auditEntry.details.tier).toBe('systemic');
      expect(auditEntry.details.error).toContain('service unavailable');
    });

    it('stores failure in episodic memory on systemic error', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('service unavailable');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      services.zikaronService.storeEpisodic.mockClear();

      await runtime.execute(instance.id, createTask());

      expect(services.zikaronService.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: 'episodic',
          eventType: 'task_failure',
          outcome: 'failure',
          sourceAgentId: instance.id,
        }),
      );
    });

    it('agent stays ready on operational (non-systemic) error', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Operational error: doesn't match transient or systemic patterns
      services.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('invalid input format: missing required field');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      const result = await runtime.execute(instance.id, createTask());

      expect(result.success).toBe(false);

      // Agent should remain ready — operational errors don't degrade
      const state = await runtime.getState(instance.id);
      expect(state).toBe('ready');
    });

    it('degraded agent reports unhealthy via getHealth', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      services.stateMachineEngine.transition.mockImplementation(async (_id: string, event: string) => {
        if (event === 'task_completed') {
          throw new Error('circuit open');
        }
        return { success: true, previousState: 'ready', newState: 'executing', gateResults: [], auditId: 'a-1' };
      });

      await runtime.execute(instance.id, createTask());

      const health = await runtime.getHealth(instance.id);
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('error');
      expect(health.message).toContain('degraded');
      expect(health.errorCount).toBeGreaterThan(0);
    });

    it('heartbeat stale detection transitions agent to degraded', async () => {
      vi.useFakeTimers();

      try {
        const program = createProgram();
        const instance = await runtime.deploy(program);

        runtime.startHeartbeatChecker();

        // Advance past the stale threshold (90s) plus a heartbeat check interval (30s)
        await vi.advanceTimersByTimeAsync(120_000);

        const state = await runtime.getState(instance.id);
        expect(state).toBe('degraded');

        // Audit should record the stale heartbeat
        const staleCalls = services.xoAuditService.recordAction.mock.calls.filter(
          (call: unknown[]) => (call[0] as Record<string, string>).actionType === 'heartbeat_stale',
        );
        expect(staleCalls.length).toBeGreaterThanOrEqual(1);

        // Event bus should publish stale heartbeat event
        const staleEvents = services.eventBusService.publish.mock.calls.filter(
          (call: unknown[]) => (call[0] as Record<string, string>).type === 'agent.heartbeat.stale',
        );
        expect(staleEvents.length).toBeGreaterThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
