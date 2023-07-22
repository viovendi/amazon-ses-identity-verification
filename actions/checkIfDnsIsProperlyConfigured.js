const AWS = require('aws-sdk');
const dnsPacket = require('dns-packet');
const dgram = require('dgram');

module.exports = {
    key: 'CheckIfDnsIsProperlyConfigured',
    title: 'Check if DNS for domain is properly configured',
    description: `
        The action checks if the DNS records for the domain are properly configured on the DNS server responsible for the domain.
        Properly configured DNS recodrs does not mean that the domain is verified on AWS, but it does mean that the domain will be verified on AWS soon.
        To check if the domain is verified on AWS, use the CheckDomainVerificationStatus action.`,
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
            key: 'VerificationResults',
            title: 'Verification results',
            description: 'The verification results for each DNS record of the domain.',
            type: 'string',
            validation: {
                required: true
            }
        }
    ]
}

async function handler({ inputParameters, configurationParameters }) {
    // TODO add validation for input parameters

    var results = [];

    const ses = new AWS.SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const result = await ses.getIdentityDkimAttributes({
        Identities: [inputParameters.DomainName]
    }).promise();

    const dkimAttributes = result.DkimAttributes;

    for (let domain in dkimAttributes) {
        const tokens = dkimAttributes[domain].DkimTokens;

        for (let token of tokens) {
            const host = `${token}._domainkey.${domain}`;
            const expected = `${token}.dkim.amazonses.com`;
            const response = await checkDnsRecord(host, 'CNAME');

            if (response.answers.length > 0) {
                const actual = response.answers[0].data;
                if (actual === expected) {
                    results.push(`CNAME record for "${host}" is set properly.`);
                } else {
                    results.push(`CNAME record for "${host}" is NOT set properly. Actual value: "${actual}". Expected value: "${expected}".`);
                }
            } else {
                results.push(`CNAME record for "${host}" is NOT set. Expected value: "${expected}".`);
            }
        }
    }

    return {
        VerificationResults: results.join('\n')
    };
}

// function to create and send DNS query
async function checkDnsRecord(host, type) {
    return new Promise((resolve, reject) => {
        const buf = dnsPacket.encode({
            type: 'query',
            id: 1,
            flags: dnsPacket.RECURSION_DESIRED,
            questions: [{
                type: type,
                name: host
            }]
        });

        const socket = dgram.createSocket('udp4');

        socket.on('message', (message) => {
            const response = dnsPacket.decode(message);
            socket.close();
            resolve(response);
        });

        socket.send(buf, 0, buf.length, 53, '8.8.8.8'); // Google's DNS
    });
}