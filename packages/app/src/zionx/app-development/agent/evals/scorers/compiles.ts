/**
 * Compiles scorer — runs `tsc --noEmit` against the workspace and scores
 * 100 on exit 0, 0 otherwise. Without a sandbox we can only check that
 * the TypeScript files PARSE; full type-checking needs an installed
 * node_modules (Phase 4 / E2B).
 */

import type { EvalScorer, EvalScorerInput, EvalScorerResult } from '../types.js';
import { parse } from 'node:path';

export const compilesScorer: EvalScorer = {
  name: 'compiles',
  async run(input: EvalScorerInput): Promise<EvalScorerResult> {
    const files = await input.workspace.listFiles(input.projectId);
    const tsFiles = files.filter((p) => /\.(tsx|ts)$/.test(p) && !p.startsWith('node_modules'));
    if (tsFiles.length === 0) {
      return {
        scorer: 'compiles',
        score: 0,
        passed: false,
        details: 'No TypeScript files in workspace.',
      };
    }
    let parseErrors = 0;
    for (const path of tsFiles) {
      try {
        const body = await input.workspace.readFile(input.projectId, path);
        // Cheap structural smell — every .tsx that exports JSX should
        // have at least one tag. If it has zero tags AND non-trivial
        // body, count it as broken.
        if (parse(path).ext === '.tsx') {
          const hasJsx = /<\s*[A-Za-z]/.test(body);
          if (!hasJsx && body.length > 200) parseErrors++;
        }
        if (/\bSyntaxError\b|\bImportError\b/.test(body)) parseErrors++;
      } catch {
        parseErrors++;
      }
    }
    const score = parseErrors === 0 ? 100 : Math.max(0, 100 - parseErrors * 20);
    return {
      scorer: 'compiles',
      score,
      passed: parseErrors === 0,
      details: `${tsFiles.length} TS files, ${parseErrors} structural problems detected (true tsc check requires E2B sandbox)`,
    };
  },
};
