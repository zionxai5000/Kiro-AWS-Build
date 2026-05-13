/**
 * ZionX App Development Studio — End-to-End Integration Tests
 *
 * Validates: Requirements 42a-42n, 19.2
 *
 * Capstone integration tests that wire together multiple studio services
 * (using real in-memory implementations) to verify end-to-end flows:
 * - Full app creation flow
 * - Store asset flow
 * - Ad creative flow
 * - Apple submission flow
 * - Google submission flow
 * - Hook integration
 * - Gate blocking
 * - Governance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Real service implementations
import { DefaultStudioSessionManager } from '../session-manager.js';
import { DefaultStoreAssetGeneratorService } from '../store-assets.js';
import type { ScreenshotCapturer, ImageGenerator, CaptionGenerator, StoreAssetGeneratorConfig } from '../store-assets.js';
import { DefaultAdStudioService } from '../ad-studio.js';
import type { VideoGenerator } from '../ad-studio.js';
import { DefaultBuildPanelService } from '../build-panel.js';
import type { BuildPanelConfig, GateChecker, HookEmitter as BuildHookEmitter } from '../build-panel.js';
import { DefaultStudioHookService } from '../hooks.js';
import type {
  EventBusPublisher,
  WebSocketNotifier,
  ReworkTaskCreator,
  ApprovalRequester,
} from '../hooks.js';
import { DefaultStudioGovernanceService } from '../governance.js';
import type { MishmarGateway, AuditLogger, GovernanceConfig } from '../governance.js';
import { AIEditController } from '../edit-controller.js';
import type { CodeGenerator, TestRunner } from '../edit-controller.js';
import { PreviewServer } from '../preview-server.js';
import type { WebSocketSender, ScreenshotRenderer } from '../preview-server.js';
import { DefaultAppleReleaseAgent } from '../agents/apple-release-agent.js';
import type { AppStoreConnectDriver, XcodeBuildSystem } from '../agents/apple-release-agent.js';
import { DefaultGooglePlayReleaseAgent } from '../agents/google-play-release-agent.js';
import type { GooglePlayConsoleDriver, GradleBuildSystem } from '../agents/google-play-release-agent.js';


// ---------------------------------------------------------------------------
// Shared Mock Factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusPublisher & { published: { source: string; type: string; detail: Record<string, unknown> }[] } {
  const published: { source: string; type: string; detail: Record<string, unknown> }[] = [];
  return {
    published,
    publish: vi.fn(async (event) => { published.push(event); }),
  };
}

function createMockWebSocketNotifier(): WebSocketNotifier & { notifications: { sessionId: string; event: { type: string; payload: Record<string, unknown> } }[] } {
  const notifications: { sessionId: string; event: { type: string; payload: Record<string, unknown> } }[] = [];
  return {
    notifications,
    notify: vi.fn((sessionId, event) => { notifications.push({ sessionId, event }); }),
  };
}

function createMockReworkCreator(): ReworkTaskCreator & { calls: { sessionId: string; agentId: string; failureDetails: Record<string, unknown> }[] } {
  const calls: { sessionId: string; agentId: string; failureDetails: Record<string, unknown> }[] = [];
  let counter = 0;
  return {
    calls,
    createReworkTask: vi.fn(async (sessionId, agentId, failureDetails) => {
      calls.push({ sessionId, agentId, failureDetails });
      counter++;
      return `rework-task-${counter}`;
    }),
  };
}

function createMockApprovalRequester(): ApprovalRequester & { calls: { sessionId: string; action: string; details: Record<string, unknown> }[] } {
  const calls: { sessionId: string; action: string; details: Record<string, unknown> }[] = [];
  return {
    calls,
    requestApproval: vi.fn(async (sessionId, action, details) => {
      calls.push({ sessionId, action, details });
    }),
  };
}

function createMockHookEmitter(): BuildHookEmitter & { emitted: { hookName: string; payload: Record<string, unknown> }[] } {
  const emitted: { hookName: string; payload: Record<string, unknown> }[] = [];
  return {
    emitted,
    emit: vi.fn((hookName, payload) => { emitted.push({ hookName, payload }); }),
  };
}

function createMockGateChecker(allowed = true, blockers: { id: string; name: string }[] = []): GateChecker {
  return {
    canProgress: vi.fn(async () => ({ allowed, blockers })),
  };
}

function createMockScreenshotCapturer(): ScreenshotCapturer {
  return {
    capture: vi.fn(async () => Buffer.from('fake-screenshot-png')),
  };
}

function createMockImageGenerator(): ImageGenerator {
  return {
    generateIcon: vi.fn(async () => Buffer.from('fake-icon-png')),
    generateFeatureGraphic: vi.fn(async () => Buffer.from('fake-feature-graphic-png')),
    generatePromoBanner: vi.fn(async () => Buffer.from('fake-promo-banner-png')),
  };
}

function createMockCaptionGenerator(): CaptionGenerator {
  return {
    generateCaptions: vi.fn(async () => new Map([['en', 'A great app']])),
  };
}

function createMockVideoGenerator(): VideoGenerator {
  return {
    generateVerticalAd: vi.fn(async () => ({ buffer: Buffer.from('vertical-video'), fileSize: 5_000_000 })),
    generateHorizontalAd: vi.fn(async () => ({ buffer: Buffer.from('horizontal-video'), fileSize: 8_000_000 })),
    generateBumperAd: vi.fn(async () => ({ buffer: Buffer.from('bumper-video'), fileSize: 2_000_000 })),
    generatePlayableAd: vi.fn(async () => ({ buffer: Buffer.from('playable-html'), fileSize: 3_000_000 })),
  };
}

function createMockCodeGenerator(): CodeGenerator {
  return {
    generateEdit: vi.fn(async (_sessionId, _command, _currentFiles) => [
      {
        path: 'src/App.tsx',
        previousContent: '// old content',
        newContent: '// new content after edit',
        type: 'modify' as const,
      },
    ]),
  };
}

function createMockTestRunner(allPass = true): TestRunner {
  return {
    runTests: vi.fn(async () => [
      { name: 'App renders', passed: allPass, duration: 50 },
      { name: 'Navigation works', passed: allPass, duration: 30 },
    ]),
  };
}

function createMockWebSocketSender(): WebSocketSender {
  return {
    send: vi.fn(),
    isConnected: vi.fn(() => true),
  };
}

function createMockScreenshotRenderer(): ScreenshotRenderer {
  return {
    capture: vi.fn(async () => Buffer.from('preview-screenshot')),
  };
}

function createMockMishmarGateway(approveAll = true): MishmarGateway {
  return {
    checkAuthorization: vi.fn(async () => ({
      allowed: approveAll,
      reason: approveAll ? 'Authorized' : 'Requires King approval',
      requiredApproval: approveAll ? undefined : 'L1' as const,
    })),
    requestApproval: vi.fn(async () => ({
      approved: approveAll,
      approvalId: approveAll ? `approval-${Date.now()}` : undefined,
    })),
  };
}

function createMockAuditLogger(): AuditLogger & { entries: unknown[] } {
  const entries: unknown[] = [];
  let counter = 0;
  return {
    entries,
    log: vi.fn(async (entry) => {
      entries.push(entry);
      counter++;
      return `audit-${counter}`;
    }),
    getTrail: vi.fn(async (sessionId) => {
      return entries.filter((e: any) => e.sessionId === sessionId) as any[];
    }),
  };
}

function createMockAppStoreConnectDriver(): AppStoreConnectDriver {
  return {
    createApp: vi.fn(async () => ({ appId: 'apple-app-123' })),
    uploadBuild: vi.fn(async () => ({ buildId: 'build-001', status: 'processing' })),
    submitForReview: vi.fn(async () => ({ submissionId: 'sub-001' })),
    checkReviewStatus: vi.fn(async () => ({ status: 'approved' })),
    updateMetadata: vi.fn(async () => {}),
    uploadScreenshots: vi.fn(async () => {}),
    validateIAP: vi.fn(async () => ({ valid: true, errors: [] })),
    uploadToTestFlight: vi.fn(async () => {}),
  };
}

function createMockXcodeBuildSystem(): XcodeBuildSystem {
  return {
    triggerBuild: vi.fn(async () => ({
      buildId: 'xcode-build-001',
      status: 'building',
      outputPath: '/tmp/builds/ios/app.ipa',
    })),
    getBuildStatus: vi.fn(async () => ({ status: 'success', progress: 100 })),
    signBuild: vi.fn(async () => ({ signed: true, outputPath: '/tmp/builds/ios/app-signed.ipa' })),
  };
}

function createMockGooglePlayConsoleDriver(): GooglePlayConsoleDriver {
  return {
    createListing: vi.fn(async () => ({ appId: 'google-app-456' })),
    uploadAAB: vi.fn(async () => ({ versionCode: 1, status: 'uploaded' })),
    submitForReview: vi.fn(async () => ({ releaseId: 'release-001' })),
    checkReviewStatus: vi.fn(async () => ({ status: 'approved' })),
    updateMetadata: vi.fn(async () => {}),
    uploadAssets: vi.fn(async () => {}),
    validateBilling: vi.fn(async () => ({ valid: true, errors: [] })),
    promoteToProduction: vi.fn(async () => {}),
    uploadToClosedTesting: vi.fn(async () => ({ trackId: 'closed-track-001' })),
  };
}

function createMockGradleBuildSystem(): GradleBuildSystem {
  return {
    triggerBuild: vi.fn(async () => ({
      buildId: 'gradle-build-001',
      status: 'building',
      outputPath: '/tmp/builds/android/app.aab',
    })),
    getBuildStatus: vi.fn(async () => ({ status: 'success', progress: 100 })),
    signAAB: vi.fn(async () => ({ signed: true, outputPath: '/tmp/builds/android/app-signed.aab' })),
  };
}


// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Studio End-to-End Integration', () => {
  // Shared real services
  let sessionManager: DefaultStudioSessionManager;
  let hookEmitter: ReturnType<typeof createMockHookEmitter>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let wsNotifier: ReturnType<typeof createMockWebSocketNotifier>;
  let reworkCreator: ReturnType<typeof createMockReworkCreator>;
  let approvalRequester: ReturnType<typeof createMockApprovalRequester>;
  let hookService: DefaultStudioHookService;
  let auditLogger: ReturnType<typeof createMockAuditLogger>;

  beforeEach(() => {
    sessionManager = new DefaultStudioSessionManager();
    hookEmitter = createMockHookEmitter();
    eventBus = createMockEventBus();
    wsNotifier = createMockWebSocketNotifier();
    reworkCreator = createMockReworkCreator();
    approvalRequester = createMockApprovalRequester();
    hookService = new DefaultStudioHookService(eventBus, wsNotifier, reworkCreator, approvalRequester);
    auditLogger = createMockAuditLogger();
  });

  // =========================================================================
  // Flow 1: Full App Creation Flow
  // King describes app → spec generated → code generated → preview renders →
  // edit applied → preview reloads
  // =========================================================================

  describe('Full App Creation Flow', () => {
    it('creates session, generates code, applies edit, and reloads preview', async () => {
      // 1. King describes app → session created
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'MyApp',
        appDescription: 'A fitness tracking app',
        targetPlatforms: ['ios', 'android'],
      });
      expect(session.sessionId).toBeDefined();
      expect(session.projectState.appName).toBe('MyApp');

      // 2. Spec generated → project state updated with design system
      await sessionManager.updateProjectState(session.sessionId, {
        designSystem: {
          colorPalette: { primary: '#FF5722', secondary: '#2196F3' },
          typography: { heading: 'Inter', body: 'Roboto' },
          spacing: { sm: 8, md: 16, lg: 24 },
          components: ['Button', 'Card', 'Input'],
          iconography: 'material',
          animations: { transition: 'ease-in-out' },
        },
        screens: [
          { id: 'home', name: 'Home', route: '/', components: ['Header', 'FeedList'], layout: 'stack' },
          { id: 'profile', name: 'Profile', route: '/profile', components: ['Avatar', 'Stats'], layout: 'scroll' },
        ],
        navigation: { type: 'tab', screens: ['home', 'profile'], initialRoute: '/' },
      });

      // 3. Code generated → file tree updated
      await sessionManager.updateFileTree(session.sessionId, [
        { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: '// App component' },
        { path: 'src/screens/Home.tsx', name: 'Home.tsx', type: 'file', content: '// Home screen' },
        { path: 'src/screens/Profile.tsx', name: 'Profile.tsx', type: 'file', content: '// Profile screen' },
      ]);

      // 4. Preview renders → preview server set up
      const wsSender = createMockWebSocketSender();
      const renderer = createMockScreenshotRenderer();
      const previewServer = new PreviewServer(wsSender, renderer);
      const previewSession = previewServer.createSession(session.sessionId);
      expect(previewSession.status).toBe('running');

      // 5. Edit applied → code changes, tests run, preview reloads
      const codeGenerator = createMockCodeGenerator();
      const testRunner = createMockTestRunner(true);
      const editController = new AIEditController({
        sessionManager,
        previewServer,
        codeGenerator,
        testRunner,
        hookEmitter,
      });

      const editResult = await editController.applyEdit(session.sessionId, 'Add a dark mode toggle');
      expect(editResult.success).toBe(true);
      expect(editResult.testsPassed).toBe(true);

      // 6. Verify hook was emitted for code change
      expect(hookEmitter.emitted.some((e) => e.hookName === 'app.code.changed')).toBe(true);

      // 7. Verify preview reload was triggered
      expect(wsSender.send).toHaveBeenCalledWith(
        session.sessionId,
        expect.objectContaining({ type: 'preview.reload' }),
      );

      // 8. Verify session undo stack has the edit
      const updatedSession = await sessionManager.getSession(session.sessionId);
      expect(updatedSession!.undoStack).toHaveLength(1);
    });
  });

  // =========================================================================
  // Flow 2: Store Asset Flow
  // Preview active → capture screenshots → generate icon → generate feature
  // graphic → validate all → pass
  // =========================================================================

  describe('Store Asset Flow', () => {
    it('captures screenshots, generates icon and feature graphic, validates all assets', async () => {
      // Setup session with preview active
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'FitTracker',
        appDescription: 'Track your fitness goals',
        targetPlatforms: ['ios', 'android'],
      });

      // Create store asset service with mock dependencies
      const screenshotCapturer = createMockScreenshotCapturer();
      const imageGenerator = createMockImageGenerator();
      const captionGenerator = createMockCaptionGenerator();
      const assetConfig: StoreAssetGeneratorConfig = {
        previewBaseUrl: 'http://localhost:19000',
        outputDir: '/tmp/assets',
        appName: 'FitTracker',
        appDescription: 'Track your fitness goals',
        appTagline: 'Your fitness companion',
        designSystem: { primary: '#FF5722' },
        targetPlatforms: ['apple', 'google'],
      };

      const storeAssetService = new DefaultStoreAssetGeneratorService(
        screenshotCapturer,
        imageGenerator,
        captionGenerator,
        hookEmitter,
        assetConfig,
      );

      // 1. Capture screenshots from preview
      const screenshots = await storeAssetService.captureAllScreenshots(session.sessionId);
      expect(screenshots.length).toBeGreaterThan(0);
      expect(screenshots.every((s) => s.type === 'screenshot')).toBe(true);

      // 2. Generate app icon
      const icon = await storeAssetService.generateAppIcon(session.sessionId);
      expect(icon.type).toBe('app-icon');
      expect(icon.id).toBeDefined();

      // 3. Generate feature graphic
      const featureGraphic = await storeAssetService.generateFeatureGraphic(session.sessionId);
      expect(featureGraphic.type).toBe('feature-graphic');

      // 4. Validate all assets
      const validation = await storeAssetService.validateAssets(session.sessionId);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // 5. Verify all assets are stored
      const allAssets = await storeAssetService.getAssets(session.sessionId);
      expect(allAssets.length).toBeGreaterThanOrEqual(3); // screenshots + icon + feature graphic
    });
  });

  // =========================================================================
  // Flow 3: Ad Creative Flow
  // Preview active → generate vertical ad → validate for AdMob → export
  // =========================================================================

  describe('Ad Creative Flow', () => {
    it('generates vertical ad, validates for AdMob, and exports', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'FitTracker',
      });

      // Create ad studio service with mock video generator
      const videoGenerator = createMockVideoGenerator();
      const adStudioService = new DefaultAdStudioService(videoGenerator);

      // 1. Generate vertical ad from preview
      const creative = await adStudioService.generateVerticalAd(session.sessionId);
      expect(creative.format).toBe('vertical-15s');
      expect(creative.width).toBe(1080);
      expect(creative.height).toBe(1920);
      expect(creative.durationSeconds).toBe(15);
      expect(creative.sessionId).toBe(session.sessionId);

      // 2. Validate for AdMob
      const validation = await adStudioService.validateCreative(creative.id, 'admob');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // 3. Export for AdMob network
      const exportResult = await adStudioService.exportForNetwork(creative.id, 'admob');
      expect(exportResult.ready).toBe(true);
      expect(exportResult.format).toBe('mp4');
      expect(exportResult.filePath).toContain('admob');
    });
  });

  // =========================================================================
  // Flow 4: Apple Submission Flow
  // Build triggered → signed → metadata prepared → screenshots uploaded →
  // submitted for review
  // =========================================================================

  describe('Apple Submission Flow', () => {
    it('triggers build, signs, prepares metadata, uploads screenshots, and submits', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'FitTracker',
        appDescription: 'Track your fitness goals',
      });

      // Create Apple release agent
      const appStoreDriver = createMockAppStoreConnectDriver();
      const xcodeBuild = createMockXcodeBuildSystem();
      const appleAgent = new DefaultAppleReleaseAgent(appStoreDriver, xcodeBuild, {
        appId: 'apple-app-123',
        teamId: 'TEAM123',
      });

      // Create build panel service
      const gateChecker = createMockGateChecker(true);
      const buildPanel = new DefaultBuildPanelService({
        hookEmitter,
        gateChecker,
      });

      // 1. Trigger iOS build
      const buildResult = await appleAgent.triggerBuild(session.sessionId, {
        scheme: 'FitTracker',
        configuration: 'Release',
        destination: 'generic/platform=iOS',
      });
      expect(buildResult.buildId).toBeDefined();
      expect(buildResult.status).toBe('building');

      // Also start build in build panel
      await buildPanel.startIOSBuild(session.sessionId);
      const iosBuildState = await buildPanel.getIOSBuildState(session.sessionId);
      expect(iosBuildState.status).toBe('building');

      // 2. Sign the build
      const signResult = await xcodeBuild.signBuild(buildResult.buildId, 'distribution');
      expect(signResult.signed).toBe(true);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'signing', true);

      // 3. Prepare metadata
      const metadata = appleAgent.prepareMetadata(session.sessionId, {
        name: 'FitTracker',
        subtitle: 'Your fitness companion',
        description: 'Track your fitness goals with ease',
        keywords: ['fitness', 'health', 'tracker'],
        category: 'Health & Fitness',
        privacyPolicyUrl: 'https://fittracker.app/privacy',
        supportUrl: 'https://fittracker.app/support',
        copyright: '2024 Seraphim',
      });
      expect(metadata.appName).toBe('FitTracker');
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'metadata', true);

      // 4. Upload screenshots (via App Store Connect driver)
      await appStoreDriver.uploadScreenshots('apple-app-123', [
        { deviceType: 'iphone-6.7', locale: 'en-US', screenshots: [] },
      ]);
      expect(appStoreDriver.uploadScreenshots).toHaveBeenCalled();
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'screenshots', true);

      // 5. Complete remaining checklist items
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'privacyPolicy', true);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'iapSandbox', true);

      // 6. Submit for review
      const submission = await appleAgent.submitForReview(session.sessionId);
      expect(submission.submissionId).toBe('sub-001');

      // 7. Verify hook emitted for build creation
      expect(hookEmitter.emitted.some((e) => e.hookName === 'app.ios.build.created')).toBe(true);
    });
  });

  // =========================================================================
  // Flow 5: Google Submission Flow
  // Build triggered → signed → metadata prepared → Data Safety form →
  // closed track → production
  // =========================================================================

  describe('Google Submission Flow', () => {
    it('triggers build, signs, prepares metadata, fills Data Safety, deploys to closed track then production', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'FitTracker',
        appDescription: 'Track your fitness goals',
      });

      // Create Google Play release agent
      const playConsoleDriver = createMockGooglePlayConsoleDriver();
      const gradleBuild = createMockGradleBuildSystem();
      const googleAgent = new DefaultGooglePlayReleaseAgent(playConsoleDriver, gradleBuild, {
        appId: 'google-app-456',
        packageName: 'com.seraphim.fittracker',
      });

      // Create build panel service
      const gateChecker = createMockGateChecker(true);
      const buildPanel = new DefaultBuildPanelService({
        hookEmitter,
        gateChecker,
      });

      // 1. Trigger Android build
      const buildResult = await googleAgent.triggerBuild(session.sessionId, {
        flavor: 'production',
        buildType: 'release',
        versionName: '1.0.0',
        versionCode: 1,
      });
      expect(buildResult.buildId).toBeDefined();
      expect(buildResult.status).toBe('building');

      // Also start build in build panel
      await buildPanel.startAndroidBuild(session.sessionId);
      const androidBuildState = await buildPanel.getAndroidBuildState(session.sessionId);
      expect(androidBuildState.status).toBe('building');

      // 2. Sign the AAB
      const signResult = await gradleBuild.signAAB(buildResult.buildId, 'upload-key');
      expect(signResult.signed).toBe(true);
      await buildPanel.updateChecklist(session.sessionId, 'android', 'signing', true);

      // 3. Prepare metadata
      const metadata = googleAgent.prepareMetadata(session.sessionId, {
        title: 'FitTracker',
        shortDescription: 'Your fitness companion',
        fullDescription: 'Track your fitness goals with ease',
        category: 'HEALTH_AND_FITNESS',
        contactEmail: 'dev@seraphim.io',
        privacyPolicyUrl: 'https://fittracker.app/privacy',
      });
      expect(metadata.title).toBe('FitTracker');
      await buildPanel.updateChecklist(session.sessionId, 'android', 'metadata', true);

      // 4. Generate Data Safety form
      const dataSafety = googleAgent.generateDataSafetyForm(session.sessionId, {
        authentication: { type: 'email' },
        monetization: { model: 'subscription' },
        integrations: [
          { type: 'analytics', name: 'Firebase Analytics' },
        ],
      });
      expect(dataSafety.securityPractices.encrypted).toBe(true);
      expect(dataSafety.dataCollected.length).toBeGreaterThan(0);

      // 5. Upload to closed testing track
      await googleAgent.uploadToClosedTesting(
        session.sessionId,
        buildResult.buildId,
        'internal',
        ['internal-testers'],
      );
      expect(playConsoleDriver.uploadToClosedTesting).toHaveBeenCalledWith(
        'google-app-456',
        'internal',
        ['internal-testers'],
      );

      // 6. Promote to production
      await googleAgent.promoteToProduction(session.sessionId, 'release-001');
      expect(playConsoleDriver.promoteToProduction).toHaveBeenCalledWith('google-app-456', 'release-001');
      // 7. Complete remaining checklist items
      await buildPanel.updateChecklist(session.sessionId, 'android', 'privacyPolicy', true);
      await buildPanel.updateChecklist(session.sessionId, 'android', 'screenshots', true);
      await buildPanel.updateChecklist(session.sessionId, 'android', 'iapSandbox', true);

      // 8. Verify hook emitted for build creation
      expect(hookEmitter.emitted.some((e) => e.hookName === 'app.android.build.created')).toBe(true);
    });
  });

  // =========================================================================
  // Flow 6: Hook Integration
  // Edit applied → `app.code.changed` fires → tests run → preview updates
  // =========================================================================

  describe('Hook Integration', () => {
    it('fires app.code.changed hook after edit, runs tests, and updates preview', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'MyApp',
      });

      // Set up file tree so edit controller can find files
      await sessionManager.updateFileTree(session.sessionId, [
        { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: '// old content' },
      ]);

      // Wire up real services
      const wsSender = createMockWebSocketSender();
      const renderer = createMockScreenshotRenderer();
      const previewServer = new PreviewServer(wsSender, renderer);
      previewServer.createSession(session.sessionId);

      const codeGenerator = createMockCodeGenerator();
      const testRunner = createMockTestRunner(true);
      const editController = new AIEditController({
        sessionManager,
        previewServer,
        codeGenerator,
        testRunner,
        hookEmitter,
      });

      // Apply edit
      const result = await editController.applyEdit(session.sessionId, 'Change button color to blue');
      expect(result.success).toBe(true);

      // Verify: app.code.changed hook was emitted
      const codeChangedHook = hookEmitter.emitted.find((e) => e.hookName === 'app.code.changed');
      expect(codeChangedHook).toBeDefined();
      expect(codeChangedHook!.payload.sessionId).toBe(session.sessionId);

      // Verify: tests were run
      expect(testRunner.runTests).toHaveBeenCalled();
      expect(result.testsPassed).toBe(true);

      // Verify: preview was reloaded via WebSocket
      expect(wsSender.send).toHaveBeenCalledWith(
        session.sessionId,
        expect.objectContaining({ type: 'preview.reload' }),
      );
    });
  });

  // =========================================================================
  // Flow 7: Gate Blocking
  // Critical gate fails → submission blocked → rework task created →
  // gate rerun after fix
  // =========================================================================

  describe('Gate Blocking', () => {
    it('blocks submission when gate fails, creates rework task, and allows after fix', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'MyApp',
      });

      // Create build panel with a failing gate checker
      const failingGateChecker = createMockGateChecker(false, [
        { id: 'apple-screenshots', name: 'Apple Screenshots Validation' },
      ]);
      const buildPanel = new DefaultBuildPanelService({
        hookEmitter,
        gateChecker: failingGateChecker,
      });

      // Start builds and complete checklists
      await buildPanel.startIOSBuild(session.sessionId);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'signing', true);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'metadata', true);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'privacyPolicy', true);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'screenshots', true);
      await buildPanel.updateChecklist(session.sessionId, 'ios', 'iapSandbox', true);

      // 1. Check submission readiness — should be blocked by gate
      const readiness = await buildPanel.checkSubmissionReadiness(session.sessionId);
      expect(readiness.ready).toBe(false);
      expect(readiness.blockers).toContain('Gate blocker: Apple Screenshots Validation');

      // 2. Hook service handles gate failure → creates rework task
      const gateFailureResult = await hookService.handleGateFailure(
        session.sessionId,
        'apple-screenshots',
        '',
        { reason: 'Screenshots do not meet size requirements' },
      );
      expect(gateFailureResult.reworkTaskId).toBeDefined();
      expect(reworkCreator.calls).toHaveLength(1);
      expect(reworkCreator.calls[0].agentId).toBe('store-asset-agent');

      // 3. Verify gate failure hook was emitted
      const gateFailedEvent = eventBus.published.find((e) => e.type === 'app.store.gate.failed');
      expect(gateFailedEvent).toBeDefined();
      expect(gateFailedEvent!.detail.gateId).toBe('apple-screenshots');

      // 4. After fix: gate now passes
      const passingGateChecker = createMockGateChecker(true);
      const fixedBuildPanel = new DefaultBuildPanelService({
        hookEmitter,
        gateChecker: passingGateChecker,
      });

      // Re-create the build state (simulating the fix was applied)
      await fixedBuildPanel.startIOSBuild(session.sessionId);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'ios', 'signing', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'ios', 'metadata', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'ios', 'privacyPolicy', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'ios', 'screenshots', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'ios', 'iapSandbox', true);

      // Also need Android checklist complete for full readiness
      await fixedBuildPanel.startAndroidBuild(session.sessionId);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'android', 'signing', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'android', 'metadata', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'android', 'privacyPolicy', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'android', 'screenshots', true);
      await fixedBuildPanel.updateChecklist(session.sessionId, 'android', 'iapSandbox', true);

      const fixedReadiness = await fixedBuildPanel.checkSubmissionReadiness(session.sessionId);
      expect(fixedReadiness.ready).toBe(true);
      expect(fixedReadiness.blockers).toHaveLength(0);
    });
  });

  // =========================================================================
  // Flow 8: Governance
  // Submission attempted → Mishmar requires King approval → approved → submitted
  // =========================================================================

  describe('Governance', () => {
    it('requires King approval via Mishmar before submission, then submits after approval', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'MyApp',
      });

      // Create governance service that initially blocks, then approves
      const mishmarGateway = createMockMishmarGateway(true);
      const governanceService = new DefaultStudioGovernanceService({
        mishmarGateway,
        auditLogger,
        agentId: 'zionx-studio-agent',
      });

      // 1. Authorize submission action — Mishmar checks authorization
      const authDecision = await governanceService.authorize(
        session.sessionId,
        'app.submit',
        { platform: 'ios' },
      );
      expect(authDecision.allowed).toBe(true);
      expect(mishmarGateway.checkAuthorization).toHaveBeenCalledWith(
        'app.submit',
        expect.objectContaining({ sessionId: session.sessionId }),
      );

      // 2. Request submission approval (King L1 authority)
      const approvalResult = await governanceService.requestSubmissionApproval(session.sessionId);
      expect(approvalResult.approved).toBe(true);
      expect(approvalResult.reason).toContain('King approval granted');
      expect(mishmarGateway.requestApproval).toHaveBeenCalledWith(
        session.sessionId,
        'app.submit',
        expect.objectContaining({ requiredAuthority: 'L1', type: 'store-submission' }),
      );

      // 3. Verify audit trail was logged
      const trail = await governanceService.getAuditTrail(session.sessionId);
      expect(trail.length).toBeGreaterThanOrEqual(2); // auth check + approval request

      // 4. After approval, hook service emits submission ready
      await hookService.handleSubmissionReady(session.sessionId);
      expect(approvalRequester.calls).toHaveLength(1);
      expect(approvalRequester.calls[0].action).toBe('app.submission');

      // 5. Verify submission ready event was published
      const submissionEvent = eventBus.published.find((e) => e.type === 'app.submission.ready');
      expect(submissionEvent).toBeDefined();
    });

    it('blocks submission when King denies approval', async () => {
      const session = await sessionManager.createSession('tenant-1', 'app-1', {
        appName: 'MyApp',
      });

      // Create governance service that denies approval
      const denyingMishmar = createMockMishmarGateway(false);
      const governanceService = new DefaultStudioGovernanceService({
        mishmarGateway: denyingMishmar,
        auditLogger,
        agentId: 'zionx-studio-agent',
      });

      // 1. Authorization check — blocked
      const authDecision = await governanceService.authorize(
        session.sessionId,
        'app.submit',
      );
      expect(authDecision.allowed).toBe(false);
      expect(authDecision.requiredApproval).toBe('L1');

      // 2. Request approval — denied
      const approvalResult = await governanceService.requestSubmissionApproval(session.sessionId);
      expect(approvalResult.approved).toBe(false);
      expect(approvalResult.reason).toContain('denied');

      // 3. Verify audit trail records the blocked action
      const trail = await governanceService.getAuditTrail(session.sessionId);
      const blockedEntries = trail.filter((e: any) => e.outcome === 'blocked');
      expect(blockedEntries.length).toBeGreaterThanOrEqual(1);
    });
  });
});
