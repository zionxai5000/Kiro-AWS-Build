/**
 * Visual-polish reviewer — wraps Hook 11 as a `Subagent` the agent loop
 * can `spawn_subagent('visual-polish-reviewer')`.
 */

import type { Subagent, SubagentResult } from '../types.js';
import { run as runHook11 } from '../../pipeline/11-visual-polish-validator.js';
import { loadReviewableFiles, makeReviewCtx } from './loader.js';

export const visualPolishReviewer: Subagent = {
  name: 'visual-polish-reviewer',
  description:
    'Score visual polish per-screen against the design rulebook. ' +
    'Returns the WORST per-screen score so polish can\'t hide in unused files. ' +
    'Threshold ≥ 70 to pass.',
  async run({ projectId, workspace }): Promise<SubagentResult> {
    const files = await loadReviewableFiles(workspace, projectId);
    const ctx = makeReviewCtx('visual-polish');
    const result = await runHook11({ projectId, files }, ctx as never);
    const score = result.data?.score;
    if (!score) {
      return {
        passed: false,
        score: 0,
        fixes: ['Hook 11 returned no score — likely no .tsx files found in workspace.'],
        details: result.error ?? 'unknown',
      };
    }
    return {
      passed: score.passed,
      score: score.total,
      fixes: score.failedChecks.map((c) =>
        c.evidence ? `${c.label} — ${c.evidence}` : c.label,
      ),
      details: `Visual polish score: ${score.total}/100 (threshold ${score.passThreshold ?? 70}). ` +
        `${score.passed ? 'PASS' : 'FAIL'} — ${score.failedChecks.length} failed checks.`,
    };
  },
};
