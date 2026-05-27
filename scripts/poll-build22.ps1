$ErrorActionPreference = 'Continue'
$env:EXPO_TOKEN = "9wxnZzziK6GnuIOXWsFYLSEbjkgjyw4EWTnh9WL9"
$buildId = "9498e646-c06a-4067-82be-df40b7cba523"
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
  if ($jsonStart -lt 0) { Start-Sleep -Seconds 30; continue }
  try {
    $build = ConvertFrom-Json $raw.Substring($jsonStart)
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    Write-Output "$(Get-Date -Format 'HH:mm:ss') [+${elapsed}s] Build #22: $($build.status)"
    if ($build.status -in 'FINISHED','ERRORED','CANCELED') {
      Write-Output "Status: $($build.status)"
      Write-Output "Duration: $($build.metrics.buildDuration)s"
      Write-Output "Artifact: $($build.artifacts.applicationArchiveUrl)"
      if ($build.error) { Write-Output "Error: $($build.error.message)" }
      $build | ConvertTo-Json -Depth 30 | Set-Content "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build22-meta.json"
      exit 0
    }
  } catch { Write-Output "parse error" }
  Start-Sleep -Seconds 30
}
exit 1
