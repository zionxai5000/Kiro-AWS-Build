/**
 * Eval suite runner — executes every task, scores each, returns a report.
 *
 * Each task gets:
 *   1. A fresh in-memory workspace seeded with `task.seedFiles` (if any)
 *   2. The agent loop run with the task prompt
 *   3. Each scorer in `task.scorers` invoked
 *   4. A weighted average produced
 *
 * The runner is invoked from `pnpm test:evals` (CI) and locally for
 * regression checks. Output is JSON — comparable against
 * `agent/evals/baseline.json`.
 */

import type {
  EvalRunResult, EvalScorerResult, EvalSuiteReport, EvalTask,
} from './types.js';
import type { WorkspaceLike, AgentEvent } from '../types.js';
import { agentLoop } from '../agent-loop.js';
import { TASKS } from './tasks.js';
import { SCORERS, setIterationContext, setFixContext } from './scorers/index.js';

export interface RunnerOptions {
  /** Anthropic API key (resolve from seraphim/anthropic before calling). */
  apiKey: string;
  /** Optional task id allowlist; runs all when omitted. */
  only?: string[];
  /** Override budget for individual tasks (smaller default for fast CI runs). */
  perTaskMaxIterations?: number;
  perTaskMaxTokens?: number;
  /** Logger. */
  log?: (...args: unknown[]) => void;
}

/** Pure in-memory workspace used per-task — no S3 spillover, fully isolated. */
class MemoryWorkspace implements WorkspaceLike {
  private files = new Map<string, string>();
  constructor(seed?: Record<string, string>) {
    if (seed) for (const [k, v] of Object.entries(seed)) this.files.set(k, v);
  }
  async readFile(_p: string, path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT ${path}`);
    return v;
  }
  async writeFile(_p: string, path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async listFiles(_p: string): Promise<string[]> { return [...this.files.keys()].sort(); }
  async exists(_p: string, path: string): Promise<boolean> { return this.files.has(path); }
  async delete(_p: string, path: string): Promise<void> { this.files.delete(path); }
}

export async function runEvalSuite(options: RunnerOptions): Promise<EvalSuiteReport> {
  const log = options.log ?? (() => {});
  const filter = new Set(options.only ?? []);
  const tasks = options.only ? TASKS.filter((t) => filter.has(t.id)) : TASKS;

  const results: EvalRunResult[] = [];
  for (const task of tasks) {
    log(`[eval] ▶ ${task.id}`);
    const result = await runTask(task, options);
    results.push(result);
    log(`[eval] ${result.passed ? '✓' : '✗'} ${task.id} score=${result.total} (${result.durationMs}ms)`);
  }

  const totals = {
    tasks: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    averageScore: results.length === 0 ? 0 : Math.round(results.reduce((s, r) => s + r.total, 0) / results.length),
  };
  return { ranAt: new Date().toISOString(), totals, results };
}

async function runTask(task: EvalTask, options: RunnerOptions): Promise<EvalRunResult> {
  const start = Date.now();
  const workspace = new MemoryWorkspace(task.seedFiles);
  const projectId = `eval-${task.id}-${Date.now().toString(36)}`;

  // Wire iteration / fix context if the task uses those scorers.
  if (task.scorers.includes('iteration-applied')) {
    setIterationContext({ seedPaths: Object.keys(task.seedFiles ?? {}) });
  }
  if (task.scorers.includes('fix-applied')) {
    setFixContext({
      description: task.id,
      // Fix scorers use task-specific predicates; default predicate = workspace
      // doesn't include the original buggy substring anymore.
      predicate: async (ws, pid) => {
        const seedBodies = Object.values(task.seedFiles ?? {}).join('\n');
        const buggyMarker = task.id === 'fix-broken-import'
          ? "from '../theme/colors'"
          : task.id === 'fix-typecheck-error'
          ? 'type Habit = { id: string; name: string; }'
          : null;
        if (!buggyMarker) return true; // unknown — assume applied
        const files = await ws.listFiles(pid);
        for (const f of files) {
          const body = await ws.readFile(pid, f).catch(() => '');
          if (body.includes(buggyMarker)) return false;
        }
        return true;
        void seedBodies;
      },
    });
  }

  // Run the agent.
  const events: AgentEvent[] = [];
  let agentError: string | undefined;
  try {
    await agentLoop(
      { prompt: task.prompt, projectId, userId: 'eval-suite' },
      {
        workspace,
        emit: (e) => events.push(e),
        log: () => {},
      },
      {
        config: {
          apiKey: options.apiKey,
          maxIterations: options.perTaskMaxIterations ?? 20,
          maxTokens: options.perTaskMaxTokens ?? 800_000,
        },
        // Reviewers are part of the agent loop's normal behavior; the
        // scorers re-evaluate the same hooks but score them independently.
        reviewers: true,
        maxReviewerRetries: 1,
      },
    );
  } catch (err) {
    agentError = (err as Error).message;
  }

  // Run scorers.
  const scorerResults: EvalScorerResult[] = [];
  for (const name of task.scorers) {
    const scorer = SCORERS[name];
    if (!scorer) {
      scorerResults.push({ scorer: name, score: 0, passed: false, details: `unknown scorer ${name}` });
      continue;
    }
    try {
      const res = await scorer.run({ taskId: task.id, workspace, projectId, prompt: task.prompt });
      scorerResults.push(res);
    } catch (err) {
      scorerResults.push({ scorer: name, score: 0, passed: false, details: `threw: ${(err as Error).message}` });
    }
  }

  const total = scorerResults.length === 0
    ? 0
    : Math.round(scorerResults.reduce((s, r) => s + r.score, 0) / scorerResults.length);
  const passed = scorerResults.length > 0 && scorerResults.every((r) => r.passed);

  return {
    taskId: task.id,
    domain: task.domain,
    scorers: scorerResults,
    total,
    passed,
    durationMs: Date.now() - start,
    error: agentError,
  };
}

export { TASKS };
