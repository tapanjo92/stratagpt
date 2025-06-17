import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { EnvironmentConfig } from '../config/environment';

export interface DataStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class DataStack extends Stack {
  public readonly mainTable: dynamodb.Table;
  public readonly documentsBucket: s3.Bucket;
  public readonly generatedDocumentsBucket: s3.Bucket;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create encryption key
    this.encryptionKey = new kms.Key(this, 'EncryptionKey', {
      alias: `${config.projectName}-key`,
      description: 'KMS key for StrataGPT encryption',
      enableKeyRotation: true,
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Create main DynamoDB table with single table design
    this.mainTable = new dynamodb.Table(this, 'MainTable', {
      tableName: `${config.projectName}-main`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      pointInTimeRecovery: config.stage === 'prod',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'TTL',
    });

    // GSI1: Query by user email
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Query by entity type and timestamp
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: Query by status
    this.mainTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // S3 bucket for source documents
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `${config.projectName}-documents-${config.account}-${config.region}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: config.stage !== 'prod',
      lifecycleRules: [
        {
          id: 'delete-incomplete-uploads',
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          id: 'transition-to-intelligent-tiering',
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(0),
            },
          ],
        },
        {
          id: 'delete-old-versions',
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: config.stage === 'prod' 
            ? [`https://${config.domainName}`]
            : ['http://localhost:3000'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
    });

    // S3 bucket for generated documents
    this.generatedDocumentsBucket = new s3.Bucket(this, 'GeneratedDocumentsBucket', {
      bucketName: `${config.projectName}-generated-${config.account}-${config.region}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: config.stage !== 'prod',
      lifecycleRules: [
        {
          id: 'expire-generated-documents',
          expiration: Duration.days(30),
        },
      ],
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: config.stage === 'prod' 
            ? [`https://${config.domainName}`]
            : ['http://localhost:3000'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
    });

    // Create S3 bucket for static assets (future use)
    new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `${config.projectName}-assets-${config.account}-${config.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      publicReadAccess: true,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          maxAge: 3600,
        },
      ],
    });
  }
}
