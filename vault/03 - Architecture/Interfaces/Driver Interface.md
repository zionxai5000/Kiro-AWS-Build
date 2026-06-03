---
tags: [architecture, interface, driver, adapter]
---

# Driver Interface — Uniform Adapter Contract

> Every external service adapter implements this interface. Standard connect/execute/verify/disconnect lifecycle.

## Interface

```typescript
interface Driver<TConfig = unknown> {
  readonly name: string;
  readonly version: string;
  readonly status: DriverStatus;  // disconnected | connecting | ready | executing | error
  
  connect(config: TConfig): Promise<ConnectionResult>;
  execute(operation: DriverOperation): Promise<DriverResult>;
  verify(operationId: string): Promise<VerificationResult>;
  disconnect(): Promise<void>;
  
  healthCheck(): Promise<HealthStatus>;
  getRetryPolicy(): RetryPolicy;
}
```

## Built-in Behaviors

- **Retry with exponential backoff** — 1s, 2s, 4s, 8s, 16s (max 5 attempts)
- **Circuit breaker** — opens after 5 consecutive failures, half-open after 60s
- **Session management** — persistent sessions avoid re-authentication
- **Idempotency keys** — safe retries without duplicate side effects
- **Health checks** — periodic validation of connection health

## Required Drivers (25+)

| Category | Drivers |
|----------|---------|
| App Stores | Apple App Store Connect, Google Play Console |
| Media | YouTube, HeyGen, TikTok, Instagram, X, Facebook, Rumble |
| Trading | Kalshi, Polymarket |
| Communication | Gmail, Telegram, Discord, WhatsApp, iMessage |
| Commerce | Stripe, RevenueCat, Google Ads, Zeely |
| Development | GitHub, n8n, Browser (Playwright) |
| AI | Anthropic (Claude), OpenAI (GPT) |
| Infrastructure | Reddit |

## Status

**Phase 3 — Not yet implemented.** Interface designed, no drivers built yet.

## Related

- [[Architecture Overview]]
- [[Technology Stack]]
- [[ZionX Agent Program]]
