/**
 * Compaction — when the running message history grows past a threshold,
 * summarize the earliest non-system messages into a single tool_result
 * block so we don't blow the context window.
 *
 * The current implementation is a simple character-count heuristic: when
 * the serialized history exceeds `triggerChars`, replace the first 60% of
 * non-system messages with a synopsis stub. The agent loop can swap in a
 * Claude-driven summarization later.
 */

import type { AgentMessage, ContentBlock } from '../types.js';

export interface CompactionConfig {
  /** Trigger compaction once total content size crosses this many chars. */
  triggerChars: number;
  /** What fraction of messages to fold into the summary. */
  foldFraction: number;
  /** Optional: a Claude-backed summarizer. Defaults to a static stub. */
  summarize?: (folded: AgentMessage[]) => Promise<string>;
}

export const DEFAULT_COMPACTION: CompactionConfig = {
  triggerChars: 280_000, // roughly 70% of a 200K context window
  foldFraction: 0.6,
};

export async function compactIfNeeded(
  history: AgentMessage[],
  config: CompactionConfig = DEFAULT_COMPACTION,
): Promise<{ history: AgentMessage[]; folded: number }> {
  const size = serializedSize(history);
  if (size < config.triggerChars) return { history, folded: 0 };

  // Find the boundary — keep the head (system + first user prompt) intact,
  // fold middle history, keep the tail (last 4 messages).
  const tailKeep = Math.min(4, history.length);
  const foldable = history.slice(1, history.length - tailKeep);
  const foldCount = Math.max(1, Math.floor(foldable.length * config.foldFraction));
  if (foldCount < 2) return { history, folded: 0 };

  const folded = foldable.slice(0, foldCount);
  const summarized = config.summarize
    ? await config.summarize(folded)
    : staticSummary(folded);

  const stub: AgentMessage = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `[compaction] ${foldCount} earlier messages folded:\n${summarized}`,
      },
    ],
  };

  const next: AgentMessage[] = [
    history[0]!, // system or earliest message kept
    stub,
    ...foldable.slice(foldCount),
    ...history.slice(history.length - tailKeep),
  ];

  return { history: next, folded: foldCount };
}

function serializedSize(history: AgentMessage[]): number {
  let n = 0;
  for (const m of history) {
    for (const c of m.content) n += contentBlockSize(c);
  }
  return n;
}

function contentBlockSize(c: ContentBlock): number {
  if (c.type === 'text') return c.text.length;
  if (c.type === 'tool_use') return JSON.stringify(c.input).length + c.name.length + 32;
  return c.content.length + (c.tool_use_id?.length ?? 0) + 32;
}

function staticSummary(messages: AgentMessage[]): string {
  const counts: Record<string, number> = {};
  const toolNames = new Set<string>();
  const filesTouched = new Set<string>();
  for (const m of messages) {
    counts[m.role] = (counts[m.role] ?? 0) + 1;
    for (const c of m.content) {
      if (c.type === 'tool_use') {
        toolNames.add(c.name);
        const input = c.input as { path?: string };
        if (input?.path) filesTouched.add(input.path);
      }
    }
  }
  const parts = [
    `Roles: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  ];
  if (toolNames.size) parts.push(`Tools used: ${[...toolNames].sort().join(', ')}`);
  if (filesTouched.size) parts.push(`Files touched: ${[...filesTouched].slice(0, 12).join(', ')}${filesTouched.size > 12 ? `, +${filesTouched.size - 12}` : ''}`);
  return parts.join(' / ');
}
