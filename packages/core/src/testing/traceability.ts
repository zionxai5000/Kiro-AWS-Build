/**
 * Testing Infrastructure — Requirement Traceability
 *
 * Requirement-to-test traceability matrix: maps each requirement to its
 * test cases, reports coverage gaps.
 *
 * Requirements: 19.2, 19.3, 19.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequirementMapping {
  requirementId: string;
  description: string;
  testCaseIds: string[];
}

export interface TraceabilityReport {
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: string[];
  coveragePercent: number;
  matrix: RequirementMapping[];
}

/** Richer test case entry for the traceability matrix. */
export interface TrackedTestCase {
  id: string;
  name: string;
  requirementIds: string[];
}

/** Structured export format for CI/CD reporting. */
export interface TraceabilityExport {
  generatedAt: Date;
  totalRequirements: number;
  coveredRequirements: number;
  coveragePercent: number;
  requirements: Array<{
    id: string;
    description: string;
    covered: boolean;
    testCaseIds: string[];
  }>;
  testCases: TrackedTestCase[];
}

// ---------------------------------------------------------------------------
// TraceabilityMatrix
// ---------------------------------------------------------------------------

export class TraceabilityMatrix {
  private mappings = new Map<string, RequirementMapping>();
  private testCases = new Map<string, TrackedTestCase>();

  /**
   * Register a requirement.
   */
  addRequirement(id: string, description: string): void {
    this.mappings.set(id, { requirementId: id, description, testCaseIds: [] });
  }

  /**
   * Map a test case to one or more requirements.
   */
  mapTestToRequirements(testCaseId: string, requirementIds: string[]): void {
    for (const reqId of requirementIds) {
      const mapping = this.mappings.get(reqId);
      if (mapping && !mapping.testCaseIds.includes(testCaseId)) {
        mapping.testCaseIds.push(testCaseId);
      }
    }
  }

  /**
   * Add a test case with richer metadata and automatically map it to its
   * requirements.
   *
   * Requirements: 19.4
   */
  addTestCase(id: string, name: string, requirementIds: string[]): void {
    this.testCases.set(id, { id, name, requirementIds });
    this.mapTestToRequirements(id, requirementIds);
  }

  /**
   * Query coverage for a specific requirement.
   *
   * Returns the list of test case IDs covering the requirement, or an
   * empty array if the requirement is not registered.
   *
   * Requirements: 19.4
   */
  getRequirementCoverage(requirementId: string): string[] {
    const mapping = this.mappings.get(requirementId);
    return mapping ? [...mapping.testCaseIds] : [];
  }

  /**
   * Convenience method returning all requirement IDs that have zero test
   * coverage.
   *
   * Requirements: 19.4
   */
  getUncoveredRequirements(): string[] {
    const uncovered: string[] = [];
    for (const [, mapping] of this.mappings) {
      if (mapping.testCaseIds.length === 0) {
        uncovered.push(mapping.requirementId);
      }
    }
    return uncovered;
  }

  /**
   * Generate a traceability report.
   */
  generateReport(): TraceabilityReport {
    const matrix = Array.from(this.mappings.values());
    const uncovered = matrix.filter((m) => m.testCaseIds.length === 0).map((m) => m.requirementId);
    const covered = matrix.length - uncovered.length;

    return {
      totalRequirements: matrix.length,
      coveredRequirements: covered,
      uncoveredRequirements: uncovered,
      coveragePercent: matrix.length > 0 ? (covered / matrix.length) * 100 : 100,
      matrix,
    };
  }

  /**
   * Export the full traceability matrix in a structured format suitable
   * for CI/CD reporting and artifact storage.
   *
   * Requirements: 19.3, 19.4
   */
  exportMatrix(): TraceabilityExport {
    const report = this.generateReport();

    return {
      generatedAt: new Date(),
      totalRequirements: report.totalRequirements,
      coveredRequirements: report.coveredRequirements,
      coveragePercent: report.coveragePercent,
      requirements: report.matrix.map((m) => ({
        id: m.requirementId,
        description: m.description,
        covered: m.testCaseIds.length > 0,
        testCaseIds: [...m.testCaseIds],
      })),
      testCases: Array.from(this.testCases.values()),
    };
  }
}
