/**
 * Pipeline Hook 01: Prompt Sanitizer
 *
 * Trigger: Incoming API request with raw prompt
 * Action: Scan for API keys, credit cards, SSNs, emails. Strip and warn.
 * Failure mode: HALT — never let unsanitized data proceed.
 * Timeout: 10s
 * Concurrency: 1
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'prompt-sanitizer',
  name: 'Prompt Sanitizer',
  triggerType: 'file_event',
  failureMode: 'halt',
  timeoutMs: LIMITS.sanitizerTimeoutMs,
  maxConcurrent: 1,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface PromptSanitizerInput {
  promptId: string;
  raw: string;
  projectId?: string;
}

export interface PromptSanitizerOutput {
  sanitized: string;
  warnings: string[];
  strippedCount: number;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: PromptSanitizerInput,
  ctx: HookContext,
): Promise<HookResult<PromptSanitizerOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { sanitized: input.raw, warnings: [], strippedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would sanitize prompt "${input.promptId}" (${input.raw.length} chars)`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { sanitized: input.raw, warnings: [], strippedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 3
  ctx.log(`[${HOOK_METADATA.id}] Processing prompt "${input.promptId}"`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: { sanitized: input.raw, warnings: [], strippedCount: 0 },
    durationMs: Date.now() - start,
  };
}
