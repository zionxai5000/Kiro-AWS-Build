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
export interface LLMDriver {
    execute(operation: {
        type: string;
        params: Record<string, unknown>;
    }): Promise<DriverResult>;
}
export interface HeyGenDriver {
    execute(operation: {
        type: string;
        params: Record<string, unknown>;
    }): Promise<DriverResult>;
}
export interface PlatformDriver {
    execute(operation: {
        type: string;
        params: Record<string, unknown>;
    }): Promise<DriverResult>;
}
export type ContentPlatform = 'youtube' | 'tiktok' | 'instagram_reels' | 'youtube_shorts' | 'rumble' | 'facebook';
export type PipelineStage = 'script_generation' | 'asset_creation' | 'video_assembly' | 'metadata_prep' | 'platform_upload';
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
/**
 * Generate a video script from a content brief using LLM.
 */
export declare function generateScript(brief: ContentBrief, llmDriver: LLMDriver): Promise<{
    step: PipelineStepResult;
    script?: GeneratedScript;
}>;
/**
 * Create media assets using HeyGen driver.
 */
export declare function createAssets(script: GeneratedScript, heyGenDriver: HeyGenDriver): Promise<{
    step: PipelineStepResult;
    assets: MediaAsset[];
}>;
/**
 * Assemble final video from media assets.
 */
export declare function assembleVideo(assets: MediaAsset[], platform: ContentPlatform): Promise<{
    step: PipelineStepResult;
    video?: AssembledVideo;
}>;
/**
 * Prepare metadata for platform upload.
 */
export declare function prepareMetadata(brief: ContentBrief, script: GeneratedScript, video: AssembledVideo): {
    step: PipelineStepResult;
    metadata: ContentMetadata;
};
/**
 * Upload content to a target platform.
 */
export declare function uploadToPlatform(video: AssembledVideo, metadata: ContentMetadata, platformDriver: PlatformDriver): Promise<{
    step: PipelineStepResult;
    upload: UploadResult;
}>;
/**
 * Run the full content pipeline from brief to upload.
 */
export declare function runContentPipeline(brief: ContentBrief, llmDriver: LLMDriver, heyGenDriver: HeyGenDriver, platformDriver: PlatformDriver): Promise<ContentPipelineResult>;
//# sourceMappingURL=pipeline.d.ts.map