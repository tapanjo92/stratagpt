import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { preTokenGeneration } from './functions/pre-token-generation/resource';
import { postConfirmation } from './functions/post-confirmation/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  preTokenGeneration,
  postConfirmation,
});

// Add the functions as triggers
backend.auth.resources.userPool.addTrigger({
  operation: 'preTokenGeneration',
  function: backend.preTokenGeneration.resources.lambda,
});

backend.auth.resources.userPool.addTrigger({
  operation: 'postConfirmation',
  function: backend.postConfirmation.resources.lambda,
});

// Grant permissions to the post confirmation function
backend.postConfirmation.resources.lambda.addToRolePolicy({
  actions: ['cognito-idp:AdminAddUserToGroup'],
  resources: [backend.auth.resources.userPool.userPoolArn],
});

// Access the underlying table from the data model
const userTable = backend.data.resources.cfnResources.cfnTables['User'];

// Set environment variables for the post confirmation function
backend.postConfirmation.resources.lambda.addEnvironment(
  'USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId
);
backend.postConfirmation.resources.lambda.addEnvironment(
  'MAIN_TABLE_NAME',
  userTable.tableName
);

// Grant permissions to write to the User table
backend.postConfirmation.resources.lambda.addToRolePolicy({
  actions: ['dynamodb:PutItem'],
  resources: [userTable.attrArn],
});
