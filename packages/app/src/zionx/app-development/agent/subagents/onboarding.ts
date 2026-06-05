/**
 * Onboarding reviewer — wraps Hook 15.
 */

import type { Subagent, SubagentResult } from '../types.js';
import { run as runHook15 } from '../../pipeline/15-onboarding-auditor.js';
import { loadReviewableFiles, makeReviewCtx } from './loader.js';

export const onboardingReviewer: Subagent = {
  name: 'onboarding-reviewer',
  description:
    'Verify the four onboarding rules: OnboardingFlow.tsx exists, app routes to it ' +
    'when hasCompletedOnboarding is false, the flag persists, and a Skip affordance exists.',
  async run({ projectId, workspace }): Promise<SubagentResult> {
    const files = await loadReviewableFiles(workspace, projectId);
    const ctx = makeReviewCtx('onboarding');
    const result = await runHook15({ projectId, files }, ctx as never);
    const score = result.data?.score;
    if (!score) {
      return {
        passed: false,
        score: 0,
        fixes: ['Hook 15 returned no score.'],
        details: result.error ?? 'unknown',
      };
    }
    return {
      passed: score.passed,
      score: score.total,
      fixes: score.failedChecks.map((c) =>
        c.evidence ? `${c.label} — ${c.evidence}` : c.label,
      ),
      details: `Onboarding score: ${score.total}/100. ${score.passed ? 'PASS' : 'FAIL'}.`,
    };
  },
};
