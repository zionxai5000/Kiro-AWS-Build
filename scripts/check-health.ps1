# SeraphimOS Health Check Script
# Run anytime to verify the backend is healthy and targets are aligned
$ErrorActionPreference = "Continue"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$TG_ARN = "arn:aws:elasticloadbalancing:us-east-1:562887205007:targetgroup/seraphim-ecs-targets/6d51767b64e0dd5c"
$ALB_URL = "http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com"

Write-Host "`n=== SeraphimOS Health Check ===" -ForegroundColor Cyan

# 1. Check ALB health endpoint
Write-Host "`n[1] ALB Health Endpoint..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest "$ALB_URL/health" -TimeoutSec 10 -UseBasicParsing
    $health = $r.Content | ConvertFrom-Json
    Write-Host "  Status: $($health.status)" -ForegroundColor Green
    Write-Host "  Agents: $($health.totalAgents) total, $($health.healthyAgents) healthy"
    Write-Host "  Uptime: $([math]::Round($health.uptime / 60, 1)) minutes"
    Write-Host "  Database: $($health.database)"
} catch {
    Write-Host "  BACKEND DOWN: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Check target group health
Write-Host "`n[2] Target Group Health..." -ForegroundColor Yellow
$targets = aws elbv2 describe-target-health --target-group-arn $TG_ARN --region $REGION --output json | ConvertFrom-Json
foreach ($t in $targets.TargetHealthDescriptions) {
    $color = if ($t.TargetHealth.State -eq "healthy") { "Green" } else { "Red" }
    Write-Host "  $($t.Target.Id):$($t.Target.Port) -> $($t.TargetHealth.State)" -ForegroundColor $color
    if ($t.TargetHealth.Reason) { Write-Host "    Reason: $($t.TargetHealth.Reason)" }
}

# 3. Check running task IP matches target
Write-Host "`n[3] Task IP vs Target IP..." -ForegroundColor Yellow
$taskArn = aws ecs list-tasks --cluster $CLUSTER --region $REGION --query "taskArns[0]" --output text
if ($taskArn -and $taskArn -ne "None") {
    $taskIp = aws ecs describe-tasks --cluster $CLUSTER --tasks $taskArn --region $REGION --query "tasks[0].attachments[0].details[?name=='privateIPv4Address'].value" --output text
    $targetIp = $targets.TargetHealthDescriptions[0].Target.Id
    Write-Host "  Task IP: $taskIp"
    Write-Host "  Target IP: $targetIp"
    if ($taskIp -eq $targetIp) {
        Write-Host "  MATCH ✅" -ForegroundColor Green
    } else {
        Write-Host "  MISMATCH ❌ — Run: aws elbv2 deregister-targets ... then register-targets" -ForegroundColor Red
    }
} else {
    Write-Host "  No running tasks found!" -ForegroundColor Red
}

# 4. Check ECS service status
Write-Host "`n[4] ECS Service..." -ForegroundColor Yellow
$svc = aws ecs describe-services --cluster $CLUSTER --services "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx" --region $REGION --query "services[0].{running:runningCount,desired:desiredCount,taskDef:taskDefinition}" --output json | ConvertFrom-Json
Write-Host "  Running: $($svc.running)/$($svc.desired)"
Write-Host "  Task Def: $($svc.taskDef.Split(':')[-1])"

Write-Host "`n=== Done ===" -ForegroundColor Cyan
