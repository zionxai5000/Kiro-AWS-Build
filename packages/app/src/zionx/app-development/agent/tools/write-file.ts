import type { Tool, ToolResult } from '../types.js';

const MAX_BYTES = 1_000_000;

interface Input { path: string; content: string; }

/** Write a file to the project workspace. Read-before-write enforced. */
export const writeFileTool: Tool<Input, { written: number }> = {
  name: 'write_file',
  description:
    'Create or overwrite a file in the project workspace. ' +
    'If the file already exists, you MUST have read it earlier in this session ' +
    '(read-before-write enforcement) — otherwise the call is rejected. ' +
    '1MB cap.',
  inputSchema: {
    type: 'object',
    properties: {
      path:    { type: 'string', description: 'Workspace-relative path.' },
      content: { type: 'string', description: 'Full file content.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  async run({ path, content }, ctx): Promise<ToolResult<{ written: number }>> {
    if (typeof path !== 'string' || !path) {
      return { content: 'write_file: `path` is required (workspace-relative string)', isError: true };
    }
    if (typeof content !== 'string') {
      return { content: 'write_file: `content` is required (string)', isError: true };
    }
    if (path.includes('..') || path.startsWith('/')) {
      return { content: `write_file: refusing path "${path}" (must be workspace-relative)`, isError: true };
    }
    if (content.length > MAX_BYTES) {
      return { content: `write_file: content exceeds 1MB cap (${content.length} bytes)`, isError: true };
    }

    // Read-before-write: only if the file already exists.
    const exists = await ctx.workspace.exists(ctx.projectId, path);
    if (exists && !ctx.readFiles.has(path)) {
      return {
        content:
          `write_file: refusing to overwrite "${path}" — call read_file first, ` +
          'or use edit_file for a targeted change.',
        isError: true,
      };
    }

    try {
      await ctx.workspace.writeFile(ctx.projectId, path, content);
    } catch (err) {
      return { content: `write_file: ${(err as Error).message}`, isError: true };
    }
    // Treat written file as "read" for downstream tool calls.
    ctx.readFiles.add(path);
    return {
      content: `wrote ${path} (${content.length} bytes)`,
      data: { written: content.length },
    };
  },
};
