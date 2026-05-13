/**
 * Cognition Envelope Builder — Assembles full agent context before every LLM call.
 *
 * The Cognition Envelope is the mandatory context package that prevents agents from
 * operating as generic chatbots. It assembles: identity, authority, memory, tools,
 * workflow state, goals, and delegation policy into a single inspectable structure.
 *
 * Requirements: 49.1, 49.2, 49.3, 49.4, 55.1
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { AgentProgram, AgentIdentityProfile } from '../types/agent.js';
import type { CompletionContract } from '../types/completion.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';
import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { OtzarService } from '../interfaces/otzar-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutonomyMode = 'crawl' | 'walk' | 'run';

export interface DelegationPolicy {
  allowedTargets: string[];          // Agent IDs this agent can delegate to
  maxConcurrentDelegations: number;
  requireMishmarApproval: boolean;
  defaultTimeout: number;
}

export interface MCPToolDescriptor {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  provider: string;
  costPerInvocation: number;
  reliabilityScore: number;
  averageLatencyMs: number;
  requiredAuthorityLevel: 'L1' | 'L2' | 'L3' | 'L4';
  requiredPermissions: string[];
  status: 'available' | 'degraded' | 'unavailable';
  lastHealthCheck: Date;
  fallbackTools: string[];
}

export interface ToolSelectionPolicy {
  preferCost: boolean;
  preferReliability: boolean;
  maxCostPerInvocation: number;
  minReliabilityScore: number;
}

export interface CognitionEnvelope {
  id: string;
  agentId: string;
  timestamp: Date;

  // Identity
  identityProfile: AgentIdentityProfile | null;
  systemPrompt: string;

  // Authority
  authorityLevel: 'L1' | 'L2' | 'L3' | 'L4';
  autonomyMode: AutonomyMode;
  allowedActions: string[];
  delegationPolicy: DelegationPolicy;

  // Context (from Zikaron)
  workingMemory: Record<string, unknown> | null;
  conversationHistory: Array<{ role: string; content: string }>;
  proceduralPatterns: string[];
  episodicContext: string[];

  // Workflow
  currentPlan: unknown | null;
  activeGoals: string[];
  pendingDecisions: string[];
  completionContract: CompletionContract | null;

  // Tools
  availableMCPTools: MCPToolDescriptor[];
  toolSelectionCriteria: ToolSelectionPolicy;

  // Budget
  remainingDailyBudget: number;
  estimatedTaskCost: number;

  // Metadata
  degradedComponents: string[];      // Components that failed to load
  envelopeHash: string;              // SHA-256 for reproducibility
}

// ---------------------------------------------------------------------------
// Builder (Input-based — synchronous, for pre-loaded data)
// ---------------------------------------------------------------------------

export interface CognitionEnvelopeInput {
  agentId: string;
  program: AgentProgram;
  systemPrompt: string;
  autonomyMode?: AutonomyMode;

  // Context (loaded externally, passed in)
  workingMemory?: Record<string, unknown> | null;
  conversationHistory?: Array<{ role: string; content: string }>;
  proceduralPatterns?: string[];
  episodicContext?: string[];

  // Workflow
  currentPlan?: unknown | null;
  activeGoals?: string[];
  pendingDecisions?: string[];

  // Tools
  availableMCPTools?: MCPToolDescriptor[];

  // Budget
  remainingDailyBudget?: number;
  estimatedTaskCost?: number;
}

/**
 * Build a complete Cognition Envelope from the provided inputs.
 * Tracks which components are missing/degraded.
 */
