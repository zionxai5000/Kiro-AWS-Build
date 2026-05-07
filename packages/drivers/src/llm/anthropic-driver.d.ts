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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
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
export declare const ANTHROPIC_MODELS: Record<string, AnthropicModelInfo>;
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
export interface RateLimiterState {
    requestTimestamps: number[];
    tokenTimestamps: Array<{
        time: number;
        tokens: number;
    }>;
}
export declare class RateLimiter {
    private readonly requestsPerMinute;
    private readonly tokensPerMinute;
    private _requestTimestamps;
    private _tokenTimestamps;
    constructor(requestsPerMinute: number, tokensPerMinute: number);
    /**
     * Check whether a request with the given token count is allowed.
     * Cleans up stale entries older than 60 seconds.
     */
    allowRequest(estimatedTokens: number, now?: number): boolean;
    /** Record a completed request for rate tracking. */
    recordRequest(tokens: number, now?: number): void;
    /** Time in ms until the next request window opens. */
    getRetryAfterMs(now?: number): number;
}
export interface StreamChunk {
    type: 'content_block_delta' | 'message_start' | 'message_stop' | 'error';
    content?: string;
    model?: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}
export declare class AnthropicDriver extends BaseDriver<AnthropicDriverConfig> {
    private readonly credentialManager;
    private readonly otzarService;
    readonly name = "anthropic-llm";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _rateLimiters;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager, otzarService: OtzarService);
    protected doConnect(config: AnthropicDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleChat;
    private handleComplete;
    private handleEmbed;
    private handleStream;
    /** Rough token estimate: ~4 characters per token (standard approximation). */
    estimateTokens(text: string): number;
    /** Calculate cost in USD for a given model and token counts. */
    calculateCost(model: string, inputTokens: number, outputTokens: number): number;
    private resolveModel;
    private reportUsage;
    private createOperationId;
    private errorResult;
    /** Expose rate limiters for testing. */
    getRateLimiter(model: string): RateLimiter | undefined;
}
//# sourceMappingURL=anthropic-driver.d.ts.map