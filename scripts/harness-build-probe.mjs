/**
 * Build-from-scratch probe — exercises the full agent loop with reviewers.
 * Asks Claude to scaffold a minimal habit tracker. Reviewer subagents fire
 * automatically; we capture their pass/fail and the final workspace state.
 *
 * Cost: ~$0.20-0.50 (a real generation, not a tool-only edit).
 */

import { agentLoop } from '../packages/app/dist/zionx/app-development/agent/index.js';

class MemoryWorkspace {
  files = new Map();
  async readFile(_p, path) {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT ${path}`);
    return v;
  }
  async writeFile(_p, path, content) { this.files.set(path, content); }
  async listFiles(_p) { return [...this.files.keys()].sort(); }
  async exists(_p, path) { return this.files.has(path); }
  async delete(_p, path) { this.files.delete(path); }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

const ws = new MemoryWorkspace();
// Seed nothing — pure greenfield. The agent should know to scaffold from
// templates/golden-starter via the system prompt + skills.
ws.files.set('package.json', JSON.stringify({
  name: 'probe-habit', version: '1.0.0',
  dependencies: {
    'expo': '~54.0.0',
    'react': '18.3.1',
    'react-native': '0.76.5',
    'expo-router': '~4.0.0',
    'zustand': '^4.5.0',
    '@react-native-async-storage/async-storage': '~1.23.1',
    'react-native-reanimated': '~3.16.5',
    'moti': '^0.30.0',
    'expo-haptics': '~14.0.1',
    'expo-blur': '~14.0.3',
    'expo-linear-gradient': '~14.0.2',
    'react-native-safe-area-context': '4.12.0',
  },
}, null, 2));

const events = [];
const start = Date.now();

console.log('=== Habit-tracker build probe ===');
console.log('Seed:', (await ws.listFiles('p')).join(', '));
console.log('');

const result = await agentLoop(
  {
    prompt: 'Build a small habit tracker. Add a habit, mark it done today, see the streak. Persist with zustand+AsyncStorage. One screen at app/(tabs)/index.tsx. Keep it short (<100 lines per file). Don\'t emit a spec card or load skills — just produce the files.',
    projectId: 'probe-habit-1',
    userId: 'probe-user',
  },
  {
    workspace: ws,
    emit: (e) => {
      events.push(e);
      if (e.type === 'tool.call') console.log(`  [tool] ${e.name} — ${e.summary ?? ''}`);
      if (e.type === 'tool.result' && e.isError) console.log(`         ERROR`);
      if (e.type === 'iteration') console.log(`\n[iter ${e.index}]`);
      if (e.type === 'subagent.spawn') console.log(`  [reviewer] spawning ${e.name}`);
      if (e.type === 'subagent.result') console.log(`  [reviewer] ${e.name}: ${e.passed ? 'PASS' : 'FAIL'} (${e.score ?? '–'})`);
      if (e.type === 'done') console.log(`\n  [agent done] ${e.reason}`);
    },
    log: () => {},
  },
  {
    config: { apiKey, maxIterations: 20, perCallMaxTokens: 6000 },
    budget: { maxIterations: 20, maxInputTokens: 600_000, maxOutputTokens: 120_000 },
    reviewers: true,
    maxReviewerRetries: 1,
  },
);

console.log('');
console.log('=== Result ===');
console.log({
  passed: result.passed,
  reason: result.reason,
  iterations: result.iterations,
  filesWritten: result.filesWritten,
  filesEdited: result.filesEdited,
  tokens: result.tokens,
  reviewers: result.reviewers,
  durationMs: Date.now() - start,
});

console.log('');
console.log('=== Final workspace ===');
const files = await ws.listFiles('p');
for (const f of files) {
  const body = await ws.readFile('p', f);
  console.log(`--- ${f} (${body.length} bytes) ---`);
}

// Assertions for the smoke probe.
const hasIndex = files.includes('app/(tabs)/index.tsx');
const hasStore = files.some((f) => /store|data/.test(f) && /\.(ts|tsx|js|jsx)$/.test(f));
console.log('');
console.log('Smoke checks:');
console.log('  app/(tabs)/index.tsx exists:', hasIndex ? 'YES' : 'NO');
console.log('  data store file exists:    ', hasStore ? 'YES' : 'NO');
console.log('  reviewers reported:        ', (result.reviewers ?? []).length);

process.exit((hasIndex && hasStore) ? 0 : 1);
