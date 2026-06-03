---
tags: [knowledge, zionx, apple, rejections, procedural]
source: ZionX
last_updated: 2026-06-02
---

# Apple App Store Rejection Patterns

> Procedural memory: rejection patterns ZionX has learned or should guard against.

## Common Rejection Reasons (from Apple guidelines)

| Rejection Code | Reason | Gate to Prevent |
|---|---|---|
| 2.1 | App completeness — crashes, broken links, placeholder content | Full smoke test gate |
| 2.3.3 | Screenshots don't reflect actual app experience | Live screenshot capture gate |
| 3.1.1 | In-App Purchase issues — missing restore button | IAP compliance gate |
| 3.1.2 | Subscription not following guidelines | RevenueCat config validation |
| 4.0 | Design — not iOS native enough, web wrapper | UI audit gate |
| 5.1.1 | Privacy — data collection without disclosure | Privacy nutrition label gate |
| 5.1.2 | Privacy — missing privacy policy | URL validation gate |
| 4.3 | Spam — too similar to existing app | Differentiation analysis gate |

## Learned Patterns

*This section will be auto-populated as ZionX encounters real rejections and creates new gates.*

---

## Related

- [[Google Play Rejection Patterns]]
- [[Gate Checks]]
- [[ZionX]]
