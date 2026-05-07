/**
 * ZionX App Factory — Agent Program Definition
 *
 * Defines the ZionX agent program with a full state machine for the app
 * lifecycle: ideation → market-research → development → testing → gate-review →
 * submission → in-review → approved/rejected → live → marketing →
 * revenue-optimizing → deprecated.
 *
 * Authority level L4 (autonomous within bounds).
 * Model preference: Tier 2 minimum for code generation.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11b.1, 11b.2, 11b.3,
 *               11b.4, 11b.5, 11b.6, 11b.7, 11b.8, 11b.9, 11b.10
 */
import type { AgentProgram, StateMachineDefinition, CompletionContract } from '@seraphim/core';
export declare const ZIONX_STATE_MACHINE: StateMachineDefinition;
export declare const ZIONX_COMPLETION_CONTRACTS: CompletionContract[];
export declare const ZIONX_AGENT_PROGRAM: AgentProgram;
//# sourceMappingURL=agent-program.d.ts.map