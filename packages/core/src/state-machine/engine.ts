/**
 * State Machine Engine — executes declarative state machine definitions.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 *
 * - 2.1: Execute state transitions only when all Gate conditions are satisfied
 * - 2.2: Reject transitions that fail Gate conditions and log rejection to XO_Audit
 * - 2.3: Support versioned, declarative state machine definitions
 * - 2.4: Migrate existing entities when a definition is updated
 * - 2.5: Record prior state, new state, triggering agent, Gate results, and timestamp
 */

import { randomUUID } from 'node:crypto';

import type {
  StateMachineDefinition,
  StateMachineInstance,
  TransitionContext,
  TransitionResult,
  TransitionRecord,
  InstanceFilter,
  GateDefinition,
  GateResult,
  TransitionDefinition,
} from '../types/state-machine.js';
import type { TransitionAuditEntry } from '../types/audit.js';
import type { StateMachineEngine } from '../interfaces/state-machine-engine.js';
import type {
  StateMachineDefinitionRepository,
  StateMachineDefinitionRow,
  StateMachineInstanceRepository,
  StateMachineInstanceRow,
} from '../db/state-machine.repository.js';

// ---------------------------------------------------------------------------
// Dependency interfaces (injected via constructor)
// ---------------------------------------------------------------------------

/**
 * Minimal audit logger interface accepted by the engine.
 * Maps to `XOAuditService.recordStateTransition()`.
 */
export interface AuditLogger {
  recordStateTransition(entry: TransitionAuditEntry): Promise<string>;
}

/**
 * Minimal event publisher interface accepted by the engine.
 * The engine publishes state-transition events through this callback.
 */
export interface EventPublisher {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
    metadata: { tenantId: string; correlationId: string; timestamp: Date };
  }): Promise<string>;
}

// ---------------------------------------------------------------------------
// DefaultStateMachineEngine
// ---------------------------------------------------------------------------

export class DefaultStateMachineEngine implements StateMachineEngine {
  private readonly definitionRepo: StateMachineDefinitionRepository;
  private readonly instanceRepo: StateMachineInstanceRepository;
  private readonly auditLogger: AuditLogger;
  private readonly eventPublisher: EventPublisher;

  /**
   * In-memory store for transition history.
   * In production this would be backed by a dedicated table or DynamoDB;
   * for Phase 1 we keep it in-memory keyed by instanceId.
   */
  private readonly transitionHistory = new Map<string, TransitionRecord[]>();

  constructor(deps: {
    definitionRepo: StateMachineDefinitionRepository;
    instanceRepo: StateMachineInstanceRepository;
    auditLogger: AuditLogger;
    eventPublisher: EventPublisher;
  }) {
    this.definitionRepo = deps.definitionRepo;
    this.instanceRepo = deps.instanceRepo;
    this.auditLogger = deps.auditLogger;
    this.eventPublisher = deps.eventPublisher;
  }

  // -----------------------------------------------------------------------
  // Definition management
  // -----------------------------------------------------------------------

  /**
   * Register a versioned state machine definition.
   * Persists the definition to the `state_machine_definitions` table.
   *
   * Validates: Requirement 2.3
   */
  async register(definition: StateMachineDefinition): Promise<string> {
    const id = definition.id || randomUUID();

    // Determine tenantId — stored in metadata.details or default to 'system'
    const tenantId =
      (definition.metadata as Record<string, unknown> & { tenantId?: string })
        .tenantId ?? 'system';

    await this.definitionRepo.create(tenantId, {
      id,
      name: definition.name,
      version: definition.version,
      definition: this.serializeDefinition(definition),
    } as Partial<StateMachineDefinitionRow>);

    return id;
  }

