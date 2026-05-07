import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

/**
 * Props accepted by {@link PipelineStack}.
 */
export interface PipelineStackProps extends cdk.StackProps {
  /** GitHub repository owner (organization or user). */
  readonly githubOwner: string;
  /** GitHub repository name. */
  readonly githubRepo: string;
  /** GitHub branch to track. Defaults to 'main'. */
  readonly githubBranch?: string;
  /** Name of the AWS Secrets Manager secret holding the GitHub OAuth token. */
  readonly githubTokenSecretName?: string;
}

/**
 * CI/CD Pipeline stack for SeraphimOS.
 *
 * Provisions a CodePipeline with the following stages:
 *   1. Source — GitHub (via OAuth token in Secrets Manager)
 *   2. Build — TypeScript compile + lint
 *   3. Test — Vitest unit tests
 *   4. Synth — CDK synth to produce CloudFormation templates
 *   5. Deploy-Dev — Deploy to dev environment
 *   6. Deploy-Staging — Deploy to staging environment
 *   7. Gate — Manual approval before production
 *   8. Deploy-Prod — Deploy to production environment
 *
 * Requirements: 15.1 (IaC with automated provisioning), 15.6 (CI/CD pipeline with
 * automated testing and staged rollout), 19.3 (gate verification before production)
 */
export class PipelineStack extends cdk.Stack {
  /** The CodePipeline instance. */
  public readonly pipeline: codepipeline.Pipeline;

  /** SNS topic for pipeline notifications and gate approvals. */
  public readonly notificationTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const {
      githubOwner,
      githubRepo,
      githubBranch = 'main',
      githubTokenSecretName = 'seraphim/github-token',
    } = props;

    // ── Notification Topic ────────────────────────────────────────────
    this.notificationTopic = new sns.Topic(this, 'PipelineNotifications', {
      topicName: 'seraphim-pipeline-notifications',
      displayName: 'SeraphimOS Pipeline Notifications',
    });

    // ── Source Artifact ───────────────────────────────────────────────
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');
    const synthOutput = new codepipeline.Artifact('SynthOutput');

    // ── Source Action (GitHub) ────────────────────────────────────────
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: githubOwner,
      repo: githubRepo,
      branch: githubBranch,
      oauthToken: cdk.SecretValue.secretsManager(githubTokenSecretName),
      output: sourceOutput,
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
    });

    // ── Build Project (TypeScript compile + lint) ─────────────────────
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'seraphim-build',
      description: 'TypeScript compile and lint',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: ['npm ci'],
          },
          build: {
            commands: ['npm run typecheck', 'npm run lint'],
          },
        },
        artifacts: {
          'base-directory': '.',
          files: ['**/*'],
          'exclude-paths': ['node_modules/**/*'],
        },
      }),
      timeout: cdk.Duration.minutes(15),
    });

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build_TypeScript',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    // ── Test Project (Vitest) ─────────────────────────────────────────
    const testProject = new codebuild.PipelineProject(this, 'TestProject', {
      projectName: 'seraphim-test',
      description: 'Run Vitest unit tests',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: ['npm ci'],
          },
          build: {
            commands: ['npm run build', 'npm test'],
          },
        },
        reports: {
          'test-reports': {
            files: ['**/junit.xml'],
            'file-format': 'JUNITXML',
          },
        },
      }),
      timeout: cdk.Duration.minutes(20),
    });

    const testAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Test_Vitest',
      project: testProject,
      input: sourceOutput,
    });

    // ── Synth Project (CDK synth) ─────────────────────────────────────
    const synthProject = new codebuild.PipelineProject(this, 'SynthProject', {
      projectName: 'seraphim-cdk-synth',
      description: 'CDK synth to produce CloudFormation templates',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: ['npm ci', 'npm install -g aws-cdk'],
          },
          build: {
            commands: ['npm run build', 'cdk synth --app "node packages/infra/dist/app.js"'],
          },
        },
        artifacts: {
          'base-directory': 'cdk.out',
          files: ['**/*'],
        },
      }),
      timeout: cdk.Duration.minutes(15),
    });

    // Grant CDK synth project permissions to describe stacks (for lookups)
    synthProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: ['arn:aws:iam::*:role/cdk-*'],
      }),
    );

    const synthAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CDK_Synth',
      project: synthProject,
      input: sourceOutput,
      outputs: [synthOutput],
    });

    // ── Deploy Projects (Dev, Staging, Prod) ──────────────────────────
    const createDeployProject = (stage: string): codebuild.PipelineProject => {
      const project = new codebuild.PipelineProject(this, `Deploy${stage}Project`, {
        projectName: `seraphim-deploy-${stage.toLowerCase()}`,
        description: `Deploy SeraphimOS to ${stage}`,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.MEDIUM,
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              'runtime-versions': { nodejs: '20' },
              commands: ['npm ci', 'npm install -g aws-cdk'],
            },
            build: {
              commands: [
                'npm run build',
                `cdk deploy --all --app "node packages/infra/dist/app.js" --require-approval never --context stage=${stage.toLowerCase()}`,
              ],
            },
          },
        }),
        timeout: cdk.Duration.minutes(30),
      });

      // Grant CDK deploy permissions
      project.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: ['arn:aws:iam::*:role/cdk-*'],
        }),
      );

      return project;
    };

    const deployDevProject = createDeployProject('Dev');
    const deployStagingProject = createDeployProject('Staging');
    const deployProdProject = createDeployProject('Prod');

    // ── Gate Verification (Manual Approval) ───────────────────────────
    const manualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'Production_Gate_Approval',
      notificationTopic: this.notificationTopic,
      additionalInformation:
        'Review staging deployment results and verify all gate checks pass before promoting to production.',
      externalEntityLink: `https://github.com/${githubOwner}/${githubRepo}`,
    });

    // ── Pipeline ──────────────────────────────────────────────────────
    this.pipeline = new codepipeline.Pipeline(this, 'SeraphimPipeline', {
      pipelineName: 'seraphim-os-pipeline',
      restartExecutionOnUpdate: true,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Test',
          actions: [testAction],
        },
        {
          stageName: 'Synth',
          actions: [synthAction],
        },
        {
          stageName: 'Deploy_Dev',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Deploy_To_Dev',
              project: deployDevProject,
              input: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Deploy_Staging',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Deploy_To_Staging',
              project: deployStagingProject,
              input: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Production_Gate',
          actions: [manualApprovalAction],
        },
        {
          stageName: 'Deploy_Prod',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Deploy_To_Production',
              project: deployProdProject,
              input: sourceOutput,
            }),
          ],
        },
      ],
    });

    // ── Outputs ───────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'PipelineArn', {
      value: this.pipeline.pipelineArn,
      description: 'CodePipeline ARN',
      exportName: 'SeraphimPipelineArn',
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: this.notificationTopic.topicArn,
      description: 'Pipeline notification SNS topic ARN',
      exportName: 'SeraphimPipelineNotificationTopicArn',
    });
  }
}
