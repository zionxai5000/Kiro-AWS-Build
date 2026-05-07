/**
 * HeyGen AI Video Generation Driver — AI-powered video creation and avatar management.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all HeyGen operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 12.1
 */

import { BaseDriver } from '../base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const HEYGEN_ERROR_CODES = {
  UNAUTHORIZED: 'HEYGEN_UNAUTHORIZED',
  FORBIDDEN: 'HEYGEN_FORBIDDEN',
  NOT_FOUND: 'HEYGEN_NOT_FOUND',
  RATE_LIMITED: 'HEYGEN_RATE_LIMITED',
  INVALID_PARAMS: 'HEYGEN_INVALID_PARAMS',
  VIDEO_GENERATION_FAILED: 'HEYGEN_VIDEO_GENERATION_FAILED',
  TEMPLATE_NOT_FOUND: 'HEYGEN_TEMPLATE_NOT_FOUND',
  AVATAR_NOT_FOUND: 'HEYGEN_AVATAR_NOT_FOUND',
  UNSUPPORTED_OPERATION: 'HEYGEN_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeyGenVideo {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  duration: number;
  thumbnailUrl: string;
  videoUrl?: string;
  avatarId: string;
  templateId?: string;
  createdAt: string;
}

export interface HeyGenTemplate {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  duration: number;
  scenes: number;
  createdAt: string;
}

export interface HeyGenAvatar {
  id: string;
  name: string;
  gender: string;
  previewUrl: string;
  supportedLanguages: string[];
  type: 'standard' | 'custom' | 'photo';
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HeyGenDriverConfig {
  /** The API key name in Credential Manager. */
  apiKeyName: string;
}

// ---------------------------------------------------------------------------
// HeyGen Driver
// ---------------------------------------------------------------------------

export class HeyGenDriver extends BaseDriver<HeyGenDriverConfig> {
  readonly name = 'heygen';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: HeyGenDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: HeyGenDriverConfig): Promise<void> {
    if (!config.apiKeyName) {
      throw new Error('HeyGen API key name is required');
    }

    this._accessToken = await this.credentialManager.getCredential('heygen', config.apiKeyName);
    if (!this._accessToken) {
      throw new Error('Failed to retrieve HeyGen API key from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'heygen',
      authenticated: true,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._accessToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'createVideo':
        return this.handleCreateVideo(operation, operationId);
      case 'getVideoStatus':
        return this.handleGetVideoStatus(operation, operationId);
      case 'listTemplates':
        return this.handleListTemplates(operation, operationId);
      case 'getTemplate':
        return this.handleGetTemplate(operation, operationId);
      case 'listAvatars':
        return this.handleListAvatars(operation, operationId);
      case 'getAvatar':
        return this.handleGetAvatar(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          HEYGEN_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleCreateVideo(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { title, avatarId, script, templateId, voiceId } = operation.params as {
      title?: string;
      avatarId?: string;
      script?: string;
      templateId?: string;
      voiceId?: string;
    };

    if (!title) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.INVALID_PARAMS, 'title is required for createVideo', false);
    }
    if (!avatarId) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.INVALID_PARAMS, 'avatarId is required for createVideo', false);
    }
    if (!script) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.INVALID_PARAMS, 'script is required for createVideo', false);
    }

    const video: HeyGenVideo = {
      id: `heygen-video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      status: 'processing',
      duration: 0,
      thumbnailUrl: `https://heygen.com/thumbnails/placeholder.jpg`,
      avatarId,
      templateId,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: video,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetVideoStatus(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { videoId } = operation.params as { videoId?: string };

    if (!videoId) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.INVALID_PARAMS, 'videoId is required for getVideoStatus', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        videoId,
        status: 'completed',
        progress: 100,
        videoUrl: `https://heygen.com/videos/${videoId}/output.mp4`,
        duration: 60,
        checkedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListTemplates(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { limit, offset } = operation.params as { limit?: number; offset?: number };

    const result: DriverResult = {
      success: true,
      data: {
        templates: [] as HeyGenTemplate[],
        total: 0,
        limit: limit ?? 20,
        offset: offset ?? 0,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetTemplate(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { templateId } = operation.params as { templateId?: string };

    if (!templateId) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.INVALID_PARAMS, 'templateId is required for getTemplate', false);
    }

    const template: HeyGenTemplate = {
      id: templateId,
      name: 'Mock Template',
      description: 'Structural mock template',
      thumbnailUrl: `https://heygen.com/templates/${templateId}/thumbnail.jpg`,
      duration: 30,
      scenes: 1,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: template,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListAvatars(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { limit, offset } = operation.params as { limit?: number; offset?: number };

    const result: DriverResult = {
      success: true,
      data: {
        avatars: [] as HeyGenAvatar[],
        total: 0,
        limit: limit ?? 20,
        offset: offset ?? 0,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetAvatar(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { avatarId } = operation.params as { avatarId?: string };

    if (!avatarId) {
      return this.errorResult(operationId, HEYGEN_ERROR_CODES.INVALID_PARAMS, 'avatarId is required for getAvatar', false);
    }

    const avatar: HeyGenAvatar = {
      id: avatarId,
      name: 'Mock Avatar',
      gender: 'neutral',
      previewUrl: `https://heygen.com/avatars/${avatarId}/preview.jpg`,
      supportedLanguages: ['en'],
      type: 'standard',
    };

    const result: DriverResult = {
      success: true,
      data: avatar,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private createOpId(): string {
    return `heygen-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
