/**
 * Persistence scorer — confirms the generated app uses zustand persist +
 * AsyncStorage with a named storage key, and that there are no hardcoded
 * data arrays in screen files. Lifted from Hook 12.
 */

import type { EvalScorer, EvalScorerResult } from '../types.js';
import { run as runHook12 } from '../../../pipeline/12-persistence-auditor.js';
import { loadReviewableFiles, makeReviewCtx } from '../../subagents/loader.js';

export const persistenceScorer: EvalScorer = {
  name: 'persistence',
  async run(input): Promise<EvalScorerResult> {
    const files = await loadReviewableFiles(input.workspace, input.projectId);
    const ctx = makeReviewCtx('eval-persistence');
    const result = await runHook12({ projectId: input.projectId, files }, ctx as never);
    const score = result.data?.score;
    if (!score) return { scorer: 'persistence', score: 0, passed: false, details: result.error ?? 'no score' };
    return {
      scorer: 'persistence',
      score: score.total,
      passed: score.passed,
      details: score.failedChecks.map((c) => c.label).join(', ') || 'all checks passed',
    };
  },
};
