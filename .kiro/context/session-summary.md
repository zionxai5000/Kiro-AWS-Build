# SeraphimOS Session Summary

> This file is automatically updated on every git commit to provide continuity
> across machines and Kiro sessions. Read this first when picking up work.

## Last Updated: 2026-05-13

## Current State

### Infrastructure (LIVE in AWS us-east-1)
- **Dashboard**: http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com
- **Backend API**: ALB at `seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com`
- **ECS Cluster**: `seraphim-agents` — 1 Fargate task running
- **Task Definition**: Revision 48 (`fix-timeout-v4` image)
- **ECR Repo**: `cdk-hnb659fds-container-assets-562887205007-us-east-1`
- **Aurora PostgreSQL**: Available but bootstrap times out (falls back to in-memory)
- **Status**: ✅ HEALTHY — 8 agents deployed, all services running

### Deployed Agents (all responding via dashboard chat)
1. **Seraphim Core** — Top-level orchestrator, "The Hand of the King"
2. **Eretz** — Business portfolio orchestrator
3. **ZionX** — App factory (iOS/Android)
4. **ZXMG** — Media production (YouTube/social)
5. **Zion Alpha** — Prediction market trading (Kalshi/Polymarket)
6. **Mishmar** — Governance enforcement
7. **Otzar** — Resource management and model routing
8. **Shaar Guardian** — Dashboard UI/UX observer agent

### Dashboard Tabs (46 navigation items)
- King's View, Command Center, Governance, Memory, Resources, Audit Trail
- Learning, Self-Improvement, Decisions, OV-1, SV-1, Requirements, Design, Capabilities
- Eretz: Portfolio, Synergies, Patterns, Training, Directives, Standing Orders
- ZionX: Pipeline, App Store, Marketing, Design, Revenue, Studio
- ZXMG: Content Pipeline, Analytics, Studio
- Zion Alpha: Positions, Strategy, Risk, Journal
- Shaar Agent, SME Intelligence, References, Quality Gate, Baselines

## Recent Work (May 13, 2026)

### Phase 18 — Shaar Agent (Human Interface Intelligence)
- Implemented full Shaar Agent with 11 service modules
- Created PlaywrightObserver for real browser-based dashboard observation
- Proved it can render the live S3 dashboard, bypass login, extract DOM
- 84 unit tests passing
- Dashboard tab with readiness score cards

### Deployment Crisis & Resolution
- Multiple rapid ECS deployments caused ALB target group IP mismatch
- Root cause: ECS registered new task IP but target group kept stale IP
- Fix: Added bootstrap timeouts (15s DB, 10s PgPersistence), increased ALB health check timeout to 30s
- Created deployment safety hooks and steering file to prevent recurrence
- Manual target group fix: deregistered stale IP, registered correct task IP

### Key Architecture Decisions
- Playwright is LOCAL ONLY — not in Docker container (too heavy for Fargate)
- Production server uses HTTP-based BrowserObserver (fetches JS bundle from S3)
- Bootstrap has timeouts — falls back to in-memory if AWS services unreachable
- The `core` package must NOT import from `services` (causes container crash)
- Health endpoint responds immediately, even during boot

## Pending Work

### Incomplete Tasks (from tasks.md)
- Task 8.6.2: AWS deployment checkpoint verification
- Task 11.1-11.3: End-to-end integration tests, auto-scaling, final CDK config
- Task 12: Final checkpoint
- Task 14: Phase 6 checkpoint
- Tasks 15-16: Phase 7 (Reference Ingestion) — in progress
- Shaar Agent: Needs Playwright to work in production (currently HTTP-only fallback)

### Known Issues
- Aurora PostgreSQL bootstrap times out (Secrets Manager unreachable from Fargate — likely VPC endpoint missing)
- PgPersistence SQL syntax errors (`$1` parameter binding issue)
- WebSocket connection fails (ALB WebSocket handshake issue)
- Shaar Guardian can't actually "see" the dashboard in production (Playwright not available in container)

## Key Files

| File | Purpose |
|------|---------|
| `packages/services/src/shaar/production-server.ts` | Main backend server |
| `packages/services/src/shaar-agent/` | Shaar Agent (11 modules) |
| `packages/dashboard/src/` | React dashboard (Vite) |
| `packages/core/src/agent-runtime/runtime.ts` | Agent execution engine |
| `.kiro/specs/seraphim-os-core/` | Full spec (requirements, design, tasks) |
| `.kiro/steering/deployment-safety.md` | Deployment rules |
| `scripts/deploy.sh` | Full deploy script |
| `scripts/check-health.ps1` | Health verification |
| `Dockerfile` | Container build |

## AWS Resources

| Resource | Identifier |
|----------|-----------|
| ECS Cluster | `seraphim-agents` |
| ECS Service | `Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx` |
| ALB | `seraphim-api-alb-1857113134` |
| Target Group | `seraphim-ecs-targets/6d51767b64e0dd5c` |
| S3 Dashboard | `seraphim-dashboard-live` |
| ECR Repo | `cdk-hnb659fds-container-assets-562887205007-us-east-1` |
| Security Group | `sg-00636a373f0679058` |
| Log Group | `/seraphim/agent-runtime` |
| Region | `us-east-1` |
| Account | `562887205007` |

## The King's Priorities
1. Agents must be REAL agents (memory, tools, execution traces) — not chatbots
2. Revenue generation through ZionX app submissions
3. Dashboard must show REAL data — no mock data ever
4. System must self-improve (Shaar Agent observes and recommends)
5. Token cost DOWN, revenue UP
