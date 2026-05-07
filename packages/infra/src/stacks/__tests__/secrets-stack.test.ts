import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SecretsStack } from '../secrets-stack.js';

describe('SecretsStack', () => {
  it('should match the CloudFormation snapshot', { timeout: 30_000 }, () => {
    const app = new cdk.App();
    const stack = new SecretsStack(app, 'TestSecretsStack');
    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });
});
