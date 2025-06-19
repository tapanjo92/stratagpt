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
        requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem('PK', 'SK'),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Query',
        fieldName: 'listChats',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.dynamoDbQuery(
          appsync.KeyCondition.eq('PK', 'PK'),
        ),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
      },
      {
        typeName: 'Mutation',
        fieldName: 'createChat',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          {
            "version": "2017-02-28",
            "operation": "PutItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson($ctx.args.input.PK),
              "SK": $util.dynamodb.toDynamoDBJson($ctx.args.input.SK)
            },
            "attributeValues": $util.dynamodb.toMapValuesJson($ctx.args.input)
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
      },
      {
        typeName: 'Mutation',
        fieldName: 'sendMessage',
        dataSource: dynamoDataSource,
        requestMappingTemplate: appsync.MappingTemplate.fromString(`
          {
            "version": "2017-02-28",
            "operation": "PutItem",
            "key": {
              "PK": $util.dynamodb.toDynamoDBJson($ctx.args.input.PK),
              "SK": $util.dynamodb.toDynamoDBJson($ctx.args.input.SK)
            },
            "attributeValues": $util.dynamodb.toMapValuesJson($ctx.args.input)
          }
        `),
        responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
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
