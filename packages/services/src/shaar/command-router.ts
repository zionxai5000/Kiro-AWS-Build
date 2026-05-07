/**
 * Shaar API Layer — Command Router
 *
 * Parses commands from any channel and routes to Seraphim_Core with
 * uniform semantic interpretation regardless of source channel.
 *
 * Requirements: 9.2, 9.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandSource = 'dashboard' | 'api' | 'imessage' | 'voice' | 'email' | 'telegram' | 'cli';

export interface RawCommand {
  source: CommandSource;
  rawText: string;
  userId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedCommand {
  action: string;
  target?: string;
  params: Record<string, unknown>;
  source: CommandSource;
  userId: string;
  tenantId: string;
  parsedAt: string;
}

export interface CommandResult {
  success: boolean;
  action: string;
  result: unknown;
  executedAt: string;
}

// ---------------------------------------------------------------------------
// Command Patterns
// ---------------------------------------------------------------------------

interface CommandPattern {
  pattern: RegExp;
  action: string;
  extractParams: (match: RegExpMatchArray) => Record<string, unknown>;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  {
    pattern: /^(?:list|show|get)\s+agents?$/i,
    action: 'list_agents',
    extractParams: () => ({}),
  },
  {
    pattern: /^(?:status|check)\s+(?:agent\s+)?(\S+)$/i,
    action: 'get_agent_status',
    extractParams: (m) => ({ agentId: m[1] }),
  },
  {
    pattern: /^(?:deploy|start|launch)\s+(?:agent\s+)?(\S+)$/i,
    action: 'deploy_agent',
    extractParams: (m) => ({ programId: m[1] }),
  },
  {
    pattern: /^(?:stop|terminate|kill)\s+(?:agent\s+)?(\S+)$/i,
    action: 'terminate_agent',
    extractParams: (m) => ({ agentId: m[1] }),
  },
  {
    pattern: /^(?:costs?|spending|budget)(?:\s+(\S+))?$/i,
    action: 'get_costs',
    extractParams: (m) => (m[1] ? { pillar: m[1] } : {}),
  },
  {
    pattern: /^(?:audit|log|history)(?:\s+(\S+))?$/i,
    action: 'query_audit',
    extractParams: (m) => (m[1] ? { agentId: m[1] } : {}),
  },
  {
    pattern: /^(?:health|status)$/i,
    action: 'system_health',
    extractParams: () => ({}),
  },
];

// ---------------------------------------------------------------------------
// Command Router
// ---------------------------------------------------------------------------

export class CommandRouter {
  /**
   * Parse a raw command from any channel into a structured command.
   * Produces the same ParsedCommand regardless of source channel.
   */
  parse(raw: RawCommand): ParsedCommand {
    const text = raw.rawText.trim();

    for (const pattern of COMMAND_PATTERNS) {
      const match = text.match(pattern.pattern);
      if (match) {
        return {
          action: pattern.action,
          params: pattern.extractParams(match),
          source: raw.source,
          userId: raw.userId,
          tenantId: raw.tenantId,
          parsedAt: new Date().toISOString(),
        };
      }
    }

    // Fallback: treat as a free-form command
    const parts = text.split(/\s+/);
    return {
      action: parts[0]?.toLowerCase() ?? 'unknown',
      target: parts[1],
      params: { rawText: text },
      source: raw.source,
      userId: raw.userId,
      tenantId: raw.tenantId,
      parsedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify that the same raw text produces the same parsed command
   * regardless of source channel.
   */
  verifyUniformSemantics(text: string, userId: string, tenantId: string): boolean {
    const sources: CommandSource[] = ['dashboard', 'api', 'imessage', 'voice', 'email', 'telegram', 'cli'];
    const results = sources.map((source) =>
      this.parse({ source, rawText: text, userId, tenantId }),
    );

    // All should produce the same action and params
    const firstAction = results[0]?.action;
    const firstParams = JSON.stringify(results[0]?.params);
    return results.every(
      (r) => r.action === firstAction && JSON.stringify(r.params) === firstParams,
    );
  }
}
