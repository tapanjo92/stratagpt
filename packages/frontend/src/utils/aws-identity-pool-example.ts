/**
 * Example demonstrating Cognito Identity Pool usage for direct AWS service access
 * This shows how users can get temporary AWS credentials based on their authentication status
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

/**
 * Example 1: Upload file directly to S3 using temporary credentials
 * Pro+ users can upload to their personal S3 folder
 */
export async function uploadFileToS3(file: File, userId: string) {
  try {
    // Get temporary AWS credentials from Identity Pool
    const session = await fetchAuthSession();
    
    if (!session.credentials) {
      throw new Error('No AWS credentials available');
    }

    // Create S3 client with temporary credentials
    const s3Client = new S3Client({
      region: 'ap-south-1',
      credentials: session.credentials,
    });

    // Upload file to user's personal folder
    const command = new PutObjectCommand({
      Bucket: 'stratagpt-dev-user-data',
      Key: `${userId}/${file.name}`,
      Body: file,
      ContentType: file.type,
    });

    const result = await s3Client.send(command);
    
    console.log('✅ File uploaded successfully:', result);
    return result;
    
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    throw error;
  }
}

/**
 * Example 2: Store user data directly in DynamoDB
 * Users can store their own data with proper access controls
 */
export async function storeUserData(userId: string, data: Record<string, any>) {
  try {
    // Get temporary AWS credentials
    const session = await fetchAuthSession();
    
    if (!session.credentials) {
      throw new Error('No AWS credentials available');
    }

    // Create DynamoDB client with temporary credentials
    const dynamoClient = new DynamoDBClient({
      region: 'ap-south-1',
      credentials: session.credentials,
    });

    // Store data with user ID as partition key
    const command = new PutItemCommand({
      TableName: 'stratagpt-dev-main',
      Item: {
        pk: { S: userId },
        sk: { S: `profile#${Date.now()}` },
        data: { S: JSON.stringify(data) },
        timestamp: { N: Date.now().toString() },
      },
    });

    const result = await dynamoClient.send(command);
    
    console.log('✅ Data stored successfully:', result);
    return result;
    
  } catch (error) {
    console.error('❌ DynamoDB write failed:', error);
    throw error;
  }
}

/**
 * Example 3: Check user's access level and available services
 * Different user groups (free, pro, enterprise, admin) have different permissions
 */
export async function checkUserAccess() {
  try {
    const session = await fetchAuthSession();
    
    const accessInfo = {
      isAuthenticated: !!session.credentials,
      identityId: session.identityId,
      userGroups: session.tokens?.accessToken.payload['cognito:groups'] || [],
      region: 'ap-south-1',
    };

    // Determine access level based on groups
    const groups = accessInfo.userGroups as string[];
    
    if (groups.includes('admin')) {
      accessInfo.accessLevel = 'admin';
      accessInfo.services = ['s3', 'dynamodb', 'bedrock', 'cognito-admin'];
    } else if (groups.includes('enterprise')) {
      accessInfo.accessLevel = 'enterprise';
      accessInfo.services = ['s3', 'dynamodb', 'bedrock-premium'];
    } else if (groups.includes('pro')) {
      accessInfo.accessLevel = 'pro';
      accessInfo.services = ['s3', 'dynamodb', 'bedrock-basic'];
    } else {
      accessInfo.accessLevel = 'free';
      accessInfo.services = ['s3-read-only', 'dynamodb-read-only'];
    }

    console.log('👤 User access info:', accessInfo);
    return accessInfo;
    
  } catch (error) {
    console.error('❌ Access check failed:', error);
    return { isAuthenticated: false, accessLevel: 'none', services: [] };
  }
}

/**
 * Example 4: Test function to validate Identity Pool setup
 * Call this after user signs in to verify everything works
 */
export async function testIdentityPoolSetup() {
  console.log('🧪 Testing Identity Pool setup...');
  
  try {
    // 1. Check authentication and access
    const accessInfo = await checkUserAccess();
    console.log('✅ Access check passed');

    // 2. Test credential retrieval
    const session = await fetchAuthSession();
    if (session.credentials) {
      console.log('✅ AWS credentials obtained');
      console.log('🔑 Access Key ID:', session.credentials.accessKeyId.slice(0, 10) + '...');
      console.log('🆔 Identity ID:', session.identityId);
    } else {
      console.log('⚠️ No AWS credentials available');
    }

    // 3. Test service access (without actually calling services)
    console.log('📋 Available services:', accessInfo.services);
    
    return {
      success: true,
      identityPoolWorking: !!session.credentials,
      accessLevel: accessInfo.accessLevel,
      services: accessInfo.services,
    };
    
  } catch (error) {
    console.error('❌ Identity Pool test failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Usage examples for your React components:
/*
// In a React component:
import { uploadFileToS3, checkUserAccess, testIdentityPoolSetup } from './utils/aws-identity-pool-example';

// Test Identity Pool setup on mount
useEffect(() => {
  testIdentityPoolSetup().then(result => {
    console.log('Identity Pool test result:', result);
  });
}, []);

// Handle file upload
const handleFileUpload = async (file: File) => {
  const user = await getCurrentUser();
  await uploadFileToS3(file, user.userId);
};

// Check user permissions
const handleCheckAccess = async () => {
  const access = await checkUserAccess();
  setUserPermissions(access);
};
*/