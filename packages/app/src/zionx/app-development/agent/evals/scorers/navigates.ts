/**
 * Navigates scorer — confirms multi-screen apps actually have multiple
 * screens registered with expo-router. Without an E2B sandbox we can't
 * boot the app and tap tabs; we approximate by checking that:
 *   - app/(tabs)/_layout.tsx exists
 *   - ≥ 2 tab screen files exist under app/(tabs)/
 *   - each tab file has a default export
 *   - none reuses the SAME default-export name (would 404 in router)
 */

import type { EvalScorer, EvalScorerResult } from '../types.js';

export const navigatesScorer: EvalScorer = {
  name: 'navigates',
  async run(input): Promise<EvalScorerResult> {
    const files = await input.workspace.listFiles(input.projectId);
    const tabFiles = files.filter((p) => /^app\/\(tabs\)\/[^/]+\.tsx$/.test(p) && !/_layout/.test(p));
    if (tabFiles.length === 0) {
      return { scorer: 'navigates', score: 0, passed: false, details: 'no tab screens under app/(tabs)/' };
    }

    const layoutExists = files.includes('app/(tabs)/_layout.tsx');
    if (!layoutExists) {
      return { scorer: 'navigates', score: 30, passed: false, details: 'app/(tabs)/_layout.tsx missing' };
    }

    if (tabFiles.length < 2) {
      return { scorer: 'navigates', score: 50, passed: false, details: `only ${tabFiles.length} tab screen — need ≥2 for navigation` };
    }

    let withDefaultExport = 0;
    const exportNames = new Set<string>();
    for (const f of tabFiles) {
      const body = await input.workspace.readFile(input.projectId, f).catch(() => '');
      const m = body.match(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/);
      if (m) {
        withDefaultExport++;
        exportNames.add(m[1]!);
      } else if (/export\s+default\s+/.test(body)) {
        withDefaultExport++;
      }
    }
    if (withDefaultExport < tabFiles.length) {
      return {
        scorer: 'navigates',
        score: 60,
        passed: false,
        details: `${tabFiles.length - withDefaultExport} tab files lack a default export`,
      };
    }
    if (exportNames.size > 0 && exportNames.size < withDefaultExport) {
      return {
        scorer: 'navigates',
        score: 70,
        passed: false,
        details: 'tab screens reuse the same component name — router will collide',
      };
    }
    return {
      scorer: 'navigates',
      score: 100,
      passed: true,
      details: `${tabFiles.length} tab screens, layout present, all distinct`,
    };
  },
};
