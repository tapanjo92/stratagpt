import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EnvironmentConfig } from '../config/environment';

export interface UserManagementStackProps extends StackProps {
  config: EnvironmentConfig;
  mainTable: dynamodb.Table;
}

export class UserManagementStack extends Stack {
  public readonly postConfirmationLambda: lambda.Function;
  public readonly preTokenGenerationLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: UserManagementStackProps) {
    super(scope, id, props);

    const { config, mainTable } = props;

    // Create Lambda execution role with DynamoDB permissions
    const lambdaEnvironment = {
      MAIN_TABLE_NAME: mainTable.tableName,
      STAGE: config.stage,
    };

    // Pre-token generation Lambda
    this.preTokenGenerationLambda = new lambda.Function(this, 'PreTokenGenerationLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Pre-token generation event:', JSON.stringify(event, null, 2));
          
          // Add custom claims to the token
          event.response = {
            claimsOverrideDetails: {
              claimsToAddOrOverride: {
                'custom:app_role': 'user',
                'custom:plan_type': 'free'
              }
            }
          };
          
          return event;
        };
      `),
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Pre-token generation trigger for adding custom claims',
    });

    // Post-confirmation Lambda
    this.postConfirmationLambda = new lambda.Function(this, 'PostConfirmationLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
        
        const client = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(client);
        
        exports.handler = async (event) => {
          console.log('Post-confirmation event:', JSON.stringify(event, null, 2));
          
          const { userAttributes, userName } = event.request;
          const now = new Date().toISOString();
          
          try {
            // Create user profile in DynamoDB
            const userItem = {
              PK: \`USER#\${userName}\`,
              SK: \`USER#\${userName}\`,
              id: userName,
              email: userAttributes.email,
              fullName: userAttributes.name || userAttributes.given_name + ' ' + userAttributes.family_name || '',
              jurisdiction: userAttributes['custom:jurisdiction'] || '',
              planType: 'free',
              createdAt: now,
              updatedAt: now
            };
            
            await docClient.send(new PutCommand({
              TableName: process.env.MAIN_TABLE_NAME,
              Item: userItem,
              ConditionExpression: 'attribute_not_exists(PK)'
            }));
            
            console.log('User profile created successfully:', userName);
            
          } catch (error) {
            console.error('Error creating user profile:', error);
            // Don't throw error to avoid breaking user signup
          }
          
          return event;
        };
      `),
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Post-confirmation trigger for creating user profiles',
    });

    // Grant DynamoDB permissions to the post-confirmation Lambda
    mainTable.grantWriteData(this.postConfirmationLambda);
  }
}