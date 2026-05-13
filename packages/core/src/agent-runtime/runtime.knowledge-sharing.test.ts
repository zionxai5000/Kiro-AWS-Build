/**
 * Unit tests for Inter-Agent Knowledge Sharing and Cross-Session Continuity.
 *
 * Validates: Requirements 48e.22, 48e.23, 48c.13
 *
 * - 48e.22: Inter-agent knowledge sharing publishes events on conversation/decision
 * - 48e.23: Knowledge sharing events contain correct metadata for consumption
 * - 48c.13: Cross-session continuity (simulate container restart, verify context restored)
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
    id: 'prog-ks-1',
    name: 'KnowledgeSharingAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are a knowledge sharing test agent.',
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
    allowedActions: ['read', 'write', 'chat'],
    deniedActions: [],
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

function createChatTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'chat-ks-1',
    type: 'chat',
    description: 'Chat with user for knowledge sharing test',
    params: {
      input: 'What is the best deployment strategy?',
      userId: 'user-ks-1',
      source: 'dashboard',
    },
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
      rationale: 'Best fit for chat',
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
// Tests — Inter-Agent Knowledge Sharing
// ---------------------------------------------------------------------------

describe('DefaultAgentRuntime — Inter-Agent Knowledge Sharing', () => {
  let runtime: DefaultAgentRuntime;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    smInstanceCounter = 0;
    mocks = createMockDeps();
    runtime = new DefaultAgentRuntime(mocks.deps);
    // Ensure no real API keys are used (stub path)
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
    runtime.stopWorkingMemoryPersistence();
  });

  describe('knowledge sharing event publishing', () => {
    it('publishes memory.knowledge_shared event after chat execution', async () => {
      const program = createProgram({ name: 'SharingAgent', pillar: 'eretz' });
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      // Find the knowledge_shared event among all publish calls
      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      expect(knowledgeEvents).toHaveLength(2);
    });

    it('knowledge_shared event contains sourceAgentId', async () => {
      const program = createProgram({ name: 'SharingAgent' });
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const eventDetail = (knowledgeEvents[0][0] as Record<string, Record<string, unknown>>).detail;
      expect(eventDetail.sourceAgentId).toBe(instance.id);
    });

    it('knowledge_shared event contains memoryEntryId referencing stored episodic entry', async () => {
      const program = createProgram({ name: 'SharingAgent' });
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const eventDetail = (knowledgeEvents[0][0] as Record<string, Record<string, unknown>>).detail;
      // memoryEntryId should be defined (references the stored conversation entry)
      expect(eventDetail.memoryEntryId).toBeDefined();
    });

    it('knowledge_shared event contains relevanceTags with pillar and task type', async () => {
      const program = createProgram({ name: 'SharingAgent', pillar: 'zionx' });
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const eventDetail = (knowledgeEvents[0][0] as Record<string, Record<string, unknown>>).detail;
      const tags = eventDetail.relevanceTags as string[];
      expect(tags).toContain('conversation');
      expect(tags).toContain('zionx');
      expect(tags).toContain('chat');
    });

    it('knowledge_shared event contains summary with agent name and message excerpt', async () => {
      const program = createProgram({ name: 'StrategyAgent' });
      const instance = await runtime.deploy(program);
      const task = createChatTask({
        params: { input: 'What is the best deployment strategy?', userId: 'user-1', source: 'dashboard' },
      });

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const eventDetail = (knowledgeEvents[0][0] as Record<string, Record<string, unknown>>).detail;
      const summary = eventDetail.summary as string;
      expect(summary).toContain('StrategyAgent');
      expect(summary).toContain('deployment strategy');
    });

    it('knowledge_shared event specifies episodic layer', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const eventDetail = (knowledgeEvents[0][0] as Record<string, Record<string, unknown>>).detail;
      expect(eventDetail.layer).toBe('episodic');
    });

    it('knowledge_shared event includes correct metadata (tenantId, correlationId, timestamp)', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask({ id: 'chat-corr-1' });

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const eventMetadata = (knowledgeEvents[0][0] as Record<string, Record<string, unknown>>).metadata;
      expect(eventMetadata.tenantId).toBe('system');
      expect(eventMetadata.correlationId).toBe('chat-corr-1');
      expect(eventMetadata.timestamp).toBeInstanceOf(Date);
    });

    it('knowledge sharing failure does not fail the chat task', async () => {
      // Make eventBus.publish fail for knowledge_shared events
      mocks.eventBusService.publish.mockImplementation(async (event: Record<string, string>) => {
        if (event.type === 'memory.knowledge_shared') {
          throw new Error('EventBridge unavailable');
        }
        return 'event-1';
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      const result = await runtime.execute(instance.id, task);

      // Chat task should still succeed despite knowledge sharing failure
      expect(result.success).toBe(true);
    });

    it('event source is seraphim.agent-runtime', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, string>).type === 'memory.knowledge_shared',
      );

      const event = knowledgeEvents[0][0] as Record<string, string>;
      expect(event.source).toBe('seraphim.agent-runtime');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — Cross-Session Continuity (Container Restart Simulation)
// ---------------------------------------------------------------------------

describe('DefaultAgentRuntime — Cross-Session Continuity', () => {
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    smInstanceCounter = 0;
    mocks = createMockDeps();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  describe('simulate container restart: deploy → execute → terminate → redeploy → verify', () => {
    it('restores working memory state after simulated container restart', async () => {
      // Phase 1: First runtime session — deploy and execute tasks
      const runtime1 = new DefaultAgentRuntime(mocks.deps);
      const program = createProgram({ name: 'PersistentAgent' });
      const instance1 = await runtime1.deploy(program);

      // Execute some tasks to build up working memory state
      await runtime1.execute(instance1.id, {
        id: 'task-1',
        type: 'analysis',
        description: 'Analyze market data',
        params: {},
        priority: 'medium',
      });
      await runtime1.execute(instance1.id, {
        id: 'task-2',
        type: 'code_generation',
        description: 'Generate trading bot',
        params: {},
        priority: 'high',
      });

      // Capture the working memory state before "crash"
      const wmBeforeCrash = runtime1.getWorkingMemoryState(instance1.id);
      expect(wmBeforeCrash).toBeDefined();
      expect(wmBeforeCrash!.conversationCount).toBe(2);
      expect(wmBeforeCrash!.topicsDiscussed).toContain('analysis');
      expect(wmBeforeCrash!.topicsDiscussed).toContain('code_generation');

      // Capture the persisted hash
      const persistedHash = wmBeforeCrash!.persistenceHash;
      expect(persistedHash).toHaveLength(64);

      // Simulate container crash — stop the runtime
      runtime1.stopHeartbeatChecker();
      runtime1.stopWorkingMemoryPersistence();

      // Phase 2: New runtime session — simulate container restart
      // Configure Zikaron to return the previously persisted working memory
      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'new-agent',
        workingMemory: {
          id: 'wm-restored',
          tenantId: 'system',
          layer: 'working',
          content: 'Restored working memory',
          embedding: [],
          sourceAgentId: instance1.id,
          tags: ['working', 'persistence', 'session_continuity'],
          createdAt: new Date(),
          agentId: instance1.id,
          sessionId: instance1.id,
          taskContext: {
            pendingTasks: [],
            conversationCount: 2,
            topicsDiscussed: ['analysis', 'code_generation'],
            recentDecisions: [
              { decision: 'Completed task: Analyze market data', reasoning: 'Task analysis executed successfully', timestamp: new Date() },
              { decision: 'Completed task: Generate trading bot', reasoning: 'Task code_generation executed successfully', timestamp: new Date() },
            ],
            persistenceHash: persistedHash,
            sessionTransitions: [
              { from: 'none', to: 'ready', timestamp: new Date(), reason: 'initial_deploy' },
            ],
            currentContext: {
              lastTaskId: 'task-2',
              lastTaskType: 'code_generation',
              lastTaskSuccess: true,
            },
          },
          conversationHistory: [],
          activeGoals: ['complete-trading-system'],
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      // Create a new runtime (simulating container restart)
      const runtime2 = new DefaultAgentRuntime(mocks.deps);
      const instance2 = await runtime2.deploy(program);

      // Verify working memory was restored
      const wmAfterRestart = runtime2.getWorkingMemoryState(instance2.id);
      expect(wmAfterRestart).toBeDefined();
      expect(wmAfterRestart!.conversationCount).toBe(2);
      expect(wmAfterRestart!.topicsDiscussed).toContain('analysis');
      expect(wmAfterRestart!.topicsDiscussed).toContain('code_generation');
      expect(wmAfterRestart!.activeGoals).toContain('complete-trading-system');
      expect(wmAfterRestart!.recentDecisions).toHaveLength(2);

      // Verify session transition was recorded
      const transitions = wmAfterRestart!.sessionContinuity.sessionTransitions;
      const restoreTransition = transitions.find((t) => t.reason === 'deploy' && t.from === 'terminated');
      expect(restoreTransition).toBeDefined();
      expect(restoreTransition!.to).toBe('ready');

      // Cleanup
      runtime2.stopHeartbeatChecker();
      runtime2.stopWorkingMemoryPersistence();
    });

    it('agent can continue executing tasks after restart with restored context', async () => {
      // Setup: Zikaron returns prior working memory with context
      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'restored-agent',
        workingMemory: {
          id: 'wm-prior',
          tenantId: 'system',
          layer: 'working',
          content: 'Prior session memory',
          embedding: [],
          sourceAgentId: 'prior-agent',
          tags: ['working'],
          createdAt: new Date(),
          agentId: 'prior-agent',
          sessionId: 'prior-session',
          taskContext: {
            pendingTasks: [],
            conversationCount: 5,
            topicsDiscussed: ['strategy', 'risk', 'portfolio'],
            recentDecisions: [],
            persistenceHash: 'a'.repeat(64),
            sessionTransitions: [
              { from: 'none', to: 'ready', timestamp: new Date(), reason: 'initial_deploy' },
            ],
            currentContext: { lastTaskType: 'analysis' },
          },
          conversationHistory: [],
          activeGoals: ['optimize-portfolio'],
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      const runtime = new DefaultAgentRuntime(mocks.deps);
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Execute a new task after restart
      const result = await runtime.execute(instance.id, {
        id: 'post-restart-task',
        type: 'analysis',
        description: 'Continue portfolio analysis',
        params: {},
        priority: 'medium',
      });

      expect(result.success).toBe(true);

      // Working memory should accumulate on top of restored state
      const wmState = runtime.getWorkingMemoryState(instance.id);
      expect(wmState!.conversationCount).toBe(6); // 5 from prior + 1 new
      expect(wmState!.topicsDiscussed).toContain('strategy'); // Prior topics preserved
      expect(wmState!.topicsDiscussed).toContain('analysis'); // New topic added
      expect(wmState!.currentContext).toHaveProperty('lastTaskId', 'post-restart-task');

      runtime.stopHeartbeatChecker();
      runtime.stopWorkingMemoryPersistence();
    });

    it('session_continuity tracks multiple restart cycles', async () => {
      // Simulate a second restart with prior session transitions
      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'multi-restart',
        workingMemory: {
          id: 'wm-multi',
          tenantId: 'system',
          layer: 'working',
          content: 'Multi-restart memory',
          embedding: [],
          sourceAgentId: 'agent-prev',
          tags: ['working'],
          createdAt: new Date(),
          agentId: 'agent-prev',
          sessionId: 'session-prev',
          taskContext: {
            pendingTasks: [],
            conversationCount: 10,
            topicsDiscussed: ['topic-a'],
            recentDecisions: [],
            persistenceHash: 'b'.repeat(64),
            sessionTransitions: [
              { from: 'none', to: 'ready', timestamp: new Date('2024-01-01'), reason: 'initial_deploy' },
              { from: 'terminated', to: 'ready', timestamp: new Date('2024-01-02'), reason: 'deploy' },
              { from: 'terminated', to: 'ready', timestamp: new Date('2024-01-03'), reason: 'deploy' },
            ],
          },
          conversationHistory: [],
          activeGoals: [],
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      const runtime = new DefaultAgentRuntime(mocks.deps);
      const program = createProgram();
      const instance = await runtime.deploy(program);

      const wmState = runtime.getWorkingMemoryState(instance.id);
      // Should have 4 transitions: 3 from prior + 1 new deploy
      expect(wmState!.sessionContinuity.sessionTransitions).toHaveLength(4);
      expect(wmState!.sessionContinuity.sessionTransitions[3].reason).toBe('deploy');
      expect(wmState!.sessionContinuity.sessionTransitions[3].from).toBe('terminated');
      expect(wmState!.sessionContinuity.sessionTransitions[3].to).toBe('ready');

      runtime.stopHeartbeatChecker();
      runtime.stopWorkingMemoryPersistence();
    });

    it('loadAgentContext is called with the new agent ID during deploy', async () => {
      const runtime = new DefaultAgentRuntime(mocks.deps);
      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Verify loadAgentContext was called with the deployed agent's ID
      expect(mocks.zikaronService.loadAgentContext).toHaveBeenCalledWith(instance.id);

      runtime.stopHeartbeatChecker();
    });

    it('persists working memory to Zikaron immediately after restore', async () => {
      mocks.zikaronService.loadAgentContext.mockResolvedValue({
        agentId: 'test',
        workingMemory: {
          id: 'wm-1',
          tenantId: 'system',
          layer: 'working',
          content: 'Restored',
          embedding: [],
          sourceAgentId: 'prev',
          tags: ['working'],
          createdAt: new Date(),
          agentId: 'prev',
          sessionId: 'prev',
          taskContext: {
            sessionTransitions: [],
            persistenceHash: 'c'.repeat(64),
          },
          conversationHistory: [],
          activeGoals: ['goal-1'],
        } as WorkingMemoryContext,
        recentEpisodic: [],
        proceduralPatterns: [],
      } as AgentMemoryContext);

      const runtime = new DefaultAgentRuntime(mocks.deps);
      const program = createProgram();
      await runtime.deploy(program);

      // storeWorking should be called during deploy to persist the restored + updated state
      expect(mocks.zikaronService.storeWorking).toHaveBeenCalled();
      const storeCall = mocks.zikaronService.storeWorking.mock.calls[0];
      expect(storeCall[1].tags).toContain('persistence');
      expect(storeCall[1].tags).toContain('session_continuity');

      runtime.stopHeartbeatChecker();
    });
  });
});
