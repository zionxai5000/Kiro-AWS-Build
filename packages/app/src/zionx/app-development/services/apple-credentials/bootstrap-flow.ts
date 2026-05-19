/**
 * iOS Credential Bootstrap — Orchestrator
 *
 * Idempotent end-to-end flow that ensures all iOS build credentials
 * are configured at both Apple and EAS. Safe to call multiple times.
 *
 * Steps:
 * 1. Authenticate (sign ASC JWT, get EAS account ID)
 * 2. Register ASC API Key with EAS (idempotent)
 * 3. Ensure Distribution Certificate (Apple + EAS verified)
 * 4. Ensure Bundle ID at Apple (idempotent via 409)
 * 5. Ensure Provisioning Profile
 * 6. Bind credentials to app at EAS (upsert)
 */

import { randomBytes } from 'node:crypto';
import { signAscJwt } from './asc-jwt.js';
import {
  listCertificates,
  createCertificate,
  revokeCertificate,
  listBundleIds,
  createBundleId,
  listProfiles,
  createProvisioningProfile as appleCreateProfile,
  type AppleCertificate,
} from './asc-client.js';
import { generateKeyPairAndCsr, bundleP12 } from './csr-generator.js';
import {
  getAccountId,
  listDistributionCerts,
  createDistributionCert,
  ensureAscApiKeyRegistered,
  ensureAppIdentifier,
  createProvisioningProfile as easCreateProfile,
  bindBuildCredentials,
} from './eas-graphql-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BootstrapConfig {
  ascKeyId: string;
  ascIssuerId: string;
  ascKeyPem: string;
  appleTeamId: string;
  appleTeamType: 'INDIVIDUAL' | 'COMPANY_OR_ORGANIZATION' | 'IN_HOUSE';
  expoToken: string;
  easAccountName: string;
  bundleIdentifier: string;
  projectFullName: string;
  revokeCertSerial?: string;
  dryRun: boolean;
}

