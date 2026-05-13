/**
 * Communication Audit Trail Service — Implementation
 *
 * Logs all human-agent communications with full metadata,
 * provides conversation replay, and supports pattern queries
 * for response times, message volumes, and priority distribution.
 *
 * Requirements: 37f.17, 37f.18
 */

import type {
  CommunicationAuditEntry,
  CommunicationAuditFilter,
  CommunicationAuditService,
  CommunicationPatterns,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of the Communication Audit Trail Service.
 *
 * Stores all communication audit entries in memory and provides
 * filtering, replay, and pattern analysis capabilities.
 */
export class CommunicationAuditServiceImpl implements CommunicationAuditService {
  private readonly entries: CommunicationAuditEntry[] = [];
  private nextId = 1;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Record a communication event.
   *
   * Generates a unique ID and persists the entry.
   * Returns the created entry with the generated ID.
   */
  recordCommunication(entry: Omit<CommunicationAuditEntry, 'id'>): CommunicationAuditEntry {
    const record: CommunicationAuditEntry = {
      ...entry,
      id: `audit-${this.nextId++}`,
    };

    this.entries.push(record);
    return record;
  }

  /**
   * Retrieve full conversation history between a user and agent
   * for a given time period, ordered chronologically.
   */
  getConversationReplay(
    userId: string,
    agentId: string,
    timeRange: { start: Date; end: Date },
  ): CommunicationAuditEntry[] {
    return this.entries
      .filter(
        (e) =>
          e.userId === userId &&
          e.agentId === agentId &&
          e.timestamp >= timeRange.start &&
          e.timestamp <= timeRange.end,
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Query aggregated communication patterns based on filter criteria.
   *
   * Returns average response time, total messages, and breakdowns
   * by priority, source, and agent.
   */
  queryPatterns(filter: CommunicationAuditFilter): CommunicationPatterns {
    const filtered = this.applyFilter(filter);

    const responseTimes = filtered
      .filter((e) => e.responseTime !== undefined)
      .map((e) => e.responseTime!);

    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : 0;

    const messagesByPriority: Record<string, number> = {};
    const messagesBySource: Record<string, number> = {};
    const messagesByAgent: Record<string, number> = {};

    for (const entry of filtered) {
      messagesByPriority[entry.priority] = (messagesByPriority[entry.priority] ?? 0) + 1;
      messagesBySource[entry.source] = (messagesBySource[entry.source] ?? 0) + 1;
      messagesByAgent[entry.agentId] = (messagesByAgent[entry.agentId] ?? 0) + 1;
    }

    return {
      averageResponseTime,
      totalMessages: filtered.length,
      messagesByPriority,
      messagesBySource,
      messagesByAgent,
    };
  }

  /**
   * Get raw audit entries matching a filter.
   */
  getEntries(filter: CommunicationAuditFilter): CommunicationAuditEntry[] {
    return this.applyFilter(filter);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private applyFilter(filter: CommunicationAuditFilter): CommunicationAuditEntry[] {
    return this.entries.filter((e) => {
      if (filter.userId && e.userId !== filter.userId) return false;
      if (filter.agentId && e.agentId !== filter.agentId) return false;
      if (filter.direction && e.direction !== filter.direction) return false;
      if (filter.source && e.source !== filter.source) return false;
      if (filter.timeRange) {
        if (e.timestamp < filter.timeRange.start || e.timestamp > filter.timeRange.end) {
          return false;
        }
      }
      return true;
    });
  }
}
