/**
 * Unit tests for Agent Marketplace
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4, 19.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceService } from '../service.js';
import { validateProgram } from '../validation.js';

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    service = new MarketplaceService();
  });

  it('should publish a valid program', async () => {
    const result = await service.publishProgram({
      name: 'Test Agent',
      version: '1.0.0',
      description: 'A test agent',
      hasTestSuite: true,
      hasCompletionContracts: true,
      hasDocumentation: true,
      publishedBy: 'user-1',
    });
    expect(result.success).toBe(true);
    expect(result.programId).toBeDefined();
  });

  it('should reject programs missing test suites', async () => {
    const result = await service.publishProgram({
      name: 'Bad Agent',
      version: '1.0.0',
      description: 'Missing tests',
      hasTestSuite: false,
      hasCompletionContracts: true,
      hasDocumentation: true,
      publishedBy: 'user-1',
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Test suite is required');
  });

  it('should install program within tenant isolation', async () => {
    const pub = await service.publishProgram({
      name: 'Agent',
      version: '1.0.0',
      description: 'Test',
      hasTestSuite: true,
      hasCompletionContracts: true,
      hasDocumentation: true,
      publishedBy: 'user-1',
    });
    const install = await service.installProgram(pub.programId!, 'tenant-1');
    expect(install.success).toBe(true);
    expect(install.instanceId).toContain('tenant-1');
  });

  it('should track ratings', async () => {
    const pub = await service.publishProgram({
      name: 'Agent',
      version: '1.0.0',
      description: 'Test',
      hasTestSuite: true,
      hasCompletionContracts: true,
      hasDocumentation: true,
      publishedBy: 'user-1',
    });
    await service.rateProgram(pub.programId!, 5);
    await service.rateProgram(pub.programId!, 3);
    const programs = await service.listPrograms();
    expect(programs[0].rating).toBe(4);
    expect(programs[0].ratingCount).toBe(2);
  });
});

describe('validateProgram', () => {
  it('should validate a complete program', () => {
    const result = validateProgram({ hasTestSuite: true, hasCompletionContracts: true, hasDocumentation: true, testCoverage: 90 });
    expect(result.valid).toBe(true);
  });

  it('should reject low test coverage', () => {
    const result = validateProgram({ hasTestSuite: true, hasCompletionContracts: true, hasDocumentation: true, testCoverage: 50 });
    expect(result.valid).toBe(false);
  });
});
