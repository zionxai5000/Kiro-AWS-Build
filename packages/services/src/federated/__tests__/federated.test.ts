/**
 * Unit tests for Federated Intelligence
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 19.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FederatedIntelligenceService } from '../service.js';

describe('FederatedIntelligenceService', () => {
  let service: FederatedIntelligenceService;

  beforeEach(() => {
    service = new FederatedIntelligenceService();
  });

  it('should publish anonymized patterns', async () => {
    const pattern = await service.publishPattern(
      'code_generation',
      'Add retry logic for token limit errors',
      { addRetry: true, maxRetries: 3 },
      85,
    );
    expect(pattern).not.toBeNull();
    expect(pattern!.anonymized).toBe(true);
  });

  it('should reject patterns containing PII', async () => {
    const pattern = await service.publishPattern(
      'code_generation',
      'Fix for user@example.com tenant',
      { fix: 'something' },
      80,
    );
    expect(pattern).toBeNull();
  });

  it('should reject patterns containing API keys', async () => {
    const result = service.checkAnonymization('Use key sk-abc123def456ghi789jkl012');
    expect(result.clean).toBe(false);
  });

  it('should reject patterns containing tenant IDs', async () => {
    const result = service.checkAnonymization('Applied to tenant-abc-123');
    expect(result.clean).toBe(false);
  });

  it('should evaluate pattern applicability', async () => {
    const pattern = await service.publishPattern('code_generation', 'Fix', { fix: true }, 90);
    const eval1 = await service.evaluatePattern(pattern!.id, ['code_generation']);
    expect(eval1.applicable).toBe(true);
    expect(eval1.score).toBe(90);

    const eval2 = await service.evaluatePattern(pattern!.id, ['analysis']);
    expect(eval2.applicable).toBe(false);
  });

  it('should track adoption', async () => {
    const pattern = await service.publishPattern('analysis', 'Fix', { fix: true }, 80);
    await service.adoptPattern(pattern!.id);
    await service.adoptPattern(pattern!.id);
    const metrics = service.getPatternMetrics();
    expect(metrics.totalAdoptions).toBe(2);
  });
});
