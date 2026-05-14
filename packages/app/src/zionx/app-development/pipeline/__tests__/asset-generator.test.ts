/**
 * Pipeline Hook 07: Asset Generator — Unit Tests
 *
 * Tests the full mock chain: skip-if-exists, sequential generation,
 * partial-success handling, dryRun, kill switch, content policy errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run, HOOK_METADATA } from '../07-asset-generator.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import type { HookContext } from '../types.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the OpenAI images client
const mockGenerateImage = vi.fn();
vi.mock('../../services/openai-images-client.js', () => {
  return {
    OpenAIImagesClient: class MockOpenAIImagesClient {
      generateImage = mockGenerateImage;
    },
    ContentPolicyError: class ContentPolicyError extends Error {
      constructor(msg: string) { super(msg); this.name = 'ContentPolicyError'; }
    },
    RateLimitError: class RateLimitError extends Error {
      retryAfterMs = 60000;
      constructor(msg: string) { super(msg); this.name = 'RateLimitError'; }
    },
  };
});

// Mock the workspace
const mockExists = vi.fn();
const mockEnsureProjectDir = vi.fn();
const mockWriteBinaryFile = vi.fn();
vi.mock('../../workspace/workspace.js', () => {
  return {
    Workspace: class MockWorkspace {
      exists = mockExists;
      ensureProjectDir = mockEnsureProjectDir;
      writeBinaryFile = mockWriteBinaryFile;
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCtx(dryRun = false): HookContext {
  return {
    executionId: 'test-exec-001',
    dryRun,
    startedAt: new Date().toISOString(),
    log: vi.fn(),
  };
}

function createCredentialManager(): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue('sk-test-key'),
    rotateCredential: vi.fn().mockResolvedValue({ success: false, driverName: '', error: '' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

function createFakePngBuffer(size = 1024): Buffer {
  // PNG magic bytes + random data
  const buf = Buffer.alloc(size);
  buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4E; buf[3] = 0x47;
  buf[4] = 0x0D; buf[5] = 0x0A; buf[6] = 0x1A; buf[7] = 0x0A;
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 07: Asset Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset hook config to enabled, not dry-run
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['asset-generator'] = { enabled: true, dryRun: false };

    // Default mocks
    mockExists.mockResolvedValue(false); // assets don't exist yet
    mockEnsureProjectDir.mockResolvedValue('/tmp/test');
    mockWriteBinaryFile.mockResolvedValue(undefined);
    mockGenerateImage.mockResolvedValue({ buffer: createFakePngBuffer(), revisedPrompt: undefined });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('kill switch and dry-run', () => {
    it('skips when hook is disabled', async () => {
      HOOKS_CONFIG.hooks['asset-generator'] = { enabled: false, dryRun: false };

      const result = await run(
        { projectId: 'proj-1', appName: 'TestApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.generatedFiles).toHaveLength(0);
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });

    it('skips when global kill switch is on', async () => {
      HOOKS_CONFIG.globalKillSwitch = true;

      const result = await run(
        { projectId: 'proj-1', appName: 'TestApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });

    it('runs in dry-run mode without API calls', async () => {
      HOOKS_CONFIG.hooks['asset-generator'] = { enabled: true, dryRun: true };

      const result = await run(
        { projectId: 'proj-1', appName: 'TestApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });

    it('respects ctx.dryRun even if config says live', async () => {
      const result = await run(
        { projectId: 'proj-1', appName: 'TestApp', credentialManager: createCredentialManager() },
        createCtx(true), // dryRun via context
      );

      expect(result.dryRun).toBe(true);
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });
  });

  describe('idempotency — skip if exists', () => {
    it('skips generation when assets/icon.png already exists', async () => {
      mockExists.mockResolvedValue(true);

      const result = await run(
        { projectId: 'proj-1', appName: 'TestApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.skippedFiles).toHaveLength(4);
      expect(mockGenerateImage).not.toHaveBeenCalled();
    });
  });

  describe('happy path — full generation', () => {
    it('generates 4 assets and writes them to workspace', async () => {
      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp', appDescription: 'a fitness tracker', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(true);
      expect(result.data!.generatedFiles).toHaveLength(4);
      expect(result.data!.generatedFiles).toContain('assets/icon.png');
      expect(result.data!.generatedFiles).toContain('assets/splash.png');
      expect(result.data!.generatedFiles).toContain('assets/adaptive-icon.png');
      expect(result.data!.generatedFiles).toContain('assets/notification-icon.png');
      expect(mockGenerateImage).toHaveBeenCalledTimes(4);
      expect(mockWriteBinaryFile).toHaveBeenCalledTimes(4);
    });

    it('calculates cost correctly (4 × $0.011)', async () => {
      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.data!.costUsd).toBeCloseTo(0.044, 3);
    });

    it('passes correct background parameter for each asset', async () => {
      await run(
        { projectId: 'proj-1', appName: 'MyApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      // icon.png — opaque
      expect(mockGenerateImage.mock.calls[0]![0].background).toBe('opaque');
      // splash.png — transparent
      expect(mockGenerateImage.mock.calls[1]![0].background).toBe('transparent');
      // adaptive-icon.png — opaque
      expect(mockGenerateImage.mock.calls[2]![0].background).toBe('opaque');
      // notification-icon.png — transparent
      expect(mockGenerateImage.mock.calls[3]![0].background).toBe('transparent');
    });

    it('builds AssetSet with correct structure', async () => {
      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      const assets = result.data!.assets!;
      expect(assets.projectId).toBe('proj-1');
      expect(assets.generatedAt).toBeDefined();
      expect(assets.icon.length).toBeGreaterThan(0);
      expect(assets.icon[0]!.width).toBe(1024);
      expect(assets.icon[0]!.height).toBe(1024);
      expect(assets.screenshots).toHaveLength(0);
    });

    it('includes appDescription in prompts when provided', async () => {
      await run(
        { projectId: 'proj-1', appName: 'FitTrack', appDescription: 'a fitness tracker', credentialManager: createCredentialManager() },
        createCtx(),
      );

      const firstPrompt = mockGenerateImage.mock.calls[0]![0].prompt;
      expect(firstPrompt).toContain('FitTrack');
      expect(firstPrompt).toContain('a fitness tracker');
    });
  });

  describe('partial failure', () => {
    it('keeps already-written assets when later generation fails', async () => {
      // First 2 succeed, 3rd fails, 4th succeeds
      mockGenerateImage
        .mockResolvedValueOnce({ buffer: createFakePngBuffer() })
        .mockResolvedValueOnce({ buffer: createFakePngBuffer() })
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce({ buffer: createFakePngBuffer() });

      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.data!.generatedFiles).toHaveLength(3);
      expect(result.data!.errors).toHaveLength(1);
      expect(result.data!.errors[0]).toContain('adaptive-icon.png');
      expect(mockWriteBinaryFile).toHaveBeenCalledTimes(3);
    });

    it('handles content policy rejection as terminal (no retry)', async () => {
      const { ContentPolicyError } = await import('../../services/openai-images-client.js');
      mockGenerateImage
        .mockResolvedValueOnce({ buffer: createFakePngBuffer() })
        .mockRejectedValueOnce(new ContentPolicyError('Rejected by safety system'))
        .mockResolvedValueOnce({ buffer: createFakePngBuffer() })
        .mockResolvedValueOnce({ buffer: createFakePngBuffer() });

      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.data!.generatedFiles).toHaveLength(3);
      expect(result.data!.errors[0]).toContain('Content policy');
    });
  });

  describe('error handling', () => {
    it('returns error when no credential manager provided', async () => {
      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp' },
        createCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('credential manager');
    });

    it('handles workspace write failure gracefully', async () => {
      mockWriteBinaryFile.mockRejectedValueOnce(new Error('Disk full'));

      const result = await run(
        { projectId: 'proj-1', appName: 'MyApp', credentialManager: createCredentialManager() },
        createCtx(),
      );

      // The error is caught per-asset, so remaining assets still attempt
      expect(result.success).toBe(false);
      expect(result.data!.errors[0]).toContain('icon.png');
    });
  });

  describe('metadata', () => {
    it('has correct hook metadata', () => {
      expect(HOOK_METADATA.id).toBe('asset-generator');
      expect(HOOK_METADATA.triggerType).toBe('file_event');
      expect(HOOK_METADATA.failureMode).toBe('notify');
      expect(HOOK_METADATA.timeoutMs).toBe(300_000);
      expect(HOOK_METADATA.maxConcurrent).toBe(3);
    });
  });
});
