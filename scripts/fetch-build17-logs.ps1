$ErrorActionPreference = 'Continue'
$env:EXPO_TOKEN = "9wxnZzziK6GnuIOXWsFYLSEbjkgjyw4EWTnh9WL9"
$buildId = "89cb1e62-5bde-4313-a0f2-e8d7e9d53881"

Write-Output "=== Fetching Build #17 metadata ==="
$tempFile = [IO.Path]::GetTempFileName()
$cmdLine = "eas build:view $buildId --json > `"$tempFile`" 2>&1"
cmd /c $cmdLine | Out-Null
$raw = Get-Content $tempFile -Raw
Remove-Item $tempFile -Force
$jsonStart = $raw.IndexOf('{')
if ($jsonStart -lt 0) { Write-Output "No JSON found"; exit 1 }
$build = ConvertFrom-Json $raw.Substring($jsonStart)
$build | ConvertTo-Json -Depth 30 | Set-Content "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build17-meta.json"

$logDir = "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build17-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Use curl.exe (built into Windows 10+) which won't mangle bytes
for ($i = 0; $i -lt $build.logFiles.Count; $i++) {
  $logUrl = $build.logFiles[$i]
  $rawFile = Join-Path $logDir "log-$i.raw"
  Write-Output "Downloading log $i with curl"
  & curl.exe -s -L -o $rawFile $logUrl
  $size = (Get-Item $rawFile).Length
  Write-Output "  size: $size bytes"
  $bytes = [IO.File]::ReadAllBytes($rawFile)[0..15]
  $hex = ($bytes | ForEach-Object { '{0:x2}' -f $_ }) -join ' '
  Write-Output "  first 16 bytes: $hex"

  $isGzip = ($bytes[0] -eq 0x1f -and $bytes[1] -eq 0x8b)
  $outFile = Join-Path $logDir "log-$i.txt"
  if ($isGzip) {
    Write-Output "  -> GZIP, decompressing"
    $rawFs = [IO.File]::OpenRead($rawFile)
    $gz = New-Object IO.Compression.GzipStream($rawFs, [IO.Compression.CompressionMode]::Decompress)
    $reader = New-Object IO.StreamReader($gz)
    $content = $reader.ReadToEnd()
    $reader.Close(); $gz.Close(); $rawFs.Close()
    [IO.File]::WriteAllText($outFile, $content)
    Write-Output "  decompressed -> $($content.Length) chars"
  } else {
    Copy-Item $rawFile $outFile -Force
    Write-Output "  copied as plain text"
  }
}

Write-Output ""
Write-Output "=== Done ==="
Get-ChildItem $logDir | ForEach-Object { Write-Output "$($_.Name) - $($_.Length) bytes" }
