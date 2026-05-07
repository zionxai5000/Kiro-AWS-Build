import { describe, it, expect } from 'vitest';

import {
  AgentProgramSchema,
  isAgentProgram,
  validateAgentProgram,
  ToolDefinitionSchema,
  TestSuiteReferenceSchema,
  ModelPreferenceSchema,
  AuthorityLevelSchema,
  SemverSchema,
} from './agent-program.validator.js';

import {
  StateMachineDefinitionSchema,
  isStateMachineDefinition,
  validateStateMachineDefinition,
  StateDefinitionSchema,
  GateDefinitionSchema,
  TransitionDefinitionSchema,
} from './state-machine.validator.js';

import {
  SeraphimEventSchema,
  SystemEventSchema,
  isSeraphimEvent,
  isSystemEvent,
  validateSeraphimEvent,
  validateSystemEvent,
} from './event.validator.js';

// ===========================================================================
// Test Fixtures
// ===========================================================================

function validStateMachineDefinition() {
  return {
    id: 'sm-001',
    name: 'agent-lifecycle',
    version: '1.0.0',
    states: {
      idle: { name: 'idle', type: 'initial' as string },
      running: { name: 'running', type: 'active' as string },
      done: { name: 'done', type: 'terminal' as string },
    } as Record<string, { name: string; type: string; timeout?: { duration: number; transitionTo: string } }>,
    initialState: 'idle',
    terminalStates: ['done'],
    transitions: [
      {
        from: 'idle',
        to: 'running',
        event: 'start',
        gates: [
          {
            id: 'g1',
            name: 'budget-check',
            type: 'condition' as const,
            config: { minBudget: 100 },
            required: true,
          },
        ],
      },
      {
        from: 'running',
        to: 'done',
        event: 'complete',
        gates: [],
      },
    ],
    metadata: {
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      description: 'Agent lifecycle state machine',
    },
  };
}

function validAgentProgram() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'zionx-builder',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are the ZionX app builder agent.',
    tools: [
      {
        name: 'build-app',
        description: 'Builds an app from a template',
        inputSchema: { type: 'object', properties: { template: { type: 'string' } } },
      },
    ],
    stateMachine: validStateMachineDefinition(),
    completionContracts: [
      { id: 'cc-1', workflowType: 'app-build', version: '1.0' },
    ],
    authorityLevel: 'L3' as const,
    allowedActions: ['build', 'test', 'submit'],
    deniedActions: ['delete-production'],
    modelPreference: {
      preferred: 'claude-sonnet-4-20250514',
      fallback: 'gpt-4o',
      costCeiling: 0.5,
    },
    tokenBudget: { daily: 100000, monthly: 2000000 },
    testSuite: {
      suiteId: 'ts-001',
      path: 'tests/zionx-builder.test.ts',
      requiredCoverage: 80,
    },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
    createdBy: 'king',
    changelog: [
      {
        version: '1.0.0',
        date: new Date('2026-01-01'),
        author: 'king',
        description: 'Initial release',
      },
    ],
  };
}

function validSeraphimEvent() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'seraphim.agent-runtime',
    type: 'agent.state.changed',
    version: '1.0' as const,
    time: '2026-01-15T10:30:00.000Z',
    tenantId: '660e8400-e29b-41d4-a716-446655440001',
    correlationId: '770e8400-e29b-41d4-a716-446655440002',
    detail: { agentId: 'agent-1', previousState: 'ready', newState: 'executing' },
    metadata: {
      schemaVersion: '1.0.0',
      producerVersion: '0.1.0',
    },
  };
}

function validSystemEvent() {
  return {
    source: 'agent-runtime',
    type: 'agent.deployed',
    detail: { agentId: 'agent-1' },
    metadata: {
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: '660e8400-e29b-41d4-a716-446655440001',
      timestamp: new Date('2026-01-15T10:30:00Z'),
    },
  };
}

// ===========================================================================
// AgentProgram Validation Tests
// ===========================================================================

