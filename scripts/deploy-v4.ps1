$ErrorActionPreference = "Continue"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$SERVICE = "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx"
$NEW_IMAGE = "562887205007.dkr.ecr.us-east-1.amazonaws.com/cdk-hnb659fds-container-assets-562887205007-us-east-1:fix-timeout-v4"

Write-Host "1. Getting task def 44..."
$raw = aws ecs describe-task-definition --task-definition "SeraphimdevComputeAgentRuntimeTaskDef2B3755BC:44" --region $REGION --output json
$td = ($raw | ConvertFrom-Json).taskDefinition
$td.containerDefinitions[0].image = $NEW_IMAGE
Write-Host "   Image: $NEW_IMAGE"

$input = [ordered]@{
    family = $td.family
    networkMode = $td.networkMode
    requiresCompatibilities = @($td.requiresCompatibilities)
    cpu = $td.cpu
    memory = $td.memory
    executionRoleArn = $td.executionRoleArn
    taskRoleArn = $td.taskRoleArn
    containerDefinitions = @($td.containerDefinitions[0])
}
$json = $input | ConvertTo-Json -Depth 20 -Compress
[System.IO.File]::WriteAllText("C:\Users\antho\Kiro Seraphim\new-task-def.json", $json)

Write-Host "2. Registering..."
$regRaw = aws ecs register-task-definition --cli-input-json "file://C:/Users/antho/Kiro Seraphim/new-task-def.json" --region $REGION --output json 2>&1
$newArn = ($regRaw | ConvertFrom-Json).taskDefinition.taskDefinitionArn
Write-Host "   Revision: $newArn"

Write-Host "3. Updating service..."
aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $newArn --force-new-deployment --region $REGION --query "service.deployments[0].status" --output text
Write-Host "4. DONE — backend will be live in ~2 min"
