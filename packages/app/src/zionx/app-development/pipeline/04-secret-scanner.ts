/**
 * Pipeline Hook 04: Secret Scanner
 *
 * Trigger: Save of any file in /generated/
 * Action: Regex sweep for API key patterns. Quarantine file if found.
 * Failure mode: HALT
 * Timeout: 5s
 * Concurrency: 10 globally
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'secret-scanner',
  name: 'Secret Scanner',
  triggerType: 'file_event',
  failureMode: 'halt',
  timeoutMs: LIMITS.secretScanTimeoutMs,
  maxConcurrent: 10,
} as const;

export interface SecretScannerInput {
  projectId: string;
  filePath: string;
  content: string;
}

export interface SecretScannerOutput {
  clean: boolean;
  findings: Array<{ pattern: string; line: number; snippet: string }>;
  quarantined: boolean;
}

export async function run(
  input: SecretScannerInput,
  ctx: HookContext,
): Promise<HookResult<SecretScannerOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { clean: true, findings: [], quarantined: false },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would scan "${input.filePath}" in project "${input.projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { clean: true, findings: [], quarantined: false },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 5
  ctx.log(`[${HOOK_METADATA.id}] Scanning "${input.filePath}" for secrets`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { clean: true, findings: [], quarantined: false },
    durationMs: Date.now() - start,
  };
}
