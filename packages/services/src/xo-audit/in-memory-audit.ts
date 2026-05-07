/**
 * In-Memory XO Audit Service — lightweight implementation for local development.
 *
 * Implements the XOAuditService interface from @seraphim/core without any
 * AWS SDK dependencies. Stores audit records in memory with SHA-256 hash
 * chain for tamper-evident integrity. Supports query filtering by agentId,
 * actionType, pillar, timeRange, and outcome.
 */

import { createHash, randomUUID } from 'node:crypto';

import type { XOAuditService } from '@seraphim/core';
import type {
  AuditEntry,
  GovernanceAuditEntry,
  TransitionAuditEntry,
  AuditFilter,
  AuditRecord,
  IntegrityResult,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Genesis hash for the first record in a tenant's chain */
const GENESIS_HASH = '0'.repeat(64);

// ---------------------------------------------------------------------------
// InMemoryAuditService
// ---------------------------------------------------------------------------

export class InMemoryAuditService implements XOAuditService {
  private readonly records: AuditRecord[] = [];

  /** Track the latest hash per tenant for chain integrity */
  private readonly latestHash = new Map<string, string>();

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  async recordAction(entry: AuditEntry): Promise<string> {
    return this.writeRecord(entry, 'action', {});
  }

  async recordGovernanceDecision(entry: GovernanceAuditEntry): Promise<string> {
    const { governanceType, ...baseEntry } = entry;
    return this.writeRecord(baseEntry, 'governance', { governanceType });
  }

  async recordStateTransition(entry: TransitionAuditEntry): Promise<string> {
    const {
      stateMachineId,
      instanceId,
      previousState,
      newState,
      gateResults,
      ...baseEntry
    } = entry;
    return this.writeRecord(baseEntry, 'transition', {
      stateMachineId,
      instanceId,
      previousState,
      newState,
      gateResults,
    });
  }

  // -------------------------------------------------------------------------
  // Querying
  // -------------------------------------------------------------------------

  async query(filter: AuditFilter): Promise<AuditRecord[]> {
    let results = [...this.records];

    if (filter.agentId) {
      results = results.filter((r) => r.actingAgentId === filter.agentId);
    }
    if (filter.actionType) {
      results = results.filter((r) => r.actionType === filter.actionType);
    }
    if (filter.pillar) {
      results = results.filter(
        (r) => (r.details?.['pillar'] as string) === filter.pillar,
      );
    }
    if (filter.timeRange) {
      results = results.filter(
        (r) =>
          r.timestamp >= filter.timeRange!.start &&
          r.timestamp <= filter.timeRange!.end,
      );
    }
    if (filter.outcome) {
      results = results.filter((r) => r.outcome === filter.outcome);
    }

    return results
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, filter.limit ?? 50);
  }

  // -------------------------------------------------------------------------
  // Integrity Verification
  // -------------------------------------------------------------------------

  async verifyIntegrity(recordId: string): Promise<IntegrityResult> {
    const startRecord = this.records.find((r) => r.id === recordId);
    if (!startRecord) {
      return { valid: false, recordId, chainLength: 0, brokenAt: recordId };
    }

    let currentRecord = startRecord;
    let chainLength = 1;

    // Verify the current record's hash
    const computedHash = this.computeHash(currentRecord);
    if (computedHash !== currentRecord.hash) {
      return { valid: false, recordId, chainLength, brokenAt: currentRecord.id };
    }

    // Walk backward through the chain
    while (currentRecord.previousHash !== GENESIS_HASH) {
      const previousRecord = this.records.find(
        (r) =>
          r.hash === currentRecord.previousHash &&
          r.tenantId === currentRecord.tenantId,
      );

      if (!previousRecord) {
        return { valid: false, recordId, chainLength, brokenAt: currentRecord.id };
      }

      const prevComputedHash = this.computeHash(previousRecord);
      if (prevComputedHash !== previousRecord.hash) {
        return {
          valid: false,
          recordId,
          chainLength: chainLength + 1,
          brokenAt: previousRecord.id,
        };
      }

      chainLength++;
      currentRecord = previousRecord;
    }

    return { valid: true, recordId, chainLength };
  }

  /**
   * Get all stored records (useful for debugging).
   */
  getRecords(): AuditRecord[] {
    return [...this.records];
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private writeRecord(
    entry: AuditEntry,
    type: AuditRecord['type'],
    extraDetails: Record<string, unknown>,
  ): string {
    const recordId = randomUUID();
    const timestamp = new Date();
    const previousHash =
      this.latestHash.get(entry.tenantId) ?? GENESIS_HASH;

    const record: AuditRecord = {
      id: recordId,
      tenantId: entry.tenantId,
      timestamp,
      type,
      actingAgentId: entry.actingAgentId,
      actingAgentName: entry.actingAgentName,
      actionType: entry.actionType,
      target: entry.target,
      authorizationChain: entry.authorizationChain,
      executionTokens: entry.executionTokens,
      outcome: entry.outcome,
      details: { ...entry.details, ...extraDetails },
      hash: '',
      previousHash,
    };

    // Compute SHA-256 hash including previousHash for chain integrity
    record.hash = this.computeHash(record);

    this.records.push(record);
    this.latestHash.set(entry.tenantId, record.hash);

    return recordId;
  }

  private computeHash(record: AuditRecord): string {
    const payload = JSON.stringify({
      id: record.id,
      tenantId: record.tenantId,
      timestamp:
        record.timestamp instanceof Date
          ? record.timestamp.toISOString()
          : record.timestamp,
      type: record.type,
      actingAgentId: record.actingAgentId,
      actingAgentName: record.actingAgentName,
      actionType: record.actionType,
      target: record.target,
      authorizationChain: record.authorizationChain,
      executionTokens: record.executionTokens,
      outcome: record.outcome,
      details: record.details,
      previousHash: record.previousHash,
    });

    return createHash('sha256').update(payload).digest('hex');
  }
}
