/**
 * Tests for Hook 08: Store Listing Writer — happy-path skeleton.
 * Comprehensive error handling + name collision tests deferred to C3 completion.
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

// Mock asc-app-client
const mockCreateAscApp = vi.fn();
const mockSetAppMetadata = vi.fn();
vi.mock('../../services/apple-credentials/asc-app-client.js', () => ({
  createAscApp: (...args: unknown[]) => mockCreateAscApp(...args),
  setAppMetadata: (...args: unknown[]) => mockSetAppMetadata(...args),
}));

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
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class MockWorkspace {
    readFile = mockReadFile;
    writeFile = mockWriteFile;
    writeBinaryFile = mockWriteBinaryFile;
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

const FAKE_EAS_JSON = JSON.stringify({
  build: { production: {} },
});

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

function createCtx(): HookContext {
  return {
    executionId: 'test-exec-1',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: vi.fn(),
  };
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateScreenshots.mockResolvedValue({ screenshots: [{ filename: 'screenshot-1.png', width: 1290, height: 2796, isPlaceholder: true }], costUsd: 0 });
  mockCreateAscApp.mockResolvedValue({ ascAppId: '1234567890', bundleId: 'dev.zionxai.workouttracker', name: 'FitTrack Pro', sku: 'dev-zionxai-workouttracker', primaryLocale: 'en-US' });
  mockSetAppMetadata.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook 08: Store Listing Writer', () => {
  it('happy path: generates listing, creates ASC app, sets metadata, generates screenshots', async () => {
    // Workspace reads: store-listing.json (not found), app.json (found), eas.json (no ascAppId)
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON)            // eas.json (readAscAppIdFromEasJson)
      .mockResolvedValueOnce(FAKE_EAS_JSON);           // eas.json (writeAscAppIdToEasJson read)

    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);

    const result = await run(
      { projectId: 'test-001', appName: 'Workout Tracker', appDescription: 'Track exercises', credentialManager: mockCredentialManager as any },
      createCtx(),
    );

    expect(result.success).toBe(true);
    expect(result.data!.listing).not.toBeNull();
    expect(result.data!.listing!.name).toBe('FitTrack Pro');
    expect(result.data!.ascAppId).toBe('1234567890');
    expect(result.data!.screenshotsGenerated).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateAscApp).toHaveBeenCalledTimes(1);
    expect(mockSetAppMetadata).toHaveBeenCalledTimes(1);
    expect(mockGenerateScreenshots).toHaveBeenCalledTimes(1);
  });

  it('existing store-listing.json → skips LLM call, returns cached', async () => {
    mockReadFile
      .mockResolvedValueOnce(FAKE_LISTING_JSON)  // store-listing.json found
      .mockResolvedValueOnce(FAKE_EAS_JSON_WITH_ASC); // eas.json (readAscAppIdFromEasJson)

    const result = await run(
      { projectId: 'test-001', appName: 'Workout Tracker', appDescription: 'Track exercises', credentialManager: mockCredentialManager as any },
      createCtx(),
    );

    expect(result.success).toBe(true);
    expect(result.data!.listing!.name).toBe('Workout Tracker');
    expect(result.data!.ascAppId).toBe('9999999999');
    // LLM, ASC, screenshots NOT called
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateAscApp).not.toHaveBeenCalled();
    expect(mockGenerateScreenshots).not.toHaveBeenCalled();
  });

  it('existing ascAppId in eas.json → skips createAscApp (cache hit)', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))  // store-listing.json
      .mockResolvedValueOnce(FAKE_APP_JSON)            // app.json
      .mockResolvedValueOnce(FAKE_EAS_JSON_WITH_ASC);  // eas.json (has ascAppId)

    mockCreate.mockResolvedValueOnce(FAKE_LLM_RESPONSE);

    const result = await run(
      { projectId: 'test-001', appName: 'Workout Tracker', appDescription: 'Track exercises', credentialManager: mockCredentialManager as any },
      createCtx(),
    );

    expect(result.success).toBe(true);
    expect(result.data!.ascAppId).toBe('9999999999');
    // createAscApp NOT called (cached)
    expect(mockCreateAscApp).not.toHaveBeenCalled();
    // setAppMetadata IS called (always pushes latest)
    expect(mockSetAppMetadata).toHaveBeenCalledTimes(1);
  });

  it('dry-run mode → returns success without calling any services', async () => {
    const ctx = createCtx();
    ctx.dryRun = true;

    const result = await run(
      { projectId: 'test-001', appName: 'Test', appDescription: 'Test', credentialManager: mockCredentialManager as any },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.data!.listing).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCreateAscApp).not.toHaveBeenCalled();
    expect(mockGenerateScreenshots).not.toHaveBeenCalled();
  });
});
