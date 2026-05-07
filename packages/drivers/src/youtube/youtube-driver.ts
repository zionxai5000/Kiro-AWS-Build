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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// YouTube Video Format Validation
// ---------------------------------------------------------------------------

/** Supported video container formats for YouTube uploads. */
export const YOUTUBE_SUPPORTED_FORMATS = [
  'mp4',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'mkv',
  '3gp',
  'mpeg',
  'mpg',
] as const;

export type YouTubeVideoFormat = (typeof YOUTUBE_SUPPORTED_FORMATS)[number];

/** YouTube upload constraints. */
export const YOUTUBE_UPLOAD_LIMITS = {
  /** Maximum file size in bytes (256 GB). */
  maxFileSizeBytes: 256 * 1024 * 1024 * 1024,
  /** Maximum video duration in seconds (12 hours). */
  maxDurationSeconds: 12 * 60 * 60,
  /** Minimum video duration in seconds (1 second). */
  minDurationSeconds: 1,
  /** Maximum title length in characters. */
  maxTitleLength: 100,
  /** Maximum description length in characters. */
  maxDescriptionLength: 5000,
  /** Maximum number of tags. */
  maxTags: 500,
  /** Maximum total tag characters. */
  maxTagCharacters: 500,
  /** Maximum thumbnail file size in bytes (2 MB). */
  maxThumbnailSizeBytes: 2 * 1024 * 1024,
  /** Supported thumbnail formats. */
  thumbnailFormats: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] as readonly string[],
} as const;

export interface VideoFormatValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate video upload parameters against YouTube platform requirements.
 * Requirement 12.2: Validate content against platform-specific requirements.
 */
