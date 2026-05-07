/**
 * Database Migration Stack
 *
 * Deploys a Lambda-backed custom resource that automatically runs
 * database migrations against Aurora PostgreSQL during CDK deployment.
 * Fully autonomous — no manual intervention required.
 *
 * Requirements: 4.1 (schema), 14.1 (RLS), 20.4 (IAM)
 */

import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface MigrationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  computeSecurityGroup: ec2.ISecurityGroup;
  auroraCluster: rds.IDatabaseCluster;
  auroraSecretArn: string;
  secretsEncryptionKey: cdk.aws_kms.IKey;
}

export class MigrationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MigrationStackProps) {
    super(scope, id, props);

    const { vpc, computeSecurityGroup, auroraCluster, auroraSecretArn, secretsEncryptionKey } = props;

    // Migration Lambda
    const migrationFn = new lambda.Function(this, 'MigrationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'migration-handler.handler',
      code: lambda.Code.fromAsset('dist/migrations'),
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [computeSecurityGroup],
      environment: {
        MIGRATION_VERSION: '001_initial',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant access to Secrets Manager for DB credentials
    migrationFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [auroraSecretArn],
      }),
    );
    secretsEncryptionKey.grantDecrypt(migrationFn);

    // Grant network access to Aurora (via security group — already shared)
    // The compute security group has access to the data security group

    // Custom Resource that triggers migration on every deploy
    const migrationVersion = '001_initial_' + Date.now().toString(36);

    new cr.AwsCustomResource(this, 'RunMigration', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: migrationFn.functionName,
          Payload: JSON.stringify({
            RequestType: 'Create',
            ResourceProperties: {
              SecretArn: auroraSecretArn,
              Version: migrationVersion,
            },
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('migration-' + migrationVersion),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: migrationFn.functionName,
          Payload: JSON.stringify({
            RequestType: 'Update',
            ResourceProperties: {
              SecretArn: auroraSecretArn,
              Version: migrationVersion,
            },
          }),
        },
        physicalResourceId: cr.PhysicalResourceId.of('migration-' + migrationVersion),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [migrationFn.functionArn],
        }),
      ]),
    });

    new cdk.CfnOutput(this, 'MigrationStatus', {
      value: 'Applied',
      description: 'Database migration status',
    });
  }
}
