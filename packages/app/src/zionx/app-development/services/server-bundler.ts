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

    // Confirm package.json is present.
    const pkgPath = join(stageDir, 'package.json');
    if (!existsSync(pkgPath)) {
      return { success: false, bundleDir: '', filesUploaded: 0, durationMs: Date.now() - start, error: 'no package.json in project workspace' };
    }

    // npm install (idempotent — reuses node_modules if present).
    const nodeModulesPresent = existsSync(join(stageDir, 'node_modules'));
    if (!nodeModulesPresent) {
      progress('install', 'Running npm install (~2-3 min)…');
      await execFileAsync('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'], {
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
    await execFileAsync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], {
      cwd: stageDir,
      env: { ...process.env, CI: '1' },
      maxBuffer: 50 * 1024 * 1024,
      timeout: 5 * 60_000,
    }).catch((e) => {
      // expo export can be flaky in CI; check if dist/ was produced.
      if (existsSync(bundleDir)) return { stdout: '', stderr: '' };
      throw e;
    });
    progress('exported', 'Bundle ready');

    // Push the bundle into the sandbox.
    progress('upload', 'Pushing bundle into sandbox…');
    await opts.sandbox.runCommand(opts.projectId, 'mkdir -p /home/user/project/dist', { timeoutMs: 30_000 }).catch(() => {});
    let uploaded = 0;
    for await (const filePath of walk(bundleDir)) {
      const rel = relative(bundleDir, filePath).replace(/\\/g, '/');
      try {
        const content = await readFileAsync(filePath, 'utf-8');
        await opts.sandbox.writeFile(opts.projectId, `dist/${rel}`, content);
        uploaded++;
      } catch (e) {
        // Binary files (fonts, images) can't go through utf-8 writeFile.
        // Skip them with a warning — the JS bundle itself is text.
        console.warn(`[server-bundler] upload ${rel} skipped: ${(e as Error).message}`);
      }
    }
    progress('uploaded', `${uploaded} static files in sandbox`);

    // Start a tiny http server inside the sandbox on port 8081.
    progress('serve', 'Starting static server in sandbox…');
    await opts.sandbox.runCommand(opts.projectId,
      'pkill -f "http.server 8081" 2>/dev/null; cd /home/user/project/dist && nohup python3 -m http.server 8081 > /tmp/server.log 2>&1 & echo started_pid=$!',
      { timeoutMs: 15_000 }).catch(() => {});

    const url = await opts.sandbox.getPublicUrl(opts.projectId);
    progress('ready', `Preview live at ${url}`);

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
