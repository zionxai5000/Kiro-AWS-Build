# Phase 8: Store Submission — Design Document (Group B)

> Architecture and function signatures for Hooks 8 + 9.
> No code in this document — implementation begins in Group C onwards.

Last updated: 2026-05-19

---

## Section 1: Open Question Decisions

Answers to the 7 open questions from the research spec:

### Q1: Should Hook 9 auto-submit or stop at the checklist?

**Decision: Two-step pattern (prep → confirm).**

Rationale: Submitting to the App Store is irreversible (you can't un-submit a build from review). The pipeline should never auto-submit without explicit operator confirmation. Hook 9 produces the checklist + validates readiness. A separate `POST /app-dev/submit/confirm` endpoint triggers the actual `eas submit` call.

Flow:
1. `POST /app-dev/submit/prep` → Hook 9 runs → returns checklist + `readyForConfirmation: true/false`
2. Operator reviews checklist in the ZionX client
3. `POST /app-dev/submit/confirm` → runs `eas submit` + optionally submits for review

### Q2: How do we handle the first-Android-release manual Play Console step?

**Decision: Option B — Pipeline detects "first release" and halts with clear error + instructions.**

Implementation:
- Before calling `eas submit --platform android`, query the Google Play Developer API (or attempt the submission and catch the specific error)
- If the app has never been published, return a structured error with step-by-step instructions for the manual first upload
- The instructions include: download link for the .aab artifact, Play Console URL, what fields to fill in
- After the operator completes the manual step, they re-run Hook 9 and it succeeds

### Q3: Which screenshot strategy?

**Decision: Option A (placeholder) for MVP. Real screenshots deferred.**

Rationale:
- AI-generated screenshots have a HIGH rejection rate from Apple (2025-2026). Apple's guidelines explicitly require "actual app screenshots." This is not a medium risk — it's near-certain rejection for most app categories.
- Upscaling 1024×1792 to 1290×2796 via sharp produces visibly blurry output. Apple reviewers notice.
- Simulator capture (Option A from research) requires 3-5 days of infrastructure (Detox/Maestro) — out of scope for Phase 8 MVP.

**MVP approach**: Hook 8 generates placeholder screenshots — solid-color backgrounds with the app name, tagline, and a simple icon overlay rendered via `sharp` (text-on-image). These are clearly NOT production screenshots but they:
- Satisfy the "at least 1 screenshot" technical requirement for ASC upload
- Allow the full pipeline to be tested end-to-end
- Are clearly marked as placeholders in the checklist (Hook 9 flags `screenshots_placeholder: warn`)

**Operator workflow**: Before actual App Store submission, the operator replaces placeholder screenshots with real ones (manual capture or future Option B/simulator automation). Hook 9's checklist surfaces this as a warning, not a blocker — the operator decides whether to proceed.

**Future (post-Phase 9)**: Implement simulator-based screenshot capture via Detox or Maestro. This is a separate infrastructure project (~3-5 days).

### Q4: Multi-tenant handling?

**Decision: Defer to Phase 9. Single-tenant MVP for now.**

All apps created under the `zionxai` Apple Developer account and the single Google Play Console account. The `apple-credentials-config.ts` pattern continues. Per-user accounts are a Phase 9+ concern.

### Q5: ASC App creation ownership?

**Decision: Pipeline creates under `zionxai` account. Single-tenant.**

Same as Q4 — all apps owned by the platform account for MVP.

### Q6: `ascAppId` lifecycle?

**Decision: Store in workspace's `eas.json` under `submit.production.ios.ascAppId`.**

Flow:
1. Hook 8 creates the app in ASC → receives numeric Apple ID
2. Hook 8 writes it to `eas.json` in the workspace (same pattern as `eas project:init` writing the EAS project ID)
3. Hook 9 reads `eas.json` to find the `ascAppId` for `eas submit`

This keeps the ID co-located with the project and follows EAS conventions.

### Q7: Privacy Policy URL?

**Decision: Host on GitHub Pages (verified approach).**

**Verification (2026-05-19)**:
- `https://zionxai5000.github.io/` → 404 (GitHub Pages not yet enabled)
- `https://zionxai5000.github.io/Kiro-AWS-Build/` → 404 (no project page)
- Termly API (`docs.termly.io`) → exists but only covers consent management (cookie banners, DSAR). Does NOT support programmatic privacy policy creation. Their "Privacy Policy Generator" is a web wizard, not an API.

**Approach: GitHub Pages on a dedicated repo.**

C0 prerequisite steps:
1. Create repo `zionxai5000/privacy-policies` (or enable Pages on an existing repo)
2. Enable GitHub Pages (Settings → Pages → Deploy from branch `main`)
3. Add a blanket `index.html` privacy policy template
4. Verify `https://zionxai5000.github.io/privacy-policies/` returns 200

**URL format**: `https://zionxai5000.github.io/privacy-policies/{bundleIdentifier}.html`

**Implementation**:
- Hook 8 generates privacy policy HTML via Claude (app-specific language)
- Hook 8 commits the HTML file to the `privacy-policies` repo via GitHub API (we have `seraphim/github-token`)
- GitHub Pages serves it automatically within ~60 seconds of commit
- The URL is deterministic and immediately reachable by Apple reviewers

**Fallback (even simpler MVP)**: Single blanket privacy policy at `https://zionxai5000.github.io/privacy-policies/` covering all apps generically. One static HTML file, no per-app generation needed. Still passes Apple review for simple apps that don't collect sensitive data.

**Cost**: $0 (GitHub Pages is free for public repos).
**Dependency**: GitHub token (already in Secrets Manager as `seraphim/github-token`).
**Hard gate**: C0 must verify the Pages URL returns 200 before C3 begins.

---

## Section 2: File Structure

```
packages/app/src/zionx/app-development/
├── pipeline/
│   ├── 08-store-listing-writer.ts    — Hook 8 implementation
│   └── 09-submission-prep.ts         — Hook 9 implementation
├── services/
│   ├── asc-app-client.ts             — App Store Connect app management API
│   ├── store-listing-prompts.ts      — LLM prompts for listing generation
│   └── screenshot-generator.ts       — Screenshot generation via OpenAI
└── types/
    └── index.ts                      — StoreListing, SubmissionChecklist types (update)
```

New files: 3 (`asc-app-client.ts`, `store-listing-prompts.ts`, `screenshot-generator.ts`)
Modified files: 3 (`08-store-listing-writer.ts`, `09-submission-prep.ts`, `types/index.ts`)

---

## Section 3: Type Definitions

```typescript
// types/index.ts additions

export interface StoreListing {
  name: string;              // 2-30 chars
  subtitle: string;          // max 30 chars
  description: string;       // 10-4000 chars
  keywords: string;          // max 100 chars, comma-separated
  category: string;          // Apple category ID (e.g., "HEALTH_AND_FITNESS")
  supportUrl: string;
  privacyPolicyUrl: string;
  marketingUrl?: string;
  whatsNew?: string;         // For updates only
}

export interface SubmissionChecklist {
  projectId: string;
  platform: 'ios' | 'android';
  items: ChecklistItem[];
  allPassed: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

export interface AscAppInfo {
  ascAppId: string;          // Numeric Apple ID
  bundleId: string;
  name: string;
  sku: string;
  primaryLocale: string;
}
```

---

## Section 4: Hook 8 — Store Listing Writer

### Function Signature

```typescript
export interface StoreListingWriterInput {
  projectId: string;
  appName: string;
  appDescription: string;    // Original user prompt or expanded description
  category?: string;         // If not provided, LLM infers from description
  credentialManager: CredentialManager;
}

export interface StoreListingWriterOutput {
  listing: StoreListing;
  ascAppId: string | null;   // null if dry-run or ASC creation skipped
  screenshotsGenerated: number;
}
```

### Internal Flow

```
1. Generate store listing via Claude
   - Input: appName, appDescription, category hint
   - Output: StoreListing (name, subtitle, description, keywords, category, URLs)
   - Prompt includes Apple's character limits as constraints

2. Ensure ASC app exists (idempotent)
   - Read workspace eas.json for existing ascAppId
   - If found: verify app still exists at ASC (GET /v1/apps/{id})
   - If not found: create via POST /v1/apps
   - Write ascAppId back to eas.json

3. Set metadata at ASC
   - PATCH appInfoLocalizations (name, subtitle, privacyPolicyUrl)
   - PATCH appStoreVersionLocalizations (description, keywords, supportUrl)
   - Set primary category

4. Generate screenshots
   - 3-5 screenshots via OpenAI images (1290×2796 for iOS, 1080×1920 for Android)
   - Write to workspace assets/screenshots/ directory
   - Upload to ASC via App Store Connect API

5. Write listing to workspace metadata
   - Save StoreListing JSON to workspace for Hook 9 to read
```

### Idempotency

| Step | Idempotent? | Strategy |
|------|-------------|----------|
| 1. LLM generation | No (regenerates each time) | Skip if `store-listing.json` exists in workspace |
| 2. ASC app creation | Yes | Check eas.json first, then GET before POST |
| 3. Metadata PATCH | Yes | PATCH is idempotent by nature |
| 4. Screenshots | No (regenerates) | Skip if `assets/screenshots/` has ≥3 files |
| 5. Write metadata | Yes | Overwrites file |

### Error Handling

| Error | Severity | Action |
|-------|----------|--------|
| LLM generation fails | NOTIFY | Return partial result, listing = null |
| ASC app creation 409 (name taken) | RETRY | See name collision flow below |
| ASC API auth failure | HALT | Credential issue — operator must fix |
| Screenshot generation fails | NOTIFY | Continue without screenshots, flag in checklist |
| ASC metadata PATCH fails | NOTIFY | Log which field failed, continue with others |

### Name Collision Flow (ASC 409 Handling)

App Store has ~2M apps. LLM-generated names WILL collide. This is high-likelihood, not an edge case.

**Automatic retry strategy (no operator intervention needed):**

```
1. First attempt: use LLM-generated name as-is
2. On 409 (name taken):
   a. Append a differentiator suffix: "{Name} - {category keyword}"
      e.g., "FitTracker" → "FitTracker - Workouts"
   b. Retry createAscApp with the suffixed name
3. On second 409:
   a. Ask Claude to generate 3 alternative names (new LLM call)
   b. Try each in sequence until one succeeds
4. After 5 total attempts (1 original + 1 suffix + 3 alternatives):
   - NOTIFY (not HALT) — log all attempted names, continue hook with ascAppId: null
   - Hook returns success: true so downstream steps (listing.json write, screenshot generation) still run
   - Operator sees ascAppId: null in output and can re-run Hook 8 with an explicit `appName` override
   - This is intentional: the factory should be resilient to collisions, not halt the whole submission flow
```

**Budget**: Max 5 createAscApp attempts per Hook 8 invocation. Each attempt is a single API call (~200ms). Total worst-case overhead: ~1s + 1 LLM call (~3s).

**Idempotency**: If Hook 8 is re-run after a successful name was found, it reads the existing ascAppId from eas.json and skips creation entirely (Step 2 idempotency).

---

## Section 5: Hook 9 — Submission Prep

### Function Signature

```typescript
export interface SubmissionPrepInput {
  projectId: string;
  platform: 'ios' | 'android';
}

export interface SubmissionPrepOutput {
  checklist: SubmissionChecklist;
  readyForConfirmation: boolean;
  missingItems: string[];
  ascAppId?: string;         // For iOS — needed by confirm endpoint
}
```

> **Note**: Hook 9 is pure workspace-state validation. No API calls, no credential
> fetches, no LLM calls. Credential verification and actual submission happen in
> C5 (confirm endpoint). The `credentialManager` and `eventBus` from the original
> design were removed — they belong in the confirm endpoint, not the checklist hook.

### Checklist Items

```typescript
const IOS_CHECKLIST_ITEMS = [
  'build_exists',            // .ipa artifact available
  'asc_app_exists',          // ascAppId in eas.json
  'listing_complete',        // StoreListing JSON exists with all required fields
  'screenshots_uploaded',    // ≥1 screenshot set at ASC
  'icon_exists',             // assets/icon.png exists
  'privacy_policy_url',      // Non-empty URL in listing
  'support_url',             // Non-empty URL in listing
  'category_set',            // Primary category set at ASC
];

const ANDROID_CHECKLIST_ITEMS = [
  'build_exists',            // EAS project linked (projectId in eas.json)
  'first_release_done',      // Always 'warn' for MVP (manual step)
  'listing_complete',        // StoreListing JSON exists
  'screenshots_exist',       // ≥2 screenshots in workspace
  'service_account_key',     // Config value GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET is set (do not fetch the secret itself)
];
```

### Internal Flow

```
1. Load workspace state
   - Read eas.json (ascAppId, EAS project ID)
   - Read store-listing.json (StoreListing)
   - Check assets/ directory (icon, screenshots)

2. Run checklist validation
   - For each item: check condition, set pass/fail/warn
   - Aggregate into SubmissionChecklist

3. If all items pass:
   - Set readyForConfirmation = true
   - Return checklist for operator review

4. If any items fail:
   - Set readyForConfirmation = false
   - Return missingItems[] with actionable descriptions
```

### Confirm Endpoint (separate from Hook 9)

```typescript
// In api/handlers.ts — new endpoint

POST /app-dev/submit/confirm
Body: { projectId, platform }

Flow:
1. Re-validate checklist (in case state changed since prep)
2. If still ready:
   - iOS: run `eas submit --platform ios --non-interactive`
   - Android: run `eas submit --platform android --non-interactive --track internal`
3. Publish event: appdev.submission.completed
4. Return { submissionId, status: 'submitted' }
```

### Error Handling

| Error | Severity | Action |
|-------|----------|--------|
| Workspace missing eas.json | HALT | "Run Hook 5 + Hook 6 first" |
| No build artifact | HALT | "Run Hook 6 first" |
| Listing incomplete | FAIL (checklist) | List missing fields |
| ASC app doesn't exist | FAIL (checklist) | "Run Hook 8 first" |
| eas submit fails | HALT | Surface EAS CLI error to operator |
| First Android release not done | FAIL (checklist) | Return instructions for manual upload |

---

## Section 6: ASC App Client (`asc-app-client.ts`)

### Function Signatures

```typescript
/**
 * Check if an app exists in App Store Connect for the given bundle ID.
 * Returns the app info if found, null if not.
 */
export async function getAscApp(
  jwt: string,
  bundleId: string,
): Promise<AscAppInfo | null>;

/**
 * Create a new app in App Store Connect.
 * Idempotent: checks for existing app first via getAscApp.
 * 
 * @throws AscAppNameTakenError if the name is already in use
 * @throws AscApiError for auth/network failures
 */
export async function createAscApp(
  jwt: string,
  input: {
    bundleIdResourceId: string;  // Apple's bundle ID resource ID (e.g., "US85GDKZ7V")
    name: string;
    sku: string;
    primaryLocale: string;
  },
): Promise<AscAppInfo>;

/**
 * Set app metadata (localized fields).
 * Requires the app to exist. Fetches localization IDs internally.
 */
export async function setAppMetadata(
  jwt: string,
  ascAppId: string,
  metadata: {
    name?: string;
    subtitle?: string;
    description?: string;
    keywords?: string;
    supportUrl?: string;
    privacyPolicyUrl?: string;
    marketingUrl?: string;
    whatsNew?: string;
  },
): Promise<void>;

/**
 * Set the primary category for an app.
 */
export async function setAppCategory(
  jwt: string,
  ascAppId: string,
  categoryId: string,
): Promise<void>;

/**
 * Upload a screenshot to App Store Connect.
 * Handles the multi-step upload process:
 * 1. Reserve screenshot slot
 * 2. Upload image data
 * 3. Commit the upload
 */
export async function uploadScreenshot(
  jwt: string,
  ascAppId: string,
  screenshotData: Buffer,
  displayType: string,       // e.g., "APP_IPHONE_67"
  position: number,          // 1-based ordering
): Promise<string>;          // Returns screenshot ID
```

### Authentication

Uses the same ASC JWT signing from `asc-jwt.ts`. The key we already have (`seraphim/appstoreconnect`) has sufficient permissions for app management — it was created with "App Manager" role access.

### Idempotency

- `getAscApp` → read-only, always safe
- `createAscApp` → calls `getAscApp` first; if app exists, returns existing info
- `setAppMetadata` → PATCH is idempotent (same values = no-op)
- `setAppCategory` → PATCH is idempotent
- `uploadScreenshot` → NOT idempotent (creates new screenshot each time). Caller must check existing screenshots first.

---

## Section 7: Screenshot Generator (`screenshot-generator.ts`)

### Revised Approach: Placeholder Screenshots

Per the Q3 decision, Phase 8 MVP generates placeholder screenshots — NOT AI-generated app mockups. These are simple branded images that satisfy ASC's technical upload requirement while clearly signaling to the operator that real screenshots are needed before submission.

### Function Signature

```typescript
export interface ScreenshotGeneratorInput {
  appName: string;
  appDescription: string;
  screenshotCount: number;     // 3-5
  platform: 'ios' | 'android';
}

export interface ScreenshotResult {
  screenshots: Array<{
    filename: string;          // e.g., "screenshot-1.png"
    width: number;
    height: number;
    isPlaceholder: true;       // Always true for MVP
  }>;
}

/**
 * Generate placeholder screenshots using sharp (text-on-solid-color).
 * 
 * iOS: 1290×2796 (iPhone 6.7" portrait)
 * Android: 1080×1920 (standard portrait)
 * 
 * Each placeholder contains:
 * - Solid background color (app-themed, derived from icon palette or random)
 * - App name in large centered text
 * - Screenshot number / screen label (e.g., "Home", "Detail", "Settings")
 * - "PLACEHOLDER — Replace before submission" watermark
 */
export async function generatePlaceholderScreenshots(
  input: ScreenshotGeneratorInput,
): Promise<ScreenshotResult>;
```

### Implementation

Uses `sharp` to compose PNG images programmatically:
1. Create a solid-color canvas at the target resolution
2. Overlay text (app name, screen label, watermark) via SVG text rendering in sharp
3. Write to workspace `assets/screenshots/` directory

No OpenAI calls. No upscaling. No blurriness. Cost: $0.

### Dependency

Requires `sharp` package. Already noted in deferred.md as needed for notification icon resizing. Adding it now serves both purposes.

### Visual Consistency

Since placeholders are programmatically generated (not AI), all screenshots for a given app share identical styling: same background color, same font, same layout. The only variation is the screen label text. No cross-image consistency problem exists with this approach (unlike AI generation where each call produces a different visual style).

### Future: Real Screenshot Generation

When simulator-based capture is implemented (post-Phase 9), this module will be replaced with a Detox/Maestro integration that:
1. Boots the app in a simulator
2. Navigates to key screens
3. Captures screenshots at native resolution
4. No upscaling needed — captures are pixel-perfect

---

## Section 8: Store Listing Prompts (`store-listing-prompts.ts`)

### System Prompt

```
You are a professional App Store copywriter. Generate compelling store listing
metadata for a mobile app. Follow Apple App Store and Google Play guidelines.

CONSTRAINTS:
- App name: 2-30 characters (may differ from the internal project name)
- Subtitle: max 30 characters
- Description: 10-4000 characters. First 3 lines are most important (visible without "Read More")
- Keywords: max 100 characters total, comma-separated, no spaces after commas
- Category: choose from the Apple App Store category list

OUTPUT FORMAT (JSON):
{
  "name": "...",
  "subtitle": "...",
  "description": "...",
  "keywords": "...",
  "category": "HEALTH_AND_FITNESS",
  "supportUrl": "https://zionxai.dev/support",
  "privacyPolicyUrl": "https://zionxai.dev/privacy/{bundleId}"
}
```

### User Prompt Template

```
Generate an App Store listing for this app:

App Name: {appName}
Description: {appDescription}
Bundle ID: {bundleIdentifier}

The app is built with React Native / Expo. Target audience: general consumers.
Tone: professional but approachable. Emphasize the key features mentioned in the description.
```

---

## Section 9: Test Strategy

### Unit Tests

| Module | Mock Strategy | Key Assertions |
|--------|--------------|----------------|
| `asc-app-client.ts` | Mock fetch (same pattern as `asc-client.ts`) | Correct URL construction, auth header, response parsing, 409 handling |
| `screenshot-generator.ts` | Mock OpenAI client | Correct prompt construction, size parameters, cost calculation |
| `store-listing-prompts.ts` | No mocks needed (pure string templates) | Output format matches constraints |
| `08-store-listing-writer.ts` | Mock all services | Full flow: LLM → ASC create → metadata → screenshots |
| `09-submission-prep.ts` | Mock workspace reads | Checklist validation logic, missing item detection |

### Integration Tests (gated, require real API keys)

| Test | What it proves |
|------|---------------|
| Create ASC app (dry-run) | JWT auth works, API responds |
| Generate 1 screenshot | OpenAI produces correct size image |
| Full Hook 8 dry-run | End-to-end flow without side effects |

### Test Count Estimate

- `asc-app-client.test.ts`: ~12 tests (CRUD + error cases)
- `screenshot-generator.test.ts`: ~6 tests (generation + resize + errors)
- `08-store-listing-writer.test.ts`: ~10 tests (full flow + edge cases)
- `09-submission-prep.test.ts`: ~12 tests (checklist items + platform variants)

Total new tests: ~40
Expected suite total after Phase 8: ~453 (413 current + 40 new)

---

## Section 10: Implementation Groups

| Group | Scope | Estimate | Dependencies |
|-------|-------|----------|--------------|
| C0 | Privacy policy hosting prerequisite (GitHub Pages setup + verify 200) | 0.5 days | None — hard gate before C3 |
| C1 | Types + `asc-app-client.ts` + tests | 1 day | None |
| C2 | `store-listing-prompts.ts` + `screenshot-generator.ts` (placeholder) + tests | 0.5 days | sharp dependency |
| C3 | Hook 8 implementation + tests + name collision flow | 1.5 days | C0, C1, C2 |
| C4 | Hook 9 implementation + checklist + tests | 0.5 days | C3 |
| C5 | Confirm endpoint + `eas submit` integration | 1.5 days | C4 |
| C6 | E2E verification (dry-run full pipeline) | 0.5 days | C5 |
| C7 | E2E verification (real ASC app creation + submission) | 0.5 days | C6 + operator approval |

**C5 expanded scope** (was 0.5 days, now 1.5 days):
- Idempotency: double-click protection (submission ID dedup)
- Authorization: verify caller has permission to confirm
- Re-validation: full checklist re-run before submission
- Credential injection: EXPO_TOKEN + ASC API key for eas submit subprocess
- Status streaming: eas submit takes 5-15 min, needs WebSocket progress events
- Error recovery: partial failure states (uploaded but not submitted for review)

**Total: ~7 days** (revised from 5.5 — accounts for C0 prerequisite, C5 complexity, name collision logic in C3)

---

## Section 11: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ASC app name collision | HIGH | Low (automatic retry handles it) | 5-attempt retry with suffix + LLM alternatives. See Section 4 collision flow. |
| Privacy policy URL inaccessible | Medium | HIGH (auto-rejection) | Hard prerequisite (C0) — must be verified reachable before C3 begins. |
| Google Play first-release detection fails | Low | Low (operator gets confusing error) | Catch specific EAS Submit error code, provide clear instructions |
| OpenAI image size limitations | N/A | N/A | Removed — using sharp-generated placeholders, no AI images |
| Apple rejects placeholder screenshots | HIGH | Low (expected — operator replaces before real submission) | Placeholders are explicitly flagged in checklist as warnings. Operator must replace with real screenshots before submitting for review. |
| ASC API rate limits | Low-Medium | Low (we make ~5 calls per app worst-case with collision retry) | Add retry with backoff (existing pattern). Monitor in production. |
| eas submit takes longer than expected | Medium | Low (timeout, retry) | 15-minute timeout, status streaming via WebSocket |

---

## Section 12: Deferred — Apple Review Rejection Handling

**Explicitly out of scope for Phase 8.** Submission ≠ publication.

Apple WILL reject the first 1-3 reviews for typical apps. Common rejection reasons:
- Guideline 4.0: Design (UI issues, placeholder content)
- Guideline 2.1: Performance (crashes on specific devices)
- Guideline 5.1.1: Privacy (data collection not disclosed)
- Metadata Rejected: screenshots don't match app, description misleading

**What Phase 8 does NOT handle:**
- Ingesting rejection feedback from Apple (Resolution Center API)
- Retry-after-fix workflow (modify metadata → resubmit)
- Rejection event in the event bus taxonomy
- Operator notification when rejection occurs

**Future phase scope (Phase 10+):**
- `appdev.submission.rejected` event type
- Webhook from Apple (or polling ASC API for version status changes)
- Structured rejection reason parsing
- Suggested fix generation via LLM
- One-click resubmission after fix

For Phase 8 MVP, the pipeline ends at "submitted to TestFlight / Play Console." The operator monitors review status manually via ASC / Play Console web UI.

---

## Appendix: Apple App Store Categories (subset)

For the LLM prompt, these are the valid category IDs:

```
BUSINESS, DEVELOPER_TOOLS, EDUCATION, ENTERTAINMENT, FINANCE,
FOOD_AND_DRINK, GAMES, GRAPHICS_AND_DESIGN, HEALTH_AND_FITNESS,
LIFESTYLE, MEDICAL, MUSIC, NAVIGATION, NEWS, PHOTO_AND_VIDEO,
PRODUCTIVITY, REFERENCE, SHOPPING, SOCIAL_NETWORKING, SPORTS,
TRAVEL, UTILITIES, WEATHER
```

The LLM should pick from this list based on the app description.