  /**
   * Update a state machine definition with a new version.
   * Migrates existing instances to the new definition by mapping old states
   * to new states where possible.
   *
   * Validates: Requirements 2.3, 2.4
   */
  async update(
    definitionId: string,
    newDef: StateMachineDefinition,
  ): Promise<void> {
    const tenantId =
      (newDef.metadata as Record<string, unknown> & { tenantId?: string })
        .tenantId ?? 'system';

    // 1. Load the old definition
    const oldRow = await this.definitionRepo.findById(tenantId, definitionId);
    if (!oldRow) {
      throw new Error(`State machine definition '${definitionId}' not found`);
    }

    const oldDef = this.deserializeDefinition(oldRow);

    // 2. Register the new definition version
    const newId = newDef.id || randomUUID();
    await this.definitionRepo.create(tenantId, {
      id: newId,
      name: newDef.name,
      version: newDef.version,
      definition: this.serializeDefinition(newDef),
    } as Partial<StateMachineDefinitionRow>);

    // 3. Migrate existing instances
    const { rows: instances } = await this.instanceRepo.findByDefinitionId(
      tenantId,
      definitionId,
    );

    for (const instance of instances) {
      const mappedState = this.mapStateToNewDefinition(
        instance.currentState,
        oldDef,
        newDef,
      );

      await this.instanceRepo.updateState(
        tenantId,
        instance.id,
        mappedState,
        {
          ...instance.data,
          _migratedFrom: definitionId,
          _migratedTo: newId,
          _previousState: instance.currentState,
        },
      );

      // Record migration in transition history
      const record: TransitionRecord = {
        id: randomUUID(),
        instanceId: instance.id,
        previousState: instance.currentState,
        newState: mappedState,
        event: 'definition_migration',
        triggeredBy: 'system',
        gateResults: [],
        timestamp: new Date(),
      };
      this.appendTransitionRecord(instance.id, record);
    }
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /**
   * Create a new state machine instance for an entity.
   * The instance starts in the definition's `initialState`.
   *
   * Validates: Requirement 2.3
   */
  async createInstance(
    definitionId: string,
    entityId: string,
    initialData?: Record<string, unknown>,
  ): Promise<StateMachineInstance> {
    // We need a tenantId to query — try to find the definition across known tenants.
    // For now, use 'system' as default; callers should set tenantId in initialData.
    const tenantId = (initialData?.tenantId as string) ?? 'system';

    const defRow = await this.definitionRepo.findById(tenantId, definitionId);
    if (!defRow) {
      throw new Error(`State machine definition '${definitionId}' not found`);
    }

    const definition = this.deserializeDefinition(defRow);
    const instanceId = randomUUID();

    const row = await this.instanceRepo.create(tenantId, {
      id: instanceId,
      definitionId,
      entityId,
      currentState: definition.initialState,
      data: initialData ?? {},
    } as Partial<StateMachineInstanceRow>);

    return this.rowToInstance(row);
  }

  /**
   * Attempt a state transition on an instance.
   *
   * 1. Load the definition and instance
   * 2. Find matching transition for (currentState, event)
   * 3. Evaluate all gate conditions
   * 4. If all required gates pass → execute transition, persist new state
   * 5. If any required gate fails → reject, log rejection
   * 6. Record the transition in audit trail and publish event
   *
   * Validates: Requirements 2.1, 2.2, 2.5
   */
  async transition(
    instanceId: string,
    event: string,
    context: TransitionContext,
  ): Promise<TransitionResult> {
    const tenantId = context.tenantId;

    // 1. Load instance
    const instanceRow = await this.instanceRepo.findById(tenantId, instanceId);
    if (!instanceRow) {
      throw new Error(`State machine instance '${instanceId}' not found`);
    }

    // 2. Load definition
    const defRow = await this.definitionRepo.findById(
      tenantId,
      instanceRow.definitionId,
    );
    if (!defRow) {
      throw new Error(
        `State machine definition '${instanceRow.definitionId}' not found`,
      );
    }

    const definition = this.deserializeDefinition(defRow);
    const currentState = instanceRow.currentState;

    // 3. Find matching transition
    const transitionDef = definition.transitions.find(
      (t) => t.from === currentState && t.event === event,
    );

    if (!transitionDef) {
      const rejectionReason = `No transition defined from state '${currentState}' for event '${event}'`;

      const auditId = await this.logTransition({
        tenantId,
        instanceId,
        definitionId: instanceRow.definitionId,
        previousState: currentState,
        newState: currentState,
        event,
        triggeredBy: context.triggeredBy,
        gateResults: [],
        outcome: 'blocked',
        rejectionReason,
      });

      return {
        success: false,
        previousState: currentState,
        newState: currentState,
        gateResults: [],
        rejectionReason,
        auditId,
      };
    }

    // 4. Evaluate gates
    const gateResults = await this.evaluateGates(
      transitionDef.gates,
      instanceRow,
      context,
    );

    const requiredGatesFailed = gateResults.filter(
      (gr) => !gr.passed && this.isGateRequired(gr.gateId, transitionDef.gates),
    );

    // 5. If any required gate fails → reject
    if (requiredGatesFailed.length > 0) {
      const rejectionReason = `Required gate(s) failed: ${requiredGatesFailed.map((g) => g.gateName).join(', ')}`;

      const auditId = await this.logTransition({
        tenantId,
        instanceId,
        definitionId: instanceRow.definitionId,
        previousState: currentState,
        newState: currentState,
        event,
        triggeredBy: context.triggeredBy,
        gateResults,
        outcome: 'blocked',
        rejectionReason,
      });

      return {
        success: false,
        previousState: currentState,
        newState: currentState,
        gateResults,
        rejectionReason,
        auditId,
      };
    }

    // 6. Execute transition — persist new state
    const newState = transitionDef.to;
    const updatedData = {
      ...instanceRow.data,
      ...(context.data ?? {}),
    };

    await this.instanceRepo.updateState(
      tenantId,
      instanceId,
      newState,
      updatedData,
    );

    // 7. Record in audit trail and publish event
    const auditId = await this.logTransition({
      tenantId,
      instanceId,
      definitionId: instanceRow.definitionId,
      previousState: currentState,
      newState,
      event,
      triggeredBy: context.triggeredBy,
      gateResults,
      outcome: 'success',
    });

    // Record in transition history
    const record: TransitionRecord = {
      id: auditId,
      instanceId,
      previousState: currentState,
      newState,
      event,
      triggeredBy: context.triggeredBy,
      gateResults,
      timestamp: new Date(),
    };
    this.appendTransitionRecord(instanceId, record);

    // Publish event
    await this.eventPublisher.publish({
      source: 'seraphim.state-machine',
      type: 'state-machine.transition.completed',
      detail: {
        instanceId,
        definitionId: instanceRow.definitionId,
        previousState: currentState,
        newState,
        event,
        triggeredBy: context.triggeredBy,
        gateResults,
      },
      metadata: {
        tenantId,
        correlationId: instanceId,
        timestamp: new Date(),
      },
    });

    return {
      success: true,
      previousState: currentState,
      newState,
      gateResults,
      auditId,
    };
  }

  /**
   * Get the current state of an instance.
   */
  async getState(instanceId: string): Promise<StateMachineInstance> {
    // Try 'system' tenant first — in a real implementation we'd have tenant context
    // For now, scan known tenants or accept tenantId as part of the instance data
    const row = await this.findInstanceAcrossTenants(instanceId);
    if (!row) {
      throw new Error(`State machine instance '${instanceId}' not found`);
    }
    return this.rowToInstance(row);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * List instances matching a filter.
   */
  async listInstances(filter?: InstanceFilter): Promise<StateMachineInstance[]> {
    const tenantId = filter?.tenantId ?? 'system';

    if (filter?.definitionId) {
      const { rows } = await this.instanceRepo.findByDefinitionId(
        tenantId,
        filter.definitionId,
      );
      return rows
        .filter((r) => !filter.currentState || r.currentState === filter.currentState)
        .filter((r) => !filter.entityId || r.entityId === filter.entityId)
        .map((r) => this.rowToInstance(r));
    }

    if (filter?.currentState) {
      const rows = await this.instanceRepo.findByState(tenantId, filter.currentState);
      return rows
        .filter((r) => !filter.entityId || r.entityId === filter.entityId)
        .map((r) => this.rowToInstance(r));
    }

    if (filter?.entityId) {
      const row = await this.instanceRepo.findByEntityId(tenantId, filter.entityId);
      return row ? [this.rowToInstance(row)] : [];
    }

    // No filter — return all for tenant
    const { rows } = await this.instanceRepo.findAll(tenantId);
    return rows.map((r) => this.rowToInstance(r));
  }

  /**
   * Get the full transition history for an instance.
   *
   * Validates: Requirement 2.5
   */
  async getHistory(instanceId: string): Promise<TransitionRecord[]> {
    return this.transitionHistory.get(instanceId) ?? [];
  }

  // -----------------------------------------------------------------------
  // Gate evaluation
  // -----------------------------------------------------------------------

  /**
   * Evaluate all gates for a transition.
   *
   * Gate types:
   * - 'condition': Evaluate a boolean expression against instance data
   * - 'approval': Check if an approval exists (stubbed for Phase 2)
   * - 'validation': Run a validation function (stubbed for Phase 2)
   * - 'external': Call an external service (stubbed for Phase 2)
   */
  private async evaluateGates(
    gates: GateDefinition[],
    instance: StateMachineInstanceRow,
    context: TransitionContext,
  ): Promise<GateResult[]> {
    const results: GateResult[] = [];

    for (const gate of gates) {
      const result = await this.evaluateGate(gate, instance, context);
      results.push(result);
    }

    return results;
  }

  private async evaluateGate(
    gate: GateDefinition,
    instance: StateMachineInstanceRow,
    context: TransitionContext,
  ): Promise<GateResult> {
    switch (gate.type) {
      case 'condition':
        return this.evaluateConditionGate(gate, instance, context);
      case 'approval':
        return this.evaluateApprovalGate(gate);
      case 'validation':
        return this.evaluateValidationGate(gate);
      case 'external':
        return this.evaluateExternalGate(gate);
      default:
        return {
          gateId: gate.id,
          gateName: gate.name,
          passed: false,
          details: `Unknown gate type: ${gate.type as string}`,
        };
    }
  }

  /**
   * Evaluate a condition gate.
   *
   * The gate config should contain:
   * - `field`: the field name in instance data or context data to check
   * - `operator`: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'in'
   * - `value`: the expected value
   */
  private evaluateConditionGate(
    gate: GateDefinition,
    instance: StateMachineInstanceRow,
    context: TransitionContext,
  ): GateResult {
    const config = gate.config as {
      field?: string;
      operator?: string;
      value?: unknown;
      expression?: string;
    };

    // If an expression is provided, evaluate it as a simple boolean check
    if (config.expression !== undefined) {
      const passed = this.evaluateExpression(
        config.expression,
        instance.data,
        context.data ?? {},
      );
      return {
        gateId: gate.id,
        gateName: gate.name,
        passed,
        details: passed
          ? `Expression '${config.expression}' evaluated to true`
          : `Expression '${config.expression}' evaluated to false`,
      };
    }

    if (!config.field || !config.operator) {
      return {
        gateId: gate.id,
        gateName: gate.name,
        passed: false,
        details: 'Condition gate missing required config: field, operator',
      };
    }

    // Resolve the field value from instance data or context data
    const fieldValue =
      this.resolveField(config.field, instance.data) ??
      this.resolveField(config.field, context.data ?? {});

    const passed = this.evaluateOperator(
      config.operator,
      fieldValue,
      config.value,
    );

    return {
      gateId: gate.id,
      gateName: gate.name,
      passed,
      details: passed
        ? `Condition '${config.field} ${config.operator} ${String(config.value ?? '')}' passed`
        : `Condition '${config.field} ${config.operator} ${String(config.value ?? '')}' failed (actual: ${String(fieldValue)})`,
    };
  }

  /**
   * Stub: approval gate — will be wired to real approval service in Phase 2.
   */
  private evaluateApprovalGate(gate: GateDefinition): GateResult {
    // Stubbed: always passes for now. In Phase 2, this will check
    // if an approval record exists for the given entity/action.
    return {
      gateId: gate.id,
      gateName: gate.name,
      passed: true,
      details: 'Approval gate stubbed — auto-approved (Phase 2 will wire to approval service)',
    };
  }

  /**
   * Stub: validation gate — will be wired to real validation functions in Phase 2.
   */
  private evaluateValidationGate(gate: GateDefinition): GateResult {
    return {
      gateId: gate.id,
      gateName: gate.name,
      passed: true,
      details: 'Validation gate stubbed — auto-passed (Phase 2 will wire to validation functions)',
    };
  }

  /**
   * Stub: external gate — will be wired to external service calls in Phase 2.
   */
  private evaluateExternalGate(gate: GateDefinition): GateResult {
    return {
      gateId: gate.id,
      gateName: gate.name,
      passed: true,
      details: 'External gate stubbed — auto-passed (Phase 2 will wire to external services)',
    };
  }

  // -----------------------------------------------------------------------
  // Expression evaluation helpers
  // -----------------------------------------------------------------------

  /**
   * Evaluate a simple expression string against data.
   * Supports: 'field == value', 'field != value', 'field > value', 'field exists'
   */
  private evaluateExpression(
    expression: string,
    instanceData: Record<string, unknown>,
    contextData: Record<string, unknown>,
  ): boolean {
    const mergedData = { ...instanceData, ...contextData };

    // Simple pattern: "field operator value"
    const match = expression.match(
      /^(\w[\w.]*)\s*(==|!=|>=|<=|>|<|exists|in)\s*(.*)$/,
    );
    if (!match) return false;

    const [, field, operator, rawValue] = match;
    const fieldValue = this.resolveField(field, mergedData);

    if (operator === 'exists') {
      return fieldValue !== undefined && fieldValue !== null;
    }

    const value = this.parseExpressionValue(rawValue.trim());
    return this.evaluateOperator(
      this.mapExpressionOperator(operator),
      fieldValue,
      value,
    );
  }

  private mapExpressionOperator(op: string): string {
    switch (op) {
      case '==':
        return 'eq';
      case '!=':
        return 'neq';
      case '>':
        return 'gt';
      case '>=':
        return 'gte';
      case '<':
        return 'lt';
      case '<=':
        return 'lte';
      case 'in':
        return 'in';
      default:
        return op;
    }
  }

  private parseExpressionValue(raw: string): unknown {
    // Remove surrounding quotes
    if (
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"'))
    ) {
      return raw.slice(1, -1);
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    const num = Number(raw);
    if (!isNaN(num) && raw !== '') return num;
    return raw;
  }

  private evaluateOperator(
    operator: string,
    actual: unknown,
    expected: unknown,
  ): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'gte':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lt':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'lte':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'exists':
        return actual !== undefined && actual !== null;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return false;
    }
  }

  private resolveField(
    field: string,
    data: Record<string, unknown>,
  ): unknown {
    const parts = field.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  // -----------------------------------------------------------------------
  // Audit logging
  // -----------------------------------------------------------------------

  private async logTransition(params: {
    tenantId: string;
    instanceId: string;
    definitionId: string;
    previousState: string;
    newState: string;
    event: string;
    triggeredBy: string;
    gateResults: GateResult[];
    outcome: 'success' | 'failure' | 'blocked';
    rejectionReason?: string;
  }): Promise<string> {
    const entry: TransitionAuditEntry = {
      tenantId: params.tenantId,
      actingAgentId: params.triggeredBy,
      actingAgentName: params.triggeredBy,
      actionType: 'state_transition',
      target: params.instanceId,
      authorizationChain: [],
      executionTokens: [],
      outcome: params.outcome,
      details: {
        event: params.event,
        ...(params.rejectionReason
          ? { rejectionReason: params.rejectionReason }
          : {}),
      },
      stateMachineId: params.definitionId,
      instanceId: params.instanceId,
      previousState: params.previousState,
      newState: params.newState,
      gateResults: params.gateResults.map((gr) => ({
        gateId: gr.gateId,
        passed: gr.passed,
        details: gr.details,
      })),
    };

    return this.auditLogger.recordStateTransition(entry);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private isGateRequired(gateId: string, gates: GateDefinition[]): boolean {
    const gate = gates.find((g) => g.id === gateId);
    return gate?.required ?? true;
  }

  /**
   * Map an old state to the closest matching state in a new definition.
   * If the old state exists in the new definition, keep it.
   * Otherwise, fall back to the new definition's initial state.
   */
  private mapStateToNewDefinition(
    oldState: string,
    _oldDef: StateMachineDefinition,
    newDef: StateMachineDefinition,
  ): string {
    // If the state exists in the new definition, keep it
    if (newDef.states[oldState]) {
      return oldState;
    }
    // Otherwise, fall back to the initial state
    return newDef.initialState;
  }

  private serializeDefinition(
    def: StateMachineDefinition,
  ): Record<string, unknown> {
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

  private deserializeDefinition(
    row: StateMachineDefinitionRow,
  ): StateMachineDefinition {
    const raw = row.definition;
    return {
      id: (raw.id as string) ?? row.id,
      name: (raw.name as string) ?? row.name,
      version: (raw.version as string) ?? row.version,
      states: (raw.states as Record<string, StateMachineDefinition['states'][string]>) ?? {},
      initialState: (raw.initialState as string) ?? '',
      terminalStates: (raw.terminalStates as string[]) ?? [],
      transitions: (raw.transitions as TransitionDefinition[]) ?? [],
      metadata: {
        createdAt: new Date(
          ((raw.metadata as Record<string, unknown>)?.createdAt as string) ??
            row.createdAt.toISOString(),
        ),
        updatedAt: new Date(
          ((raw.metadata as Record<string, unknown>)?.updatedAt as string) ??
            row.createdAt.toISOString(),
        ),
        description:
          ((raw.metadata as Record<string, unknown>)?.description as string) ?? '',
      },
    };
  }

  private rowToInstance(row: StateMachineInstanceRow): StateMachineInstance {
    return {
      id: row.id,
      definitionId: row.definitionId,
      entityId: row.entityId,
      tenantId: row.tenantId,
      currentState: row.currentState,
      data: row.data,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private appendTransitionRecord(
    instanceId: string,
    record: TransitionRecord,
  ): void {
    const existing = this.transitionHistory.get(instanceId) ?? [];
    existing.push(record);
    this.transitionHistory.set(instanceId, existing);
  }

  /**
   * Attempt to find an instance by ID.
   * In a real implementation, we'd have tenant context from the request.
   * For now, try 'system' tenant.
   */
  private async findInstanceAcrossTenants(
    instanceId: string,
  ): Promise<StateMachineInstanceRow | null> {
    return this.instanceRepo.findById('system', instanceId);
  }
}
