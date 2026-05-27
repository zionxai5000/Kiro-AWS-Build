$ErrorActionPreference = 'Continue'
$tempFile = [IO.Path]::GetTempFileName()
$cmdLine = "aws secretsmanager get-secret-value --secret-id seraphim/github-token --region us-east-1 --query SecretString --output text > `"$tempFile`" 2>&1"
cmd /c $cmdLine | Out-Null
$raw = Get-Content $tempFile -Raw
Remove-Item $tempFile -Force
$raw = $raw.Trim()
# Could be JSON or plain string
if ($raw.StartsWith('{')) {
  $obj = $raw | ConvertFrom-Json
  # Look for common token keys
  if ($obj.token) { Write-Output $obj.token }
  elseif ($obj.GITHUB_TOKEN) { Write-Output $obj.GITHUB_TOKEN }
  elseif ($obj.PAT) { Write-Output $obj.PAT }
  elseif ($obj.value) { Write-Output $obj.value }
  else { Write-Output ($obj | ConvertTo-Json) }
} else {
  Write-Output $raw
}
