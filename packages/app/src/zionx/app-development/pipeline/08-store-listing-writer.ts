/**
 * Pipeline Hook 08: Store Listing Writer
 *
 * Trigger: Manual API call "Prepare for Store"
 * Action: Generate App Store description, keywords, promotional text.
 * Failure mode: NOTIFY
 * Timeout: 60s
 * Concurrency: 1 per projectId
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { StoreListing } from '../types/index.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'store-listing-writer',
  name: 'Store Listing Writer',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.storeListingTimeoutMs,
  maxConcurrent: 1,
} as const;

export interface StoreListingWriterInput {
  projectId: string;
  appName: string;
  appDescription: string;
  category?: string;
}

export interface StoreListingWriterOutput {
  listing: StoreListing | null;
}

export async function run(
  input: StoreListingWriterInput,
  ctx: HookContext,
): Promise<HookResult<StoreListingWriterOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { listing: null },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would generate store listing for "${input.appName}" in project "${input.projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { listing: null },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 8
  ctx.log(`[${HOOK_METADATA.id}] Generating store listing for "${input.appName}"`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { listing: null },
    durationMs: Date.now() - start,
  };
}
