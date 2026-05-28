/**
 * Shaar Dashboard — API Client
 *
 * REST client for Shaar API endpoints and WebSocket connection
 * for real-time updates (agent state changes, cost updates, alerts,
 * workflow progress, system health).
 *
 * All data displayed in the dashboard comes from these live endpoints.
 * No mock or placeholder data is used.
 *
 * Requirements: 9.1, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import { getAuthToken, reauthenticate } from './auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebSocketEventType =
  | 'agent.state.changed'
  | 'cost.updated'
  | 'alert.triggered'
  | 'workflow.progress'
  | 'system.health'
  | 'spec.document.updated';

export interface WebSocketMessage {
  type: WebSocketEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface AgentData {
  id: string;
  programId: string;
  version: string;
  state: 'initializing' | 'ready' | 'executing' | 'degraded' | 'terminated';
  pillar: string;
  resourceUsage: {
    cpuPercent: number;
    memoryMB: number;
    tokensUsed: number;
  };
  lastHeartbeat: string;
  name?: string;
}

export interface PillarData {
  name: string;
  agentCount: number;
  activeAgents: number;
}

export interface CostReport {
  perAgent: Array<{ agentId: string; spend: number }>;
  perPillar: Array<{ pillar: string; spend: number }>;
  modelUtilization: Array<{ model: string; tokens: number; cost: number }>;
  projectedDaily: number;
  projectedMonthly: number;
  totalSpend: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actingAgentId: string;
  actingAgentName: string;
  actionType: string;
  target: string;
  outcome: 'success' | 'failure' | 'blocked';
  pillar?: string;
  details: Record<string, unknown>;
}

export interface AuditQueryParams {
  agentId?: string;
  actionType?: string;
  pillar?: string;
  startTime?: string;
  endTime?: string;
}

export interface HealthData {
  status: string;
  totalAgents: number;
  healthyAgents: number;
  timestamp: string;
  services?: Array<{ name: string; status: string }>;
  drivers?: Array<{ name: string; status: string }>;
  agents?: Array<{ id: string; name: string; state: string }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  // In production (S3 hosting), use the API Gateway URL directly
  // In development (vite proxy), use relative path
  const apiGatewayUrl = (window as any).__SERAPHIM_API_URL__;
  if (apiGatewayUrl) return apiGatewayUrl;
  return window.location.origin + '/api';
}

function getWsUrl(): string {
  // Use the ALB WebSocket endpoint directly (same host as API)
  const apiUrl = (window as any).__SERAPHIM_API_URL__;
  if (apiUrl) {
    // Convert http://alb-host/api to ws://alb-host/ws
    const wsBase = apiUrl.replace(/\/api$/, '').replace(/^http/, 'ws');
    return `${wsBase}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

// ---------------------------------------------------------------------------
// REST API Client
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, query?: Record<string, string>): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = new URL(baseUrl + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  // ALB direct access doesn't require auth; API Gateway does
  const isDirectALB = baseUrl.includes('elb.amazonaws.com');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!isDirectALB) {
    const token = await getAuthToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(8000),
    });

  // On 401, trigger re-authentication and retry once
  if (response.status === 401 && !isDirectALB) {
    const newToken = await reauthenticate();
    const retryResponse = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newToken}`,
      },
    });

    if (!retryResponse.ok) {
      throw new Error(`API error ${retryResponse.status}: ${retryResponse.statusText}`);
    }

    return retryResponse.json() as Promise<T>;
  }

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  const data = response.json() as Promise<T>;
  return data;
  } catch (err) {
    // No mock data — surface the error so the UI shows "connecting" state
    console.warn(`[api] ${path} unreachable:`, (err as Error).message);
    throw err;
  }
}

/** Fetch all agents from GET /agents */
export async function fetchAgents(): Promise<AgentData[]> {
  const result = await apiFetch<{ agents: AgentData[] }>('/agents');
  return result.agents;
}

/** Fetch a single agent from GET /agents/:id */
export async function fetchAgent(id: string): Promise<AgentData> {
  const result = await apiFetch<{ agent: AgentData }>(`/agents/${encodeURIComponent(id)}`);
  return result.agent;
}

/** Fetch pillar metrics from GET /pillars */
export async function fetchPillars(): Promise<PillarData[]> {
  const result = await apiFetch<{ pillars: PillarData[] }>('/pillars');
  return result.pillars;
}

/** Fetch cost report from GET /costs */
export async function fetchCosts(query?: { agentId?: string; pillar?: string }): Promise<CostReport> {
  const result = await apiFetch<{ costs: CostReport }>('/costs', query as Record<string, string>);
  return result.costs;
}

