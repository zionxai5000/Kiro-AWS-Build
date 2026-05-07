"use strict";
/**
 * ZionX App Factory — Gate Checks
 *
 * Implements all Gate checks required before app submission:
 * - Metadata validation (title, description, keywords, category)
 * - Subscription compliance (EULA link, privacy policy in-app)
 * - IAP sandbox testing verification
 * - Screenshot verification (correct dimensions, all required sizes)
 * - Privacy policy presence and URL validation
 * - EULA link verification
 *
 * Each gate returns a GateResult with pass/fail and details.
 *
 * Requirements: 11.2, 11.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUIRED_ANDROID_SCREENSHOTS = exports.REQUIRED_IOS_SCREENSHOTS = void 0;
exports.checkMetadata = checkMetadata;
exports.checkSubscriptionCompliance = checkSubscriptionCompliance;
exports.checkIAPSandbox = checkIAPSandbox;
exports.checkScreenshots = checkScreenshots;
exports.checkPrivacyPolicy = checkPrivacyPolicy;
exports.checkEULA = checkEULA;
exports.runAllGates = runAllGates;
// ---------------------------------------------------------------------------
// Required Screenshot Dimensions
// ---------------------------------------------------------------------------
exports.REQUIRED_IOS_SCREENSHOTS = [
    { deviceType: 'iPhone 6.7"', width: 1290, height: 2796 },
    { deviceType: 'iPhone 6.5"', width: 1284, height: 2778 },
    { deviceType: 'iPad Pro 12.9"', width: 2048, height: 2732 },
];
exports.REQUIRED_ANDROID_SCREENSHOTS = [
    { deviceType: 'Phone', width: 1080, height: 1920 },
    { deviceType: 'Tablet 7"', width: 1200, height: 1920 },
    { deviceType: 'Tablet 10"', width: 1600, height: 2560 },
];
// ---------------------------------------------------------------------------
// Gate Check Implementations
// ---------------------------------------------------------------------------
/**
 * Validate app metadata: title, description, keywords, and category must be present.
 */
function checkMetadata(metadata) {
    const issues = [];
    if (!metadata.title || metadata.title.trim().length === 0) {
        issues.push('Title is required');
    }
    else if (metadata.title.length > 30) {
        issues.push('Title must be 30 characters or fewer');
    }
    if (!metadata.description || metadata.description.trim().length === 0) {
        issues.push('Description is required');
    }
    else if (metadata.description.length < 10) {
        issues.push('Description must be at least 10 characters');
    }
    if (!metadata.keywords || metadata.keywords.length === 0) {
        issues.push('At least one keyword is required');
    }
    if (!metadata.category || metadata.category.trim().length === 0) {
        issues.push('Category is required');
    }
    return {
        gateId: 'gate-metadata',
        gateName: 'Metadata Validation',
        passed: issues.length === 0,
        details: issues.length === 0
            ? 'All metadata fields are valid'
            : `Metadata issues: ${issues.join('; ')}`,
    };
}
/**
 * Validate subscription compliance: EULA link and privacy policy in-app are required
 * when the app has subscriptions.
 */
function checkSubscriptionCompliance(subscription) {
    const issues = [];
    if (subscription.hasSubscriptions) {
        if (!subscription.eulaLink || subscription.eulaLink.trim().length === 0) {
            issues.push('EULA link is required for apps with subscriptions');
        }
        if (!subscription.privacyPolicyInApp) {
            issues.push('Privacy policy must be accessible in-app for apps with subscriptions');
        }
    }
    return {
        gateId: 'gate-subscription',
        gateName: 'Subscription Compliance',
        passed: issues.length === 0,
        details: issues.length === 0
            ? 'Subscription compliance checks passed'
            : `Subscription compliance issues: ${issues.join('; ')}`,
    };
}
/**
 * Verify IAP sandbox testing has been completed.
 */
function checkIAPSandbox(sandboxResult) {
    const issues = [];
    if (!sandboxResult.tested) {
        issues.push('IAP sandbox testing has not been performed');
    }
    if (!sandboxResult.purchaseFlowVerified) {
        issues.push('Purchase flow has not been verified in sandbox');
    }
    if (!sandboxResult.restoreFlowVerified) {
        issues.push('Restore purchases flow has not been verified in sandbox');
    }
    if (!sandboxResult.sandboxAccountUsed) {
        issues.push('Sandbox test account was not used');
    }
    return {
        gateId: 'gate-iap-sandbox',
        gateName: 'IAP Sandbox Testing',
        passed: issues.length === 0,
        details: issues.length === 0
            ? 'IAP sandbox testing verified successfully'
            : `IAP sandbox issues: ${issues.join('; ')}`,
    };
}
/**
 * Verify screenshots have correct dimensions and all required sizes are present.
 */
