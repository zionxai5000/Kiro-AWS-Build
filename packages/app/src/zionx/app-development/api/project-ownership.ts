/**
 * Project ownership middleware.
 *
 * Cognito JWT auth (existing AuthMiddleware in shaar) puts a userId on every
 * APIRequest. This helper reads the project's `.meta/project.json`, compares
 * `ownerId` against the request's `userId`, and returns a 403 if they differ.
 *
 * Used by every `/app-dev/projects/:id/*` handler that mutates state. Read
 * endpoints can opt in too — for v1 they all do, since project lists are
 * scoped per-user.
 *
 * Edge cases:
 *   - No `.meta/project.json` (legacy projects pre-Phase 5): allowed.
 *     Migration is one-shot the first time the owner touches the project —
 *     `claimUnownedProject()` writes ownerId on access, so the legacy meta
 *     gracefully picks up the first authenticated user.
 *   - Anonymous request (no userId): rejected unless the project is also
 *     unowned (covers local-dev fallthrough).
 */

import type { APIRequest, APIResponse } from '@seraphim/services/shaar/api-routes.js';
import type { Workspace } from '../workspace/workspace.js';

export interface OwnershipCheckResult {
  /** undefined when the check passes; APIResponse to return otherwise. */
  reject?: APIResponse;
  /** The resolved ownerId (after lazy-claim) when the check passes. */
  ownerId?: string;
}

export async function requireProjectOwner(
  req: APIRequest,
  workspace: Workspace,
  projectId: string,
): Promise<OwnershipCheckResult> {
  const meta = await workspace.readProjectMeta(projectId);

  // Project not found — surface 404, not 403, so the client can recover.
  if (meta === null) {
    return {
      reject: { statusCode: 404, body: { error: 'Project not found', projectId } },
    };
  }

  const ownerId = (meta.ownerId as string | undefined) ?? null;
  const userId = req.userId || null;

  // Phase 5 migration: if the project has no owner yet, claim it for the
  // current authenticated user. Anonymous callers can't claim.
  if (!ownerId) {
    if (!userId) {
      return {
        reject: { statusCode: 401, body: { error: 'Authentication required to claim unowned project' } },
      };
    }
    await workspace.writeProjectMeta(projectId, {
      ...(meta as Record<string, unknown>),
      name: (meta.name as string | undefined) ?? projectId,
      ownerId: userId,
    });
    return { ownerId: userId };
  }

  // Ownership match required.
  if (!userId) {
    return {
      reject: { statusCode: 401, body: { error: 'Authentication required' } },
    };
  }
  if (ownerId !== userId) {
    return {
      reject: { statusCode: 403, body: { error: 'Project access forbidden', projectId } },
    };
  }
  return { ownerId };
}

/** Convenience wrapper: extract projectId from `req.params.id` and check. */
export async function requireProjectOwnerFromParams(
  req: APIRequest,
  workspace: Workspace,
): Promise<OwnershipCheckResult> {
  const projectId = req.params.id;
  if (!projectId) {
    return { reject: { statusCode: 400, body: { error: 'Project id is required' } } };
  }
  return requireProjectOwner(req, workspace, projectId);
}
