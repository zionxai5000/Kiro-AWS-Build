---
inclusion: always
---

# Store readiness, accessibility & performance

A 5-star app is one that ships, doesn't crash, is usable by everyone, and looks
right in the store listing. These are gates.

## Accessibility (must pass)

- Color contrast meets WCAG AA (4.5:1 body, 3:1 large text). The design tokens
  are chosen to pass; don't override them into low contrast.
- Touch targets ≥ 44pt.
- Every interactive element and image has an accessible label.
- Supports Dynamic Type / font scaling without clipping.
- Reduced-motion honored (see design system).

## Performance budgets (must pass)

- Cold start to interactive: under ~2s on a mid-range device.
- No blocking spinners on a blank screen — use skeletons.
- Lists virtualized (`FlatList` / `FlashList`), never `.map()` over large arrays.
- JS bundle kept lean; no unused heavy deps.
- 60fps scrolling on the main screens; no jank from synchronous work on the UI
  thread.

## Crash & robustness

- No unhandled promise rejections; every data call has error handling.
- Graceful offline behavior (cached reads, queued writes).
- Error boundary at the app root with a calm, on-brand fallback screen.

## Store assets (must exist before "done")

- App icon (all required sizes) and adaptive icon (Android).
- Splash screen, on-brand.
- At least 3 screenshots per platform from real (persisted) data, not mock screens.
- App name, subtitle, description, keywords, privacy details.
- iOS privacy manifest / Android data-safety form completed.

## Submission (this project)

EAS handles builds and submission. Targets:

- **Apple:** App Store Connect, Apple Team ID `FBDY34F9DY`
  (account `eftn87@gmail.com`).
- **Expo / EAS:** Expo account `zionxai` (`zionxai5000@gmail.com`).
- **Google Play:** via `seraphim/googleplay` service account.

All submission credentials (App Store Connect API key, Google Play service
account, Expo token) are resolved from AWS Secrets Manager under
`seraphim/<service>` — never hardcoded, never committed. The Apple account and
the Expo account are separate; do not conflate them.

## Checklist (must all be true)

- [ ] Contrast, target size, labels, Dynamic Type, reduced-motion all pass.
- [ ] Cold start and scroll performance within budget; lists virtualized.
- [ ] Root error boundary present; offline handled; no unhandled rejections.
- [ ] Icon, splash, screenshots, and store metadata present.
- [ ] Submission config points at the correct, separate Apple and Expo accounts,
      with credentials from Secrets Manager.
