/**
 * Unit tests for the State Machine Engine (DefaultStateMachineEngine).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 19.1
 *
 * - 2.1: Execute state transitions only when all Gate conditions are satisfied
 * - 2.2: Reject transitions that fail Gate conditions and log rejection to XO_Audit
 * - 2.3: Support versioned, declarative state machine definitions
 * - 2.4: Migrate existing entities when a definition is updated
 * - 2.5: Record prior state, new state, triggering agent, Gate results, and timestamp
 * - 19.1: Test suite validates state machine transitions before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultStateMachineEngine } from './engine.js';
import type { AuditLogger, EventPublisher } from './engine.js';
import type {
  StateMachineDefinitionRow,
  StateMachineInstanceRow,
  StateMachineDefinitionRepository,
  StateMachineInstanceRepository,
} from '../db/state-machine.repository.js';
import type {
  StateMachineDefinition,
  GateDefinition,
  TransitionDefinition,
} from '../types/state-machine.js';
import type { TransitionAuditEntry } from '../types/audit.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-123';

function createDefinition(
  overrides: Partial<StateMachineDefinition> = {},
): StateMachineDefinition {
  return {
    id: 'def-1',
    name: 'test-workflow',
    version: '1.0.0',
    states: {
      draft: { name: 'draft', type: 'initial' },
      review: { name: 'review', type: 'active' },
      approved: { name: 'approved', type: 'terminal' },
    },
    initialState: 'draft',
    terminalStates: ['approved'],
    transitions: [
      {
        from: 'draft',
        to: 'review',
        event: 'submit',
        gates: [],
      },
      {
        from: 'review',
        to: 'approved',
        event: 'approve',
        gates: [],
      },
    ],
    metadata: {
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      description: 'Test workflow',
      tenantId: TENANT_ID,
    } as StateMachineDefinition['metadata'] & { tenantId: string },
    ...overrides,
  };
}

function serializeDefinition(def: StateMachineDefinition): Record<string, unknown> {
  return {
    id: def.id,
    name: def.name,
    version: def.version,
    states: def.states,
    initialState: def.initialState,
    terminalStates: def.terminalStates,
    transitions: def.transitions,
    metadata: {
      ...def.metadata,
      createdAt:
        def.metadata.createdAt instanceof Date
          ? def.metadata.createdAt.toISOString()
          : def.metadata.createdAt,
      updatedAt:
        def.metadata.updatedAt instanceof Date
          ? def.metadata.updatedAt.toISOString()
          : def.metadata.updatedAt,
    },
  };
}

function defToRow(def: StateMachineDefinition): StateMachineDefinitionRow {
  return {
    id: def.id,
    tenantId: TENANT_ID,
    name: def.name,
    version: def.version,
    definition: serializeDefinition(def),
    createdAt: new Date('2026-01-01'),
  };
}

function createMockRepos() {
  const definitions = new Map<string, StateMachineDefinitionRow>();
  const instances = new Map<string, StateMachineInstanceRow>();

  let auditCounter = 0;
  let eventCounter = 0;

  const definitionRepo: StateMachineDefinitionRepository = {
    create: vi.fn(async (_tenantId: string, data: Partial<StateMachineDefinitionRow>) => {
      const row: StateMachineDefinitionRow = {
        id: data.id!,
        tenantId: _tenantId,
        name: data.name!,
        version: data.version!,
        definition: data.definition!,
        createdAt: new Date(),
      };
      definitions.set(row.id, row);
      return row;
    }),
    findById: vi.fn(async (_tenantId: string, id: string) => {
      return definitions.get(id) ?? null;
    }),
    findAll: vi.fn(async () => ({ rows: [...definitions.values()], total: definitions.size })),
    findByNameAndVersion: vi.fn(async () => null),
    findLatestByName: vi.fn(async () => null),
    update: vi.fn(async () => null),
    delete: vi.fn(async () => false),
  } as unknown as StateMachineDefinitionRepository;

  const instanceRepo: StateMachineInstanceRepository = {
    create: vi.fn(async (_tenantId: string, data: Partial<StateMachineInstanceRow>) => {
      const row: StateMachineInstanceRow = {
        id: data.id!,
        definitionId: data.definitionId!,
        entityId: data.entityId!,
        tenantId: _tenantId,
        currentState: data.currentState!,
        data: data.data ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      instances.set(row.id, row);
      return row;
    }),
    findById: vi.fn(async (_tenantId: string, id: string) => {
      return instances.get(id) ?? null;
    }),
    findByDefinitionId: vi.fn(async (_tenantId: string, definitionId: string) => {
      const matching = [...instances.values()].filter(
        (i) => i.definitionId === definitionId,
      );
      return { rows: matching, total: matching.length };
    }),
    findByEntityId: vi.fn(async () => null),
    findByState: vi.fn(async () => []),
    findAll: vi.fn(async () => ({ rows: [...instances.values()], total: instances.size })),
    updateState: vi.fn(
      async (_tenantId: string, id: string, currentState: string, data: Record<string, unknown>) => {
        const existing = instances.get(id);
        if (!existing) return null;
        const updated = { ...existing, currentState, data, updatedAt: new Date() };
        instances.set(id, updated);
        return updated;
      },
    ),
    update: vi.fn(async () => null),
    delete: vi.fn(async () => false),
  } as unknown as StateMachineInstanceRepository;

  const auditLogger: AuditLogger = {
    recordStateTransition: vi.fn(async (_entry: TransitionAuditEntry) => {
      auditCounter++;
      return `audit-${auditCounter}`;
    }),
  };

  const eventPublisher: EventPublisher = {
    publish: vi.fn(async () => {
      eventCounter++;
      return `event-${eventCounter}`;
    }),
  };

  return {
    definitionRepo,
    instanceRepo,
    auditLogger,
    eventPublisher,
    definitions,
    instances,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultStateMachineEngine', () => {
  let engine: DefaultStateMachineEngine;
  let mocks: ReturnType<typeof createMockRepos>;

  beforeEach(() => {
    mocks = createMockRepos();
    engine = new DefaultStateMachineEngine({
      definitionRepo: mocks.definitionRepo,
      instanceRepo: mocks.instanceRepo,
      auditLogger: mocks.auditLogger,
      eventPublisher: mocks.eventPublisher,
    });
  });

  // -----------------------------------------------------------------------
  // Definition registration (Requirement 2.3)
  // -----------------------------------------------------------------------

  describe('register() — definition registration', () => {
    it('persists a definition via the definition repository', async () => {
      const def = createDefinition();
      const id = await engine.register(def);

      expect(id).toBeTruthy();
      expect(mocks.definitionRepo.create).toHaveBeenCalledOnce();
      expect(mocks.definitions.size).toBe(1);
    });

    it('uses the definition id when provided', async () => {
      const def = createDefinition({ id: 'custom-id' });
      const id = await engine.register(def);

      expect(id).toBe('custom-id');
      expect(mocks.definitions.has('custom-id')).toBe(true);
    });

    it('stores the correct name and version', async () => {
      const def = createDefinition({ name: 'my-workflow', version: '2.0.0' });
      await engine.register(def);

      const stored = [...mocks.definitions.values()][0];
      expect(stored.name).toBe('my-workflow');
      expect(stored.version).toBe('2.0.0');
    });
  });

  // -----------------------------------------------------------------------
  // Instance creation (Requirement 2.3)
  // -----------------------------------------------------------------------

  describe('createInstance() — instance creation with initial state', () => {
    it('creates an instance in the initial state of the definition', async () => {
      const def = createDefinition();
      await engine.register(def);

      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      expect(instance.currentState).toBe('draft');
      expect(instance.definitionId).toBe('def-1');
      expect(instance.entityId).toBe('entity-1');
    });

    it('stores initial data on the instance', async () => {
      const def = createDefinition();
      await engine.register(def);

      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        customField: 'hello',
      });

      expect(instance.data).toEqual(
        expect.objectContaining({ customField: 'hello' }),
      );
    });

    it('throws when definition does not exist', async () => {
      await expect(
        engine.createInstance('nonexistent', 'entity-1', { tenantId: TENANT_ID }),
      ).rejects.toThrow("State machine definition 'nonexistent' not found");
    });
  });

  // -----------------------------------------------------------------------
  // Gate evaluation (Requirements 2.1, 2.2)
  // -----------------------------------------------------------------------

  describe('transition() — gate evaluation', () => {
    const conditionGatePass: GateDefinition = {
      id: 'gate-pass',
      name: 'Score Check',
      type: 'condition',
      config: { field: 'score', operator: 'gte', value: 80 },
      required: true,
    };

    const conditionGateFail: GateDefinition = {
      id: 'gate-fail',
      name: 'Level Check',
      type: 'condition',
      config: { field: 'level', operator: 'eq', value: 'senior' },
      required: true,
    };

    const optionalGateFail: GateDefinition = {
      id: 'gate-optional',
      name: 'Optional Check',
      type: 'condition',
      config: { field: 'bonus', operator: 'exists' },
      required: false,
    };

    it('succeeds when all required gates pass', async () => {
      const def = createDefinition({
        transitions: [
          {
            from: 'draft',
            to: 'review',
            event: 'submit',
            gates: [conditionGatePass],
          },
        ],
      });
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        score: 90,
      });

      const result = await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.previousState).toBe('draft');
      expect(result.newState).toBe('review');
      expect(result.gateResults).toHaveLength(1);
      expect(result.gateResults[0].passed).toBe(true);
    });

    it('rejects when a required gate fails', async () => {
      const def = createDefinition({
        transitions: [
          {
            from: 'draft',
            to: 'review',
            event: 'submit',
            gates: [conditionGateFail],
          },
        ],
      });
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        level: 'junior',
      });

      const result = await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(result.success).toBe(false);
      expect(result.newState).toBe('draft'); // stays in current state
      expect(result.rejectionReason).toContain('Required gate(s) failed');
      expect(result.gateResults[0].passed).toBe(false);
    });

    it('succeeds when an optional gate fails but required gates pass', async () => {
      const def = createDefinition({
        transitions: [
          {
            from: 'draft',
            to: 'review',
            event: 'submit',
            gates: [conditionGatePass, optionalGateFail],
          },
        ],
      });
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        score: 95,
        // no 'bonus' field — optional gate will fail
      });

      const result = await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.newState).toBe('review');
      // Optional gate failed but didn't block
      const optionalResult = result.gateResults.find(
        (g) => g.gateId === 'gate-optional',
      );
      expect(optionalResult?.passed).toBe(false);
    });

    it('rejects when no transition is defined for the event', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      const result = await engine.transition(instance.id, 'nonexistent-event', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(result.success).toBe(false);
      expect(result.rejectionReason).toContain('No transition defined');
    });

    it('logs rejection to audit when transition is blocked', async () => {
      const def = createDefinition({
        transitions: [
          {
            from: 'draft',
            to: 'review',
            event: 'submit',
            gates: [conditionGateFail],
          },
        ],
      });
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        level: 'junior',
      });

      const result = await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(result.auditId).toBeTruthy();
      expect(mocks.auditLogger.recordStateTransition).toHaveBeenCalled();
      const auditCall = vi.mocked(mocks.auditLogger.recordStateTransition).mock
        .calls[0][0];
      expect(auditCall.outcome).toBe('blocked');
    });

    it('evaluates condition gate operators correctly', async () => {
      // Test various operators: eq, neq, gt, lt, lte, in, exists
      const gates: GateDefinition[] = [
        {
          id: 'g-eq',
          name: 'EQ',
          type: 'condition',
          config: { field: 'status', operator: 'eq', value: 'active' },
          required: true,
        },
        {
          id: 'g-gt',
          name: 'GT',
          type: 'condition',
          config: { field: 'count', operator: 'gt', value: 5 },
          required: true,
        },
        {
          id: 'g-in',
          name: 'IN',
          type: 'condition',
          config: { field: 'role', operator: 'in', value: ['admin', 'editor'] },
          required: true,
        },
        {
          id: 'g-exists',
          name: 'EXISTS',
          type: 'condition',
          config: { field: 'name', operator: 'exists' },
          required: true,
        },
      ];

      const def = createDefinition({
        transitions: [
          { from: 'draft', to: 'review', event: 'submit', gates },
        ],
      });
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        status: 'active',
        count: 10,
        role: 'admin',
        name: 'Test',
      });

      const result = await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(result.success).toBe(true);
      expect(result.gateResults.every((g) => g.passed)).toBe(true);
    });

    it('publishes event after successful transition', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      expect(mocks.eventPublisher.publish).toHaveBeenCalledOnce();
      const publishCall = vi.mocked(mocks.eventPublisher.publish).mock.calls[0][0];
      expect(publishCall.type).toBe('state-machine.transition.completed');
      expect(publishCall.detail).toEqual(
        expect.objectContaining({
          previousState: 'draft',
          newState: 'review',
          event: 'submit',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Transition history (Requirement 2.5)
  // -----------------------------------------------------------------------

  describe('getHistory() — transition history recording', () => {
    it('returns empty history for a new instance', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      const history = await engine.getHistory(instance.id);
      expect(history).toEqual([]);
    });

    it('records transition in history after successful transition', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      const history = await engine.getHistory(instance.id);
      expect(history).toHaveLength(1);
      expect(history[0].previousState).toBe('draft');
      expect(history[0].newState).toBe('review');
      expect(history[0].event).toBe('submit');
      expect(history[0].triggeredBy).toBe('agent-1');
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('accumulates multiple transitions in history', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });
      await engine.transition(instance.id, 'approve', {
        triggeredBy: 'agent-2',
        tenantId: TENANT_ID,
      });

      const history = await engine.getHistory(instance.id);
      expect(history).toHaveLength(2);
      expect(history[0].newState).toBe('review');
      expect(history[1].newState).toBe('approved');
    });

    it('does not record history for rejected transitions', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      // Try an invalid event — should be rejected
      await engine.transition(instance.id, 'approve', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      const history = await engine.getHistory(instance.id);
      expect(history).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Versioning and migration (Requirements 2.3, 2.4)
  // -----------------------------------------------------------------------

  describe('update() — definition versioning and migration', () => {
    it('creates a new definition version', async () => {
      const def = createDefinition();
      await engine.register(def);

      const newDef = createDefinition({
        id: 'def-2',
        version: '2.0.0',
        states: {
          draft: { name: 'draft', type: 'initial' },
          review: { name: 'review', type: 'active' },
          testing: { name: 'testing', type: 'active' },
          approved: { name: 'approved', type: 'terminal' },
        },
      });

      await engine.update('def-1', newDef);

      expect(mocks.definitions.size).toBe(2);
      expect(mocks.definitions.has('def-2')).toBe(true);
    });

    it('migrates instances preserving state when state exists in new definition', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      // Transition to 'review'
      await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      // New definition still has 'review' state
      const newDef = createDefinition({
        id: 'def-2',
        version: '2.0.0',
        states: {
          draft: { name: 'draft', type: 'initial' },
          review: { name: 'review', type: 'active' },
          approved: { name: 'approved', type: 'terminal' },
        },
      });

      await engine.update('def-1', newDef);

      // Instance should still be in 'review'
      const updatedInstance = mocks.instances.get(instance.id);
      expect(updatedInstance?.currentState).toBe('review');
    });

    it('migrates instances to initial state when old state does not exist in new definition', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      // Transition to 'review'
      await engine.transition(instance.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      // New definition does NOT have 'review' state
      const newDef = createDefinition({
        id: 'def-2',
        version: '2.0.0',
        initialState: 'pending',
        states: {
          pending: { name: 'pending', type: 'initial' },
          approved: { name: 'approved', type: 'terminal' },
        },
        transitions: [
          { from: 'pending', to: 'approved', event: 'approve', gates: [] },
        ],
      });

      await engine.update('def-1', newDef);

      // Instance should fall back to new initial state 'pending'
      const updatedInstance = mocks.instances.get(instance.id);
      expect(updatedInstance?.currentState).toBe('pending');
    });

    it('preserves instance data during migration', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
        importantData: 'must-survive',
      });

      const newDef = createDefinition({
        id: 'def-2',
        version: '2.0.0',
      });

      await engine.update('def-1', newDef);

      const updatedInstance = mocks.instances.get(instance.id);
      expect(updatedInstance?.data).toEqual(
        expect.objectContaining({ importantData: 'must-survive' }),
      );
    });

    it('records migration in transition history', async () => {
      const def = createDefinition();
      await engine.register(def);
      const instance = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      const newDef = createDefinition({
        id: 'def-2',
        version: '2.0.0',
        initialState: 'pending',
        states: {
          pending: { name: 'pending', type: 'initial' },
          done: { name: 'done', type: 'terminal' },
        },
        transitions: [],
      });

      await engine.update('def-1', newDef);

      const history = await engine.getHistory(instance.id);
      expect(history).toHaveLength(1);
      expect(history[0].event).toBe('definition_migration');
      expect(history[0].triggeredBy).toBe('system');
      expect(history[0].previousState).toBe('draft');
      expect(history[0].newState).toBe('pending');
    });

    it('adds migration metadata to instance data', async () => {
      const def = createDefinition();
      await engine.register(def);
      await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });

      const newDef = createDefinition({ id: 'def-2', version: '2.0.0' });
      await engine.update('def-1', newDef);

      const updateCall = vi.mocked(mocks.instanceRepo.updateState).mock.calls[0];
      const migratedData = updateCall[3] as Record<string, unknown>;
      expect(migratedData._migratedFrom).toBe('def-1');
      expect(migratedData._migratedTo).toBe('def-2');
      expect(migratedData._previousState).toBe('draft');
    });

    it('throws when updating a nonexistent definition', async () => {
      const newDef = createDefinition({ id: 'def-2', version: '2.0.0' });

      await expect(engine.update('nonexistent', newDef)).rejects.toThrow(
        "State machine definition 'nonexistent' not found",
      );
    });

    it('migrates multiple instances correctly', async () => {
      const def = createDefinition();
      await engine.register(def);

      const inst1 = await engine.createInstance('def-1', 'entity-1', {
        tenantId: TENANT_ID,
      });
      const inst2 = await engine.createInstance('def-1', 'entity-2', {
        tenantId: TENANT_ID,
      });

      // Move inst2 to 'review'
      await engine.transition(inst2.id, 'submit', {
        triggeredBy: 'agent-1',
        tenantId: TENANT_ID,
      });

      // New definition keeps 'draft' but removes 'review'
      const newDef = createDefinition({
        id: 'def-2',
        version: '2.0.0',
        initialState: 'draft',
        states: {
          draft: { name: 'draft', type: 'initial' },
          approved: { name: 'approved', type: 'terminal' },
        },
        transitions: [
          { from: 'draft', to: 'approved', event: 'approve', gates: [] },
        ],
      });

      await engine.update('def-1', newDef);

      // inst1 was in 'draft' — state exists in new def, stays 'draft'
      expect(mocks.instances.get(inst1.id)?.currentState).toBe('draft');
      // inst2 was in 'review' — state doesn't exist, falls back to 'draft'
      expect(mocks.instances.get(inst2.id)?.currentState).toBe('draft');
    });
  });
});
