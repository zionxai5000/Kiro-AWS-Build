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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import { RateLimiter } from './anthropic-driver.js';
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
export declare const OPENAI_MODELS: Record<string, OpenAIModelInfo>;
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
export interface OpenAIStreamChunk {
    type: 'chunk' | 'done' | 'error';
    content?: string;
    model?: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export declare class OpenAIDriver extends BaseDriver<OpenAIDriverConfig> {
    private readonly credentialManager;
    private readonly otzarService;
    readonly name = "openai-llm";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _rateLimiters;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager, otzarService: OtzarService);
    protected doConnect(config: OpenAIDriverConfig): Promise<void>;
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
//# sourceMappingURL=openai-driver.d.ts.map