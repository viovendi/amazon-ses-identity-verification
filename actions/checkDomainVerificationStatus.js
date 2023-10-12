const {
    SES
} = require("@aws-sdk/client-ses");

module.exports = {
    key: 'CheckDomainVerificationStatus',
    title: 'Check domain verification status',
    description: 'The action returns the verification status of the domain. Available statuses: "Pending", "Success", "Failed", "TemporaryFailure", "NotStarted", "NotFound". If the status "NotFound", then the domain does not exist in the AWS SES.',
    type: 'read',
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
            key: 'VerificationStatus',
            title: 'Verification status',
            type: 'string',
            validation: {
                required: true
            }
        }
    ]
}

async function handler({ inputParameters, configurationParameters }) {
    // TODO add validation for input parameters

    const ses = new SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const response = await ses.getIdentityVerificationAttributes({
        Identities: [inputParameters.DomainName]
    });

    let verificationStatus;
    if (response.VerificationAttributes && response.VerificationAttributes[inputParameters.DomainName]) {
        verificationStatus = response.VerificationAttributes[inputParameters.DomainName].VerificationStatus;
    }
    else {
        verificationStatus = 'NotFound';
    }

    return {
        VerificationStatus: verificationStatus
    }
}