---
tags: [operations, credentials, security]
---

# Credentials (AWS Secrets Manager)

> All credentials stored in AWS Secrets Manager. Never in code, never in config files.

## Available Secrets

| Secret ID | Service | Purpose |
|-----------|---------|---------|
| `seraphim/github-token` | GitHub | PAT for zionxai5000 account |
| `seraphim/anthropic` | Anthropic | Claude API key |
| `seraphim/openai` | OpenAI | GPT API key |
| `seraphim/stripe` | Stripe | Payment processing |
| `seraphim/telegram` | Telegram | Bot token |
| `seraphim/youtube` | YouTube | API credentials |
| `seraphim/kalshi` | Kalshi | Trading API key |
| `seraphim/discord` | Discord | Bot token |
| `seraphim/x` | X (Twitter) | API key |
| `seraphim/instagram` | Instagram | API credentials |
| `seraphim/heygen` | HeyGen | Video generation API |
| `seraphim/zeely` | Zeely | Landing page API |
| `seraphim/reddit` | Reddit | API credentials |
| `seraphim/googleplay` | Google Play | Console credentials |
| `SeraphimAuroraSecret...` | Aurora PostgreSQL | Database credentials |

## Access Pattern

```
Agent needs credential → Otzar retrieves from Secrets Manager → 
5-minute in-memory cache → Credential used → Access logged (key name only)
```

## Rotation

- 90-day rotation schedule
- Zero-downtime switchover (dual-version during rotation window)
- Every access logged to XO Audit (key name only, never the value)

## Security Rules

- ⛔ Never log or display credential values
- ⛔ Never commit credentials to git
- ⛔ Never share credentials between tenants
- ✅ Use Secrets Manager exclusively
- ✅ Cache for max 5 minutes
- ✅ Log access events (key name, accessor, timestamp)

## Related

- [[Credential Manager]] — Service implementation details
- [[Hooks and Steering]] — Auto-loaded credentials-access steering rule
- [[Otzar Resource Manager]]
- [[Technology Stack]]
- [[Deployment Guide]]
- [[Drivers Catalog]]
