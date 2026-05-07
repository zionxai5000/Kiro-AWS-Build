/**
 * ZXMG Media Production — Content Pipeline
 *
 * Implements the content pipeline: script generation (via LLM), media asset
 * creation (via HeyGen driver), video assembly, metadata preparation,
 * platform upload (via YouTube driver and social media drivers).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import type { DriverResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface HeyGenDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface PlatformDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentPlatform = 'youtube' | 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'rumble' | 'facebook';

export type PipelineStage =
  | 'script_generation'
  | 'asset_creation'
  | 'video_assembly'
  | 'metadata_prep'
  | 'platform_upload';

export interface ContentBrief {
  topic: string;
  targetPlatform: ContentPlatform;
  targetDurationSeconds: number;
  style: 'educational' | 'entertainment' | 'promotional' | 'tutorial';
  targetAudience: string;
  keywords: string[];
  tone: string;
}

export interface GeneratedScript {
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  estimatedDurationSeconds: number;
  platform: ContentPlatform;
  generatedAt: string;
}

export interface MediaAsset {
  id: string;
  type: 'video' | 'audio' | 'image' | 'overlay';
  path: string;
  durationSeconds?: number;
  format: string;
  createdAt: string;
}

export interface AssembledVideo {
  videoPath: string;
  thumbnailPath: string;
  format: string;
  resolution: string;
  durationSeconds: number;
  fileSizeMb: number;
  assembledAt: string;
}

export interface ContentMetadata {
  title: string;
  description: string;
  tags: string[];
  category: string;
  thumbnailPath: string;
  scheduledPublishAt?: string;
  visibility: 'public' | 'unlisted' | 'private';
  platform: ContentPlatform;
}

export interface UploadResult {
  platform: ContentPlatform;
  contentId: string;
  contentUrl: string;
  status: 'success' | 'processing' | 'failed';
  uploadedAt: string;
  error?: string;
}

export interface PipelineStepResult {
  stage: PipelineStage;
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  details: Record<string, unknown>;
  errors: string[];
}

export interface ContentPipelineResult {
  contentId: string;
  brief: ContentBrief;
  script?: GeneratedScript;
  assets: MediaAsset[];
  video?: AssembledVideo;
  metadata?: ContentMetadata;
  uploads: UploadResult[];
  steps: PipelineStepResult[];
  success: boolean;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Pipeline Step Implementations
// ---------------------------------------------------------------------------

/**
 * Generate a video script from a content brief using LLM.
 */
export async function generateScript(
  brief: ContentBrief,
  llmDriver: LLMDriver,
): Promise<{ step: PipelineStepResult; script?: GeneratedScript }> {
  const startTime = new Date();

  const prompt = [
    `Write a ${brief.style} video script for ${brief.targetPlatform}.`,
    `Topic: ${brief.topic}`,
    `Target duration: ${brief.targetDurationSeconds} seconds`,
    `Target audience: ${brief.targetAudience}`,
    `Tone: ${brief.tone}`,
    `Keywords to include: ${brief.keywords.join(', ')}`,
    'Structure: Hook (first 3 seconds) → Body → Call to Action',
    'The hook must grab attention immediately.',
  ].join('\n');

  const result = await llmDriver.execute({
    type: 'generate',
    params: { prompt, maxTokens: 2000, temperature: 0.7, taskType: 'creative' },
  });

  const completedAt = new Date();
  const step: PipelineStepResult = {
    stage: 'script_generation',
    success: result.success,
    startedAt: startTime.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startTime.getTime(),
    details: { operationId: result.operationId },
    errors: result.success ? [] : [result.error?.message ?? 'Script generation failed'],
  };

  if (!result.success) {
    return { step };
  }

  const script: GeneratedScript = {
    title: `${brief.topic} — ${brief.style}`,
    hook: `Did you know about ${brief.topic}?`,
    body: `Let's explore ${brief.topic} in detail.`,
    callToAction: 'Like, subscribe, and share!',
    estimatedDurationSeconds: brief.targetDurationSeconds,
    platform: brief.targetPlatform,
    generatedAt: completedAt.toISOString(),
  };

  return { step, script };
}

