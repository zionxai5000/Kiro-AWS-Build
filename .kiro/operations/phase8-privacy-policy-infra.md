# Phase 8 C0: Privacy Policy Infrastructure

> Verified live 2026-05-20.

---

## Location

- **Repo**: https://github.com/zionxai5000/privacy-policies
- **Live URL**: https://zionxai5000.github.io/privacy-policies/
- **Status**: ✅ 200 OK (verified 2026-05-20)

---

## Configuration

- **GitHub Pages source**: branch `main`, path `/`
- **Visibility**: Public repo (required for free GitHub Pages)
- **Deployment**: Automatic on push to `main` (~60s propagation)

---

## Current Content

Single blanket privacy policy (`index.html`) covering all ZionX-published apps generically.

Key claims:
- Minimal data collection (crash analytics, anonymous usage metrics only)
- No personal information collected unless explicitly provided
- No data sold or shared with third parties for advertising
- Data stored locally on device
- Third-party services: Expo, Apple App Store, Google Play Store
- Children's privacy: not directed at under-13, no knowingly collected data
- Contact: zionxai5000@gmail.com

---

## EULA Strategy

- **iOS**: Rely on Apple's default Standard License Agreement (https://www.apple.com/legal/internet-services/itunes/dev/stdeula/). No custom EULA needed.
- **Android**: Rely on Google Play Terms of Service. No custom EULA needed.
- **Decision**: No custom EULA for Phase 8 MVP. Revisit if apps include subscriptions or complex licensing.

---

## Per-App vs Blanket

**Current**: Blanket policy at root `index.html` — all apps share one URL.

**Future (C3 scope)**: Per-app policies at `/{bundleIdentifier}.html`. Hook 8 generates app-specific privacy policy HTML via Claude and commits to this repo via GitHub API using `seraphim/github-token`.

---

## How to Update

1. Edit `index.html` in the `privacy-policies` repo (or commit via GitHub API)
2. Push to `main`
3. Wait ~60s for GitHub Pages to redeploy
4. Verify at https://zionxai5000.github.io/privacy-policies/

---

## Credentials Required

- `seraphim/github-token` — for programmatic commits via GitHub Contents API
- No other credentials needed (Pages serves publicly)

---

## URL for App Store Submissions

Use in `StoreListing.privacyPolicyUrl`:
```
https://zionxai5000.github.io/privacy-policies/
```

For per-app (future):
```
https://zionxai5000.github.io/privacy-policies/{bundleIdentifier}.html
```
