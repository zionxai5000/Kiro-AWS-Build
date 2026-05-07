/**
 * Core enums for SeraphimOS.
 *
 * These are defined as string literal union types for maximum TypeScript
 * ergonomics, with companion const objects for runtime iteration.
 */

// ---------------------------------------------------------------------------
// Memory Layer
// ---------------------------------------------------------------------------

/** The four layers of the Zikaron persistent memory system. */
export type MemoryLayer = 'episodic' | 'semantic' | 'procedural' | 'working';

export const MemoryLayer = {
  Episodic: 'episodic',
  Semantic: 'semantic',
  Procedural: 'procedural',
  Working: 'working',
} as const satisfies Record<string, MemoryLayer>;

// ---------------------------------------------------------------------------
// Driver Status
// ---------------------------------------------------------------------------

/** Lifecycle states for a Driver adapter. */
export type DriverStatus = 'disconnected' | 'connecting' | 'ready' | 'executing' | 'error';

export const DriverStatus = {
  Disconnected: 'disconnected',
  Connecting: 'connecting',
  Ready: 'ready',
  Executing: 'executing',
  Error: 'error',
} as const satisfies Record<string, DriverStatus>;

// ---------------------------------------------------------------------------
// Agent State
// ---------------------------------------------------------------------------

/** Lifecycle states for an Agent instance. */
export type AgentState = 'initializing' | 'ready' | 'executing' | 'degraded' | 'terminated';

export const AgentState = {
  Initializing: 'initializing',
  Ready: 'ready',
  Executing: 'executing',
  Degraded: 'degraded',
  Terminated: 'terminated',
} as const satisfies Record<string, AgentState>;

// ---------------------------------------------------------------------------
// Authority Level
// ---------------------------------------------------------------------------

/**
 * Mishmar authority levels.
 *
 * - L1 — requires King approval
 * - L2 — requires designated authority approval
 * - L3 — requires peer verification
 * - L4 — autonomous within defined bounds
 */
export type AuthorityLevel = 'L1' | 'L2' | 'L3' | 'L4';

export const AuthorityLevel = {
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  L4: 'L4',
} as const satisfies Record<string, AuthorityLevel>;
