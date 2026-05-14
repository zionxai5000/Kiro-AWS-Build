# Security Lessons

Incidents and lessons learned. Read on every session.

---

## 2026-05-13 — GitHub PAT leaked into conversation output

**What happened:** A GitHub PAT was leaked into conversation output during a push operation because a Secrets Manager fetch failed (PowerShell JSON parsing issue) and the agent fell back to inline-pasting the token in the git URL. The token appeared in plain text in the shell output.

**Impact:** Token was revoked immediately. No evidence of unauthorized use.

**Root cause:** ConvertFrom-Json received multi-line output from AWS CLI and failed. The error message itself printed the raw token value. The agent then used the token directly in a git command string, which was also logged.

**Going forward, when fetching secrets:**

1. Set the secret as an environment variable BEFORE the git command, not interpolated into the URL
2. Use `git -c credential.helper=...` patterns where possible
3. If you absolutely must use a URL with embedded creds, do NOT print or log the full command
4. On any Secrets Manager failure, STOP and ask the human rather than falling back to plaintext
5. Suppress stderr from AWS CLI calls that may contain secret values (`2>$null`)
6. Clear environment variables containing secrets immediately after use (`$env:VAR = $null`)
7. Never use `Out-String` or `Write-Output` on variables that may contain secrets

**Correct pattern for authenticated git push:**

```powershell
$secretJson = aws secretsmanager get-secret-value --secret-id "seraphim/github-token" --region us-east-1 --query "SecretString" --output text 2>$null
$secret = $secretJson | ConvertFrom-Json
$env:GIT_TOKEN = $secret.apiKey
git -C "<repo-path>" push "https://zionxai5000:$($env:GIT_TOKEN)@github.com/zionxai5000/<repo>.git" main 2>&1 | Out-Null
$env:GIT_TOKEN = $null
```

Or better — use credential helper to avoid URL embedding entirely.
