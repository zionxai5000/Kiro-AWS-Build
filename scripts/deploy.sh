#!/bin/bash
# SeraphimOS Deploy Script — builds and deploys both dashboard (S3) and backend (ECS)
set -e

REGION="us-east-1"
ACCOUNT_ID="562887205007"
ECR_REPO="cdk-hnb659fds-container-assets-${ACCOUNT_ID}-${REGION}"
CLUSTER="seraphim-agents"
IMAGE_TAG="latest-$(date +%Y%m%d-%H%M%S)"

echo "🚀 SeraphimOS Deploy"
echo "===================="

# 1. Deploy Dashboard to S3
echo ""
echo "📦 Step 1: Deploying dashboard to S3..."
BUCKET=$(aws s3 ls --region $REGION | grep -o 'seraphim[^ ]*dashboard[^ ]*' | head -1)
if [ -z "$BUCKET" ]; then
  BUCKET=$(aws s3 ls --region $REGION | grep -o 'seraphim[^ ]*static[^ ]*' | head -1)
fi
if [ -z "$BUCKET" ]; then
  echo "   ⚠️  Could not find dashboard S3 bucket. Listing all buckets:"
  aws s3 ls --region $REGION
  echo "   Set BUCKET manually and run: aws s3 sync packages/dashboard/dist/ s3://\$BUCKET/ --delete"
else
  echo "   Syncing to s3://$BUCKET/"
  aws s3 sync packages/dashboard/dist/ "s3://$BUCKET/" --delete --region $REGION
  echo "   ✅ Dashboard deployed"
fi

# 2. Build and push Docker image
echo ""
echo "🐳 Step 2: Building Docker image..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

docker build -t seraphim-runtime:${IMAGE_TAG} .
docker tag seraphim-runtime:${IMAGE_TAG} "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
docker push "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
echo "   ✅ Image pushed: ${IMAGE_TAG}"

# 3. Update ECS service
echo ""
echo "🔄 Step 3: Updating ECS service..."
SERVICE=$(aws ecs list-services --cluster $CLUSTER --region $REGION --query "serviceArns[0]" --output text)
if [ -z "$SERVICE" ] || [ "$SERVICE" = "None" ]; then
  echo "   ⚠️  No ECS service found in cluster $CLUSTER"
  echo "   You may need to update the task definition manually with the new image."
else
  aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment --region $REGION > /dev/null
  echo "   ✅ ECS service force-redeployed: $SERVICE"
fi

echo ""
echo "✅ Deploy complete! Changes will be live in ~2 minutes."
echo "   Dashboard: Check your CloudFront/S3 URL"
echo "   Backend: ECS will pull the new image and restart"
