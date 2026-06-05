/**
 * Per-project memory — a single `memory.md` file in the project workspace
 * that the agent reads at session start and writes to when it learns
 * something durable about the user/project.
 *
 * Usage:
 *   const mem = await readMemory(workspace, projectId);
 *   ...feed mem.text into the system prompt...
 *   await appendMemory(workspace, projectId, '- User prefers warm colors.');
 *
 * The file lives at `.zionx/memory.md` to keep it out of the user-visible
 * file list and to avoid colliding with anything they create.
 */

import type { WorkspaceLike } from '../types.js';

const MEMORY_PATH = '.zionx/memory.md';

export interface Memory {
  text: string;
  /** True if the file exists in the workspace. */
  exists: boolean;
}

export async function readMemory(workspace: WorkspaceLike, projectId: string): Promise<Memory> {
  const exists = await workspace.exists(projectId, MEMORY_PATH);
  if (!exists) return { text: '', exists: false };
  try {
    const text = await workspace.readFile(projectId, MEMORY_PATH);
    return { text, exists: true };
  } catch {
    return { text: '', exists: false };
  }
}

export async function appendMemory(
  workspace: WorkspaceLike,
  projectId: string,
  entry: string,
): Promise<void> {
  const current = await readMemory(workspace, projectId);
  const next = current.exists
    ? `${current.text.trimEnd()}\n${entry.trim()}\n`
    : `# Project memory\n\n${entry.trim()}\n`;
  await workspace.writeFile(projectId, MEMORY_PATH, next);
}

export async function resetMemory(workspace: WorkspaceLike, projectId: string): Promise<void> {
  await workspace.writeFile(projectId, MEMORY_PATH, '# Project memory\n\n');
}

/** Render memory for inclusion in the system prompt — bounded length. */
export function renderMemory(mem: Memory, maxChars = 4000): string {
  if (!mem.exists || !mem.text.trim()) return 'No prior memory for this project.';
  if (mem.text.length <= maxChars) return mem.text;
  // Keep the head + tail; the middle is usually the largest noise.
  const head = mem.text.slice(0, Math.floor(maxChars * 0.6));
  const tail = mem.text.slice(-Math.floor(maxChars * 0.4));
  return `${head}\n…(memory truncated)…\n${tail}`;
}
