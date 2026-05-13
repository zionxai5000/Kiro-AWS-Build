/**
 * Timeout wrapper for async operations.
 *
 * Rejects with TimeoutError if the wrapped function doesn't resolve within
 * the specified duration. Cleans up pending timers on resolution or rejection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class TimeoutError extends Error {
  public readonly durationMs: number;

  constructor(durationMs: number, message?: string) {
    super(message ?? `Operation timed out after ${durationMs}ms`);
    this.name = 'TimeoutError';
    this.durationMs = durationMs;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Wrap an async function with a timeout.
 *
 * @param fn - The async function to execute.
 * @param ms - Maximum time in milliseconds before timeout.
 * @param errorMessage - Optional custom error message.
 * @returns The resolved value of fn.
 * @throws TimeoutError if fn doesn't resolve within ms.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  errorMessage?: string,
): Promise<T> {
  if (ms <= 0) {
    throw new TimeoutError(ms, errorMessage ?? 'Timeout must be positive');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(ms, errorMessage));
    }, ms);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
