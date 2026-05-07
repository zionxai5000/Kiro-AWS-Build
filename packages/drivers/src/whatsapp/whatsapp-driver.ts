/**
 * WhatsApp Business API Driver — messaging, media, and business profile management
 * via WhatsApp Business Cloud API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for access token
 * authentication, and implements all WhatsApp Business operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
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

export const WHATSAPP_ERROR_CODES = {
  UNAUTHORIZED: 'WHATSAPP_UNAUTHORIZED',
  FORBIDDEN: 'WHATSAPP_FORBIDDEN',
  NOT_FOUND: 'WHATSAPP_NOT_FOUND',
  RATE_LIMITED: 'WHATSAPP_RATE_LIMITED',
  INVALID_PARAMS: 'WHATSAPP_INVALID_PARAMS',
  RECIPIENT_NOT_FOUND: 'WHATSAPP_RECIPIENT_NOT_FOUND',
  TEMPLATE_NOT_FOUND: 'WHATSAPP_TEMPLATE_NOT_FOUND',
  MEDIA_TOO_LARGE: 'WHATSAPP_MEDIA_TOO_LARGE',
  MESSAGE_FAILED: 'WHATSAPP_MESSAGE_FAILED',
  UNSUPPORTED_OPERATION: 'WHATSAPP_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: WhatsAppTextContent;
  image?: WhatsAppMediaContent;
  document?: WhatsAppMediaContent;
  video?: WhatsAppMediaContent;
  audio?: WhatsAppMediaContent;
  location?: WhatsAppLocationContent;
  contacts?: WhatsAppContactContent[];
  template?: WhatsAppTemplateContent;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'video'
  | 'audio'
  | 'location'
  | 'contacts'
  | 'template';

export interface WhatsAppTextContent {
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppMediaContent {
  id?: string;
  link?: string;
  caption?: string;
  mimeType?: string;
  filename?: string;
}

export interface WhatsAppLocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppContactContent {
  name: { formattedName: string; firstName?: string; lastName?: string };
  phones?: Array<{ phone: string; type?: string }>;
  emails?: Array<{ email: string; type?: string }>;
}

export interface WhatsAppTemplateContent {
  name: string;
  language: { code: string };
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{ type: string; text?: string; image?: WhatsAppMediaContent }>;
}

export interface WhatsAppBusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  vertical: string;
  websites: string[];
  profilePictureUrl?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WhatsAppDriverConfig {
  /** The access token key name in Credential Manager. */
  accessTokenKeyName: string;
  /** The WhatsApp Business phone number ID. */
  phoneNumberId: string;
  /** The WhatsApp Business Account ID. */
  businessAccountId: string;
  /** API version (default v18.0). */
  apiVersion?: string;
}

// ---------------------------------------------------------------------------
// WhatsApp Driver
// ---------------------------------------------------------------------------

