/**
 * App Store Connect API Client
 *
 * Raw fetch wrapper for Apple's App Store Connect REST API.
 * Handles certificates, bundle IDs, and provisioning profiles.
 *
 * All endpoints use JSON:API format.
 * Auth: Bearer JWT (signed via asc-jwt.ts).
 * Base URL: https://api.appstoreconnect.apple.com
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppleCertificate {
  id: string;
  serialNumber: string;
  certificateType: string;
  name: string;
  expirationDate: string;
  certificateContent: string;
}

export interface AppleBundleId {
  id: string;
  identifier: string;
  name: string;
  platform: string;
}

export interface AppleProfile {
  id: string;
  name: string;
  profileContent: string;
  profileState: string;
  expirationDate: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.appstoreconnect.apple.com';

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

export class AppleApiError extends Error {
  public readonly status: number;
  public readonly errorCode: string;

  constructor(status: number, code: string, title: string, detail: string) {
    super(`Apple API error: ${status} ${code}: ${title}: ${detail}`);
    this.name = 'AppleApiError';
    this.status = status;
    this.errorCode = code;
  }
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

  throw new AppleApiError(response.status, code, title, detail);
}

function authHeaders(jwt: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/**
 * List all certificates on the Apple account.
 */
export async function listCertificates(jwt: string): Promise<AppleCertificate[]> {
  const response = await fetch(`${BASE_URL}/v1/certificates?limit=200`, {
    method: 'GET',
    headers: authHeaders(jwt),
  });

  const data = await handleResponse(response) as {
    data: Array<{ id: string; attributes: Record<string, string> }>;
  };

  return data.data.map((cert) => ({
    id: cert.id,
    serialNumber: cert.attributes.serialNumber,
    certificateType: cert.attributes.certificateType,
    name: cert.attributes.name,
    expirationDate: cert.attributes.expirationDate,
    certificateContent: cert.attributes.certificateContent,
  }));
}

/**
 * Create a new Distribution Certificate at Apple.
 * NOT idempotent — caller MUST check listCertificates first.
 */
export async function createCertificate(
  jwt: string,
  csrPem: string,
): Promise<AppleCertificate> {
  const response = await fetch(`${BASE_URL}/v1/certificates`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'certificates',
        attributes: {
          certificateType: 'IOS_DISTRIBUTION',
          csrContent: csrPem,
        },
      },
    }),
  });

  const data = await handleResponse(response) as {
    data: { id: string; attributes: Record<string, string> };
  };

  return {
    id: data.data.id,
    serialNumber: data.data.attributes.serialNumber,
    certificateType: data.data.attributes.certificateType,
    name: data.data.attributes.name,
    expirationDate: data.data.attributes.expirationDate,
    certificateContent: data.data.attributes.certificateContent,
  };
}

/**
 * Revoke (delete) a certificate at Apple.
 * Idempotent: 404 is treated as success (already revoked).
 */
export async function revokeCertificate(jwt: string, certId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/v1/certificates/${certId}`, {
    method: 'DELETE',
    headers: authHeaders(jwt),
  });

  if (response.status === 404) return; // Already revoked
  if (!response.ok) {
    await handleResponse(response); // Will throw
  }
}

// ---------------------------------------------------------------------------
// Bundle IDs
// ---------------------------------------------------------------------------

/**
 * List bundle IDs registered at Apple.
 */
export async function listBundleIds(jwt: string): Promise<AppleBundleId[]> {
  const response = await fetch(`${BASE_URL}/v1/bundleIds?limit=200`, {
    method: 'GET',
    headers: authHeaders(jwt),
  });

  const data = await handleResponse(response) as {
    data: Array<{ id: string; attributes: Record<string, string> }>;
  };

  return data.data.map((bid) => ({
    id: bid.id,
    identifier: bid.attributes.identifier,
    name: bid.attributes.name,
    platform: bid.attributes.platform,
  }));
}

/**
 * Create a bundle ID at Apple.
 * Idempotent: catches 409 (already exists) and returns existing via follow-up GET.
 */
export async function createBundleId(
  jwt: string,
  identifier: string,
  name: string,
  platform: 'IOS' | 'UNIVERSAL',
): Promise<AppleBundleId> {
  const response = await fetch(`${BASE_URL}/v1/bundleIds`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'bundleIds',
        attributes: {
          identifier,
          name,
          platform,
        },
      },
    }),
  });

  // 409 = already exists — fetch existing
  if (response.status === 409) {
    const existing = await listBundleIds(jwt);
    const found = existing.find((b) => b.identifier === identifier);
    if (!found) {
      throw new Error(`Bundle ID ${identifier} reported as existing (409) but not found in list`);
    }
    return found;
  }

  const data = await handleResponse(response) as {
    data: { id: string; attributes: Record<string, string> };
  };

  return {
    id: data.data.id,
    identifier: data.data.attributes.identifier,
    name: data.data.attributes.name,
    platform: data.data.attributes.platform,
  };
}

// ---------------------------------------------------------------------------
// Provisioning Profiles
// ---------------------------------------------------------------------------

/**
 * List provisioning profiles at Apple.
 */
export async function listProfiles(jwt: string): Promise<AppleProfile[]> {
  const response = await fetch(`${BASE_URL}/v1/profiles?limit=200`, {
    method: 'GET',
    headers: authHeaders(jwt),
  });

  const data = await handleResponse(response) as {
    data: Array<{ id: string; attributes: Record<string, string> }>;
  };

  return data.data.map((p) => ({
    id: p.id,
    name: p.attributes.name,
    profileContent: p.attributes.profileContent,
    profileState: p.attributes.profileState,
    expirationDate: p.attributes.expirationDate,
  }));
}

/**
 * Create a provisioning profile at Apple.
 * NOT idempotent — caller checks existing profiles first.
 */
export async function createProvisioningProfile(
  jwt: string,
  name: string,
  bundleIdResourceId: string,
  certificateId: string,
  profileType: 'IOS_APP_STORE',
): Promise<AppleProfile> {
  const response = await fetch(`${BASE_URL}/v1/profiles`, {
    method: 'POST',
    headers: authHeaders(jwt),
    body: JSON.stringify({
      data: {
        type: 'profiles',
        attributes: {
          name,
          profileType,
        },
        relationships: {
          bundleId: {
            data: { type: 'bundleIds', id: bundleIdResourceId },
          },
          certificates: {
            data: [{ type: 'certificates', id: certificateId }],
          },
        },
      },
    }),
  });

  const data = await handleResponse(response) as {
    data: { id: string; attributes: Record<string, string> };
  };

  return {
    id: data.data.id,
    name: data.data.attributes.name,
    profileContent: data.data.attributes.profileContent,
    profileState: data.data.attributes.profileState,
    expirationDate: data.data.attributes.expirationDate,
  };
}
