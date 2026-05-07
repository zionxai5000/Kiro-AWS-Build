/**
 * Agent-related data models.
 */

import type { AgentState, AuthorityLevel } from './enums.js';
import type { CompletionContract } from './completion.js';
import type { StateMachineDefinition } from './state-machine.js';

// ---------------------------------------------------------------------------
// Tool Definition (referenced by AgentProgram)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Test Suite Reference
// ---------------------------------------------------------------------------

export interface TestSuiteReference {
  suiteId: string;
  path: string;
  requiredCoverage: number;
}

// ---------------------------------------------------------------------------
// Changelog Entry
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
  version: string;
  date: Date;
  author: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Model Preference
// ---------------------------------------------------------------------------

export interface ModelPreference {
  /** e.g. 'claude-sonnet-4-20250514' */
  preferred: string;
  /** e.g. 'gpt-4o' */
  fallback: string;
  /** Max cost per task in USD */
  costCeiling: number;
  taskTypeOverrides?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Agent Program
// ---------------------------------------------------------------------------

/**
 * A versioned, deployable package defining an agent's behavior, capabilities,
 * permissions, and state machine.
 */
export interface AgentProgram {
  id: string;
  name: string;
  /** semver */
  version: string;
  pillar: string;

  // Behavior
  systemPrompt: string;
  tools: ToolDefinition[];
  stateMachine: StateMachineDefinition;
  completionContracts: CompletionContract[];

  // Permissions
  authorityLevel: AuthorityLevel;
  allowedActions: string[];
  deniedActions: string[];

  // Resources
  modelPreference: ModelPreference;
  tokenBudget: { daily: number; monthly: number };

  // Testing
  testSuite: TestSuiteReference;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  changelog: ChangelogEntry[];
}

// ---------------------------------------------------------------------------
// Resource Metrics
// ---------------------------------------------------------------------------

export interface ResourceMetrics {
  cpuPercent: number;
  memoryMb: number;
  activeTaskCount: number;
  tokenUsageToday: number;
}

// ---------------------------------------------------------------------------
// Agent Instance
// ---------------------------------------------------------------------------

export interface AgentInstance {
  id: string;
  programId: string;
  version: string;
  state: AgentState;
  pillar: string;
  resourceUsage: ResourceMetrics;
  lastHeartbeat: Date;
}

// ---------------------------------------------------------------------------
// Agent Filter
// ---------------------------------------------------------------------------

export interface AgentFilter {
  pillar?: string;
  state?: AgentState;
  programId?: string;
}
