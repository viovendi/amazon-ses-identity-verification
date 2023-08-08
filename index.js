const verifyDomain = require('./actions/verifyDomain');
const checkDomainVerificationStatus = require('./actions/checkDomainVerificationStatus');
const getDomainDnsSettings = require('./actions/getDomainDnsSettings');
const checkIfDnsIsProperlyConfigured = require('./actions/checkIfDnsIsProperlyConfigured');

module.exports = {
    title: 'Amazon SES Identity Verification',
    actions: [
        verifyDomain,
        checkDomainVerificationStatus,
        getDomainDnsSettings,
        checkIfDnsIsProperlyConfigured
    ],
    configurationParameters: [
        {
            key: 'AwsRegion',
            title: 'AWS Region',
            description: 'The AWS region where the domain will be verified.',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'NotificationSnsTopic',
            title: 'Notification SNS Topic',
            description: 'The SNS topic ARN to which the identity notification will be sent',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'AwsAccessKeyId',
            title: 'AWS Access Key ID',
            description: 'The AWS access key ID with permissions to verify the domain. If not provided, the IAM role attached to the runner will be used.',
            type: 'string'
        },
        {
            key: 'AwsSecretAccessKey',
            title: 'AWS Secret Access Key',
            description: 'The AWS secret access key with permissions to verify the domain. If not provided, the IAM role attached to the runner will be used.',
            type: 'string',
        }
    ],
    maintainers: [
        {
            name: 'Connery',
            email: 'support@connery.io'
        }
    ],
    connery: {
        runnerVersion: '1'
    }
};