/**
 * Agent loop — the heart of the harness.
 *
 * Pseudo-code:
 *   ctx = buildContext(projectId)
 *   messages = [system, sessionHeader + userPrompt]
 *   while not done && budget OK:
 *     response = claude.stream(messages, tools, system_cached)
 *     for tool_use in response: execute, append tool_result
 *     if response had no tool_use: break
 *
 * Streams `text` blocks AND `tool.call` events through ctx.emit so the
 * dashboard chat can render live activity (✎ Editing, ⚙ Reading, etc.).
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentConfig,
  AgentEvent,
  AgentInput,
  AgentMessage,
  AgentRunResult,
  ContentBlock,
  SandboxClientLike,
  Subagent,
  SubagentResult,
  Tool,
  ToolContext,
  WorkspaceLike,
} from './types.js';
import { TOOL_REGISTRY, findTool, toAnthropicSchema } from './tools/index.js';
import { buildSystemPrompt } from './system-prompt.js';
import { buildContext } from './context/message-builder.js';
import { compactIfNeeded, DEFAULT_COMPACTION } from './context/compaction.js';
import { Budget, DEFAULT_BUDGET, type BudgetConfig } from './guardrails/budget.js';
import { scrubSecrets } from './guardrails/secret-scrubber.js';
import {
  registerStaticReviewers,
  registerDynamicReviewers,
  visualPolishReviewer,
  persistenceReviewer,
  onboardingReviewer,
  dependencyValidatorReviewer,
  createDomainFitnessReviewer,
  createSpecCardReviewer,
} from './subagents/index.js';

export interface AgentRuntime {
  workspace: WorkspaceLike;
  sandbox?: SandboxClientLike;
  emit: (event: AgentEvent) => void;
  log: (...args: unknown[]) => void;
}

export interface AgentLoopOptions {
  config?: Partial<AgentConfig>;
  budget?: Partial<BudgetConfig>;
  /** Override the tool list (useful for tests). Defaults to TOOL_REGISTRY. */
  tools?: ReadonlyArray<Tool>;
  /** Pre-existing history to continue (for follow-up turns on the same project). */
  history?: AgentMessage[];
  /** When true, auto-spawn all reviewer subagents when the model goes silent and
   *  apply up to `maxReviewerRetries` rounds of fixes. Defaults to true. */
  reviewers?: boolean;
  maxReviewerRetries?: number;
}

const DEFAULT_CONFIG: AgentConfig = {
  // Sonnet 4.6 (alias). The dated id `claude-sonnet-4-5-20250929` is the
  // backing model. Sonnet 4 (`claude-sonnet-4-20250514`) reaches EOL on
  // 2026-06-15; this alias auto-rolls to the current Sonnet line.
  model: 'claude-sonnet-4-6',
  maxIterations: 30,
  maxTokens: 1_500_000,
  perCallMaxTokens: 8000,
  apiKey: '',
};

