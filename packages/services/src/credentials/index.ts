/**
 * Credential Manager service module.
 */
export { CredentialManagerImpl } from './manager.js';
export type { CredentialManagerConfig, SecretsManagerClient } from './manager.js';
export { LocalCredentialManager } from './local-credential-manager.js';

export { CredentialRotationService } from './rotation.js';
export type {
  CredentialRotationServiceConfig,
  RotationConfig,
  RotationResult,
  RotationState,
  CredentialVersion,
} from './rotation.js';

export { TenantIsolationManager } from './tenant-isolation.js';
export type {
  TenantTier,
  TenantIsolationConfig,
  SecurityGroupRule,
} from './tenant-isolation.js';
