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

    const result2 = await ses.setIdentityFeedbackForwardingEnabled({
        Identity: inputParameters.DomainName,
        ForwardingEnabled: true
    }).promise();
    console.log(JSON.stringify(result2));

    const result3 = await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Bounce',
        SnsTopic: configurationParameters.NotificationSnsTopic
    }).promise();
    console.log(JSON.stringify(result3));

    const result4 = await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Complaint',
        SnsTopic: configurationParameters.NotificationSnsTopic
    }).promise();
    console.log(JSON.stringify(result4));

    const result5 = await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Delivery',
        SnsTopic: configurationParameters.NotificationSnsTopic
    }).promise();
    console.log(JSON.stringify(result5));

    const result6 = await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Bounce',
        Enabled: true
    }).promise();
    console.log(JSON.stringify(result6));

    const result7 = await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Complaint',
        Enabled: true
    }).promise();
    console.log(JSON.stringify(result7));

    const result8 = await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Delivery',
        Enabled: true
    }).promise();
    console.log(JSON.stringify(result8));

    const result9 = await ses.verifyDomainDkim({
        Domain: inputParameters.DomainName
    }).promise();
    console.log(JSON.stringify(result9));

    return {
        DnsConfiguration: 'TODO' // TODO replace with real value
    }
}