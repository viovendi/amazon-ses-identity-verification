# Amazon SES identity verification

Amazon SES identity verification connector for Connery.

## Available actions

| Action                                                                                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Check domain verification status](/actions/checkDomainVerificationStatus.js)                | The action returns the verification status of the domain. Available statuses: "Pending", "Success", "Failed", "TemporaryFailure", "NotStarted", "NotFound". If the status "NotFound", then the domain does not exist in the AWS SES.                                                                                                                                                                                                                             |
| [Check if DNS for domain is properly configured](/actions/checkIfDnsIsProperlyConfigured.js) | The action checks if the DNS records for the domain are properly configured on the DNS server responsible for the domain. Properly configured DNS recodrs does not mean that the domain is verified on AWS, but it does mean that the domain will be verified on AWS soon. To check if the domain is verified on AWS, use the CheckDomainVerificationStatus action.                                                                                              |
| [GetDomainDnsSettings](/actions/getDomainDnsSettings.js)                                     | The action gets the DNS settings from AWS SES for further domain verification.                                                                                                                                                                                                                                                                                                                                                                                   |
| [Verify domain](/actions/verifyDomain.js)                                                    | The action adds the domain to AWS SES for further verification. After the domain is added to AWS SES, the DNS records are provided. The DNS records must be added to the DNS configuration of the domain to finish the domain verification process. Only after the domain is verified it can be used to send emails with a custom MAIL FROM address. If the domain verification is failed, you can restart the verification process by running the action again. |

## Repository structure

The entry point for this connector is the `./index.js` file.
It contains the connector definition and references to all the actions.

The `./actions/` folder contains all the actions this connector defines.
Every action is represented by a separate file with the action definition and implementation.

The `./dist/connector.js` file is the compiled version of the connector with all the dependencies.
Connery Runner uses this file to run the connector.

## Connery

This repository is a [Connery](https://connery.io) connector.

Connery is an open-source connector ecosystem for AI and No-Code.

Learn more about Connery:

- [Documentation](https://docs.connery.io)
- [Source code](https://github.com/connery-io/connery)
- [A quick guide on how to start using this connector with Connery](https://docs.connery.io/docs/quick-start)

## Support

If you have any questions or need help with this connector, please create an issue in this repository.
