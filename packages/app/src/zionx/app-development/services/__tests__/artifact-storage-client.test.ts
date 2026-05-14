import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ArtifactStorageClient } from '../artifact-storage-client.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: class MockPutObjectCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
  GetObjectCommand: class MockGetObjectCommand {
    input: any;
    constructor(input: any) { this.input = input; }
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockS3Send = vi.fn();
const mockGetSignedUrl = vi.mocked(getSignedUrl);
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockS3Send.mockReset();
  mockGetSignedUrl.mockReset();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createClient() {
  const s3 = { send: mockS3Send } as unknown as InstanceType<typeof S3Client>;
  return new ArtifactStorageClient({
    bucketName: 'test-artifacts-bucket',
    region: 'us-east-1',
    s3Client: s3 as any,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArtifactStorageClient', () => {
  describe('getArtifactKey', () => {
    it('returns deterministic S3 key pattern', () => {
      const client = createClient();
      const key = client.getArtifactKey('proj-1', 'build-abc', 'ios');
      expect(key).toBe('app-dev/proj-1/builds/build-abc/ios.bin');
    });

    it('handles android platform', () => {
      const client = createClient();
      const key = client.getArtifactKey('proj-2', 'build-xyz', 'android');
      expect(key).toBe('app-dev/proj-2/builds/build-xyz/android.bin');
    });
  });

  describe('uploadArtifact', () => {
    it('downloads from EAS URL and uploads to S3', async () => {
      const client = createClient();
      const artifactData = Buffer.from('fake-ipa-binary-content');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => artifactData.buffer.slice(artifactData.byteOffset, artifactData.byteOffset + artifactData.byteLength),
      });

      mockS3Send.mockResolvedValueOnce({ ETag: '"abc123"' });

      const result = await client.uploadArtifact(
        'proj-1', 'build-1', 'ios',
        'https://expo.dev/artifacts/build-1.ipa',
      );

      expect(result.s3Key).toBe('app-dev/proj-1/builds/build-1/ios.bin');
      expect(result.etag).toBe('"abc123"');
      expect(result.sizeBytes).toBe(artifactData.length);
      expect(mockFetch).toHaveBeenCalledWith('https://expo.dev/artifacts/build-1.ipa');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('sets correct content-type on S3 upload', async () => {
      const client = createClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });
      mockS3Send.mockResolvedValueOnce({ ETag: '"x"' });

      await client.uploadArtifact('p', 'b', 'ios', 'https://url', 'application/x-ios-app');

      const putCall = mockS3Send.mock.calls[0]![0];
      expect(putCall.input.ContentType).toBe('application/x-ios-app');
    });

    it('throws with step="download" on EAS 404', async () => {
      const client = createClient();

      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      try {
        await client.uploadArtifact('p', 'b', 'ios', 'https://expired-url');
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.step).toBe('download');
        expect(err.message).toContain('download failed');
      }
    });

    it('throws with step="download" on network error', async () => {
      const client = createClient();

      // Use an error that won't be retried (non-network error)
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED: connection refused'));

      try {
        await client.uploadArtifact('p', 'b', 'ios', 'https://url');
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.step).toBe('download');
      }
    }, 15000);

    it('throws with step="upload" on S3 failure', async () => {
      const client = createClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(5),
      });
      mockS3Send.mockRejectedValueOnce(new Error('AccessDenied'));

      try {
        await client.uploadArtifact('p', 'b', 'ios', 'https://url');
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.step).toBe('upload');
        expect(err.message).toContain('S3 upload failed');
      }
    });
  });

  describe('generateSignedUrl', () => {
    it('generates signed URL with correct expiry', async () => {
      const client = createClient();
      mockGetSignedUrl.mockResolvedValueOnce('https://signed-url.s3.amazonaws.com/key?sig=abc');

      const url = await client.generateSignedUrl('app-dev/proj-1/builds/b1/ios.bin', 7200);

      expect(url).toBe('https://signed-url.s3.amazonaws.com/key?sig=abc');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ input: { Bucket: 'test-artifacts-bucket', Key: 'app-dev/proj-1/builds/b1/ios.bin' } }),
        { expiresIn: 7200 },
      );
    });

    it('throws with step="url-generation" on failure', async () => {
      const client = createClient();
      mockGetSignedUrl.mockRejectedValueOnce(new Error('KMS error'));

      try {
        await client.generateSignedUrl('some-key');
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.step).toBe('url-generation');
      }
    });
  });
});
