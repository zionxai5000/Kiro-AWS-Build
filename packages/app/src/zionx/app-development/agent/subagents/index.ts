/**
 * Reviewer subagents — wrap Hooks 11-15 as `Subagent` implementations the
 * agent loop can `spawn_subagent('<name>')`. Register them once at boot
 * via `registerAllReviewers()`.
 *
 * Two of the five reviewers (`domain-fitness-reviewer`, `spec-card-reviewer`)
 * need per-run context (the user prompt, the first-assistant text). They
 * are constructed via factory functions and registered fresh each run.
 */

import { registerSubagent } from '../tools/spawn-subagent.js';
import { visualPolishReviewer } from './visual-polish.js';
import { persistenceReviewer } from './persistence.js';
import { onboardingReviewer } from './onboarding.js';
import { dependencyValidatorReviewer } from './dependency-validator.js';
import { createDomainFitnessReviewer } from './domain-fitness.js';
import { createSpecCardReviewer } from './spec-card.js';

/** Register the always-on reviewers (no per-run state). Idempotent. */
export function registerStaticReviewers(): void {
  registerSubagent(visualPolishReviewer);
  registerSubagent(persistenceReviewer);
  registerSubagent(onboardingReviewer);
  registerSubagent(dependencyValidatorReviewer);
}

/**
 * Register reviewers that need per-run state. The agent loop calls this
 * after capturing the first assistant text (for spec-card) and the user
 * prompt (for domain-fitness).
 */
export function registerDynamicReviewers(input: {
  prompt: string;
  firstAssistantText: string;
}): void {
  registerSubagent(createDomainFitnessReviewer(input.prompt));
  registerSubagent(createSpecCardReviewer(input.firstAssistantText));
}

export {
  visualPolishReviewer,
  persistenceReviewer,
  onboardingReviewer,
  dependencyValidatorReviewer,
  createDomainFitnessReviewer,
  createSpecCardReviewer,
};

export const REVIEWER_NAMES = [
  'visual-polish-reviewer',
  'persistence-reviewer',
  'domain-fitness-reviewer',
  'onboarding-reviewer',
  'spec-card-reviewer',
  'dependency-validator-reviewer',
] as const;
