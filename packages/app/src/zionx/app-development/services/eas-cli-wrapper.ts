/**
 * EAS CLI Wrapper — subprocess wrapper around `npx eas` commands.
 *
 * Uses child_process.spawn (NOT exec/execSync) for:
 * - No shell injection risk (argv array form, shell: false)
 * - Full stdout/stderr buffering
 * - Timeout support
 * - EXPO_TOKEN set only in child process env (not process.env)
 *
 * JSON parsing: EAS CLI with --json may output progress/spinner lines before
 * the final JSON. Parser extracts the LAST line starting with `{` or `[`.
 * Handles both \r\n (Windows) and \n (Unix) line endings.
 *
 * Cross-platform: On Windows, npx requires the .cmd extension. We detect
 * platform and use the correct binary name.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EasCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Parsed JSON from the last JSON line of stdout (null if no JSON found) */
  parsedJson: unknown | null;
}

export interface EasCliOptions {
  /** Working directory for the EAS command */
  cwd: string;
  /** EXPO_TOKEN for authentication (set in child env only, never process.env) */
  expoToken: string;
  /** Additional environment variables for the child process */
  env?: Record<string, string>;
  /** Timeout in ms (default: 60000 for most commands, longer for builds) */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Get the correct npx binary name for the current platform.
 * Windows requires .cmd extension.
 */
function getNpxBinary(): string {
  return platform() === 'win32' ? 'npx.cmd' : 'npx';
}

/**
 * Run an EAS CLI command via subprocess.
 *
 * @param args - Arguments after `eas` (e.g., ['build', '--platform', 'ios', '--json', '--non-interactive'])
 * @param options - Execution options (cwd, token, timeout)
 * @returns { stdout, stderr, exitCode, parsedJson }
 * @throws Error if the process times out or fails to spawn
 */
export async function runEasCommand(
  args: string[],
  options: EasCliOptions,
): Promise<EasCliResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const npx = getNpxBinary();

  // Build child process environment — EXPO_TOKEN set here only, not in process.env
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    EXPO_TOKEN: options.expoToken,
    // Disable interactive prompts
    CI: '1',
    ...(options.env ?? {}),
  };

  return new Promise<EasCliResult>((resolve, reject) => {
    const child: ChildProcess = spawn(npx, ['eas', ...args], {
      cwd: options.cwd,
      env: childEnv,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    // Timeout handling
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`EAS CLI timed out after ${timeoutMs}ms: eas ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn EAS CLI: ${err.message}`));
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      const code = exitCode ?? 1;

      const parsedJson = parseLastJsonLine(stdout);

      if (code !== 0) {
        const error = new Error(
          `EAS CLI exited with code ${code}: eas ${args.join(' ')}\n` +
          `stderr: ${stderr.slice(0, 500)}`
        );
        (error as any).easResult = { stdout, stderr, exitCode: code, parsedJson };
        reject(error);
        return;
      }

      resolve({ stdout, stderr, exitCode: code, parsedJson });
    });
  });
}

// ---------------------------------------------------------------------------
// JSON Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the last line of stdout that starts with `{` or `[` as JSON.
 *
 * EAS CLI with --json may output progress/spinner lines before the final JSON.
 * We find the last valid JSON line and parse it.
 *
 * Handles both \r\n (Windows) and \n (Unix) line endings.
 */
export function parseLastJsonLine(stdout: string): unknown | null {
  if (!stdout.trim()) return null;

  // Split on any line ending style
  const lines = stdout.split(/\r?\n/);

  // Search from the end for the last line starting with { or [
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Not valid JSON — try the next line up
        continue;
      }
    }
  }

  // No JSON line found — try parsing the entire stdout as JSON
  // (some commands output multi-line JSON)
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}
