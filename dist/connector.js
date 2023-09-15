/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 976:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
    SES
} = __webpack_require__(368);

module.exports = {
    key: 'CheckDomainVerificationStatus',
    title: 'Check domain verification status',
    description: `
        The action returns the verification status of the domain. 
        Available statuses: "Pending", "Success", "Failed", "TemporaryFailure", "NotStarted", "NotFound".
        If the status "NotFound", then the domain does not exist in the AWS SES.`,
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

/***/ }),

/***/ 913:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
    SES
} = __webpack_require__(368);
const dnsPacket = __webpack_require__(568);
const dgram = __webpack_require__(891);

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

    const ses = new SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const result = await ses.getIdentityDkimAttributes({
        Identities: [inputParameters.DomainName]
    });

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

/***/ }),

/***/ 421:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
    SES
} = __webpack_require__(368);

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

    const ses = new SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    const result = await ses.verifyDomainDkim({
        Domain: inputParameters.DomainName
    });

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

/***/ }),

/***/ 68:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
    SES
} = __webpack_require__(368);

module.exports = {
    key: 'VerifyDomain',
    title: 'Verify domain',
    description: `
        The action adds the domain to AWS SES for the futrther verification.
        After the domain is added to AWS SES, the DNS records are provided.
        The DNS records must be added to the DNS configuration of the domain to finish the domain verification process.
        Only after the domain is verified, it can be used to send emails with custom MAIL FROM address.
        If the domain verification is failed, you can restart the verification process by running the action again.`,
    type: 'create',
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

    const ses = new SES({
        region: configurationParameters.AwsRegion,
        accessKeyId: configurationParameters.AwsAccessKeyId,
        secretAccessKey: configurationParameters.AwsSecretAccessKey
    });

    await ses.verifyDomainIdentity({
        Domain: inputParameters.DomainName
    });

    await ses.setIdentityFeedbackForwardingEnabled({
        Identity: inputParameters.DomainName,
        ForwardingEnabled: true
    });

    await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Bounce',
        SnsTopic: configurationParameters.NotificationSnsTopic
    });

    await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Complaint',
        SnsTopic: configurationParameters.NotificationSnsTopic
    });

    await ses.setIdentityNotificationTopic({
        Identity: inputParameters.DomainName,
        NotificationType: 'Delivery',
        SnsTopic: configurationParameters.NotificationSnsTopic
    });

    await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Bounce',
        Enabled: true
    });

    await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Complaint',
        Enabled: true
    });

    await ses.setIdentityHeadersInNotificationsEnabled({
        Identity: inputParameters.DomainName,
        NotificationType: 'Delivery',
        Enabled: true
    });

    const result = await ses.verifyDomainDkim({
        Domain: inputParameters.DomainName
    });

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

/***/ }),

/***/ 10:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const verifyDomain = __webpack_require__(68);
const checkDomainVerificationStatus = __webpack_require__(976);
const getDomainDnsSettings = __webpack_require__(421);
const checkIfDnsIsProperlyConfigured = __webpack_require__(913);

module.exports = {
    title: 'Amazon SES Identity Verification',
    actions: [
        verifyDomain,
        checkDomainVerificationStatus,
        getDomainDnsSettings,
        checkIfDnsIsProperlyConfigured
    ],
    configurationParameters: [
        {
            key: 'AwsRegion',
            title: 'AWS Region',
            description: 'The AWS region where the domain will be verified.',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'NotificationSnsTopic',
            title: 'Notification SNS Topic',
            description: 'The SNS topic ARN to which the identity notification will be sent',
            type: 'string',
            validation: {
                required: true
            }
        },
        {
            key: 'AwsAccessKeyId',
            title: 'AWS Access Key ID',
            description: 'The AWS access key ID with permissions to verify the domain. If not provided, the IAM role attached to the runner will be used.',
            type: 'string'
        },
        {
            key: 'AwsSecretAccessKey',
            title: 'AWS Secret Access Key',
            description: 'The AWS secret access key with permissions to verify the domain. If not provided, the IAM role attached to the runner will be used.',
            type: 'string',
        }
    ],
    maintainers: [
        {
            name: 'doo',
            email: 'support@doo.net'
        }
    ],
    connery: {
        runnerVersion: '0'
    }
};


/***/ }),

/***/ 446:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AwsCrc32 = void 0;
var tslib_1 = __webpack_require__(717);
var util_1 = __webpack_require__(658);
var index_1 = __webpack_require__(79);
var AwsCrc32 = /** @class */ (function () {
    function AwsCrc32() {
        this.crc32 = new index_1.Crc32();
    }
    AwsCrc32.prototype.update = function (toHash) {
        if ((0, util_1.isEmptyData)(toHash))
            return;
        this.crc32.update((0, util_1.convertToBuffer)(toHash));
    };
    AwsCrc32.prototype.digest = function () {
        return tslib_1.__awaiter(this, void 0, void 0, function () {
            return tslib_1.__generator(this, function (_a) {
                return [2 /*return*/, (0, util_1.numToUint8)(this.crc32.digest())];
            });
        });
    };
    AwsCrc32.prototype.reset = function () {
        this.crc32 = new index_1.Crc32();
    };
    return AwsCrc32;
}());
exports.AwsCrc32 = AwsCrc32;
//# sourceMappingURL=aws_crc32.js.map

/***/ }),

/***/ 79:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AwsCrc32 = exports.Crc32 = exports.crc32 = void 0;
var tslib_1 = __webpack_require__(717);
var util_1 = __webpack_require__(658);
function crc32(data) {
    return new Crc32().update(data).digest();
}
exports.crc32 = crc32;
var Crc32 = /** @class */ (function () {
    function Crc32() {
        this.checksum = 0xffffffff;
    }
    Crc32.prototype.update = function (data) {
        var e_1, _a;
        try {
            for (var data_1 = tslib_1.__values(data), data_1_1 = data_1.next(); !data_1_1.done; data_1_1 = data_1.next()) {
                var byte = data_1_1.value;
                this.checksum =
                    (this.checksum >>> 8) ^ lookupTable[(this.checksum ^ byte) & 0xff];
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (data_1_1 && !data_1_1.done && (_a = data_1.return)) _a.call(data_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return this;
    };
    Crc32.prototype.digest = function () {
        return (this.checksum ^ 0xffffffff) >>> 0;
    };
    return Crc32;
}());
exports.Crc32 = Crc32;
// prettier-ignore
var a_lookUpTable = [
    0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA,
    0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3,
    0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988,
    0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91,
    0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE,
    0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
    0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC,
    0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5,
    0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172,
    0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B,
    0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940,
    0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59,
    0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116,
    0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
    0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924,
    0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D,
    0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A,
    0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
    0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818,
    0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01,
    0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E,
    0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457,
    0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C,
    0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65,
    0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2,
    0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB,
    0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0,
    0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9,
    0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086,
    0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F,
    0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4,
    0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD,
    0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A,
    0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683,
    0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8,
    0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1,
    0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE,
    0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7,
    0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC,
    0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5,
    0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252,
    0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
    0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60,
    0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79,
    0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236,
    0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F,
    0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04,
    0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D,
    0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A,
    0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713,
    0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38,
    0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21,
    0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E,
    0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777,
    0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C,
    0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45,
    0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2,
    0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB,
    0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0,
    0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9,
    0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6,
    0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF,
    0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94,
    0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D,
];
var lookupTable = (0, util_1.uint32ArrayFrom)(a_lookUpTable);
var aws_crc32_1 = __webpack_require__(446);
Object.defineProperty(exports, "AwsCrc32", ({ enumerable: true, get: function () { return aws_crc32_1.AwsCrc32; } }));
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 717:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   __assign: () => (/* binding */ __assign),
/* harmony export */   __asyncDelegator: () => (/* binding */ __asyncDelegator),
/* harmony export */   __asyncGenerator: () => (/* binding */ __asyncGenerator),
/* harmony export */   __asyncValues: () => (/* binding */ __asyncValues),
/* harmony export */   __await: () => (/* binding */ __await),
/* harmony export */   __awaiter: () => (/* binding */ __awaiter),
/* harmony export */   __classPrivateFieldGet: () => (/* binding */ __classPrivateFieldGet),
/* harmony export */   __classPrivateFieldSet: () => (/* binding */ __classPrivateFieldSet),
/* harmony export */   __createBinding: () => (/* binding */ __createBinding),
/* harmony export */   __decorate: () => (/* binding */ __decorate),
/* harmony export */   __exportStar: () => (/* binding */ __exportStar),
/* harmony export */   __extends: () => (/* binding */ __extends),
/* harmony export */   __generator: () => (/* binding */ __generator),
/* harmony export */   __importDefault: () => (/* binding */ __importDefault),
/* harmony export */   __importStar: () => (/* binding */ __importStar),
/* harmony export */   __makeTemplateObject: () => (/* binding */ __makeTemplateObject),
/* harmony export */   __metadata: () => (/* binding */ __metadata),
/* harmony export */   __param: () => (/* binding */ __param),
/* harmony export */   __read: () => (/* binding */ __read),
/* harmony export */   __rest: () => (/* binding */ __rest),
/* harmony export */   __spread: () => (/* binding */ __spread),
/* harmony export */   __spreadArrays: () => (/* binding */ __spreadArrays),
/* harmony export */   __values: () => (/* binding */ __values)
/* harmony export */ });
/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    }
    return __assign.apply(this, arguments);
}

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read(arguments[i]));
    return ar;
}

function __spreadArrays() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};

function __await(v) {
    return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};

function __importStar(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}


/***/ }),

/***/ 106:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.convertToBuffer = void 0;
var util_utf8_browser_1 = __webpack_require__(84);
// Quick polyfill
var fromUtf8 = typeof Buffer !== "undefined" && Buffer.from
    ? function (input) { return Buffer.from(input, "utf8"); }
    : util_utf8_browser_1.fromUtf8;
function convertToBuffer(data) {
    // Already a Uint8, do nothing
    if (data instanceof Uint8Array)
        return data;
    if (typeof data === "string") {
        return fromUtf8(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    }
    return new Uint8Array(data);
}
exports.convertToBuffer = convertToBuffer;
//# sourceMappingURL=convertToBuffer.js.map

/***/ }),

/***/ 658:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.uint32ArrayFrom = exports.numToUint8 = exports.isEmptyData = exports.convertToBuffer = void 0;
var convertToBuffer_1 = __webpack_require__(106);
Object.defineProperty(exports, "convertToBuffer", ({ enumerable: true, get: function () { return convertToBuffer_1.convertToBuffer; } }));
var isEmptyData_1 = __webpack_require__(304);
Object.defineProperty(exports, "isEmptyData", ({ enumerable: true, get: function () { return isEmptyData_1.isEmptyData; } }));
var numToUint8_1 = __webpack_require__(174);
Object.defineProperty(exports, "numToUint8", ({ enumerable: true, get: function () { return numToUint8_1.numToUint8; } }));
var uint32ArrayFrom_1 = __webpack_require__(558);
Object.defineProperty(exports, "uint32ArrayFrom", ({ enumerable: true, get: function () { return uint32ArrayFrom_1.uint32ArrayFrom; } }));
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 304:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isEmptyData = void 0;
function isEmptyData(data) {
    if (typeof data === "string") {
        return data.length === 0;
    }
    return data.byteLength === 0;
}
exports.isEmptyData = isEmptyData;
//# sourceMappingURL=isEmptyData.js.map

/***/ }),

/***/ 174:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.numToUint8 = void 0;
function numToUint8(num) {
    return new Uint8Array([
        (num & 0xff000000) >> 24,
        (num & 0x00ff0000) >> 16,
        (num & 0x0000ff00) >> 8,
        num & 0x000000ff,
    ]);
}
exports.numToUint8 = numToUint8;
//# sourceMappingURL=numToUint8.js.map

/***/ }),

/***/ 558:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.uint32ArrayFrom = void 0;
// IE 11 does not support Array.from, so we do it manually
function uint32ArrayFrom(a_lookUpTable) {
    if (!Uint32Array.from) {
        var return_array = new Uint32Array(a_lookUpTable.length);
        var a_index = 0;
        while (a_index < a_lookUpTable.length) {
            return_array[a_index] = a_lookUpTable[a_index];
            a_index += 1;
        }
        return return_array;
    }
    return Uint32Array.from(a_lookUpTable);
}
exports.uint32ArrayFrom = uint32ArrayFrom;
//# sourceMappingURL=uint32ArrayFrom.js.map

/***/ }),

/***/ 368:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  $Command: () => (/* reexport */ Command),
  AccountSendingPausedException: () => (/* reexport */ AccountSendingPausedException),
  AlreadyExistsException: () => (/* reexport */ AlreadyExistsException),
  BehaviorOnMXFailure: () => (/* reexport */ BehaviorOnMXFailure),
  BounceType: () => (/* reexport */ BounceType),
  BulkEmailStatus: () => (/* reexport */ BulkEmailStatus),
  CannotDeleteException: () => (/* reexport */ CannotDeleteException),
  CloneReceiptRuleSetCommand: () => (/* reexport */ CloneReceiptRuleSetCommand),
  ConfigurationSetAlreadyExistsException: () => (/* reexport */ ConfigurationSetAlreadyExistsException),
  ConfigurationSetAttribute: () => (/* reexport */ ConfigurationSetAttribute),
  ConfigurationSetDoesNotExistException: () => (/* reexport */ ConfigurationSetDoesNotExistException),
  ConfigurationSetSendingPausedException: () => (/* reexport */ ConfigurationSetSendingPausedException),
  CreateConfigurationSetCommand: () => (/* reexport */ CreateConfigurationSetCommand),
  CreateConfigurationSetEventDestinationCommand: () => (/* reexport */ CreateConfigurationSetEventDestinationCommand),
  CreateConfigurationSetTrackingOptionsCommand: () => (/* reexport */ CreateConfigurationSetTrackingOptionsCommand),
  CreateCustomVerificationEmailTemplateCommand: () => (/* reexport */ CreateCustomVerificationEmailTemplateCommand),
  CreateReceiptFilterCommand: () => (/* reexport */ CreateReceiptFilterCommand),
  CreateReceiptRuleCommand: () => (/* reexport */ CreateReceiptRuleCommand),
  CreateReceiptRuleSetCommand: () => (/* reexport */ CreateReceiptRuleSetCommand),
  CreateTemplateCommand: () => (/* reexport */ CreateTemplateCommand),
  CustomMailFromStatus: () => (/* reexport */ CustomMailFromStatus),
  CustomVerificationEmailInvalidContentException: () => (/* reexport */ CustomVerificationEmailInvalidContentException),
  CustomVerificationEmailTemplateAlreadyExistsException: () => (/* reexport */ CustomVerificationEmailTemplateAlreadyExistsException),
  CustomVerificationEmailTemplateDoesNotExistException: () => (/* reexport */ CustomVerificationEmailTemplateDoesNotExistException),
  DeleteConfigurationSetCommand: () => (/* reexport */ DeleteConfigurationSetCommand),
  DeleteConfigurationSetEventDestinationCommand: () => (/* reexport */ DeleteConfigurationSetEventDestinationCommand),
  DeleteConfigurationSetTrackingOptionsCommand: () => (/* reexport */ DeleteConfigurationSetTrackingOptionsCommand),
  DeleteCustomVerificationEmailTemplateCommand: () => (/* reexport */ DeleteCustomVerificationEmailTemplateCommand),
  DeleteIdentityCommand: () => (/* reexport */ DeleteIdentityCommand),
  DeleteIdentityPolicyCommand: () => (/* reexport */ DeleteIdentityPolicyCommand),
  DeleteReceiptFilterCommand: () => (/* reexport */ DeleteReceiptFilterCommand),
  DeleteReceiptRuleCommand: () => (/* reexport */ DeleteReceiptRuleCommand),
  DeleteReceiptRuleSetCommand: () => (/* reexport */ DeleteReceiptRuleSetCommand),
  DeleteTemplateCommand: () => (/* reexport */ DeleteTemplateCommand),
  DeleteVerifiedEmailAddressCommand: () => (/* reexport */ DeleteVerifiedEmailAddressCommand),
  DescribeActiveReceiptRuleSetCommand: () => (/* reexport */ DescribeActiveReceiptRuleSetCommand),
  DescribeConfigurationSetCommand: () => (/* reexport */ DescribeConfigurationSetCommand),
  DescribeReceiptRuleCommand: () => (/* reexport */ DescribeReceiptRuleCommand),
  DescribeReceiptRuleSetCommand: () => (/* reexport */ DescribeReceiptRuleSetCommand),
  DimensionValueSource: () => (/* reexport */ DimensionValueSource),
  DsnAction: () => (/* reexport */ DsnAction),
  EventDestinationAlreadyExistsException: () => (/* reexport */ EventDestinationAlreadyExistsException),
  EventDestinationDoesNotExistException: () => (/* reexport */ EventDestinationDoesNotExistException),
  EventType: () => (/* reexport */ EventType),
  FromEmailAddressNotVerifiedException: () => (/* reexport */ FromEmailAddressNotVerifiedException),
  GetAccountSendingEnabledCommand: () => (/* reexport */ GetAccountSendingEnabledCommand),
  GetCustomVerificationEmailTemplateCommand: () => (/* reexport */ GetCustomVerificationEmailTemplateCommand),
  GetIdentityDkimAttributesCommand: () => (/* reexport */ GetIdentityDkimAttributesCommand),
  GetIdentityMailFromDomainAttributesCommand: () => (/* reexport */ GetIdentityMailFromDomainAttributesCommand),
  GetIdentityNotificationAttributesCommand: () => (/* reexport */ GetIdentityNotificationAttributesCommand),
  GetIdentityPoliciesCommand: () => (/* reexport */ GetIdentityPoliciesCommand),
  GetIdentityVerificationAttributesCommand: () => (/* reexport */ GetIdentityVerificationAttributesCommand),
  GetSendQuotaCommand: () => (/* reexport */ GetSendQuotaCommand),
  GetSendStatisticsCommand: () => (/* reexport */ GetSendStatisticsCommand),
  GetTemplateCommand: () => (/* reexport */ GetTemplateCommand),
  IdentityType: () => (/* reexport */ IdentityType),
  InvalidCloudWatchDestinationException: () => (/* reexport */ InvalidCloudWatchDestinationException),
  InvalidConfigurationSetException: () => (/* reexport */ InvalidConfigurationSetException),
  InvalidDeliveryOptionsException: () => (/* reexport */ InvalidDeliveryOptionsException),
  InvalidFirehoseDestinationException: () => (/* reexport */ InvalidFirehoseDestinationException),
  InvalidLambdaFunctionException: () => (/* reexport */ InvalidLambdaFunctionException),
  InvalidPolicyException: () => (/* reexport */ InvalidPolicyException),
  InvalidRenderingParameterException: () => (/* reexport */ InvalidRenderingParameterException),
  InvalidS3ConfigurationException: () => (/* reexport */ InvalidS3ConfigurationException),
  InvalidSNSDestinationException: () => (/* reexport */ InvalidSNSDestinationException),
  InvalidSnsTopicException: () => (/* reexport */ InvalidSnsTopicException),
  InvalidTemplateException: () => (/* reexport */ InvalidTemplateException),
  InvalidTrackingOptionsException: () => (/* reexport */ InvalidTrackingOptionsException),
  InvocationType: () => (/* reexport */ InvocationType),
  LimitExceededException: () => (/* reexport */ LimitExceededException),
  ListConfigurationSetsCommand: () => (/* reexport */ ListConfigurationSetsCommand),
  ListCustomVerificationEmailTemplatesCommand: () => (/* reexport */ ListCustomVerificationEmailTemplatesCommand),
  ListIdentitiesCommand: () => (/* reexport */ ListIdentitiesCommand),
  ListIdentityPoliciesCommand: () => (/* reexport */ ListIdentityPoliciesCommand),
  ListReceiptFiltersCommand: () => (/* reexport */ ListReceiptFiltersCommand),
  ListReceiptRuleSetsCommand: () => (/* reexport */ ListReceiptRuleSetsCommand),
  ListTemplatesCommand: () => (/* reexport */ ListTemplatesCommand),
  ListVerifiedEmailAddressesCommand: () => (/* reexport */ ListVerifiedEmailAddressesCommand),
  MailFromDomainNotVerifiedException: () => (/* reexport */ MailFromDomainNotVerifiedException),
  MessageRejected: () => (/* reexport */ MessageRejected),
  MissingRenderingAttributeException: () => (/* reexport */ MissingRenderingAttributeException),
  NotificationType: () => (/* reexport */ NotificationType),
  ProductionAccessNotGrantedException: () => (/* reexport */ ProductionAccessNotGrantedException),
  PutConfigurationSetDeliveryOptionsCommand: () => (/* reexport */ PutConfigurationSetDeliveryOptionsCommand),
  PutIdentityPolicyCommand: () => (/* reexport */ PutIdentityPolicyCommand),
  ReceiptFilterPolicy: () => (/* reexport */ ReceiptFilterPolicy),
  ReorderReceiptRuleSetCommand: () => (/* reexport */ ReorderReceiptRuleSetCommand),
  RuleDoesNotExistException: () => (/* reexport */ RuleDoesNotExistException),
  RuleSetDoesNotExistException: () => (/* reexport */ RuleSetDoesNotExistException),
  SES: () => (/* reexport */ SES),
  SESClient: () => (/* reexport */ SESClient),
  SESServiceException: () => (/* reexport */ SESServiceException),
  SNSActionEncoding: () => (/* reexport */ SNSActionEncoding),
  SendBounceCommand: () => (/* reexport */ SendBounceCommand),
  SendBulkTemplatedEmailCommand: () => (/* reexport */ SendBulkTemplatedEmailCommand),
  SendCustomVerificationEmailCommand: () => (/* reexport */ SendCustomVerificationEmailCommand),
  SendEmailCommand: () => (/* reexport */ SendEmailCommand),
  SendRawEmailCommand: () => (/* reexport */ SendRawEmailCommand),
  SendTemplatedEmailCommand: () => (/* reexport */ SendTemplatedEmailCommand),
  SetActiveReceiptRuleSetCommand: () => (/* reexport */ SetActiveReceiptRuleSetCommand),
  SetIdentityDkimEnabledCommand: () => (/* reexport */ SetIdentityDkimEnabledCommand),
  SetIdentityFeedbackForwardingEnabledCommand: () => (/* reexport */ SetIdentityFeedbackForwardingEnabledCommand),
  SetIdentityHeadersInNotificationsEnabledCommand: () => (/* reexport */ SetIdentityHeadersInNotificationsEnabledCommand),
  SetIdentityMailFromDomainCommand: () => (/* reexport */ SetIdentityMailFromDomainCommand),
  SetIdentityNotificationTopicCommand: () => (/* reexport */ SetIdentityNotificationTopicCommand),
  SetReceiptRulePositionCommand: () => (/* reexport */ SetReceiptRulePositionCommand),
  StopScope: () => (/* reexport */ StopScope),
  TemplateDoesNotExistException: () => (/* reexport */ TemplateDoesNotExistException),
  TestRenderTemplateCommand: () => (/* reexport */ TestRenderTemplateCommand),
  TlsPolicy: () => (/* reexport */ TlsPolicy),
  TrackingOptionsAlreadyExistsException: () => (/* reexport */ TrackingOptionsAlreadyExistsException),
  TrackingOptionsDoesNotExistException: () => (/* reexport */ TrackingOptionsDoesNotExistException),
  UpdateAccountSendingEnabledCommand: () => (/* reexport */ UpdateAccountSendingEnabledCommand),
  UpdateConfigurationSetEventDestinationCommand: () => (/* reexport */ UpdateConfigurationSetEventDestinationCommand),
  UpdateConfigurationSetReputationMetricsEnabledCommand: () => (/* reexport */ UpdateConfigurationSetReputationMetricsEnabledCommand),
  UpdateConfigurationSetSendingEnabledCommand: () => (/* reexport */ UpdateConfigurationSetSendingEnabledCommand),
  UpdateConfigurationSetTrackingOptionsCommand: () => (/* reexport */ UpdateConfigurationSetTrackingOptionsCommand),
  UpdateCustomVerificationEmailTemplateCommand: () => (/* reexport */ UpdateCustomVerificationEmailTemplateCommand),
  UpdateReceiptRuleCommand: () => (/* reexport */ UpdateReceiptRuleCommand),
  UpdateTemplateCommand: () => (/* reexport */ UpdateTemplateCommand),
  VerificationStatus: () => (/* reexport */ VerificationStatus),
  VerifyDomainDkimCommand: () => (/* reexport */ VerifyDomainDkimCommand),
  VerifyDomainIdentityCommand: () => (/* reexport */ VerifyDomainIdentityCommand),
  VerifyEmailAddressCommand: () => (/* reexport */ VerifyEmailAddressCommand),
  VerifyEmailIdentityCommand: () => (/* reexport */ VerifyEmailIdentityCommand),
  __Client: () => (/* reexport */ Client),
  paginateListCustomVerificationEmailTemplates: () => (/* reexport */ paginateListCustomVerificationEmailTemplates),
  paginateListIdentities: () => (/* reexport */ paginateListIdentities),
  waitForIdentityExists: () => (/* reexport */ waitForIdentityExists),
  waitUntilIdentityExists: () => (/* reexport */ waitUntilIdentityExists)
});

// NAMESPACE OBJECT: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/index.js
var aws_namespaceObject = {};
__webpack_require__.r(aws_namespaceObject);
__webpack_require__.d(aws_namespaceObject, {
  getUserAgentPrefix: () => (getUserAgentPrefix),
  isVirtualHostableS3Bucket: () => (isVirtualHostableS3Bucket),
  parseArn: () => (parseArn),
  partition: () => (partition),
  setPartitionInfo: () => (setPartitionInfo),
  useDefaultPartitionInfo: () => (useDefaultPartitionInfo)
});

// NAMESPACE OBJECT: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/index.js
var lib_namespaceObject = {};
__webpack_require__.r(lib_namespaceObject);
__webpack_require__.d(lib_namespaceObject, {
  aws: () => (aws_namespaceObject),
  booleanEquals: () => (booleanEquals),
  getAttr: () => (getAttr),
  isSet: () => (isSet),
  isValidHostLabel: () => (isValidHostLabel),
  not: () => (not),
  parseURL: () => (parseURL),
  stringEquals: () => (stringEquals),
  substring: () => (substring),
  uriEncode: () => (uriEncode)
});

;// CONCATENATED MODULE: ./node_modules/@smithy/protocol-http/dist-es/extensions/httpExtensionConfiguration.js
const getHttpHandlerExtensionConfiguration = (runtimeConfig) => {
    let httpHandler = runtimeConfig.httpHandler;
    return {
        setHttpHandler(handler) {
            httpHandler = handler;
        },
        httpHandler() {
            return httpHandler;
        },
        updateHttpClientConfig(key, value) {
            httpHandler.updateHttpClientConfig(key, value);
        },
        httpHandlerConfigs() {
            return httpHandler.httpHandlerConfigs();
        },
    };
};
const resolveHttpHandlerRuntimeConfig = (httpHandlerExtensionConfiguration) => {
    return {
        httpHandler: httpHandlerExtensionConfiguration.httpHandler(),
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/protocol-http/dist-es/extensions/index.js


;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/auth.js
var HttpAuthLocation;
(function (HttpAuthLocation) {
    HttpAuthLocation["HEADER"] = "header";
    HttpAuthLocation["QUERY"] = "query";
})(HttpAuthLocation || (HttpAuthLocation = {}));

;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/endpoint.js
var EndpointURLScheme;
(function (EndpointURLScheme) {
    EndpointURLScheme["HTTP"] = "http";
    EndpointURLScheme["HTTPS"] = "https";
})(EndpointURLScheme || (EndpointURLScheme = {}));

;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/extensions/checksum.js
var AlgorithmId;
(function (AlgorithmId) {
    AlgorithmId["MD5"] = "md5";
    AlgorithmId["CRC32"] = "crc32";
    AlgorithmId["CRC32C"] = "crc32c";
    AlgorithmId["SHA1"] = "sha1";
    AlgorithmId["SHA256"] = "sha256";
})(AlgorithmId || (AlgorithmId = {}));
const checksum_getChecksumConfiguration = (runtimeConfig) => {
    const checksumAlgorithms = [];
    if (runtimeConfig.sha256 !== undefined) {
        checksumAlgorithms.push({
            algorithmId: () => AlgorithmId.SHA256,
            checksumConstructor: () => runtimeConfig.sha256,
        });
    }
    if (runtimeConfig.md5 != undefined) {
        checksumAlgorithms.push({
            algorithmId: () => AlgorithmId.MD5,
            checksumConstructor: () => runtimeConfig.md5,
        });
    }
    return {
        _checksumAlgorithms: checksumAlgorithms,
        addChecksumAlgorithm(algo) {
            this._checksumAlgorithms.push(algo);
        },
        checksumAlgorithms() {
            return this._checksumAlgorithms;
        },
    };
};
const checksum_resolveChecksumRuntimeConfig = (clientConfig) => {
    const runtimeConfig = {};
    clientConfig.checksumAlgorithms().forEach((checksumAlgorithm) => {
        runtimeConfig[checksumAlgorithm.algorithmId()] = checksumAlgorithm.checksumConstructor();
    });
    return runtimeConfig;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/extensions/defaultClientConfiguration.js

const getDefaultClientConfiguration = (runtimeConfig) => {
    return {
        ...getChecksumConfiguration(runtimeConfig),
    };
};
const resolveDefaultRuntimeConfig = (config) => {
    return {
        ...resolveChecksumRuntimeConfig(config),
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/extensions/index.js




;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/http.js
var http_FieldPosition;
(function (FieldPosition) {
    FieldPosition[FieldPosition["HEADER"] = 0] = "HEADER";
    FieldPosition[FieldPosition["TRAILER"] = 1] = "TRAILER";
})(http_FieldPosition || (http_FieldPosition = {}));

;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/transfer.js
var RequestHandlerProtocol;
(function (RequestHandlerProtocol) {
    RequestHandlerProtocol["HTTP_0_9"] = "http/0.9";
    RequestHandlerProtocol["HTTP_1_0"] = "http/1.0";
    RequestHandlerProtocol["TDS_8_0"] = "tds/8.0";
})(RequestHandlerProtocol || (RequestHandlerProtocol = {}));

;// CONCATENATED MODULE: ./node_modules/@smithy/types/dist-es/index.js



































;// CONCATENATED MODULE: ./node_modules/@smithy/protocol-http/dist-es/Field.js

class Field {
    constructor({ name, kind = FieldPosition.HEADER, values = [] }) {
        this.name = name;
        this.kind = kind;
        this.values = values;
    }
    add(value) {
        this.values.push(value);
    }
    set(values) {
        this.values = values;
    }
    remove(value) {
        this.values = this.values.filter((v) => v !== value);
    }
    toString() {
        return this.values.map((v) => (v.includes(",") || v.includes(" ") ? `"${v}"` : v)).join(", ");
    }
    get() {
        return this.values;
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/protocol-http/dist-es/httpRequest.js
class httpRequest_HttpRequest {
    constructor(options) {
        this.method = options.method || "GET";
        this.hostname = options.hostname || "localhost";
        this.port = options.port;
        this.query = options.query || {};
        this.headers = options.headers || {};
        this.body = options.body;
        this.protocol = options.protocol
            ? options.protocol.slice(-1) !== ":"
                ? `${options.protocol}:`
                : options.protocol
            : "https:";
        this.path = options.path ? (options.path.charAt(0) !== "/" ? `/${options.path}` : options.path) : "/";
        this.username = options.username;
        this.password = options.password;
        this.fragment = options.fragment;
    }
    static isInstance(request) {
        if (!request)
            return false;
        const req = request;
        return ("method" in req &&
            "protocol" in req &&
            "hostname" in req &&
            "path" in req &&
            typeof req["query"] === "object" &&
            typeof req["headers"] === "object");
    }
    clone() {
        const cloned = new httpRequest_HttpRequest({
            ...this,
            headers: { ...this.headers },
        });
        if (cloned.query)
            cloned.query = cloneQuery(cloned.query);
        return cloned;
    }
}
function cloneQuery(query) {
    return Object.keys(query).reduce((carry, paramName) => {
        const param = query[paramName];
        return {
            ...carry,
            [paramName]: Array.isArray(param) ? [...param] : param,
        };
    }, {});
}

;// CONCATENATED MODULE: ./node_modules/@smithy/protocol-http/dist-es/httpResponse.js
class httpResponse_HttpResponse {
    constructor(options) {
        this.statusCode = options.statusCode;
        this.reason = options.reason;
        this.headers = options.headers || {};
        this.body = options.body;
    }
    static isInstance(response) {
        if (!response)
            return false;
        const resp = response;
        return typeof resp.statusCode === "number" && typeof resp.headers === "object";
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/protocol-http/dist-es/index.js









;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-host-header/dist-es/index.js

function resolveHostHeaderConfig(input) {
    return input;
}
const hostHeaderMiddleware = (options) => (next) => async (args) => {
    if (!httpRequest_HttpRequest.isInstance(args.request))
        return next(args);
    const { request } = args;
    const { handlerProtocol = "" } = options.requestHandler.metadata || {};
    if (handlerProtocol.indexOf("h2") >= 0 && !request.headers[":authority"]) {
        delete request.headers["host"];
        request.headers[":authority"] = "";
    }
    else if (!request.headers["host"]) {
        let host = request.hostname;
        if (request.port != null)
            host += `:${request.port}`;
        request.headers["host"] = host;
    }
    return next(args);
};
const hostHeaderMiddlewareOptions = {
    name: "hostHeaderMiddleware",
    step: "build",
    priority: "low",
    tags: ["HOST"],
    override: true,
};
const getHostHeaderPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(hostHeaderMiddleware(options), hostHeaderMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-logger/dist-es/loggerMiddleware.js
const loggerMiddleware = () => (next, context) => async (args) => {
    try {
        const response = await next(args);
        const { clientName, commandName, logger, dynamoDbDocumentClientOptions = {} } = context;
        const { overrideInputFilterSensitiveLog, overrideOutputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
        const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
        const outputFilterSensitiveLog = overrideOutputFilterSensitiveLog ?? context.outputFilterSensitiveLog;
        const { $metadata, ...outputWithoutMetadata } = response.output;
        logger?.info?.({
            clientName,
            commandName,
            input: inputFilterSensitiveLog(args.input),
            output: outputFilterSensitiveLog(outputWithoutMetadata),
            metadata: $metadata,
        });
        return response;
    }
    catch (error) {
        const { clientName, commandName, logger, dynamoDbDocumentClientOptions = {} } = context;
        const { overrideInputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
        const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
        logger?.error?.({
            clientName,
            commandName,
            input: inputFilterSensitiveLog(args.input),
            error,
            metadata: error.$metadata,
        });
        throw error;
    }
};
const loggerMiddlewareOptions = {
    name: "loggerMiddleware",
    tags: ["LOGGER"],
    step: "initialize",
    override: true,
};
const getLoggerPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(loggerMiddleware(), loggerMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-logger/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-recursion-detection/dist-es/index.js

const TRACE_ID_HEADER_NAME = "X-Amzn-Trace-Id";
const ENV_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";
const ENV_TRACE_ID = "_X_AMZN_TRACE_ID";
const recursionDetectionMiddleware = (options) => (next) => async (args) => {
    const { request } = args;
    if (!httpRequest_HttpRequest.isInstance(request) ||
        options.runtime !== "node" ||
        request.headers.hasOwnProperty(TRACE_ID_HEADER_NAME)) {
        return next(args);
    }
    const functionName = process.env[ENV_LAMBDA_FUNCTION_NAME];
    const traceId = process.env[ENV_TRACE_ID];
    const nonEmptyString = (str) => typeof str === "string" && str.length > 0;
    if (nonEmptyString(functionName) && nonEmptyString(traceId)) {
        request.headers[TRACE_ID_HEADER_NAME] = traceId;
    }
    return next({
        ...args,
        request,
    });
};
const addRecursionDetectionMiddlewareOptions = {
    step: "build",
    tags: ["RECURSION_DETECTION"],
    name: "recursionDetectionMiddleware",
    override: true,
    priority: "low",
};
const getRecursionDetectionPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(recursionDetectionMiddleware(options), addRecursionDetectionMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: ./node_modules/@smithy/property-provider/dist-es/memoize.js
const memoize = (provider, isExpired, requiresRefresh) => {
    let resolved;
    let pending;
    let hasResult;
    let isConstant = false;
    const coalesceProvider = async () => {
        if (!pending) {
            pending = provider();
        }
        try {
            resolved = await pending;
            hasResult = true;
            isConstant = false;
        }
        finally {
            pending = undefined;
        }
        return resolved;
    };
    if (isExpired === undefined) {
        return async (options) => {
            if (!hasResult || options?.forceRefresh) {
                resolved = await coalesceProvider();
            }
            return resolved;
        };
    }
    return async (options) => {
        if (!hasResult || options?.forceRefresh) {
            resolved = await coalesceProvider();
        }
        if (isConstant) {
            return resolved;
        }
        if (requiresRefresh && !requiresRefresh(resolved)) {
            isConstant = true;
            return resolved;
        }
        if (isExpired(resolved)) {
            await coalesceProvider();
            return resolved;
        }
        return resolved;
    };
};

// EXTERNAL MODULE: ./node_modules/@aws-crypto/crc32/build/index.js
var build = __webpack_require__(79);
;// CONCATENATED MODULE: ./node_modules/@smithy/util-hex-encoding/dist-es/index.js
const SHORT_TO_HEX = {};
const HEX_TO_SHORT = {};
for (let i = 0; i < 256; i++) {
    let encodedByte = i.toString(16).toLowerCase();
    if (encodedByte.length === 1) {
        encodedByte = `0${encodedByte}`;
    }
    SHORT_TO_HEX[i] = encodedByte;
    HEX_TO_SHORT[encodedByte] = i;
}
function fromHex(encoded) {
    if (encoded.length % 2 !== 0) {
        throw new Error("Hex encoded strings must have an even number length");
    }
    const out = new Uint8Array(encoded.length / 2);
    for (let i = 0; i < encoded.length; i += 2) {
        const encodedByte = encoded.slice(i, i + 2).toLowerCase();
        if (encodedByte in HEX_TO_SHORT) {
            out[i / 2] = HEX_TO_SHORT[encodedByte];
        }
        else {
            throw new Error(`Cannot decode unrecognized sequence ${encodedByte} as hexadecimal`);
        }
    }
    return out;
}
function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        out += SHORT_TO_HEX[bytes[i]];
    }
    return out;
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/Int64.js

class Int64 {
    constructor(bytes) {
        this.bytes = bytes;
        if (bytes.byteLength !== 8) {
            throw new Error("Int64 buffers must be exactly 8 bytes");
        }
    }
    static fromNumber(number) {
        if (number > 9223372036854776000 || number < -9223372036854776000) {
            throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
        }
        const bytes = new Uint8Array(8);
        for (let i = 7, remaining = Math.abs(Math.round(number)); i > -1 && remaining > 0; i--, remaining /= 256) {
            bytes[i] = remaining;
        }
        if (number < 0) {
            negate(bytes);
        }
        return new Int64(bytes);
    }
    valueOf() {
        const bytes = this.bytes.slice(0);
        const negative = bytes[0] & 0b10000000;
        if (negative) {
            negate(bytes);
        }
        return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
    }
    toString() {
        return String(this.valueOf());
    }
}
function negate(bytes) {
    for (let i = 0; i < 8; i++) {
        bytes[i] ^= 0xff;
    }
    for (let i = 7; i > -1; i--) {
        bytes[i]++;
        if (bytes[i] !== 0)
            break;
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/HeaderMarshaller.js


class HeaderMarshaller_HeaderMarshaller {
    constructor(toUtf8, fromUtf8) {
        this.toUtf8 = toUtf8;
        this.fromUtf8 = fromUtf8;
    }
    format(headers) {
        const chunks = [];
        for (const headerName of Object.keys(headers)) {
            const bytes = this.fromUtf8(headerName);
            chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
        }
        const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
        let position = 0;
        for (const chunk of chunks) {
            out.set(chunk, position);
            position += chunk.byteLength;
        }
        return out;
    }
    formatHeaderValue(header) {
        switch (header.type) {
            case "boolean":
                return Uint8Array.from([header.value ? 0 : 1]);
            case "byte":
                return Uint8Array.from([2, header.value]);
            case "short":
                const shortView = new DataView(new ArrayBuffer(3));
                shortView.setUint8(0, 3);
                shortView.setInt16(1, header.value, false);
                return new Uint8Array(shortView.buffer);
            case "integer":
                const intView = new DataView(new ArrayBuffer(5));
                intView.setUint8(0, 4);
                intView.setInt32(1, header.value, false);
                return new Uint8Array(intView.buffer);
            case "long":
                const longBytes = new Uint8Array(9);
                longBytes[0] = 5;
                longBytes.set(header.value.bytes, 1);
                return longBytes;
            case "binary":
                const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
                binView.setUint8(0, 6);
                binView.setUint16(1, header.value.byteLength, false);
                const binBytes = new Uint8Array(binView.buffer);
                binBytes.set(header.value, 3);
                return binBytes;
            case "string":
                const utf8Bytes = this.fromUtf8(header.value);
                const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
                strView.setUint8(0, 7);
                strView.setUint16(1, utf8Bytes.byteLength, false);
                const strBytes = new Uint8Array(strView.buffer);
                strBytes.set(utf8Bytes, 3);
                return strBytes;
            case "timestamp":
                const tsBytes = new Uint8Array(9);
                tsBytes[0] = 8;
                tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
                return tsBytes;
            case "uuid":
                if (!UUID_PATTERN.test(header.value)) {
                    throw new Error(`Invalid UUID received: ${header.value}`);
                }
                const uuidBytes = new Uint8Array(17);
                uuidBytes[0] = 9;
                uuidBytes.set(fromHex(header.value.replace(/\-/g, "")), 1);
                return uuidBytes;
        }
    }
    parse(headers) {
        const out = {};
        let position = 0;
        while (position < headers.byteLength) {
            const nameLength = headers.getUint8(position++);
            const name = this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, nameLength));
            position += nameLength;
            switch (headers.getUint8(position++)) {
                case 0:
                    out[name] = {
                        type: BOOLEAN_TAG,
                        value: true,
                    };
                    break;
                case 1:
                    out[name] = {
                        type: BOOLEAN_TAG,
                        value: false,
                    };
                    break;
                case 2:
                    out[name] = {
                        type: BYTE_TAG,
                        value: headers.getInt8(position++),
                    };
                    break;
                case 3:
                    out[name] = {
                        type: SHORT_TAG,
                        value: headers.getInt16(position, false),
                    };
                    position += 2;
                    break;
                case 4:
                    out[name] = {
                        type: INT_TAG,
                        value: headers.getInt32(position, false),
                    };
                    position += 4;
                    break;
                case 5:
                    out[name] = {
                        type: LONG_TAG,
                        value: new Int64(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)),
                    };
                    position += 8;
                    break;
                case 6:
                    const binaryLength = headers.getUint16(position, false);
                    position += 2;
                    out[name] = {
                        type: BINARY_TAG,
                        value: new Uint8Array(headers.buffer, headers.byteOffset + position, binaryLength),
                    };
                    position += binaryLength;
                    break;
                case 7:
                    const stringLength = headers.getUint16(position, false);
                    position += 2;
                    out[name] = {
                        type: STRING_TAG,
                        value: this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, stringLength)),
                    };
                    position += stringLength;
                    break;
                case 8:
                    out[name] = {
                        type: TIMESTAMP_TAG,
                        value: new Date(new Int64(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)).valueOf()),
                    };
                    position += 8;
                    break;
                case 9:
                    const uuidBytes = new Uint8Array(headers.buffer, headers.byteOffset + position, 16);
                    position += 16;
                    out[name] = {
                        type: UUID_TAG,
                        value: `${toHex(uuidBytes.subarray(0, 4))}-${toHex(uuidBytes.subarray(4, 6))}-${toHex(uuidBytes.subarray(6, 8))}-${toHex(uuidBytes.subarray(8, 10))}-${toHex(uuidBytes.subarray(10))}`,
                    };
                    break;
                default:
                    throw new Error(`Unrecognized header type tag`);
            }
        }
        return out;
    }
}
var HEADER_VALUE_TYPE;
(function (HEADER_VALUE_TYPE) {
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolTrue"] = 0] = "boolTrue";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolFalse"] = 1] = "boolFalse";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byte"] = 2] = "byte";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["short"] = 3] = "short";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["integer"] = 4] = "integer";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["long"] = 5] = "long";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byteArray"] = 6] = "byteArray";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["string"] = 7] = "string";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["timestamp"] = 8] = "timestamp";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
const BOOLEAN_TAG = "boolean";
const BYTE_TAG = "byte";
const SHORT_TAG = "short";
const INT_TAG = "integer";
const LONG_TAG = "long";
const BINARY_TAG = "binary";
const STRING_TAG = "string";
const TIMESTAMP_TAG = "timestamp";
const UUID_TAG = "uuid";
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/splitMessage.js

const PRELUDE_MEMBER_LENGTH = 4;
const PRELUDE_LENGTH = PRELUDE_MEMBER_LENGTH * 2;
const CHECKSUM_LENGTH = 4;
const MINIMUM_MESSAGE_LENGTH = PRELUDE_LENGTH + CHECKSUM_LENGTH * 2;
function splitMessage_splitMessage({ byteLength, byteOffset, buffer }) {
    if (byteLength < MINIMUM_MESSAGE_LENGTH) {
        throw new Error("Provided message too short to accommodate event stream message overhead");
    }
    const view = new DataView(buffer, byteOffset, byteLength);
    const messageLength = view.getUint32(0, false);
    if (byteLength !== messageLength) {
        throw new Error("Reported message length does not match received message length");
    }
    const headerLength = view.getUint32(PRELUDE_MEMBER_LENGTH, false);
    const expectedPreludeChecksum = view.getUint32(PRELUDE_LENGTH, false);
    const expectedMessageChecksum = view.getUint32(byteLength - CHECKSUM_LENGTH, false);
    const checksummer = new Crc32().update(new Uint8Array(buffer, byteOffset, PRELUDE_LENGTH));
    if (expectedPreludeChecksum !== checksummer.digest()) {
        throw new Error(`The prelude checksum specified in the message (${expectedPreludeChecksum}) does not match the calculated CRC32 checksum (${checksummer.digest()})`);
    }
    checksummer.update(new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH, byteLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH)));
    if (expectedMessageChecksum !== checksummer.digest()) {
        throw new Error(`The message checksum (${checksummer.digest()}) did not match the expected value of ${expectedMessageChecksum}`);
    }
    return {
        headers: new DataView(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH, headerLength),
        body: new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH + headerLength, messageLength - headerLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH + CHECKSUM_LENGTH)),
    };
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/EventStreamCodec.js



class EventStreamCodec {
    constructor(toUtf8, fromUtf8) {
        this.headerMarshaller = new HeaderMarshaller(toUtf8, fromUtf8);
        this.messageBuffer = [];
        this.isEndOfStream = false;
    }
    feed(message) {
        this.messageBuffer.push(this.decode(message));
    }
    endOfStream() {
        this.isEndOfStream = true;
    }
    getMessage() {
        const message = this.messageBuffer.pop();
        const isEndOfStream = this.isEndOfStream;
        return {
            getMessage() {
                return message;
            },
            isEndOfStream() {
                return isEndOfStream;
            },
        };
    }
    getAvailableMessages() {
        const messages = this.messageBuffer;
        this.messageBuffer = [];
        const isEndOfStream = this.isEndOfStream;
        return {
            getMessages() {
                return messages;
            },
            isEndOfStream() {
                return isEndOfStream;
            },
        };
    }
    encode({ headers: rawHeaders, body }) {
        const headers = this.headerMarshaller.format(rawHeaders);
        const length = headers.byteLength + body.byteLength + 16;
        const out = new Uint8Array(length);
        const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
        const checksum = new Crc32();
        view.setUint32(0, length, false);
        view.setUint32(4, headers.byteLength, false);
        view.setUint32(8, checksum.update(out.subarray(0, 8)).digest(), false);
        out.set(headers, 12);
        out.set(body, headers.byteLength + 12);
        view.setUint32(length - 4, checksum.update(out.subarray(8, length - 4)).digest(), false);
        return out;
    }
    decode(message) {
        const { headers, body } = splitMessage(message);
        return { headers: this.headerMarshaller.parse(headers), body };
    }
    formatHeaders(rawHeaders) {
        return this.headerMarshaller.format(rawHeaders);
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/MessageDecoderStream.js
class MessageDecoderStream {
    constructor(options) {
        this.options = options;
    }
    [Symbol.asyncIterator]() {
        return this.asyncIterator();
    }
    async *asyncIterator() {
        for await (const bytes of this.options.inputStream) {
            const decoded = this.options.decoder.decode(bytes);
            yield decoded;
        }
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/MessageEncoderStream.js
class MessageEncoderStream {
    constructor(options) {
        this.options = options;
    }
    [Symbol.asyncIterator]() {
        return this.asyncIterator();
    }
    async *asyncIterator() {
        for await (const msg of this.options.messageStream) {
            const encoded = this.options.encoder.encode(msg);
            yield encoded;
        }
        if (this.options.includeEndFrame) {
            yield new Uint8Array(0);
        }
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/SmithyMessageDecoderStream.js
class SmithyMessageDecoderStream {
    constructor(options) {
        this.options = options;
    }
    [Symbol.asyncIterator]() {
        return this.asyncIterator();
    }
    async *asyncIterator() {
        for await (const message of this.options.messageStream) {
            const deserialized = await this.options.deserializer(message);
            if (deserialized === undefined)
                continue;
            yield deserialized;
        }
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/SmithyMessageEncoderStream.js
class SmithyMessageEncoderStream {
    constructor(options) {
        this.options = options;
    }
    [Symbol.asyncIterator]() {
        return this.asyncIterator();
    }
    async *asyncIterator() {
        for await (const chunk of this.options.inputStream) {
            const payloadBuf = this.options.serializer(chunk);
            yield payloadBuf;
        }
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/eventstream-codec/dist-es/index.js









;// CONCATENATED MODULE: ./node_modules/@smithy/util-middleware/dist-es/normalizeProvider.js
const normalizeProvider_normalizeProvider = (input) => {
    if (typeof input === "function")
        return input;
    const promisified = Promise.resolve(input);
    return () => promisified;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/is-array-buffer/dist-es/index.js
const isArrayBuffer = (arg) => (typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer) ||
    Object.prototype.toString.call(arg) === "[object ArrayBuffer]";

// EXTERNAL MODULE: external "buffer"
var external_buffer_ = __webpack_require__(300);
;// CONCATENATED MODULE: ./node_modules/@smithy/util-buffer-from/dist-es/index.js


const dist_es_fromArrayBuffer = (input, offset = 0, length = input.byteLength - offset) => {
    if (!isArrayBuffer(input)) {
        throw new TypeError(`The "input" argument must be ArrayBuffer. Received type ${typeof input} (${input})`);
    }
    return external_buffer_.Buffer.from(input, offset, length);
};
const fromString = (input, encoding) => {
    if (typeof input !== "string") {
        throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
    }
    return encoding ? external_buffer_.Buffer.from(input, encoding) : external_buffer_.Buffer.from(input);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-utf8/dist-es/fromUtf8.js

const fromUtf8 = (input) => {
    const buf = fromString(input, "utf8");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-utf8/dist-es/toUint8Array.js

const toUint8Array = (data) => {
    if (typeof data === "string") {
        return fromUtf8(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    }
    return new Uint8Array(data);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-utf8/dist-es/toUtf8.js

const toUtf8 = (input) => dist_es_fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("utf8");

;// CONCATENATED MODULE: ./node_modules/@smithy/util-utf8/dist-es/index.js




;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/constants.js
const ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
const CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
const AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
const SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
const EXPIRES_QUERY_PARAM = "X-Amz-Expires";
const SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
const TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
const REGION_SET_PARAM = "X-Amz-Region-Set";
const AUTH_HEADER = "authorization";
const AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
const DATE_HEADER = "date";
const GENERATED_HEADERS = [AUTH_HEADER, AMZ_DATE_HEADER, DATE_HEADER];
const SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
const SHA256_HEADER = "x-amz-content-sha256";
const TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
const HOST_HEADER = "host";
const ALWAYS_UNSIGNABLE_HEADERS = {
    authorization: true,
    "cache-control": true,
    connection: true,
    expect: true,
    from: true,
    "keep-alive": true,
    "max-forwards": true,
    pragma: true,
    referer: true,
    te: true,
    trailer: true,
    "transfer-encoding": true,
    upgrade: true,
    "user-agent": true,
    "x-amzn-trace-id": true,
};
const PROXY_HEADER_PATTERN = /^proxy-/;
const SEC_HEADER_PATTERN = /^sec-/;
const UNSIGNABLE_PATTERNS = (/* unused pure expression or super */ null && ([/^proxy-/i, /^sec-/i]));
const ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
const ALGORITHM_IDENTIFIER_V4A = "AWS4-ECDSA-P256-SHA256";
const EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const MAX_CACHE_SIZE = 50;
const KEY_TYPE_IDENTIFIER = "aws4_request";
const MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/credentialDerivation.js



const signingKeyCache = {};
const cacheQueue = [];
const createScope = (shortDate, region, service) => `${shortDate}/${region}/${service}/${KEY_TYPE_IDENTIFIER}`;
const getSigningKey = async (sha256Constructor, credentials, shortDate, region, service) => {
    const credsHash = await hmac(sha256Constructor, credentials.secretAccessKey, credentials.accessKeyId);
    const cacheKey = `${shortDate}:${region}:${service}:${toHex(credsHash)}:${credentials.sessionToken}`;
    if (cacheKey in signingKeyCache) {
        return signingKeyCache[cacheKey];
    }
    cacheQueue.push(cacheKey);
    while (cacheQueue.length > MAX_CACHE_SIZE) {
        delete signingKeyCache[cacheQueue.shift()];
    }
    let key = `AWS4${credentials.secretAccessKey}`;
    for (const signable of [shortDate, region, service, KEY_TYPE_IDENTIFIER]) {
        key = await hmac(sha256Constructor, key, signable);
    }
    return (signingKeyCache[cacheKey] = key);
};
const clearCredentialCache = () => {
    cacheQueue.length = 0;
    Object.keys(signingKeyCache).forEach((cacheKey) => {
        delete signingKeyCache[cacheKey];
    });
};
const hmac = (ctor, secret, data) => {
    const hash = new ctor(secret);
    hash.update(toUint8Array(data));
    return hash.digest();
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/getCanonicalHeaders.js

const getCanonicalHeaders = ({ headers }, unsignableHeaders, signableHeaders) => {
    const canonical = {};
    for (const headerName of Object.keys(headers).sort()) {
        if (headers[headerName] == undefined) {
            continue;
        }
        const canonicalHeaderName = headerName.toLowerCase();
        if (canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS ||
            unsignableHeaders?.has(canonicalHeaderName) ||
            PROXY_HEADER_PATTERN.test(canonicalHeaderName) ||
            SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
            if (!signableHeaders || (signableHeaders && !signableHeaders.has(canonicalHeaderName))) {
                continue;
            }
        }
        canonical[canonicalHeaderName] = headers[headerName].trim().replace(/\s+/g, " ");
    }
    return canonical;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-uri-escape/dist-es/escape-uri.js
const escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
const hexEncode = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/getCanonicalQuery.js


const getCanonicalQuery = ({ query = {} }) => {
    const keys = [];
    const serialized = {};
    for (const key of Object.keys(query).sort()) {
        if (key.toLowerCase() === SIGNATURE_HEADER) {
            continue;
        }
        keys.push(key);
        const value = query[key];
        if (typeof value === "string") {
            serialized[key] = `${escapeUri(key)}=${escapeUri(value)}`;
        }
        else if (Array.isArray(value)) {
            serialized[key] = value
                .slice(0)
                .reduce((encoded, value) => encoded.concat([`${escapeUri(key)}=${escapeUri(value)}`]), [])
                .sort()
                .join("&");
        }
    }
    return keys
        .map((key) => serialized[key])
        .filter((serialized) => serialized)
        .join("&");
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/getPayloadHash.js




const getPayloadHash = async ({ headers, body }, hashConstructor) => {
    for (const headerName of Object.keys(headers)) {
        if (headerName.toLowerCase() === SHA256_HEADER) {
            return headers[headerName];
        }
    }
    if (body == undefined) {
        return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    }
    else if (typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer(body)) {
        const hashCtor = new hashConstructor();
        hashCtor.update(toUint8Array(body));
        return toHex(await hashCtor.digest());
    }
    return UNSIGNED_PAYLOAD;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/headerUtil.js
const hasHeader = (soughtHeader, headers) => {
    soughtHeader = soughtHeader.toLowerCase();
    for (const headerName of Object.keys(headers)) {
        if (soughtHeader === headerName.toLowerCase()) {
            return true;
        }
    }
    return false;
};
const getHeaderValue = (soughtHeader, headers) => {
    soughtHeader = soughtHeader.toLowerCase();
    for (const headerName of Object.keys(headers)) {
        if (soughtHeader === headerName.toLowerCase()) {
            return headers[headerName];
        }
    }
    return undefined;
};
const deleteHeader = (soughtHeader, headers) => {
    soughtHeader = soughtHeader.toLowerCase();
    for (const headerName of Object.keys(headers)) {
        if (soughtHeader === headerName.toLowerCase()) {
            delete headers[headerName];
        }
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/cloneRequest.js
const cloneRequest = ({ headers, query, ...rest }) => ({
    ...rest,
    headers: { ...headers },
    query: query ? cloneRequest_cloneQuery(query) : undefined,
});
const cloneRequest_cloneQuery = (query) => Object.keys(query).reduce((carry, paramName) => {
    const param = query[paramName];
    return {
        ...carry,
        [paramName]: Array.isArray(param) ? [...param] : param,
    };
}, {});

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/moveHeadersToQuery.js

const moveHeadersToQuery = (request, options = {}) => {
    const { headers, query = {} } = typeof request.clone === "function" ? request.clone() : cloneRequest(request);
    for (const name of Object.keys(headers)) {
        const lname = name.toLowerCase();
        if (lname.slice(0, 6) === "x-amz-" && !options.unhoistableHeaders?.has(lname)) {
            query[name] = headers[name];
            delete headers[name];
        }
    }
    return {
        ...request,
        headers,
        query,
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/prepareRequest.js


const prepareRequest = (request) => {
    request = typeof request.clone === "function" ? request.clone() : cloneRequest(request);
    for (const headerName of Object.keys(request.headers)) {
        if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) {
            delete request.headers[headerName];
        }
    }
    return request;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/utilDate.js
const iso8601 = (time) => toDate(time)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
const toDate = (time) => {
    if (typeof time === "number") {
        return new Date(time * 1000);
    }
    if (typeof time === "string") {
        if (Number(time)) {
            return new Date(Number(time) * 1000);
        }
        return new Date(time);
    }
    return time;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/SignatureV4.js













class SignatureV4_SignatureV4 {
    constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true, }) {
        this.headerMarshaller = new HeaderMarshaller_HeaderMarshaller(toUtf8, fromUtf8);
        this.service = service;
        this.sha256 = sha256;
        this.uriEscapePath = uriEscapePath;
        this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
        this.regionProvider = normalizeProvider_normalizeProvider(region);
        this.credentialProvider = normalizeProvider_normalizeProvider(credentials);
    }
    async presign(originalRequest, options = {}) {
        const { signingDate = new Date(), expiresIn = 3600, unsignableHeaders, unhoistableHeaders, signableHeaders, signingRegion, signingService, } = options;
        const credentials = await this.credentialProvider();
        this.validateResolvedCredentials(credentials);
        const region = signingRegion ?? (await this.regionProvider());
        const { longDate, shortDate } = formatDate(signingDate);
        if (expiresIn > MAX_PRESIGNED_TTL) {
            return Promise.reject("Signature version 4 presigned URLs" + " must have an expiration date less than one week in" + " the future");
        }
        const scope = createScope(shortDate, region, signingService ?? this.service);
        const request = moveHeadersToQuery(prepareRequest(originalRequest), { unhoistableHeaders });
        if (credentials.sessionToken) {
            request.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
        }
        request.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
        request.query[CREDENTIAL_QUERY_PARAM] = `${credentials.accessKeyId}/${scope}`;
        request.query[AMZ_DATE_QUERY_PARAM] = longDate;
        request.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
        const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
        request.query[SIGNED_HEADERS_QUERY_PARAM] = getCanonicalHeaderList(canonicalHeaders);
        request.query[SIGNATURE_QUERY_PARAM] = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, await getPayloadHash(originalRequest, this.sha256)));
        return request;
    }
    async sign(toSign, options) {
        if (typeof toSign === "string") {
            return this.signString(toSign, options);
        }
        else if (toSign.headers && toSign.payload) {
            return this.signEvent(toSign, options);
        }
        else if (toSign.message) {
            return this.signMessage(toSign, options);
        }
        else {
            return this.signRequest(toSign, options);
        }
    }
    async signEvent({ headers, payload }, { signingDate = new Date(), priorSignature, signingRegion, signingService }) {
        const region = signingRegion ?? (await this.regionProvider());
        const { shortDate, longDate } = formatDate(signingDate);
        const scope = createScope(shortDate, region, signingService ?? this.service);
        const hashedPayload = await getPayloadHash({ headers: {}, body: payload }, this.sha256);
        const hash = new this.sha256();
        hash.update(headers);
        const hashedHeaders = toHex(await hash.digest());
        const stringToSign = [
            EVENT_ALGORITHM_IDENTIFIER,
            longDate,
            scope,
            priorSignature,
            hashedHeaders,
            hashedPayload,
        ].join("\n");
        return this.signString(stringToSign, { signingDate, signingRegion: region, signingService });
    }
    async signMessage(signableMessage, { signingDate = new Date(), signingRegion, signingService }) {
        const promise = this.signEvent({
            headers: this.headerMarshaller.format(signableMessage.message.headers),
            payload: signableMessage.message.body,
        }, {
            signingDate,
            signingRegion,
            signingService,
            priorSignature: signableMessage.priorSignature,
        });
        return promise.then((signature) => {
            return { message: signableMessage.message, signature };
        });
    }
    async signString(stringToSign, { signingDate = new Date(), signingRegion, signingService } = {}) {
        const credentials = await this.credentialProvider();
        this.validateResolvedCredentials(credentials);
        const region = signingRegion ?? (await this.regionProvider());
        const { shortDate } = formatDate(signingDate);
        const hash = new this.sha256(await this.getSigningKey(credentials, region, shortDate, signingService));
        hash.update(toUint8Array(stringToSign));
        return toHex(await hash.digest());
    }
    async signRequest(requestToSign, { signingDate = new Date(), signableHeaders, unsignableHeaders, signingRegion, signingService, } = {}) {
        const credentials = await this.credentialProvider();
        this.validateResolvedCredentials(credentials);
        const region = signingRegion ?? (await this.regionProvider());
        const request = prepareRequest(requestToSign);
        const { longDate, shortDate } = formatDate(signingDate);
        const scope = createScope(shortDate, region, signingService ?? this.service);
        request.headers[AMZ_DATE_HEADER] = longDate;
        if (credentials.sessionToken) {
            request.headers[TOKEN_HEADER] = credentials.sessionToken;
        }
        const payloadHash = await getPayloadHash(request, this.sha256);
        if (!hasHeader(SHA256_HEADER, request.headers) && this.applyChecksum) {
            request.headers[SHA256_HEADER] = payloadHash;
        }
        const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
        const signature = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, payloadHash));
        request.headers[AUTH_HEADER] =
            `${ALGORITHM_IDENTIFIER} ` +
                `Credential=${credentials.accessKeyId}/${scope}, ` +
                `SignedHeaders=${getCanonicalHeaderList(canonicalHeaders)}, ` +
                `Signature=${signature}`;
        return request;
    }
    createCanonicalRequest(request, canonicalHeaders, payloadHash) {
        const sortedHeaders = Object.keys(canonicalHeaders).sort();
        return `${request.method}
${this.getCanonicalPath(request)}
${getCanonicalQuery(request)}
${sortedHeaders.map((name) => `${name}:${canonicalHeaders[name]}`).join("\n")}

${sortedHeaders.join(";")}
${payloadHash}`;
    }
    async createStringToSign(longDate, credentialScope, canonicalRequest) {
        const hash = new this.sha256();
        hash.update(toUint8Array(canonicalRequest));
        const hashedRequest = await hash.digest();
        return `${ALGORITHM_IDENTIFIER}
${longDate}
${credentialScope}
${toHex(hashedRequest)}`;
    }
    getCanonicalPath({ path }) {
        if (this.uriEscapePath) {
            const normalizedPathSegments = [];
            for (const pathSegment of path.split("/")) {
                if (pathSegment?.length === 0)
                    continue;
                if (pathSegment === ".")
                    continue;
                if (pathSegment === "..") {
                    normalizedPathSegments.pop();
                }
                else {
                    normalizedPathSegments.push(pathSegment);
                }
            }
            const normalizedPath = `${path?.startsWith("/") ? "/" : ""}${normalizedPathSegments.join("/")}${normalizedPathSegments.length > 0 && path?.endsWith("/") ? "/" : ""}`;
            const doubleEncoded = encodeURIComponent(normalizedPath);
            return doubleEncoded.replace(/%2F/g, "/");
        }
        return path;
    }
    async getSignature(longDate, credentialScope, keyPromise, canonicalRequest) {
        const stringToSign = await this.createStringToSign(longDate, credentialScope, canonicalRequest);
        const hash = new this.sha256(await keyPromise);
        hash.update(toUint8Array(stringToSign));
        return toHex(await hash.digest());
    }
    getSigningKey(credentials, region, shortDate, service) {
        return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
    }
    validateResolvedCredentials(credentials) {
        if (typeof credentials !== "object" ||
            typeof credentials.accessKeyId !== "string" ||
            typeof credentials.secretAccessKey !== "string") {
            throw new Error("Resolved credential object is not valid");
        }
    }
}
const formatDate = (now) => {
    const longDate = iso8601(now).replace(/[\-:]/g, "");
    return {
        longDate,
        shortDate: longDate.slice(0, 8),
    };
};
const getCanonicalHeaderList = (headers) => Object.keys(headers).sort().join(";");

;// CONCATENATED MODULE: ./node_modules/@smithy/signature-v4/dist-es/index.js








;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-signing/dist-es/awsAuthConfiguration.js



const CREDENTIAL_EXPIRE_WINDOW = 300000;
const resolveAwsAuthConfig = (input) => {
    const normalizedCreds = input.credentials
        ? normalizeCredentialProvider(input.credentials)
        : input.credentialDefaultProvider(input);
    const { signingEscapePath = true, systemClockOffset = input.systemClockOffset || 0, sha256 } = input;
    let signer;
    if (input.signer) {
        signer = normalizeProvider_normalizeProvider(input.signer);
    }
    else if (input.regionInfoProvider) {
        signer = () => normalizeProvider_normalizeProvider(input.region)()
            .then(async (region) => [
            (await input.regionInfoProvider(region, {
                useFipsEndpoint: await input.useFipsEndpoint(),
                useDualstackEndpoint: await input.useDualstackEndpoint(),
            })) || {},
            region,
        ])
            .then(([regionInfo, region]) => {
            const { signingRegion, signingService } = regionInfo;
            input.signingRegion = input.signingRegion || signingRegion || region;
            input.signingName = input.signingName || signingService || input.serviceId;
            const params = {
                ...input,
                credentials: normalizedCreds,
                region: input.signingRegion,
                service: input.signingName,
                sha256,
                uriEscapePath: signingEscapePath,
            };
            const SignerCtor = input.signerConstructor || SignatureV4_SignatureV4;
            return new SignerCtor(params);
        });
    }
    else {
        signer = async (authScheme) => {
            authScheme = Object.assign({}, {
                name: "sigv4",
                signingName: input.signingName || input.defaultSigningName,
                signingRegion: await normalizeProvider_normalizeProvider(input.region)(),
                properties: {},
            }, authScheme);
            const signingRegion = authScheme.signingRegion;
            const signingService = authScheme.signingName;
            input.signingRegion = input.signingRegion || signingRegion;
            input.signingName = input.signingName || signingService || input.serviceId;
            const params = {
                ...input,
                credentials: normalizedCreds,
                region: input.signingRegion,
                service: input.signingName,
                sha256,
                uriEscapePath: signingEscapePath,
            };
            const SignerCtor = input.signerConstructor || SignatureV4_SignatureV4;
            return new SignerCtor(params);
        };
    }
    return {
        ...input,
        systemClockOffset,
        signingEscapePath,
        credentials: normalizedCreds,
        signer,
    };
};
const resolveSigV4AuthConfig = (input) => {
    const normalizedCreds = input.credentials
        ? normalizeCredentialProvider(input.credentials)
        : input.credentialDefaultProvider(input);
    const { signingEscapePath = true, systemClockOffset = input.systemClockOffset || 0, sha256 } = input;
    let signer;
    if (input.signer) {
        signer = normalizeProvider(input.signer);
    }
    else {
        signer = normalizeProvider(new SignatureV4({
            credentials: normalizedCreds,
            region: input.region,
            service: input.signingName,
            sha256,
            uriEscapePath: signingEscapePath,
        }));
    }
    return {
        ...input,
        systemClockOffset,
        signingEscapePath,
        credentials: normalizedCreds,
        signer,
    };
};
const normalizeCredentialProvider = (credentials) => {
    if (typeof credentials === "function") {
        return memoize(credentials, (credentials) => credentials.expiration !== undefined &&
            credentials.expiration.getTime() - Date.now() < CREDENTIAL_EXPIRE_WINDOW, (credentials) => credentials.expiration !== undefined);
    }
    return normalizeProvider_normalizeProvider(credentials);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-signing/dist-es/utils/getSkewCorrectedDate.js
const getSkewCorrectedDate = (systemClockOffset) => new Date(Date.now() + systemClockOffset);

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-signing/dist-es/utils/isClockSkewed.js

const isClockSkewed = (clockTime, systemClockOffset) => Math.abs(getSkewCorrectedDate(systemClockOffset).getTime() - clockTime) >= 300000;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-signing/dist-es/utils/getUpdatedSystemClockOffset.js

const getUpdatedSystemClockOffset = (clockTime, currentSystemClockOffset) => {
    const clockTimeInMs = Date.parse(clockTime);
    if (isClockSkewed(clockTimeInMs, currentSystemClockOffset)) {
        return clockTimeInMs - Date.now();
    }
    return currentSystemClockOffset;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-signing/dist-es/awsAuthMiddleware.js



const awsAuthMiddleware = (options) => (next, context) => async function (args) {
    if (!httpRequest_HttpRequest.isInstance(args.request))
        return next(args);
    const authScheme = context.endpointV2?.properties?.authSchemes?.[0];
    const multiRegionOverride = authScheme?.name === "sigv4a" ? authScheme?.signingRegionSet?.join(",") : undefined;
    const signer = await options.signer(authScheme);
    const output = await next({
        ...args,
        request: await signer.sign(args.request, {
            signingDate: getSkewCorrectedDate(options.systemClockOffset),
            signingRegion: multiRegionOverride || context["signing_region"],
            signingService: context["signing_service"],
        }),
    }).catch((error) => {
        const serverTime = error.ServerTime ?? getDateHeader(error.$response);
        if (serverTime) {
            options.systemClockOffset = getUpdatedSystemClockOffset(serverTime, options.systemClockOffset);
        }
        throw error;
    });
    const dateHeader = getDateHeader(output.response);
    if (dateHeader) {
        options.systemClockOffset = getUpdatedSystemClockOffset(dateHeader, options.systemClockOffset);
    }
    return output;
};
const getDateHeader = (response) => httpResponse_HttpResponse.isInstance(response) ? response.headers?.date ?? response.headers?.Date : undefined;
const awsAuthMiddlewareOptions = {
    name: "awsAuthMiddleware",
    tags: ["SIGNATURE", "AWSAUTH"],
    relation: "after",
    toMiddleware: "retryMiddleware",
    override: true,
};
const getAwsAuthPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(awsAuthMiddleware(options), awsAuthMiddlewareOptions);
    },
});
const getSigV4AuthPlugin = (/* unused pure expression or super */ null && (getAwsAuthPlugin));

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-signing/dist-es/index.js



;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-user-agent/dist-es/configurations.js
function resolveUserAgentConfig(input) {
    return {
        ...input,
        customUserAgent: typeof input.customUserAgent === "string" ? [[input.customUserAgent]] : input.customUserAgent,
    };
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/partitions.json
const partitions_namespaceObject = JSON.parse('{"partitions":[{"id":"aws","outputs":{"dnsSuffix":"amazonaws.com","dualStackDnsSuffix":"api.aws","implicitGlobalRegion":"us-east-1","name":"aws","supportsDualStack":true,"supportsFIPS":true},"regionRegex":"^(us|eu|ap|sa|ca|me|af|il)\\\\-\\\\w+\\\\-\\\\d+$","regions":{"af-south-1":{"description":"Africa (Cape Town)"},"ap-east-1":{"description":"Asia Pacific (Hong Kong)"},"ap-northeast-1":{"description":"Asia Pacific (Tokyo)"},"ap-northeast-2":{"description":"Asia Pacific (Seoul)"},"ap-northeast-3":{"description":"Asia Pacific (Osaka)"},"ap-south-1":{"description":"Asia Pacific (Mumbai)"},"ap-south-2":{"description":"Asia Pacific (Hyderabad)"},"ap-southeast-1":{"description":"Asia Pacific (Singapore)"},"ap-southeast-2":{"description":"Asia Pacific (Sydney)"},"ap-southeast-3":{"description":"Asia Pacific (Jakarta)"},"ap-southeast-4":{"description":"Asia Pacific (Melbourne)"},"aws-global":{"description":"AWS Standard global region"},"ca-central-1":{"description":"Canada (Central)"},"eu-central-1":{"description":"Europe (Frankfurt)"},"eu-central-2":{"description":"Europe (Zurich)"},"eu-north-1":{"description":"Europe (Stockholm)"},"eu-south-1":{"description":"Europe (Milan)"},"eu-south-2":{"description":"Europe (Spain)"},"eu-west-1":{"description":"Europe (Ireland)"},"eu-west-2":{"description":"Europe (London)"},"eu-west-3":{"description":"Europe (Paris)"},"il-central-1":{"description":"Israel (Tel Aviv)"},"me-central-1":{"description":"Middle East (UAE)"},"me-south-1":{"description":"Middle East (Bahrain)"},"sa-east-1":{"description":"South America (Sao Paulo)"},"us-east-1":{"description":"US East (N. Virginia)"},"us-east-2":{"description":"US East (Ohio)"},"us-west-1":{"description":"US West (N. California)"},"us-west-2":{"description":"US West (Oregon)"}}},{"id":"aws-cn","outputs":{"dnsSuffix":"amazonaws.com.cn","dualStackDnsSuffix":"api.amazonwebservices.com.cn","implicitGlobalRegion":"cn-northwest-1","name":"aws-cn","supportsDualStack":true,"supportsFIPS":true},"regionRegex":"^cn\\\\-\\\\w+\\\\-\\\\d+$","regions":{"aws-cn-global":{"description":"AWS China global region"},"cn-north-1":{"description":"China (Beijing)"},"cn-northwest-1":{"description":"China (Ningxia)"}}},{"id":"aws-us-gov","outputs":{"dnsSuffix":"amazonaws.com","dualStackDnsSuffix":"api.aws","implicitGlobalRegion":"us-gov-west-1","name":"aws-us-gov","supportsDualStack":true,"supportsFIPS":true},"regionRegex":"^us\\\\-gov\\\\-\\\\w+\\\\-\\\\d+$","regions":{"aws-us-gov-global":{"description":"AWS GovCloud (US) global region"},"us-gov-east-1":{"description":"AWS GovCloud (US-East)"},"us-gov-west-1":{"description":"AWS GovCloud (US-West)"}}},{"id":"aws-iso","outputs":{"dnsSuffix":"c2s.ic.gov","dualStackDnsSuffix":"c2s.ic.gov","implicitGlobalRegion":"us-iso-east-1","name":"aws-iso","supportsDualStack":false,"supportsFIPS":true},"regionRegex":"^us\\\\-iso\\\\-\\\\w+\\\\-\\\\d+$","regions":{"aws-iso-global":{"description":"AWS ISO (US) global region"},"us-iso-east-1":{"description":"US ISO East"},"us-iso-west-1":{"description":"US ISO WEST"}}},{"id":"aws-iso-b","outputs":{"dnsSuffix":"sc2s.sgov.gov","dualStackDnsSuffix":"sc2s.sgov.gov","implicitGlobalRegion":"us-isob-east-1","name":"aws-iso-b","supportsDualStack":false,"supportsFIPS":true},"regionRegex":"^us\\\\-isob\\\\-\\\\w+\\\\-\\\\d+$","regions":{"aws-iso-b-global":{"description":"AWS ISOB (US) global region"},"us-isob-east-1":{"description":"US ISOB East (Ohio)"}}},{"id":"aws-iso-e","outputs":{"dnsSuffix":"cloud.adc-e.uk","dualStackDnsSuffix":"cloud.adc-e.uk","implicitGlobalRegion":"eu-isoe-west-1","name":"aws-iso-e","supportsDualStack":false,"supportsFIPS":true},"regionRegex":"^eu\\\\-isoe\\\\-\\\\w+\\\\-\\\\d+$","regions":{}},{"id":"aws-iso-f","outputs":{"dnsSuffix":"csp.hci.ic.gov","dualStackDnsSuffix":"csp.hci.ic.gov","implicitGlobalRegion":"us-isof-south-1","name":"aws-iso-f","supportsDualStack":false,"supportsFIPS":true},"regionRegex":"^us\\\\-isof\\\\-\\\\w+\\\\-\\\\d+$","regions":{}}],"version":"1.1"}');
;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/partition.js

let selectedPartitionsInfo = partitions_namespaceObject;
let selectedUserAgentPrefix = "";
const partition = (value) => {
    const { partitions } = selectedPartitionsInfo;
    for (const partition of partitions) {
        const { regions, outputs } = partition;
        for (const [region, regionData] of Object.entries(regions)) {
            if (region === value) {
                return {
                    ...outputs,
                    ...regionData,
                };
            }
        }
    }
    for (const partition of partitions) {
        const { regionRegex, outputs } = partition;
        if (new RegExp(regionRegex).test(value)) {
            return {
                ...outputs,
            };
        }
    }
    const DEFAULT_PARTITION = partitions.find((partition) => partition.id === "aws");
    if (!DEFAULT_PARTITION) {
        throw new Error("Provided region was not found in the partition array or regex," +
            " and default partition with id 'aws' doesn't exist.");
    }
    return {
        ...DEFAULT_PARTITION.outputs,
    };
};
const setPartitionInfo = (partitionsInfo, userAgentPrefix = "") => {
    selectedPartitionsInfo = partitionsInfo;
    selectedUserAgentPrefix = userAgentPrefix;
};
const useDefaultPartitionInfo = () => {
    setPartitionInfo(partitions_namespaceObject, "");
};
const getUserAgentPrefix = () => selectedUserAgentPrefix;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/debug/debugId.js
const debugId = "endpoints";

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/debug/toDebugString.js
function toDebugString(input) {
    if (typeof input !== "object" || input == null) {
        return input;
    }
    if ("ref" in input) {
        return `$${toDebugString(input.ref)}`;
    }
    if ("fn" in input) {
        return `${input.fn}(${(input.argv || []).map(toDebugString).join(", ")})`;
    }
    return JSON.stringify(input, null, 2);
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/types/EndpointError.js
class EndpointError extends Error {
    constructor(message) {
        super(message);
        this.name = "EndpointError";
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/isIpAddress.js
const IP_V4_REGEX = new RegExp(`^(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}$`);
const isIpAddress = (value) => IP_V4_REGEX.test(value) || (value.startsWith("[") && value.endsWith("]"));

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/isValidHostLabel.js
const VALID_HOST_LABEL_REGEX = new RegExp(`^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$`);
const isValidHostLabel = (value, allowSubDomains = false) => {
    if (!allowSubDomains) {
        return VALID_HOST_LABEL_REGEX.test(value);
    }
    const labels = value.split(".");
    for (const label of labels) {
        if (!isValidHostLabel(label)) {
            return false;
        }
    }
    return true;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/isVirtualHostableS3Bucket.js


const isVirtualHostableS3Bucket = (value, allowSubDomains = false) => {
    if (allowSubDomains) {
        for (const label of value.split(".")) {
            if (!isVirtualHostableS3Bucket(label)) {
                return false;
            }
        }
        return true;
    }
    if (!isValidHostLabel(value)) {
        return false;
    }
    if (value.length < 3 || value.length > 63) {
        return false;
    }
    if (value !== value.toLowerCase()) {
        return false;
    }
    if (isIpAddress(value)) {
        return false;
    }
    return true;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/parseArn.js
const parseArn = (value) => {
    const segments = value.split(":");
    if (segments.length < 6)
        return null;
    const [arn, partition, service, region, accountId, ...resourceId] = segments;
    if (arn !== "arn" || partition === "" || service === "" || resourceId[0] === "")
        return null;
    return {
        partition,
        service,
        region,
        accountId,
        resourceId: resourceId[0].includes("/") ? resourceId[0].split("/") : resourceId,
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/aws/index.js




;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/booleanEquals.js
const booleanEquals = (value1, value2) => value1 === value2;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/getAttrPathList.js

const getAttrPathList = (path) => {
    const parts = path.split(".");
    const pathList = [];
    for (const part of parts) {
        const squareBracketIndex = part.indexOf("[");
        if (squareBracketIndex !== -1) {
            if (part.indexOf("]") !== part.length - 1) {
                throw new EndpointError(`Path: '${path}' does not end with ']'`);
            }
            const arrayIndex = part.slice(squareBracketIndex + 1, -1);
            if (Number.isNaN(parseInt(arrayIndex))) {
                throw new EndpointError(`Invalid array index: '${arrayIndex}' in path: '${path}'`);
            }
            if (squareBracketIndex !== 0) {
                pathList.push(part.slice(0, squareBracketIndex));
            }
            pathList.push(arrayIndex);
        }
        else {
            pathList.push(part);
        }
    }
    return pathList;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/getAttr.js


const getAttr = (value, path) => getAttrPathList(path).reduce((acc, index) => {
    if (typeof acc !== "object") {
        throw new EndpointError(`Index '${index}' in '${path}' not found in '${JSON.stringify(value)}'`);
    }
    else if (Array.isArray(acc)) {
        return acc[parseInt(index)];
    }
    return acc[index];
}, value);

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/isSet.js
const isSet = (value) => value != null;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/not.js
const not = (value) => !value;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/types/dist-es/auth.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/types/dist-es/dns.js
var HostAddressType;
(function (HostAddressType) {
    HostAddressType["AAAA"] = "AAAA";
    HostAddressType["A"] = "A";
})(HostAddressType || (HostAddressType = {}));

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/types/dist-es/endpoint.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/types/dist-es/transfer.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/types/dist-es/index.js

































;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/parseURL.js


const DEFAULT_PORTS = {
    [EndpointURLScheme.HTTP]: 80,
    [EndpointURLScheme.HTTPS]: 443,
};
const parseURL = (value) => {
    const whatwgURL = (() => {
        try {
            if (value instanceof URL) {
                return value;
            }
            if (typeof value === "object" && "hostname" in value) {
                const { hostname, port, protocol = "", path = "", query = {} } = value;
                const url = new URL(`${protocol}//${hostname}${port ? `:${port}` : ""}${path}`);
                url.search = Object.entries(query)
                    .map(([k, v]) => `${k}=${v}`)
                    .join("&");
                return url;
            }
            return new URL(value);
        }
        catch (error) {
            return null;
        }
    })();
    if (!whatwgURL) {
        console.error(`Unable to parse ${JSON.stringify(value)} as a whatwg URL.`);
        return null;
    }
    const urlString = whatwgURL.href;
    const { host, hostname, pathname, protocol, search } = whatwgURL;
    if (search) {
        return null;
    }
    const scheme = protocol.slice(0, -1);
    if (!Object.values(EndpointURLScheme).includes(scheme)) {
        return null;
    }
    const isIp = isIpAddress(hostname);
    const inputContainsDefaultPort = urlString.includes(`${host}:${DEFAULT_PORTS[scheme]}`) ||
        (typeof value === "string" && value.includes(`${host}:${DEFAULT_PORTS[scheme]}`));
    const authority = `${host}${inputContainsDefaultPort ? `:${DEFAULT_PORTS[scheme]}` : ``}`;
    return {
        scheme,
        authority,
        path: pathname,
        normalizedPath: pathname.endsWith("/") ? pathname : `${pathname}/`,
        isIp,
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/stringEquals.js
const stringEquals = (value1, value2) => value1 === value2;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/substring.js
const substring = (input, start, stop, reverse) => {
    if (start >= stop || input.length < stop) {
        return null;
    }
    if (!reverse) {
        return input.substring(start, stop);
    }
    return input.substring(input.length - stop, input.length - start);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/uriEncode.js
const uriEncode = (value) => encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/lib/index.js











;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateTemplate.js

const evaluateTemplate = (template, options) => {
    const evaluatedTemplateArr = [];
    const templateContext = {
        ...options.endpointParams,
        ...options.referenceRecord,
    };
    let currentIndex = 0;
    while (currentIndex < template.length) {
        const openingBraceIndex = template.indexOf("{", currentIndex);
        if (openingBraceIndex === -1) {
            evaluatedTemplateArr.push(template.slice(currentIndex));
            break;
        }
        evaluatedTemplateArr.push(template.slice(currentIndex, openingBraceIndex));
        const closingBraceIndex = template.indexOf("}", openingBraceIndex);
        if (closingBraceIndex === -1) {
            evaluatedTemplateArr.push(template.slice(openingBraceIndex));
            break;
        }
        if (template[openingBraceIndex + 1] === "{" && template[closingBraceIndex + 1] === "}") {
            evaluatedTemplateArr.push(template.slice(openingBraceIndex + 1, closingBraceIndex));
            currentIndex = closingBraceIndex + 2;
        }
        const parameterName = template.substring(openingBraceIndex + 1, closingBraceIndex);
        if (parameterName.includes("#")) {
            const [refName, attrName] = parameterName.split("#");
            evaluatedTemplateArr.push(getAttr(templateContext[refName], attrName));
        }
        else {
            evaluatedTemplateArr.push(templateContext[parameterName]);
        }
        currentIndex = closingBraceIndex + 1;
    }
    return evaluatedTemplateArr.join("");
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/getReferenceValue.js
const getReferenceValue = ({ ref }, options) => {
    const referenceRecord = {
        ...options.endpointParams,
        ...options.referenceRecord,
    };
    return referenceRecord[ref];
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateExpression.js




const evaluateExpression = (obj, keyName, options) => {
    if (typeof obj === "string") {
        return evaluateTemplate(obj, options);
    }
    else if (obj["fn"]) {
        return callFunction(obj, options);
    }
    else if (obj["ref"]) {
        return getReferenceValue(obj, options);
    }
    throw new EndpointError(`'${keyName}': ${String(obj)} is not a string, function or reference.`);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/callFunction.js


const callFunction = ({ fn, argv }, options) => {
    const evaluatedArgs = argv.map((arg) => ["boolean", "number"].includes(typeof arg) ? arg : evaluateExpression(arg, "arg", options));
    return fn.split(".").reduce((acc, key) => acc[key], lib_namespaceObject)(...evaluatedArgs);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateCondition.js



const evaluateCondition = ({ assign, ...fnArgs }, options) => {
    if (assign && assign in options.referenceRecord) {
        throw new EndpointError(`'${assign}' is already defined in Reference Record.`);
    }
    const value = callFunction(fnArgs, options);
    options.logger?.debug?.(debugId, `evaluateCondition: ${toDebugString(fnArgs)} = ${toDebugString(value)}`);
    return {
        result: value === "" ? true : !!value,
        ...(assign != null && { toAssign: { name: assign, value } }),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateConditions.js


const evaluateConditions = (conditions = [], options) => {
    const conditionsReferenceRecord = {};
    for (const condition of conditions) {
        const { result, toAssign } = evaluateCondition(condition, {
            ...options,
            referenceRecord: {
                ...options.referenceRecord,
                ...conditionsReferenceRecord,
            },
        });
        if (!result) {
            return { result };
        }
        if (toAssign) {
            conditionsReferenceRecord[toAssign.name] = toAssign.value;
            options.logger?.debug?.(debugId, `assign: ${toAssign.name} := ${toDebugString(toAssign.value)}`);
        }
    }
    return { result: true, referenceRecord: conditionsReferenceRecord };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/getEndpointHeaders.js


const getEndpointHeaders = (headers, options) => Object.entries(headers).reduce((acc, [headerKey, headerVal]) => ({
    ...acc,
    [headerKey]: headerVal.map((headerValEntry) => {
        const processedExpr = evaluateExpression(headerValEntry, "Header value entry", options);
        if (typeof processedExpr !== "string") {
            throw new EndpointError(`Header '${headerKey}' value '${processedExpr}' is not a string`);
        }
        return processedExpr;
    }),
}), {});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/getEndpointProperty.js



const getEndpointProperty = (property, options) => {
    if (Array.isArray(property)) {
        return property.map((propertyEntry) => getEndpointProperty(propertyEntry, options));
    }
    switch (typeof property) {
        case "string":
            return evaluateTemplate(property, options);
        case "object":
            if (property === null) {
                throw new EndpointError(`Unexpected endpoint property: ${property}`);
            }
            return getEndpointProperties(property, options);
        case "boolean":
            return property;
        default:
            throw new EndpointError(`Unexpected endpoint property type: ${typeof property}`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/getEndpointProperties.js

const getEndpointProperties = (properties, options) => Object.entries(properties).reduce((acc, [propertyKey, propertyVal]) => ({
    ...acc,
    [propertyKey]: getEndpointProperty(propertyVal, options),
}), {});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/getEndpointUrl.js


const getEndpointUrl = (endpointUrl, options) => {
    const expression = evaluateExpression(endpointUrl, "Endpoint URL", options);
    if (typeof expression === "string") {
        try {
            return new URL(expression);
        }
        catch (error) {
            console.error(`Failed to construct URL with ${expression}`, error);
            throw error;
        }
    }
    throw new EndpointError(`Endpoint URL must be a string, got ${typeof expression}`);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateEndpointRule.js





const evaluateEndpointRule = (endpointRule, options) => {
    const { conditions, endpoint } = endpointRule;
    const { result, referenceRecord } = evaluateConditions(conditions, options);
    if (!result) {
        return;
    }
    const endpointRuleOptions = {
        ...options,
        referenceRecord: { ...options.referenceRecord, ...referenceRecord },
    };
    const { url, properties, headers } = endpoint;
    options.logger?.debug?.(debugId, `Resolving endpoint from template: ${toDebugString(endpoint)}`);
    return {
        ...(headers != undefined && {
            headers: getEndpointHeaders(headers, endpointRuleOptions),
        }),
        ...(properties != undefined && {
            properties: getEndpointProperties(properties, endpointRuleOptions),
        }),
        url: getEndpointUrl(url, endpointRuleOptions),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateErrorRule.js



const evaluateErrorRule = (errorRule, options) => {
    const { conditions, error } = errorRule;
    const { result, referenceRecord } = evaluateConditions(conditions, options);
    if (!result) {
        return;
    }
    throw new EndpointError(evaluateExpression(error, "Error", {
        ...options,
        referenceRecord: { ...options.referenceRecord, ...referenceRecord },
    }));
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateTreeRule.js


const evaluateTreeRule = (treeRule, options) => {
    const { conditions, rules } = treeRule;
    const { result, referenceRecord } = evaluateConditions(conditions, options);
    if (!result) {
        return;
    }
    return evaluateRules(rules, {
        ...options,
        referenceRecord: { ...options.referenceRecord, ...referenceRecord },
    });
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/evaluateRules.js




const evaluateRules = (rules, options) => {
    for (const rule of rules) {
        if (rule.type === "endpoint") {
            const endpointOrUndefined = evaluateEndpointRule(rule, options);
            if (endpointOrUndefined) {
                return endpointOrUndefined;
            }
        }
        else if (rule.type === "error") {
            evaluateErrorRule(rule, options);
        }
        else if (rule.type === "tree") {
            const endpointOrUndefined = evaluateTreeRule(rule, options);
            if (endpointOrUndefined) {
                return endpointOrUndefined;
            }
        }
        else {
            throw new EndpointError(`Unknown endpoint rule: ${rule}`);
        }
    }
    throw new EndpointError(`Rules evaluation failed`);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/utils/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/resolveEndpoint.js



const resolveEndpoint = (ruleSetObject, options) => {
    const { endpointParams, logger } = options;
    const { parameters, rules } = ruleSetObject;
    options.logger?.debug?.(`${debugId} Initial EndpointParams: ${toDebugString(endpointParams)}`);
    const paramsWithDefault = Object.entries(parameters)
        .filter(([, v]) => v.default != null)
        .map(([k, v]) => [k, v.default]);
    if (paramsWithDefault.length > 0) {
        for (const [paramKey, paramDefaultValue] of paramsWithDefault) {
            endpointParams[paramKey] = endpointParams[paramKey] ?? paramDefaultValue;
        }
    }
    const requiredParams = Object.entries(parameters)
        .filter(([, v]) => v.required)
        .map(([k]) => k);
    for (const requiredParam of requiredParams) {
        if (endpointParams[requiredParam] == null) {
            throw new EndpointError(`Missing required parameter: '${requiredParam}'`);
        }
    }
    const endpoint = evaluateRules(rules, { endpointParams, logger, referenceRecord: {} });
    if (options.endpointParams?.Endpoint) {
        try {
            const givenEndpoint = new URL(options.endpointParams.Endpoint);
            const { protocol, port } = givenEndpoint;
            endpoint.url.protocol = protocol;
            endpoint.url.port = port;
        }
        catch (e) {
        }
    }
    options.logger?.debug?.(`${debugId} Resolved endpoint: ${toDebugString(endpoint)}`);
    return endpoint;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-endpoints/dist-es/index.js





;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-user-agent/dist-es/constants.js
const USER_AGENT = "user-agent";
const X_AMZ_USER_AGENT = "x-amz-user-agent";
const SPACE = " ";
const UA_NAME_SEPARATOR = "/";
const UA_NAME_ESCAPE_REGEX = /[^\!\$\%\&\'\*\+\-\.\^\_\`\|\~\d\w]/g;
const UA_VALUE_ESCAPE_REGEX = /[^\!\$\%\&\'\*\+\-\.\^\_\`\|\~\d\w\#]/g;
const UA_ESCAPE_CHAR = "-";

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-user-agent/dist-es/user-agent-middleware.js



const userAgentMiddleware = (options) => (next, context) => async (args) => {
    const { request } = args;
    if (!httpRequest_HttpRequest.isInstance(request))
        return next(args);
    const { headers } = request;
    const userAgent = context?.userAgent?.map(escapeUserAgent) || [];
    const defaultUserAgent = (await options.defaultUserAgentProvider()).map(escapeUserAgent);
    const customUserAgent = options?.customUserAgent?.map(escapeUserAgent) || [];
    const prefix = getUserAgentPrefix();
    const sdkUserAgentValue = (prefix ? [prefix] : [])
        .concat([...defaultUserAgent, ...userAgent, ...customUserAgent])
        .join(SPACE);
    const normalUAValue = [
        ...defaultUserAgent.filter((section) => section.startsWith("aws-sdk-")),
        ...customUserAgent,
    ].join(SPACE);
    if (options.runtime !== "browser") {
        if (normalUAValue) {
            headers[X_AMZ_USER_AGENT] = headers[X_AMZ_USER_AGENT]
                ? `${headers[USER_AGENT]} ${normalUAValue}`
                : normalUAValue;
        }
        headers[USER_AGENT] = sdkUserAgentValue;
    }
    else {
        headers[X_AMZ_USER_AGENT] = sdkUserAgentValue;
    }
    return next({
        ...args,
        request,
    });
};
const escapeUserAgent = (userAgentPair) => {
    const name = userAgentPair[0]
        .split(UA_NAME_SEPARATOR)
        .map((part) => part.replace(UA_NAME_ESCAPE_REGEX, UA_ESCAPE_CHAR))
        .join(UA_NAME_SEPARATOR);
    const version = userAgentPair[1]?.replace(UA_VALUE_ESCAPE_REGEX, UA_ESCAPE_CHAR);
    const prefixSeparatorIndex = name.indexOf(UA_NAME_SEPARATOR);
    const prefix = name.substring(0, prefixSeparatorIndex);
    let uaName = name.substring(prefixSeparatorIndex + 1);
    if (prefix === "api") {
        uaName = uaName.toLowerCase();
    }
    return [prefix, uaName, version]
        .filter((item) => item && item.length > 0)
        .reduce((acc, item, index) => {
        switch (index) {
            case 0:
                return item;
            case 1:
                return `${acc}/${item}`;
            default:
                return `${acc}#${item}`;
        }
    }, "");
};
const getUserAgentMiddlewareOptions = {
    name: "getUserAgentMiddleware",
    step: "build",
    priority: "low",
    tags: ["SET_USER_AGENT", "USER_AGENT"],
    override: true,
};
const getUserAgentPlugin = (config) => ({
    applyToStack: (clientStack) => {
        clientStack.add(userAgentMiddleware(config), getUserAgentMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-user-agent/dist-es/index.js



;// CONCATENATED MODULE: ./node_modules/@smithy/util-config-provider/dist-es/booleanSelector.js
var SelectorType;
(function (SelectorType) {
    SelectorType["ENV"] = "env";
    SelectorType["CONFIG"] = "shared config entry";
})(SelectorType || (SelectorType = {}));
const booleanSelector = (obj, key, type) => {
    if (!(key in obj))
        return undefined;
    if (obj[key] === "true")
        return true;
    if (obj[key] === "false")
        return false;
    throw new Error(`Cannot load ${type} "${key}". Expected "true" or "false", got ${obj[key]}.`);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-config-provider/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/endpointsConfig/NodeUseDualstackEndpointConfigOptions.js

const ENV_USE_DUALSTACK_ENDPOINT = "AWS_USE_DUALSTACK_ENDPOINT";
const CONFIG_USE_DUALSTACK_ENDPOINT = "use_dualstack_endpoint";
const DEFAULT_USE_DUALSTACK_ENDPOINT = false;
const NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => booleanSelector(env, ENV_USE_DUALSTACK_ENDPOINT, SelectorType.ENV),
    configFileSelector: (profile) => booleanSelector(profile, CONFIG_USE_DUALSTACK_ENDPOINT, SelectorType.CONFIG),
    default: false,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/endpointsConfig/NodeUseFipsEndpointConfigOptions.js

const ENV_USE_FIPS_ENDPOINT = "AWS_USE_FIPS_ENDPOINT";
const CONFIG_USE_FIPS_ENDPOINT = "use_fips_endpoint";
const DEFAULT_USE_FIPS_ENDPOINT = false;
const NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => booleanSelector(env, ENV_USE_FIPS_ENDPOINT, SelectorType.ENV),
    configFileSelector: (profile) => booleanSelector(profile, CONFIG_USE_FIPS_ENDPOINT, SelectorType.CONFIG),
    default: false,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/endpointsConfig/index.js





;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/regionConfig/config.js
const REGION_ENV_NAME = "AWS_REGION";
const REGION_INI_NAME = "region";
const NODE_REGION_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[REGION_ENV_NAME],
    configFileSelector: (profile) => profile[REGION_INI_NAME],
    default: () => {
        throw new Error("Region is missing");
    },
};
const NODE_REGION_CONFIG_FILE_OPTIONS = {
    preferredFile: "credentials",
};

;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/regionConfig/isFipsRegion.js
const isFipsRegion = (region) => typeof region === "string" && (region.startsWith("fips-") || region.endsWith("-fips"));

;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/regionConfig/getRealRegion.js

const getRealRegion = (region) => isFipsRegion(region)
    ? ["fips-aws-global", "aws-fips"].includes(region)
        ? "us-east-1"
        : region.replace(/fips-(dkr-|prod-)?|-fips/, "")
    : region;

;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/regionConfig/resolveRegionConfig.js


const resolveRegionConfig = (input) => {
    const { region, useFipsEndpoint } = input;
    if (!region) {
        throw new Error("Region is missing");
    }
    return {
        ...input,
        region: async () => {
            if (typeof region === "string") {
                return getRealRegion(region);
            }
            const providedRegion = await region();
            return getRealRegion(providedRegion);
        },
        useFipsEndpoint: async () => {
            const providedRegion = typeof region === "string" ? region : await region();
            if (isFipsRegion(providedRegion)) {
                return true;
            }
            return typeof useFipsEndpoint !== "function" ? Promise.resolve(!!useFipsEndpoint) : useFipsEndpoint();
        },
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/regionConfig/index.js



;// CONCATENATED MODULE: ./node_modules/@smithy/config-resolver/dist-es/index.js




;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-content-length/dist-es/index.js

const CONTENT_LENGTH_HEADER = "content-length";
function contentLengthMiddleware(bodyLengthChecker) {
    return (next) => async (args) => {
        const request = args.request;
        if (httpRequest_HttpRequest.isInstance(request)) {
            const { body, headers } = request;
            if (body &&
                Object.keys(headers)
                    .map((str) => str.toLowerCase())
                    .indexOf(CONTENT_LENGTH_HEADER) === -1) {
                try {
                    const length = bodyLengthChecker(body);
                    request.headers = {
                        ...request.headers,
                        [CONTENT_LENGTH_HEADER]: String(length),
                    };
                }
                catch (error) {
                }
            }
        }
        return next({
            ...args,
            request,
        });
    };
}
const contentLengthMiddlewareOptions = {
    step: "build",
    tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
    name: "contentLengthMiddleware",
    override: true,
};
const getContentLengthPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(contentLengthMiddleware(options.bodyLengthChecker), contentLengthMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-serde/dist-es/deserializerMiddleware.js
const deserializerMiddleware = (options, deserializer) => (next, context) => async (args) => {
    const { response } = await next(args);
    try {
        const parsed = await deserializer(response, options);
        return {
            response,
            output: parsed,
        };
    }
    catch (error) {
        Object.defineProperty(error, "$response", {
            value: response,
        });
        if (!("$metadata" in error)) {
            const hint = `Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.`;
            error.message += "\n  " + hint;
        }
        throw error;
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-serde/dist-es/serializerMiddleware.js
const serializerMiddleware = (options, serializer) => (next, context) => async (args) => {
    const endpoint = context.endpointV2?.url && options.urlParser
        ? async () => options.urlParser(context.endpointV2.url)
        : options.endpoint;
    if (!endpoint) {
        throw new Error("No valid endpoint provider available.");
    }
    const request = await serializer(args.input, { ...options, endpoint });
    return next({
        ...args,
        request,
    });
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-serde/dist-es/serdePlugin.js


const deserializerMiddlewareOption = {
    name: "deserializerMiddleware",
    step: "deserialize",
    tags: ["DESERIALIZER"],
    override: true,
};
const serializerMiddlewareOption = {
    name: "serializerMiddleware",
    step: "serialize",
    tags: ["SERIALIZER"],
    override: true,
};
function getSerdePlugin(config, serializer, deserializer) {
    return {
        applyToStack: (commandStack) => {
            commandStack.add(deserializerMiddleware(config, deserializer), deserializerMiddlewareOption);
            commandStack.add(serializerMiddleware(config, serializer), serializerMiddlewareOption);
        },
    };
}

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-serde/dist-es/index.js




;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/service-customizations/s3.js
const resolveParamsForS3 = async (endpointParams) => {
    const bucket = endpointParams?.Bucket || "";
    if (typeof endpointParams.Bucket === "string") {
        endpointParams.Bucket = bucket.replace(/#/g, encodeURIComponent("#")).replace(/\?/g, encodeURIComponent("?"));
    }
    if (isArnBucketName(bucket)) {
        if (endpointParams.ForcePathStyle === true) {
            throw new Error("Path-style addressing cannot be used with ARN buckets");
        }
    }
    else if (!isDnsCompatibleBucketName(bucket) ||
        (bucket.indexOf(".") !== -1 && !String(endpointParams.Endpoint).startsWith("http:")) ||
        bucket.toLowerCase() !== bucket ||
        bucket.length < 3) {
        endpointParams.ForcePathStyle = true;
    }
    if (endpointParams.DisableMultiRegionAccessPoints) {
        endpointParams.disableMultiRegionAccessPoints = true;
        endpointParams.DisableMRAP = true;
    }
    return endpointParams;
};
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
const IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
const DOTS_PATTERN = /\.\./;
const DOT_PATTERN = /\./;
const S3_HOSTNAME_PATTERN = /^(.+\.)?s3(-fips)?(\.dualstack)?[.-]([a-z0-9-]+)\./;
const isDnsCompatibleBucketName = (bucketName) => DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
const isArnBucketName = (bucketName) => {
    const [arn, partition, service, region, account, typeOrId] = bucketName.split(":");
    const isArn = arn === "arn" && bucketName.split(":").length >= 6;
    const isValidArn = [arn, partition, service, account, typeOrId].filter(Boolean).length === 5;
    if (isArn && !isValidArn) {
        throw new Error(`Invalid ARN: ${bucketName} was an invalid ARN.`);
    }
    return arn === "arn" && !!partition && !!service && !!account && !!typeOrId;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/adaptors/createConfigValueProvider.js
const createConfigValueProvider = (configKey, canonicalEndpointParamKey, config) => {
    const configProvider = async () => {
        const configValue = config[configKey] ?? config[canonicalEndpointParamKey];
        if (typeof configValue === "function") {
            return configValue();
        }
        return configValue;
    };
    if (configKey === "endpoint" || canonicalEndpointParamKey === "endpoint") {
        return async () => {
            const endpoint = await configProvider();
            if (endpoint && typeof endpoint === "object") {
                if ("url" in endpoint) {
                    return endpoint.url.href;
                }
                if ("hostname" in endpoint) {
                    const { protocol, hostname, port, path } = endpoint;
                    return `${protocol}//${hostname}${port ? ":" + port : ""}${path}`;
                }
            }
            return endpoint;
        };
    }
    return configProvider;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/adaptors/getEndpointFromInstructions.js


const getEndpointFromInstructions = async (commandInput, instructionsSupplier, clientConfig, context) => {
    const endpointParams = await resolveParams(commandInput, instructionsSupplier, clientConfig);
    if (typeof clientConfig.endpointProvider !== "function") {
        throw new Error("config.endpointProvider is not set.");
    }
    const endpoint = clientConfig.endpointProvider(endpointParams, context);
    return endpoint;
};
const resolveParams = async (commandInput, instructionsSupplier, clientConfig) => {
    const endpointParams = {};
    const instructions = instructionsSupplier?.getEndpointParameterInstructions?.() || {};
    for (const [name, instruction] of Object.entries(instructions)) {
        switch (instruction.type) {
            case "staticContextParams":
                endpointParams[name] = instruction.value;
                break;
            case "contextParams":
                endpointParams[name] = commandInput[instruction.name];
                break;
            case "clientContextParams":
            case "builtInParams":
                endpointParams[name] = await createConfigValueProvider(instruction.name, name, clientConfig)();
                break;
            default:
                throw new Error("Unrecognized endpoint parameter instruction: " + JSON.stringify(instruction));
        }
    }
    if (Object.keys(instructions).length === 0) {
        Object.assign(endpointParams, clientConfig);
    }
    if (String(clientConfig.serviceId).toLowerCase() === "s3") {
        await resolveParamsForS3(endpointParams);
    }
    return endpointParams;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/endpointMiddleware.js

const endpointMiddleware = ({ config, instructions, }) => {
    return (next, context) => async (args) => {
        const endpoint = await getEndpointFromInstructions(args.input, {
            getEndpointParameterInstructions() {
                return instructions;
            },
        }, { ...config }, context);
        context.endpointV2 = endpoint;
        context.authSchemes = endpoint.properties?.authSchemes;
        const authScheme = context.authSchemes?.[0];
        if (authScheme) {
            context["signing_region"] = authScheme.signingRegion;
            context["signing_service"] = authScheme.signingName;
        }
        return next({
            ...args,
        });
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/getEndpointPlugin.js


const endpointMiddlewareOptions = {
    step: "serialize",
    tags: ["ENDPOINT_PARAMETERS", "ENDPOINT_V2", "ENDPOINT"],
    name: "endpointV2Middleware",
    override: true,
    relation: "before",
    toMiddleware: serializerMiddlewareOption.name,
};
const getEndpointPlugin = (config, instructions) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(endpointMiddleware({
            config,
            instructions,
        }), endpointMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: ./node_modules/@smithy/querystring-parser/dist-es/index.js
function parseQueryString(querystring) {
    const query = {};
    querystring = querystring.replace(/^\?/, "");
    if (querystring) {
        for (const pair of querystring.split("&")) {
            let [key, value = null] = pair.split("=");
            key = decodeURIComponent(key);
            if (value) {
                value = decodeURIComponent(value);
            }
            if (!(key in query)) {
                query[key] = value;
            }
            else if (Array.isArray(query[key])) {
                query[key].push(value);
            }
            else {
                query[key] = [query[key], value];
            }
        }
    }
    return query;
}

;// CONCATENATED MODULE: ./node_modules/@smithy/url-parser/dist-es/index.js

const parseUrl = (url) => {
    if (typeof url === "string") {
        return parseUrl(new URL(url));
    }
    const { hostname, pathname, port, protocol, search } = url;
    let query;
    if (search) {
        query = parseQueryString(search);
    }
    return {
        hostname,
        port: port ? parseInt(port) : undefined,
        protocol,
        path: pathname,
        query,
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/adaptors/toEndpointV1.js

const toEndpointV1 = (endpoint) => {
    if (typeof endpoint === "object") {
        if ("url" in endpoint) {
            return parseUrl(endpoint.url);
        }
        return endpoint;
    }
    return parseUrl(endpoint);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/resolveEndpointConfig.js


const resolveEndpointConfig = (input) => {
    const tls = input.tls ?? true;
    const { endpoint } = input;
    const customEndpointProvider = endpoint != null ? async () => toEndpointV1(await normalizeProvider_normalizeProvider(endpoint)()) : undefined;
    const isCustomEndpoint = !!endpoint;
    return {
        ...input,
        endpoint: customEndpointProvider,
        tls,
        isCustomEndpoint,
        useDualstackEndpoint: normalizeProvider_normalizeProvider(input.useDualstackEndpoint ?? false),
        useFipsEndpoint: normalizeProvider_normalizeProvider(input.useFipsEndpoint ?? false),
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-endpoint/dist-es/index.js






;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/config.js
var config_RETRY_MODES;
(function (RETRY_MODES) {
    RETRY_MODES["STANDARD"] = "standard";
    RETRY_MODES["ADAPTIVE"] = "adaptive";
})(config_RETRY_MODES || (config_RETRY_MODES = {}));
const config_DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MODE = config_RETRY_MODES.STANDARD;

;// CONCATENATED MODULE: ./node_modules/@smithy/service-error-classification/dist-es/constants.js
const constants_CLOCK_SKEW_ERROR_CODES = (/* unused pure expression or super */ null && ([
    "AuthFailure",
    "InvalidSignatureException",
    "RequestExpired",
    "RequestInTheFuture",
    "RequestTimeTooSkewed",
    "SignatureDoesNotMatch",
]));
const THROTTLING_ERROR_CODES = [
    "BandwidthLimitExceeded",
    "EC2ThrottledException",
    "LimitExceededException",
    "PriorRequestNotComplete",
    "ProvisionedThroughputExceededException",
    "RequestLimitExceeded",
    "RequestThrottled",
    "RequestThrottledException",
    "SlowDown",
    "ThrottledException",
    "Throttling",
    "ThrottlingException",
    "TooManyRequestsException",
    "TransactionInProgressException",
];
const TRANSIENT_ERROR_CODES = ["TimeoutError", "RequestTimeout", "RequestTimeoutException"];
const TRANSIENT_ERROR_STATUS_CODES = [500, 502, 503, 504];
const NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"];

;// CONCATENATED MODULE: ./node_modules/@smithy/service-error-classification/dist-es/index.js

const isRetryableByTrait = (error) => error.$retryable !== undefined;
const isClockSkewError = (error) => CLOCK_SKEW_ERROR_CODES.includes(error.name);
const dist_es_isThrottlingError = (error) => error.$metadata?.httpStatusCode === 429 ||
    THROTTLING_ERROR_CODES.includes(error.name) ||
    error.$retryable?.throttling == true;
const isTransientError = (error) => TRANSIENT_ERROR_CODES.includes(error.name) ||
    NODEJS_TIMEOUT_ERROR_CODES.includes(error?.code || "") ||
    TRANSIENT_ERROR_STATUS_CODES.includes(error.$metadata?.httpStatusCode || 0);
const isServerError = (error) => {
    if (error.$metadata?.httpStatusCode !== undefined) {
        const statusCode = error.$metadata.httpStatusCode;
        if (500 <= statusCode && statusCode <= 599 && !isTransientError(error)) {
            return true;
        }
        return false;
    }
    return false;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/DefaultRateLimiter.js

class DefaultRateLimiter_DefaultRateLimiter {
    constructor(options) {
        this.currentCapacity = 0;
        this.enabled = false;
        this.lastMaxRate = 0;
        this.measuredTxRate = 0;
        this.requestCount = 0;
        this.lastTimestamp = 0;
        this.timeWindow = 0;
        this.beta = options?.beta ?? 0.7;
        this.minCapacity = options?.minCapacity ?? 1;
        this.minFillRate = options?.minFillRate ?? 0.5;
        this.scaleConstant = options?.scaleConstant ?? 0.4;
        this.smooth = options?.smooth ?? 0.8;
        const currentTimeInSeconds = this.getCurrentTimeInSeconds();
        this.lastThrottleTime = currentTimeInSeconds;
        this.lastTxRateBucket = Math.floor(this.getCurrentTimeInSeconds());
        this.fillRate = this.minFillRate;
        this.maxCapacity = this.minCapacity;
    }
    getCurrentTimeInSeconds() {
        return Date.now() / 1000;
    }
    async getSendToken() {
        return this.acquireTokenBucket(1);
    }
    async acquireTokenBucket(amount) {
        if (!this.enabled) {
            return;
        }
        this.refillTokenBucket();
        if (amount > this.currentCapacity) {
            const delay = ((amount - this.currentCapacity) / this.fillRate) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        this.currentCapacity = this.currentCapacity - amount;
    }
    refillTokenBucket() {
        const timestamp = this.getCurrentTimeInSeconds();
        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
            return;
        }
        const fillAmount = (timestamp - this.lastTimestamp) * this.fillRate;
        this.currentCapacity = Math.min(this.maxCapacity, this.currentCapacity + fillAmount);
        this.lastTimestamp = timestamp;
    }
    updateClientSendingRate(response) {
        let calculatedRate;
        this.updateMeasuredRate();
        if (dist_es_isThrottlingError(response)) {
            const rateToUse = !this.enabled ? this.measuredTxRate : Math.min(this.measuredTxRate, this.fillRate);
            this.lastMaxRate = rateToUse;
            this.calculateTimeWindow();
            this.lastThrottleTime = this.getCurrentTimeInSeconds();
            calculatedRate = this.cubicThrottle(rateToUse);
            this.enableTokenBucket();
        }
        else {
            this.calculateTimeWindow();
            calculatedRate = this.cubicSuccess(this.getCurrentTimeInSeconds());
        }
        const newRate = Math.min(calculatedRate, 2 * this.measuredTxRate);
        this.updateTokenBucketRate(newRate);
    }
    calculateTimeWindow() {
        this.timeWindow = this.getPrecise(Math.pow((this.lastMaxRate * (1 - this.beta)) / this.scaleConstant, 1 / 3));
    }
    cubicThrottle(rateToUse) {
        return this.getPrecise(rateToUse * this.beta);
    }
    cubicSuccess(timestamp) {
        return this.getPrecise(this.scaleConstant * Math.pow(timestamp - this.lastThrottleTime - this.timeWindow, 3) + this.lastMaxRate);
    }
    enableTokenBucket() {
        this.enabled = true;
    }
    updateTokenBucketRate(newRate) {
        this.refillTokenBucket();
        this.fillRate = Math.max(newRate, this.minFillRate);
        this.maxCapacity = Math.max(newRate, this.minCapacity);
        this.currentCapacity = Math.min(this.currentCapacity, this.maxCapacity);
    }
    updateMeasuredRate() {
        const t = this.getCurrentTimeInSeconds();
        const timeBucket = Math.floor(t * 2) / 2;
        this.requestCount++;
        if (timeBucket > this.lastTxRateBucket) {
            const currentRate = this.requestCount / (timeBucket - this.lastTxRateBucket);
            this.measuredTxRate = this.getPrecise(currentRate * this.smooth + this.measuredTxRate * (1 - this.smooth));
            this.requestCount = 0;
            this.lastTxRateBucket = timeBucket;
        }
    }
    getPrecise(num) {
        return parseFloat(num.toFixed(8));
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/constants.js
const constants_DEFAULT_RETRY_DELAY_BASE = 100;
const constants_MAXIMUM_RETRY_DELAY = 20 * 1000;
const constants_THROTTLING_RETRY_DELAY_BASE = 500;
const constants_INITIAL_RETRY_TOKENS = 500;
const constants_RETRY_COST = 5;
const constants_TIMEOUT_RETRY_COST = 10;
const constants_NO_RETRY_INCREMENT = 1;
const constants_INVOCATION_ID_HEADER = "amz-sdk-invocation-id";
const constants_REQUEST_HEADER = "amz-sdk-request";

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/defaultRetryBackoffStrategy.js

const getDefaultRetryBackoffStrategy = () => {
    let delayBase = constants_DEFAULT_RETRY_DELAY_BASE;
    const computeNextBackoffDelay = (attempts) => {
        return Math.floor(Math.min(constants_MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));
    };
    const setDelayBase = (delay) => {
        delayBase = delay;
    };
    return {
        computeNextBackoffDelay,
        setDelayBase,
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/defaultRetryToken.js

const createDefaultRetryToken = ({ retryDelay, retryCount, retryCost, }) => {
    const getRetryCount = () => retryCount;
    const getRetryDelay = () => Math.min(constants_MAXIMUM_RETRY_DELAY, retryDelay);
    const getRetryCost = () => retryCost;
    return {
        getRetryCount,
        getRetryDelay,
        getRetryCost,
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/StandardRetryStrategy.js




class StandardRetryStrategy_StandardRetryStrategy {
    constructor(maxAttempts) {
        this.maxAttempts = maxAttempts;
        this.mode = config_RETRY_MODES.STANDARD;
        this.capacity = constants_INITIAL_RETRY_TOKENS;
        this.retryBackoffStrategy = getDefaultRetryBackoffStrategy();
        this.maxAttemptsProvider = typeof maxAttempts === "function" ? maxAttempts : async () => maxAttempts;
    }
    async acquireInitialRetryToken(retryTokenScope) {
        return createDefaultRetryToken({
            retryDelay: constants_DEFAULT_RETRY_DELAY_BASE,
            retryCount: 0,
        });
    }
    async refreshRetryTokenForRetry(token, errorInfo) {
        const maxAttempts = await this.getMaxAttempts();
        if (this.shouldRetry(token, errorInfo, maxAttempts)) {
            const errorType = errorInfo.errorType;
            this.retryBackoffStrategy.setDelayBase(errorType === "THROTTLING" ? constants_THROTTLING_RETRY_DELAY_BASE : constants_DEFAULT_RETRY_DELAY_BASE);
            const delayFromErrorType = this.retryBackoffStrategy.computeNextBackoffDelay(token.getRetryCount());
            const retryDelay = errorInfo.retryAfterHint
                ? Math.max(errorInfo.retryAfterHint.getTime() - Date.now() || 0, delayFromErrorType)
                : delayFromErrorType;
            const capacityCost = this.getCapacityCost(errorType);
            this.capacity -= capacityCost;
            return createDefaultRetryToken({
                retryDelay,
                retryCount: token.getRetryCount() + 1,
                retryCost: capacityCost,
            });
        }
        throw new Error("No retry token available");
    }
    recordSuccess(token) {
        this.capacity = Math.max(constants_INITIAL_RETRY_TOKENS, this.capacity + (token.getRetryCost() ?? constants_NO_RETRY_INCREMENT));
    }
    getCapacity() {
        return this.capacity;
    }
    async getMaxAttempts() {
        try {
            return await this.maxAttemptsProvider();
        }
        catch (error) {
            console.warn(`Max attempts provider could not resolve. Using default of ${config_DEFAULT_MAX_ATTEMPTS}`);
            return config_DEFAULT_MAX_ATTEMPTS;
        }
    }
    shouldRetry(tokenToRenew, errorInfo, maxAttempts) {
        const attempts = tokenToRenew.getRetryCount() + 1;
        return (attempts < maxAttempts &&
            this.capacity >= this.getCapacityCost(errorInfo.errorType) &&
            this.isRetryableError(errorInfo.errorType));
    }
    getCapacityCost(errorType) {
        return errorType === "TRANSIENT" ? constants_TIMEOUT_RETRY_COST : constants_RETRY_COST;
    }
    isRetryableError(errorType) {
        return errorType === "THROTTLING" || errorType === "TRANSIENT";
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/AdaptiveRetryStrategy.js



class AdaptiveRetryStrategy {
    constructor(maxAttemptsProvider, options) {
        this.maxAttemptsProvider = maxAttemptsProvider;
        this.mode = config_RETRY_MODES.ADAPTIVE;
        const { rateLimiter } = options ?? {};
        this.rateLimiter = rateLimiter ?? new DefaultRateLimiter_DefaultRateLimiter();
        this.standardRetryStrategy = new StandardRetryStrategy_StandardRetryStrategy(maxAttemptsProvider);
    }
    async acquireInitialRetryToken(retryTokenScope) {
        await this.rateLimiter.getSendToken();
        return this.standardRetryStrategy.acquireInitialRetryToken(retryTokenScope);
    }
    async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
        this.rateLimiter.updateClientSendingRate(errorInfo);
        return this.standardRetryStrategy.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
    }
    recordSuccess(token) {
        this.rateLimiter.updateClientSendingRate({});
        this.standardRetryStrategy.recordSuccess(token);
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/ConfiguredRetryStrategy.js


class ConfiguredRetryStrategy extends (/* unused pure expression or super */ null && (StandardRetryStrategy)) {
    constructor(maxAttempts, computeNextBackoffDelay = DEFAULT_RETRY_DELAY_BASE) {
        super(typeof maxAttempts === "function" ? maxAttempts : async () => maxAttempts);
        if (typeof computeNextBackoffDelay === "number") {
            this.computeNextBackoffDelay = () => computeNextBackoffDelay;
        }
        else {
            this.computeNextBackoffDelay = computeNextBackoffDelay;
        }
    }
    async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
        const token = await super.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
        token.getRetryDelay = () => this.computeNextBackoffDelay(token.getRetryCount());
        return token;
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-retry/dist-es/index.js








;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/defaultRetryQuota.js

const defaultRetryQuota_getDefaultRetryQuota = (initialRetryTokens, options) => {
    const MAX_CAPACITY = initialRetryTokens;
    const noRetryIncrement = options?.noRetryIncrement ?? NO_RETRY_INCREMENT;
    const retryCost = options?.retryCost ?? RETRY_COST;
    const timeoutRetryCost = options?.timeoutRetryCost ?? TIMEOUT_RETRY_COST;
    let availableCapacity = initialRetryTokens;
    const getCapacityAmount = (error) => (error.name === "TimeoutError" ? timeoutRetryCost : retryCost);
    const hasRetryTokens = (error) => getCapacityAmount(error) <= availableCapacity;
    const retrieveRetryTokens = (error) => {
        if (!hasRetryTokens(error)) {
            throw new Error("No retry token available");
        }
        const capacityAmount = getCapacityAmount(error);
        availableCapacity -= capacityAmount;
        return capacityAmount;
    };
    const releaseRetryTokens = (capacityReleaseAmount) => {
        availableCapacity += capacityReleaseAmount ?? noRetryIncrement;
        availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
    };
    return Object.freeze({
        hasRetryTokens,
        retrieveRetryTokens,
        releaseRetryTokens,
    });
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/delayDecider.js

const delayDecider_defaultDelayDecider = (delayBase, attempts) => Math.floor(Math.min(MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/StandardRetryStrategy.js








class dist_es_StandardRetryStrategy_StandardRetryStrategy {
    constructor(maxAttemptsProvider, options) {
        this.maxAttemptsProvider = maxAttemptsProvider;
        this.mode = RETRY_MODES.STANDARD;
        this.retryDecider = options?.retryDecider ?? defaultRetryDecider;
        this.delayDecider = options?.delayDecider ?? defaultDelayDecider;
        this.retryQuota = options?.retryQuota ?? getDefaultRetryQuota(INITIAL_RETRY_TOKENS);
    }
    shouldRetry(error, attempts, maxAttempts) {
        return attempts < maxAttempts && this.retryDecider(error) && this.retryQuota.hasRetryTokens(error);
    }
    async getMaxAttempts() {
        let maxAttempts;
        try {
            maxAttempts = await this.maxAttemptsProvider();
        }
        catch (error) {
            maxAttempts = DEFAULT_MAX_ATTEMPTS;
        }
        return maxAttempts;
    }
    async retry(next, args, options) {
        let retryTokenAmount;
        let attempts = 0;
        let totalDelay = 0;
        const maxAttempts = await this.getMaxAttempts();
        const { request } = args;
        if (HttpRequest.isInstance(request)) {
            request.headers[INVOCATION_ID_HEADER] = v4();
        }
        while (true) {
            try {
                if (HttpRequest.isInstance(request)) {
                    request.headers[REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
                }
                if (options?.beforeRequest) {
                    await options.beforeRequest();
                }
                const { response, output } = await next(args);
                if (options?.afterRequest) {
                    options.afterRequest(response);
                }
                this.retryQuota.releaseRetryTokens(retryTokenAmount);
                output.$metadata.attempts = attempts + 1;
                output.$metadata.totalRetryDelay = totalDelay;
                return { response, output };
            }
            catch (e) {
                const err = asSdkError(e);
                attempts++;
                if (this.shouldRetry(err, attempts, maxAttempts)) {
                    retryTokenAmount = this.retryQuota.retrieveRetryTokens(err);
                    const delayFromDecider = this.delayDecider(isThrottlingError(err) ? THROTTLING_RETRY_DELAY_BASE : DEFAULT_RETRY_DELAY_BASE, attempts);
                    const delayFromResponse = getDelayFromRetryAfterHeader(err.$response);
                    const delay = Math.max(delayFromResponse || 0, delayFromDecider);
                    totalDelay += delay;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                if (!err.$metadata) {
                    err.$metadata = {};
                }
                err.$metadata.attempts = attempts;
                err.$metadata.totalRetryDelay = totalDelay;
                throw err;
            }
        }
    }
}
const getDelayFromRetryAfterHeader = (response) => {
    if (!HttpResponse.isInstance(response))
        return;
    const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
    if (!retryAfterHeaderName)
        return;
    const retryAfter = response.headers[retryAfterHeaderName];
    const retryAfterSeconds = Number(retryAfter);
    if (!Number.isNaN(retryAfterSeconds))
        return retryAfterSeconds * 1000;
    const retryAfterDate = new Date(retryAfter);
    return retryAfterDate.getTime() - Date.now();
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/AdaptiveRetryStrategy.js


class AdaptiveRetryStrategy_AdaptiveRetryStrategy extends (/* unused pure expression or super */ null && (StandardRetryStrategy)) {
    constructor(maxAttemptsProvider, options) {
        const { rateLimiter, ...superOptions } = options ?? {};
        super(maxAttemptsProvider, superOptions);
        this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
        this.mode = RETRY_MODES.ADAPTIVE;
    }
    async retry(next, args) {
        return super.retry(next, args, {
            beforeRequest: async () => {
                return this.rateLimiter.getSendToken();
            },
            afterRequest: (response) => {
                this.rateLimiter.updateClientSendingRate(response);
            },
        });
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/configurations.js


const ENV_MAX_ATTEMPTS = "AWS_MAX_ATTEMPTS";
const CONFIG_MAX_ATTEMPTS = "max_attempts";
const NODE_MAX_ATTEMPT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => {
        const value = env[ENV_MAX_ATTEMPTS];
        if (!value)
            return undefined;
        const maxAttempt = parseInt(value);
        if (Number.isNaN(maxAttempt)) {
            throw new Error(`Environment variable ${ENV_MAX_ATTEMPTS} mast be a number, got "${value}"`);
        }
        return maxAttempt;
    },
    configFileSelector: (profile) => {
        const value = profile[CONFIG_MAX_ATTEMPTS];
        if (!value)
            return undefined;
        const maxAttempt = parseInt(value);
        if (Number.isNaN(maxAttempt)) {
            throw new Error(`Shared config file entry ${CONFIG_MAX_ATTEMPTS} mast be a number, got "${value}"`);
        }
        return maxAttempt;
    },
    default: config_DEFAULT_MAX_ATTEMPTS,
};
const resolveRetryConfig = (input) => {
    const { retryStrategy } = input;
    const maxAttempts = normalizeProvider_normalizeProvider(input.maxAttempts ?? config_DEFAULT_MAX_ATTEMPTS);
    return {
        ...input,
        maxAttempts,
        retryStrategy: async () => {
            if (retryStrategy) {
                return retryStrategy;
            }
            const retryMode = await normalizeProvider_normalizeProvider(input.retryMode)();
            if (retryMode === config_RETRY_MODES.ADAPTIVE) {
                return new AdaptiveRetryStrategy(maxAttempts);
            }
            return new StandardRetryStrategy_StandardRetryStrategy(maxAttempts);
        },
    };
};
const ENV_RETRY_MODE = "AWS_RETRY_MODE";
const CONFIG_RETRY_MODE = "retry_mode";
const NODE_RETRY_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[ENV_RETRY_MODE],
    configFileSelector: (profile) => profile[CONFIG_RETRY_MODE],
    default: DEFAULT_RETRY_MODE,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/omitRetryHeadersMiddleware.js


const omitRetryHeadersMiddleware = () => (next) => async (args) => {
    const { request } = args;
    if (HttpRequest.isInstance(request)) {
        delete request.headers[INVOCATION_ID_HEADER];
        delete request.headers[REQUEST_HEADER];
    }
    return next(args);
};
const omitRetryHeadersMiddlewareOptions = {
    name: "omitRetryHeadersMiddleware",
    tags: ["RETRY", "HEADERS", "OMIT_RETRY_HEADERS"],
    relation: "before",
    toMiddleware: "awsAuthMiddleware",
    override: true,
};
const getOmitRetryHeadersPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(omitRetryHeadersMiddleware(), omitRetryHeadersMiddlewareOptions);
    },
});

;// CONCATENATED MODULE: external "crypto"
const external_crypto_namespaceObject = require("crypto");
var external_crypto_default = /*#__PURE__*/__webpack_require__.n(external_crypto_namespaceObject);
;// CONCATENATED MODULE: ./node_modules/uuid/dist/esm-node/rng.js

const rnds8Pool = new Uint8Array(256); // # of random values to pre-allocate

let poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    external_crypto_default().randomFillSync(rnds8Pool);
    poolPtr = 0;
  }

  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
;// CONCATENATED MODULE: ./node_modules/uuid/dist/esm-node/regex.js
/* harmony default export */ const regex = (/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i);
;// CONCATENATED MODULE: ./node_modules/uuid/dist/esm-node/validate.js


function validate(uuid) {
  return typeof uuid === 'string' && regex.test(uuid);
}

/* harmony default export */ const esm_node_validate = (validate);
;// CONCATENATED MODULE: ./node_modules/uuid/dist/esm-node/stringify.js

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */

const byteToHex = [];

for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).substr(1));
}

function stringify(arr, offset = 0) {
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase(); // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields

  if (!esm_node_validate(uuid)) {
    throw TypeError('Stringified UUID is invalid');
  }

  return uuid;
}

/* harmony default export */ const esm_node_stringify = (stringify);
;// CONCATENATED MODULE: ./node_modules/uuid/dist/esm-node/v4.js



function v4_v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || rng)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

  if (buf) {
    offset = offset || 0;

    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return esm_node_stringify(rnds);
}

/* harmony default export */ const esm_node_v4 = (v4_v4);
;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/util.js
const util_asSdkError = (error) => {
    if (error instanceof Error)
        return error;
    if (error instanceof Object)
        return Object.assign(new Error(), error);
    if (typeof error === "string")
        return new Error(error);
    return new Error(`AWS SDK error wrapper for ${error}`);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/retryMiddleware.js





const retryMiddleware = (options) => (next, context) => async (args) => {
    let retryStrategy = await options.retryStrategy();
    const maxAttempts = await options.maxAttempts();
    if (isRetryStrategyV2(retryStrategy)) {
        retryStrategy = retryStrategy;
        let retryToken = await retryStrategy.acquireInitialRetryToken(context["partition_id"]);
        let lastError = new Error();
        let attempts = 0;
        let totalRetryDelay = 0;
        const { request } = args;
        if (httpRequest_HttpRequest.isInstance(request)) {
            request.headers[constants_INVOCATION_ID_HEADER] = esm_node_v4();
        }
        while (true) {
            try {
                if (httpRequest_HttpRequest.isInstance(request)) {
                    request.headers[constants_REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
                }
                const { response, output } = await next(args);
                retryStrategy.recordSuccess(retryToken);
                output.$metadata.attempts = attempts + 1;
                output.$metadata.totalRetryDelay = totalRetryDelay;
                return { response, output };
            }
            catch (e) {
                const retryErrorInfo = getRetryErrorInfo(e);
                lastError = util_asSdkError(e);
                try {
                    retryToken = await retryStrategy.refreshRetryTokenForRetry(retryToken, retryErrorInfo);
                }
                catch (refreshError) {
                    if (!lastError.$metadata) {
                        lastError.$metadata = {};
                    }
                    lastError.$metadata.attempts = attempts + 1;
                    lastError.$metadata.totalRetryDelay = totalRetryDelay;
                    throw lastError;
                }
                attempts = retryToken.getRetryCount();
                const delay = retryToken.getRetryDelay();
                totalRetryDelay += delay;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    else {
        retryStrategy = retryStrategy;
        if (retryStrategy?.mode)
            context.userAgent = [...(context.userAgent || []), ["cfg/retry-mode", retryStrategy.mode]];
        return retryStrategy.retry(next, args);
    }
};
const isRetryStrategyV2 = (retryStrategy) => typeof retryStrategy.acquireInitialRetryToken !== "undefined" &&
    typeof retryStrategy.refreshRetryTokenForRetry !== "undefined" &&
    typeof retryStrategy.recordSuccess !== "undefined";
const getRetryErrorInfo = (error) => {
    const errorInfo = {
        errorType: getRetryErrorType(error),
    };
    const retryAfterHint = getRetryAfterHint(error.$response);
    if (retryAfterHint) {
        errorInfo.retryAfterHint = retryAfterHint;
    }
    return errorInfo;
};
const getRetryErrorType = (error) => {
    if (dist_es_isThrottlingError(error))
        return "THROTTLING";
    if (isTransientError(error))
        return "TRANSIENT";
    if (isServerError(error))
        return "SERVER_ERROR";
    return "CLIENT_ERROR";
};
const retryMiddlewareOptions = {
    name: "retryMiddleware",
    tags: ["RETRY"],
    step: "finalizeRequest",
    priority: "high",
    override: true,
};
const getRetryPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(retryMiddleware(options), retryMiddlewareOptions);
    },
});
const getRetryAfterHint = (response) => {
    if (!httpResponse_HttpResponse.isInstance(response))
        return;
    const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
    if (!retryAfterHeaderName)
        return;
    const retryAfter = response.headers[retryAfterHeaderName];
    const retryAfterSeconds = Number(retryAfter);
    if (!Number.isNaN(retryAfterSeconds))
        return new Date(retryAfterSeconds * 1000);
    const retryAfterDate = new Date(retryAfter);
    return retryAfterDate;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-retry/dist-es/index.js








;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/NoOpLogger.js
class NoOpLogger {
    trace() { }
    debug() { }
    info() { }
    warn() { }
    error() { }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-stack/dist-es/MiddlewareStack.js
const constructStack = () => {
    let absoluteEntries = [];
    let relativeEntries = [];
    const entriesNameSet = new Set();
    const sort = (entries) => entries.sort((a, b) => stepWeights[b.step] - stepWeights[a.step] ||
        priorityWeights[b.priority || "normal"] - priorityWeights[a.priority || "normal"]);
    const removeByName = (toRemove) => {
        let isRemoved = false;
        const filterCb = (entry) => {
            if (entry.name && entry.name === toRemove) {
                isRemoved = true;
                entriesNameSet.delete(toRemove);
                return false;
            }
            return true;
        };
        absoluteEntries = absoluteEntries.filter(filterCb);
        relativeEntries = relativeEntries.filter(filterCb);
        return isRemoved;
    };
    const removeByReference = (toRemove) => {
        let isRemoved = false;
        const filterCb = (entry) => {
            if (entry.middleware === toRemove) {
                isRemoved = true;
                if (entry.name)
                    entriesNameSet.delete(entry.name);
                return false;
            }
            return true;
        };
        absoluteEntries = absoluteEntries.filter(filterCb);
        relativeEntries = relativeEntries.filter(filterCb);
        return isRemoved;
    };
    const cloneTo = (toStack) => {
        absoluteEntries.forEach((entry) => {
            toStack.add(entry.middleware, { ...entry });
        });
        relativeEntries.forEach((entry) => {
            toStack.addRelativeTo(entry.middleware, { ...entry });
        });
        return toStack;
    };
    const expandRelativeMiddlewareList = (from) => {
        const expandedMiddlewareList = [];
        from.before.forEach((entry) => {
            if (entry.before.length === 0 && entry.after.length === 0) {
                expandedMiddlewareList.push(entry);
            }
            else {
                expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
            }
        });
        expandedMiddlewareList.push(from);
        from.after.reverse().forEach((entry) => {
            if (entry.before.length === 0 && entry.after.length === 0) {
                expandedMiddlewareList.push(entry);
            }
            else {
                expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
            }
        });
        return expandedMiddlewareList;
    };
    const getMiddlewareList = (debug = false) => {
        const normalizedAbsoluteEntries = [];
        const normalizedRelativeEntries = [];
        const normalizedEntriesNameMap = {};
        absoluteEntries.forEach((entry) => {
            const normalizedEntry = {
                ...entry,
                before: [],
                after: [],
            };
            if (normalizedEntry.name)
                normalizedEntriesNameMap[normalizedEntry.name] = normalizedEntry;
            normalizedAbsoluteEntries.push(normalizedEntry);
        });
        relativeEntries.forEach((entry) => {
            const normalizedEntry = {
                ...entry,
                before: [],
                after: [],
            };
            if (normalizedEntry.name)
                normalizedEntriesNameMap[normalizedEntry.name] = normalizedEntry;
            normalizedRelativeEntries.push(normalizedEntry);
        });
        normalizedRelativeEntries.forEach((entry) => {
            if (entry.toMiddleware) {
                const toMiddleware = normalizedEntriesNameMap[entry.toMiddleware];
                if (toMiddleware === undefined) {
                    if (debug) {
                        return;
                    }
                    throw new Error(`${entry.toMiddleware} is not found when adding ${entry.name || "anonymous"} middleware ${entry.relation} ${entry.toMiddleware}`);
                }
                if (entry.relation === "after") {
                    toMiddleware.after.push(entry);
                }
                if (entry.relation === "before") {
                    toMiddleware.before.push(entry);
                }
            }
        });
        const mainChain = sort(normalizedAbsoluteEntries)
            .map(expandRelativeMiddlewareList)
            .reduce((wholeList, expandedMiddlewareList) => {
            wholeList.push(...expandedMiddlewareList);
            return wholeList;
        }, []);
        return mainChain;
    };
    const stack = {
        add: (middleware, options = {}) => {
            const { name, override } = options;
            const entry = {
                step: "initialize",
                priority: "normal",
                middleware,
                ...options,
            };
            if (name) {
                if (entriesNameSet.has(name)) {
                    if (!override)
                        throw new Error(`Duplicate middleware name '${name}'`);
                    const toOverrideIndex = absoluteEntries.findIndex((entry) => entry.name === name);
                    const toOverride = absoluteEntries[toOverrideIndex];
                    if (toOverride.step !== entry.step || toOverride.priority !== entry.priority) {
                        throw new Error(`"${name}" middleware with ${toOverride.priority} priority in ${toOverride.step} step cannot be ` +
                            `overridden by same-name middleware with ${entry.priority} priority in ${entry.step} step.`);
                    }
                    absoluteEntries.splice(toOverrideIndex, 1);
                }
                entriesNameSet.add(name);
            }
            absoluteEntries.push(entry);
        },
        addRelativeTo: (middleware, options) => {
            const { name, override } = options;
            const entry = {
                middleware,
                ...options,
            };
            if (name) {
                if (entriesNameSet.has(name)) {
                    if (!override)
                        throw new Error(`Duplicate middleware name '${name}'`);
                    const toOverrideIndex = relativeEntries.findIndex((entry) => entry.name === name);
                    const toOverride = relativeEntries[toOverrideIndex];
                    if (toOverride.toMiddleware !== entry.toMiddleware || toOverride.relation !== entry.relation) {
                        throw new Error(`"${name}" middleware ${toOverride.relation} "${toOverride.toMiddleware}" middleware cannot be overridden ` +
                            `by same-name middleware ${entry.relation} "${entry.toMiddleware}" middleware.`);
                    }
                    relativeEntries.splice(toOverrideIndex, 1);
                }
                entriesNameSet.add(name);
            }
            relativeEntries.push(entry);
        },
        clone: () => cloneTo(constructStack()),
        use: (plugin) => {
            plugin.applyToStack(stack);
        },
        remove: (toRemove) => {
            if (typeof toRemove === "string")
                return removeByName(toRemove);
            else
                return removeByReference(toRemove);
        },
        removeByTag: (toRemove) => {
            let isRemoved = false;
            const filterCb = (entry) => {
                const { tags, name } = entry;
                if (tags && tags.includes(toRemove)) {
                    if (name)
                        entriesNameSet.delete(name);
                    isRemoved = true;
                    return false;
                }
                return true;
            };
            absoluteEntries = absoluteEntries.filter(filterCb);
            relativeEntries = relativeEntries.filter(filterCb);
            return isRemoved;
        },
        concat: (from) => {
            const cloned = cloneTo(constructStack());
            cloned.use(from);
            return cloned;
        },
        applyToStack: cloneTo,
        identify: () => {
            return getMiddlewareList(true).map((mw) => {
                return mw.name + ": " + (mw.tags || []).join(",");
            });
        },
        resolve: (handler, context) => {
            for (const middleware of getMiddlewareList()
                .map((entry) => entry.middleware)
                .reverse()) {
                handler = middleware(handler, context);
            }
            return handler;
        },
    };
    return stack;
};
const stepWeights = {
    initialize: 5,
    serialize: 4,
    build: 3,
    finalizeRequest: 2,
    deserialize: 1,
};
const priorityWeights = {
    high: 3,
    normal: 2,
    low: 1,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/middleware-stack/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/client.js

class Client {
    constructor(config) {
        this.middlewareStack = constructStack();
        this.config = config;
    }
    send(command, optionsOrCb, cb) {
        const options = typeof optionsOrCb !== "function" ? optionsOrCb : undefined;
        const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const handler = command.resolveMiddleware(this.middlewareStack, this.config, options);
        if (callback) {
            handler(command)
                .then((result) => callback(null, result.output), (err) => callback(err))
                .catch(() => { });
        }
        else {
            return handler(command).then((result) => result.output);
        }
    }
    destroy() {
        if (this.config.requestHandler.destroy)
            this.config.requestHandler.destroy();
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-base64/dist-es/fromBase64.js

const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const fromBase64 = (input) => {
    if ((input.length * 3) % 4 !== 0) {
        throw new TypeError(`Incorrect padding on base64 string.`);
    }
    if (!BASE64_REGEX.exec(input)) {
        throw new TypeError(`Invalid base64 string.`);
    }
    const buffer = fromString(input, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-base64/dist-es/toBase64.js

const toBase64 = (input) => dist_es_fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("base64");

;// CONCATENATED MODULE: ./node_modules/@smithy/util-base64/dist-es/index.js



;// CONCATENATED MODULE: ./node_modules/@smithy/util-stream/dist-es/blob/transforms.js



function transformToString(payload, encoding = "utf-8") {
    if (encoding === "base64") {
        return toBase64(payload);
    }
    return toUtf8(payload);
}
function transformFromString(str, encoding) {
    if (encoding === "base64") {
        return Uint8ArrayBlobAdapter.mutate(fromBase64(str));
    }
    return Uint8ArrayBlobAdapter.mutate(fromUtf8(str));
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-stream/dist-es/blob/Uint8ArrayBlobAdapter.js

class Uint8ArrayBlobAdapter extends Uint8Array {
    static fromString(source, encoding = "utf-8") {
        switch (typeof source) {
            case "string":
                return transformFromString(source, encoding);
            default:
                throw new Error(`Unsupported conversion from ${typeof source} to Uint8ArrayBlobAdapter.`);
        }
    }
    static mutate(source) {
        Object.setPrototypeOf(source, Uint8ArrayBlobAdapter.prototype);
        return source;
    }
    transformToString(encoding = "utf-8") {
        return transformToString(this, encoding);
    }
}

;// CONCATENATED MODULE: external "stream"
const external_stream_namespaceObject = require("stream");
;// CONCATENATED MODULE: ./node_modules/@smithy/util-stream/dist-es/getAwsChunkedEncodingStream.js

const getAwsChunkedEncodingStream = (readableStream, options) => {
    const { base64Encoder, bodyLengthChecker, checksumAlgorithmFn, checksumLocationName, streamHasher } = options;
    const checksumRequired = base64Encoder !== undefined &&
        checksumAlgorithmFn !== undefined &&
        checksumLocationName !== undefined &&
        streamHasher !== undefined;
    const digest = checksumRequired ? streamHasher(checksumAlgorithmFn, readableStream) : undefined;
    const awsChunkedEncodingStream = new Readable({ read: () => { } });
    readableStream.on("data", (data) => {
        const length = bodyLengthChecker(data) || 0;
        awsChunkedEncodingStream.push(`${length.toString(16)}\r\n`);
        awsChunkedEncodingStream.push(data);
        awsChunkedEncodingStream.push("\r\n");
    });
    readableStream.on("end", async () => {
        awsChunkedEncodingStream.push(`0\r\n`);
        if (checksumRequired) {
            const checksum = base64Encoder(await digest);
            awsChunkedEncodingStream.push(`${checksumLocationName}:${checksum}\r\n`);
            awsChunkedEncodingStream.push(`\r\n`);
        }
        awsChunkedEncodingStream.push(null);
    });
    return awsChunkedEncodingStream;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/querystring-builder/dist-es/index.js

function dist_es_buildQueryString(query) {
    const parts = [];
    for (let key of Object.keys(query).sort()) {
        const value = query[key];
        key = escapeUri(key);
        if (Array.isArray(value)) {
            for (let i = 0, iLen = value.length; i < iLen; i++) {
                parts.push(`${key}=${escapeUri(value[i])}`);
            }
        }
        else {
            let qsEntry = key;
            if (value || typeof value === "string") {
                qsEntry += `=${escapeUri(value)}`;
            }
            parts.push(qsEntry);
        }
    }
    return parts.join("&");
}

;// CONCATENATED MODULE: external "http"
const external_http_namespaceObject = require("http");
;// CONCATENATED MODULE: external "https"
const external_https_namespaceObject = require("https");
;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/constants.js
const constants_NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "EPIPE", "ETIMEDOUT"];

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/get-transformed-headers.js
const get_transformed_headers_getTransformedHeaders = (headers) => {
    const transformedHeaders = {};
    for (const name of Object.keys(headers)) {
        const headerValues = headers[name];
        transformedHeaders[name] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
    }
    return transformedHeaders;
};


;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/set-connection-timeout.js
const setConnectionTimeout = (request, reject, timeoutInMs = 0) => {
    if (!timeoutInMs) {
        return;
    }
    const timeoutId = setTimeout(() => {
        request.destroy();
        reject(Object.assign(new Error(`Socket timed out without establishing a connection within ${timeoutInMs} ms`), {
            name: "TimeoutError",
        }));
    }, timeoutInMs);
    request.on("socket", (socket) => {
        if (socket.connecting) {
            socket.on("connect", () => {
                clearTimeout(timeoutId);
            });
        }
        else {
            clearTimeout(timeoutId);
        }
    });
};

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/set-socket-keep-alive.js
const setSocketKeepAlive = (request, { keepAlive, keepAliveMsecs }) => {
    if (keepAlive !== true) {
        return;
    }
    request.on("socket", (socket) => {
        socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
    });
};

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/set-socket-timeout.js
const setSocketTimeout = (request, reject, timeoutInMs = 0) => {
    request.setTimeout(timeoutInMs, () => {
        request.destroy();
        reject(Object.assign(new Error(`Connection timed out after ${timeoutInMs} ms`), { name: "TimeoutError" }));
    });
};

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/write-request-body.js

const MIN_WAIT_TIME = 1000;
async function write_request_body_writeRequestBody(httpRequest, request, maxContinueTimeoutMs = MIN_WAIT_TIME) {
    const headers = request.headers ?? {};
    const expect = headers["Expect"] || headers["expect"];
    let timeoutId = -1;
    let hasError = false;
    if (expect === "100-continue") {
        await Promise.race([
            new Promise((resolve) => {
                timeoutId = Number(setTimeout(resolve, Math.max(MIN_WAIT_TIME, maxContinueTimeoutMs)));
            }),
            new Promise((resolve) => {
                httpRequest.on("continue", () => {
                    clearTimeout(timeoutId);
                    resolve();
                });
                httpRequest.on("error", () => {
                    hasError = true;
                    clearTimeout(timeoutId);
                    resolve();
                });
            }),
        ]);
    }
    if (!hasError) {
        writeBody(httpRequest, request.body);
    }
}
function writeBody(httpRequest, body) {
    if (body instanceof external_stream_namespaceObject.Readable) {
        body.pipe(httpRequest);
    }
    else if (body) {
        httpRequest.end(Buffer.from(body));
    }
    else {
        httpRequest.end();
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/node-http-handler.js










const DEFAULT_REQUEST_TIMEOUT = 0;
class NodeHttpHandler {
    constructor(options) {
        this.metadata = { handlerProtocol: "http/1.1" };
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((_options) => {
                    resolve(this.resolveDefaultConfig(_options));
                })
                    .catch(reject);
            }
            else {
                resolve(this.resolveDefaultConfig(options));
            }
        });
    }
    resolveDefaultConfig(options) {
        const { requestTimeout, connectionTimeout, socketTimeout, httpAgent, httpsAgent } = options || {};
        const keepAlive = true;
        const maxSockets = 50;
        return {
            connectionTimeout,
            requestTimeout: requestTimeout ?? socketTimeout,
            httpAgent: httpAgent || new external_http_namespaceObject.Agent({ keepAlive, maxSockets }),
            httpsAgent: httpsAgent || new external_https_namespaceObject.Agent({ keepAlive, maxSockets }),
        };
    }
    destroy() {
        this.config?.httpAgent?.destroy();
        this.config?.httpsAgent?.destroy();
    }
    async handle(request, { abortSignal } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
        }
        return new Promise((_resolve, _reject) => {
            let writeRequestBodyPromise = undefined;
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                _reject(arg);
            };
            if (!this.config) {
                throw new Error("Node HTTP request handler config is not resolved");
            }
            if (abortSignal?.aborted) {
                const abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                reject(abortError);
                return;
            }
            const isSSL = request.protocol === "https:";
            const queryString = dist_es_buildQueryString(request.query || {});
            let auth = undefined;
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}`;
            }
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            const nodeHttpsOptions = {
                headers: request.headers,
                host: request.hostname,
                method: request.method,
                path,
                port: request.port,
                agent: isSSL ? this.config.httpsAgent : this.config.httpAgent,
                auth,
            };
            const requestFunc = isSSL ? external_https_namespaceObject.request : external_http_namespaceObject.request;
            const req = requestFunc(nodeHttpsOptions, (res) => {
                const httpResponse = new httpResponse_HttpResponse({
                    statusCode: res.statusCode || -1,
                    reason: res.statusMessage,
                    headers: get_transformed_headers_getTransformedHeaders(res.headers),
                    body: res,
                });
                resolve({ response: httpResponse });
            });
            req.on("error", (err) => {
                if (constants_NODEJS_TIMEOUT_ERROR_CODES.includes(err.code)) {
                    reject(Object.assign(err, { name: "TimeoutError" }));
                }
                else {
                    reject(err);
                }
            });
            setConnectionTimeout(req, reject, this.config.connectionTimeout);
            setSocketTimeout(req, reject, this.config.requestTimeout);
            if (abortSignal) {
                abortSignal.onabort = () => {
                    req.abort();
                    const abortError = new Error("Request aborted");
                    abortError.name = "AbortError";
                    reject(abortError);
                };
            }
            const httpAgent = nodeHttpsOptions.agent;
            if (typeof httpAgent === "object" && "keepAlive" in httpAgent) {
                setSocketKeepAlive(req, {
                    keepAlive: httpAgent.keepAlive,
                    keepAliveMsecs: httpAgent.keepAliveMsecs,
                });
            }
            writeRequestBodyPromise = write_request_body_writeRequestBody(req, request, this.config.requestTimeout).catch(_reject);
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
}

;// CONCATENATED MODULE: external "http2"
const external_http2_namespaceObject = require("http2");
;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/node-http2-connection-pool.js
class node_http2_connection_pool_NodeHttp2ConnectionPool {
    constructor(sessions) {
        this.sessions = [];
        this.sessions = sessions ?? [];
    }
    poll() {
        if (this.sessions.length > 0) {
            return this.sessions.shift();
        }
    }
    offerLast(session) {
        this.sessions.push(session);
    }
    contains(session) {
        return this.sessions.includes(session);
    }
    remove(session) {
        this.sessions = this.sessions.filter((s) => s !== session);
    }
    [Symbol.iterator]() {
        return this.sessions[Symbol.iterator]();
    }
    destroy(connection) {
        for (const session of this.sessions) {
            if (session === connection) {
                if (!session.destroyed) {
                    session.destroy();
                }
            }
        }
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/node-http2-connection-manager.js


class node_http2_connection_manager_NodeHttp2ConnectionManager {
    constructor(config) {
        this.sessionCache = new Map();
        this.config = config;
        if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) {
            throw new RangeError("maxConcurrency must be greater than zero.");
        }
    }
    lease(requestContext, connectionConfiguration) {
        const url = this.getUrlString(requestContext);
        const existingPool = this.sessionCache.get(url);
        if (existingPool) {
            const existingSession = existingPool.poll();
            if (existingSession && !this.config.disableConcurrency) {
                return existingSession;
            }
        }
        const session = http2.connect(url);
        if (this.config.maxConcurrency) {
            session.settings({ maxConcurrentStreams: this.config.maxConcurrency }, (err) => {
                if (err) {
                    throw new Error("Fail to set maxConcurrentStreams to " +
                        this.config.maxConcurrency +
                        "when creating new session for " +
                        requestContext.destination.toString());
                }
            });
        }
        session.unref();
        const destroySessionCb = () => {
            session.destroy();
            this.deleteSession(url, session);
        };
        session.on("goaway", destroySessionCb);
        session.on("error", destroySessionCb);
        session.on("frameError", destroySessionCb);
        session.on("close", () => this.deleteSession(url, session));
        if (connectionConfiguration.requestTimeout) {
            session.setTimeout(connectionConfiguration.requestTimeout, destroySessionCb);
        }
        const connectionPool = this.sessionCache.get(url) || new NodeHttp2ConnectionPool();
        connectionPool.offerLast(session);
        this.sessionCache.set(url, connectionPool);
        return session;
    }
    deleteSession(authority, session) {
        const existingConnectionPool = this.sessionCache.get(authority);
        if (!existingConnectionPool) {
            return;
        }
        if (!existingConnectionPool.contains(session)) {
            return;
        }
        existingConnectionPool.remove(session);
        this.sessionCache.set(authority, existingConnectionPool);
    }
    release(requestContext, session) {
        const cacheKey = this.getUrlString(requestContext);
        this.sessionCache.get(cacheKey)?.offerLast(session);
    }
    destroy() {
        for (const [key, connectionPool] of this.sessionCache) {
            for (const session of connectionPool) {
                if (!session.destroyed) {
                    session.destroy();
                }
                connectionPool.remove(session);
            }
            this.sessionCache.delete(key);
        }
    }
    setMaxConcurrentStreams(maxConcurrentStreams) {
        if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) {
            throw new RangeError("maxConcurrentStreams must be greater than zero.");
        }
        this.config.maxConcurrency = maxConcurrentStreams;
    }
    setDisableConcurrentStreams(disableConcurrentStreams) {
        this.config.disableConcurrency = disableConcurrentStreams;
    }
    getUrlString(request) {
        return request.destination.toString();
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/node-http2-handler.js






class NodeHttp2Handler {
    constructor(options) {
        this.metadata = { handlerProtocol: "h2" };
        this.connectionManager = new NodeHttp2ConnectionManager({});
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((opts) => {
                    resolve(opts || {});
                })
                    .catch(reject);
            }
            else {
                resolve(options || {});
            }
        });
    }
    destroy() {
        this.connectionManager.destroy();
    }
    async handle(request, { abortSignal } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
            this.connectionManager.setDisableConcurrentStreams(this.config.disableConcurrentStreams || false);
            if (this.config.maxConcurrentStreams) {
                this.connectionManager.setMaxConcurrentStreams(this.config.maxConcurrentStreams);
            }
        }
        const { requestTimeout, disableConcurrentStreams } = this.config;
        return new Promise((_resolve, _reject) => {
            let fulfilled = false;
            let writeRequestBodyPromise = undefined;
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                _reject(arg);
            };
            if (abortSignal?.aborted) {
                fulfilled = true;
                const abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                reject(abortError);
                return;
            }
            const { hostname, method, port, protocol, query } = request;
            let auth = "";
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}@`;
            }
            const authority = `${protocol}//${auth}${hostname}${port ? `:${port}` : ""}`;
            const requestContext = { destination: new URL(authority) };
            const session = this.connectionManager.lease(requestContext, {
                requestTimeout: this.config?.sessionTimeout,
                disableConcurrentStreams: disableConcurrentStreams || false,
            });
            const rejectWithDestroy = (err) => {
                if (disableConcurrentStreams) {
                    this.destroySession(session);
                }
                fulfilled = true;
                reject(err);
            };
            const queryString = buildQueryString(query || {});
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            const req = session.request({
                ...request.headers,
                [constants.HTTP2_HEADER_PATH]: path,
                [constants.HTTP2_HEADER_METHOD]: method,
            });
            session.ref();
            req.on("response", (headers) => {
                const httpResponse = new HttpResponse({
                    statusCode: headers[":status"] || -1,
                    headers: getTransformedHeaders(headers),
                    body: req,
                });
                fulfilled = true;
                resolve({ response: httpResponse });
                if (disableConcurrentStreams) {
                    session.close();
                    this.connectionManager.deleteSession(authority, session);
                }
            });
            if (requestTimeout) {
                req.setTimeout(requestTimeout, () => {
                    req.close();
                    const timeoutError = new Error(`Stream timed out because of no activity for ${requestTimeout} ms`);
                    timeoutError.name = "TimeoutError";
                    rejectWithDestroy(timeoutError);
                });
            }
            if (abortSignal) {
                abortSignal.onabort = () => {
                    req.close();
                    const abortError = new Error("Request aborted");
                    abortError.name = "AbortError";
                    rejectWithDestroy(abortError);
                };
            }
            req.on("frameError", (type, code, id) => {
                rejectWithDestroy(new Error(`Frame type id ${type} in stream id ${id} has failed with code ${code}.`));
            });
            req.on("error", rejectWithDestroy);
            req.on("aborted", () => {
                rejectWithDestroy(new Error(`HTTP/2 stream is abnormally aborted in mid-communication with result code ${req.rstCode}.`));
            });
            req.on("close", () => {
                session.unref();
                if (disableConcurrentStreams) {
                    session.destroy();
                }
                if (!fulfilled) {
                    rejectWithDestroy(new Error("Unexpected error: http2 request did not get a response"));
                }
            });
            writeRequestBodyPromise = writeRequestBody(req, request, requestTimeout);
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
    destroySession(session) {
        if (!session.destroyed) {
            session.destroy();
        }
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/stream-collector/collector.js

class Collector extends external_stream_namespaceObject.Writable {
    constructor() {
        super(...arguments);
        this.bufferedBytes = [];
    }
    _write(chunk, encoding, callback) {
        this.bufferedBytes.push(chunk);
        callback();
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/stream-collector/index.js

const stream_collector_streamCollector = (stream) => new Promise((resolve, reject) => {
    const collector = new Collector();
    stream.pipe(collector);
    stream.on("error", (err) => {
        collector.end();
        reject(err);
    });
    collector.on("error", reject);
    collector.on("finish", function () {
        const bytes = new Uint8Array(Buffer.concat(this.bufferedBytes));
        resolve(bytes);
    });
});

;// CONCATENATED MODULE: ./node_modules/@smithy/node-http-handler/dist-es/index.js




;// CONCATENATED MODULE: external "util"
const external_util_namespaceObject = require("util");
;// CONCATENATED MODULE: ./node_modules/@smithy/util-stream/dist-es/sdk-stream-mixin.js




const ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED = "The stream has already been transformed.";
const sdkStreamMixin = (stream) => {
    if (!(stream instanceof Readable)) {
        const name = stream?.__proto__?.constructor?.name || stream;
        throw new Error(`Unexpected stream implementation, expect Stream.Readable instance, got ${name}`);
    }
    let transformed = false;
    const transformToByteArray = async () => {
        if (transformed) {
            throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
        }
        transformed = true;
        return await streamCollector(stream);
    };
    return Object.assign(stream, {
        transformToByteArray,
        transformToString: async (encoding) => {
            const buf = await transformToByteArray();
            if (encoding === undefined || Buffer.isEncoding(encoding)) {
                return fromArrayBuffer(buf.buffer, buf.byteOffset, buf.byteLength).toString(encoding);
            }
            else {
                const decoder = new TextDecoder(encoding);
                return decoder.decode(buf);
            }
        },
        transformToWebStream: () => {
            if (transformed) {
                throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
            }
            if (stream.readableFlowing !== null) {
                throw new Error("The stream has been consumed by other callbacks.");
            }
            if (typeof Readable.toWeb !== "function") {
                throw new Error("Readable.toWeb() is not supported. Please make sure you are using Node.js >= 17.0.0, or polyfill is available.");
            }
            transformed = true;
            return Readable.toWeb(stream);
        },
    });
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-stream/dist-es/index.js




;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/collect-stream-body.js

const collect_stream_body_collectBody = async (streamBody = new Uint8Array(), context) => {
    if (streamBody instanceof Uint8Array) {
        return Uint8ArrayBlobAdapter.mutate(streamBody);
    }
    if (!streamBody) {
        return Uint8ArrayBlobAdapter.mutate(new Uint8Array());
    }
    const fromContext = context.streamCollector(streamBody);
    return Uint8ArrayBlobAdapter.mutate(await fromContext);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/command.js

class Command {
    constructor() {
        this.middlewareStack = constructStack();
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/constants.js
const constants_SENSITIVE_STRING = "***SensitiveInformation***";

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/create-aggregated-client.js
const createAggregatedClient = (commands, Client) => {
    for (const command of Object.keys(commands)) {
        const CommandCtor = commands[command];
        const methodImpl = async function (args, optionsOrCb, cb) {
            const command = new CommandCtor(args);
            if (typeof optionsOrCb === "function") {
                this.send(command, optionsOrCb);
            }
            else if (typeof cb === "function") {
                if (typeof optionsOrCb !== "object")
                    throw new Error(`Expected http options but got ${typeof optionsOrCb}`);
                this.send(command, optionsOrCb || {}, cb);
            }
            else {
                return this.send(command, optionsOrCb);
            }
        };
        const methodName = (command[0].toLowerCase() + command.slice(1)).replace(/Command$/, "");
        Client.prototype[methodName] = methodImpl;
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/parse-utils.js
const parseBoolean = (value) => {
    switch (value) {
        case "true":
            return true;
        case "false":
            return false;
        default:
            throw new Error(`Unable to parse boolean value "${value}"`);
    }
};
const expectBoolean = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "number") {
        if (value === 0 || value === 1) {
            logger.warn(stackTraceWarning(`Expected boolean, got ${typeof value}: ${value}`));
        }
        if (value === 0) {
            return false;
        }
        if (value === 1) {
            return true;
        }
    }
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "false" || lower === "true") {
            logger.warn(stackTraceWarning(`Expected boolean, got ${typeof value}: ${value}`));
        }
        if (lower === "false") {
            return false;
        }
        if (lower === "true") {
            return true;
        }
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new TypeError(`Expected boolean, got ${typeof value}: ${value}`);
};
const expectNumber = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) {
            if (String(parsed) !== String(value)) {
                logger.warn(stackTraceWarning(`Expected number but observed string: ${value}`));
            }
            return parsed;
        }
    }
    if (typeof value === "number") {
        return value;
    }
    throw new TypeError(`Expected number, got ${typeof value}: ${value}`);
};
const MAX_FLOAT = Math.ceil(2 ** 127 * (2 - 2 ** -23));
const expectFloat32 = (value) => {
    const expected = expectNumber(value);
    if (expected !== undefined && !Number.isNaN(expected) && expected !== Infinity && expected !== -Infinity) {
        if (Math.abs(expected) > MAX_FLOAT) {
            throw new TypeError(`Expected 32-bit float, got ${value}`);
        }
    }
    return expected;
};
const expectLong = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (Number.isInteger(value) && !Number.isNaN(value)) {
        return value;
    }
    throw new TypeError(`Expected integer, got ${typeof value}: ${value}`);
};
const expectInt = (/* unused pure expression or super */ null && (expectLong));
const expectInt32 = (value) => expectSizedInt(value, 32);
const expectShort = (value) => expectSizedInt(value, 16);
const expectByte = (value) => expectSizedInt(value, 8);
const expectSizedInt = (value, size) => {
    const expected = expectLong(value);
    if (expected !== undefined && castInt(expected, size) !== expected) {
        throw new TypeError(`Expected ${size}-bit integer, got ${value}`);
    }
    return expected;
};
const castInt = (value, size) => {
    switch (size) {
        case 32:
            return Int32Array.of(value)[0];
        case 16:
            return Int16Array.of(value)[0];
        case 8:
            return Int8Array.of(value)[0];
    }
};
const expectNonNull = (value, location) => {
    if (value === null || value === undefined) {
        if (location) {
            throw new TypeError(`Expected a non-null value for ${location}`);
        }
        throw new TypeError("Expected a non-null value");
    }
    return value;
};
const expectObject = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    const receivedType = Array.isArray(value) ? "array" : typeof value;
    throw new TypeError(`Expected object, got ${receivedType}: ${value}`);
};
const expectString = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    if (["boolean", "number", "bigint"].includes(typeof value)) {
        logger.warn(stackTraceWarning(`Expected string, got ${typeof value}: ${value}`));
        return String(value);
    }
    throw new TypeError(`Expected string, got ${typeof value}: ${value}`);
};
const expectUnion = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    const asObject = expectObject(value);
    const setKeys = Object.entries(asObject)
        .filter(([, v]) => v != null)
        .map(([k]) => k);
    if (setKeys.length === 0) {
        throw new TypeError(`Unions must have exactly one non-null member. None were found.`);
    }
    if (setKeys.length > 1) {
        throw new TypeError(`Unions must have exactly one non-null member. Keys ${setKeys} were not null.`);
    }
    return asObject;
};
const parse_utils_strictParseDouble = (value) => {
    if (typeof value == "string") {
        return expectNumber(parseNumber(value));
    }
    return expectNumber(value);
};
const strictParseFloat = parse_utils_strictParseDouble;
const strictParseFloat32 = (value) => {
    if (typeof value == "string") {
        return expectFloat32(parseNumber(value));
    }
    return expectFloat32(value);
};
const NUMBER_REGEX = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(-?Infinity)|(NaN)/g;
const parseNumber = (value) => {
    const matches = value.match(NUMBER_REGEX);
    if (matches === null || matches[0].length !== value.length) {
        throw new TypeError(`Expected real number, got implicit NaN`);
    }
    return parseFloat(value);
};
const limitedParseDouble = (value) => {
    if (typeof value == "string") {
        return parseFloatString(value);
    }
    return expectNumber(value);
};
const handleFloat = (/* unused pure expression or super */ null && (limitedParseDouble));
const limitedParseFloat = (/* unused pure expression or super */ null && (limitedParseDouble));
const limitedParseFloat32 = (value) => {
    if (typeof value == "string") {
        return parseFloatString(value);
    }
    return expectFloat32(value);
};
const parseFloatString = (value) => {
    switch (value) {
        case "NaN":
            return NaN;
        case "Infinity":
            return Infinity;
        case "-Infinity":
            return -Infinity;
        default:
            throw new Error(`Unable to parse float value: ${value}`);
    }
};
const strictParseLong = (value) => {
    if (typeof value === "string") {
        return expectLong(parseNumber(value));
    }
    return expectLong(value);
};
const strictParseInt = (/* unused pure expression or super */ null && (strictParseLong));
const strictParseInt32 = (value) => {
    if (typeof value === "string") {
        return expectInt32(parseNumber(value));
    }
    return expectInt32(value);
};
const parse_utils_strictParseShort = (value) => {
    if (typeof value === "string") {
        return expectShort(parseNumber(value));
    }
    return expectShort(value);
};
const strictParseByte = (value) => {
    if (typeof value === "string") {
        return expectByte(parseNumber(value));
    }
    return expectByte(value);
};
const stackTraceWarning = (message) => {
    return String(new TypeError(message).stack || message)
        .split("\n")
        .slice(0, 5)
        .filter((s) => !s.includes("stackTraceWarning"))
        .join("\n");
};
const logger = {
    warn: console.warn,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/date-utils.js

const DAYS = (/* unused pure expression or super */ null && (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateToUtcString(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const dayOfWeek = date.getUTCDay();
    const dayOfMonthInt = date.getUTCDate();
    const hoursInt = date.getUTCHours();
    const minutesInt = date.getUTCMinutes();
    const secondsInt = date.getUTCSeconds();
    const dayOfMonthString = dayOfMonthInt < 10 ? `0${dayOfMonthInt}` : `${dayOfMonthInt}`;
    const hoursString = hoursInt < 10 ? `0${hoursInt}` : `${hoursInt}`;
    const minutesString = minutesInt < 10 ? `0${minutesInt}` : `${minutesInt}`;
    const secondsString = secondsInt < 10 ? `0${secondsInt}` : `${secondsInt}`;
    return `${DAYS[dayOfWeek]}, ${dayOfMonthString} ${MONTHS[month]} ${year} ${hoursString}:${minutesString}:${secondsString} GMT`;
}
const RFC3339 = (/* unused pure expression or super */ null && (new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?[zZ]$/)));
const parseRfc3339DateTime = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-3339 date-times must be expressed as strings");
    }
    const match = RFC3339.exec(value);
    if (!match) {
        throw new TypeError("Invalid RFC-3339 date-time value");
    }
    const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds] = match;
    const year = strictParseShort(stripLeadingZeroes(yearStr));
    const month = parseDateValue(monthStr, "month", 1, 12);
    const day = parseDateValue(dayStr, "day", 1, 31);
    return buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
};
const RFC3339_WITH_OFFSET = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(([-+]\d{2}\:\d{2})|[zZ])$/);
const parseRfc3339DateTimeWithOffset = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-3339 date-times must be expressed as strings");
    }
    const match = RFC3339_WITH_OFFSET.exec(value);
    if (!match) {
        throw new TypeError("Invalid RFC-3339 date-time value");
    }
    const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, offsetStr] = match;
    const year = parse_utils_strictParseShort(stripLeadingZeroes(yearStr));
    const month = parseDateValue(monthStr, "month", 1, 12);
    const day = parseDateValue(dayStr, "day", 1, 31);
    const date = buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
    if (offsetStr.toUpperCase() != "Z") {
        date.setTime(date.getTime() - parseOffsetToMilliseconds(offsetStr));
    }
    return date;
};
const IMF_FIXDATE = (/* unused pure expression or super */ null && (new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/)));
const RFC_850_DATE = (/* unused pure expression or super */ null && (new RegExp(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/)));
const ASC_TIME = (/* unused pure expression or super */ null && (new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( [1-9]|\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? (\d{4})$/)));
const parseRfc7231DateTime = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-7231 date-times must be expressed as strings");
    }
    let match = IMF_FIXDATE.exec(value);
    if (match) {
        const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
        return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
    }
    match = RFC_850_DATE.exec(value);
    if (match) {
        const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
        return adjustRfc850Year(buildDate(parseTwoDigitYear(yearStr), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), {
            hours,
            minutes,
            seconds,
            fractionalMilliseconds,
        }));
    }
    match = ASC_TIME.exec(value);
    if (match) {
        const [_, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, yearStr] = match;
        return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr.trimLeft(), "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
    }
    throw new TypeError("Invalid RFC-7231 date-time value");
};
const parseEpochTimestamp = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    let valueAsDouble;
    if (typeof value === "number") {
        valueAsDouble = value;
    }
    else if (typeof value === "string") {
        valueAsDouble = strictParseDouble(value);
    }
    else {
        throw new TypeError("Epoch timestamps must be expressed as floating point numbers or their string representation");
    }
    if (Number.isNaN(valueAsDouble) || valueAsDouble === Infinity || valueAsDouble === -Infinity) {
        throw new TypeError("Epoch timestamps must be valid, non-Infinite, non-NaN numerics");
    }
    return new Date(Math.round(valueAsDouble * 1000));
};
const buildDate = (year, month, day, time) => {
    const adjustedMonth = month - 1;
    validateDayOfMonth(year, adjustedMonth, day);
    return new Date(Date.UTC(year, adjustedMonth, day, parseDateValue(time.hours, "hour", 0, 23), parseDateValue(time.minutes, "minute", 0, 59), parseDateValue(time.seconds, "seconds", 0, 60), parseMilliseconds(time.fractionalMilliseconds)));
};
const parseTwoDigitYear = (value) => {
    const thisYear = new Date().getUTCFullYear();
    const valueInThisCentury = Math.floor(thisYear / 100) * 100 + strictParseShort(stripLeadingZeroes(value));
    if (valueInThisCentury < thisYear) {
        return valueInThisCentury + 100;
    }
    return valueInThisCentury;
};
const FIFTY_YEARS_IN_MILLIS = (/* unused pure expression or super */ null && (50 * 365 * 24 * 60 * 60 * 1000));
const adjustRfc850Year = (input) => {
    if (input.getTime() - new Date().getTime() > FIFTY_YEARS_IN_MILLIS) {
        return new Date(Date.UTC(input.getUTCFullYear() - 100, input.getUTCMonth(), input.getUTCDate(), input.getUTCHours(), input.getUTCMinutes(), input.getUTCSeconds(), input.getUTCMilliseconds()));
    }
    return input;
};
const parseMonthByShortName = (value) => {
    const monthIdx = MONTHS.indexOf(value);
    if (monthIdx < 0) {
        throw new TypeError(`Invalid month: ${value}`);
    }
    return monthIdx + 1;
};
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validateDayOfMonth = (year, month, day) => {
    let maxDays = DAYS_IN_MONTH[month];
    if (month === 1 && isLeapYear(year)) {
        maxDays = 29;
    }
    if (day > maxDays) {
        throw new TypeError(`Invalid day for ${MONTHS[month]} in ${year}: ${day}`);
    }
};
const isLeapYear = (year) => {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
};
const parseDateValue = (value, type, lower, upper) => {
    const dateVal = strictParseByte(stripLeadingZeroes(value));
    if (dateVal < lower || dateVal > upper) {
        throw new TypeError(`${type} must be between ${lower} and ${upper}, inclusive`);
    }
    return dateVal;
};
const parseMilliseconds = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    return strictParseFloat32("0." + value) * 1000;
};
const parseOffsetToMilliseconds = (value) => {
    const directionStr = value[0];
    let direction = 1;
    if (directionStr == "+") {
        direction = 1;
    }
    else if (directionStr == "-") {
        direction = -1;
    }
    else {
        throw new TypeError(`Offset direction, ${directionStr}, must be "+" or "-"`);
    }
    const hour = Number(value.substring(1, 3));
    const minute = Number(value.substring(4, 6));
    return direction * (hour * 60 + minute) * 60 * 1000;
};
const stripLeadingZeroes = (value) => {
    let idx = 0;
    while (idx < value.length - 1 && value.charAt(idx) === "0") {
        idx++;
    }
    if (idx === 0) {
        return value;
    }
    return value.slice(idx);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/exceptions.js
class ServiceException extends Error {
    constructor(options) {
        super(options.message);
        Object.setPrototypeOf(this, ServiceException.prototype);
        this.name = options.name;
        this.$fault = options.$fault;
        this.$metadata = options.$metadata;
    }
}
const decorateServiceException = (exception, additions = {}) => {
    Object.entries(additions)
        .filter(([, v]) => v !== undefined)
        .forEach(([k, v]) => {
        if (exception[k] == undefined || exception[k] === "") {
            exception[k] = v;
        }
    });
    const message = exception.message || exception.Message || "UnknownError";
    exception.message = message;
    delete exception.Message;
    return exception;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/default-error-handler.js

const throwDefaultError = ({ output, parsedBody, exceptionCtor, errorCode }) => {
    const $metadata = deserializeMetadata(output);
    const statusCode = $metadata.httpStatusCode ? $metadata.httpStatusCode + "" : undefined;
    const response = new exceptionCtor({
        name: parsedBody?.code || parsedBody?.Code || errorCode || statusCode || "UnknownError",
        $fault: "client",
        $metadata,
    });
    throw decorateServiceException(response, parsedBody);
};
const withBaseException = (ExceptionCtor) => {
    return ({ output, parsedBody, errorCode }) => {
        throwDefaultError({ output, parsedBody, exceptionCtor: ExceptionCtor, errorCode });
    };
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/defaults-mode.js
const loadConfigsForDefaultMode = (mode) => {
    switch (mode) {
        case "standard":
            return {
                retryMode: "standard",
                connectionTimeout: 3100,
            };
        case "in-region":
            return {
                retryMode: "standard",
                connectionTimeout: 1100,
            };
        case "cross-region":
            return {
                retryMode: "standard",
                connectionTimeout: 3100,
            };
        case "mobile":
            return {
                retryMode: "standard",
                connectionTimeout: 30000,
            };
        default:
            return {};
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/emitWarningIfUnsupportedVersion.js
let warningEmitted = false;
const emitWarningIfUnsupportedVersion = (version) => {
    if (version && !warningEmitted && parseInt(version.substring(1, version.indexOf("."))) < 14) {
        warningEmitted = true;
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/extensions/checksum.js


const extensions_checksum_getChecksumConfiguration = (runtimeConfig) => {
    const checksumAlgorithms = [];
    for (const id in AlgorithmId) {
        const algorithmId = AlgorithmId[id];
        if (runtimeConfig[algorithmId] === undefined) {
            continue;
        }
        checksumAlgorithms.push({
            algorithmId: () => algorithmId,
            checksumConstructor: () => runtimeConfig[algorithmId],
        });
    }
    return {
        _checksumAlgorithms: checksumAlgorithms,
        addChecksumAlgorithm(algo) {
            this._checksumAlgorithms.push(algo);
        },
        checksumAlgorithms() {
            return this._checksumAlgorithms;
        },
    };
};
const extensions_checksum_resolveChecksumRuntimeConfig = (clientConfig) => {
    const runtimeConfig = {};
    clientConfig.checksumAlgorithms().forEach((checksumAlgorithm) => {
        runtimeConfig[checksumAlgorithm.algorithmId()] = checksumAlgorithm.checksumConstructor();
    });
    return runtimeConfig;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/extensions/retry.js
const getRetryConfiguration = (runtimeConfig) => {
    let _retryStrategy = runtimeConfig.retryStrategy;
    return {
        setRetryStrategy(retryStrategy) {
            _retryStrategy = retryStrategy;
        },
        retryStrategy() {
            return _retryStrategy;
        },
    };
};
const resolveRetryRuntimeConfig = (retryStrategyConfiguration) => {
    const runtimeConfig = {};
    runtimeConfig.retryStrategy = retryStrategyConfiguration.retryStrategy();
    return runtimeConfig;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/extensions/defaultExtensionConfiguration.js


const getDefaultExtensionConfiguration = (runtimeConfig) => {
    return {
        ...extensions_checksum_getChecksumConfiguration(runtimeConfig),
        ...getRetryConfiguration(runtimeConfig),
    };
};
const defaultExtensionConfiguration_getDefaultClientConfiguration = (/* unused pure expression or super */ null && (getDefaultExtensionConfiguration));
const defaultExtensionConfiguration_resolveDefaultRuntimeConfig = (config) => {
    return {
        ...extensions_checksum_resolveChecksumRuntimeConfig(config),
        ...resolveRetryRuntimeConfig(config),
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/extensions/index.js


;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/extended-encode-uri-component.js
function extendedEncodeURIComponent(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
        return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/get-array-if-single-item.js
const getArrayIfSingleItem = (mayBeArray) => Array.isArray(mayBeArray) ? mayBeArray : [mayBeArray];

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/get-value-from-text-node.js
const getValueFromTextNode = (obj) => {
    const textNodeName = "#text";
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key][textNodeName] !== undefined) {
            obj[key] = obj[key][textNodeName];
        }
        else if (typeof obj[key] === "object" && obj[key] !== null) {
            obj[key] = getValueFromTextNode(obj[key]);
        }
    }
    return obj;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/lazy-json.js
const StringWrapper = function () {
    const Class = Object.getPrototypeOf(this).constructor;
    const Constructor = Function.bind.apply(String, [null, ...arguments]);
    const instance = new Constructor();
    Object.setPrototypeOf(instance, Class.prototype);
    return instance;
};
StringWrapper.prototype = Object.create(String.prototype, {
    constructor: {
        value: StringWrapper,
        enumerable: false,
        writable: true,
        configurable: true,
    },
});
Object.setPrototypeOf(StringWrapper, String);
class LazyJsonString extends (/* unused pure expression or super */ null && (StringWrapper)) {
    deserializeJSON() {
        return JSON.parse(super.toString());
    }
    toJSON() {
        return super.toString();
    }
    static fromObject(object) {
        if (object instanceof LazyJsonString) {
            return object;
        }
        else if (object instanceof String || typeof object === "string") {
            return new LazyJsonString(object);
        }
        return new LazyJsonString(JSON.stringify(object));
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/object-mapping.js
function object_mapping_map(arg0, arg1, arg2) {
    let target;
    let filter;
    let instructions;
    if (typeof arg1 === "undefined" && typeof arg2 === "undefined") {
        target = {};
        instructions = arg0;
    }
    else {
        target = arg0;
        if (typeof arg1 === "function") {
            filter = arg1;
            instructions = arg2;
            return mapWithFilter(target, filter, instructions);
        }
        else {
            instructions = arg1;
        }
    }
    for (const key of Object.keys(instructions)) {
        if (!Array.isArray(instructions[key])) {
            target[key] = instructions[key];
            continue;
        }
        applyInstruction(target, null, instructions, key);
    }
    return target;
}
const convertMap = (target) => {
    const output = {};
    for (const [k, v] of Object.entries(target || {})) {
        output[k] = [, v];
    }
    return output;
};
const object_mapping_take = (source, instructions) => {
    const out = {};
    for (const key in instructions) {
        applyInstruction(out, source, instructions, key);
    }
    return out;
};
const mapWithFilter = (target, filter, instructions) => {
    return object_mapping_map(target, Object.entries(instructions).reduce((_instructions, [key, value]) => {
        if (Array.isArray(value)) {
            _instructions[key] = value;
        }
        else {
            if (typeof value === "function") {
                _instructions[key] = [filter, value()];
            }
            else {
                _instructions[key] = [filter, value];
            }
        }
        return _instructions;
    }, {}));
};
const applyInstruction = (target, source, instructions, targetKey) => {
    if (source !== null) {
        let instruction = instructions[targetKey];
        if (typeof instruction === "function") {
            instruction = [, instruction];
        }
        const [filter = nonNullish, valueFn = pass, sourceKey = targetKey] = instruction;
        if ((typeof filter === "function" && filter(source[sourceKey])) || (typeof filter !== "function" && !!filter)) {
            target[targetKey] = valueFn(source[sourceKey]);
        }
        return;
    }
    let [filter, value] = instructions[targetKey];
    if (typeof value === "function") {
        let _value;
        const defaultFilterPassed = filter === undefined && (_value = value()) != null;
        const customFilterPassed = (typeof filter === "function" && !!filter(void 0)) || (typeof filter !== "function" && !!filter);
        if (defaultFilterPassed) {
            target[targetKey] = _value;
        }
        else if (customFilterPassed) {
            target[targetKey] = value();
        }
    }
    else {
        const defaultFilterPassed = filter === undefined && value != null;
        const customFilterPassed = (typeof filter === "function" && !!filter(value)) || (typeof filter !== "function" && !!filter);
        if (defaultFilterPassed || customFilterPassed) {
            target[targetKey] = value;
        }
    }
};
const nonNullish = (_) => _ != null;
const pass = (_) => _;

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/serde-json.js
const serde_json_json = (obj) => {
    if (obj == null) {
        return {};
    }
    if (Array.isArray(obj)) {
        return obj.filter((_) => _ != null);
    }
    if (typeof obj === "object") {
        const target = {};
        for (const key of Object.keys(obj)) {
            if (obj[key] == null) {
                continue;
            }
            target[key] = serde_json_json(obj[key]);
        }
        return target;
    }
    return obj;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/smithy-client/dist-es/index.js























;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/endpoint/EndpointParameters.js
const resolveClientEndpointParameters = (options) => {
    return {
        ...options,
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "ses",
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/package.json
const package_namespaceObject = {"i8":"3.413.0"};
;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/models/STSServiceException.js


class STSServiceException extends ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, STSServiceException.prototype);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/models/models_0.js


class ExpiredTokenException extends STSServiceException {
    constructor(opts) {
        super({
            name: "ExpiredTokenException",
            $fault: "client",
            ...opts,
        });
        this.name = "ExpiredTokenException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ExpiredTokenException.prototype);
    }
}
class MalformedPolicyDocumentException extends STSServiceException {
    constructor(opts) {
        super({
            name: "MalformedPolicyDocumentException",
            $fault: "client",
            ...opts,
        });
        this.name = "MalformedPolicyDocumentException";
        this.$fault = "client";
        Object.setPrototypeOf(this, MalformedPolicyDocumentException.prototype);
    }
}
class PackedPolicyTooLargeException extends STSServiceException {
    constructor(opts) {
        super({
            name: "PackedPolicyTooLargeException",
            $fault: "client",
            ...opts,
        });
        this.name = "PackedPolicyTooLargeException";
        this.$fault = "client";
        Object.setPrototypeOf(this, PackedPolicyTooLargeException.prototype);
    }
}
class RegionDisabledException extends STSServiceException {
    constructor(opts) {
        super({
            name: "RegionDisabledException",
            $fault: "client",
            ...opts,
        });
        this.name = "RegionDisabledException";
        this.$fault = "client";
        Object.setPrototypeOf(this, RegionDisabledException.prototype);
    }
}
class IDPRejectedClaimException extends STSServiceException {
    constructor(opts) {
        super({
            name: "IDPRejectedClaimException",
            $fault: "client",
            ...opts,
        });
        this.name = "IDPRejectedClaimException";
        this.$fault = "client";
        Object.setPrototypeOf(this, IDPRejectedClaimException.prototype);
    }
}
class InvalidIdentityTokenException extends STSServiceException {
    constructor(opts) {
        super({
            name: "InvalidIdentityTokenException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidIdentityTokenException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidIdentityTokenException.prototype);
    }
}
class IDPCommunicationErrorException extends STSServiceException {
    constructor(opts) {
        super({
            name: "IDPCommunicationErrorException",
            $fault: "client",
            ...opts,
        });
        this.name = "IDPCommunicationErrorException";
        this.$fault = "client";
        Object.setPrototypeOf(this, IDPCommunicationErrorException.prototype);
    }
}
class models_0_InvalidAuthorizationMessageException extends (/* unused pure expression or super */ null && (__BaseException)) {
    constructor(opts) {
        super({
            name: "InvalidAuthorizationMessageException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidAuthorizationMessageException";
        this.$fault = "client";
        Object.setPrototypeOf(this, models_0_InvalidAuthorizationMessageException.prototype);
    }
}
const CredentialsFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.SecretAccessKey && { SecretAccessKey: constants_SENSITIVE_STRING }),
});
const AssumeRoleResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.Credentials && { Credentials: CredentialsFilterSensitiveLog(obj.Credentials) }),
});
const AssumeRoleWithSAMLRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.SAMLAssertion && { SAMLAssertion: SENSITIVE_STRING }),
});
const AssumeRoleWithSAMLResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.Credentials && { Credentials: CredentialsFilterSensitiveLog(obj.Credentials) }),
});
const AssumeRoleWithWebIdentityRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.WebIdentityToken && { WebIdentityToken: constants_SENSITIVE_STRING }),
});
const AssumeRoleWithWebIdentityResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.Credentials && { Credentials: CredentialsFilterSensitiveLog(obj.Credentials) }),
});
const GetFederationTokenResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.Credentials && { Credentials: CredentialsFilterSensitiveLog(obj.Credentials) }),
});
const GetSessionTokenResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.Credentials && { Credentials: CredentialsFilterSensitiveLog(obj.Credentials) }),
});

// EXTERNAL MODULE: ./node_modules/fast-xml-parser/src/fxp.js
var fxp = __webpack_require__(932);
;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/protocols/Aws_query.js





const se_AssumeRoleCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_AssumeRoleRequest(input, context),
        Action: "AssumeRole",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_AssumeRoleWithSAMLCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_AssumeRoleWithSAMLRequest(input, context),
        Action: "AssumeRoleWithSAML",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_AssumeRoleWithWebIdentityCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_AssumeRoleWithWebIdentityRequest(input, context),
        Action: "AssumeRoleWithWebIdentity",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DecodeAuthorizationMessageCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_DecodeAuthorizationMessageRequest(input, context),
        Action: "DecodeAuthorizationMessage",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetAccessKeyInfoCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_GetAccessKeyInfoRequest(input, context),
        Action: "GetAccessKeyInfo",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetCallerIdentityCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_GetCallerIdentityRequest(input, context),
        Action: "GetCallerIdentity",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetFederationTokenCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_GetFederationTokenRequest(input, context),
        Action: "GetFederationToken",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetSessionTokenCommand = async (input, context) => {
    const headers = SHARED_HEADERS;
    let body;
    body = buildFormUrlencodedString({
        ...se_GetSessionTokenRequest(input, context),
        Action: "GetSessionToken",
        Version: "2011-06-15",
    });
    return buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const de_AssumeRoleCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_AssumeRoleCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_AssumeRoleResponse(data.AssumeRoleResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_AssumeRoleCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ExpiredTokenException":
        case "com.amazonaws.sts#ExpiredTokenException":
            throw await de_ExpiredTokenExceptionRes(parsedOutput, context);
        case "MalformedPolicyDocument":
        case "com.amazonaws.sts#MalformedPolicyDocumentException":
            throw await de_MalformedPolicyDocumentExceptionRes(parsedOutput, context);
        case "PackedPolicyTooLarge":
        case "com.amazonaws.sts#PackedPolicyTooLargeException":
            throw await de_PackedPolicyTooLargeExceptionRes(parsedOutput, context);
        case "RegionDisabledException":
        case "com.amazonaws.sts#RegionDisabledException":
            throw await de_RegionDisabledExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_AssumeRoleWithSAMLCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_AssumeRoleWithSAMLCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_AssumeRoleWithSAMLResponse(data.AssumeRoleWithSAMLResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_AssumeRoleWithSAMLCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ExpiredTokenException":
        case "com.amazonaws.sts#ExpiredTokenException":
            throw await de_ExpiredTokenExceptionRes(parsedOutput, context);
        case "IDPRejectedClaim":
        case "com.amazonaws.sts#IDPRejectedClaimException":
            throw await de_IDPRejectedClaimExceptionRes(parsedOutput, context);
        case "InvalidIdentityToken":
        case "com.amazonaws.sts#InvalidIdentityTokenException":
            throw await de_InvalidIdentityTokenExceptionRes(parsedOutput, context);
        case "MalformedPolicyDocument":
        case "com.amazonaws.sts#MalformedPolicyDocumentException":
            throw await de_MalformedPolicyDocumentExceptionRes(parsedOutput, context);
        case "PackedPolicyTooLarge":
        case "com.amazonaws.sts#PackedPolicyTooLargeException":
            throw await de_PackedPolicyTooLargeExceptionRes(parsedOutput, context);
        case "RegionDisabledException":
        case "com.amazonaws.sts#RegionDisabledException":
            throw await de_RegionDisabledExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_AssumeRoleWithWebIdentityCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_AssumeRoleWithWebIdentityCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_AssumeRoleWithWebIdentityResponse(data.AssumeRoleWithWebIdentityResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_AssumeRoleWithWebIdentityCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ExpiredTokenException":
        case "com.amazonaws.sts#ExpiredTokenException":
            throw await de_ExpiredTokenExceptionRes(parsedOutput, context);
        case "IDPCommunicationError":
        case "com.amazonaws.sts#IDPCommunicationErrorException":
            throw await de_IDPCommunicationErrorExceptionRes(parsedOutput, context);
        case "IDPRejectedClaim":
        case "com.amazonaws.sts#IDPRejectedClaimException":
            throw await de_IDPRejectedClaimExceptionRes(parsedOutput, context);
        case "InvalidIdentityToken":
        case "com.amazonaws.sts#InvalidIdentityTokenException":
            throw await de_InvalidIdentityTokenExceptionRes(parsedOutput, context);
        case "MalformedPolicyDocument":
        case "com.amazonaws.sts#MalformedPolicyDocumentException":
            throw await de_MalformedPolicyDocumentExceptionRes(parsedOutput, context);
        case "PackedPolicyTooLarge":
        case "com.amazonaws.sts#PackedPolicyTooLargeException":
            throw await de_PackedPolicyTooLargeExceptionRes(parsedOutput, context);
        case "RegionDisabledException":
        case "com.amazonaws.sts#RegionDisabledException":
            throw await de_RegionDisabledExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DecodeAuthorizationMessageCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DecodeAuthorizationMessageCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_DecodeAuthorizationMessageResponse(data.DecodeAuthorizationMessageResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DecodeAuthorizationMessageCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidAuthorizationMessageException":
        case "com.amazonaws.sts#InvalidAuthorizationMessageException":
            throw await de_InvalidAuthorizationMessageExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_GetAccessKeyInfoCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetAccessKeyInfoCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_GetAccessKeyInfoResponse(data.GetAccessKeyInfoResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetAccessKeyInfoCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetCallerIdentityCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetCallerIdentityCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_GetCallerIdentityResponse(data.GetCallerIdentityResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetCallerIdentityCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetFederationTokenCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetFederationTokenCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_GetFederationTokenResponse(data.GetFederationTokenResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetFederationTokenCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "MalformedPolicyDocument":
        case "com.amazonaws.sts#MalformedPolicyDocumentException":
            throw await de_MalformedPolicyDocumentExceptionRes(parsedOutput, context);
        case "PackedPolicyTooLarge":
        case "com.amazonaws.sts#PackedPolicyTooLargeException":
            throw await de_PackedPolicyTooLargeExceptionRes(parsedOutput, context);
        case "RegionDisabledException":
        case "com.amazonaws.sts#RegionDisabledException":
            throw await de_RegionDisabledExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_GetSessionTokenCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetSessionTokenCommandError(output, context);
    }
    const data = await parseBody(output.body, context);
    let contents = {};
    contents = de_GetSessionTokenResponse(data.GetSessionTokenResult, context);
    const response = {
        $metadata: Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetSessionTokenCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseErrorBody(output.body, context),
    };
    const errorCode = loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RegionDisabledException":
        case "com.amazonaws.sts#RegionDisabledException":
            throw await de_RegionDisabledExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_ExpiredTokenExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_ExpiredTokenException(body.Error, context);
    const exception = new ExpiredTokenException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_IDPCommunicationErrorExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_IDPCommunicationErrorException(body.Error, context);
    const exception = new IDPCommunicationErrorException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_IDPRejectedClaimExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_IDPRejectedClaimException(body.Error, context);
    const exception = new IDPRejectedClaimException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidAuthorizationMessageExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidAuthorizationMessageException(body.Error, context);
    const exception = new InvalidAuthorizationMessageException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return __decorateServiceException(exception, body);
};
const de_InvalidIdentityTokenExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidIdentityTokenException(body.Error, context);
    const exception = new InvalidIdentityTokenException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_MalformedPolicyDocumentExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_MalformedPolicyDocumentException(body.Error, context);
    const exception = new MalformedPolicyDocumentException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_PackedPolicyTooLargeExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_PackedPolicyTooLargeException(body.Error, context);
    const exception = new PackedPolicyTooLargeException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_RegionDisabledExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_RegionDisabledException(body.Error, context);
    const exception = new RegionDisabledException({
        $metadata: Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const se_AssumeRoleRequest = (input, context) => {
    const entries = {};
    if (input.RoleArn != null) {
        entries["RoleArn"] = input.RoleArn;
    }
    if (input.RoleSessionName != null) {
        entries["RoleSessionName"] = input.RoleSessionName;
    }
    if (input.PolicyArns != null) {
        const memberEntries = se_policyDescriptorListType(input.PolicyArns, context);
        if (input.PolicyArns?.length === 0) {
            entries.PolicyArns = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `PolicyArns.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Policy != null) {
        entries["Policy"] = input.Policy;
    }
    if (input.DurationSeconds != null) {
        entries["DurationSeconds"] = input.DurationSeconds;
    }
    if (input.Tags != null) {
        const memberEntries = se_tagListType(input.Tags, context);
        if (input.Tags?.length === 0) {
            entries.Tags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Tags.${key}`;
            entries[loc] = value;
        });
    }
    if (input.TransitiveTagKeys != null) {
        const memberEntries = se_tagKeyListType(input.TransitiveTagKeys, context);
        if (input.TransitiveTagKeys?.length === 0) {
            entries.TransitiveTagKeys = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `TransitiveTagKeys.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ExternalId != null) {
        entries["ExternalId"] = input.ExternalId;
    }
    if (input.SerialNumber != null) {
        entries["SerialNumber"] = input.SerialNumber;
    }
    if (input.TokenCode != null) {
        entries["TokenCode"] = input.TokenCode;
    }
    if (input.SourceIdentity != null) {
        entries["SourceIdentity"] = input.SourceIdentity;
    }
    if (input.ProvidedContexts != null) {
        const memberEntries = se_ProvidedContextsListType(input.ProvidedContexts, context);
        if (input.ProvidedContexts?.length === 0) {
            entries.ProvidedContexts = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ProvidedContexts.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_AssumeRoleWithSAMLRequest = (input, context) => {
    const entries = {};
    if (input.RoleArn != null) {
        entries["RoleArn"] = input.RoleArn;
    }
    if (input.PrincipalArn != null) {
        entries["PrincipalArn"] = input.PrincipalArn;
    }
    if (input.SAMLAssertion != null) {
        entries["SAMLAssertion"] = input.SAMLAssertion;
    }
    if (input.PolicyArns != null) {
        const memberEntries = se_policyDescriptorListType(input.PolicyArns, context);
        if (input.PolicyArns?.length === 0) {
            entries.PolicyArns = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `PolicyArns.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Policy != null) {
        entries["Policy"] = input.Policy;
    }
    if (input.DurationSeconds != null) {
        entries["DurationSeconds"] = input.DurationSeconds;
    }
    return entries;
};
const se_AssumeRoleWithWebIdentityRequest = (input, context) => {
    const entries = {};
    if (input.RoleArn != null) {
        entries["RoleArn"] = input.RoleArn;
    }
    if (input.RoleSessionName != null) {
        entries["RoleSessionName"] = input.RoleSessionName;
    }
    if (input.WebIdentityToken != null) {
        entries["WebIdentityToken"] = input.WebIdentityToken;
    }
    if (input.ProviderId != null) {
        entries["ProviderId"] = input.ProviderId;
    }
    if (input.PolicyArns != null) {
        const memberEntries = se_policyDescriptorListType(input.PolicyArns, context);
        if (input.PolicyArns?.length === 0) {
            entries.PolicyArns = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `PolicyArns.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Policy != null) {
        entries["Policy"] = input.Policy;
    }
    if (input.DurationSeconds != null) {
        entries["DurationSeconds"] = input.DurationSeconds;
    }
    return entries;
};
const se_DecodeAuthorizationMessageRequest = (input, context) => {
    const entries = {};
    if (input.EncodedMessage != null) {
        entries["EncodedMessage"] = input.EncodedMessage;
    }
    return entries;
};
const se_GetAccessKeyInfoRequest = (input, context) => {
    const entries = {};
    if (input.AccessKeyId != null) {
        entries["AccessKeyId"] = input.AccessKeyId;
    }
    return entries;
};
const se_GetCallerIdentityRequest = (input, context) => {
    const entries = {};
    return entries;
};
const se_GetFederationTokenRequest = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    if (input.Policy != null) {
        entries["Policy"] = input.Policy;
    }
    if (input.PolicyArns != null) {
        const memberEntries = se_policyDescriptorListType(input.PolicyArns, context);
        if (input.PolicyArns?.length === 0) {
            entries.PolicyArns = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `PolicyArns.${key}`;
            entries[loc] = value;
        });
    }
    if (input.DurationSeconds != null) {
        entries["DurationSeconds"] = input.DurationSeconds;
    }
    if (input.Tags != null) {
        const memberEntries = se_tagListType(input.Tags, context);
        if (input.Tags?.length === 0) {
            entries.Tags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Tags.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_GetSessionTokenRequest = (input, context) => {
    const entries = {};
    if (input.DurationSeconds != null) {
        entries["DurationSeconds"] = input.DurationSeconds;
    }
    if (input.SerialNumber != null) {
        entries["SerialNumber"] = input.SerialNumber;
    }
    if (input.TokenCode != null) {
        entries["TokenCode"] = input.TokenCode;
    }
    return entries;
};
const se_policyDescriptorListType = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_PolicyDescriptorType(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_PolicyDescriptorType = (input, context) => {
    const entries = {};
    if (input.arn != null) {
        entries["arn"] = input.arn;
    }
    return entries;
};
const se_ProvidedContext = (input, context) => {
    const entries = {};
    if (input.ProviderArn != null) {
        entries["ProviderArn"] = input.ProviderArn;
    }
    if (input.ContextAssertion != null) {
        entries["ContextAssertion"] = input.ContextAssertion;
    }
    return entries;
};
const se_ProvidedContextsListType = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_ProvidedContext(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_Tag = (input, context) => {
    const entries = {};
    if (input.Key != null) {
        entries["Key"] = input.Key;
    }
    if (input.Value != null) {
        entries["Value"] = input.Value;
    }
    return entries;
};
const se_tagKeyListType = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_tagListType = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_Tag(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const de_AssumedRoleUser = (output, context) => {
    const contents = {};
    if (output["AssumedRoleId"] !== undefined) {
        contents.AssumedRoleId = expectString(output["AssumedRoleId"]);
    }
    if (output["Arn"] !== undefined) {
        contents.Arn = expectString(output["Arn"]);
    }
    return contents;
};
const de_AssumeRoleResponse = (output, context) => {
    const contents = {};
    if (output["Credentials"] !== undefined) {
        contents.Credentials = de_Credentials(output["Credentials"], context);
    }
    if (output["AssumedRoleUser"] !== undefined) {
        contents.AssumedRoleUser = de_AssumedRoleUser(output["AssumedRoleUser"], context);
    }
    if (output["PackedPolicySize"] !== undefined) {
        contents.PackedPolicySize = strictParseInt32(output["PackedPolicySize"]);
    }
    if (output["SourceIdentity"] !== undefined) {
        contents.SourceIdentity = expectString(output["SourceIdentity"]);
    }
    return contents;
};
const de_AssumeRoleWithSAMLResponse = (output, context) => {
    const contents = {};
    if (output["Credentials"] !== undefined) {
        contents.Credentials = de_Credentials(output["Credentials"], context);
    }
    if (output["AssumedRoleUser"] !== undefined) {
        contents.AssumedRoleUser = de_AssumedRoleUser(output["AssumedRoleUser"], context);
    }
    if (output["PackedPolicySize"] !== undefined) {
        contents.PackedPolicySize = __strictParseInt32(output["PackedPolicySize"]);
    }
    if (output["Subject"] !== undefined) {
        contents.Subject = __expectString(output["Subject"]);
    }
    if (output["SubjectType"] !== undefined) {
        contents.SubjectType = __expectString(output["SubjectType"]);
    }
    if (output["Issuer"] !== undefined) {
        contents.Issuer = __expectString(output["Issuer"]);
    }
    if (output["Audience"] !== undefined) {
        contents.Audience = __expectString(output["Audience"]);
    }
    if (output["NameQualifier"] !== undefined) {
        contents.NameQualifier = __expectString(output["NameQualifier"]);
    }
    if (output["SourceIdentity"] !== undefined) {
        contents.SourceIdentity = __expectString(output["SourceIdentity"]);
    }
    return contents;
};
const de_AssumeRoleWithWebIdentityResponse = (output, context) => {
    const contents = {};
    if (output["Credentials"] !== undefined) {
        contents.Credentials = de_Credentials(output["Credentials"], context);
    }
    if (output["SubjectFromWebIdentityToken"] !== undefined) {
        contents.SubjectFromWebIdentityToken = expectString(output["SubjectFromWebIdentityToken"]);
    }
    if (output["AssumedRoleUser"] !== undefined) {
        contents.AssumedRoleUser = de_AssumedRoleUser(output["AssumedRoleUser"], context);
    }
    if (output["PackedPolicySize"] !== undefined) {
        contents.PackedPolicySize = strictParseInt32(output["PackedPolicySize"]);
    }
    if (output["Provider"] !== undefined) {
        contents.Provider = expectString(output["Provider"]);
    }
    if (output["Audience"] !== undefined) {
        contents.Audience = expectString(output["Audience"]);
    }
    if (output["SourceIdentity"] !== undefined) {
        contents.SourceIdentity = expectString(output["SourceIdentity"]);
    }
    return contents;
};
const de_Credentials = (output, context) => {
    const contents = {};
    if (output["AccessKeyId"] !== undefined) {
        contents.AccessKeyId = expectString(output["AccessKeyId"]);
    }
    if (output["SecretAccessKey"] !== undefined) {
        contents.SecretAccessKey = expectString(output["SecretAccessKey"]);
    }
    if (output["SessionToken"] !== undefined) {
        contents.SessionToken = expectString(output["SessionToken"]);
    }
    if (output["Expiration"] !== undefined) {
        contents.Expiration = expectNonNull(parseRfc3339DateTimeWithOffset(output["Expiration"]));
    }
    return contents;
};
const de_DecodeAuthorizationMessageResponse = (output, context) => {
    const contents = {};
    if (output["DecodedMessage"] !== undefined) {
        contents.DecodedMessage = __expectString(output["DecodedMessage"]);
    }
    return contents;
};
const de_ExpiredTokenException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_FederatedUser = (output, context) => {
    const contents = {};
    if (output["FederatedUserId"] !== undefined) {
        contents.FederatedUserId = __expectString(output["FederatedUserId"]);
    }
    if (output["Arn"] !== undefined) {
        contents.Arn = __expectString(output["Arn"]);
    }
    return contents;
};
const de_GetAccessKeyInfoResponse = (output, context) => {
    const contents = {};
    if (output["Account"] !== undefined) {
        contents.Account = __expectString(output["Account"]);
    }
    return contents;
};
const de_GetCallerIdentityResponse = (output, context) => {
    const contents = {};
    if (output["UserId"] !== undefined) {
        contents.UserId = __expectString(output["UserId"]);
    }
    if (output["Account"] !== undefined) {
        contents.Account = __expectString(output["Account"]);
    }
    if (output["Arn"] !== undefined) {
        contents.Arn = __expectString(output["Arn"]);
    }
    return contents;
};
const de_GetFederationTokenResponse = (output, context) => {
    const contents = {};
    if (output["Credentials"] !== undefined) {
        contents.Credentials = de_Credentials(output["Credentials"], context);
    }
    if (output["FederatedUser"] !== undefined) {
        contents.FederatedUser = de_FederatedUser(output["FederatedUser"], context);
    }
    if (output["PackedPolicySize"] !== undefined) {
        contents.PackedPolicySize = __strictParseInt32(output["PackedPolicySize"]);
    }
    return contents;
};
const de_GetSessionTokenResponse = (output, context) => {
    const contents = {};
    if (output["Credentials"] !== undefined) {
        contents.Credentials = de_Credentials(output["Credentials"], context);
    }
    return contents;
};
const de_IDPCommunicationErrorException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_IDPRejectedClaimException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidAuthorizationMessageException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = __expectString(output["message"]);
    }
    return contents;
};
const de_InvalidIdentityTokenException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_MalformedPolicyDocumentException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_PackedPolicyTooLargeException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_RegionDisabledException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const Aws_query_deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});
const collectBodyString = (streamBody, context) => collect_stream_body_collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
const Aws_query_throwDefaultError = withBaseException(STSServiceException);
const buildHttpRpcRequest = async (context, headers, path, resolvedHostname, body) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const contents = {
        protocol,
        hostname,
        port,
        method: "POST",
        path: basePath.endsWith("/") ? basePath.slice(0, -1) + path : basePath + path,
        headers,
    };
    if (resolvedHostname !== undefined) {
        contents.hostname = resolvedHostname;
    }
    if (body !== undefined) {
        contents.body = body;
    }
    return new httpRequest_HttpRequest(contents);
};
const SHARED_HEADERS = {
    "content-type": "application/x-www-form-urlencoded",
};
const parseBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        const parser = new fxp.XMLParser({
            attributeNamePrefix: "",
            htmlEntities: true,
            ignoreAttributes: false,
            ignoreDeclaration: true,
            parseTagValue: false,
            trimValues: false,
            tagValueProcessor: (_, val) => (val.trim() === "" && val.includes("\n") ? "" : undefined),
        });
        parser.addEntity("#xD", "\r");
        parser.addEntity("#10", "\n");
        const parsedObj = parser.parse(encoded);
        const textNodeName = "#text";
        const key = Object.keys(parsedObj)[0];
        const parsedObjToReturn = parsedObj[key];
        if (parsedObjToReturn[textNodeName]) {
            parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
            delete parsedObjToReturn[textNodeName];
        }
        return getValueFromTextNode(parsedObjToReturn);
    }
    return {};
});
const parseErrorBody = async (errorBody, context) => {
    const value = await parseBody(errorBody, context);
    if (value.Error) {
        value.Error.message = value.Error.message ?? value.Error.Message;
    }
    return value;
};
const buildFormUrlencodedString = (formEntries) => Object.entries(formEntries)
    .map(([key, value]) => extendedEncodeURIComponent(key) + "=" + extendedEncodeURIComponent(value))
    .join("&");
const loadQueryErrorCode = (output, data) => {
    if (data.Error?.Code !== undefined) {
        return data.Error.Code;
    }
    if (output.statusCode == 404) {
        return "NotFound";
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/commands/AssumeRoleCommand.js







class AssumeRoleCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseGlobalEndpoint: { type: "builtInParams", name: "useGlobalEndpoint" },
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, AssumeRoleCommand.getEndpointParameterInstructions()));
        this.middlewareStack.use(getAwsAuthPlugin(configuration));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "STSClient";
        const commandName = "AssumeRoleCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: AssumeRoleResponseFilterSensitiveLog,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_AssumeRoleCommand(input, context);
    }
    deserialize(output, context) {
        return de_AssumeRoleCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/commands/AssumeRoleWithWebIdentityCommand.js






class AssumeRoleWithWebIdentityCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseGlobalEndpoint: { type: "builtInParams", name: "useGlobalEndpoint" },
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, AssumeRoleWithWebIdentityCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "STSClient";
        const commandName = "AssumeRoleWithWebIdentityCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: AssumeRoleWithWebIdentityRequestFilterSensitiveLog,
            outputFilterSensitiveLog: AssumeRoleWithWebIdentityResponseFilterSensitiveLog,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_AssumeRoleWithWebIdentityCommand(input, context);
    }
    deserialize(output, context) {
        return de_AssumeRoleWithWebIdentityCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/defaultStsRoleAssumers.js


const ASSUME_ROLE_DEFAULT_REGION = "us-east-1";
const decorateDefaultRegion = (region) => {
    if (typeof region !== "function") {
        return region === undefined ? ASSUME_ROLE_DEFAULT_REGION : region;
    }
    return async () => {
        try {
            return await region();
        }
        catch (e) {
            return ASSUME_ROLE_DEFAULT_REGION;
        }
    };
};
const getDefaultRoleAssumer = (stsOptions, stsClientCtor) => {
    let stsClient;
    let closureSourceCreds;
    return async (sourceCreds, params) => {
        closureSourceCreds = sourceCreds;
        if (!stsClient) {
            const { logger, region, requestHandler } = stsOptions;
            stsClient = new stsClientCtor({
                logger,
                credentialDefaultProvider: () => async () => closureSourceCreds,
                region: decorateDefaultRegion(region || stsOptions.region),
                ...(requestHandler ? { requestHandler } : {}),
            });
        }
        const { Credentials } = await stsClient.send(new AssumeRoleCommand(params));
        if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretAccessKey) {
            throw new Error(`Invalid response from STS.assumeRole call with role ${params.RoleArn}`);
        }
        return {
            accessKeyId: Credentials.AccessKeyId,
            secretAccessKey: Credentials.SecretAccessKey,
            sessionToken: Credentials.SessionToken,
            expiration: Credentials.Expiration,
        };
    };
};
const getDefaultRoleAssumerWithWebIdentity = (stsOptions, stsClientCtor) => {
    let stsClient;
    return async (params) => {
        if (!stsClient) {
            const { logger, region, requestHandler } = stsOptions;
            stsClient = new stsClientCtor({
                logger,
                region: decorateDefaultRegion(region || stsOptions.region),
                ...(requestHandler ? { requestHandler } : {}),
            });
        }
        const { Credentials } = await stsClient.send(new AssumeRoleWithWebIdentityCommand(params));
        if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretAccessKey) {
            throw new Error(`Invalid response from STS.assumeRoleWithWebIdentity call with role ${params.RoleArn}`);
        }
        return {
            accessKeyId: Credentials.AccessKeyId,
            secretAccessKey: Credentials.SecretAccessKey,
            sessionToken: Credentials.SessionToken,
            expiration: Credentials.Expiration,
        };
    };
};
const decorateDefaultCredentialProvider = (provider) => (input) => provider({
    roleAssumer: getDefaultRoleAssumer(input, input.stsClientCtor),
    roleAssumerWithWebIdentity: getDefaultRoleAssumerWithWebIdentity(input, input.stsClientCtor),
    ...input,
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/middleware-sdk-sts/dist-es/index.js

const resolveStsAuthConfig = (input, { stsClientCtor }) => resolveAwsAuthConfig({
    ...input,
    stsClientCtor,
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/endpoint/EndpointParameters.js
const EndpointParameters_resolveClientEndpointParameters = (options) => {
    return {
        ...options,
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        useGlobalEndpoint: options.useGlobalEndpoint ?? false,
        defaultSigningName: "sts",
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/package.json
const client_sts_package_namespaceObject = {"i8":"3.413.0"};
;// CONCATENATED MODULE: ./node_modules/@smithy/property-provider/dist-es/ProviderError.js
class ProviderError extends Error {
    constructor(message, tryNextLink = true) {
        super(message);
        this.tryNextLink = tryNextLink;
        this.name = "ProviderError";
        Object.setPrototypeOf(this, ProviderError.prototype);
    }
    static from(error, tryNextLink = true) {
        return Object.assign(new this(error.message, tryNextLink), error);
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/property-provider/dist-es/CredentialsProviderError.js

class CredentialsProviderError extends ProviderError {
    constructor(message, tryNextLink = true) {
        super(message, tryNextLink);
        this.tryNextLink = tryNextLink;
        this.name = "CredentialsProviderError";
        Object.setPrototypeOf(this, CredentialsProviderError.prototype);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-env/dist-es/fromEnv.js

const ENV_KEY = "AWS_ACCESS_KEY_ID";
const ENV_SECRET = "AWS_SECRET_ACCESS_KEY";
const ENV_SESSION = "AWS_SESSION_TOKEN";
const ENV_EXPIRATION = "AWS_CREDENTIAL_EXPIRATION";
const fromEnv = () => async () => {
    const accessKeyId = process.env[ENV_KEY];
    const secretAccessKey = process.env[ENV_SECRET];
    const sessionToken = process.env[ENV_SESSION];
    const expiry = process.env[ENV_EXPIRATION];
    if (accessKeyId && secretAccessKey) {
        return {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken && { sessionToken }),
            ...(expiry && { expiration: new Date(expiry) }),
        };
    }
    throw new CredentialsProviderError("Unable to find environment variable credentials.");
};

;// CONCATENATED MODULE: external "os"
const external_os_namespaceObject = require("os");
;// CONCATENATED MODULE: external "path"
const external_path_namespaceObject = require("path");
;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getHomeDir.js


const homeDirCache = {};
const getHomeDirCacheKey = () => {
    if (process && process.geteuid) {
        return `${process.geteuid()}`;
    }
    return "DEFAULT";
};
const getHomeDir = () => {
    const { HOME, USERPROFILE, HOMEPATH, HOMEDRIVE = `C:${external_path_namespaceObject.sep}` } = process.env;
    if (HOME)
        return HOME;
    if (USERPROFILE)
        return USERPROFILE;
    if (HOMEPATH)
        return `${HOMEDRIVE}${HOMEPATH}`;
    const homeDirCacheKey = getHomeDirCacheKey();
    if (!homeDirCache[homeDirCacheKey])
        homeDirCache[homeDirCacheKey] = (0,external_os_namespaceObject.homedir)();
    return homeDirCache[homeDirCacheKey];
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getProfileName.js
const ENV_PROFILE = "AWS_PROFILE";
const DEFAULT_PROFILE = "default";
const getProfileName = (init) => init.profile || process.env[ENV_PROFILE] || DEFAULT_PROFILE;

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getSSOTokenFilepath.js



const getSSOTokenFilepath = (id) => {
    const hasher = (0,external_crypto_namespaceObject.createHash)("sha1");
    const cacheName = hasher.update(id).digest("hex");
    return (0,external_path_namespaceObject.join)(getHomeDir(), ".aws", "sso", "cache", `${cacheName}.json`);
};

;// CONCATENATED MODULE: external "fs"
const external_fs_namespaceObject = require("fs");
;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getSSOTokenFromFile.js


const { readFile } = external_fs_namespaceObject.promises;
const getSSOTokenFromFile = async (id) => {
    const ssoTokenFilepath = getSSOTokenFilepath(id);
    const ssoTokenText = await readFile(ssoTokenFilepath, "utf8");
    return JSON.parse(ssoTokenText);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getConfigFilepath.js


const ENV_CONFIG_PATH = "AWS_CONFIG_FILE";
const getConfigFilepath = () => process.env[ENV_CONFIG_PATH] || (0,external_path_namespaceObject.join)(getHomeDir(), ".aws", "config");

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getCredentialsFilepath.js


const ENV_CREDENTIALS_PATH = "AWS_SHARED_CREDENTIALS_FILE";
const getCredentialsFilepath = () => process.env[ENV_CREDENTIALS_PATH] || (0,external_path_namespaceObject.join)(getHomeDir(), ".aws", "credentials");

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getProfileData.js
const profileKeyRegex = /^profile\s(["'])?([^\1]+)\1$/;
const getProfileData = (data) => Object.entries(data)
    .filter(([key]) => profileKeyRegex.test(key))
    .reduce((acc, [key, value]) => ({ ...acc, [profileKeyRegex.exec(key)[2]]: value }), {
    ...(data.default && { default: data.default }),
});

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/parseIni.js
const profileNameBlockList = ["__proto__", "profile __proto__"];
const parseIni = (iniData) => {
    const map = {};
    let currentSection;
    for (let line of iniData.split(/\r?\n/)) {
        line = line.split(/(^|\s)[;#]/)[0].trim();
        const isSection = line[0] === "[" && line[line.length - 1] === "]";
        if (isSection) {
            currentSection = line.substring(1, line.length - 1);
            if (profileNameBlockList.includes(currentSection)) {
                throw new Error(`Found invalid profile name "${currentSection}"`);
            }
        }
        else if (currentSection) {
            const indexOfEqualsSign = line.indexOf("=");
            const start = 0;
            const end = line.length - 1;
            const isAssignment = indexOfEqualsSign !== -1 && indexOfEqualsSign !== start && indexOfEqualsSign !== end;
            if (isAssignment) {
                const [name, value] = [
                    line.substring(0, indexOfEqualsSign).trim(),
                    line.substring(indexOfEqualsSign + 1).trim(),
                ];
                map[currentSection] = map[currentSection] || {};
                map[currentSection][name] = value;
            }
        }
    }
    return map;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/slurpFile.js

const { readFile: slurpFile_readFile } = external_fs_namespaceObject.promises;
const filePromisesHash = {};
const slurpFile = (path, options) => {
    if (!filePromisesHash[path] || options?.ignoreCache) {
        filePromisesHash[path] = slurpFile_readFile(path, "utf8");
    }
    return filePromisesHash[path];
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/loadSharedConfigFiles.js





const swallowError = () => ({});
const loadSharedConfigFiles = async (init = {}) => {
    const { filepath = getCredentialsFilepath(), configFilepath = getConfigFilepath() } = init;
    const parsedFiles = await Promise.all([
        slurpFile(configFilepath, {
            ignoreCache: init.ignoreCache,
        })
            .then(parseIni)
            .then(getProfileData)
            .catch(swallowError),
        slurpFile(filepath, {
            ignoreCache: init.ignoreCache,
        })
            .then(parseIni)
            .catch(swallowError),
    ]);
    return {
        configFile: parsedFiles[0],
        credentialsFile: parsedFiles[1],
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/getSsoSessionData.js
const ssoSessionKeyRegex = /^sso-session\s(["'])?([^\1]+)\1$/;
const getSsoSessionData = (data) => Object.entries(data)
    .filter(([key]) => ssoSessionKeyRegex.test(key))
    .reduce((acc, [key, value]) => ({ ...acc, [ssoSessionKeyRegex.exec(key)[2]]: value }), {});

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/loadSsoSessionData.js




const loadSsoSessionData_swallowError = () => ({});
const loadSsoSessionData = async (init = {}) => slurpFile(init.configFilepath ?? getConfigFilepath())
    .then(parseIni)
    .then(getSsoSessionData)
    .catch(loadSsoSessionData_swallowError);

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/mergeConfigFiles.js
const mergeConfigFiles = (...files) => {
    const merged = {};
    for (const file of files) {
        for (const [key, values] of Object.entries(file)) {
            if (merged[key] !== undefined) {
                Object.assign(merged[key], values);
            }
            else {
                merged[key] = values;
            }
        }
    }
    return merged;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/parseKnownFiles.js


const parseKnownFiles = async (init) => {
    const parsedFiles = await loadSharedConfigFiles(init);
    return mergeConfigFiles(parsedFiles.configFile, parsedFiles.credentialsFile);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/shared-ini-file-loader/dist-es/index.js









;// CONCATENATED MODULE: external "url"
const external_url_namespaceObject = require("url");
;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/remoteProvider/httpRequest.js



function httpRequest(options) {
    return new Promise((resolve, reject) => {
        const req = (0,external_http_namespaceObject.request)({
            method: "GET",
            ...options,
            hostname: options.hostname?.replace(/^\[(.+)\]$/, "$1"),
        });
        req.on("error", (err) => {
            reject(Object.assign(new ProviderError("Unable to connect to instance metadata service"), err));
            req.destroy();
        });
        req.on("timeout", () => {
            reject(new ProviderError("TimeoutError from instance metadata service"));
            req.destroy();
        });
        req.on("response", (res) => {
            const { statusCode = 400 } = res;
            if (statusCode < 200 || 300 <= statusCode) {
                reject(Object.assign(new ProviderError("Error response received from instance metadata service"), { statusCode }));
                req.destroy();
            }
            const chunks = [];
            res.on("data", (chunk) => {
                chunks.push(chunk);
            });
            res.on("end", () => {
                resolve(external_buffer_.Buffer.concat(chunks));
                req.destroy();
            });
        });
        req.end();
    });
}

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/remoteProvider/ImdsCredentials.js
const isImdsCredentials = (arg) => Boolean(arg) &&
    typeof arg === "object" &&
    typeof arg.AccessKeyId === "string" &&
    typeof arg.SecretAccessKey === "string" &&
    typeof arg.Token === "string" &&
    typeof arg.Expiration === "string";
const fromImdsCredentials = (creds) => ({
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.Token,
    expiration: new Date(creds.Expiration),
});

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/remoteProvider/RemoteProviderInit.js
const DEFAULT_TIMEOUT = 1000;
const DEFAULT_MAX_RETRIES = 0;
const providerConfigFromInit = ({ maxRetries = DEFAULT_MAX_RETRIES, timeout = DEFAULT_TIMEOUT, }) => ({ maxRetries, timeout });

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/remoteProvider/retry.js
const retry = (toRetry, maxRetries) => {
    let promise = toRetry();
    for (let i = 0; i < maxRetries; i++) {
        promise = promise.catch(toRetry);
    }
    return promise;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/fromContainerMetadata.js






const ENV_CMDS_FULL_URI = "AWS_CONTAINER_CREDENTIALS_FULL_URI";
const ENV_CMDS_RELATIVE_URI = "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI";
const ENV_CMDS_AUTH_TOKEN = "AWS_CONTAINER_AUTHORIZATION_TOKEN";
const fromContainerMetadata = (init = {}) => {
    const { timeout, maxRetries } = providerConfigFromInit(init);
    return () => retry(async () => {
        const requestOptions = await getCmdsUri();
        const credsResponse = JSON.parse(await requestFromEcsImds(timeout, requestOptions));
        if (!isImdsCredentials(credsResponse)) {
            throw new CredentialsProviderError("Invalid response received from instance metadata service.");
        }
        return fromImdsCredentials(credsResponse);
    }, maxRetries);
};
const requestFromEcsImds = async (timeout, options) => {
    if (process.env[ENV_CMDS_AUTH_TOKEN]) {
        options.headers = {
            ...options.headers,
            Authorization: process.env[ENV_CMDS_AUTH_TOKEN],
        };
    }
    const buffer = await httpRequest({
        ...options,
        timeout,
    });
    return buffer.toString();
};
const CMDS_IP = "169.254.170.2";
const GREENGRASS_HOSTS = {
    localhost: true,
    "127.0.0.1": true,
};
const GREENGRASS_PROTOCOLS = {
    "http:": true,
    "https:": true,
};
const getCmdsUri = async () => {
    if (process.env[ENV_CMDS_RELATIVE_URI]) {
        return {
            hostname: CMDS_IP,
            path: process.env[ENV_CMDS_RELATIVE_URI],
        };
    }
    if (process.env[ENV_CMDS_FULL_URI]) {
        const parsed = (0,external_url_namespaceObject.parse)(process.env[ENV_CMDS_FULL_URI]);
        if (!parsed.hostname || !(parsed.hostname in GREENGRASS_HOSTS)) {
            throw new CredentialsProviderError(`${parsed.hostname} is not a valid container metadata service hostname`, false);
        }
        if (!parsed.protocol || !(parsed.protocol in GREENGRASS_PROTOCOLS)) {
            throw new CredentialsProviderError(`${parsed.protocol} is not a valid container metadata service protocol`, false);
        }
        return {
            ...parsed,
            port: parsed.port ? parseInt(parsed.port, 10) : undefined,
        };
    }
    throw new CredentialsProviderError("The container metadata credential provider cannot be used unless" +
        ` the ${ENV_CMDS_RELATIVE_URI} or ${ENV_CMDS_FULL_URI} environment` +
        " variable is set", false);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/property-provider/dist-es/chain.js

const chain = (...providers) => async () => {
    if (providers.length === 0) {
        throw new ProviderError("No providers in chain");
    }
    let lastProviderError;
    for (const provider of providers) {
        try {
            const credentials = await provider();
            return credentials;
        }
        catch (err) {
            lastProviderError = err;
            if (err?.tryNextLink) {
                continue;
            }
            throw err;
        }
    }
    throw lastProviderError;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/node-config-provider/dist-es/fromEnv.js

const fromEnv_fromEnv = (envVarSelector) => async () => {
    try {
        const config = envVarSelector(process.env);
        if (config === undefined) {
            throw new Error();
        }
        return config;
    }
    catch (e) {
        throw new CredentialsProviderError(e.message || `Cannot load config from environment variables with getter: ${envVarSelector}`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/node-config-provider/dist-es/fromSharedConfigFiles.js


const fromSharedConfigFiles = (configSelector, { preferredFile = "config", ...init } = {}) => async () => {
    const profile = getProfileName(init);
    const { configFile, credentialsFile } = await loadSharedConfigFiles(init);
    const profileFromCredentials = credentialsFile[profile] || {};
    const profileFromConfig = configFile[profile] || {};
    const mergedProfile = preferredFile === "config"
        ? { ...profileFromCredentials, ...profileFromConfig }
        : { ...profileFromConfig, ...profileFromCredentials };
    try {
        const configValue = configSelector(mergedProfile);
        if (configValue === undefined) {
            throw new Error();
        }
        return configValue;
    }
    catch (e) {
        throw new CredentialsProviderError(e.message || `Cannot load config for profile ${profile} in SDK configuration files with getter: ${configSelector}`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/property-provider/dist-es/fromStatic.js
const fromStatic = (staticValue) => () => Promise.resolve(staticValue);

;// CONCATENATED MODULE: ./node_modules/@smithy/node-config-provider/dist-es/fromStatic.js

const isFunction = (func) => typeof func === "function";
const fromStatic_fromStatic = (defaultValue) => isFunction(defaultValue) ? async () => await defaultValue() : fromStatic(defaultValue);

;// CONCATENATED MODULE: ./node_modules/@smithy/node-config-provider/dist-es/configLoader.js




const loadConfig = ({ environmentVariableSelector, configFileSelector, default: defaultValue }, configuration = {}) => memoize(chain(fromEnv_fromEnv(environmentVariableSelector), fromSharedConfigFiles(configFileSelector, configuration), fromStatic_fromStatic(defaultValue)));

;// CONCATENATED MODULE: ./node_modules/@smithy/node-config-provider/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/config/Endpoint.js
var Endpoint;
(function (Endpoint) {
    Endpoint["IPv4"] = "http://169.254.169.254";
    Endpoint["IPv6"] = "http://[fd00:ec2::254]";
})(Endpoint || (Endpoint = {}));

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/config/EndpointConfigOptions.js
const ENV_ENDPOINT_NAME = "AWS_EC2_METADATA_SERVICE_ENDPOINT";
const CONFIG_ENDPOINT_NAME = "ec2_metadata_service_endpoint";
const ENDPOINT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[ENV_ENDPOINT_NAME],
    configFileSelector: (profile) => profile[CONFIG_ENDPOINT_NAME],
    default: undefined,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/config/EndpointMode.js
var EndpointMode;
(function (EndpointMode) {
    EndpointMode["IPv4"] = "IPv4";
    EndpointMode["IPv6"] = "IPv6";
})(EndpointMode || (EndpointMode = {}));

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/config/EndpointModeConfigOptions.js

const ENV_ENDPOINT_MODE_NAME = "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE";
const CONFIG_ENDPOINT_MODE_NAME = "ec2_metadata_service_endpoint_mode";
const ENDPOINT_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[ENV_ENDPOINT_MODE_NAME],
    configFileSelector: (profile) => profile[CONFIG_ENDPOINT_MODE_NAME],
    default: EndpointMode.IPv4,
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/utils/getInstanceMetadataEndpoint.js






const getInstanceMetadataEndpoint = async () => parseUrl((await getFromEndpointConfig()) || (await getFromEndpointModeConfig()));
const getFromEndpointConfig = async () => loadConfig(ENDPOINT_CONFIG_OPTIONS)();
const getFromEndpointModeConfig = async () => {
    const endpointMode = await loadConfig(ENDPOINT_MODE_CONFIG_OPTIONS)();
    switch (endpointMode) {
        case EndpointMode.IPv4:
            return Endpoint.IPv4;
        case EndpointMode.IPv6:
            return Endpoint.IPv6;
        default:
            throw new Error(`Unsupported endpoint mode: ${endpointMode}.` + ` Select from ${Object.values(EndpointMode)}`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/utils/getExtendedInstanceMetadataCredentials.js
const STATIC_STABILITY_REFRESH_INTERVAL_SECONDS = 5 * 60;
const STATIC_STABILITY_REFRESH_INTERVAL_JITTER_WINDOW_SECONDS = 5 * 60;
const STATIC_STABILITY_DOC_URL = "https://docs.aws.amazon.com/sdkref/latest/guide/feature-static-credentials.html";
const getExtendedInstanceMetadataCredentials = (credentials, logger) => {
    const refreshInterval = STATIC_STABILITY_REFRESH_INTERVAL_SECONDS +
        Math.floor(Math.random() * STATIC_STABILITY_REFRESH_INTERVAL_JITTER_WINDOW_SECONDS);
    const newExpiration = new Date(Date.now() + refreshInterval * 1000);
    logger.warn("Attempting credential expiration extension due to a credential service availability issue. A refresh of these " +
        "credentials will be attempted after ${new Date(newExpiration)}.\nFor more information, please visit: " +
        STATIC_STABILITY_DOC_URL);
    const originalExpiration = credentials.originalExpiration ?? credentials.expiration;
    return {
        ...credentials,
        ...(originalExpiration ? { originalExpiration } : {}),
        expiration: newExpiration,
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/utils/staticStabilityProvider.js

const staticStabilityProvider = (provider, options = {}) => {
    const logger = options?.logger || console;
    let pastCredentials;
    return async () => {
        let credentials;
        try {
            credentials = await provider();
            if (credentials.expiration && credentials.expiration.getTime() < Date.now()) {
                credentials = getExtendedInstanceMetadataCredentials(credentials, logger);
            }
        }
        catch (e) {
            if (pastCredentials) {
                logger.warn("Credential renew failed: ", e);
                credentials = getExtendedInstanceMetadataCredentials(pastCredentials, logger);
            }
            else {
                throw e;
            }
        }
        pastCredentials = credentials;
        return credentials;
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/fromInstanceMetadata.js







const IMDS_PATH = "/latest/meta-data/iam/security-credentials/";
const IMDS_TOKEN_PATH = "/latest/api/token";
const fromInstanceMetadata = (init = {}) => staticStabilityProvider(getInstanceImdsProvider(init), { logger: init.logger });
const getInstanceImdsProvider = (init) => {
    let disableFetchToken = false;
    const { timeout, maxRetries } = providerConfigFromInit(init);
    const getCredentials = async (maxRetries, options) => {
        const profile = (await retry(async () => {
            let profile;
            try {
                profile = await getProfile(options);
            }
            catch (err) {
                if (err.statusCode === 401) {
                    disableFetchToken = false;
                }
                throw err;
            }
            return profile;
        }, maxRetries)).trim();
        return retry(async () => {
            let creds;
            try {
                creds = await getCredentialsFromProfile(profile, options);
            }
            catch (err) {
                if (err.statusCode === 401) {
                    disableFetchToken = false;
                }
                throw err;
            }
            return creds;
        }, maxRetries);
    };
    return async () => {
        const endpoint = await getInstanceMetadataEndpoint();
        if (disableFetchToken) {
            return getCredentials(maxRetries, { ...endpoint, timeout });
        }
        else {
            let token;
            try {
                token = (await getMetadataToken({ ...endpoint, timeout })).toString();
            }
            catch (error) {
                if (error?.statusCode === 400) {
                    throw Object.assign(error, {
                        message: "EC2 Metadata token request returned error",
                    });
                }
                else if (error.message === "TimeoutError" || [403, 404, 405].includes(error.statusCode)) {
                    disableFetchToken = true;
                }
                return getCredentials(maxRetries, { ...endpoint, timeout });
            }
            return getCredentials(maxRetries, {
                ...endpoint,
                headers: {
                    "x-aws-ec2-metadata-token": token,
                },
                timeout,
            });
        }
    };
};
const getMetadataToken = async (options) => httpRequest({
    ...options,
    path: IMDS_TOKEN_PATH,
    method: "PUT",
    headers: {
        "x-aws-ec2-metadata-token-ttl-seconds": "21600",
    },
});
const getProfile = async (options) => (await httpRequest({ ...options, path: IMDS_PATH })).toString();
const getCredentialsFromProfile = async (profile, options) => {
    const credsResponse = JSON.parse((await httpRequest({
        ...options,
        path: IMDS_PATH + profile,
    })).toString());
    if (!isImdsCredentials(credsResponse)) {
        throw new CredentialsProviderError("Invalid response received from instance metadata service.");
    }
    return fromImdsCredentials(credsResponse);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/credential-provider-imds/dist-es/index.js







;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveCredentialSource.js



const resolveCredentialSource = (credentialSource, profileName) => {
    const sourceProvidersMap = {
        EcsContainer: fromContainerMetadata,
        Ec2InstanceMetadata: fromInstanceMetadata,
        Environment: fromEnv,
    };
    if (credentialSource in sourceProvidersMap) {
        return sourceProvidersMap[credentialSource]();
    }
    else {
        throw new CredentialsProviderError(`Unsupported credential source in profile ${profileName}. Got ${credentialSource}, ` +
            `expected EcsContainer or Ec2InstanceMetadata or Environment.`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveAssumeRoleCredentials.js




const isAssumeRoleProfile = (arg) => Boolean(arg) &&
    typeof arg === "object" &&
    typeof arg.role_arn === "string" &&
    ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1 &&
    ["undefined", "string"].indexOf(typeof arg.external_id) > -1 &&
    ["undefined", "string"].indexOf(typeof arg.mfa_serial) > -1 &&
    (isAssumeRoleWithSourceProfile(arg) || isAssumeRoleWithProviderProfile(arg));
const isAssumeRoleWithSourceProfile = (arg) => typeof arg.source_profile === "string" && typeof arg.credential_source === "undefined";
const isAssumeRoleWithProviderProfile = (arg) => typeof arg.credential_source === "string" && typeof arg.source_profile === "undefined";
const resolveAssumeRoleCredentials = async (profileName, profiles, options, visitedProfiles = {}) => {
    const data = profiles[profileName];
    if (!options.roleAssumer) {
        throw new CredentialsProviderError(`Profile ${profileName} requires a role to be assumed, but no role assumption callback was provided.`, false);
    }
    const { source_profile } = data;
    if (source_profile && source_profile in visitedProfiles) {
        throw new CredentialsProviderError(`Detected a cycle attempting to resolve credentials for profile` +
            ` ${getProfileName(options)}. Profiles visited: ` +
            Object.keys(visitedProfiles).join(", "), false);
    }
    const sourceCredsProvider = source_profile
        ? resolveProfileData(source_profile, profiles, options, {
            ...visitedProfiles,
            [source_profile]: true,
        })
        : resolveCredentialSource(data.credential_source, profileName)();
    const params = {
        RoleArn: data.role_arn,
        RoleSessionName: data.role_session_name || `aws-sdk-js-${Date.now()}`,
        ExternalId: data.external_id,
        DurationSeconds: parseInt(data.duration_seconds || "3600", 10),
    };
    const { mfa_serial } = data;
    if (mfa_serial) {
        if (!options.mfaCodeProvider) {
            throw new CredentialsProviderError(`Profile ${profileName} requires multi-factor authentication, but no MFA code callback was provided.`, false);
        }
        params.SerialNumber = mfa_serial;
        params.TokenCode = await options.mfaCodeProvider(mfa_serial);
    }
    const sourceCreds = await sourceCredsProvider;
    return options.roleAssumer(sourceCreds, params);
};

;// CONCATENATED MODULE: external "child_process"
const external_child_process_namespaceObject = require("child_process");
;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-process/dist-es/getValidatedProcessCredentials.js
const getValidatedProcessCredentials = (profileName, data) => {
    if (data.Version !== 1) {
        throw Error(`Profile ${profileName} credential_process did not return Version 1.`);
    }
    if (data.AccessKeyId === undefined || data.SecretAccessKey === undefined) {
        throw Error(`Profile ${profileName} credential_process returned invalid credentials.`);
    }
    if (data.Expiration) {
        const currentTime = new Date();
        const expireTime = new Date(data.Expiration);
        if (expireTime < currentTime) {
            throw Error(`Profile ${profileName} credential_process returned expired credentials.`);
        }
    }
    return {
        accessKeyId: data.AccessKeyId,
        secretAccessKey: data.SecretAccessKey,
        ...(data.SessionToken && { sessionToken: data.SessionToken }),
        ...(data.Expiration && { expiration: new Date(data.Expiration) }),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-process/dist-es/resolveProcessCredentials.js




const resolveProcessCredentials = async (profileName, profiles) => {
    const profile = profiles[profileName];
    if (profiles[profileName]) {
        const credentialProcess = profile["credential_process"];
        if (credentialProcess !== undefined) {
            const execPromise = (0,external_util_namespaceObject.promisify)(external_child_process_namespaceObject.exec);
            try {
                const { stdout } = await execPromise(credentialProcess);
                let data;
                try {
                    data = JSON.parse(stdout.trim());
                }
                catch {
                    throw Error(`Profile ${profileName} credential_process returned invalid JSON.`);
                }
                return getValidatedProcessCredentials(profileName, data);
            }
            catch (error) {
                throw new CredentialsProviderError(error.message);
            }
        }
        else {
            throw new CredentialsProviderError(`Profile ${profileName} did not contain credential_process.`);
        }
    }
    else {
        throw new CredentialsProviderError(`Profile ${profileName} could not be found in shared credentials file.`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-process/dist-es/fromProcess.js


const fromProcess = (init = {}) => async () => {
    const profiles = await parseKnownFiles(init);
    return resolveProcessCredentials(getProfileName(init), profiles);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-process/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveProcessCredentials.js

const isProcessProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.credential_process === "string";
const resolveProcessCredentials_resolveProcessCredentials = async (options, profile) => fromProcess({
    ...options,
    profile,
})();

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-sso/dist-es/isSsoProfile.js
const isSsoProfile = (arg) => arg &&
    (typeof arg.sso_start_url === "string" ||
        typeof arg.sso_account_id === "string" ||
        typeof arg.sso_session === "string" ||
        typeof arg.sso_region === "string" ||
        typeof arg.sso_role_name === "string");

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/endpoint/EndpointParameters.js
const endpoint_EndpointParameters_resolveClientEndpointParameters = (options) => {
    return {
        ...options,
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "awsssoportal",
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/package.json
const client_sso_package_namespaceObject = {"i8":"3.413.0"};
;// CONCATENATED MODULE: external "process"
const external_process_namespaceObject = require("process");
;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-user-agent-node/dist-es/is-crt-available.js
const isCrtAvailable = () => {
    try {
        if ( true && __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'aws-crt'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()))) {
            return ["md/crt-avail"];
        }
        return null;
    }
    catch (e) {
        return null;
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-user-agent-node/dist-es/index.js




const UA_APP_ID_ENV_NAME = "AWS_SDK_UA_APP_ID";
const UA_APP_ID_INI_NAME = "sdk-ua-app-id";
const defaultUserAgent = ({ serviceId, clientVersion }) => {
    const sections = [
        ["aws-sdk-js", clientVersion],
        ["ua", "2.0"],
        [`os/${(0,external_os_namespaceObject.platform)()}`, (0,external_os_namespaceObject.release)()],
        ["lang/js"],
        ["md/nodejs", `${external_process_namespaceObject.versions.node}`],
    ];
    const crtAvailable = isCrtAvailable();
    if (crtAvailable) {
        sections.push(crtAvailable);
    }
    if (serviceId) {
        sections.push([`api/${serviceId}`, clientVersion]);
    }
    if (external_process_namespaceObject.env.AWS_EXECUTION_ENV) {
        sections.push([`exec-env/${external_process_namespaceObject.env.AWS_EXECUTION_ENV}`]);
    }
    const appIdPromise = loadConfig({
        environmentVariableSelector: (env) => env[UA_APP_ID_ENV_NAME],
        configFileSelector: (profile) => profile[UA_APP_ID_INI_NAME],
        default: undefined,
    })();
    let resolvedUserAgent = undefined;
    return async () => {
        if (!resolvedUserAgent) {
            const appId = await appIdPromise;
            resolvedUserAgent = appId ? [...sections, [`app/${appId}`]] : [...sections];
        }
        return resolvedUserAgent;
    };
};

;// CONCATENATED MODULE: ./node_modules/@smithy/hash-node/dist-es/index.js




class Hash {
    constructor(algorithmIdentifier, secret) {
        this.algorithmIdentifier = algorithmIdentifier;
        this.secret = secret;
        this.reset();
    }
    update(toHash, encoding) {
        this.hash.update(toUint8Array(castSourceData(toHash, encoding)));
    }
    digest() {
        return Promise.resolve(this.hash.digest());
    }
    reset() {
        this.hash = this.secret
            ? (0,external_crypto_namespaceObject.createHmac)(this.algorithmIdentifier, castSourceData(this.secret))
            : (0,external_crypto_namespaceObject.createHash)(this.algorithmIdentifier);
    }
}
function castSourceData(toCast, encoding) {
    if (external_buffer_.Buffer.isBuffer(toCast)) {
        return toCast;
    }
    if (typeof toCast === "string") {
        return fromString(toCast, encoding);
    }
    if (ArrayBuffer.isView(toCast)) {
        return dist_es_fromArrayBuffer(toCast.buffer, toCast.byteOffset, toCast.byteLength);
    }
    return dist_es_fromArrayBuffer(toCast);
}

;// CONCATENATED MODULE: ./node_modules/@smithy/util-body-length-node/dist-es/calculateBodyLength.js

const calculateBodyLength = (body) => {
    if (!body) {
        return 0;
    }
    if (typeof body === "string") {
        return Buffer.from(body).length;
    }
    else if (typeof body.byteLength === "number") {
        return body.byteLength;
    }
    else if (typeof body.size === "number") {
        return body.size;
    }
    else if (typeof body.start === "number" && typeof body.end === "number") {
        return body.end + 1 - body.start;
    }
    else if (typeof body.path === "string" || Buffer.isBuffer(body.path)) {
        return (0,external_fs_namespaceObject.lstatSync)(body.path).size;
    }
    else if (typeof body.fd === "number") {
        return (0,external_fs_namespaceObject.fstatSync)(body.fd).size;
    }
    throw new Error(`Body Length computation failed for ${body}`);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-body-length-node/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/endpoint/ruleset.js
const q = "required", r = "fn", s = "argv", t = "ref";
const a = "isSet", b = "tree", c = "error", d = "endpoint", e = "PartitionResult", f = { [q]: false, "type": "String" }, g = { [q]: true, "default": false, "type": "Boolean" }, h = { [t]: "Endpoint" }, i = { [r]: "booleanEquals", [s]: [{ [t]: "UseFIPS" }, true] }, j = { [r]: "booleanEquals", [s]: [{ [t]: "UseDualStack" }, true] }, k = {}, l = { [r]: "booleanEquals", [s]: [true, { [r]: "getAttr", [s]: [{ [t]: e }, "supportsFIPS"] }] }, m = { [r]: "booleanEquals", [s]: [true, { [r]: "getAttr", [s]: [{ [t]: e }, "supportsDualStack"] }] }, n = [i], o = [j], p = [{ [t]: "Region" }];
const _data = { version: "1.0", parameters: { Region: f, UseDualStack: g, UseFIPS: g, Endpoint: f }, rules: [{ conditions: [{ [r]: a, [s]: [h] }], type: b, rules: [{ conditions: n, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: c }, { conditions: o, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: c }, { endpoint: { url: h, properties: k, headers: k }, type: d }] }, { conditions: [{ [r]: a, [s]: p }], type: b, rules: [{ conditions: [{ [r]: "aws.partition", [s]: p, assign: e }], type: b, rules: [{ conditions: [i, j], type: b, rules: [{ conditions: [l, m], type: b, rules: [{ endpoint: { url: "https://portal.sso-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: k, headers: k }, type: d }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: c }] }, { conditions: n, type: b, rules: [{ conditions: [l], type: b, rules: [{ endpoint: { url: "https://portal.sso-fips.{Region}.{PartitionResult#dnsSuffix}", properties: k, headers: k }, type: d }] }, { error: "FIPS is enabled but this partition does not support FIPS", type: c }] }, { conditions: o, type: b, rules: [{ conditions: [m], type: b, rules: [{ endpoint: { url: "https://portal.sso.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: k, headers: k }, type: d }] }, { error: "DualStack is enabled but this partition does not support DualStack", type: c }] }, { endpoint: { url: "https://portal.sso.{Region}.{PartitionResult#dnsSuffix}", properties: k, headers: k }, type: d }] }] }, { error: "Invalid Configuration: Missing Region", type: c }] };
const ruleSet = _data;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/endpoint/endpointResolver.js


const defaultEndpointResolver = (endpointParams, context = {}) => {
    return resolveEndpoint(ruleSet, {
        endpointParams: endpointParams,
        logger: context.logger,
    });
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/runtimeConfig.shared.js





const getRuntimeConfig = (config) => ({
    apiVersion: "2019-06-10",
    base64Decoder: config?.base64Decoder ?? fromBase64,
    base64Encoder: config?.base64Encoder ?? toBase64,
    disableHostPrefix: config?.disableHostPrefix ?? false,
    endpointProvider: config?.endpointProvider ?? defaultEndpointResolver,
    extensions: config?.extensions ?? [],
    logger: config?.logger ?? new NoOpLogger(),
    serviceId: config?.serviceId ?? "SSO",
    urlParser: config?.urlParser ?? parseUrl,
    utf8Decoder: config?.utf8Decoder ?? fromUtf8,
    utf8Encoder: config?.utf8Encoder ?? toUtf8,
});

;// CONCATENATED MODULE: ./node_modules/@smithy/util-defaults-mode-node/dist-es/constants.js
const AWS_EXECUTION_ENV = "AWS_EXECUTION_ENV";
const AWS_REGION_ENV = "AWS_REGION";
const AWS_DEFAULT_REGION_ENV = "AWS_DEFAULT_REGION";
const ENV_IMDS_DISABLED = "AWS_EC2_METADATA_DISABLED";
const DEFAULTS_MODE_OPTIONS = ["in-region", "cross-region", "mobile", "standard", "legacy"];
const IMDS_REGION_PATH = "/latest/meta-data/placement/region";

;// CONCATENATED MODULE: ./node_modules/@smithy/util-defaults-mode-node/dist-es/defaultsModeConfig.js
const AWS_DEFAULTS_MODE_ENV = "AWS_DEFAULTS_MODE";
const AWS_DEFAULTS_MODE_CONFIG = "defaults_mode";
const NODE_DEFAULTS_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => {
        return env[AWS_DEFAULTS_MODE_ENV];
    },
    configFileSelector: (profile) => {
        return profile[AWS_DEFAULTS_MODE_CONFIG];
    },
    default: "legacy",
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-defaults-mode-node/dist-es/resolveDefaultsModeConfig.js






const resolveDefaultsModeConfig = ({ region = loadConfig(NODE_REGION_CONFIG_OPTIONS), defaultsMode = loadConfig(NODE_DEFAULTS_MODE_CONFIG_OPTIONS), } = {}) => memoize(async () => {
    const mode = typeof defaultsMode === "function" ? await defaultsMode() : defaultsMode;
    switch (mode?.toLowerCase()) {
        case "auto":
            return resolveNodeDefaultsModeAuto(region);
        case "in-region":
        case "cross-region":
        case "mobile":
        case "standard":
        case "legacy":
            return Promise.resolve(mode?.toLocaleLowerCase());
        case undefined:
            return Promise.resolve("legacy");
        default:
            throw new Error(`Invalid parameter for "defaultsMode", expect ${DEFAULTS_MODE_OPTIONS.join(", ")}, got ${mode}`);
    }
});
const resolveNodeDefaultsModeAuto = async (clientRegion) => {
    if (clientRegion) {
        const resolvedRegion = typeof clientRegion === "function" ? await clientRegion() : clientRegion;
        const inferredRegion = await inferPhysicalRegion();
        if (!inferredRegion) {
            return "standard";
        }
        if (resolvedRegion === inferredRegion) {
            return "in-region";
        }
        else {
            return "cross-region";
        }
    }
    return "standard";
};
const inferPhysicalRegion = async () => {
    if (process.env[AWS_EXECUTION_ENV] && (process.env[AWS_REGION_ENV] || process.env[AWS_DEFAULT_REGION_ENV])) {
        return process.env[AWS_REGION_ENV] ?? process.env[AWS_DEFAULT_REGION_ENV];
    }
    if (!process.env[ENV_IMDS_DISABLED]) {
        try {
            const endpoint = await getInstanceMetadataEndpoint();
            return (await httpRequest({ ...endpoint, path: IMDS_REGION_PATH })).toString();
        }
        catch (e) {
        }
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-defaults-mode-node/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/runtimeConfig.js













const runtimeConfig_getRuntimeConfig = (config) => {
    emitWarningIfUnsupportedVersion(process.version);
    const defaultsMode = resolveDefaultsModeConfig(config);
    const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
    const clientSharedValues = getRuntimeConfig(config);
    return {
        ...clientSharedValues,
        ...config,
        runtime: "node",
        defaultsMode,
        bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
        defaultUserAgentProvider: config?.defaultUserAgentProvider ??
            defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: client_sso_package_namespaceObject.i8 }),
        maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
        region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
        requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
        retryMode: config?.retryMode ??
            loadConfig({
                ...NODE_RETRY_MODE_CONFIG_OPTIONS,
                default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE,
            }),
        sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
        streamCollector: config?.streamCollector ?? stream_collector_streamCollector,
        useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
        useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/runtimeExtensions.js


const asPartial = (t) => t;
const resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = {
        ...asPartial(getDefaultExtensionConfiguration(runtimeConfig)),
        ...asPartial(getHttpHandlerExtensionConfiguration(runtimeConfig)),
    };
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return {
        ...runtimeConfig,
        ...defaultExtensionConfiguration_resolveDefaultRuntimeConfig(extensionConfiguration),
        ...resolveHttpHandlerRuntimeConfig(extensionConfiguration),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/SSOClient.js













class SSOClient extends Client {
    constructor(...[configuration]) {
        const _config_0 = runtimeConfig_getRuntimeConfig(configuration || {});
        const _config_1 = endpoint_EndpointParameters_resolveClientEndpointParameters(_config_0);
        const _config_2 = resolveRegionConfig(_config_1);
        const _config_3 = resolveEndpointConfig(_config_2);
        const _config_4 = resolveRetryConfig(_config_3);
        const _config_5 = resolveHostHeaderConfig(_config_4);
        const _config_6 = resolveUserAgentConfig(_config_5);
        const _config_7 = resolveRuntimeExtensions(_config_6, configuration?.extensions || []);
        super(_config_7);
        this.config = _config_7;
        this.middlewareStack.use(getRetryPlugin(this.config));
        this.middlewareStack.use(getContentLengthPlugin(this.config));
        this.middlewareStack.use(getHostHeaderPlugin(this.config));
        this.middlewareStack.use(getLoggerPlugin(this.config));
        this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(getUserAgentPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/models/SSOServiceException.js


class SSOServiceException extends ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, SSOServiceException.prototype);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/models/models_0.js


class InvalidRequestException extends SSOServiceException {
    constructor(opts) {
        super({
            name: "InvalidRequestException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidRequestException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidRequestException.prototype);
    }
}
class ResourceNotFoundException extends SSOServiceException {
    constructor(opts) {
        super({
            name: "ResourceNotFoundException",
            $fault: "client",
            ...opts,
        });
        this.name = "ResourceNotFoundException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
    }
}
class TooManyRequestsException extends SSOServiceException {
    constructor(opts) {
        super({
            name: "TooManyRequestsException",
            $fault: "client",
            ...opts,
        });
        this.name = "TooManyRequestsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, TooManyRequestsException.prototype);
    }
}
class UnauthorizedException extends SSOServiceException {
    constructor(opts) {
        super({
            name: "UnauthorizedException",
            $fault: "client",
            ...opts,
        });
        this.name = "UnauthorizedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, UnauthorizedException.prototype);
    }
}
const GetRoleCredentialsRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.accessToken && { accessToken: constants_SENSITIVE_STRING }),
});
const RoleCredentialsFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.secretAccessKey && { secretAccessKey: constants_SENSITIVE_STRING }),
    ...(obj.sessionToken && { sessionToken: constants_SENSITIVE_STRING }),
});
const GetRoleCredentialsResponseFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.roleCredentials && { roleCredentials: RoleCredentialsFilterSensitiveLog(obj.roleCredentials) }),
});
const ListAccountRolesRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.accessToken && { accessToken: SENSITIVE_STRING }),
});
const ListAccountsRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.accessToken && { accessToken: SENSITIVE_STRING }),
});
const LogoutRequestFilterSensitiveLog = (obj) => ({
    ...obj,
    ...(obj.accessToken && { accessToken: SENSITIVE_STRING }),
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/protocols/Aws_restJson1.js




const se_GetRoleCredentialsCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = object_mapping_map({}, isSerializableHeaderValue, {
        "x-amz-sso_bearer_token": input.accessToken,
    });
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + "/federation/credentials";
    const query = object_mapping_map({
        role_name: [, expectNonNull(input.roleName, `roleName`)],
        account_id: [, expectNonNull(input.accountId, `accountId`)],
    });
    let body;
    return new httpRequest_HttpRequest({
        protocol,
        hostname,
        port,
        method: "GET",
        headers,
        path: resolvedPath,
        query,
        body,
    });
};
const se_ListAccountRolesCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = map({}, isSerializableHeaderValue, {
        "x-amz-sso_bearer_token": input.accessToken,
    });
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + "/assignment/roles";
    const query = map({
        next_token: [, input.nextToken],
        max_result: [() => input.maxResults !== void 0, () => input.maxResults.toString()],
        account_id: [, __expectNonNull(input.accountId, `accountId`)],
    });
    let body;
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "GET",
        headers,
        path: resolvedPath,
        query,
        body,
    });
};
const se_ListAccountsCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = map({}, isSerializableHeaderValue, {
        "x-amz-sso_bearer_token": input.accessToken,
    });
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + "/assignment/accounts";
    const query = map({
        next_token: [, input.nextToken],
        max_result: [() => input.maxResults !== void 0, () => input.maxResults.toString()],
    });
    let body;
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "GET",
        headers,
        path: resolvedPath,
        query,
        body,
    });
};
const se_LogoutCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = map({}, isSerializableHeaderValue, {
        "x-amz-sso_bearer_token": input.accessToken,
    });
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + "/logout";
    let body;
    return new __HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body,
    });
};
const de_GetRoleCredentialsCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_GetRoleCredentialsCommandError(output, context);
    }
    const contents = object_mapping_map({
        $metadata: Aws_restJson1_deserializeMetadata(output),
    });
    const data = expectNonNull(expectObject(await Aws_restJson1_parseBody(output.body, context)), "body");
    const doc = object_mapping_take(data, {
        roleCredentials: serde_json_json,
    });
    Object.assign(contents, doc);
    return contents;
};
const de_GetRoleCredentialsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_restJson1_parseErrorBody(output.body, context),
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidRequestException":
        case "com.amazonaws.sso#InvalidRequestException":
            throw await de_InvalidRequestExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazonaws.sso#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "TooManyRequestsException":
        case "com.amazonaws.sso#TooManyRequestsException":
            throw await de_TooManyRequestsExceptionRes(parsedOutput, context);
        case "UnauthorizedException":
        case "com.amazonaws.sso#UnauthorizedException":
            throw await de_UnauthorizedExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_restJson1_throwDefaultError({
                output,
                parsedBody,
                errorCode,
            });
    }
};
const de_ListAccountRolesCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_ListAccountRolesCommandError(output, context);
    }
    const contents = map({
        $metadata: Aws_restJson1_deserializeMetadata(output),
    });
    const data = __expectNonNull(__expectObject(await Aws_restJson1_parseBody(output.body, context)), "body");
    const doc = take(data, {
        nextToken: __expectString,
        roleList: _json,
    });
    Object.assign(contents, doc);
    return contents;
};
const de_ListAccountRolesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_restJson1_parseErrorBody(output.body, context),
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidRequestException":
        case "com.amazonaws.sso#InvalidRequestException":
            throw await de_InvalidRequestExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazonaws.sso#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "TooManyRequestsException":
        case "com.amazonaws.sso#TooManyRequestsException":
            throw await de_TooManyRequestsExceptionRes(parsedOutput, context);
        case "UnauthorizedException":
        case "com.amazonaws.sso#UnauthorizedException":
            throw await de_UnauthorizedExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_restJson1_throwDefaultError({
                output,
                parsedBody,
                errorCode,
            });
    }
};
const de_ListAccountsCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_ListAccountsCommandError(output, context);
    }
    const contents = map({
        $metadata: Aws_restJson1_deserializeMetadata(output),
    });
    const data = __expectNonNull(__expectObject(await Aws_restJson1_parseBody(output.body, context)), "body");
    const doc = take(data, {
        accountList: _json,
        nextToken: __expectString,
    });
    Object.assign(contents, doc);
    return contents;
};
const de_ListAccountsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_restJson1_parseErrorBody(output.body, context),
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidRequestException":
        case "com.amazonaws.sso#InvalidRequestException":
            throw await de_InvalidRequestExceptionRes(parsedOutput, context);
        case "ResourceNotFoundException":
        case "com.amazonaws.sso#ResourceNotFoundException":
            throw await de_ResourceNotFoundExceptionRes(parsedOutput, context);
        case "TooManyRequestsException":
        case "com.amazonaws.sso#TooManyRequestsException":
            throw await de_TooManyRequestsExceptionRes(parsedOutput, context);
        case "UnauthorizedException":
        case "com.amazonaws.sso#UnauthorizedException":
            throw await de_UnauthorizedExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_restJson1_throwDefaultError({
                output,
                parsedBody,
                errorCode,
            });
    }
};
const de_LogoutCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_LogoutCommandError(output, context);
    }
    const contents = map({
        $metadata: Aws_restJson1_deserializeMetadata(output),
    });
    await collectBody(output.body, context);
    return contents;
};
const de_LogoutCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_restJson1_parseErrorBody(output.body, context),
    };
    const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidRequestException":
        case "com.amazonaws.sso#InvalidRequestException":
            throw await de_InvalidRequestExceptionRes(parsedOutput, context);
        case "TooManyRequestsException":
        case "com.amazonaws.sso#TooManyRequestsException":
            throw await de_TooManyRequestsExceptionRes(parsedOutput, context);
        case "UnauthorizedException":
        case "com.amazonaws.sso#UnauthorizedException":
            throw await de_UnauthorizedExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return Aws_restJson1_throwDefaultError({
                output,
                parsedBody,
                errorCode,
            });
    }
};
const Aws_restJson1_throwDefaultError = withBaseException(SSOServiceException);
const de_InvalidRequestExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        message: expectString,
    });
    Object.assign(contents, doc);
    const exception = new InvalidRequestException({
        $metadata: Aws_restJson1_deserializeMetadata(parsedOutput),
        ...contents,
    });
    return decorateServiceException(exception, parsedOutput.body);
};
const de_ResourceNotFoundExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        message: expectString,
    });
    Object.assign(contents, doc);
    const exception = new ResourceNotFoundException({
        $metadata: Aws_restJson1_deserializeMetadata(parsedOutput),
        ...contents,
    });
    return decorateServiceException(exception, parsedOutput.body);
};
const de_TooManyRequestsExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        message: expectString,
    });
    Object.assign(contents, doc);
    const exception = new TooManyRequestsException({
        $metadata: Aws_restJson1_deserializeMetadata(parsedOutput),
        ...contents,
    });
    return decorateServiceException(exception, parsedOutput.body);
};
const de_UnauthorizedExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        message: expectString,
    });
    Object.assign(contents, doc);
    const exception = new UnauthorizedException({
        $metadata: Aws_restJson1_deserializeMetadata(parsedOutput),
        ...contents,
    });
    return decorateServiceException(exception, parsedOutput.body);
};
const Aws_restJson1_deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});
const Aws_restJson1_collectBodyString = (streamBody, context) => collect_stream_body_collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
const isSerializableHeaderValue = (value) => value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Object.getOwnPropertyNames(value).includes("length") || value.length != 0) &&
    (!Object.getOwnPropertyNames(value).includes("size") || value.size != 0);
const Aws_restJson1_parseBody = (streamBody, context) => Aws_restJson1_collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        return JSON.parse(encoded);
    }
    return {};
});
const Aws_restJson1_parseErrorBody = async (errorBody, context) => {
    const value = await Aws_restJson1_parseBody(errorBody, context);
    value.message = value.message ?? value.Message;
    return value;
};
const loadRestJsonErrorCode = (output, data) => {
    const findKey = (object, key) => Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());
    const sanitizeErrorCode = (rawValue) => {
        let cleanValue = rawValue;
        if (typeof cleanValue === "number") {
            cleanValue = cleanValue.toString();
        }
        if (cleanValue.indexOf(",") >= 0) {
            cleanValue = cleanValue.split(",")[0];
        }
        if (cleanValue.indexOf(":") >= 0) {
            cleanValue = cleanValue.split(":")[0];
        }
        if (cleanValue.indexOf("#") >= 0) {
            cleanValue = cleanValue.split("#")[1];
        }
        return cleanValue;
    };
    const headerKey = findKey(output.headers, "x-amzn-errortype");
    if (headerKey !== undefined) {
        return sanitizeErrorCode(output.headers[headerKey]);
    }
    if (data.code !== undefined) {
        return sanitizeErrorCode(data.code);
    }
    if (data["__type"] !== undefined) {
        return sanitizeErrorCode(data["__type"]);
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sso/dist-es/commands/GetRoleCredentialsCommand.js






class GetRoleCredentialsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetRoleCredentialsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SSOClient";
        const commandName = "GetRoleCredentialsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: GetRoleCredentialsRequestFilterSensitiveLog,
            outputFilterSensitiveLog: GetRoleCredentialsResponseFilterSensitiveLog,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetRoleCredentialsCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetRoleCredentialsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@smithy/property-provider/dist-es/TokenProviderError.js

class TokenProviderError extends ProviderError {
    constructor(message, tryNextLink = true) {
        super(message, tryNextLink);
        this.tryNextLink = tryNextLink;
        this.name = "TokenProviderError";
        Object.setPrototypeOf(this, TokenProviderError.prototype);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/constants.js
const EXPIRE_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_MESSAGE = `To refresh this SSO session run 'aws sso login' with the corresponding profile.`;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/bundle/client-sso-oidc-node.js









var client_sso_oidc_node_resolveClientEndpointParameters = (options) => {
    return {
        ...options,
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "awsssooidc"
    };
};
var package_default = { version: "3.387.0" };













var client_sso_oidc_node_p = "required";
var client_sso_oidc_node_q = "fn";
var client_sso_oidc_node_r = "argv";
var client_sso_oidc_node_s = "ref";
var client_sso_oidc_node_a = "PartitionResult";
var client_sso_oidc_node_b = "tree";
var client_sso_oidc_node_c = "error";
var client_sso_oidc_node_d = "endpoint";
var client_sso_oidc_node_e = { [client_sso_oidc_node_p]: false, "type": "String" };
var client_sso_oidc_node_f = { [client_sso_oidc_node_p]: true, "default": false, "type": "Boolean" };
var client_sso_oidc_node_g = { [client_sso_oidc_node_s]: "Endpoint" };
var client_sso_oidc_node_h = { [client_sso_oidc_node_q]: "booleanEquals", [client_sso_oidc_node_r]: [{ [client_sso_oidc_node_s]: "UseFIPS" }, true] };
var client_sso_oidc_node_i = { [client_sso_oidc_node_q]: "booleanEquals", [client_sso_oidc_node_r]: [{ [client_sso_oidc_node_s]: "UseDualStack" }, true] };
var client_sso_oidc_node_j = {};
var client_sso_oidc_node_k = { [client_sso_oidc_node_q]: "booleanEquals", [client_sso_oidc_node_r]: [true, { [client_sso_oidc_node_q]: "getAttr", [client_sso_oidc_node_r]: [{ [client_sso_oidc_node_s]: client_sso_oidc_node_a }, "supportsFIPS"] }] };
var client_sso_oidc_node_l = { [client_sso_oidc_node_q]: "booleanEquals", [client_sso_oidc_node_r]: [true, { [client_sso_oidc_node_q]: "getAttr", [client_sso_oidc_node_r]: [{ [client_sso_oidc_node_s]: client_sso_oidc_node_a }, "supportsDualStack"] }] };
var client_sso_oidc_node_m = [client_sso_oidc_node_g];
var client_sso_oidc_node_n = [client_sso_oidc_node_h];
var client_sso_oidc_node_o = [client_sso_oidc_node_i];
var client_sso_oidc_node_data = { version: "1.0", parameters: { Region: client_sso_oidc_node_e, UseDualStack: client_sso_oidc_node_f, UseFIPS: client_sso_oidc_node_f, Endpoint: client_sso_oidc_node_e }, rules: [{ conditions: [{ [client_sso_oidc_node_q]: "aws.partition", [client_sso_oidc_node_r]: [{ [client_sso_oidc_node_s]: "Region" }], assign: client_sso_oidc_node_a }], type: client_sso_oidc_node_b, rules: [{ conditions: [{ [client_sso_oidc_node_q]: "isSet", [client_sso_oidc_node_r]: client_sso_oidc_node_m }, { [client_sso_oidc_node_q]: "parseURL", [client_sso_oidc_node_r]: client_sso_oidc_node_m, assign: "url" }], type: client_sso_oidc_node_b, rules: [{ conditions: client_sso_oidc_node_n, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: client_sso_oidc_node_c }, { type: client_sso_oidc_node_b, rules: [{ conditions: client_sso_oidc_node_o, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: client_sso_oidc_node_c }, { endpoint: { url: client_sso_oidc_node_g, properties: client_sso_oidc_node_j, headers: client_sso_oidc_node_j }, type: client_sso_oidc_node_d }] }] }, { conditions: [client_sso_oidc_node_h, client_sso_oidc_node_i], type: client_sso_oidc_node_b, rules: [{ conditions: [client_sso_oidc_node_k, client_sso_oidc_node_l], type: client_sso_oidc_node_b, rules: [{ endpoint: { url: "https://oidc-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: client_sso_oidc_node_j, headers: client_sso_oidc_node_j }, type: client_sso_oidc_node_d }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: client_sso_oidc_node_c }] }, { conditions: client_sso_oidc_node_n, type: client_sso_oidc_node_b, rules: [{ conditions: [client_sso_oidc_node_k], type: client_sso_oidc_node_b, rules: [{ type: client_sso_oidc_node_b, rules: [{ endpoint: { url: "https://oidc-fips.{Region}.{PartitionResult#dnsSuffix}", properties: client_sso_oidc_node_j, headers: client_sso_oidc_node_j }, type: client_sso_oidc_node_d }] }] }, { error: "FIPS is enabled but this partition does not support FIPS", type: client_sso_oidc_node_c }] }, { conditions: client_sso_oidc_node_o, type: client_sso_oidc_node_b, rules: [{ conditions: [client_sso_oidc_node_l], type: client_sso_oidc_node_b, rules: [{ endpoint: { url: "https://oidc.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: client_sso_oidc_node_j, headers: client_sso_oidc_node_j }, type: client_sso_oidc_node_d }] }, { error: "DualStack is enabled but this partition does not support DualStack", type: client_sso_oidc_node_c }] }, { endpoint: { url: "https://oidc.{Region}.{PartitionResult#dnsSuffix}", properties: client_sso_oidc_node_j, headers: client_sso_oidc_node_j }, type: client_sso_oidc_node_d }] }] };
var client_sso_oidc_node_ruleSet = client_sso_oidc_node_data;
var client_sso_oidc_node_defaultEndpointResolver = (endpointParams, context = {}) => {
    return resolveEndpoint(client_sso_oidc_node_ruleSet, {
        endpointParams,
        logger: context.logger
    });
};
var client_sso_oidc_node_getRuntimeConfig = (config) => ({
    apiVersion: "2019-06-10",
    base64Decoder: config?.base64Decoder ?? fromBase64,
    base64Encoder: config?.base64Encoder ?? toBase64,
    disableHostPrefix: config?.disableHostPrefix ?? false,
    endpointProvider: config?.endpointProvider ?? client_sso_oidc_node_defaultEndpointResolver,
    logger: config?.logger ?? new NoOpLogger(),
    serviceId: config?.serviceId ?? "SSO OIDC",
    urlParser: config?.urlParser ?? parseUrl,
    utf8Decoder: config?.utf8Decoder ?? fromUtf8,
    utf8Encoder: config?.utf8Encoder ?? toUtf8
});



var getRuntimeConfig2 = (config) => {
    emitWarningIfUnsupportedVersion(process.version);
    const defaultsMode = resolveDefaultsModeConfig(config);
    const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
    const clientSharedValues = client_sso_oidc_node_getRuntimeConfig(config);
    return {
        ...clientSharedValues,
        ...config,
        runtime: "node",
        defaultsMode,
        bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
        defaultUserAgentProvider: config?.defaultUserAgentProvider ?? defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: package_default.version }),
        maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
        region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
        requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
        retryMode: config?.retryMode ?? loadConfig({
            ...NODE_RETRY_MODE_CONFIG_OPTIONS,
            default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE
        }),
        sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
        streamCollector: config?.streamCollector ?? stream_collector_streamCollector,
        useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
        useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)
    };
};
var SSOOIDCClient = class extends Client {
    constructor(...[configuration]) {
        const _config_0 = getRuntimeConfig2(configuration || {});
        const _config_1 = client_sso_oidc_node_resolveClientEndpointParameters(_config_0);
        const _config_2 = resolveRegionConfig(_config_1);
        const _config_3 = resolveEndpointConfig(_config_2);
        const _config_4 = resolveRetryConfig(_config_3);
        const _config_5 = resolveHostHeaderConfig(_config_4);
        const _config_6 = resolveUserAgentConfig(_config_5);
        super(_config_6);
        this.config = _config_6;
        this.middlewareStack.use(getRetryPlugin(this.config));
        this.middlewareStack.use(getContentLengthPlugin(this.config));
        this.middlewareStack.use(getHostHeaderPlugin(this.config));
        this.middlewareStack.use(getLoggerPlugin(this.config));
        this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(getUserAgentPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
};







var SSOOIDCServiceException = class _SSOOIDCServiceException extends ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, _SSOOIDCServiceException.prototype);
    }
};
var AccessDeniedException = class _AccessDeniedException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "AccessDeniedException",
            $fault: "client",
            ...opts
        });
        this.name = "AccessDeniedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _AccessDeniedException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var AuthorizationPendingException = class _AuthorizationPendingException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "AuthorizationPendingException",
            $fault: "client",
            ...opts
        });
        this.name = "AuthorizationPendingException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _AuthorizationPendingException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var client_sso_oidc_node_ExpiredTokenException = class _ExpiredTokenException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "ExpiredTokenException",
            $fault: "client",
            ...opts
        });
        this.name = "ExpiredTokenException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _ExpiredTokenException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var InternalServerException = class _InternalServerException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "InternalServerException",
            $fault: "server",
            ...opts
        });
        this.name = "InternalServerException";
        this.$fault = "server";
        Object.setPrototypeOf(this, _InternalServerException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var InvalidClientException = class _InvalidClientException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "InvalidClientException",
            $fault: "client",
            ...opts
        });
        this.name = "InvalidClientException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _InvalidClientException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var InvalidGrantException = class _InvalidGrantException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "InvalidGrantException",
            $fault: "client",
            ...opts
        });
        this.name = "InvalidGrantException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _InvalidGrantException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var client_sso_oidc_node_InvalidRequestException = class _InvalidRequestException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "InvalidRequestException",
            $fault: "client",
            ...opts
        });
        this.name = "InvalidRequestException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _InvalidRequestException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var InvalidScopeException = class _InvalidScopeException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "InvalidScopeException",
            $fault: "client",
            ...opts
        });
        this.name = "InvalidScopeException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _InvalidScopeException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var SlowDownException = class _SlowDownException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "SlowDownException",
            $fault: "client",
            ...opts
        });
        this.name = "SlowDownException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _SlowDownException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var UnauthorizedClientException = class _UnauthorizedClientException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "UnauthorizedClientException",
            $fault: "client",
            ...opts
        });
        this.name = "UnauthorizedClientException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _UnauthorizedClientException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var UnsupportedGrantTypeException = class _UnsupportedGrantTypeException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "UnsupportedGrantTypeException",
            $fault: "client",
            ...opts
        });
        this.name = "UnsupportedGrantTypeException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _UnsupportedGrantTypeException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var InvalidClientMetadataException = class _InvalidClientMetadataException extends SSOOIDCServiceException {
    constructor(opts) {
        super({
            name: "InvalidClientMetadataException",
            $fault: "client",
            ...opts
        });
        this.name = "InvalidClientMetadataException";
        this.$fault = "client";
        Object.setPrototypeOf(this, _InvalidClientMetadataException.prototype);
        this.error = opts.error;
        this.error_description = opts.error_description;
    }
};
var se_CreateTokenCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        "content-type": "application/json"
    };
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}/token`;
    let body;
    body = JSON.stringify(object_mapping_take(input, {
        clientId: [],
        clientSecret: [],
        code: [],
        deviceCode: [],
        grantType: [],
        redirectUri: [],
        refreshToken: [],
        scope: (_) => serde_json_json(_)
    }));
    return new httpRequest_HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body
    });
};
var se_RegisterClientCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        "content-type": "application/json"
    };
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}/client/register`;
    let body;
    body = JSON.stringify(object_mapping_take(input, {
        clientName: [],
        clientType: [],
        scopes: (_) => serde_json_json(_)
    }));
    return new httpRequest_HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body
    });
};
var se_StartDeviceAuthorizationCommand = async (input, context) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const headers = {
        "content-type": "application/json"
    };
    const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}/device_authorization`;
    let body;
    body = JSON.stringify(object_mapping_take(input, {
        clientId: [],
        clientSecret: [],
        startUrl: []
    }));
    return new httpRequest_HttpRequest({
        protocol,
        hostname,
        port,
        method: "POST",
        headers,
        path: resolvedPath,
        body
    });
};
var de_CreateTokenCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_CreateTokenCommandError(output, context);
    }
    const contents = object_mapping_map({
        $metadata: client_sso_oidc_node_deserializeMetadata(output)
    });
    const data = expectNonNull(expectObject(await client_sso_oidc_node_parseBody(output.body, context)), "body");
    const doc = object_mapping_take(data, {
        accessToken: expectString,
        expiresIn: expectInt32,
        idToken: expectString,
        refreshToken: expectString,
        tokenType: expectString
    });
    Object.assign(contents, doc);
    return contents;
};
var de_CreateTokenCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await client_sso_oidc_node_parseErrorBody(output.body, context)
    };
    const errorCode = client_sso_oidc_node_loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccessDeniedException":
        case "com.amazonaws.ssooidc#AccessDeniedException":
            throw await de_AccessDeniedExceptionRes(parsedOutput, context);
        case "AuthorizationPendingException":
        case "com.amazonaws.ssooidc#AuthorizationPendingException":
            throw await de_AuthorizationPendingExceptionRes(parsedOutput, context);
        case "ExpiredTokenException":
        case "com.amazonaws.ssooidc#ExpiredTokenException":
            throw await client_sso_oidc_node_de_ExpiredTokenExceptionRes(parsedOutput, context);
        case "InternalServerException":
        case "com.amazonaws.ssooidc#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "InvalidClientException":
        case "com.amazonaws.ssooidc#InvalidClientException":
            throw await de_InvalidClientExceptionRes(parsedOutput, context);
        case "InvalidGrantException":
        case "com.amazonaws.ssooidc#InvalidGrantException":
            throw await de_InvalidGrantExceptionRes(parsedOutput, context);
        case "InvalidRequestException":
        case "com.amazonaws.ssooidc#InvalidRequestException":
            throw await client_sso_oidc_node_de_InvalidRequestExceptionRes(parsedOutput, context);
        case "InvalidScopeException":
        case "com.amazonaws.ssooidc#InvalidScopeException":
            throw await de_InvalidScopeExceptionRes(parsedOutput, context);
        case "SlowDownException":
        case "com.amazonaws.ssooidc#SlowDownException":
            throw await de_SlowDownExceptionRes(parsedOutput, context);
        case "UnauthorizedClientException":
        case "com.amazonaws.ssooidc#UnauthorizedClientException":
            throw await de_UnauthorizedClientExceptionRes(parsedOutput, context);
        case "UnsupportedGrantTypeException":
        case "com.amazonaws.ssooidc#UnsupportedGrantTypeException":
            throw await de_UnsupportedGrantTypeExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return client_sso_oidc_node_throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
var de_RegisterClientCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_RegisterClientCommandError(output, context);
    }
    const contents = object_mapping_map({
        $metadata: client_sso_oidc_node_deserializeMetadata(output)
    });
    const data = expectNonNull(expectObject(await client_sso_oidc_node_parseBody(output.body, context)), "body");
    const doc = object_mapping_take(data, {
        authorizationEndpoint: expectString,
        clientId: expectString,
        clientIdIssuedAt: expectLong,
        clientSecret: expectString,
        clientSecretExpiresAt: expectLong,
        tokenEndpoint: expectString
    });
    Object.assign(contents, doc);
    return contents;
};
var de_RegisterClientCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await client_sso_oidc_node_parseErrorBody(output.body, context)
    };
    const errorCode = client_sso_oidc_node_loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InternalServerException":
        case "com.amazonaws.ssooidc#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "InvalidClientMetadataException":
        case "com.amazonaws.ssooidc#InvalidClientMetadataException":
            throw await de_InvalidClientMetadataExceptionRes(parsedOutput, context);
        case "InvalidRequestException":
        case "com.amazonaws.ssooidc#InvalidRequestException":
            throw await client_sso_oidc_node_de_InvalidRequestExceptionRes(parsedOutput, context);
        case "InvalidScopeException":
        case "com.amazonaws.ssooidc#InvalidScopeException":
            throw await de_InvalidScopeExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return client_sso_oidc_node_throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
var de_StartDeviceAuthorizationCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return de_StartDeviceAuthorizationCommandError(output, context);
    }
    const contents = object_mapping_map({
        $metadata: client_sso_oidc_node_deserializeMetadata(output)
    });
    const data = expectNonNull(expectObject(await client_sso_oidc_node_parseBody(output.body, context)), "body");
    const doc = object_mapping_take(data, {
        deviceCode: expectString,
        expiresIn: expectInt32,
        interval: expectInt32,
        userCode: expectString,
        verificationUri: expectString,
        verificationUriComplete: expectString
    });
    Object.assign(contents, doc);
    return contents;
};
var de_StartDeviceAuthorizationCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await client_sso_oidc_node_parseErrorBody(output.body, context)
    };
    const errorCode = client_sso_oidc_node_loadRestJsonErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InternalServerException":
        case "com.amazonaws.ssooidc#InternalServerException":
            throw await de_InternalServerExceptionRes(parsedOutput, context);
        case "InvalidClientException":
        case "com.amazonaws.ssooidc#InvalidClientException":
            throw await de_InvalidClientExceptionRes(parsedOutput, context);
        case "InvalidRequestException":
        case "com.amazonaws.ssooidc#InvalidRequestException":
            throw await client_sso_oidc_node_de_InvalidRequestExceptionRes(parsedOutput, context);
        case "SlowDownException":
        case "com.amazonaws.ssooidc#SlowDownException":
            throw await de_SlowDownExceptionRes(parsedOutput, context);
        case "UnauthorizedClientException":
        case "com.amazonaws.ssooidc#UnauthorizedClientException":
            throw await de_UnauthorizedClientExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return client_sso_oidc_node_throwDefaultError({
                output,
                parsedBody,
                errorCode
            });
    }
};
var client_sso_oidc_node_throwDefaultError = withBaseException(SSOOIDCServiceException);
var de_AccessDeniedExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new AccessDeniedException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_AuthorizationPendingExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new AuthorizationPendingException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var client_sso_oidc_node_de_ExpiredTokenExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new client_sso_oidc_node_ExpiredTokenException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_InternalServerExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new InternalServerException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_InvalidClientExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new InvalidClientException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_InvalidClientMetadataExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new InvalidClientMetadataException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_InvalidGrantExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new InvalidGrantException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var client_sso_oidc_node_de_InvalidRequestExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new client_sso_oidc_node_InvalidRequestException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_InvalidScopeExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new InvalidScopeException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_SlowDownExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new SlowDownException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_UnauthorizedClientExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new UnauthorizedClientException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var de_UnsupportedGrantTypeExceptionRes = async (parsedOutput, context) => {
    const contents = object_mapping_map({});
    const data = parsedOutput.body;
    const doc = object_mapping_take(data, {
        error: expectString,
        error_description: expectString
    });
    Object.assign(contents, doc);
    const exception = new UnsupportedGrantTypeException({
        $metadata: client_sso_oidc_node_deserializeMetadata(parsedOutput),
        ...contents
    });
    return decorateServiceException(exception, parsedOutput.body);
};
var client_sso_oidc_node_deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"]
});
var client_sso_oidc_node_collectBodyString = (streamBody, context) => collect_stream_body_collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
var client_sso_oidc_node_parseBody = (streamBody, context) => client_sso_oidc_node_collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        return JSON.parse(encoded);
    }
    return {};
});
var client_sso_oidc_node_parseErrorBody = async (errorBody, context) => {
    const value = await client_sso_oidc_node_parseBody(errorBody, context);
    value.message = value.message ?? value.Message;
    return value;
};
var client_sso_oidc_node_loadRestJsonErrorCode = (output, data) => {
    const findKey = (object, key) => Object.keys(object).find((k2) => k2.toLowerCase() === key.toLowerCase());
    const sanitizeErrorCode = (rawValue) => {
        let cleanValue = rawValue;
        if (typeof cleanValue === "number") {
            cleanValue = cleanValue.toString();
        }
        if (cleanValue.indexOf(",") >= 0) {
            cleanValue = cleanValue.split(",")[0];
        }
        if (cleanValue.indexOf(":") >= 0) {
            cleanValue = cleanValue.split(":")[0];
        }
        if (cleanValue.indexOf("#") >= 0) {
            cleanValue = cleanValue.split("#")[1];
        }
        return cleanValue;
    };
    const headerKey = findKey(output.headers, "x-amzn-errortype");
    if (headerKey !== void 0) {
        return sanitizeErrorCode(output.headers[headerKey]);
    }
    if (data.code !== void 0) {
        return sanitizeErrorCode(data.code);
    }
    if (data["__type"] !== void 0) {
        return sanitizeErrorCode(data["__type"]);
    }
};
var CreateTokenCommand = class _CreateTokenCommand extends Command {
    constructor(input) {
        super();
        this.input = input;
    }
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
        };
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, _CreateTokenCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SSOOIDCClient";
        const commandName = "CreateTokenCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateTokenCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateTokenCommand(output, context);
    }
};



var RegisterClientCommand = class _RegisterClientCommand extends Command {
    constructor(input) {
        super();
        this.input = input;
    }
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
        };
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, _RegisterClientCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SSOOIDCClient";
        const commandName = "RegisterClientCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_RegisterClientCommand(input, context);
    }
    deserialize(output, context) {
        return de_RegisterClientCommand(output, context);
    }
};



var StartDeviceAuthorizationCommand = class _StartDeviceAuthorizationCommand extends Command {
    constructor(input) {
        super();
        this.input = input;
    }
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
        };
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, _StartDeviceAuthorizationCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SSOOIDCClient";
        const commandName = "StartDeviceAuthorizationCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_StartDeviceAuthorizationCommand(input, context);
    }
    deserialize(output, context) {
        return de_StartDeviceAuthorizationCommand(output, context);
    }
};
var commands = {
    CreateTokenCommand,
    RegisterClientCommand,
    StartDeviceAuthorizationCommand
};
var SSOOIDC = class extends SSOOIDCClient {
};
createAggregatedClient(commands, SSOOIDC);


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/getSsoOidcClient.js

const ssoOidcClientsHash = {};
const getSsoOidcClient = (ssoRegion) => {
    if (ssoOidcClientsHash[ssoRegion]) {
        return ssoOidcClientsHash[ssoRegion];
    }
    const ssoOidcClient = new SSOOIDCClient({ region: ssoRegion });
    ssoOidcClientsHash[ssoRegion] = ssoOidcClient;
    return ssoOidcClient;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/getNewSsoOidcToken.js


const getNewSsoOidcToken = (ssoToken, ssoRegion) => {
    const ssoOidcClient = getSsoOidcClient(ssoRegion);
    return ssoOidcClient.send(new CreateTokenCommand({
        clientId: ssoToken.clientId,
        clientSecret: ssoToken.clientSecret,
        refreshToken: ssoToken.refreshToken,
        grantType: "refresh_token",
    }));
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/validateTokenExpiry.js


const validateTokenExpiry = (token) => {
    if (token.expiration && token.expiration.getTime() < Date.now()) {
        throw new TokenProviderError(`Token is expired. ${REFRESH_MESSAGE}`, false);
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/validateTokenKey.js


const validateTokenKey = (key, value, forRefresh = false) => {
    if (typeof value === "undefined") {
        throw new TokenProviderError(`Value not present for '${key}' in SSO Token${forRefresh ? ". Cannot refresh" : ""}. ${REFRESH_MESSAGE}`, false);
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/writeSSOTokenToFile.js


const { writeFile } = external_fs_namespaceObject.promises;
const writeSSOTokenToFile = (id, ssoToken) => {
    const tokenFilepath = getSSOTokenFilepath(id);
    const tokenString = JSON.stringify(ssoToken, null, 2);
    return writeFile(tokenFilepath, tokenString);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/token-providers/dist-es/fromSso.js







const lastRefreshAttemptTime = new Date(0);
const fromSso = (init = {}) => async () => {
    const profiles = await parseKnownFiles(init);
    const profileName = getProfileName(init);
    const profile = profiles[profileName];
    if (!profile) {
        throw new TokenProviderError(`Profile '${profileName}' could not be found in shared credentials file.`, false);
    }
    else if (!profile["sso_session"]) {
        throw new TokenProviderError(`Profile '${profileName}' is missing required property 'sso_session'.`);
    }
    const ssoSessionName = profile["sso_session"];
    const ssoSessions = await loadSsoSessionData(init);
    const ssoSession = ssoSessions[ssoSessionName];
    if (!ssoSession) {
        throw new TokenProviderError(`Sso session '${ssoSessionName}' could not be found in shared credentials file.`, false);
    }
    for (const ssoSessionRequiredKey of ["sso_start_url", "sso_region"]) {
        if (!ssoSession[ssoSessionRequiredKey]) {
            throw new TokenProviderError(`Sso session '${ssoSessionName}' is missing required property '${ssoSessionRequiredKey}'.`, false);
        }
    }
    const ssoStartUrl = ssoSession["sso_start_url"];
    const ssoRegion = ssoSession["sso_region"];
    let ssoToken;
    try {
        ssoToken = await getSSOTokenFromFile(ssoSessionName);
    }
    catch (e) {
        throw new TokenProviderError(`The SSO session token associated with profile=${profileName} was not found or is invalid. ${REFRESH_MESSAGE}`, false);
    }
    validateTokenKey("accessToken", ssoToken.accessToken);
    validateTokenKey("expiresAt", ssoToken.expiresAt);
    const { accessToken, expiresAt } = ssoToken;
    const existingToken = { token: accessToken, expiration: new Date(expiresAt) };
    if (existingToken.expiration.getTime() - Date.now() > EXPIRE_WINDOW_MS) {
        return existingToken;
    }
    if (Date.now() - lastRefreshAttemptTime.getTime() < 30 * 1000) {
        validateTokenExpiry(existingToken);
        return existingToken;
    }
    validateTokenKey("clientId", ssoToken.clientId, true);
    validateTokenKey("clientSecret", ssoToken.clientSecret, true);
    validateTokenKey("refreshToken", ssoToken.refreshToken, true);
    try {
        lastRefreshAttemptTime.setTime(Date.now());
        const newSsoOidcToken = await getNewSsoOidcToken(ssoToken, ssoRegion);
        validateTokenKey("accessToken", newSsoOidcToken.accessToken);
        validateTokenKey("expiresIn", newSsoOidcToken.expiresIn);
        const newTokenExpiration = new Date(Date.now() + newSsoOidcToken.expiresIn * 1000);
        try {
            await writeSSOTokenToFile(ssoSessionName, {
                ...ssoToken,
                accessToken: newSsoOidcToken.accessToken,
                expiresAt: newTokenExpiration.toISOString(),
                refreshToken: newSsoOidcToken.refreshToken,
            });
        }
        catch (error) {
        }
        return {
            token: newSsoOidcToken.accessToken,
            expiration: newTokenExpiration,
        };
    }
    catch (error) {
        validateTokenExpiry(existingToken);
        return existingToken;
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-sso/dist-es/resolveSSOCredentials.js




const SHOULD_FAIL_CREDENTIAL_CHAIN = false;
const resolveSSOCredentials = async ({ ssoStartUrl, ssoSession, ssoAccountId, ssoRegion, ssoRoleName, ssoClient, profile, }) => {
    let token;
    const refreshMessage = `To refresh this SSO session run aws sso login with the corresponding profile.`;
    if (ssoSession) {
        try {
            const _token = await fromSso({ profile })();
            token = {
                accessToken: _token.token,
                expiresAt: new Date(_token.expiration).toISOString(),
            };
        }
        catch (e) {
            throw new CredentialsProviderError(e.message, SHOULD_FAIL_CREDENTIAL_CHAIN);
        }
    }
    else {
        try {
            token = await getSSOTokenFromFile(ssoStartUrl);
        }
        catch (e) {
            throw new CredentialsProviderError(`The SSO session associated with this profile is invalid. ${refreshMessage}`, SHOULD_FAIL_CREDENTIAL_CHAIN);
        }
    }
    if (new Date(token.expiresAt).getTime() - Date.now() <= 0) {
        throw new CredentialsProviderError(`The SSO session associated with this profile has expired. ${refreshMessage}`, SHOULD_FAIL_CREDENTIAL_CHAIN);
    }
    const { accessToken } = token;
    const sso = ssoClient || new SSOClient({ region: ssoRegion });
    let ssoResp;
    try {
        ssoResp = await sso.send(new GetRoleCredentialsCommand({
            accountId: ssoAccountId,
            roleName: ssoRoleName,
            accessToken,
        }));
    }
    catch (e) {
        throw CredentialsProviderError.from(e, SHOULD_FAIL_CREDENTIAL_CHAIN);
    }
    const { roleCredentials: { accessKeyId, secretAccessKey, sessionToken, expiration } = {} } = ssoResp;
    if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
        throw new CredentialsProviderError("SSO returns an invalid temporary credential.", SHOULD_FAIL_CREDENTIAL_CHAIN);
    }
    return { accessKeyId, secretAccessKey, sessionToken, expiration: new Date(expiration) };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-sso/dist-es/validateSsoProfile.js

const validateSsoProfile = (profile) => {
    const { sso_start_url, sso_account_id, sso_region, sso_role_name } = profile;
    if (!sso_start_url || !sso_account_id || !sso_region || !sso_role_name) {
        throw new CredentialsProviderError(`Profile is configured with invalid SSO credentials. Required parameters "sso_account_id", ` +
            `"sso_region", "sso_role_name", "sso_start_url". Got ${Object.keys(profile).join(", ")}\nReference: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html`, false);
    }
    return profile;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-sso/dist-es/fromSSO.js





const fromSSO = (init = {}) => async () => {
    const { ssoStartUrl, ssoAccountId, ssoRegion, ssoRoleName, ssoClient, ssoSession } = init;
    const profileName = getProfileName(init);
    if (!ssoStartUrl && !ssoAccountId && !ssoRegion && !ssoRoleName && !ssoSession) {
        const profiles = await parseKnownFiles(init);
        const profile = profiles[profileName];
        if (!profile) {
            throw new CredentialsProviderError(`Profile ${profileName} was not found.`);
        }
        if (!isSsoProfile(profile)) {
            throw new CredentialsProviderError(`Profile ${profileName} is not configured with SSO credentials.`);
        }
        if (profile?.sso_session) {
            const ssoSessions = await loadSsoSessionData(init);
            const session = ssoSessions[profile.sso_session];
            const conflictMsg = ` configurations in profile ${profileName} and sso-session ${profile.sso_session}`;
            if (ssoRegion && ssoRegion !== session.sso_region) {
                throw new CredentialsProviderError(`Conflicting SSO region` + conflictMsg, false);
            }
            if (ssoStartUrl && ssoStartUrl !== session.sso_start_url) {
                throw new CredentialsProviderError(`Conflicting SSO start_url` + conflictMsg, false);
            }
            profile.sso_region = session.sso_region;
            profile.sso_start_url = session.sso_start_url;
        }
        const { sso_start_url, sso_account_id, sso_region, sso_role_name, sso_session } = validateSsoProfile(profile);
        return resolveSSOCredentials({
            ssoStartUrl: sso_start_url,
            ssoSession: sso_session,
            ssoAccountId: sso_account_id,
            ssoRegion: sso_region,
            ssoRoleName: sso_role_name,
            ssoClient: ssoClient,
            profile: profileName,
        });
    }
    else if (!ssoStartUrl || !ssoAccountId || !ssoRegion || !ssoRoleName) {
        throw new CredentialsProviderError("Incomplete configuration. The fromSSO() argument hash must include " +
            '"ssoStartUrl", "ssoAccountId", "ssoRegion", "ssoRoleName"');
    }
    else {
        return resolveSSOCredentials({
            ssoStartUrl,
            ssoSession,
            ssoAccountId,
            ssoRegion,
            ssoRoleName,
            ssoClient,
            profile: profileName,
        });
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-sso/dist-es/index.js





;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveSsoCredentials.js


const resolveSsoCredentials = (data) => {
    const { sso_start_url, sso_account_id, sso_session, sso_region, sso_role_name } = validateSsoProfile(data);
    return fromSSO({
        ssoStartUrl: sso_start_url,
        ssoAccountId: sso_account_id,
        ssoSession: sso_session,
        ssoRegion: sso_region,
        ssoRoleName: sso_role_name,
    })();
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveStaticCredentials.js
const isStaticCredsProfile = (arg) => Boolean(arg) &&
    typeof arg === "object" &&
    typeof arg.aws_access_key_id === "string" &&
    typeof arg.aws_secret_access_key === "string" &&
    ["undefined", "string"].indexOf(typeof arg.aws_session_token) > -1;
const resolveStaticCredentials = (profile) => Promise.resolve({
    accessKeyId: profile.aws_access_key_id,
    secretAccessKey: profile.aws_secret_access_key,
    sessionToken: profile.aws_session_token,
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-web-identity/dist-es/fromWebToken.js

const fromWebToken = (init) => () => {
    const { roleArn, roleSessionName, webIdentityToken, providerId, policyArns, policy, durationSeconds, roleAssumerWithWebIdentity, } = init;
    if (!roleAssumerWithWebIdentity) {
        throw new CredentialsProviderError(`Role Arn '${roleArn}' needs to be assumed with web identity,` +
            ` but no role assumption callback was provided.`, false);
    }
    return roleAssumerWithWebIdentity({
        RoleArn: roleArn,
        RoleSessionName: roleSessionName ?? `aws-sdk-js-session-${Date.now()}`,
        WebIdentityToken: webIdentityToken,
        ProviderId: providerId,
        PolicyArns: policyArns,
        Policy: policy,
        DurationSeconds: durationSeconds,
    });
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-web-identity/dist-es/fromTokenFile.js



const ENV_TOKEN_FILE = "AWS_WEB_IDENTITY_TOKEN_FILE";
const ENV_ROLE_ARN = "AWS_ROLE_ARN";
const ENV_ROLE_SESSION_NAME = "AWS_ROLE_SESSION_NAME";
const fromTokenFile = (init = {}) => async () => {
    const webIdentityTokenFile = init?.webIdentityTokenFile ?? process.env[ENV_TOKEN_FILE];
    const roleArn = init?.roleArn ?? process.env[ENV_ROLE_ARN];
    const roleSessionName = init?.roleSessionName ?? process.env[ENV_ROLE_SESSION_NAME];
    if (!webIdentityTokenFile || !roleArn) {
        throw new CredentialsProviderError("Web identity configuration not specified");
    }
    return fromWebToken({
        ...init,
        webIdentityToken: (0,external_fs_namespaceObject.readFileSync)(webIdentityTokenFile, { encoding: "ascii" }),
        roleArn,
        roleSessionName,
    })();
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-web-identity/dist-es/index.js



;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveWebIdentityCredentials.js

const isWebIdentityProfile = (arg) => Boolean(arg) &&
    typeof arg === "object" &&
    typeof arg.web_identity_token_file === "string" &&
    typeof arg.role_arn === "string" &&
    ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1;
const resolveWebIdentityCredentials = async (profile, options) => fromTokenFile({
    webIdentityTokenFile: profile.web_identity_token_file,
    roleArn: profile.role_arn,
    roleSessionName: profile.role_session_name,
    roleAssumerWithWebIdentity: options.roleAssumerWithWebIdentity,
})();

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/resolveProfileData.js






const resolveProfileData = async (profileName, profiles, options, visitedProfiles = {}) => {
    const data = profiles[profileName];
    if (Object.keys(visitedProfiles).length > 0 && isStaticCredsProfile(data)) {
        return resolveStaticCredentials(data);
    }
    if (isAssumeRoleProfile(data)) {
        return resolveAssumeRoleCredentials(profileName, profiles, options, visitedProfiles);
    }
    if (isStaticCredsProfile(data)) {
        return resolveStaticCredentials(data);
    }
    if (isWebIdentityProfile(data)) {
        return resolveWebIdentityCredentials(data, options);
    }
    if (isProcessProfile(data)) {
        return resolveProcessCredentials_resolveProcessCredentials(options, profileName);
    }
    if (isSsoProfile(data)) {
        return resolveSsoCredentials(data);
    }
    throw new CredentialsProviderError(`Profile ${profileName} could not be found or parsed in shared credentials file.`);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/fromIni.js


const fromIni = (init = {}) => async () => {
    const profiles = await parseKnownFiles(init);
    return resolveProfileData(getProfileName(init), profiles, init);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-ini/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-node/dist-es/remoteProvider.js


const remoteProvider_ENV_IMDS_DISABLED = "AWS_EC2_METADATA_DISABLED";
const remoteProvider = (init) => {
    if (process.env[ENV_CMDS_RELATIVE_URI] || process.env[ENV_CMDS_FULL_URI]) {
        return fromContainerMetadata(init);
    }
    if (process.env[remoteProvider_ENV_IMDS_DISABLED]) {
        return async () => {
            throw new CredentialsProviderError("EC2 Instance Metadata Service access disabled");
        };
    }
    return fromInstanceMetadata(init);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-node/dist-es/defaultProvider.js








const defaultProvider = (init = {}) => memoize(chain(...(init.profile || process.env[ENV_PROFILE] ? [] : [fromEnv()]), fromSSO(init), fromIni(init), fromProcess(init), fromTokenFile(init), remoteProvider(init), async () => {
    throw new CredentialsProviderError("Could not load credentials from any providers", false);
}), (credentials) => credentials.expiration !== undefined && credentials.expiration.getTime() - Date.now() < 300000, (credentials) => credentials.expiration !== undefined);

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/credential-provider-node/dist-es/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/endpoint/ruleset.js
const F = "required", G = "type", H = "fn", I = "argv", J = "ref";
const ruleset_a = false, ruleset_b = true, ruleset_c = "booleanEquals", ruleset_d = "tree", ruleset_e = "stringEquals", ruleset_f = "sigv4", ruleset_g = "sts", ruleset_h = "us-east-1", ruleset_i = "endpoint", ruleset_j = "https://sts.{Region}.{PartitionResult#dnsSuffix}", ruleset_k = "error", ruleset_l = "getAttr", ruleset_m = { [F]: false, [G]: "String" }, ruleset_n = { [F]: true, "default": false, [G]: "Boolean" }, ruleset_o = { [J]: "Endpoint" }, ruleset_p = { [H]: "isSet", [I]: [{ [J]: "Region" }] }, ruleset_q = { [J]: "Region" }, ruleset_r = { [H]: "aws.partition", [I]: [ruleset_q], "assign": "PartitionResult" }, ruleset_s = { [J]: "UseFIPS" }, ruleset_t = { [J]: "UseDualStack" }, u = { "url": "https://sts.amazonaws.com", "properties": { "authSchemes": [{ "name": ruleset_f, "signingName": ruleset_g, "signingRegion": ruleset_h }] }, "headers": {} }, v = {}, w = { "conditions": [{ [H]: ruleset_e, [I]: [ruleset_q, "aws-global"] }], [ruleset_i]: u, [G]: ruleset_i }, x = { [H]: ruleset_c, [I]: [ruleset_s, true] }, y = { [H]: ruleset_c, [I]: [ruleset_t, true] }, z = { [H]: ruleset_c, [I]: [true, { [H]: ruleset_l, [I]: [{ [J]: "PartitionResult" }, "supportsFIPS"] }] }, A = { [J]: "PartitionResult" }, B = { [H]: ruleset_c, [I]: [true, { [H]: ruleset_l, [I]: [A, "supportsDualStack"] }] }, C = [{ [H]: "isSet", [I]: [ruleset_o] }], D = [x], E = [y];
const ruleset_data = { version: "1.0", parameters: { Region: ruleset_m, UseDualStack: ruleset_n, UseFIPS: ruleset_n, Endpoint: ruleset_m, UseGlobalEndpoint: ruleset_n }, rules: [{ conditions: [{ [H]: ruleset_c, [I]: [{ [J]: "UseGlobalEndpoint" }, ruleset_b] }, { [H]: "not", [I]: C }, ruleset_p, ruleset_r, { [H]: ruleset_c, [I]: [ruleset_s, ruleset_a] }, { [H]: ruleset_c, [I]: [ruleset_t, ruleset_a] }], [G]: ruleset_d, rules: [{ conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "ap-northeast-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "ap-south-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "ap-southeast-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "ap-southeast-2"] }], endpoint: u, [G]: ruleset_i }, w, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "ca-central-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "eu-central-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "eu-north-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "eu-west-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "eu-west-2"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "eu-west-3"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "sa-east-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, ruleset_h] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "us-east-2"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "us-west-1"] }], endpoint: u, [G]: ruleset_i }, { conditions: [{ [H]: ruleset_e, [I]: [ruleset_q, "us-west-2"] }], endpoint: u, [G]: ruleset_i }, { endpoint: { url: ruleset_j, properties: { authSchemes: [{ name: ruleset_f, signingName: ruleset_g, signingRegion: "{Region}" }] }, headers: v }, [G]: ruleset_i }] }, { conditions: C, [G]: ruleset_d, rules: [{ conditions: D, error: "Invalid Configuration: FIPS and custom endpoint are not supported", [G]: ruleset_k }, { conditions: E, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", [G]: ruleset_k }, { endpoint: { url: ruleset_o, properties: v, headers: v }, [G]: ruleset_i }] }, { conditions: [ruleset_p], [G]: ruleset_d, rules: [{ conditions: [ruleset_r], [G]: ruleset_d, rules: [{ conditions: [x, y], [G]: ruleset_d, rules: [{ conditions: [z, B], [G]: ruleset_d, rules: [{ endpoint: { url: "https://sts-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: v, headers: v }, [G]: ruleset_i }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", [G]: ruleset_k }] }, { conditions: D, [G]: ruleset_d, rules: [{ conditions: [z], [G]: ruleset_d, rules: [{ conditions: [{ [H]: ruleset_e, [I]: ["aws-us-gov", { [H]: ruleset_l, [I]: [A, "name"] }] }], endpoint: { url: "https://sts.{Region}.amazonaws.com", properties: v, headers: v }, [G]: ruleset_i }, { endpoint: { url: "https://sts-fips.{Region}.{PartitionResult#dnsSuffix}", properties: v, headers: v }, [G]: ruleset_i }] }, { error: "FIPS is enabled but this partition does not support FIPS", [G]: ruleset_k }] }, { conditions: E, [G]: ruleset_d, rules: [{ conditions: [B], [G]: ruleset_d, rules: [{ endpoint: { url: "https://sts.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: v, headers: v }, [G]: ruleset_i }] }, { error: "DualStack is enabled but this partition does not support DualStack", [G]: ruleset_k }] }, w, { endpoint: { url: ruleset_j, properties: v, headers: v }, [G]: ruleset_i }] }] }, { error: "Invalid Configuration: Missing Region", [G]: ruleset_k }] };
const ruleset_ruleSet = ruleset_data;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/endpoint/endpointResolver.js


const endpointResolver_defaultEndpointResolver = (endpointParams, context = {}) => {
    return resolveEndpoint(ruleset_ruleSet, {
        endpointParams: endpointParams,
        logger: context.logger,
    });
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/runtimeConfig.shared.js





const runtimeConfig_shared_getRuntimeConfig = (config) => ({
    apiVersion: "2011-06-15",
    base64Decoder: config?.base64Decoder ?? fromBase64,
    base64Encoder: config?.base64Encoder ?? toBase64,
    disableHostPrefix: config?.disableHostPrefix ?? false,
    endpointProvider: config?.endpointProvider ?? endpointResolver_defaultEndpointResolver,
    extensions: config?.extensions ?? [],
    logger: config?.logger ?? new NoOpLogger(),
    serviceId: config?.serviceId ?? "STS",
    urlParser: config?.urlParser ?? parseUrl,
    utf8Decoder: config?.utf8Decoder ?? fromUtf8,
    utf8Encoder: config?.utf8Encoder ?? toUtf8,
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/runtimeConfig.js















const dist_es_runtimeConfig_getRuntimeConfig = (config) => {
    emitWarningIfUnsupportedVersion(process.version);
    const defaultsMode = resolveDefaultsModeConfig(config);
    const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
    const clientSharedValues = runtimeConfig_shared_getRuntimeConfig(config);
    return {
        ...clientSharedValues,
        ...config,
        runtime: "node",
        defaultsMode,
        bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
        credentialDefaultProvider: config?.credentialDefaultProvider ?? decorateDefaultCredentialProvider(defaultProvider),
        defaultUserAgentProvider: config?.defaultUserAgentProvider ??
            defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: client_sts_package_namespaceObject.i8 }),
        maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
        region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
        requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
        retryMode: config?.retryMode ??
            loadConfig({
                ...NODE_RETRY_MODE_CONFIG_OPTIONS,
                default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE,
            }),
        sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
        streamCollector: config?.streamCollector ?? stream_collector_streamCollector,
        useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
        useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/runtimeExtensions.js


const runtimeExtensions_asPartial = (t) => t;
const runtimeExtensions_resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = {
        ...runtimeExtensions_asPartial(getDefaultExtensionConfiguration(runtimeConfig)),
        ...runtimeExtensions_asPartial(getHttpHandlerExtensionConfiguration(runtimeConfig)),
    };
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return {
        ...runtimeConfig,
        ...defaultExtensionConfiguration_resolveDefaultRuntimeConfig(extensionConfiguration),
        ...resolveHttpHandlerRuntimeConfig(extensionConfiguration),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/STSClient.js














class STSClient extends Client {
    constructor(...[configuration]) {
        const _config_0 = dist_es_runtimeConfig_getRuntimeConfig(configuration || {});
        const _config_1 = EndpointParameters_resolveClientEndpointParameters(_config_0);
        const _config_2 = resolveRegionConfig(_config_1);
        const _config_3 = resolveEndpointConfig(_config_2);
        const _config_4 = resolveRetryConfig(_config_3);
        const _config_5 = resolveHostHeaderConfig(_config_4);
        const _config_6 = resolveStsAuthConfig(_config_5, { stsClientCtor: STSClient });
        const _config_7 = resolveUserAgentConfig(_config_6);
        const _config_8 = runtimeExtensions_resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        super(_config_8);
        this.config = _config_8;
        this.middlewareStack.use(getRetryPlugin(this.config));
        this.middlewareStack.use(getContentLengthPlugin(this.config));
        this.middlewareStack.use(getHostHeaderPlugin(this.config));
        this.middlewareStack.use(getLoggerPlugin(this.config));
        this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(getUserAgentPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-sts/dist-es/defaultRoleAssumers.js


const getCustomizableStsClientCtor = (baseCtor, customizations) => {
    if (!customizations)
        return baseCtor;
    else
        return class CustomizableSTSClient extends baseCtor {
            constructor(config) {
                super(config);
                for (const customization of customizations) {
                    this.middlewareStack.use(customization);
                }
            }
        };
};
const defaultRoleAssumers_getDefaultRoleAssumer = (stsOptions = {}, stsPlugins) => getDefaultRoleAssumer(stsOptions, getCustomizableStsClientCtor(STSClient, stsPlugins));
const defaultRoleAssumers_getDefaultRoleAssumerWithWebIdentity = (stsOptions = {}, stsPlugins) => getDefaultRoleAssumerWithWebIdentity(stsOptions, getCustomizableStsClientCtor(STSClient, stsPlugins));
const defaultRoleAssumers_decorateDefaultCredentialProvider = (provider) => (input) => provider({
    roleAssumer: defaultRoleAssumers_getDefaultRoleAssumer(input),
    roleAssumerWithWebIdentity: defaultRoleAssumers_getDefaultRoleAssumerWithWebIdentity(input),
    ...input,
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/endpoint/ruleset.js
const endpoint_ruleset_q = "required", endpoint_ruleset_r = "fn", endpoint_ruleset_s = "argv", endpoint_ruleset_t = "ref";
const endpoint_ruleset_a = "isSet", endpoint_ruleset_b = "tree", endpoint_ruleset_c = "error", endpoint_ruleset_d = "endpoint", endpoint_ruleset_e = "PartitionResult", endpoint_ruleset_f = { [endpoint_ruleset_q]: false, "type": "String" }, endpoint_ruleset_g = { [endpoint_ruleset_q]: true, "default": false, "type": "Boolean" }, endpoint_ruleset_h = { [endpoint_ruleset_t]: "Endpoint" }, endpoint_ruleset_i = { [endpoint_ruleset_r]: "booleanEquals", [endpoint_ruleset_s]: [{ [endpoint_ruleset_t]: "UseFIPS" }, true] }, endpoint_ruleset_j = { [endpoint_ruleset_r]: "booleanEquals", [endpoint_ruleset_s]: [{ [endpoint_ruleset_t]: "UseDualStack" }, true] }, endpoint_ruleset_k = {}, endpoint_ruleset_l = { [endpoint_ruleset_r]: "booleanEquals", [endpoint_ruleset_s]: [true, { [endpoint_ruleset_r]: "getAttr", [endpoint_ruleset_s]: [{ [endpoint_ruleset_t]: endpoint_ruleset_e }, "supportsFIPS"] }] }, endpoint_ruleset_m = { [endpoint_ruleset_r]: "booleanEquals", [endpoint_ruleset_s]: [true, { [endpoint_ruleset_r]: "getAttr", [endpoint_ruleset_s]: [{ [endpoint_ruleset_t]: endpoint_ruleset_e }, "supportsDualStack"] }] }, endpoint_ruleset_n = [endpoint_ruleset_i], endpoint_ruleset_o = [endpoint_ruleset_j], endpoint_ruleset_p = [{ [endpoint_ruleset_t]: "Region" }];
const endpoint_ruleset_data = { version: "1.0", parameters: { Region: endpoint_ruleset_f, UseDualStack: endpoint_ruleset_g, UseFIPS: endpoint_ruleset_g, Endpoint: endpoint_ruleset_f }, rules: [{ conditions: [{ [endpoint_ruleset_r]: endpoint_ruleset_a, [endpoint_ruleset_s]: [endpoint_ruleset_h] }], type: endpoint_ruleset_b, rules: [{ conditions: endpoint_ruleset_n, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: endpoint_ruleset_c }, { conditions: endpoint_ruleset_o, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: endpoint_ruleset_c }, { endpoint: { url: endpoint_ruleset_h, properties: endpoint_ruleset_k, headers: endpoint_ruleset_k }, type: endpoint_ruleset_d }] }, { conditions: [{ [endpoint_ruleset_r]: endpoint_ruleset_a, [endpoint_ruleset_s]: endpoint_ruleset_p }], type: endpoint_ruleset_b, rules: [{ conditions: [{ [endpoint_ruleset_r]: "aws.partition", [endpoint_ruleset_s]: endpoint_ruleset_p, assign: endpoint_ruleset_e }], type: endpoint_ruleset_b, rules: [{ conditions: [endpoint_ruleset_i, endpoint_ruleset_j], type: endpoint_ruleset_b, rules: [{ conditions: [endpoint_ruleset_l, endpoint_ruleset_m], type: endpoint_ruleset_b, rules: [{ endpoint: { url: "https://email-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: endpoint_ruleset_k, headers: endpoint_ruleset_k }, type: endpoint_ruleset_d }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: endpoint_ruleset_c }] }, { conditions: endpoint_ruleset_n, type: endpoint_ruleset_b, rules: [{ conditions: [endpoint_ruleset_l], type: endpoint_ruleset_b, rules: [{ endpoint: { url: "https://email-fips.{Region}.{PartitionResult#dnsSuffix}", properties: endpoint_ruleset_k, headers: endpoint_ruleset_k }, type: endpoint_ruleset_d }] }, { error: "FIPS is enabled but this partition does not support FIPS", type: endpoint_ruleset_c }] }, { conditions: endpoint_ruleset_o, type: endpoint_ruleset_b, rules: [{ conditions: [endpoint_ruleset_m], type: endpoint_ruleset_b, rules: [{ endpoint: { url: "https://email.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: endpoint_ruleset_k, headers: endpoint_ruleset_k }, type: endpoint_ruleset_d }] }, { error: "DualStack is enabled but this partition does not support DualStack", type: endpoint_ruleset_c }] }, { endpoint: { url: "https://email.{Region}.{PartitionResult#dnsSuffix}", properties: endpoint_ruleset_k, headers: endpoint_ruleset_k }, type: endpoint_ruleset_d }] }] }, { error: "Invalid Configuration: Missing Region", type: endpoint_ruleset_c }] };
const endpoint_ruleset_ruleSet = endpoint_ruleset_data;

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/endpoint/endpointResolver.js


const endpoint_endpointResolver_defaultEndpointResolver = (endpointParams, context = {}) => {
    return resolveEndpoint(endpoint_ruleset_ruleSet, {
        endpointParams: endpointParams,
        logger: context.logger,
    });
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/runtimeConfig.shared.js





const dist_es_runtimeConfig_shared_getRuntimeConfig = (config) => ({
    apiVersion: "2010-12-01",
    base64Decoder: config?.base64Decoder ?? fromBase64,
    base64Encoder: config?.base64Encoder ?? toBase64,
    disableHostPrefix: config?.disableHostPrefix ?? false,
    endpointProvider: config?.endpointProvider ?? endpoint_endpointResolver_defaultEndpointResolver,
    extensions: config?.extensions ?? [],
    logger: config?.logger ?? new NoOpLogger(),
    serviceId: config?.serviceId ?? "SES",
    urlParser: config?.urlParser ?? parseUrl,
    utf8Decoder: config?.utf8Decoder ?? fromUtf8,
    utf8Encoder: config?.utf8Encoder ?? toUtf8,
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/runtimeConfig.js















const client_ses_dist_es_runtimeConfig_getRuntimeConfig = (config) => {
    emitWarningIfUnsupportedVersion(process.version);
    const defaultsMode = resolveDefaultsModeConfig(config);
    const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
    const clientSharedValues = dist_es_runtimeConfig_shared_getRuntimeConfig(config);
    return {
        ...clientSharedValues,
        ...config,
        runtime: "node",
        defaultsMode,
        bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
        credentialDefaultProvider: config?.credentialDefaultProvider ?? defaultRoleAssumers_decorateDefaultCredentialProvider(defaultProvider),
        defaultUserAgentProvider: config?.defaultUserAgentProvider ??
            defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: package_namespaceObject.i8 }),
        maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
        region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
        requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
        retryMode: config?.retryMode ??
            loadConfig({
                ...NODE_RETRY_MODE_CONFIG_OPTIONS,
                default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE,
            }),
        sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
        streamCollector: config?.streamCollector ?? stream_collector_streamCollector,
        useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
        useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/runtimeExtensions.js


const dist_es_runtimeExtensions_asPartial = (t) => t;
const dist_es_runtimeExtensions_resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = {
        ...dist_es_runtimeExtensions_asPartial(getDefaultExtensionConfiguration(runtimeConfig)),
        ...dist_es_runtimeExtensions_asPartial(getHttpHandlerExtensionConfiguration(runtimeConfig)),
    };
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return {
        ...runtimeConfig,
        ...defaultExtensionConfiguration_resolveDefaultRuntimeConfig(extensionConfiguration),
        ...resolveHttpHandlerRuntimeConfig(extensionConfiguration),
    };
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/SESClient.js














class SESClient extends Client {
    constructor(...[configuration]) {
        const _config_0 = client_ses_dist_es_runtimeConfig_getRuntimeConfig(configuration || {});
        const _config_1 = resolveClientEndpointParameters(_config_0);
        const _config_2 = resolveRegionConfig(_config_1);
        const _config_3 = resolveEndpointConfig(_config_2);
        const _config_4 = resolveRetryConfig(_config_3);
        const _config_5 = resolveHostHeaderConfig(_config_4);
        const _config_6 = resolveAwsAuthConfig(_config_5);
        const _config_7 = resolveUserAgentConfig(_config_6);
        const _config_8 = dist_es_runtimeExtensions_resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        super(_config_8);
        this.config = _config_8;
        this.middlewareStack.use(getRetryPlugin(this.config));
        this.middlewareStack.use(getContentLengthPlugin(this.config));
        this.middlewareStack.use(getHostHeaderPlugin(this.config));
        this.middlewareStack.use(getLoggerPlugin(this.config));
        this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(getAwsAuthPlugin(this.config));
        this.middlewareStack.use(getUserAgentPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/models/SESServiceException.js


class SESServiceException extends ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, SESServiceException.prototype);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/models/models_0.js

class AccountSendingPausedException extends SESServiceException {
    constructor(opts) {
        super({
            name: "AccountSendingPausedException",
            $fault: "client",
            ...opts,
        });
        this.name = "AccountSendingPausedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, AccountSendingPausedException.prototype);
    }
}
class AlreadyExistsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "AlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        this.name = "AlreadyExistsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, AlreadyExistsException.prototype);
        this.Name = opts.Name;
    }
}
const BehaviorOnMXFailure = {
    RejectMessage: "RejectMessage",
    UseDefaultValue: "UseDefaultValue",
};
const BounceType = {
    ContentRejected: "ContentRejected",
    DoesNotExist: "DoesNotExist",
    ExceededQuota: "ExceededQuota",
    MessageTooLarge: "MessageTooLarge",
    TemporaryFailure: "TemporaryFailure",
    Undefined: "Undefined",
};
const DsnAction = {
    DELAYED: "delayed",
    DELIVERED: "delivered",
    EXPANDED: "expanded",
    FAILED: "failed",
    RELAYED: "relayed",
};
const BulkEmailStatus = {
    AccountDailyQuotaExceeded: "AccountDailyQuotaExceeded",
    AccountSendingPaused: "AccountSendingPaused",
    AccountSuspended: "AccountSuspended",
    AccountThrottled: "AccountThrottled",
    ConfigurationSetDoesNotExist: "ConfigurationSetDoesNotExist",
    ConfigurationSetSendingPaused: "ConfigurationSetSendingPaused",
    Failed: "Failed",
    InvalidParameterValue: "InvalidParameterValue",
    InvalidSendingPoolName: "InvalidSendingPoolName",
    MailFromDomainNotVerified: "MailFromDomainNotVerified",
    MessageRejected: "MessageRejected",
    Success: "Success",
    TemplateDoesNotExist: "TemplateDoesNotExist",
    TransientFailure: "TransientFailure",
};
class CannotDeleteException extends SESServiceException {
    constructor(opts) {
        super({
            name: "CannotDeleteException",
            $fault: "client",
            ...opts,
        });
        this.name = "CannotDeleteException";
        this.$fault = "client";
        Object.setPrototypeOf(this, CannotDeleteException.prototype);
        this.Name = opts.Name;
    }
}
class LimitExceededException extends SESServiceException {
    constructor(opts) {
        super({
            name: "LimitExceededException",
            $fault: "client",
            ...opts,
        });
        this.name = "LimitExceededException";
        this.$fault = "client";
        Object.setPrototypeOf(this, LimitExceededException.prototype);
    }
}
class RuleSetDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "RuleSetDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "RuleSetDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, RuleSetDoesNotExistException.prototype);
        this.Name = opts.Name;
    }
}
const DimensionValueSource = {
    EMAIL_HEADER: "emailHeader",
    LINK_TAG: "linkTag",
    MESSAGE_TAG: "messageTag",
};
class ConfigurationSetAlreadyExistsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "ConfigurationSetAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        this.name = "ConfigurationSetAlreadyExistsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ConfigurationSetAlreadyExistsException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
    }
}
const ConfigurationSetAttribute = {
    DELIVERY_OPTIONS: "deliveryOptions",
    EVENT_DESTINATIONS: "eventDestinations",
    REPUTATION_OPTIONS: "reputationOptions",
    TRACKING_OPTIONS: "trackingOptions",
};
class ConfigurationSetDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "ConfigurationSetDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "ConfigurationSetDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ConfigurationSetDoesNotExistException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
    }
}
class ConfigurationSetSendingPausedException extends SESServiceException {
    constructor(opts) {
        super({
            name: "ConfigurationSetSendingPausedException",
            $fault: "client",
            ...opts,
        });
        this.name = "ConfigurationSetSendingPausedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ConfigurationSetSendingPausedException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
    }
}
class InvalidConfigurationSetException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidConfigurationSetException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidConfigurationSetException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidConfigurationSetException.prototype);
    }
}
const EventType = {
    BOUNCE: "bounce",
    CLICK: "click",
    COMPLAINT: "complaint",
    DELIVERY: "delivery",
    OPEN: "open",
    REJECT: "reject",
    RENDERING_FAILURE: "renderingFailure",
    SEND: "send",
};
class EventDestinationAlreadyExistsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "EventDestinationAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        this.name = "EventDestinationAlreadyExistsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, EventDestinationAlreadyExistsException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
        this.EventDestinationName = opts.EventDestinationName;
    }
}
class InvalidCloudWatchDestinationException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidCloudWatchDestinationException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidCloudWatchDestinationException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidCloudWatchDestinationException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
        this.EventDestinationName = opts.EventDestinationName;
    }
}
class InvalidFirehoseDestinationException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidFirehoseDestinationException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidFirehoseDestinationException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidFirehoseDestinationException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
        this.EventDestinationName = opts.EventDestinationName;
    }
}
class InvalidSNSDestinationException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidSNSDestinationException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidSNSDestinationException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidSNSDestinationException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
        this.EventDestinationName = opts.EventDestinationName;
    }
}
class InvalidTrackingOptionsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidTrackingOptionsException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidTrackingOptionsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidTrackingOptionsException.prototype);
    }
}
class TrackingOptionsAlreadyExistsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "TrackingOptionsAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        this.name = "TrackingOptionsAlreadyExistsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, TrackingOptionsAlreadyExistsException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
    }
}
class CustomVerificationEmailInvalidContentException extends SESServiceException {
    constructor(opts) {
        super({
            name: "CustomVerificationEmailInvalidContentException",
            $fault: "client",
            ...opts,
        });
        this.name = "CustomVerificationEmailInvalidContentException";
        this.$fault = "client";
        Object.setPrototypeOf(this, CustomVerificationEmailInvalidContentException.prototype);
    }
}
class CustomVerificationEmailTemplateAlreadyExistsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "CustomVerificationEmailTemplateAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        this.name = "CustomVerificationEmailTemplateAlreadyExistsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, CustomVerificationEmailTemplateAlreadyExistsException.prototype);
        this.CustomVerificationEmailTemplateName = opts.CustomVerificationEmailTemplateName;
    }
}
class FromEmailAddressNotVerifiedException extends SESServiceException {
    constructor(opts) {
        super({
            name: "FromEmailAddressNotVerifiedException",
            $fault: "client",
            ...opts,
        });
        this.name = "FromEmailAddressNotVerifiedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, FromEmailAddressNotVerifiedException.prototype);
        this.FromEmailAddress = opts.FromEmailAddress;
    }
}
const ReceiptFilterPolicy = {
    Allow: "Allow",
    Block: "Block",
};
const InvocationType = {
    Event: "Event",
    RequestResponse: "RequestResponse",
};
const SNSActionEncoding = {
    Base64: "Base64",
    UTF8: "UTF-8",
};
const StopScope = {
    RULE_SET: "RuleSet",
};
const TlsPolicy = {
    Optional: "Optional",
    Require: "Require",
};
class InvalidLambdaFunctionException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidLambdaFunctionException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidLambdaFunctionException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidLambdaFunctionException.prototype);
        this.FunctionArn = opts.FunctionArn;
    }
}
class InvalidS3ConfigurationException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidS3ConfigurationException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidS3ConfigurationException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidS3ConfigurationException.prototype);
        this.Bucket = opts.Bucket;
    }
}
class InvalidSnsTopicException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidSnsTopicException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidSnsTopicException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidSnsTopicException.prototype);
        this.Topic = opts.Topic;
    }
}
class RuleDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "RuleDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "RuleDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, RuleDoesNotExistException.prototype);
        this.Name = opts.Name;
    }
}
class InvalidTemplateException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidTemplateException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidTemplateException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidTemplateException.prototype);
        this.TemplateName = opts.TemplateName;
    }
}
const CustomMailFromStatus = {
    Failed: "Failed",
    Pending: "Pending",
    Success: "Success",
    TemporaryFailure: "TemporaryFailure",
};
class CustomVerificationEmailTemplateDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "CustomVerificationEmailTemplateDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "CustomVerificationEmailTemplateDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, CustomVerificationEmailTemplateDoesNotExistException.prototype);
        this.CustomVerificationEmailTemplateName = opts.CustomVerificationEmailTemplateName;
    }
}
class EventDestinationDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "EventDestinationDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "EventDestinationDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, EventDestinationDoesNotExistException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
        this.EventDestinationName = opts.EventDestinationName;
    }
}
class TrackingOptionsDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "TrackingOptionsDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "TrackingOptionsDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, TrackingOptionsDoesNotExistException.prototype);
        this.ConfigurationSetName = opts.ConfigurationSetName;
    }
}
const VerificationStatus = {
    Failed: "Failed",
    NotStarted: "NotStarted",
    Pending: "Pending",
    Success: "Success",
    TemporaryFailure: "TemporaryFailure",
};
class TemplateDoesNotExistException extends SESServiceException {
    constructor(opts) {
        super({
            name: "TemplateDoesNotExistException",
            $fault: "client",
            ...opts,
        });
        this.name = "TemplateDoesNotExistException";
        this.$fault = "client";
        Object.setPrototypeOf(this, TemplateDoesNotExistException.prototype);
        this.TemplateName = opts.TemplateName;
    }
}
const IdentityType = {
    Domain: "Domain",
    EmailAddress: "EmailAddress",
};
class InvalidDeliveryOptionsException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidDeliveryOptionsException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidDeliveryOptionsException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidDeliveryOptionsException.prototype);
    }
}
class InvalidPolicyException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidPolicyException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidPolicyException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidPolicyException.prototype);
    }
}
class InvalidRenderingParameterException extends SESServiceException {
    constructor(opts) {
        super({
            name: "InvalidRenderingParameterException",
            $fault: "client",
            ...opts,
        });
        this.name = "InvalidRenderingParameterException";
        this.$fault = "client";
        Object.setPrototypeOf(this, InvalidRenderingParameterException.prototype);
        this.TemplateName = opts.TemplateName;
    }
}
class MailFromDomainNotVerifiedException extends SESServiceException {
    constructor(opts) {
        super({
            name: "MailFromDomainNotVerifiedException",
            $fault: "client",
            ...opts,
        });
        this.name = "MailFromDomainNotVerifiedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, MailFromDomainNotVerifiedException.prototype);
    }
}
class MessageRejected extends SESServiceException {
    constructor(opts) {
        super({
            name: "MessageRejected",
            $fault: "client",
            ...opts,
        });
        this.name = "MessageRejected";
        this.$fault = "client";
        Object.setPrototypeOf(this, MessageRejected.prototype);
    }
}
class MissingRenderingAttributeException extends SESServiceException {
    constructor(opts) {
        super({
            name: "MissingRenderingAttributeException",
            $fault: "client",
            ...opts,
        });
        this.name = "MissingRenderingAttributeException";
        this.$fault = "client";
        Object.setPrototypeOf(this, MissingRenderingAttributeException.prototype);
        this.TemplateName = opts.TemplateName;
    }
}
const NotificationType = {
    Bounce: "Bounce",
    Complaint: "Complaint",
    Delivery: "Delivery",
};
class ProductionAccessNotGrantedException extends SESServiceException {
    constructor(opts) {
        super({
            name: "ProductionAccessNotGrantedException",
            $fault: "client",
            ...opts,
        });
        this.name = "ProductionAccessNotGrantedException";
        this.$fault = "client";
        Object.setPrototypeOf(this, ProductionAccessNotGrantedException.prototype);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/protocols/Aws_query.js





const se_CloneReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CloneReceiptRuleSetRequest(input, context),
        Action: "CloneReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateConfigurationSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateConfigurationSetRequest(input, context),
        Action: "CreateConfigurationSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateConfigurationSetEventDestinationCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateConfigurationSetEventDestinationRequest(input, context),
        Action: "CreateConfigurationSetEventDestination",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateConfigurationSetTrackingOptionsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateConfigurationSetTrackingOptionsRequest(input, context),
        Action: "CreateConfigurationSetTrackingOptions",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateCustomVerificationEmailTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateCustomVerificationEmailTemplateRequest(input, context),
        Action: "CreateCustomVerificationEmailTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateReceiptFilterCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateReceiptFilterRequest(input, context),
        Action: "CreateReceiptFilter",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateReceiptRuleCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateReceiptRuleRequest(input, context),
        Action: "CreateReceiptRule",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateReceiptRuleSetRequest(input, context),
        Action: "CreateReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_CreateTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_CreateTemplateRequest(input, context),
        Action: "CreateTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteConfigurationSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteConfigurationSetRequest(input, context),
        Action: "DeleteConfigurationSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteConfigurationSetEventDestinationCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteConfigurationSetEventDestinationRequest(input, context),
        Action: "DeleteConfigurationSetEventDestination",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteConfigurationSetTrackingOptionsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteConfigurationSetTrackingOptionsRequest(input, context),
        Action: "DeleteConfigurationSetTrackingOptions",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteCustomVerificationEmailTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteCustomVerificationEmailTemplateRequest(input, context),
        Action: "DeleteCustomVerificationEmailTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteIdentityCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteIdentityRequest(input, context),
        Action: "DeleteIdentity",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteIdentityPolicyCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteIdentityPolicyRequest(input, context),
        Action: "DeleteIdentityPolicy",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteReceiptFilterCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteReceiptFilterRequest(input, context),
        Action: "DeleteReceiptFilter",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteReceiptRuleCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteReceiptRuleRequest(input, context),
        Action: "DeleteReceiptRule",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteReceiptRuleSetRequest(input, context),
        Action: "DeleteReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteTemplateRequest(input, context),
        Action: "DeleteTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DeleteVerifiedEmailAddressCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DeleteVerifiedEmailAddressRequest(input, context),
        Action: "DeleteVerifiedEmailAddress",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DescribeActiveReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DescribeActiveReceiptRuleSetRequest(input, context),
        Action: "DescribeActiveReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DescribeConfigurationSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DescribeConfigurationSetRequest(input, context),
        Action: "DescribeConfigurationSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DescribeReceiptRuleCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DescribeReceiptRuleRequest(input, context),
        Action: "DescribeReceiptRule",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_DescribeReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_DescribeReceiptRuleSetRequest(input, context),
        Action: "DescribeReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetAccountSendingEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    const body = Aws_query_buildFormUrlencodedString({
        Action: "GetAccountSendingEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetCustomVerificationEmailTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetCustomVerificationEmailTemplateRequest(input, context),
        Action: "GetCustomVerificationEmailTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetIdentityDkimAttributesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetIdentityDkimAttributesRequest(input, context),
        Action: "GetIdentityDkimAttributes",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetIdentityMailFromDomainAttributesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetIdentityMailFromDomainAttributesRequest(input, context),
        Action: "GetIdentityMailFromDomainAttributes",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetIdentityNotificationAttributesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetIdentityNotificationAttributesRequest(input, context),
        Action: "GetIdentityNotificationAttributes",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetIdentityPoliciesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetIdentityPoliciesRequest(input, context),
        Action: "GetIdentityPolicies",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetIdentityVerificationAttributesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetIdentityVerificationAttributesRequest(input, context),
        Action: "GetIdentityVerificationAttributes",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetSendQuotaCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    const body = Aws_query_buildFormUrlencodedString({
        Action: "GetSendQuota",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetSendStatisticsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    const body = Aws_query_buildFormUrlencodedString({
        Action: "GetSendStatistics",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_GetTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_GetTemplateRequest(input, context),
        Action: "GetTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListConfigurationSetsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListConfigurationSetsRequest(input, context),
        Action: "ListConfigurationSets",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListCustomVerificationEmailTemplatesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListCustomVerificationEmailTemplatesRequest(input, context),
        Action: "ListCustomVerificationEmailTemplates",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListIdentitiesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListIdentitiesRequest(input, context),
        Action: "ListIdentities",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListIdentityPoliciesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListIdentityPoliciesRequest(input, context),
        Action: "ListIdentityPolicies",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListReceiptFiltersCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListReceiptFiltersRequest(input, context),
        Action: "ListReceiptFilters",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListReceiptRuleSetsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListReceiptRuleSetsRequest(input, context),
        Action: "ListReceiptRuleSets",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListTemplatesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ListTemplatesRequest(input, context),
        Action: "ListTemplates",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ListVerifiedEmailAddressesCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    const body = Aws_query_buildFormUrlencodedString({
        Action: "ListVerifiedEmailAddresses",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_PutConfigurationSetDeliveryOptionsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_PutConfigurationSetDeliveryOptionsRequest(input, context),
        Action: "PutConfigurationSetDeliveryOptions",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_PutIdentityPolicyCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_PutIdentityPolicyRequest(input, context),
        Action: "PutIdentityPolicy",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_ReorderReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_ReorderReceiptRuleSetRequest(input, context),
        Action: "ReorderReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SendBounceCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SendBounceRequest(input, context),
        Action: "SendBounce",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SendBulkTemplatedEmailCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SendBulkTemplatedEmailRequest(input, context),
        Action: "SendBulkTemplatedEmail",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SendCustomVerificationEmailCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SendCustomVerificationEmailRequest(input, context),
        Action: "SendCustomVerificationEmail",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SendEmailCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SendEmailRequest(input, context),
        Action: "SendEmail",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SendRawEmailCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SendRawEmailRequest(input, context),
        Action: "SendRawEmail",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SendTemplatedEmailCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SendTemplatedEmailRequest(input, context),
        Action: "SendTemplatedEmail",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetActiveReceiptRuleSetCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetActiveReceiptRuleSetRequest(input, context),
        Action: "SetActiveReceiptRuleSet",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetIdentityDkimEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetIdentityDkimEnabledRequest(input, context),
        Action: "SetIdentityDkimEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetIdentityFeedbackForwardingEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetIdentityFeedbackForwardingEnabledRequest(input, context),
        Action: "SetIdentityFeedbackForwardingEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetIdentityHeadersInNotificationsEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetIdentityHeadersInNotificationsEnabledRequest(input, context),
        Action: "SetIdentityHeadersInNotificationsEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetIdentityMailFromDomainCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetIdentityMailFromDomainRequest(input, context),
        Action: "SetIdentityMailFromDomain",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetIdentityNotificationTopicCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetIdentityNotificationTopicRequest(input, context),
        Action: "SetIdentityNotificationTopic",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_SetReceiptRulePositionCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_SetReceiptRulePositionRequest(input, context),
        Action: "SetReceiptRulePosition",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_TestRenderTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_TestRenderTemplateRequest(input, context),
        Action: "TestRenderTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateAccountSendingEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateAccountSendingEnabledRequest(input, context),
        Action: "UpdateAccountSendingEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateConfigurationSetEventDestinationCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateConfigurationSetEventDestinationRequest(input, context),
        Action: "UpdateConfigurationSetEventDestination",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateConfigurationSetReputationMetricsEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateConfigurationSetReputationMetricsEnabledRequest(input, context),
        Action: "UpdateConfigurationSetReputationMetricsEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateConfigurationSetSendingEnabledCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateConfigurationSetSendingEnabledRequest(input, context),
        Action: "UpdateConfigurationSetSendingEnabled",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateConfigurationSetTrackingOptionsCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateConfigurationSetTrackingOptionsRequest(input, context),
        Action: "UpdateConfigurationSetTrackingOptions",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateCustomVerificationEmailTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateCustomVerificationEmailTemplateRequest(input, context),
        Action: "UpdateCustomVerificationEmailTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateReceiptRuleCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateReceiptRuleRequest(input, context),
        Action: "UpdateReceiptRule",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_UpdateTemplateCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_UpdateTemplateRequest(input, context),
        Action: "UpdateTemplate",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_VerifyDomainDkimCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_VerifyDomainDkimRequest(input, context),
        Action: "VerifyDomainDkim",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_VerifyDomainIdentityCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_VerifyDomainIdentityRequest(input, context),
        Action: "VerifyDomainIdentity",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_VerifyEmailAddressCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_VerifyEmailAddressRequest(input, context),
        Action: "VerifyEmailAddress",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const se_VerifyEmailIdentityCommand = async (input, context) => {
    const headers = Aws_query_SHARED_HEADERS;
    let body;
    body = Aws_query_buildFormUrlencodedString({
        ...se_VerifyEmailIdentityRequest(input, context),
        Action: "VerifyEmailIdentity",
        Version: "2010-12-01",
    });
    return Aws_query_buildHttpRpcRequest(context, headers, "/", undefined, body);
};
const de_CloneReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CloneReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CloneReceiptRuleSetResponse(data.CloneReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CloneReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AlreadyExists":
        case "com.amazonaws.ses#AlreadyExistsException":
            throw await de_AlreadyExistsExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateConfigurationSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateConfigurationSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateConfigurationSetResponse(data.CreateConfigurationSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateConfigurationSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetAlreadyExists":
        case "com.amazonaws.ses#ConfigurationSetAlreadyExistsException":
            throw await de_ConfigurationSetAlreadyExistsExceptionRes(parsedOutput, context);
        case "InvalidConfigurationSet":
        case "com.amazonaws.ses#InvalidConfigurationSetException":
            throw await de_InvalidConfigurationSetExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateConfigurationSetEventDestinationCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateConfigurationSetEventDestinationCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateConfigurationSetEventDestinationResponse(data.CreateConfigurationSetEventDestinationResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateConfigurationSetEventDestinationCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "EventDestinationAlreadyExists":
        case "com.amazonaws.ses#EventDestinationAlreadyExistsException":
            throw await de_EventDestinationAlreadyExistsExceptionRes(parsedOutput, context);
        case "InvalidCloudWatchDestination":
        case "com.amazonaws.ses#InvalidCloudWatchDestinationException":
            throw await de_InvalidCloudWatchDestinationExceptionRes(parsedOutput, context);
        case "InvalidFirehoseDestination":
        case "com.amazonaws.ses#InvalidFirehoseDestinationException":
            throw await de_InvalidFirehoseDestinationExceptionRes(parsedOutput, context);
        case "InvalidSNSDestination":
        case "com.amazonaws.ses#InvalidSNSDestinationException":
            throw await de_InvalidSNSDestinationExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateConfigurationSetTrackingOptionsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateConfigurationSetTrackingOptionsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateConfigurationSetTrackingOptionsResponse(data.CreateConfigurationSetTrackingOptionsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateConfigurationSetTrackingOptionsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "InvalidTrackingOptions":
        case "com.amazonaws.ses#InvalidTrackingOptionsException":
            throw await de_InvalidTrackingOptionsExceptionRes(parsedOutput, context);
        case "TrackingOptionsAlreadyExistsException":
        case "com.amazonaws.ses#TrackingOptionsAlreadyExistsException":
            throw await de_TrackingOptionsAlreadyExistsExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateCustomVerificationEmailTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateCustomVerificationEmailTemplateCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_CreateCustomVerificationEmailTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "CustomVerificationEmailInvalidContent":
        case "com.amazonaws.ses#CustomVerificationEmailInvalidContentException":
            throw await de_CustomVerificationEmailInvalidContentExceptionRes(parsedOutput, context);
        case "CustomVerificationEmailTemplateAlreadyExists":
        case "com.amazonaws.ses#CustomVerificationEmailTemplateAlreadyExistsException":
            throw await de_CustomVerificationEmailTemplateAlreadyExistsExceptionRes(parsedOutput, context);
        case "FromEmailAddressNotVerified":
        case "com.amazonaws.ses#FromEmailAddressNotVerifiedException":
            throw await de_FromEmailAddressNotVerifiedExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateReceiptFilterCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateReceiptFilterCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateReceiptFilterResponse(data.CreateReceiptFilterResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateReceiptFilterCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AlreadyExists":
        case "com.amazonaws.ses#AlreadyExistsException":
            throw await de_AlreadyExistsExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateReceiptRuleCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateReceiptRuleCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateReceiptRuleResponse(data.CreateReceiptRuleResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateReceiptRuleCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AlreadyExists":
        case "com.amazonaws.ses#AlreadyExistsException":
            throw await de_AlreadyExistsExceptionRes(parsedOutput, context);
        case "InvalidLambdaFunction":
        case "com.amazonaws.ses#InvalidLambdaFunctionException":
            throw await de_InvalidLambdaFunctionExceptionRes(parsedOutput, context);
        case "InvalidS3Configuration":
        case "com.amazonaws.ses#InvalidS3ConfigurationException":
            throw await de_InvalidS3ConfigurationExceptionRes(parsedOutput, context);
        case "InvalidSnsTopic":
        case "com.amazonaws.ses#InvalidSnsTopicException":
            throw await de_InvalidSnsTopicExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        case "RuleDoesNotExist":
        case "com.amazonaws.ses#RuleDoesNotExistException":
            throw await de_RuleDoesNotExistExceptionRes(parsedOutput, context);
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateReceiptRuleSetResponse(data.CreateReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AlreadyExists":
        case "com.amazonaws.ses#AlreadyExistsException":
            throw await de_AlreadyExistsExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_CreateTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_CreateTemplateCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_CreateTemplateResponse(data.CreateTemplateResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_CreateTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AlreadyExists":
        case "com.amazonaws.ses#AlreadyExistsException":
            throw await de_AlreadyExistsExceptionRes(parsedOutput, context);
        case "InvalidTemplate":
        case "com.amazonaws.ses#InvalidTemplateException":
            throw await de_InvalidTemplateExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DeleteConfigurationSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteConfigurationSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteConfigurationSetResponse(data.DeleteConfigurationSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteConfigurationSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DeleteConfigurationSetEventDestinationCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteConfigurationSetEventDestinationCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteConfigurationSetEventDestinationResponse(data.DeleteConfigurationSetEventDestinationResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteConfigurationSetEventDestinationCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "EventDestinationDoesNotExist":
        case "com.amazonaws.ses#EventDestinationDoesNotExistException":
            throw await de_EventDestinationDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DeleteConfigurationSetTrackingOptionsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteConfigurationSetTrackingOptionsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteConfigurationSetTrackingOptionsResponse(data.DeleteConfigurationSetTrackingOptionsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteConfigurationSetTrackingOptionsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "TrackingOptionsDoesNotExistException":
        case "com.amazonaws.ses#TrackingOptionsDoesNotExistException":
            throw await de_TrackingOptionsDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DeleteCustomVerificationEmailTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteCustomVerificationEmailTemplateCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_DeleteCustomVerificationEmailTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DeleteIdentityCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteIdentityCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteIdentityResponse(data.DeleteIdentityResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteIdentityCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DeleteIdentityPolicyCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteIdentityPolicyCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteIdentityPolicyResponse(data.DeleteIdentityPolicyResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteIdentityPolicyCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DeleteReceiptFilterCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteReceiptFilterCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteReceiptFilterResponse(data.DeleteReceiptFilterResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteReceiptFilterCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DeleteReceiptRuleCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteReceiptRuleCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteReceiptRuleResponse(data.DeleteReceiptRuleResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteReceiptRuleCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DeleteReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteReceiptRuleSetResponse(data.DeleteReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "CannotDelete":
        case "com.amazonaws.ses#CannotDeleteException":
            throw await de_CannotDeleteExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DeleteTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteTemplateCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DeleteTemplateResponse(data.DeleteTemplateResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DeleteTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DeleteVerifiedEmailAddressCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DeleteVerifiedEmailAddressCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_DeleteVerifiedEmailAddressCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DescribeActiveReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DescribeActiveReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DescribeActiveReceiptRuleSetResponse(data.DescribeActiveReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DescribeActiveReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_DescribeConfigurationSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DescribeConfigurationSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DescribeConfigurationSetResponse(data.DescribeConfigurationSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DescribeConfigurationSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DescribeReceiptRuleCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DescribeReceiptRuleCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DescribeReceiptRuleResponse(data.DescribeReceiptRuleResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DescribeReceiptRuleCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RuleDoesNotExist":
        case "com.amazonaws.ses#RuleDoesNotExistException":
            throw await de_RuleDoesNotExistExceptionRes(parsedOutput, context);
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_DescribeReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_DescribeReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_DescribeReceiptRuleSetResponse(data.DescribeReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_DescribeReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_GetAccountSendingEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetAccountSendingEnabledCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetAccountSendingEnabledResponse(data.GetAccountSendingEnabledResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetAccountSendingEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetCustomVerificationEmailTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetCustomVerificationEmailTemplateCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetCustomVerificationEmailTemplateResponse(data.GetCustomVerificationEmailTemplateResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetCustomVerificationEmailTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "CustomVerificationEmailTemplateDoesNotExist":
        case "com.amazonaws.ses#CustomVerificationEmailTemplateDoesNotExistException":
            throw await de_CustomVerificationEmailTemplateDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_GetIdentityDkimAttributesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetIdentityDkimAttributesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetIdentityDkimAttributesResponse(data.GetIdentityDkimAttributesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetIdentityDkimAttributesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetIdentityMailFromDomainAttributesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetIdentityMailFromDomainAttributesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetIdentityMailFromDomainAttributesResponse(data.GetIdentityMailFromDomainAttributesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetIdentityMailFromDomainAttributesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetIdentityNotificationAttributesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetIdentityNotificationAttributesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetIdentityNotificationAttributesResponse(data.GetIdentityNotificationAttributesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetIdentityNotificationAttributesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetIdentityPoliciesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetIdentityPoliciesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetIdentityPoliciesResponse(data.GetIdentityPoliciesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetIdentityPoliciesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetIdentityVerificationAttributesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetIdentityVerificationAttributesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetIdentityVerificationAttributesResponse(data.GetIdentityVerificationAttributesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetIdentityVerificationAttributesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetSendQuotaCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetSendQuotaCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetSendQuotaResponse(data.GetSendQuotaResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetSendQuotaCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetSendStatisticsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetSendStatisticsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetSendStatisticsResponse(data.GetSendStatisticsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetSendStatisticsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_GetTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_GetTemplateCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_GetTemplateResponse(data.GetTemplateResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_GetTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "TemplateDoesNotExist":
        case "com.amazonaws.ses#TemplateDoesNotExistException":
            throw await de_TemplateDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_ListConfigurationSetsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListConfigurationSetsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListConfigurationSetsResponse(data.ListConfigurationSetsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListConfigurationSetsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListCustomVerificationEmailTemplatesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListCustomVerificationEmailTemplatesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListCustomVerificationEmailTemplatesResponse(data.ListCustomVerificationEmailTemplatesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListCustomVerificationEmailTemplatesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListIdentitiesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListIdentitiesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListIdentitiesResponse(data.ListIdentitiesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListIdentitiesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListIdentityPoliciesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListIdentityPoliciesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListIdentityPoliciesResponse(data.ListIdentityPoliciesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListIdentityPoliciesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListReceiptFiltersCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListReceiptFiltersCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListReceiptFiltersResponse(data.ListReceiptFiltersResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListReceiptFiltersCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListReceiptRuleSetsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListReceiptRuleSetsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListReceiptRuleSetsResponse(data.ListReceiptRuleSetsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListReceiptRuleSetsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListTemplatesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListTemplatesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListTemplatesResponse(data.ListTemplatesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListTemplatesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_ListVerifiedEmailAddressesCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ListVerifiedEmailAddressesCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ListVerifiedEmailAddressesResponse(data.ListVerifiedEmailAddressesResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ListVerifiedEmailAddressesCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_PutConfigurationSetDeliveryOptionsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_PutConfigurationSetDeliveryOptionsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_PutConfigurationSetDeliveryOptionsResponse(data.PutConfigurationSetDeliveryOptionsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_PutConfigurationSetDeliveryOptionsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "InvalidDeliveryOptions":
        case "com.amazonaws.ses#InvalidDeliveryOptionsException":
            throw await de_InvalidDeliveryOptionsExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_PutIdentityPolicyCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_PutIdentityPolicyCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_PutIdentityPolicyResponse(data.PutIdentityPolicyResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_PutIdentityPolicyCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidPolicy":
        case "com.amazonaws.ses#InvalidPolicyException":
            throw await de_InvalidPolicyExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_ReorderReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_ReorderReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_ReorderReceiptRuleSetResponse(data.ReorderReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_ReorderReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RuleDoesNotExist":
        case "com.amazonaws.ses#RuleDoesNotExistException":
            throw await de_RuleDoesNotExistExceptionRes(parsedOutput, context);
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SendBounceCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SendBounceCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SendBounceResponse(data.SendBounceResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SendBounceCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "MessageRejected":
        case "com.amazonaws.ses#MessageRejected":
            throw await de_MessageRejectedRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SendBulkTemplatedEmailCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SendBulkTemplatedEmailCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SendBulkTemplatedEmailResponse(data.SendBulkTemplatedEmailResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SendBulkTemplatedEmailCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccountSendingPausedException":
        case "com.amazonaws.ses#AccountSendingPausedException":
            throw await de_AccountSendingPausedExceptionRes(parsedOutput, context);
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "ConfigurationSetSendingPausedException":
        case "com.amazonaws.ses#ConfigurationSetSendingPausedException":
            throw await de_ConfigurationSetSendingPausedExceptionRes(parsedOutput, context);
        case "MailFromDomainNotVerifiedException":
        case "com.amazonaws.ses#MailFromDomainNotVerifiedException":
            throw await de_MailFromDomainNotVerifiedExceptionRes(parsedOutput, context);
        case "MessageRejected":
        case "com.amazonaws.ses#MessageRejected":
            throw await de_MessageRejectedRes(parsedOutput, context);
        case "TemplateDoesNotExist":
        case "com.amazonaws.ses#TemplateDoesNotExistException":
            throw await de_TemplateDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SendCustomVerificationEmailCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SendCustomVerificationEmailCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SendCustomVerificationEmailResponse(data.SendCustomVerificationEmailResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SendCustomVerificationEmailCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "CustomVerificationEmailTemplateDoesNotExist":
        case "com.amazonaws.ses#CustomVerificationEmailTemplateDoesNotExistException":
            throw await de_CustomVerificationEmailTemplateDoesNotExistExceptionRes(parsedOutput, context);
        case "FromEmailAddressNotVerified":
        case "com.amazonaws.ses#FromEmailAddressNotVerifiedException":
            throw await de_FromEmailAddressNotVerifiedExceptionRes(parsedOutput, context);
        case "MessageRejected":
        case "com.amazonaws.ses#MessageRejected":
            throw await de_MessageRejectedRes(parsedOutput, context);
        case "ProductionAccessNotGranted":
        case "com.amazonaws.ses#ProductionAccessNotGrantedException":
            throw await de_ProductionAccessNotGrantedExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SendEmailCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SendEmailCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SendEmailResponse(data.SendEmailResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SendEmailCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccountSendingPausedException":
        case "com.amazonaws.ses#AccountSendingPausedException":
            throw await de_AccountSendingPausedExceptionRes(parsedOutput, context);
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "ConfigurationSetSendingPausedException":
        case "com.amazonaws.ses#ConfigurationSetSendingPausedException":
            throw await de_ConfigurationSetSendingPausedExceptionRes(parsedOutput, context);
        case "MailFromDomainNotVerifiedException":
        case "com.amazonaws.ses#MailFromDomainNotVerifiedException":
            throw await de_MailFromDomainNotVerifiedExceptionRes(parsedOutput, context);
        case "MessageRejected":
        case "com.amazonaws.ses#MessageRejected":
            throw await de_MessageRejectedRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SendRawEmailCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SendRawEmailCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SendRawEmailResponse(data.SendRawEmailResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SendRawEmailCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccountSendingPausedException":
        case "com.amazonaws.ses#AccountSendingPausedException":
            throw await de_AccountSendingPausedExceptionRes(parsedOutput, context);
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "ConfigurationSetSendingPausedException":
        case "com.amazonaws.ses#ConfigurationSetSendingPausedException":
            throw await de_ConfigurationSetSendingPausedExceptionRes(parsedOutput, context);
        case "MailFromDomainNotVerifiedException":
        case "com.amazonaws.ses#MailFromDomainNotVerifiedException":
            throw await de_MailFromDomainNotVerifiedExceptionRes(parsedOutput, context);
        case "MessageRejected":
        case "com.amazonaws.ses#MessageRejected":
            throw await de_MessageRejectedRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SendTemplatedEmailCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SendTemplatedEmailCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SendTemplatedEmailResponse(data.SendTemplatedEmailResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SendTemplatedEmailCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "AccountSendingPausedException":
        case "com.amazonaws.ses#AccountSendingPausedException":
            throw await de_AccountSendingPausedExceptionRes(parsedOutput, context);
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "ConfigurationSetSendingPausedException":
        case "com.amazonaws.ses#ConfigurationSetSendingPausedException":
            throw await de_ConfigurationSetSendingPausedExceptionRes(parsedOutput, context);
        case "MailFromDomainNotVerifiedException":
        case "com.amazonaws.ses#MailFromDomainNotVerifiedException":
            throw await de_MailFromDomainNotVerifiedExceptionRes(parsedOutput, context);
        case "MessageRejected":
        case "com.amazonaws.ses#MessageRejected":
            throw await de_MessageRejectedRes(parsedOutput, context);
        case "TemplateDoesNotExist":
        case "com.amazonaws.ses#TemplateDoesNotExistException":
            throw await de_TemplateDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SetActiveReceiptRuleSetCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetActiveReceiptRuleSetCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetActiveReceiptRuleSetResponse(data.SetActiveReceiptRuleSetResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetActiveReceiptRuleSetCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_SetIdentityDkimEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetIdentityDkimEnabledCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetIdentityDkimEnabledResponse(data.SetIdentityDkimEnabledResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetIdentityDkimEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_SetIdentityFeedbackForwardingEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetIdentityFeedbackForwardingEnabledCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetIdentityFeedbackForwardingEnabledResponse(data.SetIdentityFeedbackForwardingEnabledResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetIdentityFeedbackForwardingEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_SetIdentityHeadersInNotificationsEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetIdentityHeadersInNotificationsEnabledCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetIdentityHeadersInNotificationsEnabledResponse(data.SetIdentityHeadersInNotificationsEnabledResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetIdentityHeadersInNotificationsEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_SetIdentityMailFromDomainCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetIdentityMailFromDomainCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetIdentityMailFromDomainResponse(data.SetIdentityMailFromDomainResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetIdentityMailFromDomainCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_SetIdentityNotificationTopicCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetIdentityNotificationTopicCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetIdentityNotificationTopicResponse(data.SetIdentityNotificationTopicResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetIdentityNotificationTopicCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_SetReceiptRulePositionCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_SetReceiptRulePositionCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_SetReceiptRulePositionResponse(data.SetReceiptRulePositionResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_SetReceiptRulePositionCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "RuleDoesNotExist":
        case "com.amazonaws.ses#RuleDoesNotExistException":
            throw await de_RuleDoesNotExistExceptionRes(parsedOutput, context);
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_TestRenderTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_TestRenderTemplateCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_TestRenderTemplateResponse(data.TestRenderTemplateResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_TestRenderTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidRenderingParameter":
        case "com.amazonaws.ses#InvalidRenderingParameterException":
            throw await de_InvalidRenderingParameterExceptionRes(parsedOutput, context);
        case "MissingRenderingAttribute":
        case "com.amazonaws.ses#MissingRenderingAttributeException":
            throw await de_MissingRenderingAttributeExceptionRes(parsedOutput, context);
        case "TemplateDoesNotExist":
        case "com.amazonaws.ses#TemplateDoesNotExistException":
            throw await de_TemplateDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateAccountSendingEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateAccountSendingEnabledCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_UpdateAccountSendingEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_UpdateConfigurationSetEventDestinationCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateConfigurationSetEventDestinationCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_UpdateConfigurationSetEventDestinationResponse(data.UpdateConfigurationSetEventDestinationResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_UpdateConfigurationSetEventDestinationCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "EventDestinationDoesNotExist":
        case "com.amazonaws.ses#EventDestinationDoesNotExistException":
            throw await de_EventDestinationDoesNotExistExceptionRes(parsedOutput, context);
        case "InvalidCloudWatchDestination":
        case "com.amazonaws.ses#InvalidCloudWatchDestinationException":
            throw await de_InvalidCloudWatchDestinationExceptionRes(parsedOutput, context);
        case "InvalidFirehoseDestination":
        case "com.amazonaws.ses#InvalidFirehoseDestinationException":
            throw await de_InvalidFirehoseDestinationExceptionRes(parsedOutput, context);
        case "InvalidSNSDestination":
        case "com.amazonaws.ses#InvalidSNSDestinationException":
            throw await de_InvalidSNSDestinationExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateConfigurationSetReputationMetricsEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateConfigurationSetReputationMetricsEnabledCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_UpdateConfigurationSetReputationMetricsEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateConfigurationSetSendingEnabledCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateConfigurationSetSendingEnabledCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_UpdateConfigurationSetSendingEnabledCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateConfigurationSetTrackingOptionsCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateConfigurationSetTrackingOptionsCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_UpdateConfigurationSetTrackingOptionsResponse(data.UpdateConfigurationSetTrackingOptionsResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_UpdateConfigurationSetTrackingOptionsCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "ConfigurationSetDoesNotExist":
        case "com.amazonaws.ses#ConfigurationSetDoesNotExistException":
            throw await de_ConfigurationSetDoesNotExistExceptionRes(parsedOutput, context);
        case "InvalidTrackingOptions":
        case "com.amazonaws.ses#InvalidTrackingOptionsException":
            throw await de_InvalidTrackingOptionsExceptionRes(parsedOutput, context);
        case "TrackingOptionsDoesNotExistException":
        case "com.amazonaws.ses#TrackingOptionsDoesNotExistException":
            throw await de_TrackingOptionsDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateCustomVerificationEmailTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateCustomVerificationEmailTemplateCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_UpdateCustomVerificationEmailTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "CustomVerificationEmailInvalidContent":
        case "com.amazonaws.ses#CustomVerificationEmailInvalidContentException":
            throw await de_CustomVerificationEmailInvalidContentExceptionRes(parsedOutput, context);
        case "CustomVerificationEmailTemplateDoesNotExist":
        case "com.amazonaws.ses#CustomVerificationEmailTemplateDoesNotExistException":
            throw await de_CustomVerificationEmailTemplateDoesNotExistExceptionRes(parsedOutput, context);
        case "FromEmailAddressNotVerified":
        case "com.amazonaws.ses#FromEmailAddressNotVerifiedException":
            throw await de_FromEmailAddressNotVerifiedExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateReceiptRuleCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateReceiptRuleCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_UpdateReceiptRuleResponse(data.UpdateReceiptRuleResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_UpdateReceiptRuleCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidLambdaFunction":
        case "com.amazonaws.ses#InvalidLambdaFunctionException":
            throw await de_InvalidLambdaFunctionExceptionRes(parsedOutput, context);
        case "InvalidS3Configuration":
        case "com.amazonaws.ses#InvalidS3ConfigurationException":
            throw await de_InvalidS3ConfigurationExceptionRes(parsedOutput, context);
        case "InvalidSnsTopic":
        case "com.amazonaws.ses#InvalidSnsTopicException":
            throw await de_InvalidSnsTopicExceptionRes(parsedOutput, context);
        case "LimitExceeded":
        case "com.amazonaws.ses#LimitExceededException":
            throw await de_LimitExceededExceptionRes(parsedOutput, context);
        case "RuleDoesNotExist":
        case "com.amazonaws.ses#RuleDoesNotExistException":
            throw await de_RuleDoesNotExistExceptionRes(parsedOutput, context);
        case "RuleSetDoesNotExist":
        case "com.amazonaws.ses#RuleSetDoesNotExistException":
            throw await de_RuleSetDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_UpdateTemplateCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_UpdateTemplateCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_UpdateTemplateResponse(data.UpdateTemplateResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_UpdateTemplateCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "InvalidTemplate":
        case "com.amazonaws.ses#InvalidTemplateException":
            throw await de_InvalidTemplateExceptionRes(parsedOutput, context);
        case "TemplateDoesNotExist":
        case "com.amazonaws.ses#TemplateDoesNotExistException":
            throw await de_TemplateDoesNotExistExceptionRes(parsedOutput, context);
        default:
            const parsedBody = parsedOutput.body;
            return protocols_Aws_query_throwDefaultError({
                output,
                parsedBody: parsedBody.Error,
                errorCode,
            });
    }
};
const de_VerifyDomainDkimCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_VerifyDomainDkimCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_VerifyDomainDkimResponse(data.VerifyDomainDkimResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_VerifyDomainDkimCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_VerifyDomainIdentityCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_VerifyDomainIdentityCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_VerifyDomainIdentityResponse(data.VerifyDomainIdentityResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_VerifyDomainIdentityCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_VerifyEmailAddressCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_VerifyEmailAddressCommandError(output, context);
    }
    await collect_stream_body_collectBody(output.body, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
    };
    return response;
};
const de_VerifyEmailAddressCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_VerifyEmailIdentityCommand = async (output, context) => {
    if (output.statusCode >= 300) {
        return de_VerifyEmailIdentityCommandError(output, context);
    }
    const data = await Aws_query_parseBody(output.body, context);
    let contents = {};
    contents = de_VerifyEmailIdentityResponse(data.VerifyEmailIdentityResult, context);
    const response = {
        $metadata: protocols_Aws_query_deserializeMetadata(output),
        ...contents,
    };
    return response;
};
const de_VerifyEmailIdentityCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await Aws_query_parseErrorBody(output.body, context),
    };
    const errorCode = Aws_query_loadQueryErrorCode(output, parsedOutput.body);
    const parsedBody = parsedOutput.body;
    return protocols_Aws_query_throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        errorCode,
    });
};
const de_AccountSendingPausedExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_AccountSendingPausedException(body.Error, context);
    const exception = new AccountSendingPausedException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_AlreadyExistsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_AlreadyExistsException(body.Error, context);
    const exception = new AlreadyExistsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_CannotDeleteExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_CannotDeleteException(body.Error, context);
    const exception = new CannotDeleteException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_ConfigurationSetAlreadyExistsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_ConfigurationSetAlreadyExistsException(body.Error, context);
    const exception = new ConfigurationSetAlreadyExistsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_ConfigurationSetDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_ConfigurationSetDoesNotExistException(body.Error, context);
    const exception = new ConfigurationSetDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_ConfigurationSetSendingPausedExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_ConfigurationSetSendingPausedException(body.Error, context);
    const exception = new ConfigurationSetSendingPausedException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_CustomVerificationEmailInvalidContentExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_CustomVerificationEmailInvalidContentException(body.Error, context);
    const exception = new CustomVerificationEmailInvalidContentException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_CustomVerificationEmailTemplateAlreadyExistsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_CustomVerificationEmailTemplateAlreadyExistsException(body.Error, context);
    const exception = new CustomVerificationEmailTemplateAlreadyExistsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_CustomVerificationEmailTemplateDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_CustomVerificationEmailTemplateDoesNotExistException(body.Error, context);
    const exception = new CustomVerificationEmailTemplateDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_EventDestinationAlreadyExistsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_EventDestinationAlreadyExistsException(body.Error, context);
    const exception = new EventDestinationAlreadyExistsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_EventDestinationDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_EventDestinationDoesNotExistException(body.Error, context);
    const exception = new EventDestinationDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_FromEmailAddressNotVerifiedExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_FromEmailAddressNotVerifiedException(body.Error, context);
    const exception = new FromEmailAddressNotVerifiedException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidCloudWatchDestinationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidCloudWatchDestinationException(body.Error, context);
    const exception = new InvalidCloudWatchDestinationException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidConfigurationSetExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidConfigurationSetException(body.Error, context);
    const exception = new InvalidConfigurationSetException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidDeliveryOptionsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidDeliveryOptionsException(body.Error, context);
    const exception = new InvalidDeliveryOptionsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidFirehoseDestinationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidFirehoseDestinationException(body.Error, context);
    const exception = new InvalidFirehoseDestinationException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidLambdaFunctionExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidLambdaFunctionException(body.Error, context);
    const exception = new InvalidLambdaFunctionException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidPolicyExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidPolicyException(body.Error, context);
    const exception = new InvalidPolicyException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidRenderingParameterExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidRenderingParameterException(body.Error, context);
    const exception = new InvalidRenderingParameterException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidS3ConfigurationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidS3ConfigurationException(body.Error, context);
    const exception = new InvalidS3ConfigurationException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidSNSDestinationExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidSNSDestinationException(body.Error, context);
    const exception = new InvalidSNSDestinationException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidSnsTopicExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidSnsTopicException(body.Error, context);
    const exception = new InvalidSnsTopicException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidTemplateExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidTemplateException(body.Error, context);
    const exception = new InvalidTemplateException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_InvalidTrackingOptionsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_InvalidTrackingOptionsException(body.Error, context);
    const exception = new InvalidTrackingOptionsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_LimitExceededExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_LimitExceededException(body.Error, context);
    const exception = new LimitExceededException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_MailFromDomainNotVerifiedExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_MailFromDomainNotVerifiedException(body.Error, context);
    const exception = new MailFromDomainNotVerifiedException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_MessageRejectedRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_MessageRejected(body.Error, context);
    const exception = new MessageRejected({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_MissingRenderingAttributeExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_MissingRenderingAttributeException(body.Error, context);
    const exception = new MissingRenderingAttributeException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_ProductionAccessNotGrantedExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_ProductionAccessNotGrantedException(body.Error, context);
    const exception = new ProductionAccessNotGrantedException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_RuleDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_RuleDoesNotExistException(body.Error, context);
    const exception = new RuleDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_RuleSetDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_RuleSetDoesNotExistException(body.Error, context);
    const exception = new RuleSetDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_TemplateDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_TemplateDoesNotExistException(body.Error, context);
    const exception = new TemplateDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_TrackingOptionsAlreadyExistsExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_TrackingOptionsAlreadyExistsException(body.Error, context);
    const exception = new TrackingOptionsAlreadyExistsException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const de_TrackingOptionsDoesNotExistExceptionRes = async (parsedOutput, context) => {
    const body = parsedOutput.body;
    const deserialized = de_TrackingOptionsDoesNotExistException(body.Error, context);
    const exception = new TrackingOptionsDoesNotExistException({
        $metadata: protocols_Aws_query_deserializeMetadata(parsedOutput),
        ...deserialized,
    });
    return decorateServiceException(exception, body);
};
const se_AddHeaderAction = (input, context) => {
    const entries = {};
    if (input.HeaderName != null) {
        entries["HeaderName"] = input.HeaderName;
    }
    if (input.HeaderValue != null) {
        entries["HeaderValue"] = input.HeaderValue;
    }
    return entries;
};
const se_AddressList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_Body = (input, context) => {
    const entries = {};
    if (input.Text != null) {
        const memberEntries = se_Content(input.Text, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Text.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Html != null) {
        const memberEntries = se_Content(input.Html, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Html.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_BounceAction = (input, context) => {
    const entries = {};
    if (input.TopicArn != null) {
        entries["TopicArn"] = input.TopicArn;
    }
    if (input.SmtpReplyCode != null) {
        entries["SmtpReplyCode"] = input.SmtpReplyCode;
    }
    if (input.StatusCode != null) {
        entries["StatusCode"] = input.StatusCode;
    }
    if (input.Message != null) {
        entries["Message"] = input.Message;
    }
    if (input.Sender != null) {
        entries["Sender"] = input.Sender;
    }
    return entries;
};
const se_BouncedRecipientInfo = (input, context) => {
    const entries = {};
    if (input.Recipient != null) {
        entries["Recipient"] = input.Recipient;
    }
    if (input.RecipientArn != null) {
        entries["RecipientArn"] = input.RecipientArn;
    }
    if (input.BounceType != null) {
        entries["BounceType"] = input.BounceType;
    }
    if (input.RecipientDsnFields != null) {
        const memberEntries = se_RecipientDsnFields(input.RecipientDsnFields, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `RecipientDsnFields.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_BouncedRecipientInfoList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_BouncedRecipientInfo(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_BulkEmailDestination = (input, context) => {
    const entries = {};
    if (input.Destination != null) {
        const memberEntries = se_Destination(input.Destination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Destination.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReplacementTags != null) {
        const memberEntries = se_MessageTagList(input.ReplacementTags, context);
        if (input.ReplacementTags?.length === 0) {
            entries.ReplacementTags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ReplacementTags.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReplacementTemplateData != null) {
        entries["ReplacementTemplateData"] = input.ReplacementTemplateData;
    }
    return entries;
};
const se_BulkEmailDestinationList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_BulkEmailDestination(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_CloneReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.OriginalRuleSetName != null) {
        entries["OriginalRuleSetName"] = input.OriginalRuleSetName;
    }
    return entries;
};
const se_CloudWatchDestination = (input, context) => {
    const entries = {};
    if (input.DimensionConfigurations != null) {
        const memberEntries = se_CloudWatchDimensionConfigurations(input.DimensionConfigurations, context);
        if (input.DimensionConfigurations?.length === 0) {
            entries.DimensionConfigurations = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `DimensionConfigurations.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_CloudWatchDimensionConfiguration = (input, context) => {
    const entries = {};
    if (input.DimensionName != null) {
        entries["DimensionName"] = input.DimensionName;
    }
    if (input.DimensionValueSource != null) {
        entries["DimensionValueSource"] = input.DimensionValueSource;
    }
    if (input.DefaultDimensionValue != null) {
        entries["DefaultDimensionValue"] = input.DefaultDimensionValue;
    }
    return entries;
};
const se_CloudWatchDimensionConfigurations = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_CloudWatchDimensionConfiguration(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_ConfigurationSet = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    return entries;
};
const se_ConfigurationSetAttributeList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_Content = (input, context) => {
    const entries = {};
    if (input.Data != null) {
        entries["Data"] = input.Data;
    }
    if (input.Charset != null) {
        entries["Charset"] = input.Charset;
    }
    return entries;
};
const se_CreateConfigurationSetEventDestinationRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.EventDestination != null) {
        const memberEntries = se_EventDestination(input.EventDestination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `EventDestination.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_CreateConfigurationSetRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSet != null) {
        const memberEntries = se_ConfigurationSet(input.ConfigurationSet, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ConfigurationSet.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_CreateConfigurationSetTrackingOptionsRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.TrackingOptions != null) {
        const memberEntries = se_TrackingOptions(input.TrackingOptions, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `TrackingOptions.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_CreateCustomVerificationEmailTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    if (input.FromEmailAddress != null) {
        entries["FromEmailAddress"] = input.FromEmailAddress;
    }
    if (input.TemplateSubject != null) {
        entries["TemplateSubject"] = input.TemplateSubject;
    }
    if (input.TemplateContent != null) {
        entries["TemplateContent"] = input.TemplateContent;
    }
    if (input.SuccessRedirectionURL != null) {
        entries["SuccessRedirectionURL"] = input.SuccessRedirectionURL;
    }
    if (input.FailureRedirectionURL != null) {
        entries["FailureRedirectionURL"] = input.FailureRedirectionURL;
    }
    return entries;
};
const se_CreateReceiptFilterRequest = (input, context) => {
    const entries = {};
    if (input.Filter != null) {
        const memberEntries = se_ReceiptFilter(input.Filter, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Filter.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_CreateReceiptRuleRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.After != null) {
        entries["After"] = input.After;
    }
    if (input.Rule != null) {
        const memberEntries = se_ReceiptRule(input.Rule, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Rule.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_CreateReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    return entries;
};
const se_CreateTemplateRequest = (input, context) => {
    const entries = {};
    if (input.Template != null) {
        const memberEntries = se_Template(input.Template, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Template.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_DeleteConfigurationSetEventDestinationRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.EventDestinationName != null) {
        entries["EventDestinationName"] = input.EventDestinationName;
    }
    return entries;
};
const se_DeleteConfigurationSetRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    return entries;
};
const se_DeleteConfigurationSetTrackingOptionsRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    return entries;
};
const se_DeleteCustomVerificationEmailTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    return entries;
};
const se_DeleteIdentityPolicyRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.PolicyName != null) {
        entries["PolicyName"] = input.PolicyName;
    }
    return entries;
};
const se_DeleteIdentityRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    return entries;
};
const se_DeleteReceiptFilterRequest = (input, context) => {
    const entries = {};
    if (input.FilterName != null) {
        entries["FilterName"] = input.FilterName;
    }
    return entries;
};
const se_DeleteReceiptRuleRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.RuleName != null) {
        entries["RuleName"] = input.RuleName;
    }
    return entries;
};
const se_DeleteReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    return entries;
};
const se_DeleteTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    return entries;
};
const se_DeleteVerifiedEmailAddressRequest = (input, context) => {
    const entries = {};
    if (input.EmailAddress != null) {
        entries["EmailAddress"] = input.EmailAddress;
    }
    return entries;
};
const se_DeliveryOptions = (input, context) => {
    const entries = {};
    if (input.TlsPolicy != null) {
        entries["TlsPolicy"] = input.TlsPolicy;
    }
    return entries;
};
const se_DescribeActiveReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    return entries;
};
const se_DescribeConfigurationSetRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.ConfigurationSetAttributeNames != null) {
        const memberEntries = se_ConfigurationSetAttributeList(input.ConfigurationSetAttributeNames, context);
        if (input.ConfigurationSetAttributeNames?.length === 0) {
            entries.ConfigurationSetAttributeNames = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ConfigurationSetAttributeNames.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_DescribeReceiptRuleRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.RuleName != null) {
        entries["RuleName"] = input.RuleName;
    }
    return entries;
};
const se_DescribeReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    return entries;
};
const se_Destination = (input, context) => {
    const entries = {};
    if (input.ToAddresses != null) {
        const memberEntries = se_AddressList(input.ToAddresses, context);
        if (input.ToAddresses?.length === 0) {
            entries.ToAddresses = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ToAddresses.${key}`;
            entries[loc] = value;
        });
    }
    if (input.CcAddresses != null) {
        const memberEntries = se_AddressList(input.CcAddresses, context);
        if (input.CcAddresses?.length === 0) {
            entries.CcAddresses = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `CcAddresses.${key}`;
            entries[loc] = value;
        });
    }
    if (input.BccAddresses != null) {
        const memberEntries = se_AddressList(input.BccAddresses, context);
        if (input.BccAddresses?.length === 0) {
            entries.BccAddresses = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `BccAddresses.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_EventDestination = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    if (input.Enabled != null) {
        entries["Enabled"] = input.Enabled;
    }
    if (input.MatchingEventTypes != null) {
        const memberEntries = se_EventTypes(input.MatchingEventTypes, context);
        if (input.MatchingEventTypes?.length === 0) {
            entries.MatchingEventTypes = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `MatchingEventTypes.${key}`;
            entries[loc] = value;
        });
    }
    if (input.KinesisFirehoseDestination != null) {
        const memberEntries = se_KinesisFirehoseDestination(input.KinesisFirehoseDestination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `KinesisFirehoseDestination.${key}`;
            entries[loc] = value;
        });
    }
    if (input.CloudWatchDestination != null) {
        const memberEntries = se_CloudWatchDestination(input.CloudWatchDestination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `CloudWatchDestination.${key}`;
            entries[loc] = value;
        });
    }
    if (input.SNSDestination != null) {
        const memberEntries = se_SNSDestination(input.SNSDestination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `SNSDestination.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_EventTypes = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_ExtensionField = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    if (input.Value != null) {
        entries["Value"] = input.Value;
    }
    return entries;
};
const se_ExtensionFieldList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_ExtensionField(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_GetCustomVerificationEmailTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    return entries;
};
const se_GetIdentityDkimAttributesRequest = (input, context) => {
    const entries = {};
    if (input.Identities != null) {
        const memberEntries = se_IdentityList(input.Identities, context);
        if (input.Identities?.length === 0) {
            entries.Identities = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Identities.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_GetIdentityMailFromDomainAttributesRequest = (input, context) => {
    const entries = {};
    if (input.Identities != null) {
        const memberEntries = se_IdentityList(input.Identities, context);
        if (input.Identities?.length === 0) {
            entries.Identities = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Identities.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_GetIdentityNotificationAttributesRequest = (input, context) => {
    const entries = {};
    if (input.Identities != null) {
        const memberEntries = se_IdentityList(input.Identities, context);
        if (input.Identities?.length === 0) {
            entries.Identities = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Identities.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_GetIdentityPoliciesRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.PolicyNames != null) {
        const memberEntries = se_PolicyNameList(input.PolicyNames, context);
        if (input.PolicyNames?.length === 0) {
            entries.PolicyNames = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `PolicyNames.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_GetIdentityVerificationAttributesRequest = (input, context) => {
    const entries = {};
    if (input.Identities != null) {
        const memberEntries = se_IdentityList(input.Identities, context);
        if (input.Identities?.length === 0) {
            entries.Identities = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Identities.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_GetTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    return entries;
};
const se_IdentityList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_KinesisFirehoseDestination = (input, context) => {
    const entries = {};
    if (input.IAMRoleARN != null) {
        entries["IAMRoleARN"] = input.IAMRoleARN;
    }
    if (input.DeliveryStreamARN != null) {
        entries["DeliveryStreamARN"] = input.DeliveryStreamARN;
    }
    return entries;
};
const se_LambdaAction = (input, context) => {
    const entries = {};
    if (input.TopicArn != null) {
        entries["TopicArn"] = input.TopicArn;
    }
    if (input.FunctionArn != null) {
        entries["FunctionArn"] = input.FunctionArn;
    }
    if (input.InvocationType != null) {
        entries["InvocationType"] = input.InvocationType;
    }
    return entries;
};
const se_ListConfigurationSetsRequest = (input, context) => {
    const entries = {};
    if (input.NextToken != null) {
        entries["NextToken"] = input.NextToken;
    }
    if (input.MaxItems != null) {
        entries["MaxItems"] = input.MaxItems;
    }
    return entries;
};
const se_ListCustomVerificationEmailTemplatesRequest = (input, context) => {
    const entries = {};
    if (input.NextToken != null) {
        entries["NextToken"] = input.NextToken;
    }
    if (input.MaxResults != null) {
        entries["MaxResults"] = input.MaxResults;
    }
    return entries;
};
const se_ListIdentitiesRequest = (input, context) => {
    const entries = {};
    if (input.IdentityType != null) {
        entries["IdentityType"] = input.IdentityType;
    }
    if (input.NextToken != null) {
        entries["NextToken"] = input.NextToken;
    }
    if (input.MaxItems != null) {
        entries["MaxItems"] = input.MaxItems;
    }
    return entries;
};
const se_ListIdentityPoliciesRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    return entries;
};
const se_ListReceiptFiltersRequest = (input, context) => {
    const entries = {};
    return entries;
};
const se_ListReceiptRuleSetsRequest = (input, context) => {
    const entries = {};
    if (input.NextToken != null) {
        entries["NextToken"] = input.NextToken;
    }
    return entries;
};
const se_ListTemplatesRequest = (input, context) => {
    const entries = {};
    if (input.NextToken != null) {
        entries["NextToken"] = input.NextToken;
    }
    if (input.MaxItems != null) {
        entries["MaxItems"] = input.MaxItems;
    }
    return entries;
};
const se_Message = (input, context) => {
    const entries = {};
    if (input.Subject != null) {
        const memberEntries = se_Content(input.Subject, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Subject.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Body != null) {
        const memberEntries = se_Body(input.Body, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Body.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_MessageDsn = (input, context) => {
    const entries = {};
    if (input.ReportingMta != null) {
        entries["ReportingMta"] = input.ReportingMta;
    }
    if (input.ArrivalDate != null) {
        entries["ArrivalDate"] = input.ArrivalDate.toISOString().split(".")[0] + "Z";
    }
    if (input.ExtensionFields != null) {
        const memberEntries = se_ExtensionFieldList(input.ExtensionFields, context);
        if (input.ExtensionFields?.length === 0) {
            entries.ExtensionFields = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ExtensionFields.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_MessageTag = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    if (input.Value != null) {
        entries["Value"] = input.Value;
    }
    return entries;
};
const se_MessageTagList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_MessageTag(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_PolicyNameList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_PutConfigurationSetDeliveryOptionsRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.DeliveryOptions != null) {
        const memberEntries = se_DeliveryOptions(input.DeliveryOptions, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `DeliveryOptions.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_PutIdentityPolicyRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.PolicyName != null) {
        entries["PolicyName"] = input.PolicyName;
    }
    if (input.Policy != null) {
        entries["Policy"] = input.Policy;
    }
    return entries;
};
const se_RawMessage = (input, context) => {
    const entries = {};
    if (input.Data != null) {
        entries["Data"] = context.base64Encoder(input.Data);
    }
    return entries;
};
const se_ReceiptAction = (input, context) => {
    const entries = {};
    if (input.S3Action != null) {
        const memberEntries = se_S3Action(input.S3Action, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `S3Action.${key}`;
            entries[loc] = value;
        });
    }
    if (input.BounceAction != null) {
        const memberEntries = se_BounceAction(input.BounceAction, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `BounceAction.${key}`;
            entries[loc] = value;
        });
    }
    if (input.WorkmailAction != null) {
        const memberEntries = se_WorkmailAction(input.WorkmailAction, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `WorkmailAction.${key}`;
            entries[loc] = value;
        });
    }
    if (input.LambdaAction != null) {
        const memberEntries = se_LambdaAction(input.LambdaAction, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `LambdaAction.${key}`;
            entries[loc] = value;
        });
    }
    if (input.StopAction != null) {
        const memberEntries = se_StopAction(input.StopAction, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `StopAction.${key}`;
            entries[loc] = value;
        });
    }
    if (input.AddHeaderAction != null) {
        const memberEntries = se_AddHeaderAction(input.AddHeaderAction, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `AddHeaderAction.${key}`;
            entries[loc] = value;
        });
    }
    if (input.SNSAction != null) {
        const memberEntries = se_SNSAction(input.SNSAction, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `SNSAction.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_ReceiptActionsList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        const memberEntries = se_ReceiptAction(entry, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            entries[`member.${counter}.${key}`] = value;
        });
        counter++;
    }
    return entries;
};
const se_ReceiptFilter = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    if (input.IpFilter != null) {
        const memberEntries = se_ReceiptIpFilter(input.IpFilter, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `IpFilter.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_ReceiptIpFilter = (input, context) => {
    const entries = {};
    if (input.Policy != null) {
        entries["Policy"] = input.Policy;
    }
    if (input.Cidr != null) {
        entries["Cidr"] = input.Cidr;
    }
    return entries;
};
const se_ReceiptRule = (input, context) => {
    const entries = {};
    if (input.Name != null) {
        entries["Name"] = input.Name;
    }
    if (input.Enabled != null) {
        entries["Enabled"] = input.Enabled;
    }
    if (input.TlsPolicy != null) {
        entries["TlsPolicy"] = input.TlsPolicy;
    }
    if (input.Recipients != null) {
        const memberEntries = se_RecipientsList(input.Recipients, context);
        if (input.Recipients?.length === 0) {
            entries.Recipients = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Recipients.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Actions != null) {
        const memberEntries = se_ReceiptActionsList(input.Actions, context);
        if (input.Actions?.length === 0) {
            entries.Actions = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Actions.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ScanEnabled != null) {
        entries["ScanEnabled"] = input.ScanEnabled;
    }
    return entries;
};
const se_ReceiptRuleNamesList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_RecipientDsnFields = (input, context) => {
    const entries = {};
    if (input.FinalRecipient != null) {
        entries["FinalRecipient"] = input.FinalRecipient;
    }
    if (input.Action != null) {
        entries["Action"] = input.Action;
    }
    if (input.RemoteMta != null) {
        entries["RemoteMta"] = input.RemoteMta;
    }
    if (input.Status != null) {
        entries["Status"] = input.Status;
    }
    if (input.DiagnosticCode != null) {
        entries["DiagnosticCode"] = input.DiagnosticCode;
    }
    if (input.LastAttemptDate != null) {
        entries["LastAttemptDate"] = input.LastAttemptDate.toISOString().split(".")[0] + "Z";
    }
    if (input.ExtensionFields != null) {
        const memberEntries = se_ExtensionFieldList(input.ExtensionFields, context);
        if (input.ExtensionFields?.length === 0) {
            entries.ExtensionFields = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ExtensionFields.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_RecipientsList = (input, context) => {
    const entries = {};
    let counter = 1;
    for (const entry of input) {
        if (entry === null) {
            continue;
        }
        entries[`member.${counter}`] = entry;
        counter++;
    }
    return entries;
};
const se_ReorderReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.RuleNames != null) {
        const memberEntries = se_ReceiptRuleNamesList(input.RuleNames, context);
        if (input.RuleNames?.length === 0) {
            entries.RuleNames = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `RuleNames.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_S3Action = (input, context) => {
    const entries = {};
    if (input.TopicArn != null) {
        entries["TopicArn"] = input.TopicArn;
    }
    if (input.BucketName != null) {
        entries["BucketName"] = input.BucketName;
    }
    if (input.ObjectKeyPrefix != null) {
        entries["ObjectKeyPrefix"] = input.ObjectKeyPrefix;
    }
    if (input.KmsKeyArn != null) {
        entries["KmsKeyArn"] = input.KmsKeyArn;
    }
    return entries;
};
const se_SendBounceRequest = (input, context) => {
    const entries = {};
    if (input.OriginalMessageId != null) {
        entries["OriginalMessageId"] = input.OriginalMessageId;
    }
    if (input.BounceSender != null) {
        entries["BounceSender"] = input.BounceSender;
    }
    if (input.Explanation != null) {
        entries["Explanation"] = input.Explanation;
    }
    if (input.MessageDsn != null) {
        const memberEntries = se_MessageDsn(input.MessageDsn, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `MessageDsn.${key}`;
            entries[loc] = value;
        });
    }
    if (input.BouncedRecipientInfoList != null) {
        const memberEntries = se_BouncedRecipientInfoList(input.BouncedRecipientInfoList, context);
        if (input.BouncedRecipientInfoList?.length === 0) {
            entries.BouncedRecipientInfoList = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `BouncedRecipientInfoList.${key}`;
            entries[loc] = value;
        });
    }
    if (input.BounceSenderArn != null) {
        entries["BounceSenderArn"] = input.BounceSenderArn;
    }
    return entries;
};
const se_SendBulkTemplatedEmailRequest = (input, context) => {
    const entries = {};
    if (input.Source != null) {
        entries["Source"] = input.Source;
    }
    if (input.SourceArn != null) {
        entries["SourceArn"] = input.SourceArn;
    }
    if (input.ReplyToAddresses != null) {
        const memberEntries = se_AddressList(input.ReplyToAddresses, context);
        if (input.ReplyToAddresses?.length === 0) {
            entries.ReplyToAddresses = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ReplyToAddresses.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReturnPath != null) {
        entries["ReturnPath"] = input.ReturnPath;
    }
    if (input.ReturnPathArn != null) {
        entries["ReturnPathArn"] = input.ReturnPathArn;
    }
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.DefaultTags != null) {
        const memberEntries = se_MessageTagList(input.DefaultTags, context);
        if (input.DefaultTags?.length === 0) {
            entries.DefaultTags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `DefaultTags.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Template != null) {
        entries["Template"] = input.Template;
    }
    if (input.TemplateArn != null) {
        entries["TemplateArn"] = input.TemplateArn;
    }
    if (input.DefaultTemplateData != null) {
        entries["DefaultTemplateData"] = input.DefaultTemplateData;
    }
    if (input.Destinations != null) {
        const memberEntries = se_BulkEmailDestinationList(input.Destinations, context);
        if (input.Destinations?.length === 0) {
            entries.Destinations = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Destinations.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_SendCustomVerificationEmailRequest = (input, context) => {
    const entries = {};
    if (input.EmailAddress != null) {
        entries["EmailAddress"] = input.EmailAddress;
    }
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    return entries;
};
const se_SendEmailRequest = (input, context) => {
    const entries = {};
    if (input.Source != null) {
        entries["Source"] = input.Source;
    }
    if (input.Destination != null) {
        const memberEntries = se_Destination(input.Destination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Destination.${key}`;
            entries[loc] = value;
        });
    }
    if (input.Message != null) {
        const memberEntries = se_Message(input.Message, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Message.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReplyToAddresses != null) {
        const memberEntries = se_AddressList(input.ReplyToAddresses, context);
        if (input.ReplyToAddresses?.length === 0) {
            entries.ReplyToAddresses = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ReplyToAddresses.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReturnPath != null) {
        entries["ReturnPath"] = input.ReturnPath;
    }
    if (input.SourceArn != null) {
        entries["SourceArn"] = input.SourceArn;
    }
    if (input.ReturnPathArn != null) {
        entries["ReturnPathArn"] = input.ReturnPathArn;
    }
    if (input.Tags != null) {
        const memberEntries = se_MessageTagList(input.Tags, context);
        if (input.Tags?.length === 0) {
            entries.Tags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Tags.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    return entries;
};
const se_SendRawEmailRequest = (input, context) => {
    const entries = {};
    if (input.Source != null) {
        entries["Source"] = input.Source;
    }
    if (input.Destinations != null) {
        const memberEntries = se_AddressList(input.Destinations, context);
        if (input.Destinations?.length === 0) {
            entries.Destinations = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Destinations.${key}`;
            entries[loc] = value;
        });
    }
    if (input.RawMessage != null) {
        const memberEntries = se_RawMessage(input.RawMessage, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `RawMessage.${key}`;
            entries[loc] = value;
        });
    }
    if (input.FromArn != null) {
        entries["FromArn"] = input.FromArn;
    }
    if (input.SourceArn != null) {
        entries["SourceArn"] = input.SourceArn;
    }
    if (input.ReturnPathArn != null) {
        entries["ReturnPathArn"] = input.ReturnPathArn;
    }
    if (input.Tags != null) {
        const memberEntries = se_MessageTagList(input.Tags, context);
        if (input.Tags?.length === 0) {
            entries.Tags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Tags.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    return entries;
};
const se_SendTemplatedEmailRequest = (input, context) => {
    const entries = {};
    if (input.Source != null) {
        entries["Source"] = input.Source;
    }
    if (input.Destination != null) {
        const memberEntries = se_Destination(input.Destination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Destination.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReplyToAddresses != null) {
        const memberEntries = se_AddressList(input.ReplyToAddresses, context);
        if (input.ReplyToAddresses?.length === 0) {
            entries.ReplyToAddresses = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `ReplyToAddresses.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ReturnPath != null) {
        entries["ReturnPath"] = input.ReturnPath;
    }
    if (input.SourceArn != null) {
        entries["SourceArn"] = input.SourceArn;
    }
    if (input.ReturnPathArn != null) {
        entries["ReturnPathArn"] = input.ReturnPathArn;
    }
    if (input.Tags != null) {
        const memberEntries = se_MessageTagList(input.Tags, context);
        if (input.Tags?.length === 0) {
            entries.Tags = [];
        }
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Tags.${key}`;
            entries[loc] = value;
        });
    }
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.Template != null) {
        entries["Template"] = input.Template;
    }
    if (input.TemplateArn != null) {
        entries["TemplateArn"] = input.TemplateArn;
    }
    if (input.TemplateData != null) {
        entries["TemplateData"] = input.TemplateData;
    }
    return entries;
};
const se_SetActiveReceiptRuleSetRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    return entries;
};
const se_SetIdentityDkimEnabledRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.DkimEnabled != null) {
        entries["DkimEnabled"] = input.DkimEnabled;
    }
    return entries;
};
const se_SetIdentityFeedbackForwardingEnabledRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.ForwardingEnabled != null) {
        entries["ForwardingEnabled"] = input.ForwardingEnabled;
    }
    return entries;
};
const se_SetIdentityHeadersInNotificationsEnabledRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.NotificationType != null) {
        entries["NotificationType"] = input.NotificationType;
    }
    if (input.Enabled != null) {
        entries["Enabled"] = input.Enabled;
    }
    return entries;
};
const se_SetIdentityMailFromDomainRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.MailFromDomain != null) {
        entries["MailFromDomain"] = input.MailFromDomain;
    }
    if (input.BehaviorOnMXFailure != null) {
        entries["BehaviorOnMXFailure"] = input.BehaviorOnMXFailure;
    }
    return entries;
};
const se_SetIdentityNotificationTopicRequest = (input, context) => {
    const entries = {};
    if (input.Identity != null) {
        entries["Identity"] = input.Identity;
    }
    if (input.NotificationType != null) {
        entries["NotificationType"] = input.NotificationType;
    }
    if (input.SnsTopic != null) {
        entries["SnsTopic"] = input.SnsTopic;
    }
    return entries;
};
const se_SetReceiptRulePositionRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.RuleName != null) {
        entries["RuleName"] = input.RuleName;
    }
    if (input.After != null) {
        entries["After"] = input.After;
    }
    return entries;
};
const se_SNSAction = (input, context) => {
    const entries = {};
    if (input.TopicArn != null) {
        entries["TopicArn"] = input.TopicArn;
    }
    if (input.Encoding != null) {
        entries["Encoding"] = input.Encoding;
    }
    return entries;
};
const se_SNSDestination = (input, context) => {
    const entries = {};
    if (input.TopicARN != null) {
        entries["TopicARN"] = input.TopicARN;
    }
    return entries;
};
const se_StopAction = (input, context) => {
    const entries = {};
    if (input.Scope != null) {
        entries["Scope"] = input.Scope;
    }
    if (input.TopicArn != null) {
        entries["TopicArn"] = input.TopicArn;
    }
    return entries;
};
const se_Template = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    if (input.SubjectPart != null) {
        entries["SubjectPart"] = input.SubjectPart;
    }
    if (input.TextPart != null) {
        entries["TextPart"] = input.TextPart;
    }
    if (input.HtmlPart != null) {
        entries["HtmlPart"] = input.HtmlPart;
    }
    return entries;
};
const se_TestRenderTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    if (input.TemplateData != null) {
        entries["TemplateData"] = input.TemplateData;
    }
    return entries;
};
const se_TrackingOptions = (input, context) => {
    const entries = {};
    if (input.CustomRedirectDomain != null) {
        entries["CustomRedirectDomain"] = input.CustomRedirectDomain;
    }
    return entries;
};
const se_UpdateAccountSendingEnabledRequest = (input, context) => {
    const entries = {};
    if (input.Enabled != null) {
        entries["Enabled"] = input.Enabled;
    }
    return entries;
};
const se_UpdateConfigurationSetEventDestinationRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.EventDestination != null) {
        const memberEntries = se_EventDestination(input.EventDestination, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `EventDestination.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_UpdateConfigurationSetReputationMetricsEnabledRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.Enabled != null) {
        entries["Enabled"] = input.Enabled;
    }
    return entries;
};
const se_UpdateConfigurationSetSendingEnabledRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.Enabled != null) {
        entries["Enabled"] = input.Enabled;
    }
    return entries;
};
const se_UpdateConfigurationSetTrackingOptionsRequest = (input, context) => {
    const entries = {};
    if (input.ConfigurationSetName != null) {
        entries["ConfigurationSetName"] = input.ConfigurationSetName;
    }
    if (input.TrackingOptions != null) {
        const memberEntries = se_TrackingOptions(input.TrackingOptions, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `TrackingOptions.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_UpdateCustomVerificationEmailTemplateRequest = (input, context) => {
    const entries = {};
    if (input.TemplateName != null) {
        entries["TemplateName"] = input.TemplateName;
    }
    if (input.FromEmailAddress != null) {
        entries["FromEmailAddress"] = input.FromEmailAddress;
    }
    if (input.TemplateSubject != null) {
        entries["TemplateSubject"] = input.TemplateSubject;
    }
    if (input.TemplateContent != null) {
        entries["TemplateContent"] = input.TemplateContent;
    }
    if (input.SuccessRedirectionURL != null) {
        entries["SuccessRedirectionURL"] = input.SuccessRedirectionURL;
    }
    if (input.FailureRedirectionURL != null) {
        entries["FailureRedirectionURL"] = input.FailureRedirectionURL;
    }
    return entries;
};
const se_UpdateReceiptRuleRequest = (input, context) => {
    const entries = {};
    if (input.RuleSetName != null) {
        entries["RuleSetName"] = input.RuleSetName;
    }
    if (input.Rule != null) {
        const memberEntries = se_ReceiptRule(input.Rule, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Rule.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_UpdateTemplateRequest = (input, context) => {
    const entries = {};
    if (input.Template != null) {
        const memberEntries = se_Template(input.Template, context);
        Object.entries(memberEntries).forEach(([key, value]) => {
            const loc = `Template.${key}`;
            entries[loc] = value;
        });
    }
    return entries;
};
const se_VerifyDomainDkimRequest = (input, context) => {
    const entries = {};
    if (input.Domain != null) {
        entries["Domain"] = input.Domain;
    }
    return entries;
};
const se_VerifyDomainIdentityRequest = (input, context) => {
    const entries = {};
    if (input.Domain != null) {
        entries["Domain"] = input.Domain;
    }
    return entries;
};
const se_VerifyEmailAddressRequest = (input, context) => {
    const entries = {};
    if (input.EmailAddress != null) {
        entries["EmailAddress"] = input.EmailAddress;
    }
    return entries;
};
const se_VerifyEmailIdentityRequest = (input, context) => {
    const entries = {};
    if (input.EmailAddress != null) {
        entries["EmailAddress"] = input.EmailAddress;
    }
    return entries;
};
const se_WorkmailAction = (input, context) => {
    const entries = {};
    if (input.TopicArn != null) {
        entries["TopicArn"] = input.TopicArn;
    }
    if (input.OrganizationArn != null) {
        entries["OrganizationArn"] = input.OrganizationArn;
    }
    return entries;
};
const de_AccountSendingPausedException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_AddHeaderAction = (output, context) => {
    const contents = {};
    if (output["HeaderName"] !== undefined) {
        contents.HeaderName = expectString(output["HeaderName"]);
    }
    if (output["HeaderValue"] !== undefined) {
        contents.HeaderValue = expectString(output["HeaderValue"]);
    }
    return contents;
};
const de_AddressList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return expectString(entry);
    });
};
const de_AlreadyExistsException = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_BounceAction = (output, context) => {
    const contents = {};
    if (output["TopicArn"] !== undefined) {
        contents.TopicArn = expectString(output["TopicArn"]);
    }
    if (output["SmtpReplyCode"] !== undefined) {
        contents.SmtpReplyCode = expectString(output["SmtpReplyCode"]);
    }
    if (output["StatusCode"] !== undefined) {
        contents.StatusCode = expectString(output["StatusCode"]);
    }
    if (output["Message"] !== undefined) {
        contents.Message = expectString(output["Message"]);
    }
    if (output["Sender"] !== undefined) {
        contents.Sender = expectString(output["Sender"]);
    }
    return contents;
};
const de_BulkEmailDestinationStatus = (output, context) => {
    const contents = {};
    if (output["Status"] !== undefined) {
        contents.Status = expectString(output["Status"]);
    }
    if (output["Error"] !== undefined) {
        contents.Error = expectString(output["Error"]);
    }
    if (output["MessageId"] !== undefined) {
        contents.MessageId = expectString(output["MessageId"]);
    }
    return contents;
};
const de_BulkEmailDestinationStatusList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_BulkEmailDestinationStatus(entry, context);
    });
};
const de_CannotDeleteException = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_CloneReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CloudWatchDestination = (output, context) => {
    const contents = {};
    if (output.DimensionConfigurations === "") {
        contents.DimensionConfigurations = [];
    }
    else if (output["DimensionConfigurations"] !== undefined &&
        output["DimensionConfigurations"]["member"] !== undefined) {
        contents.DimensionConfigurations = de_CloudWatchDimensionConfigurations(getArrayIfSingleItem(output["DimensionConfigurations"]["member"]), context);
    }
    return contents;
};
const de_CloudWatchDimensionConfiguration = (output, context) => {
    const contents = {};
    if (output["DimensionName"] !== undefined) {
        contents.DimensionName = expectString(output["DimensionName"]);
    }
    if (output["DimensionValueSource"] !== undefined) {
        contents.DimensionValueSource = expectString(output["DimensionValueSource"]);
    }
    if (output["DefaultDimensionValue"] !== undefined) {
        contents.DefaultDimensionValue = expectString(output["DefaultDimensionValue"]);
    }
    return contents;
};
const de_CloudWatchDimensionConfigurations = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_CloudWatchDimensionConfiguration(entry, context);
    });
};
const de_ConfigurationSet = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    return contents;
};
const de_ConfigurationSetAlreadyExistsException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_ConfigurationSetDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_ConfigurationSets = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_ConfigurationSet(entry, context);
    });
};
const de_ConfigurationSetSendingPausedException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_CreateConfigurationSetEventDestinationResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CreateConfigurationSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CreateConfigurationSetTrackingOptionsResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CreateReceiptFilterResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CreateReceiptRuleResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CreateReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CreateTemplateResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_CustomVerificationEmailInvalidContentException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_CustomVerificationEmailTemplate = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["FromEmailAddress"] !== undefined) {
        contents.FromEmailAddress = expectString(output["FromEmailAddress"]);
    }
    if (output["TemplateSubject"] !== undefined) {
        contents.TemplateSubject = expectString(output["TemplateSubject"]);
    }
    if (output["SuccessRedirectionURL"] !== undefined) {
        contents.SuccessRedirectionURL = expectString(output["SuccessRedirectionURL"]);
    }
    if (output["FailureRedirectionURL"] !== undefined) {
        contents.FailureRedirectionURL = expectString(output["FailureRedirectionURL"]);
    }
    return contents;
};
const de_CustomVerificationEmailTemplateAlreadyExistsException = (output, context) => {
    const contents = {};
    if (output["CustomVerificationEmailTemplateName"] !== undefined) {
        contents.CustomVerificationEmailTemplateName = expectString(output["CustomVerificationEmailTemplateName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_CustomVerificationEmailTemplateDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["CustomVerificationEmailTemplateName"] !== undefined) {
        contents.CustomVerificationEmailTemplateName = expectString(output["CustomVerificationEmailTemplateName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_CustomVerificationEmailTemplates = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_CustomVerificationEmailTemplate(entry, context);
    });
};
const de_DeleteConfigurationSetEventDestinationResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteConfigurationSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteConfigurationSetTrackingOptionsResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteIdentityPolicyResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteIdentityResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteReceiptFilterResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteReceiptRuleResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeleteTemplateResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_DeliveryOptions = (output, context) => {
    const contents = {};
    if (output["TlsPolicy"] !== undefined) {
        contents.TlsPolicy = expectString(output["TlsPolicy"]);
    }
    return contents;
};
const de_DescribeActiveReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    if (output["Metadata"] !== undefined) {
        contents.Metadata = de_ReceiptRuleSetMetadata(output["Metadata"], context);
    }
    if (output.Rules === "") {
        contents.Rules = [];
    }
    else if (output["Rules"] !== undefined && output["Rules"]["member"] !== undefined) {
        contents.Rules = de_ReceiptRulesList(getArrayIfSingleItem(output["Rules"]["member"]), context);
    }
    return contents;
};
const de_DescribeConfigurationSetResponse = (output, context) => {
    const contents = {};
    if (output["ConfigurationSet"] !== undefined) {
        contents.ConfigurationSet = de_ConfigurationSet(output["ConfigurationSet"], context);
    }
    if (output.EventDestinations === "") {
        contents.EventDestinations = [];
    }
    else if (output["EventDestinations"] !== undefined && output["EventDestinations"]["member"] !== undefined) {
        contents.EventDestinations = de_EventDestinations(getArrayIfSingleItem(output["EventDestinations"]["member"]), context);
    }
    if (output["TrackingOptions"] !== undefined) {
        contents.TrackingOptions = de_TrackingOptions(output["TrackingOptions"], context);
    }
    if (output["DeliveryOptions"] !== undefined) {
        contents.DeliveryOptions = de_DeliveryOptions(output["DeliveryOptions"], context);
    }
    if (output["ReputationOptions"] !== undefined) {
        contents.ReputationOptions = de_ReputationOptions(output["ReputationOptions"], context);
    }
    return contents;
};
const de_DescribeReceiptRuleResponse = (output, context) => {
    const contents = {};
    if (output["Rule"] !== undefined) {
        contents.Rule = de_ReceiptRule(output["Rule"], context);
    }
    return contents;
};
const de_DescribeReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    if (output["Metadata"] !== undefined) {
        contents.Metadata = de_ReceiptRuleSetMetadata(output["Metadata"], context);
    }
    if (output.Rules === "") {
        contents.Rules = [];
    }
    else if (output["Rules"] !== undefined && output["Rules"]["member"] !== undefined) {
        contents.Rules = de_ReceiptRulesList(getArrayIfSingleItem(output["Rules"]["member"]), context);
    }
    return contents;
};
const de_DkimAttributes = (output, context) => {
    return output.reduce((acc, pair) => {
        if (pair["value"] === null) {
            return acc;
        }
        acc[pair["key"]] = de_IdentityDkimAttributes(pair["value"], context);
        return acc;
    }, {});
};
const de_EventDestination = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["Enabled"] !== undefined) {
        contents.Enabled = parseBoolean(output["Enabled"]);
    }
    if (output.MatchingEventTypes === "") {
        contents.MatchingEventTypes = [];
    }
    else if (output["MatchingEventTypes"] !== undefined && output["MatchingEventTypes"]["member"] !== undefined) {
        contents.MatchingEventTypes = de_EventTypes(getArrayIfSingleItem(output["MatchingEventTypes"]["member"]), context);
    }
    if (output["KinesisFirehoseDestination"] !== undefined) {
        contents.KinesisFirehoseDestination = de_KinesisFirehoseDestination(output["KinesisFirehoseDestination"], context);
    }
    if (output["CloudWatchDestination"] !== undefined) {
        contents.CloudWatchDestination = de_CloudWatchDestination(output["CloudWatchDestination"], context);
    }
    if (output["SNSDestination"] !== undefined) {
        contents.SNSDestination = de_SNSDestination(output["SNSDestination"], context);
    }
    return contents;
};
const de_EventDestinationAlreadyExistsException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["EventDestinationName"] !== undefined) {
        contents.EventDestinationName = expectString(output["EventDestinationName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_EventDestinationDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["EventDestinationName"] !== undefined) {
        contents.EventDestinationName = expectString(output["EventDestinationName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_EventDestinations = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_EventDestination(entry, context);
    });
};
const de_EventTypes = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return expectString(entry);
    });
};
const de_FromEmailAddressNotVerifiedException = (output, context) => {
    const contents = {};
    if (output["FromEmailAddress"] !== undefined) {
        contents.FromEmailAddress = expectString(output["FromEmailAddress"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_GetAccountSendingEnabledResponse = (output, context) => {
    const contents = {};
    if (output["Enabled"] !== undefined) {
        contents.Enabled = parseBoolean(output["Enabled"]);
    }
    return contents;
};
const de_GetCustomVerificationEmailTemplateResponse = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["FromEmailAddress"] !== undefined) {
        contents.FromEmailAddress = expectString(output["FromEmailAddress"]);
    }
    if (output["TemplateSubject"] !== undefined) {
        contents.TemplateSubject = expectString(output["TemplateSubject"]);
    }
    if (output["TemplateContent"] !== undefined) {
        contents.TemplateContent = expectString(output["TemplateContent"]);
    }
    if (output["SuccessRedirectionURL"] !== undefined) {
        contents.SuccessRedirectionURL = expectString(output["SuccessRedirectionURL"]);
    }
    if (output["FailureRedirectionURL"] !== undefined) {
        contents.FailureRedirectionURL = expectString(output["FailureRedirectionURL"]);
    }
    return contents;
};
const de_GetIdentityDkimAttributesResponse = (output, context) => {
    const contents = {};
    if (output.DkimAttributes === "") {
        contents.DkimAttributes = {};
    }
    else if (output["DkimAttributes"] !== undefined && output["DkimAttributes"]["entry"] !== undefined) {
        contents.DkimAttributes = de_DkimAttributes(getArrayIfSingleItem(output["DkimAttributes"]["entry"]), context);
    }
    return contents;
};
const de_GetIdentityMailFromDomainAttributesResponse = (output, context) => {
    const contents = {};
    if (output.MailFromDomainAttributes === "") {
        contents.MailFromDomainAttributes = {};
    }
    else if (output["MailFromDomainAttributes"] !== undefined &&
        output["MailFromDomainAttributes"]["entry"] !== undefined) {
        contents.MailFromDomainAttributes = de_MailFromDomainAttributes(getArrayIfSingleItem(output["MailFromDomainAttributes"]["entry"]), context);
    }
    return contents;
};
const de_GetIdentityNotificationAttributesResponse = (output, context) => {
    const contents = {};
    if (output.NotificationAttributes === "") {
        contents.NotificationAttributes = {};
    }
    else if (output["NotificationAttributes"] !== undefined &&
        output["NotificationAttributes"]["entry"] !== undefined) {
        contents.NotificationAttributes = de_NotificationAttributes(getArrayIfSingleItem(output["NotificationAttributes"]["entry"]), context);
    }
    return contents;
};
const de_GetIdentityPoliciesResponse = (output, context) => {
    const contents = {};
    if (output.Policies === "") {
        contents.Policies = {};
    }
    else if (output["Policies"] !== undefined && output["Policies"]["entry"] !== undefined) {
        contents.Policies = de_PolicyMap(getArrayIfSingleItem(output["Policies"]["entry"]), context);
    }
    return contents;
};
const de_GetIdentityVerificationAttributesResponse = (output, context) => {
    const contents = {};
    if (output.VerificationAttributes === "") {
        contents.VerificationAttributes = {};
    }
    else if (output["VerificationAttributes"] !== undefined &&
        output["VerificationAttributes"]["entry"] !== undefined) {
        contents.VerificationAttributes = de_VerificationAttributes(getArrayIfSingleItem(output["VerificationAttributes"]["entry"]), context);
    }
    return contents;
};
const de_GetSendQuotaResponse = (output, context) => {
    const contents = {};
    if (output["Max24HourSend"] !== undefined) {
        contents.Max24HourSend = strictParseFloat(output["Max24HourSend"]);
    }
    if (output["MaxSendRate"] !== undefined) {
        contents.MaxSendRate = strictParseFloat(output["MaxSendRate"]);
    }
    if (output["SentLast24Hours"] !== undefined) {
        contents.SentLast24Hours = strictParseFloat(output["SentLast24Hours"]);
    }
    return contents;
};
const de_GetSendStatisticsResponse = (output, context) => {
    const contents = {};
    if (output.SendDataPoints === "") {
        contents.SendDataPoints = [];
    }
    else if (output["SendDataPoints"] !== undefined && output["SendDataPoints"]["member"] !== undefined) {
        contents.SendDataPoints = de_SendDataPointList(getArrayIfSingleItem(output["SendDataPoints"]["member"]), context);
    }
    return contents;
};
const de_GetTemplateResponse = (output, context) => {
    const contents = {};
    if (output["Template"] !== undefined) {
        contents.Template = de_Template(output["Template"], context);
    }
    return contents;
};
const de_IdentityDkimAttributes = (output, context) => {
    const contents = {};
    if (output["DkimEnabled"] !== undefined) {
        contents.DkimEnabled = parseBoolean(output["DkimEnabled"]);
    }
    if (output["DkimVerificationStatus"] !== undefined) {
        contents.DkimVerificationStatus = expectString(output["DkimVerificationStatus"]);
    }
    if (output.DkimTokens === "") {
        contents.DkimTokens = [];
    }
    else if (output["DkimTokens"] !== undefined && output["DkimTokens"]["member"] !== undefined) {
        contents.DkimTokens = de_VerificationTokenList(getArrayIfSingleItem(output["DkimTokens"]["member"]), context);
    }
    return contents;
};
const de_IdentityList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return expectString(entry);
    });
};
const de_IdentityMailFromDomainAttributes = (output, context) => {
    const contents = {};
    if (output["MailFromDomain"] !== undefined) {
        contents.MailFromDomain = expectString(output["MailFromDomain"]);
    }
    if (output["MailFromDomainStatus"] !== undefined) {
        contents.MailFromDomainStatus = expectString(output["MailFromDomainStatus"]);
    }
    if (output["BehaviorOnMXFailure"] !== undefined) {
        contents.BehaviorOnMXFailure = expectString(output["BehaviorOnMXFailure"]);
    }
    return contents;
};
const de_IdentityNotificationAttributes = (output, context) => {
    const contents = {};
    if (output["BounceTopic"] !== undefined) {
        contents.BounceTopic = expectString(output["BounceTopic"]);
    }
    if (output["ComplaintTopic"] !== undefined) {
        contents.ComplaintTopic = expectString(output["ComplaintTopic"]);
    }
    if (output["DeliveryTopic"] !== undefined) {
        contents.DeliveryTopic = expectString(output["DeliveryTopic"]);
    }
    if (output["ForwardingEnabled"] !== undefined) {
        contents.ForwardingEnabled = parseBoolean(output["ForwardingEnabled"]);
    }
    if (output["HeadersInBounceNotificationsEnabled"] !== undefined) {
        contents.HeadersInBounceNotificationsEnabled = parseBoolean(output["HeadersInBounceNotificationsEnabled"]);
    }
    if (output["HeadersInComplaintNotificationsEnabled"] !== undefined) {
        contents.HeadersInComplaintNotificationsEnabled = parseBoolean(output["HeadersInComplaintNotificationsEnabled"]);
    }
    if (output["HeadersInDeliveryNotificationsEnabled"] !== undefined) {
        contents.HeadersInDeliveryNotificationsEnabled = parseBoolean(output["HeadersInDeliveryNotificationsEnabled"]);
    }
    return contents;
};
const de_IdentityVerificationAttributes = (output, context) => {
    const contents = {};
    if (output["VerificationStatus"] !== undefined) {
        contents.VerificationStatus = expectString(output["VerificationStatus"]);
    }
    if (output["VerificationToken"] !== undefined) {
        contents.VerificationToken = expectString(output["VerificationToken"]);
    }
    return contents;
};
const de_InvalidCloudWatchDestinationException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["EventDestinationName"] !== undefined) {
        contents.EventDestinationName = expectString(output["EventDestinationName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidConfigurationSetException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidDeliveryOptionsException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidFirehoseDestinationException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["EventDestinationName"] !== undefined) {
        contents.EventDestinationName = expectString(output["EventDestinationName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidLambdaFunctionException = (output, context) => {
    const contents = {};
    if (output["FunctionArn"] !== undefined) {
        contents.FunctionArn = expectString(output["FunctionArn"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidPolicyException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidRenderingParameterException = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidS3ConfigurationException = (output, context) => {
    const contents = {};
    if (output["Bucket"] !== undefined) {
        contents.Bucket = expectString(output["Bucket"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidSNSDestinationException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["EventDestinationName"] !== undefined) {
        contents.EventDestinationName = expectString(output["EventDestinationName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidSnsTopicException = (output, context) => {
    const contents = {};
    if (output["Topic"] !== undefined) {
        contents.Topic = expectString(output["Topic"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidTemplateException = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_InvalidTrackingOptionsException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_KinesisFirehoseDestination = (output, context) => {
    const contents = {};
    if (output["IAMRoleARN"] !== undefined) {
        contents.IAMRoleARN = expectString(output["IAMRoleARN"]);
    }
    if (output["DeliveryStreamARN"] !== undefined) {
        contents.DeliveryStreamARN = expectString(output["DeliveryStreamARN"]);
    }
    return contents;
};
const de_LambdaAction = (output, context) => {
    const contents = {};
    if (output["TopicArn"] !== undefined) {
        contents.TopicArn = expectString(output["TopicArn"]);
    }
    if (output["FunctionArn"] !== undefined) {
        contents.FunctionArn = expectString(output["FunctionArn"]);
    }
    if (output["InvocationType"] !== undefined) {
        contents.InvocationType = expectString(output["InvocationType"]);
    }
    return contents;
};
const de_LimitExceededException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_ListConfigurationSetsResponse = (output, context) => {
    const contents = {};
    if (output.ConfigurationSets === "") {
        contents.ConfigurationSets = [];
    }
    else if (output["ConfigurationSets"] !== undefined && output["ConfigurationSets"]["member"] !== undefined) {
        contents.ConfigurationSets = de_ConfigurationSets(getArrayIfSingleItem(output["ConfigurationSets"]["member"]), context);
    }
    if (output["NextToken"] !== undefined) {
        contents.NextToken = expectString(output["NextToken"]);
    }
    return contents;
};
const de_ListCustomVerificationEmailTemplatesResponse = (output, context) => {
    const contents = {};
    if (output.CustomVerificationEmailTemplates === "") {
        contents.CustomVerificationEmailTemplates = [];
    }
    else if (output["CustomVerificationEmailTemplates"] !== undefined &&
        output["CustomVerificationEmailTemplates"]["member"] !== undefined) {
        contents.CustomVerificationEmailTemplates = de_CustomVerificationEmailTemplates(getArrayIfSingleItem(output["CustomVerificationEmailTemplates"]["member"]), context);
    }
    if (output["NextToken"] !== undefined) {
        contents.NextToken = expectString(output["NextToken"]);
    }
    return contents;
};
const de_ListIdentitiesResponse = (output, context) => {
    const contents = {};
    if (output.Identities === "") {
        contents.Identities = [];
    }
    else if (output["Identities"] !== undefined && output["Identities"]["member"] !== undefined) {
        contents.Identities = de_IdentityList(getArrayIfSingleItem(output["Identities"]["member"]), context);
    }
    if (output["NextToken"] !== undefined) {
        contents.NextToken = expectString(output["NextToken"]);
    }
    return contents;
};
const de_ListIdentityPoliciesResponse = (output, context) => {
    const contents = {};
    if (output.PolicyNames === "") {
        contents.PolicyNames = [];
    }
    else if (output["PolicyNames"] !== undefined && output["PolicyNames"]["member"] !== undefined) {
        contents.PolicyNames = de_PolicyNameList(getArrayIfSingleItem(output["PolicyNames"]["member"]), context);
    }
    return contents;
};
const de_ListReceiptFiltersResponse = (output, context) => {
    const contents = {};
    if (output.Filters === "") {
        contents.Filters = [];
    }
    else if (output["Filters"] !== undefined && output["Filters"]["member"] !== undefined) {
        contents.Filters = de_ReceiptFilterList(getArrayIfSingleItem(output["Filters"]["member"]), context);
    }
    return contents;
};
const de_ListReceiptRuleSetsResponse = (output, context) => {
    const contents = {};
    if (output.RuleSets === "") {
        contents.RuleSets = [];
    }
    else if (output["RuleSets"] !== undefined && output["RuleSets"]["member"] !== undefined) {
        contents.RuleSets = de_ReceiptRuleSetsLists(getArrayIfSingleItem(output["RuleSets"]["member"]), context);
    }
    if (output["NextToken"] !== undefined) {
        contents.NextToken = expectString(output["NextToken"]);
    }
    return contents;
};
const de_ListTemplatesResponse = (output, context) => {
    const contents = {};
    if (output.TemplatesMetadata === "") {
        contents.TemplatesMetadata = [];
    }
    else if (output["TemplatesMetadata"] !== undefined && output["TemplatesMetadata"]["member"] !== undefined) {
        contents.TemplatesMetadata = de_TemplateMetadataList(getArrayIfSingleItem(output["TemplatesMetadata"]["member"]), context);
    }
    if (output["NextToken"] !== undefined) {
        contents.NextToken = expectString(output["NextToken"]);
    }
    return contents;
};
const de_ListVerifiedEmailAddressesResponse = (output, context) => {
    const contents = {};
    if (output.VerifiedEmailAddresses === "") {
        contents.VerifiedEmailAddresses = [];
    }
    else if (output["VerifiedEmailAddresses"] !== undefined &&
        output["VerifiedEmailAddresses"]["member"] !== undefined) {
        contents.VerifiedEmailAddresses = de_AddressList(getArrayIfSingleItem(output["VerifiedEmailAddresses"]["member"]), context);
    }
    return contents;
};
const de_MailFromDomainAttributes = (output, context) => {
    return output.reduce((acc, pair) => {
        if (pair["value"] === null) {
            return acc;
        }
        acc[pair["key"]] = de_IdentityMailFromDomainAttributes(pair["value"], context);
        return acc;
    }, {});
};
const de_MailFromDomainNotVerifiedException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_MessageRejected = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_MissingRenderingAttributeException = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_NotificationAttributes = (output, context) => {
    return output.reduce((acc, pair) => {
        if (pair["value"] === null) {
            return acc;
        }
        acc[pair["key"]] = de_IdentityNotificationAttributes(pair["value"], context);
        return acc;
    }, {});
};
const de_PolicyMap = (output, context) => {
    return output.reduce((acc, pair) => {
        if (pair["value"] === null) {
            return acc;
        }
        acc[pair["key"]] = expectString(pair["value"]);
        return acc;
    }, {});
};
const de_PolicyNameList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return expectString(entry);
    });
};
const de_ProductionAccessNotGrantedException = (output, context) => {
    const contents = {};
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_PutConfigurationSetDeliveryOptionsResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_PutIdentityPolicyResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_ReceiptAction = (output, context) => {
    const contents = {};
    if (output["S3Action"] !== undefined) {
        contents.S3Action = de_S3Action(output["S3Action"], context);
    }
    if (output["BounceAction"] !== undefined) {
        contents.BounceAction = de_BounceAction(output["BounceAction"], context);
    }
    if (output["WorkmailAction"] !== undefined) {
        contents.WorkmailAction = de_WorkmailAction(output["WorkmailAction"], context);
    }
    if (output["LambdaAction"] !== undefined) {
        contents.LambdaAction = de_LambdaAction(output["LambdaAction"], context);
    }
    if (output["StopAction"] !== undefined) {
        contents.StopAction = de_StopAction(output["StopAction"], context);
    }
    if (output["AddHeaderAction"] !== undefined) {
        contents.AddHeaderAction = de_AddHeaderAction(output["AddHeaderAction"], context);
    }
    if (output["SNSAction"] !== undefined) {
        contents.SNSAction = de_SNSAction(output["SNSAction"], context);
    }
    return contents;
};
const de_ReceiptActionsList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_ReceiptAction(entry, context);
    });
};
const de_ReceiptFilter = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["IpFilter"] !== undefined) {
        contents.IpFilter = de_ReceiptIpFilter(output["IpFilter"], context);
    }
    return contents;
};
const de_ReceiptFilterList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_ReceiptFilter(entry, context);
    });
};
const de_ReceiptIpFilter = (output, context) => {
    const contents = {};
    if (output["Policy"] !== undefined) {
        contents.Policy = expectString(output["Policy"]);
    }
    if (output["Cidr"] !== undefined) {
        contents.Cidr = expectString(output["Cidr"]);
    }
    return contents;
};
const de_ReceiptRule = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["Enabled"] !== undefined) {
        contents.Enabled = parseBoolean(output["Enabled"]);
    }
    if (output["TlsPolicy"] !== undefined) {
        contents.TlsPolicy = expectString(output["TlsPolicy"]);
    }
    if (output.Recipients === "") {
        contents.Recipients = [];
    }
    else if (output["Recipients"] !== undefined && output["Recipients"]["member"] !== undefined) {
        contents.Recipients = de_RecipientsList(getArrayIfSingleItem(output["Recipients"]["member"]), context);
    }
    if (output.Actions === "") {
        contents.Actions = [];
    }
    else if (output["Actions"] !== undefined && output["Actions"]["member"] !== undefined) {
        contents.Actions = de_ReceiptActionsList(getArrayIfSingleItem(output["Actions"]["member"]), context);
    }
    if (output["ScanEnabled"] !== undefined) {
        contents.ScanEnabled = parseBoolean(output["ScanEnabled"]);
    }
    return contents;
};
const de_ReceiptRuleSetMetadata = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["CreatedTimestamp"] !== undefined) {
        contents.CreatedTimestamp = expectNonNull(parseRfc3339DateTimeWithOffset(output["CreatedTimestamp"]));
    }
    return contents;
};
const de_ReceiptRuleSetsLists = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_ReceiptRuleSetMetadata(entry, context);
    });
};
const de_ReceiptRulesList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_ReceiptRule(entry, context);
    });
};
const de_RecipientsList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return expectString(entry);
    });
};
const de_ReorderReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_ReputationOptions = (output, context) => {
    const contents = {};
    if (output["SendingEnabled"] !== undefined) {
        contents.SendingEnabled = parseBoolean(output["SendingEnabled"]);
    }
    if (output["ReputationMetricsEnabled"] !== undefined) {
        contents.ReputationMetricsEnabled = parseBoolean(output["ReputationMetricsEnabled"]);
    }
    if (output["LastFreshStart"] !== undefined) {
        contents.LastFreshStart = expectNonNull(parseRfc3339DateTimeWithOffset(output["LastFreshStart"]));
    }
    return contents;
};
const de_RuleDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_RuleSetDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_S3Action = (output, context) => {
    const contents = {};
    if (output["TopicArn"] !== undefined) {
        contents.TopicArn = expectString(output["TopicArn"]);
    }
    if (output["BucketName"] !== undefined) {
        contents.BucketName = expectString(output["BucketName"]);
    }
    if (output["ObjectKeyPrefix"] !== undefined) {
        contents.ObjectKeyPrefix = expectString(output["ObjectKeyPrefix"]);
    }
    if (output["KmsKeyArn"] !== undefined) {
        contents.KmsKeyArn = expectString(output["KmsKeyArn"]);
    }
    return contents;
};
const de_SendBounceResponse = (output, context) => {
    const contents = {};
    if (output["MessageId"] !== undefined) {
        contents.MessageId = expectString(output["MessageId"]);
    }
    return contents;
};
const de_SendBulkTemplatedEmailResponse = (output, context) => {
    const contents = {};
    if (output.Status === "") {
        contents.Status = [];
    }
    else if (output["Status"] !== undefined && output["Status"]["member"] !== undefined) {
        contents.Status = de_BulkEmailDestinationStatusList(getArrayIfSingleItem(output["Status"]["member"]), context);
    }
    return contents;
};
const de_SendCustomVerificationEmailResponse = (output, context) => {
    const contents = {};
    if (output["MessageId"] !== undefined) {
        contents.MessageId = expectString(output["MessageId"]);
    }
    return contents;
};
const de_SendDataPoint = (output, context) => {
    const contents = {};
    if (output["Timestamp"] !== undefined) {
        contents.Timestamp = expectNonNull(parseRfc3339DateTimeWithOffset(output["Timestamp"]));
    }
    if (output["DeliveryAttempts"] !== undefined) {
        contents.DeliveryAttempts = strictParseLong(output["DeliveryAttempts"]);
    }
    if (output["Bounces"] !== undefined) {
        contents.Bounces = strictParseLong(output["Bounces"]);
    }
    if (output["Complaints"] !== undefined) {
        contents.Complaints = strictParseLong(output["Complaints"]);
    }
    if (output["Rejects"] !== undefined) {
        contents.Rejects = strictParseLong(output["Rejects"]);
    }
    return contents;
};
const de_SendDataPointList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_SendDataPoint(entry, context);
    });
};
const de_SendEmailResponse = (output, context) => {
    const contents = {};
    if (output["MessageId"] !== undefined) {
        contents.MessageId = expectString(output["MessageId"]);
    }
    return contents;
};
const de_SendRawEmailResponse = (output, context) => {
    const contents = {};
    if (output["MessageId"] !== undefined) {
        contents.MessageId = expectString(output["MessageId"]);
    }
    return contents;
};
const de_SendTemplatedEmailResponse = (output, context) => {
    const contents = {};
    if (output["MessageId"] !== undefined) {
        contents.MessageId = expectString(output["MessageId"]);
    }
    return contents;
};
const de_SetActiveReceiptRuleSetResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SetIdentityDkimEnabledResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SetIdentityFeedbackForwardingEnabledResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SetIdentityHeadersInNotificationsEnabledResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SetIdentityMailFromDomainResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SetIdentityNotificationTopicResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SetReceiptRulePositionResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_SNSAction = (output, context) => {
    const contents = {};
    if (output["TopicArn"] !== undefined) {
        contents.TopicArn = expectString(output["TopicArn"]);
    }
    if (output["Encoding"] !== undefined) {
        contents.Encoding = expectString(output["Encoding"]);
    }
    return contents;
};
const de_SNSDestination = (output, context) => {
    const contents = {};
    if (output["TopicARN"] !== undefined) {
        contents.TopicARN = expectString(output["TopicARN"]);
    }
    return contents;
};
const de_StopAction = (output, context) => {
    const contents = {};
    if (output["Scope"] !== undefined) {
        contents.Scope = expectString(output["Scope"]);
    }
    if (output["TopicArn"] !== undefined) {
        contents.TopicArn = expectString(output["TopicArn"]);
    }
    return contents;
};
const de_Template = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["SubjectPart"] !== undefined) {
        contents.SubjectPart = expectString(output["SubjectPart"]);
    }
    if (output["TextPart"] !== undefined) {
        contents.TextPart = expectString(output["TextPart"]);
    }
    if (output["HtmlPart"] !== undefined) {
        contents.HtmlPart = expectString(output["HtmlPart"]);
    }
    return contents;
};
const de_TemplateDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["TemplateName"] !== undefined) {
        contents.TemplateName = expectString(output["TemplateName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_TemplateMetadata = (output, context) => {
    const contents = {};
    if (output["Name"] !== undefined) {
        contents.Name = expectString(output["Name"]);
    }
    if (output["CreatedTimestamp"] !== undefined) {
        contents.CreatedTimestamp = expectNonNull(parseRfc3339DateTimeWithOffset(output["CreatedTimestamp"]));
    }
    return contents;
};
const de_TemplateMetadataList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return de_TemplateMetadata(entry, context);
    });
};
const de_TestRenderTemplateResponse = (output, context) => {
    const contents = {};
    if (output["RenderedTemplate"] !== undefined) {
        contents.RenderedTemplate = expectString(output["RenderedTemplate"]);
    }
    return contents;
};
const de_TrackingOptions = (output, context) => {
    const contents = {};
    if (output["CustomRedirectDomain"] !== undefined) {
        contents.CustomRedirectDomain = expectString(output["CustomRedirectDomain"]);
    }
    return contents;
};
const de_TrackingOptionsAlreadyExistsException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_TrackingOptionsDoesNotExistException = (output, context) => {
    const contents = {};
    if (output["ConfigurationSetName"] !== undefined) {
        contents.ConfigurationSetName = expectString(output["ConfigurationSetName"]);
    }
    if (output["message"] !== undefined) {
        contents.message = expectString(output["message"]);
    }
    return contents;
};
const de_UpdateConfigurationSetEventDestinationResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_UpdateConfigurationSetTrackingOptionsResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_UpdateReceiptRuleResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_UpdateTemplateResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_VerificationAttributes = (output, context) => {
    return output.reduce((acc, pair) => {
        if (pair["value"] === null) {
            return acc;
        }
        acc[pair["key"]] = de_IdentityVerificationAttributes(pair["value"], context);
        return acc;
    }, {});
};
const de_VerificationTokenList = (output, context) => {
    return (output || [])
        .filter((e) => e != null)
        .map((entry) => {
        return expectString(entry);
    });
};
const de_VerifyDomainDkimResponse = (output, context) => {
    const contents = {};
    if (output.DkimTokens === "") {
        contents.DkimTokens = [];
    }
    else if (output["DkimTokens"] !== undefined && output["DkimTokens"]["member"] !== undefined) {
        contents.DkimTokens = de_VerificationTokenList(getArrayIfSingleItem(output["DkimTokens"]["member"]), context);
    }
    return contents;
};
const de_VerifyDomainIdentityResponse = (output, context) => {
    const contents = {};
    if (output["VerificationToken"] !== undefined) {
        contents.VerificationToken = expectString(output["VerificationToken"]);
    }
    return contents;
};
const de_VerifyEmailIdentityResponse = (output, context) => {
    const contents = {};
    return contents;
};
const de_WorkmailAction = (output, context) => {
    const contents = {};
    if (output["TopicArn"] !== undefined) {
        contents.TopicArn = expectString(output["TopicArn"]);
    }
    if (output["OrganizationArn"] !== undefined) {
        contents.OrganizationArn = expectString(output["OrganizationArn"]);
    }
    return contents;
};
const protocols_Aws_query_deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});
const Aws_query_collectBodyString = (streamBody, context) => collect_stream_body_collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
const protocols_Aws_query_throwDefaultError = withBaseException(SESServiceException);
const Aws_query_buildHttpRpcRequest = async (context, headers, path, resolvedHostname, body) => {
    const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
    const contents = {
        protocol,
        hostname,
        port,
        method: "POST",
        path: basePath.endsWith("/") ? basePath.slice(0, -1) + path : basePath + path,
        headers,
    };
    if (resolvedHostname !== undefined) {
        contents.hostname = resolvedHostname;
    }
    if (body !== undefined) {
        contents.body = body;
    }
    return new httpRequest_HttpRequest(contents);
};
const Aws_query_SHARED_HEADERS = {
    "content-type": "application/x-www-form-urlencoded",
};
const Aws_query_parseBody = (streamBody, context) => Aws_query_collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        const parser = new fxp.XMLParser({
            attributeNamePrefix: "",
            htmlEntities: true,
            ignoreAttributes: false,
            ignoreDeclaration: true,
            parseTagValue: false,
            trimValues: false,
            tagValueProcessor: (_, val) => (val.trim() === "" && val.includes("\n") ? "" : undefined),
        });
        parser.addEntity("#xD", "\r");
        parser.addEntity("#10", "\n");
        const parsedObj = parser.parse(encoded);
        const textNodeName = "#text";
        const key = Object.keys(parsedObj)[0];
        const parsedObjToReturn = parsedObj[key];
        if (parsedObjToReturn[textNodeName]) {
            parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
            delete parsedObjToReturn[textNodeName];
        }
        return getValueFromTextNode(parsedObjToReturn);
    }
    return {};
});
const Aws_query_parseErrorBody = async (errorBody, context) => {
    const value = await Aws_query_parseBody(errorBody, context);
    if (value.Error) {
        value.Error.message = value.Error.message ?? value.Error.Message;
    }
    return value;
};
const Aws_query_buildFormUrlencodedString = (formEntries) => Object.entries(formEntries)
    .map(([key, value]) => extendedEncodeURIComponent(key) + "=" + extendedEncodeURIComponent(value))
    .join("&");
const Aws_query_loadQueryErrorCode = (output, data) => {
    if (data.Error?.Code !== undefined) {
        return data.Error.Code;
    }
    if (output.statusCode == 404) {
        return "NotFound";
    }
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CloneReceiptRuleSetCommand.js





class CloneReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CloneReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CloneReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CloneReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_CloneReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateConfigurationSetCommand.js





class CreateConfigurationSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateConfigurationSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateConfigurationSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateConfigurationSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateConfigurationSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateConfigurationSetEventDestinationCommand.js





class CreateConfigurationSetEventDestinationCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateConfigurationSetEventDestinationCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateConfigurationSetEventDestinationCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateConfigurationSetEventDestinationCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateConfigurationSetEventDestinationCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateConfigurationSetTrackingOptionsCommand.js





class CreateConfigurationSetTrackingOptionsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateConfigurationSetTrackingOptionsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateConfigurationSetTrackingOptionsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateConfigurationSetTrackingOptionsCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateConfigurationSetTrackingOptionsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateCustomVerificationEmailTemplateCommand.js





class CreateCustomVerificationEmailTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateCustomVerificationEmailTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateCustomVerificationEmailTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateCustomVerificationEmailTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateCustomVerificationEmailTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateReceiptFilterCommand.js





class CreateReceiptFilterCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateReceiptFilterCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateReceiptFilterCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateReceiptFilterCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateReceiptFilterCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateReceiptRuleCommand.js





class CreateReceiptRuleCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateReceiptRuleCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateReceiptRuleCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateReceiptRuleCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateReceiptRuleCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateReceiptRuleSetCommand.js





class CreateReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/CreateTemplateCommand.js





class CreateTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, CreateTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "CreateTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_CreateTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_CreateTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteConfigurationSetCommand.js





class DeleteConfigurationSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteConfigurationSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteConfigurationSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteConfigurationSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteConfigurationSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteConfigurationSetEventDestinationCommand.js





class DeleteConfigurationSetEventDestinationCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteConfigurationSetEventDestinationCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteConfigurationSetEventDestinationCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteConfigurationSetEventDestinationCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteConfigurationSetEventDestinationCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteConfigurationSetTrackingOptionsCommand.js





class DeleteConfigurationSetTrackingOptionsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteConfigurationSetTrackingOptionsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteConfigurationSetTrackingOptionsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteConfigurationSetTrackingOptionsCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteConfigurationSetTrackingOptionsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteCustomVerificationEmailTemplateCommand.js





class DeleteCustomVerificationEmailTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteCustomVerificationEmailTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteCustomVerificationEmailTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteCustomVerificationEmailTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteCustomVerificationEmailTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteIdentityCommand.js





class DeleteIdentityCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteIdentityCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteIdentityCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteIdentityCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteIdentityCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteIdentityPolicyCommand.js





class DeleteIdentityPolicyCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteIdentityPolicyCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteIdentityPolicyCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteIdentityPolicyCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteIdentityPolicyCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteReceiptFilterCommand.js





class DeleteReceiptFilterCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteReceiptFilterCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteReceiptFilterCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteReceiptFilterCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteReceiptFilterCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteReceiptRuleCommand.js





class DeleteReceiptRuleCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteReceiptRuleCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteReceiptRuleCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteReceiptRuleCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteReceiptRuleCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteReceiptRuleSetCommand.js





class DeleteReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteTemplateCommand.js





class DeleteTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DeleteVerifiedEmailAddressCommand.js





class DeleteVerifiedEmailAddressCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DeleteVerifiedEmailAddressCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DeleteVerifiedEmailAddressCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DeleteVerifiedEmailAddressCommand(input, context);
    }
    deserialize(output, context) {
        return de_DeleteVerifiedEmailAddressCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DescribeActiveReceiptRuleSetCommand.js





class DescribeActiveReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DescribeActiveReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DescribeActiveReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DescribeActiveReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_DescribeActiveReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DescribeConfigurationSetCommand.js





class DescribeConfigurationSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DescribeConfigurationSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DescribeConfigurationSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DescribeConfigurationSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_DescribeConfigurationSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DescribeReceiptRuleCommand.js





class DescribeReceiptRuleCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DescribeReceiptRuleCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DescribeReceiptRuleCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DescribeReceiptRuleCommand(input, context);
    }
    deserialize(output, context) {
        return de_DescribeReceiptRuleCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/DescribeReceiptRuleSetCommand.js





class DescribeReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, DescribeReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "DescribeReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_DescribeReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_DescribeReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetAccountSendingEnabledCommand.js





class GetAccountSendingEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetAccountSendingEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetAccountSendingEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetAccountSendingEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetAccountSendingEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetCustomVerificationEmailTemplateCommand.js





class GetCustomVerificationEmailTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetCustomVerificationEmailTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetCustomVerificationEmailTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetCustomVerificationEmailTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetCustomVerificationEmailTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetIdentityDkimAttributesCommand.js





class GetIdentityDkimAttributesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetIdentityDkimAttributesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetIdentityDkimAttributesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetIdentityDkimAttributesCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetIdentityDkimAttributesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetIdentityMailFromDomainAttributesCommand.js





class GetIdentityMailFromDomainAttributesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetIdentityMailFromDomainAttributesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetIdentityMailFromDomainAttributesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetIdentityMailFromDomainAttributesCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetIdentityMailFromDomainAttributesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetIdentityNotificationAttributesCommand.js





class GetIdentityNotificationAttributesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetIdentityNotificationAttributesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetIdentityNotificationAttributesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetIdentityNotificationAttributesCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetIdentityNotificationAttributesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetIdentityPoliciesCommand.js





class GetIdentityPoliciesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetIdentityPoliciesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetIdentityPoliciesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetIdentityPoliciesCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetIdentityPoliciesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetIdentityVerificationAttributesCommand.js





class GetIdentityVerificationAttributesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetIdentityVerificationAttributesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetIdentityVerificationAttributesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetIdentityVerificationAttributesCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetIdentityVerificationAttributesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetSendQuotaCommand.js





class GetSendQuotaCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetSendQuotaCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetSendQuotaCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetSendQuotaCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetSendQuotaCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetSendStatisticsCommand.js





class GetSendStatisticsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetSendStatisticsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetSendStatisticsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetSendStatisticsCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetSendStatisticsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/GetTemplateCommand.js





class GetTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, GetTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "GetTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_GetTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_GetTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListConfigurationSetsCommand.js





class ListConfigurationSetsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListConfigurationSetsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListConfigurationSetsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListConfigurationSetsCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListConfigurationSetsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListCustomVerificationEmailTemplatesCommand.js





class ListCustomVerificationEmailTemplatesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListCustomVerificationEmailTemplatesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListCustomVerificationEmailTemplatesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListCustomVerificationEmailTemplatesCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListCustomVerificationEmailTemplatesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListIdentitiesCommand.js





class ListIdentitiesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListIdentitiesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListIdentitiesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListIdentitiesCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListIdentitiesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListIdentityPoliciesCommand.js





class ListIdentityPoliciesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListIdentityPoliciesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListIdentityPoliciesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListIdentityPoliciesCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListIdentityPoliciesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListReceiptFiltersCommand.js





class ListReceiptFiltersCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListReceiptFiltersCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListReceiptFiltersCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListReceiptFiltersCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListReceiptFiltersCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListReceiptRuleSetsCommand.js





class ListReceiptRuleSetsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListReceiptRuleSetsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListReceiptRuleSetsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListReceiptRuleSetsCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListReceiptRuleSetsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListTemplatesCommand.js





class ListTemplatesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListTemplatesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListTemplatesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListTemplatesCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListTemplatesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ListVerifiedEmailAddressesCommand.js





class ListVerifiedEmailAddressesCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ListVerifiedEmailAddressesCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ListVerifiedEmailAddressesCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ListVerifiedEmailAddressesCommand(input, context);
    }
    deserialize(output, context) {
        return de_ListVerifiedEmailAddressesCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/PutConfigurationSetDeliveryOptionsCommand.js





class PutConfigurationSetDeliveryOptionsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, PutConfigurationSetDeliveryOptionsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "PutConfigurationSetDeliveryOptionsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_PutConfigurationSetDeliveryOptionsCommand(input, context);
    }
    deserialize(output, context) {
        return de_PutConfigurationSetDeliveryOptionsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/PutIdentityPolicyCommand.js





class PutIdentityPolicyCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, PutIdentityPolicyCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "PutIdentityPolicyCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_PutIdentityPolicyCommand(input, context);
    }
    deserialize(output, context) {
        return de_PutIdentityPolicyCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/ReorderReceiptRuleSetCommand.js





class ReorderReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, ReorderReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "ReorderReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_ReorderReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_ReorderReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SendBounceCommand.js





class SendBounceCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SendBounceCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SendBounceCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SendBounceCommand(input, context);
    }
    deserialize(output, context) {
        return de_SendBounceCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SendBulkTemplatedEmailCommand.js





class SendBulkTemplatedEmailCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SendBulkTemplatedEmailCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SendBulkTemplatedEmailCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SendBulkTemplatedEmailCommand(input, context);
    }
    deserialize(output, context) {
        return de_SendBulkTemplatedEmailCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SendCustomVerificationEmailCommand.js





class SendCustomVerificationEmailCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SendCustomVerificationEmailCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SendCustomVerificationEmailCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SendCustomVerificationEmailCommand(input, context);
    }
    deserialize(output, context) {
        return de_SendCustomVerificationEmailCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SendEmailCommand.js





class SendEmailCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SendEmailCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SendEmailCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SendEmailCommand(input, context);
    }
    deserialize(output, context) {
        return de_SendEmailCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SendRawEmailCommand.js





class SendRawEmailCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SendRawEmailCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SendRawEmailCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SendRawEmailCommand(input, context);
    }
    deserialize(output, context) {
        return de_SendRawEmailCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SendTemplatedEmailCommand.js





class SendTemplatedEmailCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SendTemplatedEmailCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SendTemplatedEmailCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SendTemplatedEmailCommand(input, context);
    }
    deserialize(output, context) {
        return de_SendTemplatedEmailCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetActiveReceiptRuleSetCommand.js





class SetActiveReceiptRuleSetCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetActiveReceiptRuleSetCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetActiveReceiptRuleSetCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetActiveReceiptRuleSetCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetActiveReceiptRuleSetCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetIdentityDkimEnabledCommand.js





class SetIdentityDkimEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetIdentityDkimEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetIdentityDkimEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetIdentityDkimEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetIdentityDkimEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetIdentityFeedbackForwardingEnabledCommand.js





class SetIdentityFeedbackForwardingEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetIdentityFeedbackForwardingEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetIdentityFeedbackForwardingEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetIdentityFeedbackForwardingEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetIdentityFeedbackForwardingEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetIdentityHeadersInNotificationsEnabledCommand.js





class SetIdentityHeadersInNotificationsEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetIdentityHeadersInNotificationsEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetIdentityHeadersInNotificationsEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetIdentityHeadersInNotificationsEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetIdentityHeadersInNotificationsEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetIdentityMailFromDomainCommand.js





class SetIdentityMailFromDomainCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetIdentityMailFromDomainCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetIdentityMailFromDomainCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetIdentityMailFromDomainCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetIdentityMailFromDomainCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetIdentityNotificationTopicCommand.js





class SetIdentityNotificationTopicCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetIdentityNotificationTopicCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetIdentityNotificationTopicCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetIdentityNotificationTopicCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetIdentityNotificationTopicCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/SetReceiptRulePositionCommand.js





class SetReceiptRulePositionCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, SetReceiptRulePositionCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "SetReceiptRulePositionCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_SetReceiptRulePositionCommand(input, context);
    }
    deserialize(output, context) {
        return de_SetReceiptRulePositionCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/TestRenderTemplateCommand.js





class TestRenderTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, TestRenderTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "TestRenderTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_TestRenderTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_TestRenderTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateAccountSendingEnabledCommand.js





class UpdateAccountSendingEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateAccountSendingEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateAccountSendingEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateAccountSendingEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateAccountSendingEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateConfigurationSetEventDestinationCommand.js





class UpdateConfigurationSetEventDestinationCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateConfigurationSetEventDestinationCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateConfigurationSetEventDestinationCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateConfigurationSetEventDestinationCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateConfigurationSetEventDestinationCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateConfigurationSetReputationMetricsEnabledCommand.js





class UpdateConfigurationSetReputationMetricsEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateConfigurationSetReputationMetricsEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateConfigurationSetReputationMetricsEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateConfigurationSetReputationMetricsEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateConfigurationSetReputationMetricsEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateConfigurationSetSendingEnabledCommand.js





class UpdateConfigurationSetSendingEnabledCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateConfigurationSetSendingEnabledCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateConfigurationSetSendingEnabledCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateConfigurationSetSendingEnabledCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateConfigurationSetSendingEnabledCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateConfigurationSetTrackingOptionsCommand.js





class UpdateConfigurationSetTrackingOptionsCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateConfigurationSetTrackingOptionsCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateConfigurationSetTrackingOptionsCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateConfigurationSetTrackingOptionsCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateConfigurationSetTrackingOptionsCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateCustomVerificationEmailTemplateCommand.js





class UpdateCustomVerificationEmailTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateCustomVerificationEmailTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateCustomVerificationEmailTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateCustomVerificationEmailTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateCustomVerificationEmailTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateReceiptRuleCommand.js





class UpdateReceiptRuleCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateReceiptRuleCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateReceiptRuleCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateReceiptRuleCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateReceiptRuleCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/UpdateTemplateCommand.js





class UpdateTemplateCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, UpdateTemplateCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "UpdateTemplateCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_UpdateTemplateCommand(input, context);
    }
    deserialize(output, context) {
        return de_UpdateTemplateCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/VerifyDomainDkimCommand.js





class VerifyDomainDkimCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, VerifyDomainDkimCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "VerifyDomainDkimCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_VerifyDomainDkimCommand(input, context);
    }
    deserialize(output, context) {
        return de_VerifyDomainDkimCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/VerifyDomainIdentityCommand.js





class VerifyDomainIdentityCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, VerifyDomainIdentityCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "VerifyDomainIdentityCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_VerifyDomainIdentityCommand(input, context);
    }
    deserialize(output, context) {
        return de_VerifyDomainIdentityCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/VerifyEmailAddressCommand.js





class VerifyEmailAddressCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, VerifyEmailAddressCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "VerifyEmailAddressCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_VerifyEmailAddressCommand(input, context);
    }
    deserialize(output, context) {
        return de_VerifyEmailAddressCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/VerifyEmailIdentityCommand.js





class VerifyEmailIdentityCommand extends Command {
    static getEndpointParameterInstructions() {
        return {
            UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
            Endpoint: { type: "builtInParams", name: "endpoint" },
            Region: { type: "builtInParams", name: "region" },
            UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
        };
    }
    constructor(input) {
        super();
        this.input = input;
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getEndpointPlugin(configuration, VerifyEmailIdentityCommand.getEndpointParameterInstructions()));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const clientName = "SESClient";
        const commandName = "VerifyEmailIdentityCommand";
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog: (_) => _,
            outputFilterSensitiveLog: (_) => _,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return se_VerifyEmailIdentityCommand(input, context);
    }
    deserialize(output, context) {
        return de_VerifyEmailIdentityCommand(output, context);
    }
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/SES.js









































































const SES_commands = {
    CloneReceiptRuleSetCommand: CloneReceiptRuleSetCommand,
    CreateConfigurationSetCommand: CreateConfigurationSetCommand,
    CreateConfigurationSetEventDestinationCommand: CreateConfigurationSetEventDestinationCommand,
    CreateConfigurationSetTrackingOptionsCommand: CreateConfigurationSetTrackingOptionsCommand,
    CreateCustomVerificationEmailTemplateCommand: CreateCustomVerificationEmailTemplateCommand,
    CreateReceiptFilterCommand: CreateReceiptFilterCommand,
    CreateReceiptRuleCommand: CreateReceiptRuleCommand,
    CreateReceiptRuleSetCommand: CreateReceiptRuleSetCommand,
    CreateTemplateCommand: CreateTemplateCommand,
    DeleteConfigurationSetCommand: DeleteConfigurationSetCommand,
    DeleteConfigurationSetEventDestinationCommand: DeleteConfigurationSetEventDestinationCommand,
    DeleteConfigurationSetTrackingOptionsCommand: DeleteConfigurationSetTrackingOptionsCommand,
    DeleteCustomVerificationEmailTemplateCommand: DeleteCustomVerificationEmailTemplateCommand,
    DeleteIdentityCommand: DeleteIdentityCommand,
    DeleteIdentityPolicyCommand: DeleteIdentityPolicyCommand,
    DeleteReceiptFilterCommand: DeleteReceiptFilterCommand,
    DeleteReceiptRuleCommand: DeleteReceiptRuleCommand,
    DeleteReceiptRuleSetCommand: DeleteReceiptRuleSetCommand,
    DeleteTemplateCommand: DeleteTemplateCommand,
    DeleteVerifiedEmailAddressCommand: DeleteVerifiedEmailAddressCommand,
    DescribeActiveReceiptRuleSetCommand: DescribeActiveReceiptRuleSetCommand,
    DescribeConfigurationSetCommand: DescribeConfigurationSetCommand,
    DescribeReceiptRuleCommand: DescribeReceiptRuleCommand,
    DescribeReceiptRuleSetCommand: DescribeReceiptRuleSetCommand,
    GetAccountSendingEnabledCommand: GetAccountSendingEnabledCommand,
    GetCustomVerificationEmailTemplateCommand: GetCustomVerificationEmailTemplateCommand,
    GetIdentityDkimAttributesCommand: GetIdentityDkimAttributesCommand,
    GetIdentityMailFromDomainAttributesCommand: GetIdentityMailFromDomainAttributesCommand,
    GetIdentityNotificationAttributesCommand: GetIdentityNotificationAttributesCommand,
    GetIdentityPoliciesCommand: GetIdentityPoliciesCommand,
    GetIdentityVerificationAttributesCommand: GetIdentityVerificationAttributesCommand,
    GetSendQuotaCommand: GetSendQuotaCommand,
    GetSendStatisticsCommand: GetSendStatisticsCommand,
    GetTemplateCommand: GetTemplateCommand,
    ListConfigurationSetsCommand: ListConfigurationSetsCommand,
    ListCustomVerificationEmailTemplatesCommand: ListCustomVerificationEmailTemplatesCommand,
    ListIdentitiesCommand: ListIdentitiesCommand,
    ListIdentityPoliciesCommand: ListIdentityPoliciesCommand,
    ListReceiptFiltersCommand: ListReceiptFiltersCommand,
    ListReceiptRuleSetsCommand: ListReceiptRuleSetsCommand,
    ListTemplatesCommand: ListTemplatesCommand,
    ListVerifiedEmailAddressesCommand: ListVerifiedEmailAddressesCommand,
    PutConfigurationSetDeliveryOptionsCommand: PutConfigurationSetDeliveryOptionsCommand,
    PutIdentityPolicyCommand: PutIdentityPolicyCommand,
    ReorderReceiptRuleSetCommand: ReorderReceiptRuleSetCommand,
    SendBounceCommand: SendBounceCommand,
    SendBulkTemplatedEmailCommand: SendBulkTemplatedEmailCommand,
    SendCustomVerificationEmailCommand: SendCustomVerificationEmailCommand,
    SendEmailCommand: SendEmailCommand,
    SendRawEmailCommand: SendRawEmailCommand,
    SendTemplatedEmailCommand: SendTemplatedEmailCommand,
    SetActiveReceiptRuleSetCommand: SetActiveReceiptRuleSetCommand,
    SetIdentityDkimEnabledCommand: SetIdentityDkimEnabledCommand,
    SetIdentityFeedbackForwardingEnabledCommand: SetIdentityFeedbackForwardingEnabledCommand,
    SetIdentityHeadersInNotificationsEnabledCommand: SetIdentityHeadersInNotificationsEnabledCommand,
    SetIdentityMailFromDomainCommand: SetIdentityMailFromDomainCommand,
    SetIdentityNotificationTopicCommand: SetIdentityNotificationTopicCommand,
    SetReceiptRulePositionCommand: SetReceiptRulePositionCommand,
    TestRenderTemplateCommand: TestRenderTemplateCommand,
    UpdateAccountSendingEnabledCommand: UpdateAccountSendingEnabledCommand,
    UpdateConfigurationSetEventDestinationCommand: UpdateConfigurationSetEventDestinationCommand,
    UpdateConfigurationSetReputationMetricsEnabledCommand: UpdateConfigurationSetReputationMetricsEnabledCommand,
    UpdateConfigurationSetSendingEnabledCommand: UpdateConfigurationSetSendingEnabledCommand,
    UpdateConfigurationSetTrackingOptionsCommand: UpdateConfigurationSetTrackingOptionsCommand,
    UpdateCustomVerificationEmailTemplateCommand: UpdateCustomVerificationEmailTemplateCommand,
    UpdateReceiptRuleCommand: UpdateReceiptRuleCommand,
    UpdateTemplateCommand: UpdateTemplateCommand,
    VerifyDomainDkimCommand: VerifyDomainDkimCommand,
    VerifyDomainIdentityCommand: VerifyDomainIdentityCommand,
    VerifyEmailAddressCommand: VerifyEmailAddressCommand,
    VerifyEmailIdentityCommand: VerifyEmailIdentityCommand,
};
class SES extends SESClient {
}
createAggregatedClient(SES_commands, SES);

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/commands/index.js








































































;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/pagination/ListCustomVerificationEmailTemplatesPaginator.js


const makePagedClientRequest = async (client, input, ...args) => {
    return await client.send(new ListCustomVerificationEmailTemplatesCommand(input), ...args);
};
async function* paginateListCustomVerificationEmailTemplates(config, input, ...additionalArguments) {
    let token = config.startingToken || undefined;
    let hasNext = true;
    let page;
    while (hasNext) {
        input.NextToken = token;
        input["MaxResults"] = config.pageSize;
        if (config.client instanceof SESClient) {
            page = await makePagedClientRequest(config.client, input, ...additionalArguments);
        }
        else {
            throw new Error("Invalid client, expected SES | SESClient");
        }
        yield page;
        const prevToken = token;
        token = page.NextToken;
        hasNext = !!(token && (!config.stopOnSameToken || token !== prevToken));
    }
    return undefined;
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/pagination/ListIdentitiesPaginator.js


const ListIdentitiesPaginator_makePagedClientRequest = async (client, input, ...args) => {
    return await client.send(new ListIdentitiesCommand(input), ...args);
};
async function* paginateListIdentities(config, input, ...additionalArguments) {
    let token = config.startingToken || undefined;
    let hasNext = true;
    let page;
    while (hasNext) {
        input.NextToken = token;
        input["MaxItems"] = config.pageSize;
        if (config.client instanceof SESClient) {
            page = await ListIdentitiesPaginator_makePagedClientRequest(config.client, input, ...additionalArguments);
        }
        else {
            throw new Error("Invalid client, expected SES | SESClient");
        }
        yield page;
        const prevToken = token;
        token = page.NextToken;
        hasNext = !!(token && (!config.stopOnSameToken || token !== prevToken));
    }
    return undefined;
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/pagination/index.js




;// CONCATENATED MODULE: ./node_modules/@smithy/util-waiter/dist-es/utils/sleep.js
const sleep = (seconds) => {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-waiter/dist-es/waiter.js
const waiterServiceDefaults = {
    minDelay: 2,
    maxDelay: 120,
};
var WaiterState;
(function (WaiterState) {
    WaiterState["ABORTED"] = "ABORTED";
    WaiterState["FAILURE"] = "FAILURE";
    WaiterState["SUCCESS"] = "SUCCESS";
    WaiterState["RETRY"] = "RETRY";
    WaiterState["TIMEOUT"] = "TIMEOUT";
})(WaiterState || (WaiterState = {}));
const checkExceptions = (result) => {
    if (result.state === WaiterState.ABORTED) {
        const abortError = new Error(`${JSON.stringify({
            ...result,
            reason: "Request was aborted",
        })}`);
        abortError.name = "AbortError";
        throw abortError;
    }
    else if (result.state === WaiterState.TIMEOUT) {
        const timeoutError = new Error(`${JSON.stringify({
            ...result,
            reason: "Waiter has timed out",
        })}`);
        timeoutError.name = "TimeoutError";
        throw timeoutError;
    }
    else if (result.state !== WaiterState.SUCCESS) {
        throw new Error(`${JSON.stringify({ result })}`);
    }
    return result;
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-waiter/dist-es/poller.js


const exponentialBackoffWithJitter = (minDelay, maxDelay, attemptCeiling, attempt) => {
    if (attempt > attemptCeiling)
        return maxDelay;
    const delay = minDelay * 2 ** (attempt - 1);
    return randomInRange(minDelay, delay);
};
const randomInRange = (min, max) => min + Math.random() * (max - min);
const runPolling = async ({ minDelay, maxDelay, maxWaitTime, abortController, client, abortSignal }, input, acceptorChecks) => {
    const { state, reason } = await acceptorChecks(client, input);
    if (state !== WaiterState.RETRY) {
        return { state, reason };
    }
    let currentAttempt = 1;
    const waitUntil = Date.now() + maxWaitTime * 1000;
    const attemptCeiling = Math.log(maxDelay / minDelay) / Math.log(2) + 1;
    while (true) {
        if (abortController?.signal?.aborted || abortSignal?.aborted) {
            return { state: WaiterState.ABORTED };
        }
        const delay = exponentialBackoffWithJitter(minDelay, maxDelay, attemptCeiling, currentAttempt);
        if (Date.now() + delay * 1000 > waitUntil) {
            return { state: WaiterState.TIMEOUT };
        }
        await sleep(delay);
        const { state, reason } = await acceptorChecks(client, input);
        if (state !== WaiterState.RETRY) {
            return { state, reason };
        }
        currentAttempt += 1;
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-waiter/dist-es/utils/validate.js
const validateWaiterOptions = (options) => {
    if (options.maxWaitTime < 1) {
        throw new Error(`WaiterConfiguration.maxWaitTime must be greater than 0`);
    }
    else if (options.minDelay < 1) {
        throw new Error(`WaiterConfiguration.minDelay must be greater than 0`);
    }
    else if (options.maxDelay < 1) {
        throw new Error(`WaiterConfiguration.maxDelay must be greater than 0`);
    }
    else if (options.maxWaitTime <= options.minDelay) {
        throw new Error(`WaiterConfiguration.maxWaitTime [${options.maxWaitTime}] must be greater than WaiterConfiguration.minDelay [${options.minDelay}] for this waiter`);
    }
    else if (options.maxDelay < options.minDelay) {
        throw new Error(`WaiterConfiguration.maxDelay [${options.maxDelay}] must be greater than WaiterConfiguration.minDelay [${options.minDelay}] for this waiter`);
    }
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-waiter/dist-es/createWaiter.js



const abortTimeout = async (abortSignal) => {
    return new Promise((resolve) => {
        abortSignal.onabort = () => resolve({ state: WaiterState.ABORTED });
    });
};
const createWaiter = async (options, input, acceptorChecks) => {
    const params = {
        ...waiterServiceDefaults,
        ...options,
    };
    validateWaiterOptions(params);
    const exitConditions = [runPolling(params, input, acceptorChecks)];
    if (options.abortController) {
        exitConditions.push(abortTimeout(options.abortController.signal));
    }
    if (options.abortSignal) {
        exitConditions.push(abortTimeout(options.abortSignal));
    }
    return Promise.race(exitConditions);
};

;// CONCATENATED MODULE: ./node_modules/@smithy/util-waiter/dist-es/index.js



;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/waiters/waitForIdentityExists.js


const checkState = async (client, input) => {
    let reason;
    try {
        const result = await client.send(new GetIdentityVerificationAttributesCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                const objectProjection_2 = Object.values(result.VerificationAttributes).map((element_1) => {
                    return element_1.VerificationStatus;
                });
                return objectProjection_2;
            };
            let allStringEq_4 = returnComparator().length > 0;
            for (const element_3 of returnComparator()) {
                allStringEq_4 = allStringEq_4 && element_3 == "Success";
            }
            if (allStringEq_4) {
                return { state: WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: WaiterState.RETRY, reason };
};
const waitForIdentityExists = async (params, input) => {
    const serviceDefaults = { minDelay: 3, maxDelay: 120 };
    return createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
const waitUntilIdentityExists = async (params, input) => {
    const serviceDefaults = { minDelay: 3, maxDelay: 120 };
    const result = await createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return checkExceptions(result);
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/waiters/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/models/index.js


;// CONCATENATED MODULE: ./node_modules/@aws-sdk/client-ses/dist-es/index.js









/***/ }),

/***/ 84:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  fromUtf8: () => (/* binding */ dist_es_fromUtf8),
  toUtf8: () => (/* binding */ dist_es_toUtf8)
});

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-utf8-browser/dist-es/pureJs.js
const fromUtf8 = (input) => {
    const bytes = [];
    for (let i = 0, len = input.length; i < len; i++) {
        const value = input.charCodeAt(i);
        if (value < 0x80) {
            bytes.push(value);
        }
        else if (value < 0x800) {
            bytes.push((value >> 6) | 0b11000000, (value & 0b111111) | 0b10000000);
        }
        else if (i + 1 < input.length && (value & 0xfc00) === 0xd800 && (input.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
            const surrogatePair = 0x10000 + ((value & 0b1111111111) << 10) + (input.charCodeAt(++i) & 0b1111111111);
            bytes.push((surrogatePair >> 18) | 0b11110000, ((surrogatePair >> 12) & 0b111111) | 0b10000000, ((surrogatePair >> 6) & 0b111111) | 0b10000000, (surrogatePair & 0b111111) | 0b10000000);
        }
        else {
            bytes.push((value >> 12) | 0b11100000, ((value >> 6) & 0b111111) | 0b10000000, (value & 0b111111) | 0b10000000);
        }
    }
    return Uint8Array.from(bytes);
};
const toUtf8 = (input) => {
    let decoded = "";
    for (let i = 0, len = input.length; i < len; i++) {
        const byte = input[i];
        if (byte < 0x80) {
            decoded += String.fromCharCode(byte);
        }
        else if (0b11000000 <= byte && byte < 0b11100000) {
            const nextByte = input[++i];
            decoded += String.fromCharCode(((byte & 0b11111) << 6) | (nextByte & 0b111111));
        }
        else if (0b11110000 <= byte && byte < 0b101101101) {
            const surrogatePair = [byte, input[++i], input[++i], input[++i]];
            const encoded = "%" + surrogatePair.map((byteValue) => byteValue.toString(16)).join("%");
            decoded += decodeURIComponent(encoded);
        }
        else {
            decoded += String.fromCharCode(((byte & 0b1111) << 12) | ((input[++i] & 0b111111) << 6) | (input[++i] & 0b111111));
        }
    }
    return decoded;
};

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-utf8-browser/dist-es/whatwgEncodingApi.js
function whatwgEncodingApi_fromUtf8(input) {
    return new TextEncoder().encode(input);
}
function whatwgEncodingApi_toUtf8(input) {
    return new TextDecoder("utf-8").decode(input);
}

;// CONCATENATED MODULE: ./node_modules/@aws-sdk/util-utf8-browser/dist-es/index.js


const dist_es_fromUtf8 = (input) => typeof TextEncoder === "function" ? whatwgEncodingApi_fromUtf8(input) : fromUtf8(input);
const dist_es_toUtf8 = (input) => typeof TextDecoder === "function" ? whatwgEncodingApi_toUtf8(input) : toUtf8(input);


/***/ }),

/***/ 845:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


exports.toString = function (klass) {
  switch (klass) {
    case 1: return 'IN'
    case 2: return 'CS'
    case 3: return 'CH'
    case 4: return 'HS'
    case 255: return 'ANY'
  }
  return 'UNKNOWN_' + klass
}

exports.toClass = function (name) {
  switch (name.toUpperCase()) {
    case 'IN': return 1
    case 'CS': return 2
    case 'CH': return 3
    case 'HS': return 4
    case 'ANY': return 255
  }
  return 0
}


/***/ }),

/***/ 568:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


const Buffer = (__webpack_require__(300).Buffer)
const types = __webpack_require__(82)
const rcodes = __webpack_require__(17)
const opcodes = __webpack_require__(942)
const classes = __webpack_require__(845)
const optioncodes = __webpack_require__(285)
const ip = __webpack_require__(526)

const QUERY_FLAG = 0
const RESPONSE_FLAG = 1 << 15
const FLUSH_MASK = 1 << 15
const NOT_FLUSH_MASK = ~FLUSH_MASK
const QU_MASK = 1 << 15
const NOT_QU_MASK = ~QU_MASK

const name = exports.name = {}

name.encode = function (str, buf, offset, { mail = false } = {}) {
  if (!buf) buf = Buffer.alloc(name.encodingLength(str))
  if (!offset) offset = 0
  const oldOffset = offset

  // strip leading and trailing .
  const n = str.replace(/^\.|\.$/gm, '')
  if (n.length) {
    let list = []
    if (mail) {
      let localPart = ''
      n.split('.').forEach(label => {
        if (label.endsWith('\\')) {
          localPart += (localPart.length ? '.' : '') + label.slice(0, -1)
        } else {
          if (list.length === 0 && localPart.length) {
            list.push(localPart + '.' + label)
          } else {
            list.push(label)
          }
        }
      })
    } else {
      list = n.split('.')
    }

    for (let i = 0; i < list.length; i++) {
      const len = buf.write(list[i], offset + 1)
      buf[offset] = len
      offset += len + 1
    }
  }

  buf[offset++] = 0

  name.encode.bytes = offset - oldOffset
  return buf
}

name.encode.bytes = 0

name.decode = function (buf, offset, { mail = false } = {}) {
  if (!offset) offset = 0

  const list = []
  let oldOffset = offset
  let totalLength = 0
  let consumedBytes = 0
  let jumped = false

  while (true) {
    if (offset >= buf.length) {
      throw new Error('Cannot decode name (buffer overflow)')
    }
    const len = buf[offset++]
    consumedBytes += jumped ? 0 : 1

    if (len === 0) {
      break
    } else if ((len & 0xc0) === 0) {
      if (offset + len > buf.length) {
        throw new Error('Cannot decode name (buffer overflow)')
      }
      totalLength += len + 1
      if (totalLength > 254) {
        throw new Error('Cannot decode name (name too long)')
      }
      let label = buf.toString('utf-8', offset, offset + len)
      if (mail) {
        label = label.replace(/\./g, '\\.')
      }
      list.push(label)
      offset += len
      consumedBytes += jumped ? 0 : len
    } else if ((len & 0xc0) === 0xc0) {
      if (offset + 1 > buf.length) {
        throw new Error('Cannot decode name (buffer overflow)')
      }
      const jumpOffset = buf.readUInt16BE(offset - 1) - 0xc000
      if (jumpOffset >= oldOffset) {
        // Allow only pointers to prior data. RFC 1035, section 4.1.4 states:
        // "[...] an entire domain name or a list of labels at the end of a domain name
        // is replaced with a pointer to a prior occurance (sic) of the same name."
        throw new Error('Cannot decode name (bad pointer)')
      }
      offset = jumpOffset
      oldOffset = jumpOffset
      consumedBytes += jumped ? 0 : 1
      jumped = true
    } else {
      throw new Error('Cannot decode name (bad label)')
    }
  }

  name.decode.bytes = consumedBytes
  return list.length === 0 ? '.' : list.join('.')
}

name.decode.bytes = 0

name.encodingLength = function (n) {
  if (n === '.' || n === '..') return 1
  return Buffer.byteLength(n.replace(/^\.|\.$/gm, '')) + 2
}

const string = {}

string.encode = function (s, buf, offset) {
  if (!buf) buf = Buffer.alloc(string.encodingLength(s))
  if (!offset) offset = 0

  const len = buf.write(s, offset + 1)
  buf[offset] = len
  string.encode.bytes = len + 1
  return buf
}

string.encode.bytes = 0

string.decode = function (buf, offset) {
  if (!offset) offset = 0

  const len = buf[offset]
  const s = buf.toString('utf-8', offset + 1, offset + 1 + len)
  string.decode.bytes = len + 1
  return s
}

string.decode.bytes = 0

string.encodingLength = function (s) {
  return Buffer.byteLength(s) + 1
}

const header = {}

header.encode = function (h, buf, offset) {
  if (!buf) buf = header.encodingLength(h)
  if (!offset) offset = 0

  const flags = (h.flags || 0) & 32767
  const type = h.type === 'response' ? RESPONSE_FLAG : QUERY_FLAG

  buf.writeUInt16BE(h.id || 0, offset)
  buf.writeUInt16BE(flags | type, offset + 2)
  buf.writeUInt16BE(h.questions.length, offset + 4)
  buf.writeUInt16BE(h.answers.length, offset + 6)
  buf.writeUInt16BE(h.authorities.length, offset + 8)
  buf.writeUInt16BE(h.additionals.length, offset + 10)

  return buf
}

header.encode.bytes = 12

header.decode = function (buf, offset) {
  if (!offset) offset = 0
  if (buf.length < 12) throw new Error('Header must be 12 bytes')
  const flags = buf.readUInt16BE(offset + 2)

  return {
    id: buf.readUInt16BE(offset),
    type: flags & RESPONSE_FLAG ? 'response' : 'query',
    flags: flags & 32767,
    flag_qr: ((flags >> 15) & 0x1) === 1,
    opcode: opcodes.toString((flags >> 11) & 0xf),
    flag_aa: ((flags >> 10) & 0x1) === 1,
    flag_tc: ((flags >> 9) & 0x1) === 1,
    flag_rd: ((flags >> 8) & 0x1) === 1,
    flag_ra: ((flags >> 7) & 0x1) === 1,
    flag_z: ((flags >> 6) & 0x1) === 1,
    flag_ad: ((flags >> 5) & 0x1) === 1,
    flag_cd: ((flags >> 4) & 0x1) === 1,
    rcode: rcodes.toString(flags & 0xf),
    questions: new Array(buf.readUInt16BE(offset + 4)),
    answers: new Array(buf.readUInt16BE(offset + 6)),
    authorities: new Array(buf.readUInt16BE(offset + 8)),
    additionals: new Array(buf.readUInt16BE(offset + 10))
  }
}

header.decode.bytes = 12

header.encodingLength = function () {
  return 12
}

const runknown = exports.unknown = {}

runknown.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(runknown.encodingLength(data))
  if (!offset) offset = 0

  buf.writeUInt16BE(data.length, offset)
  data.copy(buf, offset + 2)

  runknown.encode.bytes = data.length + 2
  return buf
}

runknown.encode.bytes = 0

runknown.decode = function (buf, offset) {
  if (!offset) offset = 0

  const len = buf.readUInt16BE(offset)
  const data = buf.slice(offset + 2, offset + 2 + len)
  runknown.decode.bytes = len + 2
  return data
}

runknown.decode.bytes = 0

runknown.encodingLength = function (data) {
  return data.length + 2
}

const rns = exports.ns = {}

rns.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rns.encodingLength(data))
  if (!offset) offset = 0

  name.encode(data, buf, offset + 2)
  buf.writeUInt16BE(name.encode.bytes, offset)
  rns.encode.bytes = name.encode.bytes + 2
  return buf
}

rns.encode.bytes = 0

rns.decode = function (buf, offset) {
  if (!offset) offset = 0

  const len = buf.readUInt16BE(offset)
  const dd = name.decode(buf, offset + 2)

  rns.decode.bytes = len + 2
  return dd
}

rns.decode.bytes = 0

rns.encodingLength = function (data) {
  return name.encodingLength(data) + 2
}

const rsoa = exports.soa = {}

rsoa.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rsoa.encodingLength(data))
  if (!offset) offset = 0

  const oldOffset = offset
  offset += 2
  name.encode(data.mname, buf, offset)
  offset += name.encode.bytes
  name.encode(data.rname, buf, offset, { mail: true })
  offset += name.encode.bytes
  buf.writeUInt32BE(data.serial || 0, offset)
  offset += 4
  buf.writeUInt32BE(data.refresh || 0, offset)
  offset += 4
  buf.writeUInt32BE(data.retry || 0, offset)
  offset += 4
  buf.writeUInt32BE(data.expire || 0, offset)
  offset += 4
  buf.writeUInt32BE(data.minimum || 0, offset)
  offset += 4

  buf.writeUInt16BE(offset - oldOffset - 2, oldOffset)
  rsoa.encode.bytes = offset - oldOffset
  return buf
}

rsoa.encode.bytes = 0

rsoa.decode = function (buf, offset) {
  if (!offset) offset = 0

  const oldOffset = offset

  const data = {}
  offset += 2
  data.mname = name.decode(buf, offset)
  offset += name.decode.bytes
  data.rname = name.decode(buf, offset, { mail: true })
  offset += name.decode.bytes
  data.serial = buf.readUInt32BE(offset)
  offset += 4
  data.refresh = buf.readUInt32BE(offset)
  offset += 4
  data.retry = buf.readUInt32BE(offset)
  offset += 4
  data.expire = buf.readUInt32BE(offset)
  offset += 4
  data.minimum = buf.readUInt32BE(offset)
  offset += 4

  rsoa.decode.bytes = offset - oldOffset
  return data
}

rsoa.decode.bytes = 0

rsoa.encodingLength = function (data) {
  return 22 + name.encodingLength(data.mname) + name.encodingLength(data.rname)
}

const rtxt = exports.txt = {}

rtxt.encode = function (data, buf, offset) {
  if (!Array.isArray(data)) data = [data]
  for (let i = 0; i < data.length; i++) {
    if (typeof data[i] === 'string') {
      data[i] = Buffer.from(data[i])
    }
    if (!Buffer.isBuffer(data[i])) {
      throw new Error('Must be a Buffer')
    }
  }

  if (!buf) buf = Buffer.alloc(rtxt.encodingLength(data))
  if (!offset) offset = 0

  const oldOffset = offset
  offset += 2

  data.forEach(function (d) {
    buf[offset++] = d.length
    d.copy(buf, offset, 0, d.length)
    offset += d.length
  })

  buf.writeUInt16BE(offset - oldOffset - 2, oldOffset)
  rtxt.encode.bytes = offset - oldOffset
  return buf
}

rtxt.encode.bytes = 0

rtxt.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset
  let remaining = buf.readUInt16BE(offset)
  offset += 2

  let data = []
  while (remaining > 0) {
    const len = buf[offset++]
    --remaining
    if (remaining < len) {
      throw new Error('Buffer overflow')
    }
    data.push(buf.slice(offset, offset + len))
    offset += len
    remaining -= len
  }

  rtxt.decode.bytes = offset - oldOffset
  return data
}

rtxt.decode.bytes = 0

rtxt.encodingLength = function (data) {
  if (!Array.isArray(data)) data = [data]
  let length = 2
  data.forEach(function (buf) {
    if (typeof buf === 'string') {
      length += Buffer.byteLength(buf) + 1
    } else {
      length += buf.length + 1
    }
  })
  return length
}

const rnull = exports["null"] = {}

rnull.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rnull.encodingLength(data))
  if (!offset) offset = 0

  if (typeof data === 'string') data = Buffer.from(data)
  if (!data) data = Buffer.alloc(0)

  const oldOffset = offset
  offset += 2

  const len = data.length
  data.copy(buf, offset, 0, len)
  offset += len

  buf.writeUInt16BE(offset - oldOffset - 2, oldOffset)
  rnull.encode.bytes = offset - oldOffset
  return buf
}

rnull.encode.bytes = 0

rnull.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset
  const len = buf.readUInt16BE(offset)

  offset += 2

  const data = buf.slice(offset, offset + len)
  offset += len

  rnull.decode.bytes = offset - oldOffset
  return data
}

rnull.decode.bytes = 0

rnull.encodingLength = function (data) {
  if (!data) return 2
  return (Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data)) + 2
}

const rhinfo = exports.hinfo = {}

rhinfo.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rhinfo.encodingLength(data))
  if (!offset) offset = 0

  const oldOffset = offset
  offset += 2
  string.encode(data.cpu, buf, offset)
  offset += string.encode.bytes
  string.encode(data.os, buf, offset)
  offset += string.encode.bytes
  buf.writeUInt16BE(offset - oldOffset - 2, oldOffset)
  rhinfo.encode.bytes = offset - oldOffset
  return buf
}

rhinfo.encode.bytes = 0

rhinfo.decode = function (buf, offset) {
  if (!offset) offset = 0

  const oldOffset = offset

  const data = {}
  offset += 2
  data.cpu = string.decode(buf, offset)
  offset += string.decode.bytes
  data.os = string.decode(buf, offset)
  offset += string.decode.bytes
  rhinfo.decode.bytes = offset - oldOffset
  return data
}

rhinfo.decode.bytes = 0

rhinfo.encodingLength = function (data) {
  return string.encodingLength(data.cpu) + string.encodingLength(data.os) + 2
}

const rptr = exports.ptr = {}
const rcname = exports.cname = rptr
const rdname = exports.dname = rptr

rptr.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rptr.encodingLength(data))
  if (!offset) offset = 0

  name.encode(data, buf, offset + 2)
  buf.writeUInt16BE(name.encode.bytes, offset)
  rptr.encode.bytes = name.encode.bytes + 2
  return buf
}

rptr.encode.bytes = 0

rptr.decode = function (buf, offset) {
  if (!offset) offset = 0

  const data = name.decode(buf, offset + 2)
  rptr.decode.bytes = name.decode.bytes + 2
  return data
}

rptr.decode.bytes = 0

rptr.encodingLength = function (data) {
  return name.encodingLength(data) + 2
}

const rsrv = exports.srv = {}

rsrv.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rsrv.encodingLength(data))
  if (!offset) offset = 0

  buf.writeUInt16BE(data.priority || 0, offset + 2)
  buf.writeUInt16BE(data.weight || 0, offset + 4)
  buf.writeUInt16BE(data.port || 0, offset + 6)
  name.encode(data.target, buf, offset + 8)

  const len = name.encode.bytes + 6
  buf.writeUInt16BE(len, offset)

  rsrv.encode.bytes = len + 2
  return buf
}

rsrv.encode.bytes = 0

rsrv.decode = function (buf, offset) {
  if (!offset) offset = 0

  const len = buf.readUInt16BE(offset)

  const data = {}
  data.priority = buf.readUInt16BE(offset + 2)
  data.weight = buf.readUInt16BE(offset + 4)
  data.port = buf.readUInt16BE(offset + 6)
  data.target = name.decode(buf, offset + 8)

  rsrv.decode.bytes = len + 2
  return data
}

rsrv.decode.bytes = 0

rsrv.encodingLength = function (data) {
  return 8 + name.encodingLength(data.target)
}

const rcaa = exports.caa = {}

rcaa.ISSUER_CRITICAL = 1 << 7

rcaa.encode = function (data, buf, offset) {
  const len = rcaa.encodingLength(data)

  if (!buf) buf = Buffer.alloc(rcaa.encodingLength(data))
  if (!offset) offset = 0

  if (data.issuerCritical) {
    data.flags = rcaa.ISSUER_CRITICAL
  }

  buf.writeUInt16BE(len - 2, offset)
  offset += 2
  buf.writeUInt8(data.flags || 0, offset)
  offset += 1
  string.encode(data.tag, buf, offset)
  offset += string.encode.bytes
  buf.write(data.value, offset)
  offset += Buffer.byteLength(data.value)

  rcaa.encode.bytes = len
  return buf
}

rcaa.encode.bytes = 0

rcaa.decode = function (buf, offset) {
  if (!offset) offset = 0

  const len = buf.readUInt16BE(offset)
  offset += 2

  const oldOffset = offset
  const data = {}
  data.flags = buf.readUInt8(offset)
  offset += 1
  data.tag = string.decode(buf, offset)
  offset += string.decode.bytes
  data.value = buf.toString('utf-8', offset, oldOffset + len)

  data.issuerCritical = !!(data.flags & rcaa.ISSUER_CRITICAL)

  rcaa.decode.bytes = len + 2

  return data
}

rcaa.decode.bytes = 0

rcaa.encodingLength = function (data) {
  return string.encodingLength(data.tag) + string.encodingLength(data.value) + 2
}

const rmx = exports.mx = {}

rmx.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rmx.encodingLength(data))
  if (!offset) offset = 0

  const oldOffset = offset
  offset += 2
  buf.writeUInt16BE(data.preference || 0, offset)
  offset += 2
  name.encode(data.exchange, buf, offset)
  offset += name.encode.bytes

  buf.writeUInt16BE(offset - oldOffset - 2, oldOffset)
  rmx.encode.bytes = offset - oldOffset
  return buf
}

rmx.encode.bytes = 0

rmx.decode = function (buf, offset) {
  if (!offset) offset = 0

  const oldOffset = offset

  const data = {}
  offset += 2
  data.preference = buf.readUInt16BE(offset)
  offset += 2
  data.exchange = name.decode(buf, offset)
  offset += name.decode.bytes

  rmx.decode.bytes = offset - oldOffset
  return data
}

rmx.encodingLength = function (data) {
  return 4 + name.encodingLength(data.exchange)
}

const ra = exports.a = {}

ra.encode = function (host, buf, offset) {
  if (!buf) buf = Buffer.alloc(ra.encodingLength(host))
  if (!offset) offset = 0

  buf.writeUInt16BE(4, offset)
  offset += 2
  ip.v4.encode(host, buf, offset)
  ra.encode.bytes = 6
  return buf
}

ra.encode.bytes = 0

ra.decode = function (buf, offset) {
  if (!offset) offset = 0

  offset += 2
  const host = ip.v4.decode(buf, offset)
  ra.decode.bytes = 6
  return host
}

ra.decode.bytes = 0

ra.encodingLength = function () {
  return 6
}

const raaaa = exports.aaaa = {}

raaaa.encode = function (host, buf, offset) {
  if (!buf) buf = Buffer.alloc(raaaa.encodingLength(host))
  if (!offset) offset = 0

  buf.writeUInt16BE(16, offset)
  offset += 2
  ip.v6.encode(host, buf, offset)
  raaaa.encode.bytes = 18
  return buf
}

raaaa.encode.bytes = 0

raaaa.decode = function (buf, offset) {
  if (!offset) offset = 0

  offset += 2
  const host = ip.v6.decode(buf, offset)
  raaaa.decode.bytes = 18
  return host
}

raaaa.decode.bytes = 0

raaaa.encodingLength = function () {
  return 18
}

const roption = exports.option = {}

roption.encode = function (option, buf, offset) {
  if (!buf) buf = Buffer.alloc(roption.encodingLength(option))
  if (!offset) offset = 0
  const oldOffset = offset

  const code = optioncodes.toCode(option.code)
  buf.writeUInt16BE(code, offset)
  offset += 2
  if (option.data) {
    buf.writeUInt16BE(option.data.length, offset)
    offset += 2
    option.data.copy(buf, offset)
    offset += option.data.length
  } else {
    switch (code) {
      // case 3: NSID.  No encode makes sense.
      // case 5,6,7: Not implementable
      case 8: // ECS
        // note: do IP math before calling
        const spl = option.sourcePrefixLength || 0
        const fam = option.family || ip.familyOf(option.ip)
        const ipBuf = ip.encode(option.ip, Buffer.alloc)
        const ipLen = Math.ceil(spl / 8)
        buf.writeUInt16BE(ipLen + 4, offset)
        offset += 2
        buf.writeUInt16BE(fam, offset)
        offset += 2
        buf.writeUInt8(spl, offset++)
        buf.writeUInt8(option.scopePrefixLength || 0, offset++)

        ipBuf.copy(buf, offset, 0, ipLen)
        offset += ipLen
        break
      // case 9: EXPIRE (experimental)
      // case 10: COOKIE.  No encode makes sense.
      case 11: // KEEP-ALIVE
        if (option.timeout) {
          buf.writeUInt16BE(2, offset)
          offset += 2
          buf.writeUInt16BE(option.timeout, offset)
          offset += 2
        } else {
          buf.writeUInt16BE(0, offset)
          offset += 2
        }
        break
      case 12: // PADDING
        const len = option.length || 0
        buf.writeUInt16BE(len, offset)
        offset += 2
        buf.fill(0, offset, offset + len)
        offset += len
        break
      // case 13:  CHAIN.  Experimental.
      case 14: // KEY-TAG
        const tagsLen = option.tags.length * 2
        buf.writeUInt16BE(tagsLen, offset)
        offset += 2
        for (const tag of option.tags) {
          buf.writeUInt16BE(tag, offset)
          offset += 2
        }
        break
      default:
        throw new Error(`Unknown roption code: ${option.code}`)
    }
  }

  roption.encode.bytes = offset - oldOffset
  return buf
}

roption.encode.bytes = 0

roption.decode = function (buf, offset) {
  if (!offset) offset = 0
  const option = {}
  option.code = buf.readUInt16BE(offset)
  option.type = optioncodes.toString(option.code)
  offset += 2
  const len = buf.readUInt16BE(offset)
  offset += 2
  option.data = buf.slice(offset, offset + len)
  switch (option.code) {
    // case 3: NSID.  No decode makes sense.
    case 8: // ECS
      option.family = buf.readUInt16BE(offset)
      offset += 2
      option.sourcePrefixLength = buf.readUInt8(offset++)
      option.scopePrefixLength = buf.readUInt8(offset++)
      const padded = Buffer.alloc((option.family === 1) ? 4 : 16)
      buf.copy(padded, 0, offset, offset + len - 4)
      option.ip = ip.decode(padded)
      break
    // case 12: Padding.  No decode makes sense.
    case 11: // KEEP-ALIVE
      if (len > 0) {
        option.timeout = buf.readUInt16BE(offset)
        offset += 2
      }
      break
    case 14:
      option.tags = []
      for (let i = 0; i < len; i += 2) {
        option.tags.push(buf.readUInt16BE(offset))
        offset += 2
      }
    // don't worry about default.  caller will use data if desired
  }

  roption.decode.bytes = len + 4
  return option
}

roption.decode.bytes = 0

roption.encodingLength = function (option) {
  if (option.data) {
    return option.data.length + 4
  }
  const code = optioncodes.toCode(option.code)
  switch (code) {
    case 8: // ECS
      const spl = option.sourcePrefixLength || 0
      return Math.ceil(spl / 8) + 8
    case 11: // KEEP-ALIVE
      return (typeof option.timeout === 'number') ? 6 : 4
    case 12: // PADDING
      return option.length + 4
    case 14: // KEY-TAG
      return 4 + (option.tags.length * 2)
  }
  throw new Error(`Unknown roption code: ${option.code}`)
}

const ropt = exports.opt = {}

ropt.encode = function (options, buf, offset) {
  if (!buf) buf = Buffer.alloc(ropt.encodingLength(options))
  if (!offset) offset = 0
  const oldOffset = offset

  const rdlen = encodingLengthList(options, roption)
  buf.writeUInt16BE(rdlen, offset)
  offset = encodeList(options, roption, buf, offset + 2)

  ropt.encode.bytes = offset - oldOffset
  return buf
}

ropt.encode.bytes = 0

ropt.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  const options = []
  let rdlen = buf.readUInt16BE(offset)
  offset += 2
  let o = 0
  while (rdlen > 0) {
    options[o++] = roption.decode(buf, offset)
    offset += roption.decode.bytes
    rdlen -= roption.decode.bytes
  }
  ropt.decode.bytes = offset - oldOffset
  return options
}

ropt.decode.bytes = 0

ropt.encodingLength = function (options) {
  return 2 + encodingLengthList(options || [], roption)
}

const rdnskey = exports.dnskey = {}

rdnskey.PROTOCOL_DNSSEC = 3
rdnskey.ZONE_KEY = 0x80
rdnskey.SECURE_ENTRYPOINT = 0x8000

rdnskey.encode = function (key, buf, offset) {
  if (!buf) buf = Buffer.alloc(rdnskey.encodingLength(key))
  if (!offset) offset = 0
  const oldOffset = offset

  const keydata = key.key
  if (!Buffer.isBuffer(keydata)) {
    throw new Error('Key must be a Buffer')
  }

  offset += 2 // Leave space for length
  buf.writeUInt16BE(key.flags, offset)
  offset += 2
  buf.writeUInt8(rdnskey.PROTOCOL_DNSSEC, offset)
  offset += 1
  buf.writeUInt8(key.algorithm, offset)
  offset += 1
  keydata.copy(buf, offset, 0, keydata.length)
  offset += keydata.length

  rdnskey.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rdnskey.encode.bytes - 2, oldOffset)
  return buf
}

rdnskey.encode.bytes = 0

rdnskey.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  var key = {}
  var length = buf.readUInt16BE(offset)
  offset += 2
  key.flags = buf.readUInt16BE(offset)
  offset += 2
  if (buf.readUInt8(offset) !== rdnskey.PROTOCOL_DNSSEC) {
    throw new Error('Protocol must be 3')
  }
  offset += 1
  key.algorithm = buf.readUInt8(offset)
  offset += 1
  key.key = buf.slice(offset, oldOffset + length + 2)
  offset += key.key.length
  rdnskey.decode.bytes = offset - oldOffset
  return key
}

rdnskey.decode.bytes = 0

rdnskey.encodingLength = function (key) {
  return 6 + Buffer.byteLength(key.key)
}

const rrrsig = exports.rrsig = {}

rrrsig.encode = function (sig, buf, offset) {
  if (!buf) buf = Buffer.alloc(rrrsig.encodingLength(sig))
  if (!offset) offset = 0
  const oldOffset = offset

  const signature = sig.signature
  if (!Buffer.isBuffer(signature)) {
    throw new Error('Signature must be a Buffer')
  }

  offset += 2 // Leave space for length
  buf.writeUInt16BE(types.toType(sig.typeCovered), offset)
  offset += 2
  buf.writeUInt8(sig.algorithm, offset)
  offset += 1
  buf.writeUInt8(sig.labels, offset)
  offset += 1
  buf.writeUInt32BE(sig.originalTTL, offset)
  offset += 4
  buf.writeUInt32BE(sig.expiration, offset)
  offset += 4
  buf.writeUInt32BE(sig.inception, offset)
  offset += 4
  buf.writeUInt16BE(sig.keyTag, offset)
  offset += 2
  name.encode(sig.signersName, buf, offset)
  offset += name.encode.bytes
  signature.copy(buf, offset, 0, signature.length)
  offset += signature.length

  rrrsig.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rrrsig.encode.bytes - 2, oldOffset)
  return buf
}

rrrsig.encode.bytes = 0

rrrsig.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  var sig = {}
  var length = buf.readUInt16BE(offset)
  offset += 2
  sig.typeCovered = types.toString(buf.readUInt16BE(offset))
  offset += 2
  sig.algorithm = buf.readUInt8(offset)
  offset += 1
  sig.labels = buf.readUInt8(offset)
  offset += 1
  sig.originalTTL = buf.readUInt32BE(offset)
  offset += 4
  sig.expiration = buf.readUInt32BE(offset)
  offset += 4
  sig.inception = buf.readUInt32BE(offset)
  offset += 4
  sig.keyTag = buf.readUInt16BE(offset)
  offset += 2
  sig.signersName = name.decode(buf, offset)
  offset += name.decode.bytes
  sig.signature = buf.slice(offset, oldOffset + length + 2)
  offset += sig.signature.length
  rrrsig.decode.bytes = offset - oldOffset
  return sig
}

rrrsig.decode.bytes = 0

rrrsig.encodingLength = function (sig) {
  return 20 +
    name.encodingLength(sig.signersName) +
    Buffer.byteLength(sig.signature)
}

const rrp = exports.rp = {}

rrp.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rrp.encodingLength(data))
  if (!offset) offset = 0
  const oldOffset = offset

  offset += 2 // Leave space for length
  name.encode(data.mbox || '.', buf, offset, { mail: true })
  offset += name.encode.bytes
  name.encode(data.txt || '.', buf, offset)
  offset += name.encode.bytes
  rrp.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rrp.encode.bytes - 2, oldOffset)
  return buf
}

rrp.encode.bytes = 0

rrp.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  const data = {}
  offset += 2
  data.mbox = name.decode(buf, offset, { mail: true }) || '.'
  offset += name.decode.bytes
  data.txt = name.decode(buf, offset) || '.'
  offset += name.decode.bytes
  rrp.decode.bytes = offset - oldOffset
  return data
}

rrp.decode.bytes = 0

rrp.encodingLength = function (data) {
  return 2 + name.encodingLength(data.mbox || '.') + name.encodingLength(data.txt || '.')
}

const typebitmap = {}

typebitmap.encode = function (typelist, buf, offset) {
  if (!buf) buf = Buffer.alloc(typebitmap.encodingLength(typelist))
  if (!offset) offset = 0
  const oldOffset = offset

  var typesByWindow = []
  for (var i = 0; i < typelist.length; i++) {
    var typeid = types.toType(typelist[i])
    if (typesByWindow[typeid >> 8] === undefined) {
      typesByWindow[typeid >> 8] = []
    }
    typesByWindow[typeid >> 8][(typeid >> 3) & 0x1F] |= 1 << (7 - (typeid & 0x7))
  }

  for (i = 0; i < typesByWindow.length; i++) {
    if (typesByWindow[i] !== undefined) {
      var windowBuf = Buffer.from(typesByWindow[i])
      buf.writeUInt8(i, offset)
      offset += 1
      buf.writeUInt8(windowBuf.length, offset)
      offset += 1
      windowBuf.copy(buf, offset)
      offset += windowBuf.length
    }
  }

  typebitmap.encode.bytes = offset - oldOffset
  return buf
}

typebitmap.encode.bytes = 0

typebitmap.decode = function (buf, offset, length) {
  if (!offset) offset = 0
  const oldOffset = offset

  var typelist = []
  while (offset - oldOffset < length) {
    var window = buf.readUInt8(offset)
    offset += 1
    var windowLength = buf.readUInt8(offset)
    offset += 1
    for (var i = 0; i < windowLength; i++) {
      var b = buf.readUInt8(offset + i)
      for (var j = 0; j < 8; j++) {
        if (b & (1 << (7 - j))) {
          var typeid = types.toString((window << 8) | (i << 3) | j)
          typelist.push(typeid)
        }
      }
    }
    offset += windowLength
  }

  typebitmap.decode.bytes = offset - oldOffset
  return typelist
}

typebitmap.decode.bytes = 0

typebitmap.encodingLength = function (typelist) {
  var extents = []
  for (var i = 0; i < typelist.length; i++) {
    var typeid = types.toType(typelist[i])
    extents[typeid >> 8] = Math.max(extents[typeid >> 8] || 0, typeid & 0xFF)
  }

  var len = 0
  for (i = 0; i < extents.length; i++) {
    if (extents[i] !== undefined) {
      len += 2 + Math.ceil((extents[i] + 1) / 8)
    }
  }

  return len
}

const rnsec = exports.nsec = {}

rnsec.encode = function (record, buf, offset) {
  if (!buf) buf = Buffer.alloc(rnsec.encodingLength(record))
  if (!offset) offset = 0
  const oldOffset = offset

  offset += 2 // Leave space for length
  name.encode(record.nextDomain, buf, offset)
  offset += name.encode.bytes
  typebitmap.encode(record.rrtypes, buf, offset)
  offset += typebitmap.encode.bytes

  rnsec.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rnsec.encode.bytes - 2, oldOffset)
  return buf
}

rnsec.encode.bytes = 0

rnsec.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  var record = {}
  var length = buf.readUInt16BE(offset)
  offset += 2
  record.nextDomain = name.decode(buf, offset)
  offset += name.decode.bytes
  record.rrtypes = typebitmap.decode(buf, offset, length - (offset - oldOffset))
  offset += typebitmap.decode.bytes

  rnsec.decode.bytes = offset - oldOffset
  return record
}

rnsec.decode.bytes = 0

rnsec.encodingLength = function (record) {
  return 2 +
    name.encodingLength(record.nextDomain) +
    typebitmap.encodingLength(record.rrtypes)
}

const rnsec3 = exports.nsec3 = {}

rnsec3.encode = function (record, buf, offset) {
  if (!buf) buf = Buffer.alloc(rnsec3.encodingLength(record))
  if (!offset) offset = 0
  const oldOffset = offset

  const salt = record.salt
  if (!Buffer.isBuffer(salt)) {
    throw new Error('salt must be a Buffer')
  }

  const nextDomain = record.nextDomain
  if (!Buffer.isBuffer(nextDomain)) {
    throw new Error('nextDomain must be a Buffer')
  }

  offset += 2 // Leave space for length
  buf.writeUInt8(record.algorithm, offset)
  offset += 1
  buf.writeUInt8(record.flags, offset)
  offset += 1
  buf.writeUInt16BE(record.iterations, offset)
  offset += 2
  buf.writeUInt8(salt.length, offset)
  offset += 1
  salt.copy(buf, offset, 0, salt.length)
  offset += salt.length
  buf.writeUInt8(nextDomain.length, offset)
  offset += 1
  nextDomain.copy(buf, offset, 0, nextDomain.length)
  offset += nextDomain.length
  typebitmap.encode(record.rrtypes, buf, offset)
  offset += typebitmap.encode.bytes

  rnsec3.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rnsec3.encode.bytes - 2, oldOffset)
  return buf
}

rnsec3.encode.bytes = 0

rnsec3.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  var record = {}
  var length = buf.readUInt16BE(offset)
  offset += 2
  record.algorithm = buf.readUInt8(offset)
  offset += 1
  record.flags = buf.readUInt8(offset)
  offset += 1
  record.iterations = buf.readUInt16BE(offset)
  offset += 2
  const saltLength = buf.readUInt8(offset)
  offset += 1
  record.salt = buf.slice(offset, offset + saltLength)
  offset += saltLength
  const hashLength = buf.readUInt8(offset)
  offset += 1
  record.nextDomain = buf.slice(offset, offset + hashLength)
  offset += hashLength
  record.rrtypes = typebitmap.decode(buf, offset, length - (offset - oldOffset))
  offset += typebitmap.decode.bytes

  rnsec3.decode.bytes = offset - oldOffset
  return record
}

rnsec3.decode.bytes = 0

rnsec3.encodingLength = function (record) {
  return 8 +
    record.salt.length +
    record.nextDomain.length +
    typebitmap.encodingLength(record.rrtypes)
}

const rds = exports.ds = {}

rds.encode = function (digest, buf, offset) {
  if (!buf) buf = Buffer.alloc(rds.encodingLength(digest))
  if (!offset) offset = 0
  const oldOffset = offset

  const digestdata = digest.digest
  if (!Buffer.isBuffer(digestdata)) {
    throw new Error('Digest must be a Buffer')
  }

  offset += 2 // Leave space for length
  buf.writeUInt16BE(digest.keyTag, offset)
  offset += 2
  buf.writeUInt8(digest.algorithm, offset)
  offset += 1
  buf.writeUInt8(digest.digestType, offset)
  offset += 1
  digestdata.copy(buf, offset, 0, digestdata.length)
  offset += digestdata.length

  rds.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rds.encode.bytes - 2, oldOffset)
  return buf
}

rds.encode.bytes = 0

rds.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  var digest = {}
  var length = buf.readUInt16BE(offset)
  offset += 2
  digest.keyTag = buf.readUInt16BE(offset)
  offset += 2
  digest.algorithm = buf.readUInt8(offset)
  offset += 1
  digest.digestType = buf.readUInt8(offset)
  offset += 1
  digest.digest = buf.slice(offset, oldOffset + length + 2)
  offset += digest.digest.length
  rds.decode.bytes = offset - oldOffset
  return digest
}

rds.decode.bytes = 0

rds.encodingLength = function (digest) {
  return 6 + Buffer.byteLength(digest.digest)
}

const rsshfp = exports.sshfp = {}

rsshfp.getFingerprintLengthForHashType = function getFingerprintLengthForHashType (hashType) {
  switch (hashType) {
    case 1: return 20
    case 2: return 32
  }
}

rsshfp.encode = function encode (record, buf, offset) {
  if (!buf) buf = Buffer.alloc(rsshfp.encodingLength(record))
  if (!offset) offset = 0
  const oldOffset = offset

  offset += 2 // The function call starts with the offset pointer at the RDLENGTH field, not the RDATA one
  buf[offset] = record.algorithm
  offset += 1
  buf[offset] = record.hash
  offset += 1

  const fingerprintBuf = Buffer.from(record.fingerprint.toUpperCase(), 'hex')
  if (fingerprintBuf.length !== rsshfp.getFingerprintLengthForHashType(record.hash)) {
    throw new Error('Invalid fingerprint length')
  }
  fingerprintBuf.copy(buf, offset)
  offset += fingerprintBuf.byteLength

  rsshfp.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rsshfp.encode.bytes - 2, oldOffset)

  return buf
}

rsshfp.encode.bytes = 0

rsshfp.decode = function decode (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  const record = {}
  offset += 2 // Account for the RDLENGTH field
  record.algorithm = buf[offset]
  offset += 1
  record.hash = buf[offset]
  offset += 1

  const fingerprintLength = rsshfp.getFingerprintLengthForHashType(record.hash)
  record.fingerprint = buf.slice(offset, offset + fingerprintLength).toString('hex').toUpperCase()
  offset += fingerprintLength
  rsshfp.decode.bytes = offset - oldOffset
  return record
}

rsshfp.decode.bytes = 0

rsshfp.encodingLength = function (record) {
  return 4 + Buffer.from(record.fingerprint, 'hex').byteLength
}

const rnaptr = exports.naptr = {}

rnaptr.encode = function (data, buf, offset) {
  if (!buf) buf = Buffer.alloc(rnaptr.encodingLength(data))
  if (!offset) offset = 0
  const oldOffset = offset
  offset += 2
  buf.writeUInt16BE(data.order || 0, offset)
  offset += 2
  buf.writeUInt16BE(data.preference || 0, offset)
  offset += 2
  string.encode(data.flags, buf, offset)
  offset += string.encode.bytes
  string.encode(data.services, buf, offset)
  offset += string.encode.bytes
  string.encode(data.regexp, buf, offset)
  offset += string.encode.bytes
  name.encode(data.replacement, buf, offset)
  offset += name.encode.bytes
  rnaptr.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rnaptr.encode.bytes - 2, oldOffset)
  return buf
}

rnaptr.encode.bytes = 0

rnaptr.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset
  const data = {}
  offset += 2
  data.order = buf.readUInt16BE(offset)
  offset += 2
  data.preference = buf.readUInt16BE(offset)
  offset += 2
  data.flags = string.decode(buf, offset)
  offset += string.decode.bytes
  data.services = string.decode(buf, offset)
  offset += string.decode.bytes
  data.regexp = string.decode(buf, offset)
  offset += string.decode.bytes
  data.replacement = name.decode(buf, offset)
  offset += name.decode.bytes
  rnaptr.decode.bytes = offset - oldOffset
  return data
}

rnaptr.decode.bytes = 0

rnaptr.encodingLength = function (data) {
  return string.encodingLength(data.flags) +
    string.encodingLength(data.services) +
    string.encodingLength(data.regexp) +
    name.encodingLength(data.replacement) + 6
}

const rtlsa = exports.tlsa = {}

rtlsa.encode = function (cert, buf, offset) {
  if (!buf) buf = Buffer.alloc(rtlsa.encodingLength(cert))
  if (!offset) offset = 0
  const oldOffset = offset

  const certdata = cert.certificate
  if (!Buffer.isBuffer(certdata)) {
    throw new Error('Certificate must be a Buffer')
  }

  offset += 2 // Leave space for length
  buf.writeUInt8(cert.usage, offset)
  offset += 1
  buf.writeUInt8(cert.selector, offset)
  offset += 1
  buf.writeUInt8(cert.matchingType, offset)
  offset += 1
  certdata.copy(buf, offset, 0, certdata.length)
  offset += certdata.length

  rtlsa.encode.bytes = offset - oldOffset
  buf.writeUInt16BE(rtlsa.encode.bytes - 2, oldOffset)
  return buf
}

rtlsa.encode.bytes = 0

rtlsa.decode = function (buf, offset) {
  if (!offset) offset = 0
  const oldOffset = offset

  const cert = {}
  const length = buf.readUInt16BE(offset)
  offset += 2
  cert.usage = buf.readUInt8(offset)
  offset += 1
  cert.selector = buf.readUInt8(offset)
  offset += 1
  cert.matchingType = buf.readUInt8(offset)
  offset += 1
  cert.certificate = buf.slice(offset, oldOffset + length + 2)
  offset += cert.certificate.length
  rtlsa.decode.bytes = offset - oldOffset
  return cert
}

rtlsa.decode.bytes = 0

rtlsa.encodingLength = function (cert) {
  return 5 + Buffer.byteLength(cert.certificate)
}

const renc = exports.record = function (type) {
  switch (type.toUpperCase()) {
    case 'A': return ra
    case 'PTR': return rptr
    case 'CNAME': return rcname
    case 'DNAME': return rdname
    case 'TXT': return rtxt
    case 'NULL': return rnull
    case 'AAAA': return raaaa
    case 'SRV': return rsrv
    case 'HINFO': return rhinfo
    case 'CAA': return rcaa
    case 'NS': return rns
    case 'SOA': return rsoa
    case 'MX': return rmx
    case 'OPT': return ropt
    case 'DNSKEY': return rdnskey
    case 'RRSIG': return rrrsig
    case 'RP': return rrp
    case 'NSEC': return rnsec
    case 'NSEC3': return rnsec3
    case 'SSHFP': return rsshfp
    case 'DS': return rds
    case 'NAPTR': return rnaptr
    case 'TLSA': return rtlsa
  }
  return runknown
}

const answer = exports.answer = {}

answer.encode = function (a, buf, offset) {
  if (!buf) buf = Buffer.alloc(answer.encodingLength(a))
  if (!offset) offset = 0

  const oldOffset = offset

  name.encode(a.name, buf, offset)
  offset += name.encode.bytes

  buf.writeUInt16BE(types.toType(a.type), offset)

  if (a.type.toUpperCase() === 'OPT') {
    if (a.name !== '.') {
      throw new Error('OPT name must be root.')
    }
    buf.writeUInt16BE(a.udpPayloadSize || 4096, offset + 2)
    buf.writeUInt8(a.extendedRcode || 0, offset + 4)
    buf.writeUInt8(a.ednsVersion || 0, offset + 5)
    buf.writeUInt16BE(a.flags || 0, offset + 6)

    offset += 8
    ropt.encode(a.options || [], buf, offset)
    offset += ropt.encode.bytes
  } else {
    let klass = classes.toClass(a.class === undefined ? 'IN' : a.class)
    if (a.flush) klass |= FLUSH_MASK // the 1st bit of the class is the flush bit
    buf.writeUInt16BE(klass, offset + 2)
    buf.writeUInt32BE(a.ttl || 0, offset + 4)

    offset += 8
    const enc = renc(a.type)
    enc.encode(a.data, buf, offset)
    offset += enc.encode.bytes
  }

  answer.encode.bytes = offset - oldOffset
  return buf
}

answer.encode.bytes = 0

answer.decode = function (buf, offset) {
  if (!offset) offset = 0

  const a = {}
  const oldOffset = offset

  a.name = name.decode(buf, offset)
  offset += name.decode.bytes
  a.type = types.toString(buf.readUInt16BE(offset))
  if (a.type === 'OPT') {
    a.udpPayloadSize = buf.readUInt16BE(offset + 2)
    a.extendedRcode = buf.readUInt8(offset + 4)
    a.ednsVersion = buf.readUInt8(offset + 5)
    a.flags = buf.readUInt16BE(offset + 6)
    a.flag_do = ((a.flags >> 15) & 0x1) === 1
    a.options = ropt.decode(buf, offset + 8)
    offset += 8 + ropt.decode.bytes
  } else {
    const klass = buf.readUInt16BE(offset + 2)
    a.ttl = buf.readUInt32BE(offset + 4)

    a.class = classes.toString(klass & NOT_FLUSH_MASK)
    a.flush = !!(klass & FLUSH_MASK)

    const enc = renc(a.type)
    a.data = enc.decode(buf, offset + 8)
    offset += 8 + enc.decode.bytes
  }

  answer.decode.bytes = offset - oldOffset
  return a
}

answer.decode.bytes = 0

answer.encodingLength = function (a) {
  const data = (a.data !== null && a.data !== undefined) ? a.data : a.options
  return name.encodingLength(a.name) + 8 + renc(a.type).encodingLength(data)
}

const question = exports.question = {}

question.encode = function (q, buf, offset) {
  if (!buf) buf = Buffer.alloc(question.encodingLength(q))
  if (!offset) offset = 0

  const oldOffset = offset

  name.encode(q.name, buf, offset)
  offset += name.encode.bytes

  buf.writeUInt16BE(types.toType(q.type), offset)
  offset += 2

  buf.writeUInt16BE(classes.toClass(q.class === undefined ? 'IN' : q.class), offset)
  offset += 2

  question.encode.bytes = offset - oldOffset
  return q
}

question.encode.bytes = 0

question.decode = function (buf, offset) {
  if (!offset) offset = 0

  const oldOffset = offset
  const q = {}

  q.name = name.decode(buf, offset)
  offset += name.decode.bytes

  q.type = types.toString(buf.readUInt16BE(offset))
  offset += 2

  q.class = classes.toString(buf.readUInt16BE(offset))
  offset += 2

  const qu = !!(q.class & QU_MASK)
  if (qu) q.class &= NOT_QU_MASK

  question.decode.bytes = offset - oldOffset
  return q
}

question.decode.bytes = 0

question.encodingLength = function (q) {
  return name.encodingLength(q.name) + 4
}

exports.AUTHORITATIVE_ANSWER = 1 << 10
exports.TRUNCATED_RESPONSE = 1 << 9
exports.RECURSION_DESIRED = 1 << 8
exports.RECURSION_AVAILABLE = 1 << 7
exports.AUTHENTIC_DATA = 1 << 5
exports.CHECKING_DISABLED = 1 << 4
exports.DNSSEC_OK = 1 << 15

exports.encode = function (result, buf, offset) {
  const allocing = !buf

  if (allocing) buf = Buffer.alloc(exports.encodingLength(result))
  if (!offset) offset = 0

  const oldOffset = offset

  if (!result.questions) result.questions = []
  if (!result.answers) result.answers = []
  if (!result.authorities) result.authorities = []
  if (!result.additionals) result.additionals = []

  header.encode(result, buf, offset)
  offset += header.encode.bytes

  offset = encodeList(result.questions, question, buf, offset)
  offset = encodeList(result.answers, answer, buf, offset)
  offset = encodeList(result.authorities, answer, buf, offset)
  offset = encodeList(result.additionals, answer, buf, offset)

  exports.encode.bytes = offset - oldOffset

  // just a quick sanity check
  if (allocing && exports.encode.bytes !== buf.length) {
    return buf.slice(0, exports.encode.bytes)
  }

  return buf
}

exports.encode.bytes = 0

exports.decode = function (buf, offset) {
  if (!offset) offset = 0

  const oldOffset = offset
  const result = header.decode(buf, offset)
  offset += header.decode.bytes

  offset = decodeList(result.questions, question, buf, offset)
  offset = decodeList(result.answers, answer, buf, offset)
  offset = decodeList(result.authorities, answer, buf, offset)
  offset = decodeList(result.additionals, answer, buf, offset)

  exports.decode.bytes = offset - oldOffset

  return result
}

exports.decode.bytes = 0

exports.encodingLength = function (result) {
  return header.encodingLength(result) +
    encodingLengthList(result.questions || [], question) +
    encodingLengthList(result.answers || [], answer) +
    encodingLengthList(result.authorities || [], answer) +
    encodingLengthList(result.additionals || [], answer)
}

exports.streamEncode = function (result) {
  const buf = exports.encode(result)
  const sbuf = Buffer.alloc(2)
  sbuf.writeUInt16BE(buf.byteLength)
  const combine = Buffer.concat([sbuf, buf])
  exports.streamEncode.bytes = combine.byteLength
  return combine
}

exports.streamEncode.bytes = 0

exports.streamDecode = function (sbuf) {
  const len = sbuf.readUInt16BE(0)
  if (sbuf.byteLength < len + 2) {
    // not enough data
    return null
  }
  const result = exports.decode(sbuf.slice(2))
  exports.streamDecode.bytes = exports.decode.bytes
  return result
}

exports.streamDecode.bytes = 0

function encodingLengthList (list, enc) {
  let len = 0
  for (let i = 0; i < list.length; i++) len += enc.encodingLength(list[i])
  return len
}

function encodeList (list, enc, buf, offset) {
  for (let i = 0; i < list.length; i++) {
    enc.encode(list[i], buf, offset)
    offset += enc.encode.bytes
  }
  return offset
}

function decodeList (list, enc, buf, offset) {
  for (let i = 0; i < list.length; i++) {
    list[i] = enc.decode(buf, offset)
    offset += enc.decode.bytes
  }
  return offset
}


/***/ }),

/***/ 942:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


/*
 * Traditional DNS header OPCODEs (4-bits) defined by IANA in
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-5
 */

exports.toString = function (opcode) {
  switch (opcode) {
    case 0: return 'QUERY'
    case 1: return 'IQUERY'
    case 2: return 'STATUS'
    case 3: return 'OPCODE_3'
    case 4: return 'NOTIFY'
    case 5: return 'UPDATE'
    case 6: return 'OPCODE_6'
    case 7: return 'OPCODE_7'
    case 8: return 'OPCODE_8'
    case 9: return 'OPCODE_9'
    case 10: return 'OPCODE_10'
    case 11: return 'OPCODE_11'
    case 12: return 'OPCODE_12'
    case 13: return 'OPCODE_13'
    case 14: return 'OPCODE_14'
    case 15: return 'OPCODE_15'
  }
  return 'OPCODE_' + opcode
}

exports.toOpcode = function (code) {
  switch (code.toUpperCase()) {
    case 'QUERY': return 0
    case 'IQUERY': return 1
    case 'STATUS': return 2
    case 'OPCODE_3': return 3
    case 'NOTIFY': return 4
    case 'UPDATE': return 5
    case 'OPCODE_6': return 6
    case 'OPCODE_7': return 7
    case 'OPCODE_8': return 8
    case 'OPCODE_9': return 9
    case 'OPCODE_10': return 10
    case 'OPCODE_11': return 11
    case 'OPCODE_12': return 12
    case 'OPCODE_13': return 13
    case 'OPCODE_14': return 14
    case 'OPCODE_15': return 15
  }
  return 0
}


/***/ }),

/***/ 285:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


exports.toString = function (type) {
  switch (type) {
    // list at
    // https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml#dns-parameters-11
    case 1: return 'LLQ'
    case 2: return 'UL'
    case 3: return 'NSID'
    case 5: return 'DAU'
    case 6: return 'DHU'
    case 7: return 'N3U'
    case 8: return 'CLIENT_SUBNET'
    case 9: return 'EXPIRE'
    case 10: return 'COOKIE'
    case 11: return 'TCP_KEEPALIVE'
    case 12: return 'PADDING'
    case 13: return 'CHAIN'
    case 14: return 'KEY_TAG'
    case 26946: return 'DEVICEID'
  }
  if (type < 0) {
    return null
  }
  return `OPTION_${type}`
}

exports.toCode = function (name) {
  if (typeof name === 'number') {
    return name
  }
  if (!name) {
    return -1
  }
  switch (name.toUpperCase()) {
    case 'OPTION_0': return 0
    case 'LLQ': return 1
    case 'UL': return 2
    case 'NSID': return 3
    case 'OPTION_4': return 4
    case 'DAU': return 5
    case 'DHU': return 6
    case 'N3U': return 7
    case 'CLIENT_SUBNET': return 8
    case 'EXPIRE': return 9
    case 'COOKIE': return 10
    case 'TCP_KEEPALIVE': return 11
    case 'PADDING': return 12
    case 'CHAIN': return 13
    case 'KEY_TAG': return 14
    case 'DEVICEID': return 26946
    case 'OPTION_65535': return 65535
  }
  const m = name.match(/_(\d+)$/)
  if (m) {
    return parseInt(m[1], 10)
  }
  return -1
}


/***/ }),

/***/ 17:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


/*
 * Traditional DNS header RCODEs (4-bits) defined by IANA in
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml
 */

exports.toString = function (rcode) {
  switch (rcode) {
    case 0: return 'NOERROR'
    case 1: return 'FORMERR'
    case 2: return 'SERVFAIL'
    case 3: return 'NXDOMAIN'
    case 4: return 'NOTIMP'
    case 5: return 'REFUSED'
    case 6: return 'YXDOMAIN'
    case 7: return 'YXRRSET'
    case 8: return 'NXRRSET'
    case 9: return 'NOTAUTH'
    case 10: return 'NOTZONE'
    case 11: return 'RCODE_11'
    case 12: return 'RCODE_12'
    case 13: return 'RCODE_13'
    case 14: return 'RCODE_14'
    case 15: return 'RCODE_15'
  }
  return 'RCODE_' + rcode
}

exports.toRcode = function (code) {
  switch (code.toUpperCase()) {
    case 'NOERROR': return 0
    case 'FORMERR': return 1
    case 'SERVFAIL': return 2
    case 'NXDOMAIN': return 3
    case 'NOTIMP': return 4
    case 'REFUSED': return 5
    case 'YXDOMAIN': return 6
    case 'YXRRSET': return 7
    case 'NXRRSET': return 8
    case 'NOTAUTH': return 9
    case 'NOTZONE': return 10
    case 'RCODE_11': return 11
    case 'RCODE_12': return 12
    case 'RCODE_13': return 13
    case 'RCODE_14': return 14
    case 'RCODE_15': return 15
  }
  return 0
}


/***/ }),

/***/ 82:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


exports.toString = function (type) {
  switch (type) {
    case 1: return 'A'
    case 10: return 'NULL'
    case 28: return 'AAAA'
    case 18: return 'AFSDB'
    case 42: return 'APL'
    case 257: return 'CAA'
    case 60: return 'CDNSKEY'
    case 59: return 'CDS'
    case 37: return 'CERT'
    case 5: return 'CNAME'
    case 49: return 'DHCID'
    case 32769: return 'DLV'
    case 39: return 'DNAME'
    case 48: return 'DNSKEY'
    case 43: return 'DS'
    case 55: return 'HIP'
    case 13: return 'HINFO'
    case 45: return 'IPSECKEY'
    case 25: return 'KEY'
    case 36: return 'KX'
    case 29: return 'LOC'
    case 15: return 'MX'
    case 35: return 'NAPTR'
    case 2: return 'NS'
    case 47: return 'NSEC'
    case 50: return 'NSEC3'
    case 51: return 'NSEC3PARAM'
    case 12: return 'PTR'
    case 46: return 'RRSIG'
    case 17: return 'RP'
    case 24: return 'SIG'
    case 6: return 'SOA'
    case 99: return 'SPF'
    case 33: return 'SRV'
    case 44: return 'SSHFP'
    case 32768: return 'TA'
    case 249: return 'TKEY'
    case 52: return 'TLSA'
    case 250: return 'TSIG'
    case 16: return 'TXT'
    case 252: return 'AXFR'
    case 251: return 'IXFR'
    case 41: return 'OPT'
    case 255: return 'ANY'
  }
  return 'UNKNOWN_' + type
}

exports.toType = function (name) {
  switch (name.toUpperCase()) {
    case 'A': return 1
    case 'NULL': return 10
    case 'AAAA': return 28
    case 'AFSDB': return 18
    case 'APL': return 42
    case 'CAA': return 257
    case 'CDNSKEY': return 60
    case 'CDS': return 59
    case 'CERT': return 37
    case 'CNAME': return 5
    case 'DHCID': return 49
    case 'DLV': return 32769
    case 'DNAME': return 39
    case 'DNSKEY': return 48
    case 'DS': return 43
    case 'HIP': return 55
    case 'HINFO': return 13
    case 'IPSECKEY': return 45
    case 'KEY': return 25
    case 'KX': return 36
    case 'LOC': return 29
    case 'MX': return 15
    case 'NAPTR': return 35
    case 'NS': return 2
    case 'NSEC': return 47
    case 'NSEC3': return 50
    case 'NSEC3PARAM': return 51
    case 'PTR': return 12
    case 'RRSIG': return 46
    case 'RP': return 17
    case 'SIG': return 24
    case 'SOA': return 6
    case 'SPF': return 99
    case 'SRV': return 33
    case 'SSHFP': return 44
    case 'TA': return 32768
    case 'TKEY': return 249
    case 'TLSA': return 52
    case 'TSIG': return 250
    case 'TXT': return 16
    case 'AXFR': return 252
    case 'IXFR': return 251
    case 'OPT': return 41
    case 'ANY': return 255
    case '*': return 255
  }
  if (name.toUpperCase().startsWith('UNKNOWN_')) return parseInt(name.slice(8))
  return 0
}


/***/ }),

/***/ 932:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const validator = __webpack_require__(501);
const XMLParser = __webpack_require__(844);
const XMLBuilder = __webpack_require__(192);

module.exports = {
  XMLParser: XMLParser,
  XMLValidator: validator,
  XMLBuilder: XMLBuilder
}

/***/ }),

/***/ 849:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const nameStartChar = ':A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const nameChar = nameStartChar + '\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const nameRegexp = '[' + nameStartChar + '][' + nameChar + ']*'
const regexName = new RegExp('^' + nameRegexp + '$');

const getAllMatches = function(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
};

const isName = function(string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === 'undefined');
};

exports.isExist = function(v) {
  return typeof v !== 'undefined';
};

exports.isEmptyObject = function(obj) {
  return Object.keys(obj).length === 0;
};

/**
 * Copy all the properties of a into b.
 * @param {*} target
 * @param {*} a
 */
exports.merge = function(target, a, arrayMode) {
  if (a) {
    const keys = Object.keys(a); // will return an array of own properties
    const len = keys.length; //don't make it inline
    for (let i = 0; i < len; i++) {
      if (arrayMode === 'strict') {
        target[keys[i]] = [ a[keys[i]] ];
      } else {
        target[keys[i]] = a[keys[i]];
      }
    }
  }
};
/* exports.merge =function (b,a){
  return Object.assign(b,a);
} */

exports.getValue = function(v) {
  if (exports.isExist(v)) {
    return v;
  } else {
    return '';
  }
};

// const fakeCall = function(a) {return a;};
// const fakeCallNoReturn = function() {};

exports.isName = isName;
exports.getAllMatches = getAllMatches;
exports.nameRegexp = nameRegexp;


/***/ }),

/***/ 501:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


const util = __webpack_require__(849);

const defaultOptions = {
  allowBooleanAttributes: false, //A tag can have attributes without any value
  unpairedTags: []
};

//const tagsPattern = new RegExp("<\\/?([\\w:\\-_\.]+)\\s*\/?>","g");
exports.validate = function (xmlData, options) {
  options = Object.assign({}, defaultOptions, options);

  //xmlData = xmlData.replace(/(\r\n|\n|\r)/gm,"");//make it single line
  //xmlData = xmlData.replace(/(^\s*<\?xml.*?\?>)/g,"");//Remove XML starting tag
  //xmlData = xmlData.replace(/(<!DOCTYPE[\s\w\"\.\/\-\:]+(\[.*\])*\s*>)/g,"");//Remove DOCTYPE
  const tags = [];
  let tagFound = false;

  //indicates that the root tag has been closed (aka. depth 0 has been reached)
  let reachedRoot = false;

  if (xmlData[0] === '\ufeff') {
    // check for byte order mark (BOM)
    xmlData = xmlData.substr(1);
  }
  
  for (let i = 0; i < xmlData.length; i++) {

    if (xmlData[i] === '<' && xmlData[i+1] === '?') {
      i+=2;
      i = readPI(xmlData,i);
      if (i.err) return i;
    }else if (xmlData[i] === '<') {
      //starting of tag
      //read until you reach to '>' avoiding any '>' in attribute value
      let tagStartPos = i;
      i++;
      
      if (xmlData[i] === '!') {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === '/') {
          //closing tag
          closingTag = true;
          i++;
        }
        //read tagname
        let tagName = '';
        for (; i < xmlData.length &&
          xmlData[i] !== '>' &&
          xmlData[i] !== ' ' &&
          xmlData[i] !== '\t' &&
          xmlData[i] !== '\n' &&
          xmlData[i] !== '\r'; i++
        ) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        //console.log(tagName);

        if (tagName[tagName.length - 1] === '/') {
          //self closing tag without attributes
          tagName = tagName.substring(0, tagName.length - 1);
          //continue;
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '"+tagName+"' is an invalid name.";
          }
          return getErrorObject('InvalidTag', msg, getLineNumberForPosition(xmlData, i));
        }

        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject('InvalidAttr', "Attributes for '"+tagName+"' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;

        if (attrStr[attrStr.length - 1] === '/') {
          //self closing tag
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
            //continue; //text may presents after self closing tag
          } else {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject('InvalidTag', "Closing tag '"+tagName+"' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject('InvalidTag', "Closing tag '"+tagName+"' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject('InvalidTag',
                "Expected closing tag '"+otg.tagName+"' (opened in line "+openPos.line+", col "+openPos.col+") instead of closing tag '"+tagName+"'.",
                getLineNumberForPosition(xmlData, tagStartPos));
            }

            //when there are no more tags, we reached the root level.
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }

          //if the root level has been reached before ...
          if (reachedRoot === true) {
            return getErrorObject('InvalidXml', 'Multiple possible root nodes found.', getLineNumberForPosition(xmlData, i));
          } else if(options.unpairedTags.indexOf(tagName) !== -1){
            //don't push into stack
          } else {
            tags.push({tagName, tagStartPos});
          }
          tagFound = true;
        }

        //skip tag text value
        //It may include comments and CDATA value
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === '<') {
            if (xmlData[i + 1] === '!') {
              //comment or CADATA
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i+1] === '?') {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else{
              break;
            }
          } else if (xmlData[i] === '&') {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject('InvalidChar', "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          }else{
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject('InvalidXml', "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        } //end of reading tag text value
        if (xmlData[i] === '<') {
          i--;
        }
      }
    } else {
      if ( isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject('InvalidChar', "char '"+xmlData[i]+"' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }

  if (!tagFound) {
    return getErrorObject('InvalidXml', 'Start tag expected.', 1);
  }else if (tags.length == 1) {
      return getErrorObject('InvalidTag', "Unclosed tag '"+tags[0].tagName+"'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  }else if (tags.length > 0) {
      return getErrorObject('InvalidXml', "Invalid '"+
          JSON.stringify(tags.map(t => t.tagName), null, 4).replace(/\r?\n/g, '')+
          "' found.", {line: 1, col: 1});
  }

  return true;
};

function isWhiteSpace(char){
  return char === ' ' || char === '\t' || char === '\n'  || char === '\r';
}
/**
 * Read Processing insstructions and skip
 * @param {*} xmlData
 * @param {*} i
 */
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == '?' || xmlData[i] == ' ') {
      //tagname
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === 'xml') {
        return getErrorObject('InvalidXml', 'XML declaration allowed only at the start of the document.', getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == '?' && xmlData[i + 1] == '>') {
        //check if valid attribut string
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}

function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === '-' && xmlData[i + 2] === '-') {
    //comment
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === '-' && xmlData[i + 1] === '-' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  } else if (
    xmlData.length > i + 8 &&
    xmlData[i + 1] === 'D' &&
    xmlData[i + 2] === 'O' &&
    xmlData[i + 3] === 'C' &&
    xmlData[i + 4] === 'T' &&
    xmlData[i + 5] === 'Y' &&
    xmlData[i + 6] === 'P' &&
    xmlData[i + 7] === 'E'
  ) {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === '<') {
        angleBracketsCount++;
      } else if (xmlData[i] === '>') {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (
    xmlData.length > i + 9 &&
    xmlData[i + 1] === '[' &&
    xmlData[i + 2] === 'C' &&
    xmlData[i + 3] === 'D' &&
    xmlData[i + 4] === 'A' &&
    xmlData[i + 5] === 'T' &&
    xmlData[i + 6] === 'A' &&
    xmlData[i + 7] === '['
  ) {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === ']' && xmlData[i + 1] === ']' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  }

  return i;
}

const doubleQuote = '"';
const singleQuote = "'";

/**
 * Keep reading xmlData until '<' is found outside the attribute value.
 * @param {string} xmlData
 * @param {number} i
 */
function readAttributeStr(xmlData, i) {
  let attrStr = '';
  let startChar = '';
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === '') {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {
        //if vaue is enclosed with double quote then single quotes are allowed inside the value and vice versa
      } else {
        startChar = '';
      }
    } else if (xmlData[i] === '>') {
      if (startChar === '') {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== '') {
    return false;
  }

  return {
    value: attrStr,
    index: i,
    tagClosed: tagClosed
  };
}

/**
 * Select all the attributes whether valid or invalid.
 */
const validAttrStrRegxp = new RegExp('(\\s*)([^\\s=]+)(\\s*=)?(\\s*([\'"])(([\\s\\S])*?)\\5)?', 'g');

//attr, ="sd", a="amit's", a="sd"b="saf", ab  cd=""

function validateAttributeString(attrStr, options) {
  //console.log("start:"+attrStr+":end");

  //if(attrStr.trim().length === 0) return true; //empty string

  const matches = util.getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};

  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      //nospace before attribute name: a="sd"b="saf"
      return getErrorObject('InvalidAttr', "Attribute '"+matches[i][2]+"' has no space in starting.", getPositionFromMatch(matches[i]))
    } else if (matches[i][3] !== undefined && matches[i][4] === undefined) {
      return getErrorObject('InvalidAttr', "Attribute '"+matches[i][2]+"' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === undefined && !options.allowBooleanAttributes) {
      //independent attribute: ab
      return getErrorObject('InvalidAttr', "boolean attribute '"+matches[i][2]+"' is not allowed.", getPositionFromMatch(matches[i]));
    }
    /* else if(matches[i][6] === undefined){//attribute without value: ab=
                    return { err: { code:"InvalidAttr",msg:"attribute " + matches[i][2] + " has no value assigned."}};
                } */
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject('InvalidAttr', "Attribute '"+attrName+"' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!attrNames.hasOwnProperty(attrName)) {
      //check for duplicate attribute.
      attrNames[attrName] = 1;
    } else {
      return getErrorObject('InvalidAttr', "Attribute '"+attrName+"' is repeated.", getPositionFromMatch(matches[i]));
    }
  }

  return true;
}

function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === 'x') {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ';')
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}

function validateAmpersand(xmlData, i) {
  // https://www.w3.org/TR/xml/#dt-charref
  i++;
  if (xmlData[i] === ';')
    return -1;
  if (xmlData[i] === '#') {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ';')
      break;
    return -1;
  }
  return i;
}

function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code: code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col,
    },
  };
}

function validateAttrName(attrName) {
  return util.isName(attrName);
}

// const startsWithXML = /^xml/i;

function validateTagName(tagname) {
  return util.isName(tagname) /* && !tagname.match(startsWithXML) */;
}

//this function returns the line number for the character at the given index
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,

    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}

//this function returns the position of the first character of match within attrStr
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}


/***/ }),

/***/ 192:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

//parse Empty Node as self closing node
const buildFromOrderedJs = __webpack_require__(592);

const defaultOptions = {
  attributeNamePrefix: '@_',
  attributesGroupName: false,
  textNodeName: '#text',
  ignoreAttributes: true,
  cdataPropName: false,
  format: false,
  indentBy: '  ',
  suppressEmptyNode: false,
  suppressUnpairedNode: true,
  suppressBooleanAttributes: true,
  tagValueProcessor: function(key, a) {
    return a;
  },
  attributeValueProcessor: function(attrName, a) {
    return a;
  },
  preserveOrder: false,
  commentPropName: false,
  unpairedTags: [],
  entities: [
    { regex: new RegExp("&", "g"), val: "&amp;" },//it must be on top
    { regex: new RegExp(">", "g"), val: "&gt;" },
    { regex: new RegExp("<", "g"), val: "&lt;" },
    { regex: new RegExp("\'", "g"), val: "&apos;" },
    { regex: new RegExp("\"", "g"), val: "&quot;" }
  ],
  processEntities: true,
  stopNodes: [],
  // transformTagName: false,
  // transformAttributeName: false,
  oneListGroup: false
};

function Builder(options) {
  this.options = Object.assign({}, defaultOptions, options);
  if (this.options.ignoreAttributes || this.options.attributesGroupName) {
    this.isAttribute = function(/*a*/) {
      return false;
    };
  } else {
    this.attrPrefixLen = this.options.attributeNamePrefix.length;
    this.isAttribute = isAttribute;
  }

  this.processTextOrObjNode = processTextOrObjNode

  if (this.options.format) {
    this.indentate = indentate;
    this.tagEndChar = '>\n';
    this.newLine = '\n';
  } else {
    this.indentate = function() {
      return '';
    };
    this.tagEndChar = '>';
    this.newLine = '';
  }
}

Builder.prototype.build = function(jObj) {
  if(this.options.preserveOrder){
    return buildFromOrderedJs(jObj, this.options);
  }else {
    if(Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1){
      jObj = {
        [this.options.arrayNodeName] : jObj
      }
    }
    return this.j2x(jObj, 0).val;
  }
};

Builder.prototype.j2x = function(jObj, level) {
  let attrStr = '';
  let val = '';
  for (let key in jObj) {
    if (typeof jObj[key] === 'undefined') {
      // supress undefined node
    } else if (jObj[key] === null) {
      if(key[0] === "?") val += this.indentate(level) + '<' + key + '?' + this.tagEndChar;
      else val += this.indentate(level) + '<' + key + '/' + this.tagEndChar;
      // val += this.indentate(level) + '<' + key + '/' + this.tagEndChar;
    } else if (jObj[key] instanceof Date) {
      val += this.buildTextValNode(jObj[key], key, '', level);
    } else if (typeof jObj[key] !== 'object') {
      //premitive type
      const attr = this.isAttribute(key);
      if (attr) {
        attrStr += this.buildAttrPairStr(attr, '' + jObj[key]);
      }else {
        //tag value
        if (key === this.options.textNodeName) {
          let newval = this.options.tagValueProcessor(key, '' + jObj[key]);
          val += this.replaceEntitiesValue(newval);
        } else {
          val += this.buildTextValNode(jObj[key], key, '', level);
        }
      }
    } else if (Array.isArray(jObj[key])) {
      //repeated nodes
      const arrLen = jObj[key].length;
      let listTagVal = "";
      for (let j = 0; j < arrLen; j++) {
        const item = jObj[key][j];
        if (typeof item === 'undefined') {
          // supress undefined node
        } else if (item === null) {
          if(key[0] === "?") val += this.indentate(level) + '<' + key + '?' + this.tagEndChar;
          else val += this.indentate(level) + '<' + key + '/' + this.tagEndChar;
          // val += this.indentate(level) + '<' + key + '/' + this.tagEndChar;
        } else if (typeof item === 'object') {
          if(this.options.oneListGroup ){
            listTagVal += this.j2x(item, level + 1).val;
          }else{
            listTagVal += this.processTextOrObjNode(item, key, level)
          }
        } else {
          listTagVal += this.buildTextValNode(item, key, '', level);
        }
      }
      if(this.options.oneListGroup){
        listTagVal = this.buildObjectNode(listTagVal, key, '', level);
      }
      val += listTagVal;
    } else {
      //nested node
      if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
        const Ks = Object.keys(jObj[key]);
        const L = Ks.length;
        for (let j = 0; j < L; j++) {
          attrStr += this.buildAttrPairStr(Ks[j], '' + jObj[key][Ks[j]]);
        }
      } else {
        val += this.processTextOrObjNode(jObj[key], key, level)
      }
    }
  }
  return {attrStr: attrStr, val: val};
};

Builder.prototype.buildAttrPairStr = function(attrName, val){
  val = this.options.attributeValueProcessor(attrName, '' + val);
  val = this.replaceEntitiesValue(val);
  if (this.options.suppressBooleanAttributes && val === "true") {
    return ' ' + attrName;
  } else return ' ' + attrName + '="' + val + '"';
}

function processTextOrObjNode (object, key, level) {
  const result = this.j2x(object, level + 1);
  if (object[this.options.textNodeName] !== undefined && Object.keys(object).length === 1) {
    return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
  } else {
    return this.buildObjectNode(result.val, key, result.attrStr, level);
  }
}

Builder.prototype.buildObjectNode = function(val, key, attrStr, level) {
  if(val === ""){
    if(key[0] === "?") return  this.indentate(level) + '<' + key + attrStr+ '?' + this.tagEndChar;
    else {
      return this.indentate(level) + '<' + key + attrStr + this.closeTag(key) + this.tagEndChar;
    }
  }else{

    let tagEndExp = '</' + key + this.tagEndChar;
    let piClosingChar = "";
    
    if(key[0] === "?") {
      piClosingChar = "?";
      tagEndExp = "";
    }
  
    if (attrStr && val.indexOf('<') === -1) {
      return ( this.indentate(level) + '<' +  key + attrStr + piClosingChar + '>' + val + tagEndExp );
    } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
      return this.indentate(level) + `<!--${val}-->` + this.newLine;
    }else {
      return (
        this.indentate(level) + '<' + key + attrStr + piClosingChar + this.tagEndChar +
        val +
        this.indentate(level) + tagEndExp    );
    }
  }
}

Builder.prototype.closeTag = function(key){
  let closeTag = "";
  if(this.options.unpairedTags.indexOf(key) !== -1){ //unpaired
    if(!this.options.suppressUnpairedNode) closeTag = "/"
  }else if(this.options.suppressEmptyNode){ //empty
    closeTag = "/";
  }else{
    closeTag = `></${key}`
  }
  return closeTag;
}

function buildEmptyObjNode(val, key, attrStr, level) {
  if (val !== '') {
    return this.buildObjectNode(val, key, attrStr, level);
  } else {
    if(key[0] === "?") return  this.indentate(level) + '<' + key + attrStr+ '?' + this.tagEndChar;
    else {
      return  this.indentate(level) + '<' + key + attrStr + '/' + this.tagEndChar;
      // return this.buildTagStr(level,key, attrStr);
    }
  }
}

Builder.prototype.buildTextValNode = function(val, key, attrStr, level) {
  if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
    return this.indentate(level) + `<![CDATA[${val}]]>` +  this.newLine;
  }else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
    return this.indentate(level) + `<!--${val}-->` +  this.newLine;
  }else if(key[0] === "?") {//PI tag
    return  this.indentate(level) + '<' + key + attrStr+ '?' + this.tagEndChar; 
  }else{
    let textValue = this.options.tagValueProcessor(key, val);
    textValue = this.replaceEntitiesValue(textValue);
  
    if( textValue === ''){
      return this.indentate(level) + '<' + key + attrStr + this.closeTag(key) + this.tagEndChar;
    }else{
      return this.indentate(level) + '<' + key + attrStr + '>' +
         textValue +
        '</' + key + this.tagEndChar;
    }
  }
}

Builder.prototype.replaceEntitiesValue = function(textValue){
  if(textValue && textValue.length > 0 && this.options.processEntities){
    for (let i=0; i<this.options.entities.length; i++) {
      const entity = this.options.entities[i];
      textValue = textValue.replace(entity.regex, entity.val);
    }
  }
  return textValue;
}

function indentate(level) {
  return this.options.indentBy.repeat(level);
}

function isAttribute(name /*, options*/) {
  if (name.startsWith(this.options.attributeNamePrefix)) {
    return name.substr(this.attrPrefixLen);
  } else {
    return false;
  }
}

module.exports = Builder;


/***/ }),

/***/ 592:
/***/ ((module) => {

const EOL = "\n";

/**
 * 
 * @param {array} jArray 
 * @param {any} options 
 * @returns 
 */
function toXml(jArray, options) {
    let indentation = "";
    if (options.format && options.indentBy.length > 0) {
        indentation = EOL;
    }
    return arrToStr(jArray, options, "", indentation);
}

function arrToStr(arr, options, jPath, indentation) {
    let xmlStr = "";
    let isPreviousElementTag = false;

    for (let i = 0; i < arr.length; i++) {
        const tagObj = arr[i];
        const tagName = propName(tagObj);
        let newJPath = "";
        if (jPath.length === 0) newJPath = tagName
        else newJPath = `${jPath}.${tagName}`;

        if (tagName === options.textNodeName) {
            let tagText = tagObj[tagName];
            if (!isStopNode(newJPath, options)) {
                tagText = options.tagValueProcessor(tagName, tagText);
                tagText = replaceEntitiesValue(tagText, options);
            }
            if (isPreviousElementTag) {
                xmlStr += indentation;
            }
            xmlStr += tagText;
            isPreviousElementTag = false;
            continue;
        } else if (tagName === options.cdataPropName) {
            if (isPreviousElementTag) {
                xmlStr += indentation;
            }
            xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
            isPreviousElementTag = false;
            continue;
        } else if (tagName === options.commentPropName) {
            xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
            isPreviousElementTag = true;
            continue;
        } else if (tagName[0] === "?") {
            const attStr = attr_to_str(tagObj[":@"], options);
            const tempInd = tagName === "?xml" ? "" : indentation;
            let piTextNodeName = tagObj[tagName][0][options.textNodeName];
            piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : ""; //remove extra spacing
            xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr}?>`;
            isPreviousElementTag = true;
            continue;
        }
        let newIdentation = indentation;
        if (newIdentation !== "") {
            newIdentation += options.indentBy;
        }
        const attStr = attr_to_str(tagObj[":@"], options);
        const tagStart = indentation + `<${tagName}${attStr}`;
        const tagValue = arrToStr(tagObj[tagName], options, newJPath, newIdentation);
        if (options.unpairedTags.indexOf(tagName) !== -1) {
            if (options.suppressUnpairedNode) xmlStr += tagStart + ">";
            else xmlStr += tagStart + "/>";
        } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
            xmlStr += tagStart + "/>";
        } else if (tagValue && tagValue.endsWith(">")) {
            xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
        } else {
            xmlStr += tagStart + ">";
            if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
                xmlStr += indentation + options.indentBy + tagValue + indentation;
            } else {
                xmlStr += tagValue;
            }
            xmlStr += `</${tagName}>`;
        }
        isPreviousElementTag = true;
    }

    return xmlStr;
}

function propName(obj) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key !== ":@") return key;
    }
}

function attr_to_str(attrMap, options) {
    let attrStr = "";
    if (attrMap && !options.ignoreAttributes) {
        for (let attr in attrMap) {
            let attrVal = options.attributeValueProcessor(attr, attrMap[attr]);
            attrVal = replaceEntitiesValue(attrVal, options);
            if (attrVal === true && options.suppressBooleanAttributes) {
                attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
            } else {
                attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
            }
        }
    }
    return attrStr;
}

function isStopNode(jPath, options) {
    jPath = jPath.substr(0, jPath.length - options.textNodeName.length - 1);
    let tagName = jPath.substr(jPath.lastIndexOf(".") + 1);
    for (let index in options.stopNodes) {
        if (options.stopNodes[index] === jPath || options.stopNodes[index] === "*." + tagName) return true;
    }
    return false;
}

function replaceEntitiesValue(textValue, options) {
    if (textValue && textValue.length > 0 && options.processEntities) {
        for (let i = 0; i < options.entities.length; i++) {
            const entity = options.entities[i];
            textValue = textValue.replace(entity.regex, entity.val);
        }
    }
    return textValue;
}
module.exports = toXml;


/***/ }),

/***/ 780:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const util = __webpack_require__(849);

//TODO: handle comments
function readDocType(xmlData, i){
    
    const entities = {};
    if( xmlData[i + 3] === 'O' &&
         xmlData[i + 4] === 'C' &&
         xmlData[i + 5] === 'T' &&
         xmlData[i + 6] === 'Y' &&
         xmlData[i + 7] === 'P' &&
         xmlData[i + 8] === 'E')
    {    
        i = i+9;
        let angleBracketsCount = 1;
        let hasBody = false, comment = false;
        let exp = "";
        for(;i<xmlData.length;i++){
            if (xmlData[i] === '<' && !comment) { //Determine the tag type
                if( hasBody && isEntity(xmlData, i)){
                    i += 7; 
                    [entityName, val,i] = readEntityExp(xmlData,i+1);
                    if(val.indexOf("&") === -1) //Parameter entities are not supported
                        entities[ validateEntityName(entityName) ] = {
                            regx : RegExp( `&${entityName};`,"g"),
                            val: val
                        };
                }
                else if( hasBody && isElement(xmlData, i))  i += 8;//Not supported
                else if( hasBody && isAttlist(xmlData, i))  i += 8;//Not supported
                else if( hasBody && isNotation(xmlData, i)) i += 9;//Not supported
                else if( isComment)                         comment = true;
                else                                        throw new Error("Invalid DOCTYPE");

                angleBracketsCount++;
                exp = "";
            } else if (xmlData[i] === '>') { //Read tag content
                if(comment){
                    if( xmlData[i - 1] === "-" && xmlData[i - 2] === "-"){
                        comment = false;
                        angleBracketsCount--;
                    }
                }else{
                    angleBracketsCount--;
                }
                if (angleBracketsCount === 0) {
                  break;
                }
            }else if( xmlData[i] === '['){
                hasBody = true;
            }else{
                exp += xmlData[i];
            }
        }
        if(angleBracketsCount !== 0){
            throw new Error(`Unclosed DOCTYPE`);
        }
    }else{
        throw new Error(`Invalid Tag instead of DOCTYPE`);
    }
    return {entities, i};
}

function readEntityExp(xmlData,i){
    //External entities are not supported
    //    <!ENTITY ext SYSTEM "http://normal-website.com" >

    //Parameter entities are not supported
    //    <!ENTITY entityname "&anotherElement;">

    //Internal entities are supported
    //    <!ENTITY entityname "replacement text">
    
    //read EntityName
    let entityName = "";
    for (; i < xmlData.length && (xmlData[i] !== "'" && xmlData[i] !== '"' ); i++) {
        // if(xmlData[i] === " ") continue;
        // else 
        entityName += xmlData[i];
    }
    entityName = entityName.trim();
    if(entityName.indexOf(" ") !== -1) throw new Error("External entites are not supported");

    //read Entity Value
    const startChar = xmlData[i++];
    let val = ""
    for (; i < xmlData.length && xmlData[i] !== startChar ; i++) {
        val += xmlData[i];
    }
    return [entityName, val, i];
}

function isComment(xmlData, i){
    if(xmlData[i+1] === '!' &&
    xmlData[i+2] === '-' &&
    xmlData[i+3] === '-') return true
    return false
}
function isEntity(xmlData, i){
    if(xmlData[i+1] === '!' &&
    xmlData[i+2] === 'E' &&
    xmlData[i+3] === 'N' &&
    xmlData[i+4] === 'T' &&
    xmlData[i+5] === 'I' &&
    xmlData[i+6] === 'T' &&
    xmlData[i+7] === 'Y') return true
    return false
}
function isElement(xmlData, i){
    if(xmlData[i+1] === '!' &&
    xmlData[i+2] === 'E' &&
    xmlData[i+3] === 'L' &&
    xmlData[i+4] === 'E' &&
    xmlData[i+5] === 'M' &&
    xmlData[i+6] === 'E' &&
    xmlData[i+7] === 'N' &&
    xmlData[i+8] === 'T') return true
    return false
}

function isAttlist(xmlData, i){
    if(xmlData[i+1] === '!' &&
    xmlData[i+2] === 'A' &&
    xmlData[i+3] === 'T' &&
    xmlData[i+4] === 'T' &&
    xmlData[i+5] === 'L' &&
    xmlData[i+6] === 'I' &&
    xmlData[i+7] === 'S' &&
    xmlData[i+8] === 'T') return true
    return false
}
function isNotation(xmlData, i){
    if(xmlData[i+1] === '!' &&
    xmlData[i+2] === 'N' &&
    xmlData[i+3] === 'O' &&
    xmlData[i+4] === 'T' &&
    xmlData[i+5] === 'A' &&
    xmlData[i+6] === 'T' &&
    xmlData[i+7] === 'I' &&
    xmlData[i+8] === 'O' &&
    xmlData[i+9] === 'N') return true
    return false
}

function validateEntityName(name){
    if (util.isName(name))
	return name;
    else
        throw new Error(`Invalid entity name ${name}`);
}

module.exports = readDocType;


/***/ }),

/***/ 745:
/***/ ((__unused_webpack_module, exports) => {


const defaultOptions = {
    preserveOrder: false,
    attributeNamePrefix: '@_',
    attributesGroupName: false,
    textNodeName: '#text',
    ignoreAttributes: true,
    removeNSPrefix: false, // remove NS from tag name or attribute name if true
    allowBooleanAttributes: false, //a tag can have attributes without any value
    //ignoreRootElement : false,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true, //Trim string values of tag and attributes
    cdataPropName: false,
    numberParseOptions: {
      hex: true,
      leadingZeros: true,
      eNotation: true
    },
    tagValueProcessor: function(tagName, val) {
      return val;
    },
    attributeValueProcessor: function(attrName, val) {
      return val;
    },
    stopNodes: [], //nested tags will not be parsed even for errors
    alwaysCreateTextNode: false,
    isArray: () => false,
    commentPropName: false,
    unpairedTags: [],
    processEntities: true,
    htmlEntities: false,
    ignoreDeclaration: false,
    ignorePiTags: false,
    transformTagName: false,
    transformAttributeName: false,
    updateTag: function(tagName, jPath, attrs){
      return tagName
    },
    // skipEmptyListItem: false
};
   
const buildOptions = function(options) {
    return Object.assign({}, defaultOptions, options);
};

exports.buildOptions = buildOptions;
exports.defaultOptions = defaultOptions;

/***/ }),

/***/ 78:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

///@ts-check

const util = __webpack_require__(849);
const xmlNode = __webpack_require__(311);
const readDocType = __webpack_require__(780);
const toNumber = __webpack_require__(153);

const regx =
  '<((!\\[CDATA\\[([\\s\\S]*?)(]]>))|((NAME:)?(NAME))([^>]*)>|((\\/)(NAME)\\s*>))([^<]*)'
  .replace(/NAME/g, util.nameRegexp);

//const tagsRegx = new RegExp("<(\\/?[\\w:\\-\._]+)([^>]*)>(\\s*"+cdataRegx+")*([^<]+)?","g");
//const tagsRegx = new RegExp("<(\\/?)((\\w*:)?([\\w:\\-\._]+))([^>]*)>([^<]*)("+cdataRegx+"([^<]*))*([^<]+)?","g");

class OrderedObjParser{
  constructor(options){
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.docTypeEntities = {};
    this.lastEntities = {
      "apos" : { regex: /&(apos|#39|#x27);/g, val : "'"},
      "gt" : { regex: /&(gt|#62|#x3E);/g, val : ">"},
      "lt" : { regex: /&(lt|#60|#x3C);/g, val : "<"},
      "quot" : { regex: /&(quot|#34|#x22);/g, val : "\""},
    };
    this.ampEntity = { regex: /&(amp|#38|#x26);/g, val : "&"};
    this.htmlEntities = {
      "space": { regex: /&(nbsp|#160);/g, val: " " },
      // "lt" : { regex: /&(lt|#60);/g, val: "<" },
      // "gt" : { regex: /&(gt|#62);/g, val: ">" },
      // "amp" : { regex: /&(amp|#38);/g, val: "&" },
      // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
      // "apos" : { regex: /&(apos|#39);/g, val: "'" },
      "cent" : { regex: /&(cent|#162);/g, val: "¢" },
      "pound" : { regex: /&(pound|#163);/g, val: "£" },
      "yen" : { regex: /&(yen|#165);/g, val: "¥" },
      "euro" : { regex: /&(euro|#8364);/g, val: "€" },
      "copyright" : { regex: /&(copy|#169);/g, val: "©" },
      "reg" : { regex: /&(reg|#174);/g, val: "®" },
      "inr" : { regex: /&(inr|#8377);/g, val: "₹" },
    };
    this.addExternalEntities = addExternalEntities;
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
  }

}

function addExternalEntities(externalEntities){
  const entKeys = Object.keys(externalEntities);
  for (let i = 0; i < entKeys.length; i++) {
    const ent = entKeys[i];
    this.lastEntities[ent] = {
       regex: new RegExp("&"+ent+";","g"),
       val : externalEntities[ent]
    }
  }
}

/**
 * @param {string} val
 * @param {string} tagName
 * @param {string} jPath
 * @param {boolean} dontTrim
 * @param {boolean} hasAttributes
 * @param {boolean} isLeafNode
 * @param {boolean} escapeEntities
 */
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  if (val !== undefined) {
    if (this.options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if(val.length > 0){
      if(!escapeEntities) val = this.replaceEntitiesValue(val);
      
      const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
      if(newval === null || newval === undefined){
        //don't parse
        return val;
      }else if(typeof newval !== typeof val || newval !== val){
        //overwrite
        return newval;
      }else if(this.options.trimValues){
        return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
      }else{
        const trimmedVal = val.trim();
        if(trimmedVal === val){
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        }else{
          return val;
        }
      }
    }
  }
}

function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(':');
    const prefix = tagname.charAt(0) === '/' ? '/' : '';
    if (tags[0] === 'xmlns') {
      return '';
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}

//TODO: change regex to capture NS
//const attrsRegx = new RegExp("([\\w\\-\\.\\:]+)\\s*=\\s*(['\"])((.|\n)*?)\\2","gm");
const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])([\\s\\S]*?)\\3)?', 'gm');

function buildAttributesMap(attrStr, jPath, tagName) {
  if (!this.options.ignoreAttributes && typeof attrStr === 'string') {
    // attrStr = attrStr.replace(/\r?\n/g, ' ');
    //attrStr = attrStr || attrStr.trim();

    const matches = util.getAllMatches(attrStr, attrsRegx);
    const len = matches.length; //don't make it inline
    const attrs = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      let oldVal = matches[i][4];
      let aName = this.options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (this.options.transformAttributeName) {
          aName = this.options.transformAttributeName(aName);
        }
        if(aName === "__proto__") aName  = "#__proto__";
        if (oldVal !== undefined) {
          if (this.options.trimValues) {
            oldVal = oldVal.trim();
          }
          oldVal = this.replaceEntitiesValue(oldVal);
          const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
          if(newVal === null || newVal === undefined){
            //don't parse
            attrs[aName] = oldVal;
          }else if(typeof newVal !== typeof oldVal || newVal !== oldVal){
            //overwrite
            attrs[aName] = newVal;
          }else{
            //parse
            attrs[aName] = parseValue(
              oldVal,
              this.options.parseAttributeValue,
              this.options.numberParseOptions
            );
          }
        } else if (this.options.allowBooleanAttributes) {
          attrs[aName] = true;
        }
      }
    }
    if (!Object.keys(attrs).length) {
      return;
    }
    if (this.options.attributesGroupName) {
      const attrCollection = {};
      attrCollection[this.options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs
  }
}

const parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n"); //TODO: remove this line
  const xmlObj = new xmlNode('!xml');
  let currentNode = xmlObj;
  let textData = "";
  let jPath = "";
  for(let i=0; i< xmlData.length; i++){//for each char in XML data
    const ch = xmlData[i];
    if(ch === '<'){
      // const nextIndex = i+1;
      // const _2ndChar = xmlData[nextIndex];
      if( xmlData[i+1] === '/') {//Closing Tag
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.")
        let tagName = xmlData.substring(i+2,closeIndex).trim();

        if(this.options.removeNSPrefix){
          const colonIndex = tagName.indexOf(":");
          if(colonIndex !== -1){
            tagName = tagName.substr(colonIndex+1);
          }
        }

        if(this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }

        if(currentNode){
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
        }

        //check if last tag of nested tag was unpaired tag
        const lastTagName = jPath.substring(jPath.lastIndexOf(".")+1);
        if(tagName && this.options.unpairedTags.indexOf(tagName) !== -1 ){
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        let propIndex = 0
        if(lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1 ){
          propIndex = jPath.lastIndexOf('.', jPath.lastIndexOf('.')-1)
          this.tagsNodeStack.pop();
        }else{
          propIndex = jPath.lastIndexOf(".");
        }
        jPath = jPath.substring(0, propIndex);

        currentNode = this.tagsNodeStack.pop();//avoid recursion, set the parent tag scope
        textData = "";
        i = closeIndex;
      } else if( xmlData[i+1] === '?') {

        let tagData = readTagExp(xmlData,i, false, "?>");
        if(!tagData) throw new Error("Pi Tag is not closed.");

        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        if( (this.options.ignoreDeclaration && tagData.tagName === "?xml") || this.options.ignorePiTags){

        }else{
  
          const childNode = new xmlNode(tagData.tagName);
          childNode.add(this.options.textNodeName, "");
          
          if(tagData.tagName !== tagData.tagExp && tagData.attrExpPresent){
            childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
          }
          this.addChild(currentNode, childNode, jPath)

        }


        i = tagData.closeIndex + 1;
      } else if(xmlData.substr(i + 1, 3) === '!--') {
        const endIndex = findClosingIndex(xmlData, "-->", i+4, "Comment is not closed.")
        if(this.options.commentPropName){
          const comment = xmlData.substring(i + 4, endIndex - 2);

          textData = this.saveTextToParentTag(textData, currentNode, jPath);

          currentNode.add(this.options.commentPropName, [ { [this.options.textNodeName] : comment } ]);
        }
        i = endIndex;
      } else if( xmlData.substr(i + 1, 2) === '!D') {
        const result = readDocType(xmlData, i);
        this.docTypeEntities = result.entities;
        i = result.i;
      }else if(xmlData.substr(i + 1, 2) === '![') {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9,closeIndex);

        textData = this.saveTextToParentTag(textData, currentNode, jPath);

        //cdata should be set even if it is 0 length string
        if(this.options.cdataPropName){
          // let val = this.parseTextData(tagExp, this.options.cdataPropName, jPath + "." + this.options.cdataPropName, true, false, true);
          // if(!val) val = "";
          currentNode.add(this.options.cdataPropName, [ { [this.options.textNodeName] : tagExp } ]);
        }else{
          let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true);
          if(val == undefined) val = "";
          currentNode.add(this.options.textNodeName, val);
        }
        
        i = closeIndex + 2;
      }else {//Opening tag
        let result = readTagExp(xmlData,i, this.options.removeNSPrefix);
        let tagName= result.tagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;

        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        
        //save text as child node
        if (currentNode && textData) {
          if(currentNode.tagname !== '!xml'){
            //when nested tag is found
            textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
          }
        }

        //check if last tag was unpaired tag
        const lastTag = currentNode;
        if(lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1 ){
          currentNode = this.tagsNodeStack.pop();
          jPath = jPath.substring(0, jPath.lastIndexOf("."));
        }
        if(tagName !== xmlObj.tagname){
          jPath += jPath ? "." + tagName : tagName;
        }
        if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) { //TODO: namespace
          let tagContent = "";
          //self-closing tag
          if(tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1){
            i = result.closeIndex;
          }
          //unpaired tag
          else if(this.options.unpairedTags.indexOf(tagName) !== -1){
            i = result.closeIndex;
          }
          //normal tag
          else{
            //read until closing tag is found
            const result = this.readStopNodeData(xmlData, tagName, closeIndex + 1);
            if(!result) throw new Error(`Unexpected end of ${tagName}`);
            i = result.i;
            tagContent = result.tagContent;
          }

          const childNode = new xmlNode(tagName);
          if(tagName !== tagExp && attrExpPresent){
            childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
          }
          if(tagContent) {
            tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
          }
          
          jPath = jPath.substr(0, jPath.lastIndexOf("."));
          childNode.add(this.options.textNodeName, tagContent);
          
          this.addChild(currentNode, childNode, jPath)
        }else{
  //selfClosing tag
          if(tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1){
            if(tagName[tagName.length - 1] === "/"){ //remove trailing '/'
              tagName = tagName.substr(0, tagName.length - 1);
              tagExp = tagName;
            }else{
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            
            if(this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }

            const childNode = new xmlNode(tagName);
            if(tagName !== tagExp && attrExpPresent){
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            this.addChild(currentNode, childNode, jPath)
            jPath = jPath.substr(0, jPath.lastIndexOf("."));
          }
    //opening tag
          else{
            const childNode = new xmlNode( tagName);
            this.tagsNodeStack.push(currentNode);
            
            if(tagName !== tagExp && attrExpPresent){
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            this.addChild(currentNode, childNode, jPath)
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    }else{
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
}

function addChild(currentNode, childNode, jPath){
  const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"])
  if(result === false){
  }else if(typeof result === "string"){
    childNode.tagname = result
    currentNode.addChild(childNode);
  }else{
    currentNode.addChild(childNode);
  }
}

const replaceEntitiesValue = function(val){

  if(this.options.processEntities){
    for(let entityName in this.docTypeEntities){
      const entity = this.docTypeEntities[entityName];
      val = val.replace( entity.regx, entity.val);
    }
    for(let entityName in this.lastEntities){
      const entity = this.lastEntities[entityName];
      val = val.replace( entity.regex, entity.val);
    }
    if(this.options.htmlEntities){
      for(let entityName in this.htmlEntities){
        const entity = this.htmlEntities[entityName];
        val = val.replace( entity.regex, entity.val);
      }
    }
    val = val.replace( this.ampEntity.regex, this.ampEntity.val);
  }
  return val;
}
function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
  if (textData) { //store previously collected data as textNode
    if(isLeafNode === undefined) isLeafNode = Object.keys(currentNode.child).length === 0
    
    textData = this.parseTextData(textData,
      currentNode.tagname,
      jPath,
      false,
      currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false,
      isLeafNode);

    if (textData !== undefined && textData !== "")
      currentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}

//TODO: use jPath to simplify the logic
/**
 * 
 * @param {string[]} stopNodes 
 * @param {string} jPath
 * @param {string} currentTagName 
 */
function isItStopNode(stopNodes, jPath, currentTagName){
  const allNodesExp = "*." + currentTagName;
  for (const stopNodePath in stopNodes) {
    const stopNodeExp = stopNodes[stopNodePath];
    if( allNodesExp === stopNodeExp || jPath === stopNodeExp  ) return true;
  }
  return false;
}

/**
 * Returns the tag Expression and where it is ending handling single-double quotes situation
 * @param {string} xmlData 
 * @param {number} i starting index
 * @returns 
 */
function tagExpWithClosingIndex(xmlData, i, closingChar = ">"){
  let attrBoundary;
  let tagExp = "";
  for (let index = i; index < xmlData.length; index++) {
    let ch = xmlData[index];
    if (attrBoundary) {
        if (ch === attrBoundary) attrBoundary = "";//reset
    } else if (ch === '"' || ch === "'") {
        attrBoundary = ch;
    } else if (ch === closingChar[0]) {
      if(closingChar[1]){
        if(xmlData[index + 1] === closingChar[1]){
          return {
            data: tagExp,
            index: index
          }
        }
      }else{
        return {
          data: tagExp,
          index: index
        }
      }
    } else if (ch === '\t') {
      ch = " "
    }
    tagExp += ch;
  }
}

function findClosingIndex(xmlData, str, i, errMsg){
  const closingIndex = xmlData.indexOf(str, i);
  if(closingIndex === -1){
    throw new Error(errMsg)
  }else{
    return closingIndex + str.length - 1;
  }
}

function readTagExp(xmlData,i, removeNSPrefix, closingChar = ">"){
  const result = tagExpWithClosingIndex(xmlData, i+1, closingChar);
  if(!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if(separatorIndex !== -1){//separate tag name and attributes expression
    tagName = tagExp.substr(0, separatorIndex).replace(/\s\s*$/, '');
    tagExp = tagExp.substr(separatorIndex + 1);
  }

  if(removeNSPrefix){
    const colonIndex = tagName.indexOf(":");
    if(colonIndex !== -1){
      tagName = tagName.substr(colonIndex+1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }

  return {
    tagName: tagName,
    tagExp: tagExp,
    closeIndex: closeIndex,
    attrExpPresent: attrExpPresent,
  }
}
/**
 * find paired tag for a stop node
 * @param {string} xmlData 
 * @param {string} tagName 
 * @param {number} i 
 */
function readStopNodeData(xmlData, tagName, i){
  const startIndex = i;
  // Starting at 1 since we already have an open tag
  let openTagCount = 1;

  for (; i < xmlData.length; i++) {
    if( xmlData[i] === "<"){ 
      if (xmlData[i+1] === "/") {//close tag
          const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
          let closeTagName = xmlData.substring(i+2,closeIndex).trim();
          if(closeTagName === tagName){
            openTagCount--;
            if (openTagCount === 0) {
              return {
                tagContent: xmlData.substring(startIndex, i),
                i : closeIndex
              }
            }
          }
          i=closeIndex;
        } else if(xmlData[i+1] === '?') { 
          const closeIndex = findClosingIndex(xmlData, "?>", i+1, "StopNode is not closed.")
          i=closeIndex;
        } else if(xmlData.substr(i + 1, 3) === '!--') { 
          const closeIndex = findClosingIndex(xmlData, "-->", i+3, "StopNode is not closed.")
          i=closeIndex;
        } else if(xmlData.substr(i + 1, 2) === '![') { 
          const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
          i=closeIndex;
        } else {
          const tagData = readTagExp(xmlData, i, '>')

          if (tagData) {
            const openTagName = tagData && tagData.tagName;
            if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length-1] !== "/") {
              openTagCount++;
            }
            i=tagData.closeIndex;
          }
        }
      }
  }//end for loop
}

function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === 'string') {
    //console.log(options)
    const newval = val.trim();
    if(newval === 'true' ) return true;
    else if(newval === 'false' ) return false;
    else return toNumber(val, options);
  } else {
    if (util.isExist(val)) {
      return val;
    } else {
      return '';
    }
  }
}


module.exports = OrderedObjParser;


/***/ }),

/***/ 844:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const { buildOptions} = __webpack_require__(745);
const OrderedObjParser = __webpack_require__(78);
const { prettify} = __webpack_require__(997);
const validator = __webpack_require__(501);

class XMLParser{
    
    constructor(options){
        this.externalEntities = {};
        this.options = buildOptions(options);
        
    }
    /**
     * Parse XML dats to JS object 
     * @param {string|Buffer} xmlData 
     * @param {boolean|Object} validationOption 
     */
    parse(xmlData,validationOption){
        if(typeof xmlData === "string"){
        }else if( xmlData.toString){
            xmlData = xmlData.toString();
        }else{
            throw new Error("XML data is accepted in String or Bytes[] form.")
        }
        if( validationOption){
            if(validationOption === true) validationOption = {}; //validate with default options
            
            const result = validator.validate(xmlData, validationOption);
            if (result !== true) {
              throw Error( `${result.err.msg}:${result.err.line}:${result.err.col}` )
            }
          }
        const orderedObjParser = new OrderedObjParser(this.options);
        orderedObjParser.addExternalEntities(this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if(this.options.preserveOrder || orderedResult === undefined) return orderedResult;
        else return prettify(orderedResult, this.options);
    }

    /**
     * Add Entity which is not by default supported by this library
     * @param {string} key 
     * @param {string} value 
     */
    addEntity(key, value){
        if(value.indexOf("&") !== -1){
            throw new Error("Entity value can't have '&'")
        }else if(key.indexOf("&") !== -1 || key.indexOf(";") !== -1){
            throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'")
        }else if(value === "&"){
            throw new Error("An entity with value '&' is not permitted");
        }else{
            this.externalEntities[key] = value;
        }
    }
}

module.exports = XMLParser;

/***/ }),

/***/ 997:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


/**
 * 
 * @param {array} node 
 * @param {any} options 
 * @returns 
 */
function prettify(node, options){
  return compress( node, options);
}

/**
 * 
 * @param {array} arr 
 * @param {object} options 
 * @param {string} jPath 
 * @returns object
 */
function compress(arr, options, jPath){
  let text;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    let newJpath = "";
    if(jPath === undefined) newJpath = property;
    else newJpath = jPath + "." + property;

    if(property === options.textNodeName){
      if(text === undefined) text = tagObj[property];
      else text += "" + tagObj[property];
    }else if(property === undefined){
      continue;
    }else if(tagObj[property]){
      
      let val = compress(tagObj[property], options, newJpath);
      const isLeaf = isLeafTag(val, options);

      if(tagObj[":@"]){
        assignAttributes( val, tagObj[":@"], newJpath, options);
      }else if(Object.keys(val).length === 1 && val[options.textNodeName] !== undefined && !options.alwaysCreateTextNode){
        val = val[options.textNodeName];
      }else if(Object.keys(val).length === 0){
        if(options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }

      if(compressedObj[property] !== undefined && compressedObj.hasOwnProperty(property)) {
        if(!Array.isArray(compressedObj[property])) {
            compressedObj[property] = [ compressedObj[property] ];
        }
        compressedObj[property].push(val);
      }else{
        //TODO: if a node is not an array, then check if it should be an array
        //also determine if it is a leaf node
        if (options.isArray(property, newJpath, isLeaf )) {
          compressedObj[property] = [val];
        }else{
          compressedObj[property] = val;
        }
      }
    }
    
  }
  // if(text && text.length > 0) compressedObj[options.textNodeName] = text;
  if(typeof text === "string"){
    if(text.length > 0) compressedObj[options.textNodeName] = text;
  }else if(text !== undefined) compressedObj[options.textNodeName] = text;
  return compressedObj;
}

function propName(obj){
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if(key !== ":@") return key;
  }
}

function assignAttributes(obj, attrMap, jpath, options){
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length; //don't make it inline
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
        obj[atrrName] = [ attrMap[atrrName] ];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}

function isLeafTag(obj, options){
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  
  if (propCount === 0) {
    return true;
  }

  if (
    propCount === 1 &&
    (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)
  ) {
    return true;
  }

  return false;
}
exports.prettify = prettify;


/***/ }),

/***/ 311:
/***/ ((module) => {

"use strict";


class XmlNode{
  constructor(tagname) {
    this.tagname = tagname;
    this.child = []; //nested tags, text, cdata, comments in order
    this[":@"] = {}; //attributes map
  }
  add(key,val){
    // this.child.push( {name : key, val: val, isCdata: isCdata });
    if(key === "__proto__") key = "#__proto__";
    this.child.push( {[key]: val });
  }
  addChild(node) {
    if(node.tagname === "__proto__") node.tagname = "#__proto__";
    if(node[":@"] && Object.keys(node[":@"]).length > 0){
      this.child.push( { [node.tagname]: node.child, [":@"]: node[":@"] });
    }else{
      this.child.push( { [node.tagname]: node.child });
    }
  };
};


module.exports = XmlNode;

/***/ }),

/***/ 153:
/***/ ((module) => {

const hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
const numRegex = /^([\-\+])?(0*)(\.[0-9]+([eE]\-?[0-9]+)?|[0-9]+(\.[0-9]+([eE]\-?[0-9]+)?)?)$/;
// const octRegex = /0x[a-z0-9]+/;
// const binRegex = /0x[a-z0-9]+/;


//polyfill
if (!Number.parseInt && window.parseInt) {
    Number.parseInt = window.parseInt;
}
if (!Number.parseFloat && window.parseFloat) {
    Number.parseFloat = window.parseFloat;
}

  
const consider = {
    hex :  true,
    leadingZeros: true,
    decimalPoint: "\.",
    eNotation: true
    //skipLike: /regex/
};

function toNumber(str, options = {}){
    // const options = Object.assign({}, consider);
    // if(opt.leadingZeros === false){
    //     options.leadingZeros = false;
    // }else if(opt.hex === false){
    //     options.hex = false;
    // }

    options = Object.assign({}, consider, options );
    if(!str || typeof str !== "string" ) return str;
    
    let trimmedStr  = str.trim();
    // if(trimmedStr === "0.0") return 0;
    // else if(trimmedStr === "+0.0") return 0;
    // else if(trimmedStr === "-0.0") return -0;

    if(options.skipLike !== undefined && options.skipLike.test(trimmedStr)) return str;
    else if (options.hex && hexRegex.test(trimmedStr)) {
        return Number.parseInt(trimmedStr, 16);
    // } else if (options.parseOct && octRegex.test(str)) {
    //     return Number.parseInt(val, 8);
    // }else if (options.parseBin && binRegex.test(str)) {
    //     return Number.parseInt(val, 2);
    }else{
        //separate negative sign, leading zeros, and rest number
        const match = numRegex.exec(trimmedStr);
        if(match){
            const sign = match[1];
            const leadingZeros = match[2];
            let numTrimmedByZeros = trimZeros(match[3]); //complete num without leading zeros
            //trim ending zeros for floating number
            
            const eNotation = match[4] || match[6];
            if(!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".") return str; //-0123
            else if(!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".") return str; //0123
            else{//no leading zeros or leading zeros are allowed
                const num = Number(trimmedStr);
                const numStr = "" + num;
                if(numStr.search(/[eE]/) !== -1){ //given number is long and parsed to eNotation
                    if(options.eNotation) return num;
                    else return str;
                }else if(eNotation){ //given number has enotation
                    if(options.eNotation) return num;
                    else return str;
                }else if(trimmedStr.indexOf(".") !== -1){ //floating number
                    // const decimalPart = match[5].substr(1);
                    // const intPart = trimmedStr.substr(0,trimmedStr.indexOf("."));

                    
                    // const p = numStr.indexOf(".");
                    // const givenIntPart = numStr.substr(0,p);
                    // const givenDecPart = numStr.substr(p+1);
                    if(numStr === "0" && (numTrimmedByZeros === "") ) return num; //0.0
                    else if(numStr === numTrimmedByZeros) return num; //0.456. 0.79000
                    else if( sign && numStr === "-"+numTrimmedByZeros) return num;
                    else return str;
                }
                
                if(leadingZeros){
                    // if(numTrimmedByZeros === numStr){
                    //     if(options.leadingZeros) return num;
                    //     else return str;
                    // }else return str;
                    if(numTrimmedByZeros === numStr) return num;
                    else if(sign+numTrimmedByZeros === numStr) return num;
                    else return str;
                }

                if(trimmedStr === numStr) return num;
                else if(trimmedStr === sign+numStr) return num;
                // else{
                //     //number with +/- sign
                //     trimmedStr.test(/[-+][0-9]);

                // }
                return str;
            }
            // else if(!eNotation && trimmedStr && trimmedStr !== Number(trimmedStr) ) return str;
            
        }else{ //non-numeric string
            return str;
        }
    }
}

/**
 * 
 * @param {string} numStr without leading zeros
 * @returns 
 */
function trimZeros(numStr){
    if(numStr && numStr.indexOf(".") !== -1){//float
        numStr = numStr.replace(/0+$/, ""); //remove ending zeros
        if(numStr === ".")  numStr = "0";
        else if(numStr[0] === ".")  numStr = "0"+numStr;
        else if(numStr[numStr.length-1] === ".")  numStr = numStr.substr(0,numStr.length-1);
        return numStr;
    }
    return numStr;
}
module.exports = toNumber


/***/ }),

/***/ 300:
/***/ ((module) => {

"use strict";
module.exports = require("buffer");

/***/ }),

/***/ 891:
/***/ ((module) => {

"use strict";
module.exports = require("dgram");

/***/ }),

/***/ 526:
/***/ ((module, exports) => {

var __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;// GENERATED FILE. DO NOT EDIT.
var ipCodec = (function(exports) {
  "use strict";
  
  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.decode = decode;
  exports.encode = encode;
  exports.familyOf = familyOf;
  exports.name = void 0;
  exports.sizeOf = sizeOf;
  exports.v6 = exports.v4 = void 0;
  const v4Regex = /^(\d{1,3}\.){3,3}\d{1,3}$/;
  const v4Size = 4;
  const v6Regex = /^(::)?(((\d{1,3}\.){3}(\d{1,3}){1})?([0-9a-f]){0,4}:{0,2}){1,8}(::)?$/i;
  const v6Size = 16;
  const v4 = {
    name: 'v4',
    size: v4Size,
    isFormat: ip => v4Regex.test(ip),
  
    encode(ip, buff, offset) {
      offset = ~~offset;
      buff = buff || new Uint8Array(offset + v4Size);
      const max = ip.length;
      let n = 0;
  
      for (let i = 0; i < max;) {
        const c = ip.charCodeAt(i++);
  
        if (c === 46) {
          // "."
          buff[offset++] = n;
          n = 0;
        } else {
          n = n * 10 + (c - 48);
        }
      }
  
      buff[offset] = n;
      return buff;
    },
  
    decode(buff, offset) {
      offset = ~~offset;
      return `${buff[offset++]}.${buff[offset++]}.${buff[offset++]}.${buff[offset]}`;
    }
  
  };
  exports.v4 = v4;
  const v6 = {
    name: 'v6',
    size: v6Size,
    isFormat: ip => ip.length > 0 && v6Regex.test(ip),
  
    encode(ip, buff, offset) {
      offset = ~~offset;
      let end = offset + v6Size;
      let fill = -1;
      let hexN = 0;
      let decN = 0;
      let prevColon = true;
      let useDec = false;
      buff = buff || new Uint8Array(offset + v6Size); // Note: This algorithm needs to check if the offset
      // could exceed the buffer boundaries as it supports
      // non-standard compliant encodings that may go beyond
      // the boundary limits. if (offset < end) checks should
      // not be necessary...
  
      for (let i = 0; i < ip.length; i++) {
        let c = ip.charCodeAt(i);
  
        if (c === 58) {
          // :
          if (prevColon) {
            if (fill !== -1) {
              // Not Standard! (standard doesn't allow multiple ::)
              // We need to treat
              if (offset < end) buff[offset] = 0;
              if (offset < end - 1) buff[offset + 1] = 0;
              offset += 2;
            } else if (offset < end) {
              // :: in the middle
              fill = offset;
            }
          } else {
            // : ends the previous number
            if (useDec === true) {
              // Non-standard! (ipv4 should be at end only)
              // A ipv4 address should not be found anywhere else but at
              // the end. This codec also support putting characters
              // after the ipv4 address..
              if (offset < end) buff[offset] = decN;
              offset++;
            } else {
              if (offset < end) buff[offset] = hexN >> 8;
              if (offset < end - 1) buff[offset + 1] = hexN & 0xff;
              offset += 2;
            }
  
            hexN = 0;
            decN = 0;
          }
  
          prevColon = true;
          useDec = false;
        } else if (c === 46) {
          // . indicates IPV4 notation
          if (offset < end) buff[offset] = decN;
          offset++;
          decN = 0;
          hexN = 0;
          prevColon = false;
          useDec = true;
        } else {
          prevColon = false;
  
          if (c >= 97) {
            c -= 87; // a-f ... 97~102 -87 => 10~15
          } else if (c >= 65) {
            c -= 55; // A-F ... 65~70 -55 => 10~15
          } else {
            c -= 48; // 0-9 ... starting from charCode 48
  
            decN = decN * 10 + c;
          } // We don't know yet if its a dec or hex number
  
  
          hexN = (hexN << 4) + c;
        }
      }
  
      if (prevColon === false) {
        // Commiting last number
        if (useDec === true) {
          if (offset < end) buff[offset] = decN;
          offset++;
        } else {
          if (offset < end) buff[offset] = hexN >> 8;
          if (offset < end - 1) buff[offset + 1] = hexN & 0xff;
          offset += 2;
        }
      } else if (fill === 0) {
        // Not Standard! (standard doesn't allow multiple ::)
        // This means that a : was found at the start AND end which means the
        // end needs to be treated as 0 entry...
        if (offset < end) buff[offset] = 0;
        if (offset < end - 1) buff[offset + 1] = 0;
        offset += 2;
      } else if (fill !== -1) {
        // Non-standard! (standard doens't allow multiple ::)
        // Here we find that there has been a :: somewhere in the middle
        // and the end. To treat the end with priority we need to move all
        // written data two bytes to the right.
        offset += 2;
  
        for (let i = Math.min(offset - 1, end - 1); i >= fill + 2; i--) {
          buff[i] = buff[i - 2];
        }
  
        buff[fill] = 0;
        buff[fill + 1] = 0;
        fill = offset;
      }
  
      if (fill !== offset && fill !== -1) {
        // Move the written numbers to the end while filling the everything
        // "fill" to the bytes with zeros.
        if (offset > end - 2) {
          // Non Standard support, when the cursor exceeds bounds.
          offset = end - 2;
        }
  
        while (end > fill) {
          buff[--end] = offset < end && offset > fill ? buff[--offset] : 0;
        }
      } else {
        // Fill the rest with zeros
        while (offset < end) {
          buff[offset++] = 0;
        }
      }
  
      return buff;
    },
  
    decode(buff, offset) {
      offset = ~~offset;
      let result = '';
  
      for (let i = 0; i < v6Size; i += 2) {
        if (i !== 0) {
          result += ':';
        }
  
        result += (buff[offset + i] << 8 | buff[offset + i + 1]).toString(16);
      }
  
      return result.replace(/(^|:)0(:0)*:0(:|$)/, '$1::$3').replace(/:{3,4}/, '::');
    }
  
  };
  exports.v6 = v6;
  const name = 'ip';
  exports.name = name;
  
  function sizeOf(ip) {
    if (v4.isFormat(ip)) return v4.size;
    if (v6.isFormat(ip)) return v6.size;
    throw Error(`Invalid ip address: ${ip}`);
  }
  
  function familyOf(string) {
    return sizeOf(string) === v4.size ? 1 : 2;
  }
  
  function encode(ip, buff, offset) {
    offset = ~~offset;
    const size = sizeOf(ip);
  
    if (typeof buff === 'function') {
      buff = buff(offset + size);
    }
  
    if (size === v4.size) {
      return v4.encode(ip, buff, offset);
    }
  
    return v6.encode(ip, buff, offset);
  }
  
  function decode(buff, offset, length) {
    offset = ~~offset;
    length = length || buff.length - offset;
  
    if (length === v4.size) {
      return v4.decode(buff, offset, length);
    }
  
    if (length === v6.size) {
      return v6.decode(buff, offset, length);
    }
  
    throw Error(`Invalid buffer size needs to be ${v4.size} for v4 or ${v6.size} for v6.`);
  }
  return "default" in exports ? exports.default : exports;
})({});
if (true) !(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_RESULT__ = (function() { return ipCodec; }).apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__),
		__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
else {}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(10);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;