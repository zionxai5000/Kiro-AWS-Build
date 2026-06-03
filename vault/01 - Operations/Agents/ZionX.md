---
tags: [agent, business, zionx, apps]
pillar: Apps
authority_level: L3
status: ready
parent: "[[Eretz]]"
---

# ZionX — App Factory

> Autonomous app factory. Builds, tests, and submits apps to Apple App Store and Google Play Store.

## Role

- Full app lifecycle: ideation → development → testing → gate-review → submission → live → deprecated
- Dual-platform targeting (iOS + Android) with parallel submission workflows
- Gate enforcement before every submission (metadata, IAP, screenshots, privacy, EULA)
- Rejection learning: parse rejection → create new gate → store pattern in memory
- GTM engine: ASO, social campaigns, paid acquisition, landing pages

## State Machine

`ideation → development → testing → gate-review → submission → in-review → approved/rejected → live → deprecated`

## Revenue Model

- Subscription apps (RevenueCat integration)
- In-app purchases
- Ad monetization (AdMob/AppLovin/Unity)
- Landing pages via Zeely

## Gate Checks (Pre-Submission)

- [ ] Metadata validation
- [ ] Subscription compliance
- [ ] IAP sandbox testing
- [ ] Screenshot verification (all device sizes)
- [ ] Privacy policy present
- [ ] EULA link valid

## Key Relationships

- Reports to: [[Eretz]]
- Uses drivers: [[Apple App Store Connect]], [[Google Play Console]], [[RevenueCat]], [[Zeely]], [[Google Ads]]
- Synergy with: [[ZXMG]] (app commercials in videos), [[Zion Alpha]] (market signals → app ideas)

## Heartbeat Review

- Schedule: Daily
- Focus: App market trends, competitor analysis, submission success rate, revenue per app
