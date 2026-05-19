/**
 * Pipeline Hook 08: Store Listing Writer
 *
 * Trigger: Manual API call "Prepare for Store"
 * Action: Generate App Store listing via Claude, create ASC app,
 *         set metadata, generate placeholder screenshots.
 * Failure mode: NOTIFY
 * Timeout: 60s
 * Concurrency: 1 per projectId
 */

import Anthropic from '@anthropic-ai/sdk';
import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { APPLE_CREDENTIALS_CONFIG } from '../config/apple-credentials-config.js';
import { signAscJwt } from '../services/apple-credentials/asc-jwt.js';
import { createAscApp, setAppMetadata } from '../services/apple-credentials/asc-app-client.js';
import { STORE_LISTING_SYSTEM_PROMPT, buildStoreListingUserPrompt } from '../services/store-listing-prompts.js';
import { generatePlaceholderScreenshots } from '../services/screenshot-generator.js';
import { Workspace } from '../workspace/workspace.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { StoreListing } from '../types/index.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'store-listing-writer',
  name: 'Store Listing Writer',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.storeListingTimeoutMs,
  maxConcurrent: 1,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface StoreListingWriterInput {
  projectId: string;
  appName: string;
  appDescription: string;
  category?: string;
  credentialManager: CredentialManager;
}

