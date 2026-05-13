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
