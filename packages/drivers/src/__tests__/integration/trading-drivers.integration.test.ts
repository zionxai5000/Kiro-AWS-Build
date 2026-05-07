/**
 * Integration tests for Kalshi and Polymarket trading drivers.
 *
 * Tests the full driver lifecycle with mocked API responses:
 * authentication, market listing, trade placement, position monitoring,
 * and balance check.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 13.1, 13.2, 13.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KalshiDriver, KALSHI_ERROR_CODES } from '../../trading/kalshi-driver.js';
import { PolymarketDriver, POLYMARKET_ERROR_CODES } from '../../trading/polymarket-driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCredentialManager(apiKey = 'test-trading-api-key'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(apiKey),
    rotateCredential: vi.fn().mockResolvedValue({ success: true, driverName: 'test' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// Kalshi Driver — Full Lifecycle Integration
// ---------------------------------------------------------------------------

describe('Kalshi Driver Integration', () => {
  let driver: KalshiDriver;
  let credentialManager: CredentialManager;

  const kalshiConfig = {
    apiKeyId: 'test-kalshi-key',
    maxPositionSize: 100,
    dailyLossLimitUsd: 500,
    sandbox: true,
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new KalshiDriver(credentialManager);
  });

  describe('authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(kalshiConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('kalshi', 'api-key');
    });

    it('fails when credential manager returns empty key', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new KalshiDriver(badCreds);

      const result = await badDriver.connect(kalshiConfig);
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails when maxPositionSize is invalid', async () => {
      const result = await driver.connect({
        ...kalshiConfig,
        maxPositionSize: 0,
      });
      expect(result.success).toBe(false);
    });

    it('fails when dailyLossLimitUsd is invalid', async () => {
      const result = await driver.connect({
        ...kalshiConfig,
        dailyLossLimitUsd: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('full connect → execute → verify → disconnect lifecycle', () => {
    it('completes the full lifecycle for market listing', async () => {
      await driver.connect(kalshiConfig);

      const marketsResult = await driver.execute({
        type: 'getMarkets',
        params: { status: 'open', limit: 10 },
      });
      expect(marketsResult.success).toBe(true);
      const marketsData = marketsResult.data as Record<string, unknown>;
      expect(marketsData.markets).toBeDefined();
      expect(Array.isArray(marketsData.markets)).toBe(true);

      const verifyResult = await driver.verify(marketsResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
      expect(driver.status).toBe('disconnected');
    });

    it('completes the full lifecycle for trade placement', async () => {
      await driver.connect(kalshiConfig);

      const tradeResult = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'market-001',
          side: 'yes',
          quantity: 10,
          price: 0.65,
          type: 'limit',
        },
      });
      expect(tradeResult.success).toBe(true);
      const tradeData = tradeResult.data as Record<string, unknown>;
      expect(tradeData.marketId).toBe('market-001');
      expect(tradeData.side).toBe('yes');
      expect(tradeData.quantity).toBe(10);
      expect(tradeData.status).toBe('filled');

      const verifyResult = await driver.verify(tradeResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
    });

    it('completes the full lifecycle for position monitoring', async () => {
      await driver.connect(kalshiConfig);

      // Place a trade first to create a position
      await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'market-001',
          side: 'yes',
          quantity: 5,
          price: 0.50,
        },
      });

      // Check positions
      const positionsResult = await driver.execute({
        type: 'getPositions',
        params: {},
      });
      expect(positionsResult.success).toBe(true);
      const posData = positionsResult.data as Record<string, unknown>;
      const positions = posData.positions as Array<Record<string, unknown>>;
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].marketId).toBe('market-001');

      await driver.disconnect();
    });

    it('completes the full lifecycle for balance check', async () => {
      await driver.connect(kalshiConfig);

      const balanceResult = await driver.execute({
        type: 'getBalance',
        params: {},
      });
      expect(balanceResult.success).toBe(true);
      const balanceData = balanceResult.data as Record<string, unknown>;
      expect(balanceData.currency).toBe('USD');
      expect(balanceData.balance).toBeDefined();
      expect(balanceData.availableBalance).toBeDefined();

      await driver.disconnect();
    });
  });

  describe('risk management — position limits', () => {
    beforeEach(async () => {
      await driver.connect(kalshiConfig);
    });

    afterEach(async () => {
      await driver.disconnect();
    });

    it('enforces position size limits', async () => {
      // Place a trade that would exceed the limit
      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'market-limit-test',
          side: 'yes',
          quantity: 150, // exceeds maxPositionSize of 100
          price: 0.50,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.POSITION_LIMIT_EXCEEDED);
    });

    it('enforces daily loss limits', async () => {
      // Record enough loss to approach the limit
      driver.recordRealizedLoss(490);

      // Try to place a trade that would exceed daily loss limit
      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'market-loss-test',
          side: 'yes',
          quantity: 50,
          price: 0.50, // potential loss = 50 * 0.50 = 25, total = 515 > 500
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED);
    });
  });

  describe('error handling and retry behavior', () => {
    beforeEach(async () => {
      await driver.connect(kalshiConfig);
    });

    afterEach(async () => {
      await driver.disconnect();
    });

    it('returns error for unsupported operation types', async () => {
      const result = await driver.execute({
        type: 'unsupported_op',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.UNSUPPORTED_OPERATION);
    });

    it('validates trade parameters', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'market-001',
          side: 'invalid_side',
          quantity: 10,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });

    it('validates price range', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'market-001',
          side: 'yes',
          quantity: 10,
          price: 1.50, // > 0.99
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });
  });

  describe('circuit breaker state transitions', () => {
    it('starts with closed circuit breaker', async () => {
      await driver.connect(kalshiConfig);
      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });

    it('remains closed after successful operations', async () => {
      await driver.connect(kalshiConfig);

      await driver.execute({
        type: 'getBalance',
        params: {},
      });

      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });
  });
});

// ---------------------------------------------------------------------------
// Polymarket Driver — Full Lifecycle Integration
// ---------------------------------------------------------------------------

describe('Polymarket Driver Integration', () => {
  let driver: PolymarketDriver;
  let credentialManager: CredentialManager;

  const polyConfig = {
    apiKey: 'test-poly-key',
    maxPositionSize: 200,
    dailyLossLimitUsd: 1000,
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new PolymarketDriver(credentialManager);
  });

  describe('authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(polyConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('polymarket', 'api-key');
    });

    it('fails when credential manager returns empty key', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new PolymarketDriver(badCreds);

      const result = await badDriver.connect(polyConfig);
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('full connect → execute → verify → disconnect lifecycle', () => {
    it('completes the full lifecycle for market listing', async () => {
      await driver.connect(polyConfig);

      const marketsResult = await driver.execute({
        type: 'getMarkets',
        params: { status: 'active', limit: 10 },
      });
      expect(marketsResult.success).toBe(true);
      const marketsData = marketsResult.data as Record<string, unknown>;
      expect(marketsData.markets).toBeDefined();

      const verifyResult = await driver.verify(marketsResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
      expect(driver.status).toBe('disconnected');
    });

    it('completes the full lifecycle for trade placement', async () => {
      await driver.connect(polyConfig);

      const tradeResult = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'poly-market-001',
          outcome: 'Yes',
          shares: 20,
          price: 0.70,
          type: 'limit',
        },
      });
      expect(tradeResult.success).toBe(true);
      const tradeData = tradeResult.data as Record<string, unknown>;
      expect(tradeData.marketId).toBe('poly-market-001');
      expect(tradeData.outcome).toBe('Yes');
      expect(tradeData.shares).toBe(20);
      expect(tradeData.status).toBe('filled');

      const verifyResult = await driver.verify(tradeResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
    });

    it('completes the full lifecycle for position monitoring', async () => {
      await driver.connect(polyConfig);

      // Place a trade to create a position
      await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'poly-market-001',
          outcome: 'Yes',
          shares: 10,
          price: 0.50,
        },
      });

      // Check positions
      const positionsResult = await driver.execute({
        type: 'getPositions',
        params: {},
      });
      expect(positionsResult.success).toBe(true);
      const posData = positionsResult.data as Record<string, unknown>;
      const positions = posData.positions as Array<Record<string, unknown>>;
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].marketId).toBe('poly-market-001');

      await driver.disconnect();
    });

    it('completes the full lifecycle for balance check', async () => {
      await driver.connect(polyConfig);

      const balanceResult = await driver.execute({
        type: 'getBalance',
        params: {},
      });
      expect(balanceResult.success).toBe(true);
      const balanceData = balanceResult.data as Record<string, unknown>;
      expect(balanceData.currency).toBe('USDC');
      expect(balanceData.balance).toBeDefined();

      await driver.disconnect();
    });
  });

  describe('risk management — position limits', () => {
    beforeEach(async () => {
      await driver.connect(polyConfig);
    });

    afterEach(async () => {
      await driver.disconnect();
    });

    it('enforces position size limits', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'poly-limit-test',
          outcome: 'Yes',
          shares: 250, // exceeds maxPositionSize of 200
          price: 0.50,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.POSITION_LIMIT_EXCEEDED);
    });

    it('enforces daily loss limits', async () => {
      driver.recordRealizedLoss(980);

      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'poly-loss-test',
          outcome: 'No',
          shares: 50,
          price: 0.50, // potential loss = 50 * 0.50 = 25, total = 1005 > 1000
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED);
    });
  });

  describe('error handling and retry behavior', () => {
    beforeEach(async () => {
      await driver.connect(polyConfig);
    });

    afterEach(async () => {
      await driver.disconnect();
    });

    it('returns error for unsupported operation types', async () => {
      const result = await driver.execute({
        type: 'unsupported_op',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.UNSUPPORTED_OPERATION);
    });

    it('validates trade parameters', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: {
          marketId: 'poly-market-001',
          outcome: 'Maybe', // invalid
          shares: 10,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.INVALID_PARAMS);
    });
  });

  describe('circuit breaker state transitions', () => {
    it('starts with closed circuit breaker and remains closed after success', async () => {
      await driver.connect(polyConfig);
      expect(driver.getCircuitBreakerState()).toBe('closed');

      await driver.execute({
        type: 'getBalance',
        params: {},
      });

      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });
  });
});