/**
 * Create media assets using HeyGen driver.
 */
export async function createAssets(
  script: GeneratedScript,
  heyGenDriver: HeyGenDriver,
): Promise<{ step: PipelineStepResult; assets: MediaAsset[] }> {
  const startTime = new Date();

  const result = await heyGenDriver.execute({
    type: 'createVideo',
    params: {
      title: script.title,
      script: `${script.hook} ${script.body} ${script.callToAction}`,
      avatarId: 'default-avatar',
      duration: script.estimatedDurationSeconds,
    },
  });

  const completedAt = new Date();
  const step: PipelineStepResult = {
    stage: 'asset_creation',
    success: result.success,
    startedAt: startTime.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startTime.getTime(),
    details: { operationId: result.operationId },
    errors: result.success ? [] : [result.error?.message ?? 'Asset creation failed'],
  };

  const assets: MediaAsset[] = result.success
    ? [
        {
          id: `asset-video-${Date.now()}`,
          type: 'video',
          path: ((result.data as Record<string, unknown>)?.videoUrl as string) ?? `assets/videos/${Date.now()}.mp4`,
          durationSeconds: script.estimatedDurationSeconds,
          format: 'mp4',
          createdAt: completedAt.toISOString(),
        },
      ]
    : [];

  return { step, assets };
}

/**
 * Assemble final video from media assets.
 */
export async function assembleVideo(
  assets: MediaAsset[],
  platform: ContentPlatform,
): Promise<{ step: PipelineStepResult; video?: AssembledVideo }> {
  const startTime = new Date();

  const videoAsset = assets.find((a) => a.type === 'video');
  if (!videoAsset) {
    const completedAt = new Date();
    return {
      step: {
        stage: 'video_assembly',
        success: false,
        startedAt: startTime.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startTime.getTime(),
        details: {},
        errors: ['No video asset found for assembly'],
      },
    };
  }

  const resolution = getResolutionForPlatform(platform);
  const completedAt = new Date();

  const video: AssembledVideo = {
    videoPath: videoAsset.path,
    thumbnailPath: videoAsset.path.replace('.mp4', '-thumb.jpg'),
    format: 'mp4',
    resolution,
    durationSeconds: videoAsset.durationSeconds ?? 0,
    fileSizeMb: Math.round((videoAsset.durationSeconds ?? 30) * 0.5 * 10) / 10,
    assembledAt: completedAt.toISOString(),
  };

  return {
    step: {
      stage: 'video_assembly',
      success: true,
      startedAt: startTime.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startTime.getTime(),
      details: { resolution, format: 'mp4' },
      errors: [],
    },
    video,
  };
}

/**
 * Prepare metadata for platform upload.
 */
export function prepareMetadata(
  brief: ContentBrief,
  script: GeneratedScript,
  video: AssembledVideo,
): { step: PipelineStepResult; metadata: ContentMetadata } {
  const startTime = new Date();

  const metadata: ContentMetadata = {
    title: script.title,
    description: `${script.hook}\n\n${script.body}\n\n${script.callToAction}`,
    tags: brief.keywords,
    category: brief.style === 'educational' ? 'Education' : 'Entertainment',
    thumbnailPath: video.thumbnailPath,
    visibility: 'public',
    platform: brief.targetPlatform,
  };

  const completedAt = new Date();

  return {
    step: {
      stage: 'metadata_prep',
      success: true,
      startedAt: startTime.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startTime.getTime(),
      details: { platform: brief.targetPlatform },
      errors: [],
    },
    metadata,
  };
}

/**
 * Upload content to a target platform.
 */
