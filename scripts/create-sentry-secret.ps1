$ErrorActionPreference = 'Continue'

$secretName = 'seraphim/sentry'
$region = 'us-east-1'

# Placeholder structure. Replace authToken via console after creation.
$placeholder = @{
  authToken = 'REPLACE_ME'
  org       = 'REPLACE_ME'   # e.g. zionx
  project   = ''             # leave empty — will be created per-app
} | ConvertTo-Json -Compress

Write-Output "=== Checking if secret already exists ==="
$exists = aws secretsmanager describe-secret --secret-id $secretName --region $region 2>&1
$existsCode = $LASTEXITCODE

if ($existsCode -eq 0) {
  Write-Output "Secret '$secretName' already exists. Skipping create."
  $exists | Out-String | Write-Output
} else {
  Write-Output "=== Creating secret '$secretName' ==="
  aws secretsmanager create-secret `
    --name $secretName `
    --description "Sentry API auth token + org/project for the ZionX app-development factory diagnostics pipeline." `
    --secret-string $placeholder `
    --region $region 2>&1 | Out-String | Write-Output
  Write-Output ""
  Write-Output "Secret created with placeholder values."
  Write-Output ""
  Write-Output "Next: replace authToken (and org if not 'zionx') via AWS Console:"
  Write-Output "  https://console.aws.amazon.com/secretsmanager/home?region=$region#!/secret?name=$secretName"
  Write-Output "Or via CLI:"
  Write-Output "  aws secretsmanager update-secret --secret-id $secretName --region $region --secret-string '{\"authToken\":\"sntrys_...\",\"org\":\"zionx\",\"project\":\"\"}'"
}
