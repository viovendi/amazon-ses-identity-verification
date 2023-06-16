const AWS = require('aws-sdk');
const dnsPacket = require('dns-packet');
const dgram = require('dgram');

module.exports = {
    key: 'CheckIfDnsIsProperlyConfigured',
    title: 'Check if DNS for domain is properly configured',
    description: `The action checks if the DNS records for the domain are properly configured.`,
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
        Domain: inputParameters.DomainName
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
                    results.push(`DKIM record for ${host} is set properly.`);
                } else {
                    results.push(`DKIM record for ${host} is NOT set properly. Actual: ${actual}. Expected: ${expected}.`);
                }
            } else {
                results.push(`DKIM record for ${host} is NOT set. Expected: ${expected}.`);
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