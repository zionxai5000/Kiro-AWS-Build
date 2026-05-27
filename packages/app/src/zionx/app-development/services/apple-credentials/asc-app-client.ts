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
    bundleIdentifier: string;
  },
): Promise<AscAppInfo> {
  // Idempotency: check if app already exists for this bundle ID
  const existing = await getAscApp(jwt, input.bundleIdentifier);
  if (existing) {
    return existing;
  }

  // Not found — create
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

/**
 * Get the primary App Store version localization ID for an app.
 * Fetches the version in PREPARE_FOR_SUBMISSION state and returns
 * the first localization ID (typically en-US).
 *
 * @param jwt - Apple JWT token
 * @param ascAppId - The App Store Connect app ID
 * @returns The localization ID, or null if no version is in preparation
 */
export async function getAppStoreVersionLocalizationId(
  jwt: string,
  ascAppId: string,
): Promise<string | null> {
  const response = await fetch(
    `${BASE_URL}/v1/apps/${ascAppId}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&include=appStoreVersionLocalizations&limit=1`,
    { method: 'GET', headers: authHeaders(jwt) },
  );
  const data = await handleResponse(response) as {
    data: Array<{ id: string }>;
    included?: Array<{ id: string; type: string }>;
  };

  const localization = data.included?.find((r) => r.type === 'appStoreVersionLocalizations');
  return localization?.id ?? null;
}

/**
 * Create an App Store Connect screenshot set for a specific display type.
 * Required before uploading screenshots — Apple groups screenshots by display type.
 *
 * @param jwt - Apple JWT token
 * @param localizationId - App Store version localization ID (NOT the app ID)
 * @param displayType - e.g., 'APP_IPHONE_67', 'APP_IPHONE_65', 'APP_IPAD_PRO_129'
 * @returns The created screenshot set ID
 */
export async function createScreenshotSet(
  jwt: string,
  localizationId: string,
  displayType: 'APP_IPHONE_67' | 'APP_IPHONE_65' | 'APP_IPHONE_61' | 'APP_IPAD_PRO_129' | 'APP_IPAD_PRO_3GEN_129',
): Promise<string> {
  const response = await fetch(`${BASE_URL}/v1/appScreenshotSets`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: displayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: 'appStoreVersionLocalizations', id: localizationId },
          },
        },
      },
    }),
  });

  if (response.status !== 201) {
    const errorText = await response.text();
    throw new AscApiError(
      response.status,
      'SCREENSHOT_SET_CREATION_FAILED',
      `Failed to create screenshot set (${displayType}): ${errorText}`,
    );
  }

  const result = await response.json() as { data: { id: string } };
  return result.data.id;
}

// ---------------------------------------------------------------------------
// Build Processing & TestFlight State (Phase 9 observability)
// ---------------------------------------------------------------------------

/**
 * Apple's processingState values for an uploaded build.
 * - PROCESSING: still being scanned
 * - VALID: processing complete, build is usable in TestFlight
 * - INVALID: Apple rejected the binary (the most common surface for "Something went wrong" in TestFlight)
 * - FAILED: an upstream pipeline error before processing started
 */
export type AscBuildProcessingState = 'PROCESSING' | 'VALID' | 'INVALID' | 'FAILED';

export interface AscBuildSummary {
  /** ASC resource ID for the build (not the EAS build ID) */
  buildId: string;
  /** App-side build version string (e.g., "4") */
  version: string;
  /** appStoreVersion.versionString this build is associated with (e.g., "1.0.0") */
  appVersion: string;
  /** Apple's current processing state */
  processingState: AscBuildProcessingState;
  /** When the upload was received by ASC */
  uploadedDate: string | null;
  /** When processing finished (null while PROCESSING) */
  expirationDate: string | null;
  /** Whether the build is usable in TestFlight (VALID and not expired) */
  usesNonExemptEncryption: boolean | null;
  /** TestFlight beta-review state, if available — e.g., 'WAITING_FOR_BETA_REVIEW', 'IN_BETA_REVIEW', 'BETA_APPROVED', 'BETA_REJECTED' */
  betaReviewState: string | null;
}

