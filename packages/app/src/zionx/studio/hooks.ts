/**
 * ZionX App Development Studio — Hook Integration for Studio Lifecycle
 *
 * Emits lifecycle hooks to the Event Bus for all major studio events.
 * Handles gate failure remediation by identifying the responsible sub-agent,
 * creating rework tasks, and re-running gates after remediation.
 * Handles submission readiness by requesting King approval via Mishmar.
 * Integrates with WebSocket for real-time dashboard updates.
 *
 * Requirements: 42l.38, 42l.39, 42l.40
 */

// ---------------------------------------------------------------------------
// Hook Types
// ---------------------------------------------------------------------------

export type StudioHookName =
  | 'app.idea.created'
  | 'app.code.changed'
  | 'app.preview.updated'
  | 'app.screenflow.changed'
  | 'app.ios.build.created'
  | 'app.android.build.created'
  | 'app.assets.requested'
  | 'app.marketing.state.entered'
  | 'app.store.gate.failed'
  | 'app.submission.ready';

export interface StudioHookPayload {
  sessionId: string;
  timestamp: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface EventBusPublisher {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

export interface WebSocketNotifier {
  notify(
    sessionId: string,
    event: { type: string; payload: Record<string, unknown> },
  ): void;
}

export interface ReworkTaskCreator {
  createReworkTask(
    sessionId: string,
    agentId: string,
    failureDetails: Record<string, unknown>,
  ): Promise<string>;
}

export interface ApprovalRequester {
  requestApproval(
    sessionId: string,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Gate Failure Context
// ---------------------------------------------------------------------------

export interface GateFailureContext {
  gateId: string;
  agentId: string;
  failureDetails: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Agent Mapping for Gate Failures
// ---------------------------------------------------------------------------

const GATE_TO_AGENT_MAP: Record<string, string> = {
  'apple-metadata': 'apple-release-agent',
  'apple-screenshots': 'store-asset-agent',
  'apple-privacy': 'apple-release-agent',
  'apple-iap': 'apple-release-agent',
  'google-metadata': 'google-play-release-agent',
  'google-screenshots': 'store-asset-agent',
  'google-feature-graphic': 'store-asset-agent',
  'google-content-rating': 'google-play-release-agent',
  'asset-validation': 'store-asset-agent',
  'code-quality': 'code-agent',
  'testing': 'testing-agent',
};

// ---------------------------------------------------------------------------
// Studio Hook Service Interface
// ---------------------------------------------------------------------------

export interface StudioHookService {
  emit(hookName: StudioHookName, payload: StudioHookPayload): Promise<void>;
  handleGateFailure(
    sessionId: string,
    gateId: string,
    agentId: string,
    failureDetails: Record<string, unknown>,
  ): Promise<{ reworkTaskId: string }>;
  handleSubmissionReady(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultStudioHookService implements StudioHookService {
  private static readonly EVENT_SOURCE = 'zionx.studio';

  constructor(
    private readonly eventBus: EventBusPublisher,
    private readonly wsNotifier: WebSocketNotifier,
    private readonly reworkCreator: ReworkTaskCreator,
    private readonly approvalRequester: ApprovalRequester,
  ) {}

  /**
   * Emit a studio lifecycle hook to the Event Bus and notify via WebSocket.
   */
  async emit(hookName: StudioHookName, payload: StudioHookPayload): Promise<void> {
    // Publish to Event Bus
    await this.eventBus.publish({
      source: DefaultStudioHookService.EVENT_SOURCE,
      type: hookName,
      detail: { ...payload },
    });

    // Notify via WebSocket for real-time dashboard updates
    this.wsNotifier.notify(payload.sessionId, {
      type: hookName,
      payload: { ...payload },
    });
  }

  /**
   * Handle a store gate failure:
   * 1. Identify the responsible sub-agent (from gateId or explicit agentId)
   * 2. Create a rework task for that agent
   * 3. Emit the app.store.gate.failed hook
   */
  async handleGateFailure(
    sessionId: string,
    gateId: string,
    agentId: string,
    failureDetails: Record<string, unknown>,
  ): Promise<{ reworkTaskId: string }> {
    // Resolve the responsible agent — prefer explicit agentId, fall back to gate mapping
    const resolvedAgentId = agentId || GATE_TO_AGENT_MAP[gateId] || 'unknown-agent';

    // Create a rework task for the responsible agent
    const reworkTaskId = await this.reworkCreator.createReworkTask(
      sessionId,
      resolvedAgentId,
      failureDetails,
    );

    // Emit the gate failure hook
    await this.emit('app.store.gate.failed', {
      sessionId,
      timestamp: Date.now(),
      gateId,
      agentId: resolvedAgentId,
      reworkTaskId,
      failureDetails,
    });

    return { reworkTaskId };
  }

  /**
   * Handle submission readiness:
   * 1. Request King approval via Mishmar
   * 2. Emit the app.submission.ready hook
   */
  async handleSubmissionReady(sessionId: string): Promise<void> {
    // Request approval from King via Mishmar governance
    await this.approvalRequester.requestApproval(sessionId, 'app.submission', {
      sessionId,
      requestedAt: Date.now(),
    });

    // Emit the submission ready hook
    await this.emit('app.submission.ready', {
      sessionId,
      timestamp: Date.now(),
    });
  }
}
