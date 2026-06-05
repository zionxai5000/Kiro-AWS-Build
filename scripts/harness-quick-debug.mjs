import { writeFileTool } from '../packages/app/dist/zionx/app-development/agent/tools/write-file.js';
import { loadSkillTool } from '../packages/app/dist/zionx/app-development/agent/tools/load-skill.js';

class W {
  files = new Map();
  async readFile(_p, path) { const v = this.files.get(path); if (v === undefined) throw new Error(`ENOENT ${path}`); return v; }
  async writeFile(_p, path, content) { this.files.set(path, content); }
  async listFiles(_p) { return [...this.files.keys()].sort(); }
  async exists(_p, path) { return this.files.has(path); }
  async delete(_p, path) { this.files.delete(path); }
}
const ws = new W();
const ctx = { projectId: 'p', userId: 'u', workspace: ws, emit: () => {}, readFiles: new Set(), log: () => {} };

const r1 = await writeFileTool.run({ path: 'index.html', content: '<h1>hi</h1>' }, ctx);
console.log('write_file standard:', r1.isError ? 'FAIL' : 'OK', '-', r1.content);

const r2 = await loadSkillTool.run({ name: 'frontend-app-design' }, ctx);
console.log('load_skill:', r2.isError ? 'FAIL' : 'OK', '- body length:', r2.data?.body?.length ?? 0);
