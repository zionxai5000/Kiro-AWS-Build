/**
 * Unit tests for YouTube API Driver.
 *
 * Tests cover: lifecycle (connect/disconnect), all 8 operations,
 * video format validation, resumable upload session management,
 * and error handling.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 12.1, 12.2, 12.3, 12.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  YouTubeDriver,
  validateVideoFormat,
  YOUTUBE_ERROR_CODES,
  YOUTUBE_SUPPORTED_FORMATS,
  YOUTUBE_UPLOAD_LIMITS,
} from './youtube-driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { DriverOperation } from '@seraphim/core/types/driver.js';

// ---------------------------------------------------------------------------
// Mock CredentialManager
// ---------------------------------------------------------------------------

function createMockCredentialManager(token: string | null = 'mock-oauth2-token'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(token),
    rotateCredential: vi.fn().mockResolvedValue({ success: true, driverName: 'youtube' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

const defaultConfig = {
  clientId: 'test-client-id',
  channelId: 'UC_test_channel',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function op(type: string, params: Record<string, unknown> = {}): DriverOperation {
  return { type, params };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('YouTubeDriver', () => {
  let driver: YouTubeDriver;
  let credentialManager: CredentialManager;

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new YouTubeDriver(credentialManager);
  });

  // =======================================================================
  // Lifecycle
  // =======================================================================

  describe('lifecycle', () => {
    it('connects successfully with valid config and credentials', async () => {
      const result = await driver.connect(defaultConfig);
      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
    });

    it('fails to connect when clientId is missing', async () => {
      const result = await driver.connect({ clientId: '', channelId: 'UC_test' });
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails to connect when channelId is missing', async () => {
      const result = await driver.connect({ clientId: 'id', channelId: '' });
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails to connect when credential manager returns null', async () => {
      const cm = createMockCredentialManager(null);
      const d = new YouTubeDriver(cm);
      const result = await d.connect(defaultConfig);
      expect(result.success).toBe(false);
    });

    it('retrieves OAuth2 token from credential manager', async () => {
      await driver.connect(defaultConfig);
      expect(credentialManager.getCredential).toHaveBeenCalledWith('youtube', 'oauth2-token');
    });

    it('disconnects and clears state', async () => {
      await driver.connect(defaultConfig);
      await driver.disconnect();
      expect(driver.status).toBe('disconnected');
    });
  });

  // =======================================================================
  // uploadVideo
  // =======================================================================

  describe('uploadVideo', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('uploads a video successfully with valid params', async () => {
      const result = await driver.execute(
        op('uploadVideo', {
          title: 'Test Video',
          filePath: '/videos/test.mp4',
          format: 'mp4',
          fileSizeBytes: 1024 * 1024,
          durationSeconds: 120,
        }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).title).toBe('Test Video');
      expect((result.data as any).channelId).toBe('UC_test_channel');
      expect((result.data as any).uploadSession).toBeDefined();
      expect((result.data as any).uploadSession.status).toBe('completed');
    });

    it('rejects upload when title is missing', async () => {
      const result = await driver.execute(op('uploadVideo', { filePath: '/test.mp4' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects upload when filePath is missing', async () => {
      const result = await driver.execute(op('uploadVideo', { title: 'Test' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects upload with unsupported video format', async () => {
      const result = await driver.execute(
        op('uploadVideo', {
          title: 'Test',
          filePath: '/test.xyz',
          format: 'xyz',
        }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT);
    });

    it('rejects upload exceeding max file size', async () => {
      const result = await driver.execute(
        op('uploadVideo', {
          title: 'Test',
          filePath: '/test.mp4',
          fileSizeBytes: YOUTUBE_UPLOAD_LIMITS.maxFileSizeBytes + 1,
        }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT);
    });

    it('rejects upload exceeding max duration', async () => {
      const result = await driver.execute(
        op('uploadVideo', {
          title: 'Test',
          filePath: '/test.mp4',
          durationSeconds: YOUTUBE_UPLOAD_LIMITS.maxDurationSeconds + 1,
        }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT);
    });

    it('defaults privacy to private when not specified', async () => {
      const result = await driver.execute(
        op('uploadVideo', { title: 'Test', filePath: '/test.mp4' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).privacyStatus).toBe('private');
    });
  });

  // =======================================================================
  // updateMetadata
  // =======================================================================

  describe('updateMetadata', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('updates metadata successfully', async () => {
      const result = await driver.execute(
        op('updateMetadata', { videoId: 'vid-1', title: 'New Title', description: 'New desc' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).updatedFields).toContain('title');
      expect((result.data as any).updatedFields).toContain('description');
    });

    it('rejects when videoId is missing', async () => {
      const result = await driver.execute(op('updateMetadata', { title: 'New' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects when no metadata fields are provided', async () => {
      const result = await driver.execute(op('updateMetadata', { videoId: 'vid-1' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects title exceeding max length', async () => {
      const result = await driver.execute(
        op('updateMetadata', { videoId: 'vid-1', title: 'x'.repeat(YOUTUBE_UPLOAD_LIMITS.maxTitleLength + 1) }),
      );
      expect(result.success).toBe(false);
    });
  });

  // =======================================================================
  // setThumbnail
  // =======================================================================

  describe('setThumbnail', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('sets thumbnail successfully', async () => {
      const result = await driver.execute(
        op('setThumbnail', { videoId: 'vid-1', thumbnailPath: '/thumb.jpg', format: 'jpg' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).videoId).toBe('vid-1');
      expect((result.data as any).thumbnailUrl).toContain('vid-1');
    });

    it('rejects when videoId is missing', async () => {
      const result = await driver.execute(op('setThumbnail', { thumbnailPath: '/thumb.jpg' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects when thumbnailPath is missing', async () => {
      const result = await driver.execute(op('setThumbnail', { videoId: 'vid-1' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects unsupported thumbnail format', async () => {
      const result = await driver.execute(
        op('setThumbnail', { videoId: 'vid-1', thumbnailPath: '/thumb.tiff', format: 'tiff' }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.THUMBNAIL_INVALID_FORMAT);
    });

    it('rejects thumbnail exceeding max size', async () => {
      const result = await driver.execute(
        op('setThumbnail', {
          videoId: 'vid-1',
          thumbnailPath: '/thumb.jpg',
          fileSizeBytes: YOUTUBE_UPLOAD_LIMITS.maxThumbnailSizeBytes + 1,
        }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.THUMBNAIL_TOO_LARGE);
    });
  });

  // =======================================================================
  // getAnalytics
  // =======================================================================

  describe('getAnalytics', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('returns analytics for a video', async () => {
      const result = await driver.execute(
        op('getAnalytics', { videoId: 'vid-1', startDate: '2024-01-01', endDate: '2024-01-31' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).videoId).toBe('vid-1');
      expect((result.data as any).metrics).toBeDefined();
    });

    it('returns channel-level analytics when videoId is omitted', async () => {
      const result = await driver.execute(
        op('getAnalytics', { startDate: '2024-01-01', endDate: '2024-01-31' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).videoId).toBeNull();
      expect((result.data as any).channelId).toBe('UC_test_channel');
    });

    it('rejects when startDate is missing', async () => {
      const result = await driver.execute(op('getAnalytics', { endDate: '2024-01-31' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects when endDate is missing', async () => {
      const result = await driver.execute(op('getAnalytics', { startDate: '2024-01-01' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('uses custom metrics when provided', async () => {
      const result = await driver.execute(
        op('getAnalytics', {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          metrics: ['views', 'likes'],
        }),
      );
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(Object.keys(data.metrics)).toEqual(['views', 'likes']);
    });
  });

  // =======================================================================
  // getComments
  // =======================================================================

  describe('getComments', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('returns comments for a video', async () => {
      const result = await driver.execute(op('getComments', { videoId: 'vid-1' }));
      expect(result.success).toBe(true);
      expect((result.data as any).videoId).toBe('vid-1');
      expect((result.data as any).comments).toEqual([]);
    });

    it('rejects when videoId is missing', async () => {
      const result = await driver.execute(op('getComments', {}));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });
  });

  // =======================================================================
  // replyToComment
  // =======================================================================

  describe('replyToComment', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('replies to a comment successfully', async () => {
      const result = await driver.execute(
        op('replyToComment', { commentId: 'comment-1', text: 'Thanks!' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).parentCommentId).toBe('comment-1');
      expect((result.data as any).text).toBe('Thanks!');
    });

    it('rejects when commentId is missing', async () => {
      const result = await driver.execute(op('replyToComment', { text: 'Thanks!' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects when text is missing', async () => {
      const result = await driver.execute(op('replyToComment', { commentId: 'c-1' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });
  });

  // =======================================================================
  // createPlaylist
  // =======================================================================

  describe('createPlaylist', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('creates a playlist successfully', async () => {
      const result = await driver.execute(
        op('createPlaylist', { title: 'My Playlist', description: 'A test playlist', privacyStatus: 'public' }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).title).toBe('My Playlist');
      expect((result.data as any).privacyStatus).toBe('public');
      expect((result.data as any).channelId).toBe('UC_test_channel');
    });

    it('rejects when title is missing', async () => {
      const result = await driver.execute(op('createPlaylist', {}));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('defaults privacy to private', async () => {
      const result = await driver.execute(op('createPlaylist', { title: 'PL' }));
      expect(result.success).toBe(true);
      expect((result.data as any).privacyStatus).toBe('private');
    });
  });

  // =======================================================================
  // schedulePublish
  // =======================================================================

  describe('schedulePublish', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('schedules a video for future publication', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
      const result = await driver.execute(
        op('schedulePublish', { videoId: 'vid-1', publishAt: futureDate }),
      );
      expect(result.success).toBe(true);
      expect((result.data as any).videoId).toBe('vid-1');
      expect((result.data as any).scheduledPublishAt).toBe(futureDate);
    });

    it('rejects when videoId is missing', async () => {
      const result = await driver.execute(
        op('schedulePublish', { publishAt: new Date(Date.now() + 86400000).toISOString() }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects when publishAt is missing', async () => {
      const result = await driver.execute(op('schedulePublish', { videoId: 'vid-1' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('rejects when publishAt is in the past', async () => {
      const result = await driver.execute(
        op('schedulePublish', { videoId: 'vid-1', publishAt: '2020-01-01T00:00:00Z' }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.SCHEDULE_IN_PAST);
    });

    it('rejects when publishAt is not a valid date', async () => {
      const result = await driver.execute(
        op('schedulePublish', { videoId: 'vid-1', publishAt: 'not-a-date' }),
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });
  });

  // =======================================================================
  // Unsupported operation
  // =======================================================================

  describe('unsupported operation', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('returns error for unsupported operation type', async () => {
      const result = await driver.execute(op('unknownOp', {}));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.UNSUPPORTED_OPERATION);
    });
  });

  // =======================================================================
  // Not connected
  // =======================================================================

  describe('not connected', () => {
    it('returns unauthorized error when executing without connecting', async () => {
      const result = await driver.execute(op('uploadVideo', { title: 'Test', filePath: '/test.mp4' }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.UNAUTHORIZED);
    });
  });

  // =======================================================================
  // Verification
  // =======================================================================

  describe('verify', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('verifies a completed operation', async () => {
      const execResult = await driver.execute(
        op('createPlaylist', { title: 'PL' }),
      );
      const verifyResult = await driver.verify(execResult.operationId);
      expect(verifyResult.verified).toBe(true);
    });

    it('returns not verified for unknown operation', async () => {
      const verifyResult = await driver.verify('unknown-op-id');
      expect(verifyResult.verified).toBe(false);
    });
  });

  // =======================================================================
  // Upload Session Management
  // =======================================================================

  describe('upload session management', () => {
    beforeEach(async () => {
      await driver.connect(defaultConfig);
    });

    it('tracks upload sessions from uploadVideo', async () => {
      const result = await driver.execute(
        op('uploadVideo', { title: 'Test', filePath: '/test.mp4', fileSizeBytes: 10000 }),
      );
      const sessionId = (result.data as any).uploadSession.sessionId;
      const session = driver.getUploadSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.status).toBe('completed');
    });

    it('resumes an in-progress upload session', async () => {
      // Manually create a session in in_progress state for testing
      const result = await driver.execute(
        op('uploadVideo', { title: 'Test', filePath: '/test.mp4', fileSizeBytes: 10000 }),
      );
      const sessionId = (result.data as any).uploadSession.sessionId;

      // Modify session to simulate partial upload
      const session = driver.getUploadSession(sessionId)!;
      session.status = 'in_progress';
      session.uploadedBytes = 5000;

      const resumeResult = driver.resumeUploadSession(sessionId, 5000);
      expect(resumeResult.success).toBe(true);
      expect(resumeResult.session!.status).toBe('completed');
      expect(resumeResult.session!.uploadedBytes).toBe(10000);
    });

    it('returns error when resuming non-existent session', () => {
      const result = driver.resumeUploadSession('non-existent', 1000);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when resuming completed session', async () => {
      const execResult = await driver.execute(
        op('uploadVideo', { title: 'Test', filePath: '/test.mp4', fileSizeBytes: 1000 }),
      );
      const sessionId = (execResult.data as any).uploadSession.sessionId;
      const result = driver.resumeUploadSession(sessionId, 500);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already completed');
    });

    it('cancels an active upload session', async () => {
      const execResult = await driver.execute(
        op('uploadVideo', { title: 'Test', filePath: '/test.mp4', fileSizeBytes: 10000 }),
      );
      const sessionId = (execResult.data as any).uploadSession.sessionId;

      // Set to in_progress to allow cancellation
      const session = driver.getUploadSession(sessionId)!;
      session.status = 'in_progress';

      const cancelled = driver.cancelUploadSession(sessionId);
      expect(cancelled).toBe(true);
      expect(driver.getUploadSession(sessionId)!.status).toBe('cancelled');
    });

    it('cannot cancel a completed session', async () => {
      const execResult = await driver.execute(
        op('uploadVideo', { title: 'Test', filePath: '/test.mp4', fileSizeBytes: 1000 }),
      );
      const sessionId = (execResult.data as any).uploadSession.sessionId;
      const cancelled = driver.cancelUploadSession(sessionId);
      expect(cancelled).toBe(false);
    });

    it('cannot cancel a non-existent session', () => {
      expect(driver.cancelUploadSession('non-existent')).toBe(false);
    });
  });
});

// ==========================================================================
// validateVideoFormat (standalone function)
// ==========================================================================

describe('validateVideoFormat', () => {
  it('accepts valid video parameters', () => {
    const result = validateVideoFormat({
      format: 'mp4',
      fileSizeBytes: 1024 * 1024,
      durationSeconds: 600,
      title: 'Valid Title',
      description: 'A description',
      tags: ['tag1', 'tag2'],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unsupported format', () => {
    const result = validateVideoFormat({ format: 'xyz' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Unsupported video format');
  });

  it('accepts all supported formats', () => {
    for (const fmt of YOUTUBE_SUPPORTED_FORMATS) {
      const result = validateVideoFormat({ format: fmt });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects zero file size', () => {
    const result = validateVideoFormat({ fileSizeBytes: 0 });
    expect(result.valid).toBe(false);
  });

  it('rejects file size exceeding limit', () => {
    const result = validateVideoFormat({ fileSizeBytes: YOUTUBE_UPLOAD_LIMITS.maxFileSizeBytes + 1 });
    expect(result.valid).toBe(false);
  });

  it('rejects duration below minimum', () => {
    const result = validateVideoFormat({ durationSeconds: 0 });
    expect(result.valid).toBe(false);
  });

  it('rejects duration exceeding maximum', () => {
    const result = validateVideoFormat({ durationSeconds: YOUTUBE_UPLOAD_LIMITS.maxDurationSeconds + 1 });
    expect(result.valid).toBe(false);
  });

  it('rejects empty title', () => {
    const result = validateVideoFormat({ title: '' });
    expect(result.valid).toBe(false);
  });

  it('rejects title exceeding max length', () => {
    const result = validateVideoFormat({ title: 'x'.repeat(YOUTUBE_UPLOAD_LIMITS.maxTitleLength + 1) });
    expect(result.valid).toBe(false);
  });

  it('rejects description exceeding max length', () => {
    const result = validateVideoFormat({ description: 'x'.repeat(YOUTUBE_UPLOAD_LIMITS.maxDescriptionLength + 1) });
    expect(result.valid).toBe(false);
  });

  it('rejects too many tags', () => {
    const tags = Array.from({ length: YOUTUBE_UPLOAD_LIMITS.maxTags + 1 }, (_, i) => `t${i}`);
    const result = validateVideoFormat({ tags });
    expect(result.valid).toBe(false);
  });

  it('rejects tags exceeding total character limit', () => {
    const tags = ['x'.repeat(YOUTUBE_UPLOAD_LIMITS.maxTagCharacters + 1)];
    const result = validateVideoFormat({ tags });
    expect(result.valid).toBe(false);
  });

  it('collects multiple errors', () => {
    const result = validateVideoFormat({
      format: 'xyz',
      fileSizeBytes: -1,
      durationSeconds: 0,
      title: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('returns valid when no params are provided', () => {
    const result = validateVideoFormat({});
    expect(result.valid).toBe(true);
  });
});
