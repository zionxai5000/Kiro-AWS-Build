# iOS Credential Bootstrap — Design Document (Group B)

## File Structure

```
packages/app/src/zionx/app-development/services/apple-credentials/
  asc-jwt.ts                  — JWT signing for App Store Connect API
  asc-client.ts               — Apple API: list/create/revoke certs, list/create bundle IDs
  csr-generator.ts            — RSA-2048 keypair + CSR generation, .p12 bundling (node-forge)
  eas-graphql-client.ts       — EAS GraphQL queries + mutations
  bootstrap-flow.ts           — Orchestrator: idempotent end-to-end flow
  __tests__/
    asc-jwt.test.ts
    asc-client.test.ts
    csr-generator.test.ts
    eas-graphql-client.test.ts
    bootstrap-flow.test.ts

scripts/
  bootstrap-ios-credentials.ts  — CLI entry point (reads config, calls bootstrap-flow)
```

---

## Configuration Shape

```typescript
interface BootstrapConfig {
  // Apple credentials (from seraphim/appstoreconnect)
  ascKeyId: string;           // 10-char Apple API Key ID
  ascIssuerId: string;        // UUID issuer ID
  ascKeyPem: string;          // .p8 PEM content

  // Apple team
  appleTeamId: string;        // 10-char team ID (e.g., "FBDY34F9DY")
  appleTeamType: 'INDIVIDUAL' | 'COMPANY_OR_ORGANIZATION' | 'IN_HOUSE';

  // EAS credentials (from seraphim/expo)
  expoToken: string;          // Expo access token
  easAccountName: string;     // "zionxai" (Expo account name)

  // App-specific
  bundleIdentifier: string;   // e.g., "dev.zionxai.workouttracker"

  // Optional: cert revocation (for the 2-cert-limit edge case)
  revokeCertSerial?: string;  // If set, revoke this cert before creating new
}
```

**Source of each field:**
- `ascKeyId`, `ascIssuerId`, `ascKeyPem` → `seraphim/appstoreconnect` secret
- `appleTeamId` → hardcoded "FBDY34F9DY" (or future config)
- `appleTeamType` → hardcoded "INDIVIDUAL"
- `expoToken` → `seraphim/expo` secret (extracted from non-standard JSON)
- `easAccountName` → "zionxai" (from `eas whoami`)
- `bundleIdentifier` → read from workspace `app.json` (expo.ios.bundleIdentifier)
- `revokeCertSerial` → CLI flag `--revoke-cert <serial>` (optional)

---

## Function Signatures + Idempotency

### 1. asc-jwt.ts

```typescript
/**
 * Sign a JWT for App Store Connect API authentication.
 * Stateless, no side effects, no idempotency concern.
 */
export function signAscJwt(
  keyId: string,
  issuerId: string,
  privateKeyPem: string,
): string;
// Returns: signed JWT string (valid for 20 minutes)
// Failure: throws if key is malformed or not EC P-256
```

### 2. asc-client.ts

