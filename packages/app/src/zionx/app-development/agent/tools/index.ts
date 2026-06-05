/**
 * Tool registry — assembled list of every tool the agent can invoke. The
 * order mirrors the model's discovery sequence: read/list/search → write/edit
 * → load_skill → run_command/screenshot → spawn_subagent → fetch_url.
 */

import type { Tool } from '../types.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { listFilesTool } from './list-files.js';
import { searchTool } from './search.js';
import { loadSkillTool } from './load-skill.js';
import { runCommandTool } from './run-command.js';
import { screenshotTool } from './screenshot.js';
import { spawnSubagentTool } from './spawn-subagent.js';
import { fetchUrlTool } from './fetch-url.js';

export const TOOL_REGISTRY: ReadonlyArray<Tool> = [
  readFileTool,
  listFilesTool,
  searchTool,
  writeFileTool,
  editFileTool,
  loadSkillTool,
  runCommandTool,
  screenshotTool,
  spawnSubagentTool,
  fetchUrlTool,
] as const;

/** Look up a tool by name. */
export function findTool(name: string): Tool | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

/** Render the tool list for the Anthropic API `tools` parameter. */
export function toAnthropicSchema(): Array<{ name: string; description: string; input_schema: unknown }> {
  return TOOL_REGISTRY.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export {
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
  searchTool,
  loadSkillTool,
  runCommandTool,
  screenshotTool,
  spawnSubagentTool,
  fetchUrlTool,
};
export { registerSubagent, listSubagents } from './spawn-subagent.js';
