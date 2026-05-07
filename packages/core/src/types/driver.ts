/**
 * Driver layer data models.
 */

import type { DriverStatus } from './enums.js';

// ---------------------------------------------------------------------------
// Driver Operation
// ---------------------------------------------------------------------------

export interface DriverOperation {
  type: string;
  params: Record<string, unknown>;
  timeout?: number;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Driver Result
// ---------------------------------------------------------------------------

export interface DriverResult {
  success: boolean;
  data?: unknown;
  error?: DriverError;
  retryable: boolean;
  operationId: string;
}

// ---------------------------------------------------------------------------
// Driver Error
// ---------------------------------------------------------------------------

export interface DriverError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Retry Policy
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ---------------------------------------------------------------------------
// Connection Result
// ---------------------------------------------------------------------------

export interface ConnectionResult {
  success: boolean;
  status: DriverStatus;
  message?: string;
}

// ---------------------------------------------------------------------------
// Health Status
// ---------------------------------------------------------------------------

export interface HealthStatus {
  healthy: boolean;
  status: DriverStatus;
  lastSuccessfulOperation?: Date;
  errorCount: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Verification Result (from Driver.verify)
// ---------------------------------------------------------------------------

export interface VerificationResult {
  verified: boolean;
  operationId: string;
  details?: Record<string, unknown>;
}
