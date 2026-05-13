import { describe, it, expect } from 'vitest';
import { retryWithBackoff, RetryExhaustedError, RetryAbortedError } from '../retry.js';

describe('retryWithBackoff', () => {
  it('returns immediately on first success', async () => {
    const result = await retryWithBackoff(() => Promise.resolve('ok'), {
      backoffMs: [10, 20, 30],
    });
    expect(result).toBe('ok');
  });

  it('retries on failure and succeeds on second attempt', async () => {
    let attempt = 0;
    const result = await retryWithBackoff(
      () => {
        attempt++;
        if (attempt < 2) throw new Error('fail');
        return Promise.resolve('recovered');
      },
      { backoffMs: [10, 20, 30] },
    );
    expect(result).toBe('recovered');
    expect(attempt).toBe(2);
  });

  it('throws RetryExhaustedError after max retries', async () => {
    let attempt = 0;
    await expect(
      retryWithBackoff(
        () => {
          attempt++;
          return Promise.reject(new Error('always fails'));
        },
        { maxRetries: 2, backoffMs: [10, 20] },
      ),
    ).rejects.toThrow(RetryExhaustedError);
    expect(attempt).toBe(3); // initial + 2 retries
  });

  it('respects shouldRetry predicate', async () => {
    let attempt = 0;
    await expect(
      retryWithBackoff(
        () => {
          attempt++;
          return Promise.reject(new Error('non-retryable'));
        },
        {
          maxRetries: 3,
          backoffMs: [10, 20, 30],
          shouldRetry: () => false,
        },
      ),
    ).rejects.toThrow(RetryExhaustedError);
    expect(attempt).toBe(1); // no retries because shouldRetry returned false
  });

  it('aborts via AbortSignal', async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    await expect(
      retryWithBackoff(() => Promise.resolve('should not reach'), {
        signal: controller.signal,
        backoffMs: [10],
      }),
    ).rejects.toThrow(RetryAbortedError);
  });

  it('aborts during backoff sleep', async () => {
    const controller = new AbortController();
    let attempt = 0;

    const promise = retryWithBackoff(
      () => {
        attempt++;
        return Promise.reject(new Error('fail'));
      },
      {
        maxRetries: 3,
        backoffMs: [5000], // long backoff
        signal: controller.signal,
      },
    );

    // Abort after a short delay (during the backoff sleep)
    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toThrow(RetryAbortedError);
    expect(attempt).toBe(1); // only first attempt before abort during sleep
  });
});
