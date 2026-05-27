/**
 * Escalation Bridge — watchdog for hook executions.
 *
 * Wraps any hook's `run()` with a timeout that, when exceeded, fires:
 *   1. A CRASH_OBSERVED-style escalation record persisted via escalation-store.
 *   2. A self-heal attempt via services/self-heal-agent (Claude proposes a fix).
 *   3. An ESCALATION_CREATED event on the bus so the dashboard surfaces it.
 *
 * Hooks remain responsible for their own success/failure semantics — the
 * watchdog only triggers when the hook NEVER returns. This means the agents
 * running inside ZionX can keep working autonomously, but the moment one is
 * stuck for more than 30s (configurable per hook) the operator gets pinged
 * with a one-paragraph human summary and a "Take Over" button.
 */

import { LIMITS } from '../config/limits.js';
import { Workspace } from '../workspace/workspace.js';
import { createAppDevEvent, APPDEV_EVENTS } from '../events/event-types.js';
import { recordHookFailure } from '../events/hook-metrics.js';
import { createEscalation, updateEscalation } from '../services/escalation-store.js';
import { attemptSelfHeal, type SelfHealAction } from '../services/self-heal-agent.js';
import type { EventBusService } from '@seraphim/core';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookResult } from './types.js';

export interface WatchdogOptions {
  hookId: string;
  projectId: string;
  /** Override default LIMITS.escalationWatchdogMs. */
  timeoutMs?: number;
  eventBus: EventBusService;
  credentialManager?: CredentialManager;
  tenantId: string;
  /** Lightweight summary of the hook's input — used by the self-heal LLM. */
  failureContext?: Record<string, unknown>;
}

/**
 * Run a hook function under watchdog supervision.
 *
 * Behavior:
 * - If the hook returns within `timeoutMs`, we pass the result straight through.
 * - If it doesn't, we:
 *   1. Create an escalation record.
 *   2. Emit ESCALATION_CREATED on the bus.
 *   3. Kick off the self-heal agent (background — does not block).
 *   4. Return a synthetic failure HookResult so the caller still gets one.
 *
 * The original hook is NOT cancelled — it continues running so the operator
 * can see whether it eventually completes. If it does complete after the
 * watchdog fires, we update the escalation to `resolved/self-heal-success`.
 */
export async function wrapWithWatchdog<T>(
  fn: (ctx: HookContext) => Promise<HookResult<T>>,
  ctx: HookContext,
  options: WatchdogOptions,
): Promise<HookResult<T>> {
  const timeoutMs = options.timeoutMs ?? LIMITS.escalationWatchdogMs;
  let escalationId: string | null = null;
  let resolved = false;

  const timeoutHandle = setTimeout(() => {
    if (resolved) return;
    void handleEscalation();
  }, timeoutMs);

  const handleEscalation = async () => {
    try {
      const escalation = await createEscalation({
        projectId: options.projectId,
        hookId: options.hookId,
        reason: 'watchdog-timeout',
        failureContext: {
          timeoutMs,
          ...(options.failureContext ?? {}),
        },
      });
      escalationId = escalation.id;
      recordHookFailure(options.hookId, `watchdog timeout @ ${timeoutMs}ms`);

      await options.eventBus
        .publish(
          createAppDevEvent(
            APPDEV_EVENTS.ESCALATION_CREATED,
            {
              escalationId: escalation.id,
              projectId: options.projectId,
              hookId: options.hookId,
              reason: 'watchdog-timeout',
              timeoutMs,
              context: JSON.stringify(options.failureContext ?? {}).slice(0, 1000),
              assignee: 'self-heal',
              createdAt: escalation.createdAt,
            },
            options.tenantId,
          ),
        )
        .catch(() => {});

      // Self-heal — does not block the original hook.
      if (options.credentialManager) {
        try {
          const heal = await attemptSelfHeal({
            projectId: options.projectId,
            hookId: options.hookId,
            reason: 'watchdog-timeout',
            failureContext: options.failureContext ?? {},
            credentialManager: options.credentialManager,
          });
          await applySelfHealOutcome(escalation.id, options.projectId, heal.action, heal.summary, options.eventBus, options.tenantId);
        } catch (err) {
          ctx.log(`[escalation-bridge] self-heal threw: ${(err as Error).message}`);
        }
      } else {
        await updateEscalation(escalation.id, {
          status: 'operator_required',
          notes: 'No credential manager available for self-heal.',
        });
      }
    } catch (err) {
      ctx.log(`[escalation-bridge] failed to create escalation: ${(err as Error).message}`);
    }
  };

  try {
    const result = await fn(ctx);
    resolved = true;
    clearTimeout(timeoutHandle);
    if (escalationId) {
      // Hook eventually completed even after watchdog fired.
      await updateEscalation(escalationId, {
        status: 'resolved',
        resolution: result.success ? 'self-heal-success' : 'operator',
        resolvedAt: new Date().toISOString(),
      });
      await options.eventBus
        .publish(
          createAppDevEvent(
            APPDEV_EVENTS.ESCALATION_RESOLVED,
            {
              escalationId,
              projectId: options.projectId,
              hookId: options.hookId,
              resolution: result.success ? 'self-heal-success' : 'operator',
              resolvedAt: new Date().toISOString(),
              notes: result.success ? 'Hook completed after escalation' : (result.error ?? ''),
            },
            options.tenantId,
          ),
        )
        .catch(() => {});
    }
    return result;
  } catch (err) {
    resolved = true;
    clearTimeout(timeoutHandle);
    throw err;
  }
}

async function applySelfHealOutcome(
  escalationId: string,
  projectId: string,
  action: SelfHealAction,
  summary: string,
  eventBus: EventBusService,
  tenantId: string,
): Promise<void> {
  if (action.kind === 'patch-file') {
    try {
      const ws = new Workspace();
      // Safety: never auto-write outside the workspace; never overwrite credentials/.env files.
      if (action.path.includes('.env') || action.path.includes('credentials')) {
        await updateEscalation(escalationId, {
          status: 'operator_required',
          notes: `self-heal proposed editing forbidden path "${action.path}" — operator required`,
        });
        return;
      }
      await ws.writeFile(projectId, action.path, action.newContent);
      await updateEscalation(escalationId, {
        status: 'self_healing',
        selfHealAttempts: 1,
        notes: `self-heal patched ${action.path}: ${action.rationale}`,
      });
    } catch (err) {
      await updateEscalation(escalationId, {
        status: 'operator_required',
        notes: `self-heal patch failed: ${(err as Error).message}`,
      });
    }
    return;
  }

  if (action.kind === 'retry') {
    await updateEscalation(escalationId, {
      status: 'self_healing',
      selfHealAttempts: 1,
      notes: `self-heal proposes retry: ${action.rationale}`,
    });
    return;
  }

  // operator-required
  await updateEscalation(escalationId, {
    status: 'operator_required',
    notes: `self-heal escalated to operator: ${summary}`,
  });
  await eventBus
    .publish(
      createAppDevEvent(
        APPDEV_EVENTS.ESCALATION_CREATED,
        {
          escalationId,
          projectId,
          hookId: 'self-heal-agent',
          reason: 'operator-required',
          timeoutMs: 0,
          context: summary,
          assignee: 'operator',
          createdAt: new Date().toISOString(),
        },
        tenantId,
      ),
    )
    .catch(() => {});
}
