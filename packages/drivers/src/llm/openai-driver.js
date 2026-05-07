"use strict";
/**
 * OpenAI LLM Provider Driver — GPT-4o-mini, GPT-4o, GPT-4.5.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager and Otzar,
 * and implements model-specific rate limiting, token counting, and cost calculation.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 5.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIDriver = exports.OPENAI_MODELS = void 0;
const driver_js_1 = require("../base/driver.js");
const anthropic_driver_js_1 = require("./anthropic-driver.js");
exports.OPENAI_MODELS = {
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
// OpenAI Driver
// ---------------------------------------------------------------------------
class OpenAIDriver extends driver_js_1.BaseDriver {
    credentialManager;
    otzarService;
    name = 'openai-llm';
    version = '1.0.0';
    _apiKey = null;
    _driverConfig = null;
    _rateLimiters = new Map();
    _completedOperations = new Map();
    constructor(credentialManager, otzarService) {
        // OpenAI-specific retry: 3 attempts, 1s initial delay
        super({ maxAttempts: 3, initialDelayMs: 1000 });
        this.credentialManager = credentialManager;
        this.otzarService = otzarService;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
        this._apiKey = await this.credentialManager.getCredential('openai', 'api-key');
        if (!this._apiKey) {
            throw new Error('Failed to retrieve OpenAI API key from Credential Manager');
        }
        this._driverConfig = config;
        // Initialize rate limiters per model
        for (const [modelId, info] of Object.entries(exports.OPENAI_MODELS)) {
            this._rateLimiters.set(modelId, new anthropic_driver_js_1.RateLimiter(info.requestsPerMinute, info.tokensPerMinute));
        }
        this.updateSessionData({ provider: 'openai', authenticated: true });
    }
    async doDisconnect() {
        this._apiKey = null;
        this._driverConfig = null;
        this._rateLimiters.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
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
                return this.errorResult(operationId, 'UNSUPPORTED_OPERATION', `Unsupported operation type: ${operationType}`, false);
        }
    }
    async doVerify(operationId) {
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
    async handleChat(operation, operationId) {
        const model = this.resolveModel(operation.params.model);
        const messages = operation.params.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return this.errorResult(operationId, 'INVALID_PARAMS', 'messages array is required for chat operation', false);
        }
        const modelInfo = exports.OPENAI_MODELS[model];
        if (!modelInfo) {
            return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
        }
        if (modelInfo.supportsEmbedding) {
            return this.errorResult(operationId, 'INVALID_MODEL', `Model ${model} is an embedding model, not a chat model`, false);
        }
        // Estimate tokens
        const inputTokens = this.estimateTokens(messages.map((m) => m.content).join(' '));
        const maxOutputTokens = operation.params.maxTokens ?? 1024;
        // Rate limit check
        const rateLimiter = this._rateLimiters.get(model);
        if (rateLimiter && !rateLimiter.allowRequest(inputTokens + maxOutputTokens)) {
            const retryAfter = rateLimiter.getRetryAfterMs();
            return this.errorResult(operationId, 'RATE_LIMITED', `Rate limit exceeded for model ${model}. Retry after ${retryAfter}ms`, true, { retryAfterMs: retryAfter });
        }
        // Mock response
        const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
        const cost = this.calculateCost(model, inputTokens, outputTokens);
        rateLimiter?.recordRequest(inputTokens + outputTokens);
        await this.reportUsage(model, inputTokens, outputTokens, cost, 'chat');
        const result = {
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
    async handleComplete(operation, operationId) {
        const model = this.resolveModel(operation.params.model);
        const prompt = operation.params.prompt;
        if (!prompt) {
            return this.errorResult(operationId, 'INVALID_PARAMS', 'prompt is required for complete operation', false);
        }
        const modelInfo = exports.OPENAI_MODELS[model];
        if (!modelInfo) {
            return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
        }
        const inputTokens = this.estimateTokens(prompt);
        const maxOutputTokens = operation.params.maxTokens ?? 1024;
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
        const result = {
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
    async handleEmbed(operation, operationId) {
        const model = operation.params.model ?? 'text-embedding-3-small';
        const input = operation.params.input;
        if (!input) {
            return this.errorResult(operationId, 'INVALID_PARAMS', 'input is required for embed operation', false);
        }
        const modelInfo = exports.OPENAI_MODELS[model];
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
        const result = {
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
    async handleStream(operation, operationId) {
        const model = this.resolveModel(operation.params.model);
        const messages = operation.params.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return this.errorResult(operationId, 'INVALID_PARAMS', 'messages array is required for stream operation', false);
        }
        const modelInfo = exports.OPENAI_MODELS[model];
        if (!modelInfo) {
            return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
        }
        const inputTokens = this.estimateTokens(messages.map((m) => m.content).join(' '));
        const maxOutputTokens = operation.params.maxTokens ?? 1024;
        const rateLimiter = this._rateLimiters.get(model);
        if (rateLimiter && !rateLimiter.allowRequest(inputTokens + maxOutputTokens)) {
            const retryAfter = rateLimiter.getRetryAfterMs();
            return this.errorResult(operationId, 'RATE_LIMITED', `Rate limit exceeded for model ${model}`, true, {
                retryAfterMs: retryAfter,
            });
        }
        const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
        const cost = this.calculateCost(model, inputTokens, outputTokens);
        const chunks = [
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
        const result = {
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
    estimateTokens(text) {
        return Math.max(1, Math.ceil(text.length / 4));
    }
    /** Calculate cost in USD for a given model and token counts. */
    calculateCost(model, inputTokens, outputTokens) {
        const info = exports.OPENAI_MODELS[model];
        if (!info)
            return 0;
        const inputCost = (inputTokens / 1000) * info.inputCostPer1kTokens;
        const outputCost = (outputTokens / 1000) * info.outputCostPer1kTokens;
        return parseFloat((inputCost + outputCost).toFixed(6));
    }
    // =====================================================================
    // Helpers
    // =====================================================================
    resolveModel(requested) {
        if (requested && exports.OPENAI_MODELS[requested])
            return requested;
        return this._driverConfig?.defaultModel ?? 'gpt-4o';
    }
    async reportUsage(model, inputTokens, outputTokens, costUsd, taskType) {
        if (!this._driverConfig)
            return;
        const usage = {
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
    createOperationId() {
        return `oai-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    errorResult(operationId, code, message, retryable, details) {
        return {
            success: false,
            error: { code, message, retryable, details },
            retryable,
            operationId,
        };
    }
    /** Expose rate limiters for testing. */
    getRateLimiter(model) {
        return this._rateLimiters.get(model);
    }
}
exports.OpenAIDriver = OpenAIDriver;
//# sourceMappingURL=openai-driver.js.map