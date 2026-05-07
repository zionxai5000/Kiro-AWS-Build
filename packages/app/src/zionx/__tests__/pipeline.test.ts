/**
 * Unit tests for ZionX App Factory — Build Pipeline
 *
 * Validates: Requirements 11.1, 19.1
 *
 * Tests the full build pipeline: code generation, compilation,
 * test execution, and packaging for iOS and Android.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateCode,
  compileApp,
  executeTests,
  packageApp,
  runFullPipeline,
} from '../pipeline.js';
import type { LLMDriver, FullPipelineInput } from '../pipeline.js';

// ---------------------------------------------------------------------------
// Mock LLM Driver
// ---------------------------------------------------------------------------

function createMockLLMDriver(success = true): LLMDriver {
  return {
    execute: vi.fn().mockResolvedValue({
      success,
      operationId: 'op-123',
      data: success ? { files: ['main.swift'] } : undefined,
      error: success ? undefined : { message: 'Generation failed' },
    }),
  };
}

describe('generateCode', () => {
  it('should generate code for iOS platform', async () => {
    const driver = createMockLLMDriver();
    const result = await generateCode(
      {
        appSpec: { name: 'TestApp', description: 'A test app', features: ['feature1'] },
        platform: 'ios',
      },
      driver,
    );

    expect(result.success).toBe(true);
    expect(result.stage).toBe('code_generation');
    expect(result.platform).toBe('ios');
    expect(result.errors).toHaveLength(0);
    expect(result.details.sourcePath).toContain('ios');
  });

  it('should generate code for Android platform', async () => {
    const driver = createMockLLMDriver();
    const result = await generateCode(
      {
        appSpec: { name: 'TestApp', description: 'A test app', features: ['feature1'] },
        platform: 'android',
      },
      driver,
    );

    expect(result.success).toBe(true);
    expect(result.platform).toBe('android');
    expect(result.details.sourcePath).toContain('android');
  });

  it('should handle LLM driver failure', async () => {
    const driver = createMockLLMDriver(false);
    const result = await generateCode(
      {
        appSpec: { name: 'TestApp', description: 'A test app', features: [] },
        platform: 'ios',
      },
      driver,
    );

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('compileApp', () => {
  it('should compile for iOS using xcodebuild', async () => {
    const result = await compileApp({ sourcePath: '/src', platform: 'ios' });
    expect(result.success).toBe(true);
    expect(result.stage).toBe('compilation');
    expect(result.details.compiler).toBe('xcodebuild');
  });

  it('should compile for Android using gradle', async () => {
    const result = await compileApp({ sourcePath: '/src', platform: 'android' });
    expect(result.success).toBe(true);
    expect(result.details.compiler).toBe('gradle');
  });
});

describe('executeTests', () => {
  it('should run tests for iOS using xctest', async () => {
    const result = await executeTests({ appPath: '/build', platform: 'ios' });
    expect(result.success).toBe(true);
    expect(result.stage).toBe('test_execution');
    expect(result.details.testRunner).toBe('xctest');
  });

  it('should run tests for Android using espresso', async () => {
    const result = await executeTests({ appPath: '/build', platform: 'android' });
    expect(result.success).toBe(true);
    expect(result.details.testRunner).toBe('espresso');
  });
});

describe('packageApp', () => {
  it('should package iOS app as IPA', async () => {
    const result = await packageApp({
      buildPath: '/build',
      platform: 'ios',
      version: '1.0.0',
      buildNumber: '1',
    });
    expect(result.success).toBe(true);
    expect(result.stage).toBe('packaging');
    expect(result.details.format).toBe('IPA');
    expect((result.details.artifactPath as string)).toContain('.ipa');
  });

  it('should package Android app as AAB', async () => {
    const result = await packageApp({
      buildPath: '/build',
      platform: 'android',
      version: '1.0.0',
      buildNumber: '1',
    });
    expect(result.success).toBe(true);
    expect(result.details.format).toBe('AAB');
    expect((result.details.artifactPath as string)).toContain('.aab');
  });

  it('should track signing status', async () => {
    const unsigned = await packageApp({
      buildPath: '/build',
      platform: 'ios',
      version: '1.0.0',
      buildNumber: '1',
    });
    expect(unsigned.details.signed).toBe(false);

    const signed = await packageApp({
      buildPath: '/build',
      platform: 'ios',
      version: '1.0.0',
      buildNumber: '1',
      signingConfig: { teamId: 'TEAM123' },
    });
    expect(signed.details.signed).toBe(true);
  });
});

describe('runFullPipeline', () => {
  const baseInput: FullPipelineInput = {
    appId: 'app-test-1',
    appSpec: {
      name: 'TestApp',
      description: 'A test application',
      features: ['feature1', 'feature2'],
    },
    platform: 'ios',
    version: '1.0.0',
    buildNumber: '42',
  };

  it('should execute all 4 pipeline stages successfully', async () => {
    const driver = createMockLLMDriver();
    const result = await runFullPipeline(baseInput, driver);

    expect(result.success).toBe(true);
    expect(result.appId).toBe('app-test-1');
    expect(result.platform).toBe('ios');
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.stage)).toEqual([
      'code_generation',
      'compilation',
      'test_execution',
      'packaging',
    ]);
    expect(result.artifactPath).toBeDefined();
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should halt pipeline on code generation failure', async () => {
    const driver = createMockLLMDriver(false);
    const result = await runFullPipeline(baseInput, driver);

    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].stage).toBe('code_generation');
    expect(result.artifactPath).toBeUndefined();
  });

  it('should track timing for the full pipeline', async () => {
    const driver = createMockLLMDriver();
    const result = await runFullPipeline(baseInput, driver);

    expect(result.startedAt).toBeDefined();
    expect(result.completedAt).toBeDefined();
    expect(new Date(result.completedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(result.startedAt).getTime(),
    );
  });
});
