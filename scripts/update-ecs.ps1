$ErrorActionPreference = "Stop"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$SERVICE = "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx"
$NEW_IMAGE = "562887205007.dkr.ecr.us-east-1.amazonaws.com/cdk-hnb659fds-container-assets-562887205007-us-east-1:latest-20260513-093401"

Write-Host "Getting current task definition..."
$tdJson = aws ecs describe-task-definition --task-definition SeraphimdevComputeAgentRuntimeTaskDef2B3755BC --region $REGION --output json | ConvertFrom-Json
$td = $tdJson.taskDefinition

Write-Host "Current image: $($td.containerDefinitions[0].image)"
Write-Host "New image: $NEW_IMAGE"

# Update the image
$td.containerDefinitions[0].image = $NEW_IMAGE

# Build the register command input
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
$registerJson | Set-Content "new-task-def.json"

Write-Host "Registering new task definition..."
$result = aws ecs register-task-definition --cli-input-json file://new-task-def.json --region $REGION --output json | ConvertFrom-Json
$newRevision = $result.taskDefinition.taskDefinitionArn
Write-Host "New revision: $newRevision"

Write-Host "Updating ECS service..."
aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $newRevision --force-new-deployment --region $REGION --query "service.deployments[0].status" --output text

Write-Host "Done! ECS will roll out the new task in ~2 minutes."
