/**
 * Integration tests for end-to-end conversation flow.
 * Tests the full cycle: message → history load → LLM call → response store → next message includes history.
 *
 * Requirements: 48a-48g, 19.2
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
// Mock helpers
// ---------------------------------------------------------------------------

let smInstanceCounter = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function createProgram(overrides: Partial<AgentProgram> = {}): AgentProgram {
  return {
    id: 'prog-chat',
    name: 'ChatAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are a helpful assistant.',
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
      input: 'Hello, how are you?',
      userId: 'user-123',
      source: 'dashboard',
    },
    priority: 'medium',
    ...overrides,
  };
}

function createMockDeps() {
  const storedMemories: Array<{ id: string; eventType: string; tags: string[]; content: string; participants: string[] }> = [];

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
    storeEpisodic: vi.fn<AnyFn>().mockImplementation(async (entry: any) => {
      storedMemories.push({
        id: entry.id,
        eventType: entry.eventType,
        tags: entry.tags ?? [],
        content: entry.content,
        participants: entry.participants ?? [],
      });
      return entry.id ?? 'mem-ep-1';
    }),
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
    storedMemories,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('End-to-End Conversation Flow', () => {
  let runtime: DefaultAgentRuntime;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    smInstanceCounter = 0;
    mocks = createMockDeps();
    runtime = new DefaultAgentRuntime(mocks.deps);
    // Clear any API keys to use stub path (no real LLM calls)
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    runtime.stopHeartbeatChecker();
  });

  it('should store conversation exchanges in episodic memory', async () => {
    const program = createProgram({
      identityProfile: {
        name: 'ChatBot',
        role: 'Test chat agent',
        hierarchyPosition: 'Test',
        personality: { tone: 'collaborative', verbosity: 'concise', proactivity: 'reactive', formality: 'casual' },
        expertise: ['chatting'],
        domainLanguage: ['hello'],
        decisionPrinciples: ['Be helpful'],
        relationships: [],
        neverBreakCharacter: true,
        identityReinforcement: 'You are ChatBot.',
      },
    });

    const instance = await runtime.deploy(program);
    const task = createChatTask();

    const result = await runtime.execute(instance.id, task);

    expect(result.success).toBe(true);

    // Verify conversation was stored in memory
    const conversationEntries = mocks.storedMemories.filter(
      (m) => m.eventType === 'conversation',
    );
    expect(conversationEntries.length).toBeGreaterThanOrEqual(1);

    // Verify the conversation entry contains the user message
    const convEntry = conversationEntries[0];
    expect(convEntry.content).toContain('Hello, how are you?');
    expect(convEntry.tags).toContain('conversation');
  });

  it('should publish knowledge sharing events on task completion', async () => {
    const program = createProgram({
      id: 'knowledge-agent',
      name: 'Knowledge Agent',
    });

    const instance = await runtime.deploy(program);
    await runtime.execute(instance.id, createChatTask());

    // Verify knowledge sharing event was published
    const knowledgeEvents = mocks.eventBusService.publish.mock.calls.filter(
      (call: unknown[]) => {
        const event = call[0] as { type: string };
        return event.type === 'memory.knowledge_shared';
      },
    );
    expect(knowledgeEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should include agent identity in the conversation context', async () => {
    const program = createProgram({
      identityProfile: {
        name: 'IdentityBot',
        role: 'Identity-aware agent',
        hierarchyPosition: 'Test position',
        personality: { tone: 'analytical', verbosity: 'concise', proactivity: 'proactive', formality: 'professional' },
        expertise: ['identity'],
        domainLanguage: ['persona'],
        decisionPrinciples: ['Stay in character'],
        relationships: [],
        neverBreakCharacter: true,
        identityReinforcement: 'You are IdentityBot.',
      },
    });

    const instance = await runtime.deploy(program);
    const result = await runtime.execute(instance.id, createChatTask());

    expect(result.success).toBe(true);
    // The stub response should reference the identity
    const output = result.output as { response?: string };
    expect(output.response).toBeDefined();
  });

  it('should store conversation with correct participants', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);
    const task = createChatTask({
      params: { input: 'Test message', userId: 'user-456', source: 'api' },
    });

    await runtime.execute(instance.id, task);

    // Find the conversation entry
    const conversationEntries = mocks.storedMemories.filter(
      (m) => m.eventType === 'conversation',
    );
    expect(conversationEntries.length).toBeGreaterThanOrEqual(1);

    const convEntry = conversationEntries[0];
    expect(convEntry.participants).toContain(instance.id);
    expect(convEntry.participants).toContain('user-456');
  });

  it('should query Zikaron for conversation history before responding', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);
    const task = createChatTask();

    await runtime.execute(instance.id, task);

    // Verify Zikaron was queried for episodic conversation history
    const episodicQueries = mocks.zikaronService.query.mock.calls.filter(
      (call: unknown[]) => {
        const req = call[0] as { layers?: string[] };
        return req.layers?.includes('episodic');
      },
    );
    expect(episodicQueries.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle multiple sequential messages maintaining context', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);

    // First message
    const result1 = await runtime.execute(instance.id, createChatTask({
      id: 'chat-1',
      params: { input: 'First message', userId: 'user-123', source: 'dashboard' },
    }));
    expect(result1.success).toBe(true);

    // Second message
    const result2 = await runtime.execute(instance.id, createChatTask({
      id: 'chat-2',
      params: { input: 'Second message', userId: 'user-123', source: 'dashboard' },
    }));
    expect(result2.success).toBe(true);

    // Both conversations should be stored
    const conversationEntries = mocks.storedMemories.filter(
      (m) => m.eventType === 'conversation',
    );
    expect(conversationEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('should publish task completion events via event bus', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);

    await runtime.execute(instance.id, createChatTask());

    // Verify task completion event was published
    const completionEvents = mocks.eventBusService.publish.mock.calls.filter(
      (call: unknown[]) => {
        const event = call[0] as { type: string };
        return event.type === 'agent.task.completed';
      },
    );
    expect(completionEvents.length).toBeGreaterThanOrEqual(1);

    const completionEvent = completionEvents[0][0] as { detail: { agentId: string; taskId: string; success: boolean } };
    expect(completionEvent.detail.agentId).toBe(instance.id);
    expect(completionEvent.detail.success).toBe(true);
  });

  it('should persist working memory state after task execution', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);

    await runtime.execute(instance.id, createChatTask());

    // Verify storeWorking was called for working memory persistence
    expect(mocks.zikaronService.storeWorking).toHaveBeenCalled();
  });

  it('should not fail when conversation storage encounters an error', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);

    // Make storeEpisodic fail for conversation entries
    mocks.zikaronService.storeEpisodic.mockImplementation(async (entry: { eventType: string }) => {
      if (entry.eventType === 'conversation') {
        throw new Error('Database connection lost');
      }
      return 'mem-ep-1';
    });

    const result = await runtime.execute(instance.id, createChatTask());

    // Chat task should still succeed despite storage failure
    expect(result.success).toBe(true);
  });

  it('should tag conversation entries with source information', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);
    const task = createChatTask({
      params: { input: 'Hello', userId: 'user-123', source: 'mobile-app' },
    });

    await runtime.execute(instance.id, task);

    const conversationEntries = mocks.storedMemories.filter(
      (m) => m.eventType === 'conversation',
    );
    expect(conversationEntries.length).toBeGreaterThanOrEqual(1);
    expect(conversationEntries[0].tags).toContain('mobile-app');
  });

  it('should record audit trail for task execution', async () => {
    const program = createProgram();
    const instance = await runtime.deploy(program);

    await runtime.execute(instance.id, createChatTask());

    // Verify audit was recorded
    const auditCalls = mocks.xoAuditService.recordAction.mock.calls.filter(
      (call: unknown[]) => {
        const record = call[0] as { actionType: string; outcome: string };
        return record.actionType === 'task_execute' && record.outcome === 'success';
      },
    );
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });
});
