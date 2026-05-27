# Deferred Items

Items identified during development that are intentionally deferred. Review periodically.

---

## Phase 2 — npm audit vulnerabilities (2026-05-13)

7 npm audit vulnerabilities (3 moderate, 4 high) in aws-cdk-lib and its transitive dependencies (ajv, brace-expansion, fast-uri, fast-xml-builder, minimatch, yaml). All confined to AWS CDK infrastructure, none in code paths the app-development pipeline touches. Fix requires aws-cdk-lib upgrade to 2.254.0 which is outside current dependency range and could break CDK stacks. Re-evaluate when next touching CDK infra.


---

## Phase 3 — retry utility default behavior (2026-05-14)

STATUS: RESOLVED in commit 42e8868 on 2026-05-15. See commit for details.

Phase 1 retry utility (retry.ts) assumes all errors are retryable by default. Should be inverted: retry only known-transient error classes (network errors, HTTP 5xx, HTTP 429). Auth, validation, and permission errors should never retry. Currently each caller has to remember to pass a custom shouldRetry predicate. Re-evaluate during a future quality pass.

UPDATE FROM PHASE 5: The retry utility's RetryExhaustedError wrapping behavior is incorrect. When shouldRetry returns false on the first attempt (signaling a terminal error), the utility still wraps the error in RetryExhaustedError with a misleading "Retry exhausted after N attempts" message. The underlying error is preserved as lastError but tests must either catch RetryExhaustedError or unwrap to assert on the actual cause. The 500 server error test in Phase 5 ran for 4 seconds going through full exponential backoff because the utility didn't short-circuit on non-retryable errors. Correct behavior: shouldRetry returning false on attempt 1 should throw the original error immediately, NOT wrap in RetryExhaustedError. The "exhausted" framing should only apply when all retries were actually attempted.

PRIORITY: Bump from "future quality pass" to "fix before Phase 6 if Phase 6 adds any retry-using code paths." Phase 6 will introduce build retries; this needs to be solid before then.


---

## Phase 3 — production-server as-any cast (2026-05-14)

production-server.ts → app-dev route registration uses `as any` to bypass type checking because the services package consumes the app package via compiled .d.ts files, not source. New fields on AppDevHandlerDeps won't fail compilation until something explicitly imports the type at source level. Re-evaluate when adjusting the monorepo build pipeline — consider using project references or TypeScript path mappings to share source types.


---

## Phase 4 — Workspace class module-load-time root resolution (2026-05-14)

Workspace class resolves WORKSPACE_ROOT at module load time from process.env.SERAPHIM_WORKSPACE_ROOT. This caused test friction in Phase 1 and again in Phase 4 hook-subscribers tests. Each test that wants its own root must use workspace.getProjectPath() to discover the actual configured root. Consider making the root a constructor parameter (with env var as default) for cleaner test isolation. Re-evaluate during a future quality pass.


---

## Phase 4 — InMemoryEventBusService tenantId inconsistency (2026-05-14)

InMemoryEventBusService casts SystemEvent to SeraphimEvent without transforming metadata.tenantId → tenantId. Production EventBusServiceImpl likely converts properly via EventBridge, so local dev and production may behave differently. Currently code that needs tenantId must check both locations: event.tenantId ?? event.metadata?.tenantId. Re-evaluate during a future consistency pass — either fix InMemoryEventBusService to transform on dispatch, or normalize the SystemEvent/SeraphimEvent type relationship.


---

## Phase 5 — Hook 3 halt without enforcer (2026-05-15)

Phase 5 implements Hook 3 with halt severity but no enforcer. Hook 3 emits appdev.hook.completed with success: false on validation failure. Phase 6 (Build Pipeline) is responsible for reading Hook 3's last completion event for a project and refusing to build if success was false. Until Phase 6 lands, bad dependencies are detected and reported but do not block any downstream action.


---

## Phase 6 — getSignedUrl as-any cast (2026-05-15)

The `as any` cast on getSignedUrl in artifact-storage-client.ts is a known AWS SDK type-compatibility workaround between @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner (private handlers property has separate declarations). Functional behavior is correct. Re-evaluate when SDK versions converge or AWS publishes typing fix.

---

## Phase 6 — artifact download retry path untested (2026-05-15)

The artifact-storage-client.test.ts network error test was changed from "real fetch failure" to "ECONNREFUSED" (non-retryable error) to avoid timeout from real retry backoff delays. This means the actually-retryable failure path (real network outage during artifact download) is currently untested. Fix: use vi.useFakeTimers() in those tests so retry backoff doesn't consume real wall-clock time, then test a real "fetch failed" / "ETIMEDOUT" scenario through full retry exhaustion. Coverage hole, not a behavior bug.


---

## Phase 7 — Notification icon generated at 1024x1024 (2026-05-14)