export class WhatsAppDriver extends BaseDriver<WhatsAppDriverConfig> {
  readonly name = 'whatsapp';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: WhatsAppDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: WhatsAppDriverConfig): Promise<void> {
    if (!config.accessTokenKeyName) {
      throw new Error('WhatsApp access token key name is required');
    }
    if (!config.phoneNumberId) {
      throw new Error('WhatsApp phone number ID is required');
    }
    if (!config.businessAccountId) {
      throw new Error('WhatsApp Business Account ID is required');
    }

    this._accessToken = await this.credentialManager.getCredential('whatsapp', config.accessTokenKeyName);
    if (!this._accessToken) {
      throw new Error('Failed to retrieve WhatsApp access token from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'whatsapp',
      authenticated: true,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      apiVersion: config.apiVersion ?? 'v18.0',
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
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'sendMessage':
        return this.handleSendMessage(operation, operationId);
      case 'sendTemplate':
        return this.handleSendTemplate(operation, operationId);
      case 'getMessages':
        return this.handleGetMessages(operation, operationId);
      case 'sendMedia':
        return this.handleSendMedia(operation, operationId);
      case 'markAsRead':
        return this.handleMarkAsRead(operation, operationId);
      case 'getBusinessProfile':
        return this.handleGetBusinessProfile(operationId);
      case 'sendLocation':
        return this.handleSendLocation(operation, operationId);
      case 'sendContact':
        return this.handleSendContact(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          WHATSAPP_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleSendMessage(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, text, previewUrl } = operation.params as {
      to?: string;
      text?: string;
      previewUrl?: boolean;
    };

    if (!to) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendMessage', false);
    }
    if (!text) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'text is required for sendMessage', false);
    }

    const message: WhatsAppMessage = {
      id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: this._driverConfig!.phoneNumberId,
      to,
      timestamp: new Date().toISOString(),
      type: 'text',
      text: { body: text, previewUrl },
      status: 'sent',
    };

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSendTemplate(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, templateName, languageCode, components } = operation.params as {
      to?: string;
      templateName?: string;
      languageCode?: string;
      components?: WhatsAppTemplateComponent[];
    };

    if (!to) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendTemplate', false);
    }
    if (!templateName) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'templateName is required for sendTemplate', false);
    }

    const message: WhatsAppMessage = {
      id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: this._driverConfig!.phoneNumberId,
      to,
      timestamp: new Date().toISOString(),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode ?? 'en_US' },
        components,
      },
      status: 'sent',
    };

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetMessages(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { limit, after } = operation.params as {
      limit?: number;
      after?: string;
    };

    const result: DriverResult = {
      success: true,
      data: {
        messages: [] as WhatsAppMessage[],
        totalCount: 0,
        limit: limit ?? 20,
        after,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSendMedia(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, mediaType, mediaUrl, mediaId, caption, filename } = operation.params as {
      to?: string;
      mediaType?: 'image' | 'document' | 'video' | 'audio';
      mediaUrl?: string;
      mediaId?: string;
      caption?: string;
      filename?: string;
    };

    if (!to) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendMedia', false);
    }
    if (!mediaType) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'mediaType is required for sendMedia', false);
    }
    if (!mediaUrl && !mediaId) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'mediaUrl or mediaId is required for sendMedia', false);
    }

    const mediaContent: WhatsAppMediaContent = {
      id: mediaId,
      link: mediaUrl,
      caption,
      filename,
    };

    const message: WhatsAppMessage = {
      id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: this._driverConfig!.phoneNumberId,
      to,
      timestamp: new Date().toISOString(),
      type: mediaType,
      status: 'sent',
    };

    // Assign media to the correct field based on type
    switch (mediaType) {
      case 'image':
        message.image = mediaContent;
        break;
      case 'document':
        message.document = mediaContent;
        break;
      case 'video':
        message.video = mediaContent;
        break;
      case 'audio':
        message.audio = mediaContent;
        break;
    }

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleMarkAsRead(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { messageId } = operation.params as { messageId?: string };

    if (!messageId) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'messageId is required for markAsRead', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        messageId,
        markedAsRead: true,
        markedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetBusinessProfile(operationId: string): Promise<DriverResult> {
    const profile: WhatsAppBusinessProfile = {
      about: 'SeraphimOS Business Account',
      address: '',
      description: 'Autonomous orchestration platform',
      email: '',
      vertical: 'TECH',
      websites: [],
    };

    const result: DriverResult = {
      success: true,
      data: profile,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSendLocation(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, latitude, longitude, name, address } = operation.params as {
      to?: string;
      latitude?: number;
      longitude?: number;
      name?: string;
      address?: string;
    };

    if (!to) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendLocation', false);
    }
    if (latitude === undefined || latitude === null) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'latitude is required for sendLocation', false);
    }
    if (longitude === undefined || longitude === null) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'longitude is required for sendLocation', false);
    }

    const message: WhatsAppMessage = {
      id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: this._driverConfig!.phoneNumberId,
      to,
      timestamp: new Date().toISOString(),
      type: 'location',
      location: { latitude, longitude, name, address },
      status: 'sent',
    };

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSendContact(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, contacts } = operation.params as {
      to?: string;
      contacts?: WhatsAppContactContent[];
    };

    if (!to) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendContact', false);
    }
    if (!contacts || contacts.length === 0) {
      return this.errorResult(operationId, WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'contacts array is required for sendContact', false);
    }

    const message: WhatsAppMessage = {
      id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: this._driverConfig!.phoneNumberId,
      to,
      timestamp: new Date().toISOString(),
      type: 'contacts',
      contacts,
      status: 'sent',
    };

    const result: DriverResult = {
      success: true,
      data: message,
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
    return `whatsapp-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
