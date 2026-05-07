"use strict";
/**
 * ZXMG Media Production — Content Validation
 *
 * Validates content against platform-specific requirements (video format,
 * duration limits, metadata character limits, thumbnail specs) before upload.
 *
 * Requirements: 12.1, 12.2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_CONSTRAINTS = void 0;
exports.validateVideo = validateVideo;
exports.validateMetadata = validateMetadata;
exports.validateContent = validateContent;
exports.PLATFORM_CONSTRAINTS = {
    youtube: {
        platform: 'youtube',
        maxDurationSeconds: 43200, // 12 hours
        minDurationSeconds: 1,
        maxTitleLength: 100,
        maxDescriptionLength: 5000,
        maxTags: 500,
        supportedFormats: ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'],
        supportedResolutions: ['1920x1080', '3840x2160', '2560x1440', '1280x720'],
        maxFileSizeMb: 256000, // 256 GB
        thumbnailRequired: true,
    },
    youtube_shorts: {
        platform: 'youtube_shorts',
        maxDurationSeconds: 60,
        minDurationSeconds: 1,
        maxTitleLength: 100,
        maxDescriptionLength: 5000,
        maxTags: 500,
        supportedFormats: ['mp4', 'mov', 'webm'],
        supportedResolutions: ['1080x1920', '720x1280'],
        maxFileSizeMb: 256000,
        thumbnailRequired: false,
    },
    tiktok: {
        platform: 'tiktok',
        maxDurationSeconds: 600, // 10 minutes
        minDurationSeconds: 3,
        maxTitleLength: 150,
        maxDescriptionLength: 2200,
        maxTags: 30,
        supportedFormats: ['mp4', 'mov'],
        supportedResolutions: ['1080x1920', '720x1280'],
        maxFileSizeMb: 4096, // 4 GB
        thumbnailRequired: false,
    },
    instagram_reels: {
        platform: 'instagram_reels',
        maxDurationSeconds: 90,
        minDurationSeconds: 3,
        maxTitleLength: 0, // No separate title
        maxDescriptionLength: 2200,
        maxTags: 30,
        supportedFormats: ['mp4', 'mov'],
        supportedResolutions: ['1080x1920', '720x1280'],
        maxFileSizeMb: 4096,
        thumbnailRequired: false,
    },
    rumble: {
        platform: 'rumble',
        maxDurationSeconds: 28800, // 8 hours
        minDurationSeconds: 1,
        maxTitleLength: 150,
        maxDescriptionLength: 5000,
        maxTags: 100,
        supportedFormats: ['mp4', 'mov', 'avi', 'wmv'],
        supportedResolutions: ['1920x1080', '3840x2160', '1280x720'],
        maxFileSizeMb: 15360, // 15 GB
        thumbnailRequired: true,
    },
    facebook: {
        platform: 'facebook',
        maxDurationSeconds: 14400, // 4 hours
        minDurationSeconds: 1,
        maxTitleLength: 255,
        maxDescriptionLength: 63206,
        maxTags: 0,
        supportedFormats: ['mp4', 'mov'],
        supportedResolutions: ['1920x1080', '1280x720', '1080x1920'],
        maxFileSizeMb: 10240, // 10 GB
        thumbnailRequired: false,
    },
};
// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------
/**
 * Validate video against platform constraints.
 */
function validateVideo(video, platform) {
    const constraints = exports.PLATFORM_CONSTRAINTS[platform];
    const issues = [];
    if (video.durationSeconds > constraints.maxDurationSeconds) {
        issues.push({
            field: 'duration',
            message: `Video duration (${video.durationSeconds}s) exceeds maximum (${constraints.maxDurationSeconds}s) for ${platform}`,
            severity: 'error',
        });
    }
    if (video.durationSeconds < constraints.minDurationSeconds) {
        issues.push({
            field: 'duration',
            message: `Video duration (${video.durationSeconds}s) is below minimum (${constraints.minDurationSeconds}s) for ${platform}`,
            severity: 'error',
        });
    }
    if (!constraints.supportedFormats.includes(video.format)) {
        issues.push({
            field: 'format',
            message: `Video format "${video.format}" is not supported on ${platform}. Supported: ${constraints.supportedFormats.join(', ')}`,
            severity: 'error',
        });
    }
    if (!constraints.supportedResolutions.includes(video.resolution)) {
        issues.push({
            field: 'resolution',
            message: `Video resolution "${video.resolution}" is not standard for ${platform}. Recommended: ${constraints.supportedResolutions.join(', ')}`,
            severity: 'warning',
        });
    }
    if (video.fileSizeMb > constraints.maxFileSizeMb) {
        issues.push({
            field: 'fileSize',
            message: `File size (${video.fileSizeMb}MB) exceeds maximum (${constraints.maxFileSizeMb}MB) for ${platform}`,
            severity: 'error',
        });
    }
    return issues;
}
/**
 * Validate metadata against platform constraints.
 */
function validateMetadata(metadata, platform) {
    const constraints = exports.PLATFORM_CONSTRAINTS[platform];
    const issues = [];
    if (constraints.maxTitleLength > 0 && metadata.title.length > constraints.maxTitleLength) {
        issues.push({
            field: 'title',
            message: `Title length (${metadata.title.length}) exceeds maximum (${constraints.maxTitleLength}) for ${platform}`,
            severity: 'error',
        });
    }
    if (metadata.description.length > constraints.maxDescriptionLength) {
        issues.push({
            field: 'description',
            message: `Description length (${metadata.description.length}) exceeds maximum (${constraints.maxDescriptionLength}) for ${platform}`,
            severity: 'error',
        });
    }
    if (constraints.maxTags > 0 && metadata.tags.length > constraints.maxTags) {
        issues.push({
            field: 'tags',
            message: `Tag count (${metadata.tags.length}) exceeds maximum (${constraints.maxTags}) for ${platform}`,
            severity: 'error',
        });
    }
    if (constraints.thumbnailRequired && !metadata.thumbnailPath) {
        issues.push({
            field: 'thumbnail',
            message: `Thumbnail is required for ${platform}`,
            severity: 'error',
        });
    }
    return issues;
}
/**
 * Run full validation for content before upload.
 */
function validateContent(video, metadata, platform) {
    const videoIssues = validateVideo(video, platform);
    const metadataIssues = validateMetadata(metadata, platform);
    const allIssues = [...videoIssues, ...metadataIssues];
    return {
        valid: !allIssues.some((i) => i.severity === 'error'),
        platform,
        issues: allIssues,
        validatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=validation.js.map