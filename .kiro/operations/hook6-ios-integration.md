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

  // Read bundle identifier from app.json
  const appJsonContent = await workspace.readFile(projectId, 'app.json');
  const appJson = JSON.parse(appJsonContent);
  const bundleIdentifier = appJson?.expo?.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error('app.json missing expo.ios.bundleIdentifier — cannot bootstrap iOS credentials');
  }

  const slug = appJson?.expo?.slug ?? 'app';
  const owner = appJson?.expo?.owner ?? 'zionxai'; // fallback

  // Read Apple credentials from CredentialManager
  const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
  const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
  const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');

  if (!ascKeyId || !ascIssuerId || !ascKeyPem) {
    throw new Error('App Store Connect credentials not available via CredentialManager');
  }

  // Call bootstrap (idempotent — safe on every build)
  await bootstrapIosCredentials({
    ascKeyId,
    ascIssuerId,
    ascKeyPem,
    appleTeamId: 'FBDY34F9DY',       // TODO: make configurable
    appleTeamType: 'INDIVIDUAL',
    expoToken,
    easAccountName: owner,
    bundleIdentifier,
    projectFullName: `@${owner}/${slug}`,
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
   - iOS build with bootstrap succeeding → proceeds to eas build
   - iOS build with bootstrap failing → returns success: false with error
   - iOS build with BootstrapMaxCertsError → returns specific error message
   - Android build → bootstrap NOT called (verify mock not invoked)

The mock for `bootstrapIosCredentials` is simple — it's a single async function that either resolves (success) or rejects (failure).

---

## What Changes in the iOS Build Submission

After bootstrap runs, EAS has all credentials cached. The `eas build --platform ios --non-interactive` command will find them automatically via the EAS server. 

**Key insight**: After bootstrap, we may NOT need the `withTempCredentialFile` + env vars pattern anymore. EAS CLI with `--non-interactive` should pick up the cached credentials from the Expo server (since we just registered them via GraphQL).

**However**, to be safe for v1: keep the existing `withTempCredentialFile` path as a fallback. If EAS still needs the env vars for signing operations (separate from credential lookup), they'll be there. If it doesn't need them, they're harmless.

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

## Files to Modify

1. `pipeline/06-build-runner.ts` — Add `ensureIosCredentialsBootstrapped` call + import
2. `pipeline/__tests__/build-runner.test.ts` — Add iOS bootstrap mock + 4 new test cases

## Files NOT Modified

- `bootstrap-flow.ts` — already complete
- `eas-graphql-client.ts` — already complete
- `asc-client.ts` — already complete
- `services/prompts.ts` — no change needed
