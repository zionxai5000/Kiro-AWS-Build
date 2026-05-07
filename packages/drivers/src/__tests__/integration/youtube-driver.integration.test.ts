/**
 * Integration tests for YouTube API Driver.
 *
 * Tests the full driver lifecycle with mocked API responses:
 * authentication, video upload, metadata update, and analytics retrieval.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 12.1, 12.2, 12.3, 12.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YouTubeDriver, YOUTUBE_ERROR_CODES } from '../../youtube/youtube-driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockCredentialManager(token = 'test-oauth2-token-integration'): CredentialManager {
  return {
    getCredential: vi.fn().mockResolvedValue(token),
    rotateCredential: vi.fn().mockResolvedValue({ success: true, driverName: 'youtube' }),
    getRotationSchedule: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// YouTube Driver — Full Lifecycle Integration
// ---------------------------------------------------------------------------

describe('YouTube Driver Integration', () => {
  let driver: YouTubeDriver;
  let credentialManager: CredentialManager;

  const ytConfig = {
    clientId: 'test-client-id',
    channelId: 'UC-test-channel-id',
  };

  beforeEach(() => {
    credentialManager = createMockCredentialManager();
    driver = new YouTubeDriver(credentialManager);
  });

  describe('authentication', () => {
    it('authenticates via CredentialManager on connect', async () => {
      const result = await driver.connect(ytConfig);

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(credentialManager.getCredential).toHaveBeenCalledWith('youtube', 'oauth2-token');
    });

    it('fails when credential manager returns empty token', async () => {
      const badCreds = createMockCredentialManager('');
      const badDriver = new YouTubeDriver(badCreds);

      const result = await badDriver.connect(ytConfig);
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
    });

    it('fails when required config fields are missing', async () => {
      const result = await driver.connect({ clientId: '', channelId: 'x' });
      expect(result.success).toBe(false);
    });
  });

  describe('full connect → execute → verify → disconnect lifecycle', () => {
    it('completes the full lifecycle for video upload', async () => {
      // 1. Connect
      await driver.connect(ytConfig);
      expect(driver.status).toBe('ready');

      // 2. Execute — upload video
      const uploadResult = await driver.execute({
        type: 'uploadVideo',
        params: {
          title: 'Integration Test Video',
          description: 'A test video for integration testing',
          tags: ['test', 'integration'],
          privacyStatus: 'private',
          filePath: '/videos/test.mp4',
          format: 'mp4',
          fileSizeBytes: 1024 * 1024 * 50, // 50 MB
          durationSeconds: 120,
        },
      });
      expect(uploadResult.success).toBe(true);
      const videoData = uploadResult.data as Record<string, unknown>;
      expect(videoData.videoId).toBeDefined();
      expect(videoData.title).toBe('Integration Test Video');
      expect(videoData.privacyStatus).toBe('private');
      expect(videoData.channelId).toBe('UC-test-channel-id');
      expect(videoData.uploadSession).toBeDefined();

      // 3. Verify
      const verifyResult = await driver.verify(uploadResult.operationId);
      expect(verifyResult.verified).toBe(true);

      // 4. Disconnect
      await driver.disconnect();
      expect(driver.status).toBe('disconnected');
    });

    it('completes the full lifecycle for metadata update', async () => {
      await driver.connect(ytConfig);

      const updateResult = await driver.execute({
        type: 'updateMetadata',
        params: {
          videoId: 'yt-video-123',
          title: 'Updated Title',
          description: 'Updated description',
          tags: ['updated', 'tags'],
          privacyStatus: 'public',
        },
      });
      expect(updateResult.success).toBe(true);
      const updateData = updateResult.data as Record<string, unknown>;
      expect(updateData.videoId).toBe('yt-video-123');
      const updatedFields = updateData.updatedFields as string[];
      expect(updatedFields).toContain('title');
      expect(updatedFields).toContain('description');
      expect(updatedFields).toContain('tags');
      expect(updatedFields).toContain('privacyStatus');

      const verifyResult = await driver.verify(updateResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
    });

    it('completes the full lifecycle for analytics retrieval', async () => {
      await driver.connect(ytConfig);

      const analyticsResult = await driver.execute({
        type: 'getAnalytics',
        params: {
          videoId: 'yt-video-123',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          metrics: ['views', 'likes', 'estimatedRevenue'],
        },
      });
      expect(analyticsResult.success).toBe(true);
      const analyticsData = analyticsResult.data as Record<string, unknown>;
      expect(analyticsData.videoId).toBe('yt-video-123');
      expect(analyticsData.channelId).toBe('UC-test-channel-id');
      const metrics = analyticsData.metrics as Record<string, unknown>;
      expect(metrics.views).toBeDefined();
      expect(metrics.likes).toBeDefined();
      expect(metrics.estimatedRevenue).toBeDefined();

      const verifyResult = await driver.verify(analyticsResult.operationId);
      expect(verifyResult.verified).toBe(true);

      await driver.disconnect();
    });
  });

  describe('video upload with format validation', () => {
    beforeEach(async () => {
      await driver.connect(ytConfig);
    });

    afterEach(async () => {
      await driver.disconnect();
    });

    it('rejects unsupported video formats', async () => {
      const result = await driver.execute({
        type: 'uploadVideo',
        params: {
          title: 'Bad Format Video',
          filePath: '/videos/test.xyz',
          format: 'xyz',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT);
    });

    it('rejects videos exceeding maximum file size', async () => {
      const result = await driver.execute({
        type: 'uploadVideo',
        params: {
          title: 'Huge Video',
          filePath: '/videos/huge.mp4',
          format: 'mp4',
          fileSizeBytes: 300 * 1024 * 1024 * 1024, // 300 GB > 256 GB limit
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT);
    });

    it('rejects videos exceeding maximum duration', async () => {
      const result = await driver.execute({
        type: 'uploadVideo',
        params: {
          title: 'Long Video',
          filePath: '/videos/long.mp4',
          format: 'mp4',
          durationSeconds: 13 * 60 * 60, // 13 hours > 12 hour limit
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_VIDEO_FORMAT);
    });

    it('accepts valid video formats', async () => {
      const result = await driver.execute({
        type: 'uploadVideo',
        params: {
          title: 'Valid Video',
          filePath: '/videos/test.mp4',
          format: 'mp4',
          fileSizeBytes: 1024 * 1024 * 100,
          durationSeconds: 300,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('error handling and retry behavior', () => {
    beforeEach(async () => {
      await driver.connect(ytConfig);
    });

    afterEach(async () => {
      await driver.disconnect();
    });

    it('returns error for unsupported operation types', async () => {
      const result = await driver.execute({
        type: 'unsupported_op',
        params: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.UNSUPPORTED_OPERATION);
    });

    it('returns error for missing required params on upload', async () => {
      const result = await driver.execute({
        type: 'uploadVideo',
        params: {}, // missing title and filePath
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('returns error for missing required params on metadata update', async () => {
      const result = await driver.execute({
        type: 'updateMetadata',
        params: {}, // missing videoId
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });

    it('returns error for analytics without date range', async () => {
      const result = await driver.execute({
        type: 'getAnalytics',
        params: { videoId: 'yt-123' }, // missing startDate and endDate
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(YOUTUBE_ERROR_CODES.INVALID_PARAMS);
    });
  });

  describe('circuit breaker state transitions', () => {
    it('starts with closed circuit breaker', async () => {
      await driver.connect(ytConfig);
      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });

    it('remains closed after successful operations', async () => {
      await driver.connect(ytConfig);

      await driver.execute({
        type: 'uploadVideo',
        params: {
          title: 'Test Video',
          filePath: '/videos/test.mp4',
          format: 'mp4',
        },
      });

      expect(driver.getCircuitBreakerState()).toBe('closed');
      await driver.disconnect();
    });
  });

  describe('health check', () => {
    it('reports healthy when connected', async () => {
      await driver.connect(ytConfig);
      const health = await driver.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.status).toBe('ready');

      await driver.disconnect();
    });

    it('reports unhealthy when disconnected', async () => {
      const health = await driver.healthCheck();
      expect(health.healthy).toBe(false);
    });

    it('tracks last successful operation', async () => {
      await driver.connect(ytConfig);

      await driver.execute({
        type: 'getAnalytics',
        params: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      });

      const health = await driver.healthCheck();
      expect(health.lastSuccessfulOperation).toBeDefined();

      await driver.disconnect();
    });
  });
});
