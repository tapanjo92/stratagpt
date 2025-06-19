import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('Post confirmation event:', JSON.stringify(event, null, 2));
  
  try {
    // Add user to free group by default
    await cognitoClient.send(new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username: event.userName,
      GroupName: 'free'
    }));
    
    console.log('Added user to free group');
    
    // Create user profile in DynamoDB
    const timestamp = new Date().toISOString();
    const userId = event.request.userAttributes.sub;
    
    await docClient.send(new PutCommand({
      TableName: process.env.MAIN_TABLE_NAME!,
      Item: {
        id: userId,
        __typename: 'User',
        email: event.request.userAttributes.email,
        fullName: event.request.userAttributes.name || '',
        jurisdiction: 'NSW',
        planType: 'free',
        stripeCustomerId: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        owner: userId,
      }
    }));
    
    console.log('Created user profile in DynamoDB');
    
  } catch (error) {
    console.error('Error in post confirmation:', error);
    // Don't fail the signup process
  }
  
  return event;
};
