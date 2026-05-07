/**
 * Tests for enhanced Testing Infrastructure
 * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

import { describe, it, expect } from 'vitest';
import { TestFramework } from '../framework.js';
import { TraceabilityMatrix } from '../traceability.js';
import { DriverIntegrationTestRunner } from '../driver-test-runner.js';
import type { TestCase, GateVerificationResult } from '../framework.js';
import type { CompletionContract } from '../../types/completion.js';
import type { Driver } from '../../interfaces/driver.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const makeContract = (
  id: string,
  workflowType: string,
  requiredFields: string[],
  verificationStepNames: string[],
): CompletionContract => ({
  id,
  workflowType,
  version: '1.0.0',
  outputSchema: {
    type: 'object',
    required: requiredFields,
    properties: Object.fromEntries(requiredFields.map((f) => [f, { type: 'string' }])),
  },
  verificationSteps: verificationStepNames.map((name) => ({
    name,
    type: 'automated_test' as const,
    config: {},
    required: true,
    timeout: 60000,
  })),
  description: `${workflowType} contract`,
  createdAt: new Date(),
});

// ---------------------------------------------------------------------------
// TestFramework — enhanced coverage
// ---------------------------------------------------------------------------

describe('TestFramework — enhanced', () => {
  const framework = new TestFramework();

  describe('per-field and per-verification-step coverage', () => {
    const contract = makeContract(
      'c1',
      'development',
      ['sourceCode', 'tests', 'docs'],
      ['Code compiles', 'Tests pass'],
    );

    it('should detect missing fields when detailed metadata is provided', () => {
      const tests: TestCase[] = [
        {
          id: 't1',
          name: 'covers sourceCode',
          contractId: 'c1',
          requirementIds: [],
          status: 'pass',
          coveredFields: ['sourceCode'],
          coveredVerificationSteps: ['Code compiles', 'Tests pass'],
        },
      ];

      const report = framework.validateCoverage([contract], tests);
      expect(report.gaps).toHaveLength(1);
      expect(report.gaps[0].missingFields).toEqual(['tests', 'docs']);
      expect(report.gaps[0].missingVerificationSteps).toHaveLength(0);
      expect(report.deploymentAllowed).toBe(false);
    });

    it('should detect missing verification steps', () => {
      const tests: TestCase[] = [
        {
          id: 't1',
          name: 'covers all fields',
          contractId: 'c1',
          requirementIds: [],
          status: 'pass',
          coveredFields: ['sourceCode', 'tests', 'docs'],
          coveredVerificationSteps: ['Code compiles'],
        },
      ];

      const report = framework.validateCoverage([contract], tests);
      expect(report.gaps).toHaveLength(1);
      expect(report.gaps[0].missingFields).toHaveLength(0);
      expect(report.gaps[0].missingVerificationSteps).toEqual(['Tests pass']);
    });

    it('should report full coverage when all fields and steps are covered', () => {
      const tests: TestCase[] = [
        {
          id: 't1',
          name: 'covers sourceCode + compile',
          contractId: 'c1',
          requirementIds: [],
          status: 'pass',
          coveredFields: ['sourceCode', 'tests'],
          coveredVerificationSteps: ['Code compiles'],
        },
        {
          id: 't2',
          name: 'covers docs + tests pass',
          contractId: 'c1',
          requirementIds: [],
          status: 'pass',
          coveredFields: ['docs'],
          coveredVerificationSteps: ['Tests pass'],
        },
      ];

      const report = framework.validateCoverage([contract], tests);
      expect(report.gaps).toHaveLength(0);
      expect(report.deploymentAllowed).toBe(true);
      expect(report.coveragePercent).toBe(100);
    });

    it('should fall back to basic coverage when no detailed metadata is present', () => {
      const tests: TestCase[] = [
        {
          id: 't1',
          name: 'basic test',
          contractId: 'c1',
          requirementIds: [],
          status: 'pass',
        },
      ];

      const report = framework.validateCoverage([contract], tests);
      // No detailed metadata → treated as fully covered (backward compat)
      expect(report.gaps).toHaveLength(0);
      expect(report.deploymentAllowed).toBe(true);
    });
  });

  describe('validateAgentProgramTestSuite', () => {
    it('should validate coverage against agent program completion contracts', () => {
      const agentProgram = {
        id: 'agent-1',
        name: 'TestAgent',
        completionContracts: [
          makeContract('c1', 'dev', ['code'], ['Compile']),
          makeContract('c2', 'test', ['results'], ['Run']),
        ],
      };

      const tests: TestCase[] = [
        { id: 't1', name: 'test dev', contractId: 'c1', requirementIds: [], status: 'pass' },
      ];

      const report = framework.validateAgentProgramTestSuite(agentProgram, tests);
      expect(report.totalContracts).toBe(2);
      expect(report.coveredContracts).toBe(1);
      expect(report.gaps).toHaveLength(1);
      expect(report.gaps[0].contractId).toBe('c2');
      expect(report.deploymentAllowed).toBe(false);
    });

    it('should allow deployment when all contracts are covered', () => {
      const agentProgram = {
        id: 'agent-1',
        name: 'TestAgent',
        completionContracts: [makeContract('c1', 'dev', ['code'], ['Compile'])],
      };

      const tests: TestCase[] = [
        { id: 't1', name: 'test dev', contractId: 'c1', requirementIds: [], status: 'pass' },
      ];

      const report = framework.validateAgentProgramTestSuite(agentProgram, tests);
      expect(report.deploymentAllowed).toBe(true);
    });
  });

  describe('runGateVerification', () => {
    const contracts = [makeContract('c1', 'dev', ['code'], ['Compile'])];

    it('should pass when all tests pass and coverage is complete', () => {
      const tests: TestCase[] = [
        { id: 't1', name: 'test', contractId: 'c1', requirementIds: [], status: 'pass' },
      ];

      const result = framework.runGateVerification(contracts, tests);
      expect(result.passed).toBe(true);
      expect(result.failingTests).toHaveLength(0);
      expect(result.summary).toContain('Gate passed');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should fail when tests are failing', () => {
      const tests: TestCase[] = [
        { id: 't1', name: 'test', contractId: 'c1', requirementIds: [], status: 'fail' },
      ];

      const result = framework.runGateVerification(contracts, tests);
      expect(result.passed).toBe(false);
      expect(result.failingTests).toHaveLength(1);
      expect(result.summary).toContain('Gate failed');
      expect(result.summary).toContain('1 test(s) failing');
    });

    it('should fail when coverage gaps exist', () => {
      const result = framework.runGateVerification(contracts, []);
      expect(result.passed).toBe(false);
      expect(result.summary).toContain('Coverage gaps');
    });

    it('should fail when both coverage gaps and failing tests exist', () => {
      const twoContracts = [
        makeContract('c1', 'dev', ['code'], ['Compile']),
        makeContract('c2', 'test', ['results'], ['Run']),
      ];
      const tests: TestCase[] = [
        { id: 't1', name: 'test', contractId: 'c1', requirementIds: [], status: 'fail' },
      ];

      const result = framework.runGateVerification(twoContracts, tests);
      expect(result.passed).toBe(false);
      expect(result.summary).toContain('Coverage gaps');
      expect(result.summary).toContain('1 test(s) failing');
    });
  });
});

// ---------------------------------------------------------------------------
// TraceabilityMatrix — enhanced
// ---------------------------------------------------------------------------

describe('TraceabilityMatrix — enhanced', () => {
  describe('addTestCase', () => {
    it('should add a test case and auto-map to requirements', () => {
      const matrix = new TraceabilityMatrix();
      matrix.addRequirement('1.1', 'Agent deployment');
      matrix.addRequirement('1.2', 'Agent state');

      matrix.addTestCase('tc-1', 'Deploy test', ['1.1', '1.2']);

      const report = matrix.generateReport();
      expect(report.coveredRequirements).toBe(2);
      expect(report.coveragePercent).toBe(100);
    });
  });

  describe('getRequirementCoverage', () => {
    it('should return test case IDs for a covered requirement', () => {
      const matrix = new TraceabilityMatrix();
      matrix.addRequirement('1.1', 'Agent deployment');
      matrix.addTestCase('tc-1', 'Deploy test', ['1.1']);
      matrix.addTestCase('tc-2', 'Deploy test 2', ['1.1']);

      const coverage = matrix.getRequirementCoverage('1.1');
      expect(coverage).toEqual(['tc-1', 'tc-2']);
    });

    it('should return empty array for uncovered requirement', () => {
      const matrix = new TraceabilityMatrix();
      matrix.addRequirement('1.1', 'Agent deployment');

      expect(matrix.getRequirementCoverage('1.1')).toEqual([]);
    });

    it('should return empty array for non-existent requirement', () => {
      const matrix = new TraceabilityMatrix();
      expect(matrix.getRequirementCoverage('999')).toEqual([]);
    });
  });

  describe('getUncoveredRequirements', () => {
    it('should return IDs of requirements with no tests', () => {
      const matrix = new TraceabilityMatrix();
      matrix.addRequirement('1.1', 'Agent deployment');
      matrix.addRequirement('1.2', 'Agent state');
      matrix.addRequirement('1.3', 'Agent errors');
      matrix.addTestCase('tc-1', 'Deploy test', ['1.1']);

      const uncovered = matrix.getUncoveredRequirements();
      expect(uncovered).toEqual(['1.2', '1.3']);
    });

    it('should return empty array when all requirements are covered', () => {
      const matrix = new TraceabilityMatrix();
      matrix.addRequirement('1.1', 'Agent deployment');
      matrix.addTestCase('tc-1', 'Deploy test', ['1.1']);

      expect(matrix.getUncoveredRequirements()).toEqual([]);
    });
  });

  describe('exportMatrix', () => {
    it('should export a structured format for CI/CD reporting', () => {
      const matrix = new TraceabilityMatrix();
      matrix.addRequirement('1.1', 'Agent deployment');
      matrix.addRequirement('1.2', 'Agent state');
      matrix.addTestCase('tc-1', 'Deploy test', ['1.1']);

      const exported = matrix.exportMatrix();

      expect(exported.generatedAt).toBeInstanceOf(Date);
      expect(exported.totalRequirements).toBe(2);
      expect(exported.coveredRequirements).toBe(1);
      expect(exported.coveragePercent).toBe(50);
      expect(exported.requirements).toHaveLength(2);

      const req1 = exported.requirements.find((r) => r.id === '1.1');
      expect(req1?.covered).toBe(true);
      expect(req1?.testCaseIds).toEqual(['tc-1']);

      const req2 = exported.requirements.find((r) => r.id === '1.2');
      expect(req2?.covered).toBe(false);
      expect(req2?.testCaseIds).toEqual([]);

      expect(exported.testCases).toHaveLength(1);
      expect(exported.testCases[0]).toEqual({
        id: 'tc-1',
        name: 'Deploy test',
        requirementIds: ['1.1'],
      });
    });
  });
});

// ---------------------------------------------------------------------------
// DriverIntegrationTestRunner
// ---------------------------------------------------------------------------

describe('DriverIntegrationTestRunner', () => {
  const runner = new DriverIntegrationTestRunner();

  /** Minimal mock driver for testing. */
  const createMockDriver = (name = 'test-driver', version = '1.0.0'): Driver => ({
    name,
    version,
    status: 'ready',
    connect: async () => ({ success: true, status: 'ready' as const }),
    execute: async () => ({ success: true, retryable: false, operationId: 'op-1' }),
    verify: async () => ({ verified: true, operationId: 'op-1' }),
    disconnect: async () => {},
    healthCheck: async () => ({ healthy: true, status: 'ready' as const, errorCount: 0 }),
    getRetryPolicy: () => ({
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 16000,
      backoffMultiplier: 2,
    }),
  });

  it('should pass all tests and allow activation', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      { id: 'tc-1', name: 'health check', required: true, fn: async (d) => { await d.healthCheck(); } },
      { id: 'tc-2', name: 'execute op', required: true, fn: async (d) => { await d.execute({ type: 'test', params: {} }); } },
    ]);

    expect(report.driverName).toBe('test-driver');
    expect(report.totalTests).toBe(2);
    expect(report.passedTests).toBe(2);
    expect(report.failedTests).toBe(0);
    expect(report.activationAllowed).toBe(true);
    expect(report.timestamp).toBeInstanceOf(Date);
    expect(runner.canActivate(report)).toBe(true);
  });

  it('should block activation when a required test fails', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      { id: 'tc-1', name: 'passing test', required: true, fn: async () => {} },
      {
        id: 'tc-2',
        name: 'failing required test',
        required: true,
        fn: async () => { throw new Error('Connection refused'); },
      },
    ]);

    expect(report.passedTests).toBe(1);
    expect(report.failedTests).toBe(1);
    expect(report.activationAllowed).toBe(false);
    expect(report.results[1].error).toBe('Connection refused');
    expect(report.summary).toContain('activation blocked');
    expect(runner.canActivate(report)).toBe(false);
  });

  it('should allow activation when only optional tests fail', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      { id: 'tc-1', name: 'required test', required: true, fn: async () => {} },
      {
        id: 'tc-2',
        name: 'optional test',
        required: false,
        fn: async () => { throw new Error('Optional failure'); },
      },
    ]);

    expect(report.passedTests).toBe(1);
    expect(report.failedTests).toBe(1);
    expect(report.activationAllowed).toBe(true);
    expect(runner.canActivate(report)).toBe(true);
  });

  it('should handle empty test suite', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, []);

    expect(report.totalTests).toBe(0);
    expect(report.activationAllowed).toBe(true);
  });

  it('should record duration for each test', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      { id: 'tc-1', name: 'quick test', required: true, fn: async () => {} },
    ]);

    expect(report.results[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
