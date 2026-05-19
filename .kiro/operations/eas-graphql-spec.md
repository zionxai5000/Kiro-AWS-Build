# EAS GraphQL API Spec — iOS Credential Management

Extracted from eas-cli source (expo/eas-cli@main, May 2026).
Endpoint: `https://api.expo.dev/graphql`
Auth: `Authorization: Bearer <EXPO_TOKEN>`

---

## 1. createAppleDistributionCertificate

**Mutation:**
```graphql
mutation CreateAppleDistributionCertificateMutation(
  $appleDistributionCertificateInput: AppleDistributionCertificateInput!
  $accountId: ID!
) {
  appleDistributionCertificate {
    createAppleDistributionCertificate(
      appleDistributionCertificateInput: $appleDistributionCertificateInput
      accountId: $accountId
    ) {
      id
      serialNumber
      developerPortalIdentifier
      validityNotBefore
      validityNotAfter
      appleTeam { id appleTeamIdentifier appleTeamName }
    }
  }
}
```

**Input type — `AppleDistributionCertificateInput`:**
```typescript
{
  appleTeamId?: string;                  // EAS-internal Apple Team ID (from createAppleTeam)
  certP12: string;                       // Base64-encoded PKCS#12 (.p12) bundle
  certPassword: string;                  // Password used to encrypt the .p12
  certPrivateSigningKey?: string;        // PEM-encoded private key (optional but recommended)
  developerPortalIdentifier?: string;    // Apple cert ID from /v1/certificates response
}
```

**Returns:** `{ id, serialNumber, developerPortalIdentifier, validityNotBefore, validityNotAfter, appleTeam }`

---

## 2. AppleDistributionCertificateQuery (list existing at EAS)

**Query:**
```graphql
query AppleDistributionCertificatesPaginatedByAccountQuery(
  $accountName: String!
  $after: String
  $first: Int
  $before: String
  $last: Int
) {
  account {
    byName(accountName: $accountName) {
      id
      appleDistributionCertificatesPaginated(
        after: $after, first: $first, before: $before, last: $last
      ) {
        edges {
          cursor
          node { id serialNumber developerPortalIdentifier validityNotBefore validityNotAfter }
        }
        pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
      }
    }
  }
}
```

**Note:** The `account.byName` response includes `id` — this is the **EAS accountId** needed for all mutations.

---

## 3. createAppleAppIdentifier

**Mutation:**
```graphql
mutation CreateAppleAppIdentifierMutation(
  $appleAppIdentifierInput: AppleAppIdentifierInput!
  $accountId: ID!
) {
  appleAppIdentifier {
    createAppleAppIdentifier(
      appleAppIdentifierInput: $appleAppIdentifierInput
      accountId: $accountId
    ) {
      id
      bundleIdentifier
    }
  }
}
```

**Input type — `AppleAppIdentifierInput`:**
```typescript
{
  appleTeamId?: string;          // EAS-internal Apple Team ID
  bundleIdentifier: string;      // e.g. "dev.zionxai.workouttracker"
  parentAppleAppId?: string;     // For wildcard identifiers (not needed for us)
}
```

---

## 4. createAppleProvisioningProfile

**Mutation:**
```graphql
mutation CreateAppleProvisioningProfileMutation(
  $appleProvisioningProfileInput: AppleProvisioningProfileInput!
  $accountId: ID!
  $appleAppIdentifierId: ID!
) {
  appleProvisioningProfile {
    createAppleProvisioningProfile(
      appleProvisioningProfileInput: $appleProvisioningProfileInput
      accountId: $accountId
      appleAppIdentifierId: $appleAppIdentifierId
    ) {
      id
      expiration
      developerPortalIdentifier
      provisioningProfile
      status
      appleTeam { id appleTeamIdentifier appleTeamName }
    }
  }
}
```

**Input type — `AppleProvisioningProfileInput`:**
```typescript
{
  appleProvisioningProfile: string;      // Base64-encoded .mobileprovision file content
  developerPortalIdentifier?: string;    // Apple profile UUID
}
```

---

## 5. createAppStoreConnectApiKey (register ASC key with EAS)

