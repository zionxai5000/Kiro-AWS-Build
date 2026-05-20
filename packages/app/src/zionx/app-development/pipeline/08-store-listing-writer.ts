/**
 * Pipeline Hook 08: Store Listing Writer
 *
 * Trigger: Manual API call "Prepare for Store"
 * Action: Generate App Store listing via Claude, create ASC app,
 *         set metadata, generate placeholder screenshots, upload to ASC.
 * Failure mode: NOTIFY
 * Timeout: 60s
 * Concurrency: 1 per projectId
 */

import Anthropic from '@anthropic-ai/sdk';
import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { signAscJwt } from '../services/apple-credentials/asc-jwt.js';
import { listBundleIds } from '../services/apple-credentials/asc-client.js';
import { createAscApp, setAppMetadata, uploadScreenshot, AscAppNameTakenError } from '../services/apple-credentials/asc-app-client.js';
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

  // ── Step 4: Ensure ASC app exists (with name collision retry) ──────────
  let ascAppId: string | null = await readAscAppIdFromEasJson(workspace, projectId);

  if (!ascAppId) {
    ctx.log(`[${HOOK_METADATA.id}] No ascAppId in eas.json — creating ASC app...`);
    try {
      const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
      const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
      const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');
      const jwt = signAscJwt(ascKeyId, ascIssuerId, ascKeyPem);

      // Resolve bundleIdentifier string → Apple resource ID
      const bundleIds = await listBundleIds(jwt);
      const bundleIdResource = bundleIds.find((b) => b.identifier === bundleIdentifier);
      if (!bundleIdResource) {
        throw new Error(`Bundle ID "${bundleIdentifier}" not registered at Apple. Run Hook 6 (build) first.`);
      }

      const { ascAppId: newAppId, finalName } = await createAscAppWithCollisionRetry({
        jwt,
        bundleIdResourceId: bundleIdResource.id,
        initialName: listing.name,
        sku: bundleIdentifier.replace(/\./g, '-'),
        primaryLocale: 'en-US',
        bundleIdentifier,
        credentialManager,
        listing,
        log: ctx.log,
      });

      ascAppId = newAppId;
      if (finalName !== listing.name) {
        listing.name = finalName; // Update listing with the name that actually landed
      }
      ctx.log(`[${HOOK_METADATA.id}] ASC app created: ${ascAppId} (name: "${finalName}")`);

      // Write ascAppId to eas.json
      await writeAscAppIdToEasJson(workspace, projectId, ascAppId);
    } catch (error) {
      // Distinguish error types per design doc error matrix
      if (error instanceof Error && 'statusCode' in error &&
          ((error as any).statusCode === 401 || (error as any).statusCode === 403)) {
        // HALT — credential issue
        const statusCode = (error as any).statusCode;
        ctx.log(`[${HOOK_METADATA.id}] ASC auth failure (${statusCode}): ${error.message}`);
        return {
          success: false, hookId: HOOK_METADATA.id, dryRun: false,
          error: `ASC authentication failed (${statusCode}). Check App Store Connect credentials.`,
          data: { listing, ascAppId: null, screenshotsGenerated: 0 },
          durationMs: Date.now() - start,
        };
      }
      // NOTIFY — continue without ASC (name collision exhausted, network error, etc.)
      ctx.log(`[${HOOK_METADATA.id}] ASC app creation failed (non-blocking): ${(error as Error).message}`);
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

  // ── Step 6: Generate + upload placeholder screenshots ──────────────────
  let screenshotsGenerated = 0;

  // Idempotency: skip if screenshots already exist
  const existingScreenshotCount = await countExistingScreenshots(workspace, projectId);
  if (existingScreenshotCount >= 3) {
    ctx.log(`[${HOOK_METADATA.id}] ${existingScreenshotCount} screenshots already exist — skipping generation`);
    screenshotsGenerated = existingScreenshotCount;
  } else {
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

      // Upload to ASC if app exists
      if (ascAppId) {
        await uploadScreenshotsToAsc({
          credentialManager,
          ascAppId,
          workspace,
          projectId,
          screenshots: result.screenshots,
          log: ctx.log,
        });
      }
    } catch (error) {
      ctx.log(`[${HOOK_METADATA.id}] Screenshot generation failed (non-blocking): ${(error as Error).message}`);
    }
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
// Name Collision Retry (5-attempt budget)
// ---------------------------------------------------------------------------

async function createAscAppWithCollisionRetry(args: {
  jwt: string;
  bundleIdResourceId: string;
  initialName: string;
  sku: string;
  primaryLocale: string;
  bundleIdentifier: string;
  credentialManager: CredentialManager;
  listing: StoreListing;
  log: (msg: string) => void;
}): Promise<{ ascAppId: string; finalName: string }> {
  const attemptedNames: string[] = [];

  // Attempt 1: original LLM name
  try {
    const result = await createAscApp(args.jwt, {
      bundleIdResourceId: args.bundleIdResourceId,
      name: args.initialName,
      sku: args.sku,
      primaryLocale: args.primaryLocale,
      bundleIdentifier: args.bundleIdentifier,
    });
    return { ascAppId: result.ascAppId, finalName: args.initialName };
  } catch (e) {
    if (!(e instanceof AscAppNameTakenError)) throw e;
    attemptedNames.push(args.initialName);
    args.log(`[store-listing-writer] Name "${args.initialName}" taken — trying suffix`);
  }

  // Attempt 2: suffix-based
  // Use first word of category for suffix differentiation
  // e.g., HEALTH_AND_FITNESS → "health", LIFESTYLE → "lifestyle"
  const categoryWord = args.listing.category.split('_')[0]!.toLowerCase();
  const suffixedName = `${args.initialName} ${categoryWord}`.slice(0, 30);
  try {
    const result = await createAscApp(args.jwt, {
      bundleIdResourceId: args.bundleIdResourceId,
      name: suffixedName,
      sku: args.sku,
      primaryLocale: args.primaryLocale,
      bundleIdentifier: args.bundleIdentifier,
    });
    return { ascAppId: result.ascAppId, finalName: suffixedName };
  } catch (e) {
    if (!(e instanceof AscAppNameTakenError)) throw e;
    attemptedNames.push(suffixedName);
    args.log(`[store-listing-writer] Name "${suffixedName}" taken — asking Claude for alternatives`);
  }

  // Attempts 3-5: LLM regenerates 3 alternatives
  const alternatives = await generateAlternativeNames({
    credentialManager: args.credentialManager,
    originalName: args.initialName,
    attemptedNames,
    count: 3,
  });

  for (const altName of alternatives) {
    try {
      const result = await createAscApp(args.jwt, {
        bundleIdResourceId: args.bundleIdResourceId,
        name: altName,
        sku: args.sku,
        primaryLocale: args.primaryLocale,
        bundleIdentifier: args.bundleIdentifier,
      });
      return { ascAppId: result.ascAppId, finalName: altName };
    } catch (e) {
      if (!(e instanceof AscAppNameTakenError)) throw e;
      attemptedNames.push(altName);
      args.log(`[store-listing-writer] Name "${altName}" taken — trying next alternative`);
    }
  }

  // All 5 attempts exhausted — HALT
  throw new Error(
    `Failed to create ASC app — all 5 name attempts collided. ` +
    `Tried: ${attemptedNames.join(', ')}. ` +
    `Operator can re-run with explicit appName override.`,
  );
}

async function generateAlternativeNames(args: {
  credentialManager: CredentialManager;
  originalName: string;
  attemptedNames: string[];
  count: number;
}): Promise<string[]> {
  const apiKey = await args.credentialManager.getCredential('anthropic', 'api-key');
  const client = new Anthropic({ apiKey });

  const prompt = `Generate ${args.count} alternative App Store names for an app originally named "${args.originalName}".
Constraints:
- Must be DIFFERENT from these already-taken names: ${args.attemptedNames.join(', ')}
- Each name: 2-30 characters
- Should evoke the same purpose as the original
- Return as JSON array: ["Name1", "Name2", "Name3"]
Return ONLY the JSON array, no other text.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const startIdx = text.indexOf('[');
  const endIdx = text.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Claude returned no JSON array for alternative names');
  }
  const names = JSON.parse(text.slice(startIdx, endIdx + 1)) as string[];
  return names.map((n) => String(n).slice(0, 30));
}

// ---------------------------------------------------------------------------
// Screenshot Upload to ASC
// ---------------------------------------------------------------------------

async function uploadScreenshotsToAsc(args: {
  credentialManager: CredentialManager;
  ascAppId: string;
  workspace: Workspace;
  projectId: string;
  screenshots: Array<{ filename: string }>;
  log: (msg: string) => void;
}): Promise<void> {
  const { credentialManager, ascAppId, workspace, projectId, screenshots, log } = args;

  try {
    const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
    const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
    const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');
    const jwt = signAscJwt(ascKeyId, ascIssuerId, ascKeyPem);

    // Upload each screenshot — use allSettled so one failure doesn't break all
    const results = await Promise.allSettled(
      screenshots.map(async (ss, idx) => {
        const filePath = `assets/screenshots/${ss.filename}`;
        const data = await workspace.readBinaryFile(projectId, filePath);
        await uploadScreenshot(jwt, ascAppId, data, ss.filename);
        return ss.filename;
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    log(`[store-listing-writer] Screenshot upload: ${succeeded} succeeded, ${failed} failed`);

    for (const r of results) {
      if (r.status === 'rejected') {
        log(`[store-listing-writer] Upload failed: ${(r.reason as Error).message}`);
      }
    }
  } catch (error) {
    log(`[store-listing-writer] Screenshot upload setup failed: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into a StoreListing object.
 * Handles responses that may be wrapped in markdown code fences.
 */
function parseListingJson(responseText: string): StoreListing {
  let json = responseText.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const startIdx = json.indexOf('{');
  const endIdx = json.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No JSON object found in LLM response');
  }
  json = json.slice(startIdx, endIdx + 1);

  const parsed = JSON.parse(json);

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

  if (!easJson.submit) easJson.submit = {};
  const submit = easJson.submit as Record<string, unknown>;
  if (!submit.production) submit.production = {};
  const production = submit.production as Record<string, unknown>;
  if (!production.ios) production.ios = {};
  const ios = production.ios as Record<string, unknown>;
  ios.ascAppId = ascAppId;

  await workspace.writeFile(projectId, 'eas.json', JSON.stringify(easJson, null, 2));
}

/**
 * Count existing PNG screenshots in workspace assets/screenshots/.
 */
async function countExistingScreenshots(workspace: Workspace, projectId: string): Promise<number> {
  try {
    const allFiles = await workspace.listFiles(projectId);
    return allFiles.filter((f) => f.startsWith('assets/screenshots/') && f.endsWith('.png')).length;
  } catch {
    return 0;
  }
}
