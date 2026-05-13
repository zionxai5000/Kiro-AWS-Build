/**
 * Unit tests for the Agentic Execution Core (Phase 15).
 * Tests: Cognition Envelope, Planning Engine, Delegation Engine,
 * Autonomy Config, Execution Trace, Anti-Chatbot Guards.
 *
 * Requirements: 49-55, 19.1
 */
import { describe, it, expect } from 'vitest';
import { buildCognitionEnvelope, validateEnvelope, summarizeEnvelope } from './cognition-envelope.js';
import { createPlan, getReadySubtasks, completeSubtask, failSubtask } from './planning-engine.js';
import { createDelegationRequest, createDelegationSuccess, createDelegationFailure, canDelegate, aggregateResults } from './delegation-engine.js';
import { getEffectiveMode, requiresHumanGate, shouldEscalate, DEFAULT_AUTONOMY_CONFIGS } from './autonomy-config.js';
import { ExecutionTraceBuilder } from './execution-trace.js';
import { guardEnvelopeRequired, guardMemoryRetrieval, guardToolInvocation, guardHardcodedTool, runAllGuards, validateAgenticBehavior } from './anti-chatbot-guards.js';
import { MCPToolRegistry } from '../mcp/tool-registry.js';
import type { AgentProgram } from '../types/agent.js';

const mockProgram: AgentProgram = {
  id: 'test-agent', name: 'Test Agent', version: '1.0.0', pillar: 'test',
  systemPrompt: 'You are a test agent.',
  identityProfile: {
    name: 'TestBot', role: 'Test agent', hierarchyPosition: 'Test',
    personality: { tone: 'analytical', verbosity: 'concise', proactivity: 'proactive', formality: 'professional' },
    expertise: ['testing'], domainLanguage: ['test'], decisionPrinciples: ['Test first'],
    relationships: [{ agentId: 'other-agent', relationship: 'collaborates_with', description: 'Test' }],
    neverBreakCharacter: true, identityReinforcement: 'You are TestBot.',
  },
  tools: [], stateMachine: { id: 'sm', name: 'SM', version: '1.0.0', states: {}, initialState: 'idle', terminalStates: [], transitions: [], metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'test' } },
  completionContracts: [], authorityLevel: 'L3', allowedActions: ['test'], deniedActions: [],
  modelPreference: { preferred: 'gpt-4o', fallback: 'gpt-4o-mini', costCeiling: 1.0 },
  tokenBudget: { daily: 10000, monthly: 100000 },
  testSuite: { suiteId: 'test', path: 'test', requiredCoverage: 80 },
  createdAt: new Date(), updatedAt: new Date(), createdBy: 'test', changelog: [],
};

describe('Cognition Envelope', () => {
  it('should build a valid envelope with all components', () => {
    const envelope = buildCognitionEnvelope({
      agentId: 'agent-1',
      program: mockProgram,
      systemPrompt: 'Test prompt',
      conversationHistory: [{ role: 'user', content: 'hello' }],
      proceduralPatterns: ['Pattern 1'],
    });
    expect(envelope.agentId).toBe('agent-1');
    expect(envelope.systemPrompt).toBe('Test prompt');
    expect(envelope.authorityLevel).toBe('L3');
    expect(envelope.envelopeHash).toBeTruthy();
  });

  it('should track degraded components when data is missing', () => {
    const envelope = buildCognitionEnvelope({
      agentId: 'agent-1',
      program: mockProgram,
      systemPrompt: 'Test',
    });
    expect(envelope.degradedComponents).toContain('conversationHistory');
    expect(envelope.degradedComponents).toContain('proceduralPatterns');
  });

  it('should validate envelope requires systemPrompt and agentId', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    const result = validateEnvelope(envelope);
    expect(result.valid).toBe(true);
  });

  it('should produce different hashes for different envelopes', () => {
    const e1 = buildCognitionEnvelope({ agentId: 'agent-1', program: mockProgram, systemPrompt: 'Prompt A' });
    const e2 = buildCognitionEnvelope({ agentId: 'agent-2', program: mockProgram, systemPrompt: 'Prompt B' });
    expect(e1.envelopeHash).not.toBe(e2.envelopeHash);
  });

  it('should summarize envelope as readable string', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    const summary = summarizeEnvelope(envelope);
    expect(summary).toContain('TestBot');
    expect(summary).toContain('L3');
  });

  it('should include identity profile from program', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    expect(envelope.identityProfile).not.toBeNull();
    expect(envelope.identityProfile?.name).toBe('TestBot');
  });

  it('should set delegation policy from relationships', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    expect(envelope.delegationPolicy.allowedTargets).toContain('other-agent');
  });

  it('should default autonomy mode to walk', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    expect(envelope.autonomyMode).toBe('walk');
  });

  it('should respect explicit autonomy mode', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test', autonomyMode: 'run' });
    expect(envelope.autonomyMode).toBe('run');
  });
});

describe('Planning Engine', () => {
  it('should create a plan with subtasks', () => {
    const plan = createPlan('agent-1', 'Build an app', [
      { description: 'Research market', requiredTools: ['search'], requiredAgents: [], dependencies: [], risks: [], expectedOutput: 'report', budgetEstimate: 0.5, approvalRequired: false },
      { description: 'Design UI', requiredTools: ['figma'], requiredAgents: [], dependencies: [], risks: [], expectedOutput: 'mockups', budgetEstimate: 1.0, approvalRequired: false },
    ]);
    expect(plan.objective).toBe('Build an app');
    expect(plan.subtasks).toHaveLength(2);
    expect(plan.status).toBe('planning');
  });

  it('should identify ready subtasks (no unmet dependencies)', () => {
    const plan = createPlan('agent-1', 'Test', [
      { description: 'Step 1', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 0, approvalRequired: false },
      { description: 'Step 2', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 0, approvalRequired: false },
    ]);
    const ready = getReadySubtasks(plan);
    expect(ready.length).toBe(2); // Both have no dependencies
  });

  it('should respect dependencies when identifying ready subtasks', () => {
    const plan = createPlan('agent-1', 'Test', [
      { description: 'Step 1', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 0, approvalRequired: false },
    ]);
    const step1Id = plan.subtasks[0]!.id;
    plan.subtasks.push({
      id: 'step-2', description: 'Step 2', requiredTools: [], requiredAgents: [],
      dependencies: [step1Id], risks: [], expectedOutput: '', budgetEstimate: 0,
      approvalRequired: false, status: 'pending',
    });
    const ready = getReadySubtasks(plan);
    expect(ready.length).toBe(1);
    expect(ready[0]!.description).toBe('Step 1');
  });

  it('should complete subtasks and update status', () => {
    const plan = createPlan('agent-1', 'Test', [
      { description: 'Step 1', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 0, approvalRequired: false },
    ]);
    const updated = completeSubtask(plan, plan.subtasks[0]!.id, 'done');
    expect(updated.subtasks[0]!.status).toBe('completed');
    expect(updated.status).toBe('completed');
  });

  it('should fail subtasks and skip dependents', () => {
    const plan = createPlan('agent-1', 'Test', [
      { description: 'Step 1', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 0, approvalRequired: false },
    ]);
    const step1Id = plan.subtasks[0]!.id;
    plan.subtasks.push({
      id: 'step-2', description: 'Step 2', requiredTools: [], requiredAgents: [],
      dependencies: [step1Id], risks: [], expectedOutput: '', budgetEstimate: 0,
      approvalRequired: false, status: 'pending',
    });
    const updated = failSubtask(plan, step1Id, 'error occurred');
    expect(updated.subtasks[0]!.status).toBe('failed');
    expect(updated.subtasks[1]!.status).toBe('skipped');
  });

  it('should calculate total budget estimate', () => {
    const plan = createPlan('agent-1', 'Test', [
      { description: 'A', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 1.5, approvalRequired: false },
      { description: 'B', requiredTools: [], requiredAgents: [], dependencies: [], risks: [], expectedOutput: '', budgetEstimate: 2.5, approvalRequired: false },
    ]);
    expect(plan.totalBudgetEstimate).toBe(4.0);
  });
});

describe('Delegation Engine', () => {
  it('should create delegation requests', () => {
    const req = createDelegationRequest('agent-1', 'agent-2', 'Analyze data', { timeout: 5000 });
    expect(req.initiatingAgentId).toBe('agent-1');
    expect(req.targetAgentId).toBe('agent-2');
    expect(req.scope).toBe('Analyze data');
    expect(req.timeout).toBe(5000);
  });

  it('should check delegation authorization', () => {
    const allowedTargets = ['agent-2', 'agent-3'];
    expect(canDelegate('agent-1', 'agent-2', allowedTargets)).toBe(true);
    expect(canDelegate('agent-1', 'agent-99', allowedTargets)).toBe(false);
  });

  it('should create success results', () => {
    const req = createDelegationRequest('agent-1', 'agent-2', 'task');
    const result = createDelegationSuccess(req, { answer: 42 }, 1500);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ answer: 42 });
    expect(result.durationMs).toBe(1500);
  });

  it('should create failure results', () => {
    const req = createDelegationRequest('agent-1', 'agent-2', 'task');
    const result = createDelegationFailure(req, 'Timeout', 30000);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Timeout');
    expect(result.durationMs).toBe(30000);
  });

  it('should aggregate multiple results', () => {
    const req1 = createDelegationRequest('a1', 'a2', 'task1');
    const req2 = createDelegationRequest('a1', 'a3', 'task2');
    const results = [
      createDelegationSuccess(req1, 'output1', 100),
      createDelegationFailure(req2, 'error', 200),
    ];
    const agg = aggregateResults(results);
    expect(agg.allSucceeded).toBe(false);
    expect(agg.successCount).toBe(1);
    expect(agg.failureCount).toBe(1);
    expect(agg.outputs).toEqual(['output1']);
    expect(agg.errors).toHaveLength(1);
  });

  it('should default timeout to 30000ms', () => {
    const req = createDelegationRequest('a1', 'a2', 'scope');
    expect(req.timeout).toBe(30000);
  });
});

describe('Autonomy Config', () => {
  it('should return effective mode for an agent', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;
    expect(getEffectiveMode(config, 'general')).toBe('walk');
    expect(getEffectiveMode(config, 'app_submission')).toBe('walk');
    expect(getEffectiveMode(config, 'app_development')).toBe('run');
  });

  it('should return default mode when no workflow override', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['seraphim-core']!;
    expect(getEffectiveMode(config)).toBe('run');
  });

  it('should detect human gate requirements', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;
    expect(requiresHumanGate(config, 'app_submission', 'before_submission', 'walk')).toBe(true);
    expect(requiresHumanGate(config, 'app_submission', 'before_submission', 'run')).toBe(false);
  });

  it('should recommend promotion after consecutive successes', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;
    const result = shouldEscalate(config, 10, 0);
    expect(result.action).toBe('promote');
  });

  it('should recommend demotion after consecutive failures', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;
    const result = shouldEscalate(config, 0, 2);
    expect(result.action).toBe('demote');
  });

  it('should return none when within normal parameters', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;
    const result = shouldEscalate(config, 3, 0);
    expect(result.action).toBe('none');
  });

  it('should not require gate for non-matching workflow', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;
    expect(requiresHumanGate(config, 'unknown_workflow', 'before_submission', 'walk')).toBe(false);
  });
});

