#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiStack } from './stacks/api-stack.js';
import { ComputeStack } from './stacks/compute-stack.js';
import { DashboardStack } from './stacks/dashboard-stack.js';
import { DataStack } from './stacks/data-stack.js';
import { MessagingStack } from './stacks/messaging-stack.js';
import { NetworkingStack } from './stacks/networking-stack.js';
import { PipelineStack } from './stacks/pipeline-stack.js';
import { SecretsStack } from './stacks/secrets-stack.js';

import { TenantIsolationStack } from './stacks/tenant-isolation-stack.js';
import { MigrationStack } from './stacks/migration-stack.js';

/**
 * SeraphimOS CDK Application entry point.
 *
 * Composes all infrastructure stacks with proper cross-stack references:
 *   1. NetworkingStack  — VPC, subnets, security groups
 *   2. SecretsStack     — KMS key + Secrets Manager entries for external services
 *   3. DataStack        — Aurora PostgreSQL, DynamoDB tables, S3 buckets
 *   4. ComputeStack     — ECS Fargate cluster, Lambda functions
 *   5. ApiStack         — API Gateway (REST + WebSocket), Cognito
 *   6. MessagingStack   — EventBridge, SQS queues, DLQ
 *   7. DashboardStack   — S3 + CloudFront for React dashboard
 *   8. PipelineStack    — CDK Pipelines CI/CD
 *
 * Environment-specific settings (dev, staging, prod) are configured via
 * context variables passed at synth time.
 *
 * Requirements: 15.1, 15.6
 */
const app = new cdk.App();

// ── Environment Configuration ─────────────────────────────────────────────────
const stage = app.node.tryGetContext('stage') ?? 'dev';

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const stageConfig: Record<string, { minCapacity: number; maxCapacity: number; budgetDaily: number }> = {
  dev: { minCapacity: 1, maxCapacity: 2, budgetDaily: 50 },
  staging: { minCapacity: 2, maxCapacity: 4, budgetDaily: 200 },
  prod: { minCapacity: 2, maxCapacity: 10, budgetDaily: 1000 },
};

const config = stageConfig[stage] ?? stageConfig.dev!;

// ── Shared config passed to all stacks ────────────────────────────────────────
const isDev = stage === 'dev';

// ── Networking ────────────────────────────────────────────────────────────────
const networkingStack = new NetworkingStack(app, `Seraphim-${stage}-Networking`, { env });

// ── Secrets ───────────────────────────────────────────────────────────────────
const secretsStack = new SecretsStack(app, `Seraphim-${stage}-Secrets`, { env });

// ── Data Layer ────────────────────────────────────────────────────────────────
const dataStack = new DataStack(app, `Seraphim-${stage}-Data`, {
  env,
  vpc: networkingStack.vpc,
  dataSecurityGroup: networkingStack.dataSecurityGroup,
  stage,
});
dataStack.addDependency(networkingStack);

// ── Messaging Layer ───────────────────────────────────────────────────────
const messagingStack = new MessagingStack(app, `Seraphim-${stage}-Messaging`, { env });

// ── Compute Layer ─────────────────────────────────────────────────────────────
const computeStack = new ComputeStack(app, `Seraphim-${stage}-Compute`, {
  env,
  vpc: networkingStack.vpc,
  computeSecurityGroup: networkingStack.computeSecurityGroup,
  auroraCluster: dataStack.auroraCluster,
  auditTrailTable: dataStack.auditTrailTable,
  eventsTable: dataStack.eventsTable,
  artifactsBucket: dataStack.artifactsBucket,
  logsBucket: dataStack.logsBucket,
  secretsEncryptionKey: secretsStack.secretsEncryptionKey,
  auditQueue: messagingStack.auditQueue,
  memoryQueue: messagingStack.memoryQueue,
  alertQueue: messagingStack.alertQueue,
  workflowQueue: messagingStack.workflowQueue,
  learningQueue: messagingStack.learningQueue,
});
computeStack.addDependency(networkingStack);
computeStack.addDependency(dataStack);
computeStack.addDependency(secretsStack);
computeStack.addDependency(messagingStack);

// ── API Layer ─────────────────────────────────────────────────────────────────
const apiStack = new ApiStack(app, `Seraphim-${stage}-Api`, { env, stage });

// ── Dashboard ─────────────────────────────────────────────────────────────────
const dashboardStack = new DashboardStack(app, `Seraphim-${stage}-Dashboard`, {
  env,
  restApi: apiStack.restApi,
  stage,
});
dashboardStack.addDependency(apiStack);

// ── CI/CD Pipeline ────────────────────────────────────────────────────────────
const pipelineStack = new PipelineStack(app, `Seraphim-${stage}-Pipeline`, {
  env,
  githubOwner: 'seraphim-os',
  githubRepo: 'seraphim',
});

// ── Tenant Isolation ──────────────────────────────────────────────────────────
const tenantIsolationStack = new TenantIsolationStack(app, `Seraphim-${stage}-TenantIsolation`, {
  env,
  vpc: networkingStack.vpc,
});
tenantIsolationStack.addDependency(networkingStack);

// ── Database Migrations (runs automatically on deploy) ────────────────────────
const migrationStack = new MigrationStack(app, `Seraphim-${stage}-Migration`, {
  env,
  vpc: networkingStack.vpc,
  computeSecurityGroup: networkingStack.computeSecurityGroup,
  auroraCluster: dataStack.auroraCluster,
  auroraSecretArn: dataStack.auroraCluster.secret?.secretArn ?? '',
  secretsEncryptionKey: secretsStack.secretsEncryptionKey,
});
migrationStack.addDependency(dataStack);
migrationStack.addDependency(networkingStack);

// ── Tags ──────────────────────────────────────────────────────────────────────
cdk.Tags.of(app).add('Project', 'SeraphimOS');
cdk.Tags.of(app).add('Stage', stage);
cdk.Tags.of(app).add('ManagedBy', 'CDK');

app.synth();