```typescript
export interface AppleCertificate {
  id: string;
  serialNumber: string;
  certificateType: string;       // "DISTRIBUTION" | "IOS_DISTRIBUTION" | "DEVELOPMENT"
  name: string;
  expirationDate: string;
  certificateContent: string;    // base64 DER
}

export interface AppleBundleId {
  id: string;
  identifier: string;            // e.g., "dev.zionxai.workouttracker"
  name: string;
  platform: string;
}

export interface AppleProfile {
  id: string;
  name: string;
  profileContent: string;        // base64 .mobileprovision
  profileState: string;
  expirationDate: string;
}

/**
 * List all certificates on the Apple account.
 * Idempotency: read-only, no state change.
 */
export async function listCertificates(jwt: string): Promise<AppleCertificate[]>;

/**
 * Create a new Distribution Certificate at Apple.
 * Idempotency: NOT idempotent — creates a new cert every call.
 *   Caller MUST check listCertificates first.
 * Failure: throws if max certs reached (HTTP 409), or CSR invalid.
 */
export async function createCertificate(
  jwt: string,
  csrPem: string,
): Promise<AppleCertificate>;

/**
 * Revoke (delete) a certificate at Apple.
 * Idempotency: idempotent — revoking an already-revoked cert returns 404 (handled gracefully).
 * DANGEROUS: irreversible. Only call with explicit user approval.
 */
export async function revokeCertificate(jwt: string, certId: string): Promise<void>;

/**
 * List bundle IDs registered at Apple.
 * Idempotency: read-only.
 */
export async function listBundleIds(jwt: string): Promise<AppleBundleId[]>;

/**
 * Create a bundle ID at Apple.
 * Idempotency: Apple returns 409 if identifier already exists.
 *   We catch 409 and return the existing bundle ID via a follow-up GET.
 */
export async function createBundleId(
  jwt: string,
  identifier: string,
  name: string,
  platform: 'IOS' | 'UNIVERSAL',
): Promise<AppleBundleId>;

/**
 * Create a provisioning profile at Apple.
 * Idempotency: NOT idempotent — creates a new profile every call.
 *   Caller checks existing profiles first.
 */
export async function createProvisioningProfile(
  jwt: string,
  name: string,
  bundleIdResourceId: string,
  certificateId: string,
  profileType: 'IOS_APP_STORE',
): Promise<AppleProfile>;

/**
 * List provisioning profiles at Apple.
 * Idempotency: read-only.
 */
export async function listProfiles(jwt: string): Promise<AppleProfile[]>;
```

### 3. csr-generator.ts

```typescript
export interface KeyPairAndCsr {
  privateKeyPem: string;     // RSA-2048 private key in PEM format
  csrPem: string;            // Certificate Signing Request in PEM format
}

/**
 * Generate an RSA-2048 key pair and a CSR for Apple Distribution cert.
 * Stateless — generates fresh keypair every call.
 * The private key MUST be kept in memory only, never written to disk
 * except via withTempFile pattern.
 */
export function generateKeyPairAndCsr(
  commonName?: string,       // Default: "Apple Distribution"
): KeyPairAndCsr;

/**
 * Bundle a signed certificate + private key into PKCS#12 (.p12) format.
 * Returns base64-encoded .p12 content (ready for EAS upload).
 */
export function bundleP12(
  certDerBase64: string,     // base64 DER cert from Apple response
  privateKeyPem: string,     // PEM private key from generateKeyPairAndCsr
  password: string,          // Password to encrypt the .p12
): string;                   // Returns: base64-encoded .p12
```

### 4. eas-graphql-client.ts

```typescript
export interface EasAccountInfo {
  id: string;                // The accountId needed for all mutations
  name: string;
}

export interface EasDistributionCert {
  id: string;
  serialNumber: string;
  developerPortalIdentifier: string | null;
  validityNotAfter: string;
}

export interface EasAppIdentifier {
  id: string;
  bundleIdentifier: string;
}

/**
 * Get the EAS account ID by account name.
 * Idempotency: read-only.
 */
export async function getAccountId(
  expoToken: string,
  accountName: string,
): Promise<EasAccountInfo>;

/**
 * List distribution certificates stored at EAS for this account.
 * Idempotency: read-only.
 */
export async function listDistributionCerts(
  expoToken: string,
  accountName: string,
): Promise<EasDistributionCert[]>;

/**
 * Upload a distribution certificate (.p12) to EAS.
 * Idempotency: NOT idempotent — creates a new record every call.
 *   Caller MUST check listDistributionCerts first.
 * Returns the EAS-internal cert ID.
 */
export async function createDistributionCert(
  expoToken: string,
  accountId: string,
  input: {
    certP12Base64: string;
    certPassword: string;
    certPrivateSigningKey: string;   // PEM
    developerPortalIdentifier: string;
    appleTeamId?: string;            // EAS-internal team ID
  },
): Promise<string>;  // Returns EAS cert ID

/**
 * Register an App Store Connect API key with EAS.
 * Idempotency: query existing keys first by keyIdentifier.
 *   If found, return existing ID. If not, create.
 */
export async function ensureAscApiKeyRegistered(
  expoToken: string,
  accountId: string,
  input: {
    keyIdentifier: string;
    issuerIdentifier: string;
    keyP8: string;
    name: string;
    appleTeamId?: string;
  },
): Promise<string>;  // Returns EAS ASC key ID

/**
 * Register a bundle identifier with EAS.
 * Idempotency: query existing by bundleIdentifier.
 *   If found, return existing ID. If not, create.
 */
export async function ensureAppIdentifier(
  expoToken: string,
  accountId: string,
  bundleIdentifier: string,
  appleTeamId?: string,
): Promise<string>;  // Returns EAS app identifier ID

/**
 * Upload a provisioning profile to EAS.
 * Idempotency: NOT idempotent — caller checks existing first.
 */
export async function createProvisioningProfile(
  expoToken: string,
  accountId: string,
  appleAppIdentifierId: string,
  input: {
    appleProvisioningProfile: string;  // base64 .mobileprovision
    developerPortalIdentifier?: string;
  },
): Promise<string>;  // Returns EAS profile ID

/**
 * Bind a cert + profile to an app for builds.
 * Idempotency: EAS upserts — safe to call multiple times.
 */
export async function bindBuildCredentials(
  expoToken: string,
  accountId: string,
  appLookupParams: { projectFullName: string; appleAppIdentifierId: string },
  input: {
    iosDistributionType: 'APP_STORE';
    distributionCertificateId: string;
    provisioningProfileId: string;
    appleTeamId: string;
  },
): Promise<string>;  // Returns EAS build credentials ID
```

