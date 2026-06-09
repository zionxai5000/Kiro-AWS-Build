/**
 * Dependency-validator reviewer — wraps Hook 03 (dependency-validator).
 *
 * Why this exists: Hook 03 already runs as a file-event subscriber and emits
 * errors when the agent writes a `package.json` with versions that don't
 * exist on npm or can't be satisfied. Without this wrapper, those errors
 * never re-enter the agent loop — the agent goes silent, the run finishes
 * with a "reviewer failures" verdict, and the harness UI shows
 * `Sandbox error` because the preview can't `npm install` an invalid
 * version.
 *
 * Wrapping the hook as a reviewer subagent makes it part of the
 * `runReviewers()` set in `agent-loop.ts`, so a bad version triggers a
 * retry round with explicit `fixes` text in the next user prompt.
 */

import type { Subagent, SubagentResult } from '../types.js';
import { run as runHook03 } from '../../pipeline/03-dependency-validator.js';
import { makeReviewCtx } from './loader.js';

const PACKAGE_JSON_PATHS = ['package.json'];

export const dependencyValidatorReviewer: Subagent = {
  name: 'dependency-validator-reviewer',
  description:
    'Verify every dependency in package.json exists on npm and the requested ' +
    'version range is satisfiable. Failures block the preview because npm ' +
    'install will fail; agent must correct the version.',
  async run({ projectId, workspace }): Promise<SubagentResult> {
    // Find package.json (it lives at the workspace root for golden-starter).
    let pkgPath: string | null = null;
    for (const p of PACKAGE_JSON_PATHS) {
      try {
        const exists = await workspace.exists?.(projectId, p) ?? false;
        if (exists) { pkgPath = p; break; }
      } catch { /* ignore */ }
    }
    // Fall back to listing the project root if the helper isn't available.
    if (!pkgPath) {
      try {
        const files = await workspace.listFiles?.(projectId) ?? [];
        pkgPath = files.find((f) => f.endsWith('package.json')) ?? null;
      } catch { /* ignore */ }
    }

    if (!pkgPath) {
      // No package.json yet → nothing to validate, pass.
      return {
        passed: true,
        score: 100,
        details: 'No package.json present — dependency validation skipped.',
        fixes: [],
      };
    }

    const ctx = makeReviewCtx('dependency-validator');
    const result = await runHook03(
      { projectId, packageJsonPath: pkgPath },
      ctx as never,
    );

    const data = result.data;
    if (!data || data.valid) {
      return {
        passed: true,
        score: 100,
        details: `Validated ${data?.checkedCount ?? 0} dependencies. All resolvable on npm.`,
        fixes: [],
      };
    }

    // Build human-readable fixes for each error so the agent can act on them
    // in the retry round.
    const fixes = data.errors.map((e) => {
      switch (e.reason) {
        case 'not_found':
          return `Package "${e.name}" does not exist on npm. ` +
                 `Either remove it or use a real package name. ` +
                 (e.detail ? `(${e.detail})` : '');
        case 'version_unsatisfiable':
          return `Package "${e.name}" requested at "${e.versionRange}" — that version range matches no published version on npm. ` +
                 `Pick a real version. For React + RN + Expo SDK 54: react@18.3.1 (NOT 18.3.2), react-native@0.76.x. ` +
                 `When unsure, use a caret range like "^18.3.0" or "^0.76.0" so npm picks the highest matching real release.`;
        case 'check_failed':
          return `Could not check "${e.name}": ${e.detail ?? 'unknown error'}. ` +
                 `Verify the package name spelling and try again.`;
        default:
          return `Dependency error on "${e.name}": ${e.reason}.`;
      }
    });

    return {
      passed: false,
      score: 0,
      details:
        `${data.errors.length} of ${data.checkedCount} dependencies failed validation. ` +
        `Fix the package.json before retrying — the preview cannot install invalid versions.`,
      fixes,
    };
  },
};
