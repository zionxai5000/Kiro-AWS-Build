/**
 * ZXMG Video Development Studio — Video Production Pipeline
 *
 * Orchestrates the full flow from concept to assembled video: script generation,
 * scene decomposition, multi-model rendering, and final assembly with thumbnails
 * and metadata. Supports videos up to 15 minutes with multiple styles.
 *
 * Requirements: 44b.12, 44b.13, 44b.14, 44b.15, 44b.16
 */

import type { PipelineItemConcept } from './autonomous-engine.js';
import type {
  VideoGenerationRequest,
  VideoGenerationResult,
  CameraMove,
  ShotType,
  GenerationMode,
  MultiModelVideoRouter,
} from './model-router.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelConfig {
  channelId: string;
  niche: string;
  defaultStyle: string;
  targetAudience: string;
  preferredDuration: number; // seconds
  platform: 'youtube' | 'tiktok' | 'instagram';
}

export interface SceneDefinition {
  id: string;
  order: number;
  duration: number;
  visualDescription: string;
  cameraDirection: CameraMove;
  audioLayers: { type: 'music' | 'sfx' | 'voiceover' | 'ambient'; description: string }[];
  characterRefs: string[];
  transition: 'cut' | 'fade' | 'dissolve' | 'wipe';
}

export interface ProductionPackage {
  videoId: string;
  channelId: string;
  script: string;
  scenes: SceneDefinition[];
  style: string;
  totalDuration: number;
}

export interface AssembledVideo {
  videoId: string;
  videoUrl: string;
  duration: number;
  scenes: { sceneId: string; clipUrl: string; duration: number }[];
  thumbnailVariants: string[];
  metadata: { title: string; description: string; tags: string[] };
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface ScriptGenerator {
  generateScript(concept: PipelineItemConcept, channelConfig: ChannelConfig): Promise<{
    script: string;
    scenes: SceneDefinition[];
  }>;
}

export interface VideoAssembler {
  assemble(clips: { sceneId: string; clipUrl: string; duration: number; transition: string }[]): Promise<{
    videoUrl: string;
    duration: number;
  }>;
}

export interface ThumbnailGenerator {
  generate(videoId: string, style: string, title: string): Promise<string[]>;
}

export interface MetadataGenerator {
  generate(concept: PipelineItemConcept, channelConfig: ChannelConfig): Promise<{
    title: string;
    description: string;
    tags: string[];
  }>;
}

export interface ProductionEventBus {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface VideoProductionPipeline {
  generateScript(concept: PipelineItemConcept, channelConfig: ChannelConfig): Promise<ProductionPackage>;
  renderScenes(pkg: ProductionPackage): Promise<VideoGenerationResult[]>;
  assembleVideo(pkg: ProductionPackage, renderedScenes: VideoGenerationResult[]): Promise<AssembledVideo>;
  produceVideo(concept: PipelineItemConcept, channelConfig: ChannelConfig): Promise<AssembledVideo>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of VideoProductionPipeline.
 *
 * Uses dependency injection for script generation, video rendering (via
 * MultiModelVideoRouter), assembly, thumbnail generation, and metadata.
 * Supports videos up to 15 minutes with scene decomposition.
 */
export class DefaultVideoProductionPipeline implements VideoProductionPipeline {
  private static readonly EVENT_SOURCE = 'zxmg.studio.production-pipeline';
  private static readonly MAX_DURATION_SECONDS = 900; // 15 minutes

  private idCounter = 0;

