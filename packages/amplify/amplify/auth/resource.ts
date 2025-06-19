import { defineAuth } from '@aws-amplify/backend';
import { preTokenGeneration } from '../functions/pre-token-generation/resource';
import { postConfirmation } from '../functions/post-confirmation/resource';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['free', 'pro', 'enterprise', 'admin'],
  triggers: {
    preTokenGeneration,
    postConfirmation,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
    name: {
      required: true,
      mutable: true,
    },
    'custom:jurisdiction': {
      dataType: 'String',
      mutable: true,
      minLen: 2,
      maxLen: 3,
    },
    'custom:plan_type': {
      dataType: 'String',
      mutable: true,
      minLen: 3,
      maxLen: 20,
    },
    'custom:stripe_customer_id': {
      dataType: 'String',
      mutable: true,
      minLen: 3,
      maxLen: 50,
    },
  },
  passwordPolicy: {
    minimumLength: 12,
    requireLowercase: true,
    requireNumbers: true,
    requireUppercase: true,
    requireSymbols: true,
  },
  accountRecovery: 'EMAIL_ONLY',
  multifactor: {
    mode: 'OPTIONAL',
    totp: true,
  },
});
