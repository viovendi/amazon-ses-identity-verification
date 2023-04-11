const AWS = require('aws-sdk');

module.exports = {
    key: 'VerifyDomainIdentity',
    title: 'Verify domain identity',
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
        handler: verifyDomainIdentity
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

async function verifyDomainIdentity({ inputParameters, configurationParameters }) {
    const ses = new AWS.SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const result1 = await ses.verifyDomainIdentity({
        Domain: inputParameters.DomainName
    }).promise();
    console.log(JSON.stringify(result1));

    //NotificationAttributes: {
    //    ForwardingEnabled: true,
    //    BounceTopic: configurationParameters.NotificationSnsTopic,
    //    ComplaintTopic: configurationParameters.NotificationSnsTopic,
    //    DeliveryTopic: configurationParameters.NotificationSnsTopic,
    //    HeadersInBounceNotificationsEnabled: true,
    //    HeadersInComplaintNotificationsEnabled: true,
    //    HeadersInDeliveryNotificationsEnabled: true
    //}

    const result2 = ses.setIdentityFeedbackForwardingEnabled({
        Identity: inputParameters.DomainName,
        ForwardingEnabled: true
    }).promise();
    console.log(JSON.stringify(result2));


    return {
        DnsConfiguration: 'TODO' // TODO replace with real value
    }
}