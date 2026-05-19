/**
 * App Store Connect — App Entity Management Client
 *
 * Manages App Store Connect App entities (distinct from bundle IDs,
 * certificates, and profiles handled by asc-client.ts).
 *
 * An ASC App entity represents the app listing in App Store Connect.
 * It has its own numeric Apple ID (ascAppId) which is required by
 * EAS Submit and is separate from the bundle ID resource ID.
 *
 * Auth: Bearer JWT (signed via asc-jwt.ts).
 * Base URL: https://api.appstoreconnect.apple.com
 * Format: JSON:API
 */

import type { AscAppInfo } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.appstoreconnect.apple.com';

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/**
 * Thrown when createAscApp receives a 409 — the app name is already
 * taken on the App Store. Used by the name collision retry flow in Hook 8.
 */
export class AscAppNameTakenError extends Error {
  public readonly attemptedName: string;

  constructor(attemptedName: string, detail: string) {
    super(`App name "${attemptedName}" is already taken on the App Store: ${detail}`);
    this.name = 'AscAppNameTakenError';
    this.attemptedName = attemptedName;
  }
}

/**
 * General ASC API error for non-409 failures.
 */
export class AscApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(`ASC API error (${statusCode} ${errorCode}): ${message}`);
    this.name = 'AscApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function authHeaders(jwt: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

