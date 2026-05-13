/**
 * Unit tests for ZXMG Video Development Studio — Video Production Pipeline
 *
 * Validates: Requirements 44b.12, 44b.13, 44b.14, 44b.15, 44b.16
 *
 * Tests script generation produces complete package, scene decomposition creates
 * scenes with all fields, 15-min video support, multi-style support, assembly
 * combines clips, and hooks emit correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultVideoProductionPipeline,
  type VideoProductionPipeline,
  type ScriptGenerator,
  type VideoAssembler,
  type ThumbnailGenerator,
  type MetadataGenerator,
  type ProductionEventBus,
  type ChannelConfig,
  type SceneDefinition,
} from '../production-pipeline.js';
import type { PipelineItemConcept } from '../autonomous-engine.js';
import type { MultiModelVideoRouter, VideoGenerationResult } from '../model-router.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockScenes(count: number = 5, durationEach: number = 30): SceneDefinition[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `scene-${i + 1}`,
    order: i,
    duration: durationEach,
    visualDescription: `Visual description for scene ${i + 1}`,
    cameraDirection: (['static', 'pan', 'zoom', 'dolly', 'crane'] as const)[i % 5],
    audioLayers: [
      { type: 'music' as const, description: 'Background music' },
      { type: 'voiceover' as const, description: 'Narrator speaks' },
    ],
    characterRefs: i % 2 === 0 ? ['char-1'] : [],
    transition: (['cut', 'fade', 'dissolve', 'wipe'] as const)[i % 4],
  }));
}

function createMockScriptGenerator(scenes?: SceneDefinition[]): ScriptGenerator {
  return {
    generateScript: vi.fn().mockResolvedValue({
      script: 'This is the generated script for the video. It covers the main topic in detail.',
      scenes: scenes ?? createMockScenes(),
    }),
  };
}

function createMockModelRouter(): MultiModelVideoRouter {
  return {
    getAvailableModels: vi.fn().mockReturnValue([]),
    selectModel: vi.fn().mockReturnValue({ model: 'veo-3', costPerSecond: 0.45 }),
    generateClip: vi.fn().mockResolvedValue({
      sceneId: 'scene-1',
      videoUrl: 'https://cdn.example.com/clip.mp4',
      model: 'veo-3',
      duration: 30,
      resolution: { width: 1920, height: 1080 },
      cost: 13.5,
      generationTimeMs: 15000,
    }),
    generateBatch: vi.fn().mockImplementation(async (requests) => {
      return requests.map((req: { sceneId: string; duration: number }) => ({
        sceneId: req.sceneId,
        videoUrl: `https://cdn.example.com/${req.sceneId}.mp4`,
        model: 'veo-3',
        duration: req.duration,
        resolution: { width: 1920, height: 1080 },
        cost: req.duration * 0.45,
        generationTimeMs: 15000,
      }));
    }),
  };
}

function createMockAssembler(): VideoAssembler {
  return {
    assemble: vi.fn().mockImplementation(async (clips) => ({
      videoUrl: 'https://cdn.example.com/assembled-video.mp4',
      duration: clips.reduce((sum: number, c: { duration: number }) => sum + c.duration, 0),
    })),
  };
}

function createMockThumbnailGenerator(): ThumbnailGenerator {
  return {
    generate: vi.fn().mockResolvedValue([
      'https://cdn.example.com/thumb-1.jpg',
      'https://cdn.example.com/thumb-2.jpg',
      'https://cdn.example.com/thumb-3.jpg',
    ]),
  };
}

function createMockMetadataGenerator(): MetadataGenerator {
  return {
    generate: vi.fn().mockResolvedValue({
      title: 'Generated Video Title',
      description: 'A comprehensive video about the topic',
      tags: ['tech', 'tutorial', 'ai'],
    }),
  };
}

function createMockEventBus(): ProductionEventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createConcept(overrides: Partial<PipelineItemConcept> = {}): PipelineItemConcept {
  return {
    title: 'AI Productivity Tools in 2024',
    description: 'A deep dive into the best AI tools for productivity',
    predictedViews: 50000,
    predictedEngagement: 8.5,
    predictedRevenue: 150,
    suggestedPublishDate: new Date(),
    style: 'cinematic',
    duration: 600,
    tags: ['ai', 'productivity', 'tools'],
    ...overrides,
  };
}

function createChannelConfig(overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    channelId: 'channel-1',
    niche: 'tech',
    defaultStyle: 'cinematic',
    targetAudience: 'developers',
    preferredDuration: 600,
    platform: 'youtube',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultVideoProductionPipeline', () => {
  let pipeline: VideoProductionPipeline;
  let scriptGen: ReturnType<typeof createMockScriptGenerator>;
  let modelRouter: ReturnType<typeof createMockModelRouter>;
  let assembler: ReturnType<typeof createMockAssembler>;
  let thumbnailGen: ReturnType<typeof createMockThumbnailGenerator>;
  let metadataGen: ReturnType<typeof createMockMetadataGenerator>;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    scriptGen = createMockScriptGenerator();
    modelRouter = createMockModelRouter();
    assembler = createMockAssembler();
    thumbnailGen = createMockThumbnailGenerator();
    metadataGen = createMockMetadataGenerator();
    eventBus = createMockEventBus();
    pipeline = new DefaultVideoProductionPipeline(
      scriptGen,
      modelRouter,
      assembler,
      thumbnailGen,
      metadataGen,
      eventBus,
    );
  });

  // -------------------------------------------------------------------------
  // Script generation produces complete package
  // -------------------------------------------------------------------------

  describe('generateScript', () => {
    it('produces a complete production package with all fields', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      const pkg = await pipeline.generateScript(concept, channelConfig);

      expect(pkg.videoId).toBeTruthy();
      expect(pkg.channelId).toBe('channel-1');
      expect(pkg.script).toBeTruthy();
      expect(pkg.scenes.length).toBeGreaterThan(0);
      expect(pkg.style).toBe('cinematic');
      expect(pkg.totalDuration).toBeGreaterThan(0);
    });

    it('passes concept and channel config to script generator', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      await pipeline.generateScript(concept, channelConfig);

      expect(scriptGen.generateScript).toHaveBeenCalledWith(concept, channelConfig);
    });

    it('uses concept style when available', async () => {
      const concept = createConcept({ style: 'documentary' });
      const channelConfig = createChannelConfig({ defaultStyle: 'cinematic' });

      const pkg = await pipeline.generateScript(concept, channelConfig);

      expect(pkg.style).toBe('documentary');
    });

    it('falls back to channel default style when concept style is empty', async () => {
      const concept = createConcept({ style: '' });
      const channelConfig = createChannelConfig({ defaultStyle: 'vlog' });

      const pkg = await pipeline.generateScript(concept, channelConfig);

      expect(pkg.style).toBe('vlog');
    });

    it('emits production.script.generated event', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      await pipeline.generateScript(concept, channelConfig);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const scriptEvent = publishCalls.find(
        (call) => call[0].type === 'production.script.generated',
      );

      expect(scriptEvent).toBeDefined();
      expect(scriptEvent![0].source).toBe('zxmg.studio.production-pipeline');
      expect(scriptEvent![0].detail.channelId).toBe('channel-1');
      expect(scriptEvent![0].detail.sceneCount).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Scene decomposition creates scenes with all fields
  // -------------------------------------------------------------------------

  describe('scene decomposition', () => {
    it('each scene has all required fields', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      const pkg = await pipeline.generateScript(concept, channelConfig);

      for (const scene of pkg.scenes) {
        expect(scene.id).toBeTruthy();
        expect(typeof scene.order).toBe('number');
        expect(scene.duration).toBeGreaterThan(0);
        expect(scene.visualDescription).toBeTruthy();
        expect(scene.cameraDirection).toBeTruthy();
        expect(scene.audioLayers).toBeInstanceOf(Array);
        expect(scene.audioLayers.length).toBeGreaterThan(0);
        expect(scene.characterRefs).toBeInstanceOf(Array);
        expect(['cut', 'fade', 'dissolve', 'wipe']).toContain(scene.transition);
      }
    });

    it('scenes are ordered sequentially', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      const pkg = await pipeline.generateScript(concept, channelConfig);

      for (let i = 0; i < pkg.scenes.length - 1; i++) {
        expect(pkg.scenes[i].order).toBeLessThan(pkg.scenes[i + 1].order);
      }
    });

    it('audio layers have type and description', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      const pkg = await pipeline.generateScript(concept, channelConfig);

      for (const scene of pkg.scenes) {
        for (const layer of scene.audioLayers) {
          expect(['music', 'sfx', 'voiceover', 'ambient']).toContain(layer.type);
          expect(layer.description).toBeTruthy();
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 15-minute video support
  // -------------------------------------------------------------------------

  describe('15-minute video support', () => {
    it('supports videos up to 15 minutes (900 seconds)', async () => {
      // Create scenes totaling 15 minutes
      const longScenes = createMockScenes(30, 30); // 30 scenes × 30s = 900s
      scriptGen = createMockScriptGenerator(longScenes);
      pipeline = new DefaultVideoProductionPipeline(
        scriptGen,
        modelRouter,
        assembler,
        thumbnailGen,
        metadataGen,
        eventBus,
      );

      const concept = createConcept({ duration: 900 });
      const channelConfig = createChannelConfig();

      const pkg = await pipeline.generateScript(concept, channelConfig);

      expect(pkg.totalDuration).toBeLessThanOrEqual(900);
      expect(pkg.scenes.length).toBe(30);
    });

    it('caps total duration at 15 minutes', async () => {
      // Create scenes totaling more than 15 minutes
      const overLongScenes = createMockScenes(40, 30); // 40 × 30s = 1200s
      scriptGen = createMockScriptGenerator(overLongScenes);
      pipeline = new DefaultVideoProductionPipeline(
        scriptGen,
        modelRouter,
        assembler,
        thumbnailGen,
        metadataGen,
        eventBus,
      );

      const concept = createConcept({ duration: 1200 });
      const channelConfig = createChannelConfig();

      const pkg = await pipeline.generateScript(concept, channelConfig);

      expect(pkg.totalDuration).toBeLessThanOrEqual(900);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-style support
  // -------------------------------------------------------------------------

  describe('multi-style support', () => {
    it('supports cinematic style', async () => {
      const concept = createConcept({ style: 'cinematic' });
      const pkg = await pipeline.generateScript(concept, createChannelConfig());
      expect(pkg.style).toBe('cinematic');
    });

    it('supports documentary style', async () => {
      const concept = createConcept({ style: 'documentary' });
      const pkg = await pipeline.generateScript(concept, createChannelConfig());
      expect(pkg.style).toBe('documentary');
    });

    it('supports vlog style', async () => {
      const concept = createConcept({ style: 'vlog' });
      const pkg = await pipeline.generateScript(concept, createChannelConfig());
      expect(pkg.style).toBe('vlog');
    });

    it('supports animation style', async () => {
      const concept = createConcept({ style: 'animation' });
      const pkg = await pipeline.generateScript(concept, createChannelConfig());
      expect(pkg.style).toBe('animation');
    });
  });

  // -------------------------------------------------------------------------
  // Assembly combines clips
  // -------------------------------------------------------------------------

  describe('assembleVideo', () => {
    it('combines rendered scenes into a final video', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();
      const pkg = await pipeline.generateScript(concept, channelConfig);

      const renderedScenes: VideoGenerationResult[] = pkg.scenes.map((scene) => ({
        sceneId: scene.id,
        videoUrl: `https://cdn.example.com/${scene.id}.mp4`,
        model: 'veo-3' as const,
        duration: scene.duration,
        resolution: { width: 1920, height: 1080 },
        cost: scene.duration * 0.45,
        generationTimeMs: 15000,
      }));

      const assembled = await pipeline.assembleVideo(pkg, renderedScenes);

      expect(assembled.videoId).toBe(pkg.videoId);
      expect(assembled.videoUrl).toBeTruthy();
      expect(assembled.duration).toBeGreaterThan(0);
      expect(assembled.scenes.length).toBe(pkg.scenes.length);
    });

    it('includes thumbnail variants', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();
      const pkg = await pipeline.generateScript(concept, channelConfig);

      const renderedScenes: VideoGenerationResult[] = pkg.scenes.map((scene) => ({
        sceneId: scene.id,
        videoUrl: `https://cdn.example.com/${scene.id}.mp4`,
        model: 'veo-3' as const,
        duration: scene.duration,
        resolution: { width: 1920, height: 1080 },
        cost: scene.duration * 0.45,
        generationTimeMs: 15000,
      }));

      const assembled = await pipeline.assembleVideo(pkg, renderedScenes);

      expect(assembled.thumbnailVariants.length).toBeGreaterThan(0);
    });

    it('includes metadata (title, description, tags)', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();
      const pkg = await pipeline.generateScript(concept, channelConfig);

      const renderedScenes: VideoGenerationResult[] = pkg.scenes.map((scene) => ({
        sceneId: scene.id,
        videoUrl: `https://cdn.example.com/${scene.id}.mp4`,
        model: 'veo-3' as const,
        duration: scene.duration,
        resolution: { width: 1920, height: 1080 },
        cost: scene.duration * 0.45,
        generationTimeMs: 15000,
      }));

      const assembled = await pipeline.assembleVideo(pkg, renderedScenes);

      expect(assembled.metadata.title).toBeTruthy();
      expect(assembled.metadata.description).toBeTruthy();
      expect(assembled.metadata.tags.length).toBeGreaterThan(0);
    });

    it('emits production.video.assembled event', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();
      const pkg = await pipeline.generateScript(concept, channelConfig);

      const renderedScenes: VideoGenerationResult[] = pkg.scenes.map((scene) => ({
        sceneId: scene.id,
        videoUrl: `https://cdn.example.com/${scene.id}.mp4`,
        model: 'veo-3' as const,
        duration: scene.duration,
        resolution: { width: 1920, height: 1080 },
        cost: scene.duration * 0.45,
        generationTimeMs: 15000,
      }));

      await pipeline.assembleVideo(pkg, renderedScenes);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const assemblyEvent = publishCalls.find(
        (call) => call[0].type === 'production.video.assembled',
      );

      expect(assemblyEvent).toBeDefined();
      expect(assemblyEvent![0].detail.videoId).toBe(pkg.videoId);
      expect(assemblyEvent![0].detail.sceneCount).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // renderScenes
  // -------------------------------------------------------------------------

  describe('renderScenes', () => {
    it('renders all scenes via model router batch', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();
      const pkg = await pipeline.generateScript(concept, channelConfig);

      const results = await pipeline.renderScenes(pkg);

      expect(results.length).toBe(pkg.scenes.length);
      expect(modelRouter.generateBatch).toHaveBeenCalled();
    });

    it('emits production.scenes.rendered event', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();
      const pkg = await pipeline.generateScript(concept, channelConfig);

      (eventBus.publish as ReturnType<typeof vi.fn>).mockClear();
      await pipeline.renderScenes(pkg);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const renderEvent = publishCalls.find(
        (call) => call[0].type === 'production.scenes.rendered',
      );

      expect(renderEvent).toBeDefined();
      expect(renderEvent![0].detail.videoId).toBe(pkg.videoId);
      expect(renderEvent![0].detail.sceneCount).toBe(pkg.scenes.length);
    });
  });

  // -------------------------------------------------------------------------
  // Hooks emit correctly (full production flow)
  // -------------------------------------------------------------------------

  describe('produceVideo — full flow', () => {
    it('executes full pipeline: script → render → assemble', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      const assembled = await pipeline.produceVideo(concept, channelConfig);

      expect(assembled.videoId).toBeTruthy();
      expect(assembled.videoUrl).toBeTruthy();
      expect(assembled.duration).toBeGreaterThan(0);
      expect(assembled.scenes.length).toBeGreaterThan(0);
      expect(assembled.thumbnailVariants.length).toBeGreaterThan(0);
      expect(assembled.metadata.title).toBeTruthy();
    });

    it('emits all lifecycle hooks in order', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      await pipeline.produceVideo(concept, channelConfig);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const eventTypes = publishCalls.map((call) => call[0].type);

      expect(eventTypes).toContain('production.script.generated');
      expect(eventTypes).toContain('production.scenes.rendered');
      expect(eventTypes).toContain('production.video.assembled');
      expect(eventTypes).toContain('production.complete');

      // Verify order
      const scriptIdx = eventTypes.indexOf('production.script.generated');
      const renderIdx = eventTypes.indexOf('production.scenes.rendered');
      const assembleIdx = eventTypes.indexOf('production.video.assembled');
      const completeIdx = eventTypes.indexOf('production.complete');

      expect(scriptIdx).toBeLessThan(renderIdx);
      expect(renderIdx).toBeLessThan(assembleIdx);
      expect(assembleIdx).toBeLessThan(completeIdx);
    });

    it('production.complete event includes final video details', async () => {
      const concept = createConcept();
      const channelConfig = createChannelConfig();

      await pipeline.produceVideo(concept, channelConfig);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const completeEvent = publishCalls.find(
        (call) => call[0].type === 'production.complete',
      );

      expect(completeEvent).toBeDefined();
      expect(completeEvent![0].detail.videoId).toBeTruthy();
      expect(completeEvent![0].detail.channelId).toBe('channel-1');
      expect(completeEvent![0].detail.duration).toBeGreaterThan(0);
      expect(completeEvent![0].detail.sceneCount).toBeGreaterThan(0);
    });
  });
});
