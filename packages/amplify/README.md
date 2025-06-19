# Amplify Client Configuration Only

This package is configured for **client-side Amplify integration only**. 

## Infrastructure Deployment

🚫 **Infrastructure is NOT deployed from this directory**
✅ **Infrastructure is deployed via CDK** in `../infrastructure`

## Usage

1. Deploy infrastructure: `cd ../infrastructure && npm run deploy`
2. Generate client config: `cd ../infrastructure && npm run generate-amplify-outputs`
3. The generated `amplify_outputs.json` will be placed in your frontend

## Key Points

- No `amplify push` or `amplify deploy` needed
- No sandbox environment creation required  
- CDK manages all AWS resources (Cognito, DynamoDB, AppSync)
- This directory only provides client-side Amplify configuration