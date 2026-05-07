import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { MessagingStack } from '../messaging-stack.js';

describe('MessagingStack', () => {
  it('should match the CloudFormation snapshot', () => {
    const app = new cdk.App();
    const stack = new MessagingStack(app, 'TestMessagingStack');
    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });
});
