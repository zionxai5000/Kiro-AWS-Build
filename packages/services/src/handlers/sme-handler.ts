/**
 * SME (Subject Matter Expert) Lambda Event Handler — processes SME events
 * from SQS queue.
 *
 * Handles:
 * - `sme.heartbeat.completed`: trigger expertise profile updates, trigger
 *   Kiro steering file regeneration
 * - `sme.heartbeat.started`: log heartbeat initiation
 * - `sme.heartbeat.failed`: log failure, publish alert
 * - `sme.recommendation.approved`: trigger execution task creation
 * - `sme.recommendation.rejected`: store rejection in Zikaron for learning
 * - `sme.industry.scan_completed`: feed scan results into heartbeat research
 * - `sme.self_improvement.triggered`: trigger weekly self-improvement cycle
 * - `sme.recommendation.escalated`: forward escalation to Shaar dashboard
 *
 * Follows the same pattern as the learning handler: SQS Lambda handler with
 * idempotency and partial batch failure reporting.
 *
 * Requirements: 21.1, 21.7, 22.3, 24.5, 25.1
 */

import type { EventBusService, ZikaronService } from '@seraphim/core';
import type { HeartbeatScheduler } from '../sme/heartbeat-scheduler.js';
import type { RecommendationEngine } from '../sme/recommendation-engine.js';
import type { IndustryScanner } from '../sme/industry-scanner.js';
import type { SelfImprovementEngine } from '../sme/self-improvement-engine.js';
import type { KiroIntegrationService } from '../kiro/integration-service.js';

// ---------------------------------------------------------------------------
// SQS Lambda Types
// ---------------------------------------------------------------------------

export interface SQSRecord {
  messageId: string;
  body: string;
}

export interface SQSEvent {
  Records: SQSRecord[];
}

export interface SQSBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

// ---------------------------------------------------------------------------
// SME Event Types
// ---------------------------------------------------------------------------

export type SMEEventType =
  | 'sme.heartbeat.started'
  | 'sme.heartbeat.completed'
  | 'sme.heartbeat.failed'
  | 'sme.recommendation.approved'
  | 'sme.recommendation.rejected'
  | 'sme.recommendation.escalated'
  | 'sme.industry.scan_completed'
  | 'sme.self_improvement.triggered';