/**
 * List builds for an ASC app, newest first.
 *
 * @param jwt ASC API JWT
 * @param ascAppId numeric ASC App ID (e.g., "6773520429")
 * @param limit max number of builds to return (default 5)
 */
export async function listAscBuilds(
  jwt: string,
  ascAppId: string,
  limit = 5,
): Promise<AscBuildSummary[]> {
  // Order by most recent upload, include relationships needed to resolve version + beta review state
  const url =
    `${BASE_URL}/v1/builds` +
    `?filter[app]=${encodeURIComponent(ascAppId)}` +
    `&include=preReleaseVersion,buildBetaDetail` +
    `&sort=-uploadedDate` +
    `&limit=${limit}`;

  const response = await fetch(url, { method: 'GET', headers: authHeaders(jwt) });
  if (!response.ok) {
    const body = await response.text();
    throw new AscApiError(response.status, 'BUILDS_LIST_FAILED', `listAscBuilds: ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    data: Array<{
      id: string;
      attributes: {
        version: string;
        processingState: AscBuildProcessingState;
        uploadedDate: string | null;
        expirationDate: string | null;
        usesNonExemptEncryption: boolean | null;
      };
      relationships: {
        preReleaseVersion?: { data?: { id: string; type: string } };
        buildBetaDetail?: { data?: { id: string; type: string } };
      };
    }>;
    included?: Array<{
      id: string;
      type: string;
      attributes: Record<string, unknown>;
    }>;
  };

  const included = json.included ?? [];
  const includedById = new Map<string, { type: string; attributes: Record<string, unknown> }>(
    included.map((entry) => [entry.id, { type: entry.type, attributes: entry.attributes }]),
  );

  return json.data.map((build) => {
    const preReleaseId = build.relationships.preReleaseVersion?.data?.id;
    const preReleaseAttrs = preReleaseId ? includedById.get(preReleaseId)?.attributes : undefined;
    const appVersion = (preReleaseAttrs?.['version'] as string | undefined) ?? '';

    const betaDetailId = build.relationships.buildBetaDetail?.data?.id;
    const betaAttrs = betaDetailId ? includedById.get(betaDetailId)?.attributes : undefined;
    const externalState = betaAttrs?.['externalBuildState'] as string | undefined;
    const internalState = betaAttrs?.['internalBuildState'] as string | undefined;
    const betaReviewState = externalState ?? internalState ?? null;

    return {
      buildId: build.id,
      version: build.attributes.version,
      appVersion,
      processingState: build.attributes.processingState,
      uploadedDate: build.attributes.uploadedDate,
      expirationDate: build.attributes.expirationDate,
      usesNonExemptEncryption: build.attributes.usesNonExemptEncryption,
      betaReviewState,
    };
  });
}

/**
 * Find the ASC build matching a given app version string + buildNumber.
 * Returns null if not yet visible in ASC (e.g., upload hasn't been registered yet).
 */
export async function findAscBuildByVersion(
  jwt: string,
  ascAppId: string,
  appVersion: string,
  buildNumber: string,
): Promise<AscBuildSummary | null> {
  const builds = await listAscBuilds(jwt, ascAppId, 25);
  return builds.find(
    (b) => b.appVersion === appVersion && b.version === buildNumber,
  ) ?? null;
}

/**
 * Pull the buildBetaDetail entity for a build — surfaces TestFlight-side errors
 * that don't appear on the build itself (e.g., crashed-on-launch reports).
 */
export async function getBuildBetaDetail(
  jwt: string,
  buildId: string,
): Promise<{
  internalBuildState: string | null;
  externalBuildState: string | null;
} | null> {
  const url = `${BASE_URL}/v1/builds/${encodeURIComponent(buildId)}/buildBetaDetail`;
  const response = await fetch(url, { method: 'GET', headers: authHeaders(jwt) });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new AscApiError(response.status, 'BETA_DETAIL_FETCH_FAILED', body.slice(0, 200));
  }
  const json = (await response.json()) as {
    data: { attributes: { internalBuildState?: string; externalBuildState?: string } };
  };
  return {
    internalBuildState: json.data.attributes.internalBuildState ?? null,
    externalBuildState: json.data.attributes.externalBuildState ?? null,
  };
}


/**
 * Set the "What to Test" copy on a build's beta localization.
 *
 * Apple recommends having a non-empty whatsNew string on every TestFlight
 * build — without it, the TestFlight client app occasionally surfaces
 * generic errors before its caches refresh. This is idempotent: a 409
 * response for an existing (build, locale) record triggers a PATCH instead
 * of a POST.
 *
 * Errors other than 409 are surfaced via AscApiError so the caller can decide
 * whether to fail the submission or continue.
 */
export async function setBetaWhatsNew(
  jwt: string,
  buildId: string,
  whatsNew: string,
  locale = 'en-US',
): Promise<void> {
  const response = await fetch(`${BASE_URL}/v1/betaBuildLocalizations`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'betaBuildLocalizations',
        attributes: { locale, whatsNew },
        relationships: {
          build: { data: { type: 'builds', id: buildId } },
        },
      },
    }),
  });

  if (response.status === 201) return;

  if (response.status === 409) {
    // Localization already exists for this build+locale — PATCH it instead.
    const listRes = await fetch(
      `${BASE_URL}/v1/builds/${encodeURIComponent(buildId)}/betaBuildLocalizations`,
      { method: 'GET', headers: authHeaders(jwt) },
    );
    if (!listRes.ok) return; // best-effort — don't throw
    const data = (await listRes.json()) as {
      data: Array<{ id: string; attributes: { locale: string } }>;
    };
    const existing = data.data.find((d) => d.attributes.locale === locale);
    if (!existing) return;

    await fetch(`${BASE_URL}/v1/betaBuildLocalizations/${existing.id}`, {
      method: 'PATCH',
      headers: authHeaders(jwt),
      body: JSON.stringify({
        data: {
          type: 'betaBuildLocalizations',
          id: existing.id,
          attributes: { whatsNew },
        },
      }),
    });
    return;
  }

  const body = await response.text().catch(() => '');
  throw new AscApiError(response.status, 'WHATS_NEW_FAILED', body.slice(0, 200));
}


// ---------------------------------------------------------------------------
// Phase 9.1 — TestFlight beta review + age rating + category
// ---------------------------------------------------------------------------

/**
 * Set the TestFlight beta app review contact info.
 *
 * Apple validates phone format strictly: E.164-style digits with a real
 * country code + area code. 555-prefix US numbers are rejected.
 *
 * Idempotent: 409 indicates the record exists; we PATCH it instead.
 */
export async function setBetaAppReviewDetail(
  jwt: string,
  ascAppId: string,
  detail: {
    contactFirstName: string;
    contactLastName: string;
    contactEmail: string;
    contactPhone: string;
    demoAccountName?: string;
    demoAccountPassword?: string;
    demoAccountRequired?: boolean;
    notes?: string;
  },
): Promise<void> {
  // Beta app review detail is identified by the same id as the app.
  const id = ascAppId;
  const attributes: Record<string, unknown> = {
    contactFirstName: detail.contactFirstName,
    contactLastName: detail.contactLastName,
    contactEmail: detail.contactEmail,
    contactPhone: detail.contactPhone,
  };
  if (detail.demoAccountName !== undefined) attributes['demoAccountName'] = detail.demoAccountName;
  if (detail.demoAccountPassword !== undefined) attributes['demoAccountPassword'] = detail.demoAccountPassword;
  if (detail.demoAccountRequired !== undefined) attributes['demoAccountRequired'] = detail.demoAccountRequired;
  if (detail.notes !== undefined) attributes['notes'] = detail.notes;

  const response = await fetch(`${BASE_URL}/v1/betaAppReviewDetails/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: { type: 'betaAppReviewDetails', id, attributes },
    }),
  });
  await handleResponse(response);
}

