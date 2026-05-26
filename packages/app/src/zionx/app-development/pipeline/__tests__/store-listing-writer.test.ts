/**
 * Tests for Hook 08: Store Listing Writer.
 * Happy-path (4 tests) + name collision + error handling + screenshot (8 tests) = 12 total.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../08-store-listing-writer.js';
import type { HookContext } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor() {}
  },
}));

// Mock asc-client (listBundleIds)
const mockListBundleIds = vi.fn();
vi.mock('../../services/apple-credentials/asc-client.js', () => ({
  listBundleIds: (...args: unknown[]) => mockListBundleIds(...args),
}));

// Mock asc-app-client
const mockCreateAscApp = vi.fn();
const mockSetAppMetadata = vi.fn();
const mockUploadScreenshot = vi.fn();
const mockCreateScreenshotSet = vi.fn();
const mockGetAppStoreVersionLocalizationId = vi.fn();

const mockErrors = vi.hoisted(() => {
  class AscAppNameTakenError extends Error {
    attemptedName: string;
    constructor(name: string, detail: string) {
      super(`App name "${name}" is already taken: ${detail}`);
      this.name = 'AscAppNameTakenError';
      this.attemptedName = name;
    }
  }
  class AscApiError extends Error {
    statusCode: number;
    errorCode: string;
    constructor(statusCode: number, errorCode: string, message: string) {
      super(`ASC API error (${statusCode} ${errorCode}): ${message}`);
      this.name = 'AscApiError';
      this.statusCode = statusCode;
      this.errorCode = errorCode;
    }
  }
  return { AscAppNameTakenError, AscApiError };
});

vi.mock('../../services/apple-credentials/asc-app-client.js', () => ({
  createAscApp: (...args: unknown[]) => mockCreateAscApp(...args),
  setAppMetadata: (...args: unknown[]) => mockSetAppMetadata(...args),
  uploadScreenshot: (...args: unknown[]) => mockUploadScreenshot(...args),
  createScreenshotSet: (...args: unknown[]) => mockCreateScreenshotSet(...args),
  getAppStoreVersionLocalizationId: (...args: unknown[]) => mockGetAppStoreVersionLocalizationId(...args),
  AscAppNameTakenError: mockErrors.AscAppNameTakenError,
  AscApiError: mockErrors.AscApiError,
}));

const { AscAppNameTakenError, AscApiError } = mockErrors;

// Mock asc-jwt
vi.mock('../../services/apple-credentials/asc-jwt.js', () => ({
  signAscJwt: () => 'fake-jwt-token',
}));

// Mock screenshot generator
const mockGenerateScreenshots = vi.fn();
vi.mock('../../services/screenshot-generator.js', () => ({
  generatePlaceholderScreenshots: (...args: unknown[]) => mockGenerateScreenshots(...args),
}));

// Mock workspace
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockWriteBinaryFile = vi.fn();
const mockReadBinaryFile = vi.fn();
const mockListFiles = vi.fn();
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class MockWorkspace {
    readFile = mockReadFile;
    writeFile = mockWriteFile;
    writeBinaryFile = mockWriteBinaryFile;
    readBinaryFile = mockReadBinaryFile;
    listFiles = mockListFiles;
  },
}));

// Mock hooks config
vi.mock('../../config/hooks.config.js', () => ({
  isHookEnabled: (id: string) => id === 'store-listing-writer',
  isHookDryRun: () => false,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_APP_JSON = JSON.stringify({
  expo: {
    name: 'Workout Tracker',
    ios: { bundleIdentifier: 'dev.zionxai.workouttracker' },
    android: { package: 'dev.zionxai.workouttracker' },
  },
});

const FAKE_EAS_JSON = JSON.stringify({ build: { production: {} } });

const FAKE_EAS_JSON_WITH_ASC = JSON.stringify({
  build: { production: {} },
  submit: { production: { ios: { ascAppId: '9999999999' } } },
});

const FAKE_LISTING_JSON = JSON.stringify({
  name: 'Workout Tracker',
  subtitle: 'Track your gains',
  description: 'A comprehensive workout tracker.',
  keywords: 'fitness,workout,tracker',
  category: 'HEALTH_AND_FITNESS',
  supportUrl: 'https://zionxai5000.github.io/privacy-policies/',
  privacyPolicyUrl: 'https://zionxai5000.github.io/privacy-policies/',
});

const FAKE_LLM_RESPONSE = {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      name: 'FitTrack Pro',
      subtitle: 'Your fitness companion',
      description: 'Track workouts, monitor progress, and achieve your fitness goals.',
      keywords: 'fitness,workout,tracker,exercise,health',
      category: 'HEALTH_AND_FITNESS',
      supportUrl: 'https://zionxai5000.github.io/privacy-policies/',
      privacyPolicyUrl: 'https://zionxai5000.github.io/privacy-policies/',
    }),
  }],
};

const FAKE_ALT_NAMES_RESPONSE = {
  content: [{
    type: 'text' as const,
    text: '["GymBuddy", "WorkoutPal", "FitLog"]',
  }],
};

function createCtx(): HookContext {
  return { executionId: 'test-exec-1', dryRun: false, startedAt: new Date().toISOString(), log: vi.fn() };
}

const mockCredentialManager = {
  getCredential: vi.fn().mockImplementation((driver: string, key: string) => {
    if (driver === 'anthropic' && key === 'api-key') return 'fake-anthropic-key';
    if (driver === 'appstore-connect' && key === 'key-id') return 'FAKEKEYID01';
    if (driver === 'appstore-connect' && key === 'issuer-id') return 'fake-issuer-uuid';
    if (driver === 'appstore-connect' && key === 'api-key') return '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----';
    return '';
  }),
  rotateCredential: vi.fn(),
  getRotationSchedule: vi.fn(),
};

const defaultInput = { projectId: 'test-001', appName: 'Workout Tracker', appDescription: 'Track exercises', credentialManager: mockCredentialManager as any };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockGenerateScreenshots.mockResolvedValue({ screenshots: [{ filename: 'screenshot-1.png', width: 1290, height: 2796, isPlaceholder: true }], costUsd: 0 });
  mockCreateAscApp.mockResolvedValue({ ascAppId: '1234567890', bundleId: 'dev.zionxai.workouttracker', name: 'FitTrack Pro', sku: 'dev-zionxai-workouttracker', primaryLocale: 'en-US' });
  mockSetAppMetadata.mockResolvedValue(undefined);
  mockUploadScreenshot.mockResolvedValue('screenshot-id-1');
  mockCreateScreenshotSet.mockResolvedValue('screenshot-set-001');
  mockGetAppStoreVersionLocalizationId.mockResolvedValue('localization-en-us-001');
  mockWriteFile.mockResolvedValue(undefined);
  mockWriteBinaryFile.mockResolvedValue(undefined);
  mockReadBinaryFile.mockResolvedValue(Buffer.from('fake-png'));
  mockListBundleIds.mockResolvedValue([{ id: 'US85GDKZ7V', identifier: 'dev.zionxai.workouttracker', name: 'workouttracker', platform: 'IOS' }]);
  mockListFiles.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Happy-Path Tests (4)
// ---------------------------------------------------------------------------

describe('Hook 08: Store Listing Writer — happy path', () => {
  it('generates listing, creates ASC app, sets metadata, generates screenshots', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON)            // eas.json (readAscAppId)
      .mockResolvedValueOnce(FAKE_EAS_JSON);           // eas.json (writeAscAppId read)
    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.listing!.name).toBe('FitTrack Pro');
    expect(result.data!.ascAppId).toBe('1234567890');
    expect(result.data!.screenshotsGenerated).toBe(1);
    expect(mockCreateAscApp).toHaveBeenCalledTimes(1);
    expect(mockSetAppMetadata).toHaveBeenCalledTimes(1);
  });

  it('existing store-listing.json → skips LLM call, returns cached', async () => {
    mockReadFile
      .mockResolvedValueOnce(FAKE_LISTING_JSON)        // store-listing.json found
      .mockResolvedValueOnce(FAKE_EAS_JSON_WITH_ASC);  // eas.json

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.listing!.name).toBe('Workout Tracker');
    expect(result.data!.ascAppId).toBe('9999999999');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateAscApp).not.toHaveBeenCalled();
  });

  it('existing ascAppId in eas.json → skips createAscApp', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))   // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON_WITH_ASC);  // eas.json (has ascAppId)
    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBe('9999999999');
    expect(mockCreateAscApp).not.toHaveBeenCalled();
    expect(mockSetAppMetadata).toHaveBeenCalledTimes(1);
  });

  it('dry-run mode → returns success without calling any services', async () => {
    const ctx = createCtx();
    ctx.dryRun = true;

    const result = await run(defaultInput, ctx);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.data!.listing).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Name Collision Tests (4)
// ---------------------------------------------------------------------------

describe('Hook 08: Store Listing Writer — name collision', () => {
  function setupForCollision() {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON)            // eas.json (readAscAppId)
      .mockResolvedValueOnce(FAKE_EAS_JSON);           // eas.json (writeAscAppId)
    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);
  }

  it('attempt 1 succeeds → returns appId, finalName matches original', async () => {
    setupForCollision();
    // createAscApp succeeds on first try (default mock)

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBe('1234567890');
    expect(result.data!.listing!.name).toBe('FitTrack Pro');
    expect(mockCreateAscApp).toHaveBeenCalledTimes(1);
  });

  it('attempt 1 fails 409, attempt 2 (suffix) succeeds', async () => {
    setupForCollision();
    mockCreateAscApp
      .mockRejectedValueOnce(new AscAppNameTakenError('FitTrack Pro', 'taken'))
      .mockResolvedValueOnce({ ascAppId: '2222222222', bundleId: 'dev.zionxai.workouttracker', name: 'FitTrack Pro health', sku: 'x', primaryLocale: 'en-US' });

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBe('2222222222');
    expect(mockCreateAscApp).toHaveBeenCalledTimes(2);
  });

  it('attempts 1+2 fail 409, LLM alternative #1 succeeds', async () => {
    setupForCollision();
    mockCreateAscApp
      .mockRejectedValueOnce(new AscAppNameTakenError('FitTrack Pro', 'taken'))
      .mockRejectedValueOnce(new AscAppNameTakenError('FitTrack Pro health', 'taken'))
      .mockResolvedValueOnce({ ascAppId: '3333333333', bundleId: 'dev.zionxai.workouttracker', name: 'GymBuddy', sku: 'x', primaryLocale: 'en-US' });
    // Second LLM call for alternative names
    mockCreate.mockResolvedValueOnce(FAKE_ALT_NAMES_RESPONSE);

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBe('3333333333');
    expect(mockCreate).toHaveBeenCalledTimes(2); // listing + alternatives
  });

  it('all 5 attempts fail 409 → continues without ASC (NOTIFY)', async () => {
    setupForCollision();
    mockCreateAscApp.mockRejectedValue(new AscAppNameTakenError('any', 'taken'));
    mockCreate.mockResolvedValueOnce(FAKE_ALT_NAMES_RESPONSE); // alternatives LLM call

    const result = await run(defaultInput, createCtx());

    // NOTIFY: success is true but ascAppId is null
    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBeNull();
    expect(mockCreateAscApp).toHaveBeenCalledTimes(5);
  });
});

// ---------------------------------------------------------------------------
// Error Handling Tests (2)
// ---------------------------------------------------------------------------

describe('Hook 08: Store Listing Writer — error handling', () => {
  function setupForAscError() {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON);           // eas.json
    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);
  }

  it('ASC auth failure (401): returns success: false with credential error', async () => {
    setupForAscError();
    mockCreateAscApp.mockRejectedValueOnce(new AscApiError(401, 'UNAUTHORIZED', 'Bad token'));

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain('ASC authentication failed');
  });

  it('ASC 5xx (NOTIFY): continues without ascAppId, returns success: true', async () => {
    setupForAscError();
    mockCreateAscApp.mockRejectedValueOnce(new AscApiError(500, 'INTERNAL', 'Server error'));

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Screenshot Tests (2)
// ---------------------------------------------------------------------------

describe('Hook 08: Store Listing Writer — screenshots', () => {
  it('idempotency: if 3+ PNGs already in assets/screenshots/, skips generation', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON_WITH_ASC);  // eas.json (readAscAppId)
    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);
    mockListFiles.mockResolvedValueOnce([
      'assets/screenshots/screenshot-1.png',
      'assets/screenshots/screenshot-2.png',
      'assets/screenshots/screenshot-3.png',
    ]);

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.screenshotsGenerated).toBe(3);
    expect(mockGenerateScreenshots).not.toHaveBeenCalled();
  });

  it('screenshot upload: each screenshot triggers uploadScreenshot, partial failure non-blocking', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON_WITH_ASC);  // eas.json (has ascAppId)
    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);
    mockListFiles.mockResolvedValue([]); // no existing screenshots (reset default)
    mockGenerateScreenshots.mockResolvedValueOnce({
      screenshots: [
        { filename: 'screenshot-1.png', width: 1290, height: 2796, isPlaceholder: true },
        { filename: 'screenshot-2.png', width: 1290, height: 2796, isPlaceholder: true },
      ],
      costUsd: 0,
    });
    // First upload succeeds, second fails
    mockUploadScreenshot
      .mockResolvedValueOnce('ss-id-1')
      .mockRejectedValueOnce(new Error('upload failed'));

    const result = await run(defaultInput, createCtx());

    expect(result.success).toBe(true);
    expect(result.data!.screenshotsGenerated).toBe(2);
    expect(mockUploadScreenshot).toHaveBeenCalledTimes(2);
  });
});