  constructor(
    private readonly scriptGen: ScriptGenerator,
    private readonly modelRouter: MultiModelVideoRouter,
    private readonly assembler: VideoAssembler,
    private readonly thumbnailGen: ThumbnailGenerator,
    private readonly metadataGen: MetadataGenerator,
    private readonly eventBus: ProductionEventBus,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generates a complete production package from a concept and channel config.
   * Includes script, scene decomposition, and production metadata.
   *
   * Requirement: 44b.12
   */
  async generateScript(
    concept: PipelineItemConcept,
    channelConfig: ChannelConfig,
  ): Promise<ProductionPackage> {
    const videoId = this.generateId();

    const { script, scenes } = await this.scriptGen.generateScript(concept, channelConfig);

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    const pkg: ProductionPackage = {
      videoId,
      channelId: channelConfig.channelId,
      script,
      scenes,
      style: concept.style || channelConfig.defaultStyle,
      totalDuration: Math.min(totalDuration, DefaultVideoProductionPipeline.MAX_DURATION_SECONDS),
    };

    await this.eventBus.publish({
      source: DefaultVideoProductionPipeline.EVENT_SOURCE,
      type: 'production.script.generated',
      detail: {
        videoId,
        channelId: channelConfig.channelId,
        sceneCount: scenes.length,
        totalDuration: pkg.totalDuration,
        style: pkg.style,
      },
    });

    return pkg;
  }

  /**
   * Renders all scenes in a production package using the multi-model router.
   *
   * Requirement: 44b.13
   */
  async renderScenes(pkg: ProductionPackage): Promise<VideoGenerationResult[]> {
    const requests: VideoGenerationRequest[] = pkg.scenes.map((scene) => ({
      sceneId: scene.id,
      prompt: scene.visualDescription,
      shotType: this.inferShotType(scene),
      mode: this.inferGenerationMode(scene) as GenerationMode,
      camera: scene.cameraDirection,
      duration: scene.duration,
      characterRefs: scene.characterRefs,
    }));

    const results = await this.modelRouter.generateBatch(requests);

    await this.eventBus.publish({
      source: DefaultVideoProductionPipeline.EVENT_SOURCE,
      type: 'production.scenes.rendered',
      detail: {
        videoId: pkg.videoId,
        sceneCount: results.length,
        totalCost: results.reduce((sum, r) => sum + r.cost, 0),
      },
    });

    return results;
  }

  /**
   * Assembles rendered scenes into a final video with thumbnails and metadata.
   *
   * Requirement: 44b.14
   */
  async assembleVideo(
    pkg: ProductionPackage,
    renderedScenes: VideoGenerationResult[],
  ): Promise<AssembledVideo> {
    // Build clip list with transitions
    const clips = pkg.scenes.map((scene, index) => {
      const rendered = renderedScenes.find((r) => r.sceneId === scene.id);
      return {
        sceneId: scene.id,
        clipUrl: rendered?.videoUrl ?? '',
        duration: rendered?.duration ?? scene.duration,
        transition: scene.transition,
      };
    });

    const { videoUrl, duration } = await this.assembler.assemble(clips);

    const thumbnailVariants = await this.thumbnailGen.generate(
      pkg.videoId,
      pkg.style,
      pkg.script.substring(0, 100),
    );

    const metadata = await this.metadataGen.generate(
      { title: pkg.script.substring(0, 50), description: pkg.script, predictedViews: 0, predictedEngagement: 0, predictedRevenue: 0, suggestedPublishDate: new Date(), style: pkg.style, duration: pkg.totalDuration, tags: [] } as PipelineItemConcept,
      { channelId: pkg.channelId, niche: '', defaultStyle: pkg.style, targetAudience: '', preferredDuration: pkg.totalDuration, platform: 'youtube' } as ChannelConfig,
    );

    const assembled: AssembledVideo = {
      videoId: pkg.videoId,
      videoUrl,
      duration,
      scenes: clips.map((c) => ({ sceneId: c.sceneId, clipUrl: c.clipUrl, duration: c.duration })),
      thumbnailVariants,
      metadata,
    };

    await this.eventBus.publish({
      source: DefaultVideoProductionPipeline.EVENT_SOURCE,
      type: 'production.video.assembled',
      detail: {
        videoId: pkg.videoId,
        duration,
        sceneCount: clips.length,
        thumbnailCount: thumbnailVariants.length,
      },
    });

    return assembled;
  }

  /**
   * Full production flow: script → render → assemble.
   *
   * Requirement: 44b.15
   */
  async produceVideo(
    concept: PipelineItemConcept,
    channelConfig: ChannelConfig,
  ): Promise<AssembledVideo> {
    const pkg = await this.generateScript(concept, channelConfig);
    const renderedScenes = await this.renderScenes(pkg);
    const assembled = await this.assembleVideo(pkg, renderedScenes);

    await this.eventBus.publish({
      source: DefaultVideoProductionPipeline.EVENT_SOURCE,
      type: 'production.complete',
      detail: {
        videoId: assembled.videoId,
        channelId: channelConfig.channelId,
        duration: assembled.duration,
        sceneCount: assembled.scenes.length,
      },
    });

    return assembled;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private generateId(): string {
    this.idCounter++;
    return `video-${Date.now()}-${this.idCounter}`;
  }

  /**
   * Infers the shot type from a scene definition based on its properties.
   */
  private inferShotType(scene: SceneDefinition): ShotType {
    const desc = scene.visualDescription.toLowerCase();

    if (scene.characterRefs.length > 0 && desc.includes('talk')) {
      return 'talking-head';
    }
    if (desc.includes('animation') || desc.includes('animated')) {
      return 'animation';
    }
    if (desc.includes('transition') || scene.duration <= 3) {
      return 'transition';
    }
    if (scene.cameraDirection === 'crane' || scene.cameraDirection === 'dolly' || scene.cameraDirection === 'tracking') {
      return 'cinematic';
    }
    if (desc.includes('b-roll') || desc.includes('background') || desc.includes('overlay')) {
      return 'b-roll';
    }
    return 'cinematic';
  }

  /**
   * Infers the generation mode from a scene definition.
   */
  private inferGenerationMode(scene: SceneDefinition): GenerationMode {
    const hasVoiceover = scene.audioLayers.some((l) => l.type === 'voiceover');
    if (hasVoiceover) {
      return 'audio-to-video';
    }
    return 'text-to-video';
  }
}
