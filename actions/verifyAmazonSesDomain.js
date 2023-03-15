const AWS = require('aws-sdk');

module.exports = {
    key: 'createIdentity',
    label: 'Create identity',
    description: 'Create identity in Amazon SES to verify and use it for sending emails',
    type: 'action',
    inputs: [
        {
            key: 'domain',
            label: 'Domain',
            type: 'string',
            required: true
        }
    ],
    operation: {
        type: 'code',
        source: verifyAmazonSesDomain
    },
    outputs: []
}

async function verifyAmazonSesDomain({ context }) {
    const notificationSnsTopic = 'arn:aws:sns:eu-west-1:465708500747:doo-production2-email-campaigns-ses-notifications-topic';
    const awsRegion = 'eu-west-1';

    const ses = new AWS.SES({ region: awsRegion });
    const params = {
        Domain: context.inputs.domain,
        NotificationAttributes: {
            ForwardingEnabled: true,
            BounceTopic: notificationSnsTopic,
            ComplaintTopic: notificationSnsTopic,
            DeliveryTopic: notificationSnsTopic,
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