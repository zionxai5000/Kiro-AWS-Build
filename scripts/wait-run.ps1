param([string]$RunId)
$gh = aws secretsmanager get-secret-value --secret-id seraphim/github-token --query SecretString --output text 2>&1 | Out-String
try { $j = $gh | ConvertFrom-Json; $token = $j.token } catch { $token = $gh.Trim() }
$token = $token.Trim()
$headers = @{ Authorization = "token $token"; "User-Agent" = "Kiro-Probe" }
$start = Get-Date
while ($true) {
  $r = Invoke-RestMethod -Uri "https://api.github.com/repos/zionxai5000/Kiro-AWS-Build/actions/runs/$RunId" -Headers $headers
  $elapsed = [int]((Get-Date) - $start).TotalSeconds
  Write-Host "[${elapsed}s] $($r.name) status=$($r.status) conclusion=$($r.conclusion)"
  if ($r.status -eq "completed") { exit ($(if ($r.conclusion -eq 'success') { 0 } else { 1 })) }
  if ($elapsed -gt 600) { Write-Host "TIMEOUT"; exit 2 }
  Start-Sleep -Seconds 15
}
