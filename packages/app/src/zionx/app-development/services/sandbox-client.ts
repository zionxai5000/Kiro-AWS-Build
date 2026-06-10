/**
 * E2B sandbox client — implements `SandboxClientLike` against the real E2B
 * SDK. The agent harness reads `ctx.sandbox` from `ToolContext` and calls
 * `runCommand` / `screenshot` / `getPublicUrl` through this surface.
 *
 * Lifecycle:
 *   - First touch on a project provisions a sandbox.
 *   - Subsequent touches resume the same sandbox (paused or alive).
 *   - 5-minute idle = auto-pause (E2B default).
 *   - 24h idle = E2B kills it; we lazily recreate on next touch.
 *   - `dispose(projectId)` lets the orchestrator hibernate eagerly.
 *
 * Security:
 *   - API key is resolved from `seraphim/e2b` via the credential manager.
 *     The key never lands in agent context (the harness never sees it).
 *   - Egress allowlist + abuse limits live in the E2B template, not here.
 *   - All commands route through the run-command tool's allowlist BEFORE
 *     reaching this client (defense in depth).
 */

import { Sandbox } from 'e2b';
import type { SandboxClientLike } from '../agent/types.js';

export interface SandboxClientConfig {
  /** Resolves the E2B API key on demand. Falls back to E2B_API_KEY env if absent. */
  getApiKey?: () => Promise<string | null | undefined>;
  /** Template id published via `e2b template build`. Default = E2B's `code-interpreter`. */
  template?: string;
  /** Sandbox auto-pause timeout in ms. E2B default is 5 minutes (300_000). */
  idleTimeoutMs?: number;
  /** Working directory inside the sandbox. */
  workDir?: string;
}

interface SandboxEntry {
  sandbox: Sandbox;
  /** When we last touched it — used for our own GC, separate from E2B's. */
  lastUsedAt: number;
  /** Public host string for port 8081 (Expo dev server), if known. */
  expoHost?: string;
}

const DEFAULT_TEMPLATE = 'base';
const DEFAULT_WORKDIR = '/home/user/project';
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

export class E2BSandboxClient implements SandboxClientLike {
  private readonly sandboxes = new Map<string, SandboxEntry>();
  private readonly config: Required<SandboxClientConfig>;

  constructor(config: SandboxClientConfig = {}) {
    this.config = {
      getApiKey: config.getApiKey ?? (async () => process.env.E2B_API_KEY),
      template: config.template ?? DEFAULT_TEMPLATE,
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      workDir: config.workDir ?? DEFAULT_WORKDIR,
    };
  }

  // ---------------------------------------------------------------------------
  // SandboxClientLike
  // ---------------------------------------------------------------------------

