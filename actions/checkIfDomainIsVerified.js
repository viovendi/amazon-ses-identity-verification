const AWS = require('aws-sdk');

module.exports = {
    key: 'CheckIfDomainIsVerified',
    title: 'Check if domain is verified',
    description: `The action checks if the domain is verified in AWS SES.`,
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
        handler: checkIfDomainIsVerified
    },
    outputParameters: [
        {
            key: 'VerificationStatus',
            title: 'Verification status',
            type: 'string',
            validation: {
                required: true
            }
        }
    ]
}

async function checkIfDomainIsVerified({ inputParameters, configurationParameters }) {
    // TODO add validation for input parameters

    const ses = new AWS.SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const response = await ses.getIdentityVerificationAttributes({
        Identities: [inputParameters.DomainName]
    }).promise();

    const verificationStatus = response.VerificationAttributes[inputParameters.DomainName].VerificationStatus;

    return {
        VerificationStatus: verificationStatus
    }
}