export async function agentLoop(
  input: AgentInput,
  runtime: AgentRuntime,
  options: AgentLoopOptions = {},
): Promise<AgentRunResult> {
  const config: AgentConfig = { ...DEFAULT_CONFIG, ...options.config };
  if (!config.apiKey) {
    throw new Error('agentLoop: apiKey required (resolve from seraphim/anthropic before calling)');
  }
  const budget = new Budget({ ...DEFAULT_BUDGET, ...options.budget });
  const tools = options.tools ?? TOOL_REGISTRY;
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const client = new Anthropic({ apiKey: config.apiKey });
  const filesWritten = new Set<string>();
  const filesEdited = new Set<string>();
  const readFiles = new Set<string>();

  // Register reviewer subagents (idempotent — registry is module-level).
  if (options.reviewers !== false) {
    registerStaticReviewers();
  }
  const maxReviewerRetries = options.maxReviewerRetries ?? 2;
  let firstAssistantText = '';
  let reviewerRetries = 0;
  let reviewerVerdict: Array<{ name: string; passed: boolean; score?: number }> = [];

  const toolCtx: ToolContext = {
    projectId: input.projectId,
    userId: input.userId,
    sandboxId: undefined,
    workspace: runtime.workspace,
    sandbox: runtime.sandbox,
    emit: runtime.emit,
    readFiles,
    log: runtime.log,
  };

  // Build the initial context (system prompt + workspace summary + memory + user prompt)
  const built = await buildContext({
    workspace: runtime.workspace,
    projectId: input.projectId,
    history: options.history ?? [],
    userPrompt: input.prompt,
  });

  let messages: AgentMessage[] = built.messages;
  let stopReason: AgentRunResult['reason'] = 'completed';

  while (true) {
    if (input.signal?.aborted) { stopReason = 'aborted'; break; }
    budget.recordIteration();
    runtime.emit({ type: 'iteration', index: budget.state.iterations });
    const verdict = budget.shouldStop();
    if (verdict.stop) {
      stopReason = verdict.reason === 'iteration_cap' ? 'iteration_cap' : 'budget';
      break;
    }

    // Compact if we're over the threshold.
    const compacted = await compactIfNeeded(messages, DEFAULT_COMPACTION);
    if (compacted.folded > 0) {
      runtime.log(`[agent-loop] compacted ${compacted.folded} messages`);
      messages = compacted.history;
    }

    // Call Claude.
    let assistantBlocks: ContentBlock[] = [];
    let usage = { input: 0, output: 0 };
    try {
      const result = await callClaude(client, config, built.system, messages, tools, runtime.emit, input.signal);
      assistantBlocks = result.content;
      usage = result.usage;
    } catch (err) {
      if (input.signal?.aborted) { stopReason = 'aborted'; break; }
      runtime.log('[agent-loop] claude error:', (err as Error).message);
      throw err;
    }
    budget.recordUsage(usage.input, usage.output);

    // Append the assistant turn.
    messages.push({ role: 'assistant', content: assistantBlocks });

    // Capture the very first assistant text for the spec-card reviewer
    // (Hook 14 expects the <spec>...</spec> block in the FIRST chunk).
    if (!firstAssistantText) {
      const firstText = assistantBlocks.find((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text');
      if (firstText?.text) {
        firstAssistantText = firstText.text;
        if (options.reviewers !== false) {
          registerDynamicReviewers({ prompt: input.prompt, firstAssistantText });
        }
      }
    }

    // Execute tool calls in this turn (in declaration order — model batches
    // independent reads/searches).
    const toolUses = assistantBlocks.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (toolUses.length === 0) {
      // Model went silent. If reviewers are enabled and not yet exhausted,
      // run them and feed failures back. Otherwise we're done.
      if (options.reviewers === false || reviewerRetries >= maxReviewerRetries) {
        stopReason = 'completed';
        break;
      }
      const verdicts = await runReviewers(input, runtime, firstAssistantText);
      reviewerVerdict = verdicts.map((v) => ({ name: v.name, passed: v.result.passed, score: v.result.score }));
      const failures = verdicts.filter((v) => !v.result.passed);
      if (failures.length === 0) {
        stopReason = 'completed';
        break;
      }
      reviewerRetries += 1;
      runtime.log(`[agent-loop] reviewer round ${reviewerRetries}: ${failures.length} failures`);
      // Feed the failures back as the next user message.
      messages.push({
        role: 'user',
        content: [{
          type: 'text',
          text: buildReviewerRetryPrompt(failures, reviewerRetries),
        }],
      });
      continue;
    }

    const toolResultBlocks: ContentBlock[] = [];
    for (const call of toolUses) {
      const tool = toolByName.get(call.name) ?? findTool(call.name);
      const callStart = Date.now();
      let summary = call.name;
      try { summary = summarizeToolCall(call.name, call.input); } catch { /* ignore */ }
      runtime.emit({ type: 'tool.call', name: call.name, summary });

      if (!tool) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `unknown tool "${call.name}"`,
          is_error: true,
        });
        runtime.emit({ type: 'tool.result', name: call.name, durationMs: Date.now() - callStart, isError: true });
        continue;
      }

      let resText: string;
      let isError = false;
      try {
        const out = await tool.run(call.input as never, toolCtx);
        resText = out.content;
        isError = !!out.isError;
        if (call.name === 'write_file' && !isError) filesWritten.add((call.input as { path: string }).path);
        if (call.name === 'edit_file' && !isError) filesEdited.add((call.input as { path: string }).path);
      } catch (err) {
        resText = `${call.name}: tool threw — ${(err as Error).message}`;
        isError = true;
      }

      const scrubbed = scrubSecrets(resText);
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: scrubbed.text,
        is_error: isError,
      });
      runtime.emit({ type: 'tool.result', name: call.name, durationMs: Date.now() - callStart, isError });
    }

    messages.push({ role: 'tool_result', content: toolResultBlocks });
  }

  runtime.emit({ type: 'done', reason: stopReason });

  return {
    passed: stopReason === 'completed' && reviewerVerdict.every((r) => r.passed),
    iterations: budget.state.iterations,
    tokens: { input: budget.state.inputTokens, output: budget.state.outputTokens },
    filesWritten: Array.from(filesWritten),
    filesEdited: Array.from(filesEdited),
    reason: stopReason,
    reviewers: reviewerVerdict.length ? reviewerVerdict : undefined,
  };
}

