/**
 * Result Aggregator — Collects and merges results from parallel execution streams.
 *
 * Supports multiple aggregation strategies (merge, concatenate, vote, custom)
 * and provides conflict resolution when parallel streams produce contradictory
 * results during deep-merge operations.
 *
 * Requirements: 35a.3, 35c.11
 */
import type { ResultAggregator, AggregationStrategy, AggregatedResult, TaskResult } from './types.js';
/**
 * In-memory implementation of the ResultAggregator interface.
 *
 * Stores results per DAG as they arrive from parallel streams and provides
 * configurable aggregation strategies for combining them once all streams
 * complete (or on-demand for partial results).
 */
export declare class ResultAggregatorImpl implements ResultAggregator {
    /** DAG ID → collected entries (ordered by collection time) */
    private readonly results;
    /** Running priority counter per DAG for ordering */
    private readonly priorityCounters;
    /**
     * Store an individual stream result as it completes.
     *
     * Results are stored with a monotonically increasing priority value so that
     * later results can be used for conflict resolution during merge operations.
     */
    collectResult(dagId: string, taskId: string, result: TaskResult): Promise<void>;
    /**
     * Aggregate results from all parallel streams using the specified strategy.
     *
     * @param dagId - The DAG whose results should be aggregated
     * @param strategy - The aggregation strategy to use
     * @param customFn - Required when strategy is 'custom'; receives all results
     * @returns The aggregated result including per-stream details and merged output
     */
    aggregate(dagId: string, strategy: AggregationStrategy, customFn?: (results: Map<string, TaskResult>) => unknown): Promise<AggregatedResult>;
    /**
     * Return results collected so far for in-progress DAGs.
     *
     * Useful for monitoring progress before all streams have completed.
     */
    getPartialResults(dagId: string): Promise<Map<string, TaskResult>>;
    /**
     * Apply the selected aggregation strategy to the successful results.
     */
    private applyStrategy;
    /**
     * Merge strategy: deep-merge all successful result outputs into a single object.
     *
     * Conflict resolution: when merge encounters conflicting keys, the result
     * from the higher-priority task wins. If priorities are equal, the latest
     * result (higher priority counter) wins.
     */
    private mergeStrategy;
    /**
     * Concatenate strategy: collect all successful outputs into an array.
     */
    private concatenateStrategy;
    /**
     * Vote strategy: find the most common output value (majority wins).
     *
     * Uses JSON serialization for equality comparison. In case of a tie,
     * the value that appeared first wins.
     */
    private voteStrategy;
    /**
     * Deep-merge source into target. Source values overwrite target values
     * for conflicting keys (higher-priority wins since we process in order).
     */
    private deepMerge;
}
//# sourceMappingURL=result-aggregator.d.ts.map