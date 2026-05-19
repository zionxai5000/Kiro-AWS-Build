# Hook 6 iOS Integration — Design Document (Group G)

## Current Build-Runner Flow

File: `packages/app/src/zionx/app-development/pipeline/06-build-runner.ts`

```
run(input: BuildRunnerInput, ctx: HookContext) → HookResult<BuildRunnerOutput>

1. Kill switch / dry-run checks
2. Circuit breaker
3. Retrieve EXPO_TOKEN from CredentialManager
4. Get workspace project path
5. ensureEasProjectLinked (reads app.json, runs eas project:init if needed)
6. Build submission:
   - iOS path: withTempCredentialFile(.p8) → submitBuild with Apple env vars
   - Android path: submitBuild (no extra creds)
7. Publish BUILD_STATUS_CHANGED event
8. Start background polling
```

### Current iOS Handling

The iOS path (step 6) currently:
- Requires `credentialInfo` (keyId, issuerId, p8Content) passed in from Hook 5
- Writes .p8 to temp file via `withTempCredentialFile`
- Sets env vars: `EXPO_APPLE_APP_STORE_CONNECT_API_KEY_PATH`, `_KEY_ID`, `_ISSUER_ID`
- Calls `eas build --platform ios --non-interactive --json`

**Problem**: This assumes EAS already has Distribution Certificate + Provisioning Profile cached. If it doesn't (first build for a new bundle ID), the build fails at "Distribution Certificate is not validated for non-interactive builds."

### What Needs to Change

Before the `eas build` submission (step 6), for iOS builds, call `bootstrapIosCredentials()` to ensure all credentials are registered at EAS. This is idempotent — if creds already exist, it's a no-op (just reads + verifies).

---

## Proposed Change

### Where: Between step 5 (ensureEasProjectLinked) and step 6 (build submission)

```typescript
// After ensureEasProjectLinked, before build submission:

if (platform === 'ios') {
  ctx.log(`[${HOOK_METADATA.id}] Ensuring iOS credentials are bootstrapped...`);
  try {
    await ensureIosCredentialsBootstrapped({
      credentialManager,
      workspace,
      projectId,
      expoToken,
      log: ctx.log,
    });
  } catch (error) {
    cb.recordFailure();
    const msg = error instanceof BootstrapMaxCertsError
      ? `iOS credential bootstrap failed: max certificates reached. ${(error as Error).message}`
      : `iOS credential bootstrap failed: ${(error as Error).message}`;
    ctx.log(`[${HOOK_METADATA.id}] ${msg}`);
    return { success: false, hookId: HOOK_METADATA.id, dryRun: false, error: msg, ... };
  }
}
```

### New Helper: `ensureIosCredentialsBootstrapped`

```typescript
async function ensureIosCredentialsBootstrapped(args: {
  credentialManager: CredentialManager;
  workspace: Workspace;
  projectId: string;
  expoToken: string;
  log: (msg: string) => void;
}): Promise<void> {
  const { credentialManager, workspace, projectId, expoToken, log } = args;

  const appJsonContent = await workspace.readFile(projectId, 'app.json');
  const appJson = JSON.parse(appJsonContent);
  const bundleIdentifier = appJson?.expo?.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error('app.json missing expo.ios.bundleIdentifier — cannot bootstrap iOS credentials');
  }

  // Project owner (from app.json) vs Expo account (from config) — they
  // can differ in multi-tenant. We use the project's owner field for
  // the GraphQL projectFullName, and the centralized config for the
  // account that holds Apple credentials.
  const projectOwner = appJson?.expo?.owner ?? APPLE_CREDENTIALS_CONFIG.expoAccountName;
  const slug = appJson?.expo?.slug ?? 'app';

  const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
  const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
  const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');

  if (!ascKeyId || !ascIssuerId || !ascKeyPem) {
    throw new Error('App Store Connect credentials not available via CredentialManager');
  }

  await bootstrapIosCredentials({
    ascKeyId,
    ascIssuerId,
    ascKeyPem,
    appleTeamId: APPLE_CREDENTIALS_CONFIG.teamId,
    appleTeamType: APPLE_CREDENTIALS_CONFIG.teamType,
    expoToken,
    easAccountName: APPLE_CREDENTIALS_CONFIG.expoAccountName,
    bundleIdentifier,
    projectFullName: `@${projectOwner}/${slug}`,
    dryRun: false,
  }, log);
}
```

### Credential Flow

```
CredentialManager.getCredential('appstore-connect', 'key-id')   → seraphim/appstoreconnect.keyId
CredentialManager.getCredential('appstore-connect', 'issuer-id') → seraphim/appstoreconnect.issuerId
CredentialManager.getCredential('appstore-connect', 'api-key')   → seraphim/appstoreconnect.apiKey
```

