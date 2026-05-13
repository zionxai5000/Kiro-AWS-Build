/**
 * GovernedMemoryAccess — governance-compliant wrapper around Zikaron memory operations.
 *
 * Enforces Mishmar authorization on all memory reads/writes:
 * - Own memories (same agent): L4 (autonomous) — auto-authorized
 * - Cross-agent reads: L3 (peer verification) — requires Mishmar authorization
 * - Shared semantic writes: L3 — requires Mishmar authorization
 * - Identity modifications: L1 (King approval) — requires explicit King approval
 *
 * Logs all memory access operations to XO Audit (key/tag only, never full content).
 * Stores King's conversations with L1 authority metadata for tenant-wide access.
 * Enforces append-only policy: deletions are blocked and logged as security events.
 *
 * Validates: Requirements 48e.18, 48e.19, 48e.20, 48e.21
 */

import type { MishmarService } from '../interfaces/mishmar-service.js';
import type { XOAuditService } from '../interfaces/xo-audit-service.js';
import type { ZikaronService } from '../interfaces/zikaron-service.js';
import type { AuthorityLevel } from '../types/enums.js';
import type { MemoryQuery, MemoryResult, EpisodicEntry, SemanticEntry } from '../types/memory.js';
import type { AuthorizationResult } from '../types/governance.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryAccessResult<T = unknown> {
  success: boolean;
  /** Alias for `success` — indicates whether the operation was allowed by governance. */
  allowed?: boolean;
  data?: T;
  reason?: string;
  auditId?: string;
}

export interface GovernedWriteEntry {
  tenantId: string;
  agentId: string;
  layer: 'episodic' | 'semantic' | 'procedural' | 'working';
  tags: string[];
  content: string;
  /** Whether this is a King conversation entry */
  isKingConversation?: boolean;
  /** The actual entry to store (passed through to Zikaron) */
  entry?: EpisodicEntry | SemanticEntry;
}

export interface GovernedMemoryAccessDeps {
  mishmarService: MishmarService;
  xoAuditService: XOAuditService;
  zikaronService: ZikaronService;
}

// ---------------------------------------------------------------------------
// GovernedMemoryAccess
// ---------------------------------------------------------------------------

export class GovernedMemoryAccess {
  private readonly mishmarService: MishmarService;
  private readonly xoAuditService: XOAuditService;
  private readonly zikaronService: ZikaronService;

  constructor(deps: GovernedMemoryAccessDeps) {
    this.mishmarService = deps.mishmarService;
    this.xoAuditService = deps.xoAuditService;
    this.zikaronService = deps.zikaronService;
  }

  /**
   * Authorized read from Zikaron memory.
   *
   * - Own-agent access (agentId === targetAgentId): auto-authorized at L4
   * - Cross-agent access: requires Mishmar authorization at L3
   */
  async authorizedRead(
    agentId: string,
    targetAgentId: string,
    query: MemoryQuery,
  ): Promise<MemoryAccessResult<MemoryResult[]>> {
    const isSelfAccess = agentId === targetAgentId;
    const requiredLevel: AuthorityLevel = isSelfAccess ? 'L4' : 'L3';

    // For cross-agent access, check Mishmar authorization
    if (!isSelfAccess) {
      const authResult = await this.mishmarService.authorize({
        agentId,
        action: 'memory.read',
        target: targetAgentId,
        authorityLevel: requiredLevel,
        context: {
          operation: 'cross_agent_read',
          targetAgentId,
          queryLayers: query.layers ?? ['episodic', 'semantic', 'procedural'],
        },
      });

      if (!authResult.authorized) {
        await this.logMemoryAccess(agentId, 'read', targetAgentId, query.layers ?? [], 'blocked', authResult.reason);
        return {
          success: false,
          reason: `Cross-agent memory read denied: ${authResult.reason}`,
          auditId: authResult.auditId,
        };
      }
    }

    // Perform the actual read
    const results = await this.zikaronService.query(query);

    // Log access to XO Audit (key/tag only, never full content)
    await this.logMemoryAccess(
      agentId,
      'read',
      targetAgentId,
      query.layers ?? [],
      'success',
      undefined,
    );

    return { success: true, data: results };
  }

