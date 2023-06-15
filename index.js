const verifyDomain = require('./actions/verifyDomain');
const checkIfDomainIsVerified = require('./actions/checkIfDomainIsVerified');

module.exports = {
    title: 'Custom From Email',
    actions: [
        verifyDomain,
        checkIfDomainIsVerified,
        //checkIfDnsIsProperlyConfigured,
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