/**
 * Unit tests for the Tenant Isolation Manager.
 *
 * Validates: Requirements 20.4
 *
 * - 20.4: Enforce network-level isolation between Tenants using AWS VPC configurations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TenantIsolationManager } from './tenant-isolation.js';
import type {
  TenantIsolationConfig,
  SecurityGroupRule,
  TenantTier,
} from './tenant-isolation.js';

describe('TenantIsolationManager', () => {
  let manager: TenantIsolationManager;

  beforeEach(() => {
    manager = new TenantIsolationManager();
  });

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  describe('configureIsolation', () => {
    it('should store and retrieve isolation config for a tenant', () => {
      const config: TenantIsolationConfig = {
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-abc123',
        subnetIds: ['subnet-1', 'subnet-2'],
        securityGroupRules: [
          {
            direction: 'ingress',
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            source: '0.0.0.0/0',
            description: 'HTTPS inbound',
          },
        ],
      };

      manager.configureIsolation(config);
      const retrieved = manager.getIsolationConfig('tenant-001');

      expect(retrieved).toEqual(config);
    });

    it('should return undefined for unconfigured tenant', () => {
      expect(manager.getIsolationConfig('unknown')).toBeUndefined();
    });

    it('should overwrite existing config for the same tenant', () => {
      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-old',
        subnetIds: ['subnet-1'],
        securityGroupRules: [],
      });

      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'enterprise',
        vpcId: 'vpc-new',
        subnetIds: ['subnet-1', 'subnet-2'],
        securityGroupRules: [],
      });

      const config = manager.getIsolationConfig('tenant-001');
      expect(config?.tier).toBe('enterprise');
      expect(config?.vpcId).toBe('vpc-new');
    });
  });

  // -----------------------------------------------------------------------
  // Default Rules Generation (Req 20.4)
  // -----------------------------------------------------------------------

  describe('generateDefaultRules', () => {
    it('should generate base rules for standard tier', () => {
      const rules = manager.generateDefaultRules('standard');

      expect(rules).toHaveLength(2);
      expect(rules).toContainEqual(
        expect.objectContaining({
          direction: 'ingress',
          fromPort: 443,
          description: 'HTTPS inbound',
        }),
      );
      expect(rules).toContainEqual(
        expect.objectContaining({
          direction: 'egress',
          description: 'All outbound',
        }),
      );
    });

    it('should generate restricted rules for free tier', () => {
      const rules = manager.generateDefaultRules('free');

      expect(rules).toHaveLength(2);
      expect(rules).toContainEqual(
        expect.objectContaining({
          direction: 'ingress',
          fromPort: 443,
          description: 'HTTPS inbound',
        }),
      );
      expect(rules).toContainEqual(
        expect.objectContaining({
          direction: 'egress',
          fromPort: 443,
          toPort: 443,
          description: 'HTTPS outbound only',
        }),
      );
      // Free tier should NOT have all-outbound
      expect(rules).not.toContainEqual(
        expect.objectContaining({
          description: 'All outbound',
        }),
      );
    });

    it('should add Redis rule for premium tier', () => {
      const rules = manager.generateDefaultRules('premium');

      expect(rules).toHaveLength(3);
      expect(rules).toContainEqual(
        expect.objectContaining({
          fromPort: 6379,
          description: 'Redis from VPC only',
        }),
      );
    });

    it('should add PostgreSQL and Redis rules for enterprise tier', () => {
      const rules = manager.generateDefaultRules('enterprise');

      expect(rules).toHaveLength(4);
      expect(rules).toContainEqual(
        expect.objectContaining({
          fromPort: 5432,
          description: 'PostgreSQL from VPC only',
        }),
      );
      expect(rules).toContainEqual(
        expect.objectContaining({
          fromPort: 6379,
          description: 'Redis from VPC only',
        }),
      );
    });

    it('should restrict database access to VPC CIDR for enterprise', () => {
      const rules = manager.generateDefaultRules('enterprise');
      const pgRule = rules.find((r) => r.fromPort === 5432);

      expect(pgRule?.source).toBe('10.0.0.0/16');
      expect(pgRule?.direction).toBe('ingress');
    });
  });

  // -----------------------------------------------------------------------
  // Validation (Req 20.4)
  // -----------------------------------------------------------------------

  describe('validateIsolation', () => {
    it('should validate a properly configured tenant', () => {
      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-abc123',
        subnetIds: ['subnet-1'],
        securityGroupRules: [
          {
            direction: 'ingress',
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            source: '0.0.0.0/0',
            description: 'HTTPS inbound',
          },
        ],
      });

      const result = manager.validateIsolation('tenant-001');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should report missing config', () => {
      const result = manager.validateIsolation('unknown');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No isolation config found');
    });

    it('should report missing subnets', () => {
      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-abc123',
        subnetIds: [],
        securityGroupRules: [
          {
            direction: 'ingress',
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            source: '0.0.0.0/0',
            description: 'HTTPS',
          },
        ],
      });

      const result = manager.validateIsolation('tenant-001');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No subnets configured');
    });

    it('should report missing security group rules', () => {
      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-abc123',
        subnetIds: ['subnet-1'],
        securityGroupRules: [],
      });

      const result = manager.validateIsolation('tenant-001');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No security group rules');
      expect(result.issues).toContain('No HTTPS ingress rule');
    });

    it('should report missing HTTPS ingress rule', () => {
      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-abc123',
        subnetIds: ['subnet-1'],
        securityGroupRules: [
          {
            direction: 'egress',
            protocol: 'all',
            fromPort: 0,
            toPort: 65535,
            source: '0.0.0.0/0',
            description: 'All outbound',
          },
        ],
      });

      const result = manager.validateIsolation('tenant-001');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('No HTTPS ingress rule');
    });
  });

  // -----------------------------------------------------------------------
  // List Configurations
  // -----------------------------------------------------------------------

  describe('listConfigurations', () => {
    it('should return all configured tenants', () => {
      manager.configureIsolation({
        tenantId: 'tenant-001',
        tier: 'standard',
        vpcId: 'vpc-1',
        subnetIds: ['subnet-1'],
        securityGroupRules: [],
      });
      manager.configureIsolation({
        tenantId: 'tenant-002',
        tier: 'enterprise',
        vpcId: 'vpc-2',
        subnetIds: ['subnet-2'],
        securityGroupRules: [],
      });

      const configs = manager.listConfigurations();
      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.tenantId)).toContain('tenant-001');
      expect(configs.map((c) => c.tenantId)).toContain('tenant-002');
    });

    it('should return empty array when no tenants configured', () => {
      expect(manager.listConfigurations()).toHaveLength(0);
    });
  });
});
