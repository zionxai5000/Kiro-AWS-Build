/**
 * Unit tests for the XO Audit Service (XOAuditServiceImpl).
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 19.1
 *
 * - 7.1: Record every controlled action with acting agent, action type, target,
 *         authorization chain, timestamp, and outcome
 * - 7.2: Record every governance decision (authorization, escalation, completion
 *         validation, token grants)
 * - 7.3: Record every state transition with state machine ID, prior/new state,
 *         gate results, and triggering event
 * - 7.4: Support filtering by agent, time range, action type, pillar, and outcome
 * - 7.5: Retain audit records for 365 days with immutable storage
 * - 19.1: Test suite validates state machine transitions before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XOAuditServiceImpl } from './service.js';
import type { XOAuditServiceConfig } from './service.js';
import type {
  AuditEntry,
  GovernanceAuditEntry,
  TransitionAuditEntry,
  AuditFilter,
  AuditRecord,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock AWS SDK
// ---------------------------------------------------------------------------

function createMockDocClient() {
  return {
    send: vi.fn().mockResolvedValue({ Items: [] }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(
  overrides: Partial<XOAuditServiceConfig> = {},
): XOAuditServiceConfig & { mockDocClient: ReturnType<typeof createMockDocClient> } {
  const mockDocClient = createMockDocClient();
  return {
    tableName: 'seraphim-audit-trail',
    region: 'us-east-1',
    clients: {
      docClient: mockDocClient as any,
    },
    mockDocClient,
    ...overrides,
  };
}

function createMockEventBus() {
  return {
    publish: vi.fn().mockResolvedValue('event-id-123'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    tenantId: '550e8400-e29b-41d4-a716-446655440000',
    actingAgentId: 'agent-001',
    actingAgentName: 'TestAgent',
    actionType: 'file.write',
    target: '/data/output.json',
    authorizationChain: [
      {
        agentId: 'agent-001',
        level: 'L4',
        decision: 'approved',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
      },
    ],
    executionTokens: ['token-abc'],
    outcome: 'success',
    details: { pillar: 'eretz' },
    ...overrides,
  };
}

function createGovernanceEntry(
  overrides: Partial<GovernanceAuditEntry> = {},
): GovernanceAuditEntry {
  return {
    ...createAuditEntry(),
    actionType: 'governance.authorization',
    governanceType: 'authorization',
    ...overrides,
  };
}

function createTransitionEntry(
  overrides: Partial<TransitionAuditEntry> = {},
): TransitionAuditEntry {
  return {
    ...createAuditEntry(),
    actionType: 'state.transition',
    stateMachineId: 'sm-app-lifecycle',
    instanceId: 'inst-001',
    previousState: 'development',
    newState: 'testing',
    gateResults: [
      { gateId: 'gate-1', passed: true, details: 'All tests passed' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('XOAuditServiceImpl', () => {
  let config: ReturnType<typeof createConfig>;
  let service: XOAuditServiceImpl;
  let mockDocClient: ReturnType<typeof createMockDocClient>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    config = createConfig({ eventBus: mockEventBus as any });
    mockDocClient = config.mockDocClient;
    service = new XOAuditServiceImpl(config);
  });

  // -----------------------------------------------------------------------
  // 1. recordAction — Hash Chain Integrity (Req 7.1)
  // -----------------------------------------------------------------------

  describe('recordAction (Req 7.1)', () => {
    it('should return a UUID record ID', async () => {
      const entry = createAuditEntry();
      const id = await service.recordAction(entry);

      expect(id).toBeDefined();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should write a record to DynamoDB with type "action"', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      // First call is getLatestHash (QueryCommand), second is PutCommand
      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.TableName).toBe('seraphim-audit-trail');
      expect(putCall.input.Item.type).toBe('action');
    });

    it('should include all required fields in the DynamoDB item', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.tenantId).toBe(entry.tenantId);
      expect(item.actingAgentId).toBe(entry.actingAgentId);
      expect(item.actingAgentName).toBe(entry.actingAgentName);
      expect(item.actionType).toBe(entry.actionType);
      expect(item.target).toBe(entry.target);
      expect(item.authorizationChain).toEqual(entry.authorizationChain);
      expect(item.executionTokens).toEqual(entry.executionTokens);
      expect(item.outcome).toBe(entry.outcome);
    });

    it('should compute a SHA-256 hash for the record', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.hash).toBeDefined();
      expect(typeof item.hash).toBe('string');
      // SHA-256 hex is 64 characters
      expect(item.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should include previousHash in the record for chain integrity', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.previousHash).toBeDefined();
      expect(typeof item.previousHash).toBe('string');
    });

    it('should use genesis hash (64 zeros) when no previous records exist', async () => {
      // Default mock returns empty Items
      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.previousHash).toBe('0'.repeat(64));
    });

    it('should chain to the previous record hash when records exist', async () => {
      const previousHash = 'a'.repeat(64);
      // First call (getLatestHash) returns a previous record
      mockDocClient.send.mockResolvedValueOnce({
        Items: [{ hash: previousHash }],
      });

      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.previousHash).toBe(previousHash);
    });

    it('should use sort key format timestamp#recordId', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.sk).toBeDefined();
      // Format: ISO timestamp # UUID
      expect(item.sk).toMatch(/^\d{4}-\d{2}-\d{2}T.*#[0-9a-f-]{36}$/);
    });
  });

  // -----------------------------------------------------------------------
  // 2. recordGovernanceDecision (Req 7.2)
  // -----------------------------------------------------------------------

  describe('recordGovernanceDecision (Req 7.2)', () => {
    it('should write a record with type "governance"', async () => {
      const entry = createGovernanceEntry();
      const id = await service.recordGovernanceDecision(entry);

      expect(id).toBeDefined();
      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.type).toBe('governance');
    });

    it('should include governanceType in the details', async () => {
      const entry = createGovernanceEntry({ governanceType: 'escalation' });
      await service.recordGovernanceDecision(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.details.governanceType).toBe('escalation');
    });

    it('should support all governance types', async () => {
      const types: GovernanceAuditEntry['governanceType'][] = [
        'authorization',
        'escalation',
        'completion_validation',
        'token_grant',
      ];

      for (const governanceType of types) {
        mockDocClient.send.mockClear();
        const entry = createGovernanceEntry({ governanceType });
        await service.recordGovernanceDecision(entry);

        const putCall = mockDocClient.send.mock.calls[1][0];
        expect(putCall.input.Item.details.governanceType).toBe(governanceType);
      }
    });

    it('should compute a valid SHA-256 hash', async () => {
      const entry = createGovernanceEntry();
      await service.recordGovernanceDecision(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // -----------------------------------------------------------------------
  // 3. recordStateTransition (Req 7.3)
  // -----------------------------------------------------------------------

  describe('recordStateTransition (Req 7.3)', () => {
    it('should write a record with type "transition"', async () => {
      const entry = createTransitionEntry();
      const id = await service.recordStateTransition(entry);

      expect(id).toBeDefined();
      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.type).toBe('transition');
    });

    it('should include state machine details in the record', async () => {
      const entry = createTransitionEntry();
      await service.recordStateTransition(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const details = putCall.input.Item.details;

      expect(details.stateMachineId).toBe('sm-app-lifecycle');
      expect(details.instanceId).toBe('inst-001');
      expect(details.previousState).toBe('development');
      expect(details.newState).toBe('testing');
      expect(details.gateResults).toEqual([
        { gateId: 'gate-1', passed: true, details: 'All tests passed' },
      ]);
    });

    it('should compute a valid SHA-256 hash', async () => {
      const entry = createTransitionEntry();
      await service.recordStateTransition(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // -----------------------------------------------------------------------
  // 4. TTL — 365-day retention (Req 7.5)
  // -----------------------------------------------------------------------

  describe('365-day TTL (Req 7.5)', () => {
    it('should set expiresAt TTL to 365 days from creation', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      const item = putCall.input.Item;

      expect(item.expiresAt).toBeDefined();
      expect(typeof item.expiresAt).toBe('number');

      const nowInSeconds = Math.floor(Date.now() / 1000);
      const threeSixtyFiveDaysInSeconds = 365 * 24 * 60 * 60;

      // TTL should be approximately 365 days from now (within 10 seconds tolerance)
      expect(item.expiresAt).toBeGreaterThan(nowInSeconds + threeSixtyFiveDaysInSeconds - 10);
      expect(item.expiresAt).toBeLessThanOrEqual(nowInSeconds + threeSixtyFiveDaysInSeconds + 10);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Immutability — no update/delete methods (Req 7.5)
  // -----------------------------------------------------------------------

  describe('immutability by design (Req 7.5)', () => {
    it('should not expose an update method', () => {
      expect((service as any).updateRecord).toBeUndefined();
      expect((service as any).update).toBeUndefined();
      expect((service as any).updateAuditRecord).toBeUndefined();
    });

    it('should not expose a delete method', () => {
      expect((service as any).deleteRecord).toBeUndefined();
      expect((service as any).delete).toBeUndefined();
      expect((service as any).deleteAuditRecord).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });

    it('should only expose recording, querying, and verification methods on the interface', () => {
      // The XOAuditService interface defines exactly these public methods
      expect(typeof service.recordAction).toBe('function');
      expect(typeof service.recordGovernanceDecision).toBe('function');
      expect(typeof service.recordStateTransition).toBe('function');
      expect(typeof service.query).toBe('function');
      expect(typeof service.verifyIntegrity).toBe('function');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Query filtering (Req 7.4)
  // -----------------------------------------------------------------------

  describe('query filtering (Req 7.4)', () => {
    it('should use GSI2 (agentId-index) when filtering by agentId', async () => {
      const filter: AuditFilter = { agentId: 'agent-001' };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.IndexName).toBe('agentId-index');
      expect(queryCall.input.KeyConditionExpression).toContain('agentId = :agentId');
    });

    it('should use GSI1 (actionType-index) when filtering by actionType', async () => {
      const filter: AuditFilter = { actionType: 'file.write' };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.IndexName).toBe('actionType-index');
      expect(queryCall.input.KeyConditionExpression).toContain('actionType = :actionType');
    });

    it('should use GSI3 (pillar-index) when filtering by pillar', async () => {
      const filter: AuditFilter = { pillar: 'eretz' };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.IndexName).toBe('pillar-index');
      expect(queryCall.input.KeyConditionExpression).toContain('pillar = :pillar');
    });

    it('should apply time range as key condition', async () => {
      const filter: AuditFilter = {
        agentId: 'agent-001',
        timeRange: {
          start: new Date('2025-01-01T00:00:00.000Z'),
          end: new Date('2025-01-31T23:59:59.999Z'),
        },
      };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.KeyConditionExpression).toContain('BETWEEN');
      expect(queryCall.input.ExpressionAttributeValues[':tstart']).toBe(
        '2025-01-01T00:00:00.000Z',
      );
      expect(queryCall.input.ExpressionAttributeValues[':tend']).toBe(
        '2025-01-31T23:59:59.999Z',
      );
    });

    it('should apply outcome as a filter expression', async () => {
      const filter: AuditFilter = {
        agentId: 'agent-001',
        outcome: 'failure',
      };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.FilterExpression).toContain('#outcome = :outcome');
      expect(queryCall.input.ExpressionAttributeValues[':outcome']).toBe('failure');
    });

    it('should respect the limit parameter', async () => {
      const filter: AuditFilter = { agentId: 'agent-001', limit: 10 };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.Limit).toBe(10);
    });

    it('should default limit to 50 when not specified', async () => {
      const filter: AuditFilter = { agentId: 'agent-001' };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.Limit).toBe(50);
    });

    it('should return empty array when no items match', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const results = await service.query({ agentId: 'agent-nonexistent' });
      expect(results).toEqual([]);
    });

    it('should convert DynamoDB items to AuditRecord objects', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            recordId: 'rec-001',
            tenantId: '550e8400-e29b-41d4-a716-446655440000',
            timestamp: '2025-01-15T10:00:00.000Z',
            type: 'action',
            actingAgentId: 'agent-001',
            actingAgentName: 'TestAgent',
            actionType: 'file.write',
            target: '/data/output.json',
            authorizationChain: [],
            executionTokens: ['token-abc'],
            outcome: 'success',
            details: {},
            hash: 'a'.repeat(64),
            previousHash: '0'.repeat(64),
          },
        ],
      });

      const results = await service.query({ agentId: 'agent-001' });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('rec-001');
      expect(results[0].tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(results[0].timestamp).toBeInstanceOf(Date);
      expect(results[0].type).toBe('action');
      expect(results[0].actingAgentId).toBe('agent-001');
      expect(results[0].hash).toBe('a'.repeat(64));
      expect(results[0].previousHash).toBe('0'.repeat(64));
    });

    it('should support cursor-based pagination', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ tenantId: 'tid', sk: 'some-key' }),
      ).toString('base64');

      const filter: AuditFilter = { agentId: 'agent-001', cursor };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.ExclusiveStartKey).toEqual({
        tenantId: 'tid',
        sk: 'some-key',
      });
    });

    it('should sort results newest first (ScanIndexForward = false)', async () => {
      const filter: AuditFilter = { agentId: 'agent-001' };
      await service.query(filter);

      const queryCall = mockDocClient.send.mock.calls[0][0];
      expect(queryCall.input.ScanIndexForward).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 7. verifyIntegrity — Hash Chain Verification (Req 7.5)
  // -----------------------------------------------------------------------

  describe('verifyIntegrity (Req 7.5)', () => {
    it('should return valid=false when the record is not found', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.verifyIntegrity('nonexistent-id');

      expect(result.valid).toBe(false);
      expect(result.recordId).toBe('nonexistent-id');
      expect(result.chainLength).toBe(0);
      expect(result.brokenAt).toBe('nonexistent-id');
    });

    it('should return valid=true for a single record with correct hash', async () => {
      // Build a valid record and compute its hash
      const record: AuditRecord = {
        id: 'rec-001',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '', // will be computed
        previousHash: '0'.repeat(64),
      };
      record.hash = service.computeHash(record);

      // findRecordById returns the record
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            recordId: record.id,
            tenantId: record.tenantId,
            timestamp: record.timestamp.toISOString(),
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
          },
        ],
      });

      const result = await service.verifyIntegrity('rec-001');

      expect(result.valid).toBe(true);
      expect(result.recordId).toBe('rec-001');
      expect(result.chainLength).toBe(1);
      expect(result.brokenAt).toBeUndefined();
    });

    it('should detect tampering when hash does not match record content', async () => {
      // Return a record with a hash that doesn't match its content
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            recordId: 'rec-tampered',
            tenantId: 'tenant-1',
            timestamp: '2025-01-15T10:00:00.000Z',
            type: 'action',
            actingAgentId: 'agent-001',
            actingAgentName: 'TestAgent',
            actionType: 'file.write',
            target: '/data/output.json',
            authorizationChain: [],
            executionTokens: [],
            outcome: 'success',
            details: {},
            hash: 'tampered_hash_that_does_not_match_content'.padEnd(64, '0'),
            previousHash: '0'.repeat(64),
          },
        ],
      });

      const result = await service.verifyIntegrity('rec-tampered');

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('rec-tampered');
    });

    it('should walk the chain and verify multiple records', async () => {
      // Build two valid records in a chain
      const record1: AuditRecord = {
        id: 'rec-001',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T09:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.read',
        target: '/data/input.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '',
        previousHash: '0'.repeat(64),
      };
      record1.hash = service.computeHash(record1);

      const record2: AuditRecord = {
        id: 'rec-002',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '',
        previousHash: record1.hash,
      };
      record2.hash = service.computeHash(record2);

      // findRecordById returns record2
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            recordId: record2.id,
            tenantId: record2.tenantId,
            timestamp: record2.timestamp.toISOString(),
            type: record2.type,
            actingAgentId: record2.actingAgentId,
            actingAgentName: record2.actingAgentName,
            actionType: record2.actionType,
            target: record2.target,
            authorizationChain: record2.authorizationChain,
            executionTokens: record2.executionTokens,
            outcome: record2.outcome,
            details: record2.details,
            hash: record2.hash,
            previousHash: record2.previousHash,
          },
        ],
      });

      // findRecordByHash returns record1
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            recordId: record1.id,
            tenantId: record1.tenantId,
            timestamp: record1.timestamp.toISOString(),
            type: record1.type,
            actingAgentId: record1.actingAgentId,
            actingAgentName: record1.actingAgentName,
            actionType: record1.actionType,
            target: record1.target,
            authorizationChain: record1.authorizationChain,
            executionTokens: record1.executionTokens,
            outcome: record1.outcome,
            details: record1.details,
            hash: record1.hash,
            previousHash: record1.previousHash,
          },
        ],
      });

      const result = await service.verifyIntegrity('rec-002');

      expect(result.valid).toBe(true);
      expect(result.chainLength).toBe(2);
      expect(result.brokenAt).toBeUndefined();
    });

    it('should detect a broken chain when previous record is missing', async () => {
      const record: AuditRecord = {
        id: 'rec-orphan',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '',
        previousHash: 'b'.repeat(64), // points to a non-genesis hash
      };
      record.hash = service.computeHash(record);

      // findRecordById returns the record
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            recordId: record.id,
            tenantId: record.tenantId,
            timestamp: record.timestamp.toISOString(),
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
          },
        ],
      });

      // findRecordByHash returns nothing (previous record missing)
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await service.verifyIntegrity('rec-orphan');

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('rec-orphan');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Event Bus Publishing
  // -----------------------------------------------------------------------

  describe('Event Bus publishing', () => {
    it('should publish an audit.entry.created event after recording an action', async () => {
      const entry = createAuditEntry();
      await service.recordAction(entry);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];

      expect(publishedEvent.source).toBe('seraphim.xo-audit');
      expect(publishedEvent.type).toBe('audit.entry.created');
      expect(publishedEvent.detail.actingAgentId).toBe('agent-001');
      expect(publishedEvent.detail.actionType).toBe('file.write');
      expect(publishedEvent.detail.outcome).toBe('success');
      expect(publishedEvent.metadata.tenantId).toBe(entry.tenantId);
    });

    it('should publish an event after recording a governance decision', async () => {
      const entry = createGovernanceEntry();
      await service.recordGovernanceDecision(entry);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent.detail.type).toBe('governance');
    });

    it('should publish an event after recording a state transition', async () => {
      const entry = createTransitionEntry();
      await service.recordStateTransition(entry);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];
      expect(publishedEvent.detail.type).toBe('transition');
    });

    it('should not fail if event publishing throws', async () => {
      mockEventBus.publish.mockRejectedValueOnce(new Error('EventBridge down'));

      const entry = createAuditEntry();
      // Should not throw — audit recording succeeds even if event publishing fails
      const id = await service.recordAction(entry);
      expect(id).toBeDefined();
    });

    it('should not publish events when no EventBus is configured', async () => {
      const configNoEB = createConfig();
      // Don't pass eventBus
      const serviceNoEB = new XOAuditServiceImpl({
        tableName: configNoEB.tableName,
        region: configNoEB.region,
        clients: configNoEB.clients,
      });

      const entry = createAuditEntry();
      const id = await serviceNoEB.recordAction(entry);

      expect(id).toBeDefined();
      // No event bus means no publish calls
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Hash computation consistency
  // -----------------------------------------------------------------------

  describe('computeHash', () => {
    it('should produce the same hash for the same record', () => {
      const record: AuditRecord = {
        id: 'rec-001',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '',
        previousHash: '0'.repeat(64),
      };

      const hash1 = service.computeHash(record);
      const hash2 = service.computeHash(record);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different records', () => {
      const record1: AuditRecord = {
        id: 'rec-001',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '',
        previousHash: '0'.repeat(64),
      };

      const record2: AuditRecord = {
        ...record1,
        id: 'rec-002',
        actionType: 'file.delete',
      };

      const hash1 = service.computeHash(record1);
      const hash2 = service.computeHash(record2);

      expect(hash1).not.toBe(hash2);
    });

    it('should include previousHash in the hash computation', () => {
      const record: AuditRecord = {
        id: 'rec-001',
        tenantId: 'tenant-1',
        timestamp: new Date('2025-01-15T10:00:00.000Z'),
        type: 'action',
        actingAgentId: 'agent-001',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        hash: '',
        previousHash: '0'.repeat(64),
      };

      const hashWithGenesis = service.computeHash(record);

      const recordWithDifferentPrev = { ...record, previousHash: 'a'.repeat(64) };
      const hashWithDifferentPrev = service.computeHash(recordWithDifferentPrev);

      expect(hashWithGenesis).not.toBe(hashWithDifferentPrev);
    });
  });

  // -----------------------------------------------------------------------
  // 10. GSI attribute population
  // -----------------------------------------------------------------------

  describe('GSI attribute population', () => {
    it('should populate agentId GSI attribute from actingAgentId', async () => {
      const entry = createAuditEntry({ actingAgentId: 'agent-xyz' });
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.agentId).toBe('agent-xyz');
    });

    it('should populate pillar GSI attribute from details.pillar', async () => {
      const entry = createAuditEntry({ details: { pillar: 'otzar' } });
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.pillar).toBe('otzar');
    });

    it('should default pillar to "system" when not in details', async () => {
      const entry = createAuditEntry({ details: {} });
      await service.recordAction(entry);

      const putCall = mockDocClient.send.mock.calls[1][0];
      expect(putCall.input.Item.pillar).toBe('system');
    });
  });
});
