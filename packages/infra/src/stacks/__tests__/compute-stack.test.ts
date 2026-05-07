import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as fs from 'fs';
import * as path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ComputeStack } from '../compute-stack.js';
import { DataStack } from '../data-stack.js';
import { MessagingStack } from '../messaging-stack.js';
import { NetworkingStack } from '../networking-stack.js';
import { SecretsStack } from '../secrets-stack.js';

describe('ComputeStack', () => {
  beforeAll(() => {
    // CDK's AssetCode requires the asset directory to exist at synth time.
    // The real handlers are built in Phase 2 (task 3.13). Until then, provide
    // a placeholder so the snapshot test can synthesize the stack.
    const handlersPath = path.resolve(process.cwd(), 'dist/handlers');
    if (!fs.existsSync(handlersPath)) {
      fs.mkdirSync(handlersPath, { recursive: true });
      fs.writeFileSync(
        path.join(handlersPath, 'index.js'),
        '// placeholder for CDK asset resolution\n',
      );
    }
  });

  it('should match the CloudFormation snapshot', () => {
    const app = new cdk.App();

    // ComputeStack depends on networking, data, and secrets stacks
    const networkingStack = new NetworkingStack(app, 'TestNetworkingStack');
    const dataStack = new DataStack(app, 'TestDataStack', {
      vpc: networkingStack.vpc,
      dataSecurityGroup: networkingStack.dataSecurityGroup,
    });
    const secretsStack = new SecretsStack(app, 'TestSecretsStack');
    const messagingStack = new MessagingStack(app, 'TestMessagingStack');

    const stack = new ComputeStack(app, 'TestComputeStack', {
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

    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });
});