export function buildCognitionEnvelope(input: CognitionEnvelopeInput): CognitionEnvelope {
  const degradedComponents: string[] = [];

  // Track missing components
  if (!input.workingMemory) degradedComponents.push('workingMemory');
  if (!input.conversationHistory || input.conversationHistory.length === 0) degradedComponents.push('conversationHistory');
  if (!input.proceduralPatterns || input.proceduralPatterns.length === 0) degradedComponents.push('proceduralPatterns');
  if (!input.availableMCPTools || input.availableMCPTools.length === 0) degradedComponents.push('mcpTools');

  const envelope: CognitionEnvelope = {
    id: randomUUID(),
    agentId: input.agentId,
    timestamp: new Date(),

    // Identity
    identityProfile: input.program.identityProfile ?? null,
    systemPrompt: input.systemPrompt,

    // Authority
    authorityLevel: input.program.authorityLevel,
    autonomyMode: input.autonomyMode ?? 'walk',
    allowedActions: input.program.allowedActions,
    delegationPolicy: {
      allowedTargets: input.program.identityProfile?.relationships
        ?.filter(r => r.relationship === 'commands' || r.relationship === 'collaborates_with')
        .map(r => r.agentId) ?? [],
      maxConcurrentDelegations: 3,
      requireMishmarApproval: true,
      defaultTimeout: 30000,
    },

    // Context
    workingMemory: input.workingMemory ?? null,
    conversationHistory: input.conversationHistory ?? [],
    proceduralPatterns: input.proceduralPatterns ?? [],
    episodicContext: input.episodicContext ?? [],

    // Workflow
    currentPlan: input.currentPlan ?? null,
    activeGoals: input.activeGoals ?? [],
    pendingDecisions: input.pendingDecisions ?? [],
    completionContract: input.program.completionContracts?.[0] ?? null,

    // Tools
    availableMCPTools: input.availableMCPTools ?? [],
    toolSelectionCriteria: {
      preferCost: true,
      preferReliability: true,
      maxCostPerInvocation: input.program.modelPreference.costCeiling,
      minReliabilityScore: 0.7,
    },

    // Budget
    remainingDailyBudget: input.remainingDailyBudget ?? input.program.tokenBudget.daily,
    estimatedTaskCost: input.estimatedTaskCost ?? 0,

    // Metadata
    degradedComponents,
    envelopeHash: '',
  };

  // Compute hash for reproducibility
  envelope.envelopeHash = computeEnvelopeHash(envelope);

  return envelope;
}

// ---------------------------------------------------------------------------
// Builder (Service-based — async, loads from Zikaron/Mishmar/Otzar directly)
// ---------------------------------------------------------------------------

/**
 * Dependencies for the service-based envelope builder.
 * Allows the builder to directly query memory, governance, and budget services.
 */
export interface CognitionEnvelopeDeps {
  zikaronService: ZikaronService;
  mishmarService: MishmarService;
  otzarService: OtzarService;
}

/**
 * Build a Cognition Envelope by directly querying system services.
 *
 * This is the full-featured builder that:
 * 1. Loads agent memory context from Zikaron (procedural patterns, episodic context)
 * 2. Retrieves conversation history from episodic memory
 * 3. Checks budget from Otzar
 * 4. Builds the system prompt using the identity-aware prompt builder
 *
 * Components that fail to load are tracked in `degradedComponents` — the envelope
 * is still usable but with reduced context. This ensures graceful degradation.
 *
 * @param agentId - The agent's unique identifier
 * @param program - The agent's program definition (identity, permissions, model prefs)
 * @param taskDescription - Description of the current task (used for memory retrieval)
 * @param deps - Service dependencies (Zikaron, Mishmar, Otzar)
 * @returns A fully assembled CognitionEnvelope ready for LLM invocation
 */
