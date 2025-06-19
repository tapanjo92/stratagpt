import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'stratagptStorage',
  access: (allow) => ({
    'documents/*': [
      allow.authenticated.to(['read']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
    'generated/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
    'public/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
  }),
});