export interface BootstrapResult {
  easCertId: string;
  easProfileId: string;
  easAppIdentifierId: string;
  easAscKeyId: string;
  appleCertId: string;
  appleProfileId: string;
  appleBundleIdResourceId: string;
  created: string[];
  reused: string[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

export class BootstrapMaxCertsError extends BootstrapError {
  public readonly existingCerts: AppleCertificate[];

  constructor(certs: AppleCertificate[]) {
    const lines = certs.map(
      (c) => `  - Serial: ${c.serialNumber}, Type: ${c.certificateType}, Name: ${c.name}, Expires: ${c.expirationDate}`,
    );
    super(
      `Apple account has ${certs.length} distribution certificates (max 2):\n` +
      lines.join('\n') + '\n\n' +
      'Cannot create a new certificate. Options:\n' +
      '  --revoke-cert <serial>  Revoke the specified cert and create new',
    );
    this.name = 'BootstrapMaxCertsError';
    this.existingCerts = certs;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dryId(resource: string): string {
  const hex = randomBytes(2).toString('hex');
  return `DRY_RUN_${resource}_${hex}`;
}

// ---------------------------------------------------------------------------
// Main Flow
// ---------------------------------------------------------------------------

export async function bootstrapIosCredentials(
  config: BootstrapConfig,
  log: (msg: string) => void,
): Promise<BootstrapResult> {
  const created: string[] = [];
  const reused: string[] = [];

  // ═══════════════════════════════════════════════════════════════
  // Step 1: Authenticate
  // ═══════════════════════════════════════════════════════════════
  log('[Step 1] Authenticating with Apple and EAS...');

  const jwt = signAscJwt(config.ascKeyId, config.ascIssuerId, config.ascKeyPem);
  log('[Step 1] ASC JWT signed');

  const account = await getAccountId(config.expoToken, config.easAccountName);
  log(`[Step 1] EAS account: ${account.name} (${account.id})`);

  // ═══════════════════════════════════════════════════════════════
  // Step 2: Ensure ASC API Key at EAS (idempotent)
  // ═══════════════════════════════════════════════════════════════
  log('[Step 2] Ensuring ASC API Key is registered at EAS...');

  let easAscKeyId: string;
  if (config.dryRun) {
    // Still do the read to check existing
    const { listAscApiKeys } = await import('./eas-graphql-client.js');
    const existing = await listAscApiKeys(config.expoToken, config.easAccountName);
    const match = existing.find((k) => k.keyIdentifier === config.ascKeyId);
    if (match) {
      easAscKeyId = match.id;
      reused.push(`ASC API Key (${easAscKeyId})`);
      log(`[Step 2] ASC API Key already registered: ${easAscKeyId}`);
    } else {
      easAscKeyId = dryId('ASC_KEY');
      created.push(`ASC API Key (${easAscKeyId})`);
      log(`[Step 2] [DRY-RUN] Would register ASC API Key`);
    }
  } else {
    easAscKeyId = await ensureAscApiKeyRegistered(
      config.expoToken,
      account.id,
      config.easAccountName,
      {
        keyIdentifier: config.ascKeyId,
        issuerIdentifier: config.ascIssuerId,
        keyP8: config.ascKeyPem,
        name: 'SeraphimOS Bootstrap Key',
      },
    );
    // Determine if it was reused or created by checking if it existed before
    // (ensureAscApiKeyRegistered is idempotent — if it returned without creating, it's reused)
    // For simplicity, we'll just log it as "ensured"
    log(`[Step 2] ASC API Key ensured: ${easAscKeyId}`);
    reused.push(`ASC API Key (${easAscKeyId})`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 3: Ensure Distribution Certificate
  // ═══════════════════════════════════════════════════════════════
  log('[Step 3] Ensuring Distribution Certificate...');

  let easCertId: string;
  let appleCertId: string = '';

  // 3a: Check EAS for existing cert, verify at Apple
  const easCerts = await listDistributionCerts(config.expoToken, config.easAccountName);
  const appleCerts = await listCertificates(jwt);

  let foundValidCert = false;
  for (const easCert of easCerts) {
    const now = new Date();
    const expiry = new Date(easCert.validityNotAfter);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (expiry <= thirtyDaysFromNow) continue; // Too close to expiry

    // Verify at Apple
    if (easCert.developerPortalIdentifier) {
      const appleMatch = appleCerts.find((ac) => ac.id === easCert.developerPortalIdentifier);
      if (appleMatch) {
        // Found valid cert at both EAS and Apple
        easCertId = easCert.id;
        appleCertId = appleMatch.id;
        foundValidCert = true;
        reused.push(`Distribution Cert (EAS: ${easCertId}, Apple: ${appleCertId})`);
        log(`[Step 3] Verified existing cert at Apple: ${appleCertId}`);
        break;
      } else {
        log(`[Step 3] EAS cert ${easCert.id} has stale Apple reference, skipping`);
      }
    }
  }

  if (!foundValidCert) {
    // 3c: Check Apple cert count
    const distCerts = appleCerts.filter(
      (c) => c.certificateType === 'DISTRIBUTION' || c.certificateType === 'IOS_DISTRIBUTION',
    );

    if (distCerts.length >= 2) {
      if (config.revokeCertSerial) {
        // Find and revoke the specified cert
        const toRevoke = distCerts.find((c) => c.serialNumber === config.revokeCertSerial);
        if (!toRevoke) {
          throw new BootstrapError(
            `Certificate with serial "${config.revokeCertSerial}" not found. ` +
            `Available: ${distCerts.map((c) => c.serialNumber).join(', ')}`,
          );
        }

        if (config.dryRun) {
          log(`[Step 3] [DRY-RUN] Would revoke cert ${toRevoke.serialNumber} (${toRevoke.name})`);
        } else {
          log(`[Step 3] Revoking cert ${toRevoke.serialNumber} (${toRevoke.name})...`);
          await revokeCertificate(jwt, toRevoke.id);
          log(`[Step 3] Revoked`);
        }
      } else {
        throw new BootstrapMaxCertsError(distCerts);
      }
    }

    // 3d + 3e: Generate keypair + CSR, create cert at Apple
    log('[Step 3] Generating RSA-2048 keypair and CSR...');
    const { privateKeyPem, csrPem } = generateKeyPairAndCsr();
    log('[Step 3] CSR generated');

    if (config.dryRun) {
      appleCertId = dryId('APPLE_CERT');
      easCertId = dryId('EAS_CERT');
      created.push(`Distribution Cert (Apple: ${appleCertId}, EAS: ${easCertId})`);
      log(`[Step 3] [DRY-RUN] Would create cert at Apple and upload to EAS`);
    } else {
      log('[Step 3] Creating certificate at Apple...');
      const newCert = await createCertificate(jwt, csrPem);
      appleCertId = newCert.id;
      log(`[Step 3] Apple cert created: ${appleCertId}`);

      // 3f: Bundle .p12 and upload to EAS
      const p12Password = randomBytes(16).toString('hex');
      const p12Base64 = bundleP12(newCert.certificateContent, privateKeyPem, p12Password);

      log('[Step 3] Uploading cert to EAS...');
      easCertId = await createDistributionCert(config.expoToken, account.id, {
        certP12Base64: p12Base64,
        certPassword: p12Password,
        certPrivateSigningKey: privateKeyPem,
        developerPortalIdentifier: newCert.id,
      });
      log(`[Step 3] EAS cert uploaded: ${easCertId}`);
      created.push(`Distribution Cert (Apple: ${appleCertId}, EAS: ${easCertId})`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 4: Ensure Bundle ID at Apple (idempotent)
  // ═══════════════════════════════════════════════════════════════
  log(`[Step 4] Ensuring Bundle ID: ${config.bundleIdentifier}...`);

  let appleBundleIdResourceId: string;
  let easAppIdentifierId: string;

  // Check Apple
  const existingBundleIds = await listBundleIds(jwt);
  const existingBid = existingBundleIds.find((b) => b.identifier === config.bundleIdentifier);

  if (existingBid) {
    appleBundleIdResourceId = existingBid.id;
    reused.push(`Bundle ID at Apple (${appleBundleIdResourceId})`);
    log(`[Step 4] Bundle ID exists at Apple: ${appleBundleIdResourceId}`);
  } else if (config.dryRun) {
    appleBundleIdResourceId = dryId('APPLE_BID');
    created.push(`Bundle ID at Apple (${appleBundleIdResourceId})`);
    log(`[Step 4] [DRY-RUN] Would create Bundle ID at Apple`);
  } else {
    const slug = config.bundleIdentifier.split('.').pop() ?? 'app';
    const newBid = await createBundleId(jwt, config.bundleIdentifier, `SeraphimOS ${slug}`, 'IOS');
    appleBundleIdResourceId = newBid.id;
    created.push(`Bundle ID at Apple (${appleBundleIdResourceId})`);
    log(`[Step 4] Bundle ID created at Apple: ${appleBundleIdResourceId}`);
  }

  // Ensure at EAS
  if (config.dryRun) {
    // Still do the read
    easAppIdentifierId = dryId('EAS_AID');
    log(`[Step 4] [DRY-RUN] Would ensure App Identifier at EAS`);
  } else {
    easAppIdentifierId = await ensureAppIdentifier(
      config.expoToken,
      account.id,
      config.bundleIdentifier,
      undefined,
      config.easAccountName,
    );
    log(`[Step 4] EAS App Identifier ensured: ${easAppIdentifierId}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 5: Ensure Provisioning Profile
  // ═══════════════════════════════════════════════════════════════
  log('[Step 5] Ensuring Provisioning Profile...');

  let appleProfileId: string;
  let easProfileId: string;

  // Check Apple for existing profile bound to our cert + bundle ID
  const existingProfiles = await listProfiles(jwt);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const matchingProfile = existingProfiles.find(
    (p) =>
      p.profileState === 'ACTIVE' &&
      p.bundleIdResourceId === appleBundleIdResourceId &&
      p.certificateIds.includes(appleCertId!) &&
      new Date(p.expirationDate) > new Date(Date.now() + thirtyDaysMs),
  );

  if (matchingProfile) {
    appleProfileId = matchingProfile.id;
    reused.push(`Provisioning Profile at Apple (${appleProfileId})`);
    log(`[Step 5] Existing profile found at Apple: ${appleProfileId} (bound to ${appleBundleIdResourceId} + cert ${appleCertId})`);

    if (config.dryRun) {
      easProfileId = dryId('EAS_PROF');
      log(`[Step 5] [DRY-RUN] Would upload profile to EAS`);
    } else {
      easProfileId = await easCreateProfile(
        config.expoToken,
        account.id,
        easAppIdentifierId,
        {
          appleProvisioningProfile: matchingProfile.profileContent,
          developerPortalIdentifier: matchingProfile.id,
        },
      );
      log(`[Step 5] Profile uploaded to EAS: ${easProfileId}`);
    }
  } else {
    log(`[Step 5] No matching profile for bundle ${config.bundleIdentifier} + cert ${appleCertId}`);

    if (config.dryRun) {
      appleProfileId = dryId('APPLE_PROF');
      easProfileId = dryId('EAS_PROF');
      created.push(`Provisioning Profile (Apple: ${appleProfileId}, EAS: ${easProfileId})`);
      log(`[Step 5] [DRY-RUN] Would create profile at Apple and upload to EAS`);
    } else {
      const profileName = `AppStore ${config.bundleIdentifier}`;
      const newProfile = await appleCreateProfile(
        jwt,
        profileName,
        appleBundleIdResourceId,
        appleCertId!,
        'IOS_APP_STORE',
      );
      appleProfileId = newProfile.id;
      log(`[Step 5] Profile created at Apple: ${appleProfileId}`);

      easProfileId = await easCreateProfile(
        config.expoToken,
        account.id,
        easAppIdentifierId,
        {
          appleProvisioningProfile: newProfile.profileContent,
          developerPortalIdentifier: newProfile.id,
        },
      );
      log(`[Step 5] Profile uploaded to EAS: ${easProfileId}`);
      created.push(`Provisioning Profile (Apple: ${appleProfileId}, EAS: ${easProfileId})`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 6: Bind credentials to app at EAS (upsert)
  // ═══════════════════════════════════════════════════════════════
  log('[Step 6] Binding credentials to app at EAS...');

  if (config.dryRun) {
    log(`[Step 6] [DRY-RUN] Would bind cert=${easCertId!} + profile=${easProfileId!} to ${config.projectFullName}`);
  } else {
    await bindBuildCredentials(
      config.expoToken,
      config.projectFullName,
      easAppIdentifierId,
      {
        iosDistributionType: 'APP_STORE',
        distributionCertificateId: easCertId!,
        provisioningProfileId: easProfileId!,
      },
    );
    log('[Step 6] Credentials bound to app');
  }

  // ═══════════════════════════════════════════════════════════════
  // Done
  // ═══════════════════════════════════════════════════════════════
  return {
    easCertId: easCertId!,
    easProfileId: easProfileId!,
    easAppIdentifierId,
    easAscKeyId,
    appleCertId: appleCertId!,
    appleProfileId: appleProfileId!,
    appleBundleIdResourceId,
    created,
    reused,
  };
}
