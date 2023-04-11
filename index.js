var createDomainIdentity = require('./actions/createDomainIdentity');

module.exports = {
    title: 'Custom From Email',
    actions: [
        createDomainIdentity
    ],
    configurationParameters: [
        {
            key: 'AwsRegion', // eu-west-1
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
            key: 'NotificationSnsTopic', // arn:aws:sns:eu-west-1:465708500747:doo-production2-email-campaigns-ses-notifications-topic
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