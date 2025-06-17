import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EnvironmentConfig } from '../config/environment';

export interface NetworkStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class NetworkStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;
  public readonly cacheSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create VPC with private subnets only (serverless architecture)
    this.vpc = new ec2.Vpc(this, 'StrataGPTVpc', {
      vpcName: `${config.projectName}-vpc`,
      maxAzs: 2,
      natGateways: config.stage === 'prod' ? 2 : 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Security group for Lambda functions
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      securityGroupName: `${config.projectName}-lambda-sg`,
      allowAllOutbound: true,
    });

    // Security group for RDS (future use)
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for RDS instances',
      securityGroupName: `${config.projectName}-rds-sg`,
      allowAllOutbound: false,
    });

    // Allow Lambda to connect to RDS
    this.rdsSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to RDS'
    );

    // Security group for ElastiCache
    this.cacheSecurityGroup = new ec2.SecurityGroup(this, 'CacheSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ElastiCache',
      securityGroupName: `${config.projectName}-cache-sg`,
      allowAllOutbound: false,
    });

    // Allow Lambda to connect to Cache
    this.cacheSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Lambda to connect to Redis'
    );

    // VPC Endpoints for AWS services (cost optimization)
    if (config.stage === 'prod') {
      // S3 Gateway Endpoint (free)
      this.vpc.addGatewayEndpoint('S3Endpoint', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
      });

      // DynamoDB Gateway Endpoint (free)
      this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
        service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      });

      // Other Interface Endpoints (have hourly cost)
      const interfaceEndpoints = [
        { service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER, name: 'SecretsManager' },
        { service: ec2.InterfaceVpcEndpointAwsService.LAMBDA, name: 'Lambda' },
        { service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME, name: 'BedrockRuntime' },
      ];

      interfaceEndpoints.forEach(endpoint => {
        this.vpc.addInterfaceEndpoint(`${endpoint.name}Endpoint`, {
          service: endpoint.service,
          subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          securityGroups: [this.lambdaSecurityGroup],
        });
      });
    }
  }
}
