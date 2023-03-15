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
    const ses = new AWS.SES({ region: 'eu-west-1' });
    const params = {
        Domain: context.inputs.domain
    };

    const data = await ses.createDomainIdentity(params).promise();

    return {
        data
    }
}