---
tags: [operations, status]
updated: 2026-05-13
---

# System Status

## Infrastructure

| Component | Status | Endpoint |
|-----------|--------|----------|
| Dashboard | 🟢 Live | [Open Dashboard](http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com) |
| Backend API | 🟢 Live | `seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com` |
| ECS Cluster | 🟢 Running | `seraphim-agents` — 1 Fargate task |
| Aurora PostgreSQL | 🟡 Available (bootstrap timeout) | Falls back to in-memory |
| WebSocket | 🔴 Not working | ALB handshake issue |

## Agent Registry

| Agent | State | Pillar | Last Heartbeat |
|-------|-------|--------|----------------|
| [[Seraphim Core]] | Ready | Kernel | Active |
| [[Eretz]] | Ready | Business | Active |
| [[ZionX]] | Ready | Apps | Active |
| [[ZXMG]] | Ready | Media | Active |
| [[Zion Alpha]] | Ready | Trading | Active |
| [[Mishmar]] | Ready | Governance | Active |
| [[Otzar]] | Ready | Resources | Active |
| [[Shaar Guardian]] | Ready | Interface | Active |

## Known Issues

1. **Aurora bootstrap timeout** — Secrets Manager unreachable from Fargate (likely missing VPC endpoint)
2. **PgPersistence SQL errors** — `$1` parameter binding issue
3. **WebSocket fails** — ALB WebSocket handshake not completing
4. **Shaar Guardian can't see dashboard in production** — Playwright not available in container (HTTP fallback only)

## AWS Resources

| Resource | ID |
|----------|---|
| ECS Cluster | `seraphim-agents` |
| ALB | `seraphim-api-alb-1857113134` |
| Target Group | `seraphim-ecs-targets/6d51767b64e0dd5c` |
| S3 Dashboard | `seraphim-dashboard-live` |
| ECR Repo | `cdk-hnb659fds-container-assets-562887205007-us-east-1` |
| Region | `us-east-1` |
| Account | `562887205007` |