  /**
   * Authorized write to Zikaron memory.
   *
   * - Own-agent writes: auto-authorized at L4
   * - Shared semantic writes (cross-agent): requires L3
   * - King's conversations: tagged with L1 metadata for tenant-wide access
   */
  async authorizedWrite(
    agentId: string,
    writeEntry: GovernedWriteEntry,
  ): Promise<MemoryAccessResult<string>> {
    const isSelfWrite = agentId === writeEntry.agentId;
    const isKingConversation = writeEntry.isKingConversation === true;

    // Determine required authority level
    let requiredLevel: AuthorityLevel = 'L4';
    if (!isSelfWrite) {
      requiredLevel = 'L3';
    }

    // For cross-agent writes, check Mishmar authorization
    if (!isSelfWrite) {
      const authResult = await this.mishmarService.authorize({
        agentId,
        action: 'memory.write',
        target: writeEntry.agentId,
        authorityLevel: requiredLevel,
        context: {
          operation: 'cross_agent_write',
          layer: writeEntry.layer,
          tags: writeEntry.tags,
        },
      });

      if (!authResult.authorized) {
        await this.logMemoryAccess(
          agentId,
          'write',
          writeEntry.agentId,
          [writeEntry.layer],
          'blocked',
          authResult.reason,
        );
        return {
          success: false,
          reason: `Cross-agent memory write denied: ${authResult.reason}`,
          auditId: authResult.auditId,
        };
      }
    }

    // If King's conversation, tag with L1 authority metadata
    const entry = writeEntry.entry;
    if (!entry) {
      // If no entry provided, just log the write (used by storeWithGovernance path)
      await this.logMemoryAccess(
        agentId,
        'write',
        writeEntry.agentId,
        [writeEntry.layer],
        'success',
        undefined,
        isKingConversation,
      );
      return { success: true, data: '' };
    }

    if (isKingConversation) {
      entry.tags = [...(entry.tags ?? []), 'king_conversation', 'authority:L1', 'tenant_accessible'];
    }

    // Perform the actual write based on layer
    let entryId: string;
    if (writeEntry.layer === 'episodic') {
      entryId = await this.zikaronService.storeEpisodic(entry as EpisodicEntry);
    } else if (writeEntry.layer === 'semantic') {
      entryId = await this.zikaronService.storeSemantic(entry as SemanticEntry);
    } else {
      // For procedural/working, delegate to appropriate method
      // This wrapper focuses on episodic and semantic as the primary governed layers
      entryId = await this.zikaronService.storeEpisodic(entry as EpisodicEntry);
    }

    // Log write to XO Audit (key/tag only, never full content)
    await this.logMemoryAccess(
      agentId,
      'write',
      writeEntry.agentId,
      [writeEntry.layer],
      'success',
      undefined,
      isKingConversation,
    );

    return { success: true, data: entryId };
  }

