/**
 * Tests for Hook 9b: Submitter
 *
 * Validates that the submitter hook:
 * - Honors the kill switch and dry-run flags
 * - Returns a structured failure (no throw) when EAS submit fails
 * - Returns a structured success when EAS submit succeeds
 * - Emits an APPDEV_EVENTS.SUBMISSION_COMPLETED event in both cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../09b-submitter.js';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubmitBuild = vi.fn();
vi.mock('../../services/eas-cli-wrapper.js', () => ({
  submitBuild: (...args: unknown[]) => mockSubmitBuild(...args),
}));

const mockGetProjectPath = vi.fn();
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class {
    getProjectPath = mockGetProjectPath;
  },
}));

let killSwitch = false;
let dryRunOverride = false;
vi.mock('../../config/hooks.config.js', () => ({
  isHookEnabled: () => !killSwitch,
  isHookDryRun: () => dryRunOverride,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): HookContext {
  return {
    executionId: 'exec-001',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: () => {},
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'proj-1',
    platform: 'ios' as const,
    easBuildId: 'eas-build-001',
    credentialManager: {
      getCredential: vi.fn().mockResolvedValue('fake-expo-token'),
    } as any,
    eventBus: { publish: vi.fn().mockResolvedValue(undefined) } as any,
    tenantId: 'tenant-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  killSwitch = false;
  dryRunOverride = false;
  mockGetProjectPath.mockReturnValue('/workspaces/proj-1');
});

describe('Hook 9b: Submitter — metadata', () => {
  it('declares api_request trigger and notify failure mode', () => {
    expect(HOOK_METADATA.id).toBe('submitter');
    expect(HOOK_METADATA.triggerType).toBe('api_request');
    expect(HOOK_METADATA.failureMode).toBe('notify');
  });
});

describe('Hook 9b: Submitter — kill switch + dry-run', () => {
  it('kill switch disabled → does not call submitBuild', async () => {
    killSwitch = true;
    const result = await run(makeInput(), makeCtx());
    expect(result.data?.status).toBe('disabled');
    expect(mockSubmitBuild).not.toHaveBeenCalled();
  });

  it('dry run → does not call submitBuild', async () => {
    dryRunOverride = true;
    const result = await run(makeInput(), makeCtx());
    expect(result.data?.status).toBe('dry_run');
    expect(mockSubmitBuild).not.toHaveBeenCalled();
  });
});

describe('Hook 9b: Submitter — happy path', () => {
  it('successful submission → emits SUBMISSION_COMPLETED', async () => {
    mockSubmitBuild.mockResolvedValueOnce({ status: 'submitted', submissionId: 'sub-XYZ' });
    const input = makeInput();
    const result = await run(input, makeCtx());

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('submitted');
    expect(result.data?.submissionId).toBe('sub-XYZ');
    expect(input.eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('passes Android track when platform is android', async () => {
    mockSubmitBuild.mockResolvedValueOnce({ status: 'submitted', submissionId: 'sub-Y' });
    await run(makeInput({ platform: 'android', androidTrack: 'beta' }), makeCtx());

    expect(mockSubmitBuild).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'android', track: 'beta' }),
    );
  });
});

describe('Hook 9b: Submitter — failure modes', () => {
  it('submitBuild returns failed → success: false, structured payload', async () => {
    mockSubmitBuild.mockResolvedValueOnce({ status: 'failed', errorMessage: 'authentication required' });
    const input = makeInput();
    const result = await run(input, makeCtx());

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('failed');
    expect(result.data?.errorMessage).toBe('authentication required');
    // Event still emitted so dashboards can react.
    expect(input.eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('missing Expo token → success: false, no submission attempted', async () => {
    const input = makeInput({
      credentialManager: {
        getCredential: vi.fn().mockResolvedValue(''),
      } as any,
    });
    const result = await run(input, makeCtx());

    expect(result.success).toBe(false);
    expect(result.data?.status).toBe('failed');
    expect(mockSubmitBuild).not.toHaveBeenCalled();
  });
});
