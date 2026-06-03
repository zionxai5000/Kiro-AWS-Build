---
tags: [architecture, services, reference-ingestion, quality, baselines]
updated: 2025-01-20
---

# Reference Ingestion System

> Ingest real-world examples (apps, YouTube channels) to establish quality baselines that gate all production output.

## Overview

When the King provides a URL (App Store listing, Google Play listing, or YouTube channel), the system analyzes it, extracts patterns, and builds quality baselines. These baselines then gate all ZionX app output and ZXMG video output — nothing ships unless it meets or exceeds the reference standard.

Package: `packages/services/src/reference-ingestion/`

---

## Components

| File | Purpose |
|------|---------|
| `service.ts` | URL intake, classification, dispatch |
| `analyzers/app-store-analyzer.ts` | App Store/Play Store listing analysis |
| `analyzers/youtube-channel-analyzer.ts` | YouTube channel and video analysis |
| `baseline/quality-baseline-generator.ts` | Score-based baseline generation |
| `baseline/baseline-storage.ts` | Versioned baseline persistence in Zikaron |
| `gate/reference-quality-gate.ts` | Output evaluation against baselines |
| `rework/auto-rework-loop.ts` | Automatic rework on gate failure |

---

## Ingestion Flow

```mermaid
graph TD
    K[King provides URL] --> S[Service classifies URL]
    S -->|apps.apple.com| AA[App Store Analyzer]
    S -->|play.google.com| AA
    S -->|youtube.com/@| YA[YouTube Analyzer]
    AA --> BG[Quality Baseline Generator]
    YA --> BG
    BG --> BS[Baseline Storage]
    BS --> ZK[Zikaron procedural memory]
    BS -->|Event| QG[Reference Quality Gate]
```

---

## Supported URL Types

| Pattern | Type | Analyzer |
|---------|------|----------|
| `apps.apple.com/*` | iOS App | App Store Analyzer |
| `play.google.com/store/apps/*` | Android App | App Store Analyzer |
| `youtube.com/@*` | YouTube Channel | YouTube Channel Analyzer |
| `youtube.com/channel/*` | YouTube Channel | YouTube Channel Analyzer |

---

## App Store Analyzer

Extracts from public listing:
- **Metadata:** name, developer, category, rating, reviews, pricing, IAPs
- **Screenshots:** layout patterns, color usage, typography, navigation (via LLM vision)
- **Reviews:** top-praised features, complaints, sentiment, feature requests (min 50)
- **Inferred patterns:** onboarding flow, monetization model, retention mechanics

Output: `App_Reference_Report`

---

## YouTube Channel Analyzer

Extracts using YouTube API + LLM analysis:
- **Channel metrics:** subscribers, total videos, upload frequency, avg views, engagement, growth
- **Per-video analysis** (10-20 videos): title, thumbnail, hook structure, pacing, CTA placement
- **Production quality:** editing pace, B-roll usage, audio quality, visual effects
- **Production Formula:** common patterns, optimal length, pacing rhythm

Output: `Channel_Reference_Report`

---

## Quality Baselines

Scored dimensions (1-10):

**App Baseline:**
| Dimension | Description |
|-----------|-------------|
| Visual Polish | UI quality and attention to detail |
| Interaction Complexity | Depth of user interactions |
| Content Depth | Richness of app content |
| Monetization Sophistication | Revenue model quality |
| Retention Mechanic Strength | User retention features |
| Onboarding Effectiveness | First-time user experience |

**Video Baseline:**
| Dimension | Description |
|-----------|-------------|
| Hook Strength | First 5 seconds effectiveness |
| Pacing Quality | Editing rhythm and flow |
| Thumbnail Effectiveness | Click-through optimization |
| Title Optimization | SEO and curiosity triggers |
| Production Value | Overall production quality |
| Engagement Trigger Density | Viewer interaction prompts |

---

## Key Rules

- **Monotonic merge:** Baselines only go UP. New references can raise thresholds but never lower them.
- **Weighted synthesis:** Higher-rated apps/channels contribute more to baselines.
- **Core principle elevation:** Patterns across multiple references get higher confidence.
- **All dimensions measurable:** No subjective criteria allowed.
- **Auto-rework:** 5 failed attempts → escalate to King with recommendation.

---

## Integration

- App baselines route to ZionX [[SME Intelligence System|Domain Expertise Profile]]
- Video baselines route to ZXMG Domain Expertise Profile
- ZionX gate-review invokes Reference Quality Gate before existing gates
- ZXMG review transition invokes Reference Quality Gate before existing gates
- Falls back gracefully when no baseline exists

## Related

- [[Quality Gate]]
- [[SME Intelligence System]]
- [[Zikaron Memory Service]]
- [[XO Audit Service]]
