import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Networking stack for SeraphimOS.
 *
 * Creates a VPC with public subnets (ALB, NAT) and private subnets
 * (compute, data) across 2 Availability Zones, plus security groups
 * for the compute and data tiers.
 *
 * Requirements: 15.1 (IaC provisioning), 20.4 (network-level isolation)
 */
export class NetworkingStack extends cdk.Stack {
  /** The VPC shared by all SeraphimOS resources. */
  public readonly vpc: ec2.Vpc;

  /** Security group for compute-tier resources (ECS Fargate, Lambda). */
  public readonly computeSecurityGroup: ec2.SecurityGroup;

  /** Security group for data-tier resources (Aurora, ElastiCache). */
  public readonly dataSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC ────────────────────────────────────────────────────────────
    this.vpc = new ec2.Vpc(this, 'SeraphimVpc', {
      maxAzs: 2,
      natGateways: 1,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'PrivateCompute',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'PrivateData',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ── Security Groups ───────────────────────────────────────────────

    this.computeSecurityGroup = new ec2.SecurityGroup(this, 'ComputeSG', {
      vpc: this.vpc,
      description: 'Security group for SeraphimOS compute tier (ECS Fargate, Lambda)',
      allowAllOutbound: true,
    });

    this.dataSecurityGroup = new ec2.SecurityGroup(this, 'DataSG', {
      vpc: this.vpc,
      description: 'Security group for SeraphimOS data tier (Aurora, caches)',
      allowAllOutbound: false,
    });

    // Allow compute tier → data tier on PostgreSQL port
    this.dataSecurityGroup.addIngressRule(
      this.computeSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from compute tier',
    );

    // ── Outputs ───────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'SeraphimOS VPC ID',
      exportName: 'SeraphimVpcId',
    });

    new cdk.CfnOutput(this, 'ComputeSecurityGroupId', {
      value: this.computeSecurityGroup.securityGroupId,
      description: 'Compute tier security group ID',
      exportName: 'SeraphimComputeSGId',
    });

    new cdk.CfnOutput(this, 'DataSecurityGroupId', {
      value: this.dataSecurityGroup.securityGroupId,
      description: 'Data tier security group ID',
      exportName: 'SeraphimDataSGId',
    });
  }
}
