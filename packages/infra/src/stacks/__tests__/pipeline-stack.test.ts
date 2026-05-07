import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PipelineStack } from '../pipeline-stack.js';

describe('PipelineStack', () => {
  it('should match the CloudFormation snapshot', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'TestPipelineStack', {
      githubOwner: 'test-owner',
      githubRepo: 'seraphim-os',
      githubBranch: 'main',
      githubTokenSecretName: 'seraphim/github-token',
    });

    const template = Template.fromStack(stack);

    expect(template.toJSON()).toMatchSnapshot();
  });

  it('should create a CodePipeline with all required stages', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'TestPipelineStack', {
      githubOwner: 'test-owner',
      githubRepo: 'seraphim-os',
    });

    const template = Template.fromStack(stack);

    // Verify pipeline exists
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);

    // Verify pipeline has correct stages
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        { Name: 'Source' },
        { Name: 'Build' },
        { Name: 'Test' },
        { Name: 'Synth' },
        { Name: 'Deploy_Dev' },
        { Name: 'Deploy_Staging' },
        { Name: 'Production_Gate' },
        { Name: 'Deploy_Prod' },
      ],
    });
  });

  it('should create CodeBuild projects for build, test, synth, and deploy stages', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'TestPipelineStack', {
      githubOwner: 'test-owner',
      githubRepo: 'seraphim-os',
    });

    const template = Template.fromStack(stack);

    // Build + Test + Synth + Deploy (Dev, Staging, Prod) = 6 CodeBuild projects
    template.resourceCountIs('AWS::CodeBuild::Project', 6);
  });

  it('should create an SNS topic for pipeline notifications', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'TestPipelineStack', {
      githubOwner: 'test-owner',
      githubRepo: 'seraphim-os',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SNS::Topic', {
      TopicName: 'seraphim-pipeline-notifications',
    });
  });

  it('should include a manual approval action for production gate', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'TestPipelineStack', {
      githubOwner: 'test-owner',
      githubRepo: 'seraphim-os',
    });

    const template = Template.fromStack(stack);

    // The Production_Gate stage should have a manual approval action
    template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
      Stages: [
        { Name: 'Source' },
        { Name: 'Build' },
        { Name: 'Test' },
        { Name: 'Synth' },
        { Name: 'Deploy_Dev' },
        { Name: 'Deploy_Staging' },
        {
          Name: 'Production_Gate',
          Actions: [
            {
              ActionTypeId: {
                Category: 'Approval',
                Provider: 'Manual',
              },
              Name: 'Production_Gate_Approval',
            },
          ],
        },
        { Name: 'Deploy_Prod' },
      ],
    });
  });

  it('should use Node.js 20 runtime in CodeBuild projects', () => {
    const app = new cdk.App();

    const stack = new PipelineStack(app, 'TestPipelineStack', {
      githubOwner: 'test-owner',
      githubRepo: 'seraphim-os',
    });

    const template = Template.fromStack(stack);

    // All CodeBuild projects should use standard 7.0 image (which includes Node 20)
    const projects = template.findResources('AWS::CodeBuild::Project');
    for (const [_key, project] of Object.entries(projects)) {
      const resource = project as { Properties?: { Environment?: { Image?: string } } };
      expect(resource.Properties?.Environment?.Image).toContain('standard:7.0');
    }
  });
});
