import { ActionDefinition, ActionContext, OutputParametersObject } from '@connery-io/sdk';
import { SES } from '@aws-sdk/client-ses';

const action: ActionDefinition = {
  key: 'verifyDomain',
  title: 'Verify domain',
  description:
    'The action adds the domain to AWS SES for the futrther verification. After the domain is added to AWS SES, the DNS records are provided. The DNS records must be added to the DNS configuration of the domain to finish the domain verification process. Only after the domain is verified, it can be used to send emails with custom MAIL FROM address. If the domain verification is failed, you can restart the verification process by running the action again.',
  type: 'create',
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

  await ses.verifyDomainIdentity({
    Domain: inputParameters.domainName,
  });

  await ses.setIdentityFeedbackForwardingEnabled({
    Identity: inputParameters.domainName,
    ForwardingEnabled: true,
  });

  await ses.setIdentityNotificationTopic({
    Identity: inputParameters.domainName,
    NotificationType: 'Bounce',
    SnsTopic: configurationParameters.notificationSnsTopic,
  });

  await ses.setIdentityNotificationTopic({
    Identity: inputParameters.domainName,
    NotificationType: 'Complaint',
    SnsTopic: configurationParameters.notificationSnsTopic,
  });

  await ses.setIdentityNotificationTopic({
    Identity: inputParameters.domainName,
    NotificationType: 'Delivery',
    SnsTopic: configurationParameters.notificationSnsTopic,
  });

  await ses.setIdentityHeadersInNotificationsEnabled({
    Identity: inputParameters.domainName,
    NotificationType: 'Bounce',
    Enabled: true,
  });

  await ses.setIdentityHeadersInNotificationsEnabled({
    Identity: inputParameters.domainName,
    NotificationType: 'Complaint',
    Enabled: true,
  });

  await ses.setIdentityHeadersInNotificationsEnabled({
    Identity: inputParameters.domainName,
    NotificationType: 'Delivery',
    Enabled: true,
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
