/**
 * Observability — Cost Metrics
 *
 * Exposes real-time cost metrics: per-agent token spend, per-pillar spend,
 * model utilization breakdown, projected daily/monthly costs.
 *
 * Publishes custom metrics to CloudWatch under the SeraphimOS/Costs namespace.
 *
 * Requirements: 18.2
 */

import type { CloudWatchClientLike, MetricDatum } from './metrics.js';
import { createPutMetricDataCommand } from './metrics.js';

// ---------------------------------------------------------------------------
// Cost Metrics
// ---------------------------------------------------------------------------

export interface CostMetrics {
  perAgentSpend: Record<string, number>;
  perPillarSpend: Record<string, number>;
  modelUtilization: Record<string, { calls: number; tokens: number; cost: number }>;
  projectedDailyCost: number;
  projectedMonthlyCost: number;
  collectedAt: string;
}

export interface CostMetricsCollectorConfig {
  /** CloudWatch client (AWS SDK) — optional, metrics work in-memory without it */
  cloudWatchClient?: CloudWatchClientLike;
  /** CloudWatch namespace for cost metrics (default: SeraphimOS/Costs) */
  namespace?: string;
  /** Publish interval in milliseconds (default: 60000 = 1 minute) */
  publishIntervalMs?: number;
}

export class CostMetricsCollector {
  private metrics: CostMetrics = {
    perAgentSpend: {},
    perPillarSpend: {},
    modelUtilization: {},
    projectedDailyCost: 0,
    projectedMonthlyCost: 0,
    collectedAt: new Date().toISOString(),
  };

  private readonly cloudWatchClient?: CloudWatchClientLike;
  private readonly namespace: string;
  private readonly publishIntervalMs: number;
  private publishTimer?: ReturnType<typeof setInterval>;

  constructor(config?: CostMetricsCollectorConfig) {
    this.cloudWatchClient = config?.cloudWatchClient;
    this.namespace = config?.namespace ?? 'SeraphimOS/Costs';
    this.publishIntervalMs = config?.publishIntervalMs ?? 60_000;
  }

  recordSpend(agentId: string, pillar: string, model: string, tokens: number, cost: number): void {
    this.metrics.perAgentSpend[agentId] = (this.metrics.perAgentSpend[agentId] ?? 0) + cost;
    this.metrics.perPillarSpend[pillar] = (this.metrics.perPillarSpend[pillar] ?? 0) + cost;
    if (!this.metrics.modelUtilization[model]) {
      this.metrics.modelUtilization[model] = { calls: 0, tokens: 0, cost: 0 };
    }
    this.metrics.modelUtilization[model].calls++;
    this.metrics.modelUtilization[model].tokens += tokens;
    this.metrics.modelUtilization[model].cost += cost;
    this.metrics.collectedAt = new Date().toISOString();
  }

  updateProjections(dailyCost: number): void {
    this.metrics.projectedDailyCost = dailyCost;
    this.metrics.projectedMonthlyCost = dailyCost * 30;
  }

  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  // ---- CloudWatch publishing ----

  async publishToCloudWatch(): Promise<void> {
    if (!this.cloudWatchClient) return;

    const now = new Date();
    const metricData: MetricDatum[] = [];

    // Per-agent spend
    for (const [agentId, spend] of Object.entries(this.metrics.perAgentSpend)) {
      metricData.push({
        MetricName: 'AgentSpend',
        Value: spend,
        Unit: 'None',
        Timestamp: now,
        Dimensions: [{ Name: 'AgentId', Value: agentId }],
      });
    }

    // Per-pillar spend
    for (const [pillar, spend] of Object.entries(this.metrics.perPillarSpend)) {
      metricData.push({
        MetricName: 'PillarSpend',
        Value: spend,
        Unit: 'None',
        Timestamp: now,
        Dimensions: [{ Name: 'Pillar', Value: pillar }],
      });
    }

    // Model utilization
    for (const [model, util] of Object.entries(this.metrics.modelUtilization)) {
      metricData.push({
        MetricName: 'ModelCalls',
        Value: util.calls,
        Unit: 'Count',
        Timestamp: now,
        Dimensions: [{ Name: 'Model', Value: model }],
      });
      metricData.push({
        MetricName: 'ModelTokens',
        Value: util.tokens,
        Unit: 'Count',
        Timestamp: now,
        Dimensions: [{ Name: 'Model', Value: model }],
      });
      metricData.push({
        MetricName: 'ModelCost',
        Value: util.cost,
        Unit: 'None',
        Timestamp: now,
        Dimensions: [{ Name: 'Model', Value: model }],
      });
    }

    // Projections
    metricData.push({
      MetricName: 'ProjectedDailyCost',
      Value: this.metrics.projectedDailyCost,
      Unit: 'None',
      Timestamp: now,
    });
    metricData.push({
      MetricName: 'ProjectedMonthlyCost',
      Value: this.metrics.projectedMonthlyCost,
      Unit: 'None',
      Timestamp: now,
    });

    // CloudWatch accepts max 1000 metric data points per call; batch if needed
    const batchSize = 25;
    for (let i = 0; i < metricData.length; i += batchSize) {
      const batch = metricData.slice(i, i + batchSize);
      const command = createPutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: batch,
      });
      await this.cloudWatchClient.send(command);
    }
  }

  startPeriodicPublishing(): void {
    if (this.publishTimer) return;
    this.publishTimer = setInterval(() => {
      void this.publishToCloudWatch();
    }, this.publishIntervalMs);
  }

  stopPeriodicPublishing(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
    }
  }
}
