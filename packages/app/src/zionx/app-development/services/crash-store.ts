/**
 * Crash store — persists per-project Sentry crash events to the workspace
 * so the studio can list recent crashes for a project.
 *
 * Storage: workspace `.zionx/crashes/<sentryEventId>.json`. The S3 mirror
 * picks these up automatically since they go through `Workspace.writeFile`.
 *
 * Read API: list the most recent N (default 50) crash files for a project.
 */

import type { Workspace } from '../workspace/workspace.js';

export interface CrashRecord {
  sentryEventId: string;
  errorMessage: string;
  platform: 'ios' | 'android' | 'unknown';
  observedAt: string;
  appVersion?: string;
  buildNumber?: string;
  sentryUrl?: string;
}

const CRASH_DIR = '.zionx/crashes';

export async function recordCrash(workspace: Workspace, projectId: string, crash: CrashRecord): Promise<void> {
  const safeId = crash.sentryEventId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const path = `${CRASH_DIR}/${safeId}.json`;
  try {
    await workspace.writeFile(projectId, path, JSON.stringify(crash, null, 2));
  } catch (err) {
    console.warn(`[crash-store] could not persist crash ${crash.sentryEventId}: ${(err as Error).message}`);
  }
}

export async function listCrashes(workspace: Workspace, projectId: string, limit = 50): Promise<CrashRecord[]> {
  let allFiles: string[] = [];
  try {
    allFiles = await workspace.listFiles(projectId);
  } catch {
    return [];
  }
  const crashFiles = allFiles
    .filter((f) => f.startsWith(`${CRASH_DIR}/`) && f.endsWith('.json'))
    .sort()
    .reverse() // newest first when filenames carry observedAt-derived suffixes
    .slice(0, limit);

  const records: CrashRecord[] = [];
  for (const f of crashFiles) {
    try {
      const raw = await workspace.readFile(projectId, f);
      records.push(JSON.parse(raw) as CrashRecord);
    } catch {
      /* skip malformed */
    }
  }
  // Sort by observedAt desc (the filename sort approximates this but use the
  // record timestamp as the canonical ordering).
  records.sort((a, b) => (b.observedAt ?? '').localeCompare(a.observedAt ?? ''));
  return records;
}
