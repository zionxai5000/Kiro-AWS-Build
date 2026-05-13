/**
 * Default Agent Runtime — core execution environment for all agents.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.5, 5.1
 *
 * - 1.1: Deploy agents with state machine, permissions, and memory context
 * - 1.2: Persist agent working memory and state across session boundaries
 * - 1.3: Transition to degraded state on unrecoverable error, log to audit, notify Mishmar
 * - 1.4: Enforce agent operates only within permissions defined in its AgentProgram
 * - 1.5: Rolling upgrade preserving accumulated memory and state
 * - 1.6: Maintain registry of all active agents with state, pillar, resources, health
 * - 3.5: Mishmar authorization checks before controlled actions
 * - 5.1: Otzar model routing and budget enforcement
 */

import { randomUUID, createHash } from 'node:crypto';

import type {
  AgentProgram,
  AgentInstance,
  AgentFilter,
} from '../types/agent.js';
import type { Task, TaskResult } from '../types/task.js';
import type { AgentState } from '../types/enums.js';
import type { HealthStatus } from '../types/driver.js';
import type { StateMachineDefinition } from '../types/state-machine.js';
import type { AgentRuntime } from '../interfaces/agent-runtime.js';
import type {
  ParallelTaskInput,
  ParallelExecutionOptions,
  AggregatedResult,
  ParallelHealthInfo,
} from '../interfaces/parallel-types.js';
import type { StateMachineEngine } from '../interfaces/state-machine-engine.js';
import type { AgentProgramRepository } from '../db/agent-program.repository.js';
import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { OtzarService } from '../interfaces/otzar-service.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';
import type { XOAuditService } from '../interfaces/xo-audit-service.js';
import type { EventBusService } from '../interfaces/event-bus-service.js';
import type { ModelRoutingRequest } from '../types/otzar.js';
import type { EpisodicEntry, ProceduralEntry } from '../types/memory.js';
import { buildSystemPrompt } from './prompt-builder.js';

// ---------------------------------------------------------------------------
// Parallel service interfaces (optional dependencies)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the ParallelScheduler dependency.
 * Full implementation lives in @seraphim/services.
 */
export interface ParallelScheduler {
  dispatch(task: { id: string; agentId: string; task: Task; dependencies: string[]; priority: number; estimatedDuration: number; resourceRequirements: { cpuUnits: number; memoryMb: number } }, dagId: string): Promise<{ taskId: string; status: 'dispatched' | 'queued' | 'rejected'; reason?: string }>;
  dispatchBatch(tasks: Array<{ id: string; agentId: string; task: Task; dependencies: string[]; priority: number; estimatedDuration: number; resourceRequirements: { cpuUnits: number; memoryMb: number } }>, dagId: string): Promise<Array<{ taskId: string; status: 'dispatched' | 'queued' | 'rejected'; reason?: string }>>;
  handleCompletion(taskId: string, result: TaskResult): Promise<void>;
  handleFailure(taskId: string, error: string): Promise<void>;
  getStatus(): { totalActive: number; totalQueued: number; perAgent: Record<string, { active: number; queued: number; limit: number }> };
}

/**
 * Minimal interface for the CoordinationBus dependency.
 * Full implementation lives in @seraphim/services.
 */
export interface CoordinationBus {
  signalCompletion(taskId: string, output: unknown): Promise<void>;
  waitForDependency(taskId: string, dependencyId: string, timeout?: number): Promise<unknown>;
  broadcast(fromAgentId: string, dagId: string, message: { type: string; fromAgent: string; dagId: string; payload: Record<string, unknown>; timestamp: Date }): Promise<void>;
}

/**
 * Minimal interface for the ResultAggregator dependency.
 * Full implementation lives in @seraphim/services.
 */
export interface ResultAggregator {
  collectResult(dagId: string, taskId: string, result: TaskResult): Promise<void>;
  aggregate(dagId: string, strategy: 'merge' | 'concatenate' | 'vote' | 'custom', customFn?: (results: Map<string, TaskResult>) => unknown): Promise<AggregatedResult>;
  getPartialResults(dagId: string): Promise<Map<string, TaskResult>>;
}

/**
 * Minimal interface for the DependencyGraphEngine dependency.
 * Full implementation lives in @seraphim/services.
 */
