"use strict";
/**
 * Result Aggregator — Collects and merges results from parallel execution streams.
 *
 * Supports multiple aggregation strategies (merge, concatenate, vote, custom)
 * and provides conflict resolution when parallel streams produce contradictory
 * results during deep-merge operations.
 *
 * Requirements: 35a.3, 35c.11
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultAggregatorImpl = void 0;
// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
/**
 * In-memory implementation of the ResultAggregator interface.
 *
 * Stores results per DAG as they arrive from parallel streams and provides
 * configurable aggregation strategies for combining them once all streams
 * complete (or on-demand for partial results).
 */
class ResultAggregatorImpl {
    /** DAG ID → collected entries (ordered by collection time) */
    results = new Map();
    /** Running priority counter per DAG for ordering */
    priorityCounters = new Map();
    // -------------------------------------------------------------------------
    // Result Collection (Req 35a.3)
    // -------------------------------------------------------------------------
    /**
     * Store an individual stream result as it completes.
     *
     * Results are stored with a monotonically increasing priority value so that
     * later results can be used for conflict resolution during merge operations.
     */
    async collectResult(dagId, taskId, result) {
        const entries = this.results.get(dagId) ?? [];
        const currentPriority = this.priorityCounters.get(dagId) ?? 0;
        entries.push({
            taskId,
            result,
            collectedAt: new Date(),
            priority: currentPriority,
        });
        this.results.set(dagId, entries);
        this.priorityCounters.set(dagId, currentPriority + 1);
    }
    // -------------------------------------------------------------------------
    // Aggregation (Req 35c.11)
    // -------------------------------------------------------------------------
    /**
     * Aggregate results from all parallel streams using the specified strategy.
     *
     * @param dagId - The DAG whose results should be aggregated
     * @param strategy - The aggregation strategy to use
     * @param customFn - Required when strategy is 'custom'; receives all results
     * @returns The aggregated result including per-stream details and merged output
     */
    async aggregate(dagId, strategy, customFn) {
        const entries = this.results.get(dagId) ?? [];
        const perStreamResults = new Map();
        for (const entry of entries) {
            perStreamResults.set(entry.taskId, entry.result);
        }
        const successfulEntries = entries.filter((e) => e.result.success);
        const failedEntries = entries.filter((e) => !e.result.success);
        const mergedOutput = this.applyStrategy(strategy, successfulEntries, perStreamResults, customFn);
        return {
            dagId,
            totalStreams: entries.length,
            successfulStreams: successfulEntries.length,
            failedStreams: failedEntries.length,
            mergedOutput,
            perStreamResults,
            aggregatedAt: new Date(),
        };
    }
    // -------------------------------------------------------------------------
    // Partial Results (Req 35a.3)
    // -------------------------------------------------------------------------
    /**
     * Return results collected so far for in-progress DAGs.
     *
     * Useful for monitoring progress before all streams have completed.
     */
    async getPartialResults(dagId) {
        const entries = this.results.get(dagId) ?? [];
        const results = new Map();
        for (const entry of entries) {
            results.set(entry.taskId, entry.result);
        }
        return results;
    }
    // -------------------------------------------------------------------------
    // Strategy Application (Private)
    // -------------------------------------------------------------------------
    /**
     * Apply the selected aggregation strategy to the successful results.
     */
    applyStrategy(strategy, successfulEntries, allResults, customFn) {
        switch (strategy) {
            case 'merge':
                return this.mergeStrategy(successfulEntries);
            case 'concatenate':
                return this.concatenateStrategy(successfulEntries);
            case 'vote':
                return this.voteStrategy(successfulEntries);
            case 'custom':
                if (!customFn) {
                    throw new Error('Custom aggregation strategy requires a custom function');
                }
                return customFn(allResults);
        }
    }
    /**
     * Merge strategy: deep-merge all successful result outputs into a single object.
     *
     * Conflict resolution: when merge encounters conflicting keys, the result
     * from the higher-priority task wins. If priorities are equal, the latest
     * result (higher priority counter) wins.
     */
    mergeStrategy(entries) {
        if (entries.length === 0)
            return {};
        // Sort by priority ascending so higher-priority entries overwrite lower ones
        const sorted = [...entries].sort((a, b) => a.priority - b.priority);
        let merged = {};
        for (const entry of sorted) {
            const output = entry.result.output;
            if (output !== null && output !== undefined && typeof output === 'object' && !Array.isArray(output)) {
                merged = this.deepMerge(merged, output);
            }
            else if (output !== undefined) {
                // Non-object outputs: last one wins
                merged = { value: output };
            }
        }
        return merged;
    }
    /**
     * Concatenate strategy: collect all successful outputs into an array.
     */
    concatenateStrategy(entries) {
        return entries.map((entry) => entry.result.output);
    }
    /**
     * Vote strategy: find the most common output value (majority wins).
     *
     * Uses JSON serialization for equality comparison. In case of a tie,
     * the value that appeared first wins.
     */
    voteStrategy(entries) {
        if (entries.length === 0)
            return null;
        const votes = new Map();
        for (let i = 0; i < entries.length; i++) {
            const output = entries[i].result.output;
            const key = JSON.stringify(output);
            const existing = votes.get(key);
            if (existing) {
                existing.count++;
            }
            else {
                votes.set(key, { count: 1, value: output, firstSeen: i });
            }
        }
        // Find the value with the highest vote count (ties broken by first seen)
        let winner;
        for (const [, entry] of votes) {
            if (!winner ||
                entry.count > winner.count ||
                (entry.count === winner.count && entry.firstSeen < winner.firstSeen)) {
                winner = entry;
            }
        }
        return winner?.value ?? null;
    }
    // -------------------------------------------------------------------------
    // Deep Merge Utility (Private)
    // -------------------------------------------------------------------------
    /**
     * Deep-merge source into target. Source values overwrite target values
     * for conflicting keys (higher-priority wins since we process in order).
     */
    deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            const targetVal = result[key];
            const sourceVal = source[key];
            if (targetVal !== null &&
                targetVal !== undefined &&
                typeof targetVal === 'object' &&
                !Array.isArray(targetVal) &&
                sourceVal !== null &&
                sourceVal !== undefined &&
                typeof sourceVal === 'object' &&
                !Array.isArray(sourceVal)) {
                // Both are objects — recurse
                result[key] = this.deepMerge(targetVal, sourceVal);
            }
            else {
                // Source overwrites target (conflict resolution: higher priority wins)
                result[key] = sourceVal;
            }
        }
        return result;
    }
}
exports.ResultAggregatorImpl = ResultAggregatorImpl;
//# sourceMappingURL=result-aggregator.js.map