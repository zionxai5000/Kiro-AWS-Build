/**
 * OpenAI Images Client — Unit Tests (mocked fetch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAIImagesClient,
  ContentPolicyError,
  RateLimitError,
} from '../openai-images-client.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createCredentialManager(apiKey = 'sk-test-key-123'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(apiKey),
    rotateCredential: vi.fn().mockResolvedValue({ success: false, driverName: '', error: '' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

function createSuccessResponse(b64Data = 'iVBORw0KGgo=', revisedPrompt?: string) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      data: [{ b64_json: b64Data, revised_prompt: revisedPrompt }],
    }),
  };
}

function createErrorResponse(status: number, message: string, headers?: Record<string, string>) {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify({ error: { message } })),
    headers: {
      get: (key: string) => headers?.[key] ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAIImagesClient', () => {
  let client: OpenAIImagesClient;
  let credentialManager: CredentialManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    credentialManager = createCredentialManager();
    client = new OpenAIImagesClient({ credentialManager });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('generateImage — happy path', () => {
    it('sends correct request format', async () => {
      // PNG magic bytes in base64
      const pngBase64 = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).toString('base64');
      mockFetch.mockResolvedValueOnce(createSuccessResponse(pngBase64));

      await client.generateImage({
        prompt: 'A test icon',
        size: '1024x1024',
        quality: 'medium',
        background: 'opaque',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.openai.com/v1/images/generations');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer sk-test-key-123');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.model).toBe('gpt-image-1-mini');
      expect(body.prompt).toBe('A test icon');
      expect(body.size).toBe('1024x1024');
      expect(body.quality).toBe('medium');
      expect(body.background).toBe('opaque');
      expect(body.output_format).toBe('png');
      expect(body.n).toBe(1);
    });

    it('decodes base64 response to Buffer', async () => {
      const originalBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02]);
      const b64 = originalBytes.toString('base64');
      mockFetch.mockResolvedValueOnce(createSuccessResponse(b64));

      const result = await client.generateImage({ prompt: 'test' });

      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.equals(originalBytes)).toBe(true);
    });

    it('returns revised prompt when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createSuccessResponse('AAAA', 'A revised version of the prompt'),
      );

      const result = await client.generateImage({ prompt: 'test' });
      expect(result.revisedPrompt).toBe('A revised version of the prompt');
    });

    it('uses custom model when specified', async () => {
      const customClient = new OpenAIImagesClient({
        credentialManager,
        model: 'gpt-image-1.5',
      });
      mockFetch.mockResolvedValueOnce(createSuccessResponse('AAAA'));

      await customClient.generateImage({ prompt: 'test' });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.model).toBe('gpt-image-1.5');
    });

    it('allows per-request model override', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('AAAA'));

      await client.generateImage({ prompt: 'test', model: 'gpt-image-1' });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.model).toBe('gpt-image-1');
    });
  });

  describe('generateImage — error handling', () => {
    it('throws ContentPolicyError on content policy violation (no retry)', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(400, 'Your request was rejected as a result of our safety system. content_policy_violation'),
      );

      await expect(
        client.generateImage({ prompt: 'bad content' }),
      ).rejects.toThrow(ContentPolicyError);

      // Should NOT retry — only 1 fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws RateLimitError on 429 and retries', async () => {
      // First call: 429, second call: success
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(429, 'Rate limit exceeded', { 'retry-after': '5' }))
        .mockResolvedValueOnce(createSuccessResponse('AAAA'));

      const promise = client.generateImage({ prompt: 'test' });

      // Advance past the retry backoff (5000ms)
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.buffer).toBeDefined();
    });

    it('retries on 500 server error', async () => {
      mockFetch
        .mockResolvedValueOnce(createErrorResponse(500, 'Internal server error'))
        .mockResolvedValueOnce(createSuccessResponse('AAAA'));

      const promise = client.generateImage({ prompt: 'test' });

      // Advance past the retry backoff (5000ms)
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.buffer).toBeDefined();
    });

    it('throws on non-retryable 400 error', async () => {
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(400, 'Invalid parameter: size must be one of 1024x1024'),
      );

      await expect(
        client.generateImage({ prompt: 'test' }),
      ).rejects.toThrow('OpenAI API error (400)');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on empty response data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ data: [] }),
      });

      await expect(
        client.generateImage({ prompt: 'test' }),
      ).rejects.toThrow('OpenAI returned empty image data');
    });

    it('throws when credential manager returns empty key', async () => {
      const emptyCredManager = createCredentialManager('');
      const emptyClient = new OpenAIImagesClient({ credentialManager: emptyCredManager });

      await expect(
        emptyClient.generateImage({ prompt: 'test' }),
      ).rejects.toThrow('OpenAI API key not available');
    });
  });

  describe('generateImage — request parameters', () => {
    it('defaults to 1024x1024, medium quality, auto background', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('AAAA'));

      await client.generateImage({ prompt: 'test' });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.size).toBe('1024x1024');
      expect(body.quality).toBe('medium');
      expect(body.background).toBe('auto');
    });

    it('passes transparent background for splash icons', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('AAAA'));

      await client.generateImage({
        prompt: 'splash icon',
        background: 'transparent',
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.background).toBe('transparent');
    });

    it('passes opaque background for app icons', async () => {
      mockFetch.mockResolvedValueOnce(createSuccessResponse('AAAA'));

      await client.generateImage({
        prompt: 'app icon',
        background: 'opaque',
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.background).toBe('opaque');
    });
  });
});
