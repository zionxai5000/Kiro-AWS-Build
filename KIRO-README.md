# KIRO-README — For Kiro AI on Any Machine

> **This file is for Kiro (the AI) to read when this repo is cloned on a new machine.**
> It tells you everything you need to know to continue working on SeraphimOS.

## What Is This Project?

SeraphimOS is an AI-powered autonomous orchestration platform. It runs a hierarchy of AI agents
that execute across business pillars (app development, media production, trading). The primary
user (the "King") provides vision; Seraphim (the top-level agent) drives execution.

The platform is LIVE and deployed on AWS. The agents respond via a web dashboard.

## First Steps on a New Machine

### 1. Install Dependencies
```bash
npm ci
```

### 2. Configure AWS CLI
```bash
aws configure
# Region: us-east-1
# Account: 562887205007
# Or use AWS SSO if configured
```

### 3. Verify the Backend is Running
```powershell
powershell -File scripts/check-health.ps1
```
Or manually:
```bash
curl http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com/health
```

### 4. Access the Dashboard
Open in any browser: http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com

Login credentials are in AWS Cognito (User Pool in us-east-1).

### 5. Read the Session Summary
```
.kiro/context/session-summary.md
```
This file contains the current state, recent work, pending tasks, and known issues.

## Project Structure

```
packages/
  core/       — Agent runtime, state machine, interfaces, types
  services/   — System services (Mishmar, Zikaron, Otzar, XO Audit, Event Bus, Shaar Agent)
  drivers/    — External service adapters (App Store, YouTube, Kalshi, etc.)
  app/        — Application layer (ZionX, ZXMG, Zion Alpha, Eretz)
  dashboard/  — React + Vite web dashboard
  infra/      — AWS CDK infrastructure stacks
scripts/      — Deploy, health check, and utility scripts
.kiro/
  specs/      — Requirements, design, and implementation tasks
  steering/   — Rules and guidelines for Kiro
  context/    — Session summaries and continuity data
  hooks/      — Automated triggers
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build all packages |
| `npm test` | Run all tests (Vitest) |
| `npx vitest run packages/services/src/shaar-agent/` | Run Shaar Agent tests |
| `npx vite build` (in packages/dashboard) | Build dashboard for S3 |
| `docker build -t seraphim-runtime:latest .` | Build backend container |
| `powershell -File scripts/check-health.ps1` | Verify backend health |
| `powershell -File scripts/deploy.sh` | Full deploy (dashboard + backend) |

## Deployment Rules (CRITICAL)

Read `.kiro/steering/deployment-safety.md` before ANY deployment.

Key rules:
- NEVER do rapid successive ECS deployments
- ALWAYS verify target group IP matches running task IP after deploy
- ALWAYS test Docker image locally before pushing
- Bootstrap has timeouts — server works in-memory if Aurora is unreachable

## Current Known Issues

1. Aurora PostgreSQL bootstrap times out (VPC endpoint likely missing for Secrets Manager)
2. WebSocket connection fails (ALB Sec-WebSocket-Accept header issue)
3. Shaar Guardian can't use Playwright in Fargate (uses HTTP fallback)
4. PgPersistence has SQL parameter binding errors (non-fatal)

## The Spec

The full specification is in `.kiro/specs/seraphim-os-core/`:
- `requirements.md` — 58+ requirements with acceptance criteria
- `design.md` — Full architecture, interfaces, data models
- `tasks.md` — Implementation plan (3000+ lines, most tasks complete)
- `capabilities.md` — System capabilities matrix

## Git Commit Convention

Every commit includes a session summary update in `.kiro/context/session-summary.md`
so the next person (or Kiro instance) can pick up exactly where work left off.