/** Fetch audit entries from GET /audit */
export async function fetchAudit(params?: AuditQueryParams): Promise<AuditEntry[]> {
  const result = await apiFetch<{ entries: AuditEntry[] }>('/audit', params as Record<string, string>);
  return result.entries;
}

/** Fetch system health from GET /health */
export async function fetchHealth(): Promise<HealthData> {
  const result = await apiFetch<HealthData>('/health');
  return result;
}

// ---------------------------------------------------------------------------
// Reference Ingestion Types & Fetchers
// ---------------------------------------------------------------------------

export interface ReferenceData {
  id: string;
  domain: string;
  sourceUrl: string;
  title: string;
  status: 'pending' | 'ingesting' | 'analyzed' | 'baselined' | 'failed';
  ingestedAt: string;
  analysisCompletedAt?: string;
  dimensions: string[];
  confidence: number;
}

export interface BaselineData {
  id: string;
  domain: string;
  version: number;
  dimensions: Array<{ name: string; score: number; weight: number }>;
  confidence: number;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QualityGateResult {
  id: string;
  agentId: string;
  domain: string;
  evaluatedAt: string;
  passed: boolean;
  overallScore: number;
  threshold: number;
  dimensionScores: Array<{ dimension: string; score: number; passed: boolean }>;
  baselineVersion: number;
}

/** Fetch ingested references from GET /references */
export async function fetchReferences(): Promise<ReferenceData[]> {
  const result = await apiFetch<{ references: ReferenceData[] }>('/references');
  return result.references;
}

/** Fetch current baselines from GET /baselines */
export async function fetchBaselines(): Promise<BaselineData[]> {
  const result = await apiFetch<{ baselines: BaselineData[] }>('/baselines');
  return result.baselines;
}

/** Fetch quality gate results from GET /quality-gate/results */
export async function fetchQualityGateResults(): Promise<QualityGateResult[]> {
  const result = await apiFetch<{ results: QualityGateResult[] }>('/quality-gate/results');
  return result.results;
}

/** Response shape from GET /api/specs/:documentType */
export interface SpecDocumentResponse {
  content: string;
  lastModified: string;
  hash: string;
}

/** Valid spec document types */
export type SpecDocumentType = 'requirements' | 'design' | 'capabilities';

/** Fetch a spec document from GET /specs/:documentType */
export async function fetchSpecDocument(documentType: SpecDocumentType): Promise<SpecDocumentResponse> {
  return apiFetch<SpecDocumentResponse>(`/specs/${encodeURIComponent(documentType)}`);
}

// ---------------------------------------------------------------------------
// WebSocket Client
// ---------------------------------------------------------------------------

export type WebSocketEventHandler = (message: WebSocketMessage) => void;

export class DashboardWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<WebSocketEventType, Set<WebSocketEventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private connected = false;