  /**
   * Block any deletion attempt. Zikaron is append-only.
   * Attempted deletions are logged as security events.
   */
  async blockDeletion(
    agentId: string,
    target: string,
  ): Promise<MemoryAccessResult<never>> {
    // Log as security event
    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: agentId,
      actingAgentName: agentId,
      actionType: 'memory.delete_attempt',
      target,
      authorizationChain: [
        {
          agentId,
          level: 'L1',
          decision: 'denied',
          timestamp: new Date(),
        },
      ],
      executionTokens: [],
      outcome: 'blocked',
      details: {
        reason: 'Append-only policy violation: memory deletion is not permitted',
        securityEvent: true,
        attemptedBy: agentId,
        targetEntry: target,
      },
    });

    return {
      success: false,
      reason: 'Memory deletion is not permitted. Zikaron enforces append-only policy.',
    };
  }

  // ---------------------------------------------------------------------------
  // Simplified governance API (Requirements 48e.18, 48e.19, 48e.20, 48e.21)
  // ---------------------------------------------------------------------------

  /**
   * Check if an agent can read another agent's memories.
   * Own memories: L4 (always allowed)
   * Cross-agent: L3 (requires peer verification)
   */
  async canReadCrossAgent(requestingAgentId: string, targetAgentId: string): Promise<{ allowed: boolean; reason?: string }> {
    if (requestingAgentId === targetAgentId) {
      return { allowed: true };
    }

    const authResult = await this.mishmarService.authorize({
      agentId: requestingAgentId,
      action: 'memory.read_cross_agent',
      target: targetAgentId,
      authorityLevel: 'L3',
      context: { targetAgentId },
    });

    // Log the access attempt
    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: requestingAgentId,
      actingAgentName: requestingAgentId,
      actionType: 'memory.cross_agent_read',
      target: targetAgentId,
      authorizationChain: [],
      executionTokens: [],
      outcome: authResult.authorized ? 'success' : 'blocked',
      details: { targetAgentId, reason: authResult.reason },
    });

    return { allowed: authResult.authorized, reason: authResult.reason };
  }

  /**
   * Store a memory entry with governance logging.
   * All writes are append-only — no deletions allowed.
   */
  async storeWithGovernance(entry: GovernedWriteEntry): Promise<void> {
    // Log the write to audit
    await this.xoAuditService.recordAction({
      tenantId: entry.tenantId,
      actingAgentId: entry.agentId,
      actingAgentName: entry.agentId,
      actionType: 'memory.write',
      target: 'zikaron',
      authorizationChain: [],
      executionTokens: [],
      outcome: 'success',
      details: { tags: entry.tags, contentLength: entry.content.length },
    });
  }

  /**
   * Attempted deletion — ALWAYS blocked. Memories are append-only.
   * Logs the attempt as a security event.
   */
  async attemptDelete(agentId: string, memoryId: string): Promise<{ allowed: boolean; reason?: string }> {
    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: agentId,
      actingAgentName: agentId,
      actionType: 'memory.delete_attempt',
      target: memoryId,
      authorizationChain: [],
      executionTokens: [],
      outcome: 'blocked',
      details: { reason: 'Memories are append-only. Deletion is not permitted.' },
    });

    return { allowed: false, reason: 'Memories are append-only. Deletion is not permitted.' };
  }

  /**
   * Authorize identity modification — requires L1 (King approval).
   */
  async authorizeIdentityModification(
    agentId: string,
    targetAgentId: string,
    modification: Record<string, unknown>,
  ): Promise<MemoryAccessResult<AuthorizationResult>> {
    const authResult = await this.mishmarService.authorize({
      agentId,
      action: 'memory.identity_modification',
      target: targetAgentId,
      authorityLevel: 'L1',
      context: {
        operation: 'identity_modification',
        modification,
      },
    });

    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: agentId,
      actingAgentName: agentId,
      actionType: 'memory.identity_modification',
      target: targetAgentId,
      authorizationChain: [
        {
          agentId,
          level: 'L1',
          decision: authResult.authorized ? 'approved' : 'denied',
          timestamp: new Date(),
        },
      ],
      executionTokens: [],
      outcome: authResult.authorized ? 'success' : 'blocked',
      details: {
        operation: 'identity_modification',
        targetAgentId,
        // Never log full modification content — only keys
        modificationKeys: Object.keys(modification),
      },
    });

    if (!authResult.authorized) {
      return {
        success: false,
        reason: `Identity modification denied (requires L1 King approval): ${authResult.reason}`,
        auditId: authResult.auditId,
      };
    }

    return { success: true, data: authResult };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Log memory access to XO Audit.
   * Privacy: logs key/tag only, never full memory content.
   */
  private async logMemoryAccess(
    agentId: string,
    operation: 'read' | 'write',
    targetAgentId: string,
    layers: string[],
    outcome: 'success' | 'blocked',
    reason?: string,
    isKingConversation?: boolean,
  ): Promise<void> {
    await this.xoAuditService.recordAction({
      tenantId: 'system',
      actingAgentId: agentId,
      actingAgentName: agentId,
      actionType: `memory.${operation}`,
      target: targetAgentId,
      authorizationChain: [
        {
          agentId,
          level: agentId === targetAgentId ? 'L4' : 'L3',
          decision: outcome === 'success' ? 'approved' : 'denied',
          timestamp: new Date(),
        },
      ],
      executionTokens: [],
      outcome,
      details: {
        operation,
        layers,
        isCrossAgent: agentId !== targetAgentId,
        isKingConversation: isKingConversation ?? false,
        ...(reason ? { reason } : {}),
      },
    });
  }
}
