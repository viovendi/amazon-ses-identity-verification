const AWS = require('aws-sdk');

module.exports = {
    key: 'CreateDomainIdentity',
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
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const params = {
        Domain: inputParameters.DomainName,
        NotificationAttributes: {
            ForwardingEnabled: true,
            BounceTopic: configurationParameters.NotificationSnsTopic,
            ComplaintTopic: configurationParameters.NotificationSnsTopic,
            DeliveryTopic: configurationParameters.NotificationSnsTopic,
            HeadersInBounceNotificationsEnabled: true,
            HeadersInComplaintNotificationsEnabled: true,
            HeadersInDeliveryNotificationsEnabled: true
        }
    };

    const data = await ses.verifyDomainIdentity(params).promise();
    console.log(JSON.stringify(data)); // TODO remove

    return {
        DnsConfiguration: 'TODO' // TODO replace with real value
    }
}