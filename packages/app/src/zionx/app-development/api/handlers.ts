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
}

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
    // -----------------------------------------------------------------------
    async buildProject(req: APIRequest): Promise<APIResponse> {
      const projectId = req.params.id;
      if (!projectId) {
        return { statusCode: 400, body: { error: 'project id is required' } };
      }

      const body = req.body as { platform?: string } | null;
      const platform = (body?.platform as 'ios' | 'android') || 'ios';

      // TODO Phase 6: delegate to pipeline/06-build-preparer.run()
      return {
        statusCode: 202,
        body: {
          projectId,
          platform,
          status: 'accepted',
          message: 'Build preparation queued (pipeline stub — Phase 6)',
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

      // Note: requireHumanOrigin is enforced by the router before this handler runs.
      // This handler only executes if the human-origin check passed.

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
          details: {
            projectId,
            confirmedAt: new Date().toISOString(),
            source: 'api',
          },
        });
      }

      // TODO: Actually trigger the store submission via App Store Connect / Google Play driver
      return {
        statusCode: 200,
        body: {
          projectId,
          status: 'confirmed',
          message: 'Submission confirmed by human operator. Store submission will proceed.',
          confirmedAt: new Date().toISOString(),
          confirmedBy: req.userId,
        },
      };
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
  };
}
