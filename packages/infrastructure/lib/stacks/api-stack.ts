import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
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

    // Define resolvers
    const resolvers = [
      {
        typeName: 'Query',
        fieldName: 'getUser',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          {
            "version": "2017-02-28",
            "operation": "GetItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.id"),
              "SK": $util.dynamodb.toDynamoDBJson("USER#$ctx.args.id")
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Query',
        fieldName: 'listChats',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
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
          {
            "items": $util.toJson($ctx.result.items),
            "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
          }
        `),
      },
      {
        typeName: 'Mutation',
        fieldName: 'createChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
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
              "title": $util.dynamodb.toDynamoDBJson($ctx.args.input.title),
              "createdAt": $util.dynamodb.toDynamoDBJson($now),
              "updatedAt": $util.dynamodb.toDynamoDBJson($now),
              "messageCount": $util.dynamodb.toDynamoDBJson(0)
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Mutation',
        fieldName: 'sendMessage',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #set($messageId = $util.autoId())
          #set($now = $util.time.nowISO8601())
          {
            "version": "2017-02-28",
            "operation": "PutItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("CHAT#$ctx.args.input.chatId"),
              "SK": $util.dynamodb.toDynamoDBJson("MESSAGE#$messageId")
            },
            "attributeValues": {
              "id": $util.dynamodb.toDynamoDBJson($messageId),
              "chatId": $util.dynamodb.toDynamoDBJson($ctx.args.input.chatId),
              "userId": $util.dynamodb.toDynamoDBJson($ctx.args.input.userId),
              "role": $util.dynamodb.toDynamoDBJson("USER"),
              "content": $util.dynamodb.toDynamoDBJson($ctx.args.input.content),
              "createdAt": $util.dynamodb.toDynamoDBJson($now)
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Query',
        fieldName: 'getChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          {
            "version": "2017-02-28",
            "operation": "GetItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson("USER#$ctx.identity.sub"),
              "SK": $util.dynamodb.toDynamoDBJson("CHAT#$ctx.args.id")
            }
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Query',
        fieldName: 'listMessages',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
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
          {
            "items": $util.toJson($ctx.result.items),
            "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))
          }
        `),
      },
      {
        typeName: 'Mutation',
        fieldName: 'updateUser',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          #set($now = $util.time.nowISO8601())
          #set($updates = {})
          #if($ctx.args.input.fullName)
            $util.qr($updates.put("fullName", $util.dynamodb.toDynamoDBJson($ctx.args.input.fullName)))
          #end
          #if($ctx.args.input.jurisdiction)
            $util.qr($updates.put("jurisdiction", $util.dynamodb.toDynamoDBJson($ctx.args.input.jurisdiction)))
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
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Mutation',
        fieldName: 'deleteChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
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
          #if($ctx.result)
            true
          #else
            false
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
