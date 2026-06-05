/**
 * Eval scorer registry — name → scorer.
 */

import type { EvalScorer, EvalScorerName } from '../types.js';
import { compilesScorer } from './compiles.js';
import { qualityGateScorer } from './quality-gate.js';
import { navigatesScorer } from './navigates.js';
import { domainRecipeScorer } from './domain-recipe.js';
import { persistenceScorer } from './persistence.js';
import { iterationAppliedScorer } from './iteration-applied.js';
import { fixAppliedScorer } from './fix-applied.js';

export const SCORERS: Record<EvalScorerName, EvalScorer> = {
  'compiles':           compilesScorer,
  'quality-gate':       qualityGateScorer,
  'navigates':          navigatesScorer,
  'domain-recipe':      domainRecipeScorer,
  'persistence':        persistenceScorer,
  'iteration-applied':  iterationAppliedScorer,
  'fix-applied':        fixAppliedScorer,
};

export {
  compilesScorer,
  qualityGateScorer,
  navigatesScorer,
  domainRecipeScorer,
  persistenceScorer,
  iterationAppliedScorer,
  fixAppliedScorer,
};
export { setIterationContext } from './iteration-applied.js';
export { setFixContext } from './fix-applied.js';