**Mutation:**
```graphql
mutation CreateAppStoreConnectApiKeyMutation(
  $appStoreConnectApiKeyInput: AppStoreConnectApiKeyInput!
  $accountId: ID!
) {
  appStoreConnectApiKey {
    createAppStoreConnectApiKey(
      appStoreConnectApiKeyInput: $appStoreConnectApiKeyInput
      accountId: $accountId
    ) {
      id
      issuerIdentifier
      keyIdentifier
      name
      roles
      appleTeam { id appleTeamIdentifier appleTeamName }
    }
  }
}
```

**Input type — `AppStoreConnectApiKeyInput`:**
```typescript
{
  appleTeamId?: string;              // EAS-internal Apple Team ID
  issuerIdentifier: string;          // Apple issuerId (UUID)
  keyIdentifier: string;             // Apple keyId (10 chars)
  keyP8: string;                     // Raw .p8 file content (PEM)
  name?: string;                     // Display name
  roles?: AppStoreConnectUserRole[]; // ADMIN, DEVELOPER, etc.
}
```

---

## 6. createOrUpdateIosAppBuildCredentials (bind cert + profile to app)

**Mutation:**
```graphql
mutation CreateIosAppBuildCredentialsMutation(
  $iosAppBuildCredentialsInput: IosAppBuildCredentialsInput!
  $iosAppCredentialsId: ID!
) {
  iosAppBuildCredentials {
    createIosAppBuildCredentials(
      iosAppBuildCredentialsInput: $iosAppBuildCredentialsInput
      iosAppCredentialsId: $iosAppCredentialsId
    ) {
      id
    }
  }
}
```

**Input:**
```typescript
{
  iosDistributionType: 'APP_STORE' | 'AD_HOC' | 'ENTERPRISE';
  distributionCertificateId: string;   // EAS cert ID from step 1
  provisioningProfileId: string;       // EAS profile ID from step 4
}
```

---

## 7. Getting the EAS Account ID

The `accountId` required by all mutations is obtained from the `account.byName` query:

```graphql
query {
  account {
    byName(accountName: "zionxai") {
      id    # ← This is the accountId for mutations
      name
    }
  }
}
```

---

## 8. Apple App Store Connect API (for cert creation)

**JWT Auth:**
- Header: `{ "alg": "ES256", "kid": "<keyId>", "typ": "JWT" }`
- Payload: `{ "iss": "<issuerId>", "iat": <now>, "exp": <now+1200>, "aud": "appstoreconnect-v1" }`
- Signed with: ES256 (P-256 + SHA-256), `dsaEncoding: 'ieee-p1363'`

**List certificates:**
```
GET https://api.appstoreconnect.apple.com/v1/certificates?limit=200
Authorization: Bearer <jwt>
```

**Create certificate:**
```
POST https://api.appstoreconnect.apple.com/v1/certificates
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "data": {
    "type": "certificates",
    "attributes": {
      "certificateType": "DISTRIBUTION",
      "csrContent": "<PEM CSR content>"
    }
  }
}
```

**Response:** `{ data: { id, attributes: { certificateContent: "<base64 DER cert>", ... } } }`

**Revoke certificate:**
```
DELETE https://api.appstoreconnect.apple.com/v1/certificates/<certId>
Authorization: Bearer <jwt>
```

---

## 9. Bootstrap Flow Summary

1. Sign ASC JWT → authenticate with Apple
2. GET /v1/certificates → check if valid DISTRIBUTION cert exists
3. If no cert (or max reached and approved to revoke): generate RSA-2048 keypair + CSR → POST to Apple → get signed cert
4. Bundle cert + private key → .p12 (with password)
5. Query EAS GraphQL for accountId (account.byName)
6. Register ASC API key with EAS (createAppStoreConnectApiKey) — idempotent
7. Upload .p12 to EAS (createAppleDistributionCertificate)
8. Register bundle ID at EAS (createAppleAppIdentifier)
9. Create provisioning profile at EAS (createAppleProvisioningProfile) — NOTE: EAS may auto-create this using the registered ASC key
10. Bind cert + profile to app (createOrUpdateIosAppBuildCredentials)

After step 10, `eas build --platform ios --non-interactive` works.
