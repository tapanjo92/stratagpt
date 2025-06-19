import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AppSyncResolverEvent } from 'aws-lambda';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

interface SendMessageInput {
  chatId: string;
  userId: string;
  content: string;
}

interface Message {
  id: string;
  chatId: string;
  userId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  metadata?: {
    tokens?: number;
    model?: string;
    processingTime?: number;
    citations?: Citation[];
  };
  createdAt: string;
}

interface Citation {
  source: string;
  title: string;
  section?: string;
  relevanceScore: number;
}

export const handler = async (event: AppSyncResolverEvent<{ input: SendMessageInput }>) => {
  console.log('Chat handler event:', JSON.stringify(event, null, 2));
  
  const { chatId, userId, content } = event.arguments.input;
  const authenticatedUserId = (event.identity as any)?.sub;
  
  // Check authentication
  if (!authenticatedUserId) {
    throw new Error('User must be authenticated to send messages');
  }
  
  // Authorization check: users can only send messages as themselves
  if (userId !== authenticatedUserId) {
    throw new Error('Users can only send messages as themselves');
  }
  
  const now = new Date().toISOString();
  const userMessageId = generateId();
  const assistantMessageId = generateId();
  
  try {
    // 1. Save user message
    const userMessage: Message = {
      id: userMessageId,
      chatId,
      userId,
      role: 'USER',
      content,
      createdAt: now,
    };
    
    await docClient.send(new PutCommand({
      TableName: process.env.MAIN_TABLE_NAME!,
      Item: {
        PK: `CHAT#${chatId}`,
        SK: `MESSAGE#${userMessageId}`,
        ...userMessage,
      },
    }));
    
    // 2. Generate AI response (mock for now)
    const startTime = Date.now();
    const aiResponse = await generateAIResponse(content);
    const processingTime = (Date.now() - startTime) / 1000;
    
    // 3. Save AI assistant message
    const assistantMessage: Message = {
      id: assistantMessageId,
      chatId,
      userId,
      role: 'ASSISTANT',
      content: aiResponse.content,
      metadata: {
        tokens: aiResponse.tokens,
        model: 'claude-3-haiku-mock',
        processingTime,
        citations: aiResponse.citations,
      },
      createdAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: process.env.MAIN_TABLE_NAME!,
      Item: {
        PK: `CHAT#${chatId}`,
        SK: `MESSAGE#${assistantMessageId}`,
        ...assistantMessage,
      },
    }));
    
    // 4. Update chat metadata
    await docClient.send(new UpdateCommand({
      TableName: process.env.MAIN_TABLE_NAME!,
      Key: {
        PK: `USER#${userId}`,
        SK: `CHAT#${chatId}`,
      },
      UpdateExpression: 'SET lastMessageAt = :lastMessageAt, messageCount = messageCount + :increment, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':lastMessageAt': assistantMessage.createdAt,
        ':increment': 2, // User message + AI response
        ':updatedAt': assistantMessage.createdAt,
      },
    }));
    
    // Return the user message (GraphQL will trigger subscription for AI message)
    return userMessage;
    
  } catch (error) {
    console.error('Error in chat handler:', error);
    throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

async function generateAIResponse(userMessage: string): Promise<{
  content: string;
  tokens: number;
  citations: Citation[];
}> {
  // Mock AI response - replace with actual AI service call
  const responses = [
    {
      content: `I understand you're asking about "${userMessage}". Based on legal precedents and current regulations, here are the key considerations:

1. **Regulatory Framework**: The current legal framework provides specific guidelines for this scenario.

2. **Case Law**: Several relevant cases have established important precedents:
   - Smith v. Jones (2022) - established the principle of reasonable expectation
   - Commonwealth v. ABC Corp (2023) - clarified regulatory compliance requirements

3. **Practical Recommendations**:
   - Ensure all documentation is properly maintained
   - Consider engaging with regulatory bodies early in the process
   - Review compliance requirements regularly

Would you like me to elaborate on any of these points or explore specific aspects in more detail?`,
      tokens: 145,
      citations: [
        {
          source: 'Australian Corporate Law Act 2001',
          title: 'Corporate Compliance Requirements',
          section: 'Section 15.3',
          relevanceScore: 0.92,
        },
        {
          source: 'Smith v. Jones [2022] HCA 45',
          title: 'Reasonable Expectation in Corporate Governance',
          relevanceScore: 0.88,
        },
        {
          source: 'Commonwealth v. ABC Corp [2023] FCA 123',
          title: 'Regulatory Compliance Standards',
          section: 'Paragraphs 34-38',
          relevanceScore: 0.85,
        },
      ],
    },
    {
      content: `Thank you for your question about "${userMessage}". Let me provide a comprehensive analysis:

**Legal Position**: The legal position regarding this matter is well-established through both statute and common law.

**Key Considerations**:
- Statutory requirements under relevant legislation
- Common law principles that apply
- Regulatory guidance from relevant authorities
- Recent developments in case law

**Recommendations**:
1. Review your current practices against legal requirements
2. Consider obtaining specialist legal advice for your specific circumstances
3. Ensure compliance documentation is up to date
4. Monitor for any regulatory changes that may affect your position

This is a complex area of law, and the specific facts of your situation will be crucial in determining the best approach. Would you like me to focus on any particular aspect?`,
      tokens: 128,
      citations: [
        {
          source: 'Corporations Act 2001 (Cth)',
          title: 'Director Duties and Corporate Governance',
          section: 'Part 2D.1',
          relevanceScore: 0.94,
        },
        {
          source: 'ASIC Regulatory Guide 175',
          title: 'Licensing: Financial Product Advisers',
          relevanceScore: 0.87,
        },
      ],
    },
  ];
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
  
  // Return random response for demo
  const response = responses[Math.floor(Math.random() * responses.length)];
  
  return response;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}