/**
 * Persistence reviewer — wraps Hook 12.
 */

import type { Subagent, SubagentResult } from '../types.js';
import { run as runHook12 } from '../../pipeline/12-persistence-auditor.js';
import { loadReviewableFiles, makeReviewCtx } from './loader.js';

export const persistenceReviewer: Subagent = {
  name: 'persistence-reviewer',
  description:
    'Verify zustand + persist + AsyncStorage with named storage key, no hardcoded data arrays in screens. ' +
    'Four hard rules; any failure = fail.',
  async run({ projectId, workspace }): Promise<SubagentResult> {
    const files = await loadReviewableFiles(workspace, projectId);
    const ctx = makeReviewCtx('persistence');
    const result = await runHook12({ projectId, files }, ctx as never);
    const score = result.data?.score;
    if (!score) {
      return {
        passed: false,
        score: 0,
        fixes: ['Hook 12 returned no score.'],
        details: result.error ?? 'unknown',
      };
    }
    return {
      passed: score.passed,
      score: score.total,
      fixes: score.failedChecks.map((c) =>
        c.evidence ? `${c.label} — ${c.evidence}` : c.label,
      ),
      details: `Persistence score: ${score.total}/100. ` +
        `${score.passed ? 'PASS' : 'FAIL'} — ${score.failedChecks.length} failed checks.`,
    };
  },
};
