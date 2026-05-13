/**
 * App Development API Routes — plugin route group for ShaarAPIRouter.
 *
 * Registered via router.registerRouteGroup(createAppDevRoutes(deps)).
 * All routes are prefixed with /app-dev/.
 */

import type { RouteHandler, APIRequest, APIResponse } from '@seraphim/services/shaar/api-routes.js';
import { createHandlers, type AppDevHandlerDeps } from './handlers.js';

// ---------------------------------------------------------------------------
// Route Factory
// ---------------------------------------------------------------------------

/**
 * Create the app-dev route group.
 * Pass dependencies (eventBus, supervisor, workspace, etc.) via the deps object.
 */
export function createAppDevRoutes(deps: AppDevHandlerDeps): RouteHandler[] {
  const h = createHandlers(deps);

  return [
    {
      method: 'POST',
      path: '/app-dev/projects',
      handler: h.createProject,
    },
    {
      method: 'POST',
      path: '/app-dev/projects/:id/generate',
      handler: h.generateCode,
    },
    {
      method: 'POST',
      path: '/app-dev/projects/:id/build',
      handler: h.buildProject,
    },
    {
      method: 'POST',
      path: '/app-dev/projects/:id/store-listing',
      handler: h.generateStoreListing,
    },
    {
      method: 'POST',
      path: '/app-dev/projects/:id/submit',
      handler: h.prepareSubmission,
    },
    {
      method: 'POST',
      path: '/app-dev/projects/:id/confirm-submit',
      requireHumanOrigin: true,
      handler: h.confirmSubmission,
    },
    {
      method: 'GET',
      path: '/app-dev/projects/:id',
      handler: h.getProject,
    },
    {
      method: 'GET',
      path: '/app-dev/projects/:id/files',
      handler: h.listProjectFiles,
    },
  ];
}