// ---------------------------------------------------------------------------
// Reviewer orchestration
// ---------------------------------------------------------------------------

interface ReviewerOutcome { name: string; result: SubagentResult; }

async function runReviewers(
  input: AgentInput,
  runtime: AgentRuntime,
  firstAssistantText: string,
): Promise<ReviewerOutcome[]> {
  const reviewers: Subagent[] = [
    visualPolishReviewer,
    persistenceReviewer,
    onboardingReviewer,
    dependencyValidatorReviewer,
    createDomainFitnessReviewer(input.prompt),
    createSpecCardReviewer(firstAssistantText),
  ];
  const outcomes: ReviewerOutcome[] = [];
  for (const r of reviewers) {
    runtime.emit({ type: 'subagent.spawn', name: r.name });
    let result: SubagentResult;
    try {
      result = await r.run({
        projectId: input.projectId,
        userId: input.userId,
        workspace: runtime.workspace,
      });
    } catch (err) {
      result = {
        passed: false,
        score: 0,
        fixes: [`Reviewer ${r.name} threw: ${(err as Error).message}`],
      };
    }
    runtime.emit({ type: 'subagent.result', name: r.name, passed: result.passed, score: result.score });
    outcomes.push({ name: r.name, result });
  }
  return outcomes;
}

function buildReviewerRetryPrompt(failures: ReviewerOutcome[], retryNumber: number): string {
  const lines: string[] = [
    `[REVIEWER RETRY #${retryNumber}]`,
    '',
    `${failures.length} reviewer subagent(s) failed. Fix the issues below and re-emit the affected files. Use edit_file for surgical changes; only use write_file if the entire file needs to be replaced.`,
    '',
  ];
  for (const f of failures) {
    lines.push(`### ${f.name} — score ${f.result.score ?? 0}`);
    if (f.result.details) lines.push(f.result.details);
    if (f.result.fixes.length) {
      lines.push('Fixes required:');
      for (const fix of f.result.fixes) lines.push(`- ${fix}`);
    }
    lines.push('');
  }
  lines.push('After applying fixes, re-emit no further tool calls so the reviewers can run again.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function callClaude(
  client: Anthropic,
  config: AgentConfig,
  systemText: string,
  history: AgentMessage[],
  tools: ReadonlyArray<Tool>,
  emit: (e: AgentEvent) => void,
  signal: AbortSignal | undefined,
): Promise<{ content: ContentBlock[]; usage: { input: number; output: number } }> {
  const stream = client.messages.stream(
    {
      model: config.model,
      max_tokens: config.perCallMaxTokens,
      // System block marked cacheable — slashes input cost on repeated turns.
      system: [
        { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
      ] as Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>,
      messages: toAnthropic(history),
      tools: toAnthropicSchema() as never,
      tool_choice: { type: 'auto' },
    },
    { signal },
  );

  stream.on('text', (text) => {
    if (text) emit({ type: 'text', text });
  });

  const finalMessage = await stream.finalMessage();
  const content: ContentBlock[] = finalMessage.content.map((b: any) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    return { type: 'text', text: JSON.stringify(b) };
  });
  return {
    content,
    usage: { input: finalMessage.usage.input_tokens, output: finalMessage.usage.output_tokens },
  };
}

/** Convert our internal AgentMessage[] to the Anthropic SDK message shape. */
function toAnthropic(history: AgentMessage[]): Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }> {
  // Coalesce consecutive same-role messages (the SDK requires alternation
  // for user/assistant; tool_result blocks live INSIDE a user message).
  const out: Array<{ role: 'user' | 'assistant'; content: ContentBlock[] }> = [];
  for (const m of history) {
    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content.push(...m.content);
    } else {
      out.push({ role, content: [...m.content] });
    }
  }
  return out;
}

function summarizeToolCall(name: string, input: unknown): string {
  const i = input as Record<string, unknown>;
  switch (name) {
    case 'read_file':       return `read ${i.path}`;
    case 'write_file':      return `write ${i.path}`;
    case 'edit_file':       return `edit ${i.path}`;
    case 'list_files':      return i.pathFilter ? `list ${i.pathFilter}` : 'list workspace';
    case 'search':          return `search /${i.pattern}/`;
    case 'load_skill':      return `load skill ${i.name}`;
    case 'run_command':     return `$ ${String(i.command).slice(0, 60)}`;
    case 'screenshot':      return 'screenshot';
    case 'spawn_subagent':  return `subagent ${i.name}`;
    case 'fetch_url':       return `fetch ${i.url}`;
    default:                return name;
  }
}

export type { AgentInput, AgentRunResult, AgentEvent };
