/**
 * Driver interface — uniform adapter contract for all external service integrations.
 */

import type { DriverStatus } from '../types/enums.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
  RetryPolicy,
  ConnectionResult,
  HealthStatus,
} from '../types/driver.js';

export interface Driver<TConfig = unknown> {
  readonly name: string;
  readonly version: string;
  readonly status: DriverStatus;

  connect(config: TConfig): Promise<ConnectionResult>;
  execute(operation: DriverOperation): Promise<DriverResult>;
  verify(operationId: string): Promise<VerificationResult>;
  disconnect(): Promise<void>;

  // Health
  healthCheck(): Promise<HealthStatus>;

  // Retry built-in
  getRetryPolicy(): RetryPolicy;
}
