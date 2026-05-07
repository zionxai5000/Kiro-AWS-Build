#!/bin/bash
# Fix API Gateway integration — change port 3000 to port 80 (ALB listener port)
# Run this script once to fix the dashboard connectivity issue.

REST_API_ID="5uxld83daf"
ALB_DNS="seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com"

echo "Fixing API Gateway integrations to use ALB port 80..."

# Get all resources
RESOURCES=$(aws apigateway get-resources --rest-api-id $REST_API_ID --query "items[*].{id:id,path:path}" --output json)

echo "Resources found:"
echo "$RESOURCES" | python3 -c "import sys,json; [print(f'  {r[\"path\"]} ({r[\"id\"]})') for r in json.load(sys.stdin)]" 2>/dev/null || echo "$RESOURCES"

# Fix /health GET
echo ""
echo "Updating /health integration..."
aws apigateway put-integration \
  --rest-api-id $REST_API_ID \
  --resource-id 20bbf7 \
  --http-method GET \
  --type HTTP_PROXY \
  --integration-http-method GET \
  --uri "http://${ALB_DNS}/health"

echo ""
echo "Deploying API to v1 stage..."
aws apigateway create-deployment \
  --rest-api-id $REST_API_ID \
  --stage-name v1 \
  --description "Fix: ALB port 80 integration"

echo ""
echo "Done! Test with:"
echo "  curl https://${REST_API_ID}.execute-api.us-east-1.amazonaws.com/v1/health"
