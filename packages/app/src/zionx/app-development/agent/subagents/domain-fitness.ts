/**
 * Domain-fitness reviewer — wraps Hook 13.
 *
 * Needs the user's original prompt to detect domain (habit / todo / recipe /
 * workout / game / journal / generic). If unset, Hook 13 will route to
 * generic checks.
 */

import type { Subagent, SubagentResult, SubagentInput } from '../types.js';
import { run as runHook13 } from '../../pipeline/13-domain-fitness-auditor.js';
import { loadReviewableFiles, makeReviewCtx } from './loader.js';

export interface DomainFitnessInput extends SubagentInput {
  prompt?: string;
}

/** Constructor: returns a Subagent bound to a specific prompt. */
export function createDomainFitnessReviewer(prompt: string): Subagent {
  return {
    name: 'domain-fitness-reviewer',
    description:
      'Detect the app\'s domain from the user prompt and run domain-specific quality checks ' +
      '(habit: streak + add flow + calendar; todo: swipe + animated check; game: custom win modal + reset; ...).',
    async run({ projectId, workspace }): Promise<SubagentResult> {
      const files = await loadReviewableFiles(workspace, projectId);
      const ctx = makeReviewCtx('domain-fitness');
      const result = await runHook13({ projectId, prompt, files }, ctx as never);
      const score = result.data?.score;
      if (!score) {
        return {
          passed: false,
          score: 0,
          fixes: ['Hook 13 returned no score.'],
          details: result.error ?? 'unknown',
        };
      }
      return {
        passed: score.passed,
        score: score.total,
        fixes: score.failedChecks.map((c) =>
          c.evidence ? `${c.label} — ${c.evidence}` : c.label,
        ),
        details:
          `Domain fitness score: ${score.total}/${score.passThreshold ?? 70}. ` +
          `${score.passed ? 'PASS' : 'FAIL'}.`,
      };
    },
  };
}
