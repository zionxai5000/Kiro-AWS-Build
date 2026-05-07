/**
 * Unit tests for ZionX App Factory — Agent Program & State Machine
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 19.1
 *
 * Tests state machine transitions through the full app lifecycle including
 * GTM states, gate checks, and completion contracts.
 */

import { describe, it, expect } from 'vitest';
import {
  ZIONX_AGENT_PROGRAM,
  ZIONX_STATE_MACHINE,
  ZIONX_COMPLETION_CONTRACTS,
} from '../agent-program.js';

describe('ZionX Agent Program', () => {
  it('should have a valid agent program definition', () => {
    expect(ZIONX_AGENT_PROGRAM.id).toBe('zionx-app-factory');
    expect(ZIONX_AGENT_PROGRAM.name).toBe('ZionX App Factory');
    expect(ZIONX_AGENT_PROGRAM.pillar).toBe('eretz');
    expect(ZIONX_AGENT_PROGRAM.authorityLevel).toBe('L4');
    expect(ZIONX_AGENT_PROGRAM.version).toBe('2.0.0');
  });

  it('should define tools for all lifecycle stages', () => {
    const toolNames = ZIONX_AGENT_PROGRAM.tools.map((t) => t.name);
    expect(toolNames).toContain('generate_code');
    expect(toolNames).toContain('compile_app');
    expect(toolNames).toContain('run_tests');
    expect(toolNames).toContain('submit_to_store');
    expect(toolNames).toContain('check_review_status');
    expect(toolNames).toContain('research_market');
    expect(toolNames).toContain('optimize_aso');
    expect(toolNames).toContain('launch_campaign');
    expect(toolNames).toContain('generate_landing_page');
    expect(toolNames).toContain('analyze_revenue');
    expect(toolNames).toContain('manage_portfolio');
  });

  it('should deny dangerous actions', () => {
    expect(ZIONX_AGENT_PROGRAM.deniedActions).toContain('delete_live_app');
    expect(ZIONX_AGENT_PROGRAM.deniedActions).toContain('modify_financial_data');
    expect(ZIONX_AGENT_PROGRAM.deniedActions).toContain('access_other_pillars');
  });

  it('should have model preference with Tier 2 minimum for code generation', () => {
    expect(ZIONX_AGENT_PROGRAM.modelPreference.preferred).toBeDefined();
    expect(ZIONX_AGENT_PROGRAM.modelPreference.fallback).toBeDefined();
    expect(ZIONX_AGENT_PROGRAM.modelPreference.taskTypeOverrides?.code_generation).toBeDefined();
  });

  it('should have token budgets defined', () => {
    expect(ZIONX_AGENT_PROGRAM.tokenBudget.daily).toBeGreaterThan(0);
    expect(ZIONX_AGENT_PROGRAM.tokenBudget.monthly).toBeGreaterThan(0);
    expect(ZIONX_AGENT_PROGRAM.tokenBudget.monthly).toBeGreaterThan(ZIONX_AGENT_PROGRAM.tokenBudget.daily);
  });

  it('should reference the test suite path', () => {
    expect(ZIONX_AGENT_PROGRAM.testSuite.path).toBe('packages/app/src/zionx/__tests__');
    expect(ZIONX_AGENT_PROGRAM.testSuite.requiredCoverage).toBeGreaterThanOrEqual(80);
  });
});

