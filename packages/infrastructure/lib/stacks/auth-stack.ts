import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from '../config/environment';

export interface AuthStackProps extends StackProps {
  config: EnvironmentConfig;
  preTokenGenerationLambda?: lambda.Function;
  postConfirmationLambda?: lambda.Function;
}

export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${config.projectName}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        jurisdiction: new cognito.StringAttribute({
          minLen: 2,
          maxLen: 3,
          mutable: true,
        }),
        plan_type: new cognito.StringAttribute({
          minLen: 3,
          maxLen: 20,
          mutable: true,
        }),
        stripe_customer_id: new cognito.StringAttribute({
          minLen: 3,
          maxLen: 50,
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true,
      },
    });

    // Add Lambda triggers if provided (from UserManagementStack)
    if (props.preTokenGenerationLambda) {
      this.userPool.addTrigger(cognito.UserPoolOperation.PRE_TOKEN_GENERATION, props.preTokenGenerationLambda);
    }
    
    if (props.postConfirmationLambda) {
      this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, props.postConfirmationLambda);
    }

    // Create App Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${config.projectName}-web-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: config.stage === 'prod' 
          ? [`https://${config.domainName}/auth/callback`]
          : ['http://localhost:3000/auth/callback'],
        logoutUrls: config.stage === 'prod'
          ? [`https://${config.domainName}/`]
          : ['http://localhost:3000/'],
      },
      preventUserExistenceErrors: true,
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, fullname: true })
        .withCustomAttributes('jurisdiction', 'plan_type', 'stripe_customer_id'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, fullname: true })
        .withCustomAttributes('jurisdiction'),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
    });

    // Create User Pool Groups after User Pool and Client are established
    const groups = ['free', 'pro', 'enterprise', 'admin'];
    groups.forEach(groupName => {
      new cognito.CfnUserPoolGroup(this, `${groupName}Group`, {
        groupName,
        userPoolId: this.userPool.userPoolId,
        description: `Users on ${groupName} plan`,
        precedence: groupName === 'admin' ? 0 : groupName === 'enterprise' ? 1 : groupName === 'pro' ? 2 : 3,
      });
    });

    // Create Identity Pool for AWS service access
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `${props.config.projectName}-identity-pool`,
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Create IAM roles for different access levels
    const authenticatedRole = this.createAuthenticatedRole(props.config);
    const unauthenticatedRole = this.createUnauthenticatedRole(props.config);
    const proUserRole = this.createProUserRole(props.config);
    const enterpriseUserRole = this.createEnterpriseUserRole(props.config);
    const adminUserRole = this.createAdminUserRole(props.config);

    // Attach roles to Identity Pool (simplified for now - role mappings can be added via console)
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    // Outputs for Amplify integration
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${this.stackName}-UserPoolId`,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    new CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      exportName: `${this.stackName}-IdentityPoolId`,
    });
  }

  private createUnauthenticatedRole(config: EnvironmentConfig): iam.Role {
    return new iam.Role(this, 'UnauthenticatedRole', {
      roleName: `${config.projectName}-unauth-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        UnauthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-sync:*',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });
  }

  private createAuthenticatedRole(config: EnvironmentConfig): iam.Role {
    return new iam.Role(this, 'AuthenticatedRole', {
      roleName: `${config.projectName}-auth-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        AuthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-sync:*',
                'cognito-identity:*',
              ],
              resources: ['*'],
            }),
            // Basic S3 access for user's own folder
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
              ],
              resources: [
                `arn:aws:s3:::${config.projectName}-user-data/\${cognito-identity.amazonaws.com:sub}/*`,
              ],
            }),
            // Read access to app configuration
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:Query',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/${config.projectName}-main`,
              ],
              conditions: {
                'ForAllValues:StringEquals': {
                  'dynamodb:LeadingKeys': ['${cognito-identity.amazonaws.com:sub}'],
                },
              },
            }),
          ],
        }),
      },
    });
  }

  private createProUserRole(config: EnvironmentConfig): iam.Role {
    return new iam.Role(this, 'ProUserRole', {
      roleName: `${config.projectName}-pro-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        ProUserPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-sync:*',
                'cognito-identity:*',
              ],
              resources: ['*'],
            }),
            // Enhanced S3 access for pro users
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                `arn:aws:s3:::${config.projectName}-user-data/\${cognito-identity.amazonaws.com:sub}/*`,
                `arn:aws:s3:::${config.projectName}-user-data`,
              ],
            }),
            // Enhanced DynamoDB access
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/${config.projectName}-main`,
              ],
              conditions: {
                'ForAllValues:StringEquals': {
                  'dynamodb:LeadingKeys': ['${cognito-identity.amazonaws.com:sub}'],
                },
              },
            }),
            // Basic AI model access
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
              ],
              resources: [
                'arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-*',
                'arn:aws:bedrock:*::foundation-model/amazon.titan-text-lite-*',
              ],
            }),
          ],
        }),
      },
    });
  }

  private createEnterpriseUserRole(config: EnvironmentConfig): iam.Role {
    return new iam.Role(this, 'EnterpriseUserRole', {
      roleName: `${config.projectName}-enterprise-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        EnterpriseUserPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-sync:*',
                'cognito-identity:*',
              ],
              resources: ['*'],
            }),
            // Full S3 access for enterprise users
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:*',
              ],
              resources: [
                `arn:aws:s3:::${config.projectName}-user-data/\${cognito-identity.amazonaws.com:sub}/*`,
                `arn:aws:s3:::${config.projectName}-user-data`,
                `arn:aws:s3:::${config.projectName}-shared/*`,
              ],
            }),
            // Full DynamoDB access for enterprise
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:*',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/${config.projectName}-main`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/${config.projectName}-main/index/*`,
              ],
            }),
            // Premium AI model access
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: [
                'arn:aws:bedrock:*::foundation-model/anthropic.claude-3-*',
                'arn:aws:bedrock:*::foundation-model/amazon.titan-*',
                'arn:aws:bedrock:*::foundation-model/cohere.*',
              ],
            }),
          ],
        }),
      },
    });
  }

  private createAdminUserRole(config: EnvironmentConfig): iam.Role {
    return new iam.Role(this, 'AdminUserRole', {
      roleName: `${config.projectName}-admin-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        AdminUserPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-sync:*',
                'cognito-identity:*',
              ],
              resources: ['*'],
            }),
            // Full administrative access
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:*',
                'dynamodb:*',
                'bedrock:*',
                'logs:*',
                'cloudwatch:*',
              ],
              resources: ['*'],
            }),
            // Admin access to user management
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminUpdateUserAttributes',
                'cognito-idp:AdminDisableUser',
                'cognito-idp:AdminEnableUser',
                'cognito-idp:AdminAddUserToGroup',
                'cognito-idp:AdminRemoveUserFromGroup',
                'cognito-idp:ListUsers',
                'cognito-idp:ListGroups',
              ],
              resources: [
                this.userPool.userPoolArn,
              ],
            }),
          ],
        }),
      },
    });
  }
}
