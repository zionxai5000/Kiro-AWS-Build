import { describe, it, expect } from 'vitest';
import { Semaphore, withSemaphore } from '../semaphore.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Semaphore', () => {
  it('limits concurrent executions to maxConcurrent', async () => {
    const sem = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      await sem.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(50);
      concurrent--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task(), task()]);

    expect(maxConcurrent).toBe(2);
  });

  it('releases correctly after completion', async () => {
    const sem = new Semaphore(1);

    await sem.acquire();
    expect(sem.active).toBe(1);
    sem.release();
    expect(sem.active).toBe(0);

    // Can acquire again
    await sem.acquire();
    expect(sem.active).toBe(1);
    sem.release();
  });

  it('releases correctly after error (no deadlock)', async () => {
    const sem = new Semaphore(1);

    // First task acquires and throws
    try {
      await sem.acquire();
      throw new Error('oops');
    } catch {
      sem.release();
    }

    // Second task should be able to acquire (not deadlocked)
    await sem.acquire();
    expect(sem.active).toBe(1);
    sem.release();
  });

  it('throws if maxConcurrent < 1', () => {
    expect(() => new Semaphore(0)).toThrow('must be >= 1');
    expect(() => new Semaphore(-1)).toThrow('must be >= 1');
    expect(() => new Semaphore(NaN)).toThrow('must be >= 1');
  });

  it('reports active and waiting counts', async () => {
    const sem = new Semaphore(1);

    await sem.acquire();
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);

    // Start a second acquire that will wait
    const p = sem.acquire();
    expect(sem.waiting).toBe(1);

    sem.release(); // frees slot for the waiter
    await p;
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);
    sem.release();
  });
});

describe('withSemaphore', () => {
  it('propagates the function return value', async () => {
    const sem = new Semaphore(3);
    const result = await withSemaphore(sem, async () => 42);
    expect(result).toBe(42);
  });

  it('releases even if the function throws', async () => {
    const sem = new Semaphore(1);

    await expect(
      withSemaphore(sem, async () => { throw new Error('fail'); }),
    ).rejects.toThrow('fail');

    // Slot should be released — can acquire again
    expect(sem.active).toBe(0);
    await sem.acquire();
    expect(sem.active).toBe(1);
    sem.release();
  });

  it('limits concurrency when used in parallel', async () => {
    const sem = new Semaphore(3);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      return withSemaphore(sem, async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await sleep(30);
        concurrent--;
        return 'done';
      });
    };

    const results = await Promise.all(Array.from({ length: 10 }, task));

    expect(maxConcurrent).toBe(3);
    expect(results.every(r => r === 'done')).toBe(true);
  });
});
