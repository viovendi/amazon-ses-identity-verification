const AWS = require('aws-sdk');

module.exports = {
    key: 'VerifyDomainIdentity',
    title: 'Verify domain identity',
    description: `
        The action verifies the domain identity in AWS SES. 
        After the domain is verified, any email address that is associated with the domain can be used to send emails from doo.
        However the email address has to be added to doo database first, so the user can select it in doo Manager when sending an email.`,
    type: 'action',
    inputParameters: [
        {
            key: 'DomainName',
            title: 'Domain name',
            description: 'The valid domain name to verify in AWS SES.',
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
            description: `
                To finish the verification process you must complete the verification process with DKIM authentication. 
                Copy the provided DNS records and add them to the DNS configuration of the domain. 
                It takes up to 72 hours for AWS SES to verify the domain. If the records are not added within 72 hours,
                the verification process will fail and should be restarted.`,
            type: 'string',
            validation: {
                required: true
            }
        }
    ]
}

async function verifyDomainIdentity({ inputParameters, configurationParameters }) {
    // TODO add validation for input parameters

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