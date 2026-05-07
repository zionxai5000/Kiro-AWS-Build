import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { NetworkingStack } from '../networking-stack.js';

describe('NetworkingStack', () => {
  it('should match the CloudFormation snapshot', () => {
    const app = new cdk.App();
    const stack = new NetworkingStack(app, 'TestNetworkingStack');
    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });
});
