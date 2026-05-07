/**
 * Unit tests for Observability
 * Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsCollector } from '../metrics.js';
import type { CloudWatchClientLike } from '../metrics.js';
import { CostMetricsCollector } from '../cost-metrics.js';
import { AlertManager } from '../alerts.js';
import { HealthChecker } from '../health.js';
import { TracingManager } from '../tracing.js';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';

describe('MetricsCollector', () => {
  it('should track agent metrics', () => {
    const collector = new MetricsCollector();
    collector.updateAgentMetrics([
      { state: 'ready' },
      { state: 'executing' },
      { state: 'terminated' },
    ]);
    const metrics = collector.getMetrics();
    expect(metrics.activeAgentCount).toBe(2);
    expect(metrics.agentStates.ready).toBe(1);
    expect(metrics.agentStates.executing).toBe(1);
  });

  it('should update memory utilization', () => {
    const collector = new MetricsCollector();
    collector.updateMemoryUtilization(72.5);
    expect(collector.getMetrics().memoryUtilizationPercent).toBe(72.5);
  });

  it('should publish metrics to CloudWatch when client is provided', async () => {
    const mockClient: CloudWatchClientLike = { send: vi.fn().mockResolvedValue({}) };
    const collector = new MetricsCollector({ cloudWatchClient: mockClient, namespace: 'Test/NS' });
    collector.updateAgentMetrics([{ state: 'ready' }]);
    collector.updateTaskQueueDepth(5);

    await collector.publishToCloudWatch();

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    const command = vi.mocked(mockClient.send).mock.calls[0][0];
    expect(command.input.Namespace).toBe('Test/NS');
    expect(command.input.MetricData.length).toBeGreaterThanOrEqual(5);
  });

  it('should not throw when publishing without CloudWatch client', async () => {
    const collector = new MetricsCollector();
    await expect(collector.publishToCloudWatch()).resolves.toBeUndefined();
  });

  it('should start and stop periodic publishing', () => {
    vi.useFakeTimers();
    const mockClient: CloudWatchClientLike = { send: vi.fn().mockResolvedValue({}) };
    const collector = new MetricsCollector({ cloudWatchClient: mockClient, publishIntervalMs: 1000 });

    collector.startPeriodicPublishing();
    vi.advanceTimersByTime(3500);
    collector.stopPeriodicPublishing();

    expect(mockClient.send).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('CostMetricsCollector', () => {
  it('should track cost metrics per agent and pillar', () => {
    const collector = new CostMetricsCollector();
    collector.recordSpend('agent-1', 'eretz', 'gpt-4o', 1000, 0.05);
    collector.recordSpend('agent-1', 'eretz', 'gpt-4o', 2000, 0.10);
    const metrics = collector.getMetrics();
    expect(metrics.perAgentSpend['agent-1']).toBeCloseTo(0.15);
    expect(metrics.perPillarSpend.eretz).toBeCloseTo(0.15);
    expect(metrics.modelUtilization['gpt-4o'].calls).toBe(2);
  });

  it('should publish cost metrics to CloudWatch', async () => {
    const mockClient: CloudWatchClientLike = { send: vi.fn().mockResolvedValue({}) };
    const collector = new CostMetricsCollector({ cloudWatchClient: mockClient });
    collector.recordSpend('agent-1', 'eretz', 'gpt-4o', 1000, 0.05);
    collector.updateProjections(10);

    await collector.publishToCloudWatch();

    expect(mockClient.send).toHaveBeenCalled();
    const command = vi.mocked(mockClient.send).mock.calls[0][0];
    expect(command.input.Namespace).toBe('SeraphimOS/Costs');
  });

  it('should not throw when publishing without CloudWatch client', async () => {
    const collector = new CostMetricsCollector();
    await expect(collector.publishToCloudWatch()).resolves.toBeUndefined();
  });
});

describe('AlertManager', () => {
  let manager: AlertManager;

  beforeEach(() => {
    manager = new AlertManager();
    manager.addThreshold({
      id: 'high-error-rate',
      metricName: 'errorRate',
      operator: 'gt',
      value: 0.05,
      severity: 'critical',
      description: 'Error rate too high',
    });
  });

  it('should trigger alert when threshold exceeded', () => {
    const alerts = manager.checkMetric('errorRate', 0.1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
  });

  it('should not trigger alert when within threshold', () => {
    const alerts = manager.checkMetric('errorRate', 0.01);
    expect(alerts).toHaveLength(0);
  });

  it('should track active alerts', () => {
    manager.checkMetric('errorRate', 0.1);
    expect(manager.getActiveAlerts()).toHaveLength(1);
    manager.clearAlerts();
    expect(manager.getActiveAlerts()).toHaveLength(0);
  });

  it('should check all metrics at once', () => {
    manager.addThreshold({
      id: 'high-queue',
      metricName: 'taskQueueDepth',
      operator: 'gt',
      value: 100,
      severity: 'warning',
      description: 'Queue too deep',
    });
    const alerts = manager.checkAllMetrics({ errorRate: 0.1, taskQueueDepth: 200 });
    expect(alerts).toHaveLength(2);
  });

  it('should publish alert events to Event Bus when configured', () => {
    const mockPublish = vi.fn().mockResolvedValue('event-1');
    const mockEventBus = { publish: mockPublish } as unknown as EventBusService;
    const busManager = new AlertManager({ eventBus: mockEventBus, tenantId: 'tenant-1' });
    busManager.addThreshold({
      id: 'high-error-rate',
      metricName: 'errorRate',
      operator: 'gt',
      value: 0.05,
      severity: 'critical',
      description: 'Error rate too high',
    });

    busManager.checkMetric('errorRate', 0.1);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const event = mockPublish.mock.calls[0][0];
    expect(event.type).toBe('alert.triggered');
    expect(event.source).toBe('seraphim.observability');
    expect(event.detail.severity).toBe('critical');
    expect(event.metadata.tenantId).toBe('tenant-1');
  });
});

describe('HealthChecker', () => {
  it('should report healthy when all services are healthy', async () => {
    const checker = new HealthChecker();
    checker.registerService('zikaron', async () => 'healthy');
    checker.registerService('mishmar', async () => 'healthy');
    const report = await checker.checkHealth();
    expect(report.overall).toBe('healthy');
    expect(report.services).toHaveLength(2);
  });

  it('should report degraded when a service is degraded', async () => {
    const checker = new HealthChecker();
    checker.registerService('zikaron', async () => 'healthy');
    checker.registerService('mishmar', async () => 'degraded');
    const report = await checker.checkHealth();
    expect(report.overall).toBe('degraded');
  });

  it('should report down when a service check throws', async () => {
    const checker = new HealthChecker();
    checker.registerService('broken', async () => { throw new Error('fail'); });
    const report = await checker.checkHealth();
    expect(report.overall).toBe('down');
    expect(report.services[0].status).toBe('down');
  });

  it('should include driver health checks', async () => {
    const checker = new HealthChecker();
    checker.registerService('zikaron', async () => 'healthy');
    checker.registerDriver('appstore', async () => 'healthy');
    checker.registerDriver('kalshi', async () => 'degraded');
    const report = await checker.checkHealth();
    expect(report.drivers).toHaveLength(2);
    expect(report.overall).toBe('degraded');
  });

  it('should include agent health checks', async () => {
    const checker = new HealthChecker();
    checker.registerService('zikaron', async () => 'healthy');
    checker.registerAgent('agent-1', 'ZionX', async () => 'healthy');
    const report = await checker.checkHealth();
    expect(report.agents).toHaveLength(1);
    expect(report.agents[0].name).toBe('ZionX');
  });

  it('should report degraded when a health check times out', async () => {
    const checker = new HealthChecker({ checkTimeoutMs: 50 });
    checker.registerService('slow', () => new Promise((resolve) => setTimeout(() => resolve('healthy'), 200)));
    const report = await checker.checkHealth();
    expect(report.services[0].status).toBe('degraded');
    expect(report.services[0].details).toBe('Health check timed out');
  });

  it('should return status for individual service lookup', () => {
    const checker = new HealthChecker();
    checker.registerService('zikaron', async () => 'healthy');
    const status = checker.getServiceStatus('zikaron');
    expect(status).toBeDefined();
    expect(status!.name).toBe('zikaron');
  });

  it('should return undefined for unknown service', () => {
    const checker = new HealthChecker();
    expect(checker.getServiceStatus('nonexistent')).toBeUndefined();
  });
});

describe('TracingManager', () => {
  it('should return config', () => {
    const manager = new TracingManager({ enabled: true, serviceName: 'seraphim-core', samplingRate: 0.1 });
    const config = manager.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.serviceName).toBe('seraphim-core');
    expect(config.samplingRate).toBe(0.1);
  });

  it('should report enabled status', () => {
    const enabled = new TracingManager({ enabled: true, serviceName: 'test' });
    const disabled = new TracingManager({ enabled: false, serviceName: 'test' });
    expect(enabled.isEnabled()).toBe(true);
    expect(disabled.isEnabled()).toBe(false);
  });

  it('should create annotations', () => {
    const manager = new TracingManager({ enabled: true, serviceName: 'seraphim-core' });
    const annotation = manager.createAnnotation('userId', 'king-1');
    expect(annotation.key).toBe('userId');
    expect(annotation.value).toBe('king-1');
    expect(annotation.serviceName).toBe('seraphim-core');
    expect(annotation.timestamp).toBeDefined();
  });

  it('should create X-Ray trace headers when enabled', () => {
    const manager = new TracingManager({ enabled: true, serviceName: 'test', samplingRate: 1.0 });
    const header = manager.createTraceHeader();
    expect(header).toMatch(/^Root=1-[0-9a-f]+-[0-9a-f]+;Parent=[0-9a-f]+;Sampled=[01]$/);
  });

  it('should return empty string when tracing is disabled', () => {
    const manager = new TracingManager({ enabled: false, serviceName: 'test' });
    expect(manager.createTraceHeader()).toBe('');
  });
});
