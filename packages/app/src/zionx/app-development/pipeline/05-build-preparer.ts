/**
 * Pipeline Hook 05: Build Preparer
 *
 * Trigger: Manual API call "Build for Device"
 * Action: Validate app.json, auto-increment build numbers, retrieve credentials,
 *         generate eas.json if missing.
 * Failure mode: NOTIFY
 * Timeout: 60s for prep (build itself runs on EAS via Hook 6)
 * Concurrency: 1 per user
 *
 * Does NOT write .p8 to disk — Hook 6 handles that just-in-time via withTempCredentialFile.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { Workspace } from '../workspace/workspace.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'build-preparer',
  name: 'Build Preparer',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.buildPrepTimeoutMs,
  maxConcurrent: 1,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface BuildPreparerInput {
  projectId: string;
  platform: 'ios' | 'android';
  credentialManager: CredentialManager;
}

export interface CredentialInfo {
  keyId: string;
  issuerId: string;
  p8Content: string;
}

export interface BuildPreparerOutput {
  ready: boolean;
  projectId: string;
  platform: 'ios' | 'android';
  buildNumber?: string;
  versionCode?: number;
  version?: string;
  credentialInfo?: CredentialInfo;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Default eas.json content
// ---------------------------------------------------------------------------

const DEFAULT_EAS_JSON = {
  cli: { version: '>= 5.0.0' },
  build: {
    production: {
      distribution: 'store',
      ios: { resourceClass: 'm-medium' },
      android: { buildType: 'app-bundle' },
    },
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: BuildPreparerInput,
  ctx: HookContext,
): Promise<HookResult<BuildPreparerOutput>> {
  const start = Date.now();
  const { projectId, platform, credentialManager } = input;

  // Kill switch
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { ready: false, projectId, platform, errors: ['Hook disabled'] },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);
  const workspace = new Workspace();

  // Step a: Read app.json
  let appJsonContent: string;
  try {
    appJsonContent = await workspace.readFile(projectId, 'app.json');
  } catch {
    ctx.log(`[${HOOK_METADATA.id}] app.json not found for project "${projectId}"`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun,
      error: 'app.json not found',
      data: { ready: false, projectId, platform, errors: ['app.json not found'] },
      durationMs: Date.now() - start,
    };
  }

  // Step b: Parse JSON
  let appJson: any;
  try {
    appJson = JSON.parse(appJsonContent);
  } catch {
    ctx.log(`[${HOOK_METADATA.id}] Invalid JSON in app.json for project "${projectId}"`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun,
      error: 'Invalid app.json — JSON parse failed',
      data: { ready: false, projectId, platform, errors: ['Invalid JSON in app.json'] },
      durationMs: Date.now() - start,
    };
  }

  const expo = appJson.expo ?? appJson;

  // Step c: Validate required fields
  const validationErrors: string[] = [];
  if (!expo.name || typeof expo.name !== 'string') validationErrors.push('expo.name is required');
  if (!expo.slug || typeof expo.slug !== 'string') validationErrors.push('expo.slug is required');
  if (!expo.version || typeof expo.version !== 'string') validationErrors.push('expo.version is required');

  if (platform === 'ios') {
    if (!expo.ios?.bundleIdentifier || typeof expo.ios.bundleIdentifier !== 'string') {
      validationErrors.push('expo.ios.bundleIdentifier is required for iOS builds');
    }
  }
  if (platform === 'android') {
    if (!expo.android?.package || typeof expo.android.package !== 'string') {
      validationErrors.push('expo.android.package is required for Android builds');
    }
  }

  if (validationErrors.length > 0) {
    ctx.log(`[${HOOK_METADATA.id}] Validation failed: ${validationErrors.join(', ')}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun,
      error: `Validation failed: ${validationErrors.join('; ')}`,
      data: { ready: false, projectId, platform, errors: validationErrors },
      durationMs: Date.now() - start,
    };
  }

  // Step d: Auto-increment build number
  const originalVersion = expo.version; // Preserve — NEVER modify
  let buildNumber: string | undefined;
  let versionCode: number | undefined;

  if (platform === 'ios') {
    const current = parseInt(expo.ios?.buildNumber ?? '0', 10);
    buildNumber = String(current + 1);
    if (!expo.ios) expo.ios = {};
    expo.ios.buildNumber = buildNumber;
  } else {
    const current = expo.android?.versionCode ?? 0;
    versionCode = current + 1;
    if (!expo.android) expo.android = {};
    expo.android.versionCode = versionCode;
  }

  // Dry-run: validate and would-increment but do NOT write
  if (dryRun) {
    ctx.log(
      `[${HOOK_METADATA.id}] DRY RUN — would increment ${platform === 'ios' ? `buildNumber to "${buildNumber}"` : `versionCode to ${versionCode}`} ` +
      `for project "${projectId}". Would NOT modify workspace files.`
    );
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { ready: true, projectId, platform, buildNumber, versionCode, version: originalVersion, errors: [] },
      durationMs: Date.now() - start,
    };
  }

  // Circuit breaker
  const cb = getCircuitBreaker(HOOK_METADATA.id);
  cb.allowRequest();

  // Step e: Write updated app.json back
  // Reconstruct with expo wrapper if original had it
  const updatedAppJson = appJson.expo ? { ...appJson, expo } : expo;
  await workspace.writeFile(projectId, 'app.json', JSON.stringify(updatedAppJson, null, 2));
  ctx.log(`[${HOOK_METADATA.id}] Updated app.json — ${platform === 'ios' ? `buildNumber: "${buildNumber}"` : `versionCode: ${versionCode}`}`);

  // Step f: Generate eas.json if missing
  const easJsonExists = await workspace.exists(projectId, 'eas.json');
  if (!easJsonExists) {
    await workspace.writeFile(projectId, 'eas.json', JSON.stringify(DEFAULT_EAS_JSON, null, 2));
    ctx.log(`[${HOOK_METADATA.id}] Generated eas.json with production build profile`);
  }

  // Step g: Retrieve iOS credentials (iOS only)
  let credentialInfo: CredentialInfo | undefined;
  if (platform === 'ios') {
    try {
      const p8Content = await credentialManager.getCredential('appstore-connect', 'api-key');
      const keyId = await credentialManager.getCredential('appstore-connect', 'key-id');
      const issuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');

      if (!p8Content || !keyId || !issuerId) {
        throw new Error('One or more App Store Connect credentials are empty');
      }

      credentialInfo = { keyId, issuerId, p8Content };
      ctx.log(`[${HOOK_METADATA.id}] Retrieved App Store Connect credentials (keyId: ${keyId.slice(0, 4)}...)`);
    } catch (error) {
      cb.recordFailure();
      ctx.log(`[${HOOK_METADATA.id}] Failed to retrieve iOS credentials`);
      return {
        success: false,
        hookId: HOOK_METADATA.id,
        dryRun: false,
        error: 'Failed to retrieve App Store Connect credentials',
        data: { ready: false, projectId, platform, errors: ['iOS credential retrieval failed'] },
        durationMs: Date.now() - start,
      };
    }
  }

  cb.recordSuccess();
  ctx.log(`[${HOOK_METADATA.id}] Build preparation complete for project "${projectId}" (${platform})`);

  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: {
      ready: true,
      projectId,
      platform,
      buildNumber,
      versionCode,
      version: originalVersion,
      credentialInfo,
      errors: [],
    },
    durationMs: Date.now() - start,
  };
}
