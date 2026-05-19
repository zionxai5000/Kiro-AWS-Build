/**
 * eas-graphql-client — Unit Tests (mocked fetch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAccountId,
  listDistributionCerts,
  createDistributionCert,
  ensureAscApiKeyRegistered,
  listAscApiKeys,
  ensureAppIdentifier,
  createProvisioningProfile,
  bindBuildCredentials,
  EasGraphQLError,
  EAS_GRAPHQL_ENDPOINT,
} from '../eas-graphql-client.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test-expo-token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gqlSuccess(data: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ data }),
  };
}

function gqlError(message: string, errorCode?: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      data: null,
      errors: [{ message, extensions: { errorCode } }],
    }),
  };
}

function httpError(status: number): Partial<Response> {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('eas-graphql-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // getAccountId
  // -------------------------------------------------------------------------

  describe('getAccountId', () => {
    it('returns account id and name', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        account: { byName: { id: 'acc-123', name: 'zionxai' } },
      }));

      const result = await getAccountId(TOKEN, 'zionxai');

      expect(result.id).toBe('acc-123');
      expect(result.name).toBe('zionxai');
    });

    it('sends correct auth header', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        account: { byName: { id: 'acc-1', name: 'test' } },
      }));

      await getAccountId(TOKEN, 'test');

      expect(mockFetch).toHaveBeenCalledWith(
        EAS_GRAPHQL_ENDPOINT,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${TOKEN}`,
          }),
        }),
      );
    });

    it('throws EasGraphQLError on HTTP non-2xx', async () => {
      mockFetch.mockResolvedValueOnce(httpError(401));

      await expect(getAccountId(TOKEN, 'test')).rejects.toThrow(EasGraphQLError);
    });

    it('throws EasGraphQLError on GraphQL errors', async () => {
      mockFetch.mockResolvedValueOnce(gqlError('Account not found', 'NOT_FOUND'));

      await expect(getAccountId(TOKEN, 'bad')).rejects.toThrow('Account not found');
    });
  });

  // -------------------------------------------------------------------------
  // listDistributionCerts
  // -------------------------------------------------------------------------

  describe('listDistributionCerts', () => {
    it('returns parsed cert list', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        account: {
          byName: {
            id: 'acc-1',
            appleDistributionCertificatesPaginated: {
              edges: [
                { node: { id: 'cert-1', serialNumber: 'SN1', developerPortalIdentifier: 'dp-1', validityNotAfter: '2027-01-01' } },
                { node: { id: 'cert-2', serialNumber: 'SN2', developerPortalIdentifier: null, validityNotAfter: '2027-06-01' } },
              ],
            },
          },
        },
      }));

      const certs = await listDistributionCerts(TOKEN, 'zionxai');

      expect(certs).toHaveLength(2);
      expect(certs[0]!.id).toBe('cert-1');
      expect(certs[1]!.developerPortalIdentifier).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createDistributionCert
  // -------------------------------------------------------------------------

  describe('createDistributionCert', () => {
    it('returns the new cert ID', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        appleDistributionCertificate: {
          createAppleDistributionCertificate: { id: 'new-cert-eas-1' },
        },
      }));

      const id = await createDistributionCert(TOKEN, 'acc-1', {
        certP12Base64: 'base64p12',
        certPassword: 'pass',
        certPrivateSigningKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
        developerPortalIdentifier: 'apple-cert-id',
      });

      expect(id).toBe('new-cert-eas-1');
    });

    it('throws on GraphQL error', async () => {
      mockFetch.mockResolvedValueOnce(gqlError('Invalid certificate data'));

      await expect(
        createDistributionCert(TOKEN, 'acc-1', {
          certP12Base64: 'bad',
          certPassword: 'x',
          certPrivateSigningKey: 'x',
          developerPortalIdentifier: 'x',
        }),
      ).rejects.toThrow('Invalid certificate data');
    });
  });

  // -------------------------------------------------------------------------
  // ensureAscApiKeyRegistered
  // -------------------------------------------------------------------------

  describe('ensureAscApiKeyRegistered', () => {
    it('creates and returns new ASC key ID', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        appStoreConnectApiKey: {
          createAppStoreConnectApiKey: { id: 'asc-key-1', keyIdentifier: 'ABC123', issuerIdentifier: 'uuid-1' },
        },
      }));

      const id = await ensureAscApiKeyRegistered(TOKEN, 'acc-1', {
        keyIdentifier: 'ABC123',
        issuerIdentifier: 'uuid-1',
        keyP8: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        name: 'SeraphimOS Key',
      });

      expect(id).toBe('asc-key-1');
    });
  });

  // -------------------------------------------------------------------------
  // listAscApiKeys
  // -------------------------------------------------------------------------

  describe('listAscApiKeys', () => {
    it('returns parsed ASC key list', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        account: {
          byName: {
            id: 'acc-1',
            appStoreConnectApiKeysPaginated: {
              edges: [
                { node: { id: 'key-1', keyIdentifier: 'K1', issuerIdentifier: 'I1' } },
              ],
            },
          },
        },
      }));

      const keys = await listAscApiKeys(TOKEN, 'zionxai');

      expect(keys).toHaveLength(1);
      expect(keys[0]!.keyIdentifier).toBe('K1');
    });
  });

  // -------------------------------------------------------------------------
  // ensureAppIdentifier
  // -------------------------------------------------------------------------

  describe('ensureAppIdentifier', () => {
    it('returns existing ID when bundle identifier already registered', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        account: {
          byName: {
            id: 'acc-1',
            appleAppIdentifiers: [{ id: 'existing-aid-1', bundleIdentifier: 'dev.zionxai.app' }],
          },
        },
      }));

      const id = await ensureAppIdentifier(TOKEN, 'acc-1', 'dev.zionxai.app', undefined, 'zionxai');

      expect(id).toBe('existing-aid-1');
      // Only 1 fetch call (the query), no mutation
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('creates new when not found', async () => {
      // First call: query returns empty
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        account: {
          byName: {
            id: 'acc-1',
            appleAppIdentifiers: [],
          },
        },
      }));
      // Second call: mutation creates
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        appleAppIdentifier: {
          createAppleAppIdentifier: { id: 'new-aid-1', bundleIdentifier: 'dev.zionxai.newapp' },
        },
      }));

      const id = await ensureAppIdentifier(TOKEN, 'acc-1', 'dev.zionxai.newapp', 'team-1', 'zionxai');

      expect(id).toBe('new-aid-1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // createProvisioningProfile
  // -------------------------------------------------------------------------

  describe('createProvisioningProfile', () => {
    it('returns new profile ID', async () => {
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        appleProvisioningProfile: {
          createAppleProvisioningProfile: { id: 'prof-1' },
        },
      }));

      const id = await createProvisioningProfile(TOKEN, 'acc-1', 'aid-1', {
        appleProvisioningProfile: 'base64profile',
        developerPortalIdentifier: 'apple-prof-uuid',
      });

      expect(id).toBe('prof-1');
    });
  });

  // -------------------------------------------------------------------------
  // bindBuildCredentials
  // -------------------------------------------------------------------------

  describe('bindBuildCredentials', () => {
    it('binds cert + profile to app and returns build creds ID', async () => {
      // First: get app ID
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        app: { byFullName: { id: 'app-1' } },
      }));
      // Second: create/get ios app credentials
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        iosAppCredentials: { createOrGetIosAppCredentials: { id: 'ios-cred-1' } },
      }));
      // Third: create build credentials
      mockFetch.mockResolvedValueOnce(gqlSuccess({
        iosAppBuildCredentials: { createIosAppBuildCredentials: { id: 'build-cred-1' } },
      }));

      const id = await bindBuildCredentials(
        TOKEN,
        '@zionxai/workout-tracker',
        'aid-1',
        {
          iosDistributionType: 'APP_STORE',
          distributionCertificateId: 'cert-1',
          provisioningProfileId: 'prof-1',
          appleTeamId: 'team-1',
        },
      );

      expect(id).toBe('build-cred-1');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('safe to call multiple times (upsert semantics)', async () => {
      // Both calls succeed
      for (let i = 0; i < 2; i++) {
        mockFetch.mockResolvedValueOnce(gqlSuccess({ app: { byFullName: { id: 'app-1' } } }));
        mockFetch.mockResolvedValueOnce(gqlSuccess({ iosAppCredentials: { createOrGetIosAppCredentials: { id: 'ios-cred-1' } } }));
        mockFetch.mockResolvedValueOnce(gqlSuccess({ iosAppBuildCredentials: { createIosAppBuildCredentials: { id: 'build-cred-1' } } }));
      }

      const id1 = await bindBuildCredentials(TOKEN, '@zionxai/app', 'aid-1', {
        iosDistributionType: 'APP_STORE', distributionCertificateId: 'c1', provisioningProfileId: 'p1', appleTeamId: 't1',
      });
      const id2 = await bindBuildCredentials(TOKEN, '@zionxai/app', 'aid-1', {
        iosDistributionType: 'APP_STORE', distributionCertificateId: 'c1', provisioningProfileId: 'p1', appleTeamId: 't1',
      });

      expect(id1).toBe('build-cred-1');
      expect(id2).toBe('build-cred-1');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws EasGraphQLError with errorCode from extensions', async () => {
      mockFetch.mockResolvedValueOnce(gqlError('Permission denied', 'UNAUTHORIZED'));

      try {
        await getAccountId(TOKEN, 'test');
      } catch (e) {
        expect(e).toBeInstanceOf(EasGraphQLError);
        expect((e as EasGraphQLError).errorCode).toBe('UNAUTHORIZED');
      }
    });

    it('throws on missing data field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(getAccountId(TOKEN, 'test')).rejects.toThrow('no data and no errors');
    });
  });
});