export async function buildCognitionEnvelopeFromServices(
  agentId: string,
  program: AgentProgram,
  taskDescription: string,
  deps: CognitionEnvelopeDeps,
): Promise<CognitionEnvelope> {
  const degradedComponents: string[] = [];

  // Load memory context from Zikaron
  let conversationHistory: Array<{ role: string; content: string }> = [];
  let proceduralPatterns: string[] = [];
  let episodicContext: string[] = [];
  let workingMemory: Record<string, unknown> | null = null;

  try {
    const memContext = await deps.zikaronService.loadAgentContext(agentId);
    // Extract procedural patterns as string content
    proceduralPatterns = memContext.proceduralPatterns?.map(p => p.content || String(p)) ?? [];
    // Extract recent episodic entries as context strings
    episodicContext = memContext.recentEpisodic?.map(e => e.content || String(e)) ?? [];
    // Extract working memory task context
    if (memContext.workingMemory) {
      workingMemory = memContext.workingMemory.taskContext ?? null;
    }
  } catch {
    degradedComponents.push('memory');
  }

  // Load conversation history from episodic memory
  try {
    const results = await deps.zikaronService.query({
      text: taskDescription,
      layers: ['episodic'],
      agentId,
      tenantId: 'system',
      limit: 20,
    });
    for (const r of results) {
      try {
        const data = JSON.parse(
          (r.metadata as Record<string, unknown>)?.conversationData as string || '{}',
        ) as { userMessage?: string; agentResponse?: string };
        if (data.userMessage && data.agentResponse) {
          conversationHistory.push({ role: 'user', content: data.userMessage });
          conversationHistory.push({ role: 'assistant', content: data.agentResponse });
        }
      } catch { /* skip unparseable entries */ }
    }
  } catch {
    degradedComponents.push('conversation_history');
  }

  // Check budget from Otzar
  let remainingDailyBudget = program.tokenBudget.daily;
  let estimatedTaskCost = 0;
  try {
    const budget = await deps.otzarService.checkBudget(agentId, 1000);
    remainingDailyBudget = budget.remainingDaily;
    const routing = await deps.otzarService.routeTask({
      taskType: 'analysis',
      complexity: 'medium',
      agentId,
      pillar: program.pillar,
    });
    estimatedTaskCost = routing.estimatedCost;
  } catch {
    degradedComponents.push('budget');
  }

  // Build system prompt using identity-aware prompt builder
  const { buildSystemPrompt } = await import('./prompt-builder.js');
  const systemPrompt = buildSystemPrompt(program, proceduralPatterns);

  // Assemble the envelope using the synchronous builder
  const envelope = buildCognitionEnvelope({
    agentId,
    program,
    systemPrompt,
    autonomyMode: 'run', // Default — will be overridden by autonomy config when applicable
    workingMemory,
    conversationHistory,
    proceduralPatterns,
    episodicContext,
    currentPlan: null,
    activeGoals: [],
    pendingDecisions: [],
    availableMCPTools: [], // Populated by MCP registry when available
    remainingDailyBudget,
    estimatedTaskCost,
  });

  // Merge degraded components from service loading with those from the builder
  const allDegraded = new Set([...envelope.degradedComponents, ...degradedComponents]);
  envelope.degradedComponents = [...allDegraded];

  // Recompute hash with final state
  envelope.envelopeHash = computeEnvelopeHash(envelope);

  return envelope;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a Cognition Envelope has minimum required components.
 * Returns true if the envelope is valid for LLM invocation.
 */
export function validateEnvelope(envelope: CognitionEnvelope): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!envelope.systemPrompt) missing.push('systemPrompt');
  if (!envelope.agentId) missing.push('agentId');
  if (!envelope.authorityLevel) missing.push('authorityLevel');

  return { valid: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hash of the envelope for reproducibility tracking.
 */
function computeEnvelopeHash(envelope: CognitionEnvelope): string {
  const hashInput = JSON.stringify({
    agentId: envelope.agentId,
    systemPrompt: envelope.systemPrompt.substring(0, 200),
    authorityLevel: envelope.authorityLevel,
    autonomyMode: envelope.autonomyMode,
    conversationCount: envelope.conversationHistory.length,
    proceduralCount: envelope.proceduralPatterns.length,
    toolCount: envelope.availableMCPTools.length,
    activeGoals: envelope.activeGoals,
  });
  return createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
}

/**
 * Serialize envelope to a human-readable summary for execution traces.
 */
export function summarizeEnvelope(envelope: CognitionEnvelope): string {
  return [
    `Agent: ${envelope.identityProfile?.name ?? envelope.agentId}`,
    `Authority: ${envelope.authorityLevel} | Mode: ${envelope.autonomyMode}`,
    `Memory: ${envelope.conversationHistory.length} messages, ${envelope.proceduralPatterns.length} patterns`,
    `Tools: ${envelope.availableMCPTools.length} available`,
    `Goals: ${envelope.activeGoals.length} active`,
    `Budget: ${envelope.remainingDailyBudget.toFixed(2)} remaining`,
    envelope.degradedComponents.length > 0 ? `⚠️ Degraded: ${envelope.degradedComponents.join(', ')}` : '✅ Full context',
  ].join(' | ');
}
