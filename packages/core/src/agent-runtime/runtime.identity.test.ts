/**
 * Unit tests for Persistent Agent Identity and Memory-Backed Conversations.
 * Tests: identity profiles, conversation persistence, working memory,
 * decision support, governance, and knowledge sharing.
 *
 * Requirements: 48a-48g, 19.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt, formatConversationHistory } from './prompt-builder.js';
import { GovernedMemoryAccess } from './governed-memory.js';
import type { GovernedMemoryAccessDeps, GovernedWriteEntry } from './governed-memory.js';
import type { AgentProgram, AgentIdentityProfile } from '../types/agent.js';
import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { XOAuditService } from '../interfaces/xo-audit-service.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Mock identity profile for testing
const mockIdentityProfile: AgentIdentityProfile = {
  name: 'TestAgent',
  role: 'Test orchestrator for unit testing',
  hierarchyPosition: 'Reports to test runner',
  personality: { tone: 'analytical', verbosity: 'concise', proactivity: 'proactive', formality: 'professional' },
  expertise: ['testing', 'validation'],
  domainLanguage: ['assertions', 'mocks', 'stubs'],
  decisionPrinciples: ['Test everything', 'Fail fast'],
  relationships: [{ agentId: 'other-agent', relationship: 'collaborates_with', description: 'Test collaboration' }],
  neverBreakCharacter: true,
  identityReinforcement: 'You are TestAgent. Never break character.',
};

const mockProgram: AgentProgram = {
  id: 'test-agent',
  name: 'Test Agent',
  version: '1.0.0',
  pillar: 'test',
  systemPrompt: 'You are a test agent.',
  identityProfile: mockIdentityProfile,
  tools: [],
  stateMachine: {
    id: 'test-sm',
    name: 'Test SM',
    version: '1.0.0',
    states: {},
    initialState: 'init',
    terminalStates: [],
    transitions: [],
    metadata: { createdAt: new Date(), updatedAt: new Date(), description: 'test' },
  },
  completionContracts: [],
  authorityLevel: 'L3',
  allowedActions: [],
  deniedActions: [],
  modelPreference: { preferred: 'gpt-4o', fallback: 'gpt-4o-mini', costCeiling: 1.0 },
  tokenBudget: { daily: 10000, monthly: 100000 },
  testSuite: { suiteId: 'test', path: 'test', requiredCoverage: 80 },
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'test',
  changelog: [],
};

describe('Agent Identity - System Prompt Building', () => {
  it('should include identity profile in system prompt', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('TestAgent');
    expect(prompt).toContain('Test orchestrator');
    expect(prompt).toContain('NEVER');
  });

  it('should include character enforcement directive', () => {
    const prompt = buildSystemPrompt(mockProgram);
    // The buildCharacterEnforcement function produces "You NEVER break character."
    expect(prompt).toMatch(/never break character/i);
  });

  it('should include decision principles', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('Test everything');
    expect(prompt).toContain('Fail fast');
  });

  it('should include procedural patterns when provided', () => {
    const patterns = ['Pattern 1: Always validate inputs', 'Pattern 2: Cache results'];
    const prompt = buildSystemPrompt(mockProgram, patterns);
    expect(prompt).toContain('Always validate inputs');
    expect(prompt).toContain('Cache results');
  });

  it('should fall back to raw systemPrompt when no identity profile', () => {
    const programNoProfile: AgentProgram = { ...mockProgram, identityProfile: undefined };
    const prompt = buildSystemPrompt(programNoProfile);
    expect(prompt).toContain('You are a test agent');
  });

  it('should include identity reinforcement text', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('You are TestAgent. Never break character.');
  });

  it('should include domain expertise', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('testing');
    expect(prompt).toContain('validation');
  });

  it('should include domain language', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('assertions');
    expect(prompt).toContain('mocks');
    expect(prompt).toContain('stubs');
  });

  it('should include relationships', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('other-agent');
    expect(prompt).toContain('Test collaboration');
  });

  it('should include hierarchy position', () => {
    const prompt = buildSystemPrompt(mockProgram);
    expect(prompt).toContain('Reports to test runner');
  });
});

describe('Conversation History Formatting', () => {
  it('should format conversation history correctly', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am well' },
    ];
    const formatted = formatConversationHistory(history);
    expect(formatted).toHaveLength(4);
    expect(formatted[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(formatted[1]).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('should trim to maxMessages', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));
    const formatted = formatConversationHistory(history, 10);
    expect(formatted).toHaveLength(10);
    // Should be the LAST 10 messages
    expect(formatted[0].content).toBe('Message 90');
  });

  it('should handle empty history', () => {
    const formatted = formatConversationHistory([]);
    expect(formatted).toHaveLength(0);
  });

  it('should default to 40 messages max', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));
    const formatted = formatConversationHistory(history);
    expect(formatted).toHaveLength(40);
    // Should be the LAST 40 messages
    expect(formatted[0].content).toBe('Message 20');
  });

  it('should preserve role types', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    const formatted = formatConversationHistory(history);
    expect(formatted[0].role).toBe('user');
    expect(formatted[1].role).toBe('assistant');
  });
});

describe('Governed Memory Access', () => {
  let governed: GovernedMemoryAccess;
  let mockMishmar: ReturnType<typeof createMockMishmar>;
  let mockAudit: ReturnType<typeof createMockAudit>;
  let mockZikaron: ReturnType<typeof createMockZikaron>;

  function createMockMishmar() {
    return {
      authorize: vi.fn<AnyFn>().mockResolvedValue({
        authorized: true,
        reason: 'allowed',
        auditId: 'audit-1',
      }),
      checkAuthorityLevel: vi.fn<AnyFn>().mockResolvedValue('L4'),
      requestToken: vi.fn<AnyFn>().mockResolvedValue({
        tokenId: 'tok-1',
        agentId: 'a',
        action: 'a',
        issuedAt: new Date(),
        expiresAt: new Date(),
        issuedBy: 'system',
      }),
      validateToken: vi.fn<AnyFn>().mockResolvedValue(true),
      validateCompletion: vi.fn<AnyFn>().mockResolvedValue({
        valid: true,
        violations: [],
        contractId: 'c-1',
      }),
      validateSeparation: vi.fn<AnyFn>().mockResolvedValue({
        valid: true,
        violations: [],
      }),
    } as unknown as MishmarService & { authorize: ReturnType<typeof vi.fn> };
  }

  function createMockAudit() {
    return {
      recordAction: vi.fn<AnyFn>().mockResolvedValue('audit-id'),
      recordGovernanceDecision: vi.fn<AnyFn>().mockResolvedValue('audit-gov-1'),
      recordStateTransition: vi.fn<AnyFn>().mockResolvedValue('audit-trans-1'),
      query: vi.fn<AnyFn>().mockResolvedValue([]),
      verifyIntegrity: vi.fn<AnyFn>().mockResolvedValue({
        valid: true,
        recordId: 'r-1',
        chainLength: 1,
      }),
    } as unknown as XOAuditService & { recordAction: ReturnType<typeof vi.fn> };
  }

  function createMockZikaron() {
    return {
      storeEpisodic: vi.fn<AnyFn>().mockResolvedValue('entry-id'),
      storeSemantic: vi.fn<AnyFn>().mockResolvedValue('sem-id'),
      storeProcedural: vi.fn<AnyFn>().mockResolvedValue('proc-id'),
      storeWorking: vi.fn<AnyFn>().mockResolvedValue('work-id'),
      query: vi.fn<AnyFn>().mockResolvedValue([]),
      queryByAgent: vi.fn<AnyFn>().mockResolvedValue([]),
      loadAgentContext: vi.fn<AnyFn>().mockResolvedValue({
        agentId: 'test',
        workingMemory: null,
        recentEpisodic: [],
        proceduralPatterns: [],
      }),
      flagConflict: vi.fn<AnyFn>().mockResolvedValue(undefined),
    } as unknown as ZikaronService & { storeEpisodic: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
  }

  beforeEach(() => {
    mockMishmar = createMockMishmar();
    mockAudit = createMockAudit();
    mockZikaron = createMockZikaron();
    governed = new GovernedMemoryAccess({
      mishmarService: mockMishmar as unknown as MishmarService,
      xoAuditService: mockAudit as unknown as XOAuditService,
      zikaronService: mockZikaron as unknown as ZikaronService,
    });
  });

  it('should allow own agent writes via storeWithGovernance', async () => {
    const writeEntry: GovernedWriteEntry = {
      tenantId: 'system',
      agentId: 'agent-1',
      layer: 'episodic',
      tags: ['test'],
      content: 'test content',
    };

    // storeWithGovernance logs the write to audit
    await governed.storeWithGovernance(writeEntry);

    expect(mockAudit.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'memory.write',
        outcome: 'success',
      }),
    );
  });

  it('should auto-authorize own-agent reads without calling Mishmar', async () => {
    const result = await governed.authorizedRead('agent-1', 'agent-1', {
      tenantId: 'system',
      text: 'test query',
      layers: ['episodic'],
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(mockMishmar.authorize).not.toHaveBeenCalled();
  });

  it('should require Mishmar authorization for cross-agent reads', async () => {
    const result = await governed.authorizedRead('agent-1', 'agent-2', {
      tenantId: 'system',
      text: 'test query',
      layers: ['episodic'],
      limit: 10,
    });

    expect(result.success).toBe(true);
    expect(mockMishmar.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        action: 'memory.read',
        target: 'agent-2',
        authorityLevel: 'L3',
      }),
    );
  });

  it('should block deletion attempts (append-only)', async () => {
    const result = await governed.attemptDelete('agent-1', 'entry-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('append-only');
    expect(mockAudit.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'memory.delete_attempt',
        outcome: 'blocked',
      }),
    );
  });

  it('should block deletion via blockDeletion method', async () => {
    const result = await governed.blockDeletion('agent-1', 'entry-1');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('append-only');
    expect(mockAudit.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'memory.delete_attempt',
        outcome: 'blocked',
        details: expect.objectContaining({
          securityEvent: true,
        }),
      }),
    );
  });

  it('should require L1 King approval for identity modifications', async () => {
    const modification = { name: 'NewName', systemPrompt: 'new prompt' };
    const result = await governed.authorizeIdentityModification('agent-1', 'agent-2', modification);

    expect(result.success).toBe(true);
    expect(mockMishmar.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        authorityLevel: 'L1',
        action: 'memory.identity_modification',
      }),
    );
  });

  it('should deny identity modification when Mishmar rejects', async () => {
    (mockMishmar.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      authorized: false,
      reason: 'King approval required',
      auditId: 'audit-deny-1',
    });

    const modification = { name: 'NewName' };
    const result = await governed.authorizeIdentityModification('agent-1', 'agent-2', modification);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('requires L1 King approval');
  });

  it('should tag King conversations with L1 authority metadata', async () => {
    const entry = {
      id: 'entry-1',
      tenantId: 'system',
      layer: 'episodic' as const,
      content: 'King conversation',
      embedding: [],
      sourceAgentId: 'agent-1',
      tags: ['conversation'],
      createdAt: new Date(),
      eventType: 'conversation',
      participants: ['agent-1', 'king'],
      outcome: 'success',
      relatedEntities: [],
    };

    const writeEntry: GovernedWriteEntry = {
      tenantId: 'system',
      agentId: 'agent-1',
      layer: 'episodic',
      tags: ['conversation'],
      content: 'King conversation',
      isKingConversation: true,
      entry,
    };

    await governed.authorizedWrite('agent-1', writeEntry);

    expect(mockZikaron.storeEpisodic).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.arrayContaining(['king_conversation', 'authority:L1', 'tenant_accessible']),
      }),
    );
  });
});