export interface StoreListingWriterOutput {
  listing: StoreListing | null;
  ascAppId: string | null;
  screenshotsGenerated: number;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: StoreListingWriterInput,
  ctx: HookContext,
): Promise<HookResult<StoreListingWriterOutput>> {
  const start = Date.now();
  const { projectId, appName, appDescription, credentialManager } = input;

  // Kill switch
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { listing: null, ascAppId: null, screenshotsGenerated: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would generate store listing for "${appName}" in project "${projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { listing: null, ascAppId: null, screenshotsGenerated: 0 },
      durationMs: Date.now() - start,
    };
  }

  const workspace = new Workspace();

  // ── Step 1: Check for cached store-listing.json (idempotency) ──────────
  try {
    const existingListing = await workspace.readFile(projectId, 'store-listing.json');
    const listing = JSON.parse(existingListing) as StoreListing;
    ctx.log(`[${HOOK_METADATA.id}] Cached store-listing.json found — skipping LLM generation`);

    // Still read ascAppId from eas.json
    const ascAppId = await readAscAppIdFromEasJson(workspace, projectId);

    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: false,
      data: { listing, ascAppId, screenshotsGenerated: 0 },
      durationMs: Date.now() - start,
    };
  } catch {
    // No cached listing — proceed with generation
  }

  // ── Step 2: Read app.json for bundleIdentifier ─────────────────────────
  let bundleIdentifier: string;
  try {
    const appJsonContent = await workspace.readFile(projectId, 'app.json');
    const appJson = JSON.parse(appJsonContent);
    bundleIdentifier = appJson?.expo?.ios?.bundleIdentifier ?? appJson?.expo?.android?.package ?? '';
    if (!bundleIdentifier) {
      throw new Error('No bundleIdentifier found in app.json');
    }
  } catch (error) {
    ctx.log(`[${HOOK_METADATA.id}] Failed to read bundleIdentifier from app.json: ${(error as Error).message}`);
    return {
      success: false, hookId: HOOK_METADATA.id, dryRun: false,
      error: `Cannot read bundleIdentifier from app.json: ${(error as Error).message}`,
      data: { listing: null, ascAppId: null, screenshotsGenerated: 0 },
      durationMs: Date.now() - start,
    };
  }

  // ── Step 3: Generate store listing via Claude ──────────────────────────
  ctx.log(`[${HOOK_METADATA.id}] Generating store listing via Claude...`);
  let listing: StoreListing;
  try {
    const apiKey = await credentialManager.getCredential('anthropic', 'api-key');
    const client = new Anthropic({ apiKey });

    const privacyPolicyUrl = 'https://zionxai5000.github.io/privacy-policies/';
    const userPrompt = buildStoreListingUserPrompt({
      appName,
      appDescription,
      bundleIdentifier,
      privacyPolicyUrl,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: STORE_LISTING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    listing = parseListingJson(responseText);
    ctx.log(`[${HOOK_METADATA.id}] Store listing generated: "${listing.name}"`);
  } catch (error) {
    ctx.log(`[${HOOK_METADATA.id}] LLM generation failed: ${(error as Error).message}`);
    return {
      success: false, hookId: HOOK_METADATA.id, dryRun: false,
      error: `Store listing generation failed: ${(error as Error).message}`,
      data: { listing: null, ascAppId: null, screenshotsGenerated: 0 },
      durationMs: Date.now() - start,
    };
  }

  // ── Step 4: Ensure ASC app exists ──────────────────────────────────────
  let ascAppId: string | null = await readAscAppIdFromEasJson(workspace, projectId);

  if (!ascAppId) {
    ctx.log(`[${HOOK_METADATA.id}] No ascAppId in eas.json — creating ASC app...`);
    try {
      const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
      const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
      const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');
      const jwt = signAscJwt(ascKeyId, ascIssuerId, ascKeyPem);

      const appInfo = await createAscApp(jwt, {
        bundleIdResourceId: bundleIdentifier, // Will be resolved by ASC
        name: listing.name,
        sku: bundleIdentifier.replace(/\./g, '-'),
        primaryLocale: 'en-US',
        bundleIdentifier,
      });

      ascAppId = appInfo.ascAppId;
      ctx.log(`[${HOOK_METADATA.id}] ASC app created: ${ascAppId}`);

      // Write ascAppId to eas.json
      await writeAscAppIdToEasJson(workspace, projectId, ascAppId);
    } catch (error) {
      ctx.log(`[${HOOK_METADATA.id}] ASC app creation failed: ${(error as Error).message}`);
      // Continue without ASC — listing is still useful locally
      // Name collision handling deferred to C3 completion
    }
  } else {
    ctx.log(`[${HOOK_METADATA.id}] ASC app already exists: ${ascAppId}`);
  }

  // ── Step 5: Set metadata at ASC ────────────────────────────────────────
  if (ascAppId) {
    try {
      const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
      const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
      const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');
      const jwt = signAscJwt(ascKeyId, ascIssuerId, ascKeyPem);

      await setAppMetadata(jwt, ascAppId, {
        name: listing.name,
        subtitle: listing.subtitle,
        description: listing.description,
        keywords: listing.keywords,
        supportUrl: listing.supportUrl,
        privacyPolicyUrl: listing.privacyPolicyUrl,
      });
      ctx.log(`[${HOOK_METADATA.id}] Metadata pushed to ASC`);
    } catch (error) {
      ctx.log(`[${HOOK_METADATA.id}] setAppMetadata failed (non-blocking): ${(error as Error).message}`);
    }
  }

  // ── Step 6: Generate placeholder screenshots ───────────────────────────
  let screenshotsGenerated = 0;
  try {
    const result = await generatePlaceholderScreenshots({
      appName,
      appDescription,
      screenshotCount: 4,
      platform: 'ios',
      workspace,
      projectId,
    });
    screenshotsGenerated = result.screenshots.length;
    ctx.log(`[${HOOK_METADATA.id}] ${screenshotsGenerated} placeholder screenshots generated`);
  } catch (error) {
    ctx.log(`[${HOOK_METADATA.id}] Screenshot generation failed (non-blocking): ${(error as Error).message}`);
  }

  // ── Step 7: Write store-listing.json to workspace ──────────────────────
  try {
    await workspace.writeFile(projectId, 'store-listing.json', JSON.stringify(listing, null, 2));
    ctx.log(`[${HOOK_METADATA.id}] store-listing.json written to workspace`);
  } catch (error) {
    ctx.log(`[${HOOK_METADATA.id}] Failed to write store-listing.json: ${(error as Error).message}`);
  }

  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { listing, ascAppId, screenshotsGenerated },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into a StoreListing object.
 * Handles responses that may be wrapped in markdown code fences.
 */
function parseListingJson(responseText: string): StoreListing {
  // Strip markdown code fences if present
  let json = responseText.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Find the JSON object
  const startIdx = json.indexOf('{');
  const endIdx = json.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No JSON object found in LLM response');
  }
  json = json.slice(startIdx, endIdx + 1);

  const parsed = JSON.parse(json);

  // Validate required fields
  if (!parsed.name || !parsed.description) {
    throw new Error('LLM response missing required fields (name, description)');
  }

  return {
    name: String(parsed.name).slice(0, 30),
    subtitle: String(parsed.subtitle ?? '').slice(0, 30),
    description: String(parsed.description).slice(0, 4000),
    keywords: String(parsed.keywords ?? '').slice(0, 100),
    category: String(parsed.category ?? 'LIFESTYLE'),
    supportUrl: String(parsed.supportUrl ?? 'https://zionxai5000.github.io/privacy-policies/'),
    privacyPolicyUrl: String(parsed.privacyPolicyUrl ?? 'https://zionxai5000.github.io/privacy-policies/'),
    marketingUrl: parsed.marketingUrl ? String(parsed.marketingUrl) : undefined,
    whatsNew: parsed.whatsNew ? String(parsed.whatsNew) : undefined,
  };
}

/**
 * Read ascAppId from workspace eas.json (submit.production.ios.ascAppId).
 */
async function readAscAppIdFromEasJson(workspace: Workspace, projectId: string): Promise<string | null> {
  try {
    const easJsonContent = await workspace.readFile(projectId, 'eas.json');
    const easJson = JSON.parse(easJsonContent);
    return easJson?.submit?.production?.ios?.ascAppId ?? null;
  } catch {
    return null;
  }
}

/**
 * Write ascAppId to workspace eas.json under submit.production.ios.ascAppId.
 */
async function writeAscAppIdToEasJson(workspace: Workspace, projectId: string, ascAppId: string): Promise<void> {
  let easJson: Record<string, unknown> = {};
  try {
    const existing = await workspace.readFile(projectId, 'eas.json');
    easJson = JSON.parse(existing);
  } catch {
    // eas.json doesn't exist yet — create fresh
  }

  // Ensure nested structure
  if (!easJson.submit) easJson.submit = {};
  const submit = easJson.submit as Record<string, unknown>;
  if (!submit.production) submit.production = {};
  const production = submit.production as Record<string, unknown>;
  if (!production.ios) production.ios = {};
  const ios = production.ios as Record<string, unknown>;
  ios.ascAppId = ascAppId;

  await workspace.writeFile(projectId, 'eas.json', JSON.stringify(easJson, null, 2));
}
