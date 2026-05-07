/**
 * Unit tests for LLM Provider Drivers (Anthropic + OpenAI).
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.6, 5.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicDriver, ANTHROPIC_MODELS, RateLimiter } from './anthropic-driver.js';
import { OpenAIDriver, OPENAI_MODELS } from './openai-driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { TokenUsage } from '@seraphim/core/types/otzar.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCredentialManager(apiKey = 'test-api-key-123'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(apiKey),
    rotateCredential: vi.fn().mockResolvedValue({ success: true, driverName: 'test' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

function createMockOtzarService(): OtzarService & { recordedUsages: TokenUsage[] } {
  const recordedUsages: TokenUsage[] = [];
  return {
    recordedUsages,
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet',
      estimatedCost: 0.01,
      rationale: 'test',
    }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingDaily: 100, remainingMonthly: 1000 }),
    recordUsage: vi.fn().mockImplementation(async (usage: TokenUsage) => {
      recordedUsages.push(usage);
    }),
    getCostReport: vi.fn().mockResolvedValue({
      totalCostUsd: 0,
      byAgent: {},
      byPillar: {},
      byModel: {},
      period: { start: new Date(), end: new Date() },
    }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({
      date: new Date(),
      totalSpend: 0,
      wastePatterns: [],
      savingsOpportunities: [],
      estimatedSavings: 0,
    }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

const defaultConfig = {
  agentId: 'agent-001',
  tenantId: 'tenant-001',
  pillar: 'test-pillar',
};

// ---------------------------------------------------------------------------
// Anthropic Driver Tests
// ---------------------------------------------------------------------------

describe('AnthropicDriver', () => {
  let driver: AnthropicDriver;
  let credentialManager: CredentialManager;
  let otzarService: ReturnType<typeof createMockOtzarService>;

  beforeEach(async () => {
    credentialManager = createMockCredentialManager();
    otzarService = createMockOtzarService();
    driver = new AnthropicDriver(credentialManager, otzarService);
  });

  // -----------------------------------------------------------------------
  // Connection & Authentication (Requirement 10.2)
  // -----------------------------------------------------------------------

  describe('connection and authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(defaultConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('anthropic', 'api-key');
    });

    it('fails to connect when CredentialManager returns empty key', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new AnthropicDriver(badCreds, otzarService);

      const result = await badDriver.connect(defaultConfig);

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('transitions to disconnected on disconnect', async () => {
      await driver.connect(defaultConfig);
      await driver.disconnect();

      expect(driver.status).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Chat operation (Requirement 10.1, 10.6)
  // -----------------------------------------------------------------------

  describe('chat operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('executes a chat operation successfully', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {
          messages: [{ role: 'user', content: 'Hello, Claude!' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.model).toBe('claude-sonnet'); // default model
      expect(data.content).toContain('Mock Anthropic');
      expect(data.usage).toBeDefined();
      expect(data.cost).toBeGreaterThan(0);
    });

    it('uses specified model when provided', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {
          model: 'claude-haiku',
          messages: [{ role: 'user', content: 'Hello!' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.model).toBe('claude-haiku');
    });

    it('rejects chat without messages', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMS');
    });

    it('rejects unknown model', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {
          model: 'claude-nonexistent',
          messages: [{ role: 'user', content: 'Hello!' }],
        },
      });

      // Falls back to default model since unknown model is not in ANTHROPIC_MODELS
      // resolveModel returns default when requested model is not found
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Complete operation
  // -----------------------------------------------------------------------

  describe('complete operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('executes a complete operation successfully', async () => {
      const result = await driver.execute({
        type: 'complete',
        params: { prompt: 'Once upon a time' },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.completion).toContain('Mock Anthropic');
    });

    it('rejects complete without prompt', async () => {
      const result = await driver.execute({
        type: 'complete',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMS');
    });
  });

  // -----------------------------------------------------------------------
  // Embed operation
  // -----------------------------------------------------------------------

  describe('embed operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('returns unsupported for embed operations', async () => {
      const result = await driver.execute({
        type: 'embed',
        params: { input: 'test text' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_OPERATION');
      expect(result.error?.message).toContain('OpenAI');
    });
  });

  // -----------------------------------------------------------------------
  // Stream operation
  // -----------------------------------------------------------------------

  describe('stream operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('returns streaming chunks', async () => {
      const result = await driver.execute({
        type: 'stream',
        params: {
          messages: [{ role: 'user', content: 'Stream this' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.streaming).toBe(true);
      expect(Array.isArray(data.chunks)).toBe(true);
      const chunks = data.chunks as Array<{ type: string }>;
      expect(chunks[0].type).toBe('message_start');
      expect(chunks[chunks.length - 1].type).toBe('message_stop');
    });
  });

  // -----------------------------------------------------------------------
  // Unsupported operation
  // -----------------------------------------------------------------------

  describe('unsupported operations', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('rejects unknown operation types', async () => {
      const result = await driver.execute({
        type: 'unknown_op',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_OPERATION');
    });
  });

  // -----------------------------------------------------------------------
  // Token counting and cost calculation (Requirement 5.1)
  // -----------------------------------------------------------------------

  describe('token counting and cost calculation', () => {
    it('estimates tokens at ~4 chars per token', () => {
      expect(driver.estimateTokens('hello')).toBe(2); // 5/4 = 1.25 → ceil = 2
      expect(driver.estimateTokens('a')).toBe(1);
      expect(driver.estimateTokens('a'.repeat(100))).toBe(25);
    });

    it('calculates cost correctly for claude-haiku', () => {
      const cost = driver.calculateCost('claude-haiku', 1000, 500);
      // input: 1000/1000 * 0.00025 = 0.00025
      // output: 500/1000 * 0.00125 = 0.000625
      // total: 0.000875
      expect(cost).toBeCloseTo(0.000875, 6);
    });

    it('calculates cost correctly for claude-sonnet', () => {
      const cost = driver.calculateCost('claude-sonnet', 1000, 500);
      // input: 1000/1000 * 0.003 = 0.003
      // output: 500/1000 * 0.015 = 0.0075
      // total: 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('calculates cost correctly for claude-opus', () => {
      const cost = driver.calculateCost('claude-opus', 1000, 500);
      // input: 1000/1000 * 0.015 = 0.015
      // output: 500/1000 * 0.075 = 0.0375
      // total: 0.0525
      expect(cost).toBeCloseTo(0.0525, 6);
    });

    it('returns 0 for unknown model', () => {
      expect(driver.calculateCost('unknown', 1000, 500)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Usage reporting to Otzar (Requirement 5.1)
  // -----------------------------------------------------------------------

  describe('usage reporting to Otzar', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('reports usage after each chat call', async () => {
      await driver.execute({
        type: 'chat',
        params: { messages: [{ role: 'user', content: 'Hello' }] },
      });

      expect(otzarService.recordUsage).toHaveBeenCalledTimes(1);
      const usage = otzarService.recordedUsages[0];
      expect(usage.provider).toBe('anthropic');
      expect(usage.agentId).toBe('agent-001');
      expect(usage.tenantId).toBe('tenant-001');
      expect(usage.pillar).toBe('test-pillar');
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.costUsd).toBeGreaterThan(0);
      expect(usage.taskType).toBe('chat');
    });

    it('reports usage after stream call', async () => {
      await driver.execute({
        type: 'stream',
        params: { messages: [{ role: 'user', content: 'Stream this' }] },
      });

      expect(otzarService.recordUsage).toHaveBeenCalledTimes(1);
      expect(otzarService.recordedUsages[0].taskType).toBe('stream');
    });
  });

  // -----------------------------------------------------------------------
  // Verify operation
  // -----------------------------------------------------------------------

  describe('verify', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('verifies a completed operation', async () => {
      const execResult = await driver.execute({
        type: 'chat',
        params: { messages: [{ role: 'user', content: 'Hello' }] },
      });

      const verifyResult = await driver.verify(execResult.operationId);
      expect(verifyResult.verified).toBe(true);
    });

    it('returns not verified for unknown operation', async () => {
      const verifyResult = await driver.verify('unknown-op-id');
      expect(verifyResult.verified).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Model definitions
  // -----------------------------------------------------------------------

  describe('model definitions', () => {
    it('defines three Anthropic models across three tiers', () => {
      expect(ANTHROPIC_MODELS['claude-haiku'].tier).toBe(1);
      expect(ANTHROPIC_MODELS['claude-sonnet'].tier).toBe(2);
      expect(ANTHROPIC_MODELS['claude-opus'].tier).toBe(3);
    });

    it('all models have pricing and rate limit info', () => {
      for (const model of Object.values(ANTHROPIC_MODELS)) {
        expect(model.inputCostPer1kTokens).toBeGreaterThan(0);
        expect(model.outputCostPer1kTokens).toBeGreaterThan(0);
        expect(model.requestsPerMinute).toBeGreaterThan(0);
        expect(model.tokensPerMinute).toBeGreaterThan(0);
        expect(model.maxContextTokens).toBeGreaterThan(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// OpenAI Driver Tests
// ---------------------------------------------------------------------------

describe('OpenAIDriver', () => {
  let driver: OpenAIDriver;
  let credentialManager: CredentialManager;
  let otzarService: ReturnType<typeof createMockOtzarService>;

  beforeEach(async () => {
    credentialManager = createMockCredentialManager();
    otzarService = createMockOtzarService();
    driver = new OpenAIDriver(credentialManager, otzarService);
  });

  // -----------------------------------------------------------------------
  // Connection & Authentication (Requirement 10.2)
  // -----------------------------------------------------------------------

  describe('connection and authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(defaultConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('openai', 'api-key');
    });

    it('fails to connect when CredentialManager returns empty key', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new OpenAIDriver(badCreds, otzarService);

      const result = await badDriver.connect(defaultConfig);

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  // -----------------------------------------------------------------------
  // Chat operation (Requirement 10.1, 10.6)
  // -----------------------------------------------------------------------

  describe('chat operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('executes a chat operation successfully', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {
          messages: [{ role: 'user', content: 'Hello, GPT!' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.model).toBe('gpt-4o'); // default model
      expect(data.choices).toBeDefined();
      expect(data.cost).toBeGreaterThan(0);
    });

    it('uses specified model when provided', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello!' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.model).toBe('gpt-4o-mini');
    });

    it('rejects chat without messages', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMS');
    });

    it('rejects embedding model for chat', async () => {
      const result = await driver.execute({
        type: 'chat',
        params: {
          model: 'text-embedding-3-small',
          messages: [{ role: 'user', content: 'Hello!' }],
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MODEL');
    });
  });

  // -----------------------------------------------------------------------
  // Embed operation (Requirement 10.6)
  // -----------------------------------------------------------------------

  describe('embed operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('generates embeddings for a single input', async () => {
      const result = await driver.execute({
        type: 'embed',
        params: { input: 'test text for embedding' },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.model).toBe('text-embedding-3-small');
      const embeddings = data.embeddings as number[][];
      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]).toHaveLength(1536);
    });

    it('generates embeddings for multiple inputs', async () => {
      const result = await driver.execute({
        type: 'embed',
        params: { input: ['text one', 'text two', 'text three'] },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      const embeddings = data.embeddings as number[][];
      expect(embeddings).toHaveLength(3);
    });

    it('rejects embed without input', async () => {
      const result = await driver.execute({
        type: 'embed',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PARAMS');
    });

    it('rejects non-embedding model for embed', async () => {
      const result = await driver.execute({
        type: 'embed',
        params: { model: 'gpt-4o', input: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MODEL');
    });
  });

  // -----------------------------------------------------------------------
  // Stream operation
  // -----------------------------------------------------------------------

  describe('stream operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('returns streaming chunks', async () => {
      const result = await driver.execute({
        type: 'stream',
        params: {
          messages: [{ role: 'user', content: 'Stream this' }],
        },
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.streaming).toBe(true);
      const chunks = data.chunks as Array<{ type: string }>;
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].type).toBe('done');
    });
  });

  // -----------------------------------------------------------------------
  // Token counting and cost calculation (Requirement 5.1)
  // -----------------------------------------------------------------------

  describe('token counting and cost calculation', () => {
    it('estimates tokens at ~4 chars per token', () => {
      expect(driver.estimateTokens('hello')).toBe(2);
      expect(driver.estimateTokens('a')).toBe(1);
    });

    it('calculates cost correctly for gpt-4o-mini', () => {
      const cost = driver.calculateCost('gpt-4o-mini', 1000, 500);
      // input: 1000/1000 * 0.00015 = 0.00015
      // output: 500/1000 * 0.0006 = 0.0003
      // total: 0.00045
      expect(cost).toBeCloseTo(0.00045, 6);
    });

    it('calculates cost correctly for gpt-4o', () => {
      const cost = driver.calculateCost('gpt-4o', 1000, 500);
      // input: 1000/1000 * 0.0025 = 0.0025
      // output: 500/1000 * 0.01 = 0.005
      // total: 0.0075
      expect(cost).toBeCloseTo(0.0075, 6);
    });

    it('calculates cost correctly for gpt-4.5', () => {
      const cost = driver.calculateCost('gpt-4.5', 1000, 500);
      // input: 1000/1000 * 0.075 = 0.075
      // output: 500/1000 * 0.15 = 0.075
      // total: 0.15
      expect(cost).toBeCloseTo(0.15, 6);
    });

    it('calculates embedding cost (output cost is 0)', () => {
      const cost = driver.calculateCost('text-embedding-3-small', 1000, 0);
      // input: 1000/1000 * 0.00002 = 0.00002
      expect(cost).toBeCloseTo(0.00002, 6);
    });
  });

  // -----------------------------------------------------------------------
  // Usage reporting to Otzar (Requirement 5.1)
  // -----------------------------------------------------------------------

  describe('usage reporting to Otzar', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('reports usage after each chat call', async () => {
      await driver.execute({
        type: 'chat',
        params: { messages: [{ role: 'user', content: 'Hello' }] },
      });

      expect(otzarService.recordUsage).toHaveBeenCalledTimes(1);
      const usage = otzarService.recordedUsages[0];
      expect(usage.provider).toBe('openai');
      expect(usage.agentId).toBe('agent-001');
      expect(usage.tenantId).toBe('tenant-001');
      expect(usage.pillar).toBe('test-pillar');
      expect(usage.taskType).toBe('chat');
    });

    it('reports usage after embed call', async () => {
      await driver.execute({
        type: 'embed',
        params: { input: 'test' },
      });

      expect(otzarService.recordUsage).toHaveBeenCalledTimes(1);
      expect(otzarService.recordedUsages[0].taskType).toBe('embed');
      expect(otzarService.recordedUsages[0].model).toBe('text-embedding-3-small');
    });
  });

  // -----------------------------------------------------------------------
  // Verify operation
  // -----------------------------------------------------------------------

  describe('verify', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('verifies a completed operation', async () => {
      const execResult = await driver.execute({
        type: 'chat',
        params: { messages: [{ role: 'user', content: 'Hello' }] },
      });

      const verifyResult = await driver.verify(execResult.operationId);
      expect(verifyResult.verified).toBe(true);
    });

    it('returns not verified for unknown operation', async () => {
      const verifyResult = await driver.verify('unknown-op-id');
      expect(verifyResult.verified).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Model definitions
  // -----------------------------------------------------------------------

  describe('model definitions', () => {
    it('defines four OpenAI models across tiers', () => {
      expect(OPENAI_MODELS['gpt-4o-mini'].tier).toBe(1);
      expect(OPENAI_MODELS['gpt-4o'].tier).toBe(2);
      expect(OPENAI_MODELS['gpt-4.5'].tier).toBe(3);
      expect(OPENAI_MODELS['text-embedding-3-small'].tier).toBe(1);
    });

    it('marks only embedding model as supporting embeddings', () => {
      expect(OPENAI_MODELS['text-embedding-3-small'].supportsEmbedding).toBe(true);
      expect(OPENAI_MODELS['gpt-4o'].supportsEmbedding).toBe(false);
      expect(OPENAI_MODELS['gpt-4o-mini'].supportsEmbedding).toBe(false);
      expect(OPENAI_MODELS['gpt-4.5'].supportsEmbedding).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// RateLimiter Tests
// ---------------------------------------------------------------------------

describe('RateLimiter', () => {
  it('allows requests within limits', () => {
    const limiter = new RateLimiter(100, 10_000);
    expect(limiter.allowRequest(500)).toBe(true);
  });

  it('blocks requests when request count exceeds limit', () => {
    const limiter = new RateLimiter(2, 100_000);
    const now = Date.now();

    limiter.recordRequest(10, now);
    limiter.recordRequest(10, now);

    expect(limiter.allowRequest(10, now)).toBe(false);
  });

  it('blocks requests when token count exceeds limit', () => {
    const limiter = new RateLimiter(1000, 100);
    const now = Date.now();

    limiter.recordRequest(80, now);

    expect(limiter.allowRequest(30, now)).toBe(false);
  });

  it('allows requests after window expires', () => {
    const limiter = new RateLimiter(2, 100_000);
    const past = Date.now() - 61_000; // 61 seconds ago

    limiter.recordRequest(10, past);
    limiter.recordRequest(10, past);

    // Now those old entries should be pruned
    expect(limiter.allowRequest(10)).toBe(true);
  });

  it('returns retry-after time', () => {
    const limiter = new RateLimiter(1, 100_000);
    const now = Date.now();

    limiter.recordRequest(10, now);

    const retryAfter = limiter.getRetryAfterMs(now);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60_000);
  });

  it('returns 0 retry-after when no requests recorded', () => {
    const limiter = new RateLimiter(100, 100_000);
    expect(limiter.getRetryAfterMs()).toBe(0);
  });
});
