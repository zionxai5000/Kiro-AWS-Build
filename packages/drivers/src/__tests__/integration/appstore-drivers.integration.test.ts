/**
 * Integration tests for App Store Connect and Google Play drivers.
 *
 * Tests the full driver lifecycle with mocked API responses:
 * authentication, app creation, build upload, submission,
 * review status check, and rejection handling.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 11.2, 11.3, 11.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppStoreConnectDriver, APP_STORE_ERROR_CODES } from '../../appstore/appstore-connect-driver.js';
import { GooglePlayDriver, GOOGLE_PLAY_ERROR_CODES } from '../../googleplay/google-play-driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCredentialManager(credential = 'test-credential-integration'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(credential),
    rotateCredential: vi.fn().mockResolvedValue({ success: true, driverName: 'test' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// App Store Connect Driver — Full Lifecycle Integration
// ---------------------------------------------------------------------------

describe('App Store Connect Driver Integration', () => {
  let driver: AppStoreConnectDriver;
  let credentialManager: CredentialManager;

  const ascConfig = {
    keyId: 'test-key-id',
    issuerId: 'test-issuer-id',
    teamId: 'test-team-id',
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new AppStoreConnectDriver(credentialManager);
  });

  describe('authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(ascConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('appstore-connect', 'api-key');
    });

    it('fails when credential manager returns empty key', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new AppStoreConnectDriver(badCreds);

      const result = await badDriver.connect(ascConfig);
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails when required config fields are missing', async () => {
      const result = await driver.connect({ keyId: '', issuerId: 'x', teamId: 'x' });
      expect(result.success).toBe(false);
    });
  });

  describe('full connect → execute → verify → disconnect lifecycle', () => {
    it('completes the full lifecycle for app creation', async () => {
      // 1. Connect
      await driver.connect(ascConfig);
      expect(driver.status).toBe('ready');

      // 2. Execute — create app
      const createResult = await driver.execute({
        type: 'createApp',
        params: {
          bundleId: 'com.test.integration',
          name: 'Integration Test App',
          primaryLocale: 'en-US',
          sku: 'INT-TEST-001',
        },
      });
      expect(createResult.success).toBe(true);
      const appData = createResult.data as Record<string, unknown>;
      expect(appData.bundleId).toBe('com.test.integration');
      expect(appData.name).toBe('Integration Test App');
      expect(appData.appId).toBeDefined();

      // 3. Verify
      const verifyResult = await driver.verify(createResult.operationId);
      expect(verifyResult.verified).toBe(true);

      // 4. Disconnect
      await driver.disconnect();
      expect(driver.status).toBe('disconnected');
    });

    it('completes the full lifecycle for build upload', async () => {
      await driver.connect(ascConfig);

      const uploadResult = await driver.execute({
        type: 'uploadBuild',
        params: {
          appId: 'app-123',
          buildPath: '/builds/app.ipa',
          version: '1.0.0',
          buildNumber: '42',
        },
      });
      expect(uploadResult.success).toBe(true);
      const buildData = uploadResult.data as Record<string, unknown>;
      expect(buildData.version).toBe('1.0.0');
      expect(buildData.buildNumber).toBe('42');
      expect(buildData.processingState).toBe('PROCESSING');

      await driver.disconnect();
    });

    it('completes the full lifecycle for submission and review status check', async () => {
      await driver.connect(ascConfig);

      // Submit for review
      const submitResult = await driver.execute({
        type: 'submitForReview',
        params: {
          appId: 'app-123',
          versionId: 'v-1',
          buildId: 'build-1',
        },
      });
      expect(submitResult.success).toBe(true);
      const submitData = submitResult.data as Record<string, unknown>;
      expect(submitData.reviewStatus).toBe('WAITING_FOR_REVIEW');

      // Check review status
      const statusResult = await driver.execute({
        type: 'checkReviewStatus',
        params: {
          appId: 'app-123',
          versionId: 'v-1',
        },
      });
      expect(statusResult.success).toBe(true);
      const statusData = statusResult.data as Record<string, unknown>;
      expect(statusData.reviewStatus).toBe('IN_REVIEW');

      await driver.disconnect();
    });
  });

  describe('rejection handling', () => {
    it('parses rejection codes into structured reasons', async () => {
      await driver.connect(ascConfig);

      const reasons = driver.parseRejection(['GUIDELINE_2_1', 'GUIDELINE_3_1_1']);
      expect(reasons).toHaveLength(2);
      expect(reasons[0].code).toBe('GUIDELINE_2_1');
      expect(reasons[0].category).toBe('guideline_violation');
      expect(reasons[0].remediationHint).toBeDefined();
      expect(reasons[1].code).toBe('GUIDELINE_3_1_1');

      await driver.disconnect();
    });

    it('creates a rejection result with structured details', async () => {
      await driver.connect(ascConfig);

      const rejectionResult = driver.createRejectionResult(
        'op-rejection-test',
        'app-123',
        'v-1',
        ['GUIDELINE_2_1', 'METADATA_MISSING_SCREENSHOTS'],
      );

      expect(rejectionResult.success).toBe(false);
      expect(rejectionResult.error?.code).toBe(APP_STORE_ERROR_CODES.APP_REJECTED);
      const details = rejectionResult.error?.details as Record<string, unknown>;
      expect(details.reviewStatus).toBe('REJECTED');
      const rejectionReasons = details.rejectionReasons as Array<{ code: string }>;
      expect(rejectionReasons).toHaveLength(2);

      await driver.disconnect();
    });

    it('ignores unknown rejection codes gracefully', async () => {
      await driver.connect(ascConfig);

      const reasons = driver.parseRejection(['UNKNOWN_CODE', 'GUIDELINE_2_1']);
      expect(reasons).toHaveLength(1);
      expect(reasons[0].code).toBe('GUIDELINE_2_1');

      await driver.disconnect();
    });
  });

  describe('error handling and retry behavior', () => {
    it('returns error for unsupported operation types', async () => {
      await driver.connect(ascConfig);

      const result = await driver.execute({
        type: 'unsupported_op',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(APP_STORE_ERROR_CODES.UNSUPPORTED_OPERATION);

      await driver.disconnect();
    });

    it('returns error for missing required params', async () => {
      await driver.connect(ascConfig);

      const result = await driver.execute({
        type: 'createApp',
        params: { bundleId: 'com.test.app' }, // missing name, primaryLocale, sku
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(APP_STORE_ERROR_CODES.INVALID_PARAMS);

      await driver.disconnect();
    });
  });

  describe('circuit breaker state transitions', () => {
    it('starts with closed circuit breaker', async () => {
      await driver.connect(ascConfig);
      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });

    it('remains closed after successful operations', async () => {
      await driver.connect(ascConfig);

      await driver.execute({
        type: 'createApp',
        params: {
          bundleId: 'com.test.app',
          name: 'Test',
          primaryLocale: 'en-US',
          sku: 'SKU-1',
        },
      });

      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });
  });
});

// ---------------------------------------------------------------------------
// Google Play Driver — Full Lifecycle Integration
// ---------------------------------------------------------------------------

describe('Google Play Driver Integration', () => {
  let driver: GooglePlayDriver;
  let credentialManager: CredentialManager;

  const gpConfig = {
    serviceAccountEmail: 'test@project.iam.gserviceaccount.com',
    projectId: 'test-project-id',
    packageName: 'com.test.integration',
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new GooglePlayDriver(credentialManager);
  });

  describe('authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(gpConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('google-play', 'service-account-key');
    });

    it('fails when credential manager returns empty key', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new GooglePlayDriver(badCreds);

      const result = await badDriver.connect(gpConfig);
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails when required config fields are missing', async () => {
      const result = await driver.connect({
        serviceAccountEmail: '',
        projectId: 'x',
        packageName: 'x',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('full connect → execute → verify → disconnect lifecycle', () => {
    it('completes the full lifecycle for app creation', async () => {
      await driver.connect(gpConfig);

      const createResult = await driver.execute({
        type: 'createApp',
        params: {
          packageName: 'com.test.integration',
          title: 'Integration Test App',
          defaultLanguage: 'en-US',
          appCategory: 'GAME',
        },
      });
      expect(createResult.success).toBe(true);
      const appData = createResult.data as Record<string, unknown>;
      expect(appData.packageName).toBe('com.test.integration');
      expect(appData.title).toBe('Integration Test App');
      expect(appData.status).toBe('DRAFT');

      const verifyResult = await driver.verify(createResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
      expect(driver.status).toBe('disconnected');
    });

    it('completes the full lifecycle for bundle upload', async () => {
      await driver.connect(gpConfig);

      const uploadResult = await driver.execute({
        type: 'uploadBundle',
        params: {
          packageName: 'com.test.integration',
          bundlePath: '/builds/app.aab',
          versionCode: 42,
          versionName: '1.0.0',
          track: 'internal',
        },
      });
      expect(uploadResult.success).toBe(true);
      const bundleData = uploadResult.data as Record<string, unknown>;
      expect(bundleData.versionCode).toBe(42);
      expect(bundleData.track).toBe('internal');

      await driver.disconnect();
    });

    it('completes the full lifecycle for submission and review status check', async () => {
      await driver.connect(gpConfig);

      // Submit for review
      const submitResult = await driver.execute({
        type: 'submitForReview',
        params: {
          packageName: 'com.test.integration',
          editId: 'edit-1',
          track: 'production',
        },
      });
      expect(submitResult.success).toBe(true);
      const submitData = submitResult.data as Record<string, unknown>;
      expect(submitData.reviewStatus).toBe('PENDING_REVIEW');

      // Check review status
      const statusResult = await driver.execute({
        type: 'checkReviewStatus',
        params: {
          packageName: 'com.test.integration',
          editId: 'edit-1',
        },
      });
      expect(statusResult.success).toBe(true);
      const statusData = statusResult.data as Record<string, unknown>;
      expect(statusData.reviewStatus).toBe('IN_REVIEW');

      await driver.disconnect();
    });
  });

  describe('rejection handling', () => {
    it('parses rejection codes into structured reasons', async () => {
      await driver.connect(gpConfig);

      const reasons = driver.parseRejection(['POLICY_DECEPTIVE_BEHAVIOR', 'TECHNICAL_CRASH_RATE']);
      expect(reasons).toHaveLength(2);
      expect(reasons[0].code).toBe('POLICY_DECEPTIVE_BEHAVIOR');
      expect(reasons[0].category).toBe('policy_violation');
      expect(reasons[0].remediationHint).toBeDefined();
      expect(reasons[1].code).toBe('TECHNICAL_CRASH_RATE');
      expect(reasons[1].category).toBe('technical_issue');

      await driver.disconnect();
    });

    it('creates a rejection result with structured details', async () => {
      await driver.connect(gpConfig);

      const rejectionResult = driver.createRejectionResult(
        'op-rejection-test',
        'com.test.app',
        'edit-1',
        ['SECURITY_DATA_SAFETY', 'METADATA_MISSING_DESCRIPTION'],
      );

      expect(rejectionResult.success).toBe(false);
      expect(rejectionResult.error?.code).toBe(GOOGLE_PLAY_ERROR_CODES.APP_REJECTED);
      const details = rejectionResult.error?.details as Record<string, unknown>;
      expect(details.reviewStatus).toBe('REJECTED');
      const rejectionReasons = details.rejectionReasons as Array<{ code: string }>;
      expect(rejectionReasons).toHaveLength(2);

      await driver.disconnect();
    });
  });

  describe('error handling and retry behavior', () => {
    it('returns error for unsupported operation types', async () => {
      await driver.connect(gpConfig);

      const result = await driver.execute({
        type: 'unsupported_op',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(GOOGLE_PLAY_ERROR_CODES.UNSUPPORTED_OPERATION);

      await driver.disconnect();
    });

    it('returns error for missing required params', async () => {
      await driver.connect(gpConfig);

      const result = await driver.execute({
        type: 'createApp',
        params: { packageName: 'com.test.app' }, // missing title, defaultLanguage, appCategory
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS);

      await driver.disconnect();
    });
  });

  describe('circuit breaker state transitions', () => {
    it('starts with closed circuit breaker and remains closed after success', async () => {
      await driver.connect(gpConfig);
      expect(driver.getCircuitBreakerState()).toBe('closed');

      await driver.execute({
        type: 'createApp',
        params: {
          packageName: 'com.test.app',
          title: 'Test',
          defaultLanguage: 'en-US',
          appCategory: 'TOOLS',
        },
      });

      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });
  });
});
