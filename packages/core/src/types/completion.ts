/**
 * Completion contract data models.
 */

// ---------------------------------------------------------------------------
// JSON Schema (lightweight representation)
// ---------------------------------------------------------------------------

export type JSONSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Verification Step
// ---------------------------------------------------------------------------

export interface VerificationStep {
  name: string;
  type: 'schema_validation' | 'external_check' | 'agent_verification' | 'automated_test';
  config: Record<string, unknown>;
  required: boolean;
  timeout: number;
}

// ---------------------------------------------------------------------------
// Completion Contract
// ---------------------------------------------------------------------------

export interface CompletionContract {
  id: string;
  workflowType: string;
  version: string;

  /** JSON Schema for required outputs */
  outputSchema: JSONSchema;

  /** Verification steps */
  verificationSteps: VerificationStep[];

  // Metadata
  description: string;
  createdAt: Date;
}
