"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoordinationBusImpl = void 0;
const node_crypto_1 = require("node:crypto");
// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------
/** Default timeout for waitForDependency in milliseconds. */
const DEFAULT_DEPENDENCY_TIMEOUT_MS = 30_000;
// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
/**
 * In-memory implementation of the CoordinationBus interface.
 *
 * Uses event callbacks and Maps for message routing, dependency signaling,
 * and intermediate result sharing. EventBridge integration will be wired
 * in a later phase for cross-process communication.
 */
class CoordinationBusImpl {
    /** Subscriptions indexed by subscription ID */
    subscriptions = new Map();
    /** Agent ID → subscription IDs for fast lookup */
    agentSubscriptions = new Map();
    /** Completed dependency signals: dependencyId → output */
    completionSignals = new Map();
    /** Pending waits for dependencies: dependencyId → pending wait entries */
    pendingWaits = new Map();
    /** Intermediate results: composite key (dagId:key) → value */
    intermediateResults = new Map();
    // -------------------------------------------------------------------------
    // Real-time Messaging (Req 35b.7)
    // -------------------------------------------------------------------------
    /**
     * Send a message to a specific agent.
     *
     * Delivers the message to all active subscriptions for the target agent.
     * If the target agent has no active subscriptions, the message is silently dropped.
     */
    async sendToAgent(_fromAgentId, toAgentId, message) {
        const subIds = this.agentSubscriptions.get(toAgentId);
        if (!subIds)
            return;
        for (const subId of subIds) {
            const subscription = this.subscriptions.get(subId);
            if (subscription) {
                subscription.handler(message);
            }
        }
    }
    /**
     * Broadcast a message to all agents subscribed within a DAG.
     *
     * Delivers the message to every active subscription, excluding the sender.
     * The message's `dagId` field is used for filtering by subscribers if needed.
     */
    async broadcast(fromAgentId, _dagId, message) {
        for (const [, subscription] of this.subscriptions) {
            // Don't send back to the sender
            if (subscription.agentId === fromAgentId)
                continue;
            subscription.handler(message);
        }
    }
    // -------------------------------------------------------------------------
    // Dependency Signaling (Req 35b.7)
    // -------------------------------------------------------------------------
    /**
     * Signal that a task has completed with its output.
     *
     * Stores the completion signal and resolves any pending waits for this
     * dependency. Late arrivals (waits registered after signal) will resolve
     * immediately from the stored signal.
     */
    async signalCompletion(taskId, output) {
        // Store the signal for late arrivals
        this.completionSignals.set(taskId, output);
        // Resolve any pending waits
        const pending = this.pendingWaits.get(taskId);
        if (pending) {
            for (const wait of pending) {
                if (wait.timeoutHandle) {
                    clearTimeout(wait.timeoutHandle);
                }
                wait.resolve(output);
            }
            this.pendingWaits.delete(taskId);
        }
    }
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
    async waitForDependency(taskId, dependencyId, timeout = DEFAULT_DEPENDENCY_TIMEOUT_MS) {
        // Check if already completed
        if (this.completionSignals.has(dependencyId)) {
            return this.completionSignals.get(dependencyId);
        }
        // Create a pending wait
        return new Promise((resolve, reject) => {
            const pendingWait = {
                taskId,
                dependencyId,
                resolve,
                reject,
            };
            // Set up timeout
            pendingWait.timeoutHandle = setTimeout(() => {
                // Remove from pending waits
                const pending = this.pendingWaits.get(dependencyId);
                if (pending) {
                    const idx = pending.indexOf(pendingWait);
                    if (idx !== -1) {
                        pending.splice(idx, 1);
                    }
                    if (pending.length === 0) {
                        this.pendingWaits.delete(dependencyId);
                    }
                }
                reject(new Error(`Timeout waiting for dependency "${dependencyId}" (task "${taskId}") after ${timeout}ms`));
            }, timeout);
            // Register the pending wait
            const existing = this.pendingWaits.get(dependencyId) ?? [];
            existing.push(pendingWait);
            this.pendingWaits.set(dependencyId, existing);
        });
    }
    // -------------------------------------------------------------------------
    // Intermediate Result Sharing (Req 35b.7)
    // -------------------------------------------------------------------------
    /**
     * Share an intermediate result for parallel agents working on related tasks.
     *
     * Results are stored by DAG ID and key, allowing any agent in the same DAG
     * to retrieve them. Overwrites any previously stored value for the same key.
     */
    async shareIntermediateResult(_agentId, dagId, key, value) {
        const compositeKey = `${dagId}:${key}`;
        this.intermediateResults.set(compositeKey, value);
    }
    /**
     * Retrieve a previously shared intermediate result.
     *
     * @returns The stored value, or `null` if no result exists for the given key.
     */
    async getIntermediateResult(dagId, key) {
        const compositeKey = `${dagId}:${key}`;
        return this.intermediateResults.get(compositeKey) ?? null;
    }
    // -------------------------------------------------------------------------
    // Subscription Management (Req 35b.7)
    // -------------------------------------------------------------------------
    /**
     * Subscribe to coordination messages for a specific agent.
     *
     * @returns A subscription ID that can be used to unsubscribe later.
     */
    async onMessage(agentId, handler) {
        const subscriptionId = (0, node_crypto_1.randomUUID)();
        const subscription = {
            id: subscriptionId,
            agentId,
            handler,
        };
        this.subscriptions.set(subscriptionId, subscription);
        // Track by agent ID
        const agentSubs = this.agentSubscriptions.get(agentId) ?? new Set();
        agentSubs.add(subscriptionId);
        this.agentSubscriptions.set(agentId, agentSubs);
        return subscriptionId;
    }
    /**
     * Unsubscribe from coordination messages.
     *
     * Removes the subscription and cleans up agent tracking.
     */
    async offMessage(subscriptionId) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (!subscription)
            return;
        this.subscriptions.delete(subscriptionId);
        // Clean up agent tracking
        const agentSubs = this.agentSubscriptions.get(subscription.agentId);
        if (agentSubs) {
            agentSubs.delete(subscriptionId);
            if (agentSubs.size === 0) {
                this.agentSubscriptions.delete(subscription.agentId);
            }
        }
    }
}
exports.CoordinationBusImpl = CoordinationBusImpl;
//# sourceMappingURL=coordination-bus.js.map