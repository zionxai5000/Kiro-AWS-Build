/**
 * Unit tests for ZionX App Factory — Rejection Handler
 *
 * Validates: Requirements 11.4, 19.1
 *
 * Tests that rejection parsing creates new gate checks and stores
 * patterns in Zikaron procedural memory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RejectionHandler } from '../rejection-handler.js';
import type { RejectionEvent } from '../rejection-handler.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Zikaron Service
// ---------------------------------------------------------------------------

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue(undefined),
    storeSemantic: vi.fn().mockResolvedValue(undefined),
    storeProcedural: vi.fn().mockResolvedValue(undefined),
    storeWorking: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ working: [], episodic: [], procedural: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  } as unknown as ZikaronService;
}

describe('RejectionHandler', () => {
  let handler: RejectionHandler;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockZikaron = createMockZikaron();
    handler = new RejectionHandler(mockZikaron);
  });

  describe('parseRejectionCodes', () => {
    it('should parse known Apple rejection codes', () => {
      const reasons = handler.parseRejectionCodes('apple', ['GUIDELINE_2_1', 'GUIDELINE_5_1_1']);
      expect(reasons).toHaveLength(2);
      expect(reasons[0].code).toBe('GUIDELINE_2_1');
      expect(reasons[0].category).toBe('guideline_violation');
      expect(reasons[1].code).toBe('GUIDELINE_5_1_1');
      expect(reasons[1].category).toBe('legal_issue');
    });

    it('should parse known Google rejection codes', () => {
      const reasons = handler.parseRejectionCodes('google', ['TECHNICAL_CRASH_RATE', 'SECURITY_DATA_SAFETY']);
      expect(reasons).toHaveLength(2);
      expect(reasons[0].code).toBe('TECHNICAL_CRASH_RATE');
      expect(reasons[0].category).toBe('technical_issue');
      expect(reasons[1].code).toBe('SECURITY_DATA_SAFETY');
      expect(reasons[1].category).toBe('security_issue');
    });

    it('should handle unknown rejection codes gracefully', () => {
      const reasons = handler.parseRejectionCodes('apple', ['UNKNOWN_CODE_123']);
      expect(reasons).toHaveLength(1);
      expect(reasons[0].code).toBe('UNKNOWN_CODE_123');
      expect(reasons[0].category).toBe('unknown');
    });
  });

  describe('createPreventionGates', () => {
    it('should create a gate for each rejection reason', () => {
      const reasons = handler.parseRejectionCodes('apple', ['GUIDELINE_2_1', 'GUIDELINE_4_0']);
      const gates = handler.createPreventionGates('apple', reasons);
      expect(gates).toHaveLength(2);
      for (const gate of gates) {
        expect(gate.type).toBe('validation');
        expect(gate.required).toBe(true);
        expect(gate.config.createdFromRejection).toBe(true);
        expect(gate.config.platform).toBe('apple');
      }
    });

    it('should include rejection code in gate config', () => {
      const reasons = handler.parseRejectionCodes('google', ['TECHNICAL_PERMISSIONS']);
      const gates = handler.createPreventionGates('google', reasons);
      expect(gates[0].config.rejectionCode).toBe('TECHNICAL_PERMISSIONS');
    });
  });

  describe('buildRemediationPlan', () => {
    it('should create ordered remediation steps', () => {
      const reasons = handler.parseRejectionCodes('apple', ['GUIDELINE_2_1', 'METADATA_MISSING_SCREENSHOTS']);
      const gates = handler.createPreventionGates('apple', reasons);
      const plan = handler.buildRemediationPlan(reasons, gates);
      expect(plan).toHaveLength(2);
      expect(plan[0].order).toBe(1);
      expect(plan[1].order).toBe(2);
      expect(plan[0].gateId).toBe(gates[0].id);
    });

    it('should estimate effort based on category', () => {
      const reasons = handler.parseRejectionCodes('apple', [
        'METADATA_MISSING_SCREENSHOTS',
        'GUIDELINE_2_1',
      ]);
      const gates = handler.createPreventionGates('apple', reasons);
      const plan = handler.buildRemediationPlan(reasons, gates);
      expect(plan[0].estimatedEffort).toBe('low'); // metadata_issue
      expect(plan[1].estimatedEffort).toBe('high'); // guideline_violation
    });
  });

  describe('handleRejection', () => {
    it('should parse, create gates, build plan, and store pattern', async () => {
      const event: RejectionEvent = {
        appId: 'app-123',
        platform: 'apple',
        submissionId: 'sub-456',
        rejectionCodes: ['GUIDELINE_2_1'],
        rejectedAt: new Date().toISOString(),
      };

      const result = await handler.handleRejection(event);

      expect(result.appId).toBe('app-123');
      expect(result.platform).toBe('apple');
      expect(result.reasons).toHaveLength(1);
      expect(result.newGates).toHaveLength(1);
      expect(result.remediationPlan).toHaveLength(1);
      expect(result.parsedAt).toBeDefined();

      // Verify Zikaron was called to store the pattern
      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple rejection codes', async () => {
      const event: RejectionEvent = {
        appId: 'app-789',
        platform: 'google',
        submissionId: 'sub-101',
        rejectionCodes: ['TECHNICAL_CRASH_RATE', 'METADATA_MISLEADING_SCREENSHOTS', 'SECURITY_DATA_SAFETY'],
        rejectedAt: new Date().toISOString(),
      };

      const result = await handler.handleRejection(event);

      expect(result.reasons).toHaveLength(3);
      expect(result.newGates).toHaveLength(3);
      expect(result.remediationPlan).toHaveLength(3);
    });
  });
});
