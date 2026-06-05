/**
 * Message builder — assembles the prompt the agent sees on every iteration.
 *
 *   [system + skills index]      ← cached (prompt-caching)
 *   [workspace summary]          ← refreshed each session
 *   [memory.md]                  ← refreshed each session
 *   [conversation history]       ← appended every iteration
 *   [next user message]
 */

import type { AgentMessage, WorkspaceLike } from '../types.js';
import { buildSystemPrompt } from '../system-prompt.js';
import { buildWorkspaceSummary, renderWorkspaceSummary } from './workspace-summary.js';
import { readMemory, renderMemory } from './memory.js';

export interface BuildOptions {
  workspace: WorkspaceLike;
  projectId: string;
  history: AgentMessage[];
  /** The fresh user prompt for this turn. Falsy if the loop is continuing. */
  userPrompt?: string;
}

export interface BuiltContext {
  /** Cached: system prompt + skills index. The Anthropic API marks the last
   *  block in `system` as cacheable when wrapped in a cache-control object. */
  system: string;
  /** Per-session header to include in the FIRST user message of a session. */
  sessionHeader: string;
  /** Full conversation messages (history + new user prompt if provided). */
  messages: AgentMessage[];
}

export async function buildContext(opts: BuildOptions): Promise<BuiltContext> {
  const summary = await buildWorkspaceSummary(opts.workspace, opts.projectId);
  const memory = await readMemory(opts.workspace, opts.projectId);

  const sessionHeader = [
    '# Session context',
    '',
    renderWorkspaceSummary(summary),
    '',
    '# Memory',
    renderMemory(memory),
  ].join('\n');

  const messages: AgentMessage[] = [...opts.history];
  if (opts.userPrompt) {
    // First user message in a fresh session gets the session header prepended;
    // subsequent ones in an ongoing session don't (workspace summary is stale-
    // tolerant for the current run).
    const isFirstUser = !messages.some((m) => m.role === 'user');
    const text = isFirstUser
      ? `${sessionHeader}\n\n# Request\n${opts.userPrompt}`
      : opts.userPrompt;
    messages.push({
      role: 'user',
      content: [{ type: 'text', text }],
    });
  }

  return {
    system: buildSystemPrompt(),
    sessionHeader,
    messages,
  };
}
