/**
 * Marketplace — Program Validation
 *
 * Validates published programs meet quality standards.
 *
 * Requirements: 17.1
 */

export interface ProgramValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateProgram(program: {
  hasTestSuite: boolean;
  hasCompletionContracts: boolean;
  hasDocumentation: boolean;
  testCoverage?: number;
}): ProgramValidationResult {
  const issues: string[] = [];
  if (!program.hasTestSuite) issues.push('Test suite is required');
  if (!program.hasCompletionContracts) issues.push('Completion contracts are required');
  if (!program.hasDocumentation) issues.push('Documentation is required');
  if (program.testCoverage !== undefined && program.testCoverage < 80) {
    issues.push(`Test coverage (${program.testCoverage}%) is below minimum (80%)`);
  }
  return { valid: issues.length === 0, issues };
}
