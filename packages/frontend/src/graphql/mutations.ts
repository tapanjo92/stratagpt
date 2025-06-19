export const createChat = /* GraphQL */ `
  mutation CreateChat($input: CreateChatInput!) {
    createChat(input: $input) {
      id
      userId
      title
      createdAt
      updatedAt
      messageCount
    }
  }
`;

export const sendMessage = /* GraphQL */ `
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
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

export const updateUser = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      email
      fullName
      jurisdiction
      planType
      updatedAt
    }
  }
`;

export const deleteChat = /* GraphQL */ `
  mutation DeleteChat($id: ID!) {
    deleteChat(id: $id)
  }
`;

export const createUser = /* GraphQL */ `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      email
      fullName
      jurisdiction
      planType
      createdAt
      updatedAt
    }
  }
`;