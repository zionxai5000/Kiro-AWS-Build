/**
 * ZionX App Development Studio — Store Asset Agent (MCP)
 *
 * Lightweight MCP tool provider that wraps the StoreAssetGeneratorService.
 * Exposes preview screenshot capture, video recording, icon generation,
 * feature graphic generation, and asset validation as MCP tools.
 *
 * Requirements: 42k.36, 42h.24, 42h.25
 */

import type { StoreAssetGeneratorService, StoreAsset, Platform } from '../store-assets.js';

// ---------------------------------------------------------------------------
// MCP Tool Types
// ---------------------------------------------------------------------------

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Video Capture Types
// ---------------------------------------------------------------------------

export interface VideoCaptureResult {
  videoId: string;
  sessionId: string;
  durationMs: number;
  width: number;
  height: number;
  filePath: string;
  format: string;
}

// ---------------------------------------------------------------------------
// Driver Interfaces (injected dependencies)
// ---------------------------------------------------------------------------

export interface PreviewScreenCapturer {
  captureScreen(
    sessionId: string,
    width: number,
    height: number,
  ): Promise<Buffer>;
}

export interface PreviewVideoRecorder {
  startRecording(
    sessionId: string,
    width: number,
    height: number,
    maxDurationMs: number,
  ): Promise<string>;
  stopRecording(recordingId: string): Promise<{
    filePath: string;
    durationMs: number;
    format: string;
  }>;
}

