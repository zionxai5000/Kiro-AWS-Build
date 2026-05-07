/**
 * Unit tests for Testing Infrastructure
 * Validates: Requirements 19.1, 19.4, 19.5
 */

import { describe, it, expect } from 'vitest';
import { TestFramework } from '../framework.js';
import { TraceabilityMatrix } from '../traceability.js';
import type { CompletionContract } from '../../types/completion.js';

describe('TestFramework', () => {
  const framework = new TestFramework();

  const sampleContracts: CompletionContract[] = [
    {
      id: 'contract-1',
      workflowType: 'development',
      version: '1.0.0',
      outputSchema: { type: 'object', required: ['sourceCode'], properties: { sourceCode: { type: 'string' } } },
      verificationSteps: [{ name: 'Code compiles', type: 'automated_test', config: {}, required: true, timeout: 60000 }],
      description: 'Dev contract',
      createdAt: new Date(),
    },
    {
      id: 'contract-2',
      workflowType: 'testing',
      version: '1.0.0',
      outputSchema: { type: 'object', required: ['testResults'], properties: { testResults: { type: 'object' } } },
      verificationSteps: [{ name: 'Tests pass', type: 'automated_test', config: {}, required: true, timeout: 60000 }],
      description: 'Test contract',
      createdAt: new Date(),
    },
  ];

  it('should detect coverage gaps when contracts have no tests', () => {
    const report = framework.validateCoverage(sampleContracts, []);
    expect(report.gaps).toHaveLength(2);
    expect(report.deploymentAllowed).toBe(false);
    expect(report.coveragePercent).toBe(0);
  });

  it('should allow deployment when all contracts are covered', () => {
    const report = framework.validateCoverage(sampleContracts, [
      { id: 't1', name: 'Test dev', contractId: 'contract-1', requirementIds: [], status: 'pass' },
      { id: 't2', name: 'Test testing', contractId: 'contract-2', requirementIds: [], status: 'pass' },
    ]);
    expect(report.gaps).toHaveLength(0);
    expect(report.deploymentAllowed).toBe(true);
    expect(report.coveragePercent).toBe(100);
  });

  it('should block deployment when gaps exist', () => {
    const report = framework.validateCoverage(sampleContracts, [
      { id: 't1', name: 'Test dev', contractId: 'contract-1', requirementIds: [], status: 'pass' },
    ]);
    expect(framework.shouldBlockDeployment(report)).toBe(true);
  });
});

describe('TraceabilityMatrix', () => {
  it('should map tests to requirements', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    matrix.addRequirement('1.2', 'Agent state persistence');
    matrix.mapTestToRequirements('test-1', ['1.1']);
    matrix.mapTestToRequirements('test-2', ['1.1', '1.2']);

    const report = matrix.generateReport();
    expect(report.totalRequirements).toBe(2);
    expect(report.coveredRequirements).toBe(2);
    expect(report.uncoveredRequirements).toHaveLength(0);
    expect(report.coveragePercent).toBe(100);
  });

  it('should report uncovered requirements', () => {
    const matrix = new TraceabilityMatrix();
    matrix.addRequirement('1.1', 'Agent deployment');
    matrix.addRequirement('1.2', 'Agent state persistence');
    matrix.mapTestToRequirements('test-1', ['1.1']);

    const report = matrix.generateReport();
    expect(report.uncoveredRequirements).toEqual(['1.2']);
    expect(report.coveragePercent).toBe(50);
  });
});