export interface SMEEvent {
  id: string;
  type: SMEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SMEHandlerConfig {
  eventBus: EventBusService;
  zikaron: ZikaronService;
  heartbeatScheduler: HeartbeatScheduler;
  recommendationEngine: RecommendationEngine;
  industryScanner: IndustryScanner;
  selfImprovementEngine: SelfImprovementEngine;
  kiroIntegration: KiroIntegrationService;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Handler Class
// ---------------------------------------------------------------------------

export class SMEEventHandler {
  private readonly processedIds: Set<string>;
  private readonly eventBus: EventBusService;
  private readonly zikaron: ZikaronService;
  private readonly heartbeatScheduler: HeartbeatScheduler;
  private readonly recommendationEngine: RecommendationEngine;
  private readonly industryScanner: IndustryScanner;
  private readonly selfImprovementEngine: SelfImprovementEngine;
  private readonly kiroIntegration: KiroIntegrationService;

  constructor(config: SMEHandlerConfig) {
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
    this.heartbeatScheduler = config.heartbeatScheduler;
    this.recommendationEngine = config.recommendationEngine;
    this.industryScanner = config.industryScanner;
    this.selfImprovementEngine = config.selfImprovementEngine;
    this.kiroIntegration = config.kiroIntegration;
    this.processedIds = config.processedEventIds ?? new Set<string>();
  }

  async handle(event: SMEEvent): Promise<void> {
    // Idempotency check
    if (this.processedIds.has(event.id)) return;
    this.processedIds.add(event.id);

    switch (event.type) {
      case 'sme.heartbeat.started':
        await this.handleHeartbeatStarted(event);
        break;
      case 'sme.heartbeat.completed':
        await this.handleHeartbeatCompleted(event);
        break;
      case 'sme.heartbeat.failed':
        await this.handleHeartbeatFailed(event);
        break;
      case 'sme.recommendation.approved':
        await this.handleRecommendationApproved(event);
        break;
      case 'sme.recommendation.rejected':
        await this.handleRecommendationRejected(event);
        break;
      case 'sme.recommendation.escalated':
        await this.handleRecommendationEscalated(event);
        break;
      case 'sme.industry.scan_completed':
        await this.handleIndustryScanCompleted(event);
        break;
      case 'sme.self_improvement.triggered':
        await this.handleSelfImprovementTriggered(event);
        break;
    }
  }

  /**
   * Handle heartbeat started: log initiation event.
   *
   * Requirement 21.1: Scheduled heartbeat review per sub-agent
   */
  private async handleHeartbeatStarted(event: SMEEvent): Promise<void> {
    const agentId = event.data.agentId as string;

    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'sme.heartbeat.acknowledged',
      detail: {
        agentId,
        startedAt: event.timestamp,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle heartbeat completed: trigger expertise profile updates and
   * Kiro steering file regeneration.
   *
   * Requirements: 21.7, 22.3
   */
  private async handleHeartbeatCompleted(event: SMEEvent): Promise<void> {
    const agentId = event.data.agentId as string;
    const reviewId = event.data.reviewId as string;

    // Trigger Kiro steering file regeneration
    await this.kiroIntegration.updateSteeringFromExpertise(agentId);

    // Publish dashboard update event for Shaar
    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'dashboard.sme.heartbeat_completed',
      detail: {
        agentId,
        reviewId,
        completedAt: event.timestamp,
        recommendations: event.data.recommendationCount ?? 0,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle heartbeat failed: log failure and publish alert.
   *
   * Requirement 21.1: Heartbeat monitoring
   */
  private async handleHeartbeatFailed(event: SMEEvent): Promise<void> {
    const agentId = event.data.agentId as string;
    const error = event.data.error as string;

    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'alert.sme.heartbeat_failed',
      detail: {
        severity: 'high',
        title: `Heartbeat Failed: ${agentId}`,
        message: `Heartbeat review failed for agent ${agentId}: ${error}`,
        agentId,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle recommendation approved: create execution task and dispatch.
   *
   * Requirement 22.3: Recommendation approval workflow
   */
  private async handleRecommendationApproved(event: SMEEvent): Promise<void> {
    const recommendationId = event.data.recommendationId as string;

    const executionTask = await this.recommendationEngine.approve(recommendationId);

    // Publish to Shaar for real-time dashboard update
    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'dashboard.sme.recommendation_approved',
      detail: {
        recommendationId,
        executionTaskId: executionTask.id,
        agentId: executionTask.agentId,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle recommendation rejected: store in Zikaron for agent learning.
   *
   * Requirement 22.3: Rejection feedback loop
   */
  private async handleRecommendationRejected(event: SMEEvent): Promise<void> {
    const recommendationId = event.data.recommendationId as string;
    const reason = (event.data.reason as string) ?? 'No reason provided';

    await this.recommendationEngine.reject(recommendationId, reason);

    // Publish to Shaar for real-time dashboard update
    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'dashboard.sme.recommendation_rejected',
      detail: {
        recommendationId,
        reason,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle recommendation escalated: forward to Shaar dashboard.
   *
   * Requirement 22.3: Escalation of stale recommendations
   */
  private async handleRecommendationEscalated(event: SMEEvent): Promise<void> {
    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'dashboard.sme.recommendation_escalated',
      detail: {
        recommendationId: event.data.recommendationId,
        agentId: event.data.agentId,
        domain: event.data.domain,
        priority: event.data.priority,
        pendingHours: event.data.pendingHours,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle industry scan completed: feed scan results into the next
   * heartbeat research cycle by updating the scanner's roadmap.
   *
   * Requirement 24.5: Industry Scanner feeds into heartbeat research
   */
  private async handleIndustryScanCompleted(event: SMEEvent): Promise<void> {
    // Update the technology roadmap from latest scan results
    await this.industryScanner.updateRoadmap();

    // Publish to Shaar for real-time dashboard update
    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'dashboard.sme.industry_scan_completed',
      detail: {
        scanId: event.data.scanId,
        discoveriesCount: event.data.discoveriesCount ?? 0,
        assessmentsCount: event.data.assessmentsCount ?? 0,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle self-improvement triggered: execute weekly self-improvement cycle.
   *
   * Requirement 25.1: Weekly self-improvement assessment
   */
  private async handleSelfImprovementTriggered(event: SMEEvent): Promise<void> {
    // Execute self-assessment
    const assessment = await this.selfImprovementEngine.executeSelfAssessment();

    // Generate improvement proposals from assessment
    const proposals = await this.selfImprovementEngine.generateProposals(assessment);

    // Publish to Shaar for real-time dashboard update
    await this.eventBus.publish({
      source: 'seraphim.sme-handler',
      type: 'dashboard.sme.self_improvement_completed',
      detail: {
        assessmentId: assessment.id,
        proposalCount: proposals.length,
        systemMetrics: assessment.systemMetrics,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// SQS Lambda Handler Factory
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for SME events.
 *
 * Each SQS record body is expected to be a JSON-serialized SMEEvent.
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 *
 * Requirements: 21.1, 21.7, 22.3, 24.5, 25.1
 */
export function createSMEHandler(config: SMEHandlerConfig) {
  const handler = new SMEEventHandler(config);

  return async (sqsEvent: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of sqsEvent.Records) {
      try {
        const smeEvent = parseSMEEvent(record.body);
        await handler.handle(smeEvent);
      } catch (error) {
        console.error(
          `[sme-handler] Failed to process record ${record.messageId}:`,
          error instanceof Error ? error.message : error,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}

// ---------------------------------------------------------------------------
// Heartbeat Runtime Integration
// ---------------------------------------------------------------------------

/**
 * Integrates HeartbeatScheduler with the Agent Runtime by triggering
 * heartbeat reviews on schedule for each active sub-agent and publishing
 * lifecycle events to the Event Bus.
 *
 * Requirements: 21.1, 21.7
 */
export class HeartbeatRuntimeIntegration {
  private readonly heartbeatScheduler: HeartbeatScheduler;
  private readonly eventBus: EventBusService;
  private readonly industryScanner: IndustryScanner;
  private readonly selfImprovementEngine: SelfImprovementEngine;
  private readonly timers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: {
    heartbeatScheduler: HeartbeatScheduler;
    eventBus: EventBusService;
    industryScanner: IndustryScanner;
    selfImprovementEngine: SelfImprovementEngine;
  }) {
    this.heartbeatScheduler = config.heartbeatScheduler;
    this.eventBus = config.eventBus;
    this.industryScanner = config.industryScanner;
    this.selfImprovementEngine = config.selfImprovementEngine;
  }

  /**
   * Start scheduled heartbeat reviews for a sub-agent.
   * Publishes sme.heartbeat.started, sme.heartbeat.completed, or
   * sme.heartbeat.failed events to the Event Bus.
   *
   * Requirement 21.1: Scheduled heartbeat review per sub-agent
   */
  async startHeartbeat(agentId: string): Promise<void> {
    const config = await this.heartbeatScheduler.getConfig(agentId);
    if (!config.enabled) return;

    // Clear any existing timer
    this.stopHeartbeat(agentId);

    const timer = setInterval(async () => {
      await this.triggerHeartbeat(agentId);
    }, config.intervalMs);

    this.timers.set(agentId, timer);
  }

  /**
   * Trigger a single heartbeat review for a sub-agent.
   * Publishes lifecycle events to the Event Bus.
   */
  async triggerHeartbeat(agentId: string): Promise<void> {
    const correlationId = `heartbeat-${agentId}-${Date.now()}`;

    // Publish started event
    await this.eventBus.publish({
      source: 'seraphim.heartbeat-runtime',
      type: 'sme.heartbeat.started',
      detail: { agentId },
      metadata: {
        tenantId: 'system',
        correlationId,
        timestamp: new Date(),
      },
    });

    try {
      const result = await this.heartbeatScheduler.triggerReview(agentId);

      // Publish completed event
      await this.eventBus.publish({
        source: 'seraphim.heartbeat-runtime',
        type: 'sme.heartbeat.completed',
        detail: {
          agentId,
          reviewId: result.id,
          domain: result.domain,
          recommendationCount: result.recommendations.length,
          durationMs: result.durationMs,
          costUsd: result.costUsd,
          confidenceScore: result.confidenceScore,
        },
        metadata: {
          tenantId: 'system',
          correlationId,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      // Publish failed event
      await this.eventBus.publish({
        source: 'seraphim.heartbeat-runtime',
        type: 'sme.heartbeat.failed',
        detail: {
          agentId,
          error: error instanceof Error ? error.message : String(error),
        },
        metadata: {
          tenantId: 'system',
          correlationId,
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Stop scheduled heartbeat reviews for a sub-agent.
   */
  stopHeartbeat(agentId: string): void {
    const timer = this.timers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(agentId);
    }
  }

  /**
   * Stop all scheduled heartbeat reviews.
   */
  stopAll(): void {
    for (const [agentId] of this.timers) {
      this.stopHeartbeat(agentId);
    }
  }

  /**
   * Get list of agents with active heartbeat schedules.
   */
  getActiveAgents(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * Wire Industry Scanner to Heartbeat Scheduler so scan results feed
   * into the next heartbeat research cycle.
   *
   * Requirement 24.5: Industry Scanner feeds into heartbeat
   */
  async triggerIndustryScan(): Promise<void> {
    const correlationId = `industry-scan-${Date.now()}`;

    try {
      const scanResult = await this.industryScanner.executeScan();

      await this.eventBus.publish({
        source: 'seraphim.heartbeat-runtime',
        type: 'sme.industry.scan_completed',
        detail: {
          scanId: scanResult.id,
          discoveriesCount: scanResult.discoveries.length,
          assessmentsCount: scanResult.assessments.length,
        },
        metadata: {
          tenantId: 'system',
          correlationId,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      await this.eventBus.publish({
        source: 'seraphim.heartbeat-runtime',
        type: 'alert.sme.industry_scan_failed',
        detail: {
          severity: 'medium',
          title: 'Industry Scan Failed',
          message: error instanceof Error ? error.message : String(error),
        },
        metadata: {
          tenantId: 'system',
          correlationId,
          timestamp: new Date(),
        },
      });
    }
  }

  /**
   * Wire Self-Improvement Engine to weekly scheduler trigger.
   *
   * Requirement 25.1: Weekly self-improvement assessment
   */
  async triggerSelfImprovement(): Promise<void> {
    const correlationId = `self-improvement-${Date.now()}`;

    await this.eventBus.publish({
      source: 'seraphim.heartbeat-runtime',
      type: 'sme.self_improvement.triggered',
      detail: {
        triggeredAt: new Date().toISOString(),
      },
      metadata: {
        tenantId: 'system',
        correlationId,
        timestamp: new Date(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSMEEvent(body: string): SMEEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON in SQS record body');
  }

  const event = parsed as SMEEvent;
  if (!event.id || !event.type || !event.data) {
    throw new Error('SQS record body missing required SMEEvent fields (id, type, data)');
  }

  return event;
}
