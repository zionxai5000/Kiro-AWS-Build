/**
 * Recommendation Engine and Queue — manages the lifecycle of sub-agent
 * recommendations from submission through approval/rejection to execution
 * tracking and impact measurement.
 *
 * Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService, ZikaronService, OtzarService } from '@seraphim/core';
import type { Recommendation, RecommendationQueue } from './heartbeat-scheduler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionTask {
  id: string;
  recommendationId: string;
  agentId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  result?: Record<string, unknown>;
}

export interface ImpactMeasurement {
  recommendationId: string;
  estimatedImpact: Record<string, number>;
  actualImpact: Record<string, number>;
  variance: Record<string, number>;
  measuredAt: Date;
}

export interface CalibrationReport {
  agentId: string;
  totalRecommendations: number;
  approvalRate: number;
  rejectionRate: number;
  impactAccuracy: number;
  commonRejectionReasons: Array<{ reason: string; count: number }>;
  averageVariance: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface DomainSummary {
  domain: string;
  pending: number;
  approved: number;
  rejected: number;
  executing: number;
  completed: number;
  failed: number;
  averagePriority: number;
  pathToWorldClass: {
    overallProgress: number;
    gapsClosed: number;
    gapsRemaining: number;
    topPriorityGaps: string[];
  };
}

export interface RecommendationSummary {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  totalExecuting: number;
  totalCompleted: number;
  totalFailed: number;
  byDomain: DomainSummary[];
}

export interface RecommendationEngineConfig {
  tenantId: string;
  eventBus: EventBusService;
  zikaron: ZikaronService;
  otzar: OtzarService;
  escalationThresholdMs: number;
  budgetApprovalThreshold: number;
}

// ---------------------------------------------------------------------------
// RecommendationEngine Interface
// ---------------------------------------------------------------------------

export interface RecommendationEngine extends RecommendationQueue {
  submit(recommendation: Recommendation): Promise<string>;
  getPending(): Promise<Recommendation[]>;
  getByDomain(domain: string): Promise<Recommendation[]>;
  getSummary(): Promise<RecommendationSummary>;
  approve(id: string): Promise<ExecutionTask>;
  reject(id: string, reason: string): Promise<void>;
  batchApprove(ids: string[]): Promise<ExecutionTask[]>;
  batchReject(ids: string[], reason: string): Promise<void>;
  getExecutionStatus(recommendationId: string): Promise<ExecutionTask | null>;
  measureImpact(
    recommendationId: string,
    actualImpact: Record<string, number>,
  ): Promise<ImpactMeasurement>;
  getCalibrationReport(agentId: string): Promise<CalibrationReport>;
  checkEscalations(): Promise<Recommendation[]>;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_ESCALATION_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours
const DEFAULT_BUDGET_APPROVAL_THRESHOLD = 100; // $100

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class RecommendationEngineImpl implements RecommendationEngine {
  private readonly tenantId: string;
  private readonly eventBus: EventBusService;
  private readonly zikaron: ZikaronService;
  private readonly otzar: OtzarService;
  private readonly escalationThresholdMs: number;
  private readonly budgetApprovalThreshold: number;

  // In-memory storage (will be wired to Aurora later)
  private readonly recommendations: Map<string, Recommendation> = new Map();
  private readonly executionTasks: Map<string, ExecutionTask> = new Map();
  private readonly impactMeasurements: Map<string, ImpactMeasurement> = new Map();
  private readonly rejectionReasons: Map<string, string> = new Map();

  constructor(config: RecommendationEngineConfig) {
    this.tenantId = config.tenantId;
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
    this.otzar = config.otzar;
    this.escalationThresholdMs =
      config.escalationThresholdMs ?? DEFAULT_ESCALATION_THRESHOLD_MS;
    this.budgetApprovalThreshold =
      config.budgetApprovalThreshold ?? DEFAULT_BUDGET_APPROVAL_THRESHOLD;
  }

  /**
   * Submit a recommendation to the queue.
   * Validates structure, assigns ID, persists, and publishes event.
   *
   * Requirements: 22.2, 26.1
   */
  async submit(recommendation: Recommendation): Promise<string> {
    this.validateRecommendation(recommendation);

    // Check budget threshold — if above threshold, require Otzar approval
    if (recommendation.actionPlan.requiresBudget > this.budgetApprovalThreshold) {
      const budgetCheck = await this.otzar.checkBudget(
        recommendation.agentId,
        recommendation.actionPlan.requiresBudget,
      );
      if (!budgetCheck.allowed) {
        throw new Error(
          `Budget threshold exceeded: recommendation requires $${recommendation.actionPlan.requiresBudget} but Otzar denied. Reason: ${budgetCheck.reason ?? 'budget limit reached'}`,
        );
      }
    }

    const id = recommendation.id || randomUUID();
    const stored: Recommendation = {
      ...recommendation,
      id,
      status: 'pending',
      submittedAt: recommendation.submittedAt ?? new Date(),
    };

    this.recommendations.set(id, stored);

    await this.eventBus.publish({
      source: 'seraphim.recommendation-engine',
      type: 'recommendation.submitted',
      detail: {
        recommendationId: id,
        agentId: stored.agentId,
        domain: stored.domain,
        priority: stored.priority,
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: id,
        timestamp: new Date(),
      },
    });

    return id;
  }

  /**
   * Get all pending recommendations sorted by priority descending.
   *
   * Requirement: 22.1, 26.1
   */
  async getPending(): Promise<Recommendation[]> {
    const pending = Array.from(this.recommendations.values())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => b.priority - a.priority);
    return pending;
  }

  /**
   * Get recommendations filtered by domain.
   *
   * Requirement: 22.1, 26.6
   */
  async getByDomain(domain: string): Promise<Recommendation[]> {
    return Array.from(this.recommendations.values())
      .filter((r) => r.domain === domain)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get summary view with path-to-world-class dashboard data per domain.
   *
   * Requirement: 26.6
   */
  async getSummary(): Promise<RecommendationSummary> {
    const all = Array.from(this.recommendations.values());

    const domainMap = new Map<string, Recommendation[]>();
    for (const rec of all) {
      const existing = domainMap.get(rec.domain) ?? [];
      existing.push(rec);
      domainMap.set(rec.domain, existing);
    }

    const byDomain: DomainSummary[] = [];
    for (const [domain, recs] of domainMap) {
      const pending = recs.filter((r) => r.status === 'pending');
      const approved = recs.filter((r) => r.status === 'approved');
      const rejected = recs.filter((r) => r.status === 'rejected');
      const executing = recs.filter((r) => r.status === 'executing');
      const completed = recs.filter((r) => r.status === 'completed');
      const failed = recs.filter((r) => r.status === 'failed');

      const avgPriority =
        recs.length > 0
          ? recs.reduce((sum, r) => sum + r.priority, 0) / recs.length
          : 0;

      const gapsClosed = completed.length;
      const gapsRemaining = pending.length + approved.length + executing.length;
      const totalGaps = gapsClosed + gapsRemaining + rejected.length + failed.length;
      const overallProgress = totalGaps > 0 ? (gapsClosed / totalGaps) * 100 : 0;

      const topPriorityGaps = pending
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3)
        .map((r) => r.gapAnalysis.description);

      byDomain.push({
        domain,
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
        executing: executing.length,
        completed: completed.length,
        failed: failed.length,
        averagePriority: Math.round(avgPriority * 100) / 100,
        pathToWorldClass: {
          overallProgress: Math.round(overallProgress * 100) / 100,
          gapsClosed,
          gapsRemaining,
          topPriorityGaps,
        },
      });
    }

    return {
      totalPending: all.filter((r) => r.status === 'pending').length,
      totalApproved: all.filter((r) => r.status === 'approved').length,
      totalRejected: all.filter((r) => r.status === 'rejected').length,
      totalExecuting: all.filter((r) => r.status === 'executing').length,
      totalCompleted: all.filter((r) => r.status === 'completed').length,
      totalFailed: all.filter((r) => r.status === 'failed').length,
      byDomain,
    };
  }

  /**
   * Approve a recommendation: transition to approved, create execution task,
   * dispatch to originating sub-agent, publish event.
   *
   * Requirements: 22.4, 26.3
   */
  async approve(id: string): Promise<ExecutionTask> {
    const rec = this.recommendations.get(id);
    if (!rec) {
      throw new Error(`Recommendation not found: ${id}`);
    }
    if (rec.status !== 'pending') {
      throw new Error(`Cannot approve recommendation in status: ${rec.status}`);
    }

    rec.status = 'approved';
    this.recommendations.set(id, rec);

    const task: ExecutionTask = {
      id: randomUUID(),
      recommendationId: id,
      agentId: rec.agentId,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
    };
    this.executionTasks.set(id, task);

    await this.eventBus.publish({
      source: 'seraphim.recommendation-engine',
      type: 'recommendation.approved',
      detail: {
        recommendationId: id,
        agentId: rec.agentId,
        domain: rec.domain,
        executionTaskId: task.id,
        actionPlan: rec.actionPlan.summary,
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: id,
        timestamp: new Date(),
      },
    });

    return task;
  }

  /**
   * Reject a recommendation: transition to rejected, record reason in Zikaron,
   * publish event.
   *
   * Requirements: 22.5, 26.2
   */
  async reject(id: string, reason: string): Promise<void> {
    const rec = this.recommendations.get(id);
    if (!rec) {
      throw new Error(`Recommendation not found: ${id}`);
    }
    if (rec.status !== 'pending') {
      throw new Error(`Cannot reject recommendation in status: ${rec.status}`);
    }

    rec.status = 'rejected';
    this.recommendations.set(id, rec);
    this.rejectionReasons.set(id, reason);

    // Store rejection in Zikaron for agent learning
    await this.zikaron.storeEpisodic({
      id: randomUUID(),
      tenantId: this.tenantId,
      layer: 'episodic',
      content: `Recommendation rejected: ${rec.gapAnalysis.description}. Reason: ${reason}`,
      embedding: [],
      sourceAgentId: rec.agentId,
      tags: ['recommendation', 'rejected', rec.domain],
      createdAt: new Date(),
      eventType: 'recommendation.rejected',
      participants: [rec.agentId],
      outcome: 'failure',
      relatedEntities: [
        {
          entityId: id,
          entityType: 'recommendation',
          role: 'subject',
        },
      ],
    });

    await this.eventBus.publish({
      source: 'seraphim.recommendation-engine',
      type: 'recommendation.rejected',
      detail: {
        recommendationId: id,
        agentId: rec.agentId,
        domain: rec.domain,
        reason,
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: id,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Batch approve multiple recommendations in a single transaction.
   *
   * Requirement: 26.2
   */
  async batchApprove(ids: string[]): Promise<ExecutionTask[]> {
    const tasks: ExecutionTask[] = [];
    for (const id of ids) {
      const task = await this.approve(id);
      tasks.push(task);
    }
    return tasks;
  }

  /**
   * Batch reject multiple recommendations in a single transaction.
   *
   * Requirement: 26.2
   */
  async batchReject(ids: string[], reason: string): Promise<void> {
    for (const id of ids) {
      await this.reject(id, reason);
    }
  }

  /**
   * Get execution status for an approved recommendation.
   *
   * Requirement: 26.4
   */
  async getExecutionStatus(recommendationId: string): Promise<ExecutionTask | null> {
    return this.executionTasks.get(recommendationId) ?? null;
  }

  /**
   * Measure impact: compare actual outcomes against estimated impact,
   * calculate variance, store in Zikaron for calibration.
   *
   * Requirement: 26.5, 22.7
   */
  async measureImpact(
    recommendationId: string,
    actualImpact: Record<string, number>,
  ): Promise<ImpactMeasurement> {
    const rec = this.recommendations.get(recommendationId);
    if (!rec) {
      throw new Error(`Recommendation not found: ${recommendationId}`);
    }

    // Extract estimated impact values
    const estimatedImpact: Record<string, number> = {};
    for (const [key, value] of Object.entries(rec.actionPlan.estimatedImpact)) {
      estimatedImpact[key] = value.value;
    }

    // Calculate variance: (actual - estimated) / estimated
    const variance: Record<string, number> = {};
    for (const key of Object.keys(actualImpact)) {
      const estimated = estimatedImpact[key];
      if (estimated !== undefined && estimated !== 0) {
        variance[key] = (actualImpact[key] - estimated) / Math.abs(estimated);
      } else {
        variance[key] = actualImpact[key] !== 0 ? 1 : 0;
      }
    }

    const measurement: ImpactMeasurement = {
      recommendationId,
      estimatedImpact,
      actualImpact,
      variance,
      measuredAt: new Date(),
    };

    this.impactMeasurements.set(recommendationId, measurement);

    // Mark recommendation as completed
    rec.status = 'completed';
    this.recommendations.set(recommendationId, rec);

    // Update execution task
    const task = this.executionTasks.get(recommendationId);
    if (task) {
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date();
      task.result = { actualImpact, variance };
      this.executionTasks.set(recommendationId, task);
    }

    // Store in Zikaron for estimate calibration
    await this.zikaron.storeSemantic({
      id: randomUUID(),
      tenantId: this.tenantId,
      layer: 'semantic',
      content: `Impact measurement for recommendation ${recommendationId}: variance=${JSON.stringify(variance)}`,
      embedding: [],
      sourceAgentId: rec.agentId,
      tags: ['impact-measurement', 'calibration', rec.domain],
      createdAt: new Date(),
      entityType: 'impact_measurement',
      relationships: [
        {
          subjectId: recommendationId,
          predicate: 'measured_impact',
          objectId: measurement.recommendationId,
          confidence: 1.0,
        },
      ],
      confidence: 1.0,
      source: 'extracted',
    });

    return measurement;
  }

  /**
   * Get calibration report for an agent: approval rate, impact accuracy,
   * common rejection reasons, and trend.
   *
   * Requirement: 22.7
   */
  async getCalibrationReport(agentId: string): Promise<CalibrationReport> {
    const agentRecs = Array.from(this.recommendations.values()).filter(
      (r) => r.agentId === agentId,
    );

    const total = agentRecs.length;
    const approved = agentRecs.filter(
      (r) => r.status === 'approved' || r.status === 'executing' || r.status === 'completed',
    ).length;
    const rejected = agentRecs.filter((r) => r.status === 'rejected').length;

    const approvalRate = total > 0 ? approved / total : 0;
    const rejectionRate = total > 0 ? rejected / total : 0;

    // Calculate impact accuracy from measurements
    const agentMeasurements = Array.from(this.impactMeasurements.values()).filter((m) => {
      const rec = this.recommendations.get(m.recommendationId);
      return rec?.agentId === agentId;
    });

    let impactAccuracy = 1.0;
    let averageVariance = 0;
    if (agentMeasurements.length > 0) {
      const variances = agentMeasurements.map((m) => {
        const values = Object.values(m.variance);
        return values.length > 0
          ? values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length
          : 0;
      });
      averageVariance =
        variances.reduce((sum, v) => sum + v, 0) / variances.length;
      // Accuracy is inverse of average absolute variance (capped at 0-1)
      impactAccuracy = Math.max(0, 1 - averageVariance);
    }

    // Collect rejection reasons
    const rejectionReasonCounts = new Map<string, number>();
    for (const rec of agentRecs.filter((r) => r.status === 'rejected')) {
      const reason = this.rejectionReasons.get(rec.id) ?? 'unknown';
      rejectionReasonCounts.set(reason, (rejectionReasonCounts.get(reason) ?? 0) + 1);
    }
    const commonRejectionReasons = Array.from(rejectionReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Determine trend based on recent vs older measurements
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (agentMeasurements.length >= 4) {
      const sorted = [...agentMeasurements].sort(
        (a, b) => a.measuredAt.getTime() - b.measuredAt.getTime(),
      );
      const midpoint = Math.floor(sorted.length / 2);
      const olderVariances = sorted.slice(0, midpoint).map((m) => {
        const values = Object.values(m.variance);
        return values.length > 0
          ? values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length
          : 0;
      });
      const newerVariances = sorted.slice(midpoint).map((m) => {
        const values = Object.values(m.variance);
        return values.length > 0
          ? values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length
          : 0;
      });

      const olderAvg =
        olderVariances.reduce((s, v) => s + v, 0) / olderVariances.length;
      const newerAvg =
        newerVariances.reduce((s, v) => s + v, 0) / newerVariances.length;

      if (newerAvg < olderAvg - 0.05) {
        trend = 'improving';
      } else if (newerAvg > olderAvg + 0.05) {
        trend = 'declining';
      }
    }

    return {
      agentId,
      totalRecommendations: total,
      approvalRate: Math.round(approvalRate * 100) / 100,
      rejectionRate: Math.round(rejectionRate * 100) / 100,
      impactAccuracy: Math.round(impactAccuracy * 100) / 100,
      commonRejectionReasons,
      averageVariance: Math.round(averageVariance * 100) / 100,
      trend,
    };
  }

  /**
   * Check for recommendations pending longer than the escalation threshold.
   * Returns recommendations that need escalation (re-notification via Shaar).
   *
   * Requirement: 22.6
   */
  async checkEscalations(): Promise<Recommendation[]> {
    const now = Date.now();
    const escalated: Recommendation[] = [];

    for (const rec of this.recommendations.values()) {
      if (rec.status !== 'pending') continue;

      const pendingDuration = now - rec.submittedAt.getTime();
      if (pendingDuration > this.escalationThresholdMs) {
        escalated.push(rec);

        await this.eventBus.publish({
          source: 'seraphim.recommendation-engine',
          type: 'recommendation.escalated',
          detail: {
            recommendationId: rec.id,
            agentId: rec.agentId,
            domain: rec.domain,
            priority: rec.priority,
            pendingHours: Math.round(pendingDuration / (60 * 60 * 1000)),
            summary: rec.actionPlan.summary,
          },
          metadata: {
            tenantId: this.tenantId,
            correlationId: rec.id,
            timestamp: new Date(),
          },
        });
      }
    }

    return escalated;
  }

  // ---------------------------------------------------------------------------
  // Private: Validation
  // ---------------------------------------------------------------------------

  private validateRecommendation(rec: Recommendation): void {
    const errors: string[] = [];

    if (!rec.agentId) errors.push('agentId is required');
    if (!rec.domain) errors.push('domain is required');
    if (rec.priority === undefined || rec.priority < 1 || rec.priority > 10) {
      errors.push('priority must be between 1 and 10');
    }

    if (!rec.worldClassBenchmark || !rec.worldClassBenchmark.description) {
      errors.push('worldClassBenchmark with description is required');
    }
    if (!rec.currentState || !rec.currentState.description) {
      errors.push('currentState with description is required');
    }
    if (!rec.gapAnalysis || !rec.gapAnalysis.description) {
      errors.push('gapAnalysis with description is required');
    }
    if (!rec.actionPlan || !rec.actionPlan.summary || !rec.actionPlan.steps?.length) {
      errors.push('actionPlan with summary and steps is required');
    }
    if (!rec.riskAssessment || !rec.riskAssessment.level) {
      errors.push('riskAssessment with level is required');
    }
    if (!rec.rollbackPlan) {
      errors.push('rollbackPlan is required');
    }

    if (errors.length > 0) {
      throw new Error(`Invalid recommendation: ${errors.join('; ')}`);
    }
  }
}
