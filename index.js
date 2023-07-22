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
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'AwsAccessKeyId',
            title: 'AWS Access Key ID',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'AwsSecretAccessKey',
            title: 'AWS Secret Access Key',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'NotificationSnsTopic',
            title: 'Notification SNS Topic',
            type: 'string',
            validation: {
                required: true
            }
        }
    ],
    maintainers: [
        {
            name: 'Volodymyr Machula',
            email: 'machulav@gmail.com'
        }
    ]
};