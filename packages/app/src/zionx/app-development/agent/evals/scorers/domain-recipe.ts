/**
 * Domain-recipe scorer — runs Hook 13's per-domain checks (streak rendered,
 * swipe-to-delete, custom win modal, etc.) against the user prompt's
 * detected domain.
 */

import type { EvalScorer, EvalScorerResult } from '../types.js';
import { run as runHook13 } from '../../../pipeline/13-domain-fitness-auditor.js';
import { loadReviewableFiles, makeReviewCtx } from '../../subagents/loader.js';

export const domainRecipeScorer: EvalScorer = {
  name: 'domain-recipe',
  async run(input): Promise<EvalScorerResult> {
    const files = await loadReviewableFiles(input.workspace, input.projectId);
    const ctx = makeReviewCtx('eval-domain-recipe');
    const result = await runHook13({ projectId: input.projectId, prompt: input.prompt, files }, ctx as never);
    const score = result.data?.score;
    if (!score) return { scorer: 'domain-recipe', score: 0, passed: false, details: result.error ?? 'no score' };
    return {
      scorer: 'domain-recipe',
      score: score.total,
      passed: score.passed,
      details: score.failedChecks.map((c) => c.label).join(', ') || 'all checks passed',
    };
  },
};
