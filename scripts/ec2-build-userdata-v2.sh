#!/bin/bash
set -ex
exec > /var/log/seraphim-build.log 2>&1

# Also tee to console so EC2 console-output shows progress
exec > >(tee /dev/console) 2>&1

echo "=== SeraphimOS EC2 build VM @ $(date) ==="

dnf install -y docker git nodejs
systemctl start docker

cd /opt
git clone --depth 1 -b main https://github.com/zionxai5000/Kiro-AWS-Build.git repo
cd repo

REGION=us-east-1
ACCOUNT_ID=562887205007
ECR_REPO=cdk-hnb659fds-container-assets-562887205007-us-east-1
SHA=$(git rev-parse --short HEAD)
TAG="main-${SHA}"
IMG="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${TAG}"

echo "=== Building image: ${IMG} ==="
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com
docker build -t $IMG .
docker push $IMG

echo "=== Registering new task definition ==="
aws ecs describe-task-definition \
  --task-definition SeraphimdevComputeAgentRuntimeTaskDef2B3755BC \
  --region $REGION \
  --query 'taskDefinition' > current-td.json

cat > update-td.js <<JS
const fs = require('fs');
const td = JSON.parse(fs.readFileSync('current-td.json'));
td.containerDefinitions[0].image = process.env.IMG;
const out = {
  family: td.family,
  networkMode: td.networkMode,
  requiresCompatibilities: td.requiresCompatibilities,
  cpu: td.cpu,
  memory: td.memory,
  executionRoleArn: td.executionRoleArn,
  taskRoleArn: td.taskRoleArn,
  containerDefinitions: td.containerDefinitions,
};
fs.writeFileSync('new-td.json', JSON.stringify(out));
JS

IMG=$IMG node update-td.js
NEW_ARN=$(aws ecs register-task-definition --cli-input-json file://new-td.json --region $REGION --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Registered $NEW_ARN"

echo "=== Force ECS deployment ==="
aws ecs update-service \
  --cluster seraphim-agents \
  --service Seraphim-dev-Compute-AgentRuntimeServiceA417A3CA-Z1fTovcH1Dpx \
  --task-definition $NEW_ARN \
  --force-new-deployment \
  --region $REGION \
  --query 'service.deployments[0].status' --output text

echo "=== DONE @ $(date) ==="

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
INSTANCE_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION
