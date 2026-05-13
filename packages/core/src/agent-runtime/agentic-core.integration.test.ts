/**
 * Integration tests for end-to-end agentic workflows.
 * Tests the full cycle: envelope → plan → delegate → tools → trace.
 *
 * Requirements: 49-55, 19.2
 */
import { describe, it, expect } from 'vitest';
import { buildCognitionEnvelope } from './cognition-envelope.js';
import { createPlan, getReadySubtasks, completeSubtask } from './planning-engine.js';
import { createDelegationRequest, createDelegationSuccess, createDelegationFailure, canDelegate, aggregateResults } from './delegation-engine.js';
import { getEffectiveMode, requiresHumanGate, DEFAULT_AUTONOMY_CONFIGS } from './autonomy-config.js';
import { ExecutionTraceBuilder } from './execution-trace.js';
import { guardEnvelopeRequired, guardToolInvocation, validateAgenticBehavior } from './anti-chatbot-guards.js';
import { MCPToolRegistry } from '../mcp/tool-registry.js';
import type { AgentProgram } from '../types/agent.js';

describe('End-to-End Agentic Workflow', () => {
  it('should produce different behavior from same LLM key through different envelopes', () => {
    const programA: AgentProgram = {
      id: 'agent-a', name: 'Strategist', version: '1.0.0', pillar: 'system',
      systemPrompt: 'You are a strategist.',
      identityProfile: { name: 'Strategist', role: 'Strategic planning', hierarchyPosition: 'Top', personality: { tone: 'authoritative', verbosity: 'concise', proactivity: 'proactive', formality: 'formal' }, expertise: ['strategy'], domainLanguage: ['vision'], decisionPrinciples: ['Think big'], relationships: [], neverBreakCharacter: true, identityReinforcement: 'You are Strategist.' },
      tools: [], stateMachine: { id: 'sm', name: 'SM', version: '1.0.0', states: {}, initialState: 'idle', terminalStates: [], transitions: [], metadata: { createdAt: new Date(), updatedAt: new Date(), description: '' } },
      completionContracts: [], authorityLevel: 'L1', allowedActions: [], deniedActions: [],
      modelPreference: { preferred: 'gpt-4o', fallback: 'gpt-4o-mini', costCeiling: 1 },
      tokenBudget: { daily: 10000, monthly: 100000 },
      testSuite: { suiteId: 't', path: 't', requiredCoverage: 80 },
      createdAt: new Date(), updatedAt: new Date(), createdBy: 'test', changelog: [],
    };

    const programB: AgentProgram = {
      ...programA,
      id: 'agent-b', name: 'Analyst',
      systemPrompt: 'You are an analyst.',
      identityProfile: { ...programA.identityProfile!, name: 'Analyst', role: 'Data analysis', personality: { tone: 'analytical', verbosity: 'detailed', proactivity: 'reactive', formality: 'professional' }, expertise: ['data'], domainLanguage: ['metrics'], decisionPrinciples: ['Data first'] },
      authorityLevel: 'L3',
    };

    const envelopeA = buildCognitionEnvelope({ agentId: 'a', program: programA, systemPrompt: 'Strategist prompt' });
    const envelopeB = buildCognitionEnvelope({ agentId: 'b', program: programB, systemPrompt: 'Analyst prompt' });

    // Different envelopes = different behavior (different hashes prove different context)
    expect(envelopeA.envelopeHash).not.toBe(envelopeB.envelopeHash);
    expect(envelopeA.authorityLevel).toBe('L1');
    expect(envelopeB.authorityLevel).toBe('L3');
    expect(envelopeA.identityProfile?.name).toBe('Strategist');
    expect(envelopeB.identityProfile?.name).toBe('Analyst');
  });

  it('should create a plan, identify ready tasks, and complete them', () => {
    const plan = createPlan('seraphim', 'Launch new app', [
      { description: 'Market research', requiredTools: ['search'], requiredAgents: [], dependencies: [], risks: ['market shift'], expectedOutput: 'report', budgetEstimate: 0.5, approvalRequired: false },
      { description: 'Build app', requiredTools: ['xcode'], requiredAgents: ['zionx'], dependencies: [], risks: ['complexity'], expectedOutput: 'app binary', budgetEstimate: 5.0, approvalRequired: true },
      { description: 'Submit to store', requiredTools: ['appstore'], requiredAgents: ['zionx'], dependencies: [], risks: ['rejection'], expectedOutput: 'submission id', budgetEstimate: 0.1, approvalRequired: true },
    ]);

    expect(plan.subtasks).toHaveLength(3);

    // All tasks ready (no dependencies between them in this simple case)
    const ready = getReadySubtasks(plan);
    expect(ready.length).toBe(3);

    // Complete first task
    const updated = completeSubtask(plan, plan.subtasks[0]!.id, { report: 'Market looks good' });
    expect(updated.subtasks[0]!.status).toBe('completed');
  });

  it('should enforce delegation authorization', () => {
    const allowedTargets = ['zionx-app-factory', 'zxmg-media-production'];

    // Can delegate to authorized agents
    expect(canDelegate('seraphim', 'zionx-app-factory', allowedTargets)).toBe(true);
    expect(canDelegate('seraphim', 'zxmg-media-production', allowedTargets)).toBe(true);

    // Cannot delegate to unauthorized agents
    expect(canDelegate('seraphim', 'unknown-agent', allowedTargets)).toBe(false);
  });

  it('should create delegation requests with proper structure', () => {
    const req = createDelegationRequest(
      'seraphim-core',
      'zionx-app-factory',
      'Build a fitness tracking app for iOS',
      { timeout: 60000, constraints: ['Must use SwiftUI', 'Target iOS 17+'] },
    );

    expect(req.initiatingAgentId).toBe('seraphim-core');
    expect(req.targetAgentId).toBe('zionx-app-factory');
    expect(req.scope).toBe('Build a fitness tracking app for iOS');
    expect(req.timeout).toBe(60000);
    expect(req.constraints).toEqual(['Must use SwiftUI', 'Target iOS 17+']);
  });

  it('should handle full delegation lifecycle: request → success → aggregate', () => {
    // Seraphim delegates to two agents
    const req1 = createDelegationRequest('seraphim', 'zionx-app-factory', 'Build app');
    const req2 = createDelegationRequest('seraphim', 'zxmg-media-production', 'Create marketing video');

    // Both succeed
    const result1 = createDelegationSuccess(req1, { appId: 'app-123' }, 5000);
    const result2 = createDelegationSuccess(req2, { videoUrl: 'https://...' }, 8000);

    const agg = aggregateResults([result1, result2]);
    expect(agg.allSucceeded).toBe(true);
    expect(agg.successCount).toBe(2);
    expect(agg.outputs).toHaveLength(2);
  });

  it('should handle delegation failure and aggregate errors', () => {
    const req1 = createDelegationRequest('seraphim', 'zionx-app-factory', 'Build app');
    const req2 = createDelegationRequest('seraphim', 'zxmg-media-production', 'Create video');

    const result1 = createDelegationSuccess(req1, { appId: 'app-123' }, 5000);
    const result2 = createDelegationFailure(req2, 'Budget exceeded', 30000);

    const agg = aggregateResults([result1, result2]);
    expect(agg.allSucceeded).toBe(false);
    expect(agg.successCount).toBe(1);
    expect(agg.failureCount).toBe(1);
    expect(agg.errors).toContain('Budget exceeded');
  });

  it('should enforce autonomy gates in delegation workflow', () => {
    const config = DEFAULT_AUTONOMY_CONFIGS['zionx-app-factory']!;

    // In walk mode, submission requires human gate
    const mode = getEffectiveMode(config, 'app_submission');
    expect(mode).toBe('walk');
    expect(requiresHumanGate(config, 'app_submission', 'before_submission', mode)).toBe(true);

    // In run mode for development, no gate
    const devMode = getEffectiveMode(config, 'app_development');
    expect(devMode).toBe('run');
  });

  it('should build complete execution trace for an agentic workflow', () => {
    const program: AgentProgram = {
      id: 'zionx', name: 'ZionX', version: '1.0.0', pillar: 'apps',
      systemPrompt: 'You are ZionX.',
      identityProfile: { name: 'ZionX', role: 'App Factory', hierarchyPosition: 'Subsidiary', personality: { tone: 'creative', verbosity: 'balanced', proactivity: 'proactive', formality: 'professional' }, expertise: ['iOS', 'Swift'], domainLanguage: ['app'], decisionPrinciples: ['Ship fast'], relationships: [], neverBreakCharacter: true, identityReinforcement: 'You are ZionX.' },
      tools: [], stateMachine: { id: 'sm', name: 'SM', version: '1.0.0', states: {}, initialState: 'idle', terminalStates: [], transitions: [], metadata: { createdAt: new Date(), updatedAt: new Date(), description: '' } },
      completionContracts: [], authorityLevel: 'L3', allowedActions: ['build', 'submit'], deniedActions: [],
      modelPreference: { preferred: 'gpt-4o', fallback: 'gpt-4o-mini', costCeiling: 5 },
      tokenBudget: { daily: 50000, monthly: 500000 },
      testSuite: { suiteId: 't', path: 't', requiredCoverage: 80 },
      createdAt: new Date(), updatedAt: new Date(), createdBy: 'test', changelog: [],
    };

    // 1. Build envelope
    const envelope = buildCognitionEnvelope({
      agentId: 'zionx',
      program,
      systemPrompt: 'You are ZionX App Factory.',
      conversationHistory: [{ role: 'user', content: 'Build a fitness app' }],
      proceduralPatterns: ['Always use SwiftUI for new apps'],
      autonomyMode: 'walk',
    });

    // 2. Verify envelope is valid
    expect(guardEnvelopeRequired(envelope)).toBeNull();

    // 3. Create plan
    const plan = createPlan('zionx', 'Build fitness app', [
      { description: 'Design UI', requiredTools: ['figma'], requiredAgents: [], dependencies: [], risks: [], expectedOutput: 'mockups', budgetEstimate: 1.0, approvalRequired: false },
      { description: 'Implement features', requiredTools: ['xcode'], requiredAgents: [], dependencies: [], risks: [], expectedOutput: 'code', budgetEstimate: 3.0, approvalRequired: false },
      { description: 'Submit to App Store', requiredTools: ['appstore'], requiredAgents: [], dependencies: [], risks: ['rejection'], expectedOutput: 'submission', budgetEstimate: 0.1, approvalRequired: true },
    ]);

    // 4. Build execution trace
    const traceBuilder = new ExecutionTraceBuilder('zionx', 'task-fitness-app', 'walk', envelope.envelopeHash);
    traceBuilder.recordPlan(plan.id);
    traceBuilder.recordMemoryRetrieval({ layer: 'procedural', query: 'app building patterns', resultCount: 3 });
    traceBuilder.recordGovernanceCheck({ check: 'authority', result: 'passed', reason: 'L3 can build apps' });
    traceBuilder.recordBudgetCheck({ estimated: 4.1, remaining: 45.9, approved: true });
    traceBuilder.recordToolConsidered('figma');
    traceBuilder.recordToolConsidered('xcode');
    traceBuilder.recordToolSelected('figma');
    traceBuilder.recordToolInvocation({ tool: 'figma', input: { task: 'design' }, output: { mockupUrl: '...' }, durationMs: 2000, success: true });
    traceBuilder.recordAction('Generated UI mockups');

    const trace = traceBuilder.complete({ app: 'fitness-tracker' }, 'Built app using SwiftUI patterns from memory', true);

    // 5. Validate trace shows agentic behavior
    const validation = validateAgenticBehavior(trace);
    expect(validation.isAgentic).toBe(true);
    expect(validation.score).toBeGreaterThanOrEqual(60);
    expect(trace.planGenerated).toBe(true);
    expect(trace.memoryRetrieved).toHaveLength(1);
    expect(trace.governanceChecks).toHaveLength(1);
    expect(trace.toolsInvoked).toHaveLength(1);
  });

  it('should handle MCP tool failure with fallback', () => {
    const registry = new MCPToolRegistry();
    registry.register({
      id: 'primary-search', name: 'PrimarySearch', description: 'Primary search tool',
      capabilities: ['search'], provider: 'google', costPerInvocation: 0.01,
      reliabilityScore: 0.95, averageLatencyMs: 200, requiredAuthorityLevel: 'L4',
      requiredPermissions: [], status: 'available', lastHealthCheck: new Date(),
      fallbackTools: ['backup-search'],
    });
    registry.register({
      id: 'backup-search', name: 'BackupSearch', description: 'Backup search tool',
      capabilities: ['search'], provider: 'bing', costPerInvocation: 0.005,
      reliabilityScore: 0.85, averageLatencyMs: 300, requiredAuthorityLevel: 'L4',
      requiredPermissions: [], status: 'available', lastHealthCheck: new Date(),
      fallbackTools: [],
    });

    // Primary tool becomes unavailable
    registry.updateHealth('primary-search', 'unavailable');

    // Discovery should only find backup
    const available = registry.discover(['search']);
    expect(available).toHaveLength(1);
    expect(available[0]!.name).toBe('BackupSearch');

    // Fallback lookup
    const fallbacks = registry.getFallbacks('primary-search');
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]!.name).toBe('BackupSearch');
  });

  it('should prevent non-agentic passthrough behavior', () => {
    // Simulate a "chatbot" trace — no memory, no governance, no tools
    const builder = new ExecutionTraceBuilder('agent-1', 'task-1', 'run', '');
    const trace = builder.complete('Just a raw LLM response', '', true);

    const validation = validateAgenticBehavior(trace);
    expect(validation.isAgentic).toBe(false);
    expect(validation.issues).toContain('No memory retrieval in execution trace');
    expect(validation.issues).toContain('No governance checks in execution trace');
    expect(validation.issues).toContain('No budget checks in execution trace');
  });

  it('should guard against tool invocation without governance', () => {
    // Attempting to invoke a tool without governance check should be blocked
    const violation = guardToolInvocation('appstore-submit', false, true, 'zionx');
    expect(violation).not.toBeNull();
    expect(violation!.severity).toBe('block');

    // With governance check, it should pass
    const noViolation = guardToolInvocation('appstore-submit', true, true, 'zionx');
    expect(noViolation).toBeNull();
  });
});