  /** Open the WebSocket connection. Automatically reconnects on disconnect. */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(getWsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        this.dispatch(message);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.connected = false;
    };
  }

  /** Close the WebSocket connection and stop reconnecting. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /** Subscribe to a specific WebSocket event type. */
  on(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  /** Unsubscribe from a specific WebSocket event type. */
  off(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  /** Whether the WebSocket is currently connected. */
  isConnected(): boolean {
    return this.connected;
  }

  private dispatch(message: WebSocketMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch {
          // Prevent one handler from breaking others
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }
}


// ---------------------------------------------------------------------------
// App Development Endpoints (Phase 10 wiring)
// ---------------------------------------------------------------------------

export interface AppDevProject {
  projectId: string;
  name: string;
  description?: string;
  platform: 'ios' | 'android' | 'both';
  status: string;
  fileCount?: number;
  createdAt?: string;
}

export interface AppDevFileEntry {
  path: string;
  size?: number;
}

export interface AppDevHealth {
  status: 'healthy' | 'degraded';
  hooks: { total: number; enabled: number; killSwitchOn: boolean };
  watcher: { healthy: boolean };
  recentErrorRate: number;
  checkedAt: string;
}

export interface AppDevHookMetric {
  hookId: string;
  invocations: number;
  successes: number;
  failures: number;
  avgDurationMs: number;
  lastFailureAt?: string;
  lastError?: string;
}

export interface AppDevEscalation {
  id: string;
  projectId: string;
  hookId: string;
  reason: string;
  status: 'open' | 'self_healing' | 'resolved' | 'operator_required';
  createdAt: string;
  resolvedAt?: string;
  notes?: string;
}

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = baseUrl + path;
  const isDirectALB = baseUrl.includes('elb.amazonaws.com');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isDirectALB) {
    const token = await getAuthToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (response.status === 401 && !isDirectALB) {
    const newToken = await reauthenticate();
    const retry = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newToken}` },
      body: JSON.stringify(body),
    });
    if (!retry.ok) throw new Error(`POST ${path} failed: ${retry.status}`);
    return retry.json() as Promise<T>;
  }
  if (!response.ok) throw new Error(`POST ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

/** POST /app-dev/projects — create a workspace + DB record. */
export async function createAppDevProject(input: {
  name: string;
  description?: string;
  platform?: 'ios' | 'android' | 'both';
}): Promise<AppDevProject> {
  return apiPost<AppDevProject>('/app-dev/projects', input as Record<string, unknown>);
}

/** GET /app-dev/projects/:id — restore session. */
export async function getAppDevProject(projectId: string): Promise<AppDevProject> {
  return apiFetch<AppDevProject>(`/app-dev/projects/${encodeURIComponent(projectId)}`);
}

/** GET /app-dev/projects/:id/files — render file tree. */
export async function listAppDevFiles(projectId: string): Promise<{ projectId: string; files: string[]; count: number }> {
  return apiFetch<{ projectId: string; files: string[]; count: number }>(
    `/app-dev/projects/${encodeURIComponent(projectId)}/files`,
  );
}

/** POST /app-dev/projects/:id/build — kick a build (requires human-origin auth). */
export async function startBuild(
  projectId: string,
  body: { platform: 'ios' | 'android'; autoSubmit?: boolean },
): Promise<{ buildId: string; status: string; message: string }> {
  return apiPost(`/app-dev/projects/${encodeURIComponent(projectId)}/build`, body as Record<string, unknown>);
}

/** POST /app-dev/projects/:id/auto-submit-and-watch — ship a finished build. */
export async function autoSubmitAndWatch(
  projectId: string,
  body: { platform: 'ios' | 'android'; easBuildId: string; androidTrack?: string },
): Promise<{ status: string; watcher: string; message: string }> {
  return apiPost(`/app-dev/projects/${encodeURIComponent(projectId)}/auto-submit-and-watch`, body as Record<string, unknown>);
}

/** GET /app-dev/health — pipeline health for the dashboard. */
export async function fetchAppDevHealth(): Promise<AppDevHealth> {
  return apiFetch<AppDevHealth>('/app-dev/health');
}

/** GET /app-dev/metrics — per-hook counters. */
export async function fetchAppDevMetrics(): Promise<{ hooks: AppDevHookMetric[]; recentErrorRate: number; collectedAt: string }> {
  return apiFetch<{ hooks: AppDevHookMetric[]; recentErrorRate: number; collectedAt: string }>('/app-dev/metrics');
}

/** GET /app-dev/escalations — list unresolved escalations for operator panel. */
export async function fetchAppDevEscalations(status?: string): Promise<{ count: number; escalations: AppDevEscalation[] }> {
  const params = status ? { status } : undefined;
  return apiFetch<{ count: number; escalations: AppDevEscalation[] }>('/app-dev/escalations', params);
}

/**
 * Stream code generation via SSE.
 *
 * The browser EventSource API doesn't support custom headers, so we use fetch
 * with manual streaming + ReadableStream parsing to attach the bearer token.
 *
 * Returns an AbortController so the caller can cancel a long-running stream.
 */
export interface SSEStreamCallbacks {
  onToken?: (text: string) => void;
  onFileStart?: (path: string) => void;
  onFileEnd?: (path: string) => void;
  onComplete?: (files: string[]) => void;
  onError?: (message: string) => void;
  /** Backend narration event — phase, message, and optional details. */
  onPhase?: (event: {
    phase: string;
    message: string;
    timestamp: string;
    [key: string]: unknown;
  }) => void;
}

export async function streamGenerateCode(
  projectId: string,
  prompt: string,
  callbacks: SSEStreamCallbacks,
): Promise<AbortController> {
  // Use console.log so every stage is visible in the browser devtools too.
  // These breadcrumbs are the single source of truth when chat narration
  // doesn't appear — they tell us exactly which stage of the SSE stream
  // pipeline broke.
  const log = (msg: string, extra?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log(`[stream] ${msg}`, extra ?? '');
  };

  log('streamGenerateCode start', { projectId, promptLength: prompt.length });
  const baseUrl = getBaseUrl();
  const isDirectALB = baseUrl.includes('elb.amazonaws.com');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };
  if (!isDirectALB) {
    log('streamGenerateCode fetching auth token');
    try {
      const token = await getAuthToken();
      headers['Authorization'] = `Bearer ${token}`;
      log('streamGenerateCode auth token attached', { tokenLength: token.length });
    } catch (err) {
      log('streamGenerateCode auth token failed', { error: (err as Error).message });
      callbacks.onError?.(`auth token failed: ${(err as Error).message}`);
      return new AbortController();
    }
  }

  const abort = new AbortController();
  const url = baseUrl + `/app-dev/projects/${encodeURIComponent(projectId)}/generate`;
  log('streamGenerateCode POST', { url });
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
      signal: abort.signal,
    });
  } catch (err) {
    log('streamGenerateCode fetch threw', { error: (err as Error).message });
    callbacks.onError?.(`fetch threw: ${(err as Error).message}`);
    return abort;
  }
  log('streamGenerateCode fetch returned', { status: response.status, hasBody: !!response.body });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    log('streamGenerateCode non-2xx', { status: response.status, body: text.slice(0, 200) });
    callbacks.onError?.(`generate failed: ${response.status} ${text.slice(0, 200)}`);
    return abort;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const json = line.slice('data:'.length).trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json) as { type: string;[k: string]: unknown };
            switch (evt.type) {
              case 'phase':
                callbacks.onPhase?.({
                  phase: (evt['phase'] as string) ?? 'unknown',
                  message: (evt['message'] as string) ?? '',
                  timestamp: (evt['timestamp'] as string) ?? new Date().toISOString(),
                  ...evt,
                });
                break;
              case 'token':
                callbacks.onToken?.(evt['content'] as string);
                break;
              case 'file_start':
                callbacks.onFileStart?.(evt['path'] as string);
                break;
              case 'file_end':
                callbacks.onFileEnd?.(evt['path'] as string);
                break;
              case 'done':
                callbacks.onComplete?.((evt['files'] as string[]) ?? []);
                break;
              case 'error':
                callbacks.onError?.((evt['message'] as string) ?? 'unknown');
                break;
            }
          } catch {
            /* ignore malformed line */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError?.((err as Error).message);
      }
    }
  })();

  return abort;
}


