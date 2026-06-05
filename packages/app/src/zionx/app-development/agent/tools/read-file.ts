import type { Tool, ToolResult } from '../types.js';

const MAX_BYTES = 1_000_000;

interface Input { path: string; startLine?: number; endLine?: number; }

/** Read a file from the project workspace with line numbers. 1MB cap. */
export const readFileTool: Tool<Input, { content: string; lines: number; truncated: boolean }> = {
  name: 'read_file',
  description:
    'Read a file from the current project workspace. Returns line-numbered content. ' +
    'Use this BEFORE write_file / edit_file (read-before-write is enforced). ' +
    'Optional startLine/endLine slice. 1MB cap; larger files are truncated.',
  inputSchema: {
    type: 'object',
    properties: {
      path:      { type: 'string', description: 'Workspace-relative path, e.g. "app/(tabs)/index.tsx".' },
      startLine: { type: 'number', description: '1-indexed start line (optional).' },
      endLine:   { type: 'number', description: '1-indexed end line, inclusive (optional).' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async run({ path, startLine, endLine }, ctx): Promise<ToolResult<{ content: string; lines: number; truncated: boolean }>> {
    if (typeof path !== 'string' || !path) {
      return { content: 'read_file: `path` is required (workspace-relative string)', isError: true };
    }
    if (path.includes('..') || path.startsWith('/')) {
      return { content: `read_file: refusing path "${path}" (must be workspace-relative)`, isError: true };
    }
    let raw: string;
    try {
      raw = await ctx.workspace.readFile(ctx.projectId, path);
    } catch (err) {
      return { content: `read_file: ${(err as Error).message}`, isError: true };
    }
    const truncated = raw.length > MAX_BYTES;
    const body = truncated ? raw.slice(0, MAX_BYTES) : raw;
    const allLines = body.split('\n');
    const sliceStart = Math.max(1, startLine ?? 1);
    const sliceEnd = Math.min(allLines.length, endLine ?? allLines.length);
    const numbered = allLines
      .slice(sliceStart - 1, sliceEnd)
      .map((line, i) => `${(sliceStart + i).toString().padStart(5, ' ')}\u2502 ${line}`)
      .join('\n');

    ctx.readFiles.add(path);

    return {
      content: `${path} (${allLines.length} lines${truncated ? ', truncated to 1MB' : ''})\n${numbered}`,
      data: { content: body, lines: allLines.length, truncated },
    };
  },
};
