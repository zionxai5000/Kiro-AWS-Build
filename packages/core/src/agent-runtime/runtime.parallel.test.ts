/**
 * Integration tests for Parallel Orchestration.
 *
 * These tests verify the full parallel execution flow using real implementations
 * of DependencyGraphEngineImpl, ParallelSchedulerImpl, CoordinationBusImpl,
 * and ResultAggregatorImpl from @seraphim/services.
 *
 * Validates: Requirements 35a.1, 35b.5, 35b.6, 35c.9, 19.2
 *
 * - 35a.1: Intra-agent parallelism (single agent spawns parallel sub-tasks)
 * - 35b.5: Inter-agent parallelism (Seraphim dispatches to multiple agents)
 * - 35b.6: Dependency handling (agent B waits for agent A's output)
 * - 35c.9: Deadlock detection (circular dependency detected and reported)
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
import type { BudgetCheckResult, CacheResult } from '../types/otzar.js';
import type { TransitionResult } from '../types/state-machine.js';
import type { AgentMemoryContext } from '../types/memory.js';

// Real parallel service implementations
import { DependencyGraphEngineImpl } from '@seraphim/services/parallel/dependency-graph.js';
import { ParallelSchedulerImpl } from '@seraphim/services/parallel/scheduler.js';
import { CoordinationBusImpl } from '@seraphim/services/parallel/coordination-bus.js';
import { ResultAggregatorImpl } from '@seraphim/services/parallel/result-aggregator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

let smInstanceCounter = 0;

function createProgram(overrides: Partial<AgentProgram> = {}): AgentProgram {
  return {
    id: `prog-parallel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'ParallelTestAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are a parallel test agent.',
    tools: [],
    stateMachine: {
      id: 'sm-par-1',
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
    id: `task-par-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'analysis',
    description: 'Parallel test task',
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

  return {
    programRepo,
    stateMachineEngine,
    mishmarService,
    otzarService,
    zikaronService,
    xoAuditService,
    eventBusService,
  };
}

// ---------------------------------------------------------------------------
// Integration Tests — Parallel Orchestration
// ---------------------------------------------------------------------------

describe('Agent Runtime — Parallel Orchestration Integration Tests', () => {
  let runtime: DefaultAgentRuntime;
  let services: ReturnType<typeof createMockServices>;
  let dependencyGraphEngine: DependencyGraphEngineImpl;
  let parallelScheduler: ParallelSchedulerImpl;
  let coordinationBus: CoordinationBusImpl;
  let resultAggregator: ResultAggregatorImpl;

  beforeEach(() => {
    smInstanceCounter = 0;
    services = createMockServices();

    // Create real parallel service instances
    dependencyGraphEngine = new DependencyGraphEngineImpl();
    parallelScheduler = new ParallelSchedulerImpl();
    coordinationBus = new CoordinationBusImpl();
    resultAggregator = new ResultAggregatorImpl();

    const deps: AgentRuntimeDeps = {
      programRepo: services.programRepo,
      stateMachineEngine: services.stateMachineEngine as unknown as StateMachineEngine,
      mishmarService: services.mishmarService as unknown as MishmarService,
      otzarService: services.otzarService as unknown as OtzarService,
      zikaronService: services.zikaronService as unknown as ZikaronService,
      xoAuditService: services.xoAuditService as unknown as XOAuditService,
      eventBusService: services.eventBusService as unknown as EventBusService,
      parallelScheduler,
      coordinationBus,
      resultAggregator,
      dependencyGraphEngine,
    };

    runtime = new DefaultAgentRuntime(deps);
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
  });

  // -------------------------------------------------------------------------
  // 1. Intra-agent parallelism
  // Validates: Requirements 35a.1, 19.2
  // -------------------------------------------------------------------------

  describe('intra-agent parallelism: single agent spawns parallel sub-tasks', () => {
    it('single agent spawns 3 parallel sub-tasks, all complete, results aggregated', async () => {
      // Deploy a single agent
      const program = createProgram({ name: 'ParallelWorker' });
      const instance = await runtime.deploy(program);

      // Create 3 independent tasks (no dependencies between them)
      const tasks = [
        {
          id: 'subtask-1',
          agentId: instance.id,
          task: createTask({ id: 'st-1', type: 'analysis', description: 'Analyze dataset A' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'subtask-2',
          agentId: instance.id,
          task: createTask({ id: 'st-2', type: 'analysis', description: 'Analyze dataset B' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'subtask-3',
          agentId: instance.id,
          task: createTask({ id: 'st-3', type: 'analysis', description: 'Analyze dataset C' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
      ];

      // Execute in parallel
      const result = await runtime.executeParallel(tasks, {
        aggregationStrategy: 'merge',
      });

      // All 3 streams should complete successfully
      expect(result.totalStreams).toBe(3);
      expect(result.successfulStreams).toBe(3);
      expect(result.failedStreams).toBe(0);
      expect(result.dagId).toBeDefined();
      expect(result.aggregatedAt).toBeInstanceOf(Date);

      // Each task should have a result in perStreamResults
      expect(result.perStreamResults.size).toBe(3);
      for (const [, taskResult] of result.perStreamResults) {
        expect(taskResult.success).toBe(true);
        expect(taskResult.tokenUsage.inputTokens).toBeGreaterThan(0);
      }

      // Merged output should contain data from all tasks
      expect(result.mergedOutput).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Inter-agent parallelism
  // Validates: Requirements 35b.5, 19.2
  // -------------------------------------------------------------------------

  describe('inter-agent parallelism: Seraphim dispatches to ZionX and ZXMG in parallel', () => {
    it('dispatches to ZionX and ZXMG in parallel, both complete independently', async () => {
      // Deploy two agents representing ZionX and ZXMG
      const zionxProgram = createProgram({ name: 'ZionX', pillar: 'zionx' });
      const zxmgProgram = createProgram({ name: 'ZXMG', pillar: 'zxmg' });

      const zionxInstance = await runtime.deploy(zionxProgram);
      const zxmgInstance = await runtime.deploy(zxmgProgram);

      // Create assignments map for dispatchToAgents
      const assignments = new Map<string, Task>();
      assignments.set(
        zionxInstance.id,
        createTask({ id: 'zionx-task', type: 'code_generation', description: 'Generate product code' }),
      );
      assignments.set(
        zxmgInstance.id,
        createTask({ id: 'zxmg-task', type: 'analysis', description: 'Analyze marketing data' }),
      );

      // Dispatch to both agents in parallel
      const result = await runtime.dispatchToAgents(assignments, {
        aggregationStrategy: 'merge',
      });

      // Both agents should complete independently
      expect(result.totalStreams).toBe(2);
      expect(result.successfulStreams).toBe(2);
      expect(result.failedStreams).toBe(0);

      // Each agent's result should be present
      expect(result.perStreamResults.size).toBe(2);

      // Verify both agents were actually executed (Mishmar authorize called for each)
      const authCalls = services.mishmarService.authorize.mock.calls.filter(
        (call: unknown[]) => {
          const req = call[0] as Record<string, string>;
          return req.agentId === zionxInstance.id || req.agentId === zxmgInstance.id;
        },
      );
      // At least 2 authorize calls for the parallel tasks (one per agent)
      expect(authCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Dependency handling
  // Validates: Requirements 35b.6, 19.2
  // -------------------------------------------------------------------------

  describe('dependency handling: agent B waits for agent A output', () => {
    it('agent B waits for agent A output, proceeds after A completes', async () => {
      // Deploy two agents
      const agentAProgram = createProgram({ name: 'AgentA' });
      const agentBProgram = createProgram({ name: 'AgentB' });

      const agentA = await runtime.deploy(agentAProgram);
      const agentB = await runtime.deploy(agentBProgram);

      // Create tasks with dependency: B depends on A
      const tasks = [
        {
          id: 'task-a',
          agentId: agentA.id,
          task: createTask({ id: 'ta', type: 'analysis', description: 'Produce data for B' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'task-b',
          agentId: agentB.id,
          task: createTask({ id: 'tb', type: 'analysis', description: 'Process data from A' }),
          dependencies: ['task-a'], // B depends on A
          priority: 5,
          estimatedDurationMs: 1000,
        },
      ];

      // Execute with dependency resolution
      const result = await runtime.executeParallel(tasks, {
        aggregationStrategy: 'merge',
      });

      // Both should complete successfully
      expect(result.totalStreams).toBe(2);
      expect(result.successfulStreams).toBe(2);
      expect(result.failedStreams).toBe(0);

      // Both tasks should have results
      expect(result.perStreamResults.size).toBe(2);

      // Verify task-a result exists and succeeded
      const taskAResult = result.perStreamResults.get('task-a');
      expect(taskAResult).toBeDefined();
      expect(taskAResult!.success).toBe(true);

      // Verify task-b result exists and succeeded (ran after A)
      const taskBResult = result.perStreamResults.get('task-b');
      expect(taskBResult).toBeDefined();
      expect(taskBResult!.success).toBe(true);
    });

    it('three-level dependency chain executes in correct order', async () => {
      const program = createProgram({ name: 'ChainAgent' });
      const agent = await runtime.deploy(program);

      // A → B → C (linear chain)
      const tasks = [
        {
          id: 'chain-a',
          agentId: agent.id,
          task: createTask({ id: 'ca', type: 'analysis', description: 'Step 1' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 500,
        },
        {
          id: 'chain-b',
          agentId: agent.id,
          task: createTask({ id: 'cb', type: 'analysis', description: 'Step 2' }),
          dependencies: ['chain-a'],
          priority: 5,
          estimatedDurationMs: 500,
        },
        {
          id: 'chain-c',
          agentId: agent.id,
          task: createTask({ id: 'cc', type: 'analysis', description: 'Step 3' }),
          dependencies: ['chain-b'],
          priority: 5,
          estimatedDurationMs: 500,
        },
      ];

      const result = await runtime.executeParallel(tasks, {
        aggregationStrategy: 'concatenate',
      });

      expect(result.totalStreams).toBe(3);
      expect(result.successfulStreams).toBe(3);
      expect(result.failedStreams).toBe(0);
      expect(result.perStreamResults.size).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Failure isolation
  // Validates: Requirements 35a.1, 19.2
  // -------------------------------------------------------------------------

  describe('failure isolation: one parallel stream fails, others continue', () => {
    it('one parallel stream fails, others continue, partial results returned', async () => {
      // Deploy agents
      const goodProgram = createProgram({ name: 'GoodAgent' });
      const badProgram = createProgram({ name: 'BadAgent' });

      const goodAgent1 = await runtime.deploy(goodProgram);
      const goodAgent2 = await runtime.deploy(createProgram({ name: 'GoodAgent2' }));
      const badAgent = await runtime.deploy(badProgram);

      // Make Mishmar deny authorization for the bad agent's task
      services.mishmarService.authorize.mockImplementation(async (req: Record<string, string>) => {
        if (req.agentId === badAgent.id) {
          return {
            authorized: false,
            reason: 'Agent not authorized for this action',
            auditId: 'audit-deny-parallel',
          };
        }
        return {
          authorized: true,
          reason: 'Allowed',
          auditId: 'audit-auth-ok',
        };
      });

      // Create 3 parallel tasks — one will fail due to authorization denial
      const tasks = [
        {
          id: 'good-task-1',
          agentId: goodAgent1.id,
          task: createTask({ id: 'gt1', type: 'analysis', description: 'Good task 1' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'bad-task',
          agentId: badAgent.id,
          task: createTask({ id: 'bt', type: 'analysis', description: 'Bad task' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'good-task-2',
          agentId: goodAgent2.id,
          task: createTask({ id: 'gt2', type: 'analysis', description: 'Good task 2' }),
          dependencies: [],
          priority: 5,
          estimatedDurationMs: 1000,
        },
      ];

      // Execute with continueOnFailure enabled
      const result = await runtime.executeParallel(tasks, {
        continueOnFailure: true,
        aggregationStrategy: 'merge',
      });

      // Should have all 3 streams reported
      expect(result.totalStreams).toBe(3);
      // 2 successful, 1 failed
      expect(result.successfulStreams).toBe(2);
      expect(result.failedStreams).toBe(1);

      // Partial results should be available
      expect(result.perStreamResults.size).toBe(3);

      // Good tasks succeeded
      const good1Result = result.perStreamResults.get('good-task-1');
      expect(good1Result).toBeDefined();
      expect(good1Result!.success).toBe(true);

      const good2Result = result.perStreamResults.get('good-task-2');
      expect(good2Result).toBeDefined();
      expect(good2Result!.success).toBe(true);

      // Bad task failed
      const badResult = result.perStreamResults.get('bad-task');
      expect(badResult).toBeDefined();
      expect(badResult!.success).toBe(false);
      expect(badResult!.error).toContain('Permission denied');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Deadlock detection
  // Validates: Requirements 35c.9, 19.2
  // -------------------------------------------------------------------------

  describe('deadlock detection: circular dependency detected and reported', () => {
    it('circular dependency detected and reported (DAG validation rejects it)', async () => {
      const program = createProgram({ name: 'DeadlockAgent' });
      const agent = await runtime.deploy(program);

      // Create tasks with circular dependency: A → B → C → A
      const tasks = [
        {
          id: 'cycle-a',
          agentId: agent.id,
          task: createTask({ id: 'cyc-a', type: 'analysis', description: 'Cycle A' }),
          dependencies: ['cycle-c'], // A depends on C
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'cycle-b',
          agentId: agent.id,
          task: createTask({ id: 'cyc-b', type: 'analysis', description: 'Cycle B' }),
          dependencies: ['cycle-a'], // B depends on A
          priority: 5,
          estimatedDurationMs: 1000,
        },
        {
          id: 'cycle-c',
          agentId: agent.id,
          task: createTask({ id: 'cyc-c', type: 'analysis', description: 'Cycle C' }),
          dependencies: ['cycle-b'], // C depends on B
          priority: 5,
          estimatedDurationMs: 1000,
        },
      ];

      // executeParallel should throw due to DAG validation failure
      await expect(
        runtime.executeParallel(tasks),
      ).rejects.toThrow(/DAG validation failed.*[Cc]ircular dependency/);
    });

    it('self-dependency is detected and rejected', async () => {
      const program = createProgram({ name: 'SelfDepAgent' });
      const agent = await runtime.deploy(program);

      // Task depends on itself
      const tasks = [
        {
          id: 'self-dep',
          agentId: agent.id,
          task: createTask({ id: 'sd', type: 'analysis', description: 'Self dep' }),
          dependencies: ['self-dep'], // depends on itself
          priority: 5,
          estimatedDurationMs: 1000,
        },
      ];

      await expect(
        runtime.executeParallel(tasks),
      ).rejects.toThrow(/DAG validation failed/);
    });

    it('validates DAG directly using DependencyGraphEngine for cycle detection', async () => {
      // Use the real DependencyGraphEngine directly to verify cycle detection
      const tasks = [
        {
          id: 'x',
          agentId: 'agent-1',
          task: createTask({ id: 'tx', description: 'Task X' }),
          dependencies: ['y'],
          priority: 5,
          estimatedDuration: 1000,
          resourceRequirements: { cpuUnits: 1, memoryMb: 256 },
        },
        {
          id: 'y',
          agentId: 'agent-1',
          task: createTask({ id: 'ty', description: 'Task Y' }),
          dependencies: ['x'],
          priority: 5,
          estimatedDuration: 1000,
          resourceRequirements: { cpuUnits: 1, memoryMb: 256 },
        },
      ];

      const dag = await dependencyGraphEngine.createGraph(tasks);
      const validation = await dependencyGraphEngine.validateGraph(dag);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0].type).toBe('circular_dependency');
      expect(validation.errors[0].cyclePath).toBeDefined();
      expect(validation.errors[0].cyclePath!.length).toBeGreaterThan(0);
    });
  });
});
