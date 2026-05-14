import { describe, it, expect, beforeEach, vi } from 'vitest';
import { run, HOOK_METADATA } from '../04-secret-scanner.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import { resetAllCircuitBreakers } from '../../utils/circuit-breaker.js';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Mock detectSecrets to verify invocation control
// ---------------------------------------------------------------------------

vi.mock('../../utils/sanitizer.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    detectSecrets: vi.fn(actual.detectSecrets),
  };
});

import { detectSecrets } from '../../utils/sanitizer.js';
const mockDetectSecrets = vi.mocked(detectSecrets);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCtx(overrides: Partial<HookContext> = {}): HookContext {
  return {
    executionId: 'test-exec-1',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 04: Secret Scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllCircuitBreakers();
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['secret-scanner'] = { enabled: true, dryRun: false };
  });

  describe('clean files', () => {
    it('returns success: true for clean file content', async () => {
      const result = await run(
        { projectId: 'proj-1', filePath: 'src/index.ts', content: 'export const x = 1;' },
        createCtx(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.clean).toBe(true);
      expect(result.data!.warnings).toHaveLength(0);
    });
  });

  describe('files with secrets', () => {
    it('returns success: false for file with API key (halt severity)', async () => {
      const content = 'const key = "AKIAYGDVRECH55QALWEQ";';
      const result = await run(
        { projectId: 'proj-1', filePath: 'src/config.ts', content },
        createCtx(),
      );
      expect(result.success).toBe(false);
      expect(result.data!.clean).toBe(false);
      expect(result.data!.warnings.some(w => w.type === 'aws_key')).toBe(true);
      expect(result.data!.filePath).toBe('src/config.ts');
    });

    it('returns success: true for file with email only (warn severity)', async () => {
      const content = 'const contact = "user@example.com";';
      const result = await run(
        { projectId: 'proj-1', filePath: 'src/about.ts', content },
        createCtx(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.data!.warnings[0]!.severity).toBe('warn');
    });

    it('returns all warnings for multi-secret file', async () => {
      const content = 'const a = "AKIAYGDVRECH55QALWEQ";\nconst b = "sk-abcdefghijklmnopqrstuvwxyz123";';
      const result = await run(
        { projectId: 'proj-1', filePath: 'src/leaked.ts', content },
        createCtx(),
      );
      expect(result.success).toBe(false);
      expect(result.data!.warnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('skip conditions', () => {
    it('skips .partial files without scanning', async () => {
      const result = await run(
        { projectId: 'proj-1', filePath: 'src/index.ts.partial', content: 'AKIAYGDVRECH55QALWEQ' },
        createCtx(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.skipped).toBe(true);
      expect(result.data!.skipReason).toBe('partial_file');
      // detectSecrets should NOT have been called
      expect(mockDetectSecrets).not.toHaveBeenCalled();
    });

    it('skips binary extension (.png) without scanning', async () => {
      const result = await run(
        { projectId: 'proj-1', filePath: 'assets/icon.png', content: 'binary data with AKIAYGDVRECH55QALWEQ' },
        createCtx(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.skipped).toBe(true);
      expect(result.data!.skipReason).toBe('binary_extension');
      expect(mockDetectSecrets).not.toHaveBeenCalled();
    });

    it('skips .ttf font files', async () => {
      const result = await run(
        { projectId: 'proj-1', filePath: 'assets/font.ttf', content: 'font data' },
        createCtx(),
      );
      expect(result.data!.skipped).toBe(true);
      expect(result.data!.skipReason).toBe('binary_extension');
    });
  });

  describe('dryRun mode', () => {
    it('logs but does NOT call detectSecrets', async () => {
      HOOKS_CONFIG.hooks['secret-scanner'] = { enabled: true, dryRun: true };

      const result = await run(
        { projectId: 'proj-1', filePath: 'src/app.ts', content: 'AKIAYGDVRECH55QALWEQ' },
        createCtx(),
      );
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockDetectSecrets).not.toHaveBeenCalled();
    });
  });

  describe('kill switch', () => {
    it('returns success without scanning when disabled', async () => {
      HOOKS_CONFIG.hooks['secret-scanner'] = { enabled: false, dryRun: false };

      const result = await run(
        { projectId: 'proj-1', filePath: 'src/app.ts', content: 'AKIAYGDVRECH55QALWEQ' },
        createCtx(),
      );
      expect(result.success).toBe(true);
      expect(result.data!.skipped).toBe(true);
      expect(mockDetectSecrets).not.toHaveBeenCalled();
    });
  });
});
