/**
 * asc-client — Unit Tests (mocked fetch)
 *
 * Tests the App Store Connect API client against canned responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listCertificates,
  createCertificate,
  revokeCertificate,
  listBundleIds,
  createBundleId,
  listProfiles,
  createProvisioningProfile,
  AppleApiError,
} from '../asc-client.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TEST_JWT = 'test.jwt.token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function errorResponse(status: number, code: string, title: string, detail = ''): Partial<Response> {
  const body = { errors: [{ status: String(status), code, title, detail }] };
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('asc-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // listCertificates
  // -------------------------------------------------------------------------

  describe('listCertificates', () => {
    it('returns parsed certificates from Apple response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {
        data: [
          {
            id: 'cert-1',
            attributes: {
              serialNumber: 'ABC123',
              certificateType: 'DISTRIBUTION',
              name: 'Apple Distribution: Test',
              expirationDate: '2027-01-01T00:00:00.000+00:00',
              certificateContent: 'base64certdata',
            },
          },
        ],
      }));

      const certs = await listCertificates(TEST_JWT);

      expect(certs).toHaveLength(1);
      expect(certs[0]!.id).toBe('cert-1');
      expect(certs[0]!.serialNumber).toBe('ABC123');
      expect(certs[0]!.certificateType).toBe('DISTRIBUTION');
    });

    it('sends correct auth header and URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      await listCertificates(TEST_JWT);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.appstoreconnect.apple.com/v1/certificates?limit=200',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${TEST_JWT}`,
          }),
        }),
      );
    });

    it('throws AppleApiError on 403', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(403, 'FORBIDDEN', 'This request is forbidden for security reasons'),
      );

      await expect(listCertificates(TEST_JWT)).rejects.toThrow(AppleApiError);
    });
  });

  // -------------------------------------------------------------------------
  // createCertificate
  // -------------------------------------------------------------------------

  describe('createCertificate', () => {
    it('sends CSR in correct format and returns parsed cert', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(201, {
        data: {
          id: 'new-cert-1',
          attributes: {
            serialNumber: 'DEF456',
            certificateType: 'IOS_DISTRIBUTION',
            name: 'iOS Distribution: Test',
            expirationDate: '2027-05-19T00:00:00.000+00:00',
            certificateContent: 'newcertbase64',
          },
        },
      }));

      const cert = await createCertificate(TEST_JWT, '-----BEGIN CERTIFICATE REQUEST-----\ntest\n-----END CERTIFICATE REQUEST-----');

      expect(cert.id).toBe('new-cert-1');
      expect(cert.certificateType).toBe('IOS_DISTRIBUTION');

      // Verify request body
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.data.type).toBe('certificates');
      expect(body.data.attributes.certificateType).toBe('IOS_DISTRIBUTION');
      expect(body.data.attributes.csrContent).toContain('BEGIN CERTIFICATE REQUEST');
    });

    it('throws on 409 (max certs reached)', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(409, 'ENTITY_ERROR.ATTRIBUTE.INVALID', 'The maximum number of certificates has been reached'),
      );

      await expect(
        createCertificate(TEST_JWT, 'csr-content'),
      ).rejects.toThrow('maximum number');
    });
  });

  // -------------------------------------------------------------------------
  // revokeCertificate
  // -------------------------------------------------------------------------

  describe('revokeCertificate', () => {
    it('sends DELETE to correct URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

      await revokeCertificate(TEST_JWT, 'cert-to-revoke');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.appstoreconnect.apple.com/v1/certificates/cert-to-revoke',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('treats 404 as success (already revoked)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      // Should not throw
      await expect(revokeCertificate(TEST_JWT, 'already-gone')).resolves.toBeUndefined();
    });

    it('throws on other errors (e.g., 403)', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(403, 'FORBIDDEN', 'Not authorized'),
      );

      await expect(revokeCertificate(TEST_JWT, 'cert-id')).rejects.toThrow(AppleApiError);
    });
  });

  // -------------------------------------------------------------------------
  // listBundleIds
  // -------------------------------------------------------------------------

  describe('listBundleIds', () => {
    it('returns parsed bundle IDs', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {
        data: [
          {
            id: 'bid-1',
            attributes: {
              identifier: 'dev.zionxai.workouttracker',
              name: 'Workout Tracker',
              platform: 'IOS',
            },
          },
        ],
      }));

      const ids = await listBundleIds(TEST_JWT);

      expect(ids).toHaveLength(1);
      expect(ids[0]!.identifier).toBe('dev.zionxai.workouttracker');
    });
  });

  // -------------------------------------------------------------------------
  // createBundleId
  // -------------------------------------------------------------------------

  describe('createBundleId', () => {
    it('creates and returns new bundle ID on 201', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(201, {
        data: {
          id: 'new-bid-1',
          attributes: {
            identifier: 'dev.zionxai.newapp',
            name: 'New App',
            platform: 'IOS',
          },
        },
      }));

      const bid = await createBundleId(TEST_JWT, 'dev.zionxai.newapp', 'New App', 'IOS');

      expect(bid.id).toBe('new-bid-1');
      expect(bid.identifier).toBe('dev.zionxai.newapp');
    });

    it('handles 409 by fetching existing bundle ID', async () => {
      // First call: POST returns 409
      mockFetch.mockResolvedValueOnce(
        errorResponse(409, 'ENTITY_ERROR', 'A bundle ID with this identifier already exists'),
      );
      // Second call: GET list returns the existing one
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {
        data: [
          {
            id: 'existing-bid',
            attributes: {
              identifier: 'dev.zionxai.existing',
              name: 'Existing App',
              platform: 'IOS',
            },
          },
        ],
      }));

      const bid = await createBundleId(TEST_JWT, 'dev.zionxai.existing', 'Existing App', 'IOS');

      expect(bid.id).toBe('existing-bid');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws if 409 but bundle ID not found in follow-up list', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(409, 'ENTITY_ERROR', 'Already exists'),
      );
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      await expect(
        createBundleId(TEST_JWT, 'dev.zionxai.ghost', 'Ghost', 'IOS'),
      ).rejects.toThrow('reported as existing (409) but not found');
    });
  });

  // -------------------------------------------------------------------------
  // listProfiles
  // -------------------------------------------------------------------------

  describe('listProfiles', () => {
    it('returns parsed profiles with relationships', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {
        data: [
          {
            id: 'prof-1',
            attributes: {
              name: 'AppStore Profile',
              profileContent: 'base64profile',
              profileState: 'ACTIVE',
              expirationDate: '2027-05-19T00:00:00.000+00:00',
            },
            relationships: {
              bundleId: { data: { id: 'bundle-res-1' } },
              certificates: { data: [{ id: 'cert-1' }, { id: 'cert-2' }] },
            },
          },
          {
            id: 'prof-2',
            attributes: {
              name: 'Other Profile',
              profileContent: 'base64other',
              profileState: 'INVALID',
              expirationDate: '2026-01-01T00:00:00.000+00:00',
            },
          },
        ],
      }));

      const profiles = await listProfiles(TEST_JWT);

      expect(profiles).toHaveLength(2);
      expect(profiles[0]!.profileState).toBe('ACTIVE');
      expect(profiles[0]!.bundleIdResourceId).toBe('bundle-res-1');
      expect(profiles[0]!.certificateIds).toEqual(['cert-1', 'cert-2']);
      // Profile without relationships
      expect(profiles[1]!.bundleIdResourceId).toBeNull();
      expect(profiles[1]!.certificateIds).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // createProvisioningProfile
  // -------------------------------------------------------------------------

  describe('createProvisioningProfile', () => {
    it('sends correct relationships and returns parsed profile', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(201, {
        data: {
          id: 'new-prof-1',
          attributes: {
            name: 'AppStore dev.zionxai.workouttracker',
            profileContent: 'newprofilebase64',
            profileState: 'ACTIVE',
            expirationDate: '2027-05-19T00:00:00.000+00:00',
          },
        },
      }));

      const profile = await createProvisioningProfile(
        TEST_JWT,
        'AppStore dev.zionxai.workouttracker',
        'bundle-id-resource-1',
        'cert-id-1',
        'IOS_APP_STORE',
      );

      expect(profile.id).toBe('new-prof-1');

      // Verify relationships in request body
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.data.relationships.bundleId.data.id).toBe('bundle-id-resource-1');
      expect(body.data.relationships.certificates.data[0].id).toBe('cert-id-1');
      expect(body.data.attributes.profileType).toBe('IOS_APP_STORE');
    });
  });
});
