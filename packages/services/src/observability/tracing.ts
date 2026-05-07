/**
 * Observability — Distributed Tracing (X-Ray)
 *
 * Configuration for AWS X-Ray distributed tracing across ECS tasks
 * and Lambda functions.
 *
 * Requirements: 18.1, 18.4
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Tracing types
// ---------------------------------------------------------------------------

export interface TracingConfig {
  /** Whether tracing is enabled */
  enabled: boolean;
  /** Service name for trace segments */
  serviceName: string;
  /** Sampling rate (0.0 to 1.0, default 0.05 = 5%) */
  samplingRate?: number;
}

// ---------------------------------------------------------------------------
// TracingManager
// ---------------------------------------------------------------------------

export class TracingManager {
  private config: TracingConfig;

  constructor(config: TracingConfig) {
    this.config = config;
  }

  /** Get the current tracing configuration */
  getConfig(): TracingConfig {
    return { ...this.config };
  }

  /** Check if tracing is enabled */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Create a trace segment annotation */
  createAnnotation(key: string, value: string | number | boolean): Record<string, unknown> {
    return {
      key,
      value,
      timestamp: new Date().toISOString(),
      serviceName: this.config.serviceName,
    };
  }

  /** Create trace metadata for a request (X-Ray trace header format) */
  createTraceHeader(): string {
    if (!this.config.enabled) return '';
    const traceId = generateTraceId();
    const parentId = generateSegmentId();
    const sampled = Math.random() < (this.config.samplingRate ?? 0.05) ? '1' : '0';
    return `Root=${traceId};Parent=${parentId};Sampled=${sampled}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTraceId(): string {
  const time = Math.floor(Date.now() / 1000).toString(16);
  const id = randomHex(24);
  return `1-${time}-${id}`;
}

function generateSegmentId(): string {
  return randomHex(16);
}

function randomHex(length: number): string {
  return randomBytes(length / 2).toString('hex');
}
