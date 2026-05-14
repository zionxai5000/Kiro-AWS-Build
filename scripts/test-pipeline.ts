#!/usr/bin/env npx tsx
/**
 * SeraphimOS — App Development Pipeline CLI Test Harness
 *
 * Developer tool for running the pipeline end-to-end from the command line.
 * NOT for production — lives in scripts/, developer-only.
 *
 * Usage:
 *   npx tsx scripts/test-pipeline.ts --prompt "A fitness tracker app" --project-id test-001
 *   npx tsx scripts/test-pipeline.ts --prompt "A recipe sharing app" --project-id test-002 --build
 *
 * Flags:
 *   --prompt <text>       Required. The app description to generate.
 *   --project-id <id>     Required. Project ID for workspace isolation.
 *   --build               Optional. Run Hook 5 + Hook 6 after generation.
 *   --skip-generation     Optional. Skip code generation (Hook 2), run only post-gen hooks.
 *   --dry-run             Optional. All hooks run in dry-run mode (no real API calls).
 */

import { randomUUID } from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Pipeline imports — these resolve via tsx's TypeScript loader
import { HOOKS_CONFIG } from '../packages/app/src/zionx/app-development/config/hooks.config.js';
import { run as runCodeGenerator } from '../packages/app/src/zionx/app-development/pipeline/02-code-generator.js';
import { run as runDependencyValidator } from '../packages/app/src/zionx/app-development/pipeline/03-dependency-validator.js';
import { run as runSecretScanner } from '../packages/app/src/zionx/app-development/pipeline/04-secret-scanner.js';
import { run as runBuildPreparer } from '../packages/app/src/zionx/app-development/pipeline/05-build-preparer.js';
import { run as runBuildRunner } from '../packages/app/src/zionx/app-development/pipeline/06-build-runner.js';
import { run as runAssetGenerator } from '../packages/app/src/zionx/app-development/pipeline/07-asset-generator.js';
import { Workspace } from '../packages/app/src/zionx/app-development/workspace/workspace.js';
import type { CredentialManager } from '../packages/core/src/interfaces/credential-manager.js';
import type { HookContext } from '../packages/app/src/zionx/app-development/pipeline/types.js';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(): { prompt: string; projectId: string; build: boolean; skipGeneration: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  let prompt = '';
  let projectId = '';
  let build = false;
  let skipGeneration = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--prompt':
        prompt = args[++i] ?? '';
        break;
      case '--project-id':
        projectId = args[++i] ?? '';
        break;
      case '--build':
        build = true;
        break;
      case '--skip-generation':
        skipGeneration = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
    }
  }

  if (!prompt && !skipGeneration) {
    console.error('Usage: npx tsx scripts/test-pipeline.ts --prompt "<text>" --project-id <id> [--build] [--dry-run]');
    process.exit(1);
  }
  if (!projectId) {
    projectId = `cli-${Date.now()}`;
    console.log(`⚡ No --project-id specified, using: ${projectId}`);
  }

  return { prompt, projectId, build, skipGeneration, dryRun };
}

// ---------------------------------------------------------------------------
// Credential Manager (Secrets Manager-backed for CLI)
// ---------------------------------------------------------------------------

class CLICredentialManager implements CredentialManager {
  private cache = new Map<string, string>();
  private smClient = new SecretsManagerClient({ region: 'us-east-1' });

  private readonly secretMap: Record<string, string> = {
    'anthropic:api-key': 'seraphim/anthropic',
    'openai:api-key': 'seraphim/openai',
    'expo:access-token': 'seraphim/expo',
    'appstore-connect:api-key': 'seraphim/appstoreconnect',
    'appstore-connect:key-id': 'seraphim/appstoreconnect',
    'appstore-connect:issuer-id': 'seraphim/appstoreconnect',
  };