/**
 * Set TestFlight beta localization (feedback email, marketing/privacy URL,
 * description). Apple recommends having these populated to avoid the generic
 * "Something went wrong" surface in TestFlight.
 *
 * Behavior: POST to create; on 409 (already exists), PATCH the existing
 * localization record for the same locale.
 */
export async function setBetaAppLocalization(
  jwt: string,
  ascAppId: string,
  locale: string,
  fields: {
    feedbackEmail?: string;
    marketingUrl?: string;
    privacyPolicyUrl?: string;
    description?: string;
    tvOsPrivacyPolicy?: string;
  },
): Promise<void> {
  const attributes: Record<string, string> = { locale };
  if (fields.feedbackEmail !== undefined) attributes['feedbackEmail'] = fields.feedbackEmail;
  if (fields.marketingUrl !== undefined) attributes['marketingUrl'] = fields.marketingUrl;
  if (fields.privacyPolicyUrl !== undefined) attributes['privacyPolicyUrl'] = fields.privacyPolicyUrl;
  if (fields.description !== undefined) attributes['description'] = fields.description;
  if (fields.tvOsPrivacyPolicy !== undefined) attributes['tvOsPrivacyPolicy'] = fields.tvOsPrivacyPolicy;

  const createBody = {
    data: {
      type: 'betaAppLocalizations',
      attributes,
      relationships: {
        app: { data: { type: 'apps', id: ascAppId } },
      },
    },
  };

  const createResponse = await fetch(`${BASE_URL}/v1/betaAppLocalizations`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify(createBody),
  });

  if (createResponse.status === 201) return;

  if (createResponse.status === 409) {
    // Already exists — fetch and PATCH
    const listRes = await fetch(
      `${BASE_URL}/v1/apps/${encodeURIComponent(ascAppId)}/betaAppLocalizations`,
      { method: 'GET', headers: authHeaders(jwt) },
    );
    if (!listRes.ok) {
      const body = await listRes.text();
      throw new AscApiError(listRes.status, 'BETA_LOCALIZATION_LIST_FAILED', body.slice(0, 200));
    }
    const list = (await listRes.json()) as {
      data: Array<{ id: string; attributes: { locale: string } }>;
    };
    const existing = list.data.find((d) => d.attributes.locale === locale);
    if (!existing) {
      throw new AscApiError(409, 'BETA_LOCALIZATION_NOT_FOUND', 'POST returned 409 but list did not include locale');
    }
    // PATCH (locale itself is immutable on PATCH; strip it from attributes)
    const patchAttrs = { ...attributes };
    delete patchAttrs['locale'];
    const patchRes = await fetch(`${BASE_URL}/v1/betaAppLocalizations/${existing.id}`, {
      method: 'PATCH',
      headers: authHeaders(jwt),
      body: JSON.stringify({
        data: { type: 'betaAppLocalizations', id: existing.id, attributes: patchAttrs },
      }),
    });
    await handleResponse(patchRes);
    return;
  }

  const body = await createResponse.text().catch(() => '');
  throw new AscApiError(
    createResponse.status,
    'BETA_LOCALIZATION_CREATE_FAILED',
    body.slice(0, 200),
  );
}

