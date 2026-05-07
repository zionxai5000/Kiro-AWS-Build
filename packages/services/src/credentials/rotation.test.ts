/**
 * Unit tests for the Credential Rotation Service.
 *
 * Validates: Requirements 20.5
 *
 * - 20.5: Rotate external service credentials on a configurable schedule
 *         without service interruption (zero-downtime dual-version rotation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CredentialRotationService } from './rotation.js';
import type {
  CredentialRotationServiceConfig,
  RotationConfig,
} from './rotation.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockAuditService() {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-001'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-002'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-003'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi
      .fn()
      .mockResolvedValue({ valid: true, recordId: '', chainLength: 0 }),
  };
}

function createMockEventBus() {
  return {
    publish: vi.fn().mockResolvedValue('event-id-001'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id-001'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CredentialRotationService', () => {
  let service: CredentialRotationService;
  let mockAudit: ReturnType<typeof createMockAuditService>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockAudit = createMockAuditService();
    mockEventBus = createMockEventBus();
    service = new CredentialRotationService({
      auditService: mockAudit,
      eventBus: mockEventBus,
      defaultRotationIntervalDays: 90,
    });
  });

  // -----------------------------------------------------------------------
  // Configuration Management
  // -----------------------------------------------------------------------

  describe('configuration management', () => {
    it('should add a rotation config and set next rotation date', () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const schedule = service.getRotationSchedule();
      expect(schedule).toHaveLength(1);
      expect(schedule[0].credentialName).toBe('api-key');
      expect(schedule[0].nextRotation).toBeDefined();
    });

    it('should preserve explicit nextRotation when provided', () => {
      const nextRotation = '2025-12-01T00:00:00.000Z';
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
        nextRotation,
      });

      const schedule = service.getRotationSchedule();
      expect(schedule[0].nextRotation).toBe(nextRotation);
    });

    it('should initialize rotation state to idle', () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      expect(service.getRotationState('api-key')).toBe('idle');
    });
  });

  // -----------------------------------------------------------------------
  // Due Rotations
  // -----------------------------------------------------------------------

  describe('getDueRotations', () => {
    it('should return credentials that are past their rotation date', () => {
      service.addRotationConfig({
        credentialName: 'expired-key',
        rotationIntervalDays: 90,
        nextRotation: '2020-01-01T00:00:00.000Z',
      });
      service.addRotationConfig({
        credentialName: 'future-key',
        rotationIntervalDays: 90,
        nextRotation: '2099-01-01T00:00:00.000Z',
      });

      const due = service.getDueRotations();
      expect(due).toHaveLength(1);
      expect(due[0].credentialName).toBe('expired-key');
    });
  });

  // -----------------------------------------------------------------------
  // Legacy rotate() — backward compatibility
  // -----------------------------------------------------------------------

  describe('rotate() — backward compatible', () => {
    it('should rotate and update schedule', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 30,
      });

      const result = await service.rotate('api-key');
      expect(result.success).toBe(true);
      expect(result.credentialName).toBe('api-key');
      expect(result.previousVersion).toBeTruthy();
      expect(result.newVersion).toBeTruthy();
      expect(result.rotatedAt).toBeTruthy();
    });

    it('should return failure for unknown credential', async () => {
      const result = await service.rotate('unknown');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Config not found');
    });
  });

  // -----------------------------------------------------------------------
  // Zero-Downtime Rotation Lifecycle (Req 20.5)
  // -----------------------------------------------------------------------

  describe('startRotation', () => {
    it('should create a pending version and set state to rotating', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const result = await service.startRotation('api-key');
      expect(result.success).toBe(true);
      expect(result.newVersion).toBeTruthy();
      expect(service.getRotationState('api-key')).toBe('rotating');

      const versions = service.getCredentialVersions('api-key');
      expect(versions).toHaveLength(1);
      expect(versions[0].status).toBe('pending');
    });

    it('should fail if rotation is already in progress', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');
      const result = await service.startRotation('api-key');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already in progress');
    });

    it('should fail for unknown credential', async () => {
      const result = await service.startRotation('unknown');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Config not found');
    });

    it('should log to audit service', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');

      expect(mockAudit.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'credential.rotation.started',
          target: 'api-key',
          outcome: 'success',
        }),
      );
    });

    it('should publish event to event bus', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'credential.rotation.started',
          source: 'seraphim.credential-rotation',
        }),
      );
    });
  });

  describe('verifyNewCredential', () => {
    it('should mark pending version as verified and set state to verifying', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });
      await service.startRotation('api-key');

      const verified = await service.verifyNewCredential('api-key');
      expect(verified).toBe(true);
      expect(service.getRotationState('api-key')).toBe('verifying');

      const versions = service.getCredentialVersions('api-key');
      const pending = versions.find((v) => v.status === 'pending');
      expect(pending?.verifiedAt).toBeDefined();
    });

    it('should return false if not in rotating state', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const verified = await service.verifyNewCredential('api-key');
      expect(verified).toBe(false);
    });
  });

  describe('completeRotation', () => {
    it('should deactivate old versions and promote new version to active', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');
      await service.verifyNewCredential('api-key');
      const completed = await service.completeRotation('api-key');

      expect(completed).toBe(true);
      expect(service.getRotationState('api-key')).toBe('idle');

      const versions = service.getCredentialVersions('api-key');
      const active = versions.filter((v) => v.status === 'active');
      expect(active).toHaveLength(1);
    });

    it('should update rotation schedule after completion', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 30,
        nextRotation: '2020-01-01T00:00:00.000Z',
      });

      await service.startRotation('api-key');
      await service.verifyNewCredential('api-key');
      await service.completeRotation('api-key');

      const schedule = service.getRotationSchedule();
      const config = schedule.find((c) => c.credentialName === 'api-key');
      expect(config?.lastRotated).toBeDefined();
      // Next rotation should be ~30 days from now
      const nextDate = new Date(config!.nextRotation!);
      expect(nextDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return false if not in verifying state', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const completed = await service.completeRotation('api-key');
      expect(completed).toBe(false);
    });

    it('should log completion to audit and publish event', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');
      await service.verifyNewCredential('api-key');
      await service.completeRotation('api-key');

      expect(mockAudit.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'credential.rotation.completed',
        }),
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'credential.rotation.completed',
        }),
      );
    });
  });

  describe('rollbackRotation', () => {
    it('should deactivate pending version and reset state to idle', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');
      const rolledBack = await service.rollbackRotation('api-key');

      expect(rolledBack).toBe(true);
      expect(service.getRotationState('api-key')).toBe('idle');

      const versions = service.getCredentialVersions('api-key');
      const deactivated = versions.filter((v) => v.status === 'deactivated');
      expect(deactivated).toHaveLength(1);
      expect(deactivated[0].deactivatedAt).toBeDefined();
    });

    it('should return false if not in rotating or verifying state', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const rolledBack = await service.rollbackRotation('api-key');
      expect(rolledBack).toBe(false);
    });

    it('should log rollback to audit and publish failure event', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      await service.startRotation('api-key');
      await service.rollbackRotation('api-key');

      expect(mockAudit.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'credential.rotation.rolledback',
          outcome: 'failure',
        }),
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'credential.rotation.failed',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Full Lifecycle: start → verify → complete
  // -----------------------------------------------------------------------

  describe('full rotation lifecycle', () => {
    it('should support complete zero-downtime rotation flow', async () => {
      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      // Start — both old and new are available
      const startResult = await service.startRotation('api-key');
      expect(startResult.success).toBe(true);
      expect(service.getRotationState('api-key')).toBe('rotating');

      // Verify — new credential confirmed working
      const verified = await service.verifyNewCredential('api-key');
      expect(verified).toBe(true);
      expect(service.getRotationState('api-key')).toBe('verifying');

      // Complete — old deactivated, new is sole active
      const completed = await service.completeRotation('api-key');
      expect(completed).toBe(true);
      expect(service.getRotationState('api-key')).toBe('idle');

      const versions = service.getCredentialVersions('api-key');
      const active = versions.filter((v) => v.status === 'active');
      expect(active).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Auto-Rotation
  // -----------------------------------------------------------------------

  describe('checkAndRotateDue', () => {
    it('should start rotation for all due credentials', async () => {
      service.addRotationConfig({
        credentialName: 'expired-1',
        rotationIntervalDays: 90,
        nextRotation: '2020-01-01T00:00:00.000Z',
      });
      service.addRotationConfig({
        credentialName: 'expired-2',
        rotationIntervalDays: 90,
        nextRotation: '2020-06-01T00:00:00.000Z',
      });
      service.addRotationConfig({
        credentialName: 'not-due',
        rotationIntervalDays: 90,
        nextRotation: '2099-01-01T00:00:00.000Z',
      });

      const results = await service.checkAndRotateDue();
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      expect(service.getRotationState('expired-1')).toBe('rotating');
      expect(service.getRotationState('expired-2')).toBe('rotating');
      expect(service.getRotationState('not-due')).toBe('idle');
    });
  });

  // -----------------------------------------------------------------------
  // Service without optional dependencies
  // -----------------------------------------------------------------------

  describe('without audit/event services', () => {
    it('should work without audit service or event bus', async () => {
      const bareService = new CredentialRotationService();
      bareService.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const result = await bareService.startRotation('api-key');
      expect(result.success).toBe(true);

      await bareService.verifyNewCredential('api-key');
      const completed = await bareService.completeRotation('api-key');
      expect(completed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Audit/Event failure resilience
  // -----------------------------------------------------------------------

  describe('resilience to audit/event failures', () => {
    it('should not fail rotation when audit service throws', async () => {
      mockAudit.recordAction.mockRejectedValue(new Error('Audit down'));

      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const result = await service.startRotation('api-key');
      expect(result.success).toBe(true);
    });

    it('should not fail rotation when event bus throws', async () => {
      mockEventBus.publish.mockRejectedValue(new Error('EventBridge down'));

      service.addRotationConfig({
        credentialName: 'api-key',
        rotationIntervalDays: 90,
      });

      const result = await service.startRotation('api-key');
      expect(result.success).toBe(true);
    });
  });
});