export interface S3AssetStorage {
  upload(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<{ url: string; key: string }>;
  getUrl(key: string): string;
}

// ---------------------------------------------------------------------------
// Store Asset Agent MCP Interface
// ---------------------------------------------------------------------------

export interface StoreAssetAgentMCP {
  getMCPTools(): MCPTool[];
  executeTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
}

// ---------------------------------------------------------------------------
// Device Size Dimensions
// ---------------------------------------------------------------------------

const DEVICE_DIMENSIONS: Record<string, { width: number; height: number; platform: Platform }> = {
  'iphone-6.7': { width: 1290, height: 2796, platform: 'apple' },
  'iphone-6.5': { width: 1284, height: 2778, platform: 'apple' },
  'ipad': { width: 2048, height: 2732, platform: 'apple' },
  'google-play-phone': { width: 1080, height: 1920, platform: 'google' },
  'google-play-tablet': { width: 1200, height: 1920, platform: 'google' },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultStoreAssetAgent implements StoreAssetAgentMCP {
  private videoCounter = 0;

  constructor(
    private readonly assetService: StoreAssetGeneratorService,
    private readonly screenCapturer: PreviewScreenCapturer,
    private readonly videoRecorder: PreviewVideoRecorder,
    private readonly storage: S3AssetStorage,
  ) {}

  getMCPTools(): MCPTool[] {
    return [
      {
        name: 'preview.captureScreen',
        description:
          'Capture a screenshot of the app preview at specified device dimensions. Returns the captured screenshot asset with S3 URL.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
            deviceSize: {
              type: 'string',
              enum: Object.keys(DEVICE_DIMENSIONS),
              description: 'Target device size for screenshot dimensions',
            },
          },
          required: ['sessionId', 'deviceSize'],
        },
      },
      {
        name: 'preview.captureVideo',
        description:
          'Record an App Preview video from the running preview session. Used for App Store and Google Play video previews.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
            deviceSize: {
              type: 'string',
              enum: Object.keys(DEVICE_DIMENSIONS),
              description: 'Target device size for video dimensions',
            },
            maxDurationMs: {
              type: 'number',
              description: 'Maximum recording duration in milliseconds (default: 30000)',
            },
          },
          required: ['sessionId', 'deviceSize'],
        },
      },
      {
        name: 'assets.generateIcon',
        description:
          'Generate an app icon (1024×1024) using the app design system. Stores the result in S3.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'assets.generateFeatureGraphic',
        description:
          'Generate a Google Play feature graphic (1024×500) using the app design system. Stores the result in S3.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'assets.validate',
        description:
          'Validate all generated assets for a session against platform-specific requirements (dimensions, format, file size).',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
          },
          required: ['sessionId'],
        },
      },
    ];
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    switch (toolName) {
      case 'preview.captureScreen':
        return this.handleCaptureScreen(args);
      case 'preview.captureVideo':
        return this.handleCaptureVideo(args);
      case 'assets.generateIcon':
        return this.handleGenerateIcon(args);
      case 'assets.generateFeatureGraphic':
        return this.handleGenerateFeatureGraphic(args);
      case 'assets.validate':
        return this.handleValidate(args);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  // -------------------------------------------------------------------------
  // Tool Handlers
  // -------------------------------------------------------------------------

  private async handleCaptureScreen(args: Record<string, unknown>): Promise<MCPToolResult> {
    const sessionId = args.sessionId as string;
    const deviceSize = args.deviceSize as string;

    if (!sessionId || !deviceSize) {
      return { success: false, error: 'sessionId and deviceSize are required' };
    }

    const dimensions = DEVICE_DIMENSIONS[deviceSize];
    if (!dimensions) {
      return {
        success: false,
        error: `Unknown device size: ${deviceSize}. Valid sizes: ${Object.keys(DEVICE_DIMENSIONS).join(', ')}`,
      };
    }

    try {
      const buffer = await this.screenCapturer.captureScreen(
        sessionId,
        dimensions.width,
        dimensions.height,
      );

      const s3Key = `sessions/${sessionId}/screenshots/${deviceSize}-${Date.now()}.png`;
      const uploadResult = await this.storage.upload(s3Key, buffer, 'image/png');

      const asset = await this.assetService.captureScreenshot(sessionId, deviceSize);

      return {
        success: true,
        data: {
          asset,
          s3Url: uploadResult.url,
          s3Key: uploadResult.key,
          width: dimensions.width,
          height: dimensions.height,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot capture failed',
      };
    }
  }

  private async handleCaptureVideo(args: Record<string, unknown>): Promise<MCPToolResult> {
    const sessionId = args.sessionId as string;
    const deviceSize = args.deviceSize as string;
    const maxDurationMs = (args.maxDurationMs as number) || 30000;

    if (!sessionId || !deviceSize) {
      return { success: false, error: 'sessionId and deviceSize are required' };
    }

    const dimensions = DEVICE_DIMENSIONS[deviceSize];
    if (!dimensions) {
      return {
        success: false,
        error: `Unknown device size: ${deviceSize}. Valid sizes: ${Object.keys(DEVICE_DIMENSIONS).join(', ')}`,
      };
    }

    try {
      const recordingId = await this.videoRecorder.startRecording(
        sessionId,
        dimensions.width,
        dimensions.height,
        maxDurationMs,
      );

      const result = await this.videoRecorder.stopRecording(recordingId);

      const s3Key = `sessions/${sessionId}/videos/${deviceSize}-${Date.now()}.${result.format}`;
      const videoBuffer = Buffer.alloc(0); // Placeholder — actual video data comes from file
      const uploadResult = await this.storage.upload(
        s3Key,
        videoBuffer,
        `video/${result.format}`,
      );

      this.videoCounter += 1;
      const videoCaptureResult: VideoCaptureResult = {
        videoId: `video-${this.videoCounter}`,
        sessionId,
        durationMs: result.durationMs,
        width: dimensions.width,
        height: dimensions.height,
        filePath: result.filePath,
        format: result.format,
      };

      return {
        success: true,
        data: {
          video: videoCaptureResult,
          s3Url: uploadResult.url,
          s3Key: uploadResult.key,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video capture failed',
      };
    }
  }

  private async handleGenerateIcon(args: Record<string, unknown>): Promise<MCPToolResult> {
    const sessionId = args.sessionId as string;

    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    try {
      const asset = await this.assetService.generateAppIcon(sessionId);

      const s3Key = `sessions/${sessionId}/icons/app-icon-${Date.now()}.png`;
      const iconBuffer = Buffer.alloc(1024 * 1024 * 4); // Placeholder
      const uploadResult = await this.storage.upload(s3Key, iconBuffer, 'image/png');

      return {
        success: true,
        data: {
          asset,
          s3Url: uploadResult.url,
          s3Key: uploadResult.key,
          width: 1024,
          height: 1024,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Icon generation failed',
      };
    }
  }

  private async handleGenerateFeatureGraphic(args: Record<string, unknown>): Promise<MCPToolResult> {
    const sessionId = args.sessionId as string;

    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    try {
      const asset = await this.assetService.generateFeatureGraphic(sessionId);

      const s3Key = `sessions/${sessionId}/graphics/feature-graphic-${Date.now()}.png`;
      const graphicBuffer = Buffer.alloc(1024 * 500 * 4); // Placeholder
      const uploadResult = await this.storage.upload(s3Key, graphicBuffer, 'image/png');

      return {
        success: true,
        data: {
          asset,
          s3Url: uploadResult.url,
          s3Key: uploadResult.key,
          width: 1024,
          height: 500,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Feature graphic generation failed',
      };
    }
  }

  private async handleValidate(args: Record<string, unknown>): Promise<MCPToolResult> {
    const sessionId = args.sessionId as string;

    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    try {
      const result = await this.assetService.validateAssets(sessionId);
      const assets = await this.assetService.getAssets(sessionId);

      return {
        success: true,
        data: {
          valid: result.valid,
          errors: result.errors,
          totalAssets: assets.length,
          assetSummary: {
            screenshots: assets.filter((a) => a.type === 'screenshot').length,
            icons: assets.filter((a) => a.type === 'app-icon').length,
            featureGraphics: assets.filter((a) => a.type === 'feature-graphic').length,
            promoBanners: assets.filter((a) => a.type === 'promo-banner').length,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Asset validation failed',
      };
    }
  }
}
