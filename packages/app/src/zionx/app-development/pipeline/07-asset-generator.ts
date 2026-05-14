/**
 * Pipeline Hook 07: Asset Generator
 *
 * Trigger: Save of generated/{projectId}/app.json with valid name field
 * Action: Generate icon, splash-icon, adaptive-icon, notification-icon PNGs
 *         via OpenAI Images API (gpt-image-1-mini) and write to workspace.
 * Failure mode: NOTIFY — assets are optional, build can proceed without them.
 * Timeout: 300s
 * Concurrency: 3 globally (expensive API calls)
 *
 * Idempotency: Skips generation if assets/icon.png already exists.
 * Cost: ~$0.044 per project (4 images × $0.011 at medium quality).
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { OpenAIImagesClient, ContentPolicyError, RateLimitError } from '../services/openai-images-client.js';
import { Workspace } from '../workspace/workspace.js';
import { ASSET_SPECS, buildPromptForAsset } from './asset-prompts.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { AssetSet, AssetVariant } from '../types/index.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'asset-generator',
  name: 'Asset Generator',
  triggerType: 'file_event',
  failureMode: 'notify',
  timeoutMs: LIMITS.assetGenerationTimeoutMs,
  maxConcurrent: 3,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface AssetGeneratorInput {
  projectId: string;
  appName: string;
  appDescription?: string;
  /** Optional: inject credential manager (for testing / CLI). Falls back to env-based. */
  credentialManager?: CredentialManager;
}

export interface AssetGeneratorOutput {
  assets: AssetSet | null;
  costUsd: number;
  generatedFiles: string[];
  skippedFiles: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost per image at medium quality, 1024x1024, gpt-image-1-mini */
const COST_PER_IMAGE_USD = 0.011;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: AssetGeneratorInput,
  ctx: HookContext,
): Promise<HookResult<AssetGeneratorOutput>> {
  const start = Date.now();
  const emptyOutput: AssetGeneratorOutput = {
    assets: null,
    costUsd: 0,
    generatedFiles: [],
    skippedFiles: [],
    errors: [],
  };

  // Kill switch check
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: emptyOutput,
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  // Dry-run path
  if (dryRun) {
    ctx.log(
      `[${HOOK_METADATA.id}] DRY RUN — would generate 4 assets for "${input.appName}" ` +
      `in project "${input.projectId}" (est. cost: $${(ASSET_SPECS.length * COST_PER_IMAGE_USD).toFixed(3)})`,
    );
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: emptyOutput,
      durationMs: Date.now() - start,
    };
  }

  // Idempotency check: skip if assets already exist
  const workspace = new Workspace();
  const alreadyExists = await workspace.exists(input.projectId, 'assets/icon.png');
  if (alreadyExists) {
    ctx.log(`[${HOOK_METADATA.id}] Assets already exist for project "${input.projectId}" — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      data: { ...emptyOutput, skippedFiles: ASSET_SPECS.map((s) => `assets/${s.filename}`) },
      durationMs: Date.now() - start,
    };
  }

  // Ensure assets directory exists
  await workspace.ensureProjectDir(input.projectId);

  // Create OpenAI client
  if (!input.credentialManager) {
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: 'No credential manager provided',
      data: emptyOutput,
      durationMs: Date.now() - start,
    };
  }

  const imagesClient = new OpenAIImagesClient({
    credentialManager: input.credentialManager,
  });

  // Generate assets sequentially (respects rate limits, simplifies error handling)
  const generatedFiles: string[] = [];
  const errors: string[] = [];
  const iconVariants: AssetVariant[] = [];
  const splashVariants: AssetVariant[] = [];
  let totalCost = 0;

  ctx.log(`[${HOOK_METADATA.id}] Generating ${ASSET_SPECS.length} assets for "${input.appName}"`);

  for (const spec of ASSET_SPECS) {
    const assetPath = `assets/${spec.filename}`;

    try {
      const prompt = buildPromptForAsset(spec, input.appName, input.appDescription);
      ctx.log(`[${HOOK_METADATA.id}]   → ${spec.purpose} (${spec.filename})`);

      const result = await imagesClient.generateImage({
        prompt,
        size: spec.size,
        quality: 'medium',
        background: spec.background,
      });

      // Write PNG to workspace
      await workspace.writeBinaryFile(input.projectId, assetPath, result.buffer);
      generatedFiles.push(assetPath);
      totalCost += COST_PER_IMAGE_USD;

      // Parse dimensions from size string
      const [width, height] = spec.size.split('x').map(Number) as [number, number];
      const variant: AssetVariant = {
        path: assetPath,
        width,
        height,
        purpose: spec.purpose,
      };

      // Categorize into icon or splash arrays
      if (spec.filename.includes('icon')) {
        iconVariants.push(variant);
      } else {
        splashVariants.push(variant);
      }

      ctx.log(`[${HOOK_METADATA.id}]   ✓ ${spec.filename} (${result.buffer.length} bytes)`);
    } catch (error) {
      const errMsg = error instanceof ContentPolicyError
        ? `Content policy rejected prompt for ${spec.filename}: ${(error as Error).message}`
        : `Failed to generate ${spec.filename}: ${(error as Error).message}`;

      errors.push(errMsg);
      ctx.log(`[${HOOK_METADATA.id}]   ✗ ${spec.filename}: ${(error as Error).message}`);

      // Continue with remaining assets (partial success is better than total failure)
    }
  }

  // Build AssetSet if any files were generated
  const assets: AssetSet | null = generatedFiles.length > 0
    ? {
        projectId: input.projectId,
        icon: iconVariants,
        splash: splashVariants,
        screenshots: [], // Not generated in Phase 7
        generatedAt: new Date().toISOString(),
      }
    : null;

  const success = errors.length === 0;
  const output: AssetGeneratorOutput = {
    assets,
    costUsd: totalCost,
    generatedFiles,
    skippedFiles: [],
    errors,
  };

  ctx.log(
    `[${HOOK_METADATA.id}] ${success ? 'Complete' : 'Partial failure'} — ` +
    `${generatedFiles.length}/${ASSET_SPECS.length} assets, cost: $${totalCost.toFixed(3)}`,
  );

  return {
    success,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: output,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    durationMs: Date.now() - start,
  };
}
