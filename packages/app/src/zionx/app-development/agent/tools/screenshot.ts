/**
 * screenshot tool — capture a PNG of the running app inside the sandbox.
 * Used by the visual-grading reviewer subagent. Returns a base64 PNG for
 * the model to consume as an image content block in the next turn.
 */

import type { Tool, ToolResult } from '../types.js';

export const screenshotTool: Tool<Record<string, never>, { base64: string }> = {
  name: 'screenshot',
  description:
    'Capture a PNG screenshot of the currently running app inside the sandbox. ' +
    'Returns a base64-encoded image. Use this when grading visual quality of a screen.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(_input, ctx): Promise<ToolResult<{ base64: string }>> {
    if (!ctx.sandbox || typeof ctx.sandbox.screenshot !== 'function') {
      return {
        content:
          'screenshot: skipped (no sandbox attached). ' +
          'Phase 4 (E2B sandbox client) needed for capture. Continue without a screenshot.',
        data: { base64: '' },
      };
    }
    let base64: string;
    try {
      base64 = await ctx.sandbox.screenshot(ctx.projectId);
    } catch (err) {
      return { content: `screenshot: ${(err as Error).message}`, isError: true };
    }
    return {
      content: `screenshot captured (${Math.round(base64.length / 1024)}KB base64)`,
      data: { base64 },
    };
  },
};
