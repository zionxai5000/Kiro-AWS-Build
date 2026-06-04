/**
 * Pipeline Hook 12: Persistence Auditor
 *
 * Trigger: After Hook 2 finishes streaming files (parallel with Hook 11/13).
 * Action: Confirm zustand persist middleware backed by AsyncStorage exists,
 *         and that no screen contains hardcoded user-data arrays.
 * Failure mode: NOTIFY (orchestrator decides re-prompt vs ship).
 *
 * The 4 checks below collectively encode the SECTION 0.5 PERSISTENCE rule:
 *   - "ZERO static data arrays for user content"
 *   - "All user-created data MUST flow through Zustand persist + AsyncStorage"
 *   - "First-launch seed only when persisted state is empty"
 */

import { isHookEnabled } from '../config/hooks.config.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { QualityCheck, QualityScore } from './quality-types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'persistence-auditor',
  name: 'Persistence Auditor',
  triggerType: 'manual',
  failureMode: 'notify',
  timeoutMs: 5_000,
  maxConcurrent: 1,
} as const;

export interface PersistenceAuditInput {
  projectId: string;
  files: Record<string, string>;
}

export interface PersistenceAuditOutput {
  score: QualityScore;
}


// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: PersistenceAuditInput,
  ctx: HookContext,
): Promise<HookResult<PersistenceAuditOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] disabled`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { score: { total: 100, breakdown: [], passed: true, passThreshold: 0, failedChecks: [] } },
      durationMs: Date.now() - start,
    };
  }

  // Find store files (anything under store/ or stores/ directory)
  const storeFiles = Object.entries(input.files).filter(([p]) =>
    /^stores?\//.test(p) || /\/stores?\//.test(p) || /-store\.(t|j)sx?$/.test(p)
  );
  const screenFiles = Object.entries(input.files).filter(([p]) =>
    /\.(tsx|jsx)$/.test(p) && !/^components\//.test(p) && !/-store\./.test(p) && !/^stores?\//.test(p)
  );
  const storeSrc = storeFiles.map(([, c]) => c).join('\n\n');
  const screenSrc = screenFiles.map(([, c]) => c).join('\n\n');

  const breakdown: QualityCheck[] = [];

  // Check 1: zustand persist middleware imported and used
  const hasPersist = /from ['"]zustand\/middleware['"]/.test(storeSrc) &&
                     /persist\s*\(/.test(storeSrc);
  breakdown.push({
    id: 'zustand-persist-imported',
    label: 'zustand/middleware persist() imported and applied to a store',
    weight: 30,
    hardFail: true,
    passed: hasPersist,
    evidence: hasPersist ? undefined : 'No persist() call found in any store file. Wrap the create() with persist().',
  });

  // Check 2: AsyncStorage imported and passed to createJSONStorage.
  // The lambda form `createJSONStorage(() => AsyncStorage)` contains
  // unbalanced parens for [^)]* so we look for the symbol within ~80 chars
  // after the createJSONStorage open paren.
  const hasAsyncStorage =
    /from ['"]@react-native-async-storage\/async-storage['"]/.test(storeSrc) &&
    /createJSONStorage\s*\([\s\S]{0,80}?AsyncStorage/.test(storeSrc);
  breakdown.push({
    id: 'asyncstorage-wired',
    label: 'AsyncStorage passed to createJSONStorage in persist config',
    weight: 30,
    hardFail: true,
    passed: hasAsyncStorage,
    evidence: hasAsyncStorage ? undefined : 'createJSONStorage() must wrap AsyncStorage. Without it, data is lost on relaunch.',
  });


  // Check 3: no hardcoded user-data arrays in screens.
  // Pattern matches things like `const items = [{ name: 'Foo', ... }, { name: 'Bar' }, ...]`
  // which usually represent baked-in fake data the LLM threw in instead of wiring the store.
  // Exception: stores with names like SEED_*, INITIAL_*, DEFAULT_* are allowed first-launch seeds.
  const allLines = screenSrc.split(/\r?\n/);
  const hardcodeLines = allLines.filter((line) =>
    /const\s+(\w+)(?:Data|Items|List|Habits|Tasks|Recipes|Sessions)\s*=\s*\[/i.test(line)
    && !/SEED_|INITIAL_|DEFAULT_|EXAMPLE_/i.test(line)
  );
  // Now look at multi-line arrays starting after that line:
  // We re-scan the source for `const X[Data|Items|...] = [` openings, then check
  // if `name:` appears within ~600 chars after, AND the var name doesn't start with SEED/INITIAL/DEFAULT.
  let hardcodeHits = 0;
  const reArrayDecl = /const\s+(\w+)\s*=\s*\[/g;
  let m: RegExpExecArray | null;
  while ((m = reArrayDecl.exec(screenSrc))) {
    const varName = m[1] ?? '';
    if (/^(SEED|INITIAL|DEFAULT|EXAMPLE|MOCK)_/i.test(varName)) continue;
    if (!/(Data|Items|List|Habits|Tasks|Recipes|Sessions)$/i.test(varName)) continue;
    const after = screenSrc.slice(m.index, m.index + 600);
    if (/\{[^}]*name\s*:/.test(after)) hardcodeHits += 1;
  }
  breakdown.push({
    id: 'no-hardcoded-user-data',
    label: 'No hardcoded user-data arrays in screens',
    weight: 30,
    hardFail: true,
    passed: hardcodeHits === 0,
    evidence: hardcodeHits === 0 ? undefined : `Found ${hardcodeHits} hardcoded data array(s) in screens. Move to the persist store and seed only on first launch.`,
  });

  // Check 4: persist key declared with non-default name
  const hasNamedKey = /name\s*:\s*['"][\w-]+['"]/.test(storeSrc);
  breakdown.push({
    id: 'persist-key-named',
    label: 'persist() config has a named storage key',
    weight: 10,
    hardFail: false,
    passed: hasNamedKey,
    evidence: hasNamedKey ? undefined : 'persist({ name: "..." }) missing — persisted slot will collide.',
  });

  const total = breakdown.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const failedChecks = breakdown.filter((c) => !c.passed);
  const hardFailHit = failedChecks.some((c) => c.hardFail);
  const passed = !hardFailHit;

  const score: QualityScore = {
    total,
    breakdown,
    failedChecks,
    passed,
    passThreshold: 90,  // persistence is binary — almost everything must pass
  };

  ctx.log(
    `[${HOOK_METADATA.id}] score=${total}/100 pass=${passed} ` +
    `failed=${failedChecks.length} hardFail=${hardFailHit}`,
  );

  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: ctx.dryRun,
    data: { score },
    durationMs: Date.now() - start,
  };
}