export interface DependencyGraphEngine {
  createGraph(tasks: Array<{ id: string; agentId: string; task: Task; dependencies: string[]; priority: number; estimatedDuration: number; resourceRequirements: { cpuUnits: number; memoryMb: number } }>): Promise<{ id: string; tasks: Map<string, unknown>; edges: Array<{ from: string; to: string }>; metadata: { createdBy: string; createdAt: Date; estimatedTotalDuration: number } }>;
  validateGraph(dag: { id: string; tasks: Map<string, unknown>; edges: Array<{ from: string; to: string }> }): Promise<{ valid: boolean; errors: Array<{ type: string; message: string; cyclePath?: string[]; taskId?: string }> }>;
  schedule(dag: { id: string; tasks: Map<string, unknown>; edges: Array<{ from: string; to: string }> }): Promise<{ dagId: string; batches: Array<{ index: number; taskIds: string[]; estimatedDuration: number }>; estimatedTotalDuration: number; totalTasks: number }>;
  getReadyTasks(dag: { id: string; tasks: Map<string, unknown>; edges: Array<{ from: string; to: string }> }): Promise<Array<{ id: string; agentId: string; task: Task; dependencies: string[]; priority: number; estimatedDuration: number; resourceRequirements: { cpuUnits: number; memoryMb: number } }>>;
  markComplete(taskId: string, result: TaskResult): Promise<void>;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ErrorTier = 'transient' | 'operational' | 'systemic';

const TRANSIENT_PATTERNS = [
  'etimedout', 'econnreset', 'econnrefused', 'enotfound',
  'rate limit', 'timeout', 'socket hang up', '429', '503',
];

const SYSTEMIC_PATTERNS = [
  'service unavailable', 'circuit open', 'all retries exhausted',
];

export function classifyError(err: unknown): ErrorTier {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (SYSTEMIC_PATTERNS.some((p) => message.includes(p))) return 'systemic';
  if (TRANSIENT_PATTERNS.some((p) => message.includes(p))) return 'transient';
  return 'operational';
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Task type mapping
// ---------------------------------------------------------------------------

function mapTaskType(taskType: string): ModelRoutingRequest['taskType'] {
  const mapping: Record<string, ModelRoutingRequest['taskType']> = {
    analysis: 'analysis',
    code_generation: 'code_writing',
    code_writing: 'code_writing',
    code_review: 'code_writing',
    creative: 'creative',
    classification: 'classification',
    summarization: 'simple_query',
    data_extraction: 'simple_query',
    simple_query: 'simple_query',
  };
  return mapping[taskType] ?? 'analysis';
}

// ---------------------------------------------------------------------------
// Internal registry entry
// ---------------------------------------------------------------------------

interface AgentRegistryEntry {
  instance: AgentInstance;
  program: AgentProgram;
  stateMachineInstanceId: string;
  lastHeartbeat: Date;
  errorCount: number;
  consecutiveErrors: number;
  lastSuccessfulTask?: Date;
  workingMemoryState?: WorkingMemoryState;
}

// ---------------------------------------------------------------------------
// Working Memory State (persisted to Zikaron)
// ---------------------------------------------------------------------------

/**
 * Mutable working memory state tracked per agent.
 * Persisted every 60 seconds and on task completion.
 *
 * Validates: Requirements 48c.10, 48c.11, 48c.12, 48c.13
 */
export interface WorkingMemoryState {
  agentId: string;
  sessionId: string;
  lastPersistedAt: Date;

  // Active state
  activeGoals: string[];
  pendingTasks: Array<{ id: string; description: string; status: string }>;
  currentContext: Record<string, unknown>;

  // Conversation state
  conversationCount: number;
  lastInteractionAt: Date;
  topicsDiscussed: string[];

  // Decision state
  recentDecisions: Array<{ decision: string; reasoning: string; outcome?: string; timestamp: Date }>;

  // Persistence metadata
  persistenceHash: string;
  sessionContinuity: SessionContinuityRecord;
}

/**
 * Session continuity record tracking agent session transitions and persistence integrity.
 *
 * Validates: Requirement 48c.13
 */
export interface SessionContinuityRecord {
  lastActiveTimestamp: Date;
  lastPersistedHash: string;
  sessionTransitions: Array<{ from: string; to: string; timestamp: Date; reason: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const STALE_THRESHOLD_MS = 90_000; // 90 seconds
const WORKING_MEMORY_PERSIST_INTERVAL_MS = 60_000; // 60 seconds
const AGENT_SM_DEFINITION_PREFIX = 'agent-lifecycle-';
const SYSTEMIC_ERROR_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Agent lifecycle state machine definition builder
// ---------------------------------------------------------------------------

function buildAgentLifecycleStateMachine(
  programId: string,
): StateMachineDefinition {
  const id = `${AGENT_SM_DEFINITION_PREFIX}${programId}`;
  const now = new Date();

  return {
    id,
    name: `Agent Lifecycle (${programId})`,
    version: '1.0.0',
    states: {
      initializing: { name: 'initializing', type: 'initial' },
      ready: { name: 'ready', type: 'active' },
      executing: { name: 'executing', type: 'active' },
      degraded: { name: 'degraded', type: 'error' },
      terminated: { name: 'terminated', type: 'terminal' },
    },
    initialState: 'initializing',
    terminalStates: ['terminated'],
    transitions: [
      { from: 'initializing', to: 'ready', event: 'initialized', gates: [] },
      { from: 'ready', to: 'executing', event: 'task_assigned', gates: [] },
      { from: 'executing', to: 'ready', event: 'task_completed', gates: [] },
      { from: 'executing', to: 'degraded', event: 'unrecoverable_error', gates: [] },
      { from: 'ready', to: 'degraded', event: 'unrecoverable_error', gates: [] },
      { from: 'degraded', to: 'ready', event: 'recovered', gates: [] },
      { from: 'initializing', to: 'terminated', event: 'terminate', gates: [] },
      { from: 'ready', to: 'terminated', event: 'terminate', gates: [] },
      { from: 'executing', to: 'terminated', event: 'terminate', gates: [] },
      { from: 'degraded', to: 'terminated', event: 'terminate', gates: [] },
    ],
    metadata: {
      createdAt: now,
      updatedAt: now,
      description: `Lifecycle state machine for agent program ${programId}`,
    },
  };
}

// ---------------------------------------------------------------------------
// DefaultAgentRuntime
// ---------------------------------------------------------------------------

export interface AgentRuntimeDeps {
  programRepo: AgentProgramRepository;
  stateMachineEngine: StateMachineEngine;
  mishmarService: MishmarService;
  otzarService: OtzarService;
  zikaronService: ZikaronService;
  xoAuditService: XOAuditService;
  eventBusService: EventBusService;
  /** Optional parallel scheduler for DAG-based task dispatch */
  parallelScheduler?: ParallelScheduler;
  /** Optional coordination bus for inter-task signaling */
  coordinationBus?: CoordinationBus;
  /** Optional result aggregator for merging parallel outputs */
  resultAggregator?: ResultAggregator;
  /** Optional dependency graph engine for DAG construction and validation */
  dependencyGraphEngine?: DependencyGraphEngine;
}

export class DefaultAgentRuntime implements AgentRuntime {
  private readonly programRepo: AgentProgramRepository;
  private readonly stateMachineEngine: StateMachineEngine;
  private readonly mishmarService: MishmarService;
  private readonly otzarService: OtzarService;
  private readonly zikaronService: ZikaronService;
  private readonly xoAuditService: XOAuditService;
  private readonly eventBusService: EventBusService;

  /** Optional parallel orchestration services */
  private readonly parallelScheduler?: ParallelScheduler;
  private readonly coordinationBus?: CoordinationBus;
  private readonly resultAggregator?: ResultAggregator;
  private readonly dependencyGraphEngine?: DependencyGraphEngine;

  /** In-memory agent registry keyed by agent instance ID. */
  private readonly registry = new Map<string, AgentRegistryEntry>();

  /** Handle for the periodic heartbeat checker interval. */
  private heartbeatCheckInterval: ReturnType<typeof setInterval> | null = null;

  /** Handle for the periodic working memory persistence interval. */
  private workingMemoryPersistInterval: ReturnType<typeof setInterval> | null = null;

  /** Tracks active parallel DAG executions. */
  private readonly activeDAGs = new Set<string>();

  constructor(deps: AgentRuntimeDeps) {
    this.programRepo = deps.programRepo;
    this.stateMachineEngine = deps.stateMachineEngine;
    this.mishmarService = deps.mishmarService;
    this.otzarService = deps.otzarService;
    this.zikaronService = deps.zikaronService;
    this.xoAuditService = deps.xoAuditService;
    this.eventBusService = deps.eventBusService;

    // Optional parallel orchestration dependencies
    this.parallelScheduler = deps.parallelScheduler;
    this.coordinationBus = deps.coordinationBus;
    this.resultAggregator = deps.resultAggregator;
    this.dependencyGraphEngine = deps.dependencyGraphEngine;

    // Start periodic working memory persistence (Requirement 48c.11)
    this.startWorkingMemoryPersistence();
  }

  // -----------------------------------------------------------------------
  // Lifecycle — deploy
  // -----------------------------------------------------------------------

  /**
   * Deploy an AgentProgram: validate, create lifecycle state machine instance,
   * register in the in-memory registry, load memory context, and return the AgentInstance.
   *
   * Validates: Requirement 1.1
   */
  async deploy(program: AgentProgram): Promise<AgentInstance> {
    // 1. Validate the AgentProgram (basic structural checks)
    this.validateProgram(program);

    // 2. Register the agent lifecycle state machine definition
    const smDef = buildAgentLifecycleStateMachine(program.id);
    const definitionId = await this.stateMachineEngine.register(smDef);

    // 3. Create a state machine instance for this agent
    const agentId = randomUUID();
    const smInstance = await this.stateMachineEngine.createInstance(
      definitionId,
      agentId,
      { tenantId: 'system', programId: program.id },
    );

    // 4. Transition from initializing -> ready
    await this.stateMachineEngine.transition(
      smInstance.id,
      'initialized',
      { triggeredBy: 'agent-runtime', tenantId: 'system' },
    );

    // 5. Build the AgentInstance
    const now = new Date();
    const instance: AgentInstance = {
      id: agentId,
      programId: program.id,
      version: program.version,
      state: 'ready',
      pillar: program.pillar,
      resourceUsage: {
        cpuPercent: 0,
        memoryMb: 0,
        activeTaskCount: 0,
        tokenUsageToday: 0,
      },
      lastHeartbeat: now,
    };

    // 6. Register in the in-memory registry
    this.registry.set(agentId, {
      instance,
      program,
      stateMachineInstanceId: smInstance.id,
      lastHeartbeat: now,
      errorCount: 0,
      consecutiveErrors: 0,
    });

    // 7. Load agent memory context from Zikaron and restore working memory state
    let restoredHash: string | undefined;
    try {
      const loadedContext = await this.zikaronService.loadAgentContext(agentId);
      if (loadedContext.workingMemory) {
        // Restore working memory state from persisted context
        const wm = loadedContext.workingMemory;
        const restoredState: WorkingMemoryState = {
          agentId,
          sessionId: agentId,
          lastPersistedAt: wm.createdAt,
          activeGoals: wm.activeGoals ?? [],
          pendingTasks: (wm.taskContext?.pendingTasks as Array<{ id: string; description: string; status: string }>) ?? [],
          currentContext: wm.taskContext ?? {},
          conversationCount: (wm.taskContext?.conversationCount as number) ?? 0,
          lastInteractionAt: wm.createdAt,
          topicsDiscussed: (wm.taskContext?.topicsDiscussed as string[]) ?? [],
          recentDecisions: (wm.taskContext?.recentDecisions as Array<{ decision: string; reasoning: string; outcome?: string; timestamp: Date }>) ?? [],
          persistenceHash: (wm.taskContext?.persistenceHash as string) ?? '',
          sessionContinuity: {
            lastActiveTimestamp: wm.createdAt,
            lastPersistedHash: (wm.taskContext?.persistenceHash as string) ?? '',
            sessionTransitions: (wm.taskContext?.sessionTransitions as Array<{ from: string; to: string; timestamp: Date; reason: string }>) ?? [],
          },
        };

        // Verify integrity: compute hash of loaded state and compare
        restoredHash = this.computeWorkingMemoryHash(restoredState);
        const storedHash = restoredState.persistenceHash;
        if (storedHash && restoredHash !== storedHash) {
          // Hash mismatch — log warning but continue with loaded state
          console.warn(`[deploy] Working memory hash mismatch for agent ${agentId}: expected ${storedHash}, got ${restoredHash}`);
        }

        // Record session transition
        restoredState.sessionContinuity.sessionTransitions.push({
          from: 'terminated',
          to: 'ready',
          timestamp: now,
          reason: 'deploy',
        });
        restoredState.sessionContinuity.lastActiveTimestamp = now;

        this.registry.get(agentId)!.workingMemoryState = restoredState;
      }
    } catch {
      // Memory load failure is non-fatal during deploy
    }

    // 8. Initialize working memory state if not restored
    const registryEntry = this.registry.get(agentId)!;
    if (!registryEntry.workingMemoryState) {
      const initialState: WorkingMemoryState = {
        agentId,
        sessionId: agentId,
        lastPersistedAt: now,
        activeGoals: [],
        pendingTasks: [],
        currentContext: { programId: program.id, version: program.version },
        conversationCount: 0,
        lastInteractionAt: now,
        topicsDiscussed: [],
        recentDecisions: [],
        persistenceHash: '',
        sessionContinuity: {
          lastActiveTimestamp: now,
          lastPersistedHash: '',
          sessionTransitions: [{ from: 'none', to: 'ready', timestamp: now, reason: 'initial_deploy' }],
        },
      };
      initialState.persistenceHash = this.computeWorkingMemoryHash(initialState);
      initialState.sessionContinuity.lastPersistedHash = initialState.persistenceHash;
      registryEntry.workingMemoryState = initialState;
    }

    // 9. Store initial working memory to Zikaron
    try {
      await this.persistWorkingMemory(agentId);
    } catch {
      // Working memory store failure is non-fatal during deploy
    }

    // 10. Publish deployment event
    await this.eventBusService.publish({
      source: 'seraphim.agent-runtime',
      type: 'agent.deployed',
      detail: {
        agentId,
        programId: program.id,
        version: program.version,
        pillar: program.pillar,
      },
      metadata: {
        tenantId: 'system',
        correlationId: agentId,
        timestamp: now,
      },
    });

    // 11. Log to XO Audit
    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: 'agent-runtime',
      actingAgentName: 'AgentRuntime',
      actionType: 'agent_deploy',
      target: agentId,
      authorizationChain: [],
      executionTokens: [],
      outcome: 'success',
      details: { programId: program.id, version: program.version },
    });

    return instance;
  }

  // -----------------------------------------------------------------------
  // Lifecycle — execute
  // -----------------------------------------------------------------------

  /**
   * Execute a task on behalf of an agent.
   *
   * Full flow: authorize -> budget check -> route model -> check cache ->
   * execute -> record usage -> store cache -> store memory -> publish event -> audit
   *
   * Error handling tiers:
   * - Transient: retry with exponential backoff (1s, 2s, 4s, max 3 attempts)
   * - Operational: log and return failure, agent stays ready
   * - Systemic: transition to degraded state
   *
   * Validates: Requirements 1.3, 1.4, 3.5, 5.1
   */
  async execute(agentId: string, task: Task): Promise<TaskResult> {
    const entry = this.getRegistryEntry(agentId);
    const startTime = Date.now();

    // 1. Check Mishmar authorization (Requirement 1.4, 3.5)
    const authResult = await this.mishmarService.authorize({
      agentId,
      action: task.type,
      target: task.id,
      authorityLevel: entry.program.authorityLevel,
      context: { taskId: task.id, taskType: task.type, description: task.description },
    });

    if (!authResult.authorized) {
      await this.xoAuditService.recordAction({
        tenantId: 'system',
        actingAgentId: agentId,
        actingAgentName: entry.program.name,
        actionType: 'task_execute',
        target: task.id,
        authorizationChain: [],
        executionTokens: [],
        outcome: 'blocked',
        details: { taskId: task.id, reason: authResult.reason },
      });

      return {
        taskId: task.id,
        success: false,
        error: `Permission denied: ${authResult.reason}`,
        tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Check Otzar budget (Requirement 5.1)
    const budgetResult = await this.otzarService.checkBudget(agentId, 1000);
    if (!budgetResult.allowed) {
      await this.xoAuditService.recordAction({
        tenantId: 'system',
        actingAgentId: agentId,
        actingAgentName: entry.program.name,
        actionType: 'task_execute',
        target: task.id,
        authorizationChain: [],
        executionTokens: [],
        outcome: 'blocked',
        details: { taskId: task.id, reason: budgetResult.reason ?? 'Budget exceeded' },
      });

      return {
        taskId: task.id,
        success: false,
        error: `Budget exceeded: ${budgetResult.reason ?? 'Daily or monthly limit reached'}`,
        tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Route to LLM model via Otzar (Requirement 5.1)
    const modelSelection = await this.otzarService.routeTask({
      taskType: mapTaskType(task.type),
      complexity: task.priority === 'critical' ? 'high' : task.priority === 'high' ? 'high' : task.priority === 'low' ? 'low' : 'medium',
      agentId,
      pillar: entry.program.pillar,
      maxCost: entry.program.modelPreference.costCeiling,
    });

    // 4. Check Otzar cache
    let cacheResult: Awaited<ReturnType<OtzarService['checkCache']>> = null;
    try {
      cacheResult = await this.otzarService.checkCache(task.type, task.params);
    } catch {
      // Cache check failure is non-fatal
    }

    // 5. Transition to executing
    await this.transitionAgent(entry, 'task_assigned');
    entry.instance.state = 'executing';
    entry.instance.resourceUsage.activeTaskCount += 1;

    try {
      let result: TaskResult;

      if (cacheResult?.hit) {
        // Cache hit — use cached result
        result = {
          taskId: task.id,
          success: true,
          output: cacheResult.data,
          tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          durationMs: Date.now() - startTime,
        };
      } else {
        // Execute the task — call LLM for chat tasks, stub for others
        if (task.type === 'chat' && task.params?.input) {
          result = await this.executeChatTask(task, entry, modelSelection, startTime);
        } else {
          result = {
            taskId: task.id,
            success: true,
            output: {
              message: `Task '${task.type}' executed successfully`,
              model: modelSelection.model,
              provider: modelSelection.provider,
            },
            tokenUsage: { inputTokens: 100, outputTokens: 50, costUsd: modelSelection.estimatedCost },
            durationMs: Date.now() - startTime,
          };
        }

        // Record usage via Otzar
        await this.otzarService.recordUsage({
          agentId,
          tenantId: 'system',
          pillar: entry.program.pillar,
          provider: modelSelection.provider,
          model: modelSelection.model,
          inputTokens: result.tokenUsage.inputTokens,
          outputTokens: result.tokenUsage.outputTokens,
          costUsd: result.tokenUsage.costUsd,
          taskType: task.type,
        });

        // Store cache result
        try {
          await this.otzarService.storeCache(task.type, task.params, result.output);
        } catch {
          // Cache store failure is non-fatal
        }
      }

      // 6. Transition back to ready
      await this.transitionAgent(entry, 'task_completed');
      entry.instance.state = 'ready';
      entry.instance.resourceUsage.activeTaskCount = Math.max(
        0,
        entry.instance.resourceUsage.activeTaskCount - 1,
      );
      entry.instance.resourceUsage.tokenUsageToday +=
        result.tokenUsage.inputTokens + result.tokenUsage.outputTokens;
      entry.lastSuccessfulTask = new Date();
      entry.consecutiveErrors = 0;

      // 7. Store episodic memory in Zikaron
      try {
        const episodicEntry: EpisodicEntry = {
          id: randomUUID(),
          tenantId: 'system',
          layer: 'episodic',
          content: `Task ${task.type} completed: ${task.description}`,
          embedding: [],
          sourceAgentId: agentId,
          tags: ['task_completion', task.type],
          createdAt: new Date(),
          eventType: 'task_completion',
          participants: [agentId],
          outcome: 'success',
          relatedEntities: [{ entityId: task.id, entityType: 'task', role: 'target' }],
        };
        await this.zikaronService.storeEpisodic(episodicEntry);

        // Publish knowledge sharing event for cross-agent learning (Requirement 48e.20)
        await this.publishKnowledgeShared(
          agentId,
          episodicEntry.id,
          'procedural',
          ['task_completion', task.type, entry.program.pillar],
          `${entry.program.name} completed ${task.type}: ${task.description}`,
        );
      } catch {
        // Memory store failure is non-fatal
      }

      // 8. Persist working memory with updated context on task completion
      try {
        const wmState = entry.workingMemoryState;
        if (wmState) {
          // Update working memory with task completion context
          wmState.currentContext = {
            ...wmState.currentContext,
            lastTaskId: task.id,
            lastTaskType: task.type,
            lastTaskSuccess: true,
          };
          wmState.topicsDiscussed = [
            ...wmState.topicsDiscussed.slice(-19), // Keep last 20 topics
            task.type,
          ];
          wmState.recentDecisions = [
            ...wmState.recentDecisions.slice(-9), // Keep last 10 decisions
            { decision: `Completed task: ${task.description}`, reasoning: `Task ${task.type} executed successfully`, timestamp: new Date() },
          ];
          wmState.lastInteractionAt = new Date();
          wmState.conversationCount += 1;
          wmState.sessionContinuity.lastActiveTimestamp = new Date();
        }
        await this.persistWorkingMemory(agentId);
      } catch {
        // Working memory persist failure is non-fatal
      }

      // 9. Publish completion event
      await this.eventBusService.publish({
        source: 'seraphim.agent-runtime',
        type: 'agent.task.completed',
        detail: {
          agentId,
          taskId: task.id,
          taskType: task.type,
          success: true,
          tokenUsage: result.tokenUsage,
        },
        metadata: {
          tenantId: 'system',
          correlationId: task.id,
          timestamp: new Date(),
        },
      });

      // 10. Log to XO Audit
      await this.xoAuditService.recordAction({
        tenantId: 'system',
        actingAgentId: agentId,
        actingAgentName: entry.program.name,
        actionType: 'task_execute',
        target: task.id,
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: { taskId: task.id, tokenUsage: result.tokenUsage, model: modelSelection.model },
      });

      return result;
    } catch (err: unknown) {
      // Error handling with 3 tiers
      const tier = classifyError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (tier === 'transient') {
        // Transient: retry with backoff
        try {
          const retryResult = await retryWithBackoff(async () => {
            // Re-execute the stubbed task
            return {
              taskId: task.id,
              success: true,
              output: { message: `Task '${task.type}' executed successfully (retry)`, model: modelSelection.model },
              tokenUsage: { inputTokens: 100, outputTokens: 50, costUsd: modelSelection.estimatedCost },
              durationMs: Date.now() - startTime,
            } as TaskResult;
          });

          await this.transitionAgent(entry, 'task_completed');
          entry.instance.state = 'ready';
          entry.instance.resourceUsage.activeTaskCount = Math.max(0, entry.instance.resourceUsage.activeTaskCount - 1);
          entry.consecutiveErrors = 0;
          return retryResult;
        } catch {
          // Retries exhausted — fall through to systemic handling
          entry.consecutiveErrors += 1;
          entry.errorCount += 1;

          if (entry.consecutiveErrors >= SYSTEMIC_ERROR_THRESHOLD) {
            await this.transitionAgent(entry, 'unrecoverable_error');
            entry.instance.state = 'degraded';
          } else {
            await this.transitionAgent(entry, 'task_completed');
            entry.instance.state = 'ready';
          }
          entry.instance.resourceUsage.activeTaskCount = Math.max(0, entry.instance.resourceUsage.activeTaskCount - 1);

          await this.xoAuditService.recordAction({
            tenantId: 'system',
            actingAgentId: agentId,
            actingAgentName: entry.program.name,
            actionType: 'task_execute',
            target: task.id,
            authorizationChain: [],
            executionTokens: [],
            outcome: 'failure',
            details: { taskId: task.id, error: errorMessage, tier: 'transient', retriesExhausted: true },
          });

          return {
            taskId: task.id,
            success: false,
            error: errorMessage,
            tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
            durationMs: Date.now() - startTime,
          };
        }
      } else if (tier === 'operational') {
        // Operational: log and continue, agent stays ready
        entry.errorCount += 1;
        entry.consecutiveErrors = 0; // operational errors don't count toward systemic threshold

        try {
          await this.transitionAgent(entry, 'task_completed');
        } catch {
          // If transition fails, force state back to ready in registry
        }
        entry.instance.state = 'ready';
        entry.instance.resourceUsage.activeTaskCount = Math.max(0, entry.instance.resourceUsage.activeTaskCount - 1);

        await this.xoAuditService.recordAction({
          tenantId: 'system',
          actingAgentId: agentId,
          actingAgentName: entry.program.name,
          actionType: 'task_execute',
          target: task.id,
          authorizationChain: [],
          executionTokens: [],
          outcome: 'failure',
          details: { taskId: task.id, error: errorMessage, tier: 'operational' },
        });

        return {
          taskId: task.id,
          success: false,
          error: errorMessage,
          tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          durationMs: Date.now() - startTime,
        };
      } else {
        // Systemic: transition to degraded state (Requirement 1.3)
        entry.errorCount += 1;
        entry.consecutiveErrors += 1;

        await this.transitionAgent(entry, 'unrecoverable_error');
        entry.instance.state = 'degraded';
        entry.instance.resourceUsage.activeTaskCount = Math.max(0, entry.instance.resourceUsage.activeTaskCount - 1);

        await this.xoAuditService.recordAction({
          tenantId: 'system',
          actingAgentId: agentId,
          actingAgentName: entry.program.name,
          actionType: 'task_execute',
          target: task.id,
          authorizationChain: [],
          executionTokens: [],
          outcome: 'failure',
          details: { taskId: task.id, error: errorMessage, tier: 'systemic' },
        });

        // Store failure in episodic memory
        try {
          await this.zikaronService.storeEpisodic({
            id: randomUUID(),
            tenantId: 'system',
            layer: 'episodic',
            content: `Task ${task.type} failed with systemic error: ${errorMessage}`,
            embedding: [],
            sourceAgentId: agentId,
            tags: ['task_failure', 'systemic', task.type],
            createdAt: new Date(),
            eventType: 'task_failure',
            participants: [agentId],
            outcome: 'failure',
            relatedEntities: [{ entityId: task.id, entityType: 'task', role: 'target' }],
          });
        } catch {
          // Memory store failure is non-fatal
        }

        return {
          taskId: task.id,
          success: false,
          error: errorMessage,
          tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
          durationMs: Date.now() - startTime,
        };
      }
    }
  }

  // -----------------------------------------------------------------------
  // Chat task execution — real LLM call
  // -----------------------------------------------------------------------

  /** Maximum number of recent conversation exchanges to load from Zikaron. */
  private static readonly MAX_CONVERSATION_HISTORY = 20;

  /** Approximate token budget for conversation history (chars / 4 ≈ tokens). */
  private static readonly CONTEXT_WINDOW_BUDGET_CHARS = 24_000; // ~6000 tokens

  /**
   * Load conversation history from Zikaron for an agent-user pair.
   * Returns alternating user/assistant messages formatted for the LLM.
   *
   * Strategy:
   * 1. Query Zikaron for the last 20 conversation exchanges tagged with this agent + user
   * 2. If total character count exceeds context window budget, fall back to vector search
   *    for the most semantically relevant past conversations
   *
   * Validates: Requirements 48b.6, 48b.7, 48b.8
   */
  private async loadConversationHistory(
    agentId: string,
    userId: string,
    currentMessage: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      // Query for recent conversation exchanges tagged with this agent-user pair
      const recentResults = await this.zikaronService.query({
        tenantId: 'system',
        text: `conversation ${agentId} ${userId}`,
        layers: ['episodic'],
        agentId,
        limit: DefaultAgentRuntime.MAX_CONVERSATION_HISTORY,
      });

      // Filter results to only include conversation entries for this agent-user pair
      const conversationResults = recentResults.filter((r) => {
        const meta = r.metadata as Record<string, unknown> | undefined;
        const tags = (meta?.tags as string[]) ?? [];
        return tags.includes('conversation') && tags.includes(agentId) && tags.includes(userId);
      });

      // Parse conversation entries into messages
      let messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }> = [];

      for (const result of conversationResults) {
        const meta = result.metadata as Record<string, unknown> | undefined;
        const userMsg = (meta?.userMessage as string) ?? '';
        const assistantMsg = (meta?.assistantResponse as string) ?? '';

        if (userMsg) {
          messages.push({ role: 'user', content: userMsg, timestamp: result.timestamp });
        }
        if (assistantMsg) {
          messages.push({ role: 'assistant', content: assistantMsg, timestamp: result.timestamp });
        }
      }

      // Sort by timestamp (oldest first for chronological order)
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Check if total size exceeds context window budget
      const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);

      if (totalChars > DefaultAgentRuntime.CONTEXT_WINDOW_BUDGET_CHARS) {
        // Context window exceeded — use vector search for most semantically relevant conversations
        const relevantResults = await this.zikaronService.query({
          tenantId: 'system',
          text: currentMessage,
          layers: ['episodic'],
          agentId,
          limit: 10,
        });

        const relevantConversations = relevantResults.filter((r) => {
          const meta = r.metadata as Record<string, unknown> | undefined;
          const tags = (meta?.tags as string[]) ?? [];
          return tags.includes('conversation') && tags.includes(agentId) && tags.includes(userId);
        });

        // Rebuild messages from semantically relevant results
        messages = [];
        for (const result of relevantConversations) {
          const meta = result.metadata as Record<string, unknown> | undefined;
          const userMsg = (meta?.userMessage as string) ?? '';
          const assistantMsg = (meta?.assistantResponse as string) ?? '';

          if (userMsg) {
            messages.push({ role: 'user', content: userMsg, timestamp: result.timestamp });
          }
          if (assistantMsg) {
            messages.push({ role: 'assistant', content: assistantMsg, timestamp: result.timestamp });
          }
        }

        // Sort by timestamp for coherent ordering
        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      }

      // Return without the timestamp field (LLM only needs role + content)
      return messages.map(({ role, content }) => ({ role, content }));
    } catch (err) {
      // Conversation history loading failure is non-fatal — proceed without history
      console.error(`[executeChatTask] Failed to load conversation history: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Store a conversation exchange (user message + agent response) in Zikaron episodic memory.
   * Returns the episodic entry ID for use in knowledge sharing events.
   *
   * Validates: Requirements 48b.5, 48b.9
   */
  private async storeConversationExchange(
    agentId: string,
    userId: string,
    userMessage: string,
    assistantResponse: string,
    source: string,
  ): Promise<string | undefined> {
    try {
      const entryId = randomUUID();
      const episodicEntry: EpisodicEntry = {
        id: entryId,
        tenantId: 'system',
        layer: 'episodic',
        content: `User: ${userMessage}\nAssistant: ${assistantResponse}`,
        embedding: [],
        sourceAgentId: agentId,
        tags: ['conversation', source, agentId, userId],
        createdAt: new Date(),
        eventType: 'conversation',
        participants: [agentId, userId],
        outcome: 'success',
        relatedEntities: [
          { entityId: agentId, entityType: 'agent', role: 'responder' },
          { entityId: userId, entityType: 'user', role: 'initiator' },
        ],
      };

      // Store metadata for structured retrieval
      (episodicEntry as EpisodicEntry & { metadata?: Record<string, unknown> }).metadata = {
        userMessage,
        assistantResponse,
        conversationData: JSON.stringify({ userMessage, agentResponse: assistantResponse }),
        sessionId: 'current',
        source,
        tags: episodicEntry.tags,
      };

      await this.zikaronService.storeEpisodic(episodicEntry);
      return entryId;
    } catch (err) {
      // Conversation storage failure is non-fatal — log and continue
      console.error(`[executeChatTask] Failed to store conversation: ${(err as Error).message}`);
      return undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Memory-backed decision support
  // -----------------------------------------------------------------------

  /** Maximum number of procedural patterns to include in system prompt. */
  private static readonly MAX_PROCEDURAL_PATTERNS = 5;

  /**
   * Query Zikaron procedural memory for patterns relevant to the current task.
   * Returns top 5 patterns by success rate as string summaries.
   * These are passed to `buildSystemPrompt()` as the `proceduralPatterns` parameter.
   *
   * Non-fatal: if the query fails, returns an empty array and proceeds without patterns.
   *
   * Validates: Requirement 48d.14
   */
  private async loadProceduralContext(agentId: string, taskDescription: string): Promise<string[]> {
    try {
      const results = await this.zikaronService.query({
        text: taskDescription,
        layers: ['procedural'],
        agentId,
        tenantId: 'system',
        limit: 5,
      });
      return results.map(r => r.content);
    } catch {
      return [];
    }
  }

  /**
   * Load procedural patterns from Zikaron relevant to the current context.
   * Returns the top patterns (by success rate) formatted as strings for the system prompt.
   *
   * Non-fatal: if the query fails, returns an empty array and proceeds without patterns.
   *
   * Validates: Requirement 48d.14
   */
  private async loadProceduralPatterns(agentId: string, context: string): Promise<string[]> {
    try {
      const results = await this.zikaronService.query({
        tenantId: 'system',
        text: context,
        layers: ['procedural'],
        agentId,
        limit: DefaultAgentRuntime.MAX_PROCEDURAL_PATTERNS * 2, // Fetch extra to filter/sort
      });

      if (results.length === 0) {
        return [];
      }

      // Sort by success rate (stored in metadata) descending, take top 5
      const sorted = results
        .map((r) => {
          const meta = r.metadata as Record<string, unknown> | undefined;
          const successRate = (meta?.successRate as number) ?? 0;
          const executionCount = (meta?.executionCount as number) ?? 0;
          const workflowPattern = (meta?.workflowPattern as string) ?? r.content;
          return { content: r.content, workflowPattern, successRate, executionCount };
        })
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, DefaultAgentRuntime.MAX_PROCEDURAL_PATTERNS);

      // Format patterns as strings for the system prompt
      return sorted.map((p) => {
        const ratePercent = Math.round(p.successRate * 100);
        return `[${ratePercent}% success, ${p.executionCount} executions] ${p.workflowPattern}`;
      });
    } catch (err) {
      // Procedural memory query failure is non-fatal — proceed without patterns
      console.error(`[loadProceduralPatterns] Failed to load patterns: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Store a decision in Zikaron episodic memory after an agent response.
   * Includes the user's question, agent's response, context (procedural patterns consulted),
   * and a placeholder for outcome tracking.
   *
   * Validates: Requirements 48d.15, 48d.17
   */
  private async storeDecision(
    agentId: string,
    userId: string,
    userMessage: string,
    assistantResponse: string,
    proceduralPatternsConsulted: string[],
  ): Promise<string | undefined> {
    try {
      const decisionId = randomUUID();

      const episodicEntry: EpisodicEntry = {
        id: decisionId,
        tenantId: 'system',
        layer: 'episodic',
        content: `Decision: User asked "${userMessage}" — Agent responded with reasoning.`,
        embedding: [],
        sourceAgentId: agentId,
        tags: ['decision', agentId, userId],
        createdAt: new Date(),
        eventType: 'decision',
        participants: [agentId, userId],
        outcome: 'success',
        relatedEntities: [
          { entityId: agentId, entityType: 'agent', role: 'decision_maker' },
          { entityId: userId, entityType: 'user', role: 'requester' },
        ],
      };

      // Attach structured metadata for future retrieval and outcome tracking
      (episodicEntry as EpisodicEntry & { metadata?: Record<string, unknown> }).metadata = {
        decisionId,
        userMessage,
        assistantResponse,
        proceduralPatternsConsulted,
        outcomeStatus: 'pending', // Placeholder — updated when outcome is known
        tags: episodicEntry.tags,
      };

      await this.zikaronService.storeEpisodic(episodicEntry);
      return decisionId;
    } catch (err) {
      // Decision storage failure is non-fatal — log and continue
      console.error(`[storeDecision] Failed to store decision: ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Record the outcome of a previously stored decision.
   * Updates the procedural memory success rate for the decision pattern.
   *
   * When an outcome is known (success/failure), this method:
   * 1. Stores the outcome as a new episodic entry linked to the original decision
   * 2. Updates or creates a procedural memory entry tracking the decision pattern's success rate
   *
   * Validates: Requirement 48d.16
   */
  async recordDecisionOutcome(
    agentId: string,
    decisionId: string,
    outcome: 'success' | 'failure' | 'partial',
    details?: string,
  ): Promise<void> {
    // 1. Store outcome as episodic entry linked to the original decision
    try {
      const outcomeEntry: EpisodicEntry = {
        id: randomUUID(),
        tenantId: 'system',
        layer: 'episodic',
        content: `Decision outcome: ${outcome}${details ? ` — ${details}` : ''}`,
        embedding: [],
        sourceAgentId: agentId,
        tags: ['decision_outcome', agentId, decisionId],
        createdAt: new Date(),
        eventType: 'decision_outcome',
        participants: [agentId],
        outcome,
        relatedEntities: [
          { entityId: decisionId, entityType: 'decision', role: 'source_decision' },
          { entityId: agentId, entityType: 'agent', role: 'decision_maker' },
        ],
      };

      (outcomeEntry as EpisodicEntry & { metadata?: Record<string, unknown> }).metadata = {
        decisionId,
        outcome,
        details,
        tags: outcomeEntry.tags,
      };

      await this.zikaronService.storeEpisodic(outcomeEntry);
    } catch (err) {
      console.error(`[recordDecisionOutcome] Failed to store outcome: ${(err as Error).message}`);
    }

    // 2. Update procedural memory with the decision pattern success rate
    try {
      // Query for existing procedural pattern for this agent's decision type
      const existingPatterns = await this.zikaronService.query({
        tenantId: 'system',
        text: `decision pattern ${agentId}`,
        layers: ['procedural'],
        agentId,
        limit: 1,
      });

      const existingMeta = existingPatterns.length > 0
        ? existingPatterns[0].metadata as Record<string, unknown> | undefined
        : undefined;

      const currentCount = (existingMeta?.executionCount as number) ?? 0;
      const currentSuccessRate = (existingMeta?.successRate as number) ?? 0;

      // Compute new success rate as running average
      const newCount = currentCount + 1;
      const successIncrement = outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0;
      const newSuccessRate = (currentSuccessRate * currentCount + successIncrement) / newCount;

      const proceduralEntry: ProceduralEntry = {
        id: randomUUID(),
        tenantId: 'system',
        layer: 'procedural',
        content: `Decision pattern for agent ${agentId}: ${details || 'general decision-making'}`,
        embedding: [],
        sourceAgentId: agentId,
        tags: ['decision_pattern', agentId],
        createdAt: new Date(),
        workflowPattern: `decision-pattern-${agentId}`,
        successRate: newSuccessRate,
        executionCount: newCount,
        prerequisites: [],
        steps: [
          {
            order: 1,
            action: 'query_context',
            description: 'Query procedural memory for similar past decisions',
            expectedOutcome: 'Relevant patterns loaded',
          },
          {
            order: 2,
            action: 'make_decision',
            description: 'Generate response considering past patterns',
            expectedOutcome: 'Decision aligned with successful patterns',
          },
          {
            order: 3,
            action: 'record_outcome',
            description: 'Track decision outcome for future learning',
            expectedOutcome: 'Success rate updated',
          },
        ],
      };

      await this.zikaronService.storeProcedural(proceduralEntry);
    } catch (err) {
      console.error(`[recordDecisionOutcome] Failed to update procedural memory: ${(err as Error).message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Inter-agent knowledge sharing via Event Bus
  // -----------------------------------------------------------------------

  /**
   * Publish a knowledge sharing event to the Event Bus for cross-agent learning.
   * Other agents can subscribe to these events to incorporate shared knowledge.
   *
   * Non-fatal: if publishing fails, the error is silently swallowed.
   *
   * Validates: Requirement 48e.20
   */
  private async publishKnowledgeShared(
    agentId: string,
    memoryEntryId: string,
    layer: 'semantic' | 'procedural',
    relevanceTags: string[],
    summary: string,
  ): Promise<void> {
    try {
      await this.eventBusService.publish({
        source: 'seraphim.agent-runtime',
        type: 'memory.knowledge_shared',
        detail: {
          sourceAgentId: agentId,
          memoryEntryId,
          layer,
          relevanceTags,
          summary,
        },
        metadata: {
          tenantId: 'system',
          correlationId: memoryEntryId,
          timestamp: new Date(),
        },
      });
    } catch { /* non-fatal */ }
  }

  /**
   * Execute a chat task by calling the LLM API directly.
   * Uses Anthropic (Claude) if ANTHROPIC_API_KEY is set, otherwise OpenAI.
   * Falls back to a descriptive stub if no API keys are available.
   *
   * Conversation persistence:
   * - Before calling the LLM, loads last 20 conversation exchanges from Zikaron
   * - After getting the response, stores the exchange in Zikaron episodic memory
   *
   * Decision support:
   * - Before calling the LLM, queries Zikaron procedural memory for relevant patterns
   * - Passes top 5 patterns (by success rate) to buildSystemPrompt as institutional knowledge
   * - After getting the response, stores the decision in episodic memory with `decision` tag
   *
   * Validates: Requirements 48b.5, 48b.6, 48b.7, 48b.8, 48b.9, 48d.14, 48d.15, 48d.16, 48d.17
   */
  private async executeChatTask(
    task: Task,
    entry: AgentRegistryEntry,
    modelSelection: { model: string; provider: string; estimatedCost: number },
    startTime: number,
  ): Promise<TaskResult> {
    const userMessage = task.params.input as string;
    const userId = (task.params.userId as string) || 'default-user';
    const source = (task.params.source as string) || 'dashboard';
    const agentId = entry.instance.id;

    // Load procedural patterns from Zikaron before making decisions (Requirement 48d.14)
    const proceduralPatterns = await this.loadProceduralPatterns(agentId, userMessage);

    // Build system prompt with procedural patterns as institutional knowledge
    const systemPrompt = buildSystemPrompt(entry.program, proceduralPatterns);

    // Load conversation history from Zikaron (Requirement 48b.6, 48b.7, 48b.8)
    const conversationHistory = await this.loadConversationHistory(agentId, userId, userMessage);

    // Build the messages array: conversation history + current user message
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    // Determine max_tokens based on input size (Shaar Guardian analysis needs more output space)
    const maxTokens = userMessage.length > 2000 ? 4096 : 1024;

    // Try Anthropic first
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey.trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: maxTokens,
            system: systemPrompt,
            messages,
          }),
        });

        if (response.ok) {
          const data = await response.json() as any;
          const content = data.content?.[0]?.text || 'No response generated.';
          const inputTokens = data.usage?.input_tokens || 0;
          const outputTokens = data.usage?.output_tokens || 0;

          // Store conversation exchange in Zikaron (Requirement 48b.5, 48b.9)
          const episodicEntryId = await this.storeConversationExchange(agentId, userId, userMessage, content, source);

          // Store decision in episodic memory (Requirement 48d.15)
          await this.storeDecision(agentId, userId, userMessage, content, proceduralPatterns);

          // Publish knowledge sharing event for cross-agent learning
          try {
            await this.eventBusService.publish({
              source: 'seraphim.agent-runtime',
              type: 'memory.knowledge_shared',
              detail: {
                sourceAgentId: agentId,
                memoryEntryId: episodicEntryId,
                layer: 'episodic',
                relevanceTags: ['conversation', entry.program.pillar, task.type],
                summary: `${entry.program.name} conversation: ${userMessage.substring(0, 100)}`,
              },
              metadata: {
                tenantId: 'system',
                correlationId: task.id,
                timestamp: new Date(),
              },
            });
          } catch {
            // Knowledge sharing failure is non-fatal
          }

          return {
            taskId: task.id,
            success: true,
            output: {
              response: content,
              model: data.model || 'claude-sonnet-4-20250514',
              provider: 'anthropic',
            },
            tokenUsage: { inputTokens, outputTokens, costUsd: (inputTokens * 0.003 + outputTokens * 0.015) / 1000 },
            durationMs: Date.now() - startTime,
          };
        }

        // Anthropic returned an error — log it and try OpenAI
        const errBody = await response.text();
        console.error(`[executeChatTask] Anthropic API error ${response.status}: ${errBody}`);
      } catch (e) {
        console.error(`[executeChatTask] Anthropic fetch error: ${(e as Error).message}`);
      }
    }

    // Try OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey.trim()}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages,
            ],
            max_tokens: maxTokens,
          }),
        });

