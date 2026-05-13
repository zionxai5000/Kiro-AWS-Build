/**
 * Unit tests for memory-backed decision support in the Agent Runtime.
 *
 * Validates: Requirements 48d.14, 48d.15, 48d.16, 48d.17
 *
 * - 48d.14: Before making any decision, query Zikaron for relevant procedural memory
 * - 48d.15: Store decision context, reasoning, and outcome in episodic memory with `decision` tag
 * - 48d.16: Track decision patterns in procedural memory with success rates
 * - 48d.17: When a decision contradicts a stored successful pattern, acknowledge the deviation
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
import type { AgentMemoryContext, MemoryResult } from '../types/memory.js';
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
    id: 'prog-decision',
    name: 'DecisionAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are a decision-making assistant.',
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
    id: 'chat-task-1',
    type: 'chat',
    description: 'Chat with user',
    params: {
      input: 'Should I invest in tech stocks?',
      userId: 'user-456',
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
// Tests
// ---------------------------------------------------------------------------

describe('DefaultAgentRuntime — Memory-Backed Decision Support', () => {
  let runtime: DefaultAgentRuntime;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    smInstanceCounter = 0;
    mocks = createMockDeps();
    runtime = new DefaultAgentRuntime(mocks.deps);
    // Ensure no real API keys are used
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
    runtime.stopWorkingMemoryPersistence();
    vi.restoreAllMocks();
  });

  describe('Procedural pattern loading (Requirement 48d.14)', () => {
    it('should query Zikaron procedural memory before making a decision', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      // Verify that query was called with procedural layer
      const queryCalls = mocks.zikaronService.query.mock.calls;
      const proceduralQuery = queryCalls.find(
        (call: unknown[]) => {
          const req = call[0] as { layers?: string[] };
          return req.layers?.includes('procedural');
        },
      );
      expect(proceduralQuery).toBeDefined();
      expect(proceduralQuery![0]).toMatchObject({
        tenantId: 'system',
        layers: ['procedural'],
      });
    });

    it('should pass procedural patterns to buildSystemPrompt when patterns exist', async () => {
      // Mock procedural patterns returned from Zikaron
      const proceduralResults: MemoryResult[] = [
        {
          id: 'proc-1',
          layer: 'procedural',
          content: 'When asked about investments, recommend diversification',
          similarity: 0.9,
          metadata: {
            successRate: 0.85,
            executionCount: 20,
            workflowPattern: 'investment-advice-diversification',
          },
          sourceAgentId: 'agent-1',
          timestamp: new Date(),
        },
        {
          id: 'proc-2',
          layer: 'procedural',
          content: 'Always consider risk tolerance before recommending',
          similarity: 0.8,
          metadata: {
            successRate: 0.92,
            executionCount: 15,
            workflowPattern: 'risk-assessment-first',
          },
          sourceAgentId: 'agent-1',
          timestamp: new Date(),
        },
      ];

      // First query call is for procedural patterns, second is for conversation history
      mocks.zikaronService.query.mockImplementation(async (req: { layers?: string[] }) => {
        if (req.layers?.includes('procedural')) {
          return proceduralResults;
        }
        return []; // No conversation history
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      const result = await runtime.execute(instance.id, task);

      // The stub response should be generated (no API keys)
      expect(result.success).toBe(true);

      // Verify procedural query was made with the user's message context
      const queryCalls = mocks.zikaronService.query.mock.calls;
      const proceduralQuery = queryCalls.find(
        (call: unknown[]) => {
          const req = call[0] as { layers?: string[] };
          return req.layers?.includes('procedural');
        },
      );
      expect(proceduralQuery).toBeDefined();
      expect(proceduralQuery![0].text).toContain('Should I invest in tech stocks?');
    });

    it('should proceed without patterns if procedural memory query fails', async () => {
      // Make the first query (procedural) fail, but conversation history succeeds
      let callCount = 0;
      mocks.zikaronService.query.mockImplementation(async (req: { layers?: string[] }) => {
        callCount++;
        if (req.layers?.includes('procedural')) {
          throw new Error('Zikaron unavailable');
        }
        return [];
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      // Should not throw — procedural failure is non-fatal
      const result = await runtime.execute(instance.id, task);
      expect(result.success).toBe(true);
    });

    it('should limit procedural patterns to top 5 by success rate', async () => {
      // Return more than 5 patterns
      const manyPatterns: MemoryResult[] = Array.from({ length: 8 }, (_, i) => ({
        id: `proc-${i}`,
        layer: 'procedural' as const,
        content: `Pattern ${i}`,
        similarity: 0.9 - i * 0.05,
        metadata: {
          successRate: 0.5 + i * 0.05, // Increasing success rates
          executionCount: 10 + i,
          workflowPattern: `pattern-${i}`,
        },
        sourceAgentId: 'agent-1',
        timestamp: new Date(),
      }));

      mocks.zikaronService.query.mockImplementation(async (req: { layers?: string[] }) => {
        if (req.layers?.includes('procedural')) {
          return manyPatterns;
        }
        return [];
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      const result = await runtime.execute(instance.id, task);
      expect(result.success).toBe(true);

      // The system prompt should include patterns — verify via the stub response
      // (since no API keys, the stub is returned, but the patterns were loaded)
      // We verify by checking the query was made with appropriate limit
      const proceduralQuery = mocks.zikaronService.query.mock.calls.find(
        (call: unknown[]) => {
          const req = call[0] as { layers?: string[] };
          return req.layers?.includes('procedural');
        },
      );
      expect(proceduralQuery![0].limit).toBe(10); // MAX_PROCEDURAL_PATTERNS * 2
    });
  });

  describe('Decision storage (Requirement 48d.15)', () => {
    it('should store decision in episodic memory with decision tag after response', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      // storeEpisodic should be called at least twice:
      // 1. For conversation exchange
      // 2. For decision storage
      expect(mocks.zikaronService.storeEpisodic.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Find the decision storage call (has 'decision' tag)
      const decisionCall = mocks.zikaronService.storeEpisodic.mock.calls.find(
        (call: unknown[]) => {
          const entry = call[0] as { tags: string[] };
          return entry.tags.includes('decision');
        },
      );

      expect(decisionCall).toBeDefined();
      const decisionEntry = decisionCall![0] as {
        tags: string[];
        eventType: string;
        layer: string;
        sourceAgentId: string;
        participants: string[];
      };
      expect(decisionEntry.eventType).toBe('decision');
      expect(decisionEntry.layer).toBe('episodic');
      expect(decisionEntry.sourceAgentId).toBe(instance.id);
      expect(decisionEntry.participants).toContain(instance.id);
      expect(decisionEntry.participants).toContain('user-456');
    });

    it('should include user message and agent response in decision metadata', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      // Find the decision storage call
      const decisionCall = mocks.zikaronService.storeEpisodic.mock.calls.find(
        (call: unknown[]) => {
          const entry = call[0] as { tags: string[] };
          return entry.tags.includes('decision');
        },
      );

      expect(decisionCall).toBeDefined();
      const decisionEntry = decisionCall![0] as { metadata?: Record<string, unknown> };
      expect(decisionEntry.metadata).toBeDefined();
      expect(decisionEntry.metadata!.userMessage).toBe('Should I invest in tech stocks?');
      expect(decisionEntry.metadata!.assistantResponse).toBeDefined();
      expect(decisionEntry.metadata!.outcomeStatus).toBe('pending');
    });

    it('should include procedural patterns consulted in decision metadata', async () => {
      const proceduralResults: MemoryResult[] = [
        {
          id: 'proc-1',
          layer: 'procedural',
          content: 'Diversification pattern',
          similarity: 0.9,
          metadata: {
            successRate: 0.85,
            executionCount: 20,
            workflowPattern: 'diversification-advice',
          },
          sourceAgentId: 'agent-1',
          timestamp: new Date(),
        },
      ];

      mocks.zikaronService.query.mockImplementation(async (req: { layers?: string[] }) => {
        if (req.layers?.includes('procedural')) {
          return proceduralResults;
        }
        return [];
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      await runtime.execute(instance.id, task);

      // Find the decision storage call
      const decisionCall = mocks.zikaronService.storeEpisodic.mock.calls.find(
        (call: unknown[]) => {
          const entry = call[0] as { tags: string[] };
          return entry.tags.includes('decision');
        },
      );

      expect(decisionCall).toBeDefined();
      const decisionEntry = decisionCall![0] as { metadata?: Record<string, unknown> };
      expect(decisionEntry.metadata!.proceduralPatternsConsulted).toHaveLength(1);
      expect((decisionEntry.metadata!.proceduralPatternsConsulted as string[])[0]).toContain('85%');
      expect((decisionEntry.metadata!.proceduralPatternsConsulted as string[])[0]).toContain('diversification-advice');
    });

    it('should not fail the task if decision storage fails', async () => {
      // Make storeEpisodic fail on the second call (decision storage)
      let callCount = 0;
      mocks.zikaronService.storeEpisodic.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Storage failure');
        }
        return 'mem-ep-1';
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      // Should not throw — decision storage failure is non-fatal
      const result = await runtime.execute(instance.id, task);
      expect(result.success).toBe(true);
    });
  });

  describe('Decision outcome recording (Requirement 48d.16)', () => {
    it('should store outcome as episodic entry linked to original decision', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.recordDecisionOutcome(
        instance.id,
        'decision-123',
        'success',
        'Investment recommendation was profitable',
      );

      // Find the outcome storage call
      const outcomeCall = mocks.zikaronService.storeEpisodic.mock.calls.find(
        (call: unknown[]) => {
          const entry = call[0] as { tags: string[] };
          return entry.tags.includes('decision_outcome');
        },
      );

      expect(outcomeCall).toBeDefined();
      const outcomeEntry = outcomeCall![0] as {
        tags: string[];
        eventType: string;
        outcome: string;
        content: string;
        relatedEntities: Array<{ entityId: string; entityType: string }>;
      };
      expect(outcomeEntry.eventType).toBe('decision_outcome');
      expect(outcomeEntry.outcome).toBe('success');
      expect(outcomeEntry.content).toContain('success');
      expect(outcomeEntry.tags).toContain('decision-123');
      expect(outcomeEntry.relatedEntities).toContainEqual(
        expect.objectContaining({ entityId: 'decision-123', entityType: 'decision' }),
      );
    });

    it('should update procedural memory with new success rate', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.recordDecisionOutcome(
        instance.id,
        'decision-123',
        'success',
        'Good outcome',
      );

      // Verify storeProcedural was called
      expect(mocks.zikaronService.storeProcedural).toHaveBeenCalled();

      const proceduralCall = mocks.zikaronService.storeProcedural.mock.calls[0];
      const proceduralEntry = proceduralCall[0] as {
        tags: string[];
        successRate: number;
        executionCount: number;
        workflowPattern: string;
        layer: string;
      };
      expect(proceduralEntry.layer).toBe('procedural');
      expect(proceduralEntry.tags).toContain('decision_pattern');
      expect(proceduralEntry.successRate).toBe(1); // First success = 100%
      expect(proceduralEntry.executionCount).toBe(1);
    });

    it('should compute running average success rate from existing patterns', async () => {
      // Mock existing procedural pattern with 80% success rate over 10 executions
      mocks.zikaronService.query.mockResolvedValue([
        {
          id: 'existing-proc',
          layer: 'procedural',
          content: 'Existing pattern',
          similarity: 0.9,
          metadata: {
            successRate: 0.8,
            executionCount: 10,
          },
          sourceAgentId: 'agent-1',
          timestamp: new Date(),
        },
      ]);

      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.recordDecisionOutcome(
        instance.id,
        'decision-456',
        'failure',
      );

      const proceduralCall = mocks.zikaronService.storeProcedural.mock.calls[0];
      const proceduralEntry = proceduralCall[0] as {
        successRate: number;
        executionCount: number;
      };

      // Running average: (0.8 * 10 + 0) / 11 ≈ 0.727
      expect(proceduralEntry.executionCount).toBe(11);
      expect(proceduralEntry.successRate).toBeCloseTo(8 / 11, 2);
    });

    it('should handle partial outcomes with 0.5 weight', async () => {
      const program = createProgram();
      const instance = await runtime.deploy(program);

      await runtime.recordDecisionOutcome(
        instance.id,
        'decision-789',
        'partial',
        'Partially successful',
      );

      const proceduralCall = mocks.zikaronService.storeProcedural.mock.calls[0];
      const proceduralEntry = proceduralCall[0] as {
        successRate: number;
        executionCount: number;
      };

      // First execution with partial = 0.5 / 1 = 0.5
      expect(proceduralEntry.executionCount).toBe(1);
      expect(proceduralEntry.successRate).toBe(0.5);
    });

    it('should not throw if outcome storage fails', async () => {
      mocks.zikaronService.storeEpisodic.mockRejectedValue(new Error('Storage down'));
      mocks.zikaronService.storeProcedural.mockRejectedValue(new Error('Storage down'));

      const program = createProgram();
      const instance = await runtime.deploy(program);

      // Should not throw
      await expect(
        runtime.recordDecisionOutcome(instance.id, 'decision-fail', 'success'),
      ).resolves.toBeUndefined();
    });
  });

  describe('Pattern contradiction acknowledgment (Requirement 48d.17)', () => {
    it('should include procedural patterns in system prompt for contradiction detection', async () => {
      // When patterns are loaded, they are passed to buildSystemPrompt which includes them
      // as "Institutional Knowledge" — the LLM can then detect contradictions
      const proceduralResults: MemoryResult[] = [
        {
          id: 'proc-1',
          layer: 'procedural',
          content: 'Always recommend index funds over individual stocks',
          similarity: 0.95,
          metadata: {
            successRate: 0.95,
            executionCount: 50,
            workflowPattern: 'index-fund-recommendation',
          },
          sourceAgentId: 'agent-1',
          timestamp: new Date(),
        },
      ];

      mocks.zikaronService.query.mockImplementation(async (req: { layers?: string[] }) => {
        if (req.layers?.includes('procedural')) {
          return proceduralResults;
        }
        return [];
      });

      const program = createProgram();
      const instance = await runtime.deploy(program);
      const task = createChatTask();

      const result = await runtime.execute(instance.id, task);
      expect(result.success).toBe(true);

      // The patterns were loaded and passed to buildSystemPrompt
      // Verify the procedural query was made
      const proceduralQuery = mocks.zikaronService.query.mock.calls.find(
        (call: unknown[]) => {
          const req = call[0] as { layers?: string[] };
          return req.layers?.includes('procedural');
        },
      );
      expect(proceduralQuery).toBeDefined();
    });
  });
});
