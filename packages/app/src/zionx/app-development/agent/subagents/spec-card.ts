/**
 * Spec-card reviewer — wraps Hook 14.
 *
 * Hook 14 expects the LLM's first emitted text to contain a <spec>...</spec>
 * JSON block with 10 keys. The agent's `agent-loop` collects assistant text
 * blocks. Pass the raw first-message text into this subagent.
 */

import type { Subagent, SubagentInput, SubagentResult } from '../types.js';
import { run as runHook14 } from '../../pipeline/14-spec-card.js';
import { makeReviewCtx } from './loader.js';

export interface SpecCardSubagentInput extends SubagentInput {
  /** Raw text from the assistant's first message (where the <spec> block lives). */
  firstAssistantText: string;
}

/**
 * Build a Subagent bound to the captured first-assistant text. The harness
 * captures this from the first iteration and creates the reviewer just
 * before spawning it, so the prompt is always in scope.
 */
export function createSpecCardReviewer(firstAssistantText: string): Subagent {
  return {
    name: 'spec-card-reviewer',
    description:
      'Verify the agent\'s very first output contained a complete <spec>...</spec> JSON block ' +
      'with all 10 keys (domain, userGoal, screens, stateModel, seed, persistence, visualAnchor, hero, emptyState, failCheck).',
    async run({ projectId }): Promise<SubagentResult> {
      const ctx = makeReviewCtx('spec-card');
      const result = await runHook14({ streamPrefix: firstAssistantText }, ctx as never);
      const passed = result.success && result.data?.found === true;
      const missingKeys = result.data?.missingKeys ?? [];
      void projectId; // keep linter quiet — Hook 14 doesn't need projectId

      const fixes: string[] = [];
      if (!passed) {
        if (missingKeys.length) {
          fixes.push(`Spec card is missing keys: ${missingKeys.join(', ')}. Re-emit the <spec>...</spec> JSON block with all 10 keys filled.`);
        } else {
          fixes.push('Spec card not found or malformed. Emit a <spec>{"domain": "...", ...}</spec> JSON block FIRST, before any other text or tool call.');
        }
      }

      return {
        passed,
        score: passed ? 100 : 0,
        fixes,
        details: passed
          ? 'Spec card present and complete.'
          : (result.error ?? 'spec card missing or incomplete'),
      };
    },
  };
}
