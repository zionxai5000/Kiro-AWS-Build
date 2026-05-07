import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ApiStack } from '../api-stack.js';

describe('ApiStack', () => {
  it('should match the CloudFormation snapshot', () => {
    const app = new cdk.App();
    const stack = new ApiStack(app, 'TestApiStack');
    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });
});
