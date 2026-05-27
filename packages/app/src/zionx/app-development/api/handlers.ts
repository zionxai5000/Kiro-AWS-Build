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
import { LLMService } from '../services/llm-service.js';
import { isHookDryRun } from '../config/hooks.config.js';
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

          // Run sanitizer (Hook 1) synchronously
          const sanitizerCtx = {
            executionId: randomUUID(),
            dryRun: false,
            startedAt: new Date().toISOString(),
            log: (msg: string) => { /* silent in SSE context */ },
          };

          runSanitizer({ promptId: randomUUID(), raw: prompt, projectId }, sanitizerCtx)
            .then(async (sanitizerResult) => {
              // Check for halt-severity secrets
              if (!sanitizerResult.success || (sanitizerResult.data && !sanitizerResult.data.passed)) {
                sendEvent({
                  type: 'error',
                  reason: 'secrets_detected',
                  warnings: sanitizerResult.data?.warnings ?? [],
                });
                res.end();
                return;
              }

              const sanitizedPrompt = sanitizerResult.data?.sanitized ?? prompt;

              // Set up LLM service
              if (!credentialManager) {
                sendEvent({ type: 'error', message: 'Credential manager not configured' });
                res.end();
                return;
              }

              const llmService = new LLMService({
                credentialManager,
                recentWrites: watcherSupervisor.getWatcher()?.getRecentWrites(),
              });

              try {
                const result = await llmService.streamGeneration(sanitizedPrompt, {
                  onToken: (text) => {
                    sendEvent({ type: 'token', content: text });
                  },
                  onFileStart: (path) => {
                    sendEvent({ type: 'file_start', path });
                  },
                  onFileEnd: async (path, content) => {
                    // Write completed file to workspace
                    await workspace.writeFile(projectId, path, content);
                    sendEvent({ type: 'file_end', path });
                  },
                  onComplete: (files) => {
                    sendEvent({ type: 'done', files });
                  },
                  onError: (error) => {
                    sendEvent({ type: 'error', message: error.message });
                  },
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

      // Hook 6: Build Runner
      const buildResult = await runBuildRunner(
        {
          projectId,
          platform,
          credentialManager,
          credentialInfo: prepResult.data?.credentialInfo,
          eventBus,
          tenantId: req.tenantId,
        },
        ctx,
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
  };
}
