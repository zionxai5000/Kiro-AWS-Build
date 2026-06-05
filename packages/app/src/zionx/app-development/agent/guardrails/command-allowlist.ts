/**
 * Command allowlist — only these binaries may be invoked through the
 * `run_command` tool inside an E2B sandbox. Everything else is rejected
 * BEFORE reaching the sandbox SDK.
 *
 * Intent: prevent the agent (or a prompt-injected payload) from doing
 *   - apt/yum installs
 *   - curl|sh
 *   - rm -rf /
 *   - outbound C2 via wget
 * The sandbox itself enforces egress allowlists at the network level; this
 * is the application-layer second line of defense.
 */

/** Binaries explicitly permitted as the COMMAND (first token of argv). */
export const ALLOWED_COMMANDS: readonly string[] = [
  // Node ecosystem
  'node', 'npm', 'npx', 'pnpm', 'yarn',
  // Expo / EAS
  'expo', 'eas',
  // TypeScript / linters / formatters
  'tsc', 'eslint', 'prettier',
  // Test runners
  'jest', 'vitest',
  // Filesystem reads (no writes that could escape workspace)
  'ls', 'cat', 'pwd', 'echo', 'true', 'false',
  // Git (read-only common subcommands; we still gate the subcommand below)
  'git',
] as const;

/** Git subcommands permitted when the command is `git`. Read-mostly.
 *  `push` is intentionally NOT here — destructive history-rewrite is a step
 *  that should be initiated by King, not the agent. The agent can show diffs
 *  via `log`/`diff`/`show` but not push. */
export const ALLOWED_GIT_SUBCOMMANDS: readonly string[] = [
  'status', 'log', 'diff', 'show', 'rev-parse', 'branch', 'remote',
  'fetch', 'pull', 'add', 'commit',
] as const;

export interface AllowlistVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Tokenize argv crudely (handles quoted strings) and check the binary +
 * any subcommand-level rules. We do NOT support shell metacharacters
 * (`|`, `&&`, `;`, backticks, `$()`) — those are an immediate reject.
 */
export function verifyCommand(cmd: string): AllowlistVerdict {
  const trimmed = cmd.trim();
  if (!trimmed) return { allowed: false, reason: 'empty command' };

  // Block any shell chaining/substitution upfront. Sandbox `run_command`
  // is for invoking ONE binary, not orchestrating shells.
  if (/[|&;`]/.test(trimmed)) {
    return { allowed: false, reason: 'shell metacharacters not allowed (|, &, ;, `)' };
  }
  if (/\$\(/.test(trimmed)) {
    return { allowed: false, reason: 'command substitution $(...) not allowed' };
  }
  if (/\brm\b\s+(?:-rf?|--recursive|--force)/i.test(trimmed)) {
    return { allowed: false, reason: 'rm -rf is forbidden' };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return { allowed: false, reason: 'empty after tokenize' };

  const binary = pathBasename(tokens[0]!);
  if (!ALLOWED_COMMANDS.includes(binary)) {
    return {
      allowed: false,
      reason: `binary "${binary}" not in allowlist (${ALLOWED_COMMANDS.join(', ')})`,
    };
  }

  if (binary === 'git') {
    const sub = tokens[1];
    if (!sub || !ALLOWED_GIT_SUBCOMMANDS.includes(sub)) {
      return {
        allowed: false,
        reason: `git subcommand "${sub ?? '(missing)'}" not in allowlist`,
      };
    }
  }

  return { allowed: true };
}

function pathBasename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function tokenize(cmd: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch as '"' | "'";
    } else if (/\s/.test(ch)) {
      if (buf) { out.push(buf); buf = ''; }
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}
