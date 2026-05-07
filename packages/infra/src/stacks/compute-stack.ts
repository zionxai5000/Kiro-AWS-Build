import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as path from 'node:path';

/**
 * Props accepted by {@link ComputeStack}.
 */
export interface ComputeStackProps extends cdk.StackProps {
  /** VPC where compute resources are deployed. */
  vpc: ec2.IVpc;
  /** Security group for compute-tier resources. */
  computeSecurityGroup: ec2.ISecurityGroup;
  /** Aurora PostgreSQL cluster for granting access. */
  auroraCluster: rds.IDatabaseCluster;
  /** DynamoDB audit trail table. */
  auditTrailTable: dynamodb.ITable;
  /** DynamoDB events table. */
  eventsTable: dynamodb.ITable;
  /** S3 artifacts bucket. */
  artifactsBucket: s3.IBucket;
  /** S3 logs bucket. */
  logsBucket: s3.IBucket;
  /** Secrets Manager encryption key for granting decrypt. */
  secretsEncryptionKey: cdk.aws_kms.IKey;
  /** SQS queue for audit events (from Messaging stack). */
  auditQueue: sqs.IQueue;
  /** SQS queue for memory events (from Messaging stack). */
  memoryQueue: sqs.IQueue;
  /** SQS queue for alert events (from Messaging stack). */
  alertQueue: sqs.IQueue;
  /** SQS queue for workflow events (from Messaging stack). */
  workflowQueue: sqs.IQueue;
  /** SQS queue for learning events (from Messaging stack). */
  learningQueue: sqs.IQueue;
}

/**
 * Compute stack for SeraphimOS.
 *
 * Provisions:
 * - ECS Fargate cluster with agent runtime task definition and auto-scaling service
 * - Lambda functions for event handlers (audit, memory, alert, workflow, learning)
 * - IAM roles with least-privilege access to Aurora, DynamoDB, S3, Secrets Manager, EventBridge
 * - SQS event source mappings for Lambda functions
 *
 * Requirements: 15.1 (IaC provisioning), 15.3 (auto-scaling), 20.4 (IAM roles)
 */
export class ComputeStack extends cdk.Stack {
  /** ECS Fargate cluster running agent runtime containers. */
  public readonly cluster: ecs.Cluster;

  /** ECS Fargate service for the agent runtime. */
  public readonly agentRuntimeService: ecs.FargateService;

  /** Lambda function for processing audit events. */
  public readonly auditHandler: lambda.Function;

  /** Lambda function for processing memory events. */
  public readonly memoryHandler: lambda.Function;

  /** Lambda function for processing alert events. */
  public readonly alertHandler: lambda.Function;

  /** Lambda function for processing workflow events. */
  public readonly workflowHandler: lambda.Function;

  /** Lambda function for processing learning events. */
  public readonly learningHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const {
      vpc,
      computeSecurityGroup,
      auroraCluster,
      auditTrailTable,
      eventsTable,
      artifactsBucket,
      logsBucket,
      secretsEncryptionKey,
      auditQueue,
      memoryQueue,
      alertQueue,
      workflowQueue,
      learningQueue,
    } = props;

