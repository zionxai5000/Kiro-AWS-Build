/**
 * Quality-gate scorer — runs Hooks 11/12/13/15 against the workspace and
 * averages the four scores. The same hooks that power the runtime
 * reviewer subagents.
 */

import type { EvalScorer, EvalScorerResult } from '../types.js';
import { run as runHook11 } from '../../../pipeline/11-visual-polish-validator.js';
import { run as runHook12 } from '../../../pipeline/12-persistence-auditor.js';
import { run as runHook13 } from '../../../pipeline/13-domain-fitness-auditor.js';
import { run as runHook15 } from '../../../pipeline/15-onboarding-auditor.js';
import { loadReviewableFiles, makeReviewCtx } from '../../subagents/loader.js';

export const qualityGateScorer: EvalScorer = {
  name: 'quality-gate',
  async run(input): Promise<EvalScorerResult> {
    const files = await loadReviewableFiles(input.workspace, input.projectId);
    const ctx = makeReviewCtx('eval-quality-gate');
    const [vp, ps, df, ob] = await Promise.all([
      runHook11({ projectId: input.projectId, files }, ctx as never),
      runHook12({ projectId: input.projectId, files }, ctx as never),
      runHook13({ projectId: input.projectId, prompt: input.prompt, files }, ctx as never),
      runHook15({ projectId: input.projectId, files }, ctx as never),
    ]);
    const visualPolish = vp.data?.score?.total ?? 0;
    const persistence = ps.data?.score?.total ?? 0;
    const domainFitness = df.data?.score?.total ?? 0;
    const onboarding = ob.data?.score?.total ?? 0;
    const total = Math.round((visualPolish + persistence + domainFitness + onboarding) / 4);
    const allPass =
      (vp.data?.score?.passed ?? false) &&
      (ps.data?.score?.passed ?? false) &&
      (df.data?.score?.passed ?? false) &&
      (ob.data?.score?.passed ?? false);
    return {
      scorer: 'quality-gate',
      score: total,
      passed: allPass,
      details: `visual=${visualPolish} persistence=${persistence} domain=${domainFitness} onboarding=${onboarding}`,
    };
  },
};
