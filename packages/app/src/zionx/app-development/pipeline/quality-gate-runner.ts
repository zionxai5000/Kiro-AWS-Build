/**
 * Quality Gate Runner — orchestrator for Hooks 11/12/13 + retry loop.
 *
 * Called by the generateCode handler AFTER the LLM stream finishes. It:
 *   1. Reads every workspace file for the project
 *   2. Runs Hooks 11/12/13 in parallel
 *   3. If all pass: emits QUALITY_GATE_PASSED, done
 *   4. If any fail: builds a RetryDirective, calls llmService.streamGeneration
 *      again with the directive prepended, then re-runs the hooks
 *   5. Max 2 retries (LIMITS.qualityRetriesMax). After exhausted, emits
 *      QUALITY_GATE_FAILED and marks the project meta with qualityBarFailed.
 *
 * The retry directive is the difference between text-mandate and enforcement.
 */

import { LIMITS } from '../config/limits.js';
import { run as runVisualPolish } from './11-visual-polish-validator.js';
import { run as runPersistence } from './12-persistence-auditor.js';
import { run as runDomainFitness } from './13-domain-fitness-auditor.js';
import { APPDEV_EVENTS, createAppDevEvent } from '../events/event-types.js';
import type { HookContext } from './types.js';
import type { QualityScore, RetryDirective } from './quality-types.js';
import type { Workspace } from '../workspace/workspace.js';
import type { LLMService, StreamGenerationOptions } from '../services/llm-service.js';
import type { EventBusService } from '@seraphim/core';

export interface QualityGateInput {
  projectId: string;
  prompt: string;
  workspace: Workspace;
  llmService: LLMService;
  eventBus: EventBusService;
  /** Optional re-prompt callback so handler can stream re-tries to the same SSE channel. */
  streamOptions?: StreamGenerationOptions;
  tenantId?: string;
  ctx: HookContext;
}

export interface QualityGateResult {
  passed: boolean;
  retries: number;
  finalScores: {
    visualPolish: QualityScore;
    persistence: QualityScore;
    domainFitness: QualityScore;
  };
  directive?: RetryDirective;
}


/**
 * Read every .tsx/.ts/.js file in the project workspace into a map.
 * Skips node_modules, .git, dist directories.
 */
async function loadProjectFiles(workspace: Workspace, projectId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = await workspace.listFiles(projectId).catch(() => [] as string[]);
  for (const path of list) {
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) continue;
    if (path.includes('node_modules') || path.startsWith('.git/') || path.startsWith('dist/')) continue;
    try {
      out[path] = await workspace.readFile(projectId, path);
    } catch {
      /* skip unreadable files */
    }
  }
  return out;
}

/**
 * Build the retry directive that gets prepended to the next LLM prompt.
 * Lists every failed check with its evidence, so the agent knows exactly
 * what to fix.
 */
function buildRetryDirective(
  retryNumber: number,
  visualPolish: QualityScore,
  persistence: QualityScore,
  domainFitness: QualityScore,
): RetryDirective {
  const failureBullets: string[] = [];
  for (const c of [...visualPolish.failedChecks, ...persistence.failedChecks, ...domainFitness.failedChecks]) {
    failureBullets.push(`- ${c.label}${c.evidence ? ` — ${c.evidence}` : ''}`);
  }
  // The set of files most likely to need fixing — we don't know specifically,
  // so we ask Claude to regenerate any screen file plus the store.
  const filesToFix = ['app/(tabs)/index.tsx', 'store/*.ts'];
  return {
    retryNumber,
    scores: { visualPolish, persistence, domainFitness },
    filesToFix,
    failureBullets,
  };
}

/**
 * Render the directive as a prefix the LLM sees on the next call.
 */
export function renderDirectiveForLLM(directive: RetryDirective, originalPrompt: string): string {
  return [
    `[QUALITY GATE RETRY #${directive.retryNumber}]`,
    '',
    `Your previous output failed the quality gate with these scores:`,
    `  Visual Polish: ${directive.scores.visualPolish?.total ?? 0}/${directive.scores.visualPolish?.passThreshold ?? 70}`,
    `  Persistence: ${directive.scores.persistence?.total ?? 0}/100`,
    `  Domain Fitness: ${directive.scores.domainFitness?.total ?? 0}/${directive.scores.domainFitness?.passThreshold ?? 70}`,
    '',
    'These specific checks failed:',
    ...directive.failureBullets,
    '',
    'Regenerate the affected files (especially app/(tabs)/index.tsx and any store) so every failed check passes. Apply SECTION 0.5 visual polish rules and SECTION 0 mandate strictly. Re-emit the spec card first.',
    '',
    `--- ORIGINAL USER PROMPT ---`,
    originalPrompt,
  ].join('\n');
}


