/**
 * Integration tests for Driver Registry validation.
 *
 * Tests that the registry correctly validates drivers, rejects drivers
 * missing required methods, and manages the full registration lifecycle.
 *
 * Requirements: 10.1, 10.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriverRegistry } from '../../registry.js';
import { BaseDriver } from '../../base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';

// ---------------------------------------------------------------------------
// Valid test driver
// ---------------------------------------------------------------------------

class ValidTestDriver extends BaseDriver<{ apiKey: string }> {
  readonly name: string;
  readonly version = '1.0.0';

  constructor(name = 'valid-test-driver') {
    super();
    this.name = name;
  }

  protected async doConnect(): Promise<void> {
    // Mock connection
  }

  protected async doExecute(op: DriverOperation): Promise<DriverResult> {
    return {
      success: true,
      data: { echo: op.params },
      retryable: false,
      operationId: `op-${Date.now()}`,
    };
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    return { verified: true, operationId };
  }

  protected async doDisconnect(): Promise<void> {
    // Mock disconnection
  }

  protected override sleep(): Promise<void> {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Registry Validation Integration Tests
// ---------------------------------------------------------------------------

describe('Driver Registry Validation Integration', () => {
  let registry: DriverRegistry;

  beforeEach(() => {
    registry = new DriverRegistry();
  });

  describe('rejects drivers missing required methods', () => {
    it('rejects null driver', async () => {
      await expect(
        registry.registerDriver(null as never),
      ).rejects.toThrow('Driver must be a non-null object');
    });

    it('rejects undefined driver', async () => {
      await expect(
        registry.registerDriver(undefined as never),
      ).rejects.toThrow('Driver must be a non-null object');
    });

    it('rejects non-object driver', async () => {
      await expect(
        registry.registerDriver('not-a-driver' as never),
      ).rejects.toThrow('Driver must be a non-null object');
    });

    it('rejects driver missing connect method', async () => {
      const incomplete = {
        name: 'bad-driver',
        version: '1.0',
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'method "connect"',
      );
    });

    it('rejects driver missing execute method', async () => {
      const incomplete = {
        name: 'bad-driver',
        version: '1.0',
        connect: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'method "execute"',
      );
    });

    it('rejects driver missing verify method', async () => {
      const incomplete = {
        name: 'bad-driver',
        version: '1.0',
        connect: vi.fn(),
        execute: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'method "verify"',
      );
    });

    it('rejects driver missing disconnect method', async () => {
      const incomplete = {
        name: 'bad-driver',
        version: '1.0',
        connect: vi.fn(),
        execute: vi.fn(),
        verify: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'method "disconnect"',
      );
    });

    it('rejects driver missing healthCheck method', async () => {
      const incomplete = {
        name: 'bad-driver',
        version: '1.0',
        connect: vi.fn(),
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'method "healthCheck"',
      );
    });

    it('rejects driver missing name property', async () => {
      const incomplete = {
        version: '1.0',
        connect: vi.fn(),
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'missing required members',
      );
    });

    it('rejects driver missing version property', async () => {
      const incomplete = {
        name: 'bad-driver',
        connect: vi.fn(),
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'missing required members',
      );
    });

    it('rejects driver where a required method is not a function', async () => {
      const incomplete = {
        name: 'bad-driver',
        version: '1.0',
        connect: 'not-a-function',
        execute: vi.fn(),
        verify: vi.fn(),
        disconnect: vi.fn(),
        healthCheck: vi.fn(),
      } as never;

      await expect(registry.registerDriver(incomplete)).rejects.toThrow(
        'method "connect"',
      );
    });

    it('reports all missing members in a single error', async () => {
      const empty = { name: 'empty', version: '1.0' } as never;

      try {
        await registry.registerDriver(empty);
        expect.fail('Should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('connect');
        expect(message).toContain('execute');
        expect(message).toContain('verify');
        expect(message).toContain('disconnect');
        expect(message).toContain('healthCheck');
      }
    });
  });

  describe('accepts valid drivers', () => {
    it('accepts a BaseDriver subclass', async () => {
      const driver = new ValidTestDriver();
      await registry.registerDriver(driver);

      expect(registry.has('valid-test-driver')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('accepts a plain object implementing the Driver interface', async () => {
      const plainDriver = {
        name: 'plain-driver',
        version: '1.0.0',
        status: 'disconnected',
        connect: vi.fn().mockResolvedValue({ success: true, status: 'ready' }),
        execute: vi.fn().mockResolvedValue({ success: true, retryable: false, operationId: 'op-1' }),
        verify: vi.fn().mockResolvedValue({ verified: true, operationId: 'op-1' }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue({ healthy: true, status: 'ready', errorCount: 0 }),
        getRetryPolicy: vi.fn(),
      } as never;

      await registry.registerDriver(plainDriver);
      expect(registry.has('plain-driver')).toBe(true);
    });
  });

  describe('full registration lifecycle', () => {
    it('registers, connects, lists, and unregisters a driver', async () => {
      const driver = new ValidTestDriver('lifecycle-driver');

      // Register
      await registry.registerDriver(driver);
      expect(registry.has('lifecycle-driver')).toBe(true);

      // List
      const list = registry.listDrivers();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('lifecycle-driver');
      expect(list[0].status).toBe('registered');

      // Connect
      await registry.connectAll({ 'lifecycle-driver': { apiKey: 'test' } });
      const listAfterConnect = registry.listDrivers();
      expect(listAfterConnect[0].status).toBe('ready');

      // Get driver
      const retrieved = registry.getDriver('lifecycle-driver');
      expect(retrieved.name).toBe('lifecycle-driver');

      // Unregister
      await registry.unregisterDriver('lifecycle-driver');
      expect(registry.has('lifecycle-driver')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('prevents duplicate registration', async () => {
      const d1 = new ValidTestDriver('dup-driver');
      const d2 = new ValidTestDriver('dup-driver');

      await registry.registerDriver(d1);
      await expect(registry.registerDriver(d2)).rejects.toThrow(
        'Driver "dup-driver" is already registered',
      );
    });

    it('throws when getting an unregistered driver', () => {
      expect(() => registry.getDriver('nonexistent')).toThrow(
        'Driver "nonexistent" is not registered',
      );
    });

    it('throws when getting a registered but not ready driver', async () => {
      const driver = new ValidTestDriver();
      await registry.registerDriver(driver);

      expect(() => registry.getDriver('valid-test-driver')).toThrow(
        'is not ready',
      );
    });
  });

  describe('integration tests during registration', () => {
    it('activates driver when integration tests pass', async () => {
      const driver = new ValidTestDriver('tested-driver');
      const tests = vi.fn().mockResolvedValue(undefined);

      await registry.registerDriver(driver, { integrationTests: tests });

      expect(tests).toHaveBeenCalledOnce();
      expect(registry.has('tested-driver')).toBe(true);
    });

    it('marks driver as error when integration tests fail', async () => {
      const driver = new ValidTestDriver('failing-driver');
      const tests = vi.fn().mockRejectedValue(new Error('test suite failed'));

      await expect(
        registry.registerDriver(driver, { integrationTests: tests }),
      ).rejects.toThrow('Integration tests failed');

      // Driver is registered but in error state
      expect(registry.has('failing-driver')).toBe(true);
      const list = registry.listDrivers();
      expect(list[0].status).toBe('error');
    });
  });

  describe('health check across registered drivers', () => {
    it('returns health status for all registered drivers', async () => {
      const d1 = new ValidTestDriver('driver-a');
      const d2 = new ValidTestDriver('driver-b');

      await registry.registerDriver(d1, { config: { apiKey: 'a' } });
      await registry.registerDriver(d2);

      const results = await registry.healthCheckAll();

      expect(results['driver-a'].healthy).toBe(true);
      expect(results['driver-b'].healthy).toBe(false); // not connected
    });
  });

  describe('bulk connect and disconnect', () => {
    it('connects all drivers with provided configs', async () => {
      const d1 = new ValidTestDriver('alpha');
      const d2 = new ValidTestDriver('beta');

      await registry.registerDriver(d1);
      await registry.registerDriver(d2);

      const results = await registry.connectAll({
        alpha: { apiKey: 'a' },
        beta: { apiKey: 'b' },
      });

      expect(results).toEqual({ alpha: true, beta: true });
    });

    it('disconnects all drivers', async () => {
      const d1 = new ValidTestDriver('alpha');
      const d2 = new ValidTestDriver('beta');

      await registry.registerDriver(d1, { config: { apiKey: 'a' } });
      await registry.registerDriver(d2, { config: { apiKey: 'b' } });

      await registry.disconnectAll();

      const list = registry.listDrivers();
      expect(list.every((d) => d.status === 'registered')).toBe(true);
    });
  });
});
