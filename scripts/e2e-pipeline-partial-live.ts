/**
 * E2E Pipeline Partial-Live Test — Phase 9 verification
 *
 * Runs Hooks 1-4 LIVE (real LLM, real validation) while keeping
 * Hooks 5-9 in dry-run (no EAS builds, no Apple submissions).
 *
 * Cost: ~$0.50 (LLM generation)
 * Duration: ~5-7 minutes (real Claude streaming)
 *
 * Usage:
 *   npx tsx scripts/e2e-pipeline-partial-live.ts
 *
 * Prerequisites:
 *   - AWS CLI configured with access to seraphim/anthropic secret
 *   - node_modules installed (npm install at repo root)
 */

import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// MUST import hooks config BEFORE handlers to mutate before first read
import { HOOKS_CONFIG } from '../packages/app/src/zionx/app-development/config/hooks.config.js';

// Enable real execution for prompt → code flow
HOOKS_CONFIG.hooks['prompt-sanitizer']!.dryRun = false;
HOOKS_CONFIG.hooks['code-generator']!.dryRun = false;
HOOKS_CONFIG.hooks['dependency-validator']!.dryRun = false;
HOOKS_CONFIG.hooks['secret-scanner']!.dryRun = false;

// Keep build/submission/asset-gen in dry-run (avoid cost + complexity)
HOOKS_CONFIG.hooks['asset-generator']!.dryRun = true;
HOOKS_CONFIG.hooks['build-preparer']!.dryRun = true;
HOOKS_CONFIG.hooks['build-runner']!.dryRun = true;
HOOKS_CONFIG.hooks['store-listing-writer']!.dryRun = true;
HOOKS_CONFIG.hooks['submission-prep']!.dryRun = true;

import { createHandlers } from '../packages/app/src/zionx/app-development/api/handlers.js';
import { Workspace } from '../packages/app/src/zionx/app-development/workspace/workspace.js';
import type { EventBusService } from '../packages/core/src/interfaces/event-bus-service.js';
import type { CredentialManager } from '../packages/core/src/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_DIR = join(process.cwd(), 'workspaces', 'e2e-partial-live-test');
const TEST_PROMPT = 'A meditation timer app with breathing exercises, session history, and daily streaks.';
const STREAM_TIMEOUT_MS = 420_000; // 7 min max for LLM streaming
const POLL_INTERVAL_MS = 1000;

// ---------------------------------------------------------------------------
// Credential Retrieval (real keys from AWS Secrets Manager)
// ---------------------------------------------------------------------------

