$ErrorActionPreference = 'Continue'
$env:EXPO_TOKEN = "9wxnZzziK6GnuIOXWsFYLSEbjkgjyw4EWTnh9WL9"
$buildId = "823b380d-00af-4b8d-9e68-1d59dbbf2a28"
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
    Write-Output "$(Get-Date -Format 'HH:mm:ss') - Could not parse build status"
    Start-Sleep -Seconds 30
    continue
  }
  try {
    $build = ConvertFrom-Json $raw.Substring($jsonStart)
    $status = $build.status
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    Write-Output "$(Get-Date -Format 'HH:mm:ss') [+${elapsed}s] Build #18 status: $status"
    if ($status -eq 'FINISHED' -or $status -eq 'ERRORED' -or $status -eq 'CANCELED') {
      Write-Output ""
      Write-Output "=== FINAL ==="
      Write-Output "Status: $status"
      Write-Output "Duration: $($build.metrics.buildDuration)s"
      Write-Output "Artifact: $($build.artifacts.applicationArchiveUrl)"
      $build | ConvertTo-Json -Depth 30 | Set-Content "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build18-meta.json"
      exit 0
    }
  } catch {
    Write-Output "$(Get-Date -Format 'HH:mm:ss') Parse error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 30
}

Write-Output "Timed out after $maxMinutes minutes"
exit 1
