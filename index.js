var verifyAmazonSesDomain = require('./actions/verifyAmazonSesDomain');

module.exports = {
    label: 'Amazon SES',
    description: 'Manage Amazon SES resources',
    actions: [
        verifyAmazonSesDomain
    ]
};