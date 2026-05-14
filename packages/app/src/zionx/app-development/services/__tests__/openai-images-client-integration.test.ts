/**
 * OpenAI Images Client — Integration Test (gated)
 *
 * Requires: APPDEV_OPENAI_IMAGES_TEST=true environment variable.
 * Calls the real OpenAI API with the cheapest possible request:
 *   - gpt-image-1-mini, 1024x1024, low quality = $0.005
 *
 * Verifies:
 *   - Real API responds with valid base64 PNG
 *   - Decoded buffer starts with PNG magic bytes
 *   - Response size is reasonable (>1KB, <10MB)
 */

import { describe, it, expect } from 'vitest';
import { OpenAIImagesClient } from '../openai-images-client.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ---------------------------------------------------------------------------
// Gate: skip unless explicitly enabled
// ---------------------------------------------------------------------------

const ENABLED = process.env.APPDEV_OPENAI_IMAGES_TEST === 'true';

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

describe.skipIf(!ENABLED)('OpenAI Images Client — Integration', () => {
  it('generates a real image from the API (cheapest: low quality, 1024x1024)', async () => {
    // Load API key from Secrets Manager
    const smClient = new SecretsManagerClient({ region: 'us-east-1' });
    const resp = await smClient.send(
      new GetSecretValueCommand({ SecretId: 'seraphim/openai' }),
    );

    let apiKey: string;
    try {
      const parsed = JSON.parse(resp.SecretString!);
      apiKey = parsed.apiKey ?? parsed.api_key ?? resp.SecretString!;
    } catch {
      apiKey = resp.SecretString!;
    }

    // Create a simple credential manager that returns the key
    const credentialManager: CredentialManager = {
      getCredential: async () => apiKey,
      rotateCredential: async () => ({ success: false, driverName: '', error: '' }),
      getRotationSchedule: async () => [],
    };

    const client = new OpenAIImagesClient({ credentialManager });

    // Generate cheapest possible image: low quality, 1024x1024
    const result = await client.generateImage({
      prompt: 'A simple blue circle on white background',
      quality: 'low',
      size: '1024x1024',
      background: 'opaque',
    });

    // Verify it's a valid PNG
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(1024); // > 1KB
    expect(result.buffer.length).toBeLessThan(10 * 1024 * 1024); // < 10MB

    // Check PNG magic bytes
    const header = result.buffer.subarray(0, 8);
    expect(header.equals(PNG_MAGIC)).toBe(true);
  }, 120_000); // 2 minute timeout for API call
});
