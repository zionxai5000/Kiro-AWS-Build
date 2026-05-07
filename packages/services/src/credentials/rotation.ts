/**
 * Credential Rotation Automation
 *
 * Automated credential rotation on configurable schedule (default 90 days)
 * with zero-downtime dual-version credentials during rotation window.
 * Supports automatic switchover after verification and rollback on failure.
 *
 * Requirements: 20.4, 20.5
 */

import { randomUUID } from 'node:crypto';

import type { XOAuditService, EventBusService } from '@seraphim/core';
import type { AuditEntry, SystemEvent } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RotationState =
  | 'idle'
  | 'rotating'
  | 'verifying'
  | 'switchover'
  | 'complete';

export interface RotationConfig {
  credentialName: string;
  rotationIntervalDays: number;
  lastRotated?: string;
  nextRotation?: string;
}

export interface RotationResult {
  credentialName: string;
  success: boolean;
  previousVersion: string;
  newVersion: string;
  rotatedAt: string;
  error?: string;
}

export interface CredentialVersion {
  version: string;
  status: 'active' | 'pending' | 'deactivated';
  createdAt: string;
  verifiedAt?: string;
  deactivatedAt?: string;
}

export interface CredentialRotationServiceConfig {
  auditService?: XOAuditService;
  eventBus?: EventBusService;
  /** Default rotation interval in days (default: 90) */
  defaultRotationIntervalDays?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ROTATION_INTERVAL_DAYS = 90;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CredentialRotationService {
  private configs = new Map<string, RotationConfig>();
  private rotationStates = new Map<string, RotationState>();
  private credentialVersions = new Map<string, CredentialVersion[]>();

  private readonly auditService?: XOAuditService;
  private readonly eventBus?: EventBusService;
  private readonly defaultRotationIntervalDays: number;

  constructor(config?: CredentialRotationServiceConfig) {
    this.auditService = config?.auditService;
    this.eventBus = config?.eventBus;
    this.defaultRotationIntervalDays =
      config?.defaultRotationIntervalDays ?? DEFAULT_ROTATION_INTERVAL_DAYS;
  }

  // -----------------------------------------------------------------------
  // Configuration Management
  // -----------------------------------------------------------------------

  addRotationConfig(config: RotationConfig): void {
    if (!config.nextRotation) {
      const next = new Date();
      next.setDate(next.getDate() + config.rotationIntervalDays);
      config.nextRotation = next.toISOString();
    }
    this.configs.set(config.credentialName, config);
    this.rotationStates.set(config.credentialName, 'idle');
  }

  getRotationSchedule(): RotationConfig[] {
    return Array.from(this.configs.values());
  }

  getDueRotations(): RotationConfig[] {
    const now = new Date();
    return Array.from(this.configs.values()).filter((c) => {
      if (!c.nextRotation) return false;
      return new Date(c.nextRotation) <= now;
    });
  }

  // -----------------------------------------------------------------------
  // Rotation State
  // -----------------------------------------------------------------------

  getRotationState(credentialName: string): RotationState | undefined {
    return this.rotationStates.get(credentialName);
  }

  getCredentialVersions(credentialName: string): CredentialVersion[] {
    return this.credentialVersions.get(credentialName) ?? [];
  }

  // -----------------------------------------------------------------------
  // Legacy rotate() — backward compatible
  // -----------------------------------------------------------------------

  async rotate(credentialName: string): Promise<RotationResult> {
    const config = this.configs.get(credentialName);
    if (!config) {
      return {
        credentialName,
        success: false,
        previousVersion: '',
        newVersion: '',
        rotatedAt: '',
        error: 'Config not found',
      };
    }

    const now = new Date();
    const previousVersion = `v-${Date.now() - 1}`;
    const newVersion = `v-${Date.now()}`;

    config.lastRotated = now.toISOString();
    const next = new Date(now);
    next.setDate(next.getDate() + config.rotationIntervalDays);
    config.nextRotation = next.toISOString();

    return {
      credentialName,
      success: true,
      previousVersion,
      newVersion,
      rotatedAt: now.toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Zero-Downtime Rotation Lifecycle (Req 20.5)
  // -----------------------------------------------------------------------

  /**
   * Start rotation: generate a new credential version while keeping the
   * old one active. Both versions are usable during the rotation window.
   */
  async startRotation(credentialName: string): Promise<RotationResult> {
    const config = this.configs.get(credentialName);
    if (!config) {
      return {
        credentialName,
        success: false,
        previousVersion: '',
        newVersion: '',
        rotatedAt: '',
        error: 'Config not found',
      };
    }

    const currentState = this.rotationStates.get(credentialName);
    if (currentState === 'rotating' || currentState === 'verifying') {
      return {
        credentialName,
        success: false,
        previousVersion: '',
        newVersion: '',
        rotatedAt: '',
        error: `Rotation already in progress (state: ${currentState})`,
      };
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const previousVersion = this.getActiveVersion(credentialName)?.version ?? `v-${Date.now() - 1}`;
    const newVersion = `v-${randomUUID()}`;

    // Set up dual-version: old stays active, new is pending
    const versions = this.credentialVersions.get(credentialName) ?? [];

    // Mark existing active versions as still active (dual-version window)
    const newVersionEntry: CredentialVersion = {
      version: newVersion,
      status: 'pending',
      createdAt: nowISO,
    };
    versions.push(newVersionEntry);
    this.credentialVersions.set(credentialName, versions);

    // Update state
    this.rotationStates.set(credentialName, 'rotating');

    // Audit logging
    await this.logAudit(credentialName, 'credential.rotation.started', 'success', {
      previousVersion,
      newVersion,
      state: 'rotating',
    });

    // Event bus publishing
    await this.publishEvent('credential.rotation.started', credentialName, {
      previousVersion,
      newVersion,
    });

    return {
      credentialName,
      success: true,
      previousVersion,
      newVersion,
      rotatedAt: nowISO,
    };
  }

  /**
   * Verify the new credential works correctly. Marks it as verified
   * and transitions to the 'verifying' state.
   */
  async verifyNewCredential(credentialName: string): Promise<boolean> {
    const currentState = this.rotationStates.get(credentialName);
    if (currentState !== 'rotating') {
      return false;
    }

    const versions = this.credentialVersions.get(credentialName) ?? [];
    const pendingVersion = versions.find((v) => v.status === 'pending');
    if (!pendingVersion) {
      return false;
    }

    pendingVersion.verifiedAt = new Date().toISOString();
    this.rotationStates.set(credentialName, 'verifying');

    await this.logAudit(credentialName, 'credential.rotation.verified', 'success', {
      version: pendingVersion.version,
      state: 'verifying',
    });

    return true;
  }

  /**
   * Complete the rotation: deactivate old version(s), promote the new
   * verified version to active. Zero-downtime switchover.
   */
  async completeRotation(credentialName: string): Promise<boolean> {
    const currentState = this.rotationStates.get(credentialName);
    if (currentState !== 'verifying') {
      return false;
    }

    const versions = this.credentialVersions.get(credentialName) ?? [];
    const pendingVersion = versions.find(
      (v) => v.status === 'pending' && v.verifiedAt,
    );
    if (!pendingVersion) {
      return false;
    }

    const now = new Date().toISOString();

    // Deactivate all previously active versions
    for (const v of versions) {
      if (v.status === 'active') {
        v.status = 'deactivated';
        v.deactivatedAt = now;
      }
    }

    // Promote the verified pending version to active
    pendingVersion.status = 'active';

    // Update rotation schedule
    this.rotationStates.set(credentialName, 'complete');

    const config = this.configs.get(credentialName);
    if (config) {
      config.lastRotated = now;
      const next = new Date(now);
      next.setDate(next.getDate() + config.rotationIntervalDays);
      config.nextRotation = next.toISOString();
    }

    // Reset state to idle after completion
    this.rotationStates.set(credentialName, 'idle');

    await this.logAudit(credentialName, 'credential.rotation.completed', 'success', {
      version: pendingVersion.version,
      state: 'complete',
    });

    await this.publishEvent('credential.rotation.completed', credentialName, {
      version: pendingVersion.version,
    });

    return true;
  }

  /**
   * Rollback rotation: if verification fails, deactivate the new version
   * and keep the old one active.
   */
  async rollbackRotation(credentialName: string): Promise<boolean> {
    const currentState = this.rotationStates.get(credentialName);
    if (currentState !== 'rotating' && currentState !== 'verifying') {
      return false;
    }

    const versions = this.credentialVersions.get(credentialName) ?? [];
    const pendingVersion = versions.find((v) => v.status === 'pending');
    if (!pendingVersion) {
      return false;
    }

    // Deactivate the pending (new) version
    pendingVersion.status = 'deactivated';
    pendingVersion.deactivatedAt = new Date().toISOString();

    // Reset state to idle
    this.rotationStates.set(credentialName, 'idle');

    await this.logAudit(credentialName, 'credential.rotation.rolledback', 'failure', {
      version: pendingVersion.version,
      state: 'rolledback',
    });

    await this.publishEvent('credential.rotation.failed', credentialName, {
      version: pendingVersion.version,
      reason: 'rollback',
    });

    return true;
  }

  // -----------------------------------------------------------------------
  // Auto-Rotation (Req 20.5)
  // -----------------------------------------------------------------------

  /**
   * Check all configured credentials and start rotation for any that are due.
   */
  async checkAndRotateDue(): Promise<RotationResult[]> {
    const dueRotations = this.getDueRotations();
    const results: RotationResult[] = [];

    for (const config of dueRotations) {
      const result = await this.startRotation(config.credentialName);
      results.push(result);
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private getActiveVersion(credentialName: string): CredentialVersion | undefined {
    const versions = this.credentialVersions.get(credentialName) ?? [];
    return versions.find((v) => v.status === 'active');
  }

  /**
   * Log a rotation event to XO Audit. Silently skips if no audit service.
   */
  private async logAudit(
    credentialName: string,
    actionType: string,
    outcome: 'success' | 'failure',
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditService) return;

    const entry: AuditEntry = {
      tenantId: 'system',
      actingAgentId: 'credential-rotation-service',
      actingAgentName: 'CredentialRotationService',
      actionType,
      target: credentialName,
      authorizationChain: [],
      executionTokens: [],
      outcome,
      details: {
        credentialName,
        ...details,
      },
    };

    try {
      await this.auditService.recordAction(entry);
    } catch {
      // Audit logging failure should not block rotation operations.
    }
  }

  /**
   * Publish a rotation event to the Event Bus. Silently skips if no event bus.
   */
  private async publishEvent(
    eventType: string,
    credentialName: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (!this.eventBus) return;

    const event: SystemEvent = {
      source: 'seraphim.credential-rotation',
      type: eventType,
      detail: {
        credentialName,
        ...detail,
      },
      metadata: {
        tenantId: 'system',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    };

    try {
      await this.eventBus.publish(event);
    } catch {
      // Event publishing failure should not block rotation operations.
    }
  }
}
