/**
 * E2E Pipeline FULL-LIVE Submission — Phase 9 final verification
 *
 * ALL HOOKS LIVE. Real EAS Build + Real TestFlight Upload.
 * Reuses existing workspace from partial-live test.
 *
 * Cost: ~$10 (EAS Build credit) + ~$0.50 (LLM for store listing)
 * Duration: ~30-45 minutes (EAS Build takes 20-30 min)
 *
 * Usage:
 *   npx tsx scripts/e2e-pipeline-full-live.ts
 *
 * Prerequisites:
 *   - AWS CLI configured with access to all seraphim/* secrets
 *   - node_modules installed
 *   - iPhone available for 2FA if prompted
 *   - Existing workspace: proj-1779820658954-0bc986e3
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import * as readline from 'node:readline';

// MUST import hooks config BEFORE handlers to mutate before first read
import { HOOKS_CONFIG } from '../packages/app/src/zionx/app-development/config/hooks.config.js';

// ALL HOOKS LIVE
HOOKS_CONFIG.hooks['prompt-sanitizer']!.dryRun = false;
HOOKS_CONFIG.hooks['code-generator']!.dryRun = false;
HOOKS_CONFIG.hooks['dependency-validator']!.dryRun = false;
HOOKS_CONFIG.hooks['secret-scanner']!.dryRun = false;
HOOKS_CONFIG.hooks['asset-generator']!.dryRun = false;
HOOKS_CONFIG.hooks['build-preparer']!.dryRun = false;
HOOKS_CONFIG.hooks['build-runner']!.dryRun = false;
HOOKS_CONFIG.hooks['store-listing-writer']!.dryRun = false;
HOOKS_CONFIG.hooks['submission-prep']!.dryRun = false;
// crash-watcher stays dry-run (not needed for submission)

import { createHandlers } from '../packages/app/src/zionx/app-development/api/handlers.js';
import { Workspace } from '../packages/app/src/zionx/app-development/workspace/workspace.js';
import { run as runStoreListingWriter } from '../packages/app/src/zionx/app-development/pipeline/08-store-listing-writer.js';
import type { EventBusService } from '../packages/core/src/interfaces/event-bus-service.js';
import type { CredentialManager } from '../packages/core/src/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REUSE_PROJECT_ID = 'proj-1779820658954-0bc986e3';
const BUILD_POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour max
const BUILD_POLL_INTERVAL_MS = 60 * 1000;     // 60s

// ---------------------------------------------------------------------------
// Credential Retrieval
// ---------------------------------------------------------------------------

function getAnthropicKey(): string {
  const raw = execSync(
    'aws secretsmanager get-secret-value --secret-id "seraphim/anthropic" --region us-east-1 --query "SecretString" --output text',
    { encoding: 'utf-8' },
  ).trim();
  try { const p = JSON.parse(raw); return p.apiKey ?? p.api_key ?? p.key ?? p.ANTHROPIC_API_KEY ?? raw; }
  catch { return raw; }
}

function getOpenAIKey(): string {
  const raw = execSync(
    'aws secretsmanager get-secret-value --secret-id "seraphim/openai" --region us-east-1 --query "SecretString" --output text',
    { encoding: 'utf-8' },
  ).trim();
  try { const p = JSON.parse(raw); return p.apiKey ?? p.api_key ?? p.key ?? p.OPENAI_API_KEY ?? raw; }
  catch { return raw; }
}

function getExpoToken(): string {
  const raw = execSync(
    'aws secretsmanager get-secret-value --secret-id "seraphim/expo" --region us-east-1 --query "SecretString" --output text',
    { encoding: 'utf-8' },
  ).trim();
  // Custom format: {note:...\nEmail:...\naccessToken:XXX}
  const tokenMatch = raw.match(/accessToken[:\s]+([a-zA-Z0-9_-]+)/);
  if (tokenMatch) return tokenMatch[1]!;
  try { const p = JSON.parse(raw); return p.accessToken ?? p.token ?? raw; }
  catch { return raw; }
}

function getAscCredentials(): { apiKey: string; keyId: string; issuerId: string } {
  // Windows CMD mangles PEM newlines in JSON. Use PowerShell script file for clean parsing.
  const scriptPath = join(process.cwd(), 'scripts', '_get-asc.ps1');
  const { writeFileSync, unlinkSync } = require('node:fs') as typeof import('node:fs');
  writeFileSync(scriptPath, `
$r = aws secretsmanager get-secret-value --secret-id "seraphim/appstoreconnect" --region us-east-1 --output json | ConvertFrom-Json
$p = $r.SecretString | ConvertFrom-Json
@{ keyId = $p.keyId; issuerId = $p.issuerId; apiKey = $p.apiKey } | ConvertTo-Json -Compress
`);
  try {
    const raw = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();
    const parsed = JSON.parse(raw);
    return { apiKey: parsed.apiKey, keyId: parsed.keyId, issuerId: parsed.issuerId };
  } finally {
    try { unlinkSync(scriptPath); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Credential Manager (all real keys)
// ---------------------------------------------------------------------------

function createRealCredentialManager(
  anthropicKey: string,
  openaiKey: string,
  expoToken: string,
  asc: { apiKey: string; keyId: string; issuerId: string },
): CredentialManager {
  return {
    async getCredential(driverName: string, key: string): Promise<string> {
      if (driverName === 'anthropic' && key === 'api-key') return anthropicKey;
      if (driverName === 'openai' && key === 'api-key') return openaiKey;
      if (driverName === 'expo' && key === 'access-token') return expoToken;
      if (driverName === 'appstore-connect' && key === 'api-key') return asc.apiKey;
      if (driverName === 'appstore-connect' && key === 'key-id') return asc.keyId;
      if (driverName === 'appstore-connect' && key === 'issuer-id') return asc.issuerId;
      return 'mock-credential';
    },
    async rotateCredential() { return { success: false, driverName: '' }; },
    async getRotationSchedule() { return []; },
  };
}

// ---------------------------------------------------------------------------
// Mock Dependencies (event bus + watcher — not needed for submission flow)
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  const events: unknown[] = [];
  return {
    async publish(event) { events.push(event); return `evt-${Date.now()}`; },
    async publishBatch(evts) { evts.forEach(e => events.push(e)); return evts.map((_, i) => `evt-batch-${i}`); },
    async subscribe() { return `sub-${Date.now()}`; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  };
}

function createMockWatcherSupervisor() {
  return {
    isHealthy: () => true,
    getWatcher: () => null,
    state: 'healthy' as const,
    start: async () => {},
    stop: async () => {},
    restart: async () => {},
    getSnapshot: () => ({ buildState: () => ({}), save: () => {}, queueSave: () => {}, computeDiff: () => ({ added: [], modified: [], deleted: [], bulk: false }), flushAll: () => {} }),
    onFileEvent: () => {},
  };
}

function createMockAPIRequest(overrides: Partial<{
  method: string; path: string; params: Record<string, string>; body: unknown;
}>) {
  return {
    method: overrides.method ?? 'POST',
    path: overrides.path ?? '/',
    params: overrides.params ?? {},
    query: {},
    body: overrides.body ?? null,
    headers: {},
    tenantId: 'test-tenant',
    userId: 'test-user',
    role: 'admin',
  } as any;
}

// ---------------------------------------------------------------------------
// Stage Runner
// ---------------------------------------------------------------------------

interface StageResult {
  name: string;
  pass: boolean;
  duration: number;
  data?: unknown;
  error?: string;
}

async function runStage(name: string, fn: () => Promise<StageResult['data']>): Promise<StageResult> {
  const start = Date.now();
  try {
    const data = await fn();
    return { name, pass: true, duration: Date.now() - start, data };
  } catch (err: any) {
    return { name, pass: false, duration: Date.now() - start, error: err.message };
  }
}

function printStage(result: StageResult) {
  const icon = result.pass ? '✓' : '✗';
  const durationStr = result.duration > 1000
    ? `${(result.duration / 1000).toFixed(1)}s`
    : `${result.duration}ms`;
  console.log(`  ${icon} ${result.name} (${durationStr})`);
  if (!result.pass) {
    console.log(`    ERROR: ${result.error}`);
  } else if (result.data) {
    const summary = JSON.stringify(result.data);
    if (summary.length < 150) {
      console.log(`    → ${summary}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  E2E Pipeline FULL-LIVE Submission');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ALL HOOKS LIVE — Real EAS Build + Real TestFlight Upload');
  console.log(`  Project: ${REUSE_PROJECT_ID}`);
  console.log('  App name: testapplication5.26.2.26');
  console.log('  Bundle: com.zionx.factorytest-6dd7e3c7');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('  WARNING: This will burn 1 EAS Build credit (~$10).');
  console.log('  WARNING: This creates a PERMANENT ASC entity on your Apple account.');
  console.log('  WARNING: Apple 2FA codes may be required during build.');
  console.log('');

  // Setup credentials
  console.log('[setup] Retrieving credentials...');
  const anthropicKey = getAnthropicKey();
  const openaiKey = getOpenAIKey();
  const expoToken = getExpoToken();
  const asc = getAscCredentials();
  console.log(`[setup] Anthropic: ${anthropicKey.length} chars`);
  console.log(`[setup] OpenAI: ${openaiKey.length} chars`);
  console.log(`[setup] Expo: ${expoToken.length} chars`);
  console.log(`[setup] ASC: keyId=${asc.keyId}, issuerId=${asc.issuerId}, apiKey=${asc.apiKey.length} chars`);

  // Set EXPO_TOKEN env var for EAS CLI subprocess calls
  process.env.EXPO_TOKEN = expoToken;

  // Create deps
  const eventBus = createMockEventBus();
  const watcherSupervisor = createMockWatcherSupervisor();
  const workspace = new Workspace();
  const credentialManager = createRealCredentialManager(anthropicKey, openaiKey, expoToken, asc);
  const handlers = createHandlers({
    eventBus: eventBus as any,
    watcherSupervisor: watcherSupervisor as any,
    workspace,
    credentialManager: credentialManager as any,
  });

  const projectId = REUSE_PROJECT_ID;
  console.log(`[setup] Using existing workspace: ${projectId}`);
  console.log('');

  // -------------------------------------------------------------------------
  // STAGE 5: Build Project (LIVE — Hook 5 prep + Hook 6 runner)
  // -------------------------------------------------------------------------
  const stage5 = await runStage('5. buildProject (LIVE)', async () => {
    const res = await handlers.buildProject(createMockAPIRequest({
      params: { id: projectId },
      body: { platform: 'ios' },
    }));

    if (res.statusCode !== 200) {
      throw new Error(`Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }

    const body = res.body as { buildId?: string; status?: string };
    return { statusCode: res.statusCode, buildId: body.buildId, status: body.status };
  });
  printStage(stage5);

  if (!stage5.pass) {
    console.error('FATAL: Build submission failed. Cannot continue.');
    process.exit(1);
  }

  const buildId = (stage5.data as any).buildId as string;
  console.log('');
  console.log(`  EAS Build ID: ${buildId}`);
  console.log('  Track at: https://expo.dev/accounts/zionxai/builds');
  console.log('');

  // -------------------------------------------------------------------------
  // STAGE 6: Build Status Polling (~20-30 min)
  // -------------------------------------------------------------------------
  console.log('  Polling EAS Build status every 60s. Build typically takes 20-30 min...');
  console.log('');

  const buildStartTime = Date.now();
  let buildStatus: string = 'in_queue';
  let buildArtifactUrl: string | null = null;

  while ((Date.now() - buildStartTime) < BUILD_POLL_TIMEOUT_MS) {
    try {
      const result = execSync(
        `eas build:view ${buildId} --json --non-interactive`,
        { encoding: 'utf-8', env: { ...process.env, EXPO_TOKEN: expoToken }, timeout: 30_000 },
      );
      const build = JSON.parse(result);
      buildStatus = build.status;
      const elapsedMin = Math.floor((Date.now() - buildStartTime) / 60000);
      console.log(`  [${elapsedMin}min] Build status: ${buildStatus}`);

      if (buildStatus === 'finished') {
        buildArtifactUrl = build.artifacts?.buildUrl ?? null;
        console.log(`  ✓ Build complete! Artifact: ${buildArtifactUrl}`);
        break;
      } else if (buildStatus === 'errored' || buildStatus === 'canceled') {
        throw new Error(`Build ${buildStatus}: ${build.error?.message ?? 'unknown'}`);
      }
    } catch (err: any) {
      if (err.message?.includes('Build errored') || err.message?.includes('canceled')) {
        console.error(`  ✗ Build failed: ${err.message}`);
        process.exit(1);
      }
      const elapsedMin = Math.floor((Date.now() - buildStartTime) / 60000);
      console.log(`  [${elapsedMin}min] Poll error (retrying): ${err.message?.slice(0, 80)}`);
    }

    await new Promise(resolve => setTimeout(resolve, BUILD_POLL_INTERVAL_MS));
  }

  if (buildStatus !== 'finished') {
    console.error(`FATAL: Build did not finish within ${BUILD_POLL_TIMEOUT_MS / 60000} min. Last status: ${buildStatus}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STAGE 8: Store Listing Writer (LIVE) — create ASC entity
  // -------------------------------------------------------------------------
  console.log('');
  console.log('  Creating ASC app entity + uploading metadata...');
  console.log('  This may take 1-2 minutes...');
  console.log('');

  const stage8 = await runStage('8. storeListingWriter (LIVE)', async () => {
    const result = await runStoreListingWriter(
      {
        projectId,
        appName: 'testapplication5.26.2.26',
        appDescription: 'A meditation timer app with breathing exercises, session history, and daily streaks.',
        credentialManager,
      } as any,
      {
        executionId: `e2e-listing-${Date.now()}`,
        dryRun: false,
        startedAt: new Date().toISOString(),
        log: (msg: string) => console.log(`    [hook8] ${msg}`),
      },
    );

    if (!result.success) {
      throw new Error(`Hook 8 failed: ${result.error ?? JSON.stringify(result.data)}`);
    }

    return {
      ascAppId: (result.data as any)?.ascAppId ?? null,
      hasListing: (result.data as any)?.listing != null,
      screenshotsUploaded: (result.data as any)?.screenshotsGenerated ?? 0,
    };
  });
  printStage(stage8);

  if (!stage8.pass) {
    console.error('FATAL: Store listing failed. Cannot submit without ASC app entity.');
    console.error('Check error above. Build is preserved at buildId: ' + buildId);
    process.exit(1);
  }

  const ascAppId = (stage8.data as any)?.ascAppId;
  console.log(`  ASC App ID: ${ascAppId}`);
  console.log('');

  // -------------------------------------------------------------------------
  // STAGE 9: Submission Prep (LIVE) — validate checklist
  // -------------------------------------------------------------------------
  console.log('');
  const stage9 = await runStage('9. submissionPrep (LIVE)', async () => {
    const res = await handlers.prepareSubmission(createMockAPIRequest({
      params: { id: projectId },
      body: { platform: 'ios' },
    }));
    return { statusCode: res.statusCode, body: res.body };
  });
  printStage(stage9);

  // -------------------------------------------------------------------------
  // CONFIRMATION GATE
  // -------------------------------------------------------------------------
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PRE-SUBMISSION CHECKLIST');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Build ID:    ${buildId}`);
  console.log(`  Artifact:    ${buildArtifactUrl}`);
  console.log(`  ASC App ID:  ${ascAppId}`);
  console.log(`  Bundle ID:   com.zionx.factorytest-6dd7e3c7`);
  console.log(`  App name:    testapplication5.26.2.26`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Type "CONFIRM" to submit to TestFlight, "ABORT" to cancel: ', (ans: string) => {
      rl.close();
      resolve(ans.trim().toUpperCase());
    });
  });

  if (answer !== 'CONFIRM') {
    console.log('');
    console.log('Submission ABORTED by user. Workspace and EAS Build preserved.');
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // STAGE FINAL: TestFlight Upload via eas submit
  // -------------------------------------------------------------------------
  console.log('');
  console.log('  Submitting to TestFlight via eas submit...');
  console.log('  This may take 5-10 minutes for Apple to process.');
  console.log('');

  const stageFinal = await runStage('FINAL. easSubmit (LIVE)', async () => {
    const projectPath = workspace.getProjectPath(projectId);
    const result = execSync(
      `eas submit --platform ios --latest --non-interactive`,
      {
        encoding: 'utf-8',
        cwd: projectPath,
        env: { ...process.env, EXPO_TOKEN: expoToken },
        timeout: 600_000, // 10 min
      },
    );
    return { output: result.slice(-500) }; // last 500 chars of output
  });
  printStage(stageFinal);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  if (stageFinal.pass) {
    console.log('  ✓ Submission triggered successfully!');
    console.log('  Check TestFlight in 5-10 min on your iPhone.');
    console.log('  Apple ID for TestFlight: eftn87@gmail.com');
  } else {
    console.log('  ✗ Submission failed. Check error above.');
  }
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(stageFinal.pass ? 0 : 1);
}

main().catch((err) => {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('  E2E Full-Live Test FATAL ERROR');
  console.error('═══════════════════════════════════════════════════════════');
  console.error(`  ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
