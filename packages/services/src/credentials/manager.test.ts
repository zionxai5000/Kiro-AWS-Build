/**
 * Unit tests for the Credential Manager (CredentialManagerImpl).
 *
 * Validates: Requirements 20.1, 20.5, 19.1
 *
 * - 20.1: Store all external service credentials in AWS Secrets Manager and
 *         retrieve them at runtime — credentials shall not exist in code,
 *         configuration files, or memory logs
 * - 20.5: Rotate external service credentials on a configurable schedule
 *         without service interruption
 * - 19.1: Test suite validates functionality before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CredentialManagerImpl } from './manager.js';
import type {
  CredentialManagerConfig,
  SecretsManagerClient,
} from './manager.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockSecretsManager(): SecretsManagerClient {
  return {
    getSecretValue: vi.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        'api-key': 'secret-api-key-value',
        'client-secret': 'secret-client-value',
      }),
      VersionId: 'version-001',
    }),
    rotateSecret: vi.fn().mockResolvedValue({
      VersionId: 'new-version-002',
    }),
    describeSecret: vi.fn().mockResolvedValue({
      RotationEnabled: true,
      RotationRules: { AutomaticallyAfterDays: 90 },
      LastRotatedDate: new Date('2025-01-01T00:00:00.000Z'),
      NextRotationDate: new Date('2025-04-01T00:00:00.000Z'),
    }),
  };
}

function createMockAuditService() {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-001'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-002'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-003'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: '', chainLength: 0 }),
  };
}

function createConfig(
  overrides: Partial<CredentialManagerConfig> = {},
): CredentialManagerConfig {
  return {
    tenantId: 'tenant-001',
    agentId: 'credential-manager',
    agentName: 'CredentialManager',
    secretsManagerClient: createMockSecretsManager(),
    auditService: createMockAuditService(),
    secretMappings: {
      'appstore-connect': 'seraphim/drivers/appstore-connect',
      youtube: 'seraphim/drivers/youtube',
      kalshi: 'seraphim/drivers/kalshi',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CredentialManagerImpl', () => {
  let config: CredentialManagerConfig;
  let manager: CredentialManagerImpl;
  let mockSecretsManager: SecretsManagerClient;
  let mockAuditService: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    config = createConfig();
    mockSecretsManager = config.secretsManagerClient;
    mockAuditService = config.auditService as ReturnType<typeof createMockAuditService>;
    manager = new CredentialManagerImpl(config);
  });

  // -----------------------------------------------------------------------
  // getCredential — Retrieval from Secrets Manager (Req 20.1)
  // -----------------------------------------------------------------------

  describe('getCredential (Req 20.1)', () => {
    it('should retrieve a credential from Secrets Manager', async () => {
      const value = await manager.getCredential('appstore-connect', 'api-key');

      expect(value).toBe('secret-api-key-value');
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledWith({
        SecretId: 'seraphim/drivers/appstore-connect',
      });
    });

    it('should retrieve different credential keys from the same secret', async () => {
      const apiKey = await manager.getCredential('appstore-connect', 'api-key');
      const clientSecret = await manager.getCredential(
        'appstore-connect',
        'client-secret',
      );

      expect(apiKey).toBe('secret-api-key-value');
      expect(clientSecret).toBe('secret-client-value');
    });

    it('should throw when driver has no secret mapping', async () => {
      await expect(
        manager.getCredential('unknown-driver', 'api-key'),
      ).rejects.toThrow('No secret mapping configured for driver "unknown-driver"');
    });

    it('should throw when SecretString is empty', async () => {
      (mockSecretsManager.getSecretValue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        SecretString: undefined,
      });

      await expect(
        manager.getCredential('appstore-connect', 'api-key'),
      ).rejects.toThrow('Credential not found');
    });

    it('should throw when SecretString is not valid JSON', async () => {
      (mockSecretsManager.getSecretValue as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        SecretString: 'not-json',
      });

      await expect(
        manager.getCredential('appstore-connect', 'api-key'),
      ).rejects.toThrow('Failed to parse credentials');
    });

    it('should throw when credential key does not exist in the secret', async () => {
      await expect(
        manager.getCredential('appstore-connect', 'nonexistent-key'),
      ).rejects.toThrow('Credential key "nonexistent-key" not found');
    });
  });

  // -----------------------------------------------------------------------
  // In-memory cache with TTL (Req 20.1)
  // -----------------------------------------------------------------------

  describe('in-memory cache with TTL', () => {
    it('should cache credentials and serve from cache on subsequent calls', async () => {
      await manager.getCredential('appstore-connect', 'api-key');
      await manager.getCredential('appstore-connect', 'api-key');

      // Secrets Manager should only be called once (second call served from cache)
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(1);
    });

    it('should fetch from Secrets Manager again after cache expires', async () => {
      // Use a very short TTL for testing
      const shortTtlConfig = createConfig({ cacheTtlMs: 50 });
      const shortTtlManager = new CredentialManagerImpl(shortTtlConfig);
      const shortTtlSecretsManager = shortTtlConfig.secretsManagerClient;

      await shortTtlManager.getCredential('appstore-connect', 'api-key');

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      await shortTtlManager.getCredential('appstore-connect', 'api-key');

      // Should have called Secrets Manager twice (cache expired)
      expect(shortTtlSecretsManager.getSecretValue).toHaveBeenCalledTimes(2);
    });

    it('should cache different keys independently', async () => {
      await manager.getCredential('appstore-connect', 'api-key');
      await manager.getCredential('youtube', 'api-key');

      // Each driver should trigger a separate Secrets Manager call
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(2);
    });

    it('should default cache TTL to 5 minutes', () => {
      const defaultConfig = createConfig();
      const defaultManager = new CredentialManagerImpl(defaultConfig);

      // Access the private cacheTtlMs via any cast for verification
      expect((defaultManager as any).cacheTtlMs).toBe(5 * 60 * 1000);
    });
  });

  // -----------------------------------------------------------------------
  // rotateCredential — Zero-downtime rotation (Req 20.5)
  // -----------------------------------------------------------------------

  describe('rotateCredential (Req 20.5)', () => {
    it('should trigger rotation via Secrets Manager', async () => {
      const result = await manager.rotateCredential('appstore-connect');

      expect(result.success).toBe(true);
      expect(result.driverName).toBe('appstore-connect');
      expect(result.newVersionId).toBe('new-version-002');
      expect(mockSecretsManager.rotateSecret).toHaveBeenCalledWith({
        SecretId: 'seraphim/drivers/appstore-connect',
        RotationRules: { AutomaticallyAfterDays: 90 },
      });
    });

    it('should invalidate cache for the rotated driver', async () => {
      // Populate cache
      await manager.getCredential('appstore-connect', 'api-key');
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(1);

      // Rotate
      await manager.rotateCredential('appstore-connect');

      // Next getCredential should fetch from Secrets Manager again
      await manager.getCredential('appstore-connect', 'api-key');
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(2);
    });

    it('should not invalidate cache for other drivers', async () => {
      // Populate cache for both drivers
      await manager.getCredential('appstore-connect', 'api-key');
      await manager.getCredential('youtube', 'api-key');
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(2);

      // Rotate only appstore-connect
      await manager.rotateCredential('appstore-connect');

      // youtube should still be cached
      await manager.getCredential('youtube', 'api-key');
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(2);

      // appstore-connect should fetch fresh
      await manager.getCredential('appstore-connect', 'api-key');
      expect(mockSecretsManager.getSecretValue).toHaveBeenCalledTimes(3);
    });

    it('should return failure result when rotation fails', async () => {
      (mockSecretsManager.rotateSecret as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Rotation Lambda not configured'),
      );

      const result = await manager.rotateCredential('appstore-connect');

      expect(result.success).toBe(false);
      expect(result.driverName).toBe('appstore-connect');
      expect(result.error).toBe('Rotation Lambda not configured');
    });

    it('should throw when driver has no secret mapping', async () => {
      await expect(
        manager.rotateCredential('unknown-driver'),
      ).rejects.toThrow('No secret mapping configured for driver "unknown-driver"');
    });

    it('should use per-driver rotation override when configured', async () => {
      const overrideConfig = createConfig({
        rotationOverrides: { 'appstore-connect': 30 },
      });
      const overrideManager = new CredentialManagerImpl(overrideConfig);

      await overrideManager.rotateCredential('appstore-connect');

      expect(overrideConfig.secretsManagerClient.rotateSecret).toHaveBeenCalledWith({
        SecretId: 'seraphim/drivers/appstore-connect',
        RotationRules: { AutomaticallyAfterDays: 30 },
      });
    });
  });

  // -----------------------------------------------------------------------
  // getRotationSchedule (Req 20.5)
  // -----------------------------------------------------------------------

  describe('getRotationSchedule (Req 20.5)', () => {
    it('should return rotation schedules for all configured drivers', async () => {
      const schedules = await manager.getRotationSchedule();

      expect(schedules).toHaveLength(3);
      const driverNames = schedules.map((s) => s.driverName);
      expect(driverNames).toContain('appstore-connect');
      expect(driverNames).toContain('youtube');
      expect(driverNames).toContain('kalshi');
    });

    it('should include rotation details from Secrets Manager', async () => {
      const schedules = await manager.getRotationSchedule();
      const appstoreSchedule = schedules.find(
        (s) => s.driverName === 'appstore-connect',
      );

      expect(appstoreSchedule).toBeDefined();
      expect(appstoreSchedule!.rotationIntervalDays).toBe(90);
      expect(appstoreSchedule!.lastRotatedAt).toEqual(
        new Date('2025-01-01T00:00:00.000Z'),
      );
      expect(appstoreSchedule!.nextRotationAt).toEqual(
        new Date('2025-04-01T00:00:00.000Z'),
      );
    });

    it('should default to 90 days when Secrets Manager has no rotation rules', async () => {
      (mockSecretsManager.describeSecret as ReturnType<typeof vi.fn>).mockResolvedValue({
        RotationEnabled: false,
      });

      const schedules = await manager.getRotationSchedule();

      for (const schedule of schedules) {
        expect(schedule.rotationIntervalDays).toBe(90);
      }
    });

    it('should return defaults when describeSecret fails', async () => {
      (mockSecretsManager.describeSecret as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Access denied'),
      );

      const schedules = await manager.getRotationSchedule();

      expect(schedules).toHaveLength(3);
      for (const schedule of schedules) {
        expect(schedule.rotationIntervalDays).toBe(90);
        expect(schedule.lastRotatedAt).toBeUndefined();
        expect(schedule.nextRotationAt).toBeUndefined();
      }
    });

    it('should use per-driver rotation overrides', async () => {
      const overrideConfig = createConfig({
        rotationOverrides: { kalshi: 30 },
      });
      // Make describeSecret return no rotation rules so we see the override
      (overrideConfig.secretsManagerClient.describeSecret as ReturnType<typeof vi.fn>).mockResolvedValue({
        RotationEnabled: false,
      });
      const overrideManager = new CredentialManagerImpl(overrideConfig);

      const schedules = await overrideManager.getRotationSchedule();
      const kalshiSchedule = schedules.find((s) => s.driverName === 'kalshi');

      expect(kalshiSchedule!.rotationIntervalDays).toBe(30);
    });
  });

  // -----------------------------------------------------------------------
  // Audit logging — key name only, never credential value (Req 20.1)
  // -----------------------------------------------------------------------

  describe('audit logging (Req 20.1)', () => {
    it('should log credential access to XO Audit on retrieval', async () => {
      await manager.getCredential('appstore-connect', 'api-key');

      expect(mockAuditService.recordAction).toHaveBeenCalled();
      const auditEntry = mockAuditService.recordAction.mock.calls[0][0];

      expect(auditEntry.actionType).toBe('credential.access');
      expect(auditEntry.target).toBe('appstore-connect/api-key');
      expect(auditEntry.outcome).toBe('success');
      expect(auditEntry.details.driverName).toBe('appstore-connect');
      expect(auditEntry.details.credentialKey).toBe('api-key');
    });

    it('should log credential access on cache hits', async () => {
      await manager.getCredential('appstore-connect', 'api-key');
      mockAuditService.recordAction.mockClear();

      await manager.getCredential('appstore-connect', 'api-key');

      expect(mockAuditService.recordAction).toHaveBeenCalled();
      const auditEntry = mockAuditService.recordAction.mock.calls[0][0];
      expect(auditEntry.details.accessType).toBe('cache_hit');
    });

    it('should NEVER include credential values in audit entries', async () => {
      await manager.getCredential('appstore-connect', 'api-key');

      const auditEntry = mockAuditService.recordAction.mock.calls[0][0];

      // Verify no credential value appears anywhere in the audit entry
      const entryJson = JSON.stringify(auditEntry);
      expect(entryJson).not.toContain('secret-api-key-value');
      expect(entryJson).not.toContain('secret-client-value');
    });

    it('should log rotation events to XO Audit', async () => {
      await manager.rotateCredential('appstore-connect');

      expect(mockAuditService.recordAction).toHaveBeenCalled();
      const auditEntry = mockAuditService.recordAction.mock.calls[0][0];

      expect(auditEntry.actionType).toBe('credential.rotation');
      expect(auditEntry.target).toBe('appstore-connect');
      expect(auditEntry.outcome).toBe('success');
    });

    it('should log failed rotation to XO Audit', async () => {
      (mockSecretsManager.rotateSecret as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Rotation failed'),
      );

      await manager.rotateCredential('appstore-connect');

      const auditEntry = mockAuditService.recordAction.mock.calls[0][0];
      expect(auditEntry.actionType).toBe('credential.rotation');
      expect(auditEntry.outcome).toBe('failure');
    });

    it('should not fail credential retrieval if audit logging throws', async () => {
      mockAuditService.recordAction.mockRejectedValue(
        new Error('Audit service down'),
      );

      // Should still return the credential despite audit failure
      const value = await manager.getCredential('appstore-connect', 'api-key');
      expect(value).toBe('secret-api-key-value');
    });

    it('should include tenant ID in audit entries', async () => {
      await manager.getCredential('appstore-connect', 'api-key');

      const auditEntry = mockAuditService.recordAction.mock.calls[0][0];
      expect(auditEntry.tenantId).toBe('tenant-001');
    });
  });
});
