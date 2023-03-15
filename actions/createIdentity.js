const AWS = require('aws-sdk');

module.exports = {
    key: 'createIdentity',
    label: 'Create identity',
    description: 'Create identity in Amazon SES to verify and use it for sending emails',
    type: 'action',
    inputFields: [
        {
            key: 'domain',
            label: 'Domain',
            type: 'string',
            required: true
        }
    ],
    operation: {
        type: 'code',
        source: createIdentity
    },
    outputFields: []
}

async function createIdentity({ context }) {
    const ses = new AWS.SES({
        region: context.configurationFields.awsRegion, // eu-west-1
        accessKeyId: context.configurationFields.awsAccessKeyId,
        secretAccessKey: context.configurationFields.awsSecretAccessKey
    });
    const params = {
        Domain: context.inputFields.domain,
        NotificationAttributes: {
            ForwardingEnabled: true,
            BounceTopic: context.configurationFields.notificationSnsTopic, // arn:aws:sns:eu-west-1:465708500747:doo-production2-email-campaigns-ses-notifications-topic
            ComplaintTopic: context.configurationFields.notificationSnsTopic, // arn:aws:sns:eu-west-1:465708500747:doo-production2-email-campaigns-ses-notifications-topic
            DeliveryTopic: context.configurationFields.notificationSnsTopic, // arn:aws:sns:eu-west-1:465708500747:doo-production2-email-campaigns-ses-notifications-topic
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