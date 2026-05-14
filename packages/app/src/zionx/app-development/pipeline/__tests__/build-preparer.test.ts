import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { run, HOOK_METADATA } from '../05-build-preparer.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import { resetAllCircuitBreakers } from '../../utils/circuit-breaker.js';
import { Workspace } from '../../workspace/workspace.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext } from '../types.js';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

function createCredentialManager(overrides: Record<string, string> = {}): CredentialManager {
  const creds: Record<string, Record<string, string>> = {
    'appstore-connect': {
      'api-key': overrides['api-key'] ?? '-----BEGIN PRIVATE KEY-----\nfake-p8-content\n-----END PRIVATE KEY-----',
      'key-id': overrides['key-id'] ?? 'ABC123DEF4',
      'issuer-id': overrides['issuer-id'] ?? '57246542-96fe-1a63-e053-0824d011072a',
    },
  };

  return {
    async getCredential(driverName: string, credentialKey: string) {
      return creds[driverName]?.[credentialKey] ?? '';
    },
    async rotateCredential() { return { success: true, driverName: '' }; },
    async getRotationSchedule() { return []; },
  };
}

function validAppJson(overrides: any = {}) {
  return JSON.stringify({
    expo: {
      name: 'TestApp',
      slug: 'test-app',
      version: '1.2.0',
      ios: { bundleIdentifier: 'com.example.testapp', buildNumber: '5', ...overrides.ios },
      android: { package: 'com.example.testapp', versionCode: 5, ...overrides.android },
      ...overrides.expo,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 05: Build Preparer', () => {
  let workspace: Workspace;
  let testRoot: string;

  beforeEach(() => {
    resetAllCircuitBreakers();
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['build-preparer'] = { enabled: true, dryRun: false };
    workspace = new Workspace();
    testRoot = workspace.getProjectPath('test-marker').replace(/[/\\]test-marker$/, '');
  });

  afterEach(() => {
    for (const proj of ['bp-proj-1', 'bp-proj-2', 'bp-proj-3', 'bp-proj-4', 'bp-proj-5', 'bp-proj-6']) {
      const p = join(testRoot, proj);
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
  });

  describe('iOS builds', () => {
    it('increments buildNumber from "5" to "6" and retrieves credentials', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.buildNumber).toBe('6');
      expect(result.data!.credentialInfo).toBeDefined();
      expect(result.data!.credentialInfo!.keyId).toBe('ABC123DEF4');
      expect(result.data!.credentialInfo!.issuerId).toHaveLength(36);

      // Verify app.json was updated
      const updated = JSON.parse(readFileSync(join(testRoot, projId, 'app.json'), 'utf-8'));
      expect(updated.expo.ios.buildNumber).toBe('6');
    });

    it('starts buildNumber at "1" when not present', async () => {
      const projId = 'bp-proj-2';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), JSON.stringify({
        expo: { name: 'App', slug: 'app', version: '1.0.0', ios: { bundleIdentifier: 'com.x.y' } },
      }));

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.buildNumber).toBe('1');
    });

    it('credential retrieval failure returns success: false', async () => {
      const projId = 'bp-proj-3';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());

      const badCredManager: CredentialManager = {
        async getCredential() { throw new Error('Secrets Manager unavailable'); },
        async rotateCredential() { return { success: false, driverName: '' }; },
        async getRotationSchedule() { return []; },
      };

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: badCredManager },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('credentials');
      // Error message must NOT contain actual credential content
      expect(result.error).not.toContain('BEGIN PRIVATE KEY');
    });
  });

  describe('Android builds', () => {
    it('increments versionCode from 5 to 6', async () => {
      const projId = 'bp-proj-4';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());

      const result = await run(
        { projectId: projId, platform: 'android', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.versionCode).toBe(6);
      expect(result.data!.credentialInfo).toBeUndefined(); // Android doesn't need Apple creds

      const updated = JSON.parse(readFileSync(join(testRoot, projId, 'app.json'), 'utf-8'));
      expect(updated.expo.android.versionCode).toBe(6);
    });

    it('starts versionCode at 1 when not present', async () => {
      const projId = 'bp-proj-5';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), JSON.stringify({
        expo: { name: 'App', slug: 'app', version: '1.0.0', android: { package: 'com.x.y' } },
      }));

      const result = await run(
        { projectId: projId, platform: 'android', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.versionCode).toBe(1);
    });
  });

  describe('version preservation', () => {
    it('NEVER modifies expo.version', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());

      await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      const updated = JSON.parse(readFileSync(join(testRoot, projId, 'app.json'), 'utf-8'));
      expect(updated.expo.version).toBe('1.2.0'); // Original value preserved
    });
  });

  describe('validation failures', () => {
    it('missing app.json returns success: false', async () => {
      const projId = 'bp-proj-6';
      mkdirSync(join(testRoot, projId), { recursive: true });
      // No app.json written

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('app.json not found');
    });

    it('invalid JSON returns success: false', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), 'not json {{{');

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('missing required field lists all errors', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), JSON.stringify({ expo: {} }));

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.data!.errors.length).toBeGreaterThanOrEqual(3); // name, slug, version, bundleIdentifier
    });
  });

  describe('eas.json generation', () => {
    it('generates eas.json when missing', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());

      await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      const easJson = JSON.parse(readFileSync(join(testRoot, projId, 'eas.json'), 'utf-8'));
      expect(easJson.build.production).toBeDefined();
      expect(easJson.build.production.distribution).toBe('store');
    });

    it('does NOT overwrite existing eas.json', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());
      writeFileSync(join(testRoot, projId, 'eas.json'), '{"custom":"config"}');

      await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      const easJson = readFileSync(join(testRoot, projId, 'eas.json'), 'utf-8');
      expect(easJson).toBe('{"custom":"config"}');
    });
  });

  describe('dryRun', () => {
    it('validates and would-increment but does NOT write files', async () => {
      const projId = 'bp-proj-1';
      mkdirSync(join(testRoot, projId), { recursive: true });
      writeFileSync(join(testRoot, projId, 'app.json'), validAppJson());

      HOOKS_CONFIG.hooks['build-preparer'] = { enabled: true, dryRun: true };

      const result = await run(
        { projectId: projId, platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.data!.buildNumber).toBe('6');

      // app.json should NOT be modified
      const unchanged = JSON.parse(readFileSync(join(testRoot, projId, 'app.json'), 'utf-8'));
      expect(unchanged.expo.ios.buildNumber).toBe('5'); // Still original
    });
  });

  describe('kill switch', () => {
    it('returns without doing anything when disabled', async () => {
      HOOKS_CONFIG.hooks['build-preparer'] = { enabled: false, dryRun: false };

      const result = await run(
        { projectId: 'any', platform: 'ios', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.ready).toBe(false);
    });
  });
});
