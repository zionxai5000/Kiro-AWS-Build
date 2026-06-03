---
tags: [drivers, registry, architecture, integrations]
source: system
date: 2026-06-02
---

# Driver Registry

> Validates, manages lifecycle, and provides access to all 24 external integration drivers.

## Overview

Every external service integration follows a uniform `Driver` interface with standard lifecycle methods: `connect`, `execute`, `verify`, `disconnect`, `healthCheck`.

The Driver Registry:
- Validates driver interface compliance
- Tracks status (registered → connected → ready → error)
- Runs optional integration tests before activation
- Provides bulk connect/disconnect and health checks

## All Drivers (24)

### Communication
| Driver | Location | Purpose |
|--------|----------|---------|
| Discord | `discord/discord-driver.ts` | Discord bot interactions |
| Gmail | `gmail/gmail-driver.ts` | Email send/receive |
| iMessage | `imessage/imessage-driver.ts` | Apple iMessage |
| Reddit | `reddit/reddit-driver.ts` | Reddit posts/comments |
| Telegram | `telegram/telegram-driver.ts` | Bot messaging, notifications |
| WhatsApp | `whatsapp/whatsapp-driver.ts` | WhatsApp business messaging |
| X (Twitter) | `x/x-driver.ts` | Posts, engagement |

### Content & Media
| Driver | Location | Purpose |
|--------|----------|---------|
| YouTube | `youtube/youtube-driver.ts` | Video upload, analytics |
| HeyGen | `heygen/heygen-driver.ts` | AI video generation |
| Rumble | `rumble/rumble-driver.ts` | Video distribution |

### App Stores & Marketing
| Driver | Location | Purpose |
|--------|----------|---------|
| App Store Connect | `appstore/appstore-connect-driver.ts` | iOS app management |
| Google Play | `googleplay/google-play-driver.ts` | Android app management |
| Google Ads | `google-ads/google-ads-driver.ts` | Ad campaign management |
| Zeely | `zeely/zeely-driver.ts` | Landing page generation |

### Revenue & Payments
| Driver | Location | Purpose |
|--------|----------|---------|
| Stripe | `stripe/stripe-driver.ts` | Payment processing |
| RevenueCat | `revenuecat/revenuecat-driver.ts` | In-app subscription management |

### Trading & Markets
| Driver | Location | Purpose |
|--------|----------|---------|
| Kalshi | `trading/kalshi-driver.ts` | Prediction market trading |
| Polymarket | `trading/polymarket-driver.ts` | Prediction market trading |

### AI / LLM
| Driver | Location | Purpose |
|--------|----------|---------|
| Anthropic | `llm/anthropic-driver.ts` | Claude API |
| OpenAI | `llm/openai-driver.ts` | GPT API |

### Infrastructure
| Driver | Location | Purpose |
|--------|----------|---------|
| Browser | `browser/browser-driver.ts` | Headless browser automation |
| GitHub | `github/github-driver.ts` | Repository management, CI |
| n8n | `n8n/n8n-driver.ts` | Workflow automation |
| Voice | `voice/voice-driver.ts` | Text-to-speech |

### Base
| Driver | Location | Purpose |
|--------|----------|---------|
| Base Driver | `base/driver.ts` | Abstract base class for all drivers |

## Uniform Interface

```typescript
interface Driver<TConfig = unknown> {
  readonly name: string;
  readonly version: string;
  readonly status: DriverStatus;
  connect(config: TConfig): Promise<ConnectionResult>;
  execute(action: string, params: unknown): Promise<ExecutionResult>;
  verify(result: ExecutionResult): Promise<VerificationResult>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}
```

## Location

`packages/drivers/src/`
- `registry.ts` — Driver Registry implementation
- `index.ts` — Package exports
- `base/driver.ts` — Abstract base

## Related

- [[Drivers Catalog]] — Detailed documentation with circuit breaker, retry, and lifecycle
- [[Architecture Overview]]
- [[Technology Stack]]
- [[Credential Manager]]
