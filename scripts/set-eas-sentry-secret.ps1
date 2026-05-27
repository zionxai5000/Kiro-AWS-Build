$ErrorActionPreference = 'Continue'
$env:EXPO_TOKEN = "9wxnZzziK6GnuIOXWsFYLSEbjkgjyw4EWTnh9WL9"

# Read Sentry token from AWS Secrets Manager
$tempFile = [IO.Path]::GetTempFileName()
cmd /c "aws secretsmanager get-secret-value --secret-id seraphim/sentry --region us-east-1 --query SecretString --output text > `"$tempFile`" 2>&1" | Out-Null
$raw = (Get-Content $tempFile -Raw).Trim()
Remove-Item $tempFile -Force

$creds = $raw | ConvertFrom-Json
$token = $creds.authToken
Write-Output "Sentry token: $($token.Substring(0,8))..."

# Set as EAS environment variable scoped to the production build profile.
# Using `eas env:create` (replaces deprecated secret:create).
$workspaceDir = "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\workspaces\proj-1779820658954-0bc986e3"
Set-Location $workspaceDir

# Try `eas env:create` first (newer EAS CLI)
$cmd = "eas env:create --scope project --visibility secret --environment production --name SENTRY_AUTH_TOKEN --value `"$token`" --type string --force --non-interactive 2>&1"
Write-Output "Running: eas env:create ..."
$result = cmd /c $cmd
Write-Output $result
