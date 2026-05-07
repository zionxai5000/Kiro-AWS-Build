import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { TenantIsolationStack } from '../tenant-isolation-stack.js';

/**
 * Tests for the TenantIsolationStack CDK stack.
 *
 * Validates: Requirement 20.4 (network-level tenant isolation)
 */
describe('TenantIsolationStack', () => {
  function createStack() {
    const app = new cdk.App();
    // Create a VPC in a separate stack (simulates NetworkingStack)
    const vpcStack = new cdk.Stack(app, 'VpcStack');
    const vpc = new ec2.Vpc(vpcStack, 'TestVpc', {
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
    });

    const stack = new TenantIsolationStack(app, 'TestTenantIsolationStack', {
      vpc,
    });

    return { app, stack, template: Template.fromStack(stack) };
  }

  it('should match the CloudFormation snapshot', () => {
    const { template } = createStack();
    expect(template.toJSON()).toMatchSnapshot();
  }, 15_000);

  it('should create four security groups (one per tier)', () => {
    const { template } = createStack();
    template.resourceCountIs('AWS::EC2::SecurityGroup', 4);
  });

  it('should export security group IDs for all tiers', () => {
    const { template } = createStack();
    const outputs = template.toJSON().Outputs;
    const outputKeys = Object.keys(outputs ?? {});

    expect(outputKeys).toContainEqual(
      expect.stringContaining('FreeTierSGId'),
    );
    expect(outputKeys).toContainEqual(
      expect.stringContaining('StandardTierSGId'),
    );
    expect(outputKeys).toContainEqual(
      expect.stringContaining('PremiumTierSGId'),
    );
    expect(outputKeys).toContainEqual(
      expect.stringContaining('EnterpriseTierSGId'),
    );
  });

  it('should configure HTTPS ingress on all tier security groups', () => {
    const { template } = createStack();
    // CDK inlines ingress rules into SecurityGroup properties.
    // All 4 SGs should have a port 443 ingress rule.
    const sgs = template.findResources('AWS::EC2::SecurityGroup');
    const sgsWithHttps = Object.values(sgs).filter((sg) => {
      const ingress = (sg.Properties as Record<string, unknown>)
        .SecurityGroupIngress as Array<Record<string, unknown>> | undefined;
      return ingress?.some(
        (rule) => rule.FromPort === 443 && rule.ToPort === 443,
      );
    });
    expect(sgsWithHttps).toHaveLength(4);
  });

  it('should configure PostgreSQL ingress only for enterprise tier', () => {
    const { template } = createStack();
    const sgs = template.findResources('AWS::EC2::SecurityGroup');
    const sgsWithPg = Object.values(sgs).filter((sg) => {
      const ingress = (sg.Properties as Record<string, unknown>)
        .SecurityGroupIngress as Array<Record<string, unknown>> | undefined;
      return ingress?.some(
        (rule) => rule.FromPort === 5432 && rule.ToPort === 5432,
      );
    });
    // Only enterprise tier should have PostgreSQL
    expect(sgsWithPg).toHaveLength(1);
  });

  it('should configure Redis ingress for premium and enterprise tiers', () => {
    const { template } = createStack();
    const sgs = template.findResources('AWS::EC2::SecurityGroup');
    const sgsWithRedis = Object.values(sgs).filter((sg) => {
      const ingress = (sg.Properties as Record<string, unknown>)
        .SecurityGroupIngress as Array<Record<string, unknown>> | undefined;
      return ingress?.some(
        (rule) => rule.FromPort === 6379 && rule.ToPort === 6379,
      );
    });
    // Premium and enterprise tiers should have Redis
    expect(sgsWithRedis).toHaveLength(2);
  });

  it('should restrict free tier egress to HTTPS only', () => {
    const { template } = createStack();
    const sgs = template.findResources('AWS::EC2::SecurityGroup');
    // Find the free tier SG (description contains "free")
    const freeSg = Object.values(sgs).find((sg) => {
      const desc = (sg.Properties as Record<string, unknown>)
        .GroupDescription as string;
      return desc.includes('free');
    });
    expect(freeSg).toBeDefined();
    const egress = (freeSg!.Properties as Record<string, unknown>)
      .SecurityGroupEgress as Array<Record<string, unknown>>;
    // Free tier should only have HTTPS egress (port 443)
    expect(egress).toBeDefined();
    expect(egress.length).toBe(1);
    expect(egress[0].FromPort).toBe(443);
    expect(egress[0].ToPort).toBe(443);
  });
});
