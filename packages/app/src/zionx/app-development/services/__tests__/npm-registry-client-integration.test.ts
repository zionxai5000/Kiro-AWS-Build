/**
 * Integration test — hits the REAL npm registry.
 *
 * GATED: Only runs when APPDEV_NPM_REGISTRY_TEST=true is set.
 * Verifies the client shape matches reality (catches API drift).
 *
 * Run manually:
 *   APPDEV_NPM_REGISTRY_TEST=true npx vitest run packages/app/src/zionx/app-development/services/__tests__/npm-registry-client-integration.test.ts
 */

import { describe, it, expect } from 'vitest';
import { NpmRegistryClient } from '../npm-registry-client.js';

const ENABLED = process.env.APPDEV_NPM_REGISTRY_TEST === 'true';
const testSuite = ENABLED ? describe : describe.skip;

testSuite('NpmRegistryClient Integration (REAL REGISTRY)', () => {
  const client = new NpmRegistryClient({ timeoutMs: 15000 });

  it('validates react package exists and ^18.0.0 is satisfiable', async () => {
    const result = await client.checkPackage('react', '^18.0.0');

    expect(result.exists).toBe(true);
    expect(result.versionSatisfied).toBe(true);
    expect(result.matchedVersion).toBeDefined();
    console.log(`[npm integration] react matched version: ${result.matchedVersion}`);
  }, 20000);

  it('returns exists: false for a nonexistent package', async () => {
    const result = await client.checkPackage('@seraphim-test/definitely-does-not-exist-xyz-123');

    expect(result.exists).toBe(false);
  }, 20000);
});
