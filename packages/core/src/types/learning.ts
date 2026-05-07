/**
 * Learning Engine data models.
 */

// ---------------------------------------------------------------------------
// Failure Event
// ---------------------------------------------------------------------------

export interface FailureEvent {
  id: string;
  agentId: string;
  taskId: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Root Cause Analysis
// ---------------------------------------------------------------------------

export interface RootCauseAnalysis {
  failureId: string;
  rootCause: string;
  confidence: number;
  relatedPatterns: string[];
  suggestedActions: string[];
}

// ---------------------------------------------------------------------------
// Pattern
// ---------------------------------------------------------------------------

export interface Pattern {
  id: string;
  description: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedAgents: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ---------------------------------------------------------------------------
// Versioned Change
// ---------------------------------------------------------------------------

export interface VersionedChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

// ---------------------------------------------------------------------------
// Fix Proposal
// ---------------------------------------------------------------------------

export interface FixProposal {
  id: string;
  patternId: string;
  targetType: 'agent_program' | 'workflow' | 'gate' | 'driver_config';
  targetId: string;
  changes: VersionedChange[];
  confidence: number;
  estimatedImpact: string;
}

// ---------------------------------------------------------------------------
// Apply Result
// ---------------------------------------------------------------------------

export interface ApplyResult {
  success: boolean;
  proposalId: string;
  appliedChanges: VersionedChange[];
  rollbackId?: string;
}

// ---------------------------------------------------------------------------
// Improvement Metrics
// ---------------------------------------------------------------------------

export interface ImprovementMetrics {
  repeatFailureRate: number;
  autonomousResolutionRate: number;
  meanTimeToResolution: number;
  fixSuccessRate: number;
  totalFixesApplied: number;
}