  async getCredential(driverName: string, credentialKey: string): Promise<string> {
    const cacheKey = `${driverName}:${credentialKey}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const secretId = this.secretMap[cacheKey];
    if (!secretId) {
      throw new Error(`No secret mapping for ${driverName}:${credentialKey}`);
    }

    try {
      const resp = await this.smClient.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );

      if (!resp.SecretString) throw new Error(`Empty secret: ${secretId}`);

      // Try JSON parse first
      try {
        const parsed = JSON.parse(resp.SecretString);
        // For anthropic/openai: { apiKey: "..." }
        if (credentialKey === 'api-key') {
          const value = parsed.apiKey ?? parsed.api_key ?? resp.SecretString;
          this.cache.set(cacheKey, value);
          return value;
        }
        // For appstoreconnect: { keyId, issuerId, apiKey }
        if (credentialKey === 'key-id') {
          this.cache.set(cacheKey, parsed.keyId);
          return parsed.keyId;
        }
        if (credentialKey === 'issuer-id') {
          this.cache.set(cacheKey, parsed.issuerId);
          return parsed.issuerId;
        }
        if (credentialKey === 'access-token') {
          const value = parsed.accessToken ?? parsed.token ?? resp.SecretString;
          this.cache.set(cacheKey, value);
          return value;
        }
        // Fallback
        this.cache.set(cacheKey, resp.SecretString);
        return resp.SecretString;
      } catch {
        // Not JSON — plain string (e.g., expo token)
        this.cache.set(cacheKey, resp.SecretString);
        return resp.SecretString;
      }
    } catch (error) {
      throw new Error(`Failed to load ${secretId}: ${(error as Error).message}`);
    }
  }

  async rotateCredential(): Promise<{ success: false; driverName: string; error: string }> {
    return { success: false, driverName: '', error: 'CLI does not support rotation' };
  }

  async getRotationSchedule(): Promise<[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hook Context Factory
// ---------------------------------------------------------------------------

function createCtx(dryRun: boolean): HookContext {
  return {
    executionId: randomUUID(),
    dryRun,
    startedAt: new Date().toISOString(),
    log: (msg: string) => console.log(`  ${msg}`),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { prompt, projectId, build, skipGeneration, dryRun } = parseArgs();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SeraphimOS — App Development Pipeline CLI');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Project:    ${projectId}`);
  console.log(`  Prompt:     ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`);
  console.log(`  Build:      ${build ? 'YES' : 'no'}`);
  console.log(`  Dry Run:    ${dryRun ? 'YES' : 'no'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Disable dry-run on all hooks for real execution (unless --dry-run flag)
  if (!dryRun) {
    for (const hookId of Object.keys(HOOKS_CONFIG.hooks)) {
      HOOKS_CONFIG.hooks[hookId]!.dryRun = false;
    }
  }

  const credentialManager = new CLICredentialManager();
  const workspace = new Workspace();
  await workspace.ensureProjectDir(projectId);

  const summary = { filesWritten: 0, hooksRun: 0, errors: [] as string[], costEstimate: 0 };

  // ── Hook 2: Code Generation ─────────────────────────────────────────
  if (!skipGeneration) {
    console.log('┌─ Hook 2: Code Generator');
    console.log('│');

    let tokenCount = 0;
    const result = await runCodeGenerator(
      {
        promptId: randomUUID(),
        projectId,
        sanitizedPrompt: prompt,
        credentialManager,
        streamCallbacks: {
          onToken: (text) => {
            process.stdout.write(text);
            tokenCount += text.length;
          },
          onFileStart: (path) => console.log(`\n│  📄 Writing: ${path}`),
          onFileEnd: (path) => console.log(`│  ✅ Done: ${path}`),
          onComplete: (files) => console.log(`│\n│  📦 ${files.length} files generated`),
          onError: (err) => console.error(`│  ❌ Error: ${err.message}`),
        },
      },
      createCtx(dryRun),
    );

    summary.hooksRun++;
    if (result.data) {
      summary.filesWritten += result.data.files.length;
      const tokens = result.data.tokensUsed;
      // Claude Sonnet pricing: ~$3/M input, ~$15/M output
      summary.costEstimate += (tokens.input * 3 + tokens.output * 15) / 1_000_000;
    }
    if (!result.success) summary.errors.push(`Hook 2: ${result.error}`);

    console.log('└─ Hook 2 complete\n');
  }

  // ── Hook 3: Dependency Validator ────────────────────────────────────
  const packageJsonExists = await workspace.exists(projectId, 'package.json');
  if (packageJsonExists) {
    console.log('┌─ Hook 3: Dependency Validator');
    const result = await runDependencyValidator(
      { projectId, packageJsonPath: 'package.json' },
      createCtx(dryRun),
    );
    summary.hooksRun++;
    if (!result.success) summary.errors.push(`Hook 3: ${result.error}`);
    console.log(`└─ Hook 3: ${result.success ? '✅ passed' : '❌ failed'}\n`);
  }

  // ── Hook 4: Secret Scanner ──────────────────────────────────────────
  console.log('┌─ Hook 4: Secret Scanner (scanning all files)');
  const files = await workspace.listFiles(projectId);
  let secretsFound = 0;
  for (const file of files) {
    try {
      const content = await workspace.readFile(projectId, file);
      const result = await runSecretScanner(
        { projectId, filePath: file, content },
        createCtx(dryRun),
      );
      if (result.data && !result.data.clean && !result.data.skipped) {
        secretsFound++;
        console.log(`│  ⚠️  Secret detected in: ${file}`);
      }
    } catch {
      // Skip unreadable files
    }
  }
  summary.hooksRun++;
  console.log(`└─ Hook 4: scanned ${files.length} files, ${secretsFound} warnings\n`);

  // ── Hook 7: Asset Generator ─────────────────────────────────────────
  console.log('┌─ Hook 7: Asset Generator');
  let appName = '';
  try {
    const appJsonContent = await workspace.readFile(projectId, 'app.json');
    const appJson = JSON.parse(appJsonContent);
    appName = appJson?.expo?.name ?? appJson?.name ?? '';
  } catch {
    console.log('│  ⏭️  No app.json found — skipping asset generation');
  }

  if (appName) {
    const result = await runAssetGenerator(
      { projectId, appName, appDescription: prompt.slice(0, 100), credentialManager },
      createCtx(dryRun),
    );
    summary.hooksRun++;
    if (result.data) summary.costEstimate += result.data.costUsd;
    if (!result.success) summary.errors.push(`Hook 7: ${result.error}`);
    console.log(`│  ${result.success ? '✅' : '❌'} ${result.dryRun ? '(dry run)' : ''}`);
  }
  console.log('└─ Hook 7 complete\n');

  // ── Hook 5 + 6: Build (optional) ───────────────────────────────────
  if (build) {
    console.log('┌─ Hook 5: Build Preparer');
    const prepResult = await runBuildPreparer(
      { projectId, platform: 'ios', credentialManager },
      createCtx(dryRun),
    );
    summary.hooksRun++;
    if (!prepResult.success) summary.errors.push(`Hook 5: ${prepResult.error}`);
    console.log(`└─ Hook 5: ${prepResult.success ? '✅' : '❌'}\n`);

    if (prepResult.success && prepResult.data?.ready) {
      console.log('┌─ Hook 6: Build Runner');
      // Build runner needs an event bus — use a no-op stub for CLI
      const stubEventBus = {
        publish: async () => {},
        subscribe: async () => 'stub-sub-id',
        unsubscribe: async () => {},
      };
      const buildResult = await runBuildRunner(
        {
          projectId,
          platform: 'ios',
          credentialManager,
          credentialInfo: prepResult.data.credentialInfo,
          eventBus: stubEventBus as any,
        },
        createCtx(dryRun),
      );
      summary.hooksRun++;
      if (!buildResult.success) summary.errors.push(`Hook 6: ${buildResult.error}`);
      console.log(`└─ Hook 6: ${buildResult.success ? '✅' : '❌'}\n`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Project:        ${projectId}`);
  console.log(`  Files written:  ${summary.filesWritten}`);
  console.log(`  Hooks run:      ${summary.hooksRun}`);
  console.log(`  Cost estimate:  $${summary.costEstimate.toFixed(4)}`);
  console.log(`  Errors:         ${summary.errors.length === 0 ? 'none' : ''}`);
  for (const err of summary.errors) {
    console.log(`    ❌ ${err}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n💥 Pipeline failed:', err.message);
  process.exit(1);
});