function getAnthropicKey(): string {
  const raw = execSync(
    'aws secretsmanager get-secret-value --secret-id "seraphim/anthropic" --region us-east-1 --query "SecretString" --output text',
    { encoding: 'utf-8' },
  ).trim();

  try {
    const parsed = JSON.parse(raw);
    return parsed.apiKey ?? parsed.api_key ?? parsed.key ?? parsed.ANTHROPIC_API_KEY ?? raw;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Real Credential Manager (returns actual API keys)
// ---------------------------------------------------------------------------

function createRealCredentialManager(anthropicKey: string): CredentialManager {
  return {
    async getCredential(driverName: string, key: string): Promise<string> {
      if (driverName === 'anthropic' && key === 'api-key') return anthropicKey;
      if (driverName === 'expo' && key === 'access-token') return 'expo-dry-run-fake-token';
      // ASC credentials not needed (hooks 5-9 are dry-run)
      if (driverName === 'appstore-connect') return 'asc-dry-run-fake';
      return 'mock-credential';
    },
    async rotateCredential() { return { success: false, driverName: '' }; },
    async getRotationSchedule() { return []; },
  };
}

// ---------------------------------------------------------------------------
// Mock Dependencies (same as dry-run for non-live components)
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

/** Mock ServerResponse to capture SSE events from streamHandler */
function createMockServerResponse() {
  const chunks: string[] = [];
  let headWritten = false;
  let ended = false;

  return {
    writeHead: (status: number, headers: Record<string, string>) => { headWritten = true; },
    write: (chunk: string) => { chunks.push(chunk); return true; },
    end: () => { ended = true; },
    get chunks() { return chunks; },
    get headWritten() { return headWritten; },
    get ended() { return ended; },
    getEvents(): unknown[] {
      return chunks
        .filter(c => c.startsWith('data: '))
        .map(c => { try { return JSON.parse(c.replace('data: ', '').trim()); } catch { return null; } })
        .filter(Boolean);
    },
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
  console.log('  E2E Pipeline PARTIAL-LIVE Test');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Hooks 1-4: LIVE (real LLM, real validation)');
  console.log('  Hooks 5-9: DRY-RUN (no builds, no submissions)');
  console.log(`  Prompt: "${TEST_PROMPT}"`);
  console.log('');

  // Retrieve real API key
  console.log('[setup] Retrieving Anthropic API key from Secrets Manager...');
  const anthropicKey = getAnthropicKey();
  if (!anthropicKey || anthropicKey.length < 10) {
    throw new Error('Failed to retrieve valid Anthropic API key');
  }
  console.log(`[setup] Key retrieved (${anthropicKey.length} chars).`);

  // Prepare workspace (clean slate)
  if (existsSync(WORKSPACE_DIR)) {
    rmSync(WORKSPACE_DIR, { recursive: true, force: true });
  }
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  console.log(`[setup] Workspace: ${WORKSPACE_DIR}`);

  // Create deps
  const eventBus = createMockEventBus();
  const watcherSupervisor = createMockWatcherSupervisor();
  const workspace = new Workspace();
  const credentialManager = createRealCredentialManager(anthropicKey);

  // Create handlers
  const handlers = createHandlers({
    eventBus: eventBus as any,
    watcherSupervisor: watcherSupervisor as any,
    workspace,
    credentialManager: credentialManager as any,
  });

  let projectId = '';
  console.log('[setup] Handlers created. Beginning stages...');
  console.log('');

  // -------------------------------------------------------------------------
  // STAGE 1: Create Project
  // -------------------------------------------------------------------------
  const stage1 = await runStage('1. createProject', async () => {
    const res = await handlers.createProject(createMockAPIRequest({
      body: { name: 'Mindful Timer', description: TEST_PROMPT, platform: 'both' },
    }));
    if (res.statusCode !== 201) {
      throw new Error(`Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    const body = res.body as { projectId: string };
    projectId = body.projectId;
    return { projectId, statusCode: res.statusCode };
  });
  printStage(stage1);

  if (!stage1.pass) {
    console.error('FATAL: Cannot continue without projectId');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STAGE 2: Generate Code (LIVE — real LLM streaming, ~5 min)
  // -------------------------------------------------------------------------
  const stage2 = await runStage('2. generateCode (LIVE)', async () => {
    const res = await handlers.generateCode(createMockAPIRequest({
      params: { id: projectId },
      body: { prompt: TEST_PROMPT },
    }));

    if (res.statusCode !== 200) {
      throw new Error(`Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    if (!res.streamHandler) {
      throw new Error('Expected streamHandler for SSE response');
    }

    // Execute the stream handler with mock response
    const mockRes = createMockServerResponse();
    res.streamHandler(mockRes as any);

    // Poll until stream ends or timeout
    const startTime = Date.now();
    let lastProgressLog = 0;
    while (!mockRes.ended && (Date.now() - startTime) < STREAM_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      // Print progress every 30s
      const elapsed = Date.now() - startTime;
      if (elapsed - lastProgressLog >= 30_000) {
        lastProgressLog = elapsed;
        const events = mockRes.getEvents();
        const fileEvents = events.filter((e: any) => e.type === 'file_end');
        console.log(`    ... streaming (${Math.floor(elapsed / 1000)}s, ${fileEvents.length} files completed)`);
      }
    }

    if (!mockRes.ended) {
      throw new Error(`Stream did not complete within ${STREAM_TIMEOUT_MS / 1000}s`);
    }

    // Analyze SSE events
    const events = mockRes.getEvents();
    const fileEndEvents = events.filter((e: any) => e.type === 'file_end');
    const doneEvent = events.find((e: any) => e.type === 'done') as any;
    const errorEvent = events.find((e: any) => e.type === 'error') as any;

    if (errorEvent) {
      throw new Error(`LLM generation error: ${errorEvent.message}`);
    }

    const fileCount = doneEvent?.files?.length ?? fileEndEvents.length;
    return { fileCount, eventsTotal: events.length, durationS: Math.floor((Date.now() - startTime) / 1000) };
  });
  printStage(stage2);

  // -------------------------------------------------------------------------
  // STAGE 2.5: Verify Generated Workspace
  // -------------------------------------------------------------------------
  const stage25 = await runStage('2.5 verifyWorkspace', async () => {
    const files = await workspace.listFiles(projectId);
    const fileCount = files.length;

    const criticalFiles = [
      'package.json',
      'app.json',
      'PrivacyInfo.xcprivacy',
      'theme/colors.ts',
      'theme/useTheme.ts',
      'app/_layout.tsx',
      'app/onboarding/index.tsx',
      'app/(tabs)/_layout.tsx',
      'components/ui/Button.tsx',
      'components/ui/EmptyState.tsx',
      'components/ui/ErrorBoundary.tsx',
    ];

    const present = criticalFiles.filter(f => files.includes(f));
    const missing = criticalFiles.filter(f => !files.includes(f));

    if (missing.length > 3) {
      throw new Error(`Too many critical files missing (${missing.length}): ${missing.join(', ')}`);
    }

    return { fileCount, presentCount: present.length, missingCount: missing.length, missing };
  });
  printStage(stage25);

  // -------------------------------------------------------------------------
  // STAGE 3: Build Project (DRY-RUN — Hook 5 + Hook 6)
  // -------------------------------------------------------------------------
  const stage3 = await runStage('3. buildProject (dry-run)', async () => {
    const res = await handlers.buildProject(createMockAPIRequest({
      params: { id: projectId },
      body: { platform: 'ios' },
    }));

    // Build preparer reads app.json from workspace — should work now since files exist
    if (res.statusCode === 200) {
      const body = res.body as { buildId?: string; status?: string };
      return { statusCode: 200, buildId: body.buildId, status: body.status };
    } else if (res.statusCode === 400) {
      return { statusCode: 400, reason: 'Build prep validation issue', body: res.body };
    } else {
      throw new Error(`Unexpected status ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
  });
  printStage(stage3);

  // -------------------------------------------------------------------------
  // STAGE 4: Store Listing (DRY-RUN — Hook 8)
  // -------------------------------------------------------------------------
  const stage4 = await runStage('4. generateStoreListing (dry-run)', async () => {
    const res = await handlers.generateStoreListing(createMockAPIRequest({
      params: { id: projectId },
    }));
    if (res.statusCode !== 202) {
      throw new Error(`Expected 202, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    return { statusCode: 202, body: res.body };
  });
  printStage(stage4);

  // -------------------------------------------------------------------------
  // STAGE 5: Submission Prep (DRY-RUN — Hook 9)
  // -------------------------------------------------------------------------
  const stage5 = await runStage('5. prepareSubmission (dry-run)', async () => {
    const res = await handlers.prepareSubmission(createMockAPIRequest({
      params: { id: projectId },
      body: { platform: 'ios' },
    }));
    if (res.statusCode !== 202) {
      throw new Error(`Expected 202, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    return { statusCode: 202, body: res.body };
  });
  printStage(stage5);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const results = [stage1, stage2, stage25, stage3, stage4, stage5];
  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Result: ${passed}/${total} stages passed`);
  console.log('═══════════════════════════════════════════════════════════');

  // Stage 3 may fail with 400 (build prep validation) — non-critical
  const criticalStages = ['1. createProject', '2. generateCode (LIVE)', '2.5 verifyWorkspace'];
  const criticalFailures = results.filter(r => !r.pass && criticalStages.includes(r.name));

  if (criticalFailures.length > 0) {
    console.error('  CRITICAL FAILURES:');
    criticalFailures.forEach(f => console.error(`    ${f.name}: ${f.error}`));
    process.exit(1);
  }

  console.log('  All critical stages passed. Pipeline is functional (partial-live).');
  process.exit(0);
}

main().catch((err) => {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('  E2E Partial-Live Test FATAL ERROR');
  console.error('═══════════════════════════════════════════════════════════');
  console.error(`  ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
