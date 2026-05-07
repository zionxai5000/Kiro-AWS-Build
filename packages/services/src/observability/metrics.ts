/**
 * Observability — Metrics Collection
 *
 * Exposes real-time metrics: active agent count, agent states, task queue depth,
 * event bus throughput, memory utilization, error rates.
 *
 * Publishes custom metrics to CloudWatch under the SeraphimOS/System namespace.
 *
 * Requirements: 18.1, 18.2
 */

// ---------------------------------------------------------------------------
// Minimal CloudWatch client interfaces (matches AWS SDK v3 shape)
// Avoids hard dependency on @aws-sdk/client-cloudwatch at compile time.
// ---------------------------------------------------------------------------

export interface MetricDatum {
  MetricName: string;
  Value: number;
  Unit: string;
  Timestamp: Date;
  Dimensions?: Array<{ Name: string; Value: string }>;
}

export interface PutMetricDataInput {
  Namespace: string;
  MetricData: MetricDatum[];
}

export interface PutMetricDataCommandLike {
  input: PutMetricDataInput;
}

export interface CloudWatchClientLike {
  send(command: PutMetricDataCommandLike): Promise<unknown>;
}

/** Creates a command object matching the PutMetricDataCommand shape. */
export function createPutMetricDataCommand(input: PutMetricDataInput): PutMetricDataCommandLike {
  return { input };
}

// ---------------------------------------------------------------------------
// System Metrics
// ---------------------------------------------------------------------------

export interface SystemMetrics {
  activeAgentCount: number;
  agentStates: Record<string, number>;
  taskQueueDepth: number;
  eventBusThroughput: number;
  memoryUtilizationPercent: number;
  errorRate: number;
  collectedAt: string;
}

export interface MetricsCollectorConfig {
  /** CloudWatch client (AWS SDK) — optional, metrics work in-memory without it */
  cloudWatchClient?: CloudWatchClientLike;
  /** CloudWatch namespace for custom metrics (default: SeraphimOS/System) */
  namespace?: string;
  /** Publish interval in milliseconds (default: 60000 = 1 minute) */
  publishIntervalMs?: number;
}

export class MetricsCollector {
  private metrics: SystemMetrics = {
    activeAgentCount: 0,
    agentStates: {},
    taskQueueDepth: 0,
    eventBusThroughput: 0,
    memoryUtilizationPercent: 0,
    errorRate: 0,
    collectedAt: new Date().toISOString(),
  };

  private readonly cloudWatchClient?: CloudWatchClientLike;
  private readonly namespace: string;
  private readonly publishIntervalMs: number;
  private publishTimer?: ReturnType<typeof setInterval>;

  constructor(config?: MetricsCollectorConfig) {
    this.cloudWatchClient = config?.cloudWatchClient;
    this.namespace = config?.namespace ?? 'SeraphimOS/System';
    this.publishIntervalMs = config?.publishIntervalMs ?? 60_000;
  }

  // ---- Metric updates ----

  updateAgentMetrics(agents: { state: string }[]): void {
    this.metrics.activeAgentCount = agents.filter((a) => a.state === 'ready' || a.state === 'executing').length;
    this.metrics.agentStates = {};
    for (const agent of agents) {
      this.metrics.agentStates[agent.state] = (this.metrics.agentStates[agent.state] ?? 0) + 1;
    }
    this.metrics.collectedAt = new Date().toISOString();
  }

  updateTaskQueueDepth(depth: number): void {
    this.metrics.taskQueueDepth = depth;
  }

  updateEventBusThroughput(throughput: number): void {
    this.metrics.eventBusThroughput = throughput;
  }

  updateErrorRate(rate: number): void {
    this.metrics.errorRate = rate;
  }

  updateMemoryUtilization(percent: number): void {
    this.metrics.memoryUtilizationPercent = percent;
    this.metrics.collectedAt = new Date().toISOString();
  }

  getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  // ---- CloudWatch publishing ----

  async publishToCloudWatch(): Promise<void> {
    if (!this.cloudWatchClient) return;

    const now = new Date();
    const metricData: MetricDatum[] = [
      { MetricName: 'ActiveAgentCount', Value: this.metrics.activeAgentCount, Unit: 'Count', Timestamp: now },
      { MetricName: 'TaskQueueDepth', Value: this.metrics.taskQueueDepth, Unit: 'Count', Timestamp: now },
      { MetricName: 'EventBusThroughput', Value: this.metrics.eventBusThroughput, Unit: 'Count/Second', Timestamp: now },
      { MetricName: 'MemoryUtilization', Value: this.metrics.memoryUtilizationPercent, Unit: 'Percent', Timestamp: now },
      { MetricName: 'ErrorRate', Value: this.metrics.errorRate, Unit: 'Count/Second', Timestamp: now },
    ];

    // Add per-state agent counts as dimensioned metrics
    for (const [state, count] of Object.entries(this.metrics.agentStates)) {
      metricData.push({
        MetricName: 'AgentStateCount',
        Value: count,
        Unit: 'Count',
        Timestamp: now,
        Dimensions: [{ Name: 'State', Value: state }],
      });
    }

    const command = createPutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: metricData,
    });

    await this.cloudWatchClient.send(command);
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
