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

    await ses.verifyDomainIdentity({
        Domain: inputParameters.DomainName
    }).promise();

    await ses.setIdentityFeedbackForwardingEnabled({
        Identity: inputParameters.DomainName,
        ForwardingEnabled: true
    }).promise();

    await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Bounce',
        SnsTopic: configurationParameters.NotificationSnsTopic
    }).promise();

    await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Complaint',
        SnsTopic: configurationParameters.NotificationSnsTopic
    }).promise();

    await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Delivery',
        SnsTopic: configurationParameters.NotificationSnsTopic
    }).promise();

    await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Bounce',
        Enabled: true
    }).promise();

    await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Complaint',
        Enabled: true
    }).promise();

    await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Delivery',
        Enabled: true
    }).promise();

    const result = await ses.verifyDomainDkim({
        Domain: inputParameters.DomainName
    }).promise();

    const dkimTokens = result.DkimTokens;

    const dnsConfiguration = [];
    for (const dkimToken of dkimTokens) {
        dnsConfiguration.push({
            type: 'CNAME',
            name: `${dkimToken}._domainkey.${inputParameters.DomainName}`,
            value: `${dkimToken}.dkim.amazonses.com`
        });
    }

    return {
        DnsConfiguration: dnsConfiguration.toString()
    }
}