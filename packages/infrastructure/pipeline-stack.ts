import { Stack, StackProps, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { EnvironmentConfig } from '../config/environment';

export interface PipelineStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create artifacts bucket
    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: `${config.projectName}-pipeline-artifacts-${config.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [{
        id: 'delete-old-artifacts',
        expiration: cdk.Duration.days(30),
      }],
    });

    // Create SNS topic for notifications
    const pipelineTopic = new sns.Topic(this, 'PipelineTopic', {
      topicName: `${config.projectName}-pipeline-notifications`,
    });

    // Add email subscription (update with your email)
    pipelineTopic.addSubscription(
      new sns_subscriptions.EmailSubscription('your-email@example.com')
    );

    // Create CodeBuild project for CDK synth
    const synthProject = new codebuild.PipelineProject(this, 'SynthProject', {
      projectName: `${config.projectName}-synth`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true,
      },
      environmentVariables: {
        STAGE: { value: config.stage },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'cd packages/infrastructure',
              'npm install -g pnpm',
              'pnpm install',
            ],
          },
          build: {
            commands: [
              'pnpm run build',
              'pnpm run cdk synth --context stage=$STAGE',
            ],
          },
        },
        artifacts: {
          'base-directory': 'packages/infrastructure',
          files: ['cdk.out/**/*'],
        },
      }),
    });

    // Create CodeBuild project for deployment
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      projectName: `${config.projectName}-deploy`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true,
      },
      environmentVariables: {
        STAGE: { value: config.stage },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'cd packages/infrastructure',
              'npm install -g pnpm aws-cdk',
              'pnpm install',
            ],
          },
          build: {
            commands: [
              'cdk deploy --all --context stage=$STAGE --require-approval never',
            ],
          },
        },
      }),
    });

    // Grant deployment permissions
    deployProject.addToRolePolicy(new iam.PolicyStatement({
      actions: ['*'],
      resources: ['*'],
    }));

    // Create pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `${config.projectName}-pipeline`,
      artifactBucket: artifactsBucket,
      restartExecutionOnUpdate: true,
    });

    // Source stage
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: 'your-github-username', // UPDATE THIS
      repo: 'stratagpt',             // UPDATE THIS
      oauthToken: SecretValue.secretsManager('github-token'),
      output: sourceOutput,
      branch: config.stage === 'prod' ? 'main' : config.stage,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceAction],
    });

    // Build stage
    const synthOutput = new codepipeline.Artifact();
    const synthAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CDK_Synth',
      project: synthProject,
      input: sourceOutput,
      outputs: [synthOutput],
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [synthAction],
    });

    // Deploy stage
    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CDK_Deploy',
      project: deployProject,
      input: synthOutput,
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });

    // Add notifications
    pipeline.onStateChange('PipelineStateChange', {
      target: new targets.SnsTopic(pipelineTopic),
      description: 'Pipeline state changes',
    });
  }
}
