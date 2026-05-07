import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

/**
 * Props accepted by {@link MessagingStack}.
 */
export interface MessagingStackProps extends cdk.StackProps {
  /** Optional KMS key for encrypting SQS messages at rest. */
  encryptionKey?: cdk.aws_kms.IKey;
}

/**
 * Messaging stack for SeraphimOS.
 *
 * Provisions:
 * - EventBridge custom event bus (`seraphim-events`)
 * - SQS queues for each event domain:
 *   - audit-events (FIFO for ordering guarantees)
 *   - memory-events (standard)
 *   - alert-events (standard)
 *   - workflow-events (FIFO for state transition ordering)
 *   - learning-events (standard)
 * - Dead-letter queues for each domain queue
 * - EventBridge rules for content-based routing to SQS queues
 *
 * Requirements: 6.1 (at-least-once delivery), 6.2 (DLQ routing), 6.3 (pub-sub),
 *               6.4 (message ordering within partition), 6.5 (schema validation),
 *               15.1 (IaC provisioning)
 */
export class MessagingStack extends cdk.Stack {
  /** EventBridge custom event bus for all SeraphimOS events. */
  public readonly eventBus: events.EventBus;

  /** FIFO SQS queue for audit events (ordered). */
  public readonly auditQueue: sqs.Queue;

  /** FIFO DLQ for audit events. */
  public readonly auditDlq: sqs.Queue;

  /** Standard SQS queue for memory events. */
  public readonly memoryQueue: sqs.Queue;

  /** DLQ for memory events. */
  public readonly memoryDlq: sqs.Queue;

  /** Standard SQS queue for alert events. */
  public readonly alertQueue: sqs.Queue;

  /** DLQ for alert events. */
  public readonly alertDlq: sqs.Queue;

  /** FIFO SQS queue for workflow/state-transition events (ordered). */
  public readonly workflowQueue: sqs.Queue;

  /** FIFO DLQ for workflow events. */
  public readonly workflowDlq: sqs.Queue;

  /** Standard SQS queue for learning events. */
  public readonly learningQueue: sqs.Queue;

  /** DLQ for learning events. */
  public readonly learningDlq: sqs.Queue;

  /** EventBridge rule routing audit events to the audit queue. */
  public readonly auditRule: events.Rule;

  /** EventBridge rule routing memory events to the memory queue. */
  public readonly memoryRule: events.Rule;

  /** EventBridge rule routing alert events to the alert queue. */
  public readonly alertRule: events.Rule;

  /** EventBridge rule routing workflow events to the workflow queue. */
  public readonly workflowRule: events.Rule;

  /** EventBridge rule routing learning events to the learning queue. */
  public readonly learningRule: events.Rule;

  /** Standard SQS queue for reference ingestion events. */
  public readonly referenceIngestionQueue: sqs.Queue;

  /** DLQ for reference ingestion events. */
  public readonly referenceIngestionDlq: sqs.Queue;

  /** EventBridge rule routing reference.ingested events to the reference ingestion queue. */
  public readonly referenceIngestedRule: events.Rule;

  /** EventBridge rule routing baseline.updated events to Quality Gate and Training Cascade consumers. */
  public readonly baselineUpdatedRule: events.Rule;

  /** EventBridge rule routing reference.ingestion.failed events to the alert queue. */
  public readonly referenceIngestionFailedRule: events.Rule;

  /** Lambda function for processing baseline.updated events. */
  public readonly baselineUpdatedHandler: lambda.Function;

  constructor(scope: Construct, id: string, props?: MessagingStackProps) {
    super(scope, id, props);

    // ── EventBridge Custom Event Bus ──────────────────────────────────
    this.eventBus = new events.EventBus(this, 'SeraphimEventBus', {
      eventBusName: 'seraphim-events',
    });

    // ── FIFO Queues (audit and workflow — ordering required) ───────────

    // Audit DLQ (FIFO)
    this.auditDlq = new sqs.Queue(this, 'AuditDLQ', {
      queueName: 'seraphim-audit-events-dlq.fifo',
      fifo: true,
      retentionPeriod: cdk.Duration.days(14),
      contentBasedDeduplication: true,
    });

    // Audit Queue (FIFO)
    this.auditQueue = new sqs.Queue(this, 'AuditQueue', {
      queueName: 'seraphim-audit-events.fifo',
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: this.auditDlq,
        maxReceiveCount: 3,
      },
    });

    // Workflow DLQ (FIFO)
    this.workflowDlq = new sqs.Queue(this, 'WorkflowDLQ', {
      queueName: 'seraphim-workflow-events-dlq.fifo',
      fifo: true,
      retentionPeriod: cdk.Duration.days(14),
      contentBasedDeduplication: true,
    });

