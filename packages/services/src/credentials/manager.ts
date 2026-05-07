/**
 * Credential Manager — secure credential retrieval, caching, rotation,
 * and audit logging for all external service integrations.
 *
 * Implements the CredentialManager interface from @seraphim/core.
 * Uses AWS Secrets Manager for storage, in-memory cache with 5-minute TTL,
 * and logs every access to XO Audit (key name only, never the value).
 *
 * Requirements: 20.1, 20.5
 */

import type {
  CredentialManager,
  RotationResult,
  RotationSchedule,
  XOAuditService,
} from '@seraphim/core';
import type { AuditEntry } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Secrets Manager Client Abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal interface for AWS Secrets Manager operations.
 * Abstracted so it can be mocked in tests without importing the AWS SDK.
 */
export interface SecretsManagerClient {
  getSecretValue(params: {
    SecretId: string;
    VersionStage?: string;
  }): Promise<{ SecretString?: string; VersionId?: string }>;

  rotateSecret(params: {
    SecretId: string;
    RotationRules?: { AutomaticallyAfterDays: number };
  }): Promise<{ VersionId?: string }>;

  describeSecret(params: {
    SecretId: string;
  }): Promise<{
    RotationEnabled?: boolean;
    RotationRules?: { AutomaticallyAfterDays?: number };
    LastRotatedDate?: Date;
    NextRotationDate?: Date;
  }>;
}

// ---------------------------------------------------------------------------
// Cache Entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CredentialManagerConfig {
  /** Tenant ID for audit logging */
  tenantId: string;

  /** Agent ID used for audit entries */
  agentId?: string;

  /** Agent name used for audit entries */
  agentName?: string;

  /** AWS Secrets Manager client (abstracted for testability) */
  secretsManagerClient: SecretsManagerClient;

  /** XO Audit service for logging credential access */
  auditService: XOAuditService;

  /** Cache TTL in milliseconds (default: 5 minutes = 300_000 ms) */
  cacheTtlMs?: number;

  /** Default rotation interval in days (default: 90) */
  defaultRotationIntervalDays?: number;

  /**
   * Map of driver names to their Secrets Manager secret IDs.
   * e.g. { 'appstore-connect': 'seraphim/drivers/appstore-connect' }
   */
  secretMappings: Record<string, string>;

  /**
   * Optional per-driver rotation interval overrides (in days).
   * Drivers not listed here use the default rotation interval.
   */
  rotationOverrides?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_ROTATION_INTERVAL_DAYS = 90;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CredentialManagerImpl implements CredentialManager {
  private readonly config: CredentialManagerConfig;
  private readonly secretsManager: SecretsManagerClient;
  private readonly auditService: XOAuditService;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs: number;
  private readonly defaultRotationIntervalDays: number;

  constructor(config: CredentialManagerConfig) {
    this.config = config;
    this.secretsManager = config.secretsManagerClient;
    this.auditService = config.auditService;
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.defaultRotationIntervalDays =
      config.defaultRotationIntervalDays ?? DEFAULT_ROTATION_INTERVAL_DAYS;
  }

  // -----------------------------------------------------------------------
  // getCredential (Req 20.1)
  // -----------------------------------------------------------------------

  async getCredential(
    driverName: string,
    credentialKey: string,
  ): Promise<string> {
    const cacheKey = `${driverName}:${credentialKey}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      // Log access even for cache hits — audit every access
      await this.logCredentialAccess(driverName, credentialKey, 'cache_hit');
      return cached.value;
    }

    // Resolve the Secrets Manager secret ID
    const secretId = this.resolveSecretId(driverName);

    // Retrieve from Secrets Manager
    const response = await this.secretsManager.getSecretValue({
      SecretId: secretId,
    });

    if (!response.SecretString) {
      await this.logCredentialAccess(
        driverName,
        credentialKey,
        'retrieval_failed',
      );
      throw new Error(
        `Credential not found for driver "${driverName}" key "${credentialKey}"`,
      );
    }

    // Parse the secret (expected to be a JSON object with credential keys)
    let secretData: Record<string, string>;
    try {
      secretData = JSON.parse(response.SecretString);
    } catch {
      await this.logCredentialAccess(
        driverName,
        credentialKey,
        'parse_failed',
      );
      throw new Error(
        `Failed to parse credentials for driver "${driverName}"`,
      );
    }

    const value = secretData[credentialKey];
    if (value === undefined) {
      await this.logCredentialAccess(
        driverName,
        credentialKey,
        'key_not_found',
      );
      throw new Error(
        `Credential key "${credentialKey}" not found for driver "${driverName}"`,
      );
    }

    // Cache the value with TTL
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    // Log successful retrieval (key name only, never the value)
    await this.logCredentialAccess(driverName, credentialKey, 'retrieved');

    return value;
  }

  // -----------------------------------------------------------------------
  // rotateCredential (Req 20.5)
  // -----------------------------------------------------------------------

  async rotateCredential(driverName: string): Promise<RotationResult> {
    const secretId = this.resolveSecretId(driverName);
    const rotationDays =
      this.config.rotationOverrides?.[driverName] ??
      this.defaultRotationIntervalDays;

    try {
      const response = await this.secretsManager.rotateSecret({
        SecretId: secretId,
        RotationRules: { AutomaticallyAfterDays: rotationDays },
      });

      // Invalidate all cached entries for this driver to force fresh retrieval
      this.invalidateDriverCache(driverName);

      // Log rotation to audit
      await this.logCredentialRotation(driverName, 'success');

      return {
        success: true,
        driverName,
        newVersionId: response.VersionId,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown rotation error';

      // Log failed rotation to audit
      await this.logCredentialRotation(driverName, 'failure');

      return {
        success: false,
        driverName,
        error: errorMessage,
      };
    }
  }

  // -----------------------------------------------------------------------
  // getRotationSchedule (Req 20.5)
  // -----------------------------------------------------------------------

  async getRotationSchedule(): Promise<RotationSchedule[]> {
    const schedules: RotationSchedule[] = [];

    for (const [driverName, secretId] of Object.entries(
      this.config.secretMappings,
    )) {
      const rotationDays =
        this.config.rotationOverrides?.[driverName] ??
        this.defaultRotationIntervalDays;

      try {
        const description = await this.secretsManager.describeSecret({
          SecretId: secretId,
        });

        schedules.push({
          driverName,
          rotationIntervalDays:
            description.RotationRules?.AutomaticallyAfterDays ?? rotationDays,
          lastRotatedAt: description.LastRotatedDate,
          nextRotationAt: description.NextRotationDate,
        });
      } catch {
        // If we can't describe the secret, return the configured defaults
        schedules.push({
          driverName,
          rotationIntervalDays: rotationDays,
        });
      }
    }

    return schedules;
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the Secrets Manager secret ID for a driver.
   */
  private resolveSecretId(driverName: string): string {
    const secretId = this.config.secretMappings[driverName];
    if (!secretId) {
      throw new Error(
        `No secret mapping configured for driver "${driverName}"`,
      );
    }
    return secretId;
  }

  /**
   * Invalidate all cached entries for a specific driver.
   * Used after credential rotation to force fresh retrieval.
   */
  private invalidateDriverCache(driverName: string): void {
    const prefix = `${driverName}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Log a credential access event to XO Audit.
   * NEVER includes the credential value — only the key name.
   */
  private async logCredentialAccess(
    driverName: string,
    credentialKey: string,
    outcome: 'retrieved' | 'cache_hit' | 'retrieval_failed' | 'parse_failed' | 'key_not_found',
  ): Promise<void> {
    const auditOutcome: AuditEntry['outcome'] =
      outcome === 'retrieved' || outcome === 'cache_hit'
        ? 'success'
        : 'failure';

    const entry: AuditEntry = {
      tenantId: this.config.tenantId,
      actingAgentId: this.config.agentId ?? 'credential-manager',
      actingAgentName: this.config.agentName ?? 'CredentialManager',
      actionType: 'credential.access',
      target: `${driverName}/${credentialKey}`,
      authorizationChain: [],
      executionTokens: [],
      outcome: auditOutcome,
      details: {
        driverName,
        credentialKey,
        accessType: outcome,
      },
    };

    try {
      await this.auditService.recordAction(entry);
    } catch {
      // Audit logging failure should not block credential retrieval.
      // In production, this would be logged to a fallback logger.
    }
  }

  /**
   * Log a credential rotation event to XO Audit.
   * NEVER includes credential values.
   */
  private async logCredentialRotation(
    driverName: string,
    outcome: 'success' | 'failure',
  ): Promise<void> {
    const entry: AuditEntry = {
      tenantId: this.config.tenantId,
      actingAgentId: this.config.agentId ?? 'credential-manager',
      actingAgentName: this.config.agentName ?? 'CredentialManager',
      actionType: 'credential.rotation',
      target: driverName,
      authorizationChain: [],
      executionTokens: [],
      outcome,
      details: {
        driverName,
        rotationType: 'scheduled',
      },
    };

    try {
      await this.auditService.recordAction(entry);
    } catch {
      // Audit logging failure should not block rotation.
    }
  }
}
