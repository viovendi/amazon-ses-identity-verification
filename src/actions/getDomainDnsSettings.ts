import { ActionDefinition, ActionContext, OutputParametersObject } from '@connery-io/sdk';
import { SES } from '@aws-sdk/client-ses';

const action: ActionDefinition = {
  key: 'getDomainDnsSettings',
  title: 'Get domain DNS settings',
  description: 'The action gets the DNS settings from AWS SES for the further domain verification.',
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
      key: 'dnsRecords',
      title: 'DNS records for verification',
      description:
        'To finish the verification process you must complete the verification process with DKIM authentication. Copy the provided DNS records and add them to the DNS configuration of the domain. It takes up to 72 hours for AWS SES to verify if the DNS records are added. If the records are not added within 72 hours, the verification process will fail and should be restarted.',
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

  const result = await ses.verifyDomainDkim({
    Domain: inputParameters.domainName,
  });

  const dkimTokens = result.DkimTokens;

  const dnsRecords = [];
  for (const dkimToken of dkimTokens) {
    dnsRecords.push({
      type: 'CNAME',
      name: `${dkimToken}._domainkey.${inputParameters.domainName}`,
      value: `${dkimToken}.dkim.amazonses.com`,
    });
  }

  return {
    dnsRecords: JSON.stringify(dnsRecords),
  };
}
