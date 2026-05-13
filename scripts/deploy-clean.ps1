# Clean deployment script — properly formats the task definition JSON
$ErrorActionPreference = "Stop"
$REGION = "us-east-1"
$CLUSTER = "seraphim-agents"
$SERVICE = "Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx"
$NEW_IMAGE = "562887205007.dkr.ecr.us-east-1.amazonaws.com/cdk-hnb659fds-container-assets-562887205007-us-east-1:shaar-v3-noplaywright"

Write-Host "Step 1: Get working task definition (rev 44)..."
$rawJson = aws ecs describe-task-definition --task-definition "SeraphimdevComputeAgentRuntimeTaskDef2B3755BC:44" --region $REGION --output json
$parsed = $rawJson | ConvertFrom-Json
$td = $parsed.taskDefinition

Write-Host "  Current image: $($td.containerDefinitions[0].image)"

# Update image
$td.containerDefinitions[0].image = $NEW_IMAGE
Write-Host "  New image: $NEW_IMAGE"

# Build a clean task definition for registration (only allowed fields)
# ECS register-task-definition rejects fields like taskDefinitionArn, revision, status, etc.
$cleanDef = @{
    family = $td.family
    networkMode = $td.networkMode
    requiresCompatibilities = @($td.requiresCompatibilities)
    cpu = $td.cpu
    memory = $td.memory
    executionRoleArn = $td.executionRoleArn
    taskRoleArn = $td.taskRoleArn
    containerDefinitions = @(
        @{
            name = $td.containerDefinitions[0].name
            image = $NEW_IMAGE
            cpu = $td.containerDefinitions[0].cpu
            memory = $td.containerDefinitions[0].memory
            essential = $td.containerDefinitions[0].essential
            portMappings = @($td.containerDefinitions[0].portMappings | ForEach-Object {
                @{ containerPort = $_.containerPort; hostPort = $_.hostPort; protocol = $_.protocol }
            })
            environment = @(
                @($td.containerDefinitions[0].environment | ForEach-Object {
                    @{ name = $_.name; value = $_.value }
                })
                @{ name = "DASHBOARD_URL"; value = "http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com" }
                @{ name = "SHAAR_USE_PLAYWRIGHT"; value = "false" }
            )
            logConfiguration = @{
                logDriver = $td.containerDefinitions[0].logConfiguration.logDriver
                options = @{}
            }
        }
    )
}

# Copy log options if they exist
if ($td.containerDefinitions[0].logConfiguration.options) {
    $logOpts = @{}
    $td.containerDefinitions[0].logConfiguration.options.PSObject.Properties | ForEach-Object {
        $logOpts[$_.Name] = $_.Value
    }
    $cleanDef.containerDefinitions[0].logConfiguration.options = $logOpts
}

$outPath = "C:\Users\antho\Kiro Seraphim\clean-task-def.json"
$cleanDef | ConvertTo-Json -Depth 10 | Set-Content $outPath -Encoding UTF8
Write-Host "Step 2: Clean task def written to $outPath"

Write-Host "Step 3: Registering new task definition..."
$regResult = aws ecs register-task-definition --cli-input-json "file://$outPath" --region $REGION --output json
$newArn = ($regResult | ConvertFrom-Json).taskDefinition.taskDefinitionArn
Write-Host "  New revision: $newArn"

Write-Host "Step 4: Updating ECS service..."
aws ecs update-service --cluster $CLUSTER --service $SERVICE --task-definition $newArn --force-new-deployment --region $REGION --query "service.deployments[0].status" --output text

Write-Host "Step 5: DONE! Backend will be live in ~2 minutes with the new image."
