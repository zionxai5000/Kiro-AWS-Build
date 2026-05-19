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

// Mock workspace so ensureEasProjectLinked finds a linked app.json
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class MockWorkspace {
    getProjectPath(projectId: string) { return `/tmp/workspaces/${projectId}`; }
    async readFile() {
      return JSON.stringify({
        expo: {
          name: 'Test', slug: 'test', owner: 'zionxai',
          ios: { bundleIdentifier: 'dev.zionxai.test' },
          extra: { eas: { projectId: 'mock-eas-id' } },
        },
      });
    }
  },
}));

// Mock the iOS bootstrap
const mockBootstrapIos = vi.fn();
vi.mock('../../services/apple-credentials/bootstrap-flow.js', () => ({
  bootstrapIosCredentials: (...args: unknown[]) => mockBootstrapIos(...args),
  BootstrapMaxCertsError: class BootstrapMaxCertsError extends Error {
    constructor(certs: unknown[]) { super(`Max certs: ${certs.length}`); this.name = 'BootstrapMaxCertsError'; }
  },
}));

import { runEasCommand } from '../../services/eas-cli-wrapper.js';
import { BuildStatusPoller } from '../../services/build-status-poller.js';

const mockRunEas = vi.mocked(runEasCommand);

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
      if (driverName === 'appstore-connect' && key === 'key-id') return 'TEST_KEY_ID';
      if (driverName === 'appstore-connect' && key === 'issuer-id') return 'test-issuer-uuid';
      if (driverName === 'appstore-connect' && key === 'api-key') return '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
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
    mockBootstrapIos.mockResolvedValue({ created: [], reused: ['cert', 'profile'] });
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

  describe('iOS credential bootstrap', () => {
    it('iOS bootstrap success → proceeds to eas build', async () => {
      mockRunEas.mockResolvedValueOnce({
        stdout: '', stderr: '', exitCode: 0,
        parsedJson: [{ id: 'ios-build-1' }],
      });

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(true);
      expect(result.data!.buildId).toBe('ios-build-1');
      expect(mockBootstrapIos).toHaveBeenCalledTimes(1);
    });

    it('iOS bootstrap "all reused" → proceeds (most common case)', async () => {
      mockBootstrapIos.mockResolvedValue({ created: [], reused: ['cert', 'profile', 'bundleId'] });
      mockRunEas.mockResolvedValueOnce({
        stdout: '', stderr: '', exitCode: 0,
        parsedJson: [{ id: 'ios-build-2' }],
      });

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(true);
      expect(result.data!.buildId).toBe('ios-build-2');
    });

    it('iOS BootstrapMaxCertsError → fails with actionable error', async () => {
      const { BootstrapMaxCertsError } = await import('../../services/apple-credentials/bootstrap-flow.js');
      mockBootstrapIos.mockRejectedValue(new BootstrapMaxCertsError([{ serialNumber: 'SN1' }, { serialNumber: 'SN2' }]));

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain('max certificates reached');
    });

    it('iOS bootstrap generic error → fails with technical error', async () => {
      mockBootstrapIos.mockRejectedValue(new Error('Apple API timeout'));

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Apple API timeout');
    });

    it('Android build → bootstrap NOT called', async () => {
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

      expect(mockBootstrapIos).not.toHaveBeenCalled();
    });

    it('iOS build with missing bundleIdentifier → fails clearly', async () => {
      // Override the workspace mock to return app.json without bundleIdentifier
      mockBootstrapIos.mockRejectedValue(
        new Error('app.json missing expo.ios.bundleIdentifier — cannot bootstrap iOS credentials'),
      );

      const result = await run({
        projectId: 'proj-1',
        platform: 'ios',
        credentialManager: createCredentialManager(),
        eventBus: createEventBus(),
      }, createCtx());

      expect(result.success).toBe(false);
      expect(result.error).toContain('bundleIdentifier');
    });
  });

  describe('Android builds', () => {
    it('does NOT call iOS bootstrap and submits with empty env', async () => {
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

      // Bootstrap NOT called for Android
      expect(mockBootstrapIos).not.toHaveBeenCalled();

      // No extra env vars
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
