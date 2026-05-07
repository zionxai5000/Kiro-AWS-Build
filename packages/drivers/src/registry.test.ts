/**
 * Unit tests for the DriverRegistry.
 *
 * Validates: Requirements 10.1, 10.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriverRegistry } from './registry.js';
import type { RegisterDriverOptions } from './registry.js';
import { BaseDriver } from './base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';

// ---------------------------------------------------------------------------
// Test driver subclass
// ---------------------------------------------------------------------------

class MockDriver extends BaseDriver<{ apiKey: string }> {
  readonly name: string;
  readonly version = '1.0.0';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectFn: any = vi.fn().mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeFn: any = vi.fn().mockResolvedValue({
    success: true,
    data: {},
    retryable: false,
    operationId: 'op-1',
  } satisfies DriverResult);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verifyFn: any = vi.fn().mockImplementation((id: string) =>
    Promise.resolve({ verified: true, operationId: id }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  disconnectFn: any = vi.fn().mockResolvedValue(undefined);

  constructor(name = 'mock-driver') {
    super();
    this.name = name;
  }

  protected async doConnect(): Promise<void> {
    return this.connectFn();
  }
  protected async doExecute(op: DriverOperation): Promise<DriverResult> {
    return this.executeFn(op);
  }
  protected async doVerify(operationId: string): Promise<VerificationResult> {
    return this.verifyFn(operationId);
  }
  protected async doDisconnect(): Promise<void> {
    return this.disconnectFn();
  }

  // Instant sleep for tests
  protected override sleep(): Promise<void> {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DriverRegistry', () => {
  let registry: DriverRegistry;

  beforeEach(() => {
    registry = new DriverRegistry();
  });

  // -----------------------------------------------------------------------
  // registerDriver()
  // -----------------------------------------------------------------------

  describe('registerDriver()', () => {
    it('registers a valid driver', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver);

      expect(registry.has('mock-driver')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('registers and connects a driver when config is provided', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'test' } });

      const list = registry.listDrivers();
      expect(list[0].status).toBe('ready');
    });

    it('throws when registering a duplicate driver name', async () => {
      const d1 = new MockDriver('dup');
      const d2 = new MockDriver('dup');

      await registry.registerDriver(d1);
      await expect(registry.registerDriver(d2)).rejects.toThrow(
        'Driver "dup" is already registered',
      );
    });

    it('validates driver implements all required methods', async () => {
      const incomplete = { name: 'bad', version: '1.0' } as never;

      await expect(
        registry.registerDriver(incomplete),
      ).rejects.toThrow('missing required members');
    });

    it('rejects null or non-object drivers', async () => {
      await expect(
        registry.registerDriver(null as never),
      ).rejects.toThrow('Driver must be a non-null object');
    });

    it('rejects drivers missing the name property', async () => {
      const noName = {
        version: '1.0',
        connect: vi.fn(),
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(noName)).rejects.toThrow(
        'missing required members',
      );
    });

    it('runs integration tests and activates on success', async () => {
      const driver = new MockDriver();
      const tests = vi.fn().mockResolvedValue(undefined);

      await registry.registerDriver(driver, { integrationTests: tests });

      expect(tests).toHaveBeenCalledOnce();
      expect(registry.has('mock-driver')).toBe(true);
    });

    it('marks driver as error when integration tests fail', async () => {
      const driver = new MockDriver();
      const tests = vi.fn().mockRejectedValue(new Error('test suite failed'));

      await expect(
        registry.registerDriver(driver, { integrationTests: tests }),
      ).rejects.toThrow('Integration tests failed');

      // Driver is still registered but in error state
      expect(registry.has('mock-driver')).toBe(true);
      const list = registry.listDrivers();
      expect(list[0].status).toBe('error');
    });

    it('marks driver as error when connection fails', async () => {
      const driver = new MockDriver();
      driver.connectFn.mockRejectedValueOnce(new Error('auth failed'));

      await registry.registerDriver(driver, { config: { apiKey: 'bad' } });

      const list = registry.listDrivers();
      expect(list[0].status).toBe('error');
      expect(list[0].health?.healthy).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getDriver()
  // -----------------------------------------------------------------------

  describe('getDriver()', () => {
    it('returns a ready driver by name', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'key' } });

      const retrieved = registry.getDriver('mock-driver');
      expect(retrieved.name).toBe('mock-driver');
    });

    it('throws when driver is not registered', () => {
      expect(() => registry.getDriver('nonexistent')).toThrow(
        'Driver "nonexistent" is not registered',
      );
    });

    it('throws when driver is not ready', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver); // registered but not connected

      expect(() => registry.getDriver('mock-driver')).toThrow(
        'Driver "mock-driver" is not ready',
      );
    });
  });

  // -----------------------------------------------------------------------
  // listDrivers()
  // -----------------------------------------------------------------------

  describe('listDrivers()', () => {
    it('returns empty array when no drivers registered', () => {
      expect(registry.listDrivers()).toEqual([]);
    });

    it('returns all registered drivers with status and health', async () => {
      const d1 = new MockDriver('driver-a');
      const d2 = new MockDriver('driver-b');

      await registry.registerDriver(d1, { config: { apiKey: 'a' } });
      await registry.registerDriver(d2);

      const list = registry.listDrivers();
      expect(list).toHaveLength(2);

      const a = list.find((d) => d.name === 'driver-a')!;
      expect(a.status).toBe('ready');
      expect(a.health?.healthy).toBe(true);
      expect(a.registeredAt).toBeInstanceOf(Date);

      const b = list.find((d) => d.name === 'driver-b')!;
      expect(b.status).toBe('registered');
      expect(b.health).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // unregisterDriver()
  // -----------------------------------------------------------------------

  describe('unregisterDriver()', () => {
    it('disconnects and removes a ready driver', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'key' } });

      await registry.unregisterDriver('mock-driver');

      expect(registry.has('mock-driver')).toBe(false);
      expect(registry.size).toBe(0);
      expect(driver.disconnectFn).toHaveBeenCalled();
    });

    it('removes a registered-only driver without calling disconnect', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver);

      await registry.unregisterDriver('mock-driver');

      expect(registry.has('mock-driver')).toBe(false);
      expect(driver.disconnectFn).not.toHaveBeenCalled();
    });

    it('throws when driver is not registered', async () => {
      await expect(registry.unregisterDriver('ghost')).rejects.toThrow(
        'Driver "ghost" is not registered',
      );
    });

    it('removes driver even if disconnect throws', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'key' } });
      driver.disconnectFn.mockRejectedValueOnce(new Error('cleanup error'));

      await registry.unregisterDriver('mock-driver');

      expect(registry.has('mock-driver')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // connectAll()
  // -----------------------------------------------------------------------

  describe('connectAll()', () => {
    it('connects all registered drivers with provided configs', async () => {
      const d1 = new MockDriver('alpha');
      const d2 = new MockDriver('beta');

      await registry.registerDriver(d1);
      await registry.registerDriver(d2);

      const results = await registry.connectAll({
        alpha: { apiKey: 'a' },
        beta: { apiKey: 'b' },
      });

      expect(results).toEqual({ alpha: true, beta: true });

      const list = registry.listDrivers();
      expect(list.every((d) => d.status === 'ready')).toBe(true);
    });

    it('skips already-ready drivers', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'key' } });

      const results = await registry.connectAll({});
      expect(results).toEqual({ 'mock-driver': true });
    });

    it('returns false for drivers without config', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver);

      const results = await registry.connectAll({});
      expect(results).toEqual({ 'mock-driver': false });
    });

    it('marks driver as error on connection failure', async () => {
      const driver = new MockDriver();
      driver.connectFn.mockRejectedValueOnce(new Error('fail'));
      await registry.registerDriver(driver);

      const results = await registry.connectAll({
        'mock-driver': { apiKey: 'bad' },
      });

      expect(results).toEqual({ 'mock-driver': false });
      const list = registry.listDrivers();
      expect(list[0].status).toBe('error');
    });
  });

  // -----------------------------------------------------------------------
  // disconnectAll()
  // -----------------------------------------------------------------------

  describe('disconnectAll()', () => {
    it('disconnects all ready drivers', async () => {
      const d1 = new MockDriver('alpha');
      const d2 = new MockDriver('beta');

      await registry.registerDriver(d1, { config: { apiKey: 'a' } });
      await registry.registerDriver(d2, { config: { apiKey: 'b' } });

      await registry.disconnectAll();

      const list = registry.listDrivers();
      expect(list.every((d) => d.status === 'registered')).toBe(true);
      expect(d1.disconnectFn).toHaveBeenCalled();
      expect(d2.disconnectFn).toHaveBeenCalled();
    });

    it('marks driver as error if disconnect throws', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'key' } });
      driver.disconnectFn.mockRejectedValueOnce(new Error('fail'));

      await registry.disconnectAll();

      const list = registry.listDrivers();
      expect(list[0].status).toBe('error');
    });

    it('skips drivers that are only registered', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver);

      await registry.disconnectAll();

      expect(driver.disconnectFn).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // healthCheckAll()
  // -----------------------------------------------------------------------

  describe('healthCheckAll()', () => {
    it('returns health status for all drivers', async () => {
      const d1 = new MockDriver('alpha');
      const d2 = new MockDriver('beta');

      await registry.registerDriver(d1, { config: { apiKey: 'a' } });
      await registry.registerDriver(d2);

      const results = await registry.healthCheckAll();

      expect(results['alpha'].healthy).toBe(true);
      expect(results['beta'].healthy).toBe(false); // not connected
    });

    it('marks driver as error when health check fails', async () => {
      const driver = new MockDriver();
      await registry.registerDriver(driver, { config: { apiKey: 'key' } });

      // Simulate healthCheck throwing
      vi.spyOn(driver, 'healthCheck').mockRejectedValueOnce(
        new Error('health check error'),
      );

      const results = await registry.healthCheckAll();

      expect(results['mock-driver'].healthy).toBe(false);
      expect(results['mock-driver'].message).toContain('health check error');

      const list = registry.listDrivers();
      expect(list[0].status).toBe('error');
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  describe('driver validation', () => {
    it('rejects drivers missing connect method', async () => {
      const bad = {
        name: 'bad',
        version: '1.0',
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(bad)).rejects.toThrow(
        'method "connect"',
      );
    });

    it('rejects drivers missing execute method', async () => {
      const bad = {
        name: 'bad',
        version: '1.0',
        connect: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(bad)).rejects.toThrow(
        'method "execute"',
      );
    });

    it('rejects drivers missing healthCheck method', async () => {
      const bad = {
        name: 'bad',
        version: '1.0',
        connect: vi.fn(),
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
      } as never;

      await expect(registry.registerDriver(bad)).rejects.toThrow(
        'method "healthCheck"',
      );
    });

    it('rejects when a required method is not a function', async () => {
      const bad = {
        name: 'bad',
        version: '1.0',
        connect: 'not-a-function',
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(bad)).rejects.toThrow(
        'method "connect"',
      );
    });

    it('accepts a fully valid driver object', async () => {
      const valid = {
        name: 'valid',
        version: '1.0',
        status: 'disconnected',
        connect: vi.fn().mockResolvedValue({ success: true, status: 'ready' }),
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn().mockResolvedValue({ healthy: true, status: 'ready', errorCount: 0 }),
        getRetryPolicy: vi.fn(),
      } as never;

      await registry.registerDriver(valid);
      expect(registry.has('valid')).toBe(true);
    });
  });
});
