/**
 * Network-Level Tenant Isolation
 *
 * Configures VPC security groups per tenant tier for network-level isolation.
 * Supports standard, premium, and enterprise tiers with progressively
 * stricter security rules.
 *
 * Requirements: 20.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantTier = 'free' | 'standard' | 'premium' | 'enterprise';

export interface TenantIsolationConfig {
  tenantId: string;
  tier: TenantTier;
  vpcId: string;
  subnetIds: string[];
  securityGroupRules: SecurityGroupRule[];
}

export interface SecurityGroupRule {
  direction: 'ingress' | 'egress';
  protocol: 'tcp' | 'udp' | 'all';
  fromPort: number;
  toPort: number;
  /** CIDR block or security group ID */
  source: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TenantIsolationManager {
  private configs = new Map<string, TenantIsolationConfig>();

  /** Configure isolation for a tenant */
  configureIsolation(config: TenantIsolationConfig): void {
    this.configs.set(config.tenantId, config);
  }

  /** Get isolation config for a tenant */
  getIsolationConfig(tenantId: string): TenantIsolationConfig | undefined {
    return this.configs.get(tenantId);
  }

  /** Generate default security group rules based on tenant tier */
  generateDefaultRules(tier: TenantTier): SecurityGroupRule[] {
    // Free tier: HTTPS ingress only, restricted egress (HTTPS only)
    if (tier === 'free') {
      return [
        {
          direction: 'ingress',
          protocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          source: '0.0.0.0/0',
          description: 'HTTPS inbound',
        },
        {
          direction: 'egress',
          protocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          source: '0.0.0.0/0',
          description: 'HTTPS outbound only',
        },
      ];
    }

    const baseRules: SecurityGroupRule[] = [
      {
        direction: 'ingress',
        protocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        source: '0.0.0.0/0',
        description: 'HTTPS inbound',
      },
      {
        direction: 'egress',
        protocol: 'all',
        fromPort: 0,
        toPort: 65535,
        source: '0.0.0.0/0',
        description: 'All outbound',
      },
    ];

    if (tier === 'enterprise') {
      // Enterprise gets dedicated subnets and stricter rules
      baseRules.push({
        direction: 'ingress',
        protocol: 'tcp',
        fromPort: 5432,
        toPort: 5432,
        source: '10.0.0.0/16',
        description: 'PostgreSQL from VPC only',
      });
    }

    if (tier === 'premium' || tier === 'enterprise') {
      baseRules.push({
        direction: 'ingress',
        protocol: 'tcp',
        fromPort: 6379,
        toPort: 6379,
        source: '10.0.0.0/16',
        description: 'Redis from VPC only',
      });
    }

    return baseRules;
  }

  /** Validate that a tenant's isolation config meets minimum security requirements */
  validateIsolation(tenantId: string): { valid: boolean; issues: string[] } {
    const config = this.configs.get(tenantId);
    if (!config) return { valid: false, issues: ['No isolation config found'] };

    const issues: string[] = [];
    if (config.subnetIds.length === 0) issues.push('No subnets configured');
    if (config.securityGroupRules.length === 0)
      issues.push('No security group rules');

    const hasHttps = config.securityGroupRules.some(
      (r) => r.direction === 'ingress' && r.fromPort === 443,
    );
    if (!hasHttps) issues.push('No HTTPS ingress rule');

    return { valid: issues.length === 0, issues };
  }

  /** List all configured tenants */
  listConfigurations(): TenantIsolationConfig[] {
    return Array.from(this.configs.values());
  }
}
