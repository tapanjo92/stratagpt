import { defineFunction } from '@aws-amplify/backend';

export const postConfirmation = defineFunction({
  name: 'post-confirmation',
  entry: './handler.ts',
  environment: {
    USER_POOL_ID: '', // Will be set in backend.ts
    MAIN_TABLE_NAME: '', // Will be set in backend.ts
  },
});