### 5. bootstrap-flow.ts

```typescript
export interface BootstrapResult {
  easCertId: string;
  easProfileId: string;
  easAppIdentifierId: string;
  easAscKeyId: string;
  appleCertId: string;
  appleProfileId: string;
  appleBundleIdResourceId: string;
  created: string[];          // List of resources that were newly created
  reused: string[];           // List of resources that already existed
}

/**
 * Orchestrate the full iOS credential bootstrap.
 * Idempotent: safe to call multiple times. Checks existing state
 * at both Apple and EAS before creating anything.
 *
 * Exit codes (when used via CLI):
 *   0 = success (all credentials ready)
 *   1 = unrecoverable error (network, auth, malformed data)
 *   2 = max certs reached at Apple, needs --revoke-cert flag
 */
export async function bootstrapIosCredentials(
  config: BootstrapConfig,
  log: (msg: string) => void,
): Promise<BootstrapResult>;
```

---

## Bootstrap Flow — Step-by-Step Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Authenticate                                            │
│   - Sign ASC JWT (asc-jwt.ts)                                   │
│   - Get EAS account ID (eas-graphql-client.getAccountId)        │
│   - Both are read-only, no state change                         │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Register ASC API Key with EAS (idempotent)              │
│   - Check: query EAS for existing ASC keys by keyIdentifier     │
│   - If found: reuse, log "ASC key already registered"           │
│   - If not: create via createAppStoreConnectApiKey mutation      │
│   - Source of truth: EAS                                        │
│   - Conflict: if keyId in secret ≠ keyId at EAS → error + stop │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Ensure Distribution Certificate                         │
│                                                                 │
│   3a. Check EAS AND Apple for an existing usable cert           │
│       - Query EAS: listDistributionCerts(accountName)           │
│       - For each EAS cert with validityNotAfter > now + 30d:    │
│         - Look up its developerPortalIdentifier at Apple        │
│           (match against listCertificates() result by ID)       │
│         - If found at Apple AND not revoked:                    │
│           → REUSE. Log "Verified cert <id> at Apple". SKIP 3b-3f│
│         - If not found at Apple OR revoked:                     │
│           → Log "EAS has stale cert <id>, skipping"             │
│           → Continue checking next EAS cert                     │
│       - If no valid EAS+Apple cert match found → proceed to 3b  │
│                                                                 │
│   3b. Check Apple for existing certs we could use               │
│       - GET /v1/certificates                                    │
│       - Filter: type=DISTRIBUTION, not expired                  │
│       - Problem: we have NO private keys for existing certs     │
│       - So existing Apple certs are NOT usable                  │
│                                                                 │
│   3c. Check Apple cert count                                    │
│       - Count DISTRIBUTION + IOS_DISTRIBUTION certs             │
│       - If count >= 2 AND no --revoke-cert flag:                │
│         → EXIT CODE 2. Print existing cert serials.             │
│         → Message: "Max certs reached. Re-run with              │
│           --revoke-cert <serial> to revoke one."                │
│       - If --revoke-cert provided:                              │
│         → Revoke the specified cert (DELETE)                    │
│         → Log "Revoked cert <serial>"                           │
│                                                                 │
│   3d. Generate keypair + CSR                                    │
│       - generateKeyPairAndCsr() → { privateKeyPem, csrPem }    │
│       - Private key held in memory ONLY                         │
│                                                                 │
│   3e. Create cert at Apple                                      │
│       - POST /v1/certificates with CSR                          │
│       - Response: signed cert (base64 DER)                      │
│       - Bundle into .p12: bundleP12(certDer, privateKey, pwd)   │
│                                                                 │
│   3f. Upload .p12 to EAS                                        │
│       - createDistributionCert(certP12, password, privateKey,   │
│         developerPortalIdentifier=appleCertId)                  │
│       - Returns: easCertId                                      │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Ensure Bundle ID at Apple (idempotent)                  │
│   - Check: GET /v1/bundleIds?filter[identifier]=<bundleId>      │
│   - If found: reuse Apple's resource ID                         │
│   - If not: POST /v1/bundleIds to create                        │
│   - Also ensure at EAS: ensureAppIdentifier(bundleId)           │
│   - Source of truth: Apple (EAS mirrors it)                     │
│   - Conflict: if Apple has it but EAS doesn't → create at EAS  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Ensure Provisioning Profile                             │
│   - Check: GET /v1/profiles?filter[bundleId]=<resourceId>       │
│     AND filter by cert ID from step 3                           │
│   - If found + not expired: reuse                               │
│   - If not: POST /v1/profiles to create (type=IOS_APP_STORE,   │
│     bound to our cert + bundle ID)                              │
│   - Upload to EAS: createProvisioningProfile(base64 content)    │
│   - Source of truth: Apple creates, EAS stores                  │
│   - Conflict: if Apple has profile but EAS doesn't → upload     │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Bind credentials to app at EAS                          │
│   - bindBuildCredentials(certId, profileId, appIdentifierId)    │
│   - EAS upserts — safe to call multiple times                   │
│   - After this, `eas build --platform ios --non-interactive`    │
│     will find and use these credentials automatically           │
└─────────────────────────────────────────────────────────────────┘
```

---

## P12 Password Handling

The .p12 bundle requires a password for encryption. Strategy:

- **Generated per run**: `crypto.randomBytes(16).toString('hex')` — 32-char random hex string
- **Never reused** across bootstrap runs
- **Never logged** — must NOT appear in `--verbose` output or any log file
- **Never written to disk** — exists only in memory between `bundleP12()` and `createDistributionCert()`
- **EAS encrypts at rest** with its own key; the upload password satisfies the .p12 format requirement only
- **Lifetime**: created just before `bundleP12()`, passed to `createDistributionCert()`, then dereferenced immediately

```typescript
// In bootstrap-flow.ts, Step 3e:
const p12Password = crypto.randomBytes(16).toString('hex');
const p12Base64 = bundleP12(certDerBase64, privateKeyPem, p12Password);
const easCertId = await createDistributionCert(expoToken, accountId, {
  certP12Base64: p12Base64,
  certPassword: p12Password,
  certPrivateSigningKey: privateKeyPem,
  developerPortalIdentifier: appleCert.id,
  appleTeamId: easAppleTeamId,
});
// p12Password is no longer needed — GC will collect
```

---

## Idempotency Matrix

| Resource | "Already exists" check | Source of truth | Apple↔EAS conflict handling |
|----------|----------------------|-----------------|---------------------------|
| ASC API Key (at EAS) | Query EAS by keyIdentifier | EAS | If mismatch with secret → error |
| Distribution Cert | Query EAS for valid cert (expiry > now+30d) AND verify at Apple (not revoked) | Both (EAS holds .p12, Apple is authority on revocation) | If EAS has cert but Apple revoked it → stale, skip, create new |
| Bundle ID | GET Apple /v1/bundleIds by identifier | Apple | If Apple has it but EAS doesn't → create at EAS |
| Provisioning Profile | GET Apple /v1/profiles by bundleId+certId | Apple | If Apple has it but EAS doesn't → download + upload to EAS |
| Build Credentials binding | EAS upserts | EAS | Always safe to re-call |

---

## The 2-Cert-Limit Edge Case

**Heuristic**: Do NOT auto-revoke. Instead:

1. `bootstrapIosCredentials()` calls `listCertificates()` at Apple
2. Counts certs where `certificateType` is `DISTRIBUTION` or `IOS_DISTRIBUTION`
3. If count >= 2:
   - Prints: "Apple account has {count} distribution certificates (max 2):"
   - Lists each: serial, name, type, expiration
   - Prints: "Cannot create a new certificate. Options:"
   - "  --revoke-cert <serial>  Revoke the specified cert and create new"
   - Exits with code 2
4. If `config.revokeCertSerial` is set:
   - Finds the cert by serial in the list
   - Calls `revokeCertificate(jwt, certId)`
   - Proceeds with creation

**Why not auto-revoke**: Revoking the wrong cert could break other apps signed with it. The operator (human) must decide which cert is safe to revoke.

---

## Test Strategy

| Module | Test approach | Key assertions |
|--------|--------------|----------------|
| `asc-jwt` | Known-input test: fixed keyId + issuerId + key → verify JWT structure (3 dot-separated base64url segments, correct header claims) | Header has alg=ES256, kid=keyId, typ=JWT. Payload has iss, iat, exp, aud. Signature is 64 bytes (ieee-p1363). |
| `asc-client` | Mocked fetch. Provide canned Apple API responses. | Verify request URL, headers, body shape. Verify response parsing. Verify 409 handling for createBundleId. Verify error propagation for 403/401. |
| `csr-generator` | Real crypto (no mocks). | CSR parses as valid PEM. Contains RSA-2048 public key. .p12 bundle can be decoded with the password. Extracted cert matches input. |
| `eas-graphql-client` | Mocked fetch. Provide canned GraphQL responses. | Verify query/mutation strings. Verify variable passing. Verify response extraction. Verify idempotency (ensureX returns existing ID without mutation call). |
| `bootstrap-flow` | All 4 clients mocked. | Full happy path: all steps run, returns BootstrapResult. Idempotent path: all "already exists" checks return true, no create calls made. Max-cert path: exits with code 2 message. Revoke path: revokes then creates. Partial failure: step 3 fails, steps 4-6 don't run. |

---

## CLI Script Interface

```
Usage: npx tsx scripts/bootstrap-ios-credentials.ts [options]

