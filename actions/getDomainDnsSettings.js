const AWS = require('aws-sdk');

module.exports = {
    key: 'GetDomainDnsSettings',
    title: 'Get domain DNS settings',
    description: 'The action gets the DNS settings from AWS SES for the further domain verification.',
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