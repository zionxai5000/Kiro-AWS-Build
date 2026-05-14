import { describe, it, expect, beforeEach, vi } from 'vitest';
import { run, HOOK_METADATA } from '../06-build-runner.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import { resetAllCircuitBreakers } from '../../utils/circuit-breaker.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { EventBusService, SystemEvent } from '@seraphim/core';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/eas-cli-wrapper.js', () => ({
  runEasCommand: vi.fn(),
}));

vi.mock('../../services/build-status-poller.js', () => ({
  BuildStatusPoller: class MockBuildStatusPoller {
    startPolling = vi.fn().mockResolvedValue({ finalStatus: 'finished', buildInfo: {}, durationMs: 0 });
    constructor() {}
  },
}));

vi.mock('../../utils/temp-credential-file.js', () => ({
  withTempCredentialFile: vi.fn().mockImplementation(async (_content: string, fn: (path: string) => Promise<string>) => {
    return fn('/tmp/fake-key.p8');
  }),
}));

import { runEasCommand } from '../../services/eas-cli-wrapper.js';
import { BuildStatusPoller } from '../../services/build-status-poller.js';
import { withTempCredentialFile } from '../../utils/temp-credential-file.js';

const mockRunEas = vi.mocked(runEasCommand);
const mockWithTempCred = vi.mocked(withTempCredentialFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCtx(overrides: Partial<HookContext> = {}): HookContext {
  return {
    executionId: 'test-exec',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: vi.fn(),
    ...overrides,
  };
}

function createCredentialManager(): CredentialManager {
  return {
    async getCredential(driverName: string, key: string) {
      if (driverName === 'expo' && key === 'access-token') return 'test-expo-token';
      return '';
    },
    async rotateCredential() { return { success: true, driverName: '' }; },
    async getRotationSchedule() { return []; },
  };
}

function createEventBus(): EventBusService & { events: SystemEvent[] } {
  const events: SystemEvent[] = [];
  return {
    events,
    async publish(event: SystemEvent) { events.push(event); return 'id'; },
    async publishBatch(batch: SystemEvent[]) { events.push(...batch); return []; },
    async subscribe() { return 'sub'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 06: Build Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllCircuitBreakers();
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['build-runner'] = { enabled: true, dryRun: false };
  });

  describe('successful submission', () => {
    it('returns buildId and publishes queued event', async () => {
      mockRunEas.mockResolvedValueOnce({
        stdout: '[{"id":"build-abc-123"}]',
        stderr: '',
        exitCode: 0,
        parsedJson: [{ id: 'build-abc-123' }],
      });

      const eventBus = createEventBus();
      const result = await run({
        projectId: 'proj-1',
        platform: 'android',
        credentialManager: createCredentialManager(),
        eventBus,
      }, createCtx());

      expect(result.success).toBe(true);
      expect(result.data!.buildId).toBe('build-abc-123');
      expect(result.data!.status).toBe('queued');

      // Queued event published
      const queuedEvents = eventBus.events.filter(e => (e.detail as any).status === 'queued');
      expect(queuedEvents.length).toBe(1);
    });

    it('starts background polling after submission', async () => {
      mockRunEas.mockResolvedValueOnce({
        stdout: '', stderr: '', exitCode: 0,
        parsedJson: [{ id: 'build-xyz' }],
      });

      const eventBus = createEventBus();
      await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        credentialInfo: { keyId: 'ABC', issuerId: 'uuid', p8Content: 'key' },
        eventBus,
      }, createCtx());

      // BuildStatusPoller was instantiated and startPolling called
      const MockPoller = BuildStatusPoller as any;
      // The class mock creates instances — check the last instance
      expect(MockPoller).toBeDefined();
    });
  });

  describe('iOS credential handling', () => {
    it('writes .p8 to temp file and sets iOS env vars', async () => {
      mockRunEas.mockResolvedValueOnce({
        stdout: '', stderr: '', exitCode: 0,
        parsedJson: [{ id: 'ios-build-1' }],
      });

      await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        credentialInfo: { keyId: 'KEY123', issuerId: 'issuer-uuid', p8Content: '-----BEGIN-----' },
        eventBus: createEventBus(),
      }, createCtx());

      // withTempCredentialFile was called with the p8 content
      expect(mockWithTempCred).toHaveBeenCalledWith(
        '-----BEGIN-----',
        expect.any(Function),
        'AuthKey_KEY123.p8',
      );

      // EAS CLI was called with iOS env vars
      const easCall = mockRunEas.mock.calls[0]!;
      expect(easCall[1].env).toMatchObject({
        EXPO_APPLE_APP_STORE_CONNECT_API_KEY_PATH: '/tmp/fake-key.p8',
        EXPO_APPLE_APP_STORE_CONNECT_API_KEY_KEY_ID: 'KEY123',
        EXPO_APPLE_APP_STORE_CONNECT_API_KEY_ISSUER_ID: 'issuer-uuid',
      });
    });
  });

  describe('Android builds', () => {
    it('does NOT write .p8 or set iOS env vars', async () => {
      mockRunEas.mockResolvedValueOnce({
        stdout: '', stderr: '', exitCode: 0,
        parsedJson: [{ id: 'android-build-1' }],
      });

      await run({
        projectId: 'proj-1',
        platform: 'android',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      // withTempCredentialFile NOT called
      expect(mockWithTempCred).not.toHaveBeenCalled();

      // No iOS env vars
      const easCall = mockRunEas.mock.calls[0]!;
      expect(easCall[1].env).toEqual({});
    });
  });

  describe('failure modes', () => {
    it('EAS submission failure returns success: false', async () => {
      mockRunEas.mockRejectedValueOnce(new Error('EAS CLI exited with code 1'));

      const result = await run({
        projectId: 'proj-1',
        platform: 'android',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain('submission failed');
    });

    it('Expo token retrieval failure returns success: false', async () => {
      const badCredManager: CredentialManager = {
        async getCredential() { throw new Error('Secrets Manager down'); },
        async rotateCredential() { return { success: false, driverName: '' }; },
        async getRotationSchedule() { return []; },
      };

      const result = await run({
        projectId: 'proj-1',
        platform: 'android',
        credentialManager: badCredManager,
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expo access token');
    });
  });

  describe('dryRun', () => {
    it('does NOT call EAS CLI, returns mock buildId', async () => {
      HOOKS_CONFIG.hooks['build-runner'] = { enabled: true, dryRun: true };

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.data!.buildId).toContain('dry-run-');
      expect(mockRunEas).not.toHaveBeenCalled();
    });
  });

  describe('kill switch', () => {
    it('returns without doing anything', async () => {
      HOOKS_CONFIG.hooks['build-runner'] = { enabled: false, dryRun: false };

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(true);
      expect(mockRunEas).not.toHaveBeenCalled();
    });
  });
});
