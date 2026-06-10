/**
 * Server-side Expo web bundler.
 *
 * Why this exists: running `npm install` + `npx expo start --web` inside
 * the E2B sandbox times out reliably — npm install for an Expo SDK 54
 * project takes 3–5 minutes, longer than the sandbox idle window in many
 * cases, and the sandbox dies mid-install. The "Sandbox Not Found" error
 * the user keeps seeing in the preview iframe is a direct symptom of this.
 *
 * The fix: do the heavy lifting OUTSIDE the sandbox. The ECS task already
 * has node + npm. We:
 *   1. Stage the project files into a server-side temp dir
 *   2. Run `npm install --legacy-peer-deps` there (the ECS box has no idle
 *      timer)
 *   3. Run `npx expo export --platform web` to produce a static `dist/`
 *   4. Push the static bundle into the sandbox via writeFile
 *   5. Start `python3 -m http.server 8081` in the sandbox (no npm install,
 *      so no timeout)
 *
 * Trade-off: server-side bundling is slower than a pre-baked sandbox
 * template, but it's deterministic and needs no interactive CLI auth.
 *
 * Idempotent: if the same project bundles twice, the second run reuses
 * the cached node_modules from the first.
 */

import { mkdir, rm, readFile as readFileAsync, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import type { Workspace } from '../workspace/workspace.js';

const execFileAsync = promisify(execFile);

export interface SandboxClientLike {
  runCommand(projectId: string, cmd: string, opts?: { timeoutMs?: number; background?: boolean; cwd?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  writeFile(projectId: string, path: string, content: string): Promise<void>;
  /** Write raw bytes — SDK accepts Buffer/Uint8Array. Optional for backward compat. */
  writeBinaryFile?(projectId: string, path: string, content: Buffer | Uint8Array): Promise<void>;
  /** Extend the sandbox lifetime (resets deadline). Optional. */
  extendTimeout?(projectId: string, timeoutMs: number): Promise<void>;
  getPublicUrl(projectId: string): Promise<string>;
}

export interface BundleOptions {
  projectId: string;
  workspace: Workspace;
  sandbox: SandboxClientLike;
  /** Optional progress callback; receives short status strings. */
  onProgress?: (phase: string, detail?: string) => void;
}

export interface BundleResult {
  success: boolean;
  bundleDir: string;
  filesUploaded: number;
  durationMs: number;
  error?: string;
  /** Public URL the iframe should point at (sandbox port 8081). */
  publicUrl?: string;
}

/**
 * Bundle a project on the server, push the result into the sandbox, and
 * start the static server. Returns a `BundleResult` describing what
 * happened — never throws.
 */
export async function bundleAndServe(opts: BundleOptions): Promise<BundleResult> {
  const start = Date.now();
  const progress = (phase: string, detail?: string) => {
    opts.onProgress?.(phase, detail);
  };

  // Server-side scratch dir for this project. Cached across runs so a
  // re-build can reuse node_modules.
  const stageDir = join(tmpdir(), `zionx-bundle-${sanitize(opts.projectId)}`);
  const bundleDir = join(stageDir, 'dist');

  try {
    progress('stage', `Staging files in ${stageDir}`);
    await mkdir(stageDir, { recursive: true });
    // Copy workspace into stage dir.
    const allFiles = await opts.workspace.listFiles(opts.projectId);
    let staged = 0;
    for (const path of allFiles) {
      if (skipPath(path)) continue;
      try {
        const content = await opts.workspace.readFile(opts.projectId, path);
        const target = join(stageDir, path);
        await mkdir(join(target, '..'), { recursive: true });
        const { writeFile } = await import('node:fs/promises');
        await writeFile(target, content, 'utf-8');
        staged++;
      } catch (e) {
        console.warn(`[server-bundler] stage ${path} failed: ${(e as Error).message}`);
      }
    }
    progress('staged', `${staged} files staged`);

    // CRITICAL: overlay the canonical golden-starter package.json + app.json
    // on top of whatever the agent emitted. The agent's source code is what
    // we want to ship, but the agent reliably hallucinates dep versions and
    // app.json plugins that fail at expo export. Using the canonical config
    // means we get a consistent, working build chain every time.
    const goldenStarterPath = await findGoldenStarter();
    if (goldenStarterPath) {
      const overlay = ['package.json', 'app.json', 'babel.config.js', 'metro.config.js', 'tsconfig.json'];
      const { writeFile, copyFile } = await import('node:fs/promises');
      let overlaid = 0;
      for (const f of overlay) {
        const src = join(goldenStarterPath, f);
        if (existsSync(src)) {
          const dst = join(stageDir, f);
          try {
            await copyFile(src, dst);
            overlaid++;
          } catch (e) {
            console.warn(`[server-bundler] overlay ${f}: ${(e as Error).message}`);
          }
        }
      }
      // Mark this in workspace state by writing a small marker file.
      try {
        await writeFile(join(stageDir, '.zionx-bundler.json'), JSON.stringify({ usedGoldenStarterConfig: true, overlaid }), 'utf-8');
      } catch { /* ignore */ }
      progress('overlay', `Used canonical golden-starter config (${overlaid} files)`);
    }

    // Confirm package.json is present.
    const pkgPath = join(stageDir, 'package.json');
    if (!existsSync(pkgPath)) {
      return { success: false, bundleDir: '', filesUploaded: 0, durationMs: Date.now() - start, error: 'no package.json in project workspace' };
    }

    // Defensive: strip known non-plugin entries from app.json's expo.plugins
    // array. The agent occasionally emits packages like expo-haptics in
    // plugins[], which makes expo export fail with PluginError. Most
    // expo-* packages are runtime libs, not config plugins.
    try {
      const appJsonPath = join(stageDir, 'app.json');
      if (existsSync(appJsonPath)) {
        const raw = await readFileAsync(appJsonPath, 'utf-8');
        const j = JSON.parse(raw) as { expo?: { plugins?: unknown[] } };
        if (j.expo?.plugins && Array.isArray(j.expo.plugins)) {
          const NON_PLUGINS = new Set([
            'expo-haptics', 'expo-blur', 'expo-linear-gradient', 'expo-status-bar',
            'expo-image', 'react-native-reanimated', 'react-native-gesture-handler',
            'moti', 'zustand', '@react-native-async-storage/async-storage',
            'lucide-react-native',
          ]);
          const filtered = j.expo.plugins.filter((p: unknown) => {
            const name = typeof p === 'string' ? p : Array.isArray(p) ? p[0] : null;
            return typeof name !== 'string' || !NON_PLUGINS.has(name);
          });
          if (filtered.length !== j.expo.plugins.length) {
            const removed = j.expo.plugins.length - filtered.length;
            j.expo.plugins = filtered;
            const { writeFile } = await import('node:fs/promises');
            await writeFile(appJsonPath, JSON.stringify(j, null, 2), 'utf-8');
            progress('plugin-fix', `Removed ${removed} non-plugin entries from app.json plugins`);
          }
        }
      }
    } catch (e) {
      console.warn(`[server-bundler] app.json plugin sanitize: ${(e as Error).message}`);
    }

    // npm install (idempotent — reuses node_modules if present).
    // --ignore-scripts skips postinstall hooks (e.g. react-native-screens
    // runs `bob build && husky install` which needs dev tooling we don't
    // ship in the ECS container). Published packages already have built
    // lib/ output, so skipping postinstall is safe for the web bundle.
    const nodeModulesPresent = existsSync(join(stageDir, 'node_modules'));
    if (!nodeModulesPresent) {
      progress('install', 'Running npm install (~2-3 min)…');
      await execFileAsync('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--ignore-scripts'], {
        cwd: stageDir,
        env: { ...process.env, CI: '1' },
        maxBuffer: 50 * 1024 * 1024,
        timeout: 10 * 60_000, // 10 min cap
      }).catch((e) => {
        // npm install can produce stderr noise but still succeed with installed
        // packages on disk. Tolerate non-zero exit if node_modules now exists.
        if (existsSync(join(stageDir, 'node_modules'))) return { stdout: '', stderr: '' };
        throw e;
      });
      progress('installed', 'npm install complete');
    } else {
      progress('install-cached', 'Reusing cached node_modules');
    }

    // Export web bundle.
    progress('export', 'Running expo export --platform web…');
    await rm(bundleDir, { recursive: true, force: true });
    let exportFailure: string | null = null;
    try {
      await execFileAsync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
        cwd: stageDir,
        env: { ...process.env, CI: '1' },
        maxBuffer: 50 * 1024 * 1024,
        timeout: 5 * 60_000,
      });
    } catch (e) {
      exportFailure = (e as { stderr?: string; message: string }).stderr ?? (e as Error).message;
    }
    // Verify the export actually produced a bundle.
    const indexPath = join(bundleDir, 'index.html');
    if (!existsSync(indexPath)) {
      const detail = exportFailure ? exportFailure.slice(0, 400) : 'no index.html in dist/';
      return { success: false, bundleDir, filesUploaded: 0, durationMs: Date.now() - start, error: `expo export failed: ${detail}` };
    }
    // Patch the entry <script> tag to type="module". Expo SDK 54's web
    // export bundles use `import.meta` which only works in module mode;
    // the default emitted index.html uses a classic script and the page
    // throws "Cannot use 'import.meta' outside a module" at load. We
    // rewrite once before upload.
    try {
      const indexHtml = await readFileAsync(indexPath, 'utf-8');
      const patched = indexHtml.replace(
        /<script\s+src="(\/_expo\/static\/[^"]+\.js)"\s+defer><\/script>/,
        '<script type="module" src="$1"></script>',
      );
      if (patched !== indexHtml) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(indexPath, patched, 'utf-8');
        progress('patch-index', 'Patched index.html: script → type=module');
      }
    } catch (e) {
      console.warn(`[server-bundler] index.html patch: ${(e as Error).message}`);
    }
    progress('exported', 'Bundle ready');

    // Push the bundle into the sandbox.
    // Upload EVERY file as raw bytes via writeBinaryFile — the E2B SDK
    // handles strings + Buffers identically. No more text/binary
    // classification headaches: the JS bundle, sourcemaps, fonts, images,
    // hermes bytecode all go through unmodified.
    progress('upload', 'Pushing bundle into sandbox…');
    // Refresh the sandbox lifetime — the long expo export ate most of
    // the initial budget. Without this, every upload call hits a
    // sandbox that E2B has already killed for inactivity.
    if (opts.sandbox.extendTimeout) {
      await opts.sandbox.extendTimeout(opts.projectId, 15 * 60_000).catch(() => {});
    }
    await opts.sandbox.runCommand(opts.projectId, 'mkdir -p /home/user/project/dist', { timeoutMs: 30_000 }).catch(() => {});
    let uploaded = 0;
    let skipped = 0;
    let firstError: string | null = null;
    for await (const filePath of walk(bundleDir)) {
      const rel = relative(bundleDir, filePath).replace(/\\/g, '/');
      try {
        const buf = await readFileAsync(filePath);
        if (opts.sandbox.writeBinaryFile) {
          await opts.sandbox.writeBinaryFile(opts.projectId, `dist/${rel}`, buf);
        } else {
          await opts.sandbox.writeFile(opts.projectId, `dist/${rel}`, buf.toString('utf-8'));
        }
        uploaded++;
      } catch (e) {
        skipped++;
        const msg = (e as Error).message;
        if (!firstError) firstError = `${rel}: ${msg.slice(0, 200)}`;
        console.warn(`[server-bundler] upload ${rel} skipped: ${msg}`);
      }
    }
    if (uploaded === 0 && skipped > 0) {
      progress('upload-fail', `All ${skipped} files failed. First error: ${firstError ?? 'unknown'}`);
    } else {
      progress('uploaded', `${uploaded} files uploaded (${skipped} skipped)`);
    }

    // Start a tiny http server inside the sandbox on port 8081.
    progress('serve', 'Starting static server in sandbox…');
    await opts.sandbox.runCommand(opts.projectId,
      'pkill -f "http.server 8081" 2>/dev/null; cd /home/user/project/dist && nohup python3 -m http.server 8081 > /tmp/server.log 2>&1 & echo started_pid=$!',
      { timeoutMs: 15_000 }).catch(() => {});

    // Keep the sandbox alive — E2B's idle timer only resets on tool
    // calls, not on incoming HTTP traffic. Without periodic touch the
    // sandbox is GC'd in 5 min and the iframe goes back to "Sandbox
    // Not Found". This nohup loop touches a file every 60s for an
    // hour, which keeps the sandbox warm during normal browsing.
    await opts.sandbox.runCommand(opts.projectId,
      'pkill -f zionx-keepalive 2>/dev/null; nohup bash -c "for i in $(seq 1 60); do touch /tmp/zionx-keepalive; sleep 60; done" > /dev/null 2>&1 & echo keepalive_pid=$!',
      { timeoutMs: 10_000 }).catch(() => {});

    const url = await opts.sandbox.getPublicUrl(opts.projectId);
    progress('ready', `Preview live at ${url}`);

    // Schedule periodic ECS-side touches to keep the sandbox warm.
    // E2B's idle timer resets on tool calls (the SDK kind), so we run
    // a no-op runCommand every 4 minutes for up to 1 hour. After 1 hour
    // the loop exits and the sandbox is allowed to die naturally.
    schedulePeriodicKeepalive(opts.projectId, opts.sandbox);

    return { success: true, bundleDir, filesUploaded: uploaded, durationMs: Date.now() - start, publicUrl: url };
  } catch (err) {
    return { success: false, bundleDir, filesUploaded: 0, durationMs: Date.now() - start, error: (err as Error).message };
  }
}

