$ErrorActionPreference = 'Continue'
$env:EXPO_TOKEN = "9wxnZzziK6GnuIOXWsFYLSEbjkgjyw4EWTnh9WL9"
$buildId = "823b380d-00af-4b8d-9e68-1d59dbbf2a28"
$workspaceDir = "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\workspaces\proj-1779820658954-0bc986e3"

Write-Output "=== Fetching Build #18 metadata ==="
$tempFile = [IO.Path]::GetTempFileName()
$cmdLine = "cd /d `"$workspaceDir`" && eas build:view $buildId --json > `"$tempFile`" 2>&1"
cmd /c $cmdLine | Out-Null
$raw = Get-Content $tempFile -Raw
Remove-Item $tempFile -Force
$jsonStart = $raw.IndexOf('{')
if ($jsonStart -lt 0) { Write-Output "No JSON: $raw"; exit 1 }
$build = ConvertFrom-Json $raw.Substring($jsonStart)

Write-Output "Status: $($build.status)"
Write-Output "Phase that errored: $($build.error.errorCode)"
Write-Output "Error message: $($build.error.message)"
Write-Output "Started: $($build.createdAt)"
Write-Output "Completed: $($build.completedAt)"
Write-Output "Duration: $($build.metrics.buildDuration)s"
Write-Output "Log file count: $($build.logFiles.Count)"

$build | ConvertTo-Json -Depth 30 | Set-Content "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build18-meta.json"

$logDir = "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build18-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

for ($i = 0; $i -lt $build.logFiles.Count; $i++) {
  $logUrl = $build.logFiles[$i]
  $rawFile = Join-Path $logDir "log-$i.raw"
  Write-Output "Downloading log $i with curl"
  & curl.exe -s -L -o $rawFile $logUrl
  $size = (Get-Item $rawFile).Length
  Write-Output "  size: $size bytes"
}
