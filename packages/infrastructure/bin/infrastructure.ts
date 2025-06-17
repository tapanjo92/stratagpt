#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/stacks/network-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { getEnvironmentConfig } from '../lib/config/environment';

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

const authStack = new AuthStack(app, `${config.projectName}-auth`, {
  env,
  config,
  description: 'StrataGPT Authentication Infrastructure',
});

const dataStack = new DataStack(app, `${config.projectName}-data`, {
  env,
  config,
  description: 'StrataGPT Data Storage Infrastructure',
});

const apiStack = new ApiStack(app, `${config.projectName}-api`, {
  env,
  config,
  userPool: authStack.userPool,
  mainTable: dataStack.mainTable,
  description: 'StrataGPT API Infrastructure',
});

// Add dependencies
authStack.addDependency(networkStack);
dataStack.addDependency(networkStack);
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
