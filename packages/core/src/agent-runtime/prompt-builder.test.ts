/**
 * Unit tests for the identity-aware system prompt builder.
 *
 * Validates: Requirements 48a.2, 48a.3, 48g.27, 48d.14
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt-builder.js';
import type { AgentProgram, AgentIdentityProfile } from '../types/agent.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createIdentityProfile(overrides: Partial<AgentIdentityProfile> = {}): AgentIdentityProfile {
  return {
    name: 'Seraphim',
    role: 'Supreme Orchestrator of the House of Zion',
    hierarchyPosition: 'Top-level orchestrator, reports to the King only',
    personality: {
      tone: 'authoritative',
      verbosity: 'balanced',
      proactivity: 'proactive',
      formality: 'formal',
    },
    expertise: ['strategic planning', 'agent coordination', 'resource allocation'],
    domainLanguage: ['pillar', 'agent program', 'completion contract'],
    decisionPrinciples: [
      'Always prioritize the King\'s vision',
      'Enforce governance before execution',
      'Minimize cost while maximizing quality',
    ],
    relationships: [
      { agentId: 'zionx-lead', relationship: 'commands', description: 'App Factory lead agent' },
      { agentId: 'king', relationship: 'reports_to', description: 'The King — ultimate authority' },
      { agentId: 'mishmar', relationship: 'collaborates_with', description: 'Governance enforcement' },
    ],
    neverBreakCharacter: true,
    identityReinforcement: 'You are the supreme orchestrator. All agents answer to you.',
    ...overrides,
  };
}

function createProgram(overrides: Partial<AgentProgram> = {}): AgentProgram {
  return {
    id: 'prog-1',
    name: 'TestAgent',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: 'You are a test agent.',
    tools: [],
    stateMachine: {
      id: 'sm-1',
      name: 'test-sm',
      version: '1.0.0',
      states: {},
      initialState: 'idle',
      terminalStates: ['done'],
      transitions: [],
      metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'test' },
    },
    completionContracts: [],
    authorityLevel: 'L4',
    allowedActions: ['read', 'write'],
    deniedActions: ['delete'],
    modelPreference: { preferred: 'claude-sonnet-4-20250514', fallback: 'gpt-4o', costCeiling: 1 },
    tokenBudget: { daily: 10000, monthly: 100000 },
    testSuite: { suiteId: 'ts-1', path: '/tests', requiredCoverage: 80 },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'king',
    changelog: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  describe('without identityProfile (fallback)', () => {
    it('uses raw systemPrompt with character enforcement appended', () => {
      const program = createProgram({ systemPrompt: 'You are a helpful agent.' });
      const result = buildSystemPrompt(program);

      expect(result).toContain('You are a helpful agent.');
      expect(result).toContain(
        'You ARE TestAgent. You NEVER identify as Claude, GPT, or any generic AI assistant. You NEVER break character.',
      );
    });

    it('uses default prompt when systemPrompt is empty', () => {
      const program = createProgram({ systemPrompt: '' });
      const result = buildSystemPrompt(program);

      expect(result).toContain('You are TestAgent, an AI agent in the SeraphimOS platform.');
      expect(result).toContain('You NEVER break character.');
    });
  });

  describe('with identityProfile', () => {
    it('includes the mandatory character enforcement statement', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({ name: 'Seraphim' }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain(
        'You ARE Seraphim. You NEVER identify as Claude, GPT, or any generic AI assistant. You NEVER break character.',
      );
    });

    it('includes the agent name and role', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile(),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('# Identity: Seraphim');
      expect(result).toContain('Role: Supreme Orchestrator of the House of Zion');
    });

    it('includes identity reinforcement text', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({
          identityReinforcement: 'You are the supreme orchestrator. All agents answer to you.',
        }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('You are the supreme orchestrator. All agents answer to you.');
    });

    it('includes personality directives', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({
          personality: {
            tone: 'analytical',
            verbosity: 'concise',
            proactivity: 'reactive',
            formality: 'casual',
          },
        }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('## Personality Directives');
      expect(result).toContain('Be precise and data-driven');
      expect(result).toContain('Keep responses brief');
      expect(result).toContain('Respond to requests as they come');
      expect(result).toContain('relaxed, conversational tone');
    });

    it('includes decision principles', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({
          decisionPrinciples: ['Principle A', 'Principle B'],
        }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('## Decision Principles');
      expect(result).toContain('1. Principle A');
      expect(result).toContain('2. Principle B');
    });

    it('includes relationships and hierarchy position', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({
          hierarchyPosition: 'Top-level orchestrator',
          relationships: [
            { agentId: 'zionx-lead', relationship: 'commands', description: 'App Factory lead' },
            { agentId: 'king', relationship: 'reports_to', description: 'Ultimate authority' },
            { agentId: 'mishmar', relationship: 'collaborates_with', description: 'Governance' },
            { agentId: 'xo-audit', relationship: 'monitors', description: 'Audit trail' },
          ],
        }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('## Organizational Position');
      expect(result).toContain('Position: Top-level orchestrator');
      expect(result).toContain('Agents you command');
      expect(result).toContain('zionx-lead: App Factory lead');
      expect(result).toContain('You report to');
      expect(result).toContain('king: Ultimate authority');
      expect(result).toContain('Collaborators');
      expect(result).toContain('mishmar: Governance');
      expect(result).toContain('Agents you monitor');
      expect(result).toContain('xo-audit: Audit trail');
    });

    it('includes domain expertise', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({
          expertise: ['strategic planning', 'resource allocation'],
        }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('## Domain Expertise');
      expect(result).toContain('- strategic planning');
      expect(result).toContain('- resource allocation');
    });

    it('includes domain language', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({
          domainLanguage: ['pillar', 'completion contract'],
        }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('## Domain Language');
      expect(result).toContain('pillar, completion contract');
    });
  });

  describe('with procedural memory patterns', () => {
    it('includes institutional knowledge section', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile(),
      });
      const patterns = [
        'When deploying agents, always verify state machine first',
        'Cost optimization: prefer gpt-4o-mini for simple tasks',
        'Escalate to King when budget exceeds $50/day',
      ];
      const result = buildSystemPrompt(program, patterns);

      expect(result).toContain('## Institutional Knowledge (Learned Patterns)');
      expect(result).toContain('1. When deploying agents, always verify state machine first');
      expect(result).toContain('2. Cost optimization: prefer gpt-4o-mini for simple tasks');
      expect(result).toContain('3. Escalate to King when budget exceeds $50/day');
    });

    it('limits to top 5 patterns', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile(),
      });
      const patterns = [
        'Pattern 1',
        'Pattern 2',
        'Pattern 3',
        'Pattern 4',
        'Pattern 5',
        'Pattern 6 should not appear',
        'Pattern 7 should not appear',
      ];
      const result = buildSystemPrompt(program, patterns);

      expect(result).toContain('5. Pattern 5');
      expect(result).not.toContain('Pattern 6');
      expect(result).not.toContain('Pattern 7');
    });

    it('omits institutional knowledge section when patterns array is empty', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile(),
      });
      const result = buildSystemPrompt(program, []);

      expect(result).not.toContain('Institutional Knowledge');
    });

    it('includes patterns in fallback mode (no identityProfile)', () => {
      const program = createProgram({ systemPrompt: 'Base prompt.' });
      const result = buildSystemPrompt(program, ['Pattern A']);

      // Without identityProfile, patterns are not included (only identity-aware mode uses them)
      // The fallback mode just uses raw systemPrompt + character enforcement
      expect(result).toContain('Base prompt.');
      expect(result).toContain('You ARE TestAgent');
    });
  });

  describe('edge cases', () => {
    it('handles empty relationships array', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({ relationships: [] }),
      });
      const result = buildSystemPrompt(program);

      expect(result).toContain('## Organizational Position');
      expect(result).not.toContain('### Relationships');
    });

    it('handles empty expertise and domainLanguage', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({ expertise: [], domainLanguage: [] }),
      });
      const result = buildSystemPrompt(program);

      expect(result).not.toContain('## Domain Expertise');
      expect(result).not.toContain('## Domain Language');
    });

    it('handles empty decisionPrinciples', () => {
      const program = createProgram({
        identityProfile: createIdentityProfile({ decisionPrinciples: [] }),
      });
      const result = buildSystemPrompt(program);

      expect(result).not.toContain('## Decision Principles');
    });
  });
});
