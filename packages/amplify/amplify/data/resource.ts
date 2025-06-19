import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { postConfirmation } from '../functions/post-confirmation/resource';

/*== STEP 1 ===============================================================
The section below creates a User model in the database and a Chat model.
===========================================================================*/

const schema = a.schema({
  User: a
    .model({
      email: a.string().required(),
      fullName: a.string().required(),
      jurisdiction: a.string().required(),
      planType: a.string().required(),
      stripeCustomerId: a.string(),
      chats: a.hasMany('Chat', 'userId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.groups(['admin']),
    ]),
    
  Chat: a
    .model({
      userId: a.id().required(),
      user: a.belongsTo('User', 'userId'),
      title: a.string().required(),
      messages: a.hasMany('Message', 'chatId'),
      lastMessageAt: a.datetime(),
      messageCount: a.integer().default(0),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.groups(['admin']),
    ]),
    
  Message: a
    .model({
      chatId: a.id().required(),
      chat: a.belongsTo('Chat', 'chatId'),
      role: a.enum(['USER', 'ASSISTANT', 'SYSTEM']),
      content: a.string().required(),
      metadata: a.json(),
      tokens: a.integer(),
      model: a.string(),
      citations: a.json(),
      processingTime: a.float(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.groups(['admin']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