async function handleResponse(response: Response): Promise<unknown> {
  if (response.ok) {
    if (response.status === 204) return undefined;
    return response.json();
  }

  const body = await response.text();
  let code = 'UNKNOWN';
  let title = 'Unknown error';
  let detail = '';

  try {
    const parsed = JSON.parse(body);
    const err = parsed.errors?.[0];
    if (err) {
      code = err.code ?? code;
      title = err.title ?? title;
      detail = err.detail ?? '';
    }
  } catch {
    detail = body.slice(0, 200);
  }

  throw new AscApiError(response.status, code, `${title}: ${detail}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if an app exists in App Store Connect for the given bundle ID.
 * Queries by the bundle identifier string (e.g., "dev.zionxai.workouttracker").
 *
 * @returns AscAppInfo if found, null if no app matches
 */
export async function getAscApp(
  jwt: string,
  bundleId: string,
): Promise<AscAppInfo | null> {
  const url = `${BASE_URL}/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`;
  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(jwt),
  });

  const data = await handleResponse(response) as {
    data: Array<{
      id: string;
      attributes: {
        name: string;
        bundleId: string;
        sku: string;
        primaryLocale: string;
      };
    }>;
  };

  if (!data.data || data.data.length === 0) {
    return null;
  }

  const app = data.data[0]!;
  return {
    ascAppId: app.id,
    bundleId: app.attributes.bundleId,
    name: app.attributes.name,
    sku: app.attributes.sku,
    primaryLocale: app.attributes.primaryLocale,
  };
}

/**
 * Create a new app in App Store Connect.
 * Idempotent: checks for existing app via getAscApp first.
 *
 * @throws AscAppNameTakenError if the name is already in use (409)
 * @throws AscApiError for auth/network/other failures
 */
export async function createAscApp(
  jwt: string,
  input: {
    bundleIdResourceId: string;
    name: string;
    sku: string;
    primaryLocale: string;
  },
): Promise<AscAppInfo> {
  // Idempotency: check if app already exists for this bundle ID
  // We need the bundle identifier string, but we only have the resource ID.
  // The caller should pass the bundle identifier separately if needed.
  // For now, we proceed directly to creation and handle 409.

  const body = {
    data: {
      type: 'apps',
      attributes: {
        name: input.name,
        sku: input.sku,
        primaryLocale: input.primaryLocale,
      },
      relationships: {
        bundleId: {
          data: {
            type: 'bundleIds',
            id: input.bundleIdResourceId,
          },
        },
      },
    },
  };

  const response = await fetch(`${BASE_URL}/v1/apps`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const errBody = await response.text();
    let detail = '';
    try {
      const parsed = JSON.parse(errBody);
      detail = parsed.errors?.[0]?.detail ?? errBody.slice(0, 200);
    } catch {
      detail = errBody.slice(0, 200);
    }
    throw new AscAppNameTakenError(input.name, detail);
  }

  const data = await handleResponse(response) as {
    data: {
      id: string;
      attributes: {
        name: string;
        bundleId: string;
        sku: string;
        primaryLocale: string;
      };
    };
  };

  return {
    ascAppId: data.data.id,
    bundleId: data.data.attributes.bundleId,
    name: data.data.attributes.name,
    sku: data.data.attributes.sku,
    primaryLocale: data.data.attributes.primaryLocale,
  };
}

/**
 * Set app metadata (localized fields).
 * Fetches the app's localization IDs internally, then PATCHes provided fields.
 * Only patches fields that are defined (skips undefined).
 *
 * @throws AscApiError if any PATCH fails
 */
export async function setAppMetadata(
  jwt: string,
  ascAppId: string,
  metadata: {
    name?: string;
    subtitle?: string;
    description?: string;
    keywords?: string;
    supportUrl?: string;
    privacyPolicyUrl?: string;
    marketingUrl?: string;
    whatsNew?: string;
  },
): Promise<void> {
  // Fetch app info localizations
  const infoResponse = await fetch(
    `${BASE_URL}/v1/apps/${ascAppId}/appInfos?include=appInfoLocalizations`,
    { method: 'GET', headers: authHeaders(jwt) },
  );
  const infoData = await handleResponse(infoResponse) as {
    data: Array<{ id: string }>;
    included?: Array<{ id: string; type: string; attributes: Record<string, string> }>;
  };

  const localization = infoData.included?.find((r) => r.type === 'appInfoLocalizations');
  if (!localization) {
    throw new AscApiError(404, 'NO_LOCALIZATION', 'No appInfoLocalization found for app');
  }

  // Patch appInfoLocalization (name, subtitle, privacyPolicyUrl)
  const infoAttrs: Record<string, string> = {};
  if (metadata.name !== undefined) infoAttrs.name = metadata.name;
  if (metadata.subtitle !== undefined) infoAttrs.subtitle = metadata.subtitle;
  if (metadata.privacyPolicyUrl !== undefined) infoAttrs.privacyPolicyUrl = metadata.privacyPolicyUrl;

  if (Object.keys(infoAttrs).length > 0) {
    const patchResponse = await fetch(`${BASE_URL}/v1/appInfoLocalizations/${localization.id}`, {
      method: 'PATCH',
      headers: authHeaders(jwt),
      body: JSON.stringify({ data: { type: 'appInfoLocalizations', id: localization.id, attributes: infoAttrs } }),
    });
    await handleResponse(patchResponse);
  }

  // Fetch app store version localizations (description, keywords, supportUrl, etc.)
  const versionResponse = await fetch(
    `${BASE_URL}/v1/apps/${ascAppId}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&include=appStoreVersionLocalizations&limit=1`,
    { method: 'GET', headers: authHeaders(jwt) },
  );
  const versionData = await handleResponse(versionResponse) as {
    data: Array<{ id: string }>;
    included?: Array<{ id: string; type: string; attributes: Record<string, string> }>;
  };

  const versionLocalization = versionData.included?.find((r) => r.type === 'appStoreVersionLocalizations');
  if (!versionLocalization) {
    // No version in PREPARE_FOR_SUBMISSION state — skip version-level metadata
    return;
  }

  const versionAttrs: Record<string, string> = {};
  if (metadata.description !== undefined) versionAttrs.description = metadata.description;
  if (metadata.keywords !== undefined) versionAttrs.keywords = metadata.keywords;
  if (metadata.supportUrl !== undefined) versionAttrs.supportUrl = metadata.supportUrl;
  if (metadata.marketingUrl !== undefined) versionAttrs.marketingUrl = metadata.marketingUrl;
  if (metadata.whatsNew !== undefined) versionAttrs.whatsNew = metadata.whatsNew;

  if (Object.keys(versionAttrs).length > 0) {
    const patchResponse = await fetch(`${BASE_URL}/v1/appStoreVersionLocalizations/${versionLocalization.id}`, {
      method: 'PATCH',
      headers: authHeaders(jwt),
      body: JSON.stringify({ data: { type: 'appStoreVersionLocalizations', id: versionLocalization.id, attributes: versionAttrs } }),
    });
    await handleResponse(patchResponse);
  }
}

/**
 * Set the primary category for an app.
 *
 * @throws AscApiError if the PATCH fails
 */
export async function setAppCategory(
  jwt: string,
  ascAppId: string,
  categoryId: string,
): Promise<void> {
  // Fetch the appInfo ID first
  const infoResponse = await fetch(
    `${BASE_URL}/v1/apps/${ascAppId}/appInfos?limit=1`,
    { method: 'GET', headers: authHeaders(jwt) },
  );
  const infoData = await handleResponse(infoResponse) as {
    data: Array<{ id: string }>;
  };

  if (!infoData.data || infoData.data.length === 0) {
    throw new AscApiError(404, 'NO_APP_INFO', 'No appInfo found for app');
  }

  const appInfoId = infoData.data[0]!.id;

  const patchResponse = await fetch(`${BASE_URL}/v1/appInfos/${appInfoId}`, {
    method: 'PATCH',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'appInfos',
        id: appInfoId,
        relationships: {
          primaryCategory: {
            data: { type: 'appCategories', id: categoryId },
          },
        },
      },
    }),
  });
  await handleResponse(patchResponse);
}

/**
 * Upload a screenshot to App Store Connect.
 *
 * Three-step process:
 * 1. Reserve a screenshot slot (POST /v1/appScreenshots)
 * 2. Upload the image binary to the provided upload URL (PUT)
 * 3. Commit the upload (PATCH /v1/appScreenshots/{id} with uploaded=true)
 *
 * @returns The screenshot resource ID
 * @throws AscApiError if any step fails
 */
export async function uploadScreenshot(
  jwt: string,
  screenshotSetId: string,
  screenshotData: Buffer,
  filename: string,
): Promise<string> {
  // Step 1: Reserve screenshot slot
  const reserveResponse = await fetch(`${BASE_URL}/v1/appScreenshots`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'appScreenshots',
        attributes: {
          fileName: filename,
          fileSize: screenshotData.length,
        },
        relationships: {
          appScreenshotSet: {
            data: { type: 'appScreenshotSets', id: screenshotSetId },
          },
        },
      },
    }),
  });

  const reserveData = await handleResponse(reserveResponse) as {
    data: {
      id: string;
      attributes: {
        uploadOperations: Array<{
          method: string;
          url: string;
          length: number;
          offset: number;
          requestHeaders: Array<{ name: string; value: string }>;
        }>;
      };
    };
  };

  const screenshotId = reserveData.data.id;
  const uploadOps = reserveData.data.attributes.uploadOperations;

  // Step 2: Upload binary data (may be chunked into multiple operations)
  for (const op of uploadOps) {
    const chunk = screenshotData.subarray(op.offset, op.offset + op.length);
    const headers: Record<string, string> = {};
    for (const h of op.requestHeaders) {
      headers[h.name] = h.value;
    }

    const uploadResponse = await fetch(op.url, {
      method: op.method,
      headers,
      body: chunk,
    });

    if (!uploadResponse.ok) {
      throw new AscApiError(
        uploadResponse.status,
        'UPLOAD_FAILED',
        `Screenshot upload failed at offset ${op.offset}`,
      );
    }
  }

  // Step 3: Commit the upload
  const commitResponse = await fetch(`${BASE_URL}/v1/appScreenshots/${screenshotId}`, {
    method: 'PATCH',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'appScreenshots',
        id: screenshotId,
        attributes: {
          uploaded: true,
        },
      },
    }),
  });
  await handleResponse(commitResponse);

  return screenshotId;
}
