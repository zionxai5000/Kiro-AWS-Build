import { describe, it, expect } from 'vitest';
import { createAppDevRoutes } from '../routes.js';
import type { EventBusService, SystemEvent } from '@seraphim/core';
import type { WatcherSupervisor } from '../../events/watcher-supervisor.js';
import { Workspace } from '../../workspace/workspace.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockDeps() {
  const eventBus: EventBusService = {
    async publish() { return 'id'; },
    async publishBatch() { return []; },
    async subscribe() { return 'sub'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  };

  const watcherSupervisor = {
    isHealthy: () => true,
    state: 'healthy' as const,
    start: async () => {},
    stop: async () => {},
    restart: async () => {},
    getWatcher: () => null,
  } as unknown as WatcherSupervisor;

  const workspace = new Workspace();

  return { eventBus, watcherSupervisor, workspace };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAppDevRoutes', () => {
  it('returns 8 routes', () => {
    const routes = createAppDevRoutes(createMockDeps());
    expect(routes).toHaveLength(8);
  });

  it('all routes have /app-dev/ prefix', () => {
    const routes = createAppDevRoutes(createMockDeps());
    for (const route of routes) {
      expect(route.path).toMatch(/^\/app-dev\//);
    }
  });

  it('has correct methods for each endpoint', () => {
    const routes = createAppDevRoutes(createMockDeps());
    const routeMap = routes.map(r => `${r.method} ${r.path}`);

    expect(routeMap).toContain('POST /app-dev/projects');
    expect(routeMap).toContain('POST /app-dev/projects/:id/generate');
    expect(routeMap).toContain('POST /app-dev/projects/:id/build');
    expect(routeMap).toContain('POST /app-dev/projects/:id/store-listing');
    expect(routeMap).toContain('POST /app-dev/projects/:id/submit');
    expect(routeMap).toContain('POST /app-dev/projects/:id/confirm-submit');
    expect(routeMap).toContain('GET /app-dev/projects/:id');
    expect(routeMap).toContain('GET /app-dev/projects/:id/files');
  });

  it('confirm-submit has requireHumanOrigin: true', () => {
    const routes = createAppDevRoutes(createMockDeps());
    const confirmRoute = routes.find(r => r.path === '/app-dev/projects/:id/confirm-submit');
    expect(confirmRoute).toBeDefined();
    expect(confirmRoute!.requireHumanOrigin).toBe(true);
  });

  it('other routes do not have requireHumanOrigin', () => {
    const routes = createAppDevRoutes(createMockDeps());
    const humanOnlyPaths = ['/app-dev/projects/:id/confirm-submit', '/app-dev/projects/:id/build'];
    const otherRoutes = routes.filter(r => !humanOnlyPaths.includes(r.path));
    for (const route of otherRoutes) {
      expect(route.requireHumanOrigin).toBeUndefined();
    }
  });

  it('all routes have handler functions', () => {
    const routes = createAppDevRoutes(createMockDeps());
    for (const route of routes) {
      expect(typeof route.handler).toBe('function');
    }
  });
});