// ---------------------------------------------------------------------------
// Project list + file read/write (VibeCode-parity rewrite)
// ---------------------------------------------------------------------------

export interface AppDevProjectListEntry {
  projectId: string;
  fileCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  name?: string;
  prompt?: string;
}

/** GET /app-dev/projects — every workspace this server knows about. */
export async function listAppDevProjects(): Promise<{ count: number; projects: AppDevProjectListEntry[] }> {
  return apiFetch<{ count: number; projects: AppDevProjectListEntry[] }>('/app-dev/projects');
}

/** GET /app-dev/projects/:id/file?path=... — read a workspace file. */
export async function readAppDevFile(
  projectId: string,
  path: string,
): Promise<{ projectId: string; path: string; content: string }> {
  return apiFetch<{ projectId: string; path: string; content: string }>(
    `/app-dev/projects/${encodeURIComponent(projectId)}/file`,
    { path },
  );
}

/** PUT /app-dev/projects/:id/file?path=... — save edits back to the workspace. */
export async function writeAppDevFile(
  projectId: string,
  path: string,
  content: string,
): Promise<{ projectId: string; path: string; bytesWritten: number; warnings: unknown[] }> {
  const baseUrl = getBaseUrl();
  const isDirectALB = baseUrl.includes('elb.amazonaws.com');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isDirectALB) {
    const token = await getAuthToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = new URL(baseUrl + `/app-dev/projects/${encodeURIComponent(projectId)}/file`);
  url.searchParams.set('path', path);

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ content }),
  });

  if (response.status === 401 && !isDirectALB) {
    const newToken = await reauthenticate();
    const retry = await fetch(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${newToken}` },
      body: JSON.stringify({ content }),
    });
    if (!retry.ok) throw new Error(`PUT file failed: ${retry.status}`);
    return retry.json();
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PUT file failed: ${response.status} ${text}`);
  }
  return response.json();
}


// ---------------------------------------------------------------------------
// Snack preview — bundle workspace and return embed URL
// ---------------------------------------------------------------------------

export interface SnackPreview {
  projectId: string;
  snackId: string;
  url: string;
  embedUrl: string;
  fileCount: number;
}

/** POST /app-dev/projects/:id/preview — create or refresh the live Snack preview. */
export async function createPreview(projectId: string): Promise<SnackPreview> {
  const baseUrl = getBaseUrl();
  const isDirectALB = baseUrl.includes('elb.amazonaws.com');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isDirectALB) {
    const token = await getAuthToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = baseUrl + `/app-dev/projects/${encodeURIComponent(projectId)}/preview`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Preview create failed: ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json();
}
