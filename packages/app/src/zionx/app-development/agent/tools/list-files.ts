import type { Tool, ToolResult } from '../types.js';

interface Input { pathFilter?: string; }

/** List the project workspace as a flat array of paths. */
export const listFilesTool: Tool<Input, { files: string[] }> = {
  name: 'list_files',
  description:
    'List every file in the current project workspace. Optional pathFilter glob ' +
    '(e.g. "app/**", "**/*.tsx") narrows the result. Use this to orient yourself ' +
    'before reading specific files.',
  inputSchema: {
    type: 'object',
    properties: {
      pathFilter: { type: 'string', description: 'Optional glob.' },
    },
    additionalProperties: false,
  },
  async run({ pathFilter }, ctx): Promise<ToolResult<{ files: string[] }>> {
    const all = await ctx.workspace.listFiles(ctx.projectId);
    const filtered = pathFilter ? all.filter((p) => globMatches(p, pathFilter)) : all;
    const sorted = filtered.slice().sort();
    return {
      content:
        sorted.length === 0
          ? 'workspace is empty'
          : `${sorted.length} files\n` + sorted.join('\n'),
      data: { files: sorted },
    };
  },
};

function globMatches(path: string, glob: string): boolean {
  const pattern = '^' + glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*') + '$';
  return new RegExp(pattern).test(path);
}
