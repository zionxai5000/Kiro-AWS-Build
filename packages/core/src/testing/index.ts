/**
 * @seraphim/core — Testing Infrastructure
 *
 * Test framework, traceability matrix, and driver integration test runner.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5
 */

export { TestFramework } from './framework.js';
export type {
  CoverageGap,
  CoverageReport,
  TestCase,
  GateVerificationResult,
  AgentProgramTestTarget,
} from './framework.js';

export { TraceabilityMatrix } from './traceability.js';
export type {
  RequirementMapping,
  TraceabilityReport,
  TrackedTestCase,
  TraceabilityExport,
} from './traceability.js';

export { DriverIntegrationTestRunner } from './driver-test-runner.js';
export type {
  DriverTestCase,
  DriverTestResult,
  DriverTestRunReport,
} from './driver-test-runner.js';
