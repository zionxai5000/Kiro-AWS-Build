/**
 * Tests for Testing Infrastructure — edge cases and additional scenarios
 * Validates: Requirements 19.1, 19.4, 19.5
 */

import { describe, it, expect } from 'vitest';
import { TestFramework } from '../framework.js';
import { TraceabilityMatrix } from '../traceability.js';
import { DriverIntegrationTestRunner } from '../driver-test-runner.js';
import type { TestCase } from '../framework.js';
import type { CompletionContract } from '../../types/completion.js';
import type { Driver } from '../../interfaces/driver.js';

// ---------------------------------------------------------------------------
// Shared helpers
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

// ---------------------------------------------------------------------------
// TestFramework — coverage gap detection blocking deployment
// ---------------------------------------------------------------------------

describe('TestFramework — coverage gap detection', () => {
  const framework = new TestFramework();

  it('should return 100% coverage and allow deployment with empty contracts list', () => {
    const report = framework.validateCoverage([], []);
    expect(report.totalContracts).toBe(0);
    expect(report.coveredContracts).toBe(0);
    expect(report.gaps).toHaveLength(0);
    expect(report.coveragePercent).toBe(100);
    expect(report.deploymentAllowed).toBe(true);
  });

  it('should list empty missingFields when outputSchema.required is undefined', () => {
    const contract: CompletionContract = {
      id: 'no-required',
      workflowType: 'dev',
      version: '1.0.0',
      outputSchema: { type: 'object', properties: {} },
      verificationSteps: [
        { name: 'Step A', type: 'automated_test', config: {}, required: true, timeout: 60000 },
      ],
      description: 'contract without required fields',
      createdAt: new Date(),
    };

    // No tests at all → gap is created via the "no tests" path
    const report = framework.validateCoverage([contract], []);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].missingFields).toEqual([]);
    expect(report.gaps[0].missingVerificationSteps).toEqual(['Step A']);
  });

  it('should list empty missingVerificationSteps when verificationSteps is empty', () => {
    const contract: CompletionContract = {
      id: 'no-steps',
      workflowType: 'dev',
      version: '1.0.0',
      outputSchema: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } },
      verificationSteps: [],
      description: 'contract without verification steps',
      createdAt: new Date(),
    };

    const report = framework.validateCoverage([contract], []);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].missingFields).toEqual(['code']);
    expect(report.gaps[0].missingVerificationSteps).toEqual([]);
  });

  it('shouldBlockDeployment returns false when report has no gaps', () => {
    const contract = makeContract('c1', 'dev', ['code'], ['Compile']);
    const tests: TestCase[] = [
      { id: 't1', name: 'test', contractId: 'c1', requirementIds: [], status: 'pass' },
    ];
    const report = framework.validateCoverage([contract], tests);
    expect(report.deploymentAllowed).toBe(true);
    expect(framework.shouldBlockDeployment(report)).toBe(false);
  });

  it('should not count skipped tests as failing in gate verification', () => {
    const contract = makeContract('c1', 'dev', ['code'], ['Compile']);
    const tests: TestCase[] = [
      { id: 't1', name: 'passing test', contractId: 'c1', requirementIds: [], status: 'pass' },
      { id: 't2', name: 'skipped test', contractId: 'c1', requirementIds: [], status: 'skip' },
    ];

    const result = framework.runGateVerification([contract], tests);
    expect(result.failingTests).toHaveLength(0);
    expect(result.passed).toBe(true);
    expect(result.summary).toContain('Gate passed');
  });

  it('should handle multiple contracts with partial coverage', () => {
    const contracts = [
      makeContract('c1', 'dev', ['code'], ['Compile']),
      makeContract('c2', 'test', ['results'], ['Run']),
      makeContract('c3', 'deploy', ['artifact'], ['Deploy']),
    ];
    const tests: TestCase[] = [
      { id: 't1', name: 'dev test', contractId: 'c1', requirementIds: [], status: 'pass' },
      { id: 't2', name: 'deploy test', contractId: 'c3', requirementIds: [], status: 'pass' },
    ];

    const report = framework.validateCoverage(contracts, tests);
    expect(report.totalContracts).toBe(3);
    expect(report.coveredContracts).toBe(2);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].contractId).toBe('c2');
    expect(report.coveragePercent).toBeCloseTo(66.67, 1);
    expect(report.deploymentAllowed).toBe(false);
  });

  it('should pass gate verification with 100% coverage but all tests skipped', () => {
    const contract = makeContract('c1', 'dev', ['code'], ['Compile']);
    const tests: TestCase[] = [
      { id: 't1', name: 'skipped test', contractId: 'c1', requirementIds: [], status: 'skip' },
    ];

    const result = framework.runGateVerification([contract], tests);
    // Skipped tests are not failing, and basic coverage is satisfied (test exists for contract)
    expect(result.failingTests).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it('should treat coveredFields=[] and coveredVerificationSteps=[] as detailed metadata', () => {
    const contract = makeContract('c1', 'dev', ['code', 'tests'], ['Compile', 'Lint']);
    const tests: TestCase[] = [
      {
        id: 't1',
        name: 'empty detailed metadata',
        contractId: 'c1',
        requirementIds: [],
        status: 'pass',
        coveredFields: [],
        coveredVerificationSteps: [],
      },
    ];

    const report = framework.validateCoverage([contract], tests);
    // Empty arrays mean hasDetailedMetadata check: (length > 0) is false for both,
    // so it falls back to basic coverage (backward compat) → no gap
    expect(report.gaps).toHaveLength(0);
    expect(report.deploymentAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TraceabilityMatrix — requirement-to-test mapping
// ---------------------------------------------------------------------------

describe('TraceabilityMatrix — requirement-to-test mapping', () => {
  it('should be idempotent when mapping same test twice', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    matrix.mapTestToRequirements('test-1', ['1.1']);
    matrix.mapTestToRequirements('test-1', ['1.1']);

    const coverage = matrix.getRequirementCoverage('1.1');
    expect(coverage).toEqual(['test-1']);
  });

  it('should silently ignore non-existent requirement in mapTestToRequirements', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    // Map to a requirement that doesn't exist — should not throw
    matrix.mapTestToRequirements('test-1', ['1.1', 'non-existent']);

    const report = matrix.generateReport();
    expect(report.totalRequirements).toBe(1);
    expect(report.coveredRequirements).toBe(1);
  });

  it('should return 100% coverage for empty matrix', () => {
    const matrix = new TraceabilityMatrix();
    const report = matrix.generateReport();
    expect(report.totalRequirements).toBe(0);
    expect(report.coveredRequirements).toBe(0);
    expect(report.coveragePercent).toBe(100);
    expect(report.uncoveredRequirements).toEqual([]);
  });

  it('should correctly cover overlapping requirements via addTestCase', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    matrix.addRequirement('1.2', 'Agent state');
    matrix.addRequirement('1.3', 'Agent errors');

    matrix.addTestCase('tc-1', 'Deploy and state test', ['1.1', '1.2']);
    matrix.addTestCase('tc-2', 'State and error test', ['1.2', '1.3']);

    const report = matrix.generateReport();
    expect(report.totalRequirements).toBe(3);
    expect(report.coveredRequirements).toBe(3);
    expect(report.coveragePercent).toBe(100);

    // 1.2 should be covered by both test cases
    const coverage12 = matrix.getRequirementCoverage('1.2');
    expect(coverage12).toEqual(['tc-1', 'tc-2']);
  });

  it('should return a copy from getRequirementCoverage — mutating does not affect internal state', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    matrix.mapTestToRequirements('test-1', ['1.1']);

    const coverage = matrix.getRequirementCoverage('1.1');
    coverage.push('injected-test');

    // Internal state should be unaffected
    const coverageAgain = matrix.getRequirementCoverage('1.1');
    expect(coverageAgain).toEqual(['test-1']);
  });

  it('should preserve descriptions in report matrix entries', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    matrix.addRequirement('1.2', 'Agent state persistence');
    matrix.mapTestToRequirements('test-1', ['1.1']);

    const report = matrix.generateReport();
    const entry11 = report.matrix.find((m) => m.requirementId === '1.1');
    const entry12 = report.matrix.find((m) => m.requirementId === '1.2');

    expect(entry11?.description).toBe('Agent deployment');
    expect(entry12?.description).toBe('Agent state persistence');
  });
});

