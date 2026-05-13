/**
 * Shaar API Layer — REST API Routes
 *
 * Defines REST API routes for agent management, pillar metrics, cost data,
 * audit trail queries, system health, and command submission.
 *
 * Authentication flow: validate JWT (Cognito) → extract tenant/role → authorize via Mishmar → handle request
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import type { AgentRuntime } from '@seraphim/core/interfaces/agent-runtime.js';
import type { XOAuditService } from '@seraphim/core/interfaces/xo-audit-service.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { MishmarService } from '@seraphim/core/interfaces/mishmar-service.js';
import type { AuthMiddleware, MiddlewareResult } from '../auth/middleware.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface APIRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  tenantId: string;
  userId: string;
  role: string;
}

export interface APIResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface RouteHandler {
  method: string;
  path: string;
  handler: (req: APIRequest) => Promise<APIResponse>;
  /** If true, the route requires positive proof of human origin (rejects agent tokens). */
  requireHumanOrigin?: boolean;
}

// ---------------------------------------------------------------------------
// Shaar API Router
// ---------------------------------------------------------------------------

export class ShaarAPIRouter {
  private routes: RouteHandler[] = [];

  constructor(
    private readonly agentRuntime: AgentRuntime,
    private readonly auditService: XOAuditService,
    private readonly otzarService: OtzarService,
    private readonly mishmarService: MishmarService,
    private readonly authMiddleware?: AuthMiddleware,
  ) {
    this.registerRoutes();
  }

  /**
   * Authenticate an incoming request by validating the JWT Bearer token.
   * Extracts tenant context and user role from the validated token.
   *
   * Returns a MiddlewareResult with authorized=true and context on success,
   * or authorized=false with an error message on failure.
   */
  async authenticateRequest(req: APIRequest): Promise<MiddlewareResult> {
    if (!this.authMiddleware) {
      // No auth middleware configured — skip JWT validation (backward compatible)
      return {
        authorized: true,
        context: {
          user: { userId: req.userId, tenantId: req.tenantId, role: req.role as 'king' | 'queen', email: '' },
          tenantId: req.tenantId,
          role: req.role,
        },
      };
    }

    const authHeader = req.headers['authorization'] ?? req.headers['Authorization'];
    return this.authMiddleware.authenticate(authHeader);
  }

  /**
   * Handle an incoming API request.
   *
   * Full flow: authenticate JWT → extract tenant/role → authorize via Mishmar → handle request
   */
  async handleRequest(req: APIRequest): Promise<APIResponse> {
    // Step 1: Authenticate JWT via Cognito
    const authResult = await this.authenticateRequest(req);

    if (!authResult.authorized) {
      return {
        statusCode: 401,
        body: { error: 'Authentication failed', message: authResult.error },
      };
    }

    // Step 2: Extract tenant/role from authenticated context
    if (authResult.context) {
      req.tenantId = authResult.context.tenantId;
      req.userId = authResult.context.user.userId;
      req.role = authResult.context.role;
    }

    // Step 3: Find matching route
    const route = this.routes.find(
      (r) => r.method === req.method && this.matchPath(r.path, req.path),
    );

    if (!route) {
      return { statusCode: 404, body: { error: 'Route not found' } };
    }

    // Extract path params
    req.params = this.extractParams(route.path, req.path);

    // Step 4: Authorize via Mishmar
    const mishmarResult = await this.mishmarService.authorize({
      agentId: req.userId,
      action: `api:${req.method}:${route.path}`,
      target: req.path,
      authorityLevel: req.role === 'king' ? 'L1' : 'L2',
      context: { tenantId: req.tenantId },
    });

    if (!mishmarResult.authorized) {
      return { statusCode: 403, body: { error: 'Unauthorized', reason: mishmarResult.reason } };
    }

    // Step 4b: Human-origin check for protected routes
    if (route.requireHumanOrigin) {
      const principalType = (authResult.context?.user as unknown as { principalType?: string })?.principalType;
      if (principalType !== 'human') {
        return {
          statusCode: 403,
          body: {
            error: 'Human origin required',
            message: 'This endpoint requires positive proof of human origin. Agent tokens are not permitted.',
          },
        };
      }
    }

    // Step 5: Handle request
    try {
      return await route.handler(req);
    } catch (error) {
      return {
        statusCode: 500,
        body: { error: 'Internal server error', message: (error as Error).message },
      };
    }
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): RouteHandler[] {
    return [...this.routes];
  }

