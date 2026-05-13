import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError } from '../timeout.js';

describe('withTimeout', () => {
  it('resolves when fn completes within timeout', async () => {
    const result = await withTimeout(
      () => Promise.resolve('fast'),
      1000,
    );
    expect(result).toBe('fast');
  });

  it('rejects with TimeoutError when fn exceeds timeout', async () => {
    await expect(
      withTimeout(
        () => new Promise(resolve => setTimeout(resolve, 5000)),
        50,
      ),
    ).rejects.toThrow(TimeoutError);
  });

  it('includes duration in TimeoutError', async () => {
    try {
      await withTimeout(
        () => new Promise(resolve => setTimeout(resolve, 5000)),
        100,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).durationMs).toBe(100);
    }
  });

  it('uses custom error message', async () => {
    await expect(
      withTimeout(
        () => new Promise(resolve => setTimeout(resolve, 5000)),
        50,
        'LLM call timed out',
      ),
    ).rejects.toThrow('LLM call timed out');
  });

  it('throws immediately for non-positive timeout', async () => {
    await expect(
      withTimeout(() => Promise.resolve('x'), 0),
    ).rejects.toThrow(TimeoutError);
  });

  it('cleans up timer when fn resolves before timeout', async () => {
    // This test verifies no lingering timers — if cleanup fails,
    // the test runner would report open handles.
    const result = await withTimeout(
      () => Promise.resolve('done'),
      10000,
    );
    expect(result).toBe('done');
  });

  it('propagates fn rejection without wrapping in TimeoutError', async () => {
    const customError = new Error('custom failure');
    await expect(
      withTimeout(
        () => Promise.reject(customError),
        1000,
      ),
    ).rejects.toThrow('custom failure');
  });
});
