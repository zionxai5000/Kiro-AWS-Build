/**
 * Testing Infrastructure — Test Framework
 *
 * Test harness that validates Agent_Program test suites cover all
 * Completion_Contract conditions, blocks deployment if coverage gaps exist.
 *
 * Requirements: 19.1, 19.4, 19.5
 */

import type { CompletionContract } from '../types/completion.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoverageGap {
  contractId: string;
  workflowType: string;
  missingFields: string[];
  missingVerificationSteps: string[];
}

export interface CoverageReport {
  totalContracts: number;
  coveredContracts: number;
  gaps: CoverageGap[];
  coveragePercent: number;
  deploymentAllowed: boolean;
}

export interface TestCase {
  id: string;
  name: string;
  contractId?: string;
  requirementIds: string[];
  status: 'pass' | 'fail' | 'skip';
  /** Optional: output schema fields this test covers. */
  coveredFields?: string[];
  /** Optional: verification step names this test covers. */
  coveredVerificationSteps?: string[];
}

/** Result of a CI/CD gate verification run. */
export interface GateVerificationResult {
  passed: boolean;
  timestamp: Date;
  coverageReport: CoverageReport;
  failingTests: TestCase[];
  summary: string;
}

/** Minimal AgentProgram shape needed for test suite validation. */
export interface AgentProgramTestTarget {
  id: string;
  name: string;
  completionContracts: CompletionContract[];
}

// ---------------------------------------------------------------------------
// TestFramework
// ---------------------------------------------------------------------------

export class TestFramework {
  /**
   * Validate that test cases cover all completion contract conditions.
   *
   * When test cases carry `coveredFields` / `coveredVerificationSteps`
   * metadata the framework performs per-field and per-step gap analysis.
   * Otherwise it falls back to the original "any test exists" check so
   * that existing callers remain backward-compatible.
   */
  validateCoverage(
    contracts: CompletionContract[],
    testCases: TestCase[],
  ): CoverageReport {
    const gaps: CoverageGap[] = [];
    let coveredCount = 0;

    for (const contract of contracts) {
      const contractTests = testCases.filter((t) => t.contractId === contract.id);

      if (contractTests.length === 0) {
        // No tests at all — everything is missing.
        const requiredFields = (contract.outputSchema.required as string[]) ?? [];
        gaps.push({
          contractId: contract.id,
          workflowType: contract.workflowType,
          missingFields: requiredFields,
          missingVerificationSteps: contract.verificationSteps.map((s) => s.name),
        });
        continue;
      }

      // Per-field and per-verification-step analysis when metadata is present.
      const gap = this.analyzeDetailedCoverage(contract, contractTests);
      if (gap) {
        gaps.push(gap);
      } else {
        coveredCount++;
      }
    }

    const coveragePercent =
      contracts.length > 0 ? (coveredCount / contracts.length) * 100 : 100;

    return {
      totalContracts: contracts.length,
      coveredContracts: coveredCount,
      gaps,
      coveragePercent,
      deploymentAllowed: gaps.length === 0,
    };
  }

  /**
   * Check if deployment should be blocked due to coverage gaps.
   */
  shouldBlockDeployment(report: CoverageReport): boolean {
    return !report.deploymentAllowed;
  }

  /**
   * Validate test coverage for an Agent_Program's completion contracts.
   *
   * This is a convenience wrapper that extracts the contracts from the
   * agent program and delegates to `validateCoverage`.
   *
   * Requirements: 19.1, 19.5
   */
  validateAgentProgramTestSuite(
    agentProgram: AgentProgramTestTarget,
    testCases: TestCase[],
  ): CoverageReport {
    return this.validateCoverage(agentProgram.completionContracts, testCases);
  }

  /**
   * Run a full gate verification suitable for CI/CD integration.
   *
   * Returns a pass/fail result that includes the coverage report,
   * any failing tests, and a human-readable summary.
   *
   * Requirements: 19.3, 19.5
   */
  runGateVerification(
    contracts: CompletionContract[],
    testCases: TestCase[],
  ): GateVerificationResult {
    const coverageReport = this.validateCoverage(contracts, testCases);
    const failingTests = testCases.filter((t) => t.status === 'fail');

    const passed = coverageReport.deploymentAllowed && failingTests.length === 0;

    const summaryParts: string[] = [];
    if (!coverageReport.deploymentAllowed) {
      summaryParts.push(
        `Coverage gaps in ${coverageReport.gaps.length} contract(s)`,
      );
    }
    if (failingTests.length > 0) {
      summaryParts.push(`${failingTests.length} test(s) failing`);
    }

    const summary = passed
      ? `Gate passed: ${coverageReport.coveragePercent}% coverage, all tests passing`
      : `Gate failed: ${summaryParts.join('; ')}`;

    return {
      passed,
      timestamp: new Date(),
      coverageReport,
      failingTests,
      summary,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Analyse per-field and per-verification-step coverage for a single
   * contract. Returns a `CoverageGap` if any required field or step is
   * uncovered, or `null` when fully covered.
   */
  private analyzeDetailedCoverage(
    contract: CompletionContract,
    contractTests: TestCase[],
  ): CoverageGap | null {
    const hasDetailedMetadata = contractTests.some(
      (t) =>
        (t.coveredFields && t.coveredFields.length > 0) ||
        (t.coveredVerificationSteps && t.coveredVerificationSteps.length > 0),
    );

    if (!hasDetailedMetadata) {
      // No detailed metadata — treat as fully covered (backward compat).
      return null;
    }

    const requiredFields = (contract.outputSchema.required as string[]) ?? [];
    const verificationStepNames = contract.verificationSteps.map((s) => s.name);

    const coveredFieldSet = new Set<string>();
    const coveredStepSet = new Set<string>();

    for (const test of contractTests) {
      if (test.coveredFields) {
        for (const f of test.coveredFields) coveredFieldSet.add(f);
      }
      if (test.coveredVerificationSteps) {
        for (const s of test.coveredVerificationSteps) coveredStepSet.add(s);
      }
    }

    const missingFields = requiredFields.filter((f) => !coveredFieldSet.has(f));
    const missingVerificationSteps = verificationStepNames.filter(
      (s) => !coveredStepSet.has(s),
    );

    if (missingFields.length === 0 && missingVerificationSteps.length === 0) {
      return null;
    }

    return {
      contractId: contract.id,
      workflowType: contract.workflowType,
      missingFields,
      missingVerificationSteps,
    };
  }
}
