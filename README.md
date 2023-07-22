# Connery connector for Amazon SES identity verification

## Actions

See the list of available actions in the [connector definition file](index.js).

## Installation

To install the connector on your Connery runner, add it to the runner configuration file and specify all the required configuration parameters.

In the example below, all the values for the configuration parameters are pulled from the environment variables of the Connery runner.

```
...
InstalledConnectors: [
    ...
    {
        RepoOwner: 'connery-io',
        RepoName: 'amazon-ses-identity-verification',
        RepoBranch: 'main',
        ConfigurationParameters: {
            AwsRegion: process.env.SES_AWS_REGION,
            AwsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
            AwsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            NotificationSnsTopic: process.env.NOTIFICATION_SNS_TOPIC,
        },
    },
    ...
],
...
```

See all the required configuration parameters in the [connector definition file](index.js).
