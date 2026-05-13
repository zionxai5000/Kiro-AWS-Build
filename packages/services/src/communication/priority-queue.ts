/**
 * Message Priority Queue — Implementation
 *
 * Priority-based message processing queue with auto-elevation,
 * rate limiting, and critical message interruption support.
 *
 * Requirements: 37b.8, 39.1, 39.2, 39.3, 39.4
 */

import type {
  UserMessage,
  MessagePriority,
  PriorityQueueConfig,
  QueuedMessage,
  MessagePriorityQueue,
  CriticalInterruptionCallback,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Priority ordering from highest to lowest. */
const PRIORITY_ORDER: MessagePriority[] = ['critical', 'high', 'normal', 'low'];

/** Default maximum messages per user per minute. */
const DEFAULT_MAX_MESSAGES_PER_MINUTE = 30;

/** Sliding window duration for rate limiting (1 minute in ms). */
const RATE_LIMIT_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * MessagePriorityQueueImpl provides priority-based message processing
 * with FIFO ordering within the same priority level.
 *
 * Features:
 * - Four priority levels: critical → high → normal → low (Req 39.1)
 * - Critical message interruption callback (Req 39.2)
 * - Configurable auto-elevation for King messages (Req 39.3)
 * - Rate limiting with sliding window per user (Req 39.4)
 */
export class MessagePriorityQueueImpl implements MessagePriorityQueue {
  /** Internal queues, one per priority level. */
  private readonly queues: Record<MessagePriority, QueuedMessage[]> = {
    critical: [],
    high: [],
    normal: [],
    low: [],
  };

  /** Sliding window timestamps per user for rate limiting. */
  private readonly userMessageTimestamps = new Map<string, number[]>();

  /** Auto-elevation map: userId → elevated priority. */
  private autoElevateUsers = new Map<string, MessagePriority>();

  /** Maximum messages per user per minute. */
  private maxMessagesPerMinute = DEFAULT_MAX_MESSAGES_PER_MINUTE;

  /** Whether critical message interruption is enabled. */
  private enableInterruption = true;

  /** Callback for critical message interruption. */
  private criticalCallback: CriticalInterruptionCallback | null = null;

  /** Global position counter for queue ordering. */
  private positionCounter = 0;

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Update queue configuration.
   *
   * Allows setting auto-elevation rules, rate limits, and
   * interruption behavior at runtime.
   */
  configure(config: PriorityQueueConfig): void {
    if (config.autoElevateUsers !== undefined) {
      this.autoElevateUsers = new Map(config.autoElevateUsers);
    }
    if (config.maxMessagesPerMinute !== undefined) {
      this.maxMessagesPerMinute = config.maxMessagesPerMinute;
    }
    if (config.enableInterruption !== undefined) {
      this.enableInterruption = config.enableInterruption;
    }
  }

  /**
   * Register a callback invoked when a critical message is enqueued.
   *
   * This enables interruption of non-critical agent work within 10 seconds
   * when a critical message arrives.
   */
  onCriticalMessage(callback: CriticalInterruptionCallback): void {
    this.criticalCallback = callback;
  }

  // -------------------------------------------------------------------------
  // Enqueue (Req 39.1, 39.3, 39.4)
  // -------------------------------------------------------------------------

  /**
   * Add a message to the queue.
   *
   * Applies auto-elevation rules for configured users (e.g., King),
   * checks rate limits, and inserts into the correct priority queue.
   * Fires the critical interruption callback if applicable.
   *
   * @throws Error if the user is rate-limited
   */
  enqueue(message: UserMessage): QueuedMessage {
    // Check rate limiting
    if (this.isRateLimited(message.userId)) {
      throw new Error(
        `User ${message.userId} is rate-limited. Maximum ${this.maxMessagesPerMinute} messages per minute.`,
      );
    }

    // Record timestamp for rate limiting
    this.recordUserMessage(message.userId);

    // Determine effective priority (apply auto-elevation)
    const effectivePriority = this.resolveEffectivePriority(message);

    // Create queued message
    this.positionCounter++;
    const queuedMessage: QueuedMessage = {
      message,
      enqueuedAt: new Date(),
      effectivePriority,
      position: this.positionCounter,
    };

    // Insert into the correct priority queue
    this.queues[effectivePriority].push(queuedMessage);

    // Fire critical interruption callback if applicable
    if (
      effectivePriority === 'critical' &&
      this.enableInterruption &&
      this.criticalCallback
    ) {
      this.criticalCallback(queuedMessage);
    }

    return queuedMessage;
  }

  // -------------------------------------------------------------------------
  // Dequeue (Req 39.1)
  // -------------------------------------------------------------------------

  /**
   * Remove and return the highest-priority message.
   *
   * Always dequeues from the highest non-empty priority first
   * (critical → high → normal → low). Within the same priority
   * level, messages are processed in FIFO order.
   */
  dequeue(): QueuedMessage | null {
    for (const priority of PRIORITY_ORDER) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift()!;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Peek
  // -------------------------------------------------------------------------

  /**
   * Return the next message without removing it from the queue.
   */
  peek(): QueuedMessage | null {
    for (const priority of PRIORITY_ORDER) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority][0];
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Size & Status
  // -------------------------------------------------------------------------

  /**
   * Total number of messages across all priority levels.
   */
  size(): number {
    return PRIORITY_ORDER.reduce(
      (total, priority) => total + this.queues[priority].length,
      0,
    );
  }

  /**
   * Number of messages per priority level.
   */
  sizeByPriority(): Record<MessagePriority, number> {
    return {
      critical: this.queues.critical.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      low: this.queues.low.length,
    };
  }

  /**
   * Check if any critical messages are waiting in the queue.
   */
  hasCritical(): boolean {
    return this.queues.critical.length > 0;
  }

  // -------------------------------------------------------------------------
  // Rate Limiting (Req 39.4)
  // -------------------------------------------------------------------------

  /**
   * Check if a user is currently rate-limited.
   *
   * Uses a sliding window of 1 minute. If the user has sent
   * more than `maxMessagesPerMinute` messages in the window,
   * they are rate-limited.
   */
  isRateLimited(userId: string): boolean {
    const timestamps = this.userMessageTimestamps.get(userId);
    if (!timestamps) {
      return false;
    }

    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Count messages within the sliding window
    const recentCount = timestamps.filter((ts) => ts >= windowStart).length;

    return recentCount >= this.maxMessagesPerMinute;
  }

  // -------------------------------------------------------------------------
  // Clear
  // -------------------------------------------------------------------------

  /**
   * Remove all messages from all priority queues.
   */
  clear(): void {
    for (const priority of PRIORITY_ORDER) {
      this.queues[priority] = [];
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Priority Resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the effective priority for a message.
   *
   * If the user is in the auto-elevation map and their configured
   * priority is higher than the message's original priority, the
   * message is elevated. Otherwise, the original priority is used.
   */
  private resolveEffectivePriority(message: UserMessage): MessagePriority {
    const originalPriority = message.priority;
    const elevatedPriority = this.autoElevateUsers.get(message.userId);

    if (!elevatedPriority) {
      return originalPriority;
    }

    // Only elevate if the configured priority is higher
    const originalIndex = PRIORITY_ORDER.indexOf(originalPriority);
    const elevatedIndex = PRIORITY_ORDER.indexOf(elevatedPriority);

    // Lower index = higher priority
    return elevatedIndex < originalIndex ? elevatedPriority : originalPriority;
  }

  // -------------------------------------------------------------------------
  // Internal: Rate Limit Tracking
  // -------------------------------------------------------------------------

  /**
   * Record a message timestamp for rate limiting.
   *
   * Cleans up expired timestamps outside the sliding window.
   */
  private recordUserMessage(userId: string): void {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    let timestamps = this.userMessageTimestamps.get(userId);
    if (!timestamps) {
      timestamps = [];
      this.userMessageTimestamps.set(userId, timestamps);
    }

    // Clean up expired timestamps
    const filtered = timestamps.filter((ts) => ts >= windowStart);
    filtered.push(now);

    this.userMessageTimestamps.set(userId, filtered);
  }
}
