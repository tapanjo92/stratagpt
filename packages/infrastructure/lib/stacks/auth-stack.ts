import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from '../config/environment';

export interface AuthStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

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

    // Pre Token Generation Lambda - Add custom claims
    const preTokenGenLambda = new lambda.Function(this, 'PreTokenGeneration', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Pre-token generation event:', JSON.stringify(event, null, 2));
          
          // Add custom claims to ID token
          event.response = {
            claimsOverrideDetails: {
              claimsToAddOrOverride: {
                jurisdiction: event.request.userAttributes['custom:jurisdiction'] || 'NSW',
                plan_type: event.request.userAttributes['custom:plan_type'] || 'free',
                stripe_customer_id: event.request.userAttributes['custom:stripe_customer_id'] || '',
              },
              groupOverrideDetails: {
                groupsToOverride: event.request.groupConfiguration?.groupsToOverride || []
              }
            }
          };
          
          return event;
        };
      `),
      timeout: Duration.seconds(5),
      functionName: `${config.projectName}-pre-token-gen`,
    });

    // Post Confirmation Lambda - User onboarding
    const postConfirmationLambda = new lambda.Function(this, 'PostConfirmation', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } = require('@aws-sdk/client-cognito-identity-provider');
        
        exports.handler = async (event) => {
          console.log('Post confirmation event:', JSON.stringify(event, null, 2));
          
          const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
          
          // Add user to free group by default
          try {
            await cognito.send(new AdminAddUserToGroupCommand({
              UserPoolId: event.userPoolId,
              Username: event.userName,
              GroupName: 'free'
            }));
            
            console.log('Added user to free group');
          } catch (error) {
            console.error('Error adding user to group:', error);
            // Don't fail the signup process
          }
          
          // TODO: Send welcome email via SES
          // TODO: Create user profile in DynamoDB
          
          return event;
        };
      `),
      timeout: Duration.seconds(10),
      functionName: `${config.projectName}-post-confirmation`,
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
      },
    });

    // Grant permissions to Post Confirmation Lambda
    postConfirmationLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminAddUserToGroup'],
      resources: [this.userPool.userPoolArn],
    }));

    // Lambda triggers temporarily removed to resolve circular dependencies
    // TODO: Re-enable triggers after resolving circular dependencies
    // this.userPool.addTrigger(cognito.UserPoolOperation.PRE_TOKEN_GENERATION, preTokenGenLambda);
    // this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationLambda);

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

    // Note: Identity Pool removed to resolve circular dependencies
    // Can be added back later if needed for federated identities
  }
}
