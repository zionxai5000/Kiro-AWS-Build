/**
 * Budget tracker — caps token usage AND iteration count for a single agent
 * run. The agent loop calls `recordUsage` after every model call and
 * `recordIteration` at the top of every loop pass. If either limit is
 * breached, `shouldStop` returns the reason.
 */

export interface BudgetConfig {
  maxIterations: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Optional total cost ceiling in USD. Skip if 0. */
  maxUsd?: number;
  /** Anthropic pricing for the model (per 1M tokens). For cost estimation. */
  pricing?: { inputPerMTok: number; outputPerMTok: number };
}

export interface BudgetState {
  iterations: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD spend (only populated if pricing provided). */
  estimatedUsd: number;
}

export type BudgetVerdict =
  | { stop: false }
  | { stop: true; reason: 'iteration_cap' | 'token_cap' | 'cost_cap' };

export class Budget {
  readonly config: BudgetConfig;
  state: BudgetState = { iterations: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };

  constructor(config: BudgetConfig) { this.config = config; }

  recordIteration(): void { this.state.iterations += 1; }

  recordUsage(input: number, output: number): void {
    this.state.inputTokens += input;
    this.state.outputTokens += output;
    if (this.config.pricing) {
      const c = (input * this.config.pricing.inputPerMTok + output * this.config.pricing.outputPerMTok) / 1_000_000;
      this.state.estimatedUsd += c;
    }
  }

  shouldStop(): BudgetVerdict {
    if (this.state.iterations >= this.config.maxIterations) {
      return { stop: true, reason: 'iteration_cap' };
    }
    if (this.state.inputTokens >= this.config.maxInputTokens || this.state.outputTokens >= this.config.maxOutputTokens) {
      return { stop: true, reason: 'token_cap' };
    }
    if (this.config.maxUsd && this.state.estimatedUsd >= this.config.maxUsd) {
      return { stop: true, reason: 'cost_cap' };
    }
    return { stop: false };
  }

  /** Return remaining budget for telemetry / warning events. */
  remaining(): { iterations: number; inputTokens: number; outputTokens: number } {
    return {
      iterations: Math.max(0, this.config.maxIterations - this.state.iterations),
      inputTokens: Math.max(0, this.config.maxInputTokens - this.state.inputTokens),
      outputTokens: Math.max(0, this.config.maxOutputTokens - this.state.outputTokens),
    };
  }
}

/** Defaults sized for a typical "build me an app" request. */
export const DEFAULT_BUDGET: BudgetConfig = {
  maxIterations: 30,
  maxInputTokens: 1_500_000,
  maxOutputTokens: 250_000,
  maxUsd: 5,
  pricing: { inputPerMTok: 3, outputPerMTok: 15 }, // claude-sonnet-4 approximate
};
