/**
 * Eval suite — vocabulary.
 *
 * The suite runs the agent on a fixed set of prompts and scores each run
 * against deterministic checks. It catches regressions in the agent's
 * behavior — a tweak to a skill or a tool can lift one app type and
 * silently break another. Without evals, you don't know.
 *
 * The runner is invoked from CI (or manually via `pnpm test:evals`) and
 * compared against `baseline.json`. Any task whose score drops below
 * baseline blocks the change.
 */

import type { WorkspaceLike } from '../types.js';

/** A single evaluation task — a prompt + how to grade what came out. */
export interface EvalTask {
  /** Stable identifier for baseline comparison. */
  id: string;
  /** What the test exercises (for humans). */
  description: string;
  /** Domain category (used for at-a-glance reporting). */
  domain: 'habit' | 'todo' | 'recipe' | 'workout' | 'game' | 'journal' | 'mood' | 'iteration' | 'fix' | 'generic';
  /** The user prompt fed to the agent. */
  prompt: string;
  /**
   * Optional "starting workspace" — for `iterate-*` and `fix-*` tasks the
   * harness pre-populates the workspace with these files before running.
   */
  seedFiles?: Record<string, string>;
  /**
   * Scorers to run after the agent finishes. Each contributes 0-100 to
   * the task's total (averaged). All scorers are run; a single failure
   * doesn't short-circuit the rest.
   */
  scorers: ReadonlyArray<EvalScorerName>;
}

export type EvalScorerName =
  | 'compiles'
  | 'quality-gate'
  | 'navigates'
  | 'domain-recipe'
  | 'persistence'
  | 'iteration-applied'
  | 'fix-applied';

export interface EvalScorerInput {
  taskId: string;
  workspace: WorkspaceLike;
  projectId: string;
  prompt: string;
}

export interface EvalScorerResult {
  scorer: EvalScorerName;
  score: number;          // 0..100
  passed: boolean;
  details?: string;
}

export interface EvalScorer {
  name: EvalScorerName;
  run: (input: EvalScorerInput) => Promise<EvalScorerResult>;
}

export interface EvalRunResult {
  taskId: string;
  domain: EvalTask['domain'];
  scorers: EvalScorerResult[];
  /** Average across scorers, 0..100. */
  total: number;
  passed: boolean;
  durationMs: number;
  /** If the task threw before scoring could run. */
  error?: string;
}

export interface EvalSuiteReport {
  ranAt: string;            // ISO timestamp
  totals: {
    tasks: number;
    passed: number;
    failed: number;
    averageScore: number;
  };
  results: EvalRunResult[];
}

/** Baseline scores (committed JSON file) — CI fails if any task drops below. */
export interface EvalBaseline {
  version: number;
  ranAt: string;
  tasks: Record<string, { total: number; scorers: Record<EvalScorerName, number> }>;
}
