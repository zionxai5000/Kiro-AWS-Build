import { describe, it, expect, beforeEach, vi } from 'vitest';
import { run, HOOK_METADATA } from '../05c-sentry-provisioner.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx() {
  return {
    executionId: 'exec-1',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: () => {},
  };
}

function makeCredentialManager(creds: Record<string, Record<string, string>>): CredentialManager {
  return {
    async getCredential(service: string, key: string): Promise<string> {
      const v = creds[service]?.[key];
      if (!v) throw new Error(`missing credential ${service}/${key}`);
      return v;
    },
    async setCredential() { throw new Error('not implemented'); },
    async deleteCredential() { throw new Error('not implemented'); },
  } as unknown as CredentialManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 05c: sentry-provisioner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports HOOK_METADATA with id "sentry-provisioner"', () => {
    expect(HOOK_METADATA.id).toBe('sentry-provisioner');
    expect(HOOK_METADATA.triggerType).toBe('api_request');
    expect(HOOK_METADATA.failureMode).toBe('notify');
  });

  it('returns success in dry-run', async () => {
    const credentialManager = makeCredentialManager({ sentry: {} });
    const result = await run(
      { projectId: 'proj-test', appSlug: 'mindful-timer', credentialManager },
      { ...ctx(), dryRun: true },
    );
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
  });

  it('fails gracefully when Sentry secret missing', async () => {
    const credentialManager = makeCredentialManager({});
    const result = await run(
      { projectId: 'proj-test', appSlug: 'mindful-timer', credentialManager },
      ctx(),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/authToken not found/);
  });
});
