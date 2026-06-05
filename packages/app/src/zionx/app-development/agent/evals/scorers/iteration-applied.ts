/**
 * Iteration-applied scorer — for `iterate-*` tasks. Confirms that the
 * agent actually MODIFIED the seeded files instead of regenerating from
 * scratch. The eval task seeds a known starting workspace; this scorer
 * checks that:
 *   - At least one seeded file was modified (not deleted)
 *   - At least one seeded file was preserved (not all rewritten)
 *   - The iteration target string appears in some file
 */

import type { EvalScorer, EvalScorerInput, EvalScorerResult } from '../types.js';

export interface IterationContext {
  seedPaths: string[];
  expectedSubstring?: string;
}

let CONTEXT: IterationContext | null = null;

/** Set per-task before invoking the scorer. */
export function setIterationContext(ctx: IterationContext): void {
  CONTEXT = ctx;
}

export const iterationAppliedScorer: EvalScorer = {
  name: 'iteration-applied',
  async run(input: EvalScorerInput): Promise<EvalScorerResult> {
    if (!CONTEXT) {
      return { scorer: 'iteration-applied', score: 0, passed: false, details: 'no iteration context set' };
    }
    const files = await input.workspace.listFiles(input.projectId);
    const surviving = CONTEXT.seedPaths.filter((p) => files.includes(p));
    const survivingPct = surviving.length / Math.max(1, CONTEXT.seedPaths.length);

    if (survivingPct < 0.3) {
      return {
        scorer: 'iteration-applied',
        score: 30,
        passed: false,
        details: `only ${Math.round(survivingPct * 100)}% of seeded files survived — agent regenerated instead of iterating`,
      };
    }

    if (CONTEXT.expectedSubstring) {
      let found = false;
      for (const p of files) {
        if (!/\.(tsx|ts|jsx|js)$/.test(p)) continue;
        const body = await input.workspace.readFile(input.projectId, p).catch(() => '');
        if (body.includes(CONTEXT.expectedSubstring)) { found = true; break; }
      }
      if (!found) {
        return {
          scorer: 'iteration-applied',
          score: 60,
          passed: false,
          details: `seeded files survived but expected substring "${CONTEXT.expectedSubstring}" not found`,
        };
      }
    }
    return {
      scorer: 'iteration-applied',
      score: 100,
      passed: true,
      details: `${surviving.length}/${CONTEXT.seedPaths.length} seeded files preserved + iteration target landed`,
    };
  },
};