describe('AgentProgram Validation', () => {
  describe('AgentProgramSchema', () => {
    it('accepts a valid AgentProgram', () => {
      const result = AgentProgramSchema.safeParse(validAgentProgram());
      expect(result.success).toBe(true);
    });

    it('rejects when id is not a UUID', () => {
      const program = { ...validAgentProgram(), id: 'not-a-uuid' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('id'))).toBe(true);
      }
    });

    it('rejects when name is empty', () => {
      const program = { ...validAgentProgram(), name: '' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('rejects when version is not valid semver', () => {
      const program = { ...validAgentProgram(), version: 'not-semver' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('accepts valid semver with pre-release', () => {
      const program = { ...validAgentProgram(), version: '1.0.0-beta.1' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(true);
    });

    it('rejects when pillar is empty', () => {
      const program = { ...validAgentProgram(), pillar: '' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('rejects when systemPrompt is empty', () => {
      const program = { ...validAgentProgram(), systemPrompt: '' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('rejects when authorityLevel is invalid', () => {
      const program = { ...validAgentProgram(), authorityLevel: 'L5' };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('rejects when tokenBudget.daily is negative', () => {
      const program = { ...validAgentProgram(), tokenBudget: { daily: -1, monthly: 100 } };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('rejects when tools array contains invalid tool', () => {
      const program = {
        ...validAgentProgram(),
        tools: [{ name: '', description: 'x', inputSchema: {} }],
      };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(false);
    });

    it('rejects when required fields are missing', () => {
      const result = AgentProgramSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('coerces date strings to Date objects', () => {
      const program = {
        ...validAgentProgram(),
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-15T00:00:00Z',
      };
      const result = AgentProgramSchema.safeParse(program);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('isAgentProgram type guard', () => {
    it('returns true for valid AgentProgram', () => {
      expect(isAgentProgram(validAgentProgram())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isAgentProgram(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isAgentProgram(undefined)).toBe(false);
    });

    it('returns false for a plain string', () => {
      expect(isAgentProgram('hello')).toBe(false);
    });

    it('returns false for a number', () => {
      expect(isAgentProgram(42)).toBe(false);
    });

    it('returns false for an empty object', () => {
      expect(isAgentProgram({})).toBe(false);
    });

    it('returns false for a partial AgentProgram', () => {
      expect(isAgentProgram({ id: '550e8400-e29b-41d4-a716-446655440000', name: 'test' })).toBe(
        false,
      );
    });
  });

  describe('validateAgentProgram', () => {
    it('returns success with parsed data for valid input', () => {
      const result = validateAgentProgram(validAgentProgram());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('zionx-builder');
      }
    });

    it('returns error with detailed issues for invalid input', () => {
      const result = validateAgentProgram({ id: 'bad' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        // Should report multiple missing fields
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('name');
      }
    });
  });

  describe('Sub-schema validation', () => {
    describe('ToolDefinitionSchema', () => {
      it('accepts valid tool definition', () => {
        const result = ToolDefinitionSchema.safeParse({
          name: 'my-tool',
          description: 'Does something',
          inputSchema: { type: 'object' },
        });
        expect(result.success).toBe(true);
      });

      it('rejects tool with empty name', () => {
        const result = ToolDefinitionSchema.safeParse({
          name: '',
          description: 'Does something',
          inputSchema: {},
        });
        expect(result.success).toBe(false);
      });
    });

    describe('TestSuiteReferenceSchema', () => {
      it('accepts valid test suite reference', () => {
        const result = TestSuiteReferenceSchema.safeParse({
          suiteId: 'ts-001',
          path: 'tests/my.test.ts',
          requiredCoverage: 80,
        });
        expect(result.success).toBe(true);
      });

      it('rejects coverage above 100', () => {
        const result = TestSuiteReferenceSchema.safeParse({
          suiteId: 'ts-001',
          path: 'tests/my.test.ts',
          requiredCoverage: 101,
        });
        expect(result.success).toBe(false);
      });

      it('rejects negative coverage', () => {
        const result = TestSuiteReferenceSchema.safeParse({
          suiteId: 'ts-001',
          path: 'tests/my.test.ts',
          requiredCoverage: -5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('ModelPreferenceSchema', () => {
      it('accepts valid model preference', () => {
        const result = ModelPreferenceSchema.safeParse({
          preferred: 'claude-sonnet-4-20250514',
          fallback: 'gpt-4o',
          costCeiling: 0.5,
        });
        expect(result.success).toBe(true);
      });

      it('rejects zero cost ceiling', () => {
        const result = ModelPreferenceSchema.safeParse({
          preferred: 'claude-sonnet-4-20250514',
          fallback: 'gpt-4o',
          costCeiling: 0,
        });
        expect(result.success).toBe(false);
      });

      it('rejects negative cost ceiling', () => {
        const result = ModelPreferenceSchema.safeParse({
          preferred: 'claude-sonnet-4-20250514',
          fallback: 'gpt-4o',
          costCeiling: -1,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('AuthorityLevelSchema', () => {
      it.each(['L1', 'L2', 'L3', 'L4'])('accepts %s', (level) => {
        expect(AuthorityLevelSchema.safeParse(level).success).toBe(true);
      });

      it.each(['L0', 'L5', 'l1', '', 'admin'])('rejects %s', (level) => {
        expect(AuthorityLevelSchema.safeParse(level).success).toBe(false);
      });
    });

    describe('SemverSchema', () => {
      it.each(['0.0.1', '1.0.0', '2.3.4', '1.0.0-alpha', '1.0.0-beta.1', '1.0.0+build.123'])(
        'accepts %s',
        (v) => {
          expect(SemverSchema.safeParse(v).success).toBe(true);
        },
      );

      it.each(['1', '1.0', 'v1.0.0', '1.0.0.0', 'latest', ''])('rejects %s', (v) => {
        expect(SemverSchema.safeParse(v).success).toBe(false);
      });
    });
  });
});


// ===========================================================================
// StateMachineDefinition Validation Tests
// ===========================================================================

describe('StateMachineDefinition Validation', () => {
  describe('StateMachineDefinitionSchema', () => {
    it('accepts a valid StateMachineDefinition', () => {
      const result = StateMachineDefinitionSchema.safeParse(validStateMachineDefinition());
      expect(result.success).toBe(true);
    });

    it('rejects when id is empty', () => {
      const sm = { ...validStateMachineDefinition(), id: '' };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
    });

    it('rejects when name is empty', () => {
      const sm = { ...validStateMachineDefinition(), name: '' };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
    });

    it('rejects when states is empty', () => {
      const sm = { ...validStateMachineDefinition(), states: {} };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
      // Should fail because initialState references a non-existent state
    });

    it('rejects when initialState references non-existent state', () => {
      const sm = { ...validStateMachineDefinition(), initialState: 'nonexistent' };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('nonexistent'))).toBe(true);
      }
    });

    it('rejects when terminalStates references non-existent state', () => {
      const sm = { ...validStateMachineDefinition(), terminalStates: ['nonexistent'] };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('nonexistent'))).toBe(true);
      }
    });

    it('rejects when terminalStates is empty', () => {
      const sm = { ...validStateMachineDefinition(), terminalStates: [] };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
    });

    it('rejects when transition.from references non-existent state', () => {
      const sm = validStateMachineDefinition();
      sm.transitions = [
        { from: 'nonexistent', to: 'running', event: 'start', gates: [] },
      ];
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('nonexistent'))).toBe(true);
      }
    });

    it('rejects when transition.to references non-existent state', () => {
      const sm = validStateMachineDefinition();
      sm.transitions = [
        { from: 'idle', to: 'nonexistent', event: 'start', gates: [] },
      ];
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
    });

    it('warns when initialState type is not "initial"', () => {
      const sm = validStateMachineDefinition();
      sm.states['idle'] = { name: 'idle', type: 'active' };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('should have type "initial"'))).toBe(true);
      }
    });

    it('warns when terminalState type is not "terminal"', () => {
      const sm = validStateMachineDefinition();
      sm.states['done'] = { name: 'done', type: 'active' };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('should have type "terminal"'))).toBe(true);
      }
    });

    it('accepts state machine with multiple terminal states', () => {
      const sm = validStateMachineDefinition();
      sm.states['failed'] = { name: 'failed', type: 'terminal' };
      sm.terminalStates = ['done', 'failed'];
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(true);
    });

    it('accepts state machine with timeout on state', () => {
      const sm = validStateMachineDefinition();
      sm.states['running'] = {
        name: 'running',
        type: 'active',
        timeout: { duration: 30000, transitionTo: 'done' },
      };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(true);
    });

    it('rejects state with non-positive timeout duration', () => {
      const sm = validStateMachineDefinition();
      sm.states['running'] = {
        name: 'running',
        type: 'active',
        timeout: { duration: 0, transitionTo: 'done' },
      };
      const result = StateMachineDefinitionSchema.safeParse(sm);
      expect(result.success).toBe(false);
    });
  });

  describe('isStateMachineDefinition type guard', () => {
    it('returns true for valid StateMachineDefinition', () => {
      expect(isStateMachineDefinition(validStateMachineDefinition())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isStateMachineDefinition(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isStateMachineDefinition(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isStateMachineDefinition({})).toBe(false);
    });

    it('returns false for array', () => {
      expect(isStateMachineDefinition([])).toBe(false);
    });
  });

  describe('validateStateMachineDefinition', () => {
    it('returns success with parsed data for valid input', () => {
      const result = validateStateMachineDefinition(validStateMachineDefinition());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('agent-lifecycle');
        expect(result.data.initialState).toBe('idle');
      }
    });

    it('returns detailed errors for invalid input', () => {
      const result = validateStateMachineDefinition({ id: '', states: {} });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Sub-schema validation', () => {
    describe('StateDefinitionSchema', () => {
      it('accepts valid state definition', () => {
        const result = StateDefinitionSchema.safeParse({
          name: 'idle',
          type: 'initial',
        });
        expect(result.success).toBe(true);
      });

      it('accepts state with onEnter/onExit actions', () => {
        const result = StateDefinitionSchema.safeParse({
          name: 'running',
          type: 'active',
          onEnter: [{ type: 'log', config: { message: 'entered' } }],
          onExit: [{ type: 'cleanup', config: {} }],
        });
        expect(result.success).toBe(true);
      });

      it('rejects invalid state type', () => {
        const result = StateDefinitionSchema.safeParse({
          name: 'idle',
          type: 'invalid',
        });
        expect(result.success).toBe(false);
      });

      it('rejects empty name', () => {
        const result = StateDefinitionSchema.safeParse({
          name: '',
          type: 'initial',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('GateDefinitionSchema', () => {
      it('accepts valid gate definition', () => {
        const result = GateDefinitionSchema.safeParse({
          id: 'g1',
          name: 'budget-check',
          type: 'condition',
          config: { minBudget: 100 },
          required: true,
        });
        expect(result.success).toBe(true);
      });

      it.each(['condition', 'approval', 'validation', 'external'])(
        'accepts gate type %s',
        (type) => {
          const result = GateDefinitionSchema.safeParse({
            id: 'g1',
            name: 'test',
            type,
            config: {},
            required: true,
          });
          expect(result.success).toBe(true);
        },
      );

      it('rejects invalid gate type', () => {
        const result = GateDefinitionSchema.safeParse({
          id: 'g1',
          name: 'test',
          type: 'invalid',
          config: {},
          required: true,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('TransitionDefinitionSchema', () => {
      it('accepts valid transition', () => {
        const result = TransitionDefinitionSchema.safeParse({
          from: 'idle',
          to: 'running',
          event: 'start',
          gates: [],
        });
        expect(result.success).toBe(true);
      });

      it('accepts transition with gates and actions', () => {
        const result = TransitionDefinitionSchema.safeParse({
          from: 'idle',
          to: 'running',
          event: 'start',
          gates: [
            { id: 'g1', name: 'check', type: 'condition', config: {}, required: true },
          ],
          actions: [{ type: 'notify', config: { channel: 'slack' } }],
        });
        expect(result.success).toBe(true);
      });

      it('rejects transition with empty from', () => {
        const result = TransitionDefinitionSchema.safeParse({
          from: '',
          to: 'running',
          event: 'start',
          gates: [],
        });
        expect(result.success).toBe(false);
      });

      it('rejects transition with empty event', () => {
        const result = TransitionDefinitionSchema.safeParse({
          from: 'idle',
          to: 'running',
          event: '',
          gates: [],
        });
        expect(result.success).toBe(false);
      });
    });
  });
});

// ===========================================================================
// SeraphimEvent Validation Tests
// ===========================================================================

describe('SeraphimEvent Validation', () => {
  describe('SeraphimEventSchema', () => {
    it('accepts a valid SeraphimEvent', () => {
      const result = SeraphimEventSchema.safeParse(validSeraphimEvent());
      expect(result.success).toBe(true);
    });

    it('rejects when id is not a UUID', () => {
      const event = { ...validSeraphimEvent(), id: 'not-a-uuid' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when source does not start with "seraphim."', () => {
      const event = { ...validSeraphimEvent(), source: 'other.service' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes('seraphim.'))).toBe(true);
      }
    });

    it('accepts source with nested namespaces', () => {
      const event = { ...validSeraphimEvent(), source: 'seraphim.services.memory' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects when type is not dot-separated lowercase', () => {
      const event = { ...validSeraphimEvent(), type: 'Agent.State.Changed' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('accepts valid dot-separated type', () => {
      const event = { ...validSeraphimEvent(), type: 'agent.lifecycle.terminated' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects when version is not "1.0"', () => {
      const event = { ...validSeraphimEvent(), version: '2.0' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when time is not ISO 8601', () => {
      const event = { ...validSeraphimEvent(), time: 'January 15, 2026' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('accepts time with timezone offset', () => {
      const event = { ...validSeraphimEvent(), time: '2026-01-15T10:30:00+05:30' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects when tenantId is not a UUID', () => {
      const event = { ...validSeraphimEvent(), tenantId: 'tenant-1' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when correlationId is not a UUID', () => {
      const event = { ...validSeraphimEvent(), correlationId: 'corr-1' };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when metadata.schemaVersion is empty', () => {
      const event = {
        ...validSeraphimEvent(),
        metadata: { schemaVersion: '', producerVersion: '0.1.0' },
      };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when metadata.producerVersion is empty', () => {
      const event = {
        ...validSeraphimEvent(),
        metadata: { schemaVersion: '1.0.0', producerVersion: '' },
      };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('accepts empty detail object', () => {
      const event = { ...validSeraphimEvent(), detail: {} };
      const result = SeraphimEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects when required fields are missing', () => {
      const result = SeraphimEventSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isSeraphimEvent type guard', () => {
    it('returns true for valid SeraphimEvent', () => {
      expect(isSeraphimEvent(validSeraphimEvent())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isSeraphimEvent(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSeraphimEvent(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isSeraphimEvent({})).toBe(false);
    });

    it('returns false for SystemEvent (different shape)', () => {
      expect(isSeraphimEvent(validSystemEvent())).toBe(false);
    });
  });

  describe('validateSeraphimEvent', () => {
    it('returns success with parsed data for valid input', () => {
      const result = validateSeraphimEvent(validSeraphimEvent());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('seraphim.agent-runtime');
        expect(result.data.type).toBe('agent.state.changed');
      }
    });

    it('returns detailed errors for invalid input', () => {
      const result = validateSeraphimEvent({ id: 'bad', source: 'bad' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });
});

// ===========================================================================
// SystemEvent Validation Tests
// ===========================================================================

describe('SystemEvent Validation', () => {
  describe('SystemEventSchema', () => {
    it('accepts a valid SystemEvent', () => {
      const result = SystemEventSchema.safeParse(validSystemEvent());
      expect(result.success).toBe(true);
    });

    it('rejects when source is empty', () => {
      const event = { ...validSystemEvent(), source: '' };
      const result = SystemEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when type is empty', () => {
      const event = { ...validSystemEvent(), type: '' };
      const result = SystemEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when metadata.tenantId is not a UUID', () => {
      const event = {
        ...validSystemEvent(),
        metadata: { ...validSystemEvent().metadata, tenantId: 'not-uuid' },
      };
      const result = SystemEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects when metadata.correlationId is not a UUID', () => {
      const event = {
        ...validSystemEvent(),
        metadata: { ...validSystemEvent().metadata, correlationId: 'not-uuid' },
      };
      const result = SystemEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('coerces timestamp string to Date', () => {
      const event = {
        ...validSystemEvent(),
        metadata: {
          ...validSystemEvent().metadata,
          timestamp: '2026-01-15T10:30:00Z',
        },
      };
      const result = SystemEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.timestamp).toBeInstanceOf(Date);
      }
    });

    it('accepts empty detail object', () => {
      const event = { ...validSystemEvent(), detail: {} };
      const result = SystemEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects when required fields are missing', () => {
      const result = SystemEventSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('isSystemEvent type guard', () => {
    it('returns true for valid SystemEvent', () => {
      expect(isSystemEvent(validSystemEvent())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isSystemEvent(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSystemEvent(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isSystemEvent({})).toBe(false);
    });
  });

  describe('validateSystemEvent', () => {
    it('returns success with parsed data for valid input', () => {
      const result = validateSystemEvent(validSystemEvent());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.source).toBe('agent-runtime');
      }
    });

    it('returns detailed errors for invalid input', () => {
      const result = validateSystemEvent({ source: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });
});
