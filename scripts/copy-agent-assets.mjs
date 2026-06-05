/**
 * Copies non-TS agent assets (skill .md files) from src/ into dist/.
 *
 * tsc only copies .ts/.tsx — markdown skill bodies don't end up in dist by
 * default, but the agent loads them at runtime via load_skill. Run after
 * `tsc --build` to keep them in sync.
 */

import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

const SRC = join(repoRoot, 'packages', 'app', 'src', 'zionx', 'app-development', 'agent', 'skills');
const DST = join(repoRoot, 'packages', 'app', 'dist', 'zionx', 'app-development', 'agent', 'skills');

await mkdir(DST, { recursive: true });
const entries = await readdir(SRC);
const mdFiles = entries.filter((f) => f.endsWith('.md'));
for (const f of mdFiles) {
  await copyFile(join(SRC, f), join(DST, f));
}
console.log(`[copy-agent-assets] copied ${mdFiles.length} skill .md files to dist/`);
