/**
 * OpenAI Images API Client — raw fetch wrapper for image generation.
 *
 * Uses the Images API (POST /v1/images/generations) with gpt-image-1-mini.
 * Returns base64-decoded PNG Buffers.
 *
 * Credentials are retrieved via CredentialManager abstraction.
 * No SDK dependency — raw fetch, consistent with existing OpenAI usage in the monorepo.
 *
 * Supported sizes: 1024x1024, 1536x1024, 1024x1536, auto.
 * Background: "opaque" (no alpha), "transparent" (alpha), "auto" (model decides).
 */

import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import { retryWithBackoff } from '../utils/retry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
export type ImageQuality = 'low' | 'medium' | 'high';
export type ImageBackground = 'transparent' | 'opaque' | 'auto';

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: ImageSize;
  quality?: ImageQuality;
  background?: ImageBackground;
  n?: number;
}

export interface ImageGenerationResult {
  buffer: Buffer;
  revisedPrompt?: string;
}

export interface OpenAIImagesClientConfig {
  credentialManager: CredentialManager;
  model?: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/** Thrown when OpenAI rejects the prompt due to content policy. Terminal — do not retry. */
export class ContentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentPolicyError';
  }
}

/** Thrown when OpenAI rate limits the request. Retryable. */
export class RateLimitError extends Error {
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs = 60_000) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'gpt-image-1-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export class OpenAIImagesClient {
  private readonly credentialManager: CredentialManager;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIImagesClientConfig) {
    this.credentialManager = config.credentialManager;
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Generate a single image from a text prompt.
   *
   * Returns the decoded PNG Buffer. Retries on rate limits and server errors.
   * Throws ContentPolicyError on content policy violations (terminal, no retry).
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const apiKey = await this.credentialManager.getCredential('openai', 'api-key');
    if (!apiKey) {
      throw new Error('OpenAI API key not available via CredentialManager');
    }

    const body = {
      model: request.model ?? this.model,
      prompt: request.prompt,
      n: request.n ?? 1,
      size: request.size ?? '1024x1024',
      quality: request.quality ?? 'medium',
      background: request.background ?? 'auto',
      output_format: 'png',
    };

    const result = await retryWithBackoff(
      () => this.doFetch(apiKey, body),
      {
        maxRetries: 3,
        backoffMs: [5_000, 15_000, 30_000],
        shouldRetry: (error) => this.isRetryable(error),
      },
    );

    return result;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async doFetch(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<ImageGenerationResult> {
    const url = `${this.baseUrl}/images/generations`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    // Handle error responses
    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;

      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.error?.message ?? errorBody;
      } catch {
        errorMessage = errorBody;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
        throw new RateLimitError(`OpenAI rate limit: ${errorMessage}`, retryMs);
      }

      if (response.status === 400 && errorMessage.toLowerCase().includes('content_policy')) {
        throw new ContentPolicyError(`Content policy violation: ${errorMessage}`);
      }

      if (response.status === 400) {
        // Other 400 errors are terminal (bad request, invalid params)
        throw new Error(`OpenAI API error (400): ${errorMessage}`);
      }

      if (response.status >= 500) {
        throw new Error(`OpenAI server error (${response.status}): ${errorMessage}`);
      }

      throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
    }

    // Parse successful response
    const data = await response.json() as {
      data: Array<{ b64_json?: string; revised_prompt?: string }>;
    };

    if (!data.data || data.data.length === 0 || !data.data[0]!.b64_json) {
      throw new Error('OpenAI returned empty image data');
    }

    const b64 = data.data[0]!.b64_json;
    const buffer = Buffer.from(b64, 'base64');

    return {
      buffer,
      revisedPrompt: data.data[0]!.revised_prompt,
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof ContentPolicyError) return false;
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Server errors are retryable
      if (msg.includes('server error')) return true;
      // Network errors are retryable
      if (msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('fetch failed')) return true;
    }
    return false;
  }
}
