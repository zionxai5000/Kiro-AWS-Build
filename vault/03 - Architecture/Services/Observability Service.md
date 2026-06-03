---
tags: [architecture, services, observability, monitoring, alerts]
updated: 2025-01-20
---

# Observability Service

> Real-time metrics, cost tracking, alerting, and system health monitoring.

## Overview

Provides comprehensive monitoring of all SeraphimOS components via CloudWatch custom metrics, distributed tracing (X-Ray), and configurable alerting that delivers through Shaar within 60 seconds.

Package: `packages/services/src/observability/`

---

## Components

| File | Purpose |
|------|---------|
| `metrics.ts` | Active agents, task queues, throughput, error rates |
| `cost-metrics.ts` | Per-agent/pillar token spend, model utilization |
| `alerts.ts` | CloudWatch alarms, threshold detection, event delivery |
| `health.ts` | System health endpoint for all services/drivers/agents |

---

## Metrics Collected

| Category | Metrics |
|----------|---------|
| Agents | Active count, states, heartbeat status |
| Tasks | Queue depth, execution time, success/failure rates |
| Events | EventBridge throughput, DLQ depth |
| Memory | Zikaron query latency, vector search performance |
| Cost | Per-agent spend, per-pillar spend, model utilization |
| Infrastructure | CPU, memory, connection pool usage |

---

## Alert Thresholds

Configurable CloudWatch alarms that trigger alert events to the [[Event Bus Service|Event Bus]]:
- Agent heartbeat stale (>90 seconds)
- Error rate exceeds threshold
- Budget utilization >80%
- DLQ depth >0
- Health check failures

All alerts delivered through [[Shaar Agent Gateway|Shaar]] within 60 seconds.

---

## Distributed Tracing

AWS X-Ray enabled across:
- ECS Fargate tasks
- Lambda functions
- Cross-service calls

## Related

- [[Dashboard Views]]
- [[Shaar Agent Gateway]]
- [[Otzar Resource Manager]]
- [[System Status]]
