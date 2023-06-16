const verifyDomain = require('./actions/verifyDomain');
const checkIfDomainIsVerified = require('./actions/checkIfDomainIsVerified');
const getDomainDnsSettings = require('./actions/getDomainDnsSettings');
const checkIfDnsIsProperlyConfigured = require('./actions/checkIfDnsIsProperlyConfigured');

module.exports = {
    title: 'Custom From Email',
    actions: [
        verifyDomain,
        checkIfDomainIsVerified,
        getDomainDnsSettings,
        checkIfDnsIsProperlyConfigured,
        //addEmailToDatabase
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