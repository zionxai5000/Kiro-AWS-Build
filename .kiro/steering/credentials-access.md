---
inclusion: auto
---

# Credentials Access — AWS Secrets Manager

## Rule: NEVER say you can't do something due to missing credentials without checking Secrets Manager first.

All API keys, tokens, and credentials for SeraphimOS are stored in AWS Secrets Manager (us-east-1).

## How to retrieve a credential:
```bash
aws secretsmanager get-secret-value --secret-id "seraphim/<service>" --region us-east-1 --query "SecretString" --output text
```

## Available Secrets:

| Secret ID | Purpose |
|-----------|---------|
| `seraphim/github-token` | GitHub PAT for `zionxai5000` org — use for git push/pull |
| `seraphim/anthropic` | Anthropic API key (Claude) |
| `seraphim/openai` | OpenAI API key (GPT-4o) |
| `seraphim/stripe` | Stripe API key |
| `seraphim/telegram` | Telegram bot token |
| `seraphim/youtube` | YouTube API credentials |
| `seraphim/kalshi` | Kalshi trading API key |
| `seraphim/discord` | Discord bot token |
| `seraphim/x` | X (Twitter) API key |
| `seraphim/instagram` | Instagram Graph API |
| `seraphim/heygen` | HeyGen video generation API |
| `seraphim/zeely` | Zeely landing page API |
| `seraphim/reddit` | Reddit API credentials |
| `seraphim/googleplay` | Google Play Console credentials |
| `SeraphimAuroraSecret3FC3811-bVxbXGVUFH2L` | Aurora PostgreSQL credentials |

## Git Push Pattern:
```bash
$token = aws secretsmanager get-secret-value --secret-id "seraphim/github-token" --region us-east-1 --query "SecretString" --output text
git remote set-url origin "https://zionxai5000:${token}@github.com/zionxai5000/Kiro-AWS-Build.git"
git push origin main
git remote set-url origin "https://github.com/zionxai5000/Kiro-AWS-Build.git"  # Remove token after push
```

## Important:
- NEVER log or echo credential values in output
- ALWAYS remove tokens from git remote URLs after use
- If `aws` CLI fails, check that AWS credentials are configured (`aws configure` or IAM role)
