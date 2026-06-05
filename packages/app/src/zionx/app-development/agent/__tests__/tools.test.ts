/**
 * Tool unit tests — covers each tool's branches not exercised by the smoke
 * test. The smoke test verifies the happy path; this file covers traversal
 * protection, size caps, glob filters, and output formatting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ToolContext, WorkspaceLike, AgentEvent } from '../types.js';

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

function makeCtx(workspace: WorkspaceLike): ToolContext {
  const events: AgentEvent[] = [];
  return {
    projectId: 'p',
    userId: 'u',
    workspace,
    emit: (e) => { events.push(e); },
    readFiles: new Set<string>(),
    log: () => {},
  };
}

describe('read_file', () => {
  let ws: MemoryWorkspace;

  beforeEach(() => { ws = new MemoryWorkspace(); });

  it('rejects path traversal', async () => {
    const { readFileTool } = await import('../tools/read-file.js');
    const ctx = makeCtx(ws);
    const r = await readFileTool.run({ path: '../../etc/passwd' }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('refusing path');
  });

  it('rejects absolute paths', async () => {
    const { readFileTool } = await import('../tools/read-file.js');
    const ctx = makeCtx(ws);
    const r = await readFileTool.run({ path: '/etc/passwd' }, ctx);
    expect(r.isError).toBe(true);
  });

  it('renders line numbers in the rendered content', async () => {
    const { readFileTool } = await import('../tools/read-file.js');
    const ctx = makeCtx(ws);
    ws.files.set('a.ts', 'line one\nline two\nline three\n');
    const r = await readFileTool.run({ path: 'a.ts' }, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('    1│ line one');
    expect(r.content).toContain('    2│ line two');
    expect(ctx.readFiles.has('a.ts')).toBe(true);
  });

  it('honors startLine/endLine slicing', async () => {
    const { readFileTool } = await import('../tools/read-file.js');
    const ctx = makeCtx(ws);
    const body = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
    ws.files.set('big.ts', body);
    const r = await readFileTool.run({ path: 'big.ts', startLine: 10, endLine: 12 }, ctx);
    expect(r.content).toContain('   10│ line 10');
    expect(r.content).toContain('   12│ line 12');
    expect(r.content).not.toContain('   13│');
  });
});

describe('write_file', () => {
  let ws: MemoryWorkspace;
  beforeEach(() => { ws = new MemoryWorkspace(); });

  it('blocks traversal', async () => {
    const { writeFileTool } = await import('../tools/write-file.js');
    const ctx = makeCtx(ws);
    const r = await writeFileTool.run({ path: '../escape.ts', content: 'x' }, ctx);
    expect(r.isError).toBe(true);
  });

  it('rejects absolute path', async () => {
    const { writeFileTool } = await import('../tools/write-file.js');
    const ctx = makeCtx(ws);
    const r = await writeFileTool.run({ path: '/tmp/x', content: 'x' }, ctx);
    expect(r.isError).toBe(true);
  });

  it('rejects content > 1MB', async () => {
    const { writeFileTool } = await import('../tools/write-file.js');
    const ctx = makeCtx(ws);
    const big = 'x'.repeat(1_000_001);
    const r = await writeFileTool.run({ path: 'huge.ts', content: big }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('1MB cap');
  });

  it('treats writes as reads for downstream edit_file', async () => {
    const { writeFileTool } = await import('../tools/write-file.js');
    const { editFileTool } = await import('../tools/edit-file.js');
    const ctx = makeCtx(ws);
    await writeFileTool.run({ path: 'a.ts', content: 'export const x = 1;\n' }, ctx);
    expect(ctx.readFiles.has('a.ts')).toBe(true);
    // edit_file should be allowed without an explicit read first.
    const r = await editFileTool.run({ path: 'a.ts', oldString: 'export const x = 1;', newString: 'export const x = 2;' }, ctx);
    expect(r.isError).toBeFalsy();
  });
});

describe('search', () => {
  let ws: MemoryWorkspace;
  beforeEach(() => { ws = new MemoryWorkspace(); });

  it('returns matches with file:line: text format', async () => {
    const { searchTool } = await import('../tools/search.js');
    const ctx = makeCtx(ws);
    ws.files.set('a.ts', 'export const foo = 1;\nexport const bar = 2;\n');
    const r = await searchTool.run({ pattern: 'foo' }, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('a.ts:1: export const foo = 1;');
  });

  it('honors maxMatches with truncation marker', async () => {
    const { searchTool } = await import('../tools/search.js');
    const ctx = makeCtx(ws);
    for (let i = 0; i < 50; i++) ws.files.set(`f${i}.ts`, 'foo\n');
    const r = await searchTool.run({ pattern: 'foo', maxMatches: 10 }, ctx);
    expect(r.data?.matches.length).toBe(10);
    expect(r.content).toContain('truncated');
  });

  it('rejects malformed regex with helpful message', async () => {
    const { searchTool } = await import('../tools/search.js');
    const ctx = makeCtx(ws);
    const r = await searchTool.run({ pattern: '[unclosed' }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('invalid regex');
  });
});

describe('list_files', () => {
  let ws: MemoryWorkspace;
  beforeEach(() => { ws = new MemoryWorkspace(); });

  it('returns sorted file list with count', async () => {
    const { listFilesTool } = await import('../tools/list-files.js');
    const ctx = makeCtx(ws);
    ws.files.set('z.ts', '');
    ws.files.set('a.ts', '');
    ws.files.set('m.ts', '');
    const r = await listFilesTool.run({}, ctx);
    expect(r.data?.files).toEqual(['a.ts', 'm.ts', 'z.ts']);
    expect(r.content).toContain('3 files');
  });

  it('supports glob path filter with **', async () => {
    const { listFilesTool } = await import('../tools/list-files.js');
    const ctx = makeCtx(ws);
    ws.files.set('app/(tabs)/index.tsx', '');
    ws.files.set('app/(tabs)/settings.tsx', '');
    ws.files.set('src/data/store.ts', '');
    const r = await listFilesTool.run({ pathFilter: 'app/**' }, ctx);
    expect(r.data?.files).toEqual(['app/(tabs)/index.tsx', 'app/(tabs)/settings.tsx']);
  });

  it('reports empty workspace', async () => {
    const { listFilesTool } = await import('../tools/list-files.js');
    const ctx = makeCtx(ws);
    const r = await listFilesTool.run({}, ctx);
    expect(r.content).toContain('workspace is empty');
  });
});

describe('load_skill', () => {
  it('returns helpful error on unknown skill name', async () => {
    const { loadSkillTool } = await import('../tools/load-skill.js');
    const ctx = makeCtx(new MemoryWorkspace());
    const r = await loadSkillTool.run({ name: 'this-skill-does-not-exist' }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('unknown skill');
    expect(r.content).toContain('Available:');
    expect(r.content).toContain('frontend-app-design');
  });

  it('loads frontend-app-design body and emits an event', async () => {
    const { loadSkillTool } = await import('../tools/load-skill.js');
    const events: AgentEvent[] = [];
    const ctx = makeCtx(new MemoryWorkspace());
    ctx.emit = (e) => events.push(e);
    const r = await loadSkillTool.run({ name: 'frontend-app-design' }, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('# Skill: frontend-app-design');
    expect(r.content.length).toBeGreaterThan(2000);
    expect(events.find((e) => e.type === 'skill.loaded' && (e as { name: string }).name === 'frontend-app-design')).toBeDefined();
  });
});

describe('run_command (no sandbox)', () => {
  it('soft-skips when no sandbox is attached', async () => {
    const { runCommandTool } = await import('../tools/run-command.js');
    const ctx = makeCtx(new MemoryWorkspace());
    // ctx.sandbox is undefined.
    const r = await runCommandTool.run({ command: 'npm install' }, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.content).toContain('skipped');
    expect(r.data?.exitCode).toBe(0);
  });

  it('rejects disallowed binary even without a sandbox', async () => {
    const { runCommandTool } = await import('../tools/run-command.js');
    const ctx = makeCtx(new MemoryWorkspace());
    const r = await runCommandTool.run({ command: 'sudo rm -rf /' }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('rejected');
  });
});

describe('screenshot (no sandbox)', () => {
  it('soft-skips when no sandbox is attached', async () => {
    const { screenshotTool } = await import('../tools/screenshot.js');
    const ctx = makeCtx(new MemoryWorkspace());
    const r = await screenshotTool.run({}, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.data?.base64).toBe('');
  });
});