OpenAI Images API only supports 1024x1024, 1536x1024, and 1024x1536. The notification icon ideally should be 96x96 monochrome. Currently generated at 1024x1024 — Expo/Android handles resizing at build time. For pixel-perfect control, add `sharp` in a future pass to resize to 96x96 after generation.


---

## Phase 7 — Daily budget enforcement for asset generation (2026-05-14)

At $0.044/project with the "generate once, skip if exists" idempotency check, daily budget enforcement is not a real risk. The existing `dailyBudgetUsd` ($10/day) in limits.ts would require 227 projects/day to hit. Add enforcement if a force-regen endpoint is built in a future phase.


---

## Phase 7 — Force-regen endpoint for assets (2026-05-14)

Currently Hook 7 generates assets once and skips if `assets/icon.png` exists. There is no way to force regeneration (e.g., after app name change). Add a manual-trigger API endpoint (`POST /app-dev/assets/regenerate`) in a future phase if needed. Would need to delete existing assets first, then re-trigger Hook 7.


---

## Phase 7 — E2E verification findings (2026-05-14)

### BUG: Splash image path mismatch

app.json generated by Claude references `./assets/splash.png` but Hook 7 generates `assets/splash-icon.png`. Two options:
- (a) Change Hook 7 to generate `splash.png` instead of `splash-icon.png` (matches Claude's output)
- (b) Update the code generation prompt to reference `splash-icon.png`

Option (a) is simpler and aligns with what Expo expects by default. Fix before Phase 8.

### FINDING: @types/react-native version_unsatisfiable

Hook 3 flagged `@types/react-native@~0.76.0` as unsatisfiable. This is a prompt quality issue — Claude generates devDependencies with version ranges that may not exist on npm. Consider:
- Adding a post-generation fixup that removes `@types/react-native` (not needed with RN 0.76+ which ships its own types)
- Or adjusting the system prompt to not include `@types/react-native`

Low priority — doesn't block builds.

### FINDING: Old splash screen config format

Claude generates `"splash": { "image": "..." }` instead of the SDK 52 `expo-splash-screen` plugin format. The old format still works but is deprecated. Update the system prompt in a future quality pass.

### FINDING: CLI summary counter doesn't include Hook 7 assets

The `summary.filesWritten` counter only counts Hook 2 output. Hook 7's 4 PNG files aren't reflected. Minor CLI reporting issue, not a pipeline bug.


---

## PHASE 6 BUILD VERIFICATION — 2026-05-19

### RESOLVED

- SDK 52 incompatibility with current EAS Build images
  Fixed by: targeting SDK 54 / RN 0.81 in prompt (50a27a0)

- Missing babel.config.js / metro.config.js / eas.json in generation
  Fixed by: prompt updates (685de7d, 50a27a0)

- Missing react-dom and expo-linking in dependencies
  Fixed by: prompt update (76a310e)

### PENDING — TECHNICAL

- Workspace .gitignore not generated by pipeline (hand-created for Build #8). Should be part of prompt output.

- eas project:init step is manual. Pipeline should call `eas project:init --non-interactive` after generation so workspaces are submit-ready.

- The artifact download/verification pattern should be in the build status poller as an optional artifact verification step.

- Two .aab files verified as evidence:
  - Build #7: https://expo.dev/artifacts/eas/7yRLJJB5t2UAZKasCkNjaN.aab (44.76 MB)
  - Build #8: https://expo.dev/artifacts/eas/x6tRbxV7h4RMd4N3JSaoVJ.aab (45 MB)

### PENDING — STRATEGIC

- Phase 6 verified for Android only. iOS build not tested (requires Apple Developer account + provisioning profile).

- Single test prompt ("workout tracker") used for both successful builds. Should test 2-3 other prompt categories (e.g., habit tracker, recipe app, todo list) to gain confidence the prompt generalizes.

- Build #8 took 10 minutes. At scale (100 apps/day) that's 16+ hours of compute. May need parallelization or EAS priority queue.


---

## PHASE 6.5 GROUP C — WORKOUT PLANNER TIMEOUT (2026-05-19)

Prompt: "A workout planner where users can build custom routines from a library of exercises, organize them into weekly schedules, and check off completed sets"

Result: Code generation timed out at 120s (codeGenerationTimeoutMs in limits.ts). Claude produced 12 complete files + 1 partial before the cutoff.

Workspace produced: workspaces/verify-workout-planner-001/
- All Hook 3 / Hook 4 / Hook 7 checks passed on what was written
- app/workout/[id].tsx.partial was incomplete
- Workspace is NOT build-ready

This is a real signal: a normal-complexity user prompt exceeded our default timeout. Three fix options:
1. Bump timeout to 240s (easy, hides symptom)
2. Update prompt to favor smaller files / more split components (medium effort, addresses root cause)
3. Add streaming resumability (hard, complete current file on timeout signal)

DEFER decision until we have Phase 9 metrics on prompt complexity vs generation time. Don't fix until then.


---

## BUNDLE ID PROMPT ISSUE (Phase 6.5 Group B finding, 2026-05-19)

The system prompt generates "com.example.<slug>" as the default ios.bundleIdentifier and android.package. This is the create-expo-app placeholder pattern and is problematic for production:

- Apple may reject com.example.* as a reserved/example prefix
- Bundle IDs are immutable after first iOS submission
- Polluted dev account with junk IDs that must be maintained
- Collision risk if two apps have the same slug

This is a generation-time defect that surfaces only at iOS build time. Android tolerates any unique ID.

Three possible fixes:
1. bundleIdPrefix passed into pipeline as config (caller specifies their org)
2. Hook 5 rewrites com.example.* → ${configured}.* before submission (pipeline localization)
3. New optional generation flag the API exposes

DEFER decision until we have a multi-tenant story. For single-account use, Path 1 is simplest.

WORKAROUND used in e2e-clean-001 for Build #9 (iOS):
manually changed both ios.bundleIdentifier and android.package to dev.zionxai.workouttracker.


---

## PRODUCTION PREP — zionx.ai domain hosting (2026-05-20)

**Current state (verified 2026-05-20)**:
- `https://zionx.ai` → 200, serves a 358-byte HTML frameset that embeds `https://zionx-ve9q2u7.gamma.site/` (Gamma.app landing page)
- `https://www.zionx.ai` → DNS resolution failure (www subdomain not configured)
- `https://zionx.ai/privacy` → 404
- Server: EC2 instance (`ip-10-123-124-56.ec2.internal`), no CDN, no Vercel/Netlify/Cloudflare
- Hosting: bare EC2 serving static HTML via frameset redirect to Gamma

**Assessment**: The frameset-to-Gamma setup is a placeholder landing page, not production infrastructure. Before public launch, zionx.ai needs:
1. Proper web hosting (static site on S3+CloudFront, or Vercel, or similar)
2. www subdomain CNAME configured
3. /privacy, /terms, /support routes serving real content
4. The Gamma frameset replaced with an actual website

**Phase 8 workaround**: Privacy policy hosted on GitHub Pages (`https://zionxai5000.github.io/privacy-policies/`) instead of zionx.ai. This is acceptable for App Store review but not for long-term production.

**When to address**: Before public launch / marketing push. Not blocking Phase 8-9 development.


---

## RESOLVED — Screenshot Upload Set ID Bug (Phase 9)

Resolved 2026-05-26.

- Added `createScreenshotSet(jwt, localizationId, displayType)` to asc-app-client.ts
- Added `getAppStoreVersionLocalizationId(jwt, ascAppId)` helper
- Updated Hook 8 `uploadScreenshotsToAsc` with 3-step flow (get localization → create set → upload)
- Defaults to APP_IPHONE_67 (modern flagship)
- Multi-display-type matrix deferred — see Phase 9.5 below

---

## Phase 9.5 — Screenshot Display Type Matrix

Current Hook 8 defaults all screenshots to APP_IPHONE_67. To support
multiple display types (iPhone 6.7, iPhone 6.5, iPad Pro 12.9, etc.):

1. Update screenshot generator to produce screenshots categorized by display type
2. Update uploadScreenshotsToAsc to accept screenshots grouped by displayType, create one set per type
3. Update screenshot filename convention (e.g., 'iphone-67-1.png', 'ipad-129-1.png')

Effort: ~2 hours. Slot when first ZionX user needs iPad screenshots or as Phase 10 polish.


---

## confirmSubmission Idempotency Cache (logged 2026-05-21)

The in-memory submissionCache in handlers.ts grows unbounded with each successful submission. In production, replace with LRU cache (max ~1000 entries) or Redis-backed store.

For MVP this is acceptable — process restarts clear the cache, which is fine for low-volume factory operation.


---

## Phase 8.5 — Component primitive polish (logged 2026-05-22)

- **Button.tsx**: disabled state still fires pressIn/pressOut scale animation. Add early return in handlePressIn/Out if disabled. (~5 min fix, low priority — disabled buttons rarely pressed)

- **Sheet.tsx**: no SafeAreaView wrapper for bottom notch. May obscure content near home indicator on devices like iPhone 14+. Wrap content in SafeAreaView with edges={['bottom']}. (~5 min fix, low priority — most sheet content doesn't reach the very bottom)

- **Model deprecation**: `claude-sonnet-4-20250514` deprecated, EOL June 15, 2026. Update model string in `llm-service.ts` before EOL. Check https://docs.anthropic.com/en/docs/resources/model-deprecations for current recommended model.


---

## Phase 9.5 — Production Submission Gaps Resolved (2026-05-26)

Resolved during Step 2G real-world TestFlight submission test:

1. Apple Team ID corrected (was FBDY34F9DY in note, actually 24B2ADT27B)
2. prompts.ts package versions aligned with Expo SDK 54 (13 packages)
3. Workspace needs git init for EAS project root detection
4. babel-preset-expo + "main": "expo-router/entry" added to template

### Hook 5 should run npm install + expo install --check + git init

Before triggering EAS Build, Hook 5 (build-preparer) should:
- Run npm install in workspace
- Run npx expo install --check to verify version compatibility
- Run git init + git commit if workspace lacks .git

### Partial-live test should include local bundle validation

Add Stage 2.8 to e2e-pipeline-partial-live.ts that runs:
  npx expo export --platform ios --output-dir <tmp>
to catch JS-level errors BEFORE real EAS Build is triggered.

This would have caught babel-preset-expo + version mismatches for free
without burning EAS credits.


---

## Phase 9.5 — Production Submission Gaps (RESOLVED + REMAINING)

### RESOLVED (Step 2G real-world submission test, 2026-05-26)

1. **Apple Team ID corrected** — seraphim/appstoreconnect note said FBDY34F9DY, actual team is 24B2ADT27B (eneka fateen / Individual).
2. **prompts.ts versions aligned with Expo SDK 54** — 13 packages corrected.
3. **First real TestFlight submission completed**:
   - Build ID: ea6194c6-23ac-4818-9fc9-2110d16af54f
   - ASC App ID: 6773520429
   - Submission ID: 335557ab-5822-4dec-abd0-8f9b41bdb4b2
   - Bundle: com.zionx.factorytest-6dd7e3c7
   - App: testapplication5.26.2.26

### REMAINING (Phase 9.5 work for next session)

1. **Hook 5 should auto-run prerequisites** — npm install + npx expo install --check + git init before triggering build-runner.
2. **Hook 6 should provision iOS credentials non-interactively** — Currently requires interactive `eas build` for first run.
3. **Partial-live test should include local bundle validation** — Add `npx expo export` stage to catch JS errors before EAS Build.
4. **Hook 8 needs handler wiring** — generateStoreListing API handler is a 202 stub. Hook 8 only runs via direct invocation.
5. **Bake ascAppId back into eas.json automatically** — Hook 8 should write ascAppId after ASC creation.
6. **ASC API key needs Admin role for app creation** — Current key can only GET/UPDATE, not CREATE apps.


---

## Phase 9 — Build #14, #15, #17 TestFlight Crash (RESOLVED 2026-05-27)

**Symptom**: Three consecutive TestFlight builds (Build #14 ea6194c6,
Build #15 41766746, Build #17 89cb1e62) all crashed on iOS 26 launch
with `EXC_CRASH/SIGABRT` on `com.meta.react.turbomodulemanager.queue`.

**Root cause**: facebook/react-native#54859. RN 0.81.5 RCTTurboModule.mm
`performVoidMethodInvocation` catches NSExceptions and rethrows via
`convertNSExceptionToJSError`. On iOS 26 this conversion accesses
jsi::Runtime from the wrong (GCD background dispatch) thread, causing
a C++ exception to escape the dispatch block and abort the process.
The sync method path was fixed upstream in PR #50193 but the void/async
path was missed.

**Resolution**: Applied patch-package fix to RN source:
- patches/react-native+0.81.5.patch replaces the @catch body with
  RCTLogError + early return.
- Added react-native-worklets@0.5.1 (required peer dep for Reanimated 4).
- Added "scheme" to app.json (community-reported contributor to fix).
- Updated babel.config.js to use react-native-worklets/plugin
  (REPLACES react-native-reanimated/plugin for Reanimated 4).
- Bumped iOS buildNumber to 4.

**Future-proofing**: Updated prompts.ts so all future generated apps
include these fixes by default. Tests stayed at 468 passing.

**Commits**:
- Workspace: 26d14b0 (workspace-only repo, no remote)
- Monorepo:  0494c45 (prompts.ts), f183084 (forensics scripts)

**Open work**: Build #18 failed at INSTALL_DEPENDENCIES because the
package-lock.json wasn't regenerated after adding patch-package +
postinstall-postinstall + react-native-worklets. Fix applied in
workspace commit 438344a (regenerated lock with full npm install).

Build #19 (`0e7405b0-3afa-4567-850a-5e40de56d3ec`) FINISHED successfully
in ~5 min. Submitted to TestFlight via `eas submit` — Submission ID
`d692ceb8-fc0b-47a0-9da5-e26f2aaeba5d`. Now in Apple processing queue.
Awaiting "ready to test" email; user can verify on iPhone once
processing completes (~5-10 min).
