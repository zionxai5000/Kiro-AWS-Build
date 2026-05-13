/**
 * ZXMG Video Development Studio — Multi-Model Video Router
 *
 * Selects the optimal AI video generation model per shot type, respecting
 * budget constraints via Otzar. Routes cinematic shots to high-quality models,
 * fast-iteration to speed-optimized models, animation to specialized models,
 * and applies cost-effective fallbacks when budget is constrained.
 *
 * Requirements: 44b.7, 44b.8, 44b.9, 44b.10, 44b.11
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoModel =
  | 'sora-2'
  | 'veo-3'
  | 'kling-2.6'
  | 'wan-2.1'
  | 'minimax'
  | 'animation-specialized';

export type ShotType =
  | 'cinematic'
  | 'fast-iteration'
  | 'animation'
  | 'talking-head'
  | 'b-roll'
  | 'transition';

export type GenerationMode = 'text-to-video' | 'image-to-video' | 'audio-to-video';

export type CameraMove = 'static' | 'pan' | 'zoom' | 'dolly' | 'crane' | 'tracking';

export interface ModelCapability {
  model: VideoModel;
  maxDuration: number; // seconds
  maxResolution: { width: number; height: number };
  supportedModes: GenerationMode[];
  supportedCameras: CameraMove[];
  qualityScore: number; // 0-100
  speedScore: number; // 0-100 (higher = faster)
  costPerSecond: number; // USD
}

export interface VideoGenerationRequest {
  sceneId: string;
  prompt: string;
  shotType: ShotType;
  mode: GenerationMode;
  camera?: CameraMove;
  duration: number;
  characterRefs?: string[]; // Zikaron character profile IDs
  lipSync?: { audioUrl: string };
}

export interface VideoGenerationResult {
  sceneId: string;
  videoUrl: string;
  model: VideoModel;
  duration: number;
  resolution: { width: number; height: number };
  cost: number;
  generationTimeMs: number;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface OtzarBudgetProvider {
  getRemainingBudget(channelId: string): Promise<number>;
  recordSpend(channelId: string, amount: number): Promise<void>;
}

export interface VideoModelProvider {
  generate(
    model: VideoModel,
    request: VideoGenerationRequest,
  ): Promise<{ videoUrl: string; resolution: { width: number; height: number }; generationTimeMs: number }>;
}

export interface ModelRouterEventBus {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface MultiModelVideoRouter {
  getAvailableModels(): ModelCapability[];
  selectModel(request: VideoGenerationRequest, budget?: number): ModelCapability;
  generateClip(request: VideoGenerationRequest): Promise<VideoGenerationResult>;
  generateBatch(requests: VideoGenerationRequest[]): Promise<VideoGenerationResult[]>;
}

// ---------------------------------------------------------------------------
// Model Registry (default capabilities)
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_CAPABILITIES: ModelCapability[] = [
  {
    model: 'sora-2',
    maxDuration: 60,
    maxResolution: { width: 1920, height: 1080 },
    supportedModes: ['text-to-video', 'image-to-video'],
    supportedCameras: ['static', 'pan', 'zoom', 'dolly', 'crane', 'tracking'],
    qualityScore: 95,
    speedScore: 40,
    costPerSecond: 0.50,
  },
  {
    model: 'veo-3',
    maxDuration: 120,
    maxResolution: { width: 3840, height: 2160 },
    supportedModes: ['text-to-video', 'image-to-video', 'audio-to-video'],
    supportedCameras: ['static', 'pan', 'zoom', 'dolly', 'crane', 'tracking'],
    qualityScore: 92,
    speedScore: 50,
    costPerSecond: 0.45,
  },
  {
    model: 'kling-2.6',
    maxDuration: 30,
    maxResolution: { width: 1920, height: 1080 },
    supportedModes: ['text-to-video', 'image-to-video'],
    supportedCameras: ['static', 'pan', 'zoom', 'dolly'],
    qualityScore: 75,
    speedScore: 90,
    costPerSecond: 0.15,
  },
  {
    model: 'wan-2.1',
    maxDuration: 20,
    maxResolution: { width: 1280, height: 720 },
    supportedModes: ['text-to-video', 'image-to-video'],
    supportedCameras: ['static', 'pan', 'zoom'],
    qualityScore: 70,
    speedScore: 95,
    costPerSecond: 0.10,
  },
  {
    model: 'minimax',
    maxDuration: 45,
    maxResolution: { width: 1920, height: 1080 },
    supportedModes: ['text-to-video', 'image-to-video'],
    supportedCameras: ['static', 'pan', 'zoom', 'dolly'],
    qualityScore: 72,
    speedScore: 80,
    costPerSecond: 0.12,
  },
  {
    model: 'animation-specialized',
    maxDuration: 90,
    maxResolution: { width: 1920, height: 1080 },
    supportedModes: ['text-to-video', 'image-to-video'],
    supportedCameras: ['static', 'pan', 'zoom', 'dolly', 'crane'],
    qualityScore: 88,
    speedScore: 60,
    costPerSecond: 0.30,
  },
];

// ---------------------------------------------------------------------------
// Routing Rules: shot type → preferred models (ordered by priority)
// ---------------------------------------------------------------------------

const SHOT_TYPE_PREFERENCES: Record<ShotType, VideoModel[]> = {
  cinematic: ['sora-2', 'veo-3'],
  'fast-iteration': ['kling-2.6', 'wan-2.1'],
  animation: ['animation-specialized'],
  'talking-head': ['veo-3', 'sora-2'],
  'b-roll': ['minimax', 'kling-2.6'],
  transition: ['wan-2.1', 'kling-2.6', 'minimax'],
};

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of MultiModelVideoRouter.
 *
 * Uses dependency injection for budget checking (Otzar) and video model
 * providers. Maintains an in-memory model registry and applies routing
 * rules based on shot type, generation mode, camera requirements, and budget.
 */
