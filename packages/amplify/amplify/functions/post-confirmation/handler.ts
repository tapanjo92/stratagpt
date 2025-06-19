import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

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
    
    // Note: User profile creation moved to frontend to avoid circular dependencies
    
  } catch (error) {
    console.error('Error in post confirmation:', error);
    // Don't fail the signup process
  }
  
  return event;
};
