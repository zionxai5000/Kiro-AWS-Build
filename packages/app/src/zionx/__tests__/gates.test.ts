/**
 * Unit tests for ZionX App Factory — Gate Checks
 *
 * Validates: Requirements 11.2, 11.3, 19.1
 *
 * Tests that gate checks block submission when requirements are not met
 * and pass when all requirements are satisfied.
 */

import { describe, it, expect } from 'vitest';
import {
  checkMetadata,
  checkSubscriptionCompliance,
  checkIAPSandbox,
  checkScreenshots,
  checkPrivacyPolicy,
  checkEULA,
  runAllGates,
  REQUIRED_IOS_SCREENSHOTS,
  REQUIRED_ANDROID_SCREENSHOTS,
} from '../gates.js';
import type {
  AppMetadata,
  SubscriptionInfo,
  IAPSandboxResult,
  ScreenshotInfo,
  PrivacyPolicyInfo,
  EULAInfo,
  AllGateInputs,
} from '../gates.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validMetadata(): AppMetadata {
  return {
    title: 'My App',
    description: 'A great app for productivity',
    keywords: ['productivity', 'tools'],
    category: 'Productivity',
  };
}

function validSubscription(): SubscriptionInfo {
  return {
    hasSubscriptions: true,
    eulaLink: 'https://example.com/eula',
    privacyPolicyInApp: true,
  };
}

function validIAPSandbox(): IAPSandboxResult {
  return {
    tested: true,
    purchaseFlowVerified: true,
    restoreFlowVerified: true,
    sandboxAccountUsed: true,
  };
}

function validIOSScreenshots(): ScreenshotInfo {
  return {
    screenshots: REQUIRED_IOS_SCREENSHOTS.map((r) => ({
      deviceType: r.deviceType,
      width: r.width,
      height: r.height,
      count: 3,
    })),
  };
}

function validAndroidScreenshots(): ScreenshotInfo {
  return {
    screenshots: REQUIRED_ANDROID_SCREENSHOTS.map((r) => ({
      deviceType: r.deviceType,
      width: r.width,
      height: r.height,
      count: 3,
    })),
  };
}

function validPrivacyPolicy(): PrivacyPolicyInfo {
  return { url: 'https://example.com/privacy', inAppAccessible: true };
}

function validEULA(): EULAInfo {
  return { url: 'https://example.com/eula', linkedInMetadata: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkMetadata', () => {
  it('should pass with valid metadata', () => {
    const result = checkMetadata(validMetadata());
    expect(result.passed).toBe(true);
    expect(result.gateId).toBe('gate-metadata');
  });

  it('should fail when title is missing', () => {
    const result = checkMetadata({ ...validMetadata(), title: '' });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Title is required');
  });

  it('should fail when title exceeds 30 characters', () => {
    const result = checkMetadata({ ...validMetadata(), title: 'A'.repeat(31) });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('30 characters');
  });

  it('should fail when description is missing', () => {
    const result = checkMetadata({ ...validMetadata(), description: '' });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Description is required');
  });

  it('should fail when description is too short', () => {
    const result = checkMetadata({ ...validMetadata(), description: 'Short' });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('at least 10 characters');
  });

  it('should fail when keywords are empty', () => {
    const result = checkMetadata({ ...validMetadata(), keywords: [] });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('keyword');
  });

  it('should fail when category is missing', () => {
    const result = checkMetadata({ ...validMetadata(), category: '' });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Category is required');
  });
});

describe('checkSubscriptionCompliance', () => {
  it('should pass with valid subscription info', () => {
    const result = checkSubscriptionCompliance(validSubscription());
    expect(result.passed).toBe(true);
  });

  it('should pass when app has no subscriptions', () => {
    const result = checkSubscriptionCompliance({ hasSubscriptions: false });
    expect(result.passed).toBe(true);
  });

  it('should fail when subscription app has no EULA link', () => {
    const result = checkSubscriptionCompliance({
      hasSubscriptions: true,
      eulaLink: '',
      privacyPolicyInApp: true,
    });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('EULA');
  });

  it('should fail when subscription app has no in-app privacy policy', () => {
    const result = checkSubscriptionCompliance({
      hasSubscriptions: true,
      eulaLink: 'https://example.com/eula',
      privacyPolicyInApp: false,
    });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Privacy policy');
  });
});

