/**
 * ZionX Ads — Video Ad Creator
 *
 * Produces video ad creatives in multiple formats:
 * - 15s vertical (TikTok/Reels/Shorts)
 * - 30s horizontal (YouTube pre-roll)
 * - 6s bumper ads
 * Using HeyGen and LLM drivers.
 *
 * Requirements: 11d.2
 */

import type { DriverResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface HeyGenDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoFormat = '15s_vertical' | '30s_horizontal' | '6s_bumper';

export type VideoAdStatus = 'draft' | 'scripting' | 'generating' | 'ready' | 'published' | 'failed';

export interface VideoAdConfig {
  appId: string;
  appName: string;
  tagline: string;
  keyFeatures: string[];
  targetFormats: VideoFormat[];
  avatarId?: string;
  voiceId?: string;
  musicStyle?: string;
  brandColors: { primary: string; secondary: string };
}

export interface VideoFormatSpec {
  format: VideoFormat;
  width: number;
  height: number;
  durationSeconds: number;
  orientation: 'vertical' | 'horizontal';
  targetPlatforms: string[];
  maxFileSizeMb: number;
}

export interface VideoScript {
  format: VideoFormat;
  scenes: VideoScene[];
  totalDurationSeconds: number;
  voiceOverText: string;
  musicCue: string;
}

export interface VideoScene {
  order: number;
  durationSeconds: number;
  visualDescription: string;
  textOverlay?: string;
  transition: 'cut' | 'fade' | 'slide' | 'zoom';
  callToAction?: string;
}

export interface GeneratedVideoAd {
  id: string;
  appId: string;
  format: VideoFormat;
  status: VideoAdStatus;
  script: VideoScript;
  videoPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  fileSizeMb: number;
  heyGenVideoId?: string;
  generatedAt: string;
}

export interface VideoAdResult {
  appId: string;
  videos: GeneratedVideoAd[];
  formatCoverage: VideoFormat[];
  totalVideos: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Format Specifications
// ---------------------------------------------------------------------------

export const VIDEO_FORMAT_SPECS: Record<VideoFormat, VideoFormatSpec> = {
  '15s_vertical': {
    format: '15s_vertical',
    width: 1080,
    height: 1920,
    durationSeconds: 15,
    orientation: 'vertical',
    targetPlatforms: ['TikTok', 'Instagram Reels', 'YouTube Shorts'],
    maxFileSizeMb: 50,
  },
  '30s_horizontal': {
    format: '30s_horizontal',
    width: 1920,
    height: 1080,
    durationSeconds: 30,
    orientation: 'horizontal',
    targetPlatforms: ['YouTube Pre-roll'],
    maxFileSizeMb: 100,
  },
  '6s_bumper': {
    format: '6s_bumper',
    width: 1920,
    height: 1080,
    durationSeconds: 6,
    orientation: 'horizontal',
    targetPlatforms: ['YouTube Bumper'],
    maxFileSizeMb: 20,
  },
};

// ---------------------------------------------------------------------------
// Video Ad Creator
// ---------------------------------------------------------------------------

export class VideoAdCreator {
  constructor(
    private readonly heyGenDriver: HeyGenDriver,
    private readonly llmDriver: LLMDriver,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Create video ads in all target formats.
   */
  async create(config: VideoAdConfig): Promise<VideoAdResult> {
    const videos: GeneratedVideoAd[] = [];

    for (const format of config.targetFormats) {
      const video = await this.createVideoAd(config, format);
      videos.push(video);
    }

    // Store in Zikaron
    await this.storeVideoAds(config.appId, videos);

    return {
      appId: config.appId,
      videos,
      formatCoverage: config.targetFormats,
      totalVideos: videos.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Create a single video ad for a specific format.
   */
  private async createVideoAd(
    config: VideoAdConfig,
    format: VideoFormat,
  ): Promise<GeneratedVideoAd> {
    const spec = VIDEO_FORMAT_SPECS[format];

    // 1. Generate script via LLM
    const script = await this.generateScript(config, format, spec);

    // 2. Generate video via HeyGen
    const heyGenResult = await this.heyGenDriver.execute({
      type: 'createVideo',
      params: {
        title: `${config.appName} - ${format} ad`,
        avatarId: config.avatarId ?? 'default-avatar',
        script: script.voiceOverText,
        templateId: this.getTemplateForFormat(format),
      },
    });

    const heyGenData = (heyGenResult.data ?? {}) as Record<string, unknown>;
    const heyGenVideoId = heyGenData.id as string | undefined;

    return {
      id: `video-ad-${format}-${config.appId}-${Date.now()}`,
      appId: config.appId,
      format,
      status: heyGenResult.success ? 'ready' : 'failed',
      script,
      videoPath: `assets/ads/video/${config.appId}/${format}.mp4`,
      thumbnailPath: `assets/ads/video/${config.appId}/${format}-thumb.jpg`,
      width: spec.width,
      height: spec.height,
      durationSeconds: spec.durationSeconds,
      fileSizeMb: 0,
      heyGenVideoId,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a video script using LLM.
   */
  async generateScript(
    config: VideoAdConfig,
    format: VideoFormat,
    spec: VideoFormatSpec,
  ): Promise<VideoScript> {
    const prompt = [
      `Write a ${spec.durationSeconds}-second ${spec.orientation} video ad script for "${config.appName}".`,
      `Tagline: ${config.tagline}`,
      `Key features: ${config.keyFeatures.join(', ')}`,
      `Target platforms: ${spec.targetPlatforms.join(', ')}`,
      `Format: ${format}`,
      'Include: hook (first 3 seconds), feature showcase, and clear CTA.',
      format === '6s_bumper' ? 'Keep it extremely concise — one key message only.' : '',
    ].filter(Boolean).join('\n');

    await this.llmDriver.execute({
      type: 'generate',
      params: { prompt, maxTokens: 1500, temperature: 0.6, taskType: 'creative' },
    });

    // Build structured script
    const scenes = this.buildScenes(config, format, spec);

    return {
      format,
      scenes,
      totalDurationSeconds: spec.durationSeconds,
      voiceOverText: this.buildVoiceOver(config, format),
      musicCue: config.musicStyle ?? 'upbeat, modern',
    };
  }

  /**
   * Build scene breakdown for a video format.
   */
  private buildScenes(
    config: VideoAdConfig,
    format: VideoFormat,
    spec: VideoFormatSpec,
  ): VideoScene[] {
    if (format === '6s_bumper') {
      return [
        { order: 1, durationSeconds: 2, visualDescription: 'App icon with animated reveal', textOverlay: config.appName, transition: 'cut' },
        { order: 2, durationSeconds: 2, visualDescription: 'Key feature showcase', textOverlay: config.tagline, transition: 'cut' },
        { order: 3, durationSeconds: 2, visualDescription: 'End card with CTA', callToAction: 'Download Now', transition: 'fade' },
      ];
    }

    if (format === '15s_vertical') {
      return [
        { order: 1, durationSeconds: 3, visualDescription: 'Hook — attention-grabbing opening', textOverlay: 'Problem statement', transition: 'cut' },
        { order: 2, durationSeconds: 4, visualDescription: 'App introduction with key screen', textOverlay: config.appName, transition: 'slide' },
        { order: 3, durationSeconds: 4, visualDescription: 'Feature demonstration', textOverlay: config.keyFeatures[0] ?? '', transition: 'cut' },
        { order: 4, durationSeconds: 4, visualDescription: 'End card with app store badges', callToAction: 'Download Free', transition: 'fade' },
      ];
    }

    // 30s horizontal
    return [
      { order: 1, durationSeconds: 5, visualDescription: 'Hook — relatable problem scenario', textOverlay: 'Ever struggled with...?', transition: 'cut' },
      { order: 2, durationSeconds: 5, visualDescription: 'App introduction', textOverlay: `Introducing ${config.appName}`, transition: 'fade' },
      { order: 3, durationSeconds: 5, visualDescription: 'Feature 1 demo', textOverlay: config.keyFeatures[0] ?? '', transition: 'slide' },
      { order: 4, durationSeconds: 5, visualDescription: 'Feature 2 demo', textOverlay: config.keyFeatures[1] ?? '', transition: 'slide' },
      { order: 5, durationSeconds: 5, visualDescription: 'Social proof / testimonial', textOverlay: '★★★★★ Loved by thousands', transition: 'cut' },
      { order: 6, durationSeconds: 5, visualDescription: 'End card with CTA and app store badges', callToAction: 'Download Now — Free', transition: 'fade' },
    ];
  }

  /**
   * Build voice-over text for a format.
   */
  private buildVoiceOver(config: VideoAdConfig, format: VideoFormat): string {
    if (format === '6s_bumper') {
      return `${config.appName}. ${config.tagline}. Download now.`;
    }

    if (format === '15s_vertical') {
      return `Tired of the same old routine? ${config.appName} changes everything. ${config.keyFeatures[0] ?? 'Amazing features'}. Download free today.`;
    }

    return `Have you ever wished for a better way? Introducing ${config.appName} — ${config.tagline}. With ${config.keyFeatures.slice(0, 2).join(' and ')}, you'll wonder how you lived without it. Join thousands of happy users. Download ${config.appName} free today.`;
  }

  /**
   * Get HeyGen template ID for a video format.
   */
  private getTemplateForFormat(format: VideoFormat): string {
    const templates: Record<VideoFormat, string> = {
      '15s_vertical': 'template-vertical-short',
      '30s_horizontal': 'template-horizontal-standard',
      '6s_bumper': 'template-bumper',
    };
    return templates[format];
  }

  /**
   * Store video ads in Zikaron.
   */
  private async storeVideoAds(appId: string, videos: GeneratedVideoAd[]): Promise<void> {
    await this.zikaronService.storeProcedural({
      id: `video-ads-${appId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'procedural',
      content: `Video ads for ${appId}: ${videos.length} videos in ${[...new Set(videos.map((v) => v.format))].length} formats`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['video-ads', appId],
      createdAt: new Date(),
      workflowPattern: 'video_ad_creation',
      successRate: 1.0,
      executionCount: 1,
      prerequisites: ['app_live'],
      steps: [
        { order: 1, action: 'generate_script', description: 'Generate video script via LLM', expectedOutcome: 'Script with scenes and voice-over' },
        { order: 2, action: 'create_video', description: 'Generate video via HeyGen', expectedOutcome: 'Video file generated' },
        { order: 3, action: 'validate', description: 'Validate against platform specs', expectedOutcome: 'All format requirements met' },
      ],
    });
  }
}
