---
tags: [architecture, issues, bugs]
---

# Known Issues

## Critical (Blocking Functionality)

- [ ] **Aurora PostgreSQL bootstrap timeout** — Secrets Manager unreachable from Fargate. Likely missing VPC endpoint for Secrets Manager. Falls back to in-memory persistence. #infrastructure
- [ ] **WebSocket connection fails** — ALB WebSocket handshake not completing. Real-time updates not working. #networking
- [ ] **PgPersistence SQL errors** — `$1` parameter binding issue. Database writes fail. #database

## Important (Degraded Functionality)

- [ ] **Shaar Guardian production-blind** — Playwright not available in Fargate container. Using HTTP-based fallback which can analyze DOM but not render visually. #shaar
- [ ] **No automated testing in CI** — Tests exist and pass locally but CI pipeline doesn't enforce coverage gates yet. #testing

## Moderate (Should Fix)

- [ ] **Stale ALB target group IPs** — After rapid deployments, old task IPs can linger in target group. Deployment safety hook mitigates but doesn't prevent entirely. #deployment
- [ ] **Core package import isolation** — `core` package must NOT import from `services` (causes container crash). Need better module boundary enforcement. #architecture

## Resolution Priority

1. VPC endpoint for Secrets Manager (unblocks Aurora, which unblocks persistent state)
2. WebSocket ALB configuration (unblocks real-time dashboard)
3. PgPersistence parameter binding (unblocks database writes)
4. CI test enforcement (unblocks quality gates)
