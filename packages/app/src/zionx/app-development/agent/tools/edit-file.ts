import type { Tool, ToolResult } from '../types.js';

interface Input { path: string; oldString: string; newString: string; }

/**
 * Exact-string find-and-replace. Fails if `oldString` is not unique, not
 * present, or matches more than once. This is intentional — it forces the
 * model to read carefully and prevents hallucinated edits.
 */
export const editFileTool: Tool<Input, { replacedAt: number }> = {
  name: 'edit_file',
  description:
    'Edit an existing file by exact-string find-and-replace. ' +
    'oldString MUST appear EXACTLY ONCE in the file (whitespace-sensitive). ' +
    'If absent or non-unique, the call fails — read more context and retry. ' +
    'You MUST have read this file earlier in the session.',
  inputSchema: {
    type: 'object',
    properties: {
      path:      { type: 'string', description: 'Workspace-relative path.' },
      oldString: { type: 'string', description: 'Existing text to replace. Must be unique in the file.' },
      newString: { type: 'string', description: 'Replacement text.' },
    },
    required: ['path', 'oldString', 'newString'],
    additionalProperties: false,
  },
  async run({ path, oldString, newString }, ctx): Promise<ToolResult<{ replacedAt: number }>> {
    if (typeof path !== 'string' || !path) {
      return { content: 'edit_file: `path` is required (workspace-relative string)', isError: true };
    }
    if (typeof oldString !== 'string' || typeof newString !== 'string') {
      return { content: 'edit_file: `oldString` and `newString` must both be strings', isError: true };
    }
    if (path.includes('..') || path.startsWith('/')) {
      return { content: `edit_file: refusing path "${path}" (must be workspace-relative)`, isError: true };
    }
    if (oldString === newString) {
      return { content: 'edit_file: oldString and newString are identical — no-op rejected.', isError: true };
    }
    if (!ctx.readFiles.has(path)) {
      return { content: `edit_file: read "${path}" first (read-before-write).`, isError: true };
    }
    let body: string;
    try {
      body = await ctx.workspace.readFile(ctx.projectId, path);
    } catch (err) {
      return { content: `edit_file: ${(err as Error).message}`, isError: true };
    }

    const first = body.indexOf(oldString);
    if (first < 0) {
      return {
        content:
          `edit_file: oldString not found in "${path}". ` +
          'Read the file again — its contents may have changed.',
        isError: true,
      };
    }
    const second = body.indexOf(oldString, first + 1);
    if (second >= 0) {
      return {
        content:
          `edit_file: oldString matches more than once in "${path}". ` +
          'Include more surrounding context to make it unique.',
        isError: true,
      };
    }

    const next = body.slice(0, first) + newString + body.slice(first + oldString.length);
    try {
      await ctx.workspace.writeFile(ctx.projectId, path, next);
    } catch (err) {
      return { content: `edit_file: ${(err as Error).message}`, isError: true };
    }
    return {
      content: `edited ${path} at byte ${first} (-${oldString.length} +${newString.length})`,
      data: { replacedAt: first },
    };
  },
};
