/**
 * Runtime validation schemas and type guards for SeraphimOS core data models.
 *
 * Uses Zod for schema validation, providing both compile-time type safety
 * and runtime validation for data crossing trust boundaries (API inputs,
 * event payloads, database reads, driver responses).
 */

export * from './agent-program.validator.js';
export * from './state-machine.validator.js';
export * from './event.validator.js';
