/**
 * App Development API Handlers — thin handlers that delegate to pipeline modules.
 *
 * Each handler:
 * 1. Validates input
 * 2. Checks preconditions (watcher health, etc.)
 * 3. Delegates to the appropriate pipeline module
 * 4. Returns a structured response
 *
 * Pipeline modules are still stubs from Phase 1 — handlers will produce
 * real results once those modules are implemented in later phases.
 */

import type { APIRequest, APIResponse } from '@seraphim/services/shaar/api-routes.js';
import type { EventBusService } from '@seraphim/core';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { WatcherSupervisor } from '../events/watcher-supervisor.js';
import type { XOAuditService } from '@seraphim/core/interfaces/xo-audit-service.js';
import { Workspace } from '../workspace/workspace.js';
import { createAppDevEvent, APPDEV_EVENTS } from '../events/event-types.js';
import { randomUUID } from 'node:crypto';
import { run as runSanitizer } from '../pipeline/01-prompt-sanitizer.js';
import { run as runBuildPreparer } from '../pipeline/05-build-preparer.js';
import { run as runBuildRunner } from '../pipeline/06-build-runner.js';
import { run as runSubmissionPrep } from '../pipeline/09-submission-prep.js';
import { run as runSubmitter } from '../pipeline/09b-submitter.js';
import { run as runTestFlightWatcher } from '../pipeline/10b-testflight-watcher.js';
import { run as runCrashWatcher, verifySentrySignature } from '../pipeline/10-crash-watcher.js';
import { run as runSecretScanner } from '../pipeline/04-secret-scanner.js';
import { createSnack } from '../services/snack-client.js';
import { LLMService } from '../services/llm-service.js';
import { isHookDryRun } from '../config/hooks.config.js';
import { HOOKS_CONFIG } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { getMetricsSnapshot, getRecentErrorRate, recordHookExecution } from '../events/hook-metrics.js';
import { wrapWithWatchdog } from '../pipeline/escalation-bridge.js';
import { listEscalations } from '../services/escalation-store.js';
import type { ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface AppDevHandlerDeps {
  eventBus: EventBusService;
  watcherSupervisor: WatcherSupervisor;
  workspace: Workspace;
  auditService?: XOAuditService;
  credentialManager?: CredentialManager;
}

// ---------------------------------------------------------------------------
// Handler Interface
// ---------------------------------------------------------------------------

export interface AppDevHandlers {
  createProject: (req: APIRequest) => Promise<APIResponse>;
  generateCode: (req: APIRequest) => Promise<APIResponse>;
  buildProject: (req: APIRequest) => Promise<APIResponse>;
  generateStoreListing: (req: APIRequest) => Promise<APIResponse>;
  prepareSubmission: (req: APIRequest) => Promise<APIResponse>;
  confirmSubmission: (req: APIRequest) => Promise<APIResponse>;
  getProject: (req: APIRequest) => Promise<APIResponse>;
  listProjectFiles: (req: APIRequest) => Promise<APIResponse>;
  /** Returns the persisted TestFlight watcher log for one easBuildId. */
  getSubmissionLog: (req: APIRequest) => Promise<APIResponse>;
  /** Lists all submission logs for a project (newest first). */
  listSubmissionLogs: (req: APIRequest) => Promise<APIResponse>;
  /** Submits a finished EAS build and starts the TestFlight watcher in one call. */
  autoSubmitAndWatch: (req: APIRequest) => Promise<APIResponse>;
  /** Sentry webhook receiver for runtime crash reports. */
  sentryWebhook: (req: APIRequest) => Promise<APIResponse>;
  /** GET /app-dev/metrics — per-hook counters. */
  getMetrics: (req: APIRequest) => Promise<APIResponse>;
  /** GET /app-dev/health — overall pipeline health. */
  getHealth: (req: APIRequest) => Promise<APIResponse>;
  /** GET /app-dev/escalations — list unresolved escalations. */
  listEscalations: (req: APIRequest) => Promise<APIResponse>;
  /** GET /app-dev/projects — list every workspace with metadata. */
  listProjects: (req: APIRequest) => Promise<APIResponse>;
  /** GET /app-dev/projects/:id/file?path=... — read a single file. */
  readProjectFile: (req: APIRequest) => Promise<APIResponse>;
  /** PUT /app-dev/projects/:id/file?path=... — write a single file (with secret-scan). */
  writeProjectFile: (req: APIRequest) => Promise<APIResponse>;
  /** POST /app-dev/projects/:id/preview — bundle workspace into an Expo Snack and return embed URL. */
  createPreview: (req: APIRequest) => Promise<APIResponse>;
  /** GET /app-dev/spec — returns the canonical Studio behavior spec (markdown). */
  getSpec: (req: APIRequest) => Promise<APIResponse>;
  /** POST /app-dev/spec/evaluate — pull recent Sentry breadcrumbs and grade against the spec. */
  evaluateSpec: (req: APIRequest) => Promise<APIResponse>;
}

// ---------------------------------------------------------------------------
// Per-project build rate limiter (in-memory)
// ---------------------------------------------------------------------------

const buildRateTracker = new Map<string, number[]>();

// ---------------------------------------------------------------------------
// Submission idempotency cache (in-memory)
// ---------------------------------------------------------------------------

// Idempotency cache for confirmSubmission. Module-scoped
// so it persists across requests within one process.
//
// TODO: This grows unbounded. For production, replace with
// an LRU cache or Redis-backed store. For MVP, accept that
// process restarts clear pending idempotency.
const submissionCache = new Map<string, Record<string, unknown>>();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHandlers(deps: AppDevHandlerDeps): AppDevHandlers {
  const { eventBus, watcherSupervisor, workspace, auditService, credentialManager } = deps;

  return {
    // -----------------------------------------------------------------------
    // POST /app-dev/projects
    // -----------------------------------------------------------------------
    async createProject(req: APIRequest): Promise<APIResponse> {
      // Check watcher health — 503 if down
      if (!watcherSupervisor.isHealthy()) {
        return {
          statusCode: 503,
          body: {
            error: 'Service unavailable',
            message: 'File watcher is down — app creation paused. Recovery: restart the watcher supervisor.',
            component: 'workspace-watcher',
          },
        };
      }

      const body = req.body as { name?: string; description?: string; platform?: string } | null;
      if (!body?.name) {
        return { statusCode: 400, body: { error: 'name is required' } };
      }

      const projectId = `proj-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const platform = (body.platform as 'ios' | 'android' | 'both') || 'both';

      // Create workspace directory
      await workspace.ensureProjectDir(projectId);

      // Persist project metadata so the dashboard project list can show
      // friendly names and original prompts on revisit.
      await workspace.writeProjectMeta(projectId, {
        name: body.name,
        description: body.description,
        prompt: body.description,
      }).catch(() => {
        /* meta is best-effort; never block creation */
      });

      // Publish event
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.PROJECT_CREATED,
        { projectId, name: body.name, platform },
        req.tenantId,
      ));

      return {
        statusCode: 201,
        body: {
          projectId,
          name: body.name,
          description: body.description ?? '',
          platform,
          status: 'idle',
          createdAt: new Date().toISOString(),
        },
      };
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/generate — SSE streaming response
    //
    // SSE RECONNECTION SEMANTICS (Refinement 2):
    // Every connection is a fresh generation. Clients track generation IDs
    // and discard duplicate output. Last-Event-ID resumption not supported in v1.
    // -----------------------------------------------------------------------
    async generateCode(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      const body = req.body as { prompt?: string } | null;
      if (!body?.prompt) {
        return { statusCode: 400, body: { error: 'prompt is required' } };
      }

      const prompt = body.prompt;
      const dryRun = isHookDryRun('code-generator');

      // Return a streamHandler that writes SSE to the raw response
      return {
        statusCode: 200,
        body: null,
        streamHandler: (res: ServerResponse) => {
          // Set SSE headers
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Generation-Id': randomUUID(),
          });

          const sendEvent = (data: Record<string, unknown>) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          };

          // Send a narration update to the client AND log to CloudWatch so
          // operators can watch progress from both ends.
          const narrate = (
            phase: string,
            message: string,
            extra: Record<string, unknown> = {},
          ) => {
            const payload = {
              type: 'phase',
              phase,
              message,
              timestamp: new Date().toISOString(),
              projectId,
              ...extra,
            };
            console.log(`[code-gen][${projectId}] ${phase}: ${message}`);
            sendEvent(payload);
          };

          // Dry-run path (Refinement 5)
          if (dryRun) {
            sendEvent({
              type: 'dry_run',
              wouldGenerateFor: projectId,
              promptLength: prompt.length,
              timestamp: new Date().toISOString(),
            });
            res.end();
            return;
          }

          narrate('start', `Generation started for project ${projectId} (prompt length: ${prompt.length} chars)`);

          // Run sanitizer (Hook 1) synchronously
          const sanitizerCtx = {
            executionId: randomUUID(),
            dryRun: false,
            startedAt: new Date().toISOString(),
            log: (msg: string) => console.log(`[sanitizer][${projectId}] ${msg}`),
          };

          narrate('sanitize', 'Scanning prompt for secrets and sensitive data');

          runSanitizer({ promptId: randomUUID(), raw: prompt, projectId }, sanitizerCtx)
            .then(async (sanitizerResult) => {
              // Check for halt-severity secrets
              if (!sanitizerResult.success || (sanitizerResult.data && !sanitizerResult.data.passed)) {
                narrate('blocked', 'Halt-severity secrets detected in prompt — generation aborted', {
                  warnings: sanitizerResult.data?.warnings ?? [],
                });
                sendEvent({
                  type: 'error',
                  reason: 'secrets_detected',
                  warnings: sanitizerResult.data?.warnings ?? [],
                });
                res.end();
                return;
              }

              const warnings = sanitizerResult.data?.warnings ?? [];
              if (warnings.length > 0) {
                narrate(
                  'sanitize-warnings',
                  `${warnings.length} non-blocking warning${warnings.length === 1 ? '' : 's'} from sanitizer`,
                  { warnings },
                );
              } else {
                narrate('sanitize-clean', 'No secrets detected — proceeding to LLM');
              }

              const sanitizedPrompt = sanitizerResult.data?.sanitized ?? prompt;

              // Set up LLM service
              if (!credentialManager) {
                narrate('error', 'Credential manager not configured — cannot reach Anthropic');
                sendEvent({ type: 'error', message: 'Credential manager not configured' });
                res.end();
                return;
              }

              narrate('llm-connect', 'Calling Anthropic Claude (claude-sonnet-4) with full system prompt');

              const llmService = new LLMService({
                credentialManager,
                recentWrites: watcherSupervisor.getWatcher()?.getRecentWrites(),
              });

              let filesWritten = 0;
              let tokensReceived = 0;
              let lastTokenReport = 0;

              try {
                const result = await llmService.streamGeneration(sanitizedPrompt, {
                  onToken: (text) => {
                    tokensReceived += text.length;
                    // Throttled progress beacon every ~2k chars
                    if (tokensReceived - lastTokenReport > 2000) {
                      narrate('streaming', `Streaming from Claude — ${tokensReceived} chars received`, {
                        bytesReceived: tokensReceived,
                      });
                      lastTokenReport = tokensReceived;
                    }
                    sendEvent({ type: 'token', content: text });
                  },
                  onFileStart: (path) => {
                    narrate('file-start', `Starting to write ${path}`, { path });
                    sendEvent({ type: 'file_start', path });
                  },
                  onFileEnd: async (path, content) => {
                    // Write completed file to workspace
                    await workspace.writeFile(projectId, path, content);
                    filesWritten += 1;
                    narrate('file-end', `Wrote ${path} (${content.length} bytes)`, {
                      path,
                      bytes: content.length,
                      filesWritten,
                    });
                    sendEvent({ type: 'file_end', path });
                  },
                  onComplete: (files) => {
                    narrate('complete', `Generation complete — ${files.length} files written`, {
                      files,
                      tokensReceived,
                    });
                    sendEvent({ type: 'done', files });
                  },
                  onError: (error) => {
                    narrate('error', `LLM error: ${error.message}`, { error: error.message });
                    sendEvent({ type: 'error', message: error.message });
                  },
                });

                narrate('summary', `Done. ${result.files.length} files, ${result.tokensUsed.input}+${result.tokensUsed.output} tokens, ${result.durationMs}ms`, {
                  fileCount: result.files.length,
                  inputTokens: result.tokensUsed.input,
                  outputTokens: result.tokensUsed.output,
                  durationMs: result.durationMs,
                });

                // Publish hook completed event
                await eventBus.publish(createAppDevEvent(
                  APPDEV_EVENTS.HOOK_COMPLETED,
                  {
                    projectId,
                    hookId: 'code-generator',
                    executionId: sanitizerCtx.executionId,
                    success: true,
                    dryRun: false,
                    durationMs: result.durationMs,
                    files: result.files,
                    tokensUsed: result.tokensUsed,
                  },
                  req.tenantId,
                ));
              } catch (error) {
                narrate('error', `Generation threw: ${(error as Error).message}`, {
                  error: (error as Error).message,
                });
                sendEvent({ type: 'error', message: (error as Error).message });

                // Publish hook failed event
                await eventBus.publish(createAppDevEvent(
                  APPDEV_EVENTS.HOOK_COMPLETED,
                  {
                    projectId,
                    hookId: 'code-generator',
                    executionId: sanitizerCtx.executionId,
                    success: false,
                    dryRun: false,
                    durationMs: Date.now() - Date.parse(sanitizerCtx.startedAt),
                    error: (error as Error).message,
                  },
                  req.tenantId,
                ));
              } finally {
                res.end();
              }
            })
            .catch((error) => {
              sendEvent({ type: 'error', message: (error as Error).message });
              res.end();
            });
        },
      };
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/build
    // Requires human origin. Per-project rate limit: 3 builds/hour.
    // -----------------------------------------------------------------------
    async buildProject(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      const body = req.body as { platform?: string; autoSubmit?: boolean } | null;
      const platform = body?.platform as 'ios' | 'android' | undefined;
      if (platform !== 'ios' && platform !== 'android') {
        return { statusCode: 400, body: { error: 'platform must be "ios" or "android"' } };
      }
      // Default OFF — caller has to opt in. The submit flow still fires the
      // TestFlight watcher in the background even when the human-confirm path
      // is used.
      const autoSubmit = body?.autoSubmit === true;

      // Per-project rate limit
      const rateKey = `build:${projectId}`;
      const now = Date.now();
      const hourAgo = now - 3600_000;
      if (!buildRateTracker.has(rateKey)) buildRateTracker.set(rateKey, []);
      const timestamps = buildRateTracker.get(rateKey)!.filter(t => t > hourAgo);
      buildRateTracker.set(rateKey, timestamps);

      const maxPerHour = parseInt(process.env.SERAPHIM_BUILD_RATE_LIMIT_PER_HOUR ?? '3', 10);
      if (timestamps.length >= maxPerHour) {
        return {
          statusCode: 429,
          body: { error: 'Rate limit exceeded', message: `Max ${maxPerHour} builds per project per hour` },
          headers: { 'Retry-After': '3600' },
        };
      }

      // Check watcher health
      if (!watcherSupervisor.isHealthy()) {
        return {
          statusCode: 503,
          body: { error: 'Service unavailable', message: 'File watcher is down — builds paused.' },
        };
      }

      if (!credentialManager) {
        return { statusCode: 500, body: { error: 'Credential manager not configured' } };
      }

      const ctx = {
        executionId: randomUUID(),
        dryRun: false,
        startedAt: new Date().toISOString(),
        log: (msg: string) => console.log(msg),
      };

      // Hook 5: Build Preparer
      const prepResult = await runBuildPreparer(
        { projectId, platform, credentialManager },
        ctx,
      );

      if (!prepResult.success) {
        return {
          statusCode: 400,
          body: { error: 'Build preparation failed', details: prepResult.error, errors: prepResult.data?.errors },
        };
      }

      // Hook 6: Build Runner — wrapped with metrics + watchdog so a stuck
      // build still surfaces an escalation to operators within 30s.
      const buildResult = await recordHookExecution('build-runner', () =>
        wrapWithWatchdog(
          (innerCtx) => runBuildRunner(
            {
              projectId,
              platform,
              credentialManager,
              credentialInfo: prepResult.data?.credentialInfo,
              eventBus,
              tenantId: req.tenantId,
            },
            innerCtx,
          ),
          ctx,
          {
            hookId: 'build-runner',
            projectId,
            timeoutMs: LIMITS.escalationWatchdogMs,
            eventBus,
            credentialManager,
            tenantId: req.tenantId ?? 'system',
            failureContext: { platform, autoSubmit },
          },
        ),
      );

      if (!buildResult.success) {
        return {
          statusCode: 500,
          body: { error: 'Build submission failed', details: buildResult.error },
        };
      }

      // Record rate limit
      timestamps.push(now);

      return {
        statusCode: 200,
        body: {
          buildId: buildResult.data!.buildId,
          projectId,
          platform,
          status: 'queued',
          autoSubmit,
          message: autoSubmit
            ? 'Build queued; submitter+watcher will run automatically once it finishes.'
            : 'Build queued; call /confirm-submit to ship to TestFlight when done.',
        },
      };
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/store-listing
    // -----------------------------------------------------------------------
    async generateStoreListing(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      // TODO Phase 8: delegate to pipeline/08-store-listing-writer.run()
      return {
        statusCode: 202,
        body: {
          projectId,
          status: 'accepted',
          message: 'Store listing generation queued (pipeline stub — Phase 8)',
        },
      };
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/submit
    // -----------------------------------------------------------------------
    async prepareSubmission(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      const body = req.body as { platform?: string } | null;
      const platform = (body?.platform as 'ios' | 'android') || 'ios';

      // TODO Phase 8: delegate to pipeline/09-submission-prep.run()
      return {
        statusCode: 202,
        body: {
          projectId,
          platform,
          status: 'accepted',
          message: 'Submission preparation queued (pipeline stub — Phase 8). Requires confirm-submit to finalize.',
        },
      };
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/confirm-submit — HUMAN ONLY
    // -----------------------------------------------------------------------
    async confirmSubmission(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      const platform = (req.body as Record<string, unknown>)?.platform as string | undefined;
      if (platform !== 'ios' && platform !== 'android') {
        return { statusCode: 400, body: { error: 'platform must be "ios" or "android"' } };
      }

      const submissionId = (req.body as Record<string, unknown>)?.submissionId as string | undefined;
      if (!submissionId) {
        return { statusCode: 400, body: { error: 'submissionId is required (client-generated UUID for idempotency)' } };
      }

      // Idempotency: if this submissionId was already processed, return cached result
      const cached = submissionCache.get(submissionId);
      if (cached) {
        return { statusCode: 200, body: cached };
      }

      // Verify workspace exists
      try {
        await workspace.listFiles(projectId);
      } catch {
        return { statusCode: 404, body: { error: `Project "${projectId}" workspace not found` } };
      }

      // Note: requireHumanOrigin is enforced by the router before this handler runs.

      // Audit trail — immutable record of human confirmation
      if (auditService) {
        await auditService.recordAction({
          tenantId: req.tenantId,
          actingAgentId: req.userId,
          actingAgentName: 'human-user',
          actionType: 'app_submission_confirmed',
          target: projectId,
          authorizationChain: [],
          executionTokens: [],
          outcome: 'success',
          details: { projectId, platform, submissionId, confirmedAt: new Date().toISOString(), source: 'api' },
        });
      }

      // Re-validate checklist (state may have changed since prep)
      const ctx = { executionId: randomUUID(), dryRun: false, startedAt: new Date().toISOString(), log: () => {} };
      const prepResult = await runSubmissionPrep({ projectId, platform }, ctx);
      if (!prepResult.data?.readyForConfirmation) {
        return {
          statusCode: 400,
          body: {
            error: 'Submission not ready — checklist has failing items',
            missingItems: prepResult.data?.missingItems ?? [],
          },
        };
      }

      // Retrieve EXPO_TOKEN — required by Hook 9b internally; we still validate
      // up-front here to fail fast with a clear 500.
      try {
        const tokenCheck = await credentialManager!.getCredential('expo', 'access-token');
        if (!tokenCheck) throw new Error('empty');
      } catch {
        return { statusCode: 500, body: { error: 'Failed to retrieve Expo token for submission' } };
      }

      // Run eas submit via the new submitter hook (Hook 9b).
      // This unifies the submission code path with the auto-submit option that
      // Hook 6 will use after a build finishes — so the API and the pipeline
      // stay in lock-step.
      const submitterCtx = {
        executionId: randomUUID(),
        dryRun: false,
        startedAt: new Date().toISOString(),
        log: () => {},
      };
      const submitHookResult = await runSubmitter(
        {
          projectId,
          platform,
          easBuildId: ((req.body as Record<string, unknown>)?.easBuildId as string | undefined) ?? 'unknown',
          androidTrack: platform === 'android' ? 'internal' : undefined,
          credentialManager: credentialManager!,
          eventBus,
          tenantId: req.tenantId ?? 'system',
        },
        submitterCtx,
      );

      const submitResult = {
        status: submitHookResult.data?.status === 'submitted'
          ? 'submitted'
          : (submitHookResult.data?.status === 'failed' ? 'failed' : 'submitted'),
        errorMessage: submitHookResult.data?.errorMessage,
      } as const;

      // After a successful submission, kick off the TestFlight watcher in the
      // background. We never await it — the watcher polls for up to 60 minutes
      // and emits events as Apple's processingState transitions.
      if (submitHookResult.data?.status === 'submitted' && platform === 'ios') {
        const easBuildId = (req.body as Record<string, unknown>)?.easBuildId as string | undefined;
        if (easBuildId) {
          // Resolve ascAppId, appVersion, buildNumber from workspace files.
          let ascAppId: string | undefined;
          let appVersion = '1.0.0';
          let buildNumber = '1';
          try {
            const easJson = JSON.parse(await workspace.readFile(projectId, 'eas.json'));
            ascAppId = easJson?.submit?.production?.ios?.ascAppId;
          } catch { /* ignore */ }
          try {
            const appJson = JSON.parse(await workspace.readFile(projectId, 'app.json'));
            appVersion = appJson?.expo?.version ?? appVersion;
            buildNumber = appJson?.expo?.ios?.buildNumber ?? buildNumber;
          } catch { /* ignore */ }

          if (ascAppId) {
            const watcherCtx = {
              executionId: randomUUID(),
              dryRun: false,
              startedAt: new Date().toISOString(),
              log: () => {},
            };
            // Fire and forget — caller gets immediate response, dashboard
            // subscribes to APPDEV_EVENTS.TESTFLIGHT_* for updates.
            void runTestFlightWatcher(
              {
                projectId,
                platform: 'ios',
                easBuildId,
                ascAppId,
                appVersion,
                buildNumber,
                credentialManager: credentialManager!,
                eventBus,
                tenantId: req.tenantId ?? 'system',
              },
              watcherCtx,
            ).catch(() => { /* watcher is non-fatal */ });
          }
        }
      }

      // Build response
      const responseBody = {
        submissionId,
        projectId,
        platform,
        status: submitResult.status,
        errorMessage: submitResult.errorMessage,
        confirmedAt: new Date().toISOString(),
        confirmedBy: req.userId,
      };

      // Cache for idempotency
      submissionCache.set(submissionId, responseBody);

      // Publish event
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.SUBMISSION_COMPLETED,
        { projectId, platform, submissionId, status: submitResult.status },
        req.tenantId ?? 'system',
      )).catch(() => {});

      return { statusCode: 200, body: responseBody };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/projects/:id
    // -----------------------------------------------------------------------
    async getProject(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      // TODO: Read project state from persistence layer
      // For now, check if workspace directory exists
      const files = await workspace.listFiles(projectId);

      return {
        statusCode: 200,
        body: {
          projectId,
          status: files.length > 0 ? 'active' : 'idle',
          fileCount: files.length,
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/projects/:id/files
    // -----------------------------------------------------------------------
    async listProjectFiles(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      const files = await workspace.listFiles(projectId);

      return {
        statusCode: 200,
        body: {
          projectId,
          files,
          count: files.length,
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/projects/:id/submission-logs
    //   List all TestFlight watcher logs for a project.
    // -----------------------------------------------------------------------
    async listSubmissionLogs(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      let allFiles: string[] = [];
      try {
        allFiles = await workspace.listFiles(projectId);
      } catch {
        return { statusCode: 404, body: { error: `Project "${projectId}" workspace not found` } };
      }

      const logFiles = allFiles
        .filter((f) => f.startsWith('submission-logs/') && f.endsWith('.json'))
        .sort()
        .reverse(); // newest first when filenames carry timestamps or build ids

      return {
        statusCode: 200,
        body: {
          projectId,
          count: logFiles.length,
          logs: logFiles.map((f) => ({
            easBuildId: f.replace(/^submission-logs\//, '').replace(/\.json$/, ''),
            path: f,
          })),
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/projects/:id/submission-logs/:easBuildId
    //   Fetch the persisted TestFlight watcher log for one build.
    //   This is what the dashboard renders to show users what Apple actually
    //   reported about their build (PROCESSING → INVALID with errorMessage,
    //   etc.) — same data the user sees when TestFlight throws "Something
    //   went wrong".
    // -----------------------------------------------------------------------
    async getSubmissionLog(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      const easBuildId = req.params.easBuildId;
      if (!projectId || !easBuildId) {
        return { statusCode: 400, body: { error: 'project id and easBuildId are required' } };
      }

      const relPath = `submission-logs/${easBuildId}.json`;
      const exists = await workspace.exists(projectId, relPath);
      if (!exists) {
        return { statusCode: 404, body: { error: `No watcher log for build ${easBuildId}` } };
      }

      try {
        const content = await workspace.readFile(projectId, relPath);
        return { statusCode: 200, body: JSON.parse(content) };
      } catch (error) {
        return {
          statusCode: 500,
          body: { error: `Failed to read watcher log: ${(error as Error).message}` },
        };
      }
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/auto-submit-and-watch
    //   One-shot: submit a finished EAS build to App Store Connect AND start
    //   the TestFlight watcher in the background. Body must include easBuildId
    //   (the FINISHED build to submit) and platform.
    //
    //   Use this from the dashboard "Ship to TestFlight" button — there's no
    //   manual step. Watcher events are emitted as APPDEV_EVENTS.TESTFLIGHT_*
    //   and the persisted log is available at
    //   GET /app-dev/projects/:id/submission-logs/:easBuildId
    // -----------------------------------------------------------------------
    async autoSubmitAndWatch(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }
      if (!credentialManager) {
        return { statusCode: 500, body: { error: 'Credential manager not configured' } };
      }

      const body = req.body as { platform?: string; easBuildId?: string; androidTrack?: string } | null;
      const platform = body?.platform as 'ios' | 'android' | undefined;
      const easBuildId = body?.easBuildId;
      if (platform !== 'ios' && platform !== 'android') {
        return { statusCode: 400, body: { error: 'platform must be "ios" or "android"' } };
      }
      if (!easBuildId) {
        return { statusCode: 400, body: { error: 'easBuildId is required' } };
      }

      const tenantId = req.tenantId ?? 'system';

      // Hook 9b — eas submit
      const submitterCtx = {
        executionId: randomUUID(),
        dryRun: false,
        startedAt: new Date().toISOString(),
        log: () => {},
      };
      const submitResult = await runSubmitter(
        {
          projectId,
          platform,
          easBuildId,
          androidTrack: body?.androidTrack,
          credentialManager,
          eventBus,
          tenantId,
        },
        submitterCtx,
      );

      if (submitResult.data?.status !== 'submitted') {
        return {
          statusCode: 500,
          body: {
            error: 'Submission failed',
            details: submitResult.error ?? submitResult.data?.errorMessage,
          },
        };
      }

      // Hook 10b — TestFlight watcher (fire-and-forget; iOS only for now)
      if (platform === 'ios') {
        let ascAppId: string | undefined;
        let appVersion = '1.0.0';
        let buildNumber = '1';
        try {
          const easJson = JSON.parse(await workspace.readFile(projectId, 'eas.json'));
          ascAppId = easJson?.submit?.production?.ios?.ascAppId;
        } catch { /* ignore */ }
        try {
          const appJson = JSON.parse(await workspace.readFile(projectId, 'app.json'));
          appVersion = appJson?.expo?.version ?? appVersion;
          buildNumber = appJson?.expo?.ios?.buildNumber ?? buildNumber;
        } catch { /* ignore */ }

        if (ascAppId) {
          const watcherCtx = {
            executionId: randomUUID(),
            dryRun: false,
            startedAt: new Date().toISOString(),
            log: () => {},
          };
          void runTestFlightWatcher(
            {
              projectId,
              platform: 'ios',
              easBuildId,
              ascAppId,
              appVersion,
              buildNumber,
              credentialManager,
              eventBus,
              tenantId,
            },
            watcherCtx,
          ).catch(() => { /* watcher is non-fatal */ });
        }
      }

      return {
        statusCode: 200,
        body: {
          projectId,
          platform,
          easBuildId,
          submissionId: submitResult.data?.submissionId,
          status: 'submitted',
          watcher: platform === 'ios' ? 'started' : 'unsupported',
          message: platform === 'ios'
            ? `Submitted. Watch progress via APPDEV_EVENTS.TESTFLIGHT_* or GET /app-dev/projects/${projectId}/submission-logs/${easBuildId}`
            : 'Submitted. Android watcher not yet implemented.',
        },
      };
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/webhooks/sentry
    //   Sentry → Hook 10 (crash-watcher).
    //   Optional HMAC signature check via SENTRY_WEBHOOK_SECRET.
    // -----------------------------------------------------------------------
    async sentryWebhook(req: APIRequest): Promise<APIResponse> {
      const secret = process.env.SENTRY_WEBHOOK_SECRET ?? '';
      if (secret) {
        const sig = (req.headers?.['sentry-hook-signature'] as string | undefined) ?? null;
        const rawBody =
          typeof req.rawBody === 'string'
            ? req.rawBody
            : JSON.stringify(req.body ?? {});
        if (!verifySentrySignature(rawBody, sig, secret)) {
          return { statusCode: 401, body: { error: 'invalid Sentry signature' } };
        }
      }

      const payload = req.body as Record<string, unknown> | null;
      if (!payload) {
        return { statusCode: 400, body: { error: 'empty payload' } };
      }

      // Resolve the projectId from the Sentry project slug.
      // The slug is what Hook 5c set when provisioning Sentry — we mirror it
      // back here. Fallback: use slug verbatim.
      const issue = (payload as Record<string, unknown>)?.['data'] as Record<string, unknown> | undefined;
      const issueObj = issue?.['issue'] as Record<string, unknown> | undefined;
      const project = issueObj?.['project'] as Record<string, unknown> | undefined;
      const sentryProjectSlug = (project?.['slug'] as string | undefined) ?? 'unknown';

      // We map sentryProjectSlug → workspace projectId by listing projects
      // and matching against app.json.expo.slug. This is best-effort.
      let projectId = sentryProjectSlug;
      try {
        const allProjects = await workspace.listProjects?.();
        if (Array.isArray(allProjects)) {
          for (const pid of allProjects) {
            try {
              const appJson = JSON.parse(await workspace.readFile(pid, 'app.json'));
              if (appJson?.expo?.slug === sentryProjectSlug) {
                projectId = pid;
                break;
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* fall back to slug */ }

      const ctx = {
        executionId: randomUUID(),
        dryRun: false,
        startedAt: new Date().toISOString(),
        log: (msg: string) => console.log(msg),
      };
      const result = await runCrashWatcher(
        {
          projectId,
          payload: payload as Parameters<typeof runCrashWatcher>[0]['payload'],
          eventBus,
          tenantId: req.tenantId ?? 'system',
        },
        ctx,
      );

      return {
        statusCode: 200,
        body: {
          received: true,
          observed: result.data?.observed ?? false,
          sentryEventId: result.data?.sentryEventId,
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/metrics
    // -----------------------------------------------------------------------
    async getMetrics(_req: APIRequest): Promise<APIResponse> {
      return {
        statusCode: 200,
        body: {
          hooks: getMetricsSnapshot(),
          recentErrorRate: getRecentErrorRate(),
          collectedAt: new Date().toISOString(),
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/health
    // -----------------------------------------------------------------------
    async getHealth(_req: APIRequest): Promise<APIResponse> {
      const watcherHealthy = watcherSupervisor.isHealthy();
      const hookCount = Object.keys(HOOKS_CONFIG.hooks).length;
      const enabledCount = Object.values(HOOKS_CONFIG.hooks).filter((h) => h.enabled).length;
      const durable = workspace.hasDurableStore();

      return {
        statusCode: 200,
        body: {
          status: watcherHealthy && !HOOKS_CONFIG.globalKillSwitch ? 'healthy' : 'degraded',
          hooks: {
            total: hookCount,
            enabled: enabledCount,
            killSwitchOn: HOOKS_CONFIG.globalKillSwitch,
          },
          watcher: { healthy: watcherHealthy },
          persistence: { durable },
          recentErrorRate: getRecentErrorRate(),
          checkedAt: new Date().toISOString(),
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/escalations
    // -----------------------------------------------------------------------
    async listEscalations(req: APIRequest): Promise<APIResponse> {
      const status = (req.query?.['status'] as string | undefined) as
        | 'open'
        | 'self_healing'
        | 'resolved'
        | 'operator_required'
        | undefined;
      const records = await listEscalations(status ? { status } : {});
      return {
        statusCode: 200,
        body: {
          count: records.length,
          escalations: records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/projects
    //   Returns every workspace with file count, mtimes, and the original
    //   prompt (when stored under .meta/project.json). Used by the studio
    //   sidebar to populate the saved-projects list.
    // -----------------------------------------------------------------------
    async listProjects(_req: APIRequest): Promise<APIResponse> {
      const ids = await workspace.listProjects();
      const records = await Promise.all(
        ids.map(async (id) => {
          try {
            return await workspace.getProjectMeta(id);
          } catch {
            return { projectId: id, fileCount: 0, createdAt: null, updatedAt: null };
          }
        }),
      );
      // newest first
      records.sort((a, b) => {
        const aT = a.updatedAt ?? a.createdAt ?? '';
        const bT = b.updatedAt ?? b.createdAt ?? '';
        return bT.localeCompare(aT);
      });
      return {
        statusCode: 200,
        body: { count: records.length, projects: records },
      };
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/projects/:id/file?path=relative/path.ts
    //   Single-file read used by the in-browser code editor. Returns plain
    //   text (UTF-8) plus the resolved relative path so the client can verify.
    // -----------------------------------------------------------------------
    async readProjectFile(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      const filePath = req.query?.['path'] as string | undefined;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }
      if (!filePath) {
        return { statusCode: 400, body: { error: 'query parameter "path" is required' } };
      }

      try {
        const content = await workspace.readFile(projectId, filePath);
        return {
          statusCode: 200,
          body: { projectId, path: filePath, content },
        };
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (msg.includes('ENOENT')) {
          return { statusCode: 404, body: { error: 'file not found', path: filePath } };
        }
        return { statusCode: 400, body: { error: msg } };
      }
    },

    // -----------------------------------------------------------------------
    // PUT /app-dev/projects/:id/file?path=...
    //   Body: { content: string }
    //   Runs Hook 4 (secret-scanner) before writing. Halt-severity matches
    //   short-circuit and the file is rejected; warn-only matches still write
    //   but the response includes the warnings list.
    // -----------------------------------------------------------------------
    async writeProjectFile(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      const filePath = req.query?.['path'] as string | undefined;
      const body = req.body as { content?: string } | null;

      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }
      if (!filePath) {
        return { statusCode: 400, body: { error: 'query parameter "path" is required' } };
      }
      if (!body || typeof body.content !== 'string') {
        return { statusCode: 400, body: { error: 'body.content (string) is required' } };
      }

      // Secret scan the proposed content before persisting
      const ctx = {
        executionId: randomUUID(),
        dryRun: false,
        startedAt: new Date().toISOString(),
        log: () => {},
      };
      const scanResult = await runSecretScanner(
        { projectId, filePath, content: body.content },
        ctx,
      );
      const scanWarnings = scanResult.data?.warnings ?? [];
      const halt = scanResult.success === false;
      if (halt) {
        return {
          statusCode: 422,
          body: {
            error: 'secret-scanner blocked write',
            warnings: scanWarnings,
          },
        };
      }

      try {
        await workspace.writeFile(projectId, filePath, body.content);
        // Best-effort: refresh updatedAt on existing meta without clobbering
        // the original name/prompt
        try {
          const existing = JSON.parse(await workspace.readFile(projectId, '.meta/project.json'));
          await workspace.writeProjectMeta(projectId, {
            name: existing?.name ?? filePath,
            prompt: existing?.prompt,
            description: existing?.description,
          });
        } catch { /* meta optional */ }
        return {
          statusCode: 200,
          body: {
            projectId,
            path: filePath,
            bytesWritten: Buffer.byteLength(body.content, 'utf-8'),
            warnings: scanWarnings,
          },
        };
      } catch (err) {
        return {
          statusCode: 500,
          body: { error: (err as Error).message },
        };
      }
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/projects/:id/preview
    //   Bundle the workspace into an Expo Snack and return the embed URL the
    //   dashboard renders in an iframe. This is the "live preview" path —
    //   matches VibeCode/Rork's in-browser app render.
    // -----------------------------------------------------------------------
    async createPreview(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      // Read every workspace file (excluding the .meta/ folder)
      let allFiles: string[];
      try {
        allFiles = await workspace.listFiles(projectId);
      } catch {
        return { statusCode: 404, body: { error: `Project "${projectId}" workspace not found` } };
      }
      const codeFiles = allFiles.filter(
        (f) => !f.startsWith('.meta/') &&
          !f.startsWith('node_modules/') &&
          !f.startsWith('android/') &&
          !f.startsWith('ios/') &&
          !f.startsWith('patches/') &&
          !f.endsWith('.lock') &&
          !f.endsWith('package-lock.json'),
      );

      if (codeFiles.length === 0) {
        return {
          statusCode: 400,
          body: { error: 'Workspace has no code yet — generate the app first.' },
        };
      }

      // Read each file's content
      const files: Record<string, string> = {};
      for (const f of codeFiles) {
        try {
          files[f] = await workspace.readFile(projectId, f);
        } catch { /* skip unreadable */ }
      }

      // Pull deps from package.json
      let deps: Record<string, string> = {};
      let appName = 'ZionX App';
      let appDesc = 'Generated by ZionX Studio';
      try {
        const pkg = JSON.parse(files['package.json'] ?? '{}');
        deps = pkg.dependencies ?? {};
      } catch { /* fall through */ }
      try {
        const meta = JSON.parse(await workspace.readFile(projectId, '.meta/project.json'));
        appName = meta?.name ?? appName;
        appDesc = (meta?.description ?? meta?.prompt ?? appDesc).slice(0, 200);
      } catch { /* meta optional */ }

      // Optional Expo token to associate the snack with the operator account.
      let expoToken: string | undefined;
      if (credentialManager) {
        try {
          expoToken = await credentialManager.getCredential('expo', 'access-token');
        } catch { /* anonymous snack is fine */ }
      }

      try {
        const snack = await createSnack({
          name: appName,
          description: appDesc,
          files,
          dependencies: deps,
          expoToken,
        });
        return {
          statusCode: 200,
          body: {
            projectId,
            snackId: snack.id,
            url: snack.url,
            embedUrl: snack.embedUrl,
            fileCount: codeFiles.length,
          },
        };
      } catch (err) {
        return {
          statusCode: 500,
          body: { error: 'Snack save failed', details: (err as Error).message },
        };
      }
    },

    // -----------------------------------------------------------------------
    // GET /app-dev/spec
    //   Returns the canonical ZionX Studio behavior spec — the contract the
    //   dashboard MUST satisfy. Loaded from docs/zionx-studio-spec.md at the
    //   monorepo root. The spec-runner uses this as the source of truth when
    //   evaluating Sentry breadcrumb traces.
    // -----------------------------------------------------------------------
    async getSpec(_req: APIRequest): Promise<APIResponse> {
      try {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        // The repo root is two levels up from the WORKSPACE_ROOT
        // (workspaces sits at <repo>/workspaces/, spec at <repo>/docs/).
        const { WORKSPACE_ROOT } = await import('../workspace/workspace.js');
        const repoRoot = join(WORKSPACE_ROOT, '..');
        const specPath = join(repoRoot, 'docs', 'zionx-studio-spec.md');
        const content = await readFile(specPath, 'utf-8');
        const stat = await (await import('node:fs/promises')).stat(specPath);
        return {
          statusCode: 200,
          body: {
            version: extractSpecVersion(content) ?? '1.0.0',
            content,
            lastModified: stat.mtime.toISOString(),
            bytes: content.length,
          },
        };
      } catch (err) {
        return {
          statusCode: 404,
          body: {
            error: 'Spec document not found',
            details: (err as Error).message,
            hint: 'Expected at <repo>/docs/zionx-studio-spec.md',
          },
        };
      }
    },

    // -----------------------------------------------------------------------
    // POST /app-dev/spec/evaluate
    //   Pulls the last N breadcrumbs from Sentry and runs them through the
    //   spec-runner. Returns the report inline. The dashboard's compliance
    //   tab can call this after a long session to grade itself.
    // -----------------------------------------------------------------------
    async evaluateSpec(_req: APIRequest): Promise<APIResponse> {
      if (!credentialManager) {
        return {
          statusCode: 500,
          body: { error: 'Credential manager not configured' },
        };
      }
      try {
        // Resolve Sentry credentials. Prefer individual env-var-mapped fields
        // (auth-token, org, project) which is what production loads from
        // seraphim/sentry. Fall back to a `config` JSON blob for legacy
        // deployments that store the bundle as a single secret.
        let authToken = '';
        let org = 'zionxai';
        let project = 'zionx-dashboard';
        try {
          authToken = await credentialManager.getCredential('sentry', 'auth-token');
          const orgVal = await credentialManager.getCredential('sentry', 'org');
          const projVal = await credentialManager.getCredential('sentry', 'project');
          if (orgVal) org = orgVal;
          if (projVal) project = projVal;
        } catch {
          // ignore — try config blob next
        }
        if (!authToken) {
          try {
            const blob = await credentialManager.getCredential('sentry', 'config');
            if (blob) {
              const parsed = JSON.parse(blob) as {
                authToken?: string;
                org?: string;
                project?: string;
              };
              if (parsed.authToken) authToken = parsed.authToken;
              if (parsed.org) org = parsed.org;
              if (parsed.project) project = parsed.project;
            }
          } catch {
            // both lookups exhausted; respond with a structured 503.
          }
        }
        if (!authToken) {
          return {
            statusCode: 503,
            body: {
              error: 'Sentry credentials not configured',
              hint: 'Set SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT or seraphim/sentry secret with config.authToken',
            },
          };
        }
        const { evaluateRecentSession } = await import('../services/spec-runner.js');
        const report = await evaluateRecentSession({
          authToken,
          org,
          // The dashboard browser app is the source of UX breadcrumbs.
          // The seraphim/sentry secret's `project` field points at the
          // generated-app Sentry project (e.g. "mindful-timer"), so we always
          // override to "zionx-dashboard" here regardless of what's in the
          // secret. If a future deployment adds a dedicated dashboard secret
          // with the right project slug, this override can be removed.
          project: 'zionx-dashboard',
          issueLimit: 25,
        });
        return { statusCode: 200, body: report };
      } catch (err) {
        return {
          statusCode: 500,
          body: { error: 'Spec evaluation failed', details: (err as Error).message },
        };
      }
    },
  };
}

/** Pull the **Version** line out of the spec markdown front-matter. */
function extractSpecVersion(content: string): string | null {
  const match = content.match(/^\*\*Version\*\*:\s*([^\n]+)$/m);
  return match ? match[1]!.trim() : null;
}