    // Workflow Queue (FIFO)
    this.workflowQueue = new sqs.Queue(this, 'WorkflowQueue', {
      queueName: 'seraphim-workflow-events.fifo',
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: this.workflowDlq,
        maxReceiveCount: 3,
      },
    });

    // ── Standard Queues (memory, alert, learning) ─────────────────────

    // Memory DLQ
    this.memoryDlq = new sqs.Queue(this, 'MemoryDLQ', {
      queueName: 'seraphim-memory-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Memory Queue
    this.memoryQueue = new sqs.Queue(this, 'MemoryQueue', {
      queueName: 'seraphim-memory-events',
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: this.memoryDlq,
        maxReceiveCount: 3,
      },
    });

    // Alert DLQ
    this.alertDlq = new sqs.Queue(this, 'AlertDLQ', {
      queueName: 'seraphim-alert-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Alert Queue
    this.alertQueue = new sqs.Queue(this, 'AlertQueue', {
      queueName: 'seraphim-alert-events',
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: this.alertDlq,
        maxReceiveCount: 3,
      },
    });

    // Learning DLQ
    this.learningDlq = new sqs.Queue(this, 'LearningDLQ', {
      queueName: 'seraphim-learning-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Learning Queue
    this.learningQueue = new sqs.Queue(this, 'LearningQueue', {
      queueName: 'seraphim-learning-events',
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: this.learningDlq,
        maxReceiveCount: 3,
      },
    });

    // ── EventBridge Rules (content-based routing) ─────────────────────

    // Route audit events → audit FIFO queue
    this.auditRule = new events.Rule(this, 'AuditEventRule', {
      ruleName: 'seraphim-route-audit-events',
      description: 'Routes audit-related events to the audit FIFO queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: [
          'audit.action.recorded',
          'audit.governance.decision',
          'audit.state.transition',
          'audit.security.event',
        ],
      },
      targets: [
        new targets.SqsQueue(this.auditQueue, {
          messageGroupId: 'audit-events',
        }),
      ],
    });

    // Route memory events → memory standard queue
    this.memoryRule = new events.Rule(this, 'MemoryEventRule', {
      ruleName: 'seraphim-route-memory-events',
      description: 'Routes memory-related events to the memory queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: [
          'memory.episodic.stored',
          'memory.semantic.stored',
          'memory.procedural.stored',
          'memory.working.updated',
          'memory.entity.extracted',
          'memory.conflict.detected',
        ],
      },
      targets: [new targets.SqsQueue(this.memoryQueue)],
    });

    // Route alert events → alert standard queue
    this.alertRule = new events.Rule(this, 'AlertEventRule', {
      ruleName: 'seraphim-route-alert-events',
      description: 'Routes alert and notification events to the alert queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: [
          'alert.threshold.exceeded',
          'alert.agent.degraded',
          'alert.budget.exceeded',
          'alert.driver.failure',
          'alert.security.violation',
          'alert.system.health',
        ],
      },
      targets: [new targets.SqsQueue(this.alertQueue)],
    });

    // Route workflow/state-transition events → workflow FIFO queue
    this.workflowRule = new events.Rule(this, 'WorkflowEventRule', {
      ruleName: 'seraphim-route-workflow-events',
      description: 'Routes workflow and state transition events to the workflow FIFO queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: [
          'workflow.state.transition',
          'workflow.gate.evaluated',
          'workflow.completed',
          'workflow.failed',
          'agent.lifecycle.deployed',
          'agent.lifecycle.upgraded',
          'agent.lifecycle.terminated',
        ],
      },
      targets: [
        new targets.SqsQueue(this.workflowQueue, {
          messageGroupId: 'workflow-events',
        }),
      ],
    });

    // Route learning events → learning standard queue
    this.learningRule = new events.Rule(this, 'LearningEventRule', {
      ruleName: 'seraphim-route-learning-events',
      description: 'Routes learning and improvement events to the learning queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: [
          'learning.pattern.detected',
          'learning.fix.proposed',
          'learning.fix.verified',
          'learning.fix.applied',
          'learning.failure.analyzed',
        ],
      },
      targets: [new targets.SqsQueue(this.learningQueue)],
    });

    // ── Reference Ingestion Queues ────────────────────────────────────

    // Reference Ingestion DLQ
    this.referenceIngestionDlq = new sqs.Queue(this, 'ReferenceIngestionDLQ', {
      queueName: 'seraphim-reference-ingestion-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Reference Ingestion Queue
    this.referenceIngestionQueue = new sqs.Queue(this, 'ReferenceIngestionQueue', {
      queueName: 'seraphim-reference-ingestion-queue',
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: this.referenceIngestionDlq,
        maxReceiveCount: 3,
      },
    });

    // ── Reference Ingestion EventBridge Rules ─────────────────────────

    // Route reference.ingested events → reference ingestion queue (Req 34j.55)
    this.referenceIngestedRule = new events.Rule(this, 'ReferenceIngestedRule', {
      ruleName: 'seraphim-route-reference-ingested',
      description: 'Routes reference.ingested events to the reference ingestion queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: ['reference.ingested'],
      },
      targets: [new targets.SqsQueue(this.referenceIngestionQueue)],
    });

    // Route baseline.updated events → reference ingestion queue for Quality Gate
    // and Training Cascade consumers (Req 34j.56, 34j.57, 34j.58)
    this.baselineUpdatedRule = new events.Rule(this, 'BaselineUpdatedRule', {
      ruleName: 'seraphim-route-baseline-updated',
      description: 'Routes baseline.updated events to Quality Gate and Training Cascade consumers',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: ['baseline.updated'],
      },
      targets: [new targets.SqsQueue(this.referenceIngestionQueue)],
    });

    // Route reference.ingestion.failed events → alert queue (Req 34j.60)
    this.referenceIngestionFailedRule = new events.Rule(this, 'ReferenceIngestionFailedRule', {
      ruleName: 'seraphim-route-reference-ingestion-failed',
      description: 'Routes reference.ingestion.failed events to the alert queue',
      eventBus: this.eventBus,
      eventPattern: {
        source: [{ prefix: 'seraphim.' }] as unknown as string[],
        detailType: ['reference.ingestion.failed'],
      },
      targets: [new targets.SqsQueue(this.alertQueue)],
    });

    // ── Baseline Updated Lambda Handler ───────────────────────────────

    this.baselineUpdatedHandler = new lambda.Function(this, 'BaselineUpdatedHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      functionName: 'seraphim-baseline-updated-handler',
      handler: 'handlers/baseline-updated-handler.handler',
      code: lambda.Code.fromAsset('dist/handlers'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      description: 'Processes baseline.updated events, notifies Training Cascade and Quality Gate',
      environment: {
        NODE_ENV: 'production',
        EVENT_BUS_NAME: this.eventBus.eventBusName,
      },
    });

    // Grant the baseline updated handler permission to consume from the reference ingestion queue
    this.referenceIngestionQueue.grantConsumeMessages(this.baselineUpdatedHandler);

    // Add SQS event source mapping for baseline.updated events
    this.baselineUpdatedHandler.addEventSource(
      new SqsEventSource(this.referenceIngestionQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
      }),
    );

    // Grant the handler permission to publish follow-up events to EventBridge
    this.eventBus.grantPutEventsTo(this.baselineUpdatedHandler);

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'EventBridge custom event bus name',
      exportName: 'SeraphimEventBusName',
    });

    new cdk.CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      description: 'EventBridge custom event bus ARN',
      exportName: 'SeraphimEventBusArn',
    });

    new cdk.CfnOutput(this, 'AuditQueueUrl', {
      value: this.auditQueue.queueUrl,
      description: 'Audit FIFO queue URL',
      exportName: 'SeraphimAuditQueueUrl',
    });

    new cdk.CfnOutput(this, 'MemoryQueueUrl', {
      value: this.memoryQueue.queueUrl,
      description: 'Memory queue URL',
      exportName: 'SeraphimMemoryQueueUrl',
    });

    new cdk.CfnOutput(this, 'AlertQueueUrl', {
      value: this.alertQueue.queueUrl,
      description: 'Alert queue URL',
      exportName: 'SeraphimAlertQueueUrl',
    });

    new cdk.CfnOutput(this, 'WorkflowQueueUrl', {
      value: this.workflowQueue.queueUrl,
      description: 'Workflow FIFO queue URL',
      exportName: 'SeraphimWorkflowQueueUrl',
    });

    new cdk.CfnOutput(this, 'LearningQueueUrl', {
      value: this.learningQueue.queueUrl,
      description: 'Learning queue URL',
      exportName: 'SeraphimLearningQueueUrl',
    });

    new cdk.CfnOutput(this, 'ReferenceIngestionQueueUrl', {
      value: this.referenceIngestionQueue.queueUrl,
      description: 'Reference ingestion queue URL',
      exportName: 'SeraphimReferenceIngestionQueueUrl',
    });

    new cdk.CfnOutput(this, 'BaselineUpdatedHandlerArn', {
      value: this.baselineUpdatedHandler.functionArn,
      description: 'Baseline updated handler Lambda ARN',
      exportName: 'SeraphimBaselineUpdatedHandlerArn',
    });
  }
}
