/**
 * npm Registry Client — thin fetch wrapper for package validation.
 *
 * Validates package existence and version range satisfiability against
 * the public npm registry (https://registry.npmjs.org).
 *
 * Uses Phase 1 utilities: withTimeout, retryWithBackoff, circuit breaker.
 * No authentication needed (public registry, read-only).
 */

import * as semver from 'semver';
import { withTimeout } from '../utils/timeout.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { LIMITS } from '../config/limits.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackageCheckResult {
  exists: boolean;
  versionSatisfied?: boolean;
  /** The best matching version, if version range was provided and satisfied */
  matchedVersion?: string;
}

export interface NpmRegistryClientConfig {
  /** Base URL for the registry (default: https://registry.npmjs.org) */
  registryUrl?: string;
  /** Timeout per request in ms (default: 10000) */
  timeoutMs?: number;
  /** User-Agent header */
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_USER_AGENT = 'seraphim-app-dev/1.0';

export class NpmRegistryClient {
  private readonly registryUrl: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(config: NpmRegistryClientConfig = {}) {
    this.registryUrl = config.registryUrl ?? DEFAULT_REGISTRY;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
  }

  /**
   * Check if a package exists on npm and optionally if a version range is satisfiable.
   *
   * @param name - Package name (e.g., 'react', '@expo/vector-icons')
   * @param versionRange - Optional semver range (e.g., '^18.0.0', '~52.0.0')
   * @returns { exists, versionSatisfied?, matchedVersion? }
   */
  async checkPackage(name: string, versionRange?: string): Promise<PackageCheckResult> {
    const cb = getCircuitBreaker('npm-registry');
    cb.allowRequest();

    try {
      const result = await retryWithBackoff(
        () => withTimeout(
          () => this.fetchPackageVersions(name),
          this.timeoutMs,
          `npm registry timeout for "${name}"`,
        ),
        {
          maxRetries: 2,
          backoffMs: [1000, 3000],
          shouldRetry: (error) => this.isRetryable(error),
        },
      );

      cb.recordSuccess();

      if (!result.exists) {
        return { exists: false };
      }

      if (!versionRange) {
        return { exists: true };
      }

      // Check if any published version satisfies the range
      const matched = semver.maxSatisfying(result.versions, versionRange);
      return {
        exists: true,
        versionSatisfied: matched !== null,
        matchedVersion: matched ?? undefined,
      };
    } catch (error) {
      cb.recordFailure();
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async fetchPackageVersions(name: string): Promise<{ exists: boolean; versions: string[] }> {
    // Encode scoped package names (e.g., @expo/vector-icons → %40expo%2Fvector-icons)
    const encodedName = encodeURIComponent(name).replace('%40', '@');
    const url = `${this.registryUrl}/${encodedName}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': this.userAgent,
      },
    });

    if (response.status === 404) {
      return { exists: false, versions: [] };
    }

    if (!response.ok) {
      throw new Error(`npm registry returned ${response.status} for "${name}"`);
    }

    const data = await response.json() as { versions?: Record<string, unknown> };

    if (!data || typeof data !== 'object' || !data.versions) {
      throw new Error(`Malformed npm registry response for "${name}"`);
    }

    // Extract ONLY version keys — discard the rest (~30KB+ per package)
    const versions = Object.keys(data.versions);
    return { exists: true, versions };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Only retry network errors and timeouts — NOT 4xx/5xx HTTP errors or parse errors
      if (msg.includes('timeout')) return true;
      if (msg.includes('fetch failed')) return true;
      if (msg.includes('network')) return true;
      if (msg.includes('econnrefused')) return true;
      if (msg.includes('enotfound')) return true;
    }
    return false;
  }
}
