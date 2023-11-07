import { ActionDefinition, ActionContext, OutputParametersObject } from '@connery-io/sdk';
const { SES } = require('@aws-sdk/client-ses');

const action: ActionDefinition = {
  key: 'checkDomainVerificationStatus',
  title: 'Check domain verification status',
  description:
    'The action returns the verification status of the domain. Available statuses: "Pending", "Success", "Failed", "TemporaryFailure", "NotStarted", "NotFound". If the status "NotFound", then the domain does not exist in the AWS SES.',
  type: 'read',
  inputParameters: [
    {
      key: 'domainName',
      title: 'Domain name',
      description: 'A valid domain name.',
      type: 'string',
      validation: {
        required: true,
      },
    },
  ],
  operation: {
    handler: handler,
  },
  outputParameters: [
    {
      key: 'verificationStatus',
      title: 'Verification status',
      type: 'string',
      validation: {
        required: true,
      },
    },
  ],
};
export default action;

export async function handler({
  inputParameters,
  configurationParameters,
}: ActionContext): Promise<OutputParametersObject> {
  // TODO add validation for input parameters

  const ses = new SES({
    region: configurationParameters.awsRegion,
  });

  const response = await ses.getIdentityVerificationAttributes({
    Identities: [inputParameters.domainName],
  });

  let verificationStatus;
  if (response.VerificationAttributes && response.VerificationAttributes[inputParameters.domainName]) {
    verificationStatus = response.VerificationAttributes[inputParameters.domainName].VerificationStatus;
  } else {
    verificationStatus = 'NotFound';
  }

  return {
    verificationStatus: verificationStatus,
  };
}
