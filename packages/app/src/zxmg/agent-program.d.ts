/**
 * ZXMG Media Production — Agent Program Definition
 *
 * Defines the ZXMG agent program with a state machine for the content
 * lifecycle: planning → script-generation → asset-creation → video-assembly →
 * metadata-prep → platform-upload → published → monitoring.
 *
 * Authority level L4 (autonomous within bounds).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
import type { AgentProgram, StateMachineDefinition, CompletionContract } from '@seraphim/core';
export declare const ZXMG_STATE_MACHINE: StateMachineDefinition;
export declare const ZXMG_COMPLETION_CONTRACTS: CompletionContract[];
export declare const ZXMG_AGENT_PROGRAM: AgentProgram;
//# sourceMappingURL=agent-program.d.ts.map