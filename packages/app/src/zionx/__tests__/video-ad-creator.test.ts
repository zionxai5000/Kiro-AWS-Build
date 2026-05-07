/**
 * Unit tests for ZionX Ads — Video Ad Creator
 *
 * Validates: Requirements 11d.2, 19.1
 *
 * Tests video ad creation in multiple formats (15s vertical, 30s horizontal,
 * 6s bumper), script generation, scene structure, HeyGen/LLM driver calls,
 * Zikaron persistence, and VIDEO_FORMAT_SPECS constant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VideoAdCreator,
  VIDEO_FORMAT_SPECS,
  type HeyGenDriver,
  type LLMDriver,
  type VideoAdConfig,
  type VideoFormat,
} from '../ads/video-ad-creator.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { DriverResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockHeyGenDriver(): HeyGenDriver {
  return {
    execute: vi.fn(async (): Promise<DriverResult> => ({
      success: true,
      data: { id: `heygen-video-${Date.now()}` },
      retryable: false,
      operationId: `op-heygen-${Date.now()}`,
    })),
  };
}

function createMockLLMDriver(): LLMDriver {
  return {
    execute: vi.fn(async (): Promise<DriverResult> => ({
      success: true,
      data: 'Generated video ad script content',
      retryable: false,
      operationId: `op-llm-${Date.now()}`,
    })),
  };
}

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn(async () => 'id'),
    storeSemantic: vi.fn(async () => 'id'),
    storeProcedural: vi.fn(async () => 'id'),
    storeWorking: vi.fn(async () => 'id'),
    query: vi.fn(async () => []),
    queryByAgent: vi.fn(async () => []),
    loadAgentContext: vi.fn(async () => ({
      agentId: '',
      episodic: [],
      semantic: [],
      procedural: [],
      working: null,
    })),
    flagConflict: vi.fn(async () => {}),
  } as unknown as ZikaronService;
}

function createDefaultConfig(overrides?: Partial<VideoAdConfig>): VideoAdConfig {
  return {
    appId: 'test-app-1',
    appName: 'TestApp',
    tagline: 'The best test app',
    keyFeatures: ['Feature A', 'Feature B', 'Feature C'],
    targetFormats: ['15s_vertical', '30s_horizontal', '6s_bumper'],
    brandColors: { primary: '#FF0000', secondary: '#0000FF' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoAdCreator', () => {
  let creator: VideoAdCreator;
  let mockHeyGen: HeyGenDriver;
  let mockLLM: LLMDriver;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockHeyGen = createMockHeyGenDriver();
    mockLLM = createMockLLMDriver();
    mockZikaron = createMockZikaronService();
    creator = new VideoAdCreator(mockHeyGen, mockLLM, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // Video creation — correct structure
  // -------------------------------------------------------------------------

  describe('video creation', () => {
    it('should produce videos for all target formats with correct structure', async () => {
      const config = createDefaultConfig();
      const result = await creator.create(config);

      expect(result.appId).toBe('test-app-1');
      expect(result.totalVideos).toBe(3);
      expect(result.formatCoverage).toEqual(['15s_vertical', '30s_horizontal', '6s_bumper']);
      expect(result.generatedAt).toBeDefined();

      for (const video of result.videos) {
        expect(video.id).toBeTruthy();
        expect(video.appId).toBe('test-app-1');
        expect(video.format).toBeTruthy();
        expect(video.status).toBe('ready');
        expect(video.script).toBeDefined();
        expect(video.videoPath).toBeTruthy();
        expect(video.thumbnailPath).toBeTruthy();
        expect(video.width).toBeGreaterThan(0);
        expect(video.height).toBeGreaterThan(0);
        expect(video.durationSeconds).toBeGreaterThan(0);
      }
    });

    it('should generate a video for a single target format', async () => {
      const config = createDefaultConfig({ targetFormats: ['15s_vertical'] });
      const result = await creator.create(config);

      expect(result.totalVideos).toBe(1);
      expect(result.videos.length).toBe(1);
      expect(result.videos[0]!.format).toBe('15s_vertical');
    });
  });

  // -------------------------------------------------------------------------
  // 15s vertical format
  // -------------------------------------------------------------------------

  describe('15s vertical format', () => {
    it('should have 1080x1920 dimensions, 15s duration, and 4 scenes', async () => {
      const config = createDefaultConfig({ targetFormats: ['15s_vertical'] });
      const result = await creator.create(config);
      const video = result.videos[0]!;

      expect(video.width).toBe(1080);
      expect(video.height).toBe(1920);
      expect(video.durationSeconds).toBe(15);
      expect(video.script.scenes.length).toBe(4);
    });

    it('should target TikTok, Instagram Reels, and YouTube Shorts', () => {
      const spec = VIDEO_FORMAT_SPECS['15s_vertical'];
      expect(spec.targetPlatforms).toContain('TikTok');
      expect(spec.targetPlatforms).toContain('Instagram Reels');
      expect(spec.targetPlatforms).toContain('YouTube Shorts');
    });
  });

  // -------------------------------------------------------------------------
  // 30s horizontal format
  // -------------------------------------------------------------------------

  describe('30s horizontal format', () => {
    it('should have 1920x1080 dimensions, 30s duration, and 6 scenes', async () => {
      const config = createDefaultConfig({ targetFormats: ['30s_horizontal'] });
      const result = await creator.create(config);
      const video = result.videos[0]!;

      expect(video.width).toBe(1920);
      expect(video.height).toBe(1080);
      expect(video.durationSeconds).toBe(30);
      expect(video.script.scenes.length).toBe(6);
    });

    it('should target YouTube Pre-roll', () => {
      const spec = VIDEO_FORMAT_SPECS['30s_horizontal'];
      expect(spec.targetPlatforms).toContain('YouTube Pre-roll');
    });
  });

  // -------------------------------------------------------------------------
  // 6s bumper format
  // -------------------------------------------------------------------------

  describe('6s bumper format', () => {
    it('should have 1920x1080 dimensions, 6s duration, and 3 scenes', async () => {
      const config = createDefaultConfig({ targetFormats: ['6s_bumper'] });
      const result = await creator.create(config);
      const video = result.videos[0]!;

      expect(video.width).toBe(1920);
      expect(video.height).toBe(1080);
      expect(video.durationSeconds).toBe(6);
      expect(video.script.scenes.length).toBe(3);
    });

    it('should target YouTube Bumper', () => {
      const spec = VIDEO_FORMAT_SPECS['6s_bumper'];
      expect(spec.targetPlatforms).toContain('YouTube Bumper');
    });
  });

  // -------------------------------------------------------------------------
  // Script generation
  // -------------------------------------------------------------------------

  describe('script generation', () => {
    it('should produce a VideoScript with scenes, voice-over text, and music cue', async () => {
      const config = createDefaultConfig();
      const format: VideoFormat = '15s_vertical';
      const spec = VIDEO_FORMAT_SPECS[format];

      const script = await creator.generateScript(config, format, spec);

      expect(script.format).toBe('15s_vertical');
      expect(script.scenes.length).toBeGreaterThan(0);
      expect(script.totalDurationSeconds).toBe(15);
      expect(script.voiceOverText).toBeTruthy();
      expect(script.musicCue).toBeTruthy();
    });

    it('should use custom musicStyle from config when provided', async () => {
      const config = createDefaultConfig({ musicStyle: 'classical, orchestral' });
      const format: VideoFormat = '30s_horizontal';
      const spec = VIDEO_FORMAT_SPECS[format];

      const script = await creator.generateScript(config, format, spec);

      expect(script.musicCue).toBe('classical, orchestral');
    });

    it('should default musicCue to upbeat, modern when musicStyle is not provided', async () => {
      const config = createDefaultConfig();
      const format: VideoFormat = '6s_bumper';
      const spec = VIDEO_FORMAT_SPECS[format];

      const script = await creator.generateScript(config, format, spec);

      expect(script.musicCue).toBe('upbeat, modern');
    });
  });

  // -------------------------------------------------------------------------
  // Scene structure
  // -------------------------------------------------------------------------

  describe('scene structure', () => {
    it('each scene should have order, durationSeconds, visualDescription, and transition', async () => {
      const config = createDefaultConfig();

      for (const format of config.targetFormats) {
        const spec = VIDEO_FORMAT_SPECS[format];
        const script = await creator.generateScript(config, format, spec);

        for (const scene of script.scenes) {
          expect(scene.order).toBeGreaterThan(0);
          expect(scene.durationSeconds).toBeGreaterThan(0);
          expect(scene.visualDescription).toBeTruthy();
          expect(['cut', 'fade', 'slide', 'zoom']).toContain(scene.transition);
        }
      }
    });

    it('scenes may have optional textOverlay and callToAction', async () => {
      const config = createDefaultConfig({ targetFormats: ['30s_horizontal'] });
      const spec = VIDEO_FORMAT_SPECS['30s_horizontal'];
      const script = await creator.generateScript(config, '30s_horizontal', spec);

      // At least one scene should have textOverlay
      const hasTextOverlay = script.scenes.some((s) => s.textOverlay !== undefined);
      expect(hasTextOverlay).toBe(true);

      // At least one scene should have callToAction (the end card)
      const hasCTA = script.scenes.some((s) => s.callToAction !== undefined);
      expect(hasCTA).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // HeyGen driver calls
  // -------------------------------------------------------------------------

  describe('HeyGen driver calls', () => {
    it('should call HeyGen driver for each video format', async () => {
      const config = createDefaultConfig();
      await creator.create(config);

      expect(mockHeyGen.execute).toHaveBeenCalledTimes(3);
    });

    it('should call HeyGen with correct params (title, avatarId, script, templateId)', async () => {
      const config = createDefaultConfig({
        targetFormats: ['15s_vertical'],
        avatarId: 'custom-avatar',
      });
      await creator.create(config);

      const call = (mockHeyGen.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.type).toBe('createVideo');
      expect(call.params.title).toContain('TestApp');
      expect(call.params.title).toContain('15s_vertical');
      expect(call.params.avatarId).toBe('custom-avatar');
      expect(call.params.script).toBeTruthy();
      expect(call.params.templateId).toBe('template-vertical-short');
    });

    it('should use default avatar when avatarId is not provided', async () => {
      const config = createDefaultConfig({ targetFormats: ['6s_bumper'] });
      await creator.create(config);

      const call = (mockHeyGen.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.params.avatarId).toBe('default-avatar');
    });

    it('should use correct template for each format', async () => {
      const config = createDefaultConfig();
      await creator.create(config);

      const calls = (mockHeyGen.execute as ReturnType<typeof vi.fn>).mock.calls;
      const templates = calls.map((c: unknown[]) => (c[0] as { params: { templateId: string } }).params.templateId);

      expect(templates).toContain('template-vertical-short');
      expect(templates).toContain('template-horizontal-standard');
      expect(templates).toContain('template-bumper');
    });
  });

  // -------------------------------------------------------------------------
  // LLM driver calls
  // -------------------------------------------------------------------------

  describe('LLM driver calls', () => {
    it('should call LLM driver for script generation for each format', async () => {
      const config = createDefaultConfig();
      await creator.create(config);

      expect(mockLLM.execute).toHaveBeenCalledTimes(3);
    });

    it('should call LLM driver with correct operation type and params', async () => {
      const config = createDefaultConfig({ targetFormats: ['15s_vertical'] });
      await creator.create(config);

      const call = (mockLLM.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.type).toBe('generate');
      expect(call.params.prompt).toBeTruthy();
      expect(call.params.maxTokens).toBe(1500);
      expect(call.params.temperature).toBe(0.6);
      expect(call.params.taskType).toBe('creative');
    });
  });

  // -------------------------------------------------------------------------
  // Persistence — Zikaron storeProcedural
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('should store videos in Zikaron via storeProcedural', async () => {
      const config = createDefaultConfig();
      await creator.create(config);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
    });

    it('should store with correct metadata', async () => {
      const config = createDefaultConfig();
      await creator.create(config);

      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.content).toContain('test-app-1');
      expect(call.tags).toContain('video-ads');
      expect(call.tags).toContain('test-app-1');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('procedural');
      expect(call.workflowPattern).toBe('video_ad_creation');
      expect(call.steps.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // VIDEO_FORMAT_SPECS constant
  // -------------------------------------------------------------------------

  describe('VIDEO_FORMAT_SPECS constant', () => {
    it('should define specs for all 3 formats', () => {
      const formats: VideoFormat[] = ['15s_vertical', '30s_horizontal', '6s_bumper'];
      for (const format of formats) {
        expect(VIDEO_FORMAT_SPECS[format]).toBeDefined();
        expect(VIDEO_FORMAT_SPECS[format].format).toBe(format);
      }
    });

    it('15s_vertical should have correct specs', () => {
      const spec = VIDEO_FORMAT_SPECS['15s_vertical'];
      expect(spec.width).toBe(1080);
      expect(spec.height).toBe(1920);
      expect(spec.durationSeconds).toBe(15);
      expect(spec.orientation).toBe('vertical');
      expect(spec.targetPlatforms).toEqual(['TikTok', 'Instagram Reels', 'YouTube Shorts']);
      expect(spec.maxFileSizeMb).toBe(50);
    });

    it('30s_horizontal should have correct specs', () => {
      const spec = VIDEO_FORMAT_SPECS['30s_horizontal'];
      expect(spec.width).toBe(1920);
      expect(spec.height).toBe(1080);
      expect(spec.durationSeconds).toBe(30);
      expect(spec.orientation).toBe('horizontal');
      expect(spec.targetPlatforms).toEqual(['YouTube Pre-roll']);
      expect(spec.maxFileSizeMb).toBe(100);
    });

    it('6s_bumper should have correct specs', () => {
      const spec = VIDEO_FORMAT_SPECS['6s_bumper'];
      expect(spec.width).toBe(1920);
      expect(spec.height).toBe(1080);
      expect(spec.durationSeconds).toBe(6);
      expect(spec.orientation).toBe('horizontal');
      expect(spec.targetPlatforms).toEqual(['YouTube Bumper']);
      expect(spec.maxFileSizeMb).toBe(20);
    });
  });
});
