/**
 * Workspace summary — a tokens-cheap snapshot the agent gets at session
 * start. Tree shape, file extensions, top-level entry points. NEVER file
 * contents — those are read on demand via the `read_file` tool.
 */

import type { WorkspaceLike } from '../types.js';

const ENTRY_FILES = new Set([
  'package.json', 'app.json', 'eas.json', 'babel.config.js', 'metro.config.js',
  'tsconfig.json', 'README.md',
]);

export interface WorkspaceSummary {
  totalFiles: number;
  byExt: Record<string, number>;
  /** Top-level entry files that exist. */
  entries: string[];
  /** Mini tree text-rendered, depth-limited. */
  tree: string;
}

export async function buildWorkspaceSummary(
  workspace: WorkspaceLike,
  projectId: string,
  opts: { maxDepth?: number; maxEntries?: number } = {},
): Promise<WorkspaceSummary> {
  const maxDepth = opts.maxDepth ?? 3;
  const maxEntries = opts.maxEntries ?? 200;

  const all = await workspace.listFiles(projectId);
  const byExt: Record<string, number> = {};
  const entries: string[] = [];

  for (const path of all) {
    const ext = extOf(path);
    byExt[ext] = (byExt[ext] ?? 0) + 1;
    if (!path.includes('/') && ENTRY_FILES.has(path)) entries.push(path);
  }

  const tree = renderTree(all.slice(0, maxEntries), maxDepth);
  const trimmedNote = all.length > maxEntries ? `\n…and ${all.length - maxEntries} more files` : '';

  return {
    totalFiles: all.length,
    byExt,
    entries,
    tree: tree + trimmedNote,
  };
}

/** Render the summary as a string the model can ingest directly. */
export function renderWorkspaceSummary(s: WorkspaceSummary): string {
  if (s.totalFiles === 0) return 'workspace is empty (new project — start by copying templates/golden-starter/)';
  const ext = Object.entries(s.byExt)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return [
    `Workspace summary: ${s.totalFiles} files (${ext})`,
    s.entries.length > 0 ? `Entry files: ${s.entries.join(', ')}` : 'No package.json yet — start from golden-starter.',
    'Tree (depth-limited):',
    s.tree,
  ].join('\n');
}

function extOf(p: string): string {
  const dot = p.lastIndexOf('.');
  if (dot < 0) return '<noext>';
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (dot < slash) return '<noext>';
  return p.slice(dot);
}

function renderTree(paths: string[], maxDepth: number): string {
  // Group by top-level dir; show counts when we hit depth limit.
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const head = p.split('/')[0] ?? p;
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head)!.push(p);
  }
  const sortedDirs = Array.from(groups.keys()).sort();
  return sortedDirs.map((dir) => renderGroup(dir, groups.get(dir)!, maxDepth)).join('\n');
}

function renderGroup(dir: string, paths: string[], maxDepth: number): string {
  if (paths.length === 1 && paths[0] === dir) return dir;
  // Find paths inside this dir.
  const inside = paths
    .filter((p) => p.startsWith(dir + '/'))
    .map((p) => p.slice(dir.length + 1));
  const isFileOnly = inside.length === 0 && paths[0] === dir;
  if (isFileOnly) return dir;

  // Limit recursion depth.
  if (maxDepth <= 1) {
    return `${dir}/  (${inside.length} item${inside.length === 1 ? '' : 's'})`;
  }
  const subPaths = inside.map((p) => p);
  const sub = renderTreeIndented(subPaths, maxDepth - 1, '  ');
  return `${dir}/\n${sub}`;
}

function renderTreeIndented(paths: string[], maxDepth: number, indent: string): string {
  const groups = new Map<string, string[]>();
  const filesHere: string[] = [];
  for (const p of paths) {
    const slash = p.indexOf('/');
    if (slash < 0) {
      filesHere.push(p);
    } else {
      const head = p.slice(0, slash);
      if (!groups.has(head)) groups.set(head, []);
      groups.get(head)!.push(p.slice(slash + 1));
    }
  }
  const out: string[] = [];
  for (const f of filesHere.slice(0, 20).sort()) out.push(`${indent}${f}`);
  if (filesHere.length > 20) out.push(`${indent}…(${filesHere.length - 20} more files)`);
  const sortedDirs = Array.from(groups.keys()).sort();
  for (const d of sortedDirs) {
    const inner = groups.get(d)!;
    if (maxDepth <= 1) {
      out.push(`${indent}${d}/  (${inner.length} item${inner.length === 1 ? '' : 's'})`);
    } else {
      out.push(`${indent}${d}/`);
      out.push(renderTreeIndented(inner, maxDepth - 1, indent + '  '));
    }
  }
  return out.join('\n');
}