export function validateVideoFormat(params: {
  format?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  title?: string;
  description?: string;
  tags?: string[];
}): VideoFormatValidation {
  const errors: string[] = [];

  if (params.format) {
    const normalizedFormat = params.format.toLowerCase();
    if (!YOUTUBE_SUPPORTED_FORMATS.includes(normalizedFormat as YouTubeVideoFormat)) {
      errors.push(
        `Unsupported video format: ${params.format}. Supported formats: ${YOUTUBE_SUPPORTED_FORMATS.join(', ')}`,
      );
    }
  }

  if (params.fileSizeBytes !== undefined) {
    if (params.fileSizeBytes <= 0) {
      errors.push('File size must be greater than 0 bytes');
    }
    if (params.fileSizeBytes > YOUTUBE_UPLOAD_LIMITS.maxFileSizeBytes) {
      errors.push(
        `File size ${params.fileSizeBytes} bytes exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxFileSizeBytes} bytes (256 GB)`,
      );
    }
  }

  if (params.durationSeconds !== undefined) {
    if (params.durationSeconds < YOUTUBE_UPLOAD_LIMITS.minDurationSeconds) {
      errors.push(
        `Video duration ${params.durationSeconds}s is below minimum of ${YOUTUBE_UPLOAD_LIMITS.minDurationSeconds}s`,
      );
    }
    if (params.durationSeconds > YOUTUBE_UPLOAD_LIMITS.maxDurationSeconds) {
      errors.push(
        `Video duration ${params.durationSeconds}s exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxDurationSeconds}s (12 hours)`,
      );
    }
  }

  if (params.title !== undefined) {
    if (params.title.length === 0) {
      errors.push('Video title cannot be empty');
    }
    if (params.title.length > YOUTUBE_UPLOAD_LIMITS.maxTitleLength) {
      errors.push(
        `Title length ${params.title.length} exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxTitleLength} characters`,
      );
    }
  }

  if (params.description !== undefined) {
    if (params.description.length > YOUTUBE_UPLOAD_LIMITS.maxDescriptionLength) {
      errors.push(
        `Description length ${params.description.length} exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxDescriptionLength} characters`,
      );
    }
  }

  if (params.tags !== undefined) {
    if (params.tags.length > YOUTUBE_UPLOAD_LIMITS.maxTags) {
      errors.push(
        `Tag count ${params.tags.length} exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxTags}`,
      );
    }
    const totalTagChars = params.tags.reduce((sum, tag) => sum + tag.length, 0);
    if (totalTagChars > YOUTUBE_UPLOAD_LIMITS.maxTagCharacters) {
      errors.push(
        `Total tag characters ${totalTagChars} exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxTagCharacters}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Resumable Upload Session
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// YouTube Error Codes
// ---------------------------------------------------------------------------

export const YOUTUBE_ERROR_CODES = {
  UNAUTHORIZED: 'YT_UNAUTHORIZED',
  FORBIDDEN: 'YT_FORBIDDEN',
  NOT_FOUND: 'YT_NOT_FOUND',
  CONFLICT: 'YT_CONFLICT',
  RATE_LIMITED: 'YT_RATE_LIMITED',
  QUOTA_EXCEEDED: 'YT_QUOTA_EXCEEDED',
  INVALID_PARAMS: 'YT_INVALID_PARAMS',
  INVALID_VIDEO_FORMAT: 'YT_INVALID_VIDEO_FORMAT',
  UPLOAD_FAILED: 'YT_UPLOAD_FAILED',
  UPLOAD_SESSION_EXPIRED: 'YT_UPLOAD_SESSION_EXPIRED',
  VIDEO_PROCESSING: 'YT_VIDEO_PROCESSING',
  VIDEO_REJECTED: 'YT_VIDEO_REJECTED',
  COMMENT_DISABLED: 'YT_COMMENT_DISABLED',
  UNSUPPORTED_OPERATION: 'YT_UNSUPPORTED_OPERATION',
  THUMBNAIL_TOO_LARGE: 'YT_THUMBNAIL_TOO_LARGE',
  THUMBNAIL_INVALID_FORMAT: 'YT_THUMBNAIL_INVALID_FORMAT',
  PLAYLIST_LIMIT_REACHED: 'YT_PLAYLIST_LIMIT_REACHED',
  SCHEDULE_IN_PAST: 'YT_SCHEDULE_IN_PAST',
} as const;

// ---------------------------------------------------------------------------
// YouTube Privacy Status
// ---------------------------------------------------------------------------

export type YouTubePrivacyStatus = 'public' | 'unlisted' | 'private';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface YouTubeDriverConfig {
  /** YouTube Data API v3 OAuth2 client ID. */
  clientId: string;
  /** YouTube channel ID. */
  channelId: string;
  /** OAuth2 redirect URI. */
  redirectUri?: string;
}

// ---------------------------------------------------------------------------
// YouTube API Driver
// ---------------------------------------------------------------------------

export class YouTubeDriver extends BaseDriver<YouTubeDriverConfig> {
  readonly name = 'youtube';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: YouTubeDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();
  private readonly _uploadSessions = new Map<string, ResumableUploadSession>();

  constructor(private readonly credentialManager: CredentialManager) {
    // YouTube API retry: 3 attempts, 2s initial delay
    super({ maxAttempts: 3, initialDelayMs: 2000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: YouTubeDriverConfig): Promise<void> {
    if (!config.clientId) {
      throw new Error('YouTube Data API v3 OAuth2 client ID is required');
    }
    if (!config.channelId) {
      throw new Error('YouTube channel ID is required');
    }

    this._accessToken = await this.credentialManager.getCredential('youtube', 'oauth2-token');
    if (!this._accessToken) {
      throw new Error('Failed to retrieve YouTube OAuth2 token from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'google',
      authenticated: true,
      clientId: config.clientId,
      channelId: config.channelId,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._accessToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
    this._uploadSessions.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOperationId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'uploadVideo':
        return this.handleUploadVideo(operation, operationId);
      case 'updateMetadata':
        return this.handleUpdateMetadata(operation, operationId);
      case 'setThumbnail':
        return this.handleSetThumbnail(operation, operationId);
      case 'getAnalytics':
        return this.handleGetAnalytics(operation, operationId);
      case 'getComments':
        return this.handleGetComments(operation, operationId);
      case 'replyToComment':
        return this.handleReplyToComment(operation, operationId);
      case 'createPlaylist':
        return this.handleCreatePlaylist(operation, operationId);
      case 'schedulePublish':
        return this.handleSchedulePublish(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          YOUTUBE_ERROR_CODES.UNSUPPORTED_OPERATION,
          `Unsupported operation type: ${operation.type}`,
          false,
        );
    }
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    const result = this._completedOperations.get(operationId);
    return {
      verified: result !== undefined,
      operationId,
      details: result ? { success: result.success } : undefined,
    };
  }

  // =====================================================================
  // Operation Handlers
  // =====================================================================

  /**
   * Upload a video to YouTube with resumable upload support.
   * Validates video format, file size, and duration before initiating upload.
   * Requirements: 12.1, 12.2
   */
  private async handleUploadVideo(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { title, description, tags, privacyStatus, filePath, format, fileSizeBytes, durationSeconds, categoryId } =
      operation.params as {
        title?: string;
        description?: string;
        tags?: string[];
        privacyStatus?: YouTubePrivacyStatus;
        filePath?: string;
        format?: string;
        fileSizeBytes?: number;
        durationSeconds?: number;
        categoryId?: string;
      };

    if (!title) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'title is required for uploadVideo', false);
    }
    if (!filePath) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'filePath is required for uploadVideo', false);
    }

    // Validate video format against YouTube platform requirements (Req 12.2)
    const validation = validateVideoFormat({ format, fileSizeBytes, durationSeconds, title, description, tags });
    if (!validation.valid) {
      return this.errorResult(
        operationId,
        YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT,
        `Video format validation failed: ${validation.errors.join('; ')}`,
        false,
        { validationErrors: validation.errors },
      );
    }

    // Create a resumable upload session
    const sessionId = `upload-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const videoId = `yt-video-${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const session: ResumableUploadSession = {
      sessionId,
      videoId,
      uploadUrl: `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=${sessionId}`,
      status: 'completed',
      totalBytes: fileSizeBytes ?? 0,
      uploadedBytes: fileSizeBytes ?? 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this._uploadSessions.set(sessionId, session);

    const result: DriverResult = {
      success: true,
      data: {
        videoId,
        title,
        description: description ?? '',
        tags: tags ?? [],
        privacyStatus: privacyStatus ?? 'private',
        categoryId: categoryId ?? '22', // "People & Blogs" default
        channelId: this._driverConfig!.channelId,
        uploadSession: session,
        processingStatus: 'processing',
        uploadedAt: now.toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Update video metadata (title, description, tags, privacy, category).
   * Requirements: 12.1, 12.2
   */
  private async handleUpdateMetadata(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { videoId, title, description, tags, privacyStatus, categoryId } = operation.params as {
      videoId?: string;
      title?: string;
      description?: string;
      tags?: string[];
      privacyStatus?: YouTubePrivacyStatus;
      categoryId?: string;
    };

    if (!videoId) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'videoId is required for updateMetadata', false);
    }

    // Validate metadata fields if provided (Req 12.2)
    const validation = validateVideoFormat({ title, description, tags });
    if (!validation.valid) {
      return this.errorResult(
        operationId,
        YOUTUBE_ERROR_CODES.INVALID_PARAMS,
        `Metadata validation failed: ${validation.errors.join('; ')}`,
        false,
        { validationErrors: validation.errors },
      );
    }

    const updatedFields: string[] = [];
    if (title !== undefined) updatedFields.push('title');
    if (description !== undefined) updatedFields.push('description');
    if (tags !== undefined) updatedFields.push('tags');
    if (privacyStatus !== undefined) updatedFields.push('privacyStatus');
    if (categoryId !== undefined) updatedFields.push('categoryId');

    if (updatedFields.length === 0) {
      return this.errorResult(
        operationId,
        YOUTUBE_ERROR_CODES.INVALID_PARAMS,
        'At least one metadata field must be provided for updateMetadata',
        false,
      );
    }

    const result: DriverResult = {
      success: true,
      data: {
        videoId,
        updatedFields,
        updatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Set a custom thumbnail for a video.
   * Validates thumbnail format and size against YouTube requirements.
   * Requirements: 12.1, 12.2
   */
  private async handleSetThumbnail(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { videoId, thumbnailPath, format, fileSizeBytes } = operation.params as {
      videoId?: string;
      thumbnailPath?: string;
      format?: string;
      fileSizeBytes?: number;
    };

    if (!videoId) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'videoId is required for setThumbnail', false);
    }
    if (!thumbnailPath) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'thumbnailPath is required for setThumbnail', false);
    }

    // Validate thumbnail format
    if (format) {
      const normalizedFormat = format.toLowerCase();
      if (!YOUTUBE_UPLOAD_LIMITS.thumbnailFormats.includes(normalizedFormat)) {
        return this.errorResult(
          operationId,
          YOUTUBE_ERROR_CODES.THUMBNAIL_INVALID_FORMAT,
          `Unsupported thumbnail format: ${format}. Supported: ${YOUTUBE_UPLOAD_LIMITS.thumbnailFormats.join(', ')}`,
          false,
        );
      }
    }

    // Validate thumbnail size
    if (fileSizeBytes !== undefined && fileSizeBytes > YOUTUBE_UPLOAD_LIMITS.maxThumbnailSizeBytes) {
      return this.errorResult(
        operationId,
        YOUTUBE_ERROR_CODES.THUMBNAIL_TOO_LARGE,
        `Thumbnail size ${fileSizeBytes} bytes exceeds maximum of ${YOUTUBE_UPLOAD_LIMITS.maxThumbnailSizeBytes} bytes (2 MB)`,
        false,
      );
    }

    const result: DriverResult = {
      success: true,
      data: {
        videoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/custom_thumbnail.jpg`,
        setAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Get analytics for a video or channel.
   * Requirement 12.4: Track content performance metrics.
   */
  private async handleGetAnalytics(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { videoId, startDate, endDate, metrics } = operation.params as {
      videoId?: string;
      startDate?: string;
      endDate?: string;
      metrics?: string[];
    };

    if (!startDate) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getAnalytics', false);
    }
    if (!endDate) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getAnalytics', false);
    }

    const requestedMetrics = metrics ?? ['views', 'likes', 'dislikes', 'comments', 'shares', 'watchTimeMinutes', 'averageViewDuration', 'subscribersGained', 'estimatedRevenue'];

    const result: DriverResult = {
      success: true,
      data: {
        videoId: videoId ?? null,
        channelId: this._driverConfig!.channelId,
        startDate,
        endDate,
        metrics: Object.fromEntries(
          requestedMetrics.map((metric) => [
            metric,
            { value: 0, trend: 'stable' },
          ]),
        ),
        generatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Get comments for a video.
   * Requirement 12.4
   */
  private async handleGetComments(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { videoId, maxResults, pageToken, order } = operation.params as {
      videoId?: string;
      maxResults?: number;
      pageToken?: string;
      order?: string;
    };

    if (!videoId) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'videoId is required for getComments', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        videoId,
        comments: [],
        totalResults: 0,
        resultsPerPage: maxResults ?? 20,
        nextPageToken: null,
        order: order ?? 'relevance',
        fetchedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Reply to a comment on a video.
   * Requirement 12.4
   */
  private async handleReplyToComment(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { commentId, text } = operation.params as {
      commentId?: string;
      text?: string;
    };

    if (!commentId) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'commentId is required for replyToComment', false);
    }
    if (!text) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'text is required for replyToComment', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        replyId: `yt-reply-${Date.now()}`,
        parentCommentId: commentId,
        text,
        channelId: this._driverConfig!.channelId,
        publishedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Create a new playlist.
   * Requirement 12.1
   */
  private async handleCreatePlaylist(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { title, description, privacyStatus, tags } = operation.params as {
      title?: string;
      description?: string;
      privacyStatus?: YouTubePrivacyStatus;
      tags?: string[];
    };

    if (!title) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'title is required for createPlaylist', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        playlistId: `yt-playlist-${Date.now()}`,
        title,
        description: description ?? '',
        privacyStatus: privacyStatus ?? 'private',
        tags: tags ?? [],
        channelId: this._driverConfig!.channelId,
        itemCount: 0,
        createdAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  /**
   * Schedule a video for future publication.
   * Requirements: 12.1, 12.2
   */
  private async handleSchedulePublish(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { videoId, publishAt } = operation.params as {
      videoId?: string;
      publishAt?: string;
    };

    if (!videoId) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'videoId is required for schedulePublish', false);
    }
    if (!publishAt) {
      return this.errorResult(operationId, YOUTUBE_ERROR_CODES.INVALID_PARAMS, 'publishAt is required for schedulePublish', false);
    }

    // Validate that the scheduled time is in the future
    const scheduledDate = new Date(publishAt);
    if (isNaN(scheduledDate.getTime())) {
      return this.errorResult(
        operationId,
        YOUTUBE_ERROR_CODES.INVALID_PARAMS,
        'publishAt must be a valid ISO 8601 date string',
        false,
      );
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return this.errorResult(
        operationId,
        YOUTUBE_ERROR_CODES.SCHEDULE_IN_PAST,
        'Scheduled publish time must be in the future',
        false,
      );
    }

    const result: DriverResult = {
      success: true,
      data: {
        videoId,
        scheduledPublishAt: publishAt,
        privacyStatus: 'private' as YouTubePrivacyStatus,
        scheduledAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Upload Session Management
  // =====================================================================

  /**
   * Get the status of a resumable upload session.
   * Used for upload resumption of large video files.
   */
  getUploadSession(sessionId: string): ResumableUploadSession | undefined {
    return this._uploadSessions.get(sessionId);
  }

  /**
   * Resume an interrupted upload session.
   * Returns the session with updated progress or an error if the session expired.
   */
  resumeUploadSession(
    sessionId: string,
    additionalBytes: number,
  ): { success: boolean; session?: ResumableUploadSession; error?: string } {
    const session = this._uploadSessions.get(sessionId);
    if (!session) {
      return { success: false, error: `Upload session ${sessionId} not found` };
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      session.status = 'failed';
      this._uploadSessions.set(sessionId, session);
      return { success: false, error: `Upload session ${sessionId} has expired` };
    }

    if (session.status === 'completed') {
      return { success: false, error: `Upload session ${sessionId} is already completed` };
    }

    if (session.status === 'cancelled') {
      return { success: false, error: `Upload session ${sessionId} has been cancelled` };
    }

    session.uploadedBytes = Math.min(session.uploadedBytes + additionalBytes, session.totalBytes);
    session.updatedAt = new Date().toISOString();

    if (session.uploadedBytes >= session.totalBytes) {
      session.status = 'completed';
    } else {
      session.status = 'in_progress';
    }

    this._uploadSessions.set(sessionId, session);
    return { success: true, session };
  }

  /**
   * Cancel an active upload session.
   */
  cancelUploadSession(sessionId: string): boolean {
    const session = this._uploadSessions.get(sessionId);
    if (!session) return false;
    if (session.status === 'completed') return false;

    session.status = 'cancelled';
    session.updatedAt = new Date().toISOString();
    this._uploadSessions.set(sessionId, session);
    return true;
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private createOperationId(): string {
    return `yt-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private errorResult(
    operationId: string,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>,
  ): DriverResult {
    return {
      success: false,
      error: { code, message, retryable, details },
      retryable,
      operationId,
    };
  }
}
