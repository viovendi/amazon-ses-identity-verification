const AWS = require('aws-sdk');

module.exports = {
    key: 'VerifyDomain',
    title: 'Verify domain',
    description: `
        The action adds the domain to AWS SES for the futrther verification.
        After the domain is added to AWS SES, the DNS records are provided.
        The DNS records must be added to the DNS configuration of the domain to finish the domain verification process.
        Only after the domain is verified, it can be used to send emails with custom MAIL FROM address.
        If the domain verification is failed, you can restart the verification process by running the action again.`,
    type: 'action',
    inputParameters: [
        {
            key: 'DomainName',
            title: 'Domain name',
            description: 'A valid domain name.',
            type: 'string',
            validation: {
                required: true
            }
        }
    ],
    operation: {
        type: 'js',
        handler
    },
    outputParameters: [
        {
            key: 'DnsRecords',
            title: 'DNS records for verification',
            description: `
                To finish the verification process you must complete the verification process with DKIM authentication. 
                Copy the provided DNS records and add them to the DNS configuration of the domain. 
                It takes up to 72 hours for AWS SES to verify if the DNS records are added. If the records are not added within 72 hours,
                the verification process will fail and should be restarted.`,
            type: 'string',
            validation: {
                required: true
            }
        }
    ]
}

async function handler({ inputParameters, configurationParameters }) {
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