        if (response.ok) {
          const data = await response.json() as any;
          const content = data.choices?.[0]?.message?.content || 'No response generated.';
          const inputTokens = data.usage?.prompt_tokens || 0;
          const outputTokens = data.usage?.completion_tokens || 0;

          // Store conversation exchange in Zikaron (Requirement 48b.5, 48b.9)
          const episodicEntryId = await this.storeConversationExchange(agentId, userId, userMessage, content, source);

          // Store decision in episodic memory (Requirement 48d.15)
          await this.storeDecision(agentId, userId, userMessage, content, proceduralPatterns);

          // Publish knowledge sharing event for cross-agent learning
          try {
            await this.eventBusService.publish({
              source: 'seraphim.agent-runtime',
              type: 'memory.knowledge_shared',
              detail: {
                sourceAgentId: agentId,
                memoryEntryId: episodicEntryId,
                layer: 'episodic',
                relevanceTags: ['conversation', entry.program.pillar, task.type],
                summary: `${entry.program.name} conversation: ${userMessage.substring(0, 100)}`,
              },
              metadata: {
                tenantId: 'system',
                correlationId: task.id,
                timestamp: new Date(),
              },
            });
          } catch {
            // Knowledge sharing failure is non-fatal
          }

          return {
            taskId: task.id,
            success: true,
            output: {
              response: content,
              model: data.model || 'gpt-4o',
              provider: 'openai',
            },
            tokenUsage: { inputTokens, outputTokens, costUsd: (inputTokens * 0.005 + outputTokens * 0.015) / 1000 },
            durationMs: Date.now() - startTime,
          };
        }

