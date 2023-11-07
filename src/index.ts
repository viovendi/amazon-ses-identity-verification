import { PluginDefinition } from '@connery-io/sdk';
import verifyDomain from './actions/verifyDomain';
import getDomainDnsSettings from './actions/getDomainDnsSettings';
import checkIfDnsForDomainIsProperlyConfigured from './actions/checkIfDnsForDomainIsProperlyConfigured';
import checkDomainVerificationStatus from './actions/checkDomainVerificationStatus';

const plugin: PluginDefinition = {
  title: 'Amazon SES Identity Verification',
  description: 'The plugin is focused on domain verification in Amazon SES and has all the actions needed for this.',
  actions: [verifyDomain, getDomainDnsSettings, checkIfDnsForDomainIsProperlyConfigured, checkDomainVerificationStatus],
  configurationParameters: [
    {
      key: 'awsRegion',
      title: 'AWS Region',
      description: 'The AWS region where the domain will be verified.',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'notificationSnsTopic',
      title: 'Notification SNS Topic',
      description: 'The SNS topic ARN to which the identity notification will be sent',
      type: 'string',
      validation: {
        required: true,
      },
    },
  ],
  maintainers: [
    {
      name: 'doo',
      email: 'support@doo.net',
    },
  ],
  connery: {
    runnerVersion: '0',
  },
};
export default plugin;
