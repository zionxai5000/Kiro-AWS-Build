/**
 * ZionX Agent Harness — public API.
 *
 * The harness replaces the one-shot `llm-service.streamGeneration` with a
 * tool-using Claude loop. Wire it into `api/handlers.ts`'s generate flow:
 *
 *   import { agentLoop } from '../agent';
 *   ...
 *   const result = await agentLoop(
 *     { prompt, projectId, userId, signal: req.signal },
 *     {
 *       workspace: appDevWorkspace,
 *       sandbox: e2bSandboxClient,         // Phase 4 — optional until then
 *       emit: (e) => sse.send('agent', e),
 *       log: (...a) => console.log('[agent]', ...a),
 *     },
 *     { config: { apiKey: anthropicKey } },
 *   );
 */

export { agentLoop } from './agent-loop.js';
export type { AgentInput, AgentRunResult, AgentEvent, AgentRuntime, AgentLoopOptions } from './agent-loop.js';
export type {
  AgentMessage, ContentBlock, AgentConfig, Tool, ToolContext, ToolResult,
  WorkspaceLike, SandboxClientLike, Subagent, SubagentInput, SubagentResult,
} from './types.js';

export { TOOL_REGISTRY, findTool, toAnthropicSchema, registerSubagent, listSubagents } from './tools/index.js';
export { SKILLS, findSkill, readSkillBody, renderSkillsIndex } from './skills/index.js';
export { buildSystemPrompt } from './system-prompt.js';
export { Budget, DEFAULT_BUDGET } from './guardrails/budget.js';
export { verifyCommand } from './guardrails/command-allowlist.js';
export { scrubSecrets } from './guardrails/secret-scrubber.js';
export { buildContext } from './context/message-builder.js';
export { compactIfNeeded, DEFAULT_COMPACTION } from './context/compaction.js';
export { readMemory, appendMemory, resetMemory, renderMemory } from './context/memory.js';
export { buildWorkspaceSummary, renderWorkspaceSummary } from './context/workspace-summary.js';
