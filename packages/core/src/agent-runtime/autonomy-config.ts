/**
 * Autonomy Mode Configuration — Crawl / Walk / Run modes per agent.
 *
 * Requirements: 53.1, 53.2, 53.3, 53.4, 53.5, 53.6, 53.7, 53.8
 */

export type AutonomyMode = 'crawl' | 'walk' | 'run';

export interface HumanGate {
  workflowType: string;
  gatePoint: string;
  requiredInModes: AutonomyMode[];
  bypassableInRun: boolean;
}

export interface EscalationPolicy {
  promoteAfterSuccesses: number;
  demoteAfterFailures: number;
  requireKingApprovalToPromote: boolean;
}

export interface AutonomyConfig {
  agentId: string;
  defaultMode: AutonomyMode;
  workflowOverrides: Record<string, AutonomyMode>;
  escalationPolicy: EscalationPolicy;
  humanGates: HumanGate[];
}

/**
 * Get the effective autonomy mode for a given agent and workflow type.
 */
export function getEffectiveMode(config: AutonomyConfig, workflowType?: string): AutonomyMode {
  if (workflowType && config.workflowOverrides[workflowType]) {
    return config.workflowOverrides[workflowType]!;
  }
  return config.defaultMode;
}

/**
 * Check if a human gate is required at the current point.
 */
export function requiresHumanGate(config: AutonomyConfig, workflowType: string, gatePoint: string, currentMode: AutonomyMode): boolean {
  const gate = config.humanGates.find(g => g.workflowType === workflowType && g.gatePoint === gatePoint);
  if (!gate) return false;
  if (currentMode === 'run' && gate.bypassableInRun) return false;
  return gate.requiredInModes.includes(currentMode);
}

/**
 * Determine if autonomy should be escalated based on success/failure history.
 */
export function shouldEscalate(config: AutonomyConfig, consecutiveSuccesses: number, consecutiveFailures: number): { action: 'promote' | 'demote' | 'none'; reason: string } {
  if (consecutiveFailures >= config.escalationPolicy.demoteAfterFailures) {
    return { action: 'demote', reason: `${consecutiveFailures} consecutive failures exceeded threshold` };
  }
  if (consecutiveSuccesses >= config.escalationPolicy.promoteAfterSuccesses) {
    return { action: 'promote', reason: `${consecutiveSuccesses} consecutive successes met promotion threshold` };
  }
  return { action: 'none', reason: 'Within normal operating parameters' };
}

/**
 * Default autonomy configs for SeraphimOS agents.
 */
export const DEFAULT_AUTONOMY_CONFIGS: Record<string, AutonomyConfig> = {
  'seraphim-core': {
    agentId: 'seraphim-core',
    defaultMode: 'run',
    workflowOverrides: {},
    escalationPolicy: { promoteAfterSuccesses: 5, demoteAfterFailures: 3, requireKingApprovalToPromote: false },
    humanGates: [],
  },
  'zionx-app-factory': {
    agentId: 'zionx-app-factory',
    defaultMode: 'walk',
    workflowOverrides: { 'app_submission': 'walk', 'app_development': 'run' },
    escalationPolicy: { promoteAfterSuccesses: 10, demoteAfterFailures: 2, requireKingApprovalToPromote: true },
    humanGates: [
      { workflowType: 'app_submission', gatePoint: 'before_submission', requiredInModes: ['crawl', 'walk'], bypassableInRun: true },
    ],
  },
  'zxmg-media-production': {
    agentId: 'zxmg-media-production',
    defaultMode: 'walk',
    workflowOverrides: { 'video_publish': 'walk', 'video_generation': 'run' },
    escalationPolicy: { promoteAfterSuccesses: 10, demoteAfterFailures: 2, requireKingApprovalToPromote: true },
    humanGates: [
      { workflowType: 'video_publish', gatePoint: 'before_publish', requiredInModes: ['crawl', 'walk'], bypassableInRun: true },
    ],
  },
  'zion-alpha-trading': {
    agentId: 'zion-alpha-trading',
    defaultMode: 'walk',
    workflowOverrides: { 'trade_execution': 'walk' },
    escalationPolicy: { promoteAfterSuccesses: 20, demoteAfterFailures: 3, requireKingApprovalToPromote: true },
    humanGates: [
      { workflowType: 'trade_execution', gatePoint: 'before_trade', requiredInModes: ['crawl', 'walk'], bypassableInRun: false },
    ],
  },
};
