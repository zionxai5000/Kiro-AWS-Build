---
tags: [architecture, deployment, operations]
---

# Deployment Guide

## Current Infrastructure

- **Region**: us-east-1
- **Container Registry**: ECR `cdk-hnb659fds-container-assets-562887205007-us-east-1`
- **Compute**: ECS Fargate cluster `seraphim-agents`
- **Database**: Aurora PostgreSQL (multi-AZ, serverless v2)
- **Dashboard**: S3 static site + CloudFront

## Deployment Process

1. Build Docker image
2. Push to ECR
3. Update ECS task definition (new image tag)
4. ECS performs rolling deployment
5. ALB health check validates new task
6. Old task drains and terminates

## Safety Rules (from steering file)

- **Never deploy without passing tests locally first**
- **Never force-deploy over a failing health check** — fix the root cause
- **After deployment: verify ALB target group has correct task IP**
- **If health check fails: check logs in `/seraphim/agent-runtime`**
- **If IP mismatch: deregister stale IP, register new task IP manually**

## Health Check

```
GET /health
Expected: 200 OK with {"status": "healthy", "agents": [...]}
```

## Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy.sh` | Full deploy (build → push → update task def) |
| `scripts/check-health.ps1` | Verify deployment health |

## Related

- [[Hooks and Steering]] — Deployment safety hooks and steering rules (detailed)
- [[Known Issues]]
- [[System Status]]
- [[Architecture Overview]]
