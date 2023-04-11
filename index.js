var createDomainIdentity = require('./actions/createDomainIdentity');

module.exports = {
    title: 'Custom From Email',
    actions: [
        createDomainIdentity
    ],
    configurationParameters: [
        {
            key: 'AwsRegion', // eu-west-1
            label: 'AWS Region',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'AwsAccessKeyId',
            label: 'AWS Access Key ID',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'AwsSecretAccessKey',
            label: 'AWS Secret Access Key',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'NotificationSnsTopic', // arn:aws:sns:eu-west-1:465708500747:doo-production2-email-campaigns-ses-notifications-topic
            label: 'Notification SNS Topic',
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