Options:
  --bundle-id <id>         Bundle identifier (default: read from app.json)
  --revoke-cert <serial>   Revoke this cert serial before creating new
  --dry-run                Log what would happen without making changes
  --verbose                Print detailed step-by-step output

Exit codes:
  0  All credentials ready (created or reused)
  1  Unrecoverable error
  2  Max certs reached — needs --revoke-cert
```

Reads all secrets from AWS Secrets Manager. No .env files, no hardcoded credentials.

---

## Dry-Run Mode

When `config.dryRun === true` (via `--dry-run` CLI flag):

**Reads execute normally:**
- All GET requests to Apple API (list certs, bundle IDs, profiles)
- All GraphQL queries to EAS (list certs, get account ID)
- `generateKeyPairAndCsr()` runs (no side effects, pure crypto)

**Writes are SKIPPED:**
- `createCertificate()` → logs `[DRY-RUN] Would create Distribution cert at Apple with CSR (xxx bytes)`, returns synthetic `{ id: "DRY_RUN_CERT_ID", ... }`
- `revokeCertificate()` → logs `[DRY-RUN] Would revoke cert <serial>`, returns void
- `createBundleId()` → logs `[DRY-RUN] Would create bundle ID <identifier>`, returns synthetic
- `createProvisioningProfile()` → logs, returns synthetic
- All EAS mutations → logs, returns synthetic IDs (`"DRY_RUN_EAS_*"`)

**Return value:**
- `BootstrapResult.created` lists what WOULD have been created
- `BootstrapResult.reused` lists what was found existing (from real reads)
- All IDs in the result are either real (reused) or `"DRY_RUN_*"` (would-create)

**Use cases:**
- Preview `--revoke-cert` behavior before authorizing the destructive flag
- Verify the flow logic without touching Apple/EAS state
- CI validation that the bootstrap script parses config correctly
