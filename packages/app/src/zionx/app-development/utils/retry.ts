/**
 * Retry with exponential backoff.
 *
 * Retries a function up to `maxRetries` times with configurable backoff delays.
 * Supports cancellation via AbortSignal.
 */

import { LIMITS } from '../config/limits.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Backoff delays in ms for each retry (default: [1000, 3000, 9000]) */
  backoffMs?: readonly number[];
  /** Predicate to determine if the error is retryable (default: always true) */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Optional label for logging */
  label?: string;
}

export class RetryAbortedError extends Error {
  constructor(message = 'Retry aborted') {
    super(message);
    this.name = 'RetryAbortedError';
  }
}

export class RetryExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown) {
    super(`Retry exhausted after ${attempts} attempts`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Retry an async function with exponential backoff.
 *
 * @param fn - The async function to retry.
 * @param opts - Retry configuration options.
 * @returns The resolved value of fn on success.
 * @throws RetryAbortedError if cancelled via AbortSignal.
 * @throws RetryExhaustedError if all retries fail.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? LIMITS.maxRetries;
  const backoffMs = opts.backoffMs ?? LIMITS.retryBackoffMs;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const signal = opts.signal;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort before each attempt
    if (signal?.aborted) {
      throw new RetryAbortedError();
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, don't retry
      if (attempt >= maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        // Terminal error — throw directly without wrapping in RetryExhaustedError.
        // The "exhausted" framing only applies when retries were genuinely used up.
        throw error;
      }

      // Wait with backoff before next attempt
      const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 1000;
      await sleep(delay, signal);
    }
  }

  throw new RetryExhaustedError(maxRetries + 1, lastError);
}

/**
 * Sleep for a given duration, cancellable via AbortSignal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortedError());
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new RetryAbortedError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      // Clean up listener when timer fires
      const originalResolve = resolve;
      resolve = () => {
        signal.removeEventListener('abort', onAbort);
        originalResolve();
      };
    }
  });
}
