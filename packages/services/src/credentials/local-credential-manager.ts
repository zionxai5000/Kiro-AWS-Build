/**
 * Local Credential Manager — reads credentials from environment variables.
 *
 * Used for local development when AWS Secrets Manager is not available.
 * Maps driver names and credential keys to environment variable names.
 *
 * In production, use CredentialManagerImpl (backed by AWS Secrets Manager).
 * Locally, this reads from process.env (populated by .env file via dotenv).
 */

import type { CredentialManager, RotationResult, RotationSchedule } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Environment Variable Mappings
// ---------------------------------------------------------------------------

/**
 * Maps (driverName, credentialKey) → environment variable name.
 * Add new drivers here as they're integrated.
 */
const ENV_MAPPINGS: Record<string, Record<string, string>> = {
  anthropic: {
    'api-key': 'ANTHROPIC_API_KEY',
  },
  openai: {
    'api-key': 'OPENAI_API_KEY',
  },
  github: {
    'token': 'GITHUB_TOKEN',
  },
  'appstore-connect': {
    'api-key': 'APPSTORE_CONNECT_API_KEY',
    'key-id': 'APPSTORE_CONNECT_KEY_ID',
    'issuer-id': 'APPSTORE_CONNECT_ISSUER_ID',
  },
  'google-play': {
    'service-account-json': 'GOOGLE_PLAY_SERVICE_ACCOUNT',
  },
  youtube: {
    'api-key': 'YOUTUBE_API_KEY',
    'oauth-client-id': 'YOUTUBE_OAUTH_CLIENT_ID',
    'oauth-client-secret': 'YOUTUBE_OAUTH_CLIENT_SECRET',
  },
  kalshi: {
    'api-key': 'KALSHI_API_KEY',
    'api-secret': 'KALSHI_API_SECRET',
  },
  polymarket: {
    'api-key': 'POLYMARKET_API_KEY',
    'api-secret': 'POLYMARKET_API_SECRET',
  },
  heygen: {
    'api-key': 'HEYGEN_API_KEY',
  },
  stripe: {
    'secret-key': 'STRIPE_SECRET_KEY',
  },
  'google-ads': {
    'developer-token': 'GOOGLE_ADS_DEVELOPER_TOKEN',
    'client-id': 'GOOGLE_ADS_CLIENT_ID',
    'client-secret': 'GOOGLE_ADS_CLIENT_SECRET',
  },
  expo: {
    'access-token': 'EXPO_TOKEN',
  },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class LocalCredentialManager implements CredentialManager {
  /**
   * Retrieves a credential from environment variables.
   * Falls back to empty string if not set (driver will operate in stub mode).
   */
  async getCredential(driverName: string, credentialKey: string): Promise<string> {
    const driverMappings = ENV_MAPPINGS[driverName];
    if (!driverMappings) {
      throw new Error(
        `No environment variable mapping for driver "${driverName}". ` +
        `Add it to LocalCredentialManager ENV_MAPPINGS.`,
      );
    }

    const envVar = driverMappings[credentialKey];
    if (!envVar) {
      throw new Error(
        `No environment variable mapping for driver "${driverName}" key "${credentialKey}". ` +
        `Add it to LocalCredentialManager ENV_MAPPINGS.`,
      );
    }

    const value = process.env[envVar];
    if (!value) {
      // Return empty string — the driver should handle missing credentials
      // by operating in stub mode (per Requirement 33c.11)
      return '';
    }

    return value;
  }

  /**
   * Rotation is not supported locally — credentials are managed manually.
   */
  async rotateCredential(driverName: string): Promise<RotationResult> {
    return {
      success: false,
      driverName,
      error: 'Credential rotation is not supported in local development mode. Update your .env file manually.',
    };
  }

  /**
   * Returns empty schedule — rotation is managed via AWS Secrets Manager in production.
   */
  async getRotationSchedule(): Promise<RotationSchedule[]> {
    return [];
  }
}
