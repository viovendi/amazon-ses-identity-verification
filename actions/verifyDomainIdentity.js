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
            key: 'DnsRecords',
            title: 'DNS records for verification',
            description: 'After the domain identity is created, you must complete the verification process with DKIM authentication by copying the following generated CNAME records to publish to the domain’s DNS provider. Detection of these records may take up to 72 hours.', // TODO update description
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

    const dnsRecords = [];
    for (const dkimToken of dkimTokens) {
        dnsRecords.push({
            type: 'CNAME',
            name: `${dkimToken}._domainkey.${inputParameters.DomainName}`,
            value: `${dkimToken}.dkim.amazonses.com`
        });
    }

    return {
        DnsRecords: JSON.stringify(dnsRecords)
    }
}