/**
 * Per-user + global cost tracker.
 *
 * Each agent run / hook execution records usage against a (userId, day) key
 * so the studio can show "Today: $0.12 of $5.00 daily limit". When the
 * daily limit is exceeded, requests are blocked at the API layer.
 *
 * Storage: in-memory only for now. Survives a single process; resets on
 * restart. That's acceptable because cost ceilings are a soft guardrail —
 * a worst-case restart-and-double-spend caps at the per-run budget already
 * enforced in `agent/guardrails/budget.ts`.
 *
 * Future: persist to DynamoDB so per-user budgets survive Fargate restarts
 * and are coherent across multiple tasks.
 */

import { LIMITS } from '../config/limits.js';

interface DailyCost {
  userId: string;
  day: string; // ISO yyyy-mm-dd
  /** Cumulative cost in USD. */
  totalUsd: number;
  /** Cumulative tokens (sum of in + out). */
  totalTokens: number;
  /** Per-hook breakdown: how often we touched each hook + average duration. */
  perHook: Record<string, { count: number; durationMs: number; failures: number }>;
}

const DAILY: Map<string, DailyCost> = new Map();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function keyFor(userId: string, day = todayKey()): string {
  return `${userId}::${day}`;
}

function ensure(userId: string): DailyCost {
  const k = keyFor(userId);
  let entry = DAILY.get(k);
  if (!entry) {
    entry = { userId, day: todayKey(), totalUsd: 0, totalTokens: 0, perHook: {} };
    DAILY.set(k, entry);
  }
  return entry;
}

/** Record a cost event for a user. */
export function recordCost(opts: {
  userId: string;
  hookId?: string;
  costUsd?: number;
  tokens?: number;
  durationMs?: number;
  failure?: boolean;
}): void {
  const entry = ensure(opts.userId);
  entry.totalUsd += opts.costUsd ?? 0;
  entry.totalTokens += opts.tokens ?? 0;
  if (opts.hookId) {
    const h = entry.perHook[opts.hookId] ?? { count: 0, durationMs: 0, failures: 0 };
    h.count += 1;
    h.durationMs += opts.durationMs ?? 0;
    if (opts.failure) h.failures += 1;
    entry.perHook[opts.hookId] = h;
  }
}

export interface CostSnapshot {
  userId: string;
  day: string;
  todayUsd: number;
  dailyLimitUsd: number;
  totalTokens: number;
  perHook: Record<string, { count: number; durationMs: number; failureRate: number }>;
  /** True if user has hit their daily limit. */
  exceeded: boolean;
}

/** Read today's snapshot for a user. Always returns a value (never null). */
export function getCostSnapshot(userId: string): CostSnapshot {
  const entry = ensure(userId);
  const dailyLimitUsd = LIMITS.dailyBudgetUsd ?? 5;
  const perHook: Record<string, { count: number; durationMs: number; failureRate: number }> = {};
  for (const [hookId, h] of Object.entries(entry.perHook)) {
    perHook[hookId] = {
      count: h.count,
      durationMs: h.count > 0 ? h.durationMs / h.count : 0,
      failureRate: h.count > 0 ? h.failures / h.count : 0,
    };
  }
  return {
    userId,
    day: entry.day,
    todayUsd: entry.totalUsd,
    dailyLimitUsd,
    totalTokens: entry.totalTokens,
    perHook,
    exceeded: entry.totalUsd >= dailyLimitUsd,
  };
}

/**
 * Returns an object with `allowed: boolean` + reason. If `allowed: false`,
 * the API handler should reject the request with 429.
 */
export function checkBudget(userId: string): { allowed: boolean; reason?: string; snapshot: CostSnapshot } {
  const snapshot = getCostSnapshot(userId);
  if (snapshot.exceeded) {
    return {
      allowed: false,
      reason: `Daily budget exceeded: $${snapshot.todayUsd.toFixed(2)} of $${snapshot.dailyLimitUsd.toFixed(2)}. Resets at UTC midnight.`,
      snapshot,
    };
  }
  return { allowed: true, snapshot };
}

/** Reset everything — primarily for tests. */
export function resetCostTracker(): void {
  DAILY.clear();
}
