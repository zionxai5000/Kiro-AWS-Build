$ErrorActionPreference = "Stop"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$SERVICE = "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx"
$NEW_IMAGE = "562887205007.dkr.ecr.us-east-1.amazonaws.com/cdk-hnb659fds-container-assets-562887205007-us-east-1:shaar-v2-20260513-101207"

Write-Host "Getting current task definition..."
$tdJson = aws ecs describe-task-definition --task-definition SeraphimdevComputeAgentRuntimeTaskDef2B3755BC --region $REGION --output json | ConvertFrom-Json
$td = $tdJson.taskDefinition

Write-Host "Current image: $($td.containerDefinitions[0].image)"
Write-Host "New image: $NEW_IMAGE"

$td.containerDefinitions[0].image = $NEW_IMAGE

# Add DASHBOARD_URL env var if not present
$envVars = $td.containerDefinitions[0].environment
$hasDashUrl = $envVars | Where-Object { $_.name -eq "DASHBOARD_URL" }
if (-not $hasDashUrl) {
    $envVars += @{ name = "DASHBOARD_URL"; value = "http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com" }
    $td.containerDefinitions[0].environment = $envVars
    Write-Host "Added DASHBOARD_URL env var"
}

$registerInput = @{
    family = $td.family
    containerDefinitions = $td.containerDefinitions
    cpu = $td.cpu
    memory = $td.memory
    networkMode = $td.networkMode
    requiresCompatibilities = $td.requiresCompatibilities
    executionRoleArn = $td.executionRoleArn
    taskRoleArn = $td.taskRoleArn
}

$registerJson = $registerInput | ConvertTo-Json -Depth 10
$registerJson | Set-Content "new-task-def.json" -Encoding UTF8

Write-Host "Registering new task definition..."
$result = aws ecs register-task-definition --cli-input-json file://new-task-def.json --region $REGION --output json | ConvertFrom-Json
$newRevision = $result.taskDefinition.taskDefinitionArn
Write-Host "New revision: $newRevision"

Write-Host "Updating ECS service..."
$updateResult = aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $newRevision --force-new-deployment --region $REGION --query "service.deployments[0].status" --output text
Write-Host "Deployment status: $updateResult"
Write-Host "Done! Backend will be live in ~2 minutes."
