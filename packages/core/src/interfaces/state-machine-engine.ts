/**
 * State Machine Engine interface — executes declarative state machine definitions.
 */

import type {
  StateMachineDefinition,
  StateMachineInstance,
  TransitionContext,
  TransitionResult,
  TransitionRecord,
  InstanceFilter,
} from '../types/state-machine.js';

export interface StateMachineEngine {
  // Definition management
  register(definition: StateMachineDefinition): Promise<string>;
  update(definitionId: string, newDef: StateMachineDefinition): Promise<void>;

  // Execution
  createInstance(
    definitionId: string,
    entityId: string,
    initialData?: Record<string, unknown>,
  ): Promise<StateMachineInstance>;
  transition(
    instanceId: string,
    event: string,
    context: TransitionContext,
  ): Promise<TransitionResult>;
  getState(instanceId: string): Promise<StateMachineInstance>;

  // Query
  listInstances(filter?: InstanceFilter): Promise<StateMachineInstance[]>;
  getHistory(instanceId: string): Promise<TransitionRecord[]>;
}