The `LocalCredentialManager` already has mappings for `appstore-connect` → env vars. The production `CredentialManagerImpl` reads from Secrets Manager. Both paths work.

---

## Centralized Apple Config

New file: `packages/app/src/zionx/app-development/config/apple-credentials-config.ts`

```typescript
/**
 * Single-tenant config for Apple Developer + Expo accounts.
 * Phase 8 will replace these with per-user config from the API.
 */
export const APPLE_CREDENTIALS_CONFIG = {
  teamId: 'FBDY34F9DY',
  teamType: 'INDIVIDUAL' as const,
  expoAccountName: 'zionxai',
} as const;
```

Used by:
- `ensureIosCredentialsBootstrapped` in `06-build-runner.ts`
- `scripts/bootstrap-ios-credentials.ts` (replaces hardcoded values)

Phase 8 migration path: replace this file with a function that reads per-user config from the API/database.

---

## Existing Patterns Used

| Pattern | Location | How We Use It |
|---------|----------|---------------|
| `withTempCredentialFile` | `utils/temp-credential-file.ts` | Already used for .p8 in iOS build submission. Bootstrap doesn't need it (it handles .p8 in-memory). |
| `CredentialManager` abstraction | `@seraphim/core/interfaces/credential-manager.ts` | Read Apple creds without touching `process.env` directly. |
| `Workspace.readFile` | `workspace/workspace.ts` | Read app.json for bundleIdentifier. |
| Circuit breaker | `utils/circuit-breaker.js` | Already wraps the build submission. Bootstrap errors propagate through it. |

---

## Test Strategy

Existing test file: `pipeline/__tests__/build-runner.test.ts`

The workspace mock already returns an app.json. We need to:
1. Add `ios.bundleIdentifier` to the mock app.json
2. Mock `bootstrapIosCredentials` (vi.mock the apple-credentials module)
3. Add test cases:
   - iOS build with bootstrap success → proceeds to eas build
   - iOS build with bootstrap "all reused" → proceeds (most common case)
   - iOS build with BootstrapMaxCertsError → fails with actionable error
   - iOS build with generic bootstrap error → fails with technical error
   - Android build → bootstrap NOT called (verify spy)
   - iOS build with missing bundleIdentifier in app.json → fails clearly

The mock for `bootstrapIosCredentials` is simple — it's a single async function that either resolves (success) or rejects (failure).

---

## What Changes in the iOS Build Submission

After bootstrap runs, EAS has all credentials cached. The `eas build --platform ios --non-interactive` command finds them automatically via the EAS server.

**Empirical evidence (Build #9)**: The iOS build succeeded without any `EXPO_APPLE_*` env vars during the `eas build` call. Bootstrap cached the creds at EAS, and EAS picked them up automatically.

**Decision**: Remove the `withTempCredentialFile` + env vars path for iOS. After bootstrap, iOS builds use the same `submitBuild(projectPath, platform, expoToken, {})` call as Android — no temp file, no extra env vars. If we discover EAS actually needs them in a future scenario, we add them back with a test that proves necessity.

This simplifies the iOS path from:
```
withTempCredentialFile(.p8) → submitBuild(path, 'ios', token, { EXPO_APPLE_*... })
```
to:
```
submitBuild(path, 'ios', token, {})
```

---

## Idempotency on Every Build

`bootstrapIosCredentials` is designed to be called on every iOS build:
- Step 1 (auth): ~200ms (JWT sign + 1 GraphQL query)
- Step 2 (ASC key): ~200ms (1 list query, finds existing, returns)
- Step 3 (cert): ~400ms (1 EAS list + 1 Apple GET, finds existing, returns)
- Step 4 (bundle ID): ~200ms (1 Apple GET, finds existing)
- Step 5 (profile): ~200ms (1 Apple GET, finds existing)
- Step 6 (bind): ~400ms (1 combined query, finds existing creds, creates build binding)

Total overhead per iOS build: ~1.5-2 seconds of API calls. Acceptable for a build that takes 10-15 minutes.

---

## Files to Create

1. `config/apple-credentials-config.ts` — Centralized Apple/Expo account constants

## Files to Modify

1. `pipeline/06-build-runner.ts` — Add `ensureIosCredentialsBootstrapped` call + import. Remove `withTempCredentialFile` + env vars from iOS path.
2. `pipeline/__tests__/build-runner.test.ts` — Add iOS bootstrap mock + 6 new test cases
3. `scripts/bootstrap-ios-credentials.ts` — Import from config instead of hardcoding

## Files NOT Modified

- `bootstrap-flow.ts` — already complete
- `eas-graphql-client.ts` — already complete
- `asc-client.ts` — already complete
- `services/prompts.ts` — no change needed
