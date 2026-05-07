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
import type { GateResult } from '@seraphim/core';
export interface AppMetadata {
    title?: string;
    description?: string;
    keywords?: string[];
    category?: string;
    primaryLocale?: string;
    subtitle?: string;
}
export interface SubscriptionInfo {
    eulaLink?: string;
    privacyPolicyInApp?: boolean;
    hasSubscriptions?: boolean;
    subscriptionGroupId?: string;
}
export interface IAPSandboxResult {
    tested?: boolean;
    purchaseFlowVerified?: boolean;
    restoreFlowVerified?: boolean;
    sandboxAccountUsed?: boolean;
}
export interface ScreenshotSet {
    deviceType: string;
    width: number;
    height: number;
    count: number;
}
export interface ScreenshotInfo {
    screenshots: ScreenshotSet[];
}
export interface PrivacyPolicyInfo {
    url?: string;
    inAppAccessible?: boolean;
}
export interface EULAInfo {
    url?: string;
    linkedInMetadata?: boolean;
}
export declare const REQUIRED_IOS_SCREENSHOTS: {
    deviceType: string;
    width: number;
    height: number;
}[];
export declare const REQUIRED_ANDROID_SCREENSHOTS: {
    deviceType: string;
    width: number;
    height: number;
}[];
/**
 * Validate app metadata: title, description, keywords, and category must be present.
 */
export declare function checkMetadata(metadata: AppMetadata): GateResult;
/**
 * Validate subscription compliance: EULA link and privacy policy in-app are required
 * when the app has subscriptions.
 */
export declare function checkSubscriptionCompliance(subscription: SubscriptionInfo): GateResult;
/**
 * Verify IAP sandbox testing has been completed.
 */
export declare function checkIAPSandbox(sandboxResult: IAPSandboxResult): GateResult;
/**
 * Verify screenshots have correct dimensions and all required sizes are present.
 */
export declare function checkScreenshots(screenshotInfo: ScreenshotInfo, platform: 'ios' | 'android'): GateResult;
/**
 * Verify privacy policy is present and has a valid URL.
 */
export declare function checkPrivacyPolicy(privacyPolicy: PrivacyPolicyInfo): GateResult;
/**
 * Verify EULA link is present and valid.
 */
export declare function checkEULA(eulaInfo: EULAInfo): GateResult;
export interface AllGateInputs {
    metadata: AppMetadata;
    subscription: SubscriptionInfo;
    iapSandbox: IAPSandboxResult;
    screenshots: ScreenshotInfo;
    platform: 'ios' | 'android';
    privacyPolicy: PrivacyPolicyInfo;
    eula: EULAInfo;
}
export interface AllGateResults {
    results: GateResult[];
    allPassed: boolean;
    failedGates: string[];
}
/**
 * Run all gate checks and return aggregated results.
 * If any gate fails, allPassed is false and failedGates lists the failing gate IDs.
 */
export declare function runAllGates(inputs: AllGateInputs): AllGateResults;
//# sourceMappingURL=gates.d.ts.map