import type { PreTokenGenerationTriggerHandler } from 'aws-lambda';

export const handler: PreTokenGenerationTriggerHandler = async (event) => {
  // Add custom claims to ID token
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        jurisdiction: event.request.userAttributes['custom:jurisdiction'] || 'NSW',
        plan_type: event.request.userAttributes['custom:plan_type'] || 'free',
        stripe_customer_id: event.request.userAttributes['custom:stripe_customer_id'] || '',
      },
    },
  };
  
  return event;
};