/**
 * Run all 3 validators in parallel against the current workspace state.
 */
async function runValidators(
  input: QualityGateInput,
  files: Record<string, string>,
): Promise<{ visualPolish: QualityScore; persistence: QualityScore; domainFitness: QualityScore }> {
  const [vp, ps, df] = await Promise.all([
    runVisualPolish({ projectId: input.projectId, files }, input.ctx),
    runPersistence({ projectId: input.projectId, files }, input.ctx),
    runDomainFitness({ projectId: input.projectId, prompt: input.prompt, files }, input.ctx),
  ]);
  // Each hook returns success=true even when the score fails — the score
  // is the contract. Use defensive defaults if the hook didn't return data.
  const empty: QualityScore = { total: 0, breakdown: [], passed: false, passThreshold: 0, failedChecks: [] };
  return {
    visualPolish: vp.data?.score ?? empty,
    persistence: ps.data?.score ?? empty,
    domainFitness: df.data?.score ?? empty,
  };
}

/**
 * Main runner. Returns the final result after up to LIMITS.qualityRetriesMax retries.
 */
export async function runQualityGate(input: QualityGateInput): Promise<QualityGateResult> {
  const maxRetries = LIMITS.qualityRetriesMax ?? 2;
  let retries = 0;
  let scores = { visualPolish: emptyScore(), persistence: emptyScore(), domainFitness: emptyScore() };

  while (retries <= maxRetries) {
    const files = await loadProjectFiles(input.workspace, input.projectId);
    scores = await runValidators(input, files);

    await input.eventBus.publish(createAppDevEvent(
      APPDEV_EVENTS.QUALITY_VALIDATOR_FIRED,
      {
        projectId: input.projectId,
        retry: retries,
        visualPolishScore: scores.visualPolish.total,
        persistenceScore: scores.persistence.total,
        domainFitnessScore: scores.domainFitness.total,
      },
      input.tenantId,
    ));

    const allPass =
      scores.visualPolish.passed &&
      scores.persistence.passed &&
      scores.domainFitness.passed;

    if (allPass) {
      await input.eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.QUALITY_GATE_PASSED,
        { projectId: input.projectId, retries, visualPolishScore: scores.visualPolish.total },
        input.tenantId,
      ));
      return { passed: true, retries, finalScores: scores };
    }

    if (retries >= maxRetries) break;

    // Build directive + re-prompt
    const directive = buildRetryDirective(retries + 1, scores.visualPolish, scores.persistence, scores.domainFitness);
    await input.eventBus.publish(createAppDevEvent(
      APPDEV_EVENTS.QUALITY_RETRY_REQUESTED,
      { projectId: input.projectId, retry: retries + 1, failures: directive.failureBullets },
      input.tenantId,
    ));

    const retryPrompt = renderDirectiveForLLM(directive, input.prompt);
    try {
      await input.llmService.streamGeneration(retryPrompt, input.streamOptions ?? {});
    } catch (err) {
      input.ctx.log(`[quality-gate] retry ${retries + 1} stream error: ${(err as Error).message}`);
      break; // stop retrying if the LLM call itself failed
    }
    retries += 1;
  }

  // Failed after all retries
  await input.eventBus.publish(createAppDevEvent(
    APPDEV_EVENTS.QUALITY_GATE_FAILED,
    {
      projectId: input.projectId,
      retries,
      visualPolishScore: scores.visualPolish.total,
      persistenceScore: scores.persistence.total,
      domainFitnessScore: scores.domainFitness.total,
      failures: [
        ...scores.visualPolish.failedChecks,
        ...scores.persistence.failedChecks,
        ...scores.domainFitness.failedChecks,
      ].map((c) => c.label),
    },
    input.tenantId,
  ));
  return { passed: false, retries, finalScores: scores };
}

function emptyScore(): QualityScore {
  return { total: 0, breakdown: [], passed: false, passThreshold: 0, failedChecks: [] };
}
