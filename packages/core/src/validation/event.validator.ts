/**
 * Runtime validation for SeraphimEvent envelope and SystemEvent.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// SystemEvent Schema
// ---------------------------------------------------------------------------

export const SystemEventSchema = z.object({
  source: z.string().min(1),
  type: z.string().min(1),
  detail: z.record(z.string(), z.unknown()),
  metadata: z.object({
    tenantId: z.string().uuid(),
    correlationId: z.string().uuid(),
    timestamp: z.coerce.date(),
  }),
});

// ---------------------------------------------------------------------------
// SeraphimEvent Schema (full event envelope with schema versioning)
// ---------------------------------------------------------------------------

const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const SeraphimEventSchema = z.object({
  id: z.string().uuid(),
  source: z
    .string()
    .min(1)
    .regex(/^seraphim\./, 'source must start with "seraphim."'),
  type: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, 'type must be dot-separated lowercase segments'),
  version: z.literal('1.0'),
  time: z.string().regex(iso8601Regex, 'time must be a valid ISO 8601 string'),
  tenantId: z.string().uuid(),
  correlationId: z.string().uuid(),

  detail: z.record(z.string(), z.unknown()),

  metadata: z.object({
    schemaVersion: z.string().min(1),
    producerVersion: z.string().min(1),
  }),
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export type ValidatedSystemEvent = z.infer<typeof SystemEventSchema>;
export type ValidatedSeraphimEvent = z.infer<typeof SeraphimEventSchema>;

/**
 * Runtime type guard for SystemEvent.
 */
export function isSystemEvent(value: unknown): value is ValidatedSystemEvent {
  return SystemEventSchema.safeParse(value).success;
}

/**
 * Runtime type guard for SeraphimEvent.
 */
export function isSeraphimEvent(value: unknown): value is ValidatedSeraphimEvent {
  return SeraphimEventSchema.safeParse(value).success;
}

/**
 * Validates a SystemEvent and returns detailed errors if invalid.
 */
export function validateSystemEvent(value: unknown) {
  return SystemEventSchema.safeParse(value);
}

/**
 * Validates a SeraphimEvent envelope and returns detailed errors if invalid.
 */
export function validateSeraphimEvent(value: unknown) {
  return SeraphimEventSchema.safeParse(value);
}
