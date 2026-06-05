/**
 * Subagent loader — reads every workspace file the reviewer hooks expect
 * (`.tsx`/`.jsx`/`.ts`/`.js`) into a Record<path, content> matching the
 * shape Hooks 11–15 already consume.
 *
 * Same code-paths as `quality-gate-runner.ts:loadProjectFiles`, lifted so
 * the subagent layer doesn't depend on the runner.
 */

import type { WorkspaceLike } from '../types.js';

export async function loadReviewableFiles(
  workspace: WorkspaceLike,
  projectId: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = await workspace.listFiles(projectId).catch(() => [] as string[]);
  for (const path of list) {
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) continue;
    if (path.includes('node_modules') || path.startsWith('.git/') || path.startsWith('dist/')) continue;
    try {
      out[path] = await workspace.readFile(projectId, path);
    } catch {
      /* skip unreadable files */
    }
  }
  return out;
}

/** Minimal HookContext shim — Hooks 11-15 only use `log` and `dryRun`. */
export function makeReviewCtx(prefix: string): {
  log: (...args: unknown[]) => void;
  dryRun: boolean;
} {
  return {
    log: (...args: unknown[]) => console.log(`[${prefix}]`, ...args),
    dryRun: false,
  };
}
