/**
 * Agent harness — shared type vocabulary.
 *
 * Mirrors the Anthropic Tool-Use API shapes so the harness can pass values
 * through with minimal translation. Where we extend, the comments call it out.
 */

// ---------------------------------------------------------------------------
// Anthropic-compatible message shapes
// ---------------------------------------------------------------------------

export type AgentRole = 'user' | 'assistant' | 'tool_result';

/** A single message in the running conversation. */
export interface AgentMessage {
  role: AgentRole;
  /**
   * Anthropic-shape content blocks. Strings are normalized to a single text
   * block by the message-builder.
   */
  content: ContentBlock[];
  /**
   * If set, the message is a candidate for prompt caching (system + skills
   * index, primarily). Most history messages should NOT cache.
   */
  cache?: 'ephemeral';
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** A tool the agent can invoke. */
export interface Tool<TInput = any, TOutput = any> {
  /** Stable identifier exposed to the model. */
  name: string;
  /** Plain-language description shown to the model. */
  description: string;
  /** JSON Schema for the input. */
  inputSchema: ToolInputSchema;
  /** Server-side handler. */
  run(input: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: false;
}

export interface ToolContext {
  projectId: string;
  userId: string;
  sandboxId?: string;
  /** Workspace handle from existing app-development codebase. */
  workspace: WorkspaceLike;
  /** Sandbox client for run_command/screenshot, when available. */
  sandbox?: SandboxClientLike;
  /** SSE writer the agent loop uses to surface progress to the dashboard. */
  emit: (event: AgentEvent) => void;
  /** Files the agent has read this session (read-before-write enforcement). */
  readFiles: Set<string>;
  /** Logger for the harness itself. */
  log: (...args: unknown[]) => void;
}

export interface ToolResult<T = unknown> {
  /** What the model sees. */
  content: string;
  /** Structured payload for downstream processing. */
  data?: T;
  /** Sets `is_error` on the tool_result block. */
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Streaming events to the dashboard chat
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool.call'; name: string; summary: string }
  | { type: 'tool.result'; name: string; durationMs: number; isError: boolean }
  | { type: 'skill.loaded'; name: string }
  | { type: 'subagent.spawn'; name: string }
  | { type: 'subagent.result'; name: string; passed: boolean; score?: number }
  | { type: 'budget.warning'; remainingTokens: number }
  | { type: 'iteration'; index: number }
  | { type: 'done'; reason: 'completed' | 'budget' | 'iteration_cap' | 'aborted' };

// ---------------------------------------------------------------------------
// Loop config + result
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** Anthropic model id. */
  model: string;
  /** Hard cap on the agent's iterations (`while` loops). */
  maxIterations: number;
  /** Hard cap on total tokens spent in this run. */
  maxTokens: number;
  /** Per-call max output tokens. */
  perCallMaxTokens: number;
  /** Anthropic API key (resolved by caller). */
  apiKey: string;
}

export interface AgentRunResult {
  passed: boolean;
  iterations: number;
  tokens: { input: number; output: number };
  filesWritten: string[];
  filesEdited: string[];
  reason: 'completed' | 'budget' | 'iteration_cap' | 'aborted';
  /** Optional reviewer subagent scores. */
  reviewers?: Array<{ name: string; passed: boolean; score?: number }>;
}

export interface AgentInput {
  prompt: string;
  projectId: string;
  userId: string;
  /** Pass an existing AbortSignal so SSE close-on-disconnect cancels the run. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Adapters to existing app-development code (avoid hard imports here so this
// file can be unit-tested in isolation)
// ---------------------------------------------------------------------------

export interface WorkspaceLike {
  readFile(projectId: string, path: string): Promise<string>;
  writeFile(projectId: string, path: string, content: string): Promise<void>;
  listFiles(projectId: string): Promise<string[]>;
  exists(projectId: string, path: string): Promise<boolean>;
  /** Optional — not currently used by the harness, but available for future tools. */
  delete?(projectId: string, path: string): Promise<void>;
}

export interface SandboxClientLike {
  runCommand(projectId: string, cmd: string, opts?: { timeoutMs?: number; cwd?: string; background?: boolean }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  screenshot?(projectId: string): Promise<string /* base64 png */>;
  getPublicUrl(projectId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Subagent contract
// ---------------------------------------------------------------------------

export interface Subagent {
  name: string;
  description: string;
  /** Returns its verdict. The main loop applies fixes for failed subagents. */
  run(input: SubagentInput): Promise<SubagentResult>;
}

export interface SubagentInput {
  projectId: string;
  userId: string;
  workspace: WorkspaceLike;
}

export interface SubagentResult {
  passed: boolean;
  score?: number;
  /** Specific actionable fixes the main agent should apply. */
  fixes: string[];
  /** Free-form details surfaced in chat. */
  details?: string;
}
