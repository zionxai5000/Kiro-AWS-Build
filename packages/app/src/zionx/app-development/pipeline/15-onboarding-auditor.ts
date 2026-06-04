/**
 * Pipeline Hook 15: Onboarding Auditor
 *
 * Trigger: After Hook 2 finishes streaming files (parallel with Hooks 11/12/13).
 * Action: Check that the generated app has a real onboarding flow with a
 *         persisted "hasCompletedOnboarding" flag and a routing decision.
 * Failure mode: NOTIFY (orchestrator decides re-prompt vs ship).
 *
 * Encodes the SECTION 30-onboarding.md requirement: every app ships a first-run
 * walkthrough plus a re-openable "How it works".
 */

import { isHookEnabled } from '../config/hooks.config.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { QualityCheck, QualityScore } from './quality-types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'onboarding-auditor',
  name: 'Onboarding Auditor',
  triggerType: 'manual',
  failureMode: 'notify',
  timeoutMs: 3_000,
  maxConcurrent: 1,
} as const;

export interface OnboardingAuditInput {
  projectId: string;
  files: Record<string, string>;
}

export interface OnboardingAuditOutput {
  score: QualityScore;
}


export async function run(
  input: OnboardingAuditInput,
  ctx: HookContext,
): Promise<HookResult<OnboardingAuditOutput>> {
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

  const allFiles = Object.entries(input.files);
  const allPaths = allFiles.map(([p]) => p);
  const allSrc = allFiles.map(([, c]) => c).join('\n\n');

  const breakdown: QualityCheck[] = [];

  // Check 1: an onboarding component or directory exists
  const hasOnboardingFile =
    allPaths.some((p) => /OnboardingFlow\.(tsx|jsx)$/i.test(p)) ||
    allPaths.some((p) => /\/onboarding\//i.test(p)) ||
    allPaths.some((p) => /^onboarding\//i.test(p));
  breakdown.push({
    id: 'onboarding-component',
    label: 'Onboarding component or directory exists',
    weight: 40,
    hardFail: true,
    passed: hasOnboardingFile,
    evidence: hasOnboardingFile ? undefined : 'No OnboardingFlow.tsx or app/onboarding/ found. Add a 3-5 step skippable walkthrough.',
  });

  // Check 2: hasCompletedOnboarding flag exists somewhere
  const hasFlag = /hasCompletedOnboarding|onboardingComplete|onboardingDone|hasSeenOnboarding/i.test(allSrc);
  breakdown.push({
    id: 'onboarding-flag',
    label: 'hasCompletedOnboarding (or equivalent) flag declared',
    weight: 30,
    hardFail: true,
    passed: hasFlag,
    evidence: hasFlag ? undefined : 'No hasCompletedOnboarding flag found. The app must remember whether the user has seen the walkthrough.',
  });

  // Check 3: routing decision based on the flag (so onboarding actually shows on first launch)
  const hasRoutingDecision =
    /(if|\?)\s*\(?\s*!?(hasCompletedOnboarding|onboardingComplete|onboardingDone|hasSeenOnboarding)/i.test(allSrc) ||
    /router\.(replace|push)\([^)]*onboarding/i.test(allSrc) ||
    /<Redirect[^>]*href=['"][^'"]*onboarding/i.test(allSrc);
  breakdown.push({
    id: 'onboarding-routing',
    label: 'Routing decision based on the onboarding flag',
    weight: 20,
    hardFail: false,
    passed: hasRoutingDecision,
    evidence: hasRoutingDecision ? undefined : 'No routing logic that checks the flag — onboarding may never trigger or may show every time.',
  });

  // Check 4: skip / dismiss affordance
  const hasSkip = /skip|dismiss|maybe later/i.test(allSrc);
  breakdown.push({
    id: 'onboarding-skip',
    label: 'Skip affordance present',
    weight: 10,
    hardFail: false,
    passed: hasSkip,
    evidence: hasSkip ? undefined : 'No "Skip" affordance — must let users opt out of onboarding.',
  });

  const total = breakdown.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const failedChecks = breakdown.filter((c) => !c.passed);
  const hardFailHit = failedChecks.some((c) => c.hardFail);
  const passed = !hardFailHit && total >= 70;
  const score: QualityScore = { total, breakdown, failedChecks, passed, passThreshold: 70 };

  ctx.log(`[${HOOK_METADATA.id}] score=${total}/100 pass=${passed} hardFail=${hardFailHit}`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: ctx.dryRun,
    data: { score },
    durationMs: Date.now() - start,
  };
}
