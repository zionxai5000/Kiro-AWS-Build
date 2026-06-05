/**
 * Fix-applied scorer — for `fix-*` tasks (broken build / typecheck error).
 * The seed files contain a known bug; the agent must produce a state where
 * a hand-written predicate returns true.
 */

import type { EvalScorer, EvalScorerInput, EvalScorerResult } from '../types.js';

export interface FixContext {
  /** Predicate that returns true when the bug is repaired. */
  predicate: (workspace: EvalScorerInput['workspace'], projectId: string) => Promise<boolean>;
  description: string;
}

let CONTEXT: FixContext | null = null;

export function setFixContext(ctx: FixContext): void {
  CONTEXT = ctx;
}

export const fixAppliedScorer: EvalScorer = {
  name: 'fix-applied',
  async run(input: EvalScorerInput): Promise<EvalScorerResult> {
    if (!CONTEXT) {
      return { scorer: 'fix-applied', score: 0, passed: false, details: 'no fix context set' };
    }
    let fixed = false;
    try {
      fixed = await CONTEXT.predicate(input.workspace, input.projectId);
    } catch (err) {
      return { scorer: 'fix-applied', score: 0, passed: false, details: `predicate threw: ${(err as Error).message}` };
    }
    return {
      scorer: 'fix-applied',
      score: fixed ? 100 : 0,
      passed: fixed,
      details: fixed ? `fix applied: ${CONTEXT.description}` : `bug persists: ${CONTEXT.description}`,
    };
  },
};
