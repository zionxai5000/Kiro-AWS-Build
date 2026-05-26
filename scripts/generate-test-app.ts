/**
 * Phase 8.5 — Test App Generation Runner
 *
 * Standalone script that calls LLMService.streamGeneration() directly
 * to produce a full app from the VibeCode-quality prompt.
 *
 * Usage:
 *   npx tsx scripts/generate-test-app.ts
 *
 * Prerequisites:
 *   - AWS CLI configured with access to seraphim/anthropic secret
 *   - node_modules installed (npm install at repo root)
 *
 * Output:
 *   workspaces/meditation-timer-test/
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LLMService } from '../packages/app/src/zionx/app-development/services/llm-service.js';
import type { StreamCallbacks } from '../packages/app/src/zionx/app-development/services/llm-service.js';
import type { CredentialManager } from '../packages/core/src/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const USER_PROMPT =
  'A meditation timer app with breathing exercises, session history, and daily streaks.';

const WORKSPACE_DIR = join(process.cwd(), 'workspaces', 'meditation-timer-test');

// ---------------------------------------------------------------------------
// Credential Retrieval
// ---------------------------------------------------------------------------

function getAnthropicKey(): string {
  const raw = execSync(
    'aws secretsmanager get-secret-value --secret-id "seraphim/anthropic" --region us-east-1 --query "SecretString" --output text',
    { encoding: 'utf-8' },
  ).trim();

  // Secret may be JSON-wrapped — try to parse
  try {
    const parsed = JSON.parse(raw);
    return parsed.apiKey ?? parsed.api_key ?? parsed.key ?? parsed.ANTHROPIC_API_KEY ?? raw;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Minimal CredentialManager
// ---------------------------------------------------------------------------

function createCredentialManager(apiKey: string): CredentialManager {
  return {
    async getCredential(driverName: string, key: string): Promise<string> {
      if (driverName === 'anthropic' && key === 'api-key') {
        return apiKey;
      }
      throw new Error(`Credential not configured in test runner: ${driverName}/${key}`);
    },
    async rotateCredential() {
      return { success: false, driverName: '' };
    },
    async getRotationSchedule() {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Phase 8.5 — VibeCode Test App Generation');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Prompt: "${USER_PROMPT}"`);
  console.log(`  Output: ${WORKSPACE_DIR}`);
  console.log('');

  // Retrieve API key
  console.log('[1/4] Retrieving Anthropic API key from Secrets Manager...');
  const apiKey = getAnthropicKey();
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Failed to retrieve valid Anthropic API key');
  }
  console.log(`       Key retrieved (${apiKey.length} chars).`);

  // Prepare workspace (clean slate)
  console.log('[2/4] Preparing workspace directory...');
  if (existsSync(WORKSPACE_DIR)) {
    rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  }
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  console.log('       Clean workspace created.');

  // Instantiate LLMService
  console.log('[3/4] Initializing LLM service...');
  const credentialManager = createCredentialManager(apiKey);
  const llm = new LLMService({
    credentialManager,
    maxTokens: 32768,
    timeoutMs: 360_000, // 6 min hard cap for expanded prompt
  });
  console.log('       LLM service ready.');

  // Run generation
  console.log('[4/4] Starting generation (streaming)...');
  console.log('');

  let fileCount = 0;
  let totalLines = 0;
  const fileList: string[] = [];
  const startTime = Date.now();

  const callbacks: StreamCallbacks = {
    onToken: () => {
      // Progress dot every 500 chars (visual heartbeat)
      // Handled implicitly by file events below
    },
    onFileStart: (path: string) => {
      fileCount++;
      process.stdout.write(`  [${String(fileCount).padStart(2)}] ${path} `);
    },
    onFileEnd: (path: string, content: string) => {
      // Write file to workspace
      const fullPath = join(WORKSPACE_DIR, path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');

      const lines = content.split('\n').length;
      totalLines += lines;
      fileList.push(path);
      console.log(`(${lines} lines)`);
    },
    onComplete: (files: string[]) => {
      // Final summary handled below
    },
    onError: (error: Error) => {
      console.error(`\n  ERROR: ${error.message}`);
    },
  };

  const result = await llm.streamGeneration(USER_PROMPT, callbacks);

  const elapsedMs = Date.now() - startTime;

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Generation Complete');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Files generated: ${result.files.length}`);
  console.log(`  Total lines:     ${totalLines}`);
  console.log(`  Tokens (in):     ${result.tokensUsed.input}`);
  console.log(`  Tokens (out):    ${result.tokensUsed.output}`);
  console.log(`  Model:           ${result.model}`);
  console.log(`  Duration:        ${(elapsedMs / 1000).toFixed(1)}s`);

  // Cost estimate (Claude Sonnet pricing: $3/M input, $15/M output)
  const costInput = (result.tokensUsed.input / 1_000_000) * 3;
  const costOutput = (result.tokensUsed.output / 1_000_000) * 15;
  const totalCost = costInput + costOutput;
  console.log(`  Est. cost:       $${totalCost.toFixed(4)}`);
  console.log('');
  console.log(`  Output dir: ${WORKSPACE_DIR}`);
  console.log('');

  // File manifest
  console.log('  Files:');
  for (const f of fileList) {
    console.log(`    ${f}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('  Generation FAILED');
  console.error('═══════════════════════════════════════════════════════════');
  console.error(`  ${err.message ?? err}`);
  if (err.stack) {
    console.error('');
    console.error(err.stack);
  }
  process.exit(1);
});