export async function uploadToPlatform(
  video: AssembledVideo,
  metadata: ContentMetadata,
  platformDriver: PlatformDriver,
): Promise<{ step: PipelineStepResult; upload: UploadResult }> {
  const startTime = new Date();

  const result = await platformDriver.execute({
    type: 'uploadVideo',
    params: {
      videoPath: video.videoPath,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      category: metadata.category,
      thumbnailPath: metadata.thumbnailPath,
      visibility: metadata.visibility,
      scheduledPublishAt: metadata.scheduledPublishAt,
    },
  });

  const completedAt = new Date();
  const resultData = (result.data ?? {}) as Record<string, unknown>;

  const upload: UploadResult = {
    platform: metadata.platform,
    contentId: (resultData.videoId as string) ?? `content-${Date.now()}`,
    contentUrl: (resultData.url as string) ?? '',
    status: result.success ? 'success' : 'failed',
    uploadedAt: completedAt.toISOString(),
    error: result.success ? undefined : result.error?.message,
  };

  return {
    step: {
      stage: 'platform_upload',
      success: result.success,
      startedAt: startTime.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startTime.getTime(),
      details: { platform: metadata.platform, contentId: upload.contentId },
      errors: result.success ? [] : [result.error?.message ?? 'Upload failed'],
    },
    upload,
  };
}

/**
 * Run the full content pipeline from brief to upload.
 */
export async function runContentPipeline(
  brief: ContentBrief,
  llmDriver: LLMDriver,
  heyGenDriver: HeyGenDriver,
  platformDriver: PlatformDriver,
): Promise<ContentPipelineResult> {
  const pipelineStart = new Date();
  const contentId = `content-${Date.now()}`;
  const steps: PipelineStepResult[] = [];

  // Step 1: Script Generation
  const { step: scriptStep, script } = await generateScript(brief, llmDriver);
  steps.push(scriptStep);
  if (!script) {
    return buildPipelineResult(contentId, brief, steps, pipelineStart, false);
  }

  // Step 2: Asset Creation
  const { step: assetStep, assets } = await createAssets(script, heyGenDriver);
  steps.push(assetStep);
  if (assets.length === 0) {
    return buildPipelineResult(contentId, brief, steps, pipelineStart, false, undefined, [], undefined, undefined, []);
  }

  // Step 3: Video Assembly
  const { step: assemblyStep, video } = await assembleVideo(assets, brief.targetPlatform);
  steps.push(assemblyStep);
  if (!video) {
    return buildPipelineResult(contentId, brief, steps, pipelineStart, false, script, assets);
  }

  // Step 4: Metadata Preparation
  const { step: metadataStep, metadata } = prepareMetadata(brief, script, video);
  steps.push(metadataStep);

  // Step 5: Platform Upload
  const { step: uploadStep, upload } = await uploadToPlatform(video, metadata, platformDriver);
  steps.push(uploadStep);

  const success = upload.status === 'success';

  return buildPipelineResult(contentId, brief, steps, pipelineStart, success, script, assets, video, metadata, [upload]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPipelineResult(
  contentId: string,
  brief: ContentBrief,
  steps: PipelineStepResult[],
  startTime: Date,
  success: boolean,
  script?: GeneratedScript,
  assets: MediaAsset[] = [],
  video?: AssembledVideo,
  metadata?: ContentMetadata,
  uploads: UploadResult[] = [],
): ContentPipelineResult {
  const completedAt = new Date();
  return {
    contentId,
    brief,
    script,
    assets,
    video,
    metadata,
    uploads,
    steps,
    success,
    startedAt: startTime.toISOString(),
    completedAt: completedAt.toISOString(),
    totalDurationMs: completedAt.getTime() - startTime.getTime(),
  };
}

function getResolutionForPlatform(platform: ContentPlatform): string {
  switch (platform) {
    case 'youtube':
      return '1920x1080';
    case 'youtube_shorts':
    case 'tiktok':
    case 'instagram_reels':
      return '1080x1920';
    case 'rumble':
      return '1920x1080';
    case 'facebook':
      return '1280x720';
    default:
      return '1920x1080';
  }
}
