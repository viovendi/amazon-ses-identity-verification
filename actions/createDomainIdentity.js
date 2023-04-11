const AWS = require('aws-sdk');

module.exports = {
    key: 'createDomainIdentity',
    title: 'Create domain identity',
    type: 'action',
    inputParameters: [
        {
            key: 'DomainName',
            title: 'Domain name',
            type: 'string',
            validation: {
                required: true
            }
        }
    ],
    operation: {
        type: 'js',
        handler: createDomainIdentity
    },
    outputParameters: [
        {
            key: 'DnsConfiguration',
            title: 'DNS configuration',
            type: 'string',
            validation: {
                required: true
            }
        }
    ]
}

async function createDomainIdentity({ inputParameters, configurationParameters }) {
    const ses = new AWS.SES({
        region: configurationParameters.awsRegion,
        accessKeyId: configurationParameters.awsAccessKeyId,
        secretAccessKey: configurationParameters.awsSecretAccessKey
    });

    const params = {
        Domain: inputParameters.DomainName,
        NotificationAttributes: {
            ForwardingEnabled: true,
            BounceTopic: configurationParameters.notificationSnsTopic,
            ComplaintTopic: configurationParameters.notificationSnsTopic,
            DeliveryTopic: configurationParameters.notificationSnsTopic,
            HeadersInBounceNotificationsEnabled: true,
            HeadersInComplaintNotificationsEnabled: true,
            HeadersInDeliveryNotificationsEnabled: true
        }
    };

    const data = await ses.verifyDomainIdentity(params).promise();

    return {
        data
    }
}