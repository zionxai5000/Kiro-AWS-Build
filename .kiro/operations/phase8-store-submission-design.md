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

**Decision: Option C (AI generation) for MVP. Option A deferred to post-Phase 9.**

Rationale:
- We already have the OpenAI images client
- We can generate 3-5 screenshots per app at ~$0.04/image
- Total cost per app: ~$0.20
- Timeline: ~1 day to implement

**Known risk**: Apple may reject AI-generated screenshots that don't look like actual app captures. Mitigation: prompt engineering to produce UI-realistic images (flat design, status bar, navigation elements). If Apple rejects, we fall back to Option A in a future phase.

**Size strategy**: Generate at 1290×2796 (iPhone 6.7") — Apple auto-propagates to smaller sizes. For Google Play, resize to 1080×1920.

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

**Decision: Generate a hosted template URL on our domain.**

Format: `https://zionxai.dev/privacy/{bundleIdentifier}`

Implementation:
- Hook 8 generates the privacy policy text via LLM (same Claude call that generates the store listing)
- The URL is deterministic from the bundle ID
- For MVP, the URL can point to a static page template that we host
- The actual page content is generated and uploaded as a static asset

Alternative (simpler): use a generic privacy policy URL like `https://zionxai.dev/privacy` that covers all apps with a blanket policy. Less work, still passes Apple review for simple apps.

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
| ASC app creation 409 (name taken) | HALT | Surface to operator — must choose different name |
| ASC API auth failure | HALT | Credential issue — operator must fix |
| Screenshot generation fails | NOTIFY | Continue without screenshots, flag in checklist |
| ASC metadata PATCH fails | NOTIFY | Log which field failed, continue with others |

---

## Section 5: Hook 9 — Submission Prep

### Function Signature

```typescript
export interface SubmissionPrepInput {
  projectId: string;
  platform: 'ios' | 'android';
  credentialManager: CredentialManager;
  eventBus: EventBusService;
}

export interface SubmissionPrepOutput {
  checklist: SubmissionChecklist;
  readyForConfirmation: boolean;
  missingItems: string[];
  ascAppId?: string;         // For iOS — needed by confirm endpoint
}
```

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
  'build_exists',            // .aab artifact available
  'first_release_done',      // App exists on Play Console (not first upload)
  'listing_complete',        // StoreListing JSON exists
  'screenshots_exist',       // ≥2 screenshots in workspace
  'service_account_key',     // seraphim/googleplay accessible
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

### Function Signature

```typescript
export interface ScreenshotGeneratorInput {
  appName: string;
  appDescription: string;
  screenshotCount: number;     // 3-5 recommended
  platform: 'ios' | 'android';
  credentialManager: CredentialManager;
}

export interface ScreenshotResult {
  screenshots: Array<{
    filename: string;          // e.g., "screenshot-1.png"
    width: number;
    height: number;
    description: string;       // What the screenshot depicts
  }>;
  costUsd: number;
}

/**
 * Generate app screenshots via OpenAI image generation.
 * 
 * iOS: generates at 1290×2796 (iPhone 6.7" portrait)
 * Android: generates at 1080×1920 (standard portrait)
 * 
 * Prompts are designed to produce UI-realistic images:
 * - Status bar with time/battery
 * - Navigation elements (tab bar, back button)
 * - Content that matches the app description
 * - Flat/modern design language
 */
export async function generateScreenshots(
  input: ScreenshotGeneratorInput,
): Promise<ScreenshotResult>;
```

### Prompt Strategy

Each screenshot gets a different "screen" of the app:
1. Home/dashboard screen
2. Detail/content screen
3. Settings or profile screen
4. Action screen (creating/editing content)
5. Results/progress screen (if applicable)

The prompt includes:
- App name and description for context
- Specific screen to depict
- Size constraints (exact pixel dimensions)
- Style constraints: "flat UI design, iOS/Material Design conventions, status bar visible, no device frame"

### Size Handling

OpenAI's image API supports specific sizes. We'll use the closest supported size and resize if needed:
- If 1290×2796 isn't directly supported, generate at 1024×1792 (supported) and upscale via sharp
- For Android (1080×1920), generate at 1024×1792 and resize

This may require adding `sharp` as a dependency (already noted in deferred.md for notification icon resizing).

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
| C1 | Types + `asc-app-client.ts` + tests | 1 day | None |
| C2 | `store-listing-prompts.ts` + `screenshot-generator.ts` + tests | 1 day | None (parallel with C1) |
| C3 | Hook 8 implementation + tests | 1 day | C1, C2 |
| C4 | Hook 9 implementation + checklist + tests | 0.5 days | C3 |
| C5 | Confirm endpoint + `eas submit` integration | 0.5 days | C4 |
| C6 | E2E verification (dry-run full pipeline) | 0.5 days | C5 |
| C7 | E2E verification (real ASC app creation + submission) | 0.5 days | C6 + operator approval |

**Total: ~5.5 days** (aligns with research spec estimate of 5-6 days for MVP)

---

## Section 11: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apple rejects AI screenshots | Medium | Medium (delays submission, not pipeline) | Prompt engineering for UI realism. Fallback: manual screenshots for first app, Option A later. |
| ASC app name collision | Low | Low (retry with different name) | Generate unique names, catch 409, surface to operator |
| Google Play first-release detection fails | Low | Low (operator gets confusing error) | Catch specific EAS Submit error code, provide clear instructions |
| OpenAI image size limitations | Medium | Low (resize with sharp) | Test exact supported sizes during C2, add sharp dep if needed |
| Privacy policy URL not accessible | Low | Medium (blocks submission) | Host a static template page before Phase 8 implementation begins |
| ASC API rate limits | Low | Low (we make few calls per app) | Add retry with backoff (existing pattern) |

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
