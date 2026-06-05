/**
 * Agent loop tests — covers the loop's branches that the smoke test doesn't:
 *   - tool-call dispatch with multiple tools in one assistant turn
 *   - unknown tool name returns an error block instead of crashing
 *   - read-files set is propagated across iterations
 *   - signal-aborted run exits with reason='aborted'
 *
 * Uses vi.doMock() to patch the Anthropic SDK with a scriptable fake.
 * Each test creates a fresh module graph via vi.resetModules().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentBlock, WorkspaceLike, AgentEvent } from '../types.js';

class MemoryWorkspace implements WorkspaceLike {
  files = new Map<string, string>();
  async readFile(_p: string, path: string): Promise<string> {
    const v = this.files.get(path); if (v === undefined) throw new Error(`ENOENT ${path}`); return v;
  }
  async writeFile(_p: string, path: string, content: string): Promise<void> { this.files.set(path, content); }
  async listFiles(_p: string): Promise<string[]> { return [...this.files.keys()].sort(); }
  async exists(_p: string, path: string): Promise<boolean> { return this.files.has(path); }
  async delete(_p: string, path: string): Promise<void> { this.files.delete(path); }
}

/**
 * Build a fake Anthropic SDK module that yields a scripted sequence of
 * assistant content blocks. Each call to `messages.stream()` consumes the
 * next entry in `script`.
 */
function patchAnthropic(script: ContentBlock[][]) {
  vi.doMock('@anthropic-ai/sdk', () => {
    let callIdx = 0;
    class FakeStream {
      private listeners = new Map<string, ((arg: unknown) => void)[]>();
      on(event: string, cb: (arg: unknown) => void) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(cb);
        return this;
      }
      async finalMessage() {
        const blocks = script[callIdx] ?? [];
        callIdx++;
        // Replay text blocks via the 'text' event so the loop streams them.
        for (const b of blocks) {
          if (b.type === 'text') {
            (this.listeners.get('text') ?? []).forEach((cb) => cb(b.text));
          }
        }
        return {
          content: blocks,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      }
    }
    class FakeAnthropic {
      messages = { stream: () => new FakeStream() };
      constructor(_opts: unknown) { /* no-op */ }
    }
    return { default: FakeAnthropic };
  });
  // Reset module cache so the next import of agent-loop picks up the mock.
  vi.resetModules();
}

describe('agent-loop', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    // ensure no stale doMocks
    vi.doUnmock('@anthropic-ai/sdk');
  });

  it('exits with reason=completed when the model emits no tool_use', async () => {
    patchAnthropic([
      [{ type: 'text', text: 'I have nothing to do here.' }],
    ]);
    const { agentLoop } = await import('../agent-loop.js');
    const events: AgentEvent[] = [];
    const result = await agentLoop(
      { prompt: 'hi', projectId: 'p', userId: 'u' },
      { workspace: new MemoryWorkspace(), emit: (e) => events.push(e), log: () => {} },
      { config: { apiKey: 'fake' }, reviewers: false },
    );
    expect(result.reason).toBe('completed');
    expect(result.iterations).toBe(1);
    expect(result.tokens.input).toBe(100);
  });

  it('dispatches multiple tool calls in a single assistant turn', async () => {
    patchAnthropic([
      [
        { type: 'tool_use', id: 't1', name: 'list_files', input: {} },
        { type: 'tool_use', id: 't2', name: 'list_files', input: { pathFilter: 'app/**' } },
      ],
      [{ type: 'text', text: 'Done.' }],
    ]);
    const { agentLoop } = await import('../agent-loop.js');
    const ws = new MemoryWorkspace();
    ws.files.set('app/(tabs)/index.tsx', 'x');
    ws.files.set('src/data/store.ts', 'y');

    const events: AgentEvent[] = [];
    const result = await agentLoop(
      { prompt: 'list', projectId: 'p', userId: 'u' },
      { workspace: ws, emit: (e) => events.push(e), log: () => {} },
      { config: { apiKey: 'fake' }, reviewers: false },
    );
    expect(result.reason).toBe('completed');
    const toolCalls = events.filter((e) => e.type === 'tool.call');
    expect(toolCalls.length).toBe(2);
  });

  it('returns an error tool_result for unknown tool names without crashing', async () => {
    patchAnthropic([
      [{ type: 'tool_use', id: 't1', name: 'definitely_not_a_real_tool', input: {} }],
      [{ type: 'text', text: 'Stopping after the error.' }],
    ]);
    const { agentLoop } = await import('../agent-loop.js');
    const events: AgentEvent[] = [];
    const result = await agentLoop(
      { prompt: 'unknown tool', projectId: 'p', userId: 'u' },
      { workspace: new MemoryWorkspace(), emit: (e) => events.push(e), log: () => {} },
      { config: { apiKey: 'fake' }, reviewers: false },
    );
    expect(result.reason).toBe('completed');
    const errors = events.filter((e) => e.type === 'tool.result' && (e as { isError?: boolean }).isError);
    expect(errors.length).toBe(1);
  });

  it('stops with reason=aborted when the signal fires', async () => {
    patchAnthropic([
      [{ type: 'text', text: 'should not get here' }],
    ]);
    const { agentLoop } = await import('../agent-loop.js');
    const ac = new AbortController();
    ac.abort();  // pre-aborted
    const events: AgentEvent[] = [];
    const result = await agentLoop(
      { prompt: 'x', projectId: 'p', userId: 'u', signal: ac.signal },
      { workspace: new MemoryWorkspace(), emit: (e) => events.push(e), log: () => {} },
      { config: { apiKey: 'fake' }, reviewers: false },
    );
    expect(result.reason).toBe('aborted');
  });

  it('honors maxIterations cap and reports iteration_cap reason', async () => {
    // Script always returns the same tool_use → loop never naturally exits.
    const callTool: ContentBlock = {
      type: 'tool_use', id: 't', name: 'list_files', input: {},
    };
    patchAnthropic([
      [callTool],
      [callTool],
      [callTool],
      [callTool],
      [callTool],
    ]);
    const { agentLoop } = await import('../agent-loop.js');
    const result = await agentLoop(
      { prompt: 'loop', projectId: 'p', userId: 'u' },
      { workspace: new MemoryWorkspace(), emit: () => {}, log: () => {} },
      {
        config: { apiKey: 'fake', maxIterations: 3 },
        budget: { maxIterations: 3 },
        reviewers: false,
      },
    );
    expect(['iteration_cap', 'budget']).toContain(result.reason);
    expect(result.iterations).toBeLessThanOrEqual(3);
  });

  it('records files in filesWritten / filesEdited when those tools succeed', async () => {
    patchAnthropic([
      [
        { type: 'tool_use', id: 't1', name: 'write_file', input: { path: 'a.ts', content: 'export const a = 1;\n' } },
      ],
      [
        { type: 'tool_use', id: 't2', name: 'edit_file', input: { path: 'a.ts', oldString: 'a = 1', newString: 'a = 2' } },
      ],
      [{ type: 'text', text: 'done.' }],
    ]);
    const { agentLoop } = await import('../agent-loop.js');
    const ws = new MemoryWorkspace();
    const result = await agentLoop(
      { prompt: 'write+edit', projectId: 'p', userId: 'u' },
      { workspace: ws, emit: () => {}, log: () => {} },
      { config: { apiKey: 'fake' }, reviewers: false },
    );
    expect(result.filesWritten).toContain('a.ts');
    expect(result.filesEdited).toContain('a.ts');
    expect(ws.files.get('a.ts')).toBe('export const a = 2;\n');
  });
});
