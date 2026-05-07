/**
 * State machine data models.
 */

// ---------------------------------------------------------------------------
// Action Definition (used by states and transitions)
// ---------------------------------------------------------------------------

export interface ActionDefinition {
  type: string;
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State Definition
// ---------------------------------------------------------------------------

export interface StateDefinition {
  name: string;
  type: 'initial' | 'active' | 'terminal' | 'error';
  onEnter?: ActionDefinition[];
  onExit?: ActionDefinition[];
  timeout?: { duration: number; transitionTo: string };
}

// ---------------------------------------------------------------------------
// Gate Definition
// ---------------------------------------------------------------------------

export interface GateDefinition {
  id: string;
  name: string;
  type: 'condition' | 'approval' | 'validation' | 'external';
  config: Record<string, unknown>;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Transition Definition
// ---------------------------------------------------------------------------

export interface TransitionDefinition {
  from: string;
  to: string;
  event: string;
  gates: GateDefinition[];
  actions?: ActionDefinition[];
}

// ---------------------------------------------------------------------------
// State Machine Definition
// ---------------------------------------------------------------------------

export interface StateMachineDefinition {
  id: string;
  name: string;
  version: string;

  states: Record<string, StateDefinition>;
  initialState: string;
  terminalStates: string[];

  transitions: TransitionDefinition[];

  metadata: {
    createdAt: Date;
    updatedAt: Date;
    description: string;
  };
}

// ---------------------------------------------------------------------------
// State Machine Instance
// ---------------------------------------------------------------------------

export interface StateMachineInstance {
  id: string;
  definitionId: string;
  entityId: string;
  tenantId: string;
  currentState: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Instance Filter
// ---------------------------------------------------------------------------

export interface InstanceFilter {
  definitionId?: string;
  entityId?: string;
  tenantId?: string;
  currentState?: string;
}

// ---------------------------------------------------------------------------
// Transition Context
// ---------------------------------------------------------------------------

export interface TransitionContext {
  triggeredBy: string;
  tenantId: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transition Result
// ---------------------------------------------------------------------------

export interface TransitionResult {
  success: boolean;
  previousState: string;
  newState: string;
  gateResults: GateResult[];
  rejectionReason?: string;
  auditId: string;
}

// ---------------------------------------------------------------------------
// Gate Result
// ---------------------------------------------------------------------------

export interface GateResult {
  gateId: string;
  gateName: string;
  passed: boolean;
  details: string;
}

// ---------------------------------------------------------------------------
// Transition Record (history)
// ---------------------------------------------------------------------------

export interface TransitionRecord {
  id: string;
  instanceId: string;
  previousState: string;
  newState: string;
  event: string;
  triggeredBy: string;
  gateResults: GateResult[];
  timestamp: Date;
}
