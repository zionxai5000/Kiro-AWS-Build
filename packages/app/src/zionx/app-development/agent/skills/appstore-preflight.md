---
name: appstore-preflight
description: Load BEFORE submitting to App Store / Play Store. Full preflight checklist (icons, splash, screenshots, metadata, privacy manifest). Returns a JSON pass/fail report.
---

# App Store preflight

The preflight runs against the project workspace and verifies every artifact
required for submission. If anything fails, do NOT submit.

## Output (always JSON)

```json
{
  "passed": false,
  "checks": [
    { "id": "icon-1024", "passed": true, "evidence": "assets/icon.png 1024x1024" },
    { "id": "splash", "passed": false, "evidence": "assets/splash.png missing" }
  ],
  "blockers": ["splash missing"],
  "warnings": []
}
```

## Required artifacts

### Icons

- [ ] `assets/icon.png` — 1024×1024 PNG, no alpha, no rounded corners (Apple
      adds them automatically).
- [ ] `assets/adaptive-icon.png` — 1024×1024 PNG with safe-zone padding, alpha
      OK (Android adaptive).
- [ ] `assets/favicon.png` — 48×48 PNG (web).

### Splash

- [ ] `assets/splash.png` — 2048×2048 PNG, brand-on-canvas, NEVER a screenshot.
- [ ] `app.json` `expo.splash.backgroundColor` matches the splash background.

### Screenshots (device-frame, real data)

- [ ] iPhone 6.7" (1290×2796) — 3 minimum
- [ ] iPhone 6.5" (1284×2778) — optional
- [ ] iPad 12.9" (2048×2732) — if iPad supported
- [ ] Android phone (1080×1920) — 3 minimum
- [ ] Android tablet (1280×800 or 2560×1600) — if tablet supported

Screenshots MUST be of populated state (real seeded data), not the empty
state. Captured at `xcrun simctl screenshot` quality, not phone-camera
photos of a screen.

### Metadata

- [ ] `app.json` `expo.name` matches store listing display name.
- [ ] `expo.slug` is URL-safe (lowercase, dashes).
- [ ] `expo.version` semver e.g. `1.0.0`.
- [ ] `expo.ios.bundleIdentifier` and `expo.android.package` set.
- [ ] `expo.ios.buildNumber` and `expo.android.versionCode` numeric and
      auto-incremented per build.

### Store listing copy (`store-listing.json`)

- [ ] `name` — display name (≤30 chars).
- [ ] `subtitle` — iOS subtitle (≤30 chars).
- [ ] `shortDescription` — Android (≤80 chars).
- [ ] `description` — full marketing copy (≤4000 chars), benefit-first, no
      keyword stuffing.
- [ ] `keywords` — iOS keywords (≤100 chars total, comma-separated).
- [ ] `category` — primary App Store category.
- [ ] `privacyPolicyUrl` — public URL.
- [ ] `supportUrl` — public URL.
- [ ] `marketingUrl` — optional but recommended.

### Privacy manifests

- [ ] `ios/PrivacyInfo.xcprivacy` — declares Required Reason API usage and
      data types collected.
- [ ] Google Play data-safety form completed (out of band, but the answer
      JSON should be in `store-listing.json` for reference).

### Permissions

- [ ] Every permission used has a usage description in `app.json`:
      `expo.ios.infoPlist.NSCameraUsageDescription`,
      `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`,
      etc.
- [ ] No permission requested that the app doesn't actually use.

### Build artifacts

- [ ] `dist/<app>.ipa` exists (≥ 5MB, magic bytes 50 4B 03 04).
- [ ] `dist/<app>.aab` exists (≥ 5MB, magic bytes 50 4B 03 04).

## Submission credentials

All resolved from AWS Secrets Manager via the existing apple-credentials
bootstrap flow:

- `seraphim/appstoreconnect` — App Store Connect API key (Apple Team
  `FBDY34F9DY`, account `eftn87@gmail.com`)
- `seraphim/expo` — Expo / EAS token (account `zionxai`,
  `zionxai5000@gmail.com`)
- `seraphim/googleplay` — Google Play service account JSON

The Apple account and the Expo account are SEPARATE — do not conflate them.

## Final pass / fail

The agent runs every check above and emits the JSON result. If ANY check
fails, the submission hook (Hook 9) refuses to proceed and surfaces the
blockers in chat.

## Don't ship without

- [ ] All artifacts above present.
- [ ] Screenshots show populated state, not empty.
- [ ] Privacy manifest entries match actual data collection.
- [ ] Build numbers auto-incremented.
- [ ] Final JSON report has zero blockers.
