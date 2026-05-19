/**
 * Tests for asc-app-client.ts — App Store Connect App entity management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAscApp,
  createAscApp,
  setAppMetadata,
  setAppCategory,
  uploadScreenshot,
  AscAppNameTakenError,
  AscApiError,
} from '../asc-app-client.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number, code: string, title: string, detail: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ errors: [{ code, title, detail }] }),
    text: async () => JSON.stringify({ errors: [{ code, title, detail }] }),
  } as unknown as Response;
}

const FAKE_JWT = 'eyJ.fake.jwt';

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// getAscApp
// ---------------------------------------------------------------------------

describe('getAscApp', () => {
  it('returns AscAppInfo when API returns matching app', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      data: [{
        id: '1234567890',
        attributes: {
          name: 'Workout Tracker',
          bundleId: 'dev.zionxai.workouttracker',
          sku: 'workout-tracker-001',
          primaryLocale: 'en-US',
        },
      }],
    }));

    const result = await getAscApp(FAKE_JWT, 'dev.zionxai.workouttracker');

    expect(result).toEqual({
      ascAppId: '1234567890',
      bundleId: 'dev.zionxai.workouttracker',
      name: 'Workout Tracker',
      sku: 'workout-tracker-001',
      primaryLocale: 'en-US',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]![0]).toContain('filter[bundleId]=dev.zionxai.workouttracker');
  });

  it('returns null when no app matches the bundle ID', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const result = await getAscApp(FAKE_JWT, 'dev.zionxai.nonexistent');

    expect(result).toBeNull();
  });

  it('throws AscApiError on 5xx response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'INTERNAL', 'Server Error', 'Something broke'));

    await expect(getAscApp(FAKE_JWT, 'dev.zionxai.test'))
      .rejects.toThrow(AscApiError);
  });
});

// ---------------------------------------------------------------------------
// createAscApp
// ---------------------------------------------------------------------------

describe('createAscApp', () => {
  const input = {
    bundleIdResourceId: 'FAKEBUNDLE001',
    name: 'FitTracker',
    sku: 'fittracker-001',
    primaryLocale: 'en-US',
  };

  it('POSTs new app and returns AscAppInfo', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(201, {
      data: {
        id: '9876543210',
        attributes: {
          name: 'FitTracker',
          bundleId: 'dev.zionxai.fittracker',
          sku: 'fittracker-001',
          primaryLocale: 'en-US',
        },
      },
    }));

    const result = await createAscApp(FAKE_JWT, input);

    expect(result.ascAppId).toBe('9876543210');
    expect(result.name).toBe('FitTracker');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/v1/apps');
    expect(opts.method).toBe('POST');
  });

  it('throws AscAppNameTakenError on 409', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ errors: [{ detail: 'The app name you entered is already being used.' }] }),
    } as unknown as Response);

    await expect(createAscApp(FAKE_JWT, input))
      .rejects.toThrow(AscAppNameTakenError);
  });

  it('throws AscApiError on other failures (e.g. 422)', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(422, 'INVALID_ENTITY', 'Validation Error', 'SKU is invalid'));

    await expect(createAscApp(FAKE_JWT, input))
      .rejects.toThrow(AscApiError);
  });
});

// ---------------------------------------------------------------------------
// setAppMetadata
// ---------------------------------------------------------------------------

describe('setAppMetadata', () => {
  it('only patches fields that are provided (skips undefined)', async () => {
    // Fetch appInfos + localizations
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      data: [{ id: 'appinfo-1' }],
      included: [{ id: 'loc-1', type: 'appInfoLocalizations', attributes: {} }],
    }));
    // PATCH appInfoLocalization
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    // Fetch appStoreVersions
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      data: [{ id: 'version-1' }],
      included: [{ id: 'vloc-1', type: 'appStoreVersionLocalizations', attributes: {} }],
    }));
    // PATCH appStoreVersionLocalization
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    await setAppMetadata(FAKE_JWT, '1234567890', {
      subtitle: 'Track your gains',
      description: 'A comprehensive workout tracker.',
    });

    // Verify the appInfoLocalization PATCH only has subtitle (not name, not privacyPolicyUrl)
    const infoPatchBody = JSON.parse(mockFetch.mock.calls[1]![1].body);
    expect(infoPatchBody.data.attributes).toEqual({ subtitle: 'Track your gains' });

    // Verify the version PATCH only has description
    const versionPatchBody = JSON.parse(mockFetch.mock.calls[3]![1].body);
    expect(versionPatchBody.data.attributes).toEqual({ description: 'A comprehensive workout tracker.' });
  });

  it('throws AscApiError if PATCH fails', async () => {
    // Fetch appInfos succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      data: [{ id: 'appinfo-1' }],
      included: [{ id: 'loc-1', type: 'appInfoLocalizations', attributes: {} }],
    }));
    // PATCH fails
    mockFetch.mockResolvedValueOnce(errorResponse(403, 'FORBIDDEN', 'Access Denied', 'Insufficient permissions'));

    await expect(setAppMetadata(FAKE_JWT, '1234567890', { name: 'New Name' }))
      .rejects.toThrow(AscApiError);
  });
});

// ---------------------------------------------------------------------------
// setAppCategory
// ---------------------------------------------------------------------------

describe('setAppCategory', () => {
  it('PATCHes the relationship and returns void', async () => {
    // Fetch appInfos
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {
      data: [{ id: 'appinfo-1' }],
    }));
    // PATCH category
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    await setAppCategory(FAKE_JWT, '1234567890', 'HEALTH_AND_FITNESS');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const patchBody = JSON.parse(mockFetch.mock.calls[1]![1].body);
    expect(patchBody.data.relationships.primaryCategory.data.id).toBe('HEALTH_AND_FITNESS');
  });
});

// ---------------------------------------------------------------------------
// uploadScreenshot
// ---------------------------------------------------------------------------

describe('uploadScreenshot', () => {
  it('completes the 3-step upload sequence', async () => {
    const fakeData = Buffer.from('fake-png-data');

    // Step 1: Reserve
    mockFetch.mockResolvedValueOnce(jsonResponse(201, {
      data: {
        id: 'screenshot-001',
        attributes: {
          uploadOperations: [{
            method: 'PUT',
            url: 'https://upload.apple.com/chunk1',
            length: fakeData.length,
            offset: 0,
            requestHeaders: [{ name: 'Content-Type', value: 'application/octet-stream' }],
          }],
        },
      },
    }));
    // Step 2: Upload chunk
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    // Step 3: Commit
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { data: { id: 'screenshot-001' } }));

    const id = await uploadScreenshot(FAKE_JWT, 'set-001', fakeData, 'screenshot-1.png');

    expect(id).toBe('screenshot-001');
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify step 2 used the upload URL
    expect(mockFetch.mock.calls[1]![0]).toBe('https://upload.apple.com/chunk1');
  });

  it('throws AscApiError if upload step fails', async () => {
    const fakeData = Buffer.from('fake-png-data');

    // Step 1: Reserve succeeds
    mockFetch.mockResolvedValueOnce(jsonResponse(201, {
      data: {
        id: 'screenshot-002',
        attributes: {
          uploadOperations: [{
            method: 'PUT',
            url: 'https://upload.apple.com/chunk1',
            length: fakeData.length,
            offset: 0,
            requestHeaders: [],
          }],
        },
      },
    }));
    // Step 2: Upload fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    await expect(uploadScreenshot(FAKE_JWT, 'set-001', fakeData, 'screenshot-1.png'))
      .rejects.toThrow(AscApiError);
  });
});
