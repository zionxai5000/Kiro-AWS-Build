/**
 * Shared types for all pipeline hook modules.
 */

import type { HookFailureMode } from '../types/index.js';

// ---------------------------------------------------------------------------
// Hook Metadata
// ---------------------------------------------------------------------------

export type HookTriggerType =
  | 'file_event'      // triggered by file system change in workspace
  | 'api_request'     // triggered by manual API call
  | 'webhook';        // triggered by external webhook (e.g., Sentry)

export interface HookMetadata {
  id: string;
  name: string;
  triggerType: HookTriggerType;
  failureMode: HookFailureMode;
  timeoutMs: number;
  maxConcurrent: number;
}

// ---------------------------------------------------------------------------
// Hook Context (passed to every hook's run function)
// ---------------------------------------------------------------------------

export interface HookContext {
  /** Unique execution ID for tracing */
  executionId: string;
  /** Whether this is a dry-run (log only, no side effects) */
  dryRun: boolean;
  /** Timestamp when execution started */
  startedAt: string;
  /** Logger function */
  log: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Hook Result
// ---------------------------------------------------------------------------

export interface HookResult<T = unknown> {
  success: boolean;
  hookId: string;
  dryRun: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}
