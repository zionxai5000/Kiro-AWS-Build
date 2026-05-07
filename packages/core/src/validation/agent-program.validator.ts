/**
 * Runtime validation for AgentProgram and related types.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const TestSuiteReferenceSchema = z.object({
  suiteId: z.string().min(1),
  path: z.string().min(1),
  requiredCoverage: z.number().min(0).max(100),
});

export const ChangelogEntrySchema = z.object({
  version: z.string().min(1),
  date: z.coerce.date(),
  author: z.string().min(1),
  description: z.string().min(1),
});

export const ModelPreferenceSchema = z.object({
  preferred: z.string().min(1),
  fallback: z.string().min(1),
  costCeiling: z.number().positive(),
  taskTypeOverrides: z.record(z.string(), z.string()).optional(),
});

export const AuthorityLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4']);

const semverRegex = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

export const SemverSchema = z.string().regex(semverRegex, 'Must be a valid semver string');

// ---------------------------------------------------------------------------
// AgentProgram Schema
// ---------------------------------------------------------------------------

/**
 * Full AgentProgram validation schema.
 *
 * Note: The `stateMachine` and `completionContracts` fields use lazy references
 * to avoid circular dependency issues. They are validated by their own schemas.
 */
export const AgentProgramSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  version: SemverSchema,
  pillar: z.string().min(1).max(100),

  // Behavior
  systemPrompt: z.string().min(1),
  tools: z.array(ToolDefinitionSchema),
  stateMachine: z.record(z.string(), z.unknown()), // validated separately via StateMachineDefinitionSchema
  completionContracts: z.array(z.record(z.string(), z.unknown())), // validated separately

  // Permissions
  authorityLevel: AuthorityLevelSchema,
  allowedActions: z.array(z.string()),
  deniedActions: z.array(z.string()),

  // Resources
  modelPreference: ModelPreferenceSchema,
  tokenBudget: z.object({
    daily: z.number().nonnegative(),
    monthly: z.number().nonnegative(),
  }),

  // Testing
  testSuite: TestSuiteReferenceSchema,

  // Metadata
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: z.string().min(1),
  changelog: z.array(ChangelogEntrySchema),
});

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export type ValidatedAgentProgram = z.infer<typeof AgentProgramSchema>;

/**
 * Runtime type guard for AgentProgram.
 * Returns true if the value conforms to the AgentProgram schema.
 */
export function isAgentProgram(value: unknown): value is ValidatedAgentProgram {
  return AgentProgramSchema.safeParse(value).success;
}

/**
 * Validates an AgentProgram and returns detailed errors if invalid.
 */
export function validateAgentProgram(value: unknown) {
  return AgentProgramSchema.safeParse(value);
}
