/**
 * Unit tests for Learning Engine
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 19.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningEngine } from '../engine.js';
import type { FailureEvent, FixProposal } from '../engine.js';
import type { ZikaronService, EventBusService } from '@seraphim/core';
import type { ModelPerformanceRecord, TaskType } from '@seraphim/core';

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('entry-1'),
    storeSemantic: vi.fn().mockResolvedValue('entry-2'),
    storeProcedural: vi.fn().mockResolvedValue('entry-3'),
    storeWorking: vi.fn().mockResolvedValue('entry-4'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ working: [], episodic: [], procedural: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  } as unknown as ZikaronService;
}

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-1'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

function createSampleFailure(overrides?: Partial<FailureEvent>): FailureEvent {
  return {
    id: `fail-${Date.now()}`,
    agentId: 'agent-1',
    taskType: 'code_generation',
    errorMessage: 'Token limit exceeded',
    errorCode: 'TOKEN_LIMIT',
    context: {},
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LearningEngine', () => {
  let engine: LearningEngine;
  let mockZikaron: ZikaronService;
  let mockEventBus: EventBusService;

  beforeEach(() => {
    mockZikaron = createMockZikaron();
    mockEventBus = createMockEventBus();
    engine = new LearningEngine({
      zikaronService: mockZikaron,
      eventBus: mockEventBus,
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.1: Failure analysis correlates with historical patterns
  // ---------------------------------------------------------------------------

  describe('analyzeFailure', () => {
    it('should correlate failure with historical patterns in Zikaron', async () => {
      const failure = createSampleFailure();
      await engine.analyzeFailure(failure);

      // Should query Zikaron for similar historical failures
      expect(mockZikaron.query).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          text: expect.stringContaining(failure.taskType),
          layers: ['episodic'],
        }),
      );
    });

    it('should create a new pattern on first occurrence', async () => {
      const failure = createSampleFailure();
      const pattern = await engine.analyzeFailure(failure);

      expect(pattern).not.toBeNull();
      expect(pattern!.rootCause).toBe('TOKEN_LIMIT');
      expect(pattern!.occurrenceCount).toBe(1);
      expect(pattern!.affectedAgents).toContain('agent-1');
    });

    it('should increment occurrence count for same root cause', async () => {
      const failure1 = createSampleFailure({ id: 'fail-1' });
      const failure2 = createSampleFailure({ id: 'fail-2', agentId: 'agent-2' });

      await engine.analyzeFailure(failure1);
      const pattern = await engine.analyzeFailure(failure2);

      expect(pattern!.occurrenceCount).toBe(2);
      expect(pattern!.affectedAgents).toContain('agent-1');
      expect(pattern!.affectedAgents).toContain('agent-2');
    });

    it('should store failure in Zikaron episodic memory', async () => {
      const failure = createSampleFailure();
      await engine.analyzeFailure(failure);

      expect(mockZikaron.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          layer: 'episodic',
          tags: expect.arrayContaining(['failure', failure.taskType]),
        }),
      );
    });

    it('should use errorCode as root cause when available', async () => {
      const failure = createSampleFailure({ errorCode: 'RATE_LIMIT' });
      const pattern = await engine.analyzeFailure(failure);

      expect(pattern!.rootCause).toBe('RATE_LIMIT');
    });

    it('should fall back to errorMessage when errorCode is absent', async () => {
      const failure = createSampleFailure({ errorCode: undefined });
      const pattern = await engine.analyzeFailure(failure);

      expect(pattern!.rootCause).toBe('Token limit exceeded');
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.2: Pattern detection identifies recurring failures
  // ---------------------------------------------------------------------------

  describe('detectPatterns', () => {
    it('should identify recurring failure patterns', async () => {
      const now = new Date();
      const failure1 = createSampleFailure({ id: 'fail-1', occurredAt: now.toISOString() });
      const failure2 = createSampleFailure({ id: 'fail-2', occurredAt: now.toISOString() });

      await engine.analyzeFailure(failure1);
      await engine.analyzeFailure(failure2);

      const start = new Date(now.getTime() - 86400000).toISOString();
      const end = new Date(now.getTime() + 86400000).toISOString();
      const patterns = await engine.detectPatterns(start, end);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].occurrenceCount).toBeGreaterThanOrEqual(2);
    });

    it('should not return patterns with only one occurrence', async () => {
      const now = new Date();
      const failure = createSampleFailure({ occurredAt: now.toISOString() });
      await engine.analyzeFailure(failure);

      const start = new Date(now.getTime() - 86400000).toISOString();
      const end = new Date(now.getTime() + 86400000).toISOString();
      const patterns = await engine.detectPatterns(start, end);

      expect(patterns.length).toBe(0);
    });

    it('should filter patterns by time range', async () => {
      const oldTime = new Date('2020-01-01').toISOString();
      const failure1 = createSampleFailure({ id: 'fail-1', occurredAt: oldTime });
      const failure2 = createSampleFailure({ id: 'fail-2', occurredAt: oldTime });

      await engine.analyzeFailure(failure1);
      await engine.analyzeFailure(failure2);

      // Query for a recent time range that doesn't include the old failures
      const start = new Date('2024-01-01').toISOString();
      const end = new Date('2024-12-31').toISOString();
      const patterns = await engine.detectPatterns(start, end);

      expect(patterns.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.6: Fix generation produces versioned changes (not unstructured text)
  // ---------------------------------------------------------------------------

  describe('generateFix', () => {
    it('should produce versioned changes with structured fields', async () => {
      const failure1 = createSampleFailure({ id: 'fail-1' });
      const failure2 = createSampleFailure({ id: 'fail-2' });
      await engine.analyzeFailure(failure1);
      await engine.analyzeFailure(failure2);

      const now = new Date();
      const patterns = await engine.detectPatterns(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString(),
      );
      const fix = await engine.generateFix(patterns[0]);

      // Fix must have versioned changes (not unstructured text)
      expect(fix.changes).toBeInstanceOf(Array);
      expect(fix.changes.length).toBeGreaterThan(0);
      for (const change of fix.changes) {
        expect(change).toHaveProperty('field');
        expect(change).toHaveProperty('oldValue');
        expect(change).toHaveProperty('newValue');
        expect(change).toHaveProperty('reason');
      }
    });

    it('should have a version string', async () => {
      const failure1 = createSampleFailure({ id: 'fail-1' });
      const failure2 = createSampleFailure({ id: 'fail-2' });
      await engine.analyzeFailure(failure1);
      await engine.analyzeFailure(failure2);

      const now = new Date();
      const patterns = await engine.detectPatterns(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString(),
      );
      const fix = await engine.generateFix(patterns[0]);

      expect(fix.version).toBeDefined();
      expect(fix.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should target the appropriate artifact type', async () => {
      // Workflow-related failure
      const failure1 = createSampleFailure({
        id: 'fail-1',
        errorCode: 'workflow_transition_failed',
      });
      const failure2 = createSampleFailure({
        id: 'fail-2',
        errorCode: 'workflow_transition_failed',
      });
      await engine.analyzeFailure(failure1);
      await engine.analyzeFailure(failure2);

      const now = new Date();
      const patterns = await engine.detectPatterns(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString(),
      );
      const fix = await engine.generateFix(patterns[0]);

      expect(fix.targetType).toBe('workflow');
    });

    it('should have confidence score that scales with occurrences', async () => {
      const failures = Array.from({ length: 5 }, (_, i) =>
        createSampleFailure({ id: `fail-${i}` }),
      );
      for (const f of failures) {
        await engine.analyzeFailure(f);
      }

      const now = new Date();
      const patterns = await engine.detectPatterns(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString(),
      );
      const fix = await engine.generateFix(patterns[0]);

      expect(fix.confidence).toBeGreaterThan(0);
      expect(fix.confidence).toBeLessThanOrEqual(95);
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.3, 8.4: Fix verification catches regressions
  // ---------------------------------------------------------------------------

  describe('verifyFix', () => {
    it('should pass verification for high-confidence fixes', async () => {
      const failure1 = createSampleFailure({ id: 'fail-1' });
      const failure2 = createSampleFailure({ id: 'fail-2' });
      const failure3 = createSampleFailure({ id: 'fail-3' });
      const failure4 = createSampleFailure({ id: 'fail-4' });
      await engine.analyzeFailure(failure1);
      await engine.analyzeFailure(failure2);
      await engine.analyzeFailure(failure3);
      await engine.analyzeFailure(failure4);

      const now = new Date();
      const patterns = await engine.detectPatterns(
        new Date(now.getTime() - 86400000).toISOString(),
        new Date(now.getTime() + 86400000).toISOString(),
      );
      const fix = await engine.generateFix(patterns[0]);
      const result = await engine.verifyFix(fix);

      expect(result.passed).toBe(true);
      expect(result.regressions).toHaveLength(0);
      expect(result.testsRun).toBeGreaterThan(0);
      expect(result.testsPassed).toBe(result.testsRun);
    });

    it('should catch regressions for low-confidence fixes', async () => {
      // Create a low-confidence fix manually
      const lowConfidenceFix: FixProposal = {
        id: 'fix-low',
        patternId: 'pattern-1',
        targetType: 'agent_program',
        targetId: 'agent-1',
        changes: [
          {
            field: 'errorHandling',
            oldValue: null,
            newValue: { retry: true },
            reason: 'test',
          },
        ],
        confidence: 30, // Below threshold
        version: '1.0.1',
        description: 'Low confidence fix',
        createdAt: new Date().toISOString(),
      };

      const result = await engine.verifyFix(lowConfidenceFix);

      expect(result.passed).toBe(false);
      expect(result.regressions.length).toBeGreaterThan(0);
      expect(result.testsPassed).toBeLessThan(result.testsRun);
    });

    it('should include verification timestamp', async () => {
      const fix: FixProposal = {
        id: 'fix-1',
        patternId: 'pattern-1',
        targetType: 'agent_program',
        targetId: 'agent-1',
        changes: [{ field: 'x', oldValue: null, newValue: 'y', reason: 'test' }],
        confidence: 80,
        version: '1.0.1',
        description: 'Test fix',
        createdAt: new Date().toISOString(),
      };

      const result = await engine.verifyFix(fix);
      expect(result.verifiedAt).toBeDefined();
      expect(new Date(result.verifiedAt).getTime()).not.toBeNaN();
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.3: Apply fix and record in procedural memory
  // ---------------------------------------------------------------------------

  describe('applyFix', () => {
    it('should record fix in Zikaron procedural memory', async () => {
      const fix: FixProposal = {
        id: 'fix-1',
        patternId: 'pattern-1',
        targetType: 'agent_program',
        targetId: 'agent-1',
        changes: [{ field: 'retry', oldValue: null, newValue: { max: 3 }, reason: 'fix' }],
        confidence: 80,
        version: '1.0.1',
        description: 'Test fix',
        createdAt: new Date().toISOString(),
      };

      await engine.applyFix(fix);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'system',
          layer: 'procedural',
          tags: expect.arrayContaining(['fix', 'applied']),
        }),
      );
    });

    it('should publish learning.fix.applied event', async () => {
      const fix: FixProposal = {
        id: 'fix-1',
        patternId: 'pattern-1',
        targetType: 'agent_program',
        targetId: 'agent-1',
        changes: [{ field: 'retry', oldValue: null, newValue: { max: 3 }, reason: 'fix' }],
        confidence: 80,
        version: '1.0.1',
        description: 'Test fix',
        createdAt: new Date().toISOString(),
      };

      await engine.applyFix(fix);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.learning-engine',
          type: 'learning.fix.applied',
          detail: expect.objectContaining({
            fixId: fix.id,
            patternId: fix.patternId,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Requirement 8.5: Improvement metrics calculation accuracy
  // ---------------------------------------------------------------------------

  describe('getImprovementMetrics', () => {
    it('should return zero metrics when no data exists', () => {
      const metrics = engine.getImprovementMetrics();

      expect(metrics.repeatFailureRate).toBe(0);
      expect(metrics.autonomousResolutionRate).toBe(0);
      expect(metrics.fixSuccessRate).toBe(0);
      expect(metrics.totalPatternsDetected).toBe(0);
      expect(metrics.totalFixesApplied).toBe(0);
    });

    it('should calculate repeat failure rate correctly', async () => {
      // Create 2 patterns: one recurring, one single
      await engine.analyzeFailure(createSampleFailure({ id: 'f1', errorCode: 'ERR_A' }));
      await engine.analyzeFailure(createSampleFailure({ id: 'f2', errorCode: 'ERR_A' }));
      await engine.analyzeFailure(createSampleFailure({ id: 'f3', errorCode: 'ERR_B' }));

      const metrics = engine.getImprovementMetrics();

      // 1 recurring pattern out of 2 total patterns = 0.5
      expect(metrics.repeatFailureRate).toBe(0.5);
      expect(metrics.totalPatternsDetected).toBe(2);
    });

    it('should calculate fix success rate correctly', async () => {
      const fix: FixProposal = {
        id: 'fix-1',
        patternId: 'pattern-1',
        targetType: 'agent_program',
        targetId: 'agent-1',
        changes: [{ field: 'x', oldValue: null, newValue: 'y', reason: 'test' }],
        confidence: 80,
        version: '1.0.1',
        description: 'Test fix',
        createdAt: new Date().toISOString(),
      };

      await engine.applyFix(fix);
      await engine.applyFix({ ...fix, id: 'fix-2' });

      const metrics = engine.getImprovementMetrics();
      expect(metrics.totalFixesApplied).toBe(2);
      expect(metrics.fixSuccessRate).toBe(1); // All fixes succeed in applyFix
    });
  });

  // ---------------------------------------------------------------------------
  // Model Router Performance Aggregation
  // ---------------------------------------------------------------------------

  describe('aggregateModelPerformance', () => {
    it('should aggregate records by taskType, complexity, and model', () => {
      const records: ModelPerformanceRecord[] = [
        {
          taskType: 'code_generation' as TaskType,
          complexity: 'medium',
          model: 'claude-sonnet',
          tier: 2,
          success: true,
          qualityScore: 0.9,
          latencyMs: 2000,
          tokenCost: 0.05,
          agentId: 'agent-1',
          pillar: 'zionx',
          timestamp: new Date(),
        },
        {
          taskType: 'code_generation' as TaskType,
          complexity: 'medium',
          model: 'claude-sonnet',
          tier: 2,
          success: true,
          qualityScore: 0.85,
          latencyMs: 2500,
          tokenCost: 0.06,
          agentId: 'agent-2',
          pillar: 'zionx',
          timestamp: new Date(),
        },
        {
          taskType: 'code_generation' as TaskType,
          complexity: 'medium',
          model: 'gpt-4o',
          tier: 2,
          success: false,
          qualityScore: 0.5,
          latencyMs: 5000,
          tokenCost: 0.08,
          agentId: 'agent-1',
          pillar: 'zionx',
          timestamp: new Date(),
        },
      ];

      for (const r of records) {
        engine.recordPerformance(r);
      }

      const weights = engine.aggregateModelPerformance();

      expect(weights.length).toBe(2); // Two groups: claude-sonnet and gpt-4o
      const claudeWeight = weights.find((w) => w.model === 'claude-sonnet');
      const gptWeight = weights.find((w) => w.model === 'gpt-4o');

      expect(claudeWeight).toBeDefined();
      expect(claudeWeight!.sampleCount).toBe(2);
      expect(claudeWeight!.avgQuality).toBeCloseTo(0.875);

      expect(gptWeight).toBeDefined();
      expect(gptWeight!.sampleCount).toBe(1);
      // gpt-4o failed, so weight should be lower
      expect(gptWeight!.weight).toBeLessThan(claudeWeight!.weight);
    });

    it('should update routing weights after aggregation', () => {
      engine.recordPerformance({
        taskType: 'code_generation' as TaskType,
        complexity: 'low',
        model: 'gpt-4o-mini',
        tier: 3,
        success: true,
        qualityScore: 0.8,
        latencyMs: 1000,
        tokenCost: 0.01,
        agentId: 'agent-1',
        pillar: 'zionx',
        timestamp: new Date(),
      });

      engine.aggregateModelPerformance();
      const weights = engine.getRoutingWeights();

      expect(weights.length).toBe(1);
      expect(weights[0].taskType).toBe('code_generation');
      expect(weights[0].model).toBe('gpt-4o-mini');
      expect(weights[0].weight).toBeGreaterThan(0);
    });
  });
});