  async runCommand(
    projectId: string,
    cmd: string,
    opts: { timeoutMs?: number; cwd?: string; background?: boolean } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const entry = await this.ensureSandbox(projectId);
    entry.lastUsedAt = Date.now();
    if (opts.background) {
      // Background mode: spawn + return immediately. Caller should NOT
      // wait on stdout/stderr — the handle stays alive until killed.
      // We don't capture output here (no foreground wait).
      try {
        await entry.sandbox.commands.run(cmd, {
          cwd: opts.cwd ?? this.config.workDir,
          background: true,
          timeoutMs: opts.timeoutMs ?? this.config.idleTimeoutMs,
        } as never);
        return { stdout: '', stderr: '', exitCode: 0 };
      } catch (err) {
        return { stdout: '', stderr: (err as Error).message, exitCode: 1 };
      }
    }
    const result = await entry.sandbox.commands.run(cmd, {
      cwd: opts.cwd ?? this.config.workDir,
      timeoutMs: opts.timeoutMs ?? 60_000,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    };
  }

  async getPublicUrl(projectId: string): Promise<string> {
    const entry = await this.ensureSandbox(projectId);
    if (!entry.expoHost) {
      // Port 8081 is Expo dev server (per templates/golden-starter/app.json).
      const host = entry.sandbox.getHost(8081);
      // E2B returns just the host string; we add the scheme.
      entry.expoHost = host.startsWith('http') ? host : `https://${host}`;
    }
    return entry.expoHost;
  }

  /**
   * Headless screenshot of the running app. Optional — only works when the
   * sandbox template includes a chromium + a small capture script. Until
   * that's baked into the template, returns an empty base64 with a flag.
   */
  async screenshot(projectId: string): Promise<string> {
    const entry = await this.ensureSandbox(projectId);
    entry.lastUsedAt = Date.now();
    const url = await this.getPublicUrl(projectId);
    // Capture script (relies on chromium-headless inside the template).
    // Falls back to empty base64 if the binary is missing.
    const capture = await entry.sandbox.commands.run(
      `if command -v chromium-headless >/dev/null 2>&1; then ` +
      `chromium-headless --headless --disable-gpu --screenshot=/tmp/snap.png --window-size=1080,1920 "${url}" >/dev/null 2>&1 && ` +
      `base64 -w0 /tmp/snap.png; else echo "NO_CHROMIUM"; fi`,
      { timeoutMs: 30_000 },
    );
    if (capture.stdout?.trim() === 'NO_CHROMIUM') return '';
    return capture.stdout?.trim() ?? '';
  }

  // ---------------------------------------------------------------------------
  // File-level helpers — the agent's run_command tool covers most needs, but
  // direct file IO inside the sandbox is faster than running `cat`/`tee`.
  // ---------------------------------------------------------------------------

  async writeFile(projectId: string, path: string, content: string): Promise<void> {
    const entry = await this.ensureSandbox(projectId);
    entry.lastUsedAt = Date.now();
    const fullPath = path.startsWith('/') ? path : `${this.config.workDir}/${path}`;
    await entry.sandbox.files.write(fullPath, content);
  }

  /**
   * Write a binary file to the sandbox. The E2B SDK's files.write accepts
   * Buffer / Uint8Array natively. Used by the server-side bundler to push
   * Hermes bytecode and font files alongside the text bundle output.
   */
  async writeBinaryFile(projectId: string, path: string, content: Buffer | Uint8Array): Promise<void> {
    const entry = await this.ensureSandbox(projectId);
    entry.lastUsedAt = Date.now();
    const fullPath = path.startsWith('/') ? path : `${this.config.workDir}/${path}`;
    await entry.sandbox.files.write(fullPath, content as never);
  }

  async readFile(projectId: string, path: string): Promise<string> {
    const entry = await this.ensureSandbox(projectId);
    entry.lastUsedAt = Date.now();
    const fullPath = path.startsWith('/') ? path : `${this.config.workDir}/${path}`;
    const result = await entry.sandbox.files.read(fullPath);
    return typeof result === 'string' ? result : (result as Buffer).toString('utf-8');
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Hibernate the project's sandbox (pause if E2B supports it, else kill). */
  async dispose(projectId: string): Promise<void> {
    const entry = this.sandboxes.get(projectId);
    if (!entry) return;
    try {
      if (typeof entry.sandbox.pause === 'function') {
        await entry.sandbox.pause();
      } else {
        await entry.sandbox.kill();
      }
    } catch {
      /* best effort */
    }
    this.sandboxes.delete(projectId);
  }

  /** Tear down every tracked sandbox. Useful at server shutdown. */
  async disposeAll(): Promise<void> {
    const ids = Array.from(this.sandboxes.keys());
    await Promise.allSettled(ids.map((id) => this.dispose(id)));
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async ensureSandbox(projectId: string): Promise<SandboxEntry> {
    const cached = this.sandboxes.get(projectId);
    if (cached) {
      // Best-effort: if the sandbox is paused, resume it.
      try {
        if (typeof cached.sandbox.isRunning === 'function') {
          const running = await cached.sandbox.isRunning();
          if (!running && typeof (cached.sandbox as { resume?: () => Promise<unknown> }).resume === 'function') {
            await (cached.sandbox as unknown as { resume: () => Promise<void> }).resume();
          }
        }
        return cached;
      } catch {
        // Sandbox is gone (24h timeout, killed externally). Fall through to recreate.
        this.sandboxes.delete(projectId);
      }
    }
    const apiKey = (await this.config.getApiKey()) ?? '';
    if (!apiKey || !apiKey.startsWith('e2b_')) {
      throw new Error('E2BSandboxClient: no valid E2B API key (resolve seraphim/e2b first)');
    }
    const sandbox = await Sandbox.create(this.config.template, {
      apiKey,
      timeoutMs: this.config.idleTimeoutMs,
    });
    // Ensure the project workdir exists. The `base` template doesn't create
    // it; running commands with cwd=missing-dir fails with [invalid_argument].
    try {
      await sandbox.commands.run(`mkdir -p ${this.config.workDir}`, { timeoutMs: 5_000 });
    } catch {
      /* best effort — agent will re-init if needed */
    }
    const entry: SandboxEntry = { sandbox, lastUsedAt: Date.now() };
    this.sandboxes.set(projectId, entry);
    return entry;
  }
}
