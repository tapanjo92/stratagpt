#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from './stacks/network-stack';
import { AuthStack } from './stacks/auth-stack';
import { DataStack } from './stacks/data-stack';
import { ApiStack } from './stacks/api-stack';
import { UserManagementStack } from './stacks/user-management-stack';
import { getEnvironmentConfig } from './config/environment';

const app = new cdk.App();

// Get stage from context
const stage = app.node.tryGetContext('stage') || 'dev';
const config = getEnvironmentConfig(stage);

// Environment for all stacks
const env = {
  account: config.account,
  region: config.region,
};

// Create stacks
const networkStack = new NetworkStack(app, `${config.projectName}-network`, {
  env,
  config,
  description: 'StrataGPT Network Infrastructure',
});

const dataStack = new DataStack(app, `${config.projectName}-data`, {
  env,
  config,
  description: 'StrataGPT Data Storage Infrastructure',
});

const userManagementStack = new UserManagementStack(app, `${config.projectName}-user-mgmt`, {
  env,
  config,
  mainTable: dataStack.mainTable,
  description: 'StrataGPT User Management Infrastructure',
});

const authStack = new AuthStack(app, `${config.projectName}-auth`, {
  env,
  config,
  preTokenGenerationLambda: userManagementStack.preTokenGenerationLambda,
  postConfirmationLambda: userManagementStack.postConfirmationLambda,
  description: 'StrataGPT Authentication Infrastructure',
});

const apiStack = new ApiStack(app, `${config.projectName}-api`, {
  env,
  config,
  userPool: authStack.userPool,
  mainTable: dataStack.mainTable,
  description: 'StrataGPT API Infrastructure',
});

// Add dependencies
dataStack.addDependency(networkStack);
userManagementStack.addDependency(dataStack);
authStack.addDependency(networkStack);
authStack.addDependency(userManagementStack);
apiStack.addDependency(authStack);
apiStack.addDependency(dataStack);

// Add tags to all stacks
const tags = {
  Project: 'StrataGPT',
  Stage: config.stage,
  ManagedBy: 'CDK',
  Owner: 'Engineering',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});
