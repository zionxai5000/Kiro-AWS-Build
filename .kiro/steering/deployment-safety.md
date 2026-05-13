---
inclusion: fileMatch
fileMatchPattern: "**/deploy*,**/Dockerfile,**/production-server*"
---

# SeraphimOS Deployment Safety Rules

## Critical Lessons Learned

The May 2026 outage was caused by:
1. **Rapid successive ECS deployments** — each force-deployment creates a new task with a new IP, but the ALB target group can get stuck pointing to a stale IP
2. **Bootstrap hanging** — AWS SDK calls (Secrets Manager, Aurora) with no timeout blocked the event loop, preventing health check responses
3. **Cross-package imports** — dynamic `import()` paths that work in source don't resolve in the compiled Docker container

## Deployment Checklist (MANDATORY)

Before ANY deployment to ECS:

- [ ] Code compiles: `npx tsc --build packages/services/tsconfig.json` exits 0
- [ ] Docker builds: `docker build -t seraphim-runtime:latest .` succeeds
- [ ] Local test: `docker run --rm -p 3001:3000 seraphim-runtime:latest` responds to `GET /health` within 10 seconds
- [ ] Single deployment: No other deployment is currently rolling out
- [ ] After deploy: Verify target health matches running task IP

## Post-Deployment Verification

After every ECS deployment:

```powershell
# 1. Get the running task's IP
$taskArn = aws ecs list-tasks --cluster seraphim-agents --region us-east-1 --query "taskArns[0]" --output text
$taskIp = aws ecs describe-tasks --cluster seraphim-agents --tasks $taskArn --region us-east-1 --query "tasks[0].attachments[0].details[?name=='privateIPv4Address'].value" --output text

# 2. Check target group has the correct IP
aws elbv2 describe-target-health --target-group-arn "arn:aws:elasticloadbalancing:us-east-1:562887205007:targetgroup/seraphim-ecs-targets/6d51767b64e0dd5c" --region us-east-1

# 3. If IPs don't match, fix it:
aws elbv2 deregister-targets --target-group-arn $TG --targets "Id=<OLD_IP>,Port=3000" --region us-east-1
aws elbv2 register-targets --target-group-arn $TG --targets "Id=$taskIp,Port=3000" --region us-east-1
```

## Architecture Rules

- The production server MUST start the HTTP listener BEFORE any async bootstrap
- ALL AWS SDK calls in bootstrap MUST have timeouts (max 15 seconds)
- The `/health` endpoint MUST respond even during boot (returns `{"status":"booting"}`)
- The `core` package MUST NOT import from `services` package (circular dependency)
- Playwright is for LOCAL observation only — never in the Docker container

## ALB Target Group Configuration

- Health check path: `/health`
- Protocol: HTTP
- Port: 3000 (traffic-port)
- Timeout: 30 seconds
- Interval: 60 seconds
- Unhealthy threshold: 5
- Healthy threshold: 2

## Recovery Procedure

If the backend goes down (502):

1. Check CloudWatch logs: `aws logs get-log-events --log-group-name "/seraphim/agent-runtime" ...`
2. Check target health: `aws elbv2 describe-target-health ...`
3. Compare task IP vs registered target IP
4. If IP mismatch: deregister old, register new
5. If container crashing: roll back to last known working revision
6. NEVER deploy a fix without testing locally first
