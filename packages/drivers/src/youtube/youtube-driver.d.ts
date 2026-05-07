/**
 * YouTube API Driver — YouTube Data API v3 video management and analytics.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for OAuth2 authentication,
 * and handles YouTube-specific error codes, video format validation, and
 * resumable upload session tracking.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 12.1, 12.2, 12.3, 12.4
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
/** Supported video container formats for YouTube uploads. */
export declare const YOUTUBE_SUPPORTED_FORMATS: readonly ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv", "3gp", "mpeg", "mpg"];
export type YouTubeVideoFormat = (typeof YOUTUBE_SUPPORTED_FORMATS)[number];
/** YouTube upload constraints. */
export declare const YOUTUBE_UPLOAD_LIMITS: {
    /** Maximum file size in bytes (256 GB). */
    readonly maxFileSizeBytes: number;
    /** Maximum video duration in seconds (12 hours). */
    readonly maxDurationSeconds: number;
    /** Minimum video duration in seconds (1 second). */
    readonly minDurationSeconds: 1;
    /** Maximum title length in characters. */
    readonly maxTitleLength: 100;
    /** Maximum description length in characters. */
    readonly maxDescriptionLength: 5000;
    /** Maximum number of tags. */
    readonly maxTags: 500;
    /** Maximum total tag characters. */
    readonly maxTagCharacters: 500;
    /** Maximum thumbnail file size in bytes (2 MB). */
    readonly maxThumbnailSizeBytes: number;
    /** Supported thumbnail formats. */
    readonly thumbnailFormats: readonly string[];
};
export interface VideoFormatValidation {
    valid: boolean;
    errors: string[];
}
/**
 * Validate video upload parameters against YouTube platform requirements.
 * Requirement 12.2: Validate content against platform-specific requirements.
 */
export declare function validateVideoFormat(params: {
    format?: string;
    fileSizeBytes?: number;
    durationSeconds?: number;
    title?: string;
    description?: string;
    tags?: string[];
}): VideoFormatValidation;
export type UploadSessionStatus = 'initiated' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export interface ResumableUploadSession {
    sessionId: string;
    videoId: string;
    uploadUrl: string;
    status: UploadSessionStatus;
    totalBytes: number;
    uploadedBytes: number;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}
export declare const YOUTUBE_ERROR_CODES: {
    readonly UNAUTHORIZED: "YT_UNAUTHORIZED";
    readonly FORBIDDEN: "YT_FORBIDDEN";
    readonly NOT_FOUND: "YT_NOT_FOUND";
    readonly CONFLICT: "YT_CONFLICT";
    readonly RATE_LIMITED: "YT_RATE_LIMITED";
    readonly QUOTA_EXCEEDED: "YT_QUOTA_EXCEEDED";
    readonly INVALID_PARAMS: "YT_INVALID_PARAMS";
    readonly INVALID_VIDEO_FORMAT: "YT_INVALID_VIDEO_FORMAT";
    readonly UPLOAD_FAILED: "YT_UPLOAD_FAILED";
    readonly UPLOAD_SESSION_EXPIRED: "YT_UPLOAD_SESSION_EXPIRED";
    readonly VIDEO_PROCESSING: "YT_VIDEO_PROCESSING";
    readonly VIDEO_REJECTED: "YT_VIDEO_REJECTED";
    readonly COMMENT_DISABLED: "YT_COMMENT_DISABLED";
    readonly UNSUPPORTED_OPERATION: "YT_UNSUPPORTED_OPERATION";
    readonly THUMBNAIL_TOO_LARGE: "YT_THUMBNAIL_TOO_LARGE";
    readonly THUMBNAIL_INVALID_FORMAT: "YT_THUMBNAIL_INVALID_FORMAT";
    readonly PLAYLIST_LIMIT_REACHED: "YT_PLAYLIST_LIMIT_REACHED";
    readonly SCHEDULE_IN_PAST: "YT_SCHEDULE_IN_PAST";
};
export type YouTubePrivacyStatus = 'public' | 'unlisted' | 'private';
export interface YouTubeDriverConfig {
    /** YouTube Data API v3 OAuth2 client ID. */
    clientId: string;
    /** YouTube channel ID. */
    channelId: string;
    /** OAuth2 redirect URI. */
    redirectUri?: string;
}
export declare class YouTubeDriver extends BaseDriver<YouTubeDriverConfig> {
    private readonly credentialManager;
    readonly name = "youtube";
    readonly version = "1.0.0";
    private _accessToken;
    private _driverConfig;
    private readonly _completedOperations;
    private readonly _uploadSessions;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: YouTubeDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    /**
     * Upload a video to YouTube with resumable upload support.
     * Validates video format, file size, and duration before initiating upload.
     * Requirements: 12.1, 12.2
     */
    private handleUploadVideo;
    /**
     * Update video metadata (title, description, tags, privacy, category).
     * Requirements: 12.1, 12.2
     */
    private handleUpdateMetadata;
    /**
     * Set a custom thumbnail for a video.
     * Validates thumbnail format and size against YouTube requirements.
     * Requirements: 12.1, 12.2
     */
    private handleSetThumbnail;
    /**
     * Get analytics for a video or channel.
     * Requirement 12.4: Track content performance metrics.
     */
    private handleGetAnalytics;
    /**
     * Get comments for a video.
     * Requirement 12.4
     */
    private handleGetComments;
    /**
     * Reply to a comment on a video.
     * Requirement 12.4
     */
    private handleReplyToComment;
    /**
     * Create a new playlist.
     * Requirement 12.1
     */
    private handleCreatePlaylist;
    /**
     * Schedule a video for future publication.
     * Requirements: 12.1, 12.2
     */
    private handleSchedulePublish;
    /**
     * Get the status of a resumable upload session.
     * Used for upload resumption of large video files.
     */
    getUploadSession(sessionId: string): ResumableUploadSession | undefined;
    /**
     * Resume an interrupted upload session.
     * Returns the session with updated progress or an error if the session expired.
     */
    resumeUploadSession(sessionId: string, additionalBytes: number): {
        success: boolean;
        session?: ResumableUploadSession;
        error?: string;
    };
    /**
     * Cancel an active upload session.
     */
    cancelUploadSession(sessionId: string): boolean;
    private createOperationId;
    private errorResult;
}
//# sourceMappingURL=youtube-driver.d.ts.map