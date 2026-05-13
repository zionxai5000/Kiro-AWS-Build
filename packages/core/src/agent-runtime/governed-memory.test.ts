/**
 * Unit tests for GovernedMemoryAccess.
 *
 * Validates: Requirements 48e.18, 48e.19, 48e.20, 48e.21
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GovernedMemoryAccess } from './governed-memory.js';
import type { GovernedMemoryAccessDeps, GovernedWriteEntry } from './governed-memory.js';
import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { XOAuditService } from '../interfaces/xo-audit-service.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';
import type { MemoryQuery, EpisodicEntry, SemanticEntry } from '../types/memory.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function createMockDeps() {
  const mishmarService = {
    authorize: vi.fn<AnyFn>().mockResolvedValue({
      authorized: true,
      reason: 'Allowed',
      auditId: 'audit-auth-1',
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
  } as unknown as MishmarService;

  const xoAuditService = {
    recordAction: vi.fn<AnyFn>().mockResolvedValue('audit-action-1'),
    recordGovernanceDecision: vi.fn<AnyFn>().mockResolvedValue('audit-gov-1'),
    recordStateTransition: vi.fn<AnyFn>().mockResolvedValue('audit-trans-1'),
    query: vi.fn<AnyFn>().mockResolvedValue([]),
    verifyIntegrity: vi.fn<AnyFn>().mockResolvedValue({
      valid: true,
      recordId: 'r-1',
      chainLength: 1,
    }),
  } as unknown as XOAuditService;

  const zikaronService = {
    storeEpisodic: vi.fn<AnyFn>().mockResolvedValue('mem-ep-1'),
    storeSemantic: vi.fn<AnyFn>().mockResolvedValue('mem-sem-1'),
    storeProcedural: vi.fn<AnyFn>().mockResolvedValue('mem-proc-1'),
    storeWorking: vi.fn<AnyFn>().mockResolvedValue('mem-work-1'),
    query: vi.fn<AnyFn>().mockResolvedValue([
      {
        id: 'result-1',
        layer: 'episodic',
        content: 'test memory',
        similarity: 0.95,
        metadata: {},
        sourceAgentId: 'agent-1',
        timestamp: new Date(),
      },
    ]),
    queryByAgent: vi.fn<AnyFn>().mockResolvedValue([]),
    loadAgentContext: vi.fn<AnyFn>().mockResolvedValue({
      agentId: 'test',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn<AnyFn>().mockResolvedValue(undefined),
  } as unknown as ZikaronService;

  const deps: GovernedMemoryAccessDeps = {
    mishmarService,
    xoAuditService,
    zikaronService,
  };

  return { deps, mishmarService, xoAuditService, zikaronService };
}

function createQuery(overrides: Partial<MemoryQuery> = {}): MemoryQuery {
  return {
    text: 'test query',
    tenantId: 'tenant-1',
    layers: ['episodic'],
    limit: 10,
    ...overrides,
  };
}

function createEpisodicEntry(overrides: Partial<EpisodicEntry> = {}): EpisodicEntry {
  return {
    id: 'entry-1',
    tenantId: 'tenant-1',
    layer: 'episodic',
    content: 'Test episodic entry',
    embedding: [],
    sourceAgentId: 'agent-1',
    tags: ['test'],
    createdAt: new Date(),
    eventType: 'conversation',
    participants: ['agent-1'],
    outcome: 'success',
    relatedEntities: [],
    ...overrides,
  };
}

function createSemanticEntry(overrides: Partial<SemanticEntry> = {}): SemanticEntry {
  return {
    id: 'entry-2',
    tenantId: 'tenant-1',
    layer: 'semantic',
    content: 'Test semantic entry',
    embedding: [],
    sourceAgentId: 'agent-1',
    tags: ['knowledge'],
    createdAt: new Date(),
    entityType: 'fact',
    relationships: [],
    confidence: 0.9,
    source: 'extracted',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GovernedMemoryAccess', () => {
  let governed: GovernedMemoryAccess;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    mocks = createMockDeps();
    governed = new GovernedMemoryAccess(mocks.deps);
  });

  // -------------------------------------------------------------------------
  // authorizedRead — own-agent access (L4 autonomous)
  // -------------------------------------------------------------------------

  describe('authorizedRead — own-agent access', () => {
    it('auto-authorizes own-agent reads without calling Mishmar', async () => {
      const query = createQuery({ agentId: 'agent-1' });

      const result = await governed.authorizedRead('agent-1', 'agent-1', query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mocks.mishmarService.authorize).not.toHaveBeenCalled();
    });

    it('logs own-agent read to XO Audit', async () => {
      const query = createQuery({ agentId: 'agent-1' });

      await governed.authorizedRead('agent-1', 'agent-1', query);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'memory.read',
          target: 'agent-1',
          outcome: 'success',
        }),
      );
    });

    it('audit log contains layers but never full content', async () => {
      const query = createQuery({ agentId: 'agent-1', layers: ['episodic', 'semantic'] });

      await governed.authorizedRead('agent-1', 'agent-1', query);

      const auditCall = (mocks.xoAuditService.recordAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.details.layers).toEqual(['episodic', 'semantic']);
      // Ensure no content field is present in audit
      expect(auditCall.details.content).toBeUndefined();
    });

    it('calls zikaronService.query with the provided query', async () => {
      const query = createQuery({ agentId: 'agent-1', text: 'find patterns' });

      await governed.authorizedRead('agent-1', 'agent-1', query);

      expect(mocks.zikaronService.query).toHaveBeenCalledWith(query);
    });
  });

  // -------------------------------------------------------------------------
  // authorizedRead — cross-agent access (L3 peer verification)
  // -------------------------------------------------------------------------

  describe('authorizedRead — cross-agent access', () => {
    it('calls Mishmar authorize for cross-agent reads with L3', async () => {
      const query = createQuery({ agentId: 'agent-2' });

      await governed.authorizedRead('agent-1', 'agent-2', query);

      expect(mocks.mishmarService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          action: 'memory.read',
          target: 'agent-2',
          authorityLevel: 'L3',
          context: expect.objectContaining({
            operation: 'cross_agent_read',
            targetAgentId: 'agent-2',
          }),
        }),
      );
    });

    it('allows cross-agent read when Mishmar authorizes', async () => {
      const query = createQuery({ agentId: 'agent-2' });

      const result = await governed.authorizedRead('agent-1', 'agent-2', query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('blocks cross-agent read when Mishmar denies', async () => {
      (mocks.mishmarService.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        reason: 'Insufficient authority for cross-agent access',
        auditId: 'audit-deny-1',
      });

      const query = createQuery({ agentId: 'agent-2' });
      const result = await governed.authorizedRead('agent-1', 'agent-2', query);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Cross-agent memory read denied');
      expect(result.auditId).toBe('audit-deny-1');
    });

    it('logs blocked cross-agent read to XO Audit', async () => {
      (mocks.mishmarService.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        reason: 'Denied',
        auditId: 'audit-deny-1',
      });

      const query = createQuery({ agentId: 'agent-2' });
      await governed.authorizedRead('agent-1', 'agent-2', query);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'memory.read',
          outcome: 'blocked',
        }),
      );
    });

    it('does not call zikaronService.query when access is denied', async () => {
      (mocks.mishmarService.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        reason: 'Denied',
        auditId: 'audit-deny-1',
      });

      const query = createQuery({ agentId: 'agent-2' });
      await governed.authorizedRead('agent-1', 'agent-2', query);

      expect(mocks.zikaronService.query).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // authorizedWrite — own-agent writes (L4 autonomous)
  // -------------------------------------------------------------------------

  describe('authorizedWrite — own-agent writes', () => {
    it('auto-authorizes own-agent writes without calling Mishmar', async () => {
      const entry = createEpisodicEntry();
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        layer: 'episodic',
        tags: ['test'],
        entry,
      };

      const result = await governed.authorizedWrite('agent-1', writeEntry);

      expect(result.success).toBe(true);
      expect(result.data).toBe('mem-ep-1');
      expect(mocks.mishmarService.authorize).not.toHaveBeenCalled();
    });

    it('stores episodic entries via zikaronService.storeEpisodic', async () => {
      const entry = createEpisodicEntry();
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        layer: 'episodic',
        tags: ['test'],
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.zikaronService.storeEpisodic).toHaveBeenCalledWith(entry);
    });

    it('stores semantic entries via zikaronService.storeSemantic', async () => {
      const entry = createSemanticEntry();
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        layer: 'semantic',
        tags: ['knowledge'],
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.zikaronService.storeSemantic).toHaveBeenCalledWith(entry);
    });

    it('logs own-agent write to XO Audit', async () => {
      const entry = createEpisodicEntry();
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        layer: 'episodic',
        tags: ['test'],
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'memory.write',
          outcome: 'success',
          details: expect.objectContaining({
            operation: 'write',
            layers: ['episodic'],
            isCrossAgent: false,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // authorizedWrite — cross-agent writes (L3)
  // -------------------------------------------------------------------------

  describe('authorizedWrite — cross-agent writes', () => {
    it('calls Mishmar authorize for cross-agent writes with L3', async () => {
      const entry = createSemanticEntry({ sourceAgentId: 'agent-2' });
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-2',
        layer: 'semantic',
        tags: ['shared'],
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.mishmarService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          action: 'memory.write',
          target: 'agent-2',
          authorityLevel: 'L3',
        }),
      );
    });

    it('blocks cross-agent write when Mishmar denies', async () => {
      (mocks.mishmarService.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        reason: 'Write not permitted to target agent',
        auditId: 'audit-deny-2',
      });

      const entry = createSemanticEntry({ sourceAgentId: 'agent-2' });
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-2',
        layer: 'semantic',
        tags: ['shared'],
        entry,
      };

      const result = await governed.authorizedWrite('agent-1', writeEntry);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Cross-agent memory write denied');
    });

    it('does not call zikaronService when cross-agent write is denied', async () => {
      (mocks.mishmarService.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        reason: 'Denied',
        auditId: 'audit-deny-2',
      });

      const entry = createSemanticEntry({ sourceAgentId: 'agent-2' });
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-2',
        layer: 'semantic',
        tags: ['shared'],
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.zikaronService.storeEpisodic).not.toHaveBeenCalled();
      expect(mocks.zikaronService.storeSemantic).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // authorizedWrite — King's conversations (L1 metadata)
  // -------------------------------------------------------------------------

  describe('authorizedWrite — King conversations', () => {
    it('tags King conversations with L1 authority metadata', async () => {
      const entry = createEpisodicEntry({ tags: ['conversation'] });
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        layer: 'episodic',
        tags: ['conversation'],
        isKingConversation: true,
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.zikaronService.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining([
            'conversation',
            'king_conversation',
            'authority:L1',
            'tenant_accessible',
          ]),
        }),
      );
    });

    it('logs King conversation write with isKingConversation flag', async () => {
      const entry = createEpisodicEntry({ tags: ['conversation'] });
      const writeEntry: GovernedWriteEntry = {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        layer: 'episodic',
        tags: ['conversation'],
        isKingConversation: true,
        entry,
      };

      await governed.authorizedWrite('agent-1', writeEntry);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            isKingConversation: true,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // blockDeletion — append-only enforcement
  // -------------------------------------------------------------------------

  describe('blockDeletion — append-only policy', () => {
    it('always blocks deletion attempts', async () => {
      const result = await governed.blockDeletion('agent-1', 'entry-123');

      expect(result.success).toBe(false);
      expect(result.reason).toContain('append-only policy');
    });

    it('logs deletion attempt as security event to XO Audit', async () => {
      await governed.blockDeletion('agent-1', 'entry-123');

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'memory.delete_attempt',
          target: 'entry-123',
          outcome: 'blocked',
          details: expect.objectContaining({
            securityEvent: true,
            reason: expect.stringContaining('Append-only policy violation'),
            attemptedBy: 'agent-1',
            targetEntry: 'entry-123',
          }),
        }),
      );
    });

    it('records denial in authorization chain', async () => {
      await governed.blockDeletion('agent-1', 'entry-123');

      const auditCall = (mocks.xoAuditService.recordAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.authorizationChain).toEqual([
        expect.objectContaining({
          agentId: 'agent-1',
          level: 'L1',
          decision: 'denied',
        }),
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // authorizeIdentityModification — L1 King approval required
  // -------------------------------------------------------------------------

  describe('authorizeIdentityModification — L1 requirement', () => {
    it('calls Mishmar with L1 authority level for identity modifications', async () => {
      const modification = { systemPrompt: 'new prompt', name: 'NewName' };

      await governed.authorizeIdentityModification('agent-1', 'agent-2', modification);

      expect(mocks.mishmarService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          action: 'memory.identity_modification',
          target: 'agent-2',
          authorityLevel: 'L1',
          context: expect.objectContaining({
            operation: 'identity_modification',
            modification,
          }),
        }),
      );
    });

    it('allows identity modification when King approves (L1)', async () => {
      const modification = { systemPrompt: 'new prompt' };

      const result = await governed.authorizeIdentityModification('agent-1', 'agent-2', modification);

      expect(result.success).toBe(true);
      expect(result.data?.authorized).toBe(true);
    });

    it('blocks identity modification when Mishmar denies', async () => {
      (mocks.mishmarService.authorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        reason: 'King approval required',
        auditId: 'audit-deny-3',
      });

      const modification = { systemPrompt: 'new prompt' };
      const result = await governed.authorizeIdentityModification('agent-1', 'agent-2', modification);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('requires L1 King approval');
    });

    it('logs identity modification attempt to XO Audit with keys only', async () => {
      const modification = { systemPrompt: 'new prompt', name: 'NewName' };

      await governed.authorizeIdentityModification('agent-1', 'agent-2', modification);

      expect(mocks.xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'memory.identity_modification',
          target: 'agent-2',
          details: expect.objectContaining({
            modificationKeys: ['systemPrompt', 'name'],
            // Ensure full modification content is NOT logged
          }),
        }),
      );

      // Verify content is not in the audit log
      const auditCall = (mocks.xoAuditService.recordAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.details.modification).toBeUndefined();
      expect(auditCall.details.systemPrompt).toBeUndefined();
    });
  });
});
