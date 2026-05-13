/**
 * Unit tests for ZionX App Development Studio — Apple Release Agent
 *
 * Validates: Requirements 42g.20, 42k.34, 19.1
 *
 * Tests Xcode build trigger and status tracking, metadata preparation,
 * privacy nutrition label generation, IAP validation, screenshot validation,
 * rejection parsing, remediation plan generation, and MCP tool exposure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultAppleReleaseAgent,
  type AppStoreConnectDriver,
  type XcodeBuildSystem,
  type AppleBuildConfig,
  type AppleReleaseAgentConfig,
  type AppleRejection,
} from '../agents/apple-release-agent.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockBuildSystem(): XcodeBuildSystem {
  return {
    triggerBuild: vi.fn().mockResolvedValue({
      buildId: 'build-001',
      status: 'queued',
      outputPath: '/tmp/builds/build-001.ipa',
    }),
    getBuildStatus: vi.fn().mockResolvedValue({
      status: 'building',
      progress: 45,
    }),
    signBuild: vi.fn().mockResolvedValue({ signed: true }),
  };
}

function createMockDriver(): AppStoreConnectDriver {
  return {
    createApp: vi.fn().mockResolvedValue({ appId: 'app-123' }),
    uploadBuild: vi.fn().mockResolvedValue({ buildId: 'build-001', status: 'processing' }),
    submitForReview: vi.fn().mockResolvedValue({ submissionId: 'sub-456' }),
    checkReviewStatus: vi.fn().mockResolvedValue({ status: 'in-review' }),
    updateMetadata: vi.fn().mockResolvedValue(undefined),
    uploadScreenshots: vi.fn().mockResolvedValue(undefined),
    validateIAP: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
    uploadToTestFlight: vi.fn().mockResolvedValue(undefined),
  };
}

function createDefaultBuildConfig(overrides: Partial<AppleBuildConfig> = {}): AppleBuildConfig {
  return {
    bundleId: 'com.example.testapp',
    teamId: 'TEAM123',
    provisioningProfile: 'TestApp Distribution',
    signingCertificate: 'Apple Distribution: Example Inc',
    targetSdkVersion: '17.0',
    buildNumber: '42',
    versionString: '1.0.0',
    ...overrides,
  };
}

function createAgent(
  driverOverrides?: Partial<AppStoreConnectDriver>,
  buildSystemOverrides?: Partial<XcodeBuildSystem>,
  configOverrides?: Partial<AppleReleaseAgentConfig>,
) {
  const driver = { ...createMockDriver(), ...driverOverrides } as AppStoreConnectDriver;
  const buildSystem = {
    ...createMockBuildSystem(),
    ...buildSystemOverrides,
  } as XcodeBuildSystem;
  const config: AppleReleaseAgentConfig = {
    appId: 'app-123',
    teamId: 'TEAM123',
    ...configOverrides,
  };

  const agent = new DefaultAppleReleaseAgent(driver, buildSystem, config);
  return { agent, driver, buildSystem, config };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppleReleaseAgent', () => {
  describe('triggerBuild', () => {
    it('initiates Xcode build and returns build ID with status', async () => {
      const { agent } = createAgent();
      const buildConfig = createDefaultBuildConfig();

      const result = await agent.triggerBuild('session-1', buildConfig);

      expect(result.buildId).toBe('build-001');
      expect(result.status).toBe('queued');
    });

    it('passes build config to the build system', async () => {
      const { agent, buildSystem } = createAgent();
      const buildConfig = createDefaultBuildConfig({ bundleId: 'com.custom.app' });

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
          buildId: 'build-fail',
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

      const status = await agent.getBuildStatus('build-001');

      expect(status.status).toBe('building');
      expect(status.progress).toBe(75);
    });

    it('returns error information for failed builds', async () => {
      const { agent } = createAgent(undefined, {
        getBuildStatus: vi.fn().mockResolvedValue({
          status: 'failed',
          error: 'Code signing failed: certificate expired',
        }),
      });

      const status = await agent.getBuildStatus('build-001');

      expect(status.status).toBe('failed');
      expect(status.error).toContain('certificate expired');
    });
  });

  describe('prepareMetadata', () => {
    it('produces valid App Store Connect format from app info', () => {
      const { agent } = createAgent();

      const metadata = agent.prepareMetadata('session-1', {
        name: 'My Cool App',
        subtitle: 'Do cool things',
        description: 'A great app for doing cool things.',
        keywords: ['cool', 'app', 'things'],
        category: 'Productivity',
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support',
        copyright: '2024 Example Inc',
        ageRating: '4+',
      });

      expect(metadata.appName).toBe('My Cool App');
      expect(metadata.subtitle).toBe('Do cool things');
      expect(metadata.description).toBe('A great app for doing cool things.');
      expect(metadata.keywords).toEqual(['cool', 'app', 'things']);
      expect(metadata.category).toBe('Productivity');
      expect(metadata.privacyPolicyUrl).toBe('https://example.com/privacy');
      expect(metadata.supportUrl).toBe('https://example.com/support');
      expect(metadata.copyright).toBe('2024 Example Inc');
      expect(metadata.ageRating).toBe('4+');
    });

    it('throws when app name is missing', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          description: 'Some description',
          privacyPolicyUrl: 'https://example.com/privacy',
          supportUrl: 'https://example.com/support',
        }),
      ).toThrow('App name is required');
    });

    it('throws when description is missing', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          name: 'My App',
          privacyPolicyUrl: 'https://example.com/privacy',
          supportUrl: 'https://example.com/support',
        }),
      ).toThrow('Description is required');
    });

    it('throws when privacy policy URL is missing', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          name: 'My App',
          description: 'A description',
          supportUrl: 'https://example.com/support',
        }),
      ).toThrow('Privacy policy URL is required');
    });

    it('throws when app name exceeds 30 characters', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          name: 'This App Name Is Way Too Long For Apple',
          description: 'A description',
          privacyPolicyUrl: 'https://example.com/privacy',
          supportUrl: 'https://example.com/support',
        }),
      ).toThrow('App name must be 30 characters or fewer');
    });

    it('throws when subtitle exceeds 30 characters', () => {
      const { agent } = createAgent();

      expect(() =>
        agent.prepareMetadata('session-1', {
          name: 'My App',
          subtitle: 'This subtitle is way too long for Apple Store',
          description: 'A description',
          privacyPolicyUrl: 'https://example.com/privacy',
          supportUrl: 'https://example.com/support',
        }),
      ).toThrow('Subtitle must be 30 characters or fewer');
    });

    it('includes optional subcategory when provided', () => {
      const { agent } = createAgent();

      const metadata = agent.prepareMetadata('session-1', {
        name: 'My App',
        description: 'A description',
        category: 'Productivity',
        subcategory: 'Task Management',
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support',
      });

      expect(metadata.subcategory).toBe('Task Management');
    });

    it('defaults age rating to 4+ when not specified', () => {
      const { agent } = createAgent();

      const metadata = agent.prepareMetadata('session-1', {
        name: 'My App',
        description: 'A description',
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support',
      });

      expect(metadata.ageRating).toBe('4+');
    });
  });

  describe('generatePrivacyNutritionLabel', () => {
    it('generates empty label for app with no integrations', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {});

      expect(label.dataTypes).toHaveLength(0);
      expect(label.trackingEnabled).toBe(false);
      expect(label.trackingDomains).toHaveLength(0);
    });

    it('detects analytics data collection', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        integrations: [{ type: 'analytics', name: 'Firebase' }],
      });

      expect(label.dataTypes).toContainEqual({
        type: 'Analytics',
        purpose: 'Analytics',
        linked: true,
      });
      expect(label.trackingEnabled).toBe(true);
    });

    it('detects advertising data collection and tracking domains', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        integrations: [{ type: 'advertising', name: 'AdMob' }],
      });

      expect(label.dataTypes).toContainEqual({
        type: 'Advertising Data',
        purpose: 'Third-Party Advertising',
        linked: false,
      });
      expect(label.trackingEnabled).toBe(true);
      expect(label.trackingDomains).toContain('admob.tracking.com');
    });

    it('detects crash reporting data', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        integrations: [{ type: 'crash-reporting', name: 'Crashlytics' }],
      });

      expect(label.dataTypes).toContainEqual({
        type: 'Crash Data',
        purpose: 'App Functionality',
        linked: false,
      });
      // Crash reporting alone doesn't enable tracking
      expect(label.trackingEnabled).toBe(false);
    });

    it('detects authentication user data', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        authentication: { type: 'email' },
      });

      expect(label.dataTypes).toContainEqual({
        type: 'Email Address',
        purpose: 'App Functionality',
        linked: true,
      });
    });

    it('detects social auth collects name data', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        authentication: { type: 'social' },
      });

      const types = label.dataTypes.map((d) => d.type);
      expect(types).toContain('Email Address');
      expect(types).toContain('Name');
    });

    it('detects subscription purchase history', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        monetization: { model: 'subscription' },
      });

      expect(label.dataTypes).toContainEqual({
        type: 'Purchase History',
        purpose: 'App Functionality',
        linked: true,
      });
    });

    it('detects location permission usage', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        permissions: ['location'],
      });

      expect(label.dataTypes).toContainEqual({
        type: 'Precise Location',
        purpose: 'App Functionality',
        linked: true,
      });
    });

    it('combines multiple data sources correctly', () => {
      const { agent } = createAgent();

      const label = agent.generatePrivacyNutritionLabel('session-1', {
        integrations: [
          { type: 'analytics', name: 'Firebase' },
          { type: 'crash-reporting', name: 'Crashlytics' },
        ],
        authentication: { type: 'email' },
        monetization: { model: 'subscription' },
        permissions: ['photos'],
      });

      const types = label.dataTypes.map((d) => d.type);
      expect(types).toContain('Analytics');
      expect(types).toContain('Crash Data');
      expect(types).toContain('Email Address');
      expect(types).toContain('Purchase History');
      expect(types).toContain('Photos or Videos');
      expect(label.trackingEnabled).toBe(true);
    });
  });

  describe('validateIAP', () => {
    it('returns invalid when no products are configured', async () => {
      const { agent } = createAgent();

      const result = await agent.validateIAP('session-1', []);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No IAP products configured');
    });

    it('catches invalid product ID format', async () => {
      const { agent } = createAgent();

      const result = await agent.validateIAP('session-1', ['invalid product!', 'also bad@']);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('Invalid product ID format');
    });

    it('validates correctly formatted products against App Store Connect', async () => {
      const { agent, driver } = createAgent();

      const result = await agent.validateIAP('session-1', [
        'com.example.premium',
        'com.example.monthly_sub',
      ]);

      expect(driver.validateIAP).toHaveBeenCalledWith('app-123', [
        'com.example.premium',
        'com.example.monthly_sub',
      ]);
      expect(result.valid).toBe(true);
    });

    it('returns driver errors for misconfigured products', async () => {
      const { agent } = createAgent({
        validateIAP: vi.fn().mockResolvedValue({
          valid: false,
          errors: ['Product com.example.premium not found in App Store Connect'],
        }),
      });

      const result = await agent.validateIAP('session-1', ['com.example.premium']);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found in App Store Connect');
    });
  });

  describe('validateScreenshots', () => {
    it('validates correct screenshots as valid', () => {
      const { agent } = createAgent();

      const result = agent.validateScreenshots('session-1', [
        { deviceType: 'iphone-6.7', path: '/screenshots/iphone67.png' },
        { deviceType: 'ipad-12.9', path: '/screenshots/ipad.png' },
      ]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid when no screenshots provided', () => {
      const { agent } = createAgent();

      const result = agent.validateScreenshots('session-1', []);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No screenshots provided');
    });

    it('catches unknown device types', () => {
      const { agent } = createAgent();

      const result = agent.validateScreenshots('session-1', [
        { deviceType: 'iphone-6.7', path: '/screenshots/iphone.png' },
        { deviceType: 'unknown-device', path: '/screenshots/unknown.png' },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown device type');
    });

    it('requires at least one iPhone screenshot', () => {
      const { agent } = createAgent();

      const result = agent.validateScreenshots('session-1', [
        { deviceType: 'ipad-12.9', path: '/screenshots/ipad.png' },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('iPhone screenshot size');
    });

    it('catches empty screenshot paths', () => {
      const { agent } = createAgent();

      const result = agent.validateScreenshots('session-1', [
        { deviceType: 'iphone-6.7', path: '' },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty path');
    });
  });

  describe('uploadToTestFlight', () => {
    it('uploads build to TestFlight with specified groups', async () => {
      const { agent, driver } = createAgent();

      await agent.uploadToTestFlight('session-1', 'build-001', ['Beta Testers', 'QA Team']);

      expect(driver.uploadToTestFlight).toHaveBeenCalledWith('app-123', 'build-001', [
        'Beta Testers',
        'QA Team',
      ]);
    });

    it('defaults to Internal Testers group when none specified', async () => {
      const { agent, driver } = createAgent();

      await agent.uploadToTestFlight('session-1', 'build-001');

      expect(driver.uploadToTestFlight).toHaveBeenCalledWith('app-123', 'build-001', [
        'Internal Testers',
      ]);
    });
  });

  describe('submitForReview', () => {
    it('submits build for App Store review', async () => {
      const { agent, driver } = createAgent();
      const buildConfig = createDefaultBuildConfig();

      // First trigger a build to associate with session
      await agent.triggerBuild('session-1', buildConfig);
      const result = await agent.submitForReview('session-1');

      expect(result.submissionId).toBe('sub-456');
      expect(driver.submitForReview).toHaveBeenCalledWith('app-123', 'build-001');
    });

    it('throws when no build exists for session', async () => {
      const { agent } = createAgent();

      await expect(agent.submitForReview('session-no-build')).rejects.toThrow(
        'No build found for session',
      );
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
            'Your app violates Guideline 2.1 - App Completeness. The app crashed on launch.',
        }),
      });

      const result = await agent.checkReviewStatus('session-1');

      expect(result.status).toBe('rejected');
      expect(result.rejection).toBeDefined();
      expect(result.rejection!.guidelineNumber).toBe('2.1');
      expect(result.rejection!.guidelineTitle).toBe('App Completeness');
    });
  });

  describe('parseRejection', () => {
    it('extracts guideline 4.3 (Spam) from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app violates Guideline 4.3 - Spam. The app duplicates existing functionality.',
      );

      expect(rejection.guidelineNumber).toBe('4.3');
      expect(rejection.guidelineTitle).toBe('Spam');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts guideline 2.1 (App Completeness) from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Guideline 2.1 - App Completeness: The app contains placeholder content.',
      );

      expect(rejection.guidelineNumber).toBe('2.1');
      expect(rejection.guidelineTitle).toBe('App Completeness');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts guideline 5.1.1 (Data Collection) from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app does not comply with Guideline 5.1.1 regarding data collection.',
      );

      expect(rejection.guidelineNumber).toBe('5.1.1');
      expect(rejection.guidelineTitle).toBe('Data Collection and Storage');
      expect(rejection.severity).toBe('critical');
    });

    it('extracts guideline 3.1.1 (In-App Purchase) from rejection text', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Guideline 3.1.1 - In-App Purchase: Digital content must use IAP.',
      );

      expect(rejection.guidelineNumber).toBe('3.1.1');
      expect(rejection.guidelineTitle).toBe('In-App Purchase');
      expect(rejection.severity).toBe('critical');
    });

    it('handles unknown guideline numbers gracefully', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Your app was rejected for an unspecified reason.',
      );

      expect(rejection.guidelineNumber).toBe('unknown');
      expect(rejection.guidelineTitle).toBe('Unknown Guideline');
      expect(rejection.severity).toBe('major');
    });

    it('includes original rejection text in description', () => {
      const { agent } = createAgent();
      const text = 'Guideline 2.3 - Your metadata is inaccurate.';

      const rejection = agent.parseRejection(text);

      expect(rejection.description).toBe(text);
    });

    it('generates remediation steps for known guidelines', () => {
      const { agent } = createAgent();

      const rejection = agent.parseRejection(
        'Guideline 3.1.1 - In-App Purchase violation detected.',
      );

      expect(rejection.remediationSteps.length).toBeGreaterThan(0);
      expect(rejection.remediationSteps[0]).toContain('In-App Purchase');
    });
  });

  describe('generateRemediationPlan', () => {
    it('returns specific steps for guideline 2.1', () => {
      const { agent } = createAgent();

      const steps = agent.generateRemediationPlan({
        guidelineNumber: '2.1',
        guidelineTitle: 'App Completeness',
        description: 'App crashed on launch',
        remediationSteps: [],
        severity: 'critical',
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((s) => s.toLowerCase().includes('functional'))).toBe(true);
    });

    it('returns specific steps for guideline 5.1.1', () => {
      const { agent } = createAgent();

      const steps = agent.generateRemediationPlan({
        guidelineNumber: '5.1.1',
        guidelineTitle: 'Data Collection and Storage',
        description: 'Privacy policy incomplete',
        remediationSteps: [],
        severity: 'critical',
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((s) => s.toLowerCase().includes('privacy'))).toBe(true);
    });

    it('returns generic steps for unknown guidelines', () => {
      const { agent } = createAgent();

      const steps = agent.generateRemediationPlan({
        guidelineNumber: '99.9',
        guidelineTitle: 'Unknown Rule',
        description: 'Something went wrong',
        remediationSteps: [],
        severity: 'minor',
      });

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('99.9');
    });
  });

  describe('getMCPTools', () => {
    it('exposes exactly 5 MCP tools', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();

      expect(tools).toHaveLength(5);
    });

    it('exposes apple.validateMetadata tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'apple.validateMetadata');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('metadata');
      expect(tool!.inputSchema.type).toBe('object');
      expect((tool!.inputSchema.required as string[])).toContain('appName');
    });

    it('exposes apple.uploadScreenshots tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'apple.uploadScreenshots');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('screenshot');
      expect((tool!.inputSchema.required as string[])).toContain('screenshots');
    });

    it('exposes apple.submitForReview tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'apple.submitForReview');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('review');
      expect((tool!.inputSchema.required as string[])).toContain('sessionId');
    });

    it('exposes apple.checkReviewStatus tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'apple.checkReviewStatus');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('review status');
    });

    it('exposes apple.uploadBuild tool', () => {
      const { agent } = createAgent();

      const tools = agent.getMCPTools();
      const tool = tools.find((t) => t.name === 'apple.uploadBuild');

      expect(tool).toBeDefined();
      expect(tool!.description).toContain('build');
      expect((tool!.inputSchema.required as string[])).toContain('bundleId');
      expect((tool!.inputSchema.required as string[])).toContain('teamId');
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
