import type { Tool, ToolResult } from '../types.js';

interface Input { pattern: string; pathFilter?: string; flags?: string; maxMatches?: number; }
interface Match { path: string; line: number; text: string; }

const HARD_MATCH_CAP = 200;

/**
 * Ripgrep-class search across the project workspace. Returns matches as
 * `path:line: text`. The agent uses this to navigate without dumping whole
 * files into context.
 */
export const searchTool: Tool<Input, { matches: Match[]; truncated: boolean }> = {
  name: 'search',
  description:
    'Search the project workspace for a regex pattern. Returns up to 200 matches as ' +
    '"path:line: text". Use this to navigate the codebase without reading whole files. ' +
    'Optional pathFilter is a glob (e.g. "**/*.tsx" or "app/**").',
  inputSchema: {
    type: 'object',
    properties: {
      pattern:    { type: 'string', description: 'JavaScript-flavor regex. Escape special chars yourself.' },
      pathFilter: { type: 'string', description: 'Optional glob pattern (e.g. "app/**/*.tsx").' },
      flags:      { type: 'string', description: 'Regex flags. Defaults to "g". Add "i" for case-insensitive.' },
      maxMatches: { type: 'number', description: 'Cap on matches returned. Default 100, hard limit 200.' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async run({ pattern, pathFilter, flags = 'g', maxMatches = 100 }, ctx): Promise<ToolResult<{ matches: Match[]; truncated: boolean }>> {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    } catch (err) {
      return { content: `search: invalid regex — ${(err as Error).message}`, isError: true };
    }
    const cap = Math.min(maxMatches, HARD_MATCH_CAP);

    const all = await ctx.workspace.listFiles(ctx.projectId);
    const filtered = pathFilter ? all.filter((p) => globMatches(p, pathFilter)) : all;

    const matches: Match[] = [];
    let truncated = false;

    for (const path of filtered) {
      if (matches.length >= cap) { truncated = true; break; }
      let body: string;
      try { body = await ctx.workspace.readFile(ctx.projectId, path); }
      catch { continue; }
      const lines = body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        regex.lastIndex = 0;
        if (regex.test(line)) {
          matches.push({ path, line: i + 1, text: line.length > 240 ? line.slice(0, 240) + '…' : line });
          if (matches.length >= cap) { truncated = true; break; }
        }
      }
    }

    const rendered = matches.length === 0
      ? `no matches for /${pattern}/${flags}`
      : matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join('\n') +
        (truncated ? `\n…truncated at ${cap} matches.` : '');

    return { content: rendered, data: { matches, truncated } };
  },
};

/** Tiny glob — supports *, **, no character classes. */
function globMatches(path: string, glob: string): boolean {
  const pattern = '^' + glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*') + '$';
  return new RegExp(pattern).test(path);
}
