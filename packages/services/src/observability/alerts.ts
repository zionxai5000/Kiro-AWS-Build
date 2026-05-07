/**
 * Observability — Alert System
 *
 * Configures alarms for metric thresholds, triggers alert events when exceeded,
 * and publishes them to the Event Bus for delivery through Shaar within 60 seconds.
 *
 * Requirements: 18.3, 18.4
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export interface AlertThreshold {
  id: string;
  metricName: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

export interface AlertEvent {
  id: string;
  thresholdId: string;
  metricName: string;
  currentValue: number;
  thresholdValue: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  triggeredAt: string;
}

export interface AlertManagerConfig {
  /** Event Bus service for publishing alert events */
  eventBus?: EventBusService;
  /** Tenant ID for event metadata */
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// AlertManager
// ---------------------------------------------------------------------------

export class AlertManager {
  private thresholds: AlertThreshold[] = [];
  private activeAlerts: AlertEvent[] = [];
  private readonly eventBus?: EventBusService;
  private readonly tenantId: string;

  constructor(config?: AlertManagerConfig) {
    this.eventBus = config?.eventBus;
    this.tenantId = config?.tenantId ?? 'default';
  }

  addThreshold(threshold: AlertThreshold): void {
    this.thresholds.push(threshold);
  }

  removeThreshold(id: string): void {
    this.thresholds = this.thresholds.filter((t) => t.id !== id);
  }

  checkMetric(metricName: string, value: number): AlertEvent[] {
    const triggered: AlertEvent[] = [];
    for (const threshold of this.thresholds) {
      if (threshold.metricName !== metricName) continue;
      const exceeded = this.evaluateThreshold(value, threshold.operator, threshold.value);
      if (exceeded) {
        const alert: AlertEvent = {
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          thresholdId: threshold.id,
          metricName,
          currentValue: value,
          thresholdValue: threshold.value,
          severity: threshold.severity,
          message: `${threshold.description}: ${metricName} is ${value} (threshold: ${threshold.operator} ${threshold.value})`,
          triggeredAt: new Date().toISOString(),
        };
        triggered.push(alert);
        this.activeAlerts.push(alert);

        // Publish to Event Bus (fire-and-forget for non-blocking alert delivery)
        if (this.eventBus) {
          void this.publishAlertEvent(alert);
        }
      }
    }
    return triggered;
  }

  checkAllMetrics(metrics: Record<string, number>): AlertEvent[] {
    const allTriggered: AlertEvent[] = [];
    for (const [metricName, value] of Object.entries(metrics)) {
      const triggered = this.checkMetric(metricName, value);
      allTriggered.push(...triggered);
    }
    return allTriggered;
  }

  getActiveAlerts(): AlertEvent[] {
    return [...this.activeAlerts];
  }

  clearAlerts(): void {
    this.activeAlerts = [];
  }

  private evaluateThreshold(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  private async publishAlertEvent(alert: AlertEvent): Promise<void> {
    if (!this.eventBus) return;

    await this.eventBus.publish({
      source: 'seraphim.observability',
      type: 'alert.triggered',
      detail: {
        alertId: alert.id,
        thresholdId: alert.thresholdId,
        metricName: alert.metricName,
        currentValue: alert.currentValue,
        thresholdValue: alert.thresholdValue,
        severity: alert.severity,
        message: alert.message,
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });
  }
}