function checkScreenshots(screenshotInfo, platform) {
    const issues = [];
    const requiredSizes = platform === 'ios' ? exports.REQUIRED_IOS_SCREENSHOTS : exports.REQUIRED_ANDROID_SCREENSHOTS;
    if (!screenshotInfo.screenshots || screenshotInfo.screenshots.length === 0) {
        return {
            gateId: 'gate-screenshots',
            gateName: 'Screenshot Verification',
            passed: false,
            details: 'No screenshots provided',
        };
    }
    for (const required of requiredSizes) {
        const match = screenshotInfo.screenshots.find((s) => s.deviceType === required.deviceType &&
            s.width === required.width &&
            s.height === required.height);
        if (!match) {
            issues.push(`Missing screenshots for ${required.deviceType} (${required.width}x${required.height})`);
        }
        else if (match.count < 1) {
            issues.push(`At least 1 screenshot required for ${required.deviceType}`);
        }
    }
    // Validate dimensions of provided screenshots
    for (const screenshot of screenshotInfo.screenshots) {
        if (screenshot.width <= 0 || screenshot.height <= 0) {
            issues.push(`Invalid dimensions for ${screenshot.deviceType}: ${screenshot.width}x${screenshot.height}`);
        }
    }
    return {
        gateId: 'gate-screenshots',
        gateName: 'Screenshot Verification',
        passed: issues.length === 0,
        details: issues.length === 0
            ? 'All required screenshots present with correct dimensions'
            : `Screenshot issues: ${issues.join('; ')}`,
    };
}
/**
 * Verify privacy policy is present and has a valid URL.
 */
function checkPrivacyPolicy(privacyPolicy) {
    const issues = [];
    if (!privacyPolicy.url || privacyPolicy.url.trim().length === 0) {
        issues.push('Privacy policy URL is required');
    }
    else if (!isValidUrl(privacyPolicy.url)) {
        issues.push('Privacy policy URL is not a valid HTTPS URL');
    }
    if (!privacyPolicy.inAppAccessible) {
        issues.push('Privacy policy must be accessible within the app');
    }
    return {
        gateId: 'gate-privacy-policy',
        gateName: 'Privacy Policy Presence',
        passed: issues.length === 0,
        details: issues.length === 0
            ? 'Privacy policy is present and accessible'
            : `Privacy policy issues: ${issues.join('; ')}`,
    };
}
/**
 * Verify EULA link is present and valid.
 */
function checkEULA(eulaInfo) {
    const issues = [];
    if (!eulaInfo.url || eulaInfo.url.trim().length === 0) {
        issues.push('EULA URL is required');
    }
    else if (!isValidUrl(eulaInfo.url)) {
        issues.push('EULA URL is not a valid HTTPS URL');
    }
    if (!eulaInfo.linkedInMetadata) {
        issues.push('EULA must be linked in app store metadata');
    }
    return {
        gateId: 'gate-eula',
        gateName: 'EULA Link Verification',
        passed: issues.length === 0,
        details: issues.length === 0
            ? 'EULA link is valid and linked in metadata'
            : `EULA issues: ${issues.join('; ')}`,
    };
}
/**
 * Run all gate checks and return aggregated results.
 * If any gate fails, allPassed is false and failedGates lists the failing gate IDs.
 */
function runAllGates(inputs) {
    const results = [
        checkMetadata(inputs.metadata),
        checkSubscriptionCompliance(inputs.subscription),
        checkIAPSandbox(inputs.iapSandbox),
        checkScreenshots(inputs.screenshots, inputs.platform),
        checkPrivacyPolicy(inputs.privacyPolicy),
        checkEULA(inputs.eula),
    ];
    const failedGates = results
        .filter((r) => !r.passed)
        .map((r) => r.gateId);
    return {
        results,
        allPassed: failedGates.length === 0,
        failedGates,
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:';
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=gates.js.map