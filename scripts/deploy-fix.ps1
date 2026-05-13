$ErrorActionPreference = "Continue"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$SERVICE = "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx"
$NEW_IMAGE = "562887205007.dkr.ecr.us-east-1.amazonaws.com/cdk-hnb659fds-container-assets-562887205007-us-east-1:shaar-v2-20260513-101207"

# Get the working task definition (revision 44 was the last working one)
Write-Host "1. Getting task definition revision 44 (last working)..."
$raw = aws ecs describe-task-definition --task-definition "SeraphimdevComputeAgentRuntimeTaskDef2B3755BC:44" --region $REGION --output json
$td = ($raw | ConvertFrom-Json).taskDefinition

Write-Host "   Current image: $($td.containerDefinitions[0].image)"

# Update image
$td.containerDefinitions[0].image = $NEW_IMAGE
Write-Host "   New image: $NEW_IMAGE"

# Add DASHBOARD_URL to environment
$env_list = [System.Collections.ArrayList]@()
foreach ($e in $td.containerDefinitions[0].environment) { [void]$env_list.Add($e) }
$has_url = $env_list | Where-Object { $_.name -eq "DASHBOARD_URL" }
if (-not $has_url) {
    [void]$env_list.Add(@{ name = "DASHBOARD_URL"; value = "http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com" })
}
$has_pw = $env_list | Where-Object { $_.name -eq "SHAAR_USE_PLAYWRIGHT" }
if (-not $has_pw) {
    [void]$env_list.Add(@{ name = "SHAAR_USE_PLAYWRIGHT"; value = "true" })
}
$td.containerDefinitions[0].environment = $env_list.ToArray()

# Build minimal register input
$input = [ordered]@{
    family = $td.family
    networkMode = $td.networkMode
    requiresCompatibilities = $td.requiresCompatibilities
    cpu = $td.cpu
    memory = $td.memory
    executionRoleArn = $td.executionRoleArn
    taskRoleArn = $td.taskRoleArn
    containerDefinitions = @($td.containerDefinitions[0])
}

$json = $input | ConvertTo-Json -Depth 20 -Compress
[System.IO.File]::WriteAllText("$PSScriptRoot\..\new-task-def.json", $json)
Write-Host "2. Task definition JSON written"

# Register new revision
Write-Host "3. Registering new task definition..."
$regResult = aws ecs register-task-definition --cli-input-json "file://new-task-def.json" --region $REGION --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: $regResult"
    Write-Host "   Trying alternative: update service with force-new-deployment on revision 44..."
    aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition "SeraphimdevComputeAgentRuntimeTaskDef2B3755BC:44" --force-new-deployment --region $REGION --output text
    Write-Host "   Rolled back to revision 44"
    exit 0
}

$newArn = ($regResult | ConvertFrom-Json).taskDefinition.taskDefinitionArn
Write-Host "   New revision: $newArn"

# Update service
Write-Host "4. Updating ECS service..."
aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $newArn --force-new-deployment --region $REGION --query "service.deployments[0].status" --output text
Write-Host "5. Done! Backend will be live in ~2 minutes."
