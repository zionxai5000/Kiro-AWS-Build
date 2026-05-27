$ErrorActionPreference = 'Continue'
$env:EXPO_TOKEN = "9wxnZzziK6GnuIOXWsFYLSEbjkgjyw4EWTnh9WL9"
$buildId = "76a87c19-36c9-4388-87f6-3a303e98abe8"
$workspaceDir = "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\workspaces\proj-1779820658954-0bc986e3"

$start = Get-Date
$maxMinutes = 60

while (((Get-Date) - $start).TotalMinutes -lt $maxMinutes) {
  $tempFile = [IO.Path]::GetTempFileName()
  $cmdLine = "cd /d `"$workspaceDir`" && eas build:view $buildId --json > `"$tempFile`" 2>&1"
  cmd /c $cmdLine | Out-Null
  $raw = Get-Content $tempFile -Raw
  Remove-Item $tempFile -Force
  $jsonStart = $raw.IndexOf('{')
  if ($jsonStart -lt 0) {
    Write-Output "$(Get-Date -Format 'HH:mm:ss') - parse error"
    Start-Sleep -Seconds 30
    continue
  }
  try {
    $build = ConvertFrom-Json $raw.Substring($jsonStart)
    $status = $build.status
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    Write-Output "$(Get-Date -Format 'HH:mm:ss') [+${elapsed}s] Build #20 status: $status"
    if ($status -eq 'FINISHED' -or $status -eq 'ERRORED' -or $status -eq 'CANCELED') {
      Write-Output ""
      Write-Output "=== FINAL ==="
      Write-Output "Status: $status"
      Write-Output "Duration: $($build.metrics.buildDuration)s"
      Write-Output "Artifact: $($build.artifacts.applicationArchiveUrl)"
      if ($build.error) { Write-Output "Error: $($build.error.message)" }
      $build | ConvertTo-Json -Depth 30 | Set-Content "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build20-meta.json"
      exit 0
    }
  } catch {
    Write-Output "Parse error"
  }
  Start-Sleep -Seconds 30
}
exit 1
