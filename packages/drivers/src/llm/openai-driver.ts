/**
 * OpenAI LLM Provider Driver — GPT-4o-mini, GPT-4o, GPT-4.5.
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
import { RateLimiter } from './anthropic-driver.js';

// ---------------------------------------------------------------------------
// Model Definitions
// ---------------------------------------------------------------------------

export interface OpenAIModelInfo {
  id: string;
  displayName: string;
  tier: 1 | 2 | 3;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  maxContextTokens: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
  supportsEmbedding: boolean;
}

export const OPENAI_MODELS: Record<string, OpenAIModelInfo> = {
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    tier: 1,
    inputCostPer1kTokens: 0.00015,
    outputCostPer1kTokens: 0.0006,
    maxContextTokens: 128_000,
    requestsPerMinute: 5000,
    tokensPerMinute: 200_000,
    supportsEmbedding: false,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    tier: 2,
    inputCostPer1kTokens: 0.0025,
    outputCostPer1kTokens: 0.01,
    maxContextTokens: 128_000,
    requestsPerMinute: 2000,
    tokensPerMinute: 150_000,
    supportsEmbedding: false,
  },
  'gpt-4.5': {
    id: 'gpt-4.5',
    displayName: 'GPT-4.5',
    tier: 3,
    inputCostPer1kTokens: 0.075,
    outputCostPer1kTokens: 0.15,
    maxContextTokens: 128_000,
    requestsPerMinute: 500,
    tokensPerMinute: 60_000,
    supportsEmbedding: false,
  },
  'text-embedding-3-small': {
    id: 'text-embedding-3-small',
    displayName: 'Text Embedding 3 Small',
    tier: 1,
    inputCostPer1kTokens: 0.00002,
    outputCostPer1kTokens: 0,
    maxContextTokens: 8_191,
    requestsPerMinute: 5000,
    tokensPerMinute: 1_000_000,
    supportsEmbedding: true,
  },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface OpenAIDriverConfig {
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
// Streaming Types
// ---------------------------------------------------------------------------

export interface OpenAIStreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  model?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ---------------------------------------------------------------------------
// OpenAI Driver
// ---------------------------------------------------------------------------

export class OpenAIDriver extends BaseDriver<OpenAIDriverConfig> {
  readonly name = 'openai-llm';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: OpenAIDriverConfig | null = null;
  private readonly _rateLimiters = new Map<string, RateLimiter>();
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(
    private readonly credentialManager: CredentialManager,
    private readonly otzarService: OtzarService,
  ) {
    // OpenAI-specific retry: 3 attempts, 1s initial delay
    super({ maxAttempts: 3, initialDelayMs: 1000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: OpenAIDriverConfig): Promise<void> {
    this._apiKey = await this.credentialManager.getCredential('openai', 'api-key');
    if (!this._apiKey) {
      throw new Error('Failed to retrieve OpenAI API key from Credential Manager');
    }
    this._driverConfig = config;

    // Initialize rate limiters per model
    for (const [modelId, info] of Object.entries(OPENAI_MODELS)) {
      this._rateLimiters.set(
        modelId,
        new RateLimiter(info.requestsPerMinute, info.tokensPerMinute),
      );
    }

    this.updateSessionData({ provider: 'openai', authenticated: true });
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

    const modelInfo = OPENAI_MODELS[model];
    if (!modelInfo) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
    }

    if (modelInfo.supportsEmbedding) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Model ${model} is an embedding model, not a chat model`, false);
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

    // Mock response
    const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    rateLimiter?.recordRequest(inputTokens + outputTokens);
    await this.reportUsage(model, inputTokens, outputTokens, cost, 'chat');

    const result: DriverResult = {
      success: true,
      data: {
        model,
        choices: [
          {
            message: { role: 'assistant', content: `[Mock OpenAI ${modelInfo.displayName} response]` },
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        cost,
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

    const modelInfo = OPENAI_MODELS[model];
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
        choices: [
          {
            text: `[Mock OpenAI ${modelInfo.displayName} completion]`,
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        cost,
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleEmbed(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const model = (operation.params.model as string) ?? 'text-embedding-3-small';
    const input = operation.params.input as string | string[];

    if (!input) {
      return this.errorResult(operationId, 'INVALID_PARAMS', 'input is required for embed operation', false);
    }

    const modelInfo = OPENAI_MODELS[model];
    if (!modelInfo) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
    }

    if (!modelInfo.supportsEmbedding) {
      return this.errorResult(operationId, 'INVALID_MODEL', `Model ${model} does not support embeddings`, false);
    }

    const texts = Array.isArray(input) ? input : [input];
    const inputTokens = texts.reduce((sum, t) => sum + this.estimateTokens(t), 0);

    const rateLimiter = this._rateLimiters.get(model);
    if (rateLimiter && !rateLimiter.allowRequest(inputTokens)) {
      const retryAfter = rateLimiter.getRetryAfterMs();
      return this.errorResult(operationId, 'RATE_LIMITED', `Rate limit exceeded for model ${model}`, true, {
        retryAfterMs: retryAfter,
      });
    }

    const cost = this.calculateCost(model, inputTokens, 0);

    rateLimiter?.recordRequest(inputTokens);
    await this.reportUsage(model, inputTokens, 0, cost, 'embed');

    // Generate mock 1536-dimension embeddings
    const embeddings = texts.map(() => {
      const vec = new Array(1536).fill(0).map(() => parseFloat((Math.random() * 2 - 1).toFixed(6)));
      return vec;
    });

    const result: DriverResult = {
      success: true,
      data: {
        model,
        embeddings,
        usage: { promptTokens: inputTokens, totalTokens: inputTokens },
        cost,
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleStream(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const model = this.resolveModel(operation.params.model as string | undefined);
    const messages = operation.params.messages as Array<{ role: string; content: string }>;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return this.errorResult(operationId, 'INVALID_PARAMS', 'messages array is required for stream operation', false);
    }

    const modelInfo = OPENAI_MODELS[model];
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

    const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
    const cost = this.calculateCost(model, inputTokens, outputTokens);

    const chunks: OpenAIStreamChunk[] = [
      { type: 'chunk', content: `[Mock streamed response from ${modelInfo.displayName}`, model },
      { type: 'chunk', content: ' — chunk 2]' },
      {
        type: 'done',
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      },
    ];

    rateLimiter?.recordRequest(inputTokens + outputTokens);
    await this.reportUsage(model, inputTokens, outputTokens, cost, 'stream');

    const result: DriverResult = {
      success: true,
      data: {
        model,
        chunks,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
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
    const info = OPENAI_MODELS[model];
    if (!info) return 0;
    const inputCost = (inputTokens / 1000) * info.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * info.outputCostPer1kTokens;
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private resolveModel(requested?: string): string {
    if (requested && OPENAI_MODELS[requested]) return requested;
    return this._driverConfig?.defaultModel ?? 'gpt-4o';
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
      provider: 'openai',
      model,
      inputTokens,
      outputTokens,
      costUsd,
      taskType,
    };

    await this.otzarService.recordUsage(usage);
  }

  private createOperationId(): string {
    return `oai-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