/** Skip patterns we never want server-side. */
function skipPath(p: string): boolean {
  return p.startsWith('node_modules/')
    || p.startsWith('.expo/')
    || p.startsWith('.meta/')
    || p.startsWith('dist/')
    || p === 'package-lock.json';
}

/**
 * Find templates/golden-starter on disk. The Dockerfile copies templates/
 * to /app/templates/ in the runtime container; in dev it lives at the
 * monorepo root. Walks up from this file's directory looking for it.
 */
async function findGoldenStarter(): Promise<string | null> {
  const candidates = [
    // Dev: monorepo root
    '/app/templates/golden-starter',
    join(process.cwd(), 'templates/golden-starter'),
    join(process.cwd(), '../../templates/golden-starter'),
    join(process.cwd(), '../../../templates/golden-starter'),
  ];
  for (const c of candidates) {
    if (existsSync(c) && existsSync(join(c, 'package.json'))) return c;
  }
  return null;
}

/**
 * Schedule periodic touch of an E2B sandbox so it doesn't hit the 5-min
 * idle timer. Touches every 4 minutes for up to 1 hour. Idempotent —
 * if a keepalive is already running for this project, it's reset.
 */
const keepaliveTimers = new Map<string, NodeJS.Timeout>();
const KEEPALIVE_INTERVAL_MS = 4 * 60_000;
const KEEPALIVE_MAX_DURATION_MS = 60 * 60_000;

function schedulePeriodicKeepalive(projectId: string, sandbox: SandboxClientLike): void {
  const existing = keepaliveTimers.get(projectId);
  if (existing) clearTimeout(existing);

  const start = Date.now();
  const tick = async (): Promise<void> => {
    if (Date.now() - start > KEEPALIVE_MAX_DURATION_MS) {
      keepaliveTimers.delete(projectId);
      return;
    }
    try {
      await sandbox.runCommand(projectId, 'true', { timeoutMs: 5_000 });
    } catch {
      // Sandbox is gone — stop trying.
      keepaliveTimers.delete(projectId);
      return;
    }
    keepaliveTimers.set(projectId, setTimeout(() => { void tick(); }, KEEPALIVE_INTERVAL_MS));
  };
  keepaliveTimers.set(projectId, setTimeout(() => { void tick(); }, KEEPALIVE_INTERVAL_MS));
}

/** Sanitize a project id for use as a filesystem path. */
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

/** Recursively walk a dir yielding absolute file paths. */
async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// Used only by the standalone smoke test below.
export const __test__ = { skipPath, sanitize };
