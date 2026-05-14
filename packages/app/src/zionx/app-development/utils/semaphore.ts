/**
 * Semaphore — bounds concurrent async operations.
 *
 * Used to limit parallel HTTP calls (npm registry, asset generation APIs)
 * without head-of-line blocking. Keeps the pipe full: as soon as one slot
 * frees, the next waiting operation starts immediately.
 *
 * Usage:
 *   const sem = new Semaphore(5);
 *   await withSemaphore(sem, async () => { ... });
 */

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class Semaphore {
  private current = 0;
  private readonly max: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    if (maxConcurrent < 1 || !Number.isFinite(maxConcurrent)) {
      throw new Error(`Semaphore maxConcurrent must be >= 1, got ${maxConcurrent}`);
    }
    this.max = Math.floor(maxConcurrent);
  }

  /**
   * Acquire a slot. Resolves immediately if a slot is available,
   * otherwise waits until one is released.
   */
  acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a slot. If waiters are queued, the next one is unblocked.
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      // Hand the slot directly to the next waiter (no decrement/increment)
      next();
    } else {
      this.current--;
    }
  }

  /**
   * Current number of active slots.
   */
  get active(): number {
    return this.current;
  }

  /**
   * Number of operations waiting for a slot.
   */
  get waiting(): number {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Execute an async function within a semaphore-bounded slot.
 * Guarantees release even if the function throws.
 *
 * @returns The function's return value.
 */
export async function withSemaphore<T>(sem: Semaphore, fn: () => Promise<T>): Promise<T> {
  await sem.acquire();
  try {
    return await fn();
  } finally {
    sem.release();
  }
}