// ---------------------------------------------------------------------------
// DriverIntegrationTestRunner — driver validation before activation
// ---------------------------------------------------------------------------

describe('DriverIntegrationTestRunner — driver validation', () => {
  const runner = new DriverIntegrationTestRunner();

  it('should capture error message when test throws a string instead of Error', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      {
        id: 'tc-1',
        name: 'string throw',
        required: true,
        fn: async () => {
          throw 'something went wrong';
        },
      },
    ]);

    expect(report.failedTests).toBe(1);
    expect(report.results[0].passed).toBe(false);
    expect(report.results[0].error).toBe('something went wrong');
  });

  it('should count all required failures and reflect in summary', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      {
        id: 'tc-1',
        name: 'required fail 1',
        required: true,
        fn: async () => { throw new Error('fail 1'); },
      },
      {
        id: 'tc-2',
        name: 'required fail 2',
        required: true,
        fn: async () => { throw new Error('fail 2'); },
      },
      {
        id: 'tc-3',
        name: 'required fail 3',
        required: true,
        fn: async () => { throw new Error('fail 3'); },
      },
    ]);

    expect(report.failedTests).toBe(3);
    expect(report.activationAllowed).toBe(false);
    expect(report.summary).toContain('3 required test(s) failed');
    expect(report.summary).toContain('activation blocked');
  });

  it('should propagate custom driver name and version into report', async () => {
    const driver = createMockDriver('my-custom-driver', '2.5.0');
    const report = await runner.run(driver, [
      { id: 'tc-1', name: 'simple test', required: false, fn: async () => {} },
    ]);

    expect(report.driverName).toBe('my-custom-driver');
    expect(report.driverVersion).toBe('2.5.0');
  });

  it('should allow activation when all tests are optional and all fail', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      {
        id: 'tc-1',
        name: 'optional fail 1',
        required: false,
        fn: async () => { throw new Error('opt fail 1'); },
      },
      {
        id: 'tc-2',
        name: 'optional fail 2',
        required: false,
        fn: async () => { throw new Error('opt fail 2'); },
      },
    ]);

    expect(report.failedTests).toBe(2);
    expect(report.activationAllowed).toBe(true);
    expect(runner.canActivate(report)).toBe(true);
  });

  it('should preserve test execution order in results', async () => {
    const driver = createMockDriver();
    const report = await runner.run(driver, [
      { id: 'tc-a', name: 'first', required: true, fn: async () => {} },
      { id: 'tc-b', name: 'second', required: true, fn: async () => {} },
      { id: 'tc-c', name: 'third', required: true, fn: async () => {} },
    ]);

    expect(report.results.map((r) => r.testCaseId)).toEqual(['tc-a', 'tc-b', 'tc-c']);
    expect(report.results.map((r) => r.testCaseName)).toEqual(['first', 'second', 'third']);
  });

  it('should read activationAllowed correctly via canActivate', async () => {
    // Manually construct a report to test canActivate in isolation
    const allowedReport = {
      driverName: 'test',
      driverVersion: '1.0.0',
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      activationAllowed: true,
      results: [],
      timestamp: new Date(),
      summary: 'all good',
    };

    const blockedReport = {
      ...allowedReport,
      activationAllowed: false,
      summary: 'blocked',
    };

    expect(runner.canActivate(allowedReport)).toBe(true);
    expect(runner.canActivate(blockedReport)).toBe(false);
  });
});
