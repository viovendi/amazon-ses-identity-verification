# Amazon SES Identity Verification

The plugin is focused on domain verification in Amazon SES and has all the actions needed for this.

## Available actions

| Action                                                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Verify domain](/src/actions/verifyDomain.ts)                                                             | The action adds the domain to AWS SES for the futrther verification. After the domain is added to AWS SES, the DNS records are provided. The DNS records must be added to the DNS configuration of the domain to finish the domain verification process. Only after the domain is verified, it can be used to send emails with custom MAIL FROM address. If the domain verification is failed, you can restart the verification process by running the action again. |
| [Get domain DNS settings](/src/actions/getDomainDnsSettings.ts)                                           | The action gets the DNS settings from AWS SES for the further domain verification.                                                                                                                                                                                                                                                                                                                                                                                   |
| [Check if DNS for domain is properly configured](/src/actions/checkIfDnsForDomainIsProperlyConfigured.ts) | The action checks if the DNS records for the domain are properly configured on the DNS server responsible for the domain. Properly configured DNS recodrs does not mean that the domain is verified on AWS, but it does mean that the domain will be verified on AWS soon. To check if the domain is verified on AWS, use the CheckDomainVerificationStatus action.                                                                                                  |
| [Check domain verification status](/src/actions/checkDomainVerificationStatus.ts)                         | The action returns the verification status of the domain. Available statuses: "Pending", "Success", "Failed", "TemporaryFailure", "NotStarted", "NotFound". If the status "NotFound", then the domain does not exist in the AWS SES.                                                                                                                                                                                                                                 |

## Repository structure

The entry point for this plugin is the [./src/index.ts](/src/index.ts) file.
It contains the plugin definition and references to all the actions.

The [./src/actions/](/src/actions/) folder contains all the actions this plugin defines.
Every action is represented by a separate file with the action definition and implementation.

The [./dist/plugin.js](/dist/plugin.js) file is the bundled version of the plugin with all the dependencies.
Connery Platform uses this file to run the plugin.

## Connery

This repository is a plugin for [Connery](https://connery.io).

Connery is an open-source plugin ecosystem for AI and No-Code.

Learn more about Connery:

- [Documentation](https://docs.connery.io)
- [Source code](https://github.com/connery-io/connery-platform)
- [How to start using this plugin with Connery?](https://docs.connery.io/docs/platform/quick-start/)

## Support

If you have any questions or need help with this plugin, please create an issue in this repository.