    // ── ECS Fargate Cluster ───────────────────────────────────────────
    this.cluster = new ecs.Cluster(this, 'SeraphimCluster', {
      vpc,
      clusterName: 'seraphim-agents',
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ── ECS Task Role (access Aurora, DynamoDB, S3, Secrets Manager, EventBridge) ──
    const ecsTaskRole = new iam.Role(this, 'AgentRuntimeTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM role for SeraphimOS agent runtime ECS tasks',
    });

    // Aurora access via IAM authentication
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AuroraAccess',
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${auroraCluster.clusterResourceIdentifier}/*`,
        ],
      }),
    );

    // DynamoDB access
    auditTrailTable.grantReadWriteData(ecsTaskRole);
    eventsTable.grantReadWriteData(ecsTaskRole);

    // S3 access
    artifactsBucket.grantReadWrite(ecsTaskRole);
    logsBucket.grantReadWrite(ecsTaskRole);

    // Secrets Manager access
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret', 'secretsmanager:ListSecrets'],
        resources: ['*'],
      }),
    );
    secretsEncryptionKey.grantDecrypt(ecsTaskRole);

    // EventBridge access
    ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EventBridgeAccess',
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/seraphim-events`],
      }),
    );

    // ── ECS Task Execution Role ───────────────────────────────────────
    const ecsExecutionRole = new iam.Role(this, 'AgentRuntimeExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS task execution role for pulling images and writing logs',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });

    // ── ECS Task Definition ───────────────────────────────────────────
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'AgentRuntimeTaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      taskRole: ecsTaskRole,
      executionRole: ecsExecutionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const logGroup = new logs.LogGroup(this, 'AgentRuntimeLogs', {
      logGroupName: '/seraphim/agent-runtime',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Build the SeraphimOS production image from the repo root Dockerfile.
    // CDK builds, tags, and pushes to ECR automatically during deploy.
    const agentRuntimeImage = new DockerImageAsset(this, 'AgentRuntimeImage', {
      directory: path.join(__dirname, '..', '..', '..', '..'), // monorepo root
      file: 'Dockerfile',
      platform: Platform.LINUX_AMD64,
      buildArgs: {
        BUILD_VERSION: new Date().toISOString(),
      },
    });

    taskDefinition.addContainer('AgentRuntime', {
      image: ecs.ContainerImage.fromDockerImageAsset(agentRuntimeImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'agent-runtime',
        logGroup,
      }),
      environment: {
        NODE_ENV: 'production',
        AWS_REGION: this.region,
        PORT: '3000',
        SERAPHIM_MODE: 'production',
        AURORA_SECRET_NAME: 'SeraphimAuroraSecret3FC3811-bVxbXGVUFH2L',
      },
      portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3000/health || exit 1'],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 5,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // ── ECS Fargate Service with Auto-Scaling ─────────────────────────
    this.agentRuntimeService = new ecs.FargateService(this, 'AgentRuntimeService', {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: 2,
      minHealthyPercent: 100,
      securityGroups: [computeSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true },
      enableExecuteCommand: true,
    });

    // Auto-scaling: CPU-based
    const scaling = this.agentRuntimeService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // Auto-scaling: Memory-based
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 75,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(30),
    });

    // ── Lambda Execution Role ─────────────────────────────────────────
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for SeraphimOS Lambda event handlers',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole',
        ),
      ],
    });

    // Lambda → Aurora access
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AuroraAccess',
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${auroraCluster.clusterResourceIdentifier}/*`,
        ],
      }),
    );

    // Lambda → DynamoDB access
    auditTrailTable.grantReadWriteData(lambdaRole);
    eventsTable.grantReadWriteData(lambdaRole);

    // Lambda → SQS access (consume messages)
    auditQueue.grantConsumeMessages(lambdaRole);
    memoryQueue.grantConsumeMessages(lambdaRole);
    alertQueue.grantConsumeMessages(lambdaRole);
    workflowQueue.grantConsumeMessages(lambdaRole);
    learningQueue.grantConsumeMessages(lambdaRole);

    // Lambda → Secrets Manager access
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:seraphim/*`],
      }),
    );
    secretsEncryptionKey.grantDecrypt(lambdaRole);

    // Lambda → EventBridge access (for publishing downstream events)
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'EventBridgeAccess',
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/seraphim-events`],
      }),
    );

    // ── Lambda Functions ──────────────────────────────────────────────
    const lambdaDefaults: Partial<lambda.FunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [computeSecurityGroup],
      environment: {
        NODE_ENV: 'production',
        AUDIT_TABLE_NAME: auditTrailTable.tableName,
        EVENTS_TABLE_NAME: eventsTable.tableName,
        ARTIFACTS_BUCKET: artifactsBucket.bucketName,
        LOGS_BUCKET: logsBucket.bucketName,
      },
    };

    this.auditHandler = new lambda.Function(this, 'AuditHandler', {
      ...lambdaDefaults,
      functionName: 'seraphim-audit-handler',
      handler: 'handlers/audit-handler.handler',
      code: lambda.Code.fromAsset('dist/handlers'),
      description: 'Processes audit events from SQS, writes to DynamoDB with hash chain',
    } as lambda.FunctionProps);

    this.memoryHandler = new lambda.Function(this, 'MemoryHandler', {
      ...lambdaDefaults,
      functionName: 'seraphim-memory-handler',
      handler: 'handlers/memory-handler.handler',
      code: lambda.Code.fromAsset('dist/handlers'),
      description: 'Processes memory events, triggers entity extraction, stores in Aurora',
    } as lambda.FunctionProps);

    this.alertHandler = new lambda.Function(this, 'AlertHandler', {
      ...lambdaDefaults,
      functionName: 'seraphim-alert-handler',
      handler: 'handlers/alert-handler.handler',
      code: lambda.Code.fromAsset('dist/handlers'),
      description: 'Processes alert events, formats notifications, delivers through channels',
    } as lambda.FunctionProps);

    this.workflowHandler = new lambda.Function(this, 'WorkflowHandler', {
      ...lambdaDefaults,
      functionName: 'seraphim-workflow-handler',
      handler: 'handlers/workflow-handler.handler',
      code: lambda.Code.fromAsset('dist/handlers'),
      description: 'Processes workflow events, triggers next steps in state machines',
    } as lambda.FunctionProps);

    this.learningHandler = new lambda.Function(this, 'LearningHandler', {
      ...lambdaDefaults,
      functionName: 'seraphim-learning-handler',
      handler: 'handlers/learning-handler.handler',
      code: lambda.Code.fromAsset('dist/handlers'),
      description: 'Processes learning events, feeds into the Learning Engine',
    } as lambda.FunctionProps);

    // ── SQS Event Source Mappings ─────────────────────────────────────
    this.auditHandler.addEventSource(
      new SqsEventSource(auditQueue, { batchSize: 10 }),
    );

    this.memoryHandler.addEventSource(
      new SqsEventSource(memoryQueue, { batchSize: 10, maxBatchingWindow: cdk.Duration.seconds(5) }),
    );

    this.alertHandler.addEventSource(
      new SqsEventSource(alertQueue, { batchSize: 5, maxBatchingWindow: cdk.Duration.seconds(2) }),
    );

    this.workflowHandler.addEventSource(
      new SqsEventSource(workflowQueue, { batchSize: 10 }),
    );

    this.learningHandler.addEventSource(
      new SqsEventSource(learningQueue, { batchSize: 10, maxBatchingWindow: cdk.Duration.seconds(10) }),
    );

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'ECS Fargate cluster ARN',
      exportName: 'SeraphimClusterArn',
    });

    new cdk.CfnOutput(this, 'AgentRuntimeServiceName', {
      value: this.agentRuntimeService.serviceName,
      description: 'ECS agent runtime service name',
      exportName: 'SeraphimAgentRuntimeService',
    });

    new cdk.CfnOutput(this, 'AuditHandlerArn', {
      value: this.auditHandler.functionArn,
      description: 'Audit handler Lambda ARN',
      exportName: 'SeraphimAuditHandlerArn',
    });

    new cdk.CfnOutput(this, 'MemoryHandlerArn', {
      value: this.memoryHandler.functionArn,
      description: 'Memory handler Lambda ARN',
      exportName: 'SeraphimMemoryHandlerArn',
    });

    new cdk.CfnOutput(this, 'AlertHandlerArn', {
      value: this.alertHandler.functionArn,
      description: 'Alert handler Lambda ARN',
      exportName: 'SeraphimAlertHandlerArn',
    });

    new cdk.CfnOutput(this, 'WorkflowHandlerArn', {
      value: this.workflowHandler.functionArn,
      description: 'Workflow handler Lambda ARN',
      exportName: 'SeraphimWorkflowHandlerArn',
    });

    new cdk.CfnOutput(this, 'LearningHandlerArn', {
      value: this.learningHandler.functionArn,
      description: 'Learning handler Lambda ARN',
      exportName: 'SeraphimLearningHandlerArn',
    });
  }
}