describe('Execution Trace', () => {
  it('should build a trace with steps', () => {
    const builder = new ExecutionTraceBuilder('agent-1', 'task-1', 'walk', 'abc123');
    builder.recordMemoryRetrieval({ layer: 'episodic', query: 'test query', resultCount: 5 });
    builder.recordGovernanceCheck({ check: 'authority', result: 'passed', reason: 'L3 sufficient' });
    builder.recordBudgetCheck({ estimated: 0.01, remaining: 9.99, approved: true });
    builder.recordToolInvocation({ tool: 'search', input: { q: 'test' }, output: { results: [] }, durationMs: 100, success: true });
    builder.recordAction('responded to user');
    const trace = builder.complete('Final answer', 'Used memory context', true);

    expect(trace.agentId).toBe('agent-1');
    expect(trace.memoryRetrieved).toHaveLength(1);
    expect(trace.governanceChecks).toHaveLength(1);
    expect(trace.toolsInvoked).toHaveLength(1);
    expect(trace.autonomyMode).toBe('walk');
    expect(trace.success).toBe(true);
    expect(trace.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should record plan generation', () => {
    const builder = new ExecutionTraceBuilder('agent-1', 'task-1', 'run', 'hash');
    builder.recordPlan('plan-123');
    const trace = builder.complete(null, '', true);
    expect(trace.planGenerated).toBe(true);
    expect(trace.planId).toBe('plan-123');
  });

  it('should record delegation', () => {
    const builder = new ExecutionTraceBuilder('agent-1', 'task-1', 'walk', 'hash');
    builder.recordDelegation({ agentId: 'agent-2', scope: 'subtask', result: 'done', durationMs: 500, success: true });
    const trace = builder.complete(null, '', true);
    expect(trace.agentsDelegatedTo).toHaveLength(1);
    expect(trace.agentsDelegatedTo[0]!.agentId).toBe('agent-2');
  });

  it('should record tool consideration and selection', () => {
    const builder = new ExecutionTraceBuilder('agent-1', 'task-1', 'walk', 'hash');
    builder.recordToolConsidered('search');
    builder.recordToolConsidered('scrape');
    builder.recordToolSelected('search');
    const trace = builder.complete(null, '', true);
    expect(trace.toolsConsidered).toEqual(['search', 'scrape']);
    expect(trace.toolsSelected).toEqual(['search']);
  });
});

describe('Anti-Chatbot Guards', () => {
  it('should detect missing envelope', () => {
    const violation = guardEnvelopeRequired(null);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('no_envelope');
    expect(violation!.severity).toBe('block');
  });

  it('should pass with valid envelope', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    const violation = guardEnvelopeRequired(envelope);
    expect(violation).toBeNull();
  });

  it('should detect missing memory retrieval (degraded)', () => {
    const envelope = buildCognitionEnvelope({ agentId: 'a', program: mockProgram, systemPrompt: 'test' });
    // Envelope without conversation history and procedural patterns is degraded
    const violation = guardMemoryRetrieval(envelope);
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('no_memory');
    expect(violation!.severity).toBe('warn');
  });

  it('should pass memory guard with conversation history', () => {
    const envelope = buildCognitionEnvelope({
      agentId: 'a', program: mockProgram, systemPrompt: 'test',
      conversationHistory: [{ role: 'user', content: 'hello' }],
    });
    const violation = guardMemoryRetrieval(envelope);
    expect(violation).toBeNull();
  });

  it('should block tool invocation without governance check', () => {
    const violation = guardToolInvocation('search', false, true, 'agent-1');
    expect(violation).not.toBeNull();
    expect(violation!.severity).toBe('block');
  });

  it('should block tool invocation without budget check', () => {
    const violation = guardToolInvocation('search', true, false, 'agent-1');
    expect(violation).not.toBeNull();
    expect(violation!.severity).toBe('block');
  });

  it('should pass tool invocation with both checks', () => {
    const violation = guardToolInvocation('search', true, true, 'agent-1');
    expect(violation).toBeNull();
  });

  it('should detect hardcoded tool without registry lookup', () => {
    const violation = guardHardcodedTool('search_google', false, 'agent-1');
    expect(violation).not.toBeNull();
    expect(violation!.type).toBe('hardcoded_tool');
  });

  it('should pass when tool uses registry', () => {
    const violation = guardHardcodedTool('search', true, 'agent-1');
    expect(violation).toBeNull();
  });

  it('should run all guards and collect violations', () => {
    const violations = runAllGuards(null);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some(v => v.type === 'no_envelope')).toBe(true);
  });

  it('should validate agentic behavior from trace', () => {
    const builder = new ExecutionTraceBuilder('a1', 't1', 'run', 'hash');
    builder.recordMemoryRetrieval({ layer: 'episodic', query: 'q', resultCount: 3 });
    builder.recordGovernanceCheck({ check: 'auth', result: 'passed', reason: 'ok' });
    builder.recordBudgetCheck({ estimated: 0.01, remaining: 9.99, approved: true });
    builder.recordAction('responded');
    const trace = builder.complete('output', 'reasoning', true);
    const result = validateAgenticBehavior(trace);
    expect(result.isAgentic).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('should flag non-agentic behavior', () => {
    const builder = new ExecutionTraceBuilder('a1', 't1', 'run', '');
    const trace = builder.complete('output', '', true);
    const result = validateAgenticBehavior(trace);
    expect(result.isAgentic).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('MCP Tool Registry', () => {
  it('should register and discover tools', () => {
    const registry = new MCPToolRegistry();
    registry.register({ id: 'tool-1', name: 'Search', description: 'Web search', capabilities: ['search', 'web'], provider: 'google', costPerInvocation: 0.01, reliabilityScore: 0.95, averageLatencyMs: 200, requiredAuthorityLevel: 'L4', requiredPermissions: [], status: 'available', lastHealthCheck: new Date(), fallbackTools: [] });
    const results = registry.discover(['search']);
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Search');
  });

  it('should select best tool by cost and reliability', () => {
    const registry = new MCPToolRegistry();
    registry.register({ id: 'cheap', name: 'Cheap', description: 'Cheap tool', capabilities: ['search'], provider: 'a', costPerInvocation: 0.001, reliabilityScore: 0.8, averageLatencyMs: 500, requiredAuthorityLevel: 'L4', requiredPermissions: [], status: 'available', lastHealthCheck: new Date(), fallbackTools: [] });
    registry.register({ id: 'reliable', name: 'Reliable', description: 'Reliable tool', capabilities: ['search'], provider: 'b', costPerInvocation: 0.05, reliabilityScore: 0.99, averageLatencyMs: 100, requiredAuthorityLevel: 'L4', requiredPermissions: [], status: 'available', lastHealthCheck: new Date(), fallbackTools: [] });
    const best = registry.selectBest(['search'], 1.0, 0.7, 'L3');
    expect(best).not.toBeNull();
    expect(best!.name).toBe('Reliable');
  });

  it('should filter by authority level', () => {
    const registry = new MCPToolRegistry();
    registry.register({ id: 'restricted', name: 'Restricted', description: 'L1 only', capabilities: ['admin'], provider: 'sys', costPerInvocation: 0, reliabilityScore: 1.0, averageLatencyMs: 10, requiredAuthorityLevel: 'L1', requiredPermissions: [], status: 'available', lastHealthCheck: new Date(), fallbackTools: [] });
    const result = registry.selectBest(['admin'], 10, 0, 'L3');
    expect(result).toBeNull();
  });

  it('should exclude unavailable tools from discovery', () => {
    const registry = new MCPToolRegistry();
    registry.register({ id: 'down', name: 'Down', description: 'Unavailable', capabilities: ['search'], provider: 'x', costPerInvocation: 0, reliabilityScore: 1.0, averageLatencyMs: 10, requiredAuthorityLevel: 'L4', requiredPermissions: [], status: 'unavailable', lastHealthCheck: new Date(), fallbackTools: [] });
    const results = registry.discover(['search']);
    expect(results).toHaveLength(0);
  });
});
