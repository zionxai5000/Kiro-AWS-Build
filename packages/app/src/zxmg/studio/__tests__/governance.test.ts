/**
 * Unit tests for ZXMG Video Development Studio — Governance & Audit Service
 *
 * Validates: Requirements 44g.33, 44g.34, 44g.35, 44g.36
 *
 * Tests publish approval workflow, action logging, and audit trail retrieval.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultVideoGovernanceService,
  type VideoGovernanceService,
  type ApprovalPolicy,
  type AuditStore,
  type AuditEntry,
} from '../governance.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockApprovalPolicy(approved = true): ApprovalPolicy {
  return {
    evaluate: vi.fn().mockResolvedValue(approved),
  };
}

function createMockAuditStore(): AuditStore {
  const entries = new Map<string, AuditEntry[]>();
  let idCounter = 0;
  return {
    log: vi.fn(async (channelId: string, entry: AuditEntry) => {
      idCounter++;
      const id = `audit-${idCounter}`;
      const existing = entries.get(channelId) ?? [];
      existing.push(entry);
      entries.set(channelId, existing);
      return id;
    }),
    getTrail: vi.fn(async (channelId: string) => entries.get(channelId) ?? []),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultVideoGovernanceService', () => {
  let service: VideoGovernanceService;
  let approvalPolicy: ReturnType<typeof createMockApprovalPolicy>;
  let auditStore: ReturnType<typeof createMockAuditStore>;

  beforeEach(() => {
    approvalPolicy = createMockApprovalPolicy(true);
    auditStore = createMockAuditStore();
    service = new DefaultVideoGovernanceService(approvalPolicy, auditStore);
  });

  // -------------------------------------------------------------------------
  // Publish Approval
  // -------------------------------------------------------------------------

  describe('requestPublishApproval', () => {
    it('returns approved when policy evaluates to true', async () => {
      const result = await service.requestPublishApproval('ch-1', 'vid-1');

      expect(result.approved).toBe(true);
    });

    it('returns not approved when policy evaluates to false', async () => {
      approvalPolicy = createMockApprovalPolicy(false);
      service = new DefaultVideoGovernanceService(approvalPolicy, auditStore);

      const result = await service.requestPublishApproval('ch-1', 'vid-2');

      expect(result.approved).toBe(false);
    });

    it('evaluates policy with correct channel and video IDs', async () => {
      await service.requestPublishApproval('ch-5', 'vid-10');

      expect(approvalPolicy.evaluate).toHaveBeenCalledWith('ch-5', 'vid-10');
    });

    it('logs approval request to audit trail', async () => {
      await service.requestPublishApproval('ch-1', 'vid-1');

      expect(auditStore.log).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({
          action: 'publish_approval_requested',
          details: expect.objectContaining({ videoId: 'vid-1', approved: true }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Action Logging
  // -------------------------------------------------------------------------

  describe('logAction', () => {
    it('logs action and returns audit entry ID', async () => {
      const id = await service.logAction('ch-1', 'video.generated', {
        videoId: 'vid-1',
        model: 'runway-gen3',
      });

      expect(id).toBeTruthy();
      expect(id).toMatch(/^audit-/);
    });

    it('stores action with timestamp and details', async () => {
      await service.logAction('ch-1', 'script.edited', { editor: 'user-1' });

      expect(auditStore.log).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({
          action: 'script.edited',
          details: { editor: 'user-1' },
          timestamp: expect.any(Number),
        }),
      );
    });

    it('logs multiple actions for the same channel', async () => {
      const id1 = await service.logAction('ch-1', 'action-1', {});
      const id2 = await service.logAction('ch-1', 'action-2', {});

      expect(id1).not.toBe(id2);
    });
  });

  // -------------------------------------------------------------------------
  // Audit Trail
  // -------------------------------------------------------------------------

  describe('getAuditTrail', () => {
    it('returns all logged actions for a channel', async () => {
      await service.logAction('ch-1', 'video.created', { videoId: 'vid-1' });
      await service.logAction('ch-1', 'video.published', { videoId: 'vid-1' });

      const trail = await service.getAuditTrail('ch-1');

      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe('video.created');
      expect(trail[1].action).toBe('video.published');
    });

    it('returns empty array when no actions logged', async () => {
      const trail = await service.getAuditTrail('ch-empty');

      expect(trail).toEqual([]);
    });

    it('includes approval requests in audit trail', async () => {
      await service.requestPublishApproval('ch-1', 'vid-1');

      const trail = await service.getAuditTrail('ch-1');

      expect(trail).toHaveLength(1);
      expect(trail[0].action).toBe('publish_approval_requested');
      expect(trail[0].details).toEqual(
        expect.objectContaining({ videoId: 'vid-1', approved: true }),
      );
    });
  });
});