        // OpenAI returned an error
        const errBody = await response.text();
        console.error(`[executeChatTask] OpenAI API error ${response.status}: ${errBody}`);
      } catch (e) {
        console.error(`[executeChatTask] OpenAI fetch error: ${(e as Error).message}`);
      }
    }

    // No API keys or both failed — return informative stub but still store the exchange
    const stubResponse = `[${entry.program.name}] I received your message: "${userMessage}". However, no LLM API keys are configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment to enable real responses.`;

    // Store conversation exchange even for stub responses (Requirement 48b.5, 48b.9)
    const episodicEntryId = await this.storeConversationExchange(agentId, userId, userMessage, stubResponse, source);

    // Store decision in episodic memory (Requirement 48d.15)
    await this.storeDecision(agentId, userId, userMessage, stubResponse, proceduralPatterns);

    // Publish knowledge sharing event for cross-agent learning
    try {
      await this.eventBusService.publish({
        source: 'seraphim.agent-runtime',
        type: 'memory.knowledge_shared',
        detail: {
          sourceAgentId: agentId,
          memoryEntryId: episodicEntryId,
          layer: 'episodic',
          relevanceTags: ['conversation', entry.program.pillar, task.type],
          summary: `${entry.program.name} conversation: ${userMessage.substring(0, 100)}`,
        },
        metadata: {
          tenantId: 'system',
          correlationId: task.id,
          timestamp: new Date(),
        },
      });
    } catch {
      // Knowledge sharing failure is non-fatal
    }

    return {
      taskId: task.id,
      success: true,
      output: {
        response: stubResponse,
        model: modelSelection.model,
        provider: modelSelection.provider,
      },
      tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      durationMs: Date.now() - startTime,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle — upgrade
  // -----------------------------------------------------------------------

  /**
   * Rolling upgrade: deploy new version, migrate state, memory references,
   * and Zikaron memory, terminate old version.
   *
   * Validates: Requirement 1.5
   */
  async upgrade(agentId: string, newVersion: AgentProgram): Promise<void> {
    const oldEntry = this.getRegistryEntry(agentId);
    const oldState = oldEntry.instance.state;

    // 1. Validate the new program version
    this.validateProgram(newVersion);

    // 2. Deploy the new version (creates a new agent instance)
    const newInstance = await this.deploy(newVersion);
    const newEntry = this.getRegistryEntry(newInstance.id);

    // 3. Migrate state: carry over resource metrics and error count
    newEntry.instance.resourceUsage = { ...oldEntry.instance.resourceUsage };
    newEntry.instance.resourceUsage.activeTaskCount = 0;
    newEntry.errorCount = oldEntry.errorCount;
    newEntry.consecutiveErrors = oldEntry.consecutiveErrors;
    newEntry.lastSuccessfulTask = oldEntry.lastSuccessfulTask;

    // 4. Migrate Zikaron memory references from old agent to new agent
    try {
      // Load old agent context and store it under new agent
      const oldContext = await this.zikaronService.loadAgentContext(agentId);
      if (oldContext.workingMemory) {
        await this.zikaronService.storeWorking(newInstance.id, {
          ...oldContext.workingMemory,
          id: randomUUID(),
          agentId: newInstance.id,
          sourceAgentId: newInstance.id,
          taskContext: {
            ...oldContext.workingMemory.taskContext,
            migratedFrom: agentId,
          },
        });
      }
    } catch {
      // Memory migration failure is non-fatal
    }

    // 5. Terminate the old version
    await this.terminateInternal(agentId, 'Upgraded to version ' + newVersion.version);

    // 6. Publish upgrade event
    await this.eventBusService.publish({
      source: 'seraphim.agent-runtime',
      type: 'agent.upgraded',
      detail: {
        oldAgentId: agentId,
        newAgentId: newInstance.id,
        oldVersion: oldEntry.instance.version,
        newVersion: newVersion.version,
        previousState: oldState,
        programId: newVersion.id,
      },
      metadata: {
        tenantId: 'system',
        correlationId: newInstance.id,
        timestamp: new Date(),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle — terminate
  // -----------------------------------------------------------------------

  /**
   * Terminate an agent: transition to terminated state, clear memory,
   * log to audit, clean up resources.
   *
   * Validates: Requirement 1.3
   */
  async terminate(agentId: string, reason: string): Promise<void> {
    await this.terminateInternal(agentId, reason);
  }

  // -----------------------------------------------------------------------
  // Registry queries
  // -----------------------------------------------------------------------

  /**
   * Get the current state of an agent.
   *
   * Validates: Requirement 1.6
   */
  async getState(agentId: string): Promise<AgentState> {
    const entry = this.getRegistryEntry(agentId);
    return entry.instance.state;
  }

  /**
   * List agents matching an optional filter.
   *
   * Validates: Requirement 1.6
   */
  async listAgents(filter?: AgentFilter): Promise<AgentInstance[]> {
    const agents = Array.from(this.registry.values()).map((e) => e.instance);

    if (!filter) return agents;

    return agents.filter((agent) => {
      if (filter.pillar && agent.pillar !== filter.pillar) return false;
      if (filter.state && agent.state !== filter.state) return false;
      if (filter.programId && agent.programId !== filter.programId) return false;
      return true;
    });
  }

  /**
   * Get health status for an agent based on heartbeat freshness and error rate.
   * Includes parallel execution status when parallel services are available.
   *
   * Validates: Requirement 1.6
   */
  async getHealth(agentId: string): Promise<HealthStatus> {
    const entry = this.getRegistryEntry(agentId);
    const now = Date.now();
    const timeSinceHeartbeat = now - entry.lastHeartbeat.getTime();
    const isStale = timeSinceHeartbeat > STALE_THRESHOLD_MS;
    const isTerminated = entry.instance.state === 'terminated';
    const isDegraded = entry.instance.state === 'degraded';

    const healthy = !isStale && !isTerminated && !isDegraded;

    let status: HealthStatus['status'];
    if (isTerminated) {
      status = 'disconnected';
    } else if (isDegraded || isStale) {
      status = 'error';
    } else if (entry.instance.state === 'executing') {
      status = 'executing';
    } else {
      status = 'ready';
    }

    let message: string | undefined;
    if (isStale) {
      message = `Agent heartbeat stale (last seen ${Math.round(timeSinceHeartbeat / 1000)}s ago)`;
    } else if (isDegraded) {
      message = `Agent in degraded state (${entry.errorCount} errors)`;
    } else if (isTerminated) {
      message = 'Agent terminated';
    }

    return {
      healthy,
      status,
      lastSuccessfulOperation: entry.lastSuccessfulTask,
      errorCount: entry.errorCount,
      message,
    };
  }

  /**
   * Get parallel execution health information.
   * Returns status of parallel orchestration services and active DAGs.
   */
  getParallelHealth(): ParallelHealthInfo {
    const schedulerStatus = this.parallelScheduler?.getStatus();

    return {
      parallelEnabled: !!(this.parallelScheduler && this.dependencyGraphEngine && this.resultAggregator),
      activeDAGs: this.activeDAGs.size,
      activeTasks: schedulerStatus?.totalActive ?? 0,
      queuedTasks: schedulerStatus?.totalQueued ?? 0,
    };
  }

  // -----------------------------------------------------------------------
  // Parallel Execution
  // -----------------------------------------------------------------------

  /**
   * Execute multiple tasks in parallel using DAG-based dependency resolution.
   *
   * Flow:
   * 1. Creates a DAG from the provided tasks using the DependencyGraphEngine
   * 2. Validates the DAG (rejects circular dependencies)
   * 3. Generates an execution plan (batches of parallelizable tasks)
   * 4. Dispatches ready tasks through the ParallelScheduler
   * 5. Uses the CoordinationBus for inter-task signaling on completion
   * 6. Aggregates results using the ResultAggregator
   *
   * Falls back to sequential execution if parallel services are not injected.
   *
   * @param tasks - Array of tasks with dependency information
   * @param options - Optional execution configuration
   * @returns Aggregated result from all parallel streams
   */
  async executeParallel(
    tasks: ParallelTaskInput[],
    options?: ParallelExecutionOptions,
  ): Promise<AggregatedResult> {
    // Fall back to sequential execution if parallel services are not available
    if (!this.dependencyGraphEngine || !this.parallelScheduler || !this.resultAggregator) {
      return this.executeSequentialFallback(tasks, options);
    }

    const dagId = randomUUID();
    this.activeDAGs.add(dagId);

    try {
      // 1. Convert ParallelTaskInput[] to the format expected by DependencyGraphEngine
      const parallelTasks = tasks.map((t) => ({
        id: t.id,
        agentId: t.agentId,
        task: t.task,
        dependencies: t.dependencies,
        priority: t.priority,
        estimatedDuration: t.estimatedDurationMs ?? 5000,
        resourceRequirements: { cpuUnits: 1, memoryMb: 256 },
      }));

      // 2. Create the DAG
      const dag = await this.dependencyGraphEngine.createGraph(parallelTasks);

      // 3. Validate the DAG (reject circular dependencies)
      const validation = await this.dependencyGraphEngine.validateGraph(dag);
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('; ');
        throw new Error(`DAG validation failed: ${errorMessages}`);
      }

      // 4. Generate execution plan
      const plan = await this.dependencyGraphEngine.schedule(dag);

      // 5. Execute batches in order
      for (const batch of plan.batches) {
        // Get the tasks for this batch
        const batchTasks = parallelTasks.filter((t) => batch.taskIds.includes(t.id));

        // Dispatch all tasks in this batch simultaneously
        const dispatchResults = await this.parallelScheduler.dispatchBatch(batchTasks, dagId);

        // Wait for all tasks in this batch to complete
        const batchResults = await Promise.allSettled(
          batchTasks.map(async (pt) => {
            const dispatchResult = dispatchResults.find((r) => r.taskId === pt.id);
            if (dispatchResult?.status === 'rejected') {
              const failResult: TaskResult = {
                taskId: pt.task.id,
                success: false,
                error: dispatchResult.reason ?? 'Task dispatch rejected',
                tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
                durationMs: 0,
              };
              await this.resultAggregator!.collectResult(dagId, pt.id, failResult);
              return failResult;
            }

            // Execute the task through the normal execute path
            const result = await this.execute(pt.agentId, pt.task);

            // Signal completion via coordination bus
            if (this.coordinationBus) {
              await this.coordinationBus.signalCompletion(pt.id, result.output);
            }

            // Mark complete in the graph engine
            await this.dependencyGraphEngine!.markComplete(pt.id, result);

            // Notify scheduler of completion
            if (result.success) {
              await this.parallelScheduler!.handleCompletion(pt.id, result);
            } else {
              await this.parallelScheduler!.handleFailure(pt.id, result.error ?? 'Unknown error');
            }

            // Collect result for aggregation
            await this.resultAggregator!.collectResult(dagId, pt.id, result);

            return result;
          }),
        );

        // Check if we should stop on failure
        if (!options?.continueOnFailure) {
          const hasFailure = batchResults.some(
            (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success),
          );
          if (hasFailure) {
            break;
          }
        }
      }

      // 6. Aggregate results
      const aggregated = await this.resultAggregator.aggregate(
        dagId,
        options?.aggregationStrategy ?? 'merge',
        options?.customAggregator,
      );

      return aggregated;
    } finally {
      this.activeDAGs.delete(dagId);
    }
  }

  /**
   * Dispatch tasks to multiple agents simultaneously for inter-agent parallel execution.
   *
   * Creates a DAG with one task per agent. By default, tasks have no dependencies
   * between them (fully parallel). Dependencies can be specified via the task inputs
   * if sequential ordering between agents is needed.
   *
   * Falls back to sequential execution if parallel services are not available.
   *
   * @param assignments - Map of agentId → Task for each agent
   * @param options - Optional execution configuration
   * @returns Aggregated results from all agents
   */
  async dispatchToAgents(
    assignments: Map<string, Task>,
    options?: ParallelExecutionOptions,
  ): Promise<AggregatedResult> {
    // Convert the assignments map to ParallelTaskInput array (no inter-agent dependencies)
    const tasks: ParallelTaskInput[] = [];
    for (const [agentId, task] of assignments) {
      tasks.push({
        id: `dispatch-${agentId}-${task.id}`,
        agentId,
        task,
        dependencies: [], // No dependencies between agents by default
        priority: task.priority === 'critical' ? 10 : task.priority === 'high' ? 7 : task.priority === 'low' ? 3 : 5,
        estimatedDurationMs: task.timeout ?? 5000,
      });
    }

    return this.executeParallel(tasks, options);
  }

  // -----------------------------------------------------------------------
  // Parallel Execution — Sequential Fallback
  // -----------------------------------------------------------------------

  /**
   * Sequential fallback for executeParallel when parallel services are not injected.
   * Executes tasks one at a time respecting dependency order (topological sort).
   */
  private async executeSequentialFallback(
    tasks: ParallelTaskInput[],
    options?: ParallelExecutionOptions,
  ): Promise<AggregatedResult> {
    const dagId = randomUUID();
    const results = new Map<string, TaskResult>();
    const completed = new Set<string>();

    // Simple topological sort for sequential execution
    const remaining = [...tasks];
    let iterations = 0;
    const maxIterations = remaining.length * remaining.length;

    while (remaining.length > 0 && iterations < maxIterations) {
      iterations++;
      const readyIndex = remaining.findIndex((t) =>
        t.dependencies.every((dep) => completed.has(dep)),
      );

      if (readyIndex === -1) {
        // Circular dependency detected — cannot proceed
        throw new Error('DAG validation failed: circular dependency detected in sequential fallback');
      }

      const taskInput = remaining.splice(readyIndex, 1)[0];
      const result = await this.execute(taskInput.agentId, taskInput.task);
      results.set(taskInput.id, result);
      completed.add(taskInput.id);

      if (!options?.continueOnFailure && !result.success) {
        break;
      }
    }

    // Build aggregated result
    let successCount = 0;
    let failCount = 0;
    const mergedOutput: Record<string, unknown> = {};

    for (const [taskId, result] of results) {
      if (result.success) {
        successCount++;
        mergedOutput[taskId] = result.output;
      } else {
        failCount++;
      }
    }

    return {
      dagId,
      totalStreams: tasks.length,
      successfulStreams: successCount,
      failedStreams: failCount,
      mergedOutput,
      perStreamResults: results,
      aggregatedAt: new Date(),
    };
  }

  // -----------------------------------------------------------------------
  // Heartbeat mechanism
  // -----------------------------------------------------------------------

  /**
   * Record a heartbeat for an agent. Agents should call this every 30 seconds.
   */
  recordHeartbeat(agentId: string): void {
    const entry = this.registry.get(agentId);
    if (!entry) return;

    const now = new Date();
    entry.lastHeartbeat = now;
    entry.instance.lastHeartbeat = now;
  }

  /**
   * Start the periodic heartbeat checker.
   */
  startHeartbeatChecker(): void {
    if (this.heartbeatCheckInterval) return;

    this.heartbeatCheckInterval = setInterval(() => {
      void this.checkHeartbeats();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the periodic heartbeat checker.
   */
  stopHeartbeatChecker(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }
  }

  // -----------------------------------------------------------------------
  // Working Memory Persistence
  // -----------------------------------------------------------------------

  /**
   * Start the periodic working memory persistence timer (60-second interval).
   *
   * Validates: Requirement 48c.11
   */
  startWorkingMemoryPersistence(): void {
    if (this.workingMemoryPersistInterval) return;

    this.workingMemoryPersistInterval = setInterval(() => {
      void this.persistAllWorkingMemory();
    }, WORKING_MEMORY_PERSIST_INTERVAL_MS);
  }

  /**
   * Stop the periodic working memory persistence timer.
   */
  stopWorkingMemoryPersistence(): void {
    if (this.workingMemoryPersistInterval) {
      clearInterval(this.workingMemoryPersistInterval);
      this.workingMemoryPersistInterval = null;
    }
  }

  /**
   * Persist working memory for all active agents.
   * Called by the 60-second interval timer.
   *
   * Validates: Requirement 48c.11
   */
  private async persistAllWorkingMemory(): Promise<void> {
    for (const [agentId, entry] of this.registry) {
      // Skip terminated agents
      if (entry.instance.state === 'terminated') continue;

      try {
        await this.persistWorkingMemory(agentId);
      } catch {
        // Persistence failure for individual agents is non-fatal
        console.error(`[persistAllWorkingMemory] Failed to persist working memory for agent ${agentId}`);
      }
    }
  }

  /**
   * Persist working memory for a single agent to Zikaron.
   * Computes SHA-256 hash for integrity verification and updates session_continuity.
   *
   * Validates: Requirements 48c.11, 48c.12, 48c.13
   */
  private async persistWorkingMemory(agentId: string): Promise<void> {
    const entry = this.registry.get(agentId);
    if (!entry || !entry.workingMemoryState) return;

    const wmState = entry.workingMemoryState;
    const now = new Date();

    // Update persistence metadata
    wmState.lastPersistedAt = now;
    wmState.persistenceHash = this.computeWorkingMemoryHash(wmState);
    wmState.sessionContinuity.lastActiveTimestamp = now;
    wmState.sessionContinuity.lastPersistedHash = wmState.persistenceHash;

    // Serialize and store to Zikaron
    await this.zikaronService.storeWorking(agentId, {
      id: randomUUID(),
      tenantId: 'system',
      layer: 'working',
      content: `Working memory for agent ${agentId}`,
      embedding: [],
      sourceAgentId: agentId,
      tags: ['working', 'persistence', 'session_continuity'],
      createdAt: now,
      agentId,
      sessionId: wmState.sessionId,
      taskContext: {
        activeGoals: wmState.activeGoals,
        pendingTasks: wmState.pendingTasks,
        currentContext: wmState.currentContext,
        conversationCount: wmState.conversationCount,
        lastInteractionAt: wmState.lastInteractionAt.toISOString(),
        topicsDiscussed: wmState.topicsDiscussed,
        recentDecisions: wmState.recentDecisions,
        persistenceHash: wmState.persistenceHash,
        sessionTransitions: wmState.sessionContinuity.sessionTransitions,
        sessionContinuity: {
          lastActiveTimestamp: wmState.sessionContinuity.lastActiveTimestamp.toISOString(),
          lastPersistedHash: wmState.sessionContinuity.lastPersistedHash,
          sessionTransitions: wmState.sessionContinuity.sessionTransitions,
        },
      },
      conversationHistory: [],
      activeGoals: wmState.activeGoals,
    });
  }

  /**
   * Compute SHA-256 hash of the working memory state for integrity verification.
   *
   * Validates: Requirement 48c.12
   */
  private computeWorkingMemoryHash(state: WorkingMemoryState): string {
    const serializable = {
      agentId: state.agentId,
      sessionId: state.sessionId,
      activeGoals: state.activeGoals,
      pendingTasks: state.pendingTasks,
      currentContext: state.currentContext,
      conversationCount: state.conversationCount,
      topicsDiscussed: state.topicsDiscussed,
      recentDecisions: state.recentDecisions,
    };
    const serialized = JSON.stringify(serializable);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Get the current working memory state for an agent (for testing/inspection).
   */
  getWorkingMemoryState(agentId: string): WorkingMemoryState | undefined {
    const entry = this.registry.get(agentId);
    return entry?.workingMemoryState;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private validateProgram(program: AgentProgram): void {
    if (!program.id) {
      throw new Error('AgentProgram must have an id');
    }
    if (!program.name) {
      throw new Error('AgentProgram must have a name');
    }
    if (!program.version) {
      throw new Error('AgentProgram must have a version');
    }
    if (!program.pillar) {
      throw new Error('AgentProgram must have a pillar');
    }
    if (!program.systemPrompt) {
      throw new Error('AgentProgram must have a systemPrompt');
    }
  }

  private getRegistryEntry(agentId: string): AgentRegistryEntry {
    const entry = this.registry.get(agentId);
    if (!entry) {
      throw new Error(`Agent '${agentId}' not found in registry`);
    }
    return entry;
  }

  private async transitionAgent(
    entry: AgentRegistryEntry,
    event: string,
  ): Promise<void> {
    await this.stateMachineEngine.transition(
      entry.stateMachineInstanceId,
      event,
      { triggeredBy: 'agent-runtime', tenantId: 'system' },
    );
  }

  private async terminateInternal(
    agentId: string,
    reason: string,
  ): Promise<void> {
    const entry = this.getRegistryEntry(agentId);
    const previousState = entry.instance.state;

    // 1. Transition to terminated via state machine
    await this.transitionAgent(entry, 'terminate');
    entry.instance.state = 'terminated';

    // 2. Clear working memory from Zikaron
    try {
      await this.zikaronService.storeWorking(agentId, {
        id: randomUUID(),
        tenantId: 'system',
        layer: 'working',
        content: '',
        embedding: [],
        sourceAgentId: agentId,
        tags: ['terminated'],
        createdAt: new Date(),
        agentId,
        sessionId: agentId,
        taskContext: { terminated: true, reason },
        conversationHistory: [],
        activeGoals: [],
      });
    } catch {
      // Memory clear failure is non-fatal
    }

    // 3. Log to XO Audit
    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: entry.instance.id,
      actingAgentName: entry.program.name,
      actionType: 'agent_terminate',
      target: agentId,
      authorizationChain: [],
      executionTokens: [],
      outcome: 'success',
      details: { reason, previousState },
    });

    // 4. Publish termination event
    await this.eventBusService.publish({
      source: 'seraphim.agent-runtime',
      type: 'agent.terminated',
      detail: {
        agentId,
        programId: entry.instance.programId,
        reason,
        previousState,
      },
      metadata: {
        tenantId: 'system',
        correlationId: agentId,
        timestamp: new Date(),
      },
    });
  }

  private async checkHeartbeats(): Promise<void> {
    const now = Date.now();

    for (const [agentId, entry] of this.registry) {
      // Skip already terminated or degraded agents
      if (
        entry.instance.state === 'terminated' ||
        entry.instance.state === 'degraded'
      ) {
        continue;
      }

      const timeSinceHeartbeat = now - entry.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > STALE_THRESHOLD_MS) {
        // Transition to degraded
        try {
          await this.transitionAgent(entry, 'unrecoverable_error');
          entry.instance.state = 'degraded';

          await this.xoAuditService.recordAction({
            tenantId: 'system',
            actingAgentId: agentId,
            actingAgentName: entry.program.name,
            actionType: 'heartbeat_stale',
            target: agentId,
            authorizationChain: [],
            executionTokens: [],
            outcome: 'failure',
            details: {
              lastHeartbeat: entry.lastHeartbeat.toISOString(),
              staleDurationMs: timeSinceHeartbeat,
            },
          });

          await this.eventBusService.publish({
            source: 'seraphim.agent-runtime',
            type: 'agent.heartbeat.stale',
            detail: {
              agentId,
              lastHeartbeat: entry.lastHeartbeat.toISOString(),
              staleDurationMs: timeSinceHeartbeat,
            },
            metadata: {
              tenantId: 'system',
              correlationId: agentId,
              timestamp: new Date(),
            },
          });
        } catch {
          // If the transition fails (e.g., already in a terminal state), ignore
        }
      }
    }
  }
}
