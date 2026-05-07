import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Props accepted by {@link DataStack}.
 */
export interface DataStackProps extends cdk.StackProps {
  /** VPC where data resources are deployed. */
  vpc: ec2.IVpc;
  /** Security group applied to the Aurora cluster. */
  dataSecurityGroup: ec2.ISecurityGroup;
  /** Deployment stage — 'dev' uses DESTROY removal policies for easy teardown. */
  stage?: string;
}

/**
 * Data-layer stack for SeraphimOS.
 *
 * Provisions:
 * - KMS encryption key shared across all data resources
 * - Aurora PostgreSQL Serverless v2 cluster (Multi-AZ) with pgvector
 * - DynamoDB tables: seraphim-audit-trail, seraphim-events (with GSIs, TTL, streams)
 * - S3 buckets for artifacts and logs
 *
 * Requirements: 15.1, 15.2 (encryption at rest), 20.1, 20.4
 */
export class DataStack extends cdk.Stack {
  /** KMS key used for encryption at rest across all data resources. */
  public readonly encryptionKey: kms.Key;

  /** Aurora PostgreSQL Serverless v2 cluster. */
  public readonly auroraCluster: rds.DatabaseCluster;

  /** DynamoDB table for the XO audit trail. */
  public readonly auditTrailTable: dynamodb.Table;

  /** DynamoDB table for system events. */
  public readonly eventsTable: dynamodb.Table;

  /** S3 bucket for build artifacts and media assets. */
  public readonly artifactsBucket: s3.Bucket;

  /** S3 bucket for system and application logs. */
  public readonly logsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { vpc, dataSecurityGroup } = props;

    // Dev stage uses DESTROY removal policies for easy teardown
    const removalPolicy = props.stage === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;
    const deletionProtection = props.stage !== 'dev';

    // ── KMS Encryption Key ────────────────────────────────────────────
    this.encryptionKey = new kms.Key(this, 'DataEncryptionKey', {
      alias: 'seraphim/data',
      description: 'KMS key for SeraphimOS data-layer encryption at rest',
      enableKeyRotation: true,
      removalPolicy: removalPolicy,
    });

    // ── Aurora PostgreSQL parameter group ────────────────────────────
    // pgvector is enabled via CREATE EXTENSION, not shared_preload_libraries
    const clusterParameterGroup = new rds.ParameterGroup(this, 'AuroraClusterParams', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      description: 'SeraphimOS Aurora cluster params',
    });

    // ── Aurora PostgreSQL Serverless v2 ───────────────────────────────
    this.auroraCluster = new rds.DatabaseCluster(this, 'SeraphimAurora', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      parameterGroup: clusterParameterGroup,
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 8,
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        publiclyAccessible: false,
      }),
      readers: [
        rds.ClusterInstance.serverlessV2('Reader', {
          scaleWithWriter: true,
          publiclyAccessible: false,
        }),
      ],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dataSecurityGroup],
      storageEncryptionKey: this.encryptionKey,
      storageEncrypted: true,
      defaultDatabaseName: 'seraphim',
      removalPolicy: removalPolicy,
      deletionProtection: deletionProtection,
      backup: {
        retention: cdk.Duration.days(14),
      },
    });

    // ── DynamoDB: seraphim-audit-trail ─────────────────────────────────
    this.auditTrailTable = new dynamodb.Table(this, 'AuditTrailTable', {
      tableName: 'seraphim-audit-trail',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#recordId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAt',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: removalPolicy,
    });

    this.auditTrailTable.addGlobalSecondaryIndex({
      indexName: 'actionType-index',
      partitionKey: { name: 'actionType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#recordId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.auditTrailTable.addGlobalSecondaryIndex({
      indexName: 'agentId-index',
      partitionKey: { name: 'agentId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#recordId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.auditTrailTable.addGlobalSecondaryIndex({
      indexName: 'pillar-index',
      partitionKey: { name: 'pillar', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#recordId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── DynamoDB: seraphim-events ──────────────────────────────────────
    this.eventsTable = new dynamodb.Table(this, 'EventsTable', {
      tableName: 'seraphim-events',
      partitionKey: { name: 'tenantId#source', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#eventId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAt',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: removalPolicy,
    });

    this.eventsTable.addGlobalSecondaryIndex({
      indexName: 'eventType-index',
      partitionKey: { name: 'eventType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#eventId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.eventsTable.addGlobalSecondaryIndex({
      indexName: 'correlationId-index',
      partitionKey: { name: 'correlationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp#eventId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── S3: Artifacts Bucket ──────────────────────────────────────────
    this.artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      removalPolicy: removalPolicy,
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // ── S3: Logs Bucket ───────────────────────────────────────────────
    this.logsBucket = new s3.Bucket(this, 'LogsBucket', {
      bucketName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: removalPolicy,
      lifecycleRules: [
        {
          id: 'ExpireLogs',
          expiration: cdk.Duration.days(365),
        },
        {
          id: 'TransitionToGlacier',
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: this.auroraCluster.clusterEndpoint.hostname,
      description: 'Aurora PostgreSQL cluster writer endpoint',
      exportName: 'SeraphimAuroraEndpoint',
    });

    new cdk.CfnOutput(this, 'AuditTrailTableName', {
      value: this.auditTrailTable.tableName,
      description: 'DynamoDB audit trail table name',
      exportName: 'SeraphimAuditTrailTable',
    });

    new cdk.CfnOutput(this, 'EventsTableName', {
      value: this.eventsTable.tableName,
      description: 'DynamoDB events table name',
      exportName: 'SeraphimEventsTable',
    });

    new cdk.CfnOutput(this, 'ArtifactsBucketName', {
      value: this.artifactsBucket.bucketName,
      description: 'S3 artifacts bucket name',
      exportName: 'SeraphimArtifactsBucket',
    });

    new cdk.CfnOutput(this, 'LogsBucketName', {
      value: this.logsBucket.bucketName,
      description: 'S3 logs bucket name',
      exportName: 'SeraphimLogsBucket',
    });
  }
}
