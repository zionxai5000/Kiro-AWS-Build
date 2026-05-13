$ErrorActionPreference = "Continue"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$SERVICE = "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx"
$NEW_IMAGE = "562887205007.dkr.ecr.us-east-1.amazonaws.com/cdk-hnb659fds-container-assets-562887205007-us-east-1:shaar-v3-noplaywright"

Write-Host "1. Getting task definition revision 44 (last working)..."
$raw = aws ecs describe-task-definition --task-definition "SeraphimdevComputeAgentRuntimeTaskDef2B3755BC:44" --region $REGION --output json
$td = ($raw | ConvertFrom-Json).taskDefinition

Write-Host "   Old image: $($td.containerDefinitions[0].image)"
$td.containerDefinitions[0].image = $NEW_IMAGE
Write-Host "   New image: $NEW_IMAGE"

# Add env vars
$env_list = [System.Collections.ArrayList]@()
foreach ($e in $td.containerDefinitions[0].environment) { [void]$env_list.Add($e) }
$has_url = $env_list | Where-Object { $_.name -eq "DASHBOARD_URL" }
if (-not $has_url) { [void]$env_list.Add(@{ name = "DASHBOARD_URL"; value = "http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com" }) }
$has_pw = $env_list | Where-Object { $_.name -eq "SHAAR_USE_PLAYWRIGHT" }
if (-not $has_pw) { [void]$env_list.Add(@{ name = "SHAAR_USE_PLAYWRIGHT"; value = "false" }) }
$td.containerDefinitions[0].environment = $env_list.ToArray()

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
[System.IO.File]::WriteAllText("C:\Users\antho\Kiro Seraphim\new-task-def.json", $json)
Write-Host "2. Task def JSON written"

Write-Host "3. Registering..."
$regRaw = aws ecs register-task-definition --cli-input-json "file://C:/Users/antho/Kiro Seraphim/new-task-def.json" --region $REGION --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Register failed: $regRaw"
    exit 1
}
$newArn = ($regRaw | ConvertFrom-Json).taskDefinition.taskDefinitionArn
Write-Host "   Revision: $newArn"

Write-Host "4. Updating service..."
aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $newArn --force-new-deployment --region $REGION --query "service.deployments[0].status" --output text
Write-Host "5. DONE"
