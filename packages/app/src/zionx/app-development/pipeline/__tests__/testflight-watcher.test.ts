/**
 * Tests for Hook 10b: TestFlight Watcher
 *
 * Validates that the watcher:
 * - Skips cleanly for non-iOS platforms
 * - Emits TESTFLIGHT_PROCESSING/READY/INVALID events on state transitions
 * - Persists a structured log to the workspace
 * - Stops polling once a terminal state (VALID/INVALID/FAILED) is reached
 * - Handles ASC API errors without throwing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../10b-testflight-watcher.js';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindAscBuildByVersion = vi.fn();
vi.mock('../../services/apple-credentials/asc-app-client.js', () => ({
  findAscBuildByVersion: (...args: unknown[]) => mockFindAscBuildByVersion(...args),
}));

const mockSignAscJwt = vi.fn().mockReturnValue('fake.jwt.token');
vi.mock('../../services/apple-credentials/asc-jwt.js', () => ({
  signAscJwt: (...args: unknown[]) => mockSignAscJwt(...args),
}));

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class {
    writeFile = mockWriteFile;
  },
}));

let killSwitch = false;
let dryRunOverride = false;
vi.mock('../../config/hooks.config.js', () => ({
  isHookEnabled: () => !killSwitch,
  isHookDryRun: () => dryRunOverride,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): HookContext {
  return {
    executionId: 'exec-watcher',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: () => {},
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'proj-1',
    platform: 'ios' as const,
    easBuildId: 'eas-build-xyz',
    ascAppId: '6773520429',
    appVersion: '1.0.0',
    buildNumber: '4',
    credentialManager: {
      getCredential: vi.fn(async (provider: string, key: string) => {
        if (provider === 'appstore-connect' && key === 'key-id') return 'KEY';
        if (provider === 'appstore-connect' && key === 'issuer-id') return 'ISSUER';
        if (provider === 'appstore-connect' && key === 'api-key') return '-----BEGIN-----\n-----END-----';
        return '';
      }),
    } as any,
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) } as any,
    tenantId: 'tenant-1',
    pollIntervalMs: 1, // poll fast in tests
    maxWaitMs: 1000,   // bound the loop
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  killSwitch = false;
  dryRunOverride = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 10b: TestFlight Watcher — metadata', () => {
  it('declares notify failure mode and supports concurrent runs', () => {
    expect(HOOK_METADATA.id).toBe('testflight-watcher');
    expect(HOOK_METADATA.failureMode).toBe('notify');
    expect(HOOK_METADATA.maxConcurrent).toBeGreaterThan(1);
  });
});

describe('Hook 10b: TestFlight Watcher — gating', () => {
  it('kill switch disabled → returns empty result, does not poll', async () => {
    killSwitch = true;
    const result = await run(makeInput(), makeCtx());
    expect(result.data?.history).toHaveLength(0);
    expect(mockFindAscBuildByVersion).not.toHaveBeenCalled();
  });

  it('dry run → returns empty result, does not poll', async () => {
    dryRunOverride = true;
    const result = await run(makeInput(), makeCtx());
    expect(result.data?.history).toHaveLength(0);
    expect(mockFindAscBuildByVersion).not.toHaveBeenCalled();
  });

  it('android platform → skipped: true (not yet supported)', async () => {
    const result = await run(makeInput({ platform: 'android' }), makeCtx());
    expect(result.data?.skipped).toBe(true);
  });

  it('missing ascAppId → fails fast with success: false', async () => {
    const result = await run(makeInput({ ascAppId: undefined }), makeCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('ascAppId');
  });
});

describe('Hook 10b: TestFlight Watcher — state transitions', () => {
  it('terminates on VALID with TESTFLIGHT_READY event', async () => {
    mockFindAscBuildByVersion.mockResolvedValueOnce({
      buildId: 'asc-build-1',
      version: '4',
      appVersion: '1.0.0',
      processingState: 'VALID',
      uploadedDate: '2026-05-27T00:00:00Z',
      expirationDate: null,
      usesNonExemptEncryption: null,
      betaReviewState: 'BETA_APPROVED',
    });

    const input = makeInput();
    const result = await run(input, makeCtx());

    expect(result.data?.finalState).toBe('VALID');
    expect(result.data?.history).toHaveLength(1);
    expect(result.data?.buildFoundOnApple).toBe(true);
    // emitted exactly one event
    expect(input.eventBus.publish).toHaveBeenCalledTimes(1);
    // persisted log
    expect(mockWriteFile).toHaveBeenCalledWith(
      'proj-1',
      'submission-logs/eas-build-xyz.json',
      expect.any(String),
    );
  });

  it('terminates on INVALID with TESTFLIGHT_INVALID event and errorMessage', async () => {
    mockFindAscBuildByVersion.mockResolvedValueOnce({
      buildId: 'asc-build-bad',
      version: '4',
      appVersion: '1.0.0',
      processingState: 'INVALID',
      uploadedDate: '2026-05-27T00:00:00Z',
      expirationDate: null,
      usesNonExemptEncryption: null,
      betaReviewState: 'BETA_REJECTED',
    });

    const input = makeInput();
    const result = await run(input, makeCtx());

    expect(result.data?.finalState).toBe('INVALID');
    expect(result.data?.history[0]?.errorMessage).toMatch(/INVALID/);
    expect(input.eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('records each distinct snapshot in history', async () => {
    // Sequence: PROCESSING → VALID
    mockFindAscBuildByVersion
      .mockResolvedValueOnce({
        buildId: 'asc-build-1',
        version: '4',
        appVersion: '1.0.0',
        processingState: 'PROCESSING',
        uploadedDate: '2026-05-27T00:00:00Z',
        expirationDate: null,
        usesNonExemptEncryption: null,
        betaReviewState: null,
      })
      .mockResolvedValueOnce({
        buildId: 'asc-build-1',
        version: '4',
        appVersion: '1.0.0',
        processingState: 'VALID',
        uploadedDate: '2026-05-27T00:00:00Z',
        expirationDate: null,
        usesNonExemptEncryption: null,
        betaReviewState: null,
      });

    const result = await run(makeInput(), makeCtx());

    expect(result.data?.history.length).toBeGreaterThanOrEqual(2);
    expect(result.data?.history[0]?.processingState).toBe('PROCESSING');
    expect(result.data?.history[result.data.history.length - 1]?.processingState).toBe('VALID');
  });
});

describe('Hook 10b: TestFlight Watcher — error tolerance', () => {
  it('ASC API error during poll → captured as UNKNOWN snapshot, watcher does not throw', async () => {
    mockFindAscBuildByVersion.mockRejectedValue(new Error('rate limited'));

    const result = await run(makeInput({ maxWaitMs: 50, pollIntervalMs: 10 }), makeCtx());

    // We never reached a terminal state, but we recorded an UNKNOWN snapshot.
    expect(result.success).toBe(true);
    expect(result.data?.history.length).toBeGreaterThan(0);
    expect(result.data?.history[0]?.processingState).toBe('UNKNOWN');
    expect(result.data?.history[0]?.errorMessage).toMatch(/rate limited/);
  });
});
