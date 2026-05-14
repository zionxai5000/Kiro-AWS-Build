/**
 * Artifact Storage Client — downloads EAS build artifacts and stores in S3.
 *
 * Uses the existing SeraphimArtifactsBucket (provisioned by CDK DataStack).
 * Generates signed URLs for time-limited download access.
 *
 * S3 key pattern: app-dev/{projectId}/builds/{buildId}/{platform}.bin
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withTimeout } from '../utils/timeout.js';
import { retryWithBackoff } from '../utils/retry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtifactStorageConfig {
  bucketName: string;
  region?: string;
  /** Optional S3 client for testing */
  s3Client?: S3Client;
}

export interface UploadResult {
  s3Key: string;
  etag?: string;
  sizeBytes: number;
}

export interface ArtifactStorageError extends Error {
  step: 'download' | 'upload' | 'url-generation';
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ArtifactStorageClient {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(config: ArtifactStorageConfig) {
    this.bucketName = config.bucketName;
    this.s3 = config.s3Client ?? new S3Client({ region: config.region ?? 'us-east-1' });
  }

  /**
   * Deterministic S3 key for a build artifact.
   */
  getArtifactKey(projectId: string, buildId: string, platform: string): string {
    return `app-dev/${projectId}/builds/${buildId}/${platform}.bin`;
  }

  /**
   * Download artifact from EAS URL and upload to S3.
   *
   * @param projectId - Project identifier
   * @param buildId - EAS build ID
   * @param platform - 'ios' or 'android'
   * @param sourceUrl - EAS artifact download URL
   * @param contentType - MIME type (default: application/octet-stream)
   * @returns Upload metadata (s3Key, etag, sizeBytes)
   */
  async uploadArtifact(
    projectId: string,
    buildId: string,
    platform: string,
    sourceUrl: string,
    contentType = 'application/octet-stream',
  ): Promise<UploadResult> {
    const s3Key = this.getArtifactKey(projectId, buildId, platform);

    // Step 1: Download from EAS (5min timeout — artifacts can be 100MB+)
    let body: Buffer;
    try {
      body = await retryWithBackoff(
        () => withTimeout(
          () => this.downloadArtifact(sourceUrl),
          5 * 60 * 1000, // 5 minutes
          `Artifact download timed out: ${sourceUrl}`,
        ),
        {
          maxRetries: 2,
          backoffMs: [3000, 10000],
          shouldRetry: (err) => {
            const msg = (err as Error).message?.toLowerCase() ?? '';
            return msg.includes('timeout') || msg.includes('network') || msg.includes('fetch');
          },
        },
      );
    } catch (error) {
      const err = new Error(`Artifact download failed: ${(error as Error).message}`) as ArtifactStorageError;
      err.step = 'download';
      throw err;
    }

    // Step 2: Upload to S3
    try {
      const result = await this.s3.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: body,
        ContentType: contentType,
        Metadata: {
          projectId,
          buildId,
          platform,
          uploadedAt: new Date().toISOString(),
        },
      }));

      return {
        s3Key,
        etag: result.ETag,
        sizeBytes: body.length,
      };
    } catch (error) {
      const err = new Error(`S3 upload failed: ${(error as Error).message}`) as ArtifactStorageError;
      err.step = 'upload';
      throw err;
    }
  }

  /**
   * Generate a time-limited signed URL for downloading an artifact from S3.
   *
   * @param s3Key - The S3 object key
   * @param expiresInSeconds - URL validity duration (default: 3600 = 1 hour)
   * @returns Signed URL string
   */
  async generateSignedUrl(s3Key: string, expiresInSeconds = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      return await getSignedUrl(this.s3 as any, command, { expiresIn: expiresInSeconds });
    } catch (error) {
      const err = new Error(`Signed URL generation failed: ${(error as Error).message}`) as ArtifactStorageError;
      err.step = 'url-generation';
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async downloadArtifact(url: string): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`EAS artifact download returned ${response.status}: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
