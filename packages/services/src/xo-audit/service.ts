/**
 * XO Audit Service — immutable audit trail for all system actions.
 *
 * Implements the XOAuditService interface from @seraphim/core.
 * Uses DynamoDB `seraphim-audit-trail` table with SHA-256 hash chain
 * for tamper-evident integrity and publishes events to the Event Bus
 * for real-time monitoring.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'node:crypto';

import type { XOAuditService, EventBusService } from '@seraphim/core';
import type {
  AuditEntry,
  GovernanceAuditEntry,
  TransitionAuditEntry,
  AuditFilter,
  AuditRecord,
  IntegrityResult,
} from '@seraphim/core';
import type { SystemEvent } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface XOAuditServiceConfig {
  /** DynamoDB table name (e.g. 'seraphim-audit-trail') */
  tableName: string;
  /** AWS region */
  region?: string;
  /** Optional: override AWS clients for testing */
  clients?: {
    dynamoDB?: DynamoDBClient;
    /** Pre-built document client (takes precedence over dynamoDB if provided) */
    docClient?: DynamoDBDocumentClient;
  };
  /** Optional: Event Bus service for publishing audit events */
  eventBus?: EventBusService;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL: 365 days in seconds */
const TTL_DAYS = 365;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

/** Genesis hash for the first record in a tenant's chain */
const GENESIS_HASH = '0'.repeat(64);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class XOAuditServiceImpl implements XOAuditService {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly config: XOAuditServiceConfig;
  private readonly eventBus?: EventBusService;

  constructor(config: XOAuditServiceConfig) {
    this.config = config;
    this.eventBus = config.eventBus;
    const region = config.region ?? 'us-east-1';

    if (config.clients?.docClient) {
      this.docClient = config.clients.docClient;
    } else {
      const dynamoClient =
        config.clients?.dynamoDB ?? new DynamoDBClient({ region });
      this.docClient = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Recording (Req 7.1, 7.2, 7.3)
  // -------------------------------------------------------------------------

  /**
   * Record a controlled action to the audit trail.
   *
   * Creates an AuditRecord with type 'action', computes SHA-256 hash
   * chained to the previous record, writes to DynamoDB, and publishes
   * an audit.entry.created event to the Event Bus.
   *
   * Req 7.1: Records acting agent, action type, target, authorization chain,
   * timestamp, and outcome.
   */
  async recordAction(entry: AuditEntry): Promise<string> {
    return this.writeAuditRecord(entry, 'action', {});
  }

  /**
   * Record a governance decision to the audit trail.
   *
   * Req 7.2: Records authorization checks, escalations, completion contract
   * validations, and execution token grants.
   */
  async recordGovernanceDecision(entry: GovernanceAuditEntry): Promise<string> {
    const { governanceType, ...baseEntry } = entry;
    return this.writeAuditRecord(baseEntry, 'governance', { governanceType });
  }

  /**
   * Record a state transition to the audit trail.
   *
   * Req 7.3: Records state machine identifier, prior state, new state,
   * gate results, and triggering event.
   */
  async recordStateTransition(entry: TransitionAuditEntry): Promise<string> {
    const { stateMachineId, instanceId, previousState, newState, gateResults, ...baseEntry } =
      entry;
    return this.writeAuditRecord(baseEntry, 'transition', {
      stateMachineId,
      instanceId,
      previousState,
      newState,
      gateResults,
    });
  }

  // -------------------------------------------------------------------------
  // Querying (Req 7.4)
  // -------------------------------------------------------------------------

  /**
   * Query the audit trail with filtering by agent, time range, action type,
   * pillar, and outcome.
   *
   * Uses GSIs for efficient querying:
   * - agentId filter → GSI2 (agentId-index)
   * - actionType filter → GSI1 (actionType-index)
   * - pillar filter → GSI3 (pillar-index)
   * - time range → applied as sort key condition on the chosen index
   * - outcome → applied as a filter expression
   */
  async query(filter: AuditFilter): Promise<AuditRecord[]> {
    const limit = filter.limit ?? 50;

    // Determine which index to use based on the filter
    const queryParams = this.buildQueryParams(filter, limit);
    const response = await this.docClient.send(new QueryCommand(queryParams));

    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => this.itemToAuditRecord(item));
  }

  // -------------------------------------------------------------------------
  // Immutability Verification (Req 7.5)
  // -------------------------------------------------------------------------

  /**
   * Verify the integrity of an audit record by walking its hash chain.
   *
   * Starting from the given record, walks backward through previousHash
   * references, recomputing each record's hash and comparing it to the
   * stored hash. If any hash doesn't match, the chain is broken.
   *
   * Req 7.5: Immutable storage — no agent may modify or delete audit records.
   */
  async verifyIntegrity(recordId: string): Promise<IntegrityResult> {
    // First, find the record by its ID
    const startRecord = await this.findRecordById(recordId);
    if (!startRecord) {
      return {
        valid: false,
        recordId,
        chainLength: 0,
        brokenAt: recordId,
      };
    }

    let currentRecord = startRecord;
    let chainLength = 1;

    // Verify the current record's hash
    const computedHash = this.computeHash(currentRecord);
    if (computedHash !== currentRecord.hash) {
      return {
        valid: false,
        recordId,
        chainLength,
        brokenAt: currentRecord.id,
      };
    }

    // Walk backward through the chain
    while (currentRecord.previousHash !== GENESIS_HASH) {
      const previousRecord = await this.findRecordByHash(
        currentRecord.tenantId,
        currentRecord.previousHash,
      );

      if (!previousRecord) {
        return {
          valid: false,
          recordId,
          chainLength,
          brokenAt: currentRecord.id,
        };
      }

      // Verify the previous record's hash
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

    return {
      valid: true,
      recordId,
      chainLength,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Core method: create an AuditRecord, compute its hash chain, write to
   * DynamoDB, and publish an event.
   */
  private async writeAuditRecord(
    entry: AuditEntry,
    type: AuditRecord['type'],
    extraDetails: Record<string, unknown>,
  ): Promise<string> {
    const recordId = randomUUID();
    const timestamp = new Date();

    // Get the previous hash for this tenant's chain
    const previousHash = await this.getLatestHash(entry.tenantId);

    // Build the audit record
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
      hash: '', // computed below
      previousHash,
    };

    // Compute SHA-256 hash including previousHash for chain integrity
    record.hash = this.computeHash(record);

    // Write to DynamoDB
    await this.putAuditRecord(record);

    // Publish event to Event Bus for real-time monitoring
    await this.publishAuditEvent(record);

    return recordId;
  }

  /**
   * Compute SHA-256 hash of an audit record.
   *
   * The hash includes all record fields plus the previousHash,
   * creating a tamper-evident chain.
   */
  computeHash(record: AuditRecord): string {
    const payload = JSON.stringify({
      id: record.id,
      tenantId: record.tenantId,
      timestamp: record.timestamp instanceof Date
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

  /**
   * Get the hash of the latest audit record for a tenant.
   * Returns GENESIS_HASH if no records exist yet.
   */
  private async getLatestHash(tenantId: string): Promise<string> {
    const response = await this.docClient.send(
      new QueryCommand({
        TableName: this.config.tableName,
        KeyConditionExpression: 'tenantId = :tid',
        ExpressionAttributeValues: {
          ':tid': tenantId,
        },
        ScanIndexForward: false, // descending by sort key (latest first)
        Limit: 1,
        ProjectionExpression: '#h',
        ExpressionAttributeNames: {
          '#h': 'hash',
        },
      }),
    );

    if (response.Items && response.Items.length > 0) {
      return response.Items[0]['hash'] as string;
    }

    return GENESIS_HASH;
  }

  /**
   * Write an audit record to DynamoDB.
   *
   * Partition Key: tenantId (S)
   * Sort Key: timestamp#recordId (S)
   * TTL: expiresAt (365 days from creation) — Req 7.5
   */
  private async putAuditRecord(record: AuditRecord): Promise<void> {
    const timestampISO =
      record.timestamp instanceof Date
        ? record.timestamp.toISOString()
        : record.timestamp;

    const sortKey = `${timestampISO}#${record.id}`;
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    // Extract pillar from details if present (for GSI3)
    const pillar = (record.details?.['pillar'] as string) ?? 'system';

    await this.docClient.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          // Primary key
          tenantId: record.tenantId,
          sk: sortKey,

          // Record fields
          recordId: record.id,
          timestamp: timestampISO,
          type: record.type,
          actingAgentId: record.actingAgentId,
          actingAgentName: record.actingAgentName,
          actionType: record.actionType,
          target: record.target,
          authorizationChain: record.authorizationChain,
          executionTokens: record.executionTokens,
          outcome: record.outcome,
          details: record.details,
          hash: record.hash,
          previousHash: record.previousHash,

          // GSI attributes
          agentId: record.actingAgentId,
          pillar,

          // TTL (Req 7.5: minimum 365 days retention)
          expiresAt,
        },
      }),
    );
  }

  /**
   * Publish an audit.entry.created event to the Event Bus.
   */
  private async publishAuditEvent(record: AuditRecord): Promise<void> {
    if (!this.eventBus) return;

    const event: SystemEvent = {
      source: 'seraphim.xo-audit',
      type: 'audit.entry.created',
      detail: {
        recordId: record.id,
        type: record.type,
        actingAgentId: record.actingAgentId,
        actionType: record.actionType,
        target: record.target,
        outcome: record.outcome,
        hash: record.hash,
      },
      metadata: {
        tenantId: record.tenantId,
        correlationId: record.id,
        timestamp: record.timestamp,
      },
    };

    try {
      await this.eventBus.publish(event);
    } catch {
      // Event publishing failure should not block audit recording.
      // The audit record is already persisted in DynamoDB.
    }
  }

  /**
   * Build DynamoDB query parameters based on the filter.
   *
   * Strategy:
   * - If agentId is specified → use GSI2 (agentId-index)
   * - If actionType is specified → use GSI1 (actionType-index)
   * - If pillar is specified → use GSI3 (pillar-index)
   * - Otherwise → query the main table by tenantId (requires tenantId in filter)
   */
  private buildQueryParams(
    filter: AuditFilter,
    limit: number,
  ): QueryCommandInput {
    const filterExpressions: string[] = [];
    const exprAttrValues: Record<string, unknown> = {};
    const exprAttrNames: Record<string, string> = {};

    // Build time range condition for sort key
    let timeRangeCondition = '';
    if (filter.timeRange) {
      const startISO = filter.timeRange.start.toISOString();
      const endISO = filter.timeRange.end.toISOString();
      timeRangeCondition = ' AND #ts BETWEEN :tstart AND :tend';
      exprAttrValues[':tstart'] = startISO;
      exprAttrValues[':tend'] = endISO;
      exprAttrNames['#ts'] = 'timestamp';
    }

    // Outcome filter (always a filter expression, not a key condition)
    if (filter.outcome) {
      filterExpressions.push('#outcome = :outcome');
      exprAttrValues[':outcome'] = filter.outcome;
      exprAttrNames['#outcome'] = 'outcome';
    }

    const baseParams: QueryCommandInput = {
      TableName: this.config.tableName,
      Limit: limit,
      ScanIndexForward: false, // newest first
    };

    if (filterExpressions.length > 0) {
      baseParams.FilterExpression = filterExpressions.join(' AND ');
    }

    // Choose index based on filter
    if (filter.agentId) {
      exprAttrValues[':agentId'] = filter.agentId;
      baseParams.IndexName = 'agentId-index';
      baseParams.KeyConditionExpression =
        'agentId = :agentId' + timeRangeCondition;
    } else if (filter.actionType) {
      exprAttrValues[':actionType'] = filter.actionType;
      baseParams.IndexName = 'actionType-index';
      baseParams.KeyConditionExpression =
        'actionType = :actionType' + timeRangeCondition;
    } else if (filter.pillar) {
      exprAttrValues[':pillar'] = filter.pillar;
      baseParams.IndexName = 'pillar-index';
      baseParams.KeyConditionExpression =
        'pillar = :pillar' + timeRangeCondition;
    } else {
      // Fallback: query the main table. Without a specific indexed field,
      // we need at least a tenantId. Return a safe default query.
      baseParams.KeyConditionExpression = 'tenantId = :tid';
      exprAttrValues[':tid'] = 'unknown';
    }

    if (Object.keys(exprAttrValues).length > 0) {
      baseParams.ExpressionAttributeValues = exprAttrValues;
    }
    if (Object.keys(exprAttrNames).length > 0) {
      baseParams.ExpressionAttributeNames = exprAttrNames;
    }

    // Cursor-based pagination
    if (filter.cursor) {
      try {
        baseParams.ExclusiveStartKey = JSON.parse(
          Buffer.from(filter.cursor, 'base64').toString('utf-8'),
        );
      } catch {
        // Invalid cursor — ignore
      }
    }

    return baseParams;
  }

  /**
   * Find an audit record by its ID.
   *
   * Since recordId is not a key, we query using a filter.
   * In practice, we scan the table for the recordId. For efficiency,
   * we could add a GSI on recordId, but for now we use a query
   * with a filter expression on the main table.
   */
  private async findRecordById(recordId: string): Promise<AuditRecord | null> {
    // We don't know the tenantId, so we need to scan.
    // For integrity verification, this is acceptable as it's an
    // infrequent operation. In production, a GSI on recordId would help.
    const response = await this.docClient.send(
      new QueryCommand({
        TableName: this.config.tableName,
        IndexName: 'recordId-index',
        KeyConditionExpression: 'recordId = :rid',
        ExpressionAttributeValues: {
          ':rid': recordId,
        },
        Limit: 1,
      }),
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    return this.itemToAuditRecord(response.Items[0]);
  }

  /**
   * Find an audit record by its hash within a tenant.
   */
  private async findRecordByHash(
    tenantId: string,
    hash: string,
  ): Promise<AuditRecord | null> {
    const response = await this.docClient.send(
      new QueryCommand({
        TableName: this.config.tableName,
        KeyConditionExpression: 'tenantId = :tid',
        FilterExpression: '#h = :hash',
        ExpressionAttributeValues: {
          ':tid': tenantId,
          ':hash': hash,
        },
        ExpressionAttributeNames: {
          '#h': 'hash',
        },
      }),
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    return this.itemToAuditRecord(response.Items[0]);
  }

  /**
   * Convert a DynamoDB item to an AuditRecord.
   */
  private itemToAuditRecord(
    item: Record<string, unknown>,
  ): AuditRecord {
    return {
      id: item['recordId'] as string,
      tenantId: item['tenantId'] as string,
      timestamp: new Date(item['timestamp'] as string),
      type: item['type'] as AuditRecord['type'],
      actingAgentId: item['actingAgentId'] as string,
      actingAgentName: item['actingAgentName'] as string,
      actionType: item['actionType'] as string,
      target: item['target'] as string,
      authorizationChain: (item['authorizationChain'] ?? []) as AuditRecord['authorizationChain'],
      executionTokens: (item['executionTokens'] ?? []) as string[],
      outcome: item['outcome'] as AuditRecord['outcome'],
      details: (item['details'] ?? {}) as Record<string, unknown>,
      hash: item['hash'] as string,
      previousHash: item['previousHash'] as string,
    };
  }
}
