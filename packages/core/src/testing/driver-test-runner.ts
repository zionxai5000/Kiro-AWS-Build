/**
 * Driver Integration Test Runner
 *
 * Executes integration tests for every driver before activation in
 * production. Blocks driver activation if any required test fails.
 *
 * Requirements: 19.2, 10.5
 */

import type { Driver } from '../interfaces/driver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single integration test case for a driver. */
export interface DriverTestCase {
  id: string;
  name: string;
  /** When true the test must pass for the driver to be activated. */
  required: boolean;
  /**
   * The test function. Receives the driver instance and should throw on
   * failure. Returning without throwing is treated as a pass.
   */
  fn: (driver: Driver) => Promise<void>;
}

/** Result of a single test case execution. */
export interface DriverTestResult {
  testCaseId: string;
  testCaseName: string;
  required: boolean;
  passed: boolean;
  durationMs: number;
  error?: string;
}

/** Aggregate result of running all integration tests for a driver. */
export interface DriverTestRunReport {
  driverName: string;
  driverVersion: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  activationAllowed: boolean;
  results: DriverTestResult[];
  timestamp: Date;
  summary: string;
}

// ---------------------------------------------------------------------------
// DriverIntegrationTestRunner
// ---------------------------------------------------------------------------

export class DriverIntegrationTestRunner {
  /**
   * Run all integration test cases against a driver and return a report.
   *
   * The driver is **not** connected or disconnected by the runner — the
   * caller is responsible for lifecycle management (or the tests
   * themselves can call `connect` / `disconnect` as needed).
   *
   * Activation is blocked when **any required** test fails.
   */
  async run(
    driver: Driver,
    testCases: DriverTestCase[],
  ): Promise<DriverTestRunReport> {
    const results: DriverTestResult[] = [];

    for (const tc of testCases) {
      const start = Date.now();
      let passed = true;
      let error: string | undefined;

      try {
        await tc.fn(driver);
      } catch (err) {
        passed = false;
        error = err instanceof Error ? err.message : String(err);
      }

      results.push({
        testCaseId: tc.id,
        testCaseName: tc.name,
        required: tc.required,
        passed,
        durationMs: Date.now() - start,
        error,
      });
    }

    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.length - passedTests;
    const requiredFailures = results.filter((r) => r.required && !r.passed);
    const activationAllowed = requiredFailures.length === 0;

    const summaryParts: string[] = [
      `${passedTests}/${results.length} tests passed`,
    ];
    if (requiredFailures.length > 0) {
      summaryParts.push(
        `${requiredFailures.length} required test(s) failed — activation blocked`,
      );
    }

    return {
      driverName: driver.name,
      driverVersion: driver.version,
      totalTests: results.length,
      passedTests,
      failedTests,
      activationAllowed,
      results,
      timestamp: new Date(),
      summary: summaryParts.join('; '),
    };
  }

  /**
   * Convenience: returns `true` when the driver may be activated based on
   * the test run report.
   */
  canActivate(report: DriverTestRunReport): boolean {
    return report.activationAllowed;
  }
}
