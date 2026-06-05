/**
 * Eval suite — public exports.
 *
 * Usage from CI:
 *   import { runEvalSuite } from '...agent/evals';
 *   const apiKey = await secrets.get('seraphim/anthropic');
 *   const report = await runEvalSuite({ apiKey });
 *   compareAgainstBaseline(report);  // implemented in CI script
 */

export { runEvalSuite } from './runner.js';
export { TASKS } from './tasks.js';
export { SCORERS } from './scorers/index.js';
export type {
  EvalTask, EvalScorer, EvalScorerName, EvalScorerInput, EvalScorerResult,
  EvalRunResult, EvalSuiteReport, EvalBaseline,
} from './types.js';
