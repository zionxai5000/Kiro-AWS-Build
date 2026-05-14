/**
 * Pipeline Hook 01: Prompt Sanitizer
 *
 * Trigger: Incoming API request with raw prompt
 * Action: Scan for API keys, credit cards, JWTs, emails. Redact and warn.
 * Failure mode: HALT — never let unsanitized data with halt-severity secrets proceed.
 * Timeout: 10s
 * Concurrency: 1
 *
 * Behavior:
 * - Calls sanitizePrompt() from utils/sanitizer.ts
 * - If any warning has severity 'halt' → returns success: false (pipeline stops)
 * - If only 'warn' severity → logs warnings, passes sanitized text forward
 * - Respects dryRun (logs what it would do, returns input unchanged)
 * - Respects kill switch (skips entirely if disabled)
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { sanitizePrompt } from '../utils/sanitizer.js';
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
  warnings: Array<{
    type: string;
    severity: 'halt' | 'warn';
    position: number;
    length: number;
  }>;
  haltCount: number;
  warnCount: number;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: PromptSanitizerInput,
  ctx: HookContext,
): Promise<HookResult<PromptSanitizerOutput>> {
  const start = Date.now();

  // Kill switch check
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { sanitized: input.raw, warnings: [], haltCount: 0, warnCount: 0, passed: true },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  // Dry-run: log what we would do, return input unchanged
  if (dryRun) {
    const dryResult = sanitizePrompt(input.raw);
    const haltCount = dryResult.warnings.filter(w => w.severity === 'halt').length;
    const warnCount = dryResult.warnings.filter(w => w.severity === 'warn').length;
    ctx.log(
      `[${HOOK_METADATA.id}] DRY RUN — scanned prompt "${input.promptId}" (${input.raw.length} chars). ` +
      `Would find: ${haltCount} halt, ${warnCount} warn. Would ${haltCount > 0 ? 'REJECT' : 'PASS'}.`
    );
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: {
        sanitized: input.raw, // dry-run returns original unchanged
        warnings: dryResult.warnings,
        haltCount,
        warnCount,
        passed: haltCount === 0,
      },
      durationMs: Date.now() - start,
    };
  }

  // Live execution
  ctx.log(`[${HOOK_METADATA.id}] Scanning prompt "${input.promptId}" (${input.raw.length} chars)`);

  const result = sanitizePrompt(input.raw);
  const haltCount = result.warnings.filter(w => w.severity === 'halt').length;
  const warnCount = result.warnings.filter(w => w.severity === 'warn').length;

  // Log warnings
  if (warnCount > 0) {
    ctx.log(`[${HOOK_METADATA.id}] ${warnCount} warn-severity item(s) detected and redacted`);
  }

  // Halt on halt-severity findings
  if (haltCount > 0) {
    const types = result.warnings
      .filter(w => w.severity === 'halt')
      .map(w => w.type)
      .join(', ');
    ctx.log(`[${HOOK_METADATA.id}] HALT — ${haltCount} secret(s) detected: ${types}`);

    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: `Prompt rejected: ${haltCount} secret(s) detected (${types}). Remove secrets and retry.`,
      data: {
        sanitized: result.sanitized,
        warnings: result.warnings,
        haltCount,
        warnCount,
        passed: false,
      },
      durationMs: Date.now() - start,
    };
  }

  // Pass — no halt-severity findings
  ctx.log(`[${HOOK_METADATA.id}] PASS — prompt clean (${warnCount} warn-only items redacted)`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: {
      sanitized: result.sanitized,
      warnings: result.warnings,
      haltCount: 0,
      warnCount,
      passed: true,
    },
    durationMs: Date.now() - start,
  };
}
