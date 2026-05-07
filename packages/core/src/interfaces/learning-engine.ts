/**
 * Learning Engine interface — continuous improvement through pattern detection
 * and automated fix generation.
 */

import type {
  FailureEvent,
  RootCauseAnalysis,
  Pattern,
  FixProposal,
  ApplyResult,
  ImprovementMetrics,
} from '../types/learning.js';
import type { VerificationResult } from '../types/driver.js';

export interface LearningEngine {
  // Analysis
  analyzeFailure(failure: FailureEvent): Promise<RootCauseAnalysis>;
  detectPatterns(timeRange: { start: Date; end: Date }): Promise<Pattern[]>;

  // Fix Generation
  generateFix(pattern: Pattern): Promise<FixProposal>;
  verifyFix(proposal: FixProposal): Promise<VerificationResult>;
  applyFix(proposal: FixProposal): Promise<ApplyResult>;

  // Metrics
  getImprovementMetrics(): Promise<ImprovementMetrics>;
}
