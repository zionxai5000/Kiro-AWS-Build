/**
 * Unit tests for the Result Aggregator.
 *
 * Requirements: 35a.3, 35c.11
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResultAggregatorImpl } from './result-aggregator.js';
import type { TaskResult } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-1',
    success: true,
    output: { data: 'test' },
    tokenUsage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    durationMs: 500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultAggregatorImpl', () => {
  let aggregator: ResultAggregatorImpl;

  beforeEach(() => {
    aggregator = new ResultAggregatorImpl();
  });

  // -------------------------------------------------------------------------
  // Result Collection
  // -------------------------------------------------------------------------

  describe('collectResult', () => {
    it('stores results from multiple parallel streams', async () => {
      const result1 = makeResult({ taskId: 'task-1', output: { a: 1 } });
      const result2 = makeResult({ taskId: 'task-2', output: { b: 2 } });
      const result3 = makeResult({ taskId: 'task-3', output: { c: 3 } });

      await aggregator.collectResult('dag-1', 'task-1', result1);
      await aggregator.collectResult('dag-1', 'task-2', result2);
      await aggregator.collectResult('dag-1', 'task-3', result3);

      const partial = await aggregator.getPartialResults('dag-1');
      expect(partial.size).toBe(3);
      expect(partial.get('task-1')).toEqual(result1);
      expect(partial.get('task-2')).toEqual(result2);
      expect(partial.get('task-3')).toEqual(result3);
    });

    it('isolates results between different DAGs', async () => {
      const result1 = makeResult({ taskId: 'task-1', output: 'dag1-data' });
      const result2 = makeResult({ taskId: 'task-1', output: 'dag2-data' });

      await aggregator.collectResult('dag-1', 'task-1', result1);
      await aggregator.collectResult('dag-2', 'task-1', result2);

      const partial1 = await aggregator.getPartialResults('dag-1');
      const partial2 = await aggregator.getPartialResults('dag-2');

      expect(partial1.size).toBe(1);
      expect(partial2.size).toBe(1);
      expect(partial1.get('task-1')?.output).toBe('dag1-data');
      expect(partial2.get('task-1')?.output).toBe('dag2-data');
    });
  });

  // -------------------------------------------------------------------------
  // Partial Results
  // -------------------------------------------------------------------------

  describe('getPartialResults', () => {
    it('returns results collected so far for in-progress DAGs', async () => {
      const result1 = makeResult({ taskId: 'task-1', output: { step: 1 } });
      await aggregator.collectResult('dag-1', 'task-1', result1);

      // Only one result collected so far
      const partial = await aggregator.getPartialResults('dag-1');
      expect(partial.size).toBe(1);
      expect(partial.get('task-1')).toEqual(result1);

      // Collect another
      const result2 = makeResult({ taskId: 'task-2', output: { step: 2 } });
      await aggregator.collectResult('dag-1', 'task-2', result2);

      const updated = await aggregator.getPartialResults('dag-1');
      expect(updated.size).toBe(2);
    });

    it('returns empty map for unknown DAG', async () => {
      const partial = await aggregator.getPartialResults('non-existent');
      expect(partial.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Merge Aggregation Strategy
  // -------------------------------------------------------------------------

  describe('aggregate — merge strategy', () => {
    it('deep-merges all successful result outputs into a single object', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: { name: 'Alice', age: 30 } }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: { email: 'alice@example.com' } }),
      );

      const result = await aggregator.aggregate('dag-1', 'merge');

      expect(result.mergedOutput).toEqual({
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });
      expect(result.totalStreams).toBe(2);
      expect(result.successfulStreams).toBe(2);
      expect(result.failedStreams).toBe(0);
    });

    it('deep-merges nested objects', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: { config: { host: 'localhost' } } }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: { config: { port: 3000 } } }),
      );

      const result = await aggregator.aggregate('dag-1', 'merge');

      expect(result.mergedOutput).toEqual({
        config: { host: 'localhost', port: 3000 },
      });
    });

    it('resolves conflicts by keeping higher-priority (later) result', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: { status: 'pending', value: 10 } }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: { status: 'complete', extra: true } }),
      );

      const result = await aggregator.aggregate('dag-1', 'merge');

      // task-2 has higher priority (collected later), so its 'status' wins
      expect(result.mergedOutput).toEqual({
        status: 'complete',
        value: 10,
        extra: true,
      });
    });

    it('returns empty object when no successful results exist', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', success: false, output: { data: 'failed' } }),
      );

      const result = await aggregator.aggregate('dag-1', 'merge');

      expect(result.mergedOutput).toEqual({});
      expect(result.successfulStreams).toBe(0);
      expect(result.failedStreams).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Concatenate Aggregation Strategy
  // -------------------------------------------------------------------------

  describe('aggregate — concatenate strategy', () => {
    it('collects all successful outputs into an array', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: 'result-a' }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: 'result-b' }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-3',
        makeResult({ taskId: 'task-3', output: 'result-c' }),
      );

      const result = await aggregator.aggregate('dag-1', 'concatenate');

      expect(result.mergedOutput).toEqual(['result-a', 'result-b', 'result-c']);
    });

    it('excludes failed streams from concatenated output', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: 'good' }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', success: false, output: 'bad' }),
      );

      const result = await aggregator.aggregate('dag-1', 'concatenate');

      expect(result.mergedOutput).toEqual(['good']);
      expect(result.successfulStreams).toBe(1);
      expect(result.failedStreams).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Vote Aggregation Strategy
  // -------------------------------------------------------------------------

  describe('aggregate — vote strategy', () => {
    it('picks the majority output value', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: 'yes' }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: 'no' }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-3',
        makeResult({ taskId: 'task-3', output: 'yes' }),
      );

      const result = await aggregator.aggregate('dag-1', 'vote');

      expect(result.mergedOutput).toBe('yes');
    });

    it('breaks ties by choosing the value that appeared first', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: 'alpha' }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: 'beta' }),
      );

      const result = await aggregator.aggregate('dag-1', 'vote');

      // Tie: both have 1 vote, 'alpha' appeared first
      expect(result.mergedOutput).toBe('alpha');
    });

    it('handles object outputs using deep equality via JSON', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: { answer: 42 } }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: { answer: 42 } }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-3',
        makeResult({ taskId: 'task-3', output: { answer: 7 } }),
      );

      const result = await aggregator.aggregate('dag-1', 'vote');

      expect(result.mergedOutput).toEqual({ answer: 42 });
    });

    it('returns null when no successful results exist', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', success: false }),
      );

      const result = await aggregator.aggregate('dag-1', 'vote');

      expect(result.mergedOutput).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Custom Aggregation Strategy
  // -------------------------------------------------------------------------

  describe('aggregate — custom strategy', () => {
    it('applies a custom aggregation function', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: 10 }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({ taskId: 'task-2', output: 20 }),
      );

      const sumFn = (results: Map<string, TaskResult>) => {
        let sum = 0;
        for (const [, r] of results) {
          if (r.success && typeof r.output === 'number') {
            sum += r.output;
          }
        }
        return sum;
      };

      const result = await aggregator.aggregate('dag-1', 'custom', sumFn);

      expect(result.mergedOutput).toBe(30);
    });

    it('throws when custom strategy is used without a function', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1' }),
      );

      await expect(aggregator.aggregate('dag-1', 'custom')).rejects.toThrow(
        'Custom aggregation strategy requires a custom function',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Failed Stream Handling
  // -------------------------------------------------------------------------

  describe('failed stream handling', () => {
    it('excludes failed streams from merge but counts them in stats', async () => {
      await aggregator.collectResult(
        'dag-1',
        'task-1',
        makeResult({ taskId: 'task-1', output: { a: 1 } }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-2',
        makeResult({
          taskId: 'task-2',
          success: false,
          output: { b: 2 },
          error: 'timeout',
        }),
      );
      await aggregator.collectResult(
        'dag-1',
        'task-3',
        makeResult({ taskId: 'task-3', output: { c: 3 } }),
      );

      const result = await aggregator.aggregate('dag-1', 'merge');

      expect(result.totalStreams).toBe(3);
      expect(result.successfulStreams).toBe(2);
      expect(result.failedStreams).toBe(1);
      // Failed task-2 output should NOT be in merged output
      expect(result.mergedOutput).toEqual({ a: 1, c: 3 });
      // But it should still be in perStreamResults
      expect(result.perStreamResults.get('task-2')?.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Aggregated Result Metadata
  // -------------------------------------------------------------------------

  describe('aggregated result metadata', () => {
    it('includes dagId, stream counts, and aggregatedAt timestamp', async () => {
      await aggregator.collectResult(
        'dag-42',
        'task-1',
        makeResult({ taskId: 'task-1', output: 'x' }),
      );

      const result = await aggregator.aggregate('dag-42', 'concatenate');

      expect(result.dagId).toBe('dag-42');
      expect(result.totalStreams).toBe(1);
      expect(result.aggregatedAt).toBeInstanceOf(Date);
      expect(result.perStreamResults.size).toBe(1);
    });
  });
});
