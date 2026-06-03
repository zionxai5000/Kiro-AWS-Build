---
tags: [architecture, technology, stack]
---

# Technology Stack

## Runtime

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Core Runtime | TypeScript / Node.js on ECS Fargate | Async-native, strong LLM SDK support, type safety |
| Memory / Vector | PostgreSQL (Aurora) + pgvector | Unified relational + vector storage, ACID guarantees |
| Event Bus | Amazon EventBridge + SQS | Content-based routing + reliable queue processing |
| IaC | AWS CDK (TypeScript) | Same language as runtime, type-safe infrastructure |
| Dashboard | React + Vite on CloudFront/S3 | Fast builds, real-time WebSocket updates |
| CI/CD | GitHub Actions + CDK Pipelines | Automated testing, gate verification, staged rollout |
| Secrets | AWS Secrets Manager | Credential rotation, no secrets in code |
| Compute | ECS Fargate + Lambda | Fargate for stateful agents, Lambda for event handlers |
| API | API Gateway (REST + WebSocket) | Managed with auth, throttling, WebSocket for real-time |
| Monitoring | CloudWatch + X-Ray | Native AWS observability, distributed tracing |

## LLM Models (via Model Router)

| Tier | Provider | Models | Use Case |
|------|----------|--------|----------|
| Tier 1 (Economy) | OpenAI / Anthropic | GPT-4o-mini, Claude Haiku | Summarization, classification, extraction |
| Tier 2 (Standard) | OpenAI / Anthropic | GPT-4o, Claude Sonnet | Code gen, analysis, creative tasks |
| Tier 3 (Premium) | Anthropic / OpenAI | Claude Opus, GPT-4.5 | Architecture, complex reasoning, critical decisions |

## External Services

| Service | Purpose | Driver |
|---------|---------|--------|
| Apple App Store Connect | iOS app submission | AppStoreConnectDriver |
| Google Play Console | Android app submission | GooglePlayDriver |
| YouTube API | Video upload, analytics | YouTubeDriver |
| Kalshi API | Prediction market trading | KalshiDriver |
| Polymarket API | Prediction market trading | PolymarketDriver |
| RevenueCat | Subscription management | RevenueCatDriver |
| HeyGen | AI video generation | HeyGenDriver |
| Stripe | Payments | StripeDriver |
| Gmail API | Email communication | GmailDriver |
| GitHub API | Code management | GitHubDriver |
| Telegram API | Mobile messaging | TelegramDriver |
| Google Ads | Paid acquisition | GoogleAdsDriver |
| Zeely | Landing pages | ZeelyDriver |
| n8n | Workflow automation | N8nDriver |
| Playwright | Browser automation | BrowserDriver |

## Development Tools

| Tool | Purpose |
|------|---------|
| Kiro IDE | Primary development environment (this session) |
| Obsidian | Knowledge management + King's interface (NEW) |
| Hermes Agent | Self-improving sub-agents (PLANNED) |
| Vitest | Test runner |
| ESLint + Prettier | Code quality |
| Docker | Container packaging |

## Related

- [[Architecture Overview]]
- [[Deployment Guide]]
- [[Cost Overview]]
