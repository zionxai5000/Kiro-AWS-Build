/**
 * Unit tests for Working Memory Persistence in the Agent Runtime.
 *
 * Validates: Requirements 48c.10, 48c.11, 48c.12, 48c.13
 *
 * - 48c.10: On agent startup, load working memory from Zikaron
 * - 48c.11: Persist working memory every 60 seconds and on task completion
 * - 48c.12: Verify loaded state matches last persisted hash
 * - 48c.13: Maintain session_continuity record
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultAgentRuntime } from './runtime.js';
import type { AgentRuntimeDeps, WorkingMemoryState } from './runtime.js';
import type { AgentProgram } from '../types/agent.js';
import type { Task } from '../types/task.js';
import type { StateMachineEngine } from '../interfaces/state-machine-engine.js';
import type { AgentProgramRepository } from '../db/agent-program.repository.js';
import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { OtzarService } from '../interfaces/otzar-service.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';
import type { XOAuditService } from '../interfaces/xo-audit-service.js';
import type { EventBusService } from '../interfaces/event-bus-service.js';
import type { AgentMemoryContext, WorkingMemoryContext } from '../types/memory.js';
import type { BudgetCheckResult, CacheResult } from '../types/otzar.js';
import type { TransitionResult } from '../types/state-machine.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let smInstanceCounter = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

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

describe('Working Memory Persistence', () => {
  let runtime: DefaultAgentRuntime;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    smInstanceCounter = 0;
    vi.useFakeTimers();
    mocks = createMockDeps();
    runtime = new DefaultAgentRuntime(mocks.deps);
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
    runtime.stopWorkingMemoryPersistence();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Requirement 48c.10: Load working memory on agent startup
  // -----------------------------------------------------------------------

  describe('deploy() — working memory restoration (Requirement 48c.10)', () => {
    it('initializes working memory state on fresh deploy when no prior state exists', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState).toBeDefined();
      expect(wmState!.agentId).toBe(instance.id);
      expect(wmState!.activeGoals).toEqual([]);
      expect(wmState!.pendingTasks).toEqual([]);
      expect(wmState!.conversationCount).toBe(0);
      expect(wmState!.topicsDiscussed).toEqual([]);
      expect(wmState!.recentDecisions).toEqual([]);
      expect(wmState!.persistenceHash).toBeTruthy();
      expect(wmState!.sessionContinuity).toBeDefined();
      expect(wmState!.sessionContinuity.sessionTransitions).toHaveLength(1);
      expect(wmState!.sessionContinuity.sessionTransitions[0].reason).toBe('initial_deploy');
    });

    it('restores working memory from Zikaron when prior state exists', async () => {
      const previousGoals = ['goal-1', 'goal-2'];
      const previousTopics = ['topic-a', 'topic-b'];
      const previousHash = 'abc123';

      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'test',
        workingMemory: {
          id: 'wm-1',
          tenantId: 'system',
          layer: 'working',
          content: 'Previous working memory',
          embedding: [],
          sourceAgentId: 'prev-agent',
          tags: ['working'],
          createdAt: new Date('2024-01-01'),
          agentId: 'prev-agent',
          sessionId: 'prev-session',
          taskContext: {
            pendingTasks: [{ id: 't1', description: 'Pending task', status: 'pending' }],
            conversationCount: 5,
            topicsDiscussed: previousTopics,
            recentDecisions: [{ decision: 'chose A', reasoning: 'better fit', timestamp: new Date() }],
            persistenceHash: previousHash,
            sessionTransitions: [{ from: 'none', to: 'ready', timestamp: new Date(), reason: 'initial' }],
          },
          conversationHistory: [],
          activeGoals: previousGoals,
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState).toBeDefined();
      expect(wmState!.activeGoals).toEqual(previousGoals);
      expect(wmState!.topicsDiscussed).toEqual(previousTopics);
      expect(wmState!.conversationCount).toBe(5);
      expect(wmState!.pendingTasks).toHaveLength(1);
      expect(wmState!.pendingTasks[0].id).toBe('t1');
    });

    it('records session transition on restore from prior state', async () => {
      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'test',
        workingMemory: {
          id: 'wm-1',
          tenantId: 'system',
          layer: 'working',
          content: 'Previous',
          embedding: [],
          sourceAgentId: 'prev',
          tags: ['working'],
          createdAt: new Date('2024-01-01'),
          agentId: 'prev',
          sessionId: 'prev',
          taskContext: { sessionTransitions: [] },
          conversationHistory: [],
          activeGoals: [],
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.sessionContinuity.sessionTransitions).toContainEqual(
        expect.objectContaining({ from: 'terminated', to: 'ready', reason: 'deploy' }),
      );
    });

    it('handles loadAgentContext failure gracefully and initializes fresh state', async () => {
      mocks.zikaronService.loadAgentContext.mockRejectedValue(new Error('DB connection failed'));

      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState).toBeDefined();
      expect(wmState!.activeGoals).toEqual([]);
      expect(wmState!.sessionContinuity.sessionTransitions[0].reason).toBe('initial_deploy');
    });
  });

  // -----------------------------------------------------------------------
  // Requirement 48c.11: Persist every 60 seconds and on task completion
  // -----------------------------------------------------------------------

  describe('periodic persistence (Requirement 48c.11)', () => {
    it('persists working memory every 60 seconds when timer is started', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      // Clear the storeWorking calls from deploy
      mocks.zikaronService.storeWorking.mockClear();

      runtime.startWorkingMemoryPersistence();

      // Advance time by 60 seconds
      await vi.advanceTimersByTimeAsync(60_000);

      // Should have persisted at least once
      expect(mocks.zikaronService.storeWorking).toHaveBeenCalled();
      const call = mocks.zikaronService.storeWorking.mock.calls[0];
      expect(call[1].tags).toContain('persistence');
      expect(call[1].tags).toContain('session_continuity');
    });

    it('persists working memory multiple times over multiple intervals', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      mocks.zikaronService.storeWorking.mockClear();

      runtime.startWorkingMemoryPersistence();

      // Advance time by 180 seconds (3 intervals)
      await vi.advanceTimersByTimeAsync(180_000);

      // Should have persisted 3 times
      expect(mocks.zikaronService.storeWorking).toHaveBeenCalledTimes(3);
    });

    it('does not persist for terminated agents', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Terminate the agent
      await runtime.terminate(instance.id, 'test termination');

      mocks.zikaronService.storeWorking.mockClear();

      runtime.startWorkingMemoryPersistence();

      // Advance time by 60 seconds
      await vi.advanceTimersByTimeAsync(60_000);

      // Should NOT have persisted (agent is terminated)
      expect(mocks.zikaronService.storeWorking).not.toHaveBeenCalled();
    });

    it('stops persistence timer when stopWorkingMemoryPersistence is called', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      mocks.zikaronService.storeWorking.mockClear();

      runtime.startWorkingMemoryPersistence();
      runtime.stopWorkingMemoryPersistence();

      // Advance time by 60 seconds
      await vi.advanceTimersByTimeAsync(60_000);

      // Should NOT have persisted (timer stopped)
      expect(mocks.zikaronService.storeWorking).not.toHaveBeenCalled();
    });
  });

  describe('task completion persistence (Requirement 48c.11)', () => {
    it('persists working memory immediately on task completion', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask();

      mocks.zikaronService.storeWorking.mockClear();

      await runtime.execute(instance.id, task);

      // Should have called storeWorking for persistence after task completion
      expect(mocks.zikaronService.storeWorking).toHaveBeenCalled();
      const calls = mocks.zikaronService.storeWorking.mock.calls;
      const persistCall = calls.find(
        (c) => c[1].tags?.includes('persistence') && c[1].tags?.includes('session_continuity'),
      );
      expect(persistCall).toBeDefined();
    });

    it('updates working memory context with task completion details', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createTask({ type: 'code_generation', description: 'Generate code' });

      await runtime.execute(instance.id, task);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.topicsDiscussed).toContain('code_generation');
      expect(wmState!.conversationCount).toBe(1);
      expect(wmState!.recentDecisions).toHaveLength(1);
      expect(wmState!.recentDecisions[0].decision).toContain('Generate code');
      expect(wmState!.currentContext).toHaveProperty('lastTaskId', task.id);
      expect(wmState!.currentContext).toHaveProperty('lastTaskType', 'code_generation');
    });

    it('accumulates topics and decisions across multiple task completions', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.execute(instance.id, createTask({ id: 't1', type: 'analysis', description: 'Analyze' }));
      await runtime.execute(instance.id, createTask({ id: 't2', type: 'code_generation', description: 'Generate' }));

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.topicsDiscussed).toContain('analysis');
      expect(wmState!.topicsDiscussed).toContain('code_generation');
      expect(wmState!.conversationCount).toBe(2);
      expect(wmState!.recentDecisions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Requirement 48c.12: Hash verification on reload
  // -----------------------------------------------------------------------

  describe('hash integrity verification (Requirement 48c.12)', () => {
    it('computes and stores a SHA-256 persistence hash', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.persistenceHash).toBeTruthy();
      // SHA-256 hex is 64 characters
      expect(wmState!.persistenceHash).toHaveLength(64);
    });

    it('persistence hash changes when working memory content changes', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const hashBefore = runtime.getWorkingMemoryState(instance.id)!.persistenceHash;

      // Execute a task to change working memory
      await runtime.execute(instance.id, createTask());

      const hashAfter = runtime.getWorkingMemoryState(instance.id)!.persistenceHash;
      expect(hashAfter).not.toBe(hashBefore);
    });

    it('includes persistenceHash in the stored working memory taskContext', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      mocks.zikaronService.storeWorking.mockClear();
      await runtime.execute(instance.id, createTask());

      const persistCall = mocks.zikaronService.storeWorking.mock.calls.find(
        (c) => c[1].tags?.includes('persistence'),
      );
      expect(persistCall).toBeDefined();
      expect(persistCall![1].taskContext.persistenceHash).toBeTruthy();
      expect(persistCall![1].taskContext.persistenceHash).toHaveLength(64);
    });

    it('logs warning on hash mismatch during restore (non-fatal)', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'test',
        workingMemory: {
          id: 'wm-1',
          tenantId: 'system',
          layer: 'working',
          content: 'Previous',
          embedding: [],
          sourceAgentId: 'prev',
          tags: ['working'],
          createdAt: new Date('2024-01-01'),
          agentId: 'prev',
          sessionId: 'prev',
          taskContext: {
            persistenceHash: 'invalid_hash_that_wont_match',
            sessionTransitions: [],
          },
          conversationHistory: [],
          activeGoals: ['goal-1'],
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Should still deploy successfully despite hash mismatch
      expect(instance).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Working memory hash mismatch'),
      );

      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Requirement 48c.13: session_continuity record
  // -----------------------------------------------------------------------

  describe('session_continuity tracking (Requirement 48c.13)', () => {
    it('maintains session_continuity with lastActiveTimestamp', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.sessionContinuity.lastActiveTimestamp).toBeInstanceOf(Date);
    });

    it('maintains session_continuity with lastPersistedHash', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.sessionContinuity.lastPersistedHash).toBeTruthy();
      expect(wmState!.sessionContinuity.lastPersistedHash).toHaveLength(64);
    });

    it('records session transitions in session_continuity', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.sessionContinuity.sessionTransitions.length).toBeGreaterThan(0);
      const transition = wmState!.sessionContinuity.sessionTransitions[0];
      expect(transition).toHaveProperty('from');
      expect(transition).toHaveProperty('to');
      expect(transition).toHaveProperty('timestamp');
      expect(transition).toHaveProperty('reason');
    });

    it('stores session_continuity data in Zikaron persistence calls', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      mocks.zikaronService.storeWorking.mockClear();
      await runtime.execute(instance.id, createTask());

      const persistCall = mocks.zikaronService.storeWorking.mock.calls.find(
        (c) => c[1].tags?.includes('session_continuity'),
      );
      expect(persistCall).toBeDefined();
      expect(persistCall![1].taskContext.sessionContinuity).toBeDefined();
      expect(persistCall![1].taskContext.sessionContinuity.lastActiveTimestamp).toBeTruthy();
      expect(persistCall![1].taskContext.sessionContinuity.lastPersistedHash).toBeTruthy();
    });

    it('updates lastActiveTimestamp on task completion', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const beforeExec = runtime.getWorkingMemoryState(instance.id)!.sessionContinuity.lastActiveTimestamp;

      // Advance time slightly
      vi.advanceTimersByTime(1000);

      await runtime.execute(instance.id, createTask());

      const afterExec = runtime.getWorkingMemoryState(instance.id)!.sessionContinuity.lastActiveTimestamp;
      expect(afterExec.getTime()).toBeGreaterThanOrEqual(beforeExec.getTime());
    });
  });

  // -----------------------------------------------------------------------
  // Non-fatal persistence failures
  // -----------------------------------------------------------------------

  describe('non-fatal persistence failures', () => {
    it('does not crash the agent when periodic persistence fails', async () => {
      const program = createProgram();
      await runtime.deploy(program);

      // Make storeWorking fail
      mocks.zikaronService.storeWorking.mockRejectedValue(new Error('DB unavailable'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      runtime.startWorkingMemoryPersistence();

      // Advance time by 60 seconds — should not throw
      await vi.advanceTimersByTimeAsync(60_000);

      // Agent should still be functional
      const agents = await runtime.listAgents();
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].state).toBe('ready');

      consoleSpy.mockRestore();
    });

    it('does not fail task execution when persistence fails on completion', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Make storeWorking fail after deploy succeeds
      mocks.zikaronService.storeWorking.mockRejectedValue(new Error('DB unavailable'));

      const task = createTask();
      const result = await runtime.execute(instance.id, task);

      // Task should still succeed
      expect(result.success).toBe(true);
    });
  });
});
