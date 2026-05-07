/**
 * Unit tests for Lambda event handlers.
 *
 * Tests cover:
 * - Each handler processes valid events correctly
 * - Idempotency (duplicate events are safely ignored)
 * - Error handling (malformed events don't crash the handler)
 * - Partial batch failure reporting
 * - Audit handler delegates to correct XOAuditService methods
 * - Memory handler delegates to correct ZikaronService methods
 * - Workflow handler calls StateMachineEngine.transition()
 * - Alert handler logs alerts with proper formatting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuditHandler } from './audit-handler.js';
import { createMemoryHandler } from './memory-handler.js';
import { createAlertHandler } from './alert-handler.js';
import { createWorkflowHandler } from './workflow-handler.js';
import type { SQSEvent, SQSBatchResponse } from './audit-handler.js';
import type { SeraphimEvent } from '@seraphim/core';
import type { FormattedAlert } from './alert-handler.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeSeraphimEvent(overrides: Partial<SeraphimEvent> = {}): SeraphimEvent {
  return {
    id: 'evt-001',
    source: 'seraphim.test',
    type: 'test.event',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'tenant-1',
    correlationId: 'corr-001',
    detail: {},
    metadata: { schemaVersion: '1.0', producerVersion: '0.1.0' },
    ...overrides,
  };
}

function makeSQSEvent(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map((body, i) => ({
      messageId: `msg-${i}`,
      body,
    })),
  };
}

function makeSQSEventFromEvents(events: SeraphimEvent[]): SQSEvent {
  return makeSQSEvent(events.map((e) => JSON.stringify(e)));
}

// ---------------------------------------------------------------------------
// Mock Services
// ---------------------------------------------------------------------------

function createMockAuditService() {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: '', chainLength: 0 }),
  };
}

function createMockMemoryService() {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('mem-id-1'),
    storeSemantic: vi.fn().mockResolvedValue('mem-id-2'),
    storeProcedural: vi.fn().mockResolvedValue('mem-id-3'),
    storeWorking: vi.fn().mockResolvedValue('mem-id-4'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: '',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockStateMachineEngine() {
  return {
    register: vi.fn().mockResolvedValue('def-id'),
    update: vi.fn().mockResolvedValue(undefined),
    createInstance: vi.fn().mockResolvedValue({
      id: 'inst-1',
      definitionId: 'def-1',
      entityId: 'entity-1',
      tenantId: 'tenant-1',
      currentState: 'initial',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    transition: vi.fn().mockResolvedValue({
      success: true,
      previousState: 'initial',
      newState: 'active',
      gateResults: [],
      auditId: 'audit-1',
    }),
    getState: vi.fn(),
    listInstances: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
  };
}

// ===========================================================================
// Audit Handler Tests
// ===========================================================================

describe('Audit Handler', () => {
  let auditService: ReturnType<typeof createMockAuditService>;
  let handler: (event: SQSEvent) => Promise<SQSBatchResponse>;

  beforeEach(() => {
    auditService = createMockAuditService();
    handler = createAuditHandler({ auditService });
  });

  it('processes a valid action audit event', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-action-1',
      type: 'audit.action',
      detail: {
        tenantId: 'tenant-1',
        actingAgentId: 'agent-1',
        actingAgentName: 'TestAgent',
        actionType: 'file.write',
        target: '/data/output.json',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: { size: 1024 },
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(auditService.recordAction).toHaveBeenCalledOnce();
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actingAgentId: 'agent-1',
        actionType: 'file.write',
        outcome: 'success',
      }),
    );
  });

  it('delegates governance audit events to recordGovernanceDecision', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-gov-1',
      type: 'audit.governance',
      detail: {
        auditType: 'governance',
        tenantId: 'tenant-1',
        actingAgentId: 'agent-1',
        actingAgentName: 'GovAgent',
        actionType: 'authorization.check',
        target: 'resource-1',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        governanceType: 'authorization',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(auditService.recordGovernanceDecision).toHaveBeenCalledOnce();
    expect(auditService.recordGovernanceDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        governanceType: 'authorization',
      }),
    );
  });

  it('delegates transition audit events to recordStateTransition', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-trans-1',
      type: 'audit.transition',
      detail: {
        auditType: 'transition',
        tenantId: 'tenant-1',
        actingAgentId: 'agent-1',
        actingAgentName: 'SMAgent',
        actionType: 'state_transition',
        target: 'instance-1',
        authorizationChain: [],
        executionTokens: [],
        outcome: 'success',
        details: {},
        stateMachineId: 'sm-1',
        instanceId: 'instance-1',
        previousState: 'draft',
        newState: 'active',
        gateResults: [],
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(auditService.recordStateTransition).toHaveBeenCalledOnce();
    expect(auditService.recordStateTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        stateMachineId: 'sm-1',
        previousState: 'draft',
        newState: 'active',
      }),
    );
  });

  it('skips duplicate events (idempotency)', async () => {
    const processedEventIds = new Set<string>();
    const idempotentHandler = createAuditHandler({ auditService, processedEventIds });

    const event = makeSeraphimEvent({ id: 'evt-dup-1', detail: { outcome: 'success' } });
    const sqsEvent = makeSQSEventFromEvents([event, event]);

    const result = await idempotentHandler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(auditService.recordAction).toHaveBeenCalledOnce();
  });

  it('handles malformed JSON gracefully with partial batch failure', async () => {
    const validEvent = makeSeraphimEvent({ id: 'evt-valid-1', detail: { outcome: 'success' } });
    const sqsEvent = makeSQSEvent([
      'not-valid-json',
      JSON.stringify(validEvent),
    ]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
    expect(auditService.recordAction).toHaveBeenCalledOnce();
  });

  it('reports partial batch failures when service throws', async () => {
    auditService.recordAction.mockRejectedValueOnce(new Error('DynamoDB error'));

    const event1 = makeSeraphimEvent({ id: 'evt-fail-1', detail: { outcome: 'success' } });
    const event2 = makeSeraphimEvent({ id: 'evt-ok-1', detail: { outcome: 'success' } });
    const sqsEvent = makeSQSEventFromEvents([event1, event2]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
    // Second event should still be processed
    expect(auditService.recordAction).toHaveBeenCalledTimes(2);
  });

  it('handles events missing required fields', async () => {
    const sqsEvent = makeSQSEvent([
      JSON.stringify({ id: 'evt-1' }), // missing type and detail
    ]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(auditService.recordAction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Memory Handler Tests
// ===========================================================================

describe('Memory Handler', () => {
  let memoryService: ReturnType<typeof createMockMemoryService>;
  let handler: (event: SQSEvent) => Promise<SQSBatchResponse>;

  beforeEach(() => {
    memoryService = createMockMemoryService();
    handler = createMemoryHandler({ memoryService });
  });

  it('stores episodic memory entries', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-ep-1',
      type: 'memory.episodic.store',
      detail: {
        layer: 'episodic',
        content: 'Agent completed task successfully',
        sourceAgentId: 'agent-1',
        tenantId: 'tenant-1',
        eventType: 'task.completed',
        participants: ['agent-1', 'agent-2'],
        outcome: 'success',
        tags: ['task', 'completion'],
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(memoryService.storeEpisodic).toHaveBeenCalledOnce();
    expect(memoryService.storeEpisodic).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'episodic',
        content: 'Agent completed task successfully',
        eventType: 'task.completed',
        participants: ['agent-1', 'agent-2'],
      }),
    );
  });

  it('stores semantic memory entries', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-sem-1',
      type: 'memory.semantic.store',
      detail: {
        layer: 'semantic',
        content: 'User prefers dark mode',
        sourceAgentId: 'agent-1',
        tenantId: 'tenant-1',
        entityType: 'preference',
        confidence: 0.9,
        source: 'extracted',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(memoryService.storeSemantic).toHaveBeenCalledOnce();
    expect(memoryService.storeSemantic).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'semantic',
        entityType: 'preference',
        confidence: 0.9,
      }),
    );
  });

  it('stores procedural memory entries', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-proc-1',
      type: 'memory.procedural.store',
      detail: {
        layer: 'procedural',
        content: 'Deploy workflow pattern',
        sourceAgentId: 'agent-1',
        tenantId: 'tenant-1',
        workflowPattern: 'deploy-and-verify',
        successRate: 0.95,
        executionCount: 10,
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(memoryService.storeProcedural).toHaveBeenCalledOnce();
    expect(memoryService.storeProcedural).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'procedural',
        workflowPattern: 'deploy-and-verify',
        successRate: 0.95,
      }),
    );
  });

  it('stores working memory entries', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-work-1',
      type: 'memory.working.store',
      detail: {
        layer: 'working',
        content: 'Current task context',
        agentId: 'agent-1',
        sourceAgentId: 'agent-1',
        tenantId: 'tenant-1',
        sessionId: 'session-1',
        taskContext: { step: 3 },
        activeGoals: ['complete-deployment'],
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(memoryService.storeWorking).toHaveBeenCalledOnce();
    expect(memoryService.storeWorking).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        layer: 'working',
        sessionId: 'session-1',
        activeGoals: ['complete-deployment'],
      }),
    );
  });

  it('infers episodic layer from event type when layer not specified', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-infer-1',
      type: 'memory.episodic.created',
      detail: {
        content: 'Something happened',
        tenantId: 'tenant-1',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(memoryService.storeEpisodic).toHaveBeenCalledOnce();
  });

  it('skips duplicate events (idempotency)', async () => {
    const processedEventIds = new Set<string>();
    const idempotentHandler = createMemoryHandler({ memoryService, processedEventIds });

    const event = makeSeraphimEvent({
      id: 'evt-dup-mem-1',
      type: 'memory.episodic.store',
      detail: { layer: 'episodic', content: 'test', tenantId: 'tenant-1' },
    });

    const sqsEvent = makeSQSEventFromEvents([event, event]);
    const result = await idempotentHandler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(memoryService.storeEpisodic).toHaveBeenCalledOnce();
  });

  it('handles malformed JSON gracefully', async () => {
    const sqsEvent = makeSQSEvent(['invalid-json']);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
  });

  it('reports partial batch failures', async () => {
    memoryService.storeEpisodic.mockRejectedValueOnce(new Error('DB error'));

    const event1 = makeSeraphimEvent({
      id: 'evt-fail-mem-1',
      type: 'memory.episodic.store',
      detail: { layer: 'episodic', content: 'fail', tenantId: 'tenant-1' },
    });
    const event2 = makeSeraphimEvent({
      id: 'evt-ok-mem-1',
      type: 'memory.episodic.store',
      detail: { layer: 'episodic', content: 'ok', tenantId: 'tenant-1' },
    });

    const result = await handler(makeSQSEventFromEvents([event1, event2]));

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
  });
});

// ===========================================================================
// Alert Handler Tests
// ===========================================================================

describe('Alert Handler', () => {
  let deliverAlert: ReturnType<typeof vi.fn<(alert: FormattedAlert) => Promise<void>>>;
  let handler: (event: SQSEvent) => Promise<SQSBatchResponse>;

  beforeEach(() => {
    deliverAlert = vi.fn<(alert: FormattedAlert) => Promise<void>>().mockResolvedValue(undefined);
    handler = createAlertHandler({ deliverAlert });
  });

  it('processes a valid alert event and delivers it', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-alert-1',
      type: 'alert.budget.exceeded',
      source: 'seraphim.otzar',
      detail: {
        severity: 'high',
        title: 'Budget Exceeded',
        message: 'Agent agent-1 exceeded daily budget',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(deliverAlert).toHaveBeenCalledOnce();
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'evt-alert-1',
        severity: 'high',
        title: 'Budget Exceeded',
        message: 'Agent agent-1 exceeded daily budget',
        source: 'seraphim.otzar',
      }),
    );
  });

  it('defaults severity to info when not specified', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-alert-nosev',
      type: 'alert.info',
      detail: {
        title: 'Info Alert',
        message: 'Something informational',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info' }),
    );
  });

  it('formats alert title from event type when title not in detail', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-alert-notitle',
      type: 'alert.system.error',
      detail: {
        severity: 'critical',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '[CRITICAL] alert.system.error',
      }),
    );
  });

  it('uses default console logging when no deliverAlert provided', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const defaultHandler = createAlertHandler();

    const event = makeSeraphimEvent({
      id: 'evt-alert-default',
      type: 'alert.test',
      detail: {
        severity: 'medium',
        title: 'Test Alert',
        message: 'Testing default delivery',
      },
    });

    const result = await defaultHandler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[MEDIUM]'),
    );

    consoleSpy.mockRestore();
  });

  it('skips duplicate events (idempotency)', async () => {
    const processedEventIds = new Set<string>();
    const idempotentHandler = createAlertHandler({ deliverAlert, processedEventIds });

    const event = makeSeraphimEvent({
      id: 'evt-dup-alert',
      type: 'alert.test',
      detail: { severity: 'low', title: 'Dup', message: 'dup' },
    });

    const sqsEvent = makeSQSEventFromEvents([event, event]);
    const result = await idempotentHandler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(deliverAlert).toHaveBeenCalledOnce();
  });

  it('handles malformed JSON gracefully', async () => {
    const sqsEvent = makeSQSEvent(['not-json']);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(deliverAlert).not.toHaveBeenCalled();
  });

  it('reports partial batch failures', async () => {
    deliverAlert.mockRejectedValueOnce(new Error('Delivery failed'));

    const event1 = makeSeraphimEvent({
      id: 'evt-alert-fail',
      type: 'alert.test',
      detail: { severity: 'high', title: 'Fail', message: 'fail' },
    });
    const event2 = makeSeraphimEvent({
      id: 'evt-alert-ok',
      type: 'alert.test',
      detail: { severity: 'low', title: 'OK', message: 'ok' },
    });

    const result = await handler(makeSQSEventFromEvents([event1, event2]));

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
  });
});

// ===========================================================================
// Workflow Handler Tests
// ===========================================================================

describe('Workflow Handler', () => {
  let stateMachineEngine: ReturnType<typeof createMockStateMachineEngine>;
  let handler: (event: SQSEvent) => Promise<SQSBatchResponse>;

  beforeEach(() => {
    stateMachineEngine = createMockStateMachineEngine();
    handler = createWorkflowHandler({ stateMachineEngine });
  });

  it('triggers a state machine transition for a valid workflow event', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-wf-1',
      type: 'workflow.transition',
      detail: {
        instanceId: 'inst-1',
        event: 'approve',
        triggeredBy: 'agent-1',
        tenantId: 'tenant-1',
        data: { reason: 'all checks passed' },
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(stateMachineEngine.transition).toHaveBeenCalledOnce();
    expect(stateMachineEngine.transition).toHaveBeenCalledWith(
      'inst-1',
      'approve',
      expect.objectContaining({
        triggeredBy: 'agent-1',
        tenantId: 'tenant-1',
        data: { reason: 'all checks passed' },
      }),
    );
  });

  it('handles rejected transitions without failing the batch', async () => {
    stateMachineEngine.transition.mockResolvedValueOnce({
      success: false,
      previousState: 'draft',
      newState: 'draft',
      gateResults: [],
      rejectionReason: 'Gate check failed',
      auditId: 'audit-rej-1',
    });

    const event = makeSeraphimEvent({
      id: 'evt-wf-rej',
      type: 'workflow.transition',
      detail: {
        instanceId: 'inst-1',
        event: 'submit',
        triggeredBy: 'agent-1',
        tenantId: 'tenant-1',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    // Rejected transitions are not failures — the handler processed the event
    expect(result.batchItemFailures).toHaveLength(0);
    expect(stateMachineEngine.transition).toHaveBeenCalledOnce();
  });

  it('fails when required fields are missing', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-wf-missing',
      type: 'workflow.transition',
      detail: {
        // Missing instanceId and event
        triggeredBy: 'agent-1',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(1);
    expect(stateMachineEngine.transition).not.toHaveBeenCalled();
  });

  it('uses transitionEvent field as fallback for event field', async () => {
    const event = makeSeraphimEvent({
      id: 'evt-wf-alt',
      type: 'workflow.transition',
      detail: {
        instanceId: 'inst-1',
        transitionEvent: 'start',
        triggeredBy: 'agent-1',
        tenantId: 'tenant-1',
      },
    });

    const result = await handler(makeSQSEventFromEvents([event]));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(stateMachineEngine.transition).toHaveBeenCalledWith(
      'inst-1',
      'start',
      expect.anything(),
    );
  });

  it('skips duplicate events (idempotency)', async () => {
    const processedEventIds = new Set<string>();
    const idempotentHandler = createWorkflowHandler({ stateMachineEngine, processedEventIds });

    const event = makeSeraphimEvent({
      id: 'evt-dup-wf',
      type: 'workflow.transition',
      detail: {
        instanceId: 'inst-1',
        event: 'approve',
        triggeredBy: 'agent-1',
        tenantId: 'tenant-1',
      },
    });

    const sqsEvent = makeSQSEventFromEvents([event, event]);
    const result = await idempotentHandler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(stateMachineEngine.transition).toHaveBeenCalledOnce();
  });

  it('handles malformed JSON gracefully', async () => {
    const sqsEvent = makeSQSEvent(['{{bad json']);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(stateMachineEngine.transition).not.toHaveBeenCalled();
  });

  it('reports partial batch failures when engine throws', async () => {
    stateMachineEngine.transition.mockRejectedValueOnce(new Error('Instance not found'));

    const event1 = makeSeraphimEvent({
      id: 'evt-wf-err',
      type: 'workflow.transition',
      detail: { instanceId: 'bad-inst', event: 'go', triggeredBy: 'a', tenantId: 't' },
    });
    const event2 = makeSeraphimEvent({
      id: 'evt-wf-ok',
      type: 'workflow.transition',
      detail: { instanceId: 'inst-1', event: 'go', triggeredBy: 'a', tenantId: 't' },
    });

    const result = await handler(makeSQSEventFromEvents([event1, event2]));

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
    expect(stateMachineEngine.transition).toHaveBeenCalledTimes(2);
  });
});
