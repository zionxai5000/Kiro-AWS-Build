/**
 * Runtime validation for StateMachineDefinition and related types.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const ActionDefinitionSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});

export const StateTypeSchema = z.enum(['initial', 'active', 'terminal', 'error']);

export const StateDefinitionSchema = z.object({
  name: z.string().min(1),
  type: StateTypeSchema,
  onEnter: z.array(ActionDefinitionSchema).optional(),
  onExit: z.array(ActionDefinitionSchema).optional(),
  timeout: z
    .object({
      duration: z.number().positive(),
      transitionTo: z.string().min(1),
    })
    .optional(),
});

export const GateTypeSchema = z.enum(['condition', 'approval', 'validation', 'external']);

export const GateDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: GateTypeSchema,
  config: z.record(z.string(), z.unknown()),
  required: z.boolean(),
});

export const TransitionDefinitionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  event: z.string().min(1),
  gates: z.array(GateDefinitionSchema),
  actions: z.array(ActionDefinitionSchema).optional(),
});

// ---------------------------------------------------------------------------
// StateMachineDefinition Schema
// ---------------------------------------------------------------------------

export const StateMachineDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(255),
    version: z.string().min(1),

    states: z.record(z.string(), StateDefinitionSchema),
    initialState: z.string().min(1),
    terminalStates: z.array(z.string().min(1)).min(1),

    transitions: z.array(TransitionDefinitionSchema),

    metadata: z.object({
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
      description: z.string(),
    }),
  })
  .superRefine((data, ctx) => {
    const stateNames = Object.keys(data.states);

    // initialState must exist in states
    if (!stateNames.includes(data.initialState)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `initialState "${data.initialState}" is not defined in states`,
        path: ['initialState'],
      });
    }

    // All terminal states must exist in states
    for (const terminal of data.terminalStates) {
      if (!stateNames.includes(terminal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `terminalState "${terminal}" is not defined in states`,
          path: ['terminalStates'],
        });
      }
    }

    // All transition from/to must reference existing states
    for (let i = 0; i < data.transitions.length; i++) {
      const t = data.transitions[i];
      if (!stateNames.includes(t.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `transition[${i}].from "${t.from}" is not defined in states`,
          path: ['transitions', i, 'from'],
        });
      }
      if (!stateNames.includes(t.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `transition[${i}].to "${t.to}" is not defined in states`,
          path: ['transitions', i, 'to'],
        });
      }
    }

    // initialState should be of type 'initial'
    const initialStateDef = data.states[data.initialState];
    if (initialStateDef && initialStateDef.type !== 'initial') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `initialState "${data.initialState}" should have type "initial" but has type "${initialStateDef.type}"`,
        path: ['initialState'],
      });
    }

    // terminal states should be of type 'terminal'
    for (const terminal of data.terminalStates) {
      const terminalDef = data.states[terminal];
      if (terminalDef && terminalDef.type !== 'terminal') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `terminalState "${terminal}" should have type "terminal" but has type "${terminalDef.type}"`,
          path: ['terminalStates'],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

export type ValidatedStateMachineDefinition = z.infer<typeof StateMachineDefinitionSchema>;

/**
 * Runtime type guard for StateMachineDefinition.
 */
export function isStateMachineDefinition(value: unknown): value is ValidatedStateMachineDefinition {
  return StateMachineDefinitionSchema.safeParse(value).success;
}

/**
 * Validates a StateMachineDefinition and returns detailed errors if invalid.
 */
export function validateStateMachineDefinition(value: unknown) {
  return StateMachineDefinitionSchema.safeParse(value);
}
