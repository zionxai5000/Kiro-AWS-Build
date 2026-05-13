/**
 * Inter-Agent Coordination Bus — Real-time messaging and dependency signaling
 * for concurrently executing agents.
 *
 * Provides in-memory pub/sub for point-to-point and broadcast messaging,
 * Promise-based dependency waiting with configurable timeouts, and shared
 * intermediate result storage for parallel agents working on related tasks.
 *
 * Requirements: 35b.7
 */
import type { CoordinationBus, CoordinationMessage } from './types.js';
/**
 * In-memory implementation of the CoordinationBus interface.
 *
 * Uses event callbacks and Maps for message routing, dependency signaling,
 * and intermediate result sharing. EventBridge integration will be wired
 * in a later phase for cross-process communication.
 */
export declare class CoordinationBusImpl implements CoordinationBus {
    /** Subscriptions indexed by subscription ID */
    private readonly subscriptions;
    /** Agent ID → subscription IDs for fast lookup */
    private readonly agentSubscriptions;
    /** Completed dependency signals: dependencyId → output */
    private readonly completionSignals;
    /** Pending waits for dependencies: dependencyId → pending wait entries */
    private readonly pendingWaits;
    /** Intermediate results: composite key (dagId:key) → value */
    private readonly intermediateResults;
    /**
     * Send a message to a specific agent.
     *
     * Delivers the message to all active subscriptions for the target agent.
     * If the target agent has no active subscriptions, the message is silently dropped.
     */
    sendToAgent(_fromAgentId: string, toAgentId: string, message: CoordinationMessage): Promise<void>;
    /**
     * Broadcast a message to all agents subscribed within a DAG.
     *
     * Delivers the message to every active subscription, excluding the sender.
     * The message's `dagId` field is used for filtering by subscribers if needed.
     */
    broadcast(fromAgentId: string, _dagId: string, message: CoordinationMessage): Promise<void>;
    /**
     * Signal that a task has completed with its output.
     *
     * Stores the completion signal and resolves any pending waits for this
     * dependency. Late arrivals (waits registered after signal) will resolve
     * immediately from the stored signal.
     */
    signalCompletion(taskId: string, output: unknown): Promise<void>;
    /**
     * Wait for a dependency task to complete, with configurable timeout.
     *
     * If the dependency has already signaled completion, resolves immediately.
     * Otherwise, creates a pending wait that will be resolved when
     * `signalCompletion` is called for the dependency.
     *
     * @param taskId - The ID of the task that is waiting
     * @param dependencyId - The ID of the dependency task to wait for
     * @param timeout - Timeout in milliseconds (default: 30000ms)
     * @throws Error if the timeout is exceeded before the dependency completes
     */
    waitForDependency(taskId: string, dependencyId: string, timeout?: number): Promise<unknown>;
    /**
     * Share an intermediate result for parallel agents working on related tasks.
     *
     * Results are stored by DAG ID and key, allowing any agent in the same DAG
     * to retrieve them. Overwrites any previously stored value for the same key.
     */
    shareIntermediateResult(_agentId: string, dagId: string, key: string, value: unknown): Promise<void>;
    /**
     * Retrieve a previously shared intermediate result.
     *
     * @returns The stored value, or `null` if no result exists for the given key.
     */
    getIntermediateResult(dagId: string, key: string): Promise<unknown | null>;
    /**
     * Subscribe to coordination messages for a specific agent.
     *
     * @returns A subscription ID that can be used to unsubscribe later.
     */
    onMessage(agentId: string, handler: (msg: CoordinationMessage) => void): Promise<string>;
    /**
     * Unsubscribe from coordination messages.
     *
     * Removes the subscription and cleans up agent tracking.
     */
    offMessage(subscriptionId: string): Promise<void>;
}
//# sourceMappingURL=coordination-bus.d.ts.map