export class DefaultMultiModelVideoRouter implements MultiModelVideoRouter {
  private static readonly EVENT_SOURCE = 'zxmg.studio.model-router';

  private readonly models: ModelCapability[];

  constructor(
    private readonly modelProvider: VideoModelProvider,
    private readonly budgetProvider: OtzarBudgetProvider,
    private readonly eventBus: ModelRouterEventBus,
    models?: ModelCapability[],
  ) {
    this.models = models ?? [...DEFAULT_MODEL_CAPABILITIES];
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns all available model capabilities.
   */
  getAvailableModels(): ModelCapability[] {
    return [...this.models];
  }

  /**
   * Selects the optimal model for a given request, respecting budget constraints.
   *
   * Routing logic:
   * 1. Filter models that support the requested mode
   * 2. Filter models that support the requested camera move (if specified)
   * 3. Filter models that can handle the requested duration
   * 4. Apply shot-type preference ordering
   * 5. If budget is specified, filter by cost constraint
   * 6. Return the best match
   */
  selectModel(request: VideoGenerationRequest, budget?: number): ModelCapability {
    const candidates = this.models.filter((m) => {
      // Must support the requested generation mode
      if (!m.supportedModes.includes(request.mode)) return false;

      // Must support the requested camera move
      if (request.camera && !m.supportedCameras.includes(request.camera)) return false;

      // Must handle the requested duration
      if (request.duration > m.maxDuration) return false;

      // Must fit within budget if specified
      if (budget !== undefined) {
        const estimatedCost = m.costPerSecond * request.duration;
        if (estimatedCost > budget) return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      throw new Error(
        `No model available for request: mode=${request.mode}, camera=${request.camera ?? 'any'}, duration=${request.duration}s, budget=${budget ?? 'unlimited'}`,
      );
    }

    // Sort candidates by shot-type preference
    const preferredModels = SHOT_TYPE_PREFERENCES[request.shotType] ?? [];

    // Score each candidate: preference order + quality/speed balance
    const scored = candidates.map((model) => {
      const preferenceIndex = preferredModels.indexOf(model.model);
      // Lower preference index = higher priority (0 is best)
      const preferenceScore = preferenceIndex >= 0 ? (preferredModels.length - preferenceIndex) * 100 : 0;
      const qualityWeight = this.getQualityWeight(request.shotType);
      const speedWeight = 1 - qualityWeight;
      const performanceScore = model.qualityScore * qualityWeight + model.speedScore * speedWeight;

      return { model, score: preferenceScore + performanceScore };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0].model;
  }

  /**
   * Generates a single video clip using the optimal model for the request.
   */
  async generateClip(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const selectedModel = this.selectModel(request);
    const estimatedCost = selectedModel.costPerSecond * request.duration;

    const result = await this.modelProvider.generate(selectedModel.model, request);

    await this.eventBus.publish({
      source: DefaultMultiModelVideoRouter.EVENT_SOURCE,
      type: 'video.clip.generated',
      detail: {
        sceneId: request.sceneId,
        model: selectedModel.model,
        shotType: request.shotType,
        duration: request.duration,
        cost: estimatedCost,
        generationTimeMs: result.generationTimeMs,
      },
    });

    return {
      sceneId: request.sceneId,
      videoUrl: result.videoUrl,
      model: selectedModel.model,
      duration: request.duration,
      resolution: result.resolution,
      cost: estimatedCost,
      generationTimeMs: result.generationTimeMs,
    };
  }

  /**
   * Generates multiple clips in sequence, returning all results.
   */
  async generateBatch(requests: VideoGenerationRequest[]): Promise<VideoGenerationResult[]> {
    const results: VideoGenerationResult[] = [];

    for (const request of requests) {
      const result = await this.generateClip(request);
      results.push(result);
    }

    await this.eventBus.publish({
      source: DefaultMultiModelVideoRouter.EVENT_SOURCE,
      type: 'video.batch.completed',
      detail: {
        totalClips: results.length,
        totalCost: results.reduce((sum, r) => sum + r.cost, 0),
        totalDurationMs: results.reduce((sum, r) => sum + r.generationTimeMs, 0),
      },
    });

    return results;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Returns quality weight (0-1) based on shot type.
   * Higher weight = prioritize quality over speed.
   */
  private getQualityWeight(shotType: ShotType): number {
    switch (shotType) {
      case 'cinematic':
        return 0.9;
      case 'talking-head':
        return 0.8;
      case 'animation':
        return 0.7;
      case 'b-roll':
        return 0.5;
      case 'fast-iteration':
        return 0.2;
      case 'transition':
        return 0.3;
      default:
        return 0.5;
    }
  }
}