describe('ZionX State Machine', () => {
  it('should define all lifecycle states', () => {
    const stateNames = Object.keys(ZIONX_STATE_MACHINE.states);
    const expectedStates = [
      'ideation',
      'market-research',
      'development',
      'testing',
      'gate-review',
      'submission',
      'in-review',
      'approved',
      'rejected',
      'live',
      'marketing',
      'revenue-optimizing',
      'deprecated',
    ];
    for (const state of expectedStates) {
      expect(stateNames).toContain(state);
    }
  });

  it('should have ideation as the initial state', () => {
    expect(ZIONX_STATE_MACHINE.initialState).toBe('ideation');
    expect(ZIONX_STATE_MACHINE.states.ideation.type).toBe('initial');
  });

  it('should have deprecated as the only terminal state', () => {
    expect(ZIONX_STATE_MACHINE.terminalStates).toEqual(['deprecated']);
    expect(ZIONX_STATE_MACHINE.states.deprecated.type).toBe('terminal');
  });

  describe('transition paths', () => {
    function findTransition(from: string, to: string) {
      return ZIONX_STATE_MACHINE.transitions.find(
        (t) => t.from === from && t.to === to,
      );
    }

    it('should allow ideation → market-research with concept gate', () => {
      const t = findTransition('ideation', 'market-research');
      expect(t).toBeDefined();
      expect(t!.event).toBe('start_research');
      expect(t!.gates.length).toBeGreaterThan(0);
      expect(t!.gates[0].id).toBe('gate-concept-defined');
      expect(t!.gates[0].required).toBe(true);
    });

    it('should allow market-research → development with market validation gate', () => {
      const t = findTransition('market-research', 'development');
      expect(t).toBeDefined();
      expect(t!.gates.some((g) => g.id === 'gate-market-validated')).toBe(true);
    });

    it('should allow market-research → ideation on rejection', () => {
      const t = findTransition('market-research', 'ideation');
      expect(t).toBeDefined();
      expect(t!.event).toBe('market_rejected');
    });

    it('should allow development → testing with code compilation gate', () => {
      const t = findTransition('development', 'testing');
      expect(t).toBeDefined();
      expect(t!.gates.some((g) => g.id === 'gate-code-complete')).toBe(true);
    });

    it('should allow testing → gate-review with test pass gate', () => {
      const t = findTransition('testing', 'gate-review');
      expect(t).toBeDefined();
      expect(t!.gates.some((g) => g.id === 'gate-tests-pass')).toBe(true);
    });

    it('should require all 6 gate checks for gate-review → submission', () => {
      const t = findTransition('gate-review', 'submission');
      expect(t).toBeDefined();
      expect(t!.gates.length).toBe(6);
      const gateIds = t!.gates.map((g) => g.id);
      expect(gateIds).toContain('gate-metadata');
      expect(gateIds).toContain('gate-subscription');
      expect(gateIds).toContain('gate-iap-sandbox');
      expect(gateIds).toContain('gate-screenshots');
      expect(gateIds).toContain('gate-privacy-policy');
      expect(gateIds).toContain('gate-eula');
      // All gates must be required
      expect(t!.gates.every((g) => g.required)).toBe(true);
    });

    it('should allow gate-review → development on gate failure', () => {
      const t = findTransition('gate-review', 'development');
      expect(t).toBeDefined();
      expect(t!.event).toBe('gate_failed');
    });

    it('should allow submission → in-review → approved/rejected', () => {
      expect(findTransition('submission', 'in-review')).toBeDefined();
      expect(findTransition('in-review', 'approved')).toBeDefined();
      expect(findTransition('in-review', 'rejected')).toBeDefined();
    });

    it('should allow approved → live with release approval gate', () => {
      const t = findTransition('approved', 'live');
      expect(t).toBeDefined();
      expect(t!.gates.some((g) => g.id === 'gate-release-approval')).toBe(true);
    });

    it('should allow rejected → development for fix and resubmit', () => {
      const t = findTransition('rejected', 'development');
      expect(t).toBeDefined();
      expect(t!.event).toBe('fix_rejection');
    });

    it('should allow live → marketing with GTM plan gate', () => {
      const t = findTransition('live', 'marketing');
      expect(t).toBeDefined();
      expect(t!.gates.some((g) => g.id === 'gate-gtm-plan-ready')).toBe(true);
    });

    it('should allow marketing → revenue-optimizing with minimum live days gate', () => {
      const t = findTransition('marketing', 'revenue-optimizing');
      expect(t).toBeDefined();
      expect(t!.gates.some((g) => g.id === 'gate-minimum-live-days')).toBe(true);
    });

    it('should allow revenue-optimizing → marketing for re-engagement', () => {
      const t = findTransition('revenue-optimizing', 'marketing');
      expect(t).toBeDefined();
      expect(t!.event).toBe('relaunch_marketing');
    });

    it('should allow deprecation from live, marketing, and revenue-optimizing', () => {
      expect(findTransition('live', 'deprecated')).toBeDefined();
      expect(findTransition('marketing', 'deprecated')).toBeDefined();
      expect(findTransition('revenue-optimizing', 'deprecated')).toBeDefined();
    });

    it('should require L2 authority for deprecation', () => {
      const deprecationTransitions = ZIONX_STATE_MACHINE.transitions.filter(
        (t) => t.to === 'deprecated',
      );
      for (const t of deprecationTransitions) {
        expect(t.gates.some((g) => g.config.requiresAuthorityLevel === 'L2')).toBe(true);
      }
    });
  });

  describe('timeouts', () => {
    it('should have timeout on market-research state', () => {
      expect(ZIONX_STATE_MACHINE.states['market-research'].timeout).toBeDefined();
      expect(ZIONX_STATE_MACHINE.states['market-research'].timeout!.transitionTo).toBe('ideation');
    });

    it('should have timeout on development state', () => {
      expect(ZIONX_STATE_MACHINE.states.development.timeout).toBeDefined();
    });

    it('should have timeout on in-review state', () => {
      expect(ZIONX_STATE_MACHINE.states['in-review'].timeout).toBeDefined();
      expect(ZIONX_STATE_MACHINE.states['in-review'].timeout!.transitionTo).toBe('submission');
    });
  });
});

describe('ZionX Completion Contracts', () => {
  it('should define contracts for all major workflow types', () => {
    const workflowTypes = ZIONX_COMPLETION_CONTRACTS.map((c) => c.workflowType);
    expect(workflowTypes).toContain('market-research');
    expect(workflowTypes).toContain('development');
    expect(workflowTypes).toContain('testing');
    expect(workflowTypes).toContain('gate-review');
    expect(workflowTypes).toContain('submission');
    expect(workflowTypes).toContain('marketing');
    expect(workflowTypes).toContain('revenue-optimizing');
  });

  it('should have output schemas with required fields', () => {
    for (const contract of ZIONX_COMPLETION_CONTRACTS) {
      expect(contract.outputSchema).toBeDefined();
      expect(contract.outputSchema.type).toBe('object');
      expect(contract.outputSchema.required).toBeDefined();
      expect(Array.isArray(contract.outputSchema.required)).toBe(true);
    }
  });

  it('should have verification steps for each contract', () => {
    for (const contract of ZIONX_COMPLETION_CONTRACTS) {
      expect(contract.verificationSteps.length).toBeGreaterThan(0);
      for (const step of contract.verificationSteps) {
        expect(step.name).toBeDefined();
        expect(step.required).toBe(true);
      }
    }
  });
});
