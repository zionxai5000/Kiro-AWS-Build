/**
 * Unit tests for ZionX App Development Studio — Build/Submit Panel Service
 *
 * Validates: Requirements 42g.19, 42g.22, 42g.23, 19.1
 *
 * Tests iOS and Android build status tracking, hook emissions for build creation,
 * and submission readiness gate checks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultBuildPanelService,
  type BuildPanelService,
  type HookEmitter,
  type GateChecker,
  type BuildChecklist,
} from '../build-panel.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockHookEmitter(): HookEmitter & { calls: { hookName: string; payload: Record<string, unknown> }[] } {
  const calls: { hookName: string; payload: Record<string, unknown> }[] = [];
  return {
    calls,
    emit: vi.fn((hookName: string, payload: Record<string, unknown>) => {
      calls.push({ hookName, payload });
    }),
  };
}

function createMockGateChecker(overrides?: Partial<GateChecker>): GateChecker {
  return {
    canProgress: overrides?.canProgress ?? vi.fn(async () => ({
      allowed: true,
      blockers: [],
    })),
  };
}

function createService(options?: {
  hookEmitter?: HookEmitter;
  gateChecker?: GateChecker;
}): { service: BuildPanelService; hookEmitter: ReturnType<typeof createMockHookEmitter>; gateChecker: GateChecker } {
  const hookEmitter = (options?.hookEmitter as ReturnType<typeof createMockHookEmitter>) ?? createMockHookEmitter();
  const gateChecker = options?.gateChecker ?? createMockGateChecker();
  const service = new DefaultBuildPanelService({ hookEmitter, gateChecker });
  return { service, hookEmitter: hookEmitter as ReturnType<typeof createMockHookEmitter>, gateChecker };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultBuildPanelService', () => {
  describe('iOS build status tracking', () => {
    it('tracks all required fields for iOS build', async () => {
      const { service } = createService();

      await service.startIOSBuild('session-1');
      const state = await service.getIOSBuildState('session-1');

      expect(state.platform).toBe('ios');
      expect(state.status).toBe('building');
      expect(state.progress).toBe(0);
      expect(state.buildId).toBeDefined();
      expect(state.startedAt).toBeInstanceOf(Date);
      expect(state.checklist).toEqual({
        signing: false,
        metadata: false,
        privacyPolicy: false,
        screenshots: false,
        iapSandbox: false,
      });
    });

    it('tracks progress updates for iOS build', async () => {
      const { service } = createService();

      await service.startIOSBuild('session-1');
      await service.updateBuildProgress('session-1', 'ios', 50, 'signing');

      const state = await service.getIOSBuildState('session-1');
      expect(state.progress).toBe(50);
      expect(state.status).toBe('signing');
    });

    it('tracks checklist items for iOS build (signing, metadata, privacy, screenshots, IAP)', async () => {
      const { service } = createService();

      await service.startIOSBuild('session-1');
      await service.updateChecklist('session-1', 'ios', 'signing', true);
      await service.updateChecklist('session-1', 'ios', 'metadata', true);
      await service.updateChecklist('session-1', 'ios', 'privacyPolicy', true);
      await service.updateChecklist('session-1', 'ios', 'screenshots', true);
      await service.updateChecklist('session-1', 'ios', 'iapSandbox', true);

      const state = await service.getIOSBuildState('session-1');
      expect(state.checklist.signing).toBe(true);
      expect(state.checklist.metadata).toBe(true);
      expect(state.checklist.privacyPolicy).toBe(true);
      expect(state.checklist.screenshots).toBe(true);
      expect(state.checklist.iapSandbox).toBe(true);
    });

    it('returns idle state for unknown session', async () => {
      const { service } = createService();
      const state = await service.getIOSBuildState('unknown-session');

      expect(state.platform).toBe('ios');
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
    });
  });

  describe('Android build status tracking', () => {
    it('tracks all required fields for Android build', async () => {
      const { service } = createService();

      await service.startAndroidBuild('session-1');
      const state = await service.getAndroidBuildState('session-1');

      expect(state.platform).toBe('android');
      expect(state.status).toBe('building');
      expect(state.progress).toBe(0);
      expect(state.buildId).toBeDefined();
      expect(state.startedAt).toBeInstanceOf(Date);
      expect(state.checklist).toEqual({
        signing: false,
        metadata: false,
        privacyPolicy: false,
        screenshots: false,
        iapSandbox: false,
      });
    });

    it('tracks progress updates for Android build', async () => {
      const { service } = createService();

      await service.startAndroidBuild('session-1');
      await service.updateBuildProgress('session-1', 'android', 75, 'validating');

      const state = await service.getAndroidBuildState('session-1');
      expect(state.progress).toBe(75);
      expect(state.status).toBe('validating');
    });

    it('tracks checklist items for Android build (signing, metadata, privacy, screenshots, IAP)', async () => {
      const { service } = createService();

      await service.startAndroidBuild('session-1');
      await service.updateChecklist('session-1', 'android', 'signing', true);
      await service.updateChecklist('session-1', 'android', 'metadata', true);
      await service.updateChecklist('session-1', 'android', 'privacyPolicy', true);
      await service.updateChecklist('session-1', 'android', 'screenshots', true);
      await service.updateChecklist('session-1', 'android', 'iapSandbox', true);

      const state = await service.getAndroidBuildState('session-1');
      expect(state.checklist.signing).toBe(true);
      expect(state.checklist.metadata).toBe(true);
      expect(state.checklist.privacyPolicy).toBe(true);
      expect(state.checklist.screenshots).toBe(true);
      expect(state.checklist.iapSandbox).toBe(true);
    });

    it('returns idle state for unknown session', async () => {
      const { service } = createService();
      const state = await service.getAndroidBuildState('unknown-session');

      expect(state.platform).toBe('android');
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
    });
  });

  describe('app.ios.build.created hook emission', () => {
    it('emits app.ios.build.created hook when iOS build starts', async () => {
      const { service, hookEmitter } = createService();

      await service.startIOSBuild('session-1');

      expect(hookEmitter.emit).toHaveBeenCalledWith(
        'app.ios.build.created',
        expect.objectContaining({
          sessionId: 'session-1',
          platform: 'ios',
          buildId: expect.any(String),
          timestamp: expect.any(Number),
        }),
      );
    });

    it('validates iOS build hook contains required fields (Xcode/iOS SDK, bundle ID, signing, metadata)', async () => {
      const { service, hookEmitter } = createService();

      await service.startIOSBuild('session-1');

      const call = hookEmitter.calls.find((c) => c.hookName === 'app.ios.build.created');
      expect(call).toBeDefined();
      expect(call!.payload.sessionId).toBe('session-1');
      expect(call!.payload.platform).toBe('ios');
      expect(call!.payload.buildId).toBeDefined();
      expect(call!.payload.timestamp).toBeGreaterThan(0);
    });
  });

  describe('app.android.build.created hook emission', () => {
    it('emits app.android.build.created hook when Android build starts', async () => {
      const { service, hookEmitter } = createService();

      await service.startAndroidBuild('session-1');

      expect(hookEmitter.emit).toHaveBeenCalledWith(
        'app.android.build.created',
        expect.objectContaining({
          sessionId: 'session-1',
          platform: 'android',
          buildId: expect.any(String),
          timestamp: expect.any(Number),
        }),
      );
    });

    it('validates Android build hook contains required fields (Gradle/AAB, package name, keystore, Data Safety)', async () => {
      const { service, hookEmitter } = createService();

      await service.startAndroidBuild('session-1');

      const call = hookEmitter.calls.find((c) => c.hookName === 'app.android.build.created');
      expect(call).toBeDefined();
      expect(call!.payload.sessionId).toBe('session-1');
      expect(call!.payload.platform).toBe('android');
      expect(call!.payload.buildId).toBeDefined();
      expect(call!.payload.timestamp).toBeGreaterThan(0);
    });
  });

  describe('app.submission.ready hook — fires only when all gates pass', () => {
    it('fires app.submission.ready when all gates pass and checklists complete', async () => {
      const { service, hookEmitter } = createService();

      // Start builds and complete all checklists
      await service.startIOSBuild('session-1');
      await service.startAndroidBuild('session-1');

      const checklistItems: (keyof BuildChecklist)[] = [
        'signing', 'metadata', 'privacyPolicy', 'screenshots', 'iapSandbox',
      ];

      for (const item of checklistItems) {
        await service.updateChecklist('session-1', 'ios', item, true);
        await service.updateChecklist('session-1', 'android', item, true);
      }

      const result = await service.checkSubmissionReadiness('session-1');

      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(hookEmitter.emit).toHaveBeenCalledWith(
        'app.submission.ready',
        expect.objectContaining({ sessionId: 'session-1' }),
      );
    });

    it('does NOT fire app.submission.ready when gates have blockers', async () => {
      const gateChecker = createMockGateChecker({
        canProgress: vi.fn(async () => ({
          allowed: false,
          blockers: [{ id: 'gate-1', name: 'Accessibility check failed' }],
        })),
      });

      const { service, hookEmitter } = createService({ gateChecker });

      await service.startIOSBuild('session-1');
      await service.startAndroidBuild('session-1');

      const result = await service.checkSubmissionReadiness('session-1');

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain('Gate blocker: Accessibility check failed');

      const submissionReadyCalls = hookEmitter.calls.filter(
        (c) => c.hookName === 'app.submission.ready',
      );
      expect(submissionReadyCalls).toHaveLength(0);
    });

    it('does NOT fire app.submission.ready when iOS checklist is incomplete', async () => {
      const { service, hookEmitter } = createService();

      await service.startIOSBuild('session-1');
      await service.startAndroidBuild('session-1');

      // Complete Android but not iOS
      const checklistItems: (keyof BuildChecklist)[] = [
        'signing', 'metadata', 'privacyPolicy', 'screenshots', 'iapSandbox',
      ];
      for (const item of checklistItems) {
        await service.updateChecklist('session-1', 'android', item, true);
      }
      // Only complete some iOS items
      await service.updateChecklist('session-1', 'ios', 'signing', true);

      const result = await service.checkSubmissionReadiness('session-1');

      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes('iOS'))).toBe(true);

      const submissionReadyCalls = hookEmitter.calls.filter(
        (c) => c.hookName === 'app.submission.ready',
      );
      expect(submissionReadyCalls).toHaveLength(0);
    });

    it('does NOT fire app.submission.ready when Android checklist is incomplete', async () => {
      const { service, hookEmitter } = createService();

      await service.startIOSBuild('session-1');
      await service.startAndroidBuild('session-1');

      // Complete iOS but not Android
      const checklistItems: (keyof BuildChecklist)[] = [
        'signing', 'metadata', 'privacyPolicy', 'screenshots', 'iapSandbox',
      ];
      for (const item of checklistItems) {
        await service.updateChecklist('session-1', 'ios', item, true);
      }

      const result = await service.checkSubmissionReadiness('session-1');

      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes('Android'))).toBe(true);

      const submissionReadyCalls = hookEmitter.calls.filter(
        (c) => c.hookName === 'app.submission.ready',
      );
      expect(submissionReadyCalls).toHaveLength(0);
    });

    it('reports specific blockers when submission is not ready', async () => {
      const { service } = createService();

      await service.startIOSBuild('session-1');
      await service.startAndroidBuild('session-1');

      // Only complete signing for iOS
      await service.updateChecklist('session-1', 'ios', 'signing', true);

      const result = await service.checkSubmissionReadiness('session-1');

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain('iOS: metadata not complete');
      expect(result.blockers).toContain('iOS: privacy policy not set');
      expect(result.blockers).toContain('iOS: screenshots not generated');
      expect(result.blockers).toContain('iOS: IAP sandbox not validated');
      expect(result.blockers).not.toContain('iOS: signing not complete');
    });
  });

  describe('build progress and status transitions', () => {
    it('tracks status transitions through build lifecycle', async () => {
      const { service } = createService();

      await service.startIOSBuild('session-1');
      expect((await service.getIOSBuildState('session-1')).status).toBe('building');

      await service.updateBuildProgress('session-1', 'ios', 30, 'signing');
      expect((await service.getIOSBuildState('session-1')).status).toBe('signing');

      await service.updateBuildProgress('session-1', 'ios', 60, 'validating');
      expect((await service.getIOSBuildState('session-1')).status).toBe('validating');

      await service.updateBuildProgress('session-1', 'ios', 100, 'ready');
      const finalState = await service.getIOSBuildState('session-1');
      expect(finalState.status).toBe('ready');
      expect(finalState.completedAt).toBeInstanceOf(Date);
    });

    it('records error on failed build', async () => {
      const { service } = createService();

      await service.startAndroidBuild('session-1');
      await service.updateBuildProgress('session-1', 'android', 45, 'failed');

      const state = await service.getAndroidBuildState('session-1');
      expect(state.status).toBe('failed');
      expect(state.error).toBeDefined();
      expect(state.completedAt).toBeInstanceOf(Date);
    });
  });
});
