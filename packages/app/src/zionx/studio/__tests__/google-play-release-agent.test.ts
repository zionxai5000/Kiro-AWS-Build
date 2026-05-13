/**
 * Unit tests for ZionX App Development Studio — Google Play Release Agent
 *
 * Validates: Requirements 42g.21, 42k.35, 19.1
 *
 * Tests Gradle AAB build trigger and status tracking, metadata preparation,
 * Data Safety form generation, billing validation, rejection parsing,
 * remediation plan generation, and MCP tool exposure.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DefaultGooglePlayReleaseAgent,
  type GooglePlayConsoleDriver,
  type GradleBuildSystem,
  type GoogleBuildConfig,
  type GooglePlayReleaseAgentConfig,
  type GoogleRejection,
} from '../agents/google-play-release-agent.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockBuildSystem(): GradleBuildSystem {
  return {
    triggerBuild: vi.fn().mockResolvedValue({
      buildId: 'gradle-build-001',
      status: 'queued',
      outputPath: '/tmp/builds/app-release.aab',
    }),
    getBuildStatus: vi.fn().mockResolvedValue({
      status: 'building',
      progress: 45,
    }),
    signAAB: vi.fn().mockResolvedValue({ signed: true }),
  };
}

function createMockDriver(): GooglePlayConsoleDriver {
  return {
    createListing: vi.fn().mockResolvedValue({ appId: 'com.example.app' }),
    uploadAAB: vi.fn().mockResolvedValue({ versionCode: 1, status: 'processing' }),
    submitForReview: vi.fn().mockResolvedValue({ releaseId: 'release-789' }),
    checkReviewStatus: vi.fn().mockResolvedValue({ status: 'in-review' }),
    updateMetadata: vi.fn().mockResolvedValue(undefined),
    uploadAssets: vi.fn().mockResolvedValue(undefined),
    validateBilling: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    promoteToProduction: vi.fn().mockResolvedValue(undefined),
    uploadToClosedTesting: vi.fn().mockResolvedValue(undefined),
  };
}

function createDefaultBuildConfig(overrides: Partial<GoogleBuildConfig> = {}): GoogleBuildConfig {
  return {
    packageName: 'com.example.testapp',
    keystorePath: '/keys/release.keystore',
    keystorePassword: 'store-pass',
    keyAlias: 'release-key',
    keyPassword: 'key-pass',
    targetSdkVersion: 34,
    versionCode: 1,
    versionName: '1.0.0',
    ...overrides,
  };
}

function createAgent(
  driverOverrides?: Partial<GooglePlayConsoleDriver>,
  buildSystemOverrides?: Partial<GradleBuildSystem>,
  configOverrides?: Partial<GooglePlayReleaseAgentConfig>,
) {
  const driver = { ...createMockDriver(), ...driverOverrides } as GooglePlayConsoleDriver;
  const buildSystem = {
    ...createMockBuildSystem(),
    ...buildSystemOverrides,
  } as GradleBuildSystem;
  const config: GooglePlayReleaseAgentConfig = {
    appId: 'com.example.app',
    packageName: 'com.example.testapp',
    ...configOverrides,
  };

  const agent = new DefaultGooglePlayReleaseAgent(driver, buildSystem, config);
  return { agent, driver, buildSystem, config };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GooglePlayReleaseAgent', () => {
  describe('triggerBuild', () => {
    it('initiates Gradle AAB build and returns build ID with status', async () => {
      const { agent } = createAgent();
      const buildConfig = createDefaultBuildConfig();

      const result = await agent.triggerBuild('session-1', buildConfig);

      expect(result.buildId).toBe('gradle-build-001');
      expect(result.status).toBe('queued');
    });

    it('passes build config to the Gradle build system', async () => {
      const { agent, buildSystem } = createAgent();
      const buildConfig = createDefaultBuildConfig({ packageName: 'com.custom.app' });

      await agent.triggerBuild('session-1', buildConfig);

      expect(buildSystem.triggerBuild).toHaveBeenCalledWith(buildConfig);
    });

    it('tracks build status after trigger', async () => {
      const { agent } = createAgent();
      const buildConfig = createDefaultBuildConfig();

      const { buildId } = await agent.triggerBuild('session-1', buildConfig);
      const status = await agent.getBuildStatus(buildId);

      expect(status.status).toBeDefined();
    });

    it('handles build failure status', async () => {
      const { agent } = createAgent(undefined, {
        triggerBuild: vi.fn().mockResolvedValue({
          buildId: 'gradle-build-fail',
          status: 'failed',
          outputPath: undefined,
        }),
      });
      const buildConfig = createDefaultBuildConfig();

      const result = await agent.triggerBuild('session-1', buildConfig);

      expect(result.status).toBe('failed');
    });
  });

  describe('getBuildStatus', () => {
    it('returns current build status with progress', async () => {
      const { agent } = createAgent(undefined, {
        getBuildStatus: vi.fn().mockResolvedValue({
          status: 'building',
          progress: 75,
        }),
      });

      const status = await agent.getBuildStatus('gradle-build-001');

      expect(status.status).toBe('building');
      expect(status.progress).toBe(75);
    });

    it('returns error information for failed builds', async () => {
      const { agent } = createAgent(undefined, {
        getBuildStatus: vi.fn().mockResolvedValue({
          status: 'failed',
          error: 'Keystore password incorrect',
        }),
      });

      const status = await agent.getBuildStatus('gradle-build-001');

      expect(status.status).toBe('failed');
      expect(status.error).toContain('Keystore password');
    });
  });

  describe('prepareMetadata', () => {
    it('produces valid Play Console format from app info', () => {
      const { agent } = createAgent();

      const metadata = agent.prepareMetadata('session-1', {
        title: 'My Cool App',
        shortDescription: 'Do cool things on Android',
        fullDescription: 'A great app for doing cool things on your Android device.',
        category: 'Productivity',
        contactEmail: 'dev@example.com',
        privacyPolicyUrl: 'https://example.com/privacy',
        defaultLanguage: 'en-US',
      });

      expect(metadata.title).toBe('My Cool App');
      expect(metadata.shortDescription).toBe('Do cool things on Android');
      expect(metadata.fullDescription).toBe(
        'A great app for doing cool things on your Android device.',
      );
      expect(metadata.category).toBe('Productivity');
      expect(metadata.contactEmail).toBe('dev@example.com');
      expect(metadata.privacyPolicyUrl).toBe('https://example.com/privacy');
      expect(metadata.defaultLanguage).toBe('en-US');
    });

    it('throws when title is missing', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          shortDescription: 'Short desc',
          fullDescription: 'Full description',
          contactEmail: 'dev@example.com',
          privacyPolicyUrl: 'https://example.com/privacy',
        }),
      ).toThrow('Title is required');
    });

    it('throws when short description is missing', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          title: 'My App',
          fullDescription: 'Full description',
          contactEmail: 'dev@example.com',
          privacyPolicyUrl: 'https://example.com/privacy',
        }),
      ).toThrow('Short description is required');
    });

    it('throws when contact email is missing', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          title: 'My App',
          shortDescription: 'Short desc',
          fullDescription: 'Full description',
          privacyPolicyUrl: 'https://example.com/privacy',
        }),
      ).toThrow('Contact email is required');
    });

    it('throws when title exceeds 30 characters', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          title: 'This App Title Is Way Too Long For Play',
          shortDescription: 'Short desc',
          fullDescription: 'Full description',
          contactEmail: 'dev@example.com',
          privacyPolicyUrl: 'https://example.com/privacy',
        }),
      ).toThrow('Title must be 30 characters or fewer');
    });

    it('throws when short description exceeds 80 characters', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          title: 'My App',
          shortDescription: 'A'.repeat(81),
          fullDescription: 'Full description',
          contactEmail: 'dev@example.com',
          privacyPolicyUrl: 'https://example.com/privacy',
        }),
      ).toThrow('Short description must be 80 characters or fewer');
    });

    it('defaults language to en-US when not specified', () => {
      const { agent } = createAgent();

      const metadata = agent.prepareMetadata('session-1', {
        title: 'My App',
        shortDescription: 'Short desc',
        fullDescription: 'Full description',
        contactEmail: 'dev@example.com',
        privacyPolicyUrl: 'https://example.com/privacy',
      });

      expect(metadata.defaultLanguage).toBe('en-US');
    });
  });

  describe('generateDataSafetyForm', () => {
    it('generates empty form for app with no integrations', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {});

      expect(form.dataCollected).toHaveLength(0);
      expect(form.dataShared).toHaveLength(0);
      expect(form.securityPractices.encrypted).toBe(true);
      expect(form.securityPractices.deletionMechanism).toBe(false);
    });

    it('detects analytics data collection and sharing', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        integrations: [{ type: 'analytics', name: 'Firebase' }],
      });

      expect(form.dataCollected).toContainEqual({
        type: 'App interactions',
        purpose: 'Analytics',
        optional: false,
      });
      expect(form.dataShared).toContainEqual({
        type: 'App interactions',
        purpose: 'Analytics',
        recipient: 'Firebase',
      });
    });

    it('detects advertising data collection', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        integrations: [{ type: 'advertising', name: 'AdMob' }],
      });

      expect(form.dataCollected).toContainEqual({
        type: 'Advertising ID',
        purpose: 'Advertising',
        optional: true,
      });
      expect(form.dataShared).toContainEqual({
        type: 'Advertising ID',
        purpose: 'Advertising',
        recipient: 'AdMob',
      });
    });

    it('detects crash reporting data', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        integrations: [{ type: 'crash-reporting', name: 'Crashlytics' }],
      });

      expect(form.dataCollected).toContainEqual({
        type: 'Crash logs',
        purpose: 'App functionality',
        optional: false,
      });
      // Crash data is not shared externally
      expect(form.dataShared).toHaveLength(0);
    });

    it('detects authentication user data and enables deletion mechanism', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        authentication: { type: 'email' },
      });

      expect(form.dataCollected).toContainEqual({
        type: 'Email address',
        purpose: 'Account management',
        optional: false,
      });
      expect(form.securityPractices.deletionMechanism).toBe(true);
    });

    it('detects social auth collects name data', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        authentication: { type: 'social' },
      });

      const types = form.dataCollected.map((d) => d.type);
      expect(types).toContain('Email address');
      expect(types).toContain('Name');
    });

    it('detects subscription purchase history', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        monetization: { model: 'subscription' },
      });

      expect(form.dataCollected).toContainEqual({
        type: 'Purchase history',
        purpose: 'App functionality',
        optional: false,
      });
    });

    it('detects location permission usage', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        permissions: ['location'],
      });

      expect(form.dataCollected).toContainEqual({
        type: 'Approximate location',
        purpose: 'App functionality',
        optional: true,
      });
    });

    it('combines multiple data sources correctly', () => {
      const { agent } = createAgent();

      const form = agent.generateDataSafetyForm('session-1', {
        integrations: [
          { type: 'analytics', name: 'Firebase' },
          { type: 'crash-reporting', name: 'Crashlytics' },
        ],
        authentication: { type: 'email' },
        monetization: { model: 'subscription' },
        permissions: ['camera'],
      });

      const collectedTypes = form.dataCollected.map((d) => d.type);
      expect(collectedTypes).toContain('App interactions');
      expect(collectedTypes).toContain('Crash logs');
      expect(collectedTypes).toContain('Email address');
      expect(collectedTypes).toContain('Purchase history');
      expect(collectedTypes).toContain('Photos or videos');
      expect(form.securityPractices.deletionMechanism).toBe(true);
    });
  });

  describe('validateBilling', () => {
    it('returns invalid when no products are configured', async () => {
      const { agent } = createAgent();

      const result = await agent.validateBilling('session-1', []);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No billing products configured');
    });

    it('catches invalid product ID format', async () => {
      const { agent } = createAgent();

      const result = await agent.validateBilling('session-1', [
        'Invalid_Product',
        'also bad!',
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Invalid product ID format');
    });

    it('validates correctly formatted products against Play Console', async () => {
      const { agent, driver } = createAgent();

      const result = await agent.validateBilling('session-1', [
        'com.example.premium',
        'com.example.monthly_sub',
      ]);

      expect(driver.validateBilling).toHaveBeenCalledWith('com.example.app', [
        'com.example.premium',
        'com.example.monthly_sub',
      ]);
      expect(result.valid).toBe(true);
    });

    it('returns driver errors for misconfigured products', async () => {
      const { agent } = createAgent({
        validateBilling: vi.fn().mockResolvedValue({
          valid: false,
          errors: ['Product com.example.premium not found in Play Console'],
        }),
      });

      const result = await agent.validateBilling('session-1', ['com.example.premium']);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found in Play Console');
    });
  });

  describe('submitForReview', () => {
    it('submits build for Google Play review', async () => {
      const { agent, driver } = createAgent();
      const buildConfig = createDefaultBuildConfig();

      await agent.triggerBuild('session-1', buildConfig);
      const result = await agent.submitForReview('session-1');

      expect(result.releaseId).toBe('release-789');
      expect(driver.submitForReview).toHaveBeenCalledWith('com.example.app', 'production');
    });

    it('throws when no build exists for session', async () => {
      const { agent } = createAgent();

      await expect(agent.submitForReview('session-no-build')).rejects.toThrow(
        'No build found for session',
      );
    });

    it('submits to specified track', async () => {
      const { agent, driver } = createAgent();
      const buildConfig = createDefaultBuildConfig();

      await agent.triggerBuild('session-1', buildConfig);
      await agent.submitForReview('session-1', 'beta');

      expect(driver.submitForReview).toHaveBeenCalledWith('com.example.app', 'beta');
    });
  });

  describe('checkReviewStatus', () => {
    it('returns review status when in review', async () => {
      const { agent } = createAgent({
        checkReviewStatus: vi.fn().mockResolvedValue({ status: 'in-review' }),
      });

      const result = await agent.checkReviewStatus('session-1');

      expect(result.status).toBe('in-review');
      expect(result.rejection).toBeUndefined();
    });

    it('returns rejection details when rejected', async () => {
      const { agent } = createAgent({
        checkReviewStatus: vi.fn().mockResolvedValue({
          status: 'rejected',
          rejectionReason:
            'Your app violates the Deceptive Behavior policy. Ads mimic system notifications.',
        }),
      });

      const result = await agent.checkReviewStatus('session-1');

      expect(result.status).toBe('rejected');
      expect(result.rejection).toBeDefined();
      expect(result.rejection!.policyArea).toBe('deceptive-behavior');
      expect(result.rejection!.policyTitle).toBe('Deceptive Behavior');
    });
  });

  describe('parseRejection', () => {
    it('extracts deceptive behavior policy from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app violates the Deceptive Behavior policy. Ads mimic system notifications.',
      );

      expect(rejection.policyArea).toBe('deceptive-behavior');
      expect(rejection.policyTitle).toBe('Deceptive Behavior');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts malware policy from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app has been flagged for Malware or Unwanted Software behavior.',
      );

      expect(rejection.policyArea).toBe('malware');
      expect(rejection.policyTitle).toBe('Malware and Unwanted Software');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts data safety policy from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app has Data Safety form discrepancies.',
      );

      expect(rejection.policyArea).toBe('data-safety');
      expect(rejection.policyTitle).toBe('Data Safety Violations');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts billing policy from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app violates the Billing Policy. External payment methods detected.',
      );

      expect(rejection.policyArea).toBe('billing');
      expect(rejection.policyTitle).toBe('Billing Policy Violations');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts content policy from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app violates the Content Policy regarding inappropriate material.',
      );

      expect(rejection.policyArea).toBe('content-policy');
      expect(rejection.policyTitle).toBe('Content Policy Violations');
      expect(rejection.severity).toBe('major');
    });

    it('extracts permissions policy from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app violates the Permissions Policy. Unnecessary permissions requested.',
      );

      expect(rejection.policyArea).toBe('permissions');
      expect(rejection.policyTitle).toBe('Permissions Policy Violations');
      expect(rejection.severity).toBe('major');
    });

    it('handles unknown policy areas gracefully', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app was rejected for an unspecified reason.',
      );

      expect(rejection.policyArea).toBe('unknown');
      expect(rejection.policyTitle).toBe('Unknown Policy');
      expect(rejection.severity).toBe('major');
    });

    it('includes original rejection text in description', () => {
      const { agent } = createAgent();
      const text = 'Billing Policy violation: external payments detected.';

      const rejection = agent.parseRejection(text);

      expect(rejection.description).toBe(text);
    });

    it('generates remediation steps for known policies', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app violates the Billing Policy.',
      );

      expect(rejection.remediationSteps.length).toBeGreaterThan(0);
      expect(rejection.remediationSteps[0]).toContain('Google Play Billing');
    });
  });

  describe('generateRemediationPlan', () => {
    it('returns specific steps for deceptive behavior', () => {
      const { agent } = createAgent();

      const steps = agent.generateRemediationPlan({
        policyArea: 'deceptive-behavior',
        policyTitle: 'Deceptive Behavior',
        description: 'Ads mimic system notifications',
        remediationSteps: [],
        severity: 'critical',
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((s) => s.toLowerCase().includes('misleading'))).toBe(true);
    });

    it('returns specific steps for data safety violations', () => {
      const { agent } = createAgent();

      const steps = agent.generateRemediationPlan({
        policyArea: 'data-safety',
        policyTitle: 'Data Safety Violations',
        description: 'Data Safety form incomplete',
        remediationSteps: [],
        severity: 'critical',
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((s) => s.toLowerCase().includes('data safety'))).toBe(true);
    });

    it('returns generic steps for unknown policy areas', () => {
      const { agent } = createAgent();

      const steps = agent.generateRemediationPlan({
        policyArea: 'unknown-area',
        policyTitle: 'Unknown Rule',
        description: 'Something went wrong',
        remediationSteps: [],
        severity: 'minor',
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('Unknown Rule');
    });
  });

  describe('getMCPTools', () => {
    it('exposes exactly 5 MCP tools', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();

      expect(tools).toHaveLength(5);
    });

    it('exposes google.validateListing tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'google.validateListing');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('metadata');
      expect(tool!.inputSchema.type).toBe('object');
      expect((tool!.inputSchema.required as string[])).toContain('title');
    });

    it('exposes google.uploadAssets tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'google.uploadAssets');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('screenshot');
      expect((tool!.inputSchema.required as string[])).toContain('assets');
    });

    it('exposes google.submitForReview tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'google.submitForReview');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('track');
      expect((tool!.inputSchema.required as string[])).toContain('sessionId');
    });

    it('exposes google.checkReviewStatus tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'google.checkReviewStatus');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('review');
    });

    it('exposes google.uploadAAB tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'google.uploadAAB');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('Gradle');
      expect((tool!.inputSchema.required as string[])).toContain('packageName');
      expect((tool!.inputSchema.required as string[])).toContain('keystorePath');
    });

    it('all tools have valid input schemas with type object', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();

      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.required).toBeDefined();
      }
    });

    it('all tools have non-empty descriptions', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();

      for (const tool of tools) {
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });
  });
});
