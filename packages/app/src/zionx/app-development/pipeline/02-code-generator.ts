/**
 * Pipeline Hook 02: Code Generator
 *
 * Trigger: Creation of sanitized prompt
 * Action: Call Claude API with prompt + Expo SDK system prompt. Stream to workspace.
 * Failure mode: NOTIFY — show error, keep prompt for retry.
 * Timeout: 120s
 * Concurrency: 1 per projectId, 5 globally
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { GeneratedFile } from '../types/index.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'code-generator',
  name: 'Code Generator',
  triggerType: 'file_event',
  failureMode: 'notify',
  timeoutMs: LIMITS.codeGenerationTimeoutMs,
  maxConcurrent: 5,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface CodeGeneratorInput {
  promptId: string;
  projectId: string;
  sanitizedPrompt: string;
  model?: string;
}

export interface CodeGeneratorOutput {
  files: GeneratedFile[];
  tokensUsed: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: CodeGeneratorInput,
  ctx: HookContext,
): Promise<HookResult<CodeGeneratorOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { files: [], tokensUsed: 0, model: 'none' },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would generate code for project "${input.projectId}" from prompt "${input.promptId}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { files: [], tokensUsed: 0, model: input.model ?? 'claude-sonnet-4-20250514' },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 3
  ctx.log(`[${HOOK_METADATA.id}] Generating code for project "${input.projectId}"`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: { files: [], tokensUsed: 0, model: input.model ?? 'claude-sonnet-4-20250514' },
    durationMs: Date.now() - start,
  };
}
