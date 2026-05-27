$ErrorActionPreference = 'Continue'
$logDir = "C:\Users\eftn\Desktop\githubcopy\Kiro-AWS-Build\scripts\build17-logs"

Write-Output "================================================================"
Write-Output "ANALYZING BUILD #17 LOGS - Expo Module Linking Issue"
Write-Output "================================================================"

$xcodeLog = Get-Content "$logDir\log-0.txt" -Raw
$mainLog  = Get-Content "$logDir\log-1.txt" -Raw

Write-Output ""
Write-Output "============== MAIN LOG (log-1, $($mainLog.Length) chars) =============="
Write-Output ""

# Extract msg fields from JSON-formatted lines if present
$mainLines = $mainLog -split "`n"
Write-Output "Total main log lines: $($mainLines.Count)"

Write-Output ""
Write-Output "----- MAIN LOG: KEY EVENTS / PHASES -----"
$mainLines | ForEach-Object {
  $line = $_
  if ($line -match '"msg":"([^"]*)"') {
    $msg = $matches[1]
    if ($msg -match '(phase|Phase|PHASE|step|Running|Executing|expo-modules-autolinking|pod install|CocoaPods|precompiled|XCTRunner|EXModulesProvider|ExpoModulesCore|EXConstants|autolinking|Pods-|frameworks|UseFrameworks|use_modular_headers|hermes|fabric|TurboModule|new architecture|newArchEnabled|NEW_ARCHITECTURE|RCT_NEW_ARCH_ENABLED|target.*from spec|Installing.*\(.*\)|Generating Pods)' -and $msg -notmatch '^\s*$') {
      Write-Output "  $msg"
    }
  }
}

Write-Output ""
Write-Output "----- MAIN LOG: ERRORS / WARNINGS -----"
$mainLines | ForEach-Object {
  $line = $_
  if ($line -match '"msg":"([^"]*)"') {
    $msg = $matches[1]
    if ($msg -match '(error|Error|ERROR|warning|Warning|fail|Fail|missing|Missing|skip|Skip|not found|cannot|Cannot|unable|Unable)' -and $msg -notmatch '^\s*$') {
      if ($msg.Length -gt 250) { $msg = $msg.Substring(0, 250) }
      Write-Output "  $msg"
    }
  }
}

Write-Output ""
Write-Output "============== XCODE LOG (log-0, $($xcodeLog.Length) chars) =============="

# For xcode log - might be plain text not JSON
$xcodeLines = $xcodeLog -split "`n"
Write-Output "Total xcode log lines: $($xcodeLines.Count)"

Write-Output ""
Write-Output "----- XCODE LOG: pod install output -----"
$inPodPhase = $false
$podCount = 0
foreach ($line in $xcodeLines) {
  if ($line -match 'pod install|Analyzing dependencies|Installing|Generating Pods|Sending stats') {
    Write-Output "  $line"
    $podCount++
    if ($podCount -gt 200) { break }
  }
}

Write-Output ""
Write-Output "----- XCODE LOG: Lines mentioning Expo modules -----"
$xcodeLines | Select-String -Pattern "Expo|EX[A-Z]|ExpoModulesCore|expo-modules-autolinking|autolinking|RCT.*Expo" -SimpleMatch:$false | Select-Object -First 50 | ForEach-Object {
  $l = $_.Line
  if ($l.Length -gt 250) { $l = $l.Substring(0, 250) }
  Write-Output "  L$($_.LineNumber): $l"
}

Write-Output ""
Write-Output "----- XCODE LOG: Linking errors / warnings -----"
$xcodeLines | Select-String -Pattern "Undefined symbols|ld:.*error|ld:.*warning|framework not found|library not found|duplicate symbol" | Select-Object -First 30 | ForEach-Object {
  Write-Output "  L$($_.LineNumber): $($_.Line)"
}

Write-Output ""
Write-Output "----- XCODE LOG: Final compilation/linking errors -----"
$xcodeLines | Select-String -Pattern "error:|Error:" | Select-Object -First 20 | ForEach-Object {
  $l = $_.Line
  if ($l.Length -gt 300) { $l = $l.Substring(0, 300) }
  Write-Output "  L$($_.LineNumber): $l"
}
