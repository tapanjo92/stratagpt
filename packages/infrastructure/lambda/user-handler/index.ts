import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { AppSyncResolverEvent } from 'aws-lambda';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

interface CreateUserInput {
  id: string;
  email: string;
  fullName: string;
  jurisdiction: string;
  planType: string;
}

interface User {
  id: string;
  email: string;
  fullName: string;
  jurisdiction: string;
  planType: string;
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class DuplicateUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateUserError';
  }
}

export const handler = async (event: AppSyncResolverEvent<{ input: CreateUserInput }>) => {
  console.log('User handler event:', JSON.stringify(event, null, 2));
  
  const { fieldName } = event.info;
  const userId = (event.identity as any)?.sub;
  
  // Check authentication
  if (!userId) {
    throw new Error('User must be authenticated to perform this operation');
  }
  
  try {
    switch (fieldName) {
      case 'createUser':
        return await createUser(event.arguments.input, userId);
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error(`Error in user handler (${fieldName}):`, error);
    
    if (error instanceof ValidationError) {
      throw new Error(`Validation failed: ${error.message}`);
    }
    
    if (error instanceof DuplicateUserError) {
      throw new Error(`User already exists: ${error.message}`);
    }
    
    throw new Error(`Failed to process ${fieldName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

async function createUser(input: CreateUserInput, authenticatedUserId: string): Promise<User> {
  // Validate input
  validateCreateUserInput(input);
  
  // Authorization check: users can only create their own user record
  if (input.id !== authenticatedUserId) {
    throw new Error('Users can only create their own user record');
  }
  
  const now = new Date().toISOString();
  
  // Check if user already exists
  const existingUser = await getUserById(input.id);
  if (existingUser) {
    throw new DuplicateUserError(`User with ID ${input.id} already exists`);
  }
  
  // Create user object
  const user: User = {
    id: input.id,
    email: input.email.toLowerCase().trim(),
    fullName: input.fullName.trim(),
    jurisdiction: input.jurisdiction.trim(),
    planType: input.planType,
    createdAt: now,
    updatedAt: now,
  };
  
  // Save to DynamoDB
  await docClient.send(new PutCommand({
    TableName: process.env.MAIN_TABLE_NAME!,
    Item: {
      PK: `USER#${user.id}`,
      SK: `USER#${user.id}`,
      ...user,
    },
    ConditionExpression: 'attribute_not_exists(PK)', // Prevent overwrites
  }));
  
  console.log('User created successfully:', user.id);
  return user;
}

async function getUserById(id: string): Promise<User | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.MAIN_TABLE_NAME!,
      Key: {
        PK: `USER#${id}`,
        SK: `USER#${id}`,
      },
    }));
    
    return result.Item as User | null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

function validateCreateUserInput(input: CreateUserInput): void {
  const errors: string[] = [];
  
  // Validate ID
  if (!input.id || typeof input.id !== 'string' || input.id.trim().length === 0) {
    errors.push('ID is required and must be a non-empty string');
  }
  
  // Validate email
  if (!input.email || typeof input.email !== 'string') {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email.trim())) {
      errors.push('Email must be a valid email address');
    }
  }
  
  // Validate fullName
  if (!input.fullName || typeof input.fullName !== 'string' || input.fullName.trim().length < 2) {
    errors.push('Full name is required and must be at least 2 characters');
  }
  
  // Validate jurisdiction
  if (!input.jurisdiction || typeof input.jurisdiction !== 'string' || input.jurisdiction.trim().length === 0) {
    errors.push('Jurisdiction is required');
  }
  
  // Validate planType
  const validPlanTypes = ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'];
  if (!input.planType || !validPlanTypes.includes(input.planType)) {
    errors.push(`Plan type must be one of: ${validPlanTypes.join(', ')}`);
  }
  
  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '));
  }
}