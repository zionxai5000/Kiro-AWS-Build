/**
 * EAS GraphQL Client — Expo Application Services credential management.
 *
 * Handles queries and mutations for iOS Distribution Certificates,
 * App Identifiers, Provisioning Profiles, and ASC API Keys.
 *
 * Endpoint: https://api.expo.dev/graphql
 * Auth: Bearer <EXPO_TOKEN>
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EasAccountInfo {
  id: string;
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

export interface EasAscApiKey {
  id: string;
  keyIdentifier: string;
  issuerIdentifier: string;
}

export interface CreateDistributionCertInput {
  certP12Base64: string;
  certPassword: string;
  certPrivateSigningKey: string;
  developerPortalIdentifier: string;
  appleTeamId?: string;
}

export interface CreateAscApiKeyInput {
  keyIdentifier: string;
  issuerIdentifier: string;
  keyP8: string;
  name: string;
  appleTeamId?: string;
}

export interface CreateProvisioningProfileInput {
  appleProvisioningProfile: string;
  developerPortalIdentifier?: string;
}

export interface BindBuildCredentialsInput {
  iosDistributionType: 'APP_STORE';
  distributionCertificateId: string;
  provisioningProfileId: string;
}

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class EasGraphQLError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'EasGraphQLError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EAS_GRAPHQL_ENDPOINT = 'https://api.expo.dev/graphql';

// ---------------------------------------------------------------------------
// Private: GraphQL Executor
// ---------------------------------------------------------------------------

async function executeGraphQL(
  expoToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(EAS_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${expoToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new EasGraphQLError(
      `EAS GraphQL HTTP error: ${response.status}`,
      response.status,
    );
  }

  const body = await response.json() as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string; extensions?: { errorCode?: string } }>;
  };

  if (body.errors && body.errors.length > 0) {
    const first = body.errors[0]!;
    throw new EasGraphQLError(
      `EAS GraphQL error: ${first.message}`,
      200,
      first.extensions?.errorCode,
    );
  }

  if (!body.data) {
    throw new EasGraphQLError(
      'EAS GraphQL returned no data and no errors',
      200,
    );
  }

  return body.data;
}

// ---------------------------------------------------------------------------
// Public: Account
// ---------------------------------------------------------------------------

/**
 * Get the EAS account ID by account name.
 */
export async function getAccountId(
  expoToken: string,
  accountName: string,
): Promise<EasAccountInfo> {
  const query = `
    query GetAccountByName($accountName: String!) {
      account {
        byName(accountName: $accountName) {
          id
          name
        }
      }
    }
  `;

  const data = await executeGraphQL(expoToken, query, { accountName });
  const account = (data.account as any).byName;
  return { id: account.id, name: account.name };
}

// ---------------------------------------------------------------------------
// Public: Distribution Certificates
// ---------------------------------------------------------------------------

/**
 * List distribution certificates stored at EAS for this account.
 */
export async function listDistributionCerts(
  expoToken: string,
  accountName: string,
): Promise<EasDistributionCert[]> {
  const query = `
    query ListDistCerts($accountName: String!, $first: Int) {
      account {
        byName(accountName: $accountName) {
          id
          appleDistributionCertificatesPaginated(first: $first) {
            edges {
              node {
                id
                serialNumber
                developerPortalIdentifier
                validityNotAfter
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeGraphQL(expoToken, query, { accountName, first: 50 });
  const edges = (data.account as any).byName.appleDistributionCertificatesPaginated.edges;
  return edges.map((e: any) => ({
    id: e.node.id,
    serialNumber: e.node.serialNumber,
    developerPortalIdentifier: e.node.developerPortalIdentifier,
    validityNotAfter: e.node.validityNotAfter,
  }));
}

/**
 * Upload a distribution certificate (.p12) to EAS.
 * NOT idempotent — caller MUST check listDistributionCerts first.
 */
export async function createDistributionCert(
  expoToken: string,
  accountId: string,
  input: CreateDistributionCertInput,
): Promise<string> {
  const query = `
    mutation CreateAppleDistributionCertificate(
      $appleDistributionCertificateInput: AppleDistributionCertificateInput!
      $accountId: ID!
    ) {
      appleDistributionCertificate {
        createAppleDistributionCertificate(
          appleDistributionCertificateInput: $appleDistributionCertificateInput
          accountId: $accountId
        ) {
          id
        }
      }
    }
  `;

  const variables = {
    accountId,
    appleDistributionCertificateInput: {
      certP12: input.certP12Base64,
      certPassword: input.certPassword,
      certPrivateSigningKey: input.certPrivateSigningKey,
      developerPortalIdentifier: input.developerPortalIdentifier,
      appleTeamId: input.appleTeamId,
    },
  };

  const data = await executeGraphQL(expoToken, query, variables);
  return (data.appleDistributionCertificate as any).createAppleDistributionCertificate.id;
}

// ---------------------------------------------------------------------------
// Public: App Store Connect API Keys
// ---------------------------------------------------------------------------

/**
 * Register an App Store Connect API key with EAS.
 * Idempotent: queries existing keys first by keyIdentifier.
 * If a key with the same keyIdentifier already exists, returns its ID.
 */
export async function ensureAscApiKeyRegistered(
  expoToken: string,
  accountId: string,
  accountName: string,
  input: CreateAscApiKeyInput,
): Promise<string> {
  // Query existing keys — check for matching keyIdentifier
  const existing = await listAscApiKeys(expoToken, accountName);
  const match = existing.find((k) => k.keyIdentifier === input.keyIdentifier);
  if (match) {
    return match.id;
  }

  // Not found — create new
  const createQuery = `
    mutation CreateAppStoreConnectApiKey(
      $appStoreConnectApiKeyInput: AppStoreConnectApiKeyInput!
      $accountId: ID!
    ) {
      appStoreConnectApiKey {
        createAppStoreConnectApiKey(
          appStoreConnectApiKeyInput: $appStoreConnectApiKeyInput
          accountId: $accountId
        ) {
          id
          keyIdentifier
          issuerIdentifier
        }
      }
    }
  `;

  const variables = {
    accountId,
    appStoreConnectApiKeyInput: {
      keyIdentifier: input.keyIdentifier,
      issuerIdentifier: input.issuerIdentifier,
      keyP8: input.keyP8,
      name: input.name,
      appleTeamId: input.appleTeamId,
    },
  };

  const data = await executeGraphQL(expoToken, createQuery, variables);
  return (data.appStoreConnectApiKey as any).createAppStoreConnectApiKey.id;
}

/**
 * List ASC API keys registered at EAS for an account.
 * Used internally for idempotency checks.
 */
export async function listAscApiKeys(
  expoToken: string,
  accountName: string,
): Promise<EasAscApiKey[]> {
  const query = `
    query ListAscKeys($accountName: String!, $first: Int) {
      account {
        byName(accountName: $accountName) {
          id
          appStoreConnectApiKeysPaginated(first: $first) {
            edges {
              node {
                id
                keyIdentifier
                issuerIdentifier
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeGraphQL(expoToken, query, { accountName, first: 50 });
  const edges = (data.account as any).byName.appStoreConnectApiKeysPaginated.edges;
  return edges.map((e: any) => ({
    id: e.node.id,
    keyIdentifier: e.node.keyIdentifier,
    issuerIdentifier: e.node.issuerIdentifier,
  }));
}

// ---------------------------------------------------------------------------
// Public: App Identifiers
// ---------------------------------------------------------------------------

/**
 * Register a bundle identifier with EAS.
 * Idempotent: queries existing by bundleIdentifier first.
 */
export async function ensureAppIdentifier(
  expoToken: string,
  accountId: string,
  bundleIdentifier: string,
  appleTeamId?: string,
  accountName?: string,
): Promise<string> {
  // Query existing by bundle identifier
  if (accountName) {
    const listQuery = `
      query GetAppIdentifier($accountName: String!, $bundleIdentifier: String!) {
        account {
          byName(accountName: $accountName) {
            id
            appleAppIdentifiers(bundleIdentifier: $bundleIdentifier) {
              id
              bundleIdentifier
            }
          }
        }
      }
    `;

    const listData = await executeGraphQL(expoToken, listQuery, { accountName, bundleIdentifier });
    const existing = (listData.account as any).byName.appleAppIdentifiers;
    if (existing && existing.length > 0) {
      return existing[0].id;
    }
  }

  // Create new
  const createQuery = `
    mutation CreateAppleAppIdentifier(
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
  `;

  const variables = {
    accountId,
    appleAppIdentifierInput: {
      bundleIdentifier,
      appleTeamId,
    },
  };

  const data = await executeGraphQL(expoToken, createQuery, variables);
  return (data.appleAppIdentifier as any).createAppleAppIdentifier.id;
}

// ---------------------------------------------------------------------------
// Public: Provisioning Profiles
// ---------------------------------------------------------------------------

/**
 * Upload a provisioning profile to EAS.
 * NOT idempotent — caller checks existing first.
 */
export async function createProvisioningProfile(
  expoToken: string,
  accountId: string,
  appleAppIdentifierId: string,
  input: CreateProvisioningProfileInput,
): Promise<string> {
  const query = `
    mutation CreateAppleProvisioningProfile(
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
        }
      }
    }
  `;

  const variables = {
    accountId,
    appleAppIdentifierId,
    appleProvisioningProfileInput: {
      appleProvisioningProfile: input.appleProvisioningProfile,
      developerPortalIdentifier: input.developerPortalIdentifier,
    },
  };

  const data = await executeGraphQL(expoToken, query, variables);
  return (data.appleProvisioningProfile as any).createAppleProvisioningProfile.id;
}

// ---------------------------------------------------------------------------
// Public: Build Credentials Binding
// ---------------------------------------------------------------------------

/**
 * Bind a cert + profile to an app for builds.
 * Idempotent: queries existing IosAppCredentials first, creates only if not found.
 * Then creates IosAppBuildCredentials binding.
 */
export async function bindBuildCredentials(
  expoToken: string,
  projectFullName: string,
  appleAppIdentifierId: string,
  input: BindBuildCredentialsInput,
): Promise<string> {
  // 1. Combined query: get app ID + existing IosAppCredentials
  const combinedQuery = `
    query GetAppAndCredentials($projectFullName: String!, $appleAppIdentifierId: String!) {
      app {
        byFullName(fullName: $projectFullName) {
          id
          iosAppCredentials(filter: { appleAppIdentifierId: $appleAppIdentifierId }) {
            id
          }
        }
      }
    }
  `;

  const combinedData = await executeGraphQL(expoToken, combinedQuery, {
    projectFullName,
    appleAppIdentifierId,
  });
  const app = (combinedData.app as any).byFullName;
  const appId: string = app.id;
  const existingCreds: Array<{ id: string }> = app.iosAppCredentials ?? [];

  let iosAppCredentialsId: string;

  if (existingCreds.length > 0) {
    // 2a. Reuse existing
    iosAppCredentialsId = existingCreds[0]!.id;
  } else {
    // 2b. Create new IosAppCredentials
    const createCredsQuery = `
      mutation CreateIosAppCredentials(
        $iosAppCredentialsInput: IosAppCredentialsInput!
        $appId: ID!
        $appleAppIdentifierId: ID!
      ) {
        iosAppCredentials {
          createIosAppCredentials(
            iosAppCredentialsInput: $iosAppCredentialsInput
            appId: $appId
            appleAppIdentifierId: $appleAppIdentifierId
          ) {
            id
          }
        }
      }
    `;
    const createData = await executeGraphQL(expoToken, createCredsQuery, {
      iosAppCredentialsInput: {},
      appId,
      appleAppIdentifierId,
    });
    iosAppCredentialsId = (createData.iosAppCredentials as any).createIosAppCredentials.id;
  }

  // 3. Create the build credentials binding
  const bindQuery = `
    mutation CreateIosAppBuildCredentials(
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
  `;

  const bindData = await executeGraphQL(expoToken, bindQuery, {
    iosAppCredentialsId,
    iosAppBuildCredentialsInput: {
      iosDistributionType: input.iosDistributionType,
      distributionCertificateId: input.distributionCertificateId,
      provisioningProfileId: input.provisioningProfileId,
    },
  });
  return (bindData.iosAppBuildCredentials as any).createIosAppBuildCredentials.id;
}