/**
 * Set the App Store Connect age rating declaration (2025 23-field schema).
 *
 * Required to ship to the store. Apple changed this in 2025 to add several
 * new boolean fields (messagingAndChat, advertising, healthOrWellnessTopics,
 * ageAssurance, userGeneratedContent, parentalControls, lootBox) plus a
 * string enum (gunsOrOtherWeapons) on top of the original 14 categorical
 * frequency enums.
 *
 * Pass `defaults: true` to get an everything-NONE/false declaration suitable
 * for a meditation/utility app.
 */
export interface AgeRatingDeclaration {
  // Boolean fields (2025 additions)
  messagingAndChat?: boolean;
  advertising?: boolean;
  healthOrWellnessTopics?: boolean;
  ageAssurance?: boolean;
  userGeneratedContent?: boolean;
  parentalControls?: boolean;
  lootBox?: boolean;

  // Frequency enums — values: NONE | INFREQUENT_OR_MILD | FREQUENT_OR_INTENSE
  alcoholTobaccoOrDrugUseOrReferences?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  contests?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  gamblingSimulated?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  medicalOrTreatmentInformation?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  profanityOrCrudeHumor?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  sexualContentGraphicAndNudity?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  sexualContentOrNudity?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  horrorOrFearThemes?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  matureOrSuggestiveThemes?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  unrestrictedWebAccess?: boolean;
  gambling?: boolean;
  violenceCartoonOrFantasy?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  violenceRealistic?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';
  violenceRealisticProlongedGraphicOrSadistic?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';

