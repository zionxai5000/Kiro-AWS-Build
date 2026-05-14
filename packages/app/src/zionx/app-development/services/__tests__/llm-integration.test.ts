/**
 * Integration test — hits the REAL Claude API.
 *
 * GATED: Only runs when APPDEV_INTEGRATION_TEST=true is set.
 * COST: A few cents per run (max_tokens: 4096 cap).
 * TIMEOUT: 30s hard cap via timeout wrapper.
 *
 * Run manually:
 *   APPDEV_INTEGRATION_TEST=true ANTHROPIC_API_KEY=<key> npx vitest run packages/app/src/zionx/app-development/services/__tests__/llm-integration.test.ts
 */

import { describe, it, expect } from 'vitest';
import { LLMService, FileStreamParser } from '../llm-service.js';
import type { StreamCallbacks } from '../llm-service.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import { withTimeout } from '../../utils/timeout.js';

// Gate: skip entirely if env var not set
const ENABLED = process.env.APPDEV_INTEGRATION_TEST === 'true';

const testSuite = ENABLED ? describe : describe.skip;

testSuite('LLM Integration (REAL API)', () => {
  it('generates at least one valid file from a simple prompt', async () => {
    // Use env-based credential manager for integration test
    const credentialManager: CredentialManager = {
      async getCredential(driverName: string, key: string): Promise<string> {
        if (driverName === 'anthropic' && key === 'api-key') {
          return process.env.ANTHROPIC_API_KEY ?? '';
        }
        return '';
      },
      async rotateCredential() { return { success: false, driverName: '' }; },
      async getRotationSchedule() { return []; },
    };

    const service = new LLMService({
      credentialManager,
      maxTokens: 4096, // HARD COST CAP (Refinement 4)
      timeoutMs: 30000, // HARD TIME CAP
    });

    const files: Array<{ path: string; content: string }> = [];
    const tokens: string[] = [];

    const callbacks: StreamCallbacks = {
      onToken: (text) => { tokens.push(text); },
      onFileStart: () => {},
      onFileEnd: (path, content) => { files.push({ path, content }); },
      onComplete: () => {},
      onError: (err) => { throw err; },
    };

    const result = await withTimeout(
      () => service.streamGeneration(
        'Generate a minimal Expo app with a single screen showing "Hello World"',
        callbacks,
      ),
      30000,
      'Integration test timed out at 30s',
    );

    // Print usage for visibility
    console.log(`[Integration Test] Tokens: input=${result.tokensUsed.input}, output=${result.tokensUsed.output}`);
    console.log(`[Integration Test] Model: ${result.model}`);
    console.log(`[Integration Test] Files generated: ${result.files.length}`);
    console.log(`[Integration Test] Duration: ${result.durationMs}ms`);
    const estimatedCost = (result.tokensUsed.input * 0.003 + result.tokensUsed.output * 0.015) / 1000;
    console.log(`[Integration Test] Estimated cost: $${estimatedCost.toFixed(4)}`);

    // Assertions
    expect(result.files.length).toBeGreaterThanOrEqual(1);
    expect(files.length).toBeGreaterThanOrEqual(1);

    // At least one file should be recognizable TypeScript/JSON
    const hasRecognizableFile = files.some(f =>
      f.content.includes('export') ||
      f.content.includes('import') ||
      f.content.includes('"expo"') ||
      f.content.includes('"name"')
    );
    expect(hasRecognizableFile).toBe(true);

    // Tokens should have been streamed
    expect(tokens.length).toBeGreaterThan(0);
  }, 35000); // vitest timeout slightly above our 30s hard cap
});
