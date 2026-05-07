/**
 * Anthropic LLM Provider Driver — Claude Haiku, Sonnet, Opus.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager and Otzar,
 * and implements model-specific rate limiting, token counting, and cost calculation.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 5.1
 */

import { BaseDriver } from '../base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { TokenUsage } from '@seraphim/core/types/otzar.js';

// ---------------------------------------------------------------------------
// Model Definitions
// ---------------------------------------------------------------------------

export interface AnthropicModelInfo {
  id: string;
  displayName: string;
  tier: 1 | 2 | 3;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  maxContextTokens: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export const ANTHROPIC_MODELS: Record<string, AnthropicModelInfo> = {
  'claude-haiku': {
    id: 'claude-haiku',
    displayName: 'Claude Haiku',
    tier: 1,
    inputCostPer1kTokens: 0.00025,
    outputCostPer1kTokens: 0.00125,
    maxContextTokens: 200_000,
    requestsPerMinute: 1000,
    tokensPerMinute: 100_000,
  },
  'claude-sonnet': {
    id: 'claude-sonnet',
    displayName: 'Claude Sonnet',
    tier: 2,
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
    maxContextTokens: 200_000,
    requestsPerMinute: 500,
    tokensPerMinute: 80_000,
  },
  'claude-opus': {
    id: 'claude-opus',
    displayName: 'Claude Opus',
    tier: 3,
    inputCostPer1kTokens: 0.015,
    outputCostPer1kTokens: 0.075,
    maxContextTokens: 200_000,
    requestsPerMinute: 200,
    tokensPerMinute: 40_000,
  },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AnthropicDriverConfig {
  /** Default model to use when not specified in operation params. */
  defaultModel?: string;
  /** Agent ID for usage tracking. */
  agentId: string;
  /** Tenant ID for usage tracking. */
  tenantId: string;
  /** Pillar for usage tracking. */
  pillar: string;
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

export interface RateLimiterState {
  requestTimestamps: number[];
  tokenTimestamps: Array<{ time: number; tokens: number }>;
}

export class RateLimiter {
  private _requestTimestamps: number[] = [];
  private _tokenTimestamps: Array<{ time: number; tokens: number }> = [];

  constructor(
    private readonly requestsPerMinute: number,
    private readonly tokensPerMinute: number,
  ) {}

  /**
   * Check whether a request with the given token count is allowed.
   * Cleans up stale entries older than 60 seconds.
   */
  allowRequest(estimatedTokens: number, now: number = Date.now()): boolean {
    const windowStart = now - 60_000;

    // Prune stale entries
    this._requestTimestamps = this._requestTimestamps.filter((t) => t > windowStart);
    this._tokenTimestamps = this._tokenTimestamps.filter((t) => t.time > windowStart);

    // Check request count
    if (this._requestTimestamps.length >= this.requestsPerMinute) {
      return false;
    }

    // Check token count
    const currentTokens = this._tokenTimestamps.reduce((sum, t) => sum + t.tokens, 0);
    if (currentTokens + estimatedTokens > this.tokensPerMinute) {
      return false;
    }

    return true;
  }

  /** Record a completed request for rate tracking. */
  recordRequest(tokens: number, now: number = Date.now()): void {
    this._requestTimestamps.push(now);
    this._tokenTimestamps.push({ time: now, tokens });
  }

  /** Time in ms until the next request window opens. */
  getRetryAfterMs(now: number = Date.now()): number {
    if (this._requestTimestamps.length === 0) return 0;
    const oldest = Math.min(...this._requestTimestamps);
    return Math.max(0, oldest + 60_000 - now);
  }
}

// ---------------------------------------------------------------------------
// Streaming Types
// ---------------------------------------------------------------------------

export interface StreamChunk {
  type: 'content_block_delta' | 'message_start' | 'message_stop' | 'error';
  content?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

// ---------------------------------------------------------------------------
// Anthropic Driver
// ---------------------------------------------------------------------------

export class AnthropicDriver extends BaseDriver<AnthropicDriverConfig> {
  readonly name = 'anthropic-llm';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: AnthropicDriverConfig | null = null;
  private readonly _rateLimiters = new Map<string, RateLimiter>();
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(
    private readonly credentialManager: CredentialManager,
    private readonly otzarService: OtzarService,
  ) {
    // Anthropic-specific retry: 3 attempts, 2s initial delay (respecting rate limits)
    super({ maxAttempts: 3, initialDelayMs: 2000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: AnthropicDriverConfig): Promise<void> {
    this._apiKey = await this.credentialManager.getCredential('anthropic', 'api-key');
    if (!this._apiKey) {
      throw new Error('Failed to retrieve Anthropic API key from Credential Manager');
    }
    this._driverConfig = config;

    // Initialize rate limiters per model
    for (const [modelId, info] of Object.entries(ANTHROPIC_MODELS)) {
      this._rateLimiters.set(
        modelId,
        new RateLimiter(info.requestsPerMinute, info.tokensPerMinute),
      );
    }

    this.updateSessionData({ provider: 'anthropic', authenticated: true });
  }

  protected async doDisconnect(): Promise<void> {
    this._apiKey = null;
    this._driverConfig = null;
    this._rateLimiters.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOperationId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, 'NOT_CONNECTED', 'Driver is not connected', false);
    }

    const operationType = operation.type;

    switch (operationType) {
      case 'chat':
        return this.handleChat(operation, operationId);
      case 'complete':
        return this.handleComplete(operation, operationId);
      case 'embed':
        return this.handleEmbed(operation, operationId);
      case 'stream':
        return this.handleStream(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          'UNSUPPORTED_OPERATION',
          `Unsupported operation type: ${operationType}`,
          false,
        );
    }
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    const result = this._completedOperations.get(operationId);
    return {
      verified: result !== undefined,
      operationId,
      details: result ? { success: result.success } : undefined,
    };
  }

  // =====================================================================
  // Operation Handlers
  // =====================================================================

  private async handleChat(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const model = this.resolveModel(operation.params.model as string | undefined);
    const messages = operation.params.messages as Array<{ role: string; content: string }>;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return this.errorResult(operationId, 'INVALID_PARAMS', 'messages array is required for chat operation', false);
    }

    const modelInfo = ANTHROPIC_MODELS[model];
    if (!modelInfo) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
    }

    // Estimate tokens
    const inputTokens = this.estimateTokens(messages.map((m) => m.content).join(' '));
    const maxOutputTokens = (operation.params.maxTokens as number) ?? 1024;

    // Rate limit check
    const rateLimiter = this._rateLimiters.get(model);
    if (rateLimiter && !rateLimiter.allowRequest(inputTokens + maxOutputTokens)) {
      const retryAfter = rateLimiter.getRetryAfterMs();
      return this.errorResult(
        operationId,
        'RATE_LIMITED',
        `Rate limit exceeded for model ${model}. Retry after ${retryAfter}ms`,
        true,
        { retryAfterMs: retryAfter },
      );
    }

    // Mock response (structural implementation — no real HTTP call)
    const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    // Record rate limit usage
    rateLimiter?.recordRequest(inputTokens + outputTokens);

    // Report usage to Otzar
    await this.reportUsage(model, inputTokens, outputTokens, cost, 'chat');

    const result: DriverResult = {
      success: true,
      data: {
        model,
        content: `[Mock Anthropic ${modelInfo.displayName} response]`,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        cost,
        stopReason: 'end_turn',
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleComplete(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const model = this.resolveModel(operation.params.model as string | undefined);
    const prompt = operation.params.prompt as string;

    if (!prompt) {
      return this.errorResult(operationId, 'INVALID_PARAMS', 'prompt is required for complete operation', false);
    }

    const modelInfo = ANTHROPIC_MODELS[model];
    if (!modelInfo) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
    }

    const inputTokens = this.estimateTokens(prompt);
    const maxOutputTokens = (operation.params.maxTokens as number) ?? 1024;

    const rateLimiter = this._rateLimiters.get(model);
    if (rateLimiter && !rateLimiter.allowRequest(inputTokens + maxOutputTokens)) {
      const retryAfter = rateLimiter.getRetryAfterMs();
      return this.errorResult(operationId, 'RATE_LIMITED', `Rate limit exceeded for model ${model}`, true, {
        retryAfterMs: retryAfter,
      });
    }

    const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.3) + 30);
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    rateLimiter?.recordRequest(inputTokens + outputTokens);
    await this.reportUsage(model, inputTokens, outputTokens, cost, 'complete');

    const result: DriverResult = {
      success: true,
      data: {
        model,
        completion: `[Mock Anthropic ${modelInfo.displayName} completion]`,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        cost,
        stopReason: 'end_turn',
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleEmbed(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    // Anthropic doesn't natively support embeddings, but we handle the operation
    // by returning an error directing to use OpenAI's embedding models instead.
    return this.errorResult(
      operationId,
      'UNSUPPORTED_OPERATION',
      'Anthropic does not support embedding operations. Use OpenAI text-embedding-3-small instead.',
      false,
    );
  }

  private async handleStream(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const model = this.resolveModel(operation.params.model as string | undefined);
    const messages = operation.params.messages as Array<{ role: string; content: string }>;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return this.errorResult(operationId, 'INVALID_PARAMS', 'messages array is required for stream operation', false);
    }

    const modelInfo = ANTHROPIC_MODELS[model];
    if (!modelInfo) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
    }

    const inputTokens = this.estimateTokens(messages.map((m) => m.content).join(' '));
    const maxOutputTokens = (operation.params.maxTokens as number) ?? 1024;

    const rateLimiter = this._rateLimiters.get(model);
    if (rateLimiter && !rateLimiter.allowRequest(inputTokens + maxOutputTokens)) {
      const retryAfter = rateLimiter.getRetryAfterMs();
      return this.errorResult(operationId, 'RATE_LIMITED', `Rate limit exceeded for model ${model}`, true, {
        retryAfterMs: retryAfter,
      });
    }

    // Mock streaming: produce an array of chunks representing the stream
    const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    const chunks: StreamChunk[] = [
      { type: 'message_start', model },
      { type: 'content_block_delta', content: `[Mock streamed response from ${modelInfo.displayName}` },
      { type: 'content_block_delta', content: ' — chunk 2]' },
      { type: 'message_stop', usage: { inputTokens, outputTokens } },
    ];

    rateLimiter?.recordRequest(inputTokens + outputTokens);
    await this.reportUsage(model, inputTokens, outputTokens, cost, 'stream');

    const result: DriverResult = {
      success: true,
      data: {
        model,
        chunks,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        cost,
        streaming: true,
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Token Counting & Cost Calculation
  // =====================================================================

  /** Rough token estimate: ~4 characters per token (standard approximation). */
  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /** Calculate cost in USD for a given model and token counts. */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const info = ANTHROPIC_MODELS[model];
    if (!info) return 0;
    const inputCost = (inputTokens / 1000) * info.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * info.outputCostPer1kTokens;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private resolveModel(requested?: string): string {
    if (requested && ANTHROPIC_MODELS[requested]) return requested;
    return this._driverConfig?.defaultModel ?? 'claude-sonnet';
  }

  private async reportUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
    taskType: string,
  ): Promise<void> {
    if (!this._driverConfig) return;

    const usage: TokenUsage = {
      agentId: this._driverConfig.agentId,
      tenantId: this._driverConfig.tenantId,
      pillar: this._driverConfig.pillar,
      provider: 'anthropic',
      model,
      inputTokens,
      outputTokens,
      costUsd,
      taskType,
    };

    await this.otzarService.recordUsage(usage);
  }

  private createOperationId(): string {
    return `anth-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private errorResult(
    operationId: string,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>,
  ): DriverResult {
    return {
      success: false,
      error: { code, message, retryable, details },
      retryable,
      operationId,
    };
  }

  /** Expose rate limiters for testing. */
  getRateLimiter(model: string): RateLimiter | undefined {
    return this._rateLimiters.get(model);
  }
}