describe('checkIAPSandbox', () => {
  it('should pass with all sandbox tests completed', () => {
    const result = checkIAPSandbox(validIAPSandbox());
    expect(result.passed).toBe(true);
  });

  it('should fail when sandbox testing not performed', () => {
    const result = checkIAPSandbox({ ...validIAPSandbox(), tested: false });
    expect(result.passed).toBe(false);
  });

  it('should fail when purchase flow not verified', () => {
    const result = checkIAPSandbox({ ...validIAPSandbox(), purchaseFlowVerified: false });
    expect(result.passed).toBe(false);
  });

  it('should fail when restore flow not verified', () => {
    const result = checkIAPSandbox({ ...validIAPSandbox(), restoreFlowVerified: false });
    expect(result.passed).toBe(false);
  });
});

describe('checkScreenshots', () => {
  it('should pass with valid iOS screenshots', () => {
    const result = checkScreenshots(validIOSScreenshots(), 'ios');
    expect(result.passed).toBe(true);
  });

  it('should pass with valid Android screenshots', () => {
    const result = checkScreenshots(validAndroidScreenshots(), 'android');
    expect(result.passed).toBe(true);
  });

  it('should fail when no screenshots provided', () => {
    const result = checkScreenshots({ screenshots: [] }, 'ios');
    expect(result.passed).toBe(false);
  });

  it('should fail when required device size is missing', () => {
    const result = checkScreenshots(
      {
        screenshots: [
          { deviceType: 'iPhone 6.7"', width: 1290, height: 2796, count: 3 },
          // Missing iPhone 6.5" and iPad Pro
        ],
      },
      'ios',
    );
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Missing');
  });

  it('should fail when screenshot has invalid dimensions', () => {
    const result = checkScreenshots(
      {
        screenshots: [
          ...REQUIRED_IOS_SCREENSHOTS.map((r) => ({
            deviceType: r.deviceType,
            width: r.width,
            height: r.height,
            count: 3,
          })),
          { deviceType: 'Custom', width: 0, height: 0, count: 1 },
        ],
      },
      'ios',
    );
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Invalid dimensions');
  });
});

describe('checkPrivacyPolicy', () => {
  it('should pass with valid privacy policy', () => {
    const result = checkPrivacyPolicy(validPrivacyPolicy());
    expect(result.passed).toBe(true);
  });

  it('should fail when URL is missing', () => {
    const result = checkPrivacyPolicy({ url: '', inAppAccessible: true });
    expect(result.passed).toBe(false);
  });

  it('should fail when URL is not HTTPS', () => {
    const result = checkPrivacyPolicy({ url: 'http://example.com/privacy', inAppAccessible: true });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('HTTPS');
  });

  it('should fail when not accessible in-app', () => {
    const result = checkPrivacyPolicy({ url: 'https://example.com/privacy', inAppAccessible: false });
    expect(result.passed).toBe(false);
  });
});

describe('checkEULA', () => {
  it('should pass with valid EULA', () => {
    const result = checkEULA(validEULA());
    expect(result.passed).toBe(true);
  });

  it('should fail when URL is missing', () => {
    const result = checkEULA({ url: '', linkedInMetadata: true });
    expect(result.passed).toBe(false);
  });

  it('should fail when not linked in metadata', () => {
    const result = checkEULA({ url: 'https://example.com/eula', linkedInMetadata: false });
    expect(result.passed).toBe(false);
  });
});

describe('runAllGates', () => {
  function validInputs(): AllGateInputs {
    return {
      metadata: validMetadata(),
      subscription: validSubscription(),
      iapSandbox: validIAPSandbox(),
      screenshots: validIOSScreenshots(),
      platform: 'ios',
      privacyPolicy: validPrivacyPolicy(),
      eula: validEULA(),
    };
  }

  it('should pass all gates with valid inputs', () => {
    const result = runAllGates(validInputs());
    expect(result.allPassed).toBe(true);
    expect(result.failedGates).toHaveLength(0);
    expect(result.results).toHaveLength(6);
  });

  it('should report failed gates when metadata is invalid', () => {
    const inputs = validInputs();
    inputs.metadata.title = '';
    const result = runAllGates(inputs);
    expect(result.allPassed).toBe(false);
    expect(result.failedGates).toContain('gate-metadata');
  });

  it('should report multiple failed gates', () => {
    const inputs = validInputs();
    inputs.metadata.title = '';
    inputs.privacyPolicy.url = '';
    const result = runAllGates(inputs);
    expect(result.allPassed).toBe(false);
    expect(result.failedGates).toContain('gate-metadata');
    expect(result.failedGates).toContain('gate-privacy-policy');
  });
});
