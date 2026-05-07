/**
 * Credential Manager interface — secure credential retrieval, rotation,
 * and schedule management for all external service integrations.
 *
 * Requirements: 20.1, 20.5
 */

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export interface RotationResult {
  /** Whether the rotation was successfully initiated */
  success: boolean;
  /** The driver whose credentials were rotated */
  driverName: string;
  /** The ARN of the secret version being rotated to */
  newVersionId?: string;
  /** Error message if rotation failed */
  error?: string;
}

export interface RotationSchedule {
  /** The driver name this schedule applies to */
  driverName: string;
  /** Rotation interval in days */
  rotationIntervalDays: number;
  /** When the last rotation occurred (undefined if never rotated) */
  lastRotatedAt?: Date;
  /** When the next rotation is scheduled */
  nextRotationAt?: Date;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CredentialManager {
  /**
   * Retrieve a credential for a driver at runtime.
   *
   * Credentials are cached in memory with a short TTL (5 minutes).
   * Every access is logged to XO Audit (key name only, never the value).
   *
   * @param driverName - The name of the driver (e.g. 'appstore-connect', 'youtube')
   * @param credentialKey - The specific credential key (e.g. 'api-key', 'client-secret')
   * @returns The credential value
   */
  getCredential(driverName: string, credentialKey: string): Promise<string>;

  /**
   * Trigger credential rotation for a driver with zero-downtime.
   *
   * Uses dual-version credentials during the rotation window so that
   * existing connections continue to work while new credentials are
   * being provisioned.
   *
   * @param driverName - The name of the driver whose credentials to rotate
   * @returns The rotation result
   */
  rotateCredential(driverName: string): Promise<RotationResult>;

  /**
   * Return configured rotation schedules for all managed credentials.
   *
   * Default rotation interval is 90 days.
   *
   * @returns Array of rotation schedules
   */
  getRotationSchedule(): Promise<RotationSchedule[]>;
}
