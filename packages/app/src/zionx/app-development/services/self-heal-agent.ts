/**
 * Self-Heal Agent — first responder when a hook escalates.
 *
 * The escalation bridge calls `attemptSelfHeal()` after a watchdog timeout or
 * persistent failure. This module wraps Claude with a debugging system prompt
 * that asks it to:
 *   1. Read the failure context (hook id, error message, last log lines).
 *   2. Propose a concrete repair: edit a file, retry the hook, or escalate to operator.
 *   3. Optionally provide a one-paragraph human summary for the operator
 *      panel in the dashboard.
 *
 * The agent never auto-applies code changes — it only proposes them. Resolution
 * happens when the proposed action runs and the hook stops failing. This keeps
 * humans in the loop as the steering doc requires (no silent destructive fixes).
 */

import Anthropic from '@anthropic-ai/sdk';
import { LIMITS } from '../config/limits.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

export interface SelfHealInput {
  projectId: string;
  hookId: string;
  reason: string;
  failureContext: Record<string, unknown>;
  credentialManager: CredentialManager;
}

export type SelfHealAction =
  | { kind: 'retry'; rationale: string }
  | { kind: 'patch-file'; path: string; newContent: string; rationale: string }
  | { kind: 'escalate-to-operator'; rationale: string };

export interface SelfHealResult {
  success: boolean;
  /** What the agent proposes — never applied automatically. */
  action: SelfHealAction;
  /** Short human-readable summary for the dashboard. */
  summary: string;
  /** Tokens consumed (for cost tracking). */
  tokensUsed?: { input: number; output: number };
}

const SELF_HEAL_SYSTEM_PROMPT = `You are the App Development pipeline's self-heal agent. A backend hook has exceeded its watchdog timeout or kept failing. Your job:

1. Read the failure context.
2. Decide between THREE actions and respond with valid JSON:
   - retry: the hook is likely flaky and a simple retry will succeed.
   - patch-file: a specific workspace file needs a precise edit. Provide path + full new content.
   - escalate-to-operator: human intervention required (credentials, access denied, design ambiguity).

Respond with EXACTLY one JSON object — no prose, no markdown:
{
  "kind": "retry" | "patch-file" | "escalate-to-operator",
  "rationale": "<one sentence>",
  "summary": "<plain English summary the operator will see in the dashboard>",
  "path"?: "<workspace-relative path when kind='patch-file'>",
  "newContent"?: "<entire new file content when kind='patch-file'>"
}

Hard rules:
- Never propose deleting credentials or secret-scanner output.
- Never propose disabling kill switches or hook safety.
- Prefer retry when the failure is timeout/network/transient.
- Prefer escalate-to-operator when the failure is auth, permissions, or rate limit.`;

export async function attemptSelfHeal(input: SelfHealInput): Promise<SelfHealResult> {
  const apiKey = await input.credentialManager.getCredential('anthropic', 'api-key');
  if (!apiKey) {
    return {
      success: false,
      action: { kind: 'escalate-to-operator', rationale: 'Anthropic credential unavailable' },
      summary: 'Self-heal could not run: missing Anthropic API key.',
    };
  }

  const client = new Anthropic({ apiKey });

  const userMessage =
    `Failed hook: ${input.hookId}\n` +
    `Project: ${input.projectId}\n` +
    `Reason: ${input.reason}\n` +
    `Failure context (JSON):\n${JSON.stringify(input.failureContext, null, 2)}`;

  let response: Anthropic.Messages.Message;
  try {
    response = await Promise.race([
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: LIMITS.selfHealMaxTokens,
        system: SELF_HEAL_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('self-heal timeout')),
          LIMITS.selfHealTimeoutMs,
        ),
      ),
    ]);
  } catch (err) {
    return {
      success: false,
      action: { kind: 'escalate-to-operator', rationale: `LLM call failed: ${(err as Error).message}` },
      summary: `Self-heal LLM call failed: ${(err as Error).message}`,
    };
  }

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    return {
      success: false,
      action: { kind: 'escalate-to-operator', rationale: 'LLM returned no text' },
      summary: 'Self-heal received empty LLM response.',
    };
  }

  let parsed: {
    kind?: string;
    rationale?: string;
    summary?: string;
    path?: string;
    newContent?: string;
  };
  try {
    parsed = JSON.parse(block.text.trim());
  } catch (err) {
    return {
      success: false,
      action: { kind: 'escalate-to-operator', rationale: 'LLM response was not JSON' },
      summary: `Self-heal got non-JSON response: ${block.text.slice(0, 200)}`,
    };
  }

  let action: SelfHealAction;
  switch (parsed.kind) {
    case 'retry':
      action = { kind: 'retry', rationale: parsed.rationale ?? 'retry suggested' };
      break;
    case 'patch-file':
      if (!parsed.path || typeof parsed.newContent !== 'string') {
        action = {
          kind: 'escalate-to-operator',
          rationale: 'patch-file response missing path or newContent',
        };
      } else {
        action = {
          kind: 'patch-file',
          path: parsed.path,
          newContent: parsed.newContent,
          rationale: parsed.rationale ?? 'patch suggested',
        };
      }
      break;
    case 'escalate-to-operator':
    default:
      action = {
        kind: 'escalate-to-operator',
        rationale: parsed.rationale ?? 'operator escalation suggested',
      };
      break;
  }

  return {
    success: action.kind !== 'escalate-to-operator',
    action,
    summary: parsed.summary ?? action.rationale,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
