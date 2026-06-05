/**
 * spawn-subagent tool — invokes a registered reviewer subagent by name.
 * Reviewer subagents wrap Hooks 11–15 (Phase 7); this tool is a thin
 * dispatcher that calls into the registry once it's wired.
 */

import type { Tool, ToolResult, Subagent, SubagentResult } from '../types.js';

interface Input { name: string; }

/**
 * The registry is populated lazily — Phase 7 wires the reviewer
 * implementations. Until then, `getSubagent` returns null and the tool
 * surfaces a clear "not yet wired" error.
 */
let REGISTRY: Map<string, Subagent> | null = null;

export function registerSubagent(s: Subagent): void {
  if (!REGISTRY) REGISTRY = new Map();
  REGISTRY.set(s.name, s);
}

export function listSubagents(): string[] {
  return REGISTRY ? Array.from(REGISTRY.keys()).sort() : [];
}

export const spawnSubagentTool: Tool<Input, SubagentResult> = {
  name: 'spawn_subagent',
  description:
    'Invoke a reviewer subagent on the current project. Reviewers grade specific aspects ' +
    '(visual-polish, persistence, domain-fitness, onboarding, spec-card) and return ' +
    'a passed flag + score + actionable fixes.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Subagent name. After Phase 7: visual-polish-reviewer, persistence-reviewer, ' +
          'domain-fitness-reviewer, onboarding-reviewer, spec-card-reviewer.',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  async run({ name }, ctx): Promise<ToolResult<SubagentResult>> {
    const s = REGISTRY?.get(name);
    if (!s) {
      const available = listSubagents();
      return {
        content:
          `spawn_subagent: unknown subagent "${name}". ` +
          (available.length ? `Available: ${available.join(', ')}` : 'No subagents registered yet (Phase 7).'),
        isError: true,
      };
    }
    ctx.emit({ type: 'subagent.spawn', name });
    let result: SubagentResult;
    try {
      result = await s.run({ projectId: ctx.projectId, userId: ctx.userId, workspace: ctx.workspace });
    } catch (err) {
      return { content: `spawn_subagent: ${(err as Error).message}`, isError: true };
    }
    ctx.emit({ type: 'subagent.result', name, passed: result.passed, score: result.score });
    const summary = [
      `${name}: ${result.passed ? 'PASS' : 'FAIL'}${result.score !== undefined ? ` (score ${result.score})` : ''}`,
      result.fixes.length ? `Fixes:\n${result.fixes.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}` : null,
      result.details ?? null,
    ].filter(Boolean).join('\n');
    return { content: summary, data: result };
  },
};