  // 2025 string enum
  gunsOrOtherWeapons?: 'NONE' | 'INFREQUENT_OR_MILD' | 'FREQUENT_OR_INTENSE';

  /** Apply the safe defaults (everything NONE/false). Useful for utility apps. */
  defaults?: boolean;
}

const DEFAULT_AGE_RATING: Record<string, unknown> = {
  // Booleans default false
  messagingAndChat: false,
  advertising: false,
  healthOrWellnessTopics: false,
  ageAssurance: false,
  userGeneratedContent: false,
  parentalControls: false,
  lootBox: false,
  unrestrictedWebAccess: false,
  gambling: false,
  // Enums default NONE
  alcoholTobaccoOrDrugUseOrReferences: 'NONE',
  contests: 'NONE',
  gamblingSimulated: 'NONE',
  medicalOrTreatmentInformation: 'NONE',
  profanityOrCrudeHumor: 'NONE',
  sexualContentGraphicAndNudity: 'NONE',
  sexualContentOrNudity: 'NONE',
  horrorOrFearThemes: 'NONE',
  matureOrSuggestiveThemes: 'NONE',
  violenceCartoonOrFantasy: 'NONE',
  violenceRealistic: 'NONE',
  violenceRealisticProlongedGraphicOrSadistic: 'NONE',
  gunsOrOtherWeapons: 'NONE',
};

export async function setAgeRatingDeclaration(
  jwt: string,
  ascAppId: string,
  declaration: AgeRatingDeclaration,
): Promise<void> {
  // Lookup the existing declaration id under the appInfo
  const infoResponse = await fetch(
    `${BASE_URL}/v1/apps/${encodeURIComponent(ascAppId)}/appInfos?include=ageRatingDeclaration&limit=1`,
    { method: 'GET', headers: authHeaders(jwt) },
  );
  const infoData = (await handleResponse(infoResponse)) as {
    data: Array<{ id: string }>;
    included?: Array<{ id: string; type: string }>;
  };
  const declarationRef = infoData.included?.find((r) => r.type === 'ageRatingDeclarations');
  if (!declarationRef) {
    throw new AscApiError(404, 'NO_AGE_RATING_DECLARATION', 'No ageRatingDeclaration linked to appInfo');
  }

  // Merge with defaults if asked
  const baseAttrs: Record<string, unknown> = declaration.defaults
    ? { ...DEFAULT_AGE_RATING }
    : {};
  for (const [k, v] of Object.entries(declaration)) {
    if (k === 'defaults' || v === undefined) continue;
    baseAttrs[k] = v;
  }

  const patchRes = await fetch(`${BASE_URL}/v1/ageRatingDeclarations/${declarationRef.id}`, {
    method: 'PATCH',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'ageRatingDeclarations',
        id: declarationRef.id,
        attributes: baseAttrs,
      },
    }),
  });
  await handleResponse(patchRes);
}

/**
 * Set the primary App Store category via PATCH /v1/appInfos/{id}.
 * Convenience wrapper over setAppCategory using a category id constant.
 *
 * Common categoryId values:
 *  - 'PRODUCTIVITY' for utility apps
 *  - 'HEALTH_AND_FITNESS' for meditation/timer apps
 *  - 'LIFESTYLE'
 *  - 'EDUCATION'
 */
export async function setAppPrimaryCategory(
  jwt: string,
  ascAppId: string,
  categoryId: string,
): Promise<void> {
  return setAppCategory(jwt, ascAppId, categoryId);
}
