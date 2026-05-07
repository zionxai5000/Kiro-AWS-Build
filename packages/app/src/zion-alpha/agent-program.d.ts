/**
 * Zion Alpha Trading — Agent Program Definition
 *
 * Defines the Zion Alpha agent program with a state machine for the trading
 * lifecycle: scanning → evaluating → positioning → monitoring → exiting → settled.
 *
 * Authority level L3 (peer verification for trades above threshold).
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
import type { AgentProgram, StateMachineDefinition, CompletionContract } from '@seraphim/core';
export declare const ZION_ALPHA_STATE_MACHINE: StateMachineDefinition;
export declare const ZION_ALPHA_COMPLETION_CONTRACTS: CompletionContract[];
export declare const ZION_ALPHA_AGENT_PROGRAM: AgentProgram;
//# sourceMappingURL=agent-program.d.ts.map