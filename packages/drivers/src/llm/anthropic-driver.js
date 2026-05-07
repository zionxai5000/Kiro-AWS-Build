"use strict";
/**
 * Anthropic LLM Provider Driver — Claude Haiku, Sonnet, Opus.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager and Otzar,
 * and implements model-specific rate limiting, token counting, and cost calculation.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 5.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicDriver = exports.RateLimiter = exports.ANTHROPIC_MODELS = void 0;
const driver_js_1 = require("../base/driver.js");
exports.ANTHROPIC_MODELS = {
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
class RateLimiter {
    requestsPerMinute;
    tokensPerMinute;
    _requestTimestamps = [];
    _tokenTimestamps = [];
    constructor(requestsPerMinute, tokensPerMinute) {
        this.requestsPerMinute = requestsPerMinute;
        this.tokensPerMinute = tokensPerMinute;
    }
    /**
     * Check whether a request with the given token count is allowed.
     * Cleans up stale entries older than 60 seconds.
     */
    allowRequest(estimatedTokens, now = Date.now()) {
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
    recordRequest(tokens, now = Date.now()) {
        this._requestTimestamps.push(now);
        this._tokenTimestamps.push({ time: now, tokens });
    }
    /** Time in ms until the next request window opens. */
    getRetryAfterMs(now = Date.now()) {
        if (this._requestTimestamps.length === 0)
            return 0;
        const oldest = Math.min(...this._requestTimestamps);
        return Math.max(0, oldest + 60_000 - now);
    }
}
exports.RateLimiter = RateLimiter;
// ---------------------------------------------------------------------------
// Anthropic Driver
// ---------------------------------------------------------------------------
class AnthropicDriver extends driver_js_1.BaseDriver {
    credentialManager;
    otzarService;
    name = 'anthropic-llm';
    version = '1.0.0';
    _apiKey = null;
    _driverConfig = null;
    _rateLimiters = new Map();
    _completedOperations = new Map();
    constructor(credentialManager, otzarService) {
        // Anthropic-specific retry: 3 attempts, 2s initial delay (respecting rate limits)
        super({ maxAttempts: 3, initialDelayMs: 2000 });
        this.credentialManager = credentialManager;
        this.otzarService = otzarService;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
        this._apiKey = await this.credentialManager.getCredential('anthropic', 'api-key');
        if (!this._apiKey) {
            throw new Error('Failed to retrieve Anthropic API key from Credential Manager');
        }
        this._driverConfig = config;
        // Initialize rate limiters per model
        for (const [modelId, info] of Object.entries(exports.ANTHROPIC_MODELS)) {
            this._rateLimiters.set(modelId, new RateLimiter(info.requestsPerMinute, info.tokensPerMinute));
        }
        this.updateSessionData({ provider: 'anthropic', authenticated: true });
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
        const modelInfo = exports.ANTHROPIC_MODELS[model];
        if (!modelInfo) {
            return this.errorResult(operationId, 'INVALID_MODEL', `Unknown model: ${model}`, false);
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
        // Mock response (structural implementation — no real HTTP call)
        const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
        const cost = this.calculateCost(model, inputTokens, outputTokens);
        // Record rate limit usage
        rateLimiter?.recordRequest(inputTokens + outputTokens);
        // Report usage to Otzar
        await this.reportUsage(model, inputTokens, outputTokens, cost, 'chat');
        const result = {
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
    async handleComplete(operation, operationId) {
        const model = this.resolveModel(operation.params.model);
        const prompt = operation.params.prompt;
        if (!prompt) {
            return this.errorResult(operationId, 'INVALID_PARAMS', 'prompt is required for complete operation', false);
        }
        const modelInfo = exports.ANTHROPIC_MODELS[model];
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
    async handleEmbed(operation, operationId) {
        // Anthropic doesn't natively support embeddings, but we handle the operation
        // by returning an error directing to use OpenAI's embedding models instead.
        return this.errorResult(operationId, 'UNSUPPORTED_OPERATION', 'Anthropic does not support embedding operations. Use OpenAI text-embedding-3-small instead.', false);
    }
    async handleStream(operation, operationId) {
        const model = this.resolveModel(operation.params.model);
        const messages = operation.params.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return this.errorResult(operationId, 'INVALID_PARAMS', 'messages array is required for stream operation', false);
        }
        const modelInfo = exports.ANTHROPIC_MODELS[model];
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
        // Mock streaming: produce an array of chunks representing the stream
        const outputTokens = Math.min(maxOutputTokens, Math.floor(inputTokens * 0.5) + 50);
        const cost = this.calculateCost(model, inputTokens, outputTokens);
        const chunks = [
            { type: 'message_start', model },
            { type: 'content_block_delta', content: `[Mock streamed response from ${modelInfo.displayName}` },
            { type: 'content_block_delta', content: ' — chunk 2]' },
            { type: 'message_stop', usage: { inputTokens, outputTokens } },
        ];
        rateLimiter?.recordRequest(inputTokens + outputTokens);
        await this.reportUsage(model, inputTokens, outputTokens, cost, 'stream');
        const result = {
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
    estimateTokens(text) {
        return Math.max(1, Math.ceil(text.length / 4));
    }
    /** Calculate cost in USD for a given model and token counts. */
    calculateCost(model, inputTokens, outputTokens) {
        const info = exports.ANTHROPIC_MODELS[model];
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
        if (requested && exports.ANTHROPIC_MODELS[requested])
            return requested;
        return this._driverConfig?.defaultModel ?? 'claude-sonnet';
    }
    async reportUsage(model, inputTokens, outputTokens, costUsd, taskType) {
        if (!this._driverConfig)
            return;
        const usage = {
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
    createOperationId() {
        return `anth-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.AnthropicDriver = AnthropicDriver;
//# sourceMappingURL=anthropic-driver.js.map