import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from '../config/environment';

export interface ApiStackProps extends StackProps {
  config: EnvironmentConfig;
  userPool: cognito.UserPool;
  mainTable: dynamodb.Table;
}

export class ApiStack extends Stack {
  public readonly graphqlApi: appsync.GraphqlApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, userPool, mainTable } = props;

    // Create GraphQL API
    this.graphqlApi = new appsync.GraphqlApi(this, 'GraphQLApi', {
      name: `${config.projectName}-api`,
      schema: appsync.SchemaFile.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.API_KEY,
            apiKeyConfig: {
              name: 'Public API Key',
              description: 'API key for public access',
            },
          },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
        excludeVerboseContent: config.stage === 'prod',
      },
    });

    // Create DynamoDB data source
    const dynamoDataSource = this.graphqlApi.addDynamoDbDataSource(
      'MainTableDataSource',
      mainTable
    );

    // Grant additional permissions for batch operations
    dynamoDataSource.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem'],
        resources: [mainTable.tableArn, `${mainTable.tableArn}/index/*`],
      })
    );

    // Create None data source for local resolvers
    const noneDataSource = this.graphqlApi.addNoneDataSource('NoneDataSource');

    // Create Chat Handler Lambda
    const chatHandlerLambda = new lambda.Function(this, 'ChatHandlerLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/chat-handler'),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        STAGE: config.stage,
      },
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'GraphQL resolver for chat operations with AI integration',
    });

    // Grant DynamoDB permissions to chat handler
    mainTable.grantReadWriteData(chatHandlerLambda);

    // Create Chat Lambda data source
    const chatHandlerDataSource = this.graphqlApi.addLambdaDataSource(
      'ChatHandlerDataSource',
      chatHandlerLambda
    );

    // Create User Handler Lambda
    const userHandlerLambda = new lambda.Function(this, 'UserHandlerLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/user-handler'),
      environment: {
        MAIN_TABLE_NAME: mainTable.tableName,
        STAGE: config.stage,
      },
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'GraphQL resolver for user management operations with validation',
    });

    // Grant DynamoDB permissions to user handler
    mainTable.grantReadWriteData(userHandlerLambda);

    // Create User Lambda data source
    const userHandlerDataSource = this.graphqlApi.addLambdaDataSource(
      'UserHandlerDataSource',
      userHandlerLambda
    );

    // Define resolvers
    const resolvers = [
      {
        typeName: 'Mutation',
        fieldName: 'createUser',
        dataSource: userHandlerDataSource,
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      },
      {
        typeName: 'Query',
        fieldName: 'getUser',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.id || $ctx.args.id.trim() == "")
            $util.error("User ID is required and cannot be empty", "ValidationError")
          #end
          {
            "version": "2017-02-28",
            "operation": "GetItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.id"),
              "SK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.id")
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          #if(!$ctx.result)
            $util.error("User not found", "NotFoundError")
          #end
          $util.toJson($ctx.result)
        `),
      },
      {
        typeName: 'Query',
        fieldName: 'listChats',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.userId || $ctx.args.userId.trim() == "")
            $util.error("User ID is required and cannot be empty", "ValidationError")
          #end
          #if($ctx.args.limit && ($ctx.args.limit < 1 || $ctx.args.limit > 100))
            $util.error("Limit must be between 1 and 100", "ValidationError")
          #end
          {
            "version": "2017-02-28",
            "operation": "Query",
            "query": {
              "expression": "PK = :pk AND begins_with(SK, :sk)",
              "expressionValues": {
                ":pk": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.userId"),
                ":sk": $util.dynamodb.toDynamoDBJson("CHAT#")
              }
            },
            "limit": $util.defaultIfNull($ctx.args.limit, 20),
            "nextToken": $util.toJson($util.defaultIfNullOrBlank($ctx.args.nextToken, null))
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          {
            "items": $util.toJson($util.defaultIfNull($ctx.result.items, [])),
            "nextToken": $util.toJson($util.defaultIfNullOrBlank($ctx.result.nextToken, null))
          }
        `),
      },
      {
        typeName: 'Mutation',
        fieldName: 'createChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.input.userId || $ctx.args.input.userId.trim() == "")
            $util.error("User ID is required and cannot be empty", "ValidationError")
          #end
          #if(!$ctx.args.input.title || $ctx.args.input.title.trim() == "")
            $util.error("Chat title is required and cannot be empty", "ValidationError")
          #end
          #if($ctx.args.input.title.length() > 100)
            $util.error("Chat title cannot exceed 100 characters", "ValidationError")
          #end
          #set($chatId = $util.autoId())
          #set($now = $util.time.nowISO8601())
          {
            "version": "2017-02-28",
            "operation": "PutItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.input.userId"),
              "SK": $util.dynamodb.toDynamoDBJson("CHAT#$chatId")
            },
            "attributeValues": {
              "id": $util.dynamodb.toDynamoDBJson($chatId),
              "userId": $util.dynamodb.toDynamoDBJson($ctx.args.input.userId),
              "title": $util.dynamodb.toDynamoDBJson($ctx.args.input.title.trim()),
              "createdAt": $util.dynamodb.toDynamoDBJson($now),
              "updatedAt": $util.dynamodb.toDynamoDBJson($now),
              "messageCount": $util.dynamodb.toDynamoDBJson(0)
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          $util.toJson($ctx.result)
        `),
      },
      {
        typeName: 'Mutation',
        fieldName: 'sendMessage',
        dataSource: chatHandlerDataSource,
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      },
      {
        typeName: 'Query',
        fieldName: 'getChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.id || $ctx.args.id.trim() == "")
            $util.error("Chat ID is required and cannot be empty", "ValidationError")
          #end
          #if(!$ctx.identity.sub)
            $util.error("User must be authenticated", "UnauthorizedError")
          #end
          {
            "version": "2017-02-28",
            "operation": "GetItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.identity.sub"),
              "SK": $util.dynamodb.toDynamoDBJson("CHAT#$ctx.args.id")
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          #if(!$ctx.result)
            $util.error("Chat not found or access denied", "NotFoundError")
          #end
          $util.toJson($ctx.result)
        `),
      },
      {
        typeName: 'Query',
        fieldName: 'listMessages',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.chatId || $ctx.args.chatId.trim() == "")
            $util.error("Chat ID is required and cannot be empty", "ValidationError")
          #end
          #if($ctx.args.limit && ($ctx.args.limit < 1 || $ctx.args.limit > 100))
            $util.error("Limit must be between 1 and 100", "ValidationError")
          #end
          {
            "version": "2017-02-28",
            "operation": "Query",
            "query": {
              "expression": "PK = :pk AND begins_with(SK, :sk)",
              "expressionValues": {
                ":pk": $util.dynamodb.toDynamoDBJson("CHAT#$ctx.args.chatId"),
                ":sk": $util.dynamodb.toDynamoDBJson("MESSAGE#")
              }
            },
            "scanIndexForward": false,
            "limit": $util.defaultIfNull($ctx.args.limit, 20),
            "nextToken": $util.toJson($util.defaultIfNullOrBlank($ctx.args.nextToken, null))
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          {
            "items": $util.toJson($util.defaultIfNull($ctx.result.items, [])),
            "nextToken": $util.toJson($util.defaultIfNullOrBlank($ctx.result.nextToken, null))
          }
        `),
      },
      {
        typeName: 'Mutation',
        fieldName: 'updateUser',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.input.id || $ctx.args.input.id.trim() == "")
            $util.error("User ID is required and cannot be empty", "ValidationError")
          #end
          #if(!$ctx.args.input.fullName && !$ctx.args.input.jurisdiction)
            $util.error("At least one field must be provided for update", "ValidationError")
          #end
          #if($ctx.args.input.fullName && $ctx.args.input.fullName.trim().length() < 2)
            $util.error("Full name must be at least 2 characters", "ValidationError")
          #end
          #if($ctx.args.input.jurisdiction && $ctx.args.input.jurisdiction.trim() == "")
            $util.error("Jurisdiction cannot be empty", "ValidationError")
          #end
          #set($now = $util.time.nowISO8601())
          #set($updates = {})
          #if($ctx.args.input.fullName)
            $util.qr($updates.put("fullName", $util.dynamodb.toDynamoDBJson($ctx.args.input.fullName.trim())))
          #end
          #if($ctx.args.input.jurisdiction)
            $util.qr($updates.put("jurisdiction", $util.dynamodb.toDynamoDBJson($ctx.args.input.jurisdiction.trim())))
          #end
          $util.qr($updates.put("updatedAt", $util.dynamodb.toDynamoDBJson($now)))
          {
            "version": "2017-02-28",
            "operation": "UpdateItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.input.id"),
              "SK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.input.id")
            },
            "update": {
              "expression": "SET #updatedAt = :updatedAt#if($ctx.args.input.fullName), #fullName = :fullName#end#if($ctx.args.input.jurisdiction), #jurisdiction = :jurisdiction#end",
              "expressionNames": {
                "#updatedAt": "updatedAt"
                #if($ctx.args.input.fullName)
                  ,"#fullName": "fullName"
                #end
                #if($ctx.args.input.jurisdiction)
                  ,"#jurisdiction": "jurisdiction"
                #end
              },
              "expressionValues": $util.toJson($updates)
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          $util.toJson($ctx.result.attributes)
        `),
      },
      {
        typeName: 'Mutation',
        fieldName: 'deleteChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #if(!$ctx.args.id || $ctx.args.id.trim() == "")
            $util.error("Chat ID is required and cannot be empty", "ValidationError")
          #end
          #if(!$ctx.identity.sub)
            $util.error("User must be authenticated", "UnauthorizedError")
          #end
          {
            "version": "2017-02-28",
            "operation": "DeleteItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.identity.sub"),
              "SK": $util.dynamodb.toDynamoDBJson("CHAT#$ctx.args.id")
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.fromString(`
          #if($ctx.error)
            $util.error($ctx.error.message, $ctx.error.type)
          #end
          #if($ctx.result)
            true
          #else
            $util.error("Chat not found or already deleted", "NotFoundError")
          #end
        `),
      },
      {
        typeName: 'Subscription',
        fieldName: 'onMessageSent',
        dataSource: noneDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString('{}'),
        responseMappingTemplate: appsync.MappingTemplate.fromString('$util.toJson($context.result)'),
      },
    ];

    // Create resolvers
    resolvers.forEach(resolver => {
      new appsync.Resolver(this, `${resolver.typeName}${resolver.fieldName}Resolver`, {
        api: this.graphqlApi,
        ...resolver,
      });
    });

    // Outputs for Amplify integration
    new CfnOutput(this, 'GraphQLApiUrl', {
      value: this.graphqlApi.graphqlUrl,
      exportName: `${this.stackName}-GraphQLApiUrl`,
    });

    new CfnOutput(this, 'GraphQLApiId', {
      value: this.graphqlApi.apiId,
      exportName: `${this.stackName}-GraphQLApiId`,
    });
  }
}
