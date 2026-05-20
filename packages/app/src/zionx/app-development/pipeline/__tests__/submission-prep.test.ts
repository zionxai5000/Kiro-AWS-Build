/**
 * Tests for Hook 09: Submission Prep — checklist validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../09-submission-prep.js';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockExists = vi.fn();
const mockListFiles = vi.fn();

vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class MockWorkspace {
    readFile = mockReadFile;
    exists = mockExists;
    listFiles = mockListFiles;
  },
}));

vi.mock('../../config/hooks.config.js', () => ({
  isHookEnabled: (id: string) => id === 'submission-prep',
  isHookDryRun: () => false,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETE_LISTING = JSON.stringify({
  name: 'Workout Tracker',
  subtitle: 'Track your gains',
  description: 'A comprehensive workout tracker for fitness enthusiasts.',
  keywords: 'fitness,workout,tracker',
  category: 'HEALTH_AND_FITNESS',
  supportUrl: 'https://zionxai5000.github.io/privacy-policies/',
  privacyPolicyUrl: 'https://zionxai5000.github.io/privacy-policies/',
});

const EAS_JSON_WITH_ASC = JSON.stringify({
  build: { production: {} },
  submit: { production: { ios: { ascAppId: '1234567890' } } },
});

const EAS_JSON_BASIC = JSON.stringify({
  build: { production: {} },
});

function createCtx(): HookContext {
  return { executionId: 'test-exec', dryRun: false, startedAt: new Date().toISOString(), log: vi.fn() };
}

// ---------------------------------------------------------------------------
// Setup — all-pass baseline for iOS
// ---------------------------------------------------------------------------

function setupAllPassIos() {
  mockReadFile
    .mockResolvedValueOnce(EAS_JSON_WITH_ASC)   // eas.json
    .mockResolvedValueOnce(COMPLETE_LISTING);    // store-listing.json
  mockExists.mockResolvedValue(true);            // icon exists
  mockListFiles.mockResolvedValue([
    'assets/screenshots/screenshot-1.png',
    'assets/screenshots/screenshot-2.png',
    'assets/screenshots/screenshot-3.png',
  ]);
}

function setupAllPassAndroid() {
  mockReadFile
    .mockResolvedValueOnce(EAS_JSON_BASIC)       // eas.json (no ascAppId needed for Android)
    .mockResolvedValueOnce(COMPLETE_LISTING);    // store-listing.json
  mockExists.mockResolvedValue(true);
  mockListFiles.mockResolvedValue([
    'assets/screenshots/screenshot-1.png',
    'assets/screenshots/screenshot-2.png',
  ]);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// iOS Checklist Tests (6)
// ---------------------------------------------------------------------------

describe('Hook 09: Submission Prep — iOS', () => {
  it('all items pass → readyForConfirmation: true, missingItems: empty', async () => {
    setupAllPassIos();

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.readyForConfirmation).toBe(true);
    expect(result.data!.missingItems).toHaveLength(0);
    expect(result.data!.ascAppId).toBe('1234567890');
    // screenshots are 'warn' (placeholders), not 'fail' — so readyForConfirmation is still true
    const warnItems = result.data!.checklist.items.filter(i => i.status === 'warn');
    expect(warnItems.length).toBeGreaterThanOrEqual(1);
  });

  it('missing icon → fail item, readyForConfirmation: false', async () => {
    mockReadFile
      .mockResolvedValueOnce(EAS_JSON_WITH_ASC)
      .mockResolvedValueOnce(COMPLETE_LISTING);
    mockExists.mockResolvedValue(false); // icon missing
    mockListFiles.mockResolvedValue(['assets/screenshots/screenshot-1.png', 'assets/screenshots/screenshot-2.png', 'assets/screenshots/screenshot-3.png']);

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    expect(result.data!.readyForConfirmation).toBe(false);
    const iconItem = result.data!.checklist.items.find(i => i.id === 'icon_exists');
    expect(iconItem!.status).toBe('fail');
  });

  it('<3 screenshots → fail item', async () => {
    mockReadFile
      .mockResolvedValueOnce(EAS_JSON_WITH_ASC)
      .mockResolvedValueOnce(COMPLETE_LISTING);
    mockExists.mockResolvedValue(true);
    mockListFiles.mockResolvedValue(['assets/screenshots/screenshot-1.png']); // only 1

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    expect(result.data!.readyForConfirmation).toBe(false);
    const ssItem = result.data!.checklist.items.find(i => i.id === 'screenshots_uploaded');
    expect(ssItem!.status).toBe('fail');
  });

  it('no ascAppId in eas.json → fail item for asc_app_exists', async () => {
    mockReadFile
      .mockResolvedValueOnce(EAS_JSON_BASIC) // no ascAppId
      .mockResolvedValueOnce(COMPLETE_LISTING);
    mockExists.mockResolvedValue(true);
    mockListFiles.mockResolvedValue(['assets/screenshots/screenshot-1.png', 'assets/screenshots/screenshot-2.png', 'assets/screenshots/screenshot-3.png']);

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    expect(result.data!.readyForConfirmation).toBe(false);
    const ascItem = result.data!.checklist.items.find(i => i.id === 'asc_app_exists');
    expect(ascItem!.status).toBe('fail');
  });

  it('missing privacyPolicyUrl in listing → fail item', async () => {
    const incompleteListing = JSON.stringify({
      name: 'Test', description: 'Test app', keywords: 'test',
      category: 'LIFESTYLE', supportUrl: 'https://example.com',
      privacyPolicyUrl: '', // empty
    });
    mockReadFile
      .mockResolvedValueOnce(EAS_JSON_WITH_ASC)
      .mockResolvedValueOnce(incompleteListing);
    mockExists.mockResolvedValue(true);
    mockListFiles.mockResolvedValue(['assets/screenshots/screenshot-1.png', 'assets/screenshots/screenshot-2.png', 'assets/screenshots/screenshot-3.png']);

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    expect(result.data!.readyForConfirmation).toBe(false);
    const ppItem = result.data!.checklist.items.find(i => i.id === 'privacy_policy_url');
    expect(ppItem!.status).toBe('fail');
  });

  it('placeholder screenshots present (≥3) → warn (not fail), readyForConfirmation: true', async () => {
    setupAllPassIos();

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    const ssItem = result.data!.checklist.items.find(i => i.id === 'screenshots_uploaded');
    expect(ssItem!.status).toBe('warn');
    expect(ssItem!.detail).toContain('Placeholder');
    expect(result.data!.readyForConfirmation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Android Checklist Tests (4)
// ---------------------------------------------------------------------------

describe('Hook 09: Submission Prep — Android', () => {
  it('all items pass → readyForConfirmation: true (first_release_done is warn)', async () => {
    setupAllPassAndroid();

    const result = await run({ projectId: 'test-001', platform: 'android' }, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.readyForConfirmation).toBe(true);
    expect(result.data!.missingItems).toHaveLength(0);
    // first_release_done is always 'warn' for MVP
    const firstRelease = result.data!.checklist.items.find(i => i.id === 'first_release_done');
    expect(firstRelease!.status).toBe('warn');
  });

  it('missing build (no eas.json) → fail', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // eas.json missing
      .mockResolvedValueOnce(COMPLETE_LISTING);
    mockExists.mockResolvedValue(true);
    mockListFiles.mockResolvedValue(['assets/screenshots/screenshot-1.png', 'assets/screenshots/screenshot-2.png']);

    const result = await run({ projectId: 'test-001', platform: 'android' }, createCtx());

    expect(result.data!.readyForConfirmation).toBe(false);
    const buildItem = result.data!.checklist.items.find(i => i.id === 'build_exists');
    expect(buildItem!.status).toBe('fail');
  });

  it('service_account_key default → warn with default name detail', async () => {
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_SECRET;
    setupAllPassAndroid();

    const result = await run({ projectId: 'test-001', platform: 'android' }, createCtx());

    const saItem = result.data!.checklist.items.find(i => i.id === 'service_account_key');
    expect(saItem!.status).toBe('warn');
    expect(saItem!.detail).toContain('seraphim/googleplay');
  });

  it('<2 screenshots → fail', async () => {
    mockReadFile
      .mockResolvedValueOnce(EAS_JSON_BASIC)
      .mockResolvedValueOnce(COMPLETE_LISTING);
    mockExists.mockResolvedValue(true);
    mockListFiles.mockResolvedValue(['assets/screenshots/screenshot-1.png']); // only 1

    const result = await run({ projectId: 'test-001', platform: 'android' }, createCtx());

    expect(result.data!.readyForConfirmation).toBe(false);
    const ssItem = result.data!.checklist.items.find(i => i.id === 'screenshots_exist');
    expect(ssItem!.status).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Edge Cases (2)
// ---------------------------------------------------------------------------

describe('Hook 09: Submission Prep — edge cases', () => {
  it('missing workspace files → multiple fail items, does not crash', async () => {
    mockReadFile.mockRejectedValue(new Error('not found'));
    mockExists.mockResolvedValue(false);
    mockListFiles.mockResolvedValue([]);

    const result = await run({ projectId: 'test-001', platform: 'ios' }, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.readyForConfirmation).toBe(false);
    expect(result.data!.missingItems.length).toBeGreaterThan(0);
    // Should have multiple fail items
    const failItems = result.data!.checklist.items.filter(i => i.status === 'fail');
    expect(failItems.length).toBeGreaterThanOrEqual(3);
  });

  it('dry-run mode → returns success without doing work', async () => {
    const ctx = createCtx();
    ctx.dryRun = true;

    const result = await run({ projectId: 'test-001', platform: 'ios' }, ctx);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
