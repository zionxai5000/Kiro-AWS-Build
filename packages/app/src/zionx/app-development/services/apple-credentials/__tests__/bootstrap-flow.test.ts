/**
 * bootstrap-flow — Unit Tests
 *
 * Mocks all 4 underlying modules (asc-jwt, asc-client, csr-generator, eas-graphql-client).
 * Tests the orchestration logic, idempotency, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bootstrapIosCredentials,
  BootstrapMaxCertsError,
  BootstrapError,
  type BootstrapConfig,
} from '../bootstrap-flow.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../asc-jwt.js', () => ({
  signAscJwt: vi.fn().mockReturnValue('mock-jwt-token'),
}));

const mockListCerts = vi.fn();
const mockCreateCert = vi.fn();
const mockRevokeCert = vi.fn();
const mockListBundleIds = vi.fn();
const mockCreateBundleId = vi.fn();
const mockListProfiles = vi.fn();
const mockAppleCreateProfile = vi.fn();

vi.mock('../asc-client.js', () => ({
  listCertificates: (...args: unknown[]) => mockListCerts(...args),
  createCertificate: (...args: unknown[]) => mockCreateCert(...args),
  revokeCertificate: (...args: unknown[]) => mockRevokeCert(...args),
  listBundleIds: (...args: unknown[]) => mockListBundleIds(...args),
  createBundleId: (...args: unknown[]) => mockCreateBundleId(...args),
  listProfiles: (...args: unknown[]) => mockListProfiles(...args),
  createProvisioningProfile: (...args: unknown[]) => mockAppleCreateProfile(...args),
}));

vi.mock('../csr-generator.js', () => ({
  generateKeyPairAndCsr: vi.fn().mockReturnValue({
    privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\nmock\n-----END RSA PRIVATE KEY-----',
    csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nmock\n-----END CERTIFICATE REQUEST-----',
  }),
  bundleP12: vi.fn().mockReturnValue('mockP12Base64Content'),
}));

const mockGetAccountId = vi.fn();
const mockListDistCerts = vi.fn();
const mockCreateDistCert = vi.fn();
const mockEnsureAscKey = vi.fn();
const mockListAscKeys = vi.fn();
const mockEnsureAppId = vi.fn();
const mockEasCreateProfile = vi.fn();
const mockBindCreds = vi.fn();

vi.mock('../eas-graphql-client.js', () => ({
  getAccountId: (...args: unknown[]) => mockGetAccountId(...args),
  listDistributionCerts: (...args: unknown[]) => mockListDistCerts(...args),
  createDistributionCert: (...args: unknown[]) => mockCreateDistCert(...args),
  ensureAscApiKeyRegistered: (...args: unknown[]) => mockEnsureAscKey(...args),
  listAscApiKeys: (...args: unknown[]) => mockListAscKeys(...args),
  ensureAppIdentifier: (...args: unknown[]) => mockEnsureAppId(...args),
  createProvisioningProfile: (...args: unknown[]) => mockEasCreateProfile(...args),
  bindBuildCredentials: (...args: unknown[]) => mockBindCreds(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseConfig(overrides: Partial<BootstrapConfig> = {}): BootstrapConfig {
  return {
    ascKeyId: 'TESTKEY123',
    ascIssuerId: '12345678-1234-1234-1234-123456789012',
    ascKeyPem: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    appleTeamId: 'FBDY34F9DY',
    appleTeamType: 'INDIVIDUAL',
    expoToken: 'test-expo-token',
    easAccountName: 'zionxai',
    bundleIdentifier: 'dev.zionxai.workouttracker',
    projectFullName: '@zionxai/workout-tracker',
    dryRun: false,
    ...overrides,
  };
}

function setupDefaults(): void {
  mockGetAccountId.mockResolvedValue({ id: 'acc-1', name: 'zionxai' });
  mockEnsureAscKey.mockResolvedValue('eas-asc-key-1');
  mockListDistCerts.mockResolvedValue([]);
  mockListCerts.mockResolvedValue([]);
  mockCreateCert.mockResolvedValue({
    id: 'apple-cert-1', serialNumber: 'SN1', certificateType: 'IOS_DISTRIBUTION',
    name: 'New Cert', expirationDate: '2027-05-19', certificateContent: 'base64DerCert',
  });
  mockCreateDistCert.mockResolvedValue('eas-cert-1');
  mockListBundleIds.mockResolvedValue([]);
  mockCreateBundleId.mockResolvedValue({
    id: 'apple-bid-1', identifier: 'dev.zionxai.workouttracker', name: 'workouttracker', platform: 'IOS',
  });
  mockEnsureAppId.mockResolvedValue('eas-aid-1');
  mockListProfiles.mockResolvedValue([]);
  mockAppleCreateProfile.mockResolvedValue({
    id: 'apple-prof-1', name: 'AppStore', profileContent: 'base64profile',
    profileState: 'ACTIVE', expirationDate: '2027-05-19',
    bundleIdResourceId: 'apple-bid-1', certificateIds: ['apple-cert-1'],
  });
  mockEasCreateProfile.mockResolvedValue('eas-prof-1');
  mockBindCreds.mockResolvedValue('eas-build-cred-1');
  mockListAscKeys.mockResolvedValue([]);
  mockRevokeCert.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bootstrapIosCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  // Happy path
  it('full flow with no existing state — all created', async () => {
    const result = await bootstrapIosCredentials(baseConfig(), vi.fn());

    expect(result.easCertId).toBe('eas-cert-1');
    expect(result.easProfileId).toBe('eas-prof-1');
    expect(result.easAppIdentifierId).toBe('eas-aid-1');
    expect(result.appleCertId).toBe('apple-cert-1');
    expect(result.created.length).toBeGreaterThan(0);
    expect(mockCreateCert).toHaveBeenCalled();
    expect(mockBindCreds).toHaveBeenCalled();
  });

  it('full flow with everything pre-existing — all reused', async () => {
    // EAS has a valid cert that matches Apple
    mockListDistCerts.mockResolvedValue([
      { id: 'eas-cert-existing', serialNumber: 'SN-E', developerPortalIdentifier: 'apple-cert-existing', validityNotAfter: '2027-06-01T00:00:00Z' },
    ]);
    mockListCerts.mockResolvedValue([
      { id: 'apple-cert-existing', serialNumber: 'SN-E', certificateType: 'DISTRIBUTION', name: 'Existing', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);
    // Bundle ID exists at Apple
    mockListBundleIds.mockResolvedValue([
      { id: 'apple-bid-existing', identifier: 'dev.zionxai.workouttracker', name: 'WT', platform: 'IOS' },
    ]);
    // Profile exists at Apple — bound to our bundle ID + cert
    mockListProfiles.mockResolvedValue([
      { id: 'apple-prof-existing', name: 'AppStore', profileContent: 'base64', profileState: 'ACTIVE', expirationDate: '2027-06-01T00:00:00Z', bundleIdResourceId: 'apple-bid-existing', certificateIds: ['apple-cert-existing'] },
    ]);

    const result = await bootstrapIosCredentials(baseConfig(), vi.fn());

    expect(result.easCertId).toBe('eas-cert-existing');
    expect(result.appleCertId).toBe('apple-cert-existing');
    expect(result.reused.length).toBeGreaterThan(0);
    expect(mockCreateCert).not.toHaveBeenCalled();
  });

  // Max certs edge case
  it('throws BootstrapMaxCertsError when 2 dist certs exist and no revoke flag', async () => {
    mockListCerts.mockResolvedValue([
      { id: 'c1', serialNumber: 'SN1', certificateType: 'DISTRIBUTION', name: 'Cert 1', expirationDate: '2027-01-01', certificateContent: 'x' },
      { id: 'c2', serialNumber: 'SN2', certificateType: 'IOS_DISTRIBUTION', name: 'Cert 2', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);

    await expect(
      bootstrapIosCredentials(baseConfig(), vi.fn()),
    ).rejects.toThrow(BootstrapMaxCertsError);
  });

  it('revokes specified cert when --revoke-cert provided', async () => {
    mockListCerts.mockResolvedValue([
      { id: 'c1', serialNumber: 'SN1', certificateType: 'DISTRIBUTION', name: 'Cert 1', expirationDate: '2027-01-01', certificateContent: 'x' },
      { id: 'c2', serialNumber: 'SN2', certificateType: 'IOS_DISTRIBUTION', name: 'Cert 2', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);

    await bootstrapIosCredentials(baseConfig({ revokeCertSerial: 'SN1' }), vi.fn());

    expect(mockRevokeCert).toHaveBeenCalledWith('mock-jwt-token', 'c1');
    expect(mockCreateCert).toHaveBeenCalled();
  });

  it('throws BootstrapError when revoke serial not found', async () => {
    mockListCerts.mockResolvedValue([
      { id: 'c1', serialNumber: 'SN1', certificateType: 'DISTRIBUTION', name: 'Cert 1', expirationDate: '2027-01-01', certificateContent: 'x' },
      { id: 'c2', serialNumber: 'SN2', certificateType: 'IOS_DISTRIBUTION', name: 'Cert 2', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);

    await expect(
      bootstrapIosCredentials(baseConfig({ revokeCertSerial: 'NONEXISTENT' }), vi.fn()),
    ).rejects.toThrow('not found');
  });

  // EAS cert stale at Apple
  it('skips stale EAS cert and creates new when Apple shows it missing', async () => {
    mockListDistCerts.mockResolvedValue([
      { id: 'eas-stale', serialNumber: 'SN-STALE', developerPortalIdentifier: 'apple-gone', validityNotAfter: '2027-06-01T00:00:00Z' },
    ]);
    mockListCerts.mockResolvedValue([]); // Apple doesn't have it

    const result = await bootstrapIosCredentials(baseConfig(), vi.fn());

    expect(result.easCertId).toBe('eas-cert-1'); // New cert created
    expect(mockCreateCert).toHaveBeenCalled();
  });

  // Dry-run
  it('dry-run with empty state — all DRY_RUN IDs, no write calls', async () => {
    const log = vi.fn();
    const result = await bootstrapIosCredentials(baseConfig({ dryRun: true }), log);

    expect(result.easCertId).toMatch(/^DRY_RUN_/);
    expect(result.appleCertId).toMatch(/^DRY_RUN_/);
    expect(mockCreateCert).not.toHaveBeenCalled();
    expect(mockCreateDistCert).not.toHaveBeenCalled();
    expect(mockBindCreds).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[DRY-RUN]'));
  });

  it('dry-run with existing cert — reuses real IDs', async () => {
    mockListDistCerts.mockResolvedValue([
      { id: 'eas-cert-real', serialNumber: 'SN-R', developerPortalIdentifier: 'apple-real', validityNotAfter: '2027-06-01T00:00:00Z' },
    ]);
    mockListCerts.mockResolvedValue([
      { id: 'apple-real', serialNumber: 'SN-R', certificateType: 'DISTRIBUTION', name: 'Real', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);

    const result = await bootstrapIosCredentials(baseConfig({ dryRun: true }), vi.fn());

    expect(result.easCertId).toBe('eas-cert-real');
    expect(result.appleCertId).toBe('apple-real');
  });

  it('dry-run with max certs — still throws BootstrapMaxCertsError', async () => {
    mockListCerts.mockResolvedValue([
      { id: 'c1', serialNumber: 'SN1', certificateType: 'DISTRIBUTION', name: 'C1', expirationDate: '2027-01-01', certificateContent: 'x' },
      { id: 'c2', serialNumber: 'SN2', certificateType: 'IOS_DISTRIBUTION', name: 'C2', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);

    await expect(
      bootstrapIosCredentials(baseConfig({ dryRun: true }), vi.fn()),
    ).rejects.toThrow(BootstrapMaxCertsError);
  });

  it('dry-run with revoke flag — logs intent but does not call revoke', async () => {
    mockListCerts.mockResolvedValue([
      { id: 'c1', serialNumber: 'SN1', certificateType: 'DISTRIBUTION', name: 'C1', expirationDate: '2027-01-01', certificateContent: 'x' },
      { id: 'c2', serialNumber: 'SN2', certificateType: 'IOS_DISTRIBUTION', name: 'C2', expirationDate: '2027-06-01', certificateContent: 'x' },
    ]);

    const log = vi.fn();
    await bootstrapIosCredentials(baseConfig({ dryRun: true, revokeCertSerial: 'SN1' }), log);

    expect(mockRevokeCert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[DRY-RUN] Would revoke'));
  });

  // Bundle ID idempotency
  it('reuses existing bundle ID from Apple', async () => {
    mockListBundleIds.mockResolvedValue([
      { id: 'existing-bid', identifier: 'dev.zionxai.workouttracker', name: 'WT', platform: 'IOS' },
    ]);

    const result = await bootstrapIosCredentials(baseConfig(), vi.fn());

    expect(result.appleBundleIdResourceId).toBe('existing-bid');
    expect(mockCreateBundleId).not.toHaveBeenCalled();
  });

  // Profile filtering bug regression test
  it('does not reuse profile bound to a different bundle ID', async () => {
    // Apple has a profile but it's for a DIFFERENT bundle ID
    mockListProfiles.mockResolvedValue([
      {
        id: 'wrong-prof', name: 'AppStore com.other.app', profileContent: 'base64',
        profileState: 'ACTIVE', expirationDate: '2027-06-01T00:00:00Z',
        bundleIdResourceId: 'other-bundle-resource-id', certificateIds: ['apple-cert-1'],
      },
    ]);

    const result = await bootstrapIosCredentials(baseConfig(), vi.fn());

    // Should NOT reuse the wrong profile — should create new
    expect(result.appleProfileId).toBe('apple-prof-1');
    expect(mockAppleCreateProfile).toHaveBeenCalled();
  });

  it('does not reuse profile bound to a different cert', async () => {
    // Profile matches bundle ID but is bound to a different cert
    mockListBundleIds.mockResolvedValue([
      { id: 'our-bid', identifier: 'dev.zionxai.workouttracker', name: 'WT', platform: 'IOS' },
    ]);
    mockListProfiles.mockResolvedValue([
      {
        id: 'wrong-cert-prof', name: 'AppStore', profileContent: 'base64',
        profileState: 'ACTIVE', expirationDate: '2027-06-01T00:00:00Z',
        bundleIdResourceId: 'our-bid', certificateIds: ['different-cert-id'],
      },
    ]);

    const result = await bootstrapIosCredentials(baseConfig(), vi.fn());

    // Should NOT reuse — cert doesn't match
    expect(result.appleProfileId).toBe('apple-prof-1');
    expect(mockAppleCreateProfile).toHaveBeenCalled();
  });
});
