import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Tenant tiers supported by SeraphimOS.
 * Each tier gets progressively more permissive security group rules.
 */
const TENANT_TIERS = ['free', 'standard', 'premium', 'enterprise'] as const;
type TenantTier = (typeof TENANT_TIERS)[number];

/**
 * Props for the TenantIsolationStack.
 */
export interface TenantIsolationStackProps extends cdk.StackProps {
  /** The VPC to create security groups in (from NetworkingStack). */
  vpc: ec2.IVpc;
  /** The VPC CIDR block for internal-only rules (default: 10.0.0.0/16). */
  vpcCidr?: string;
}

/**
 * Tenant Isolation Stack for SeraphimOS.
 *
 * Creates per-tenant-tier security groups with ingress/egress rules
 * appropriate to each tier level. References the existing VPC from
 * NetworkingStack and exports security group IDs for use by compute
 * resources.
 *
 * Tier rules:
 * - **free**: HTTPS ingress only, HTTPS-only egress (restricted)
 * - **standard**: HTTPS ingress, all outbound egress
 * - **premium**: standard + Redis access from VPC
 * - **enterprise**: premium + PostgreSQL access from VPC
 *
 * Requirements: 20.4 (network-level tenant isolation)
 */
export class TenantIsolationStack extends cdk.Stack {
  /** Per-tier security groups keyed by tier name. */
  public readonly securityGroups: Record<TenantTier, ec2.SecurityGroup>;

  constructor(
    scope: Construct,
    id: string,
    props: TenantIsolationStackProps,
  ) {
    super(scope, id, props);

    const { vpc, vpcCidr = '10.0.0.0/16' } = props;

    this.securityGroups = {} as Record<TenantTier, ec2.SecurityGroup>;

    for (const tier of TENANT_TIERS) {
      // Free tier: restricted egress (HTTPS only).
      // All other tiers: allow all outbound via the CDK constructor flag.
      const allowAllOutbound = tier !== 'free';

      const sg = new ec2.SecurityGroup(this, `${capitalize(tier)}TierSG`, {
        vpc,
        description: `Security group for SeraphimOS ${tier} tier tenants`,
        allowAllOutbound,
      });

      // ── Ingress rules ─────────────────────────────────────────────
      // All tiers get HTTPS ingress
      sg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        `${tier}: HTTPS inbound`,
      );

      // Premium and enterprise get Redis access from VPC
      if (tier === 'premium' || tier === 'enterprise') {
        sg.addIngressRule(
          ec2.Peer.ipv4(vpcCidr),
          ec2.Port.tcp(6379),
          `${tier}: Redis from VPC only`,
        );
      }

      // Enterprise gets PostgreSQL access from VPC
      if (tier === 'enterprise') {
        sg.addIngressRule(
          ec2.Peer.ipv4(vpcCidr),
          ec2.Port.tcp(5432),
          `${tier}: PostgreSQL from VPC only`,
        );
      }

      // ── Egress rules ──────────────────────────────────────────────
      // Free tier: HTTPS-only egress (allowAllOutbound is false)
      if (tier === 'free') {
        sg.addEgressRule(
          ec2.Peer.anyIpv4(),
          ec2.Port.tcp(443),
          `${tier}: HTTPS outbound only`,
        );
      }
      // Other tiers already have all outbound via allowAllOutbound: true

      this.securityGroups[tier] = sg;

      // ── Outputs ─────────────────────────────────────────────────
      new cdk.CfnOutput(this, `${capitalize(tier)}TierSGId`, {
        value: sg.securityGroupId,
        description: `${capitalize(tier)} tier tenant security group ID`,
        exportName: `SeraphimTenant${capitalize(tier)}SGId`,
      });
    }
  }
}

/** Capitalize the first letter of a string. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
