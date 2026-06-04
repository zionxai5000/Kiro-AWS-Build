/**
 * Pipeline Hook 14: Pre-Generation Spec Card
 *
 * Trigger: Streamed by the LLM as its first output (before any file).
 * Action: Parse the <spec>{...}</spec> block, validate the 10 required
 *         keys are present and non-empty.
 * Failure mode: NOTIFY the orchestrator → re-prompt the LLM.
 *
 * The spec card is also surfaced to the dashboard chat so the user sees
 * what the agent committed to before any code is produced. This is the
 * "agent's contract" — Hook 11/12/13 then check that the actual output
 * honors what was promised.
 */

import { isHookEnabled } from '../config/hooks.config.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { SpecCard } from './quality-types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'spec-card',
  name: 'Pre-Generation Spec Card',
  triggerType: 'manual',
  failureMode: 'notify',
  timeoutMs: 2_000,
  maxConcurrent: 1,
} as const;

export interface SpecCardInput {
  /** The first ~3000 chars of the LLM stream — should contain the <spec> block. */
  streamPrefix: string;
}

export interface SpecCardOutput {
  found: boolean;
  spec?: SpecCard;
  missingKeys: string[];
  rawJson?: string;
}

const REQUIRED_KEYS: (keyof SpecCard)[] = [
  'domain', 'userGoal', 'screens', 'stateModel', 'seed',
  'persistence', 'visualAnchor', 'hero', 'emptyState', 'failCheck',
];


// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: SpecCardInput,
  ctx: HookContext,
): Promise<HookResult<SpecCardOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] disabled — skipping spec card check`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { found: false, missingKeys: [] },
      durationMs: Date.now() - start,
    };
  }

  // Find the <spec> ... </spec> block. The captured group is the inner
  // content; we strip optional ```json fences from the captured text
  // afterwards rather than including them in the regex (which proved
  // unreliable due to the non-greedy capture interaction).
  const blockMatch = input.streamPrefix.match(/<spec>([\s\S]*?)<\/spec>/i);
  if (!blockMatch || !blockMatch[1]) {
    ctx.log(`[${HOOK_METADATA.id}] no <spec> block found in stream prefix`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      error: 'spec_card_missing',
      data: { found: false, missingKeys: REQUIRED_KEYS },
      durationMs: Date.now() - start,
    };
  }

  // Strip optional ```json fences from the inner content.
  const rawJson = blockMatch[1]
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  let spec: Partial<SpecCard>;
  try {
    spec = JSON.parse(rawJson) as Partial<SpecCard>;
  } catch (err) {
    ctx.log(`[${HOOK_METADATA.id}] JSON parse failed: ${(err as Error).message}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      error: 'spec_card_invalid_json',
      data: { found: true, missingKeys: REQUIRED_KEYS, rawJson },
      durationMs: Date.now() - start,
    };
  }

  const missingKeys: string[] = [];
  for (const key of REQUIRED_KEYS) {
    const v = spec[key];
    if (v === undefined || v === null) { missingKeys.push(key); continue; }
    if (typeof v === 'string' && v.trim().length < 3) { missingKeys.push(key); continue; }
    if (Array.isArray(v) && v.length === 0) { missingKeys.push(key); continue; }
  }

  const found = missingKeys.length === 0;
  ctx.log(`[${HOOK_METADATA.id}] spec card ${found ? 'OK' : 'MISSING'} keys=${missingKeys.join(',')}`);

  return {
    success: found,
    hookId: HOOK_METADATA.id,
    dryRun: ctx.dryRun,
    data: { found, spec: found ? (spec as SpecCard) : undefined, missingKeys, rawJson },
    durationMs: Date.now() - start,
  };
}
