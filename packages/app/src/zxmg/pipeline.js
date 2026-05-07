"use strict";
/**
 * ZXMG Media Production — Content Pipeline
 *
 * Implements the content pipeline: script generation (via LLM), media asset
 * creation (via HeyGen driver), video assembly, metadata preparation,
 * platform upload (via YouTube driver and social media drivers).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateScript = generateScript;
exports.createAssets = createAssets;
exports.assembleVideo = assembleVideo;
exports.prepareMetadata = prepareMetadata;
exports.uploadToPlatform = uploadToPlatform;
exports.runContentPipeline = runContentPipeline;
// ---------------------------------------------------------------------------
// Pipeline Step Implementations
// ---------------------------------------------------------------------------
/**
 * Generate a video script from a content brief using LLM.
 */
async function generateScript(brief, llmDriver) {
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
    const step = {
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
    const script = {
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
async function createAssets(script, heyGenDriver) {
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
    const step = {
        stage: 'asset_creation',
        success: result.success,
        startedAt: startTime.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startTime.getTime(),
        details: { operationId: result.operationId },
        errors: result.success ? [] : [result.error?.message ?? 'Asset creation failed'],
    };
    const assets = result.success
        ? [
            {
                id: `asset-video-${Date.now()}`,
                type: 'video',
                path: result.data?.videoUrl ?? `assets/videos/${Date.now()}.mp4`,
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
async function assembleVideo(assets, platform) {
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
    const video = {
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
function prepareMetadata(brief, script, video) {
    const startTime = new Date();
    const metadata = {
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
async function uploadToPlatform(video, metadata, platformDriver) {
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
    const resultData = (result.data ?? {});
    const upload = {
        platform: metadata.platform,
        contentId: resultData.videoId ?? `content-${Date.now()}`,
        contentUrl: resultData.url ?? '',
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
async function runContentPipeline(brief, llmDriver, heyGenDriver, platformDriver) {
    const pipelineStart = new Date();
    const contentId = `content-${Date.now()}`;
    const steps = [];
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
function buildPipelineResult(contentId, brief, steps, startTime, success, script, assets = [], video, metadata, uploads = []) {
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
function getResolutionForPlatform(platform) {
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
//# sourceMappingURL=pipeline.js.map