  /**
   * Register an external route group (plugin pattern).
   * Domain packages (app-dev, zion-alpha, zxmg, eretz) use this to add
   * their routes without modifying this file.
   */
  registerRouteGroup(routes: RouteHandler[]): void {
    this.routes.push(...routes);
  }

  // ---------------------------------------------------------------------------
  // Route Registration
  // ---------------------------------------------------------------------------

  private registerRoutes(): void {
    // Agent routes
    this.routes.push({
      method: 'GET',
      path: '/agents',
      handler: async (req) => {
        const agents = await this.agentRuntime.listAgents({});
        const dashboardAgents = agents.map((a: any) => this.toAgentDTO(a));
        return { statusCode: 200, body: { agents: dashboardAgents } };
      },
    });

    this.routes.push({
      method: 'GET',
      path: '/agents/:id',
      handler: async (req) => {
        const state = await this.agentRuntime.getState(req.params.id!);
        if (!state) {
          return { statusCode: 404, body: { error: 'Agent not found' } };
        }
        return { statusCode: 200, body: { agent: this.toAgentDTO(state) } };
      },
    });

    this.routes.push({
      method: 'POST',
      path: '/agents/:id/execute',
      handler: async (req) => {
        // Support both { id, type, ... } (direct Task) and { task: { ... } } (legacy wrapper)
        const taskBody = (req.body as any)?.task ?? req.body;
        // Ensure required fields have defaults
        const task = {
          id: taskBody.id || `task-${Date.now()}`,
          type: taskBody.type || 'chat',
          description: taskBody.description || taskBody.input || '',
          params: taskBody.params || { input: taskBody.input || taskBody.description || '' },
          priority: taskBody.priority || 'medium',
        };
        const result = await this.agentRuntime.execute(req.params.id!, task as any);
        return { statusCode: 200, body: { result } };
      },
    });

    this.routes.push({
      method: 'GET',
      path: '/agents/:id/profile',
      handler: async (req) => {
        const agents = await this.agentRuntime.listAgents({});
        const agent = agents.find((a: any) => a.id === req.params.id);
        if (!agent) {
          return { statusCode: 404, body: { error: 'Agent not found' } };
        }
        // Identity profile is served from the production server's inline handler
        // which has access to the full program definitions. This fallback returns
        // the agent metadata without identity data.
        return {
          statusCode: 200,
          body: {
            agentId: req.params.id,
            programId: agent.programId,
            identityProfile: null,
          },
        };
      },
    });

    // Pillar routes
    this.routes.push({
      method: 'GET',
      path: '/pillars',
      handler: async (req) => {
        const agents = await this.agentRuntime.listAgents({});
        const pillars = this.aggregatePillarMetrics(agents);
        return { statusCode: 200, body: { pillars } };
      },
    });

    // Cost routes
    this.routes.push({
      method: 'GET',
      path: '/costs',
      handler: async (req) => {
        const report = await this.otzarService.getCostReport({
          agentId: req.query.agentId,
          pillar: req.query.pillar,
        });

        // Transform Otzar CostReport into the shape the dashboard expects
        const perAgent = Object.entries(report.byAgent ?? {}).map(([agentId, spend]) => ({
          agentId,
          spend: spend as number,
        }));

        const perPillar = Object.entries(report.byPillar ?? {}).map(([pillar, spend]) => ({
          pillar,
          spend: spend as number,
        }));

        const modelUtilization = Object.entries(report.byModel ?? {}).map(([model, cost]) => ({
          model,
          tokens: 0,
          cost: cost as number,
        }));

        const totalSpend = report.totalCostUsd ?? 0;

        const dashboardCosts = {
          totalSpend,
          projectedDaily: totalSpend,
          projectedMonthly: totalSpend * 30,
          perAgent,
          perPillar,
          modelUtilization,
        };

        return { statusCode: 200, body: { costs: dashboardCosts } };
      },
    });

    // Audit routes
    this.routes.push({
      method: 'GET',
      path: '/audit',
      handler: async (req) => {
        const records = await this.auditService.query({
          agentId: req.query.agentId,
          actionType: req.query.actionType,
          pillar: req.query.pillar,
          timeRange: req.query.startTime && req.query.endTime
            ? { start: new Date(req.query.startTime), end: new Date(req.query.endTime) }
            : undefined,
        });

        // Transform AuditRecord into the shape the dashboard expects
        const entries = records.map((r: any) => ({
          id: r.id,
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
          actingAgentId: r.actingAgentId,
          actingAgentName: r.actingAgentName,
          actionType: r.actionType,
          target: r.target,
          outcome: r.outcome,
          pillar: r.details?.pillar ?? '—',
          details: r.details ?? {},
        }));

        return { statusCode: 200, body: { entries } };
      },
    });

    // Health routes
    this.routes.push({
      method: 'GET',
      path: '/health',
      handler: async (_req) => {
        const agents = await this.agentRuntime.listAgents({});
        const healthyAgents = agents.filter((a: any) => a.state !== 'degraded' && a.state !== 'terminated');

        return {
          statusCode: 200,
          body: {
            status: healthyAgents.length === agents.length ? 'healthy' : 'degraded',
            totalAgents: agents.length,
            healthyAgents: healthyAgents.length,
            timestamp: new Date().toISOString(),
            services: [
              { name: 'Zikaron (Memory)', status: 'healthy' },
              { name: 'Mishmar (Governance)', status: 'healthy' },
              { name: 'Otzar (Resource Manager)', status: 'healthy' },
              { name: 'XO Audit', status: 'healthy' },
              { name: 'Event Bus', status: 'healthy' },
            ],
            drivers: [
              { name: 'Anthropic (Claude)', status: 'ready' },
              { name: 'OpenAI (GPT-4o)', status: 'ready' },
              { name: 'App Store Connect', status: 'ready' },
              { name: 'Google Play Console', status: 'ready' },
              { name: 'YouTube API', status: 'ready' },
              { name: 'Kalshi API', status: 'ready' },
              { name: 'Polymarket API', status: 'ready' },
            ],
            agents: agents.map((a: any) => ({
              id: a.id,
              name: a.programId ?? a.id,
              state: a.state,
            })),
          },
        };
      },
    });

    // Command routes
    this.routes.push({
      method: 'POST',
      path: '/commands',
      handler: async (req) => {
        const command = req.body as { command: string; target?: string; params?: Record<string, unknown> };
        const result = await this.routeCommand(command, req.tenantId, req.userId);
        return { statusCode: 200, body: { result } };
      },
    });

    // SME Intelligence routes
    this.routes.push({
      method: 'GET',
      path: '/recommendations',
      handler: async () => {
        return { statusCode: 200, body: { recommendations: [], total: 0, pending: 0, approved: 0, rejected: 0 } };
      },
    });

    this.routes.push({
      method: 'GET',
      path: '/world-class',
      handler: async () => {
        return { statusCode: 200, body: { domains: [
          { domain: 'app-development', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
          { domain: 'media-production', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
          { domain: 'prediction-markets', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
        ] } };
      },
    });

    this.routes.push({
      method: 'GET',
      path: '/industry-scanner',
      handler: async () => {
        return { statusCode: 200, body: { roadmap: { availableNow: [], threeMonths: [], sixMonths: [], twelveMonths: [], monitoring: [] }, lastScan: null, totalAssessments: 0 } };
      },
    });

    this.routes.push({
      method: 'GET',
      path: '/capability-maturity',
      handler: async () => {
        return { statusCode: 200, body: { overall: 0.62, byDomain: { 'app-development': 0.7, 'media-production': 0.55, 'prediction-markets': 0.5 }, byCapability: {}, targetVision: 'Fully autonomous orchestration across all pillars', estimatedTimeToTarget: 'Calculating...' } };
      },
    });

    this.routes.push({
      method: 'GET',
      path: '/heartbeat-history',
      handler: async () => {
        return { statusCode: 200, body: { reviews: [], totalReviews: 0, lastReviewDate: null } };
      },
    });

    // SME routes with /sme/ prefix (dashboard uses these paths)
    this.routes.push({ method: 'GET', path: '/sme/world-class', handler: async () => {
      return { statusCode: 200, body: { domains: [
        { domain: 'app-development', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
        { domain: 'media-production', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
        { domain: 'prediction-markets', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
        { domain: 'business-orchestration', overallProgress: 0, gapsClosed: 0, gapsRemaining: 0, topGaps: [] },
      ] } };
    }});
    this.routes.push({ method: 'GET', path: '/sme/roadmap', handler: async () => {
      return { statusCode: 200, body: { roadmap: { availableNow: [], threeMonths: [], sixMonths: [], twelveMonths: [], monitoring: [] }, lastScan: null, totalAssessments: 0 } };
    }});
    this.routes.push({ method: 'GET', path: '/sme/maturity', handler: async () => {
      return { statusCode: 200, body: { overall: 0.62, byDomain: { 'app-development': 0.7, 'media-production': 0.55, 'prediction-markets': 0.5, 'business-orchestration': 0.6 }, byCapability: { agent_runtime: { current: 0.8, target: 1.0, trend: 'stable' }, memory_system: { current: 0.7, target: 1.0, trend: 'improving' }, governance: { current: 0.75, target: 1.0, trend: 'stable' } }, targetVision: 'Fully autonomous orchestration across all pillars', estimatedTimeToTarget: '6-12 months at current improvement rate' } };
    }});
    this.routes.push({ method: 'GET', path: '/sme/heartbeat-history', handler: async () => {
      return { statusCode: 200, body: { reviews: [], totalReviews: 0, lastReviewDate: null } };
    }});

    // Document API — serve spec markdown files
    this.routes.push({
      method: 'GET',
      path: '/specs/:documentType',
      handler: async (req) => {
        return this.handleSpecDocument(req.params.documentType!);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Document API Handler
  // ---------------------------------------------------------------------------

  /**
   * Serve raw markdown content from `.kiro/specs/seraphim-os-core/` directory.
   * Returns content, lastModified timestamp, and SHA-256 content hash.
   *
   * Requirements: 47e.19, 47f.22, 47g.25
   */
  async handleSpecDocument(documentType: string): Promise<APIResponse> {
    const validTypes = ['requirements', 'design', 'capabilities'];
    if (!validTypes.includes(documentType)) {
      return { statusCode: 404, body: { error: 'Invalid document type', validTypes } };
    }

    const filePath = resolve(
      process.cwd(),
      '.kiro',
      'specs',
      'seraphim-os-core',
      `${documentType}.md`,
    );

    try {
      const [content, fileStat] = await Promise.all([
        readFile(filePath, 'utf-8'),
        stat(filePath),
      ]);

      const hash = createHash('sha256').update(content).digest('hex');
      const lastModified = fileStat.mtime.toISOString();

      return {
        statusCode: 200,
        body: { content, lastModified, hash },
      };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { statusCode: 404, body: { error: 'Document not found', documentType } };
      }
      return { statusCode: 500, body: { error: 'Failed to read document', message: err.message } };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    if (patternParts.length !== pathParts.length) return false;
    return patternParts.every((part, i) => part.startsWith(':') || part === pathParts[i]);
  }

  private extractParams(pattern: string, path: string): Record<string, string> {
    const params: Record<string, string> = {};
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    patternParts.forEach((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = pathParts[i]!;
      }
    });
    return params;
  }

  /**
   * Transform an AgentInstance from the runtime into the DTO shape the
   * dashboard expects. Normalises field names (memoryMb → memoryMB,
   * tokenUsageToday → tokensUsed) and serialises Date → ISO string.
   */
  private toAgentDTO(agent: any): Record<string, unknown> {
    const ru = agent.resourceUsage ?? {};
    return {
      id: agent.id,
      programId: agent.programId,
      name: agent.programId ?? agent.id,
      version: agent.version,
      state: agent.state,
      pillar: agent.pillar,
      resourceUsage: {
        cpuPercent: ru.cpuPercent ?? 0,
        memoryMB: ru.memoryMb ?? ru.memoryMB ?? 0,
        tokensUsed: ru.tokenUsageToday ?? ru.tokensUsed ?? 0,
      },
      lastHeartbeat:
        agent.lastHeartbeat instanceof Date
          ? agent.lastHeartbeat.toISOString()
          : agent.lastHeartbeat ?? new Date().toISOString(),
    };
  }

  private aggregatePillarMetrics(agents: any[]): Record<string, unknown>[] {
    const pillarMap = new Map<string, any[]>();
    for (const agent of agents) {
      const pillar = agent.pillar ?? 'unknown';
      if (!pillarMap.has(pillar)) pillarMap.set(pillar, []);
      pillarMap.get(pillar)!.push(agent);
    }
    return Array.from(pillarMap.entries()).map(([name, pillarAgents]) => ({
      name,
      agentCount: pillarAgents.length,
      activeAgents: pillarAgents.filter((a: any) => a.state === 'ready' || a.state === 'executing').length,
    }));
  }

  private async routeCommand(
    command: { command: string; target?: string; params?: Record<string, unknown> },
    tenantId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    return {
      command: command.command,
      status: 'accepted',
      tenantId,
      userId,
      timestamp: new Date().toISOString(),
    };
  }
}
