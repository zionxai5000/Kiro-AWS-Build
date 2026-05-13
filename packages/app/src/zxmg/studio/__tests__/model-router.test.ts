/**
 * Unit tests for ZXMG Video Development Studio — Multi-Model Video Router
 *
 * Validates: Requirements 44b.7, 44b.8, 44b.9, 44b.10, 44b.11
 *
 * Tests model selection per shot type, budget constraints downgrade model,
 * all generation modes work, camera moves passed correctly, and batch generation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultMultiModelVideoRouter,
  type MultiModelVideoRouter,
  type VideoModelProvider,
  type OtzarBudgetProvider,
  type ModelRouterEventBus,
  type VideoGenerationRequest,
  type ModelCapability,
} from '../model-router.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockModelProvider(): VideoModelProvider {
  return {
    generate: vi.fn().mockResolvedValue({
      videoUrl: 'https://cdn.example.com/generated-clip.mp4',
      resolution: { width: 1920, height: 1080 },
      generationTimeMs: 12000,
    }),
  };
}

function createMockBudgetProvider(): OtzarBudgetProvider {
  return {
    getRemainingBudget: vi.fn().mockResolvedValue(100),
    recordSpend: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEventBus(): ModelRouterEventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createRequest(overrides: Partial<VideoGenerationRequest> = {}): VideoGenerationRequest {
  return {
    sceneId: 'scene-1',
    prompt: 'A dramatic landscape shot',
    shotType: 'cinematic',
    mode: 'text-to-video',
    duration: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultMultiModelVideoRouter', () => {
  let router: MultiModelVideoRouter;
  let modelProvider: ReturnType<typeof createMockModelProvider>;
  let budgetProvider: ReturnType<typeof createMockBudgetProvider>;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    modelProvider = createMockModelProvider();
    budgetProvider = createMockBudgetProvider();
    eventBus = createMockEventBus();
    router = new DefaultMultiModelVideoRouter(modelProvider, budgetProvider, eventBus);
  });

  // -------------------------------------------------------------------------
  // Model selection per shot type
  // -------------------------------------------------------------------------

  describe('selectModel — shot type routing', () => {
    it('routes cinematic shots to Sora 2 or Veo 3 (highest quality)', () => {
      const request = createRequest({ shotType: 'cinematic', mode: 'text-to-video' });
      const model = router.selectModel(request);

      expect(['sora-2', 'veo-3']).toContain(model.model);
      expect(model.qualityScore).toBeGreaterThanOrEqual(90);
    });

    it('routes fast-iteration shots to Kling 2.6 or WAN 2.1 (fastest)', () => {
      const request = createRequest({ shotType: 'fast-iteration', mode: 'text-to-video', duration: 10 });
      const model = router.selectModel(request);

      expect(['kling-2.6', 'wan-2.1']).toContain(model.model);
      expect(model.speedScore).toBeGreaterThanOrEqual(90);
    });

    it('routes animation shots to animation-specialized', () => {
      const request = createRequest({ shotType: 'animation', mode: 'text-to-video' });
      const model = router.selectModel(request);

      expect(model.model).toBe('animation-specialized');
    });

    it('routes talking-head shots to Veo 3 (best lip-sync)', () => {
      const request = createRequest({ shotType: 'talking-head', mode: 'text-to-video' });
      const model = router.selectModel(request);

      expect(model.model).toBe('veo-3');
    });

    it('routes b-roll shots to Minimax or Kling (cost-effective)', () => {
      const request = createRequest({ shotType: 'b-roll', mode: 'text-to-video', duration: 10 });
      const model = router.selectModel(request);

      expect(['minimax', 'kling-2.6']).toContain(model.model);
      expect(model.costPerSecond).toBeLessThanOrEqual(0.20);
    });

    it('routes transition shots to any fast model', () => {
      const request = createRequest({ shotType: 'transition', mode: 'text-to-video', duration: 5 });
      const model = router.selectModel(request);

      expect(['wan-2.1', 'kling-2.6', 'minimax']).toContain(model.model);
      expect(model.speedScore).toBeGreaterThanOrEqual(80);
    });
  });

  // -------------------------------------------------------------------------
  // Budget constraints downgrade model
  // -------------------------------------------------------------------------

  describe('selectModel — budget constraints', () => {
    it('selects cheaper model when budget is constrained', () => {
      // Cinematic normally selects sora-2 ($0.50/s) or veo-3 ($0.45/s)
      // With a tight budget, it should fall back to a cheaper model
      const request = createRequest({ shotType: 'cinematic', mode: 'text-to-video', duration: 10 });

      // Budget of $1.00 for 10s means max $0.10/s — only wan-2.1 fits
      const model = router.selectModel(request, 1.0);

      expect(model.costPerSecond * request.duration).toBeLessThanOrEqual(1.0);
    });

    it('throws when no model fits the budget', () => {
      const request = createRequest({ shotType: 'cinematic', mode: 'text-to-video', duration: 60 });

      // Budget of $0.01 — nothing fits for 60s
      expect(() => router.selectModel(request, 0.01)).toThrow(/No model available/);
    });

    it('selects premium model when budget is unlimited', () => {
      const request = createRequest({ shotType: 'cinematic', mode: 'text-to-video' });
      const model = router.selectModel(request);

      // Without budget constraint, should pick highest quality
      expect(['sora-2', 'veo-3']).toContain(model.model);
    });

    it('budget constraint forces downgrade from premium to economy', () => {
      const request = createRequest({ shotType: 'cinematic', mode: 'text-to-video', duration: 10 });

      // Unlimited budget → premium model
      const premiumModel = router.selectModel(request);

      // Tight budget → cheaper model
      const budgetModel = router.selectModel(request, 1.5);

      expect(budgetModel.costPerSecond).toBeLessThanOrEqual(premiumModel.costPerSecond);
    });
  });

  // -------------------------------------------------------------------------
  // All generation modes work
  // -------------------------------------------------------------------------

  describe('selectModel — generation modes', () => {
    it('supports text-to-video mode', () => {
      const request = createRequest({ mode: 'text-to-video' });
      const model = router.selectModel(request);

      expect(model.supportedModes).toContain('text-to-video');
    });

    it('supports image-to-video mode', () => {
      const request = createRequest({ mode: 'image-to-video' });
      const model = router.selectModel(request);

      expect(model.supportedModes).toContain('image-to-video');
    });

    it('supports audio-to-video mode (only Veo 3)', () => {
      const request = createRequest({ mode: 'audio-to-video', shotType: 'cinematic' });
      const model = router.selectModel(request);

      expect(model.supportedModes).toContain('audio-to-video');
      expect(model.model).toBe('veo-3');
    });

    it('filters out models that do not support the requested mode', () => {
      // audio-to-video is only supported by veo-3
      const request = createRequest({ mode: 'audio-to-video', shotType: 'fast-iteration' });
      const model = router.selectModel(request);

      // Even though fast-iteration prefers kling/wan, audio-to-video forces veo-3
      expect(model.model).toBe('veo-3');
    });
  });

  // -------------------------------------------------------------------------
  // Camera moves passed correctly
  // -------------------------------------------------------------------------

  describe('selectModel — camera moves', () => {
    it('selects model that supports the requested camera move', () => {
      const request = createRequest({ camera: 'crane', shotType: 'cinematic' });
      const model = router.selectModel(request);

      expect(model.supportedCameras).toContain('crane');
    });

    it('filters out models that do not support the camera move', () => {
      // wan-2.1 only supports static, pan, zoom — not tracking
      const request = createRequest({ camera: 'tracking', shotType: 'fast-iteration', duration: 10 });
      const model = router.selectModel(request);

      expect(model.supportedCameras).toContain('tracking');
      // wan-2.1 doesn't support tracking, so it shouldn't be selected
      expect(model.model).not.toBe('wan-2.1');
    });

    it('works without camera specification (any model eligible)', () => {
      const request = createRequest({ camera: undefined });
      const model = router.selectModel(request);

      expect(model).toBeDefined();
    });

    it('passes camera move to model provider during generation', async () => {
      const request = createRequest({ camera: 'dolly', shotType: 'cinematic' });
      await router.generateClip(request);

      expect(modelProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ camera: 'dolly' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Batch generation
  // -------------------------------------------------------------------------

  describe('generateBatch', () => {
    it('generates multiple clips and returns all results', async () => {
      const requests = [
        createRequest({ sceneId: 'scene-1', shotType: 'cinematic' }),
        createRequest({ sceneId: 'scene-2', shotType: 'b-roll', duration: 5 }),
        createRequest({ sceneId: 'scene-3', shotType: 'transition', duration: 3 }),
      ];

      const results = await router.generateBatch(requests);

      expect(results).toHaveLength(3);
      expect(results[0].sceneId).toBe('scene-1');
      expect(results[1].sceneId).toBe('scene-2');
      expect(results[2].sceneId).toBe('scene-3');
    });

    it('each result has correct model, duration, and cost', async () => {
      const requests = [
        createRequest({ sceneId: 'scene-1', shotType: 'cinematic', duration: 10 }),
        createRequest({ sceneId: 'scene-2', shotType: 'fast-iteration', duration: 5 }),
      ];

      const results = await router.generateBatch(requests);

      for (const result of results) {
        expect(result.videoUrl).toBeTruthy();
        expect(result.model).toBeTruthy();
        expect(result.duration).toBeGreaterThan(0);
        expect(result.cost).toBeGreaterThan(0);
        expect(result.generationTimeMs).toBeGreaterThan(0);
        expect(result.resolution.width).toBeGreaterThan(0);
        expect(result.resolution.height).toBeGreaterThan(0);
      }
    });

    it('emits batch.completed event with totals', async () => {
      const requests = [
        createRequest({ sceneId: 'scene-1', duration: 10 }),
        createRequest({ sceneId: 'scene-2', duration: 5 }),
      ];

      await router.generateBatch(requests);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const batchEvent = publishCalls.find(
        (call) => call[0].type === 'video.batch.completed',
      );

      expect(batchEvent).toBeDefined();
      expect(batchEvent![0].detail.totalClips).toBe(2);
      expect(batchEvent![0].detail.totalCost).toBeGreaterThan(0);
      expect(batchEvent![0].detail.totalDurationMs).toBeGreaterThan(0);
    });

    it('emits clip.generated event for each clip', async () => {
      const requests = [
        createRequest({ sceneId: 'scene-1' }),
        createRequest({ sceneId: 'scene-2' }),
      ];

      await router.generateBatch(requests);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const clipEvents = publishCalls.filter(
        (call) => call[0].type === 'video.clip.generated',
      );

      expect(clipEvents).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // generateClip
  // -------------------------------------------------------------------------

  describe('generateClip', () => {
    it('generates a clip using the selected model', async () => {
      const request = createRequest({ shotType: 'cinematic', duration: 10 });
      const result = await router.generateClip(request);

      expect(result.sceneId).toBe('scene-1');
      expect(result.videoUrl).toBe('https://cdn.example.com/generated-clip.mp4');
      expect(result.duration).toBe(10);
      expect(['sora-2', 'veo-3']).toContain(result.model);
      expect(result.cost).toBeGreaterThan(0);
    });

    it('calculates cost based on model costPerSecond × duration', async () => {
      const request = createRequest({ shotType: 'cinematic', duration: 10 });
      const result = await router.generateClip(request);

      const models = router.getAvailableModels();
      const selectedModel = models.find((m) => m.model === result.model)!;
      expect(result.cost).toBe(selectedModel.costPerSecond * 10);
    });

    it('emits clip.generated event', async () => {
      const request = createRequest({ shotType: 'cinematic', duration: 10 });
      await router.generateClip(request);

      const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
      const clipEvent = publishCalls.find(
        (call) => call[0].type === 'video.clip.generated',
      );

      expect(clipEvent).toBeDefined();
      expect(clipEvent![0].source).toBe('zxmg.studio.model-router');
      expect(clipEvent![0].detail.sceneId).toBe('scene-1');
      expect(clipEvent![0].detail.model).toBeTruthy();
      expect(clipEvent![0].detail.cost).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // getAvailableModels
  // -------------------------------------------------------------------------

  describe('getAvailableModels', () => {
    it('returns all registered model capabilities', () => {
      const models = router.getAvailableModels();

      expect(models.length).toBe(6);
      const modelNames = models.map((m) => m.model);
      expect(modelNames).toContain('sora-2');
      expect(modelNames).toContain('veo-3');
      expect(modelNames).toContain('kling-2.6');
      expect(modelNames).toContain('wan-2.1');
      expect(modelNames).toContain('minimax');
      expect(modelNames).toContain('animation-specialized');
    });

    it('each model has complete capability information', () => {
      const models = router.getAvailableModels();

      for (const model of models) {
        expect(model.maxDuration).toBeGreaterThan(0);
        expect(model.maxResolution.width).toBeGreaterThan(0);
        expect(model.maxResolution.height).toBeGreaterThan(0);
        expect(model.supportedModes.length).toBeGreaterThan(0);
        expect(model.supportedCameras.length).toBeGreaterThan(0);
        expect(model.qualityScore).toBeGreaterThanOrEqual(0);
        expect(model.qualityScore).toBeLessThanOrEqual(100);
        expect(model.speedScore).toBeGreaterThanOrEqual(0);
        expect(model.speedScore).toBeLessThanOrEqual(100);
        expect(model.costPerSecond).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Duration constraints
  // -------------------------------------------------------------------------

  describe('selectModel — duration constraints', () => {
    it('filters out models that cannot handle the requested duration', () => {
      // wan-2.1 maxDuration is 20s, request 25s should exclude it
      const request = createRequest({ shotType: 'fast-iteration', mode: 'text-to-video', duration: 25 });
      const model = router.selectModel(request);

      expect(model.maxDuration).toBeGreaterThanOrEqual(25);
    });

    it('throws when no model can handle the duration', () => {
      // All models max out at 120s (veo-3), request 200s
      const request = createRequest({ duration: 200, mode: 'text-to-video' });

      expect(() => router.selectModel(request)).toThrow(/No model available/);
    });
  });
});
