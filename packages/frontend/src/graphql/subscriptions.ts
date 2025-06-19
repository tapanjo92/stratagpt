export const onMessageSent = /* GraphQL */ `
  subscription OnMessageSent($chatId: ID!) {
    onMessageSent(chatId: $chatId) {
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
  }
`;