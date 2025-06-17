export interface EnvironmentConfig {
  account: string;
  region: string;
  stage: 'dev' | 'staging' | 'prod';
  projectName: string;
  domainName?: string;
}

export const getEnvironmentConfig = (stage: string): EnvironmentConfig => {
  const account = process.env.CDK_DEFAULT_ACCOUNT || '';
  const region = process.env.CDK_DEFAULT_REGION || 'ap-southeast-2';
  
  const configs: Record<string, EnvironmentConfig> = {
    dev: {
      account,
      region,
      stage: 'dev',
      projectName: 'stratagpt-dev',
    },
    staging: {
      account,
      region,
      stage: 'staging',
      projectName: 'stratagpt-staging',
      domainName: 'staging.stratagpt.com.au'
    },
    prod: {
      account,
      region,
      stage: 'prod',
      projectName: 'stratagpt',
      domainName: 'stratagpt.com.au'
    }
  };

  if (!configs[stage]) {
    throw new Error(`Unknown stage: ${stage}`);
  }

  return configs[stage];
};
