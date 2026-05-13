/**
 * ZionX App Development Studio — Build/Submit Panel Service
 *
 * Manages build status for iOS and Android platforms including progress tracking,
 * signing, metadata, privacy policy, screenshots, and IAP sandbox validation.
 * Emits lifecycle hooks for build creation and submission readiness.
 *
 * Requirements: 42g.19, 42g.22, 42g.23
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildChecklist {
  signing: boolean;
  metadata: boolean;
  privacyPolicy: boolean;
  screenshots: boolean;
  iapSandbox: boolean;
}

export type BuildStatusValue =
  | 'idle'
  | 'building'
  | 'signing'
  | 'validating'
  | 'ready'
  | 'submitted'
  | 'failed';

export interface PlatformBuildState {
  platform: 'ios' | 'android';
  status: BuildStatusValue;
  progress: number;
  buildId?: string;
  checklist: BuildChecklist;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (for injection / mocking)
// ---------------------------------------------------------------------------

export interface HookEmitter {
  emit(hookName: string, payload: Record<string, unknown>): void;
}

export interface GateChecker {
  canProgress(sessionId: string): Promise<{ allowed: boolean; blockers: { id: string; name: string }[] }>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface BuildPanelService {
  getIOSBuildState(sessionId: string): Promise<PlatformBuildState>;
  getAndroidBuildState(sessionId: string): Promise<PlatformBuildState>;
  startIOSBuild(sessionId: string): Promise<void>;
  startAndroidBuild(sessionId: string): Promise<void>;
  updateBuildProgress(
    sessionId: string,
    platform: 'ios' | 'android',
    progress: number,
    status: string,
  ): Promise<void>;
  updateChecklist(
    sessionId: string,
    platform: 'ios' | 'android',
    item: keyof BuildChecklist,
    value: boolean,
  ): Promise<void>;
  checkSubmissionReadiness(sessionId: string): Promise<{ ready: boolean; blockers: string[] }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BuildPanelConfig {
  hookEmitter: HookEmitter;
  gateChecker: GateChecker;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultBuildPanelService implements BuildPanelService {
  private readonly hookEmitter: HookEmitter;
  private readonly gateChecker: GateChecker;
  private readonly iosBuildStates: Map<string, PlatformBuildState> = new Map();
  private readonly androidBuildStates: Map<string, PlatformBuildState> = new Map();

  constructor(config: BuildPanelConfig) {
    this.hookEmitter = config.hookEmitter;
    this.gateChecker = config.gateChecker;
  }

  async getIOSBuildState(sessionId: string): Promise<PlatformBuildState> {
    return this.iosBuildStates.get(sessionId) ?? this.createDefaultState('ios');
  }

  async getAndroidBuildState(sessionId: string): Promise<PlatformBuildState> {
    return this.androidBuildStates.get(sessionId) ?? this.createDefaultState('android');
  }

  async startIOSBuild(sessionId: string): Promise<void> {
    const state: PlatformBuildState = {
      platform: 'ios',
      status: 'building',
      progress: 0,
      buildId: `ios-build-${Date.now()}`,
      checklist: { signing: false, metadata: false, privacyPolicy: false, screenshots: false, iapSandbox: false },
      startedAt: new Date(),
    };

    this.iosBuildStates.set(sessionId, state);

    this.hookEmitter.emit('app.ios.build.created', {
      sessionId,
      buildId: state.buildId,
      platform: 'ios',
      timestamp: Date.now(),
    });
  }

  async startAndroidBuild(sessionId: string): Promise<void> {
    const state: PlatformBuildState = {
      platform: 'android',
      status: 'building',
      progress: 0,
      buildId: `android-build-${Date.now()}`,
      checklist: { signing: false, metadata: false, privacyPolicy: false, screenshots: false, iapSandbox: false },
      startedAt: new Date(),
    };

    this.androidBuildStates.set(sessionId, state);

    this.hookEmitter.emit('app.android.build.created', {
      sessionId,
      buildId: state.buildId,
      platform: 'android',
      timestamp: Date.now(),
    });
  }

  async updateBuildProgress(
    sessionId: string,
    platform: 'ios' | 'android',
    progress: number,
    status: string,
  ): Promise<void> {
    const stateMap = platform === 'ios' ? this.iosBuildStates : this.androidBuildStates;
    const current = stateMap.get(sessionId) ?? this.createDefaultState(platform);

    const validStatus = this.validateStatus(status);
    const updatedState: PlatformBuildState = {
      ...current,
      progress,
      status: validStatus,
      completedAt: validStatus === 'ready' || validStatus === 'submitted' || validStatus === 'failed'
        ? new Date()
        : current.completedAt,
      error: validStatus === 'failed' ? `Build failed at progress ${progress}%` : current.error,
    };

    stateMap.set(sessionId, updatedState);
  }

  async updateChecklist(
    sessionId: string,
    platform: 'ios' | 'android',
    item: keyof BuildChecklist,
    value: boolean,
  ): Promise<void> {
    const stateMap = platform === 'ios' ? this.iosBuildStates : this.androidBuildStates;
    const current = stateMap.get(sessionId) ?? this.createDefaultState(platform);

    const updatedChecklist = { ...current.checklist, [item]: value };
    stateMap.set(sessionId, { ...current, checklist: updatedChecklist });
  }

  async checkSubmissionReadiness(sessionId: string): Promise<{ ready: boolean; blockers: string[] }> {
    const iosState = this.iosBuildStates.get(sessionId) ?? this.createDefaultState('ios');
    const androidState = this.androidBuildStates.get(sessionId) ?? this.createDefaultState('android');

    const blockers: string[] = [];

    // Check gate progression
    const gateResult = await this.gateChecker.canProgress(sessionId);
    if (!gateResult.allowed) {
      for (const blocker of gateResult.blockers) {
        blockers.push(`Gate blocker: ${blocker.name}`);
      }
    }

    // Check iOS checklist
    if (!iosState.checklist.signing) blockers.push('iOS: signing not complete');
    if (!iosState.checklist.metadata) blockers.push('iOS: metadata not complete');
    if (!iosState.checklist.privacyPolicy) blockers.push('iOS: privacy policy not set');
    if (!iosState.checklist.screenshots) blockers.push('iOS: screenshots not generated');
    if (!iosState.checklist.iapSandbox) blockers.push('iOS: IAP sandbox not validated');

    // Check Android checklist
    if (!androidState.checklist.signing) blockers.push('Android: signing not complete');
    if (!androidState.checklist.metadata) blockers.push('Android: metadata not complete');
    if (!androidState.checklist.privacyPolicy) blockers.push('Android: privacy policy not set');
    if (!androidState.checklist.screenshots) blockers.push('Android: screenshots not generated');
    if (!androidState.checklist.iapSandbox) blockers.push('Android: IAP sandbox not validated');

    const ready = blockers.length === 0;

    if (ready) {
      this.hookEmitter.emit('app.submission.ready', {
        sessionId,
        timestamp: Date.now(),
        iosBuildId: iosState.buildId,
        androidBuildId: androidState.buildId,
      });
    }

    return { ready, blockers };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private createDefaultState(platform: 'ios' | 'android'): PlatformBuildState {
    return {
      platform,
      status: 'idle',
      progress: 0,
      checklist: {
        signing: false,
        metadata: false,
        privacyPolicy: false,
        screenshots: false,
        iapSandbox: false,
      },
    };
  }

  private validateStatus(status: string): BuildStatusValue {
    const validStatuses: BuildStatusValue[] = [
      'idle', 'building', 'signing', 'validating', 'ready', 'submitted', 'failed',
    ];
    if (validStatuses.includes(status as BuildStatusValue)) {
      return status as BuildStatusValue;
    }
    return 'building';
  }
}
