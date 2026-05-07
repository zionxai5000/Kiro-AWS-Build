/**
 * Unit tests for Kalshi and Polymarket trading platform drivers.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.6, 13.1, 13.2, 13.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KalshiDriver, KALSHI_ERROR_CODES } from './kalshi-driver.js';
import { PolymarketDriver, POLYMARKET_ERROR_CODES } from './polymarket-driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mock Credential Manager
// ---------------------------------------------------------------------------

function createMockCredentialManager(credentials: Record<string, string> = {}): CredentialManager {
  return {
    getCredential: vi.fn(async (driverName: string, _key: string) => {
      return credentials[driverName] ?? `mock-${driverName}-key`;
    }),
    rotateCredential: vi.fn(async (driverName: string) => ({
      success: true,
      driverName,
      newVersionId: 'v2',
    })),
    getRotationSchedule: vi.fn(async () => []),
  };
}

// ---------------------------------------------------------------------------
// Kalshi Driver Tests
// ---------------------------------------------------------------------------

describe('KalshiDriver', () => {
  let driver: KalshiDriver;
  let credentialManager: CredentialManager;

  const defaultConfig = {
    apiKeyId: 'test-key-id',
    maxPositionSize: 100,
    dailyLossLimitUsd: 500,
    sandbox: true,
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new KalshiDriver(credentialManager);
  });

  // -----------------------------------------------------------------------
  // Connection and Authentication (Req 10.1, 10.2)
  // -----------------------------------------------------------------------

  describe('connection and authentication', () => {
    it('connects successfully with valid config', async () => {
      const result = await driver.connect(defaultConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(driver.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('kalshi', 'api-key');
    });

    it('fails to connect without apiKeyId', async () => {
      const result = await driver.connect({ ...defaultConfig, apiKeyId: '' });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails to connect with non-positive maxPositionSize', async () => {
      const result = await driver.connect({ ...defaultConfig, maxPositionSize: 0 });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails to connect with non-positive dailyLossLimitUsd', async () => {
      const result = await driver.connect({ ...defaultConfig, dailyLossLimitUsd: -1 });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails when credential manager returns empty key', async () => {
      credentialManager = createMockCredentialManager({ kalshi: '' });
      driver = new KalshiDriver(credentialManager);

      const result = await driver.connect(defaultConfig);

      expect(result.success).toBe(false);
    });

    it('disconnects cleanly', async () => {
      await driver.connect(defaultConfig);
      await driver.disconnect();

      expect(driver.status).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // getMarkets (Req 13.1)
  // -----------------------------------------------------------------------

  describe('getMarkets', () => {
    it('returns markets list', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'getMarkets',
        params: { status: 'open', limit: 10 },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('markets');
      expect(result.data).toHaveProperty('retrievedAt');
    });
  });

  // -----------------------------------------------------------------------
  // getPositions (Req 13.3)
  // -----------------------------------------------------------------------

  describe('getPositions', () => {
    it('returns empty positions initially', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({ type: 'getPositions', params: {} });

      expect(result.success).toBe(true);
      const data = result.data as { positions: unknown[]; totalPositions: number };
      expect(data.positions).toEqual([]);
      expect(data.totalPositions).toBe(0);
    });

    it('returns positions after placing trades', async () => {
      await driver.connect(defaultConfig);

      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 10, price: 0.60 },
      });

      const result = await driver.execute({ type: 'getPositions', params: {} });

      expect(result.success).toBe(true);
      const data = result.data as { positions: Array<{ marketId: string; quantity: number }>; totalPositions: number };
      expect(data.totalPositions).toBe(1);
      expect(data.positions[0].marketId).toBe('mkt-1');
    });
  });

  // -----------------------------------------------------------------------
  // placeTrade — validation and risk checks (Req 13.1, 13.2)
  // -----------------------------------------------------------------------

  describe('placeTrade', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('places a valid trade successfully', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 10, price: 0.65 },
      });

      expect(result.success).toBe(true);
      const data = result.data as { tradeId: string; status: string; side: string; quantity: number };
      expect(data.tradeId).toBeDefined();
      expect(data.status).toBe('filled');
      expect(data.side).toBe('yes');
      expect(data.quantity).toBe(10);
    });

    it('rejects trade without marketId', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { side: 'yes', quantity: 10 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects trade with invalid side', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'maybe', quantity: 10 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects trade with zero quantity', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 0 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects trade with price out of range', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 10, price: 1.50 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });

    it('blocks trade exceeding position size limit', async () => {
      // Place a trade that fills most of the limit
      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 90, price: 0.10 },
      });

      // This trade would push over the 100 limit
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 20, price: 0.10 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.POSITION_LIMIT_EXCEEDED);
      expect(result.error?.details).toHaveProperty('currentPosition', 90);
      expect(result.error?.details).toHaveProperty('maxPositionSize', 100);
    });

    it('allows trades on different markets independently', async () => {
      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 90, price: 0.10 },
      });

      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-2', side: 'no', quantity: 90, price: 0.10 },
      });

      expect(result.success).toBe(true);
    });

    it('blocks trade exceeding daily loss limit', async () => {
      // Record enough loss to approach the limit
      driver.recordRealizedLoss(480);

      // This trade's potential loss (50 * 0.50 = 25) would exceed the $500 limit
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 50, price: 0.50 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED);
      expect(result.error?.details).toHaveProperty('dailyLossLimit', 500);
    });

    it('defaults to market order type when not specified', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 5 },
      });

      expect(result.success).toBe(true);
      const data = result.data as { type: string };
      expect(data.type).toBe('market');
    });

    it('uses specified limit order type', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'no', quantity: 5, price: 0.40, type: 'limit' },
      });

      expect(result.success).toBe(true);
      const data = result.data as { type: string };
      expect(data.type).toBe('limit');
    });
  });

  // -----------------------------------------------------------------------
  // cancelTrade
  // -----------------------------------------------------------------------

  describe('cancelTrade', () => {
    it('cancels a trade by ID', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'cancelTrade',
        params: { tradeId: 'trade-123' },
      });

      expect(result.success).toBe(true);
      const data = result.data as { tradeId: string; status: string };
      expect(data.tradeId).toBe('trade-123');
      expect(data.status).toBe('cancelled');
    });

    it('rejects cancel without tradeId', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'cancelTrade',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.INVALID_PARAMS);
    });
  });

  // -----------------------------------------------------------------------
  // getTradeHistory (Req 13.3)
  // -----------------------------------------------------------------------

  describe('getTradeHistory', () => {
    it('returns trade history', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'getTradeHistory',
        params: { startDate: '2026-01-01', endDate: '2026-04-30' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('trades');
      expect(result.data).toHaveProperty('filters');
    });
  });

  // -----------------------------------------------------------------------
  // getBalance
  // -----------------------------------------------------------------------

  describe('getBalance', () => {
    it('returns balance information', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({ type: 'getBalance', params: {} });

      expect(result.success).toBe(true);
      const data = result.data as { currency: string };
      expect(data.currency).toBe('USD');
      expect(data).toHaveProperty('balance');
      expect(data).toHaveProperty('availableBalance');
    });
  });

  // -----------------------------------------------------------------------
  // Risk management helpers
  // -----------------------------------------------------------------------

  describe('risk management', () => {
    it('tracks daily realized loss', async () => {
      await driver.connect(defaultConfig);

      driver.recordRealizedLoss(100);
      driver.recordRealizedLoss(50);

      expect(driver.getDailyRealizedLoss()).toBe(150);
    });

    it('tracks position sizes per market', async () => {
      await driver.connect(defaultConfig);

      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'mkt-1', side: 'yes', quantity: 25, price: 0.10 },
      });

      expect(driver.getPositionSize('mkt-1')).toBe(25);
      expect(driver.getPositionSize('mkt-2')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Unsupported operations
  // -----------------------------------------------------------------------

  describe('unsupported operations', () => {
    it('returns error for unknown operation type', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({ type: 'unknownOp', params: {} });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.UNSUPPORTED_OPERATION);
    });
  });

  // -----------------------------------------------------------------------
  // Not connected
  // -----------------------------------------------------------------------

  describe('not connected', () => {
    it('returns unauthorized when not connected', async () => {
      const result = await driver.execute({ type: 'getBalance', params: {} });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(KALSHI_ERROR_CODES.UNAUTHORIZED);
    });
  });

  // -----------------------------------------------------------------------
  // Verify
  // -----------------------------------------------------------------------

  describe('verify', () => {
    it('verifies a completed operation', async () => {
      await driver.connect(defaultConfig);

      const execResult = await driver.execute({ type: 'getBalance', params: {} });
      const verifyResult = await driver.verify(execResult.operationId);

      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.operationId).toBe(execResult.operationId);
    });

    it('returns not verified for unknown operation', async () => {
      await driver.connect(defaultConfig);

      const verifyResult = await driver.verify('unknown-op-id');

      expect(verifyResult.verified).toBe(false);
    });
  });
});


// ---------------------------------------------------------------------------
// Polymarket Driver Tests
// ---------------------------------------------------------------------------

describe('PolymarketDriver', () => {
  let driver: PolymarketDriver;
  let credentialManager: CredentialManager;

  const defaultConfig = {
    apiKey: 'test-poly-key',
    maxPositionSize: 200,
    dailyLossLimitUsd: 1000,
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new PolymarketDriver(credentialManager);
  });

  // -----------------------------------------------------------------------
  // Connection and Authentication (Req 10.1, 10.2)
  // -----------------------------------------------------------------------

  describe('connection and authentication', () => {
    it('connects successfully with valid config', async () => {
      const result = await driver.connect(defaultConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(driver.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('polymarket', 'api-key');
    });

    it('fails to connect without apiKey', async () => {
      const result = await driver.connect({ ...defaultConfig, apiKey: '' });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails to connect with non-positive maxPositionSize', async () => {
      const result = await driver.connect({ ...defaultConfig, maxPositionSize: 0 });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails to connect with non-positive dailyLossLimitUsd', async () => {
      const result = await driver.connect({ ...defaultConfig, dailyLossLimitUsd: -5 });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails when credential manager returns empty key', async () => {
      credentialManager = createMockCredentialManager({ polymarket: '' });
      driver = new PolymarketDriver(credentialManager);

      const result = await driver.connect(defaultConfig);

      expect(result.success).toBe(false);
    });

    it('disconnects cleanly', async () => {
      await driver.connect(defaultConfig);
      await driver.disconnect();

      expect(driver.status).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // getMarkets (Req 13.1)
  // -----------------------------------------------------------------------

  describe('getMarkets', () => {
    it('returns markets list', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'getMarkets',
        params: { status: 'active', category: 'politics', limit: 10 },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('markets');
      expect(result.data).toHaveProperty('retrievedAt');
    });
  });

  // -----------------------------------------------------------------------
  // getPositions (Req 13.3)
  // -----------------------------------------------------------------------

  describe('getPositions', () => {
    it('returns empty positions initially', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({ type: 'getPositions', params: {} });

      expect(result.success).toBe(true);
      const data = result.data as { positions: unknown[]; totalPositions: number };
      expect(data.positions).toEqual([]);
      expect(data.totalPositions).toBe(0);
    });

    it('returns positions after placing trades', async () => {
      await driver.connect(defaultConfig);

      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 15, price: 0.55 },
      });

      const result = await driver.execute({ type: 'getPositions', params: {} });

      expect(result.success).toBe(true);
      const data = result.data as { positions: Array<{ marketId: string; shares: number }>; totalPositions: number };
      expect(data.totalPositions).toBe(1);
      expect(data.positions[0].marketId).toBe('poly-mkt-1');
    });
  });

  // -----------------------------------------------------------------------
  // placeTrade — validation and risk checks (Req 13.1, 13.2)
  // -----------------------------------------------------------------------

  describe('placeTrade', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('places a valid trade successfully', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 20, price: 0.70 },
      });

      expect(result.success).toBe(true);
      const data = result.data as { tradeId: string; status: string; outcome: string; shares: number };
      expect(data.tradeId).toBeDefined();
      expect(data.status).toBe('filled');
      expect(data.outcome).toBe('Yes');
      expect(data.shares).toBe(20);
    });

    it('rejects trade without marketId', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { outcome: 'Yes', shares: 10 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects trade with invalid outcome', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Maybe', shares: 10 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects trade with zero shares', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'No', shares: 0 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects trade with price out of range', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 10, price: 1.50 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.INVALID_PARAMS);
    });

    it('blocks trade exceeding position size limit', async () => {
      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 180, price: 0.05 },
      });

      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 30, price: 0.05 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.POSITION_LIMIT_EXCEEDED);
      expect(result.error?.details).toHaveProperty('currentPosition', 180);
      expect(result.error?.details).toHaveProperty('maxPositionSize', 200);
    });

    it('allows trades on different markets independently', async () => {
      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 180, price: 0.05 },
      });

      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-2', outcome: 'No', shares: 180, price: 0.05 },
      });

      expect(result.success).toBe(true);
    });

    it('blocks trade exceeding daily loss limit', async () => {
      driver.recordRealizedLoss(950);

      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 200, price: 0.50 },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED);
      expect(result.error?.details).toHaveProperty('dailyLossLimit', 1000);
    });

    it('defaults to market order type when not specified', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 5 },
      });

      expect(result.success).toBe(true);
      const data = result.data as { type: string };
      expect(data.type).toBe('market');
    });

    it('uses specified gtc order type', async () => {
      const result = await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'No', shares: 5, price: 0.30, type: 'gtc' },
      });

      expect(result.success).toBe(true);
      const data = result.data as { type: string };
      expect(data.type).toBe('gtc');
    });
  });

  // -----------------------------------------------------------------------
  // cancelTrade
  // -----------------------------------------------------------------------

  describe('cancelTrade', () => {
    it('cancels a trade by ID', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'cancelTrade',
        params: { tradeId: 'poly-trade-456' },
      });

      expect(result.success).toBe(true);
      const data = result.data as { tradeId: string; status: string };
      expect(data.tradeId).toBe('poly-trade-456');
      expect(data.status).toBe('cancelled');
    });

    it('rejects cancel without tradeId', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'cancelTrade',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.INVALID_PARAMS);
    });
  });

  // -----------------------------------------------------------------------
  // getTradeHistory (Req 13.3)
  // -----------------------------------------------------------------------

  describe('getTradeHistory', () => {
    it('returns trade history', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({
        type: 'getTradeHistory',
        params: { startDate: '2026-01-01', endDate: '2026-04-30' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('trades');
      expect(result.data).toHaveProperty('filters');
    });
  });

  // -----------------------------------------------------------------------
  // getBalance
  // -----------------------------------------------------------------------

  describe('getBalance', () => {
    it('returns balance information in USDC', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({ type: 'getBalance', params: {} });

      expect(result.success).toBe(true);
      const data = result.data as { currency: string };
      expect(data.currency).toBe('USDC');
      expect(data).toHaveProperty('balance');
      expect(data).toHaveProperty('availableBalance');
    });
  });

  // -----------------------------------------------------------------------
  // Risk management helpers
  // -----------------------------------------------------------------------

  describe('risk management', () => {
    it('tracks daily realized loss', async () => {
      await driver.connect(defaultConfig);

      driver.recordRealizedLoss(200);
      driver.recordRealizedLoss(100);

      expect(driver.getDailyRealizedLoss()).toBe(300);
    });

    it('tracks position sizes per market', async () => {
      await driver.connect(defaultConfig);

      await driver.execute({
        type: 'placeTrade',
        params: { marketId: 'poly-mkt-1', outcome: 'Yes', shares: 50, price: 0.10 },
      });

      expect(driver.getPositionSize('poly-mkt-1')).toBe(50);
      expect(driver.getPositionSize('poly-mkt-2')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Unsupported operations
  // -----------------------------------------------------------------------

  describe('unsupported operations', () => {
    it('returns error for unknown operation type', async () => {
      await driver.connect(defaultConfig);

      const result = await driver.execute({ type: 'unknownOp', params: {} });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.UNSUPPORTED_OPERATION);
    });
  });

  // -----------------------------------------------------------------------
  // Not connected
  // -----------------------------------------------------------------------

  describe('not connected', () => {
    it('returns unauthorized when not connected', async () => {
      const result = await driver.execute({ type: 'getBalance', params: {} });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(POLYMARKET_ERROR_CODES.UNAUTHORIZED);
    });
  });

  // -----------------------------------------------------------------------
  // Verify
  // -----------------------------------------------------------------------

  describe('verify', () => {
    it('verifies a completed operation', async () => {
      await driver.connect(defaultConfig);

      const execResult = await driver.execute({ type: 'getBalance', params: {} });
      const verifyResult = await driver.verify(execResult.operationId);

      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.operationId).toBe(execResult.operationId);
    });

    it('returns not verified for unknown operation', async () => {
      await driver.connect(defaultConfig);

      const verifyResult = await driver.verify('unknown-op-id');

      expect(verifyResult.verified).toBe(false);
    });
  });
});
