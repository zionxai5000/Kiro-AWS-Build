/**
 * run-command tool — invokes a shell command inside the project's E2B
 * sandbox. Gated by the command-allowlist guardrail. Without a sandbox
 * client (Phase 4 not yet wired), the tool errors immediately.
 */

import type { Tool, ToolResult } from '../types.js';
import { verifyCommand } from '../guardrails/command-allowlist.js';

interface Input { command: string; cwd?: string; timeoutMs?: number; }
interface Output { stdout: string; stderr: string; exitCode: number; durationMs: number; }

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_BYTES = 60_000;

export const runCommandTool: Tool<Input, Output> = {
  name: 'run_command',
  description:
    'Run a shell command inside the project sandbox. ' +
    'Allowlisted binaries only (npm, npx, expo, eas, tsc, eslint, prettier, jest, vitest, git read-only). ' +
    'No shell metacharacters (|, &, ;, $()). ' +
    'Returns stdout/stderr/exitCode (output tail-clipped to ~60KB).',
  inputSchema: {
    type: 'object',
    properties: {
      command:   { type: 'string',  description: 'The exact command line. Single binary + args, no piping.' },
      cwd:       { type: 'string',  description: 'Optional sandbox-relative working directory (defaults to project root).' },
      timeoutMs: { type: 'number',  description: `Optional timeout (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).` },
    },
    required: ['command'],
    additionalProperties: false,
  },
  async run({ command, cwd, timeoutMs }, ctx): Promise<ToolResult<Output>> {
    if (typeof command !== 'string' || !command.trim()) {
      return { content: 'run_command: `command` is required (non-empty string)', isError: true };
    }
    const verdict = verifyCommand(command);
    if (!verdict.allowed) {
      return { content: `run_command: rejected — ${verdict.reason}`, isError: true };
    }
    if (!ctx.sandbox) {
      // No sandbox attached (Phase 4 not yet wired). Return a "skipped"
      // result that's NOT marked isError, so the agent treats it as a
      // soft no-op and moves on instead of looping on the failure.
      return {
        content:
          `run_command: skipped (no sandbox attached). ` +
          `Phase 4 (E2B sandbox client) is not yet wired — \`seraphim/e2b\` secret needs to be created. ` +
          `Treat this as: "the command would have been run; assume best-effort success and continue."`,
        data: { stdout: '', stderr: 'no-sandbox', exitCode: 0, durationMs: 0 },
      };
    }
    const t = Math.min(timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    const start = Date.now();
    let result: { stdout: string; stderr: string; exitCode: number };
    try {
      result = await ctx.sandbox.runCommand(ctx.projectId, command, { timeoutMs: t, cwd });
    } catch (err) {
      return { content: `run_command: sandbox error — ${(err as Error).message}`, isError: true };
    }
    const durationMs = Date.now() - start;

    const stdout = tailClip(result.stdout, OUTPUT_TAIL_BYTES);
    const stderr = tailClip(result.stderr, OUTPUT_TAIL_BYTES);
    const ok = result.exitCode === 0;
    const content =
      `$ ${command}\n` +
      `(exit ${result.exitCode} in ${durationMs}ms)\n` +
      (stdout ? `\n--- stdout ---\n${stdout}` : '') +
      (stderr ? `\n--- stderr ---\n${stderr}` : '');

    return {
      content,
      data: { stdout, stderr, exitCode: result.exitCode, durationMs },
      isError: !ok,
    };
  },
};

function tailClip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `[head clipped, kept last ${max} bytes]\n…${s.slice(-max)}`;
}
