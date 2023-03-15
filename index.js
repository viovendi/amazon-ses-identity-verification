var createIdentity = require('./actions/createIdentity');

module.exports = {
    label: 'Amazon SES',
    description: 'Manage Amazon SES resources',
    actions: [
        createIdentity
    ],
    configurationFields: [
        {
            key: 'awsRegion',
            label: 'AWS Region',
            type: 'string',
            required: true
        },
        {
            key: 'awsAccessKeyId',
            label: 'AWS Access Key ID',
            type: 'string',
            required: true
        },
        {
            key: 'awsSecretAccessKey',
            label: 'AWS Secret Access Key',
            type: 'string',
            required: true
        },
        {
            key: 'notificationSnsTopic',
            label: 'Notification SNS Topic',
            type: 'string',
            required: true
        }
    ]
};