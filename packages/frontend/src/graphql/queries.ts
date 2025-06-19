export const getUser = /* GraphQL */ `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      fullName
      jurisdiction
      planType
      stripeCustomerId
      createdAt
      updatedAt
    }
  }
`;

export const listChats = /* GraphQL */ `
  query ListChats($userId: ID!, $limit: Int, $nextToken: String) {
    listChats(userId: $userId, limit: $limit, nextToken: $nextToken) {
      items {
        id
        userId
        title
        createdAt
        updatedAt
        lastMessageAt
        messageCount
      }
      nextToken
    }
  }
`;

export const getChat = /* GraphQL */ `
  query GetChat($id: ID!) {
    getChat(id: $id) {
      id
      userId
      title
      createdAt
      updatedAt
      lastMessageAt
      messageCount
    }
  }
`;

export const listMessages = /* GraphQL */ `
  query ListMessages($chatId: ID!, $limit: Int, $nextToken: String) {
    listMessages(chatId: $chatId, limit: $limit, nextToken: $nextToken) {
      items {
        id
        chatId
        userId
        role
        content
        metadata {
          tokens
          model
          processingTime
          citations {
            source
            title
            section
            relevanceScore
          }
        }
        createdAt
      }
      nextToken
    }
  }
`;