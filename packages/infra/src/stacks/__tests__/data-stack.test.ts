import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { DataStack } from '../data-stack.js';
import { NetworkingStack } from '../networking-stack.js';

describe('DataStack', () => {
  it('should match the CloudFormation snapshot', () => {
    const app = new cdk.App();

    // DataStack depends on networking outputs (VPC + security group)
    const networkingStack = new NetworkingStack(app, 'TestNetworkingStack');
    const stack = new DataStack(app, 'TestDataStack', {
      vpc: networkingStack.vpc,
      dataSecurityGroup: networkingStack.dataSecurityGroup,
    });

    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });
});
