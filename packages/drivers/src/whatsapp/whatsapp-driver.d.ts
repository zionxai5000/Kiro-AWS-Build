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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const WHATSAPP_ERROR_CODES: {
    readonly UNAUTHORIZED: "WHATSAPP_UNAUTHORIZED";
    readonly FORBIDDEN: "WHATSAPP_FORBIDDEN";
    readonly NOT_FOUND: "WHATSAPP_NOT_FOUND";
    readonly RATE_LIMITED: "WHATSAPP_RATE_LIMITED";
    readonly INVALID_PARAMS: "WHATSAPP_INVALID_PARAMS";
    readonly RECIPIENT_NOT_FOUND: "WHATSAPP_RECIPIENT_NOT_FOUND";
    readonly TEMPLATE_NOT_FOUND: "WHATSAPP_TEMPLATE_NOT_FOUND";
    readonly MEDIA_TOO_LARGE: "WHATSAPP_MEDIA_TOO_LARGE";
    readonly MESSAGE_FAILED: "WHATSAPP_MESSAGE_FAILED";
    readonly UNSUPPORTED_OPERATION: "WHATSAPP_UNSUPPORTED_OPERATION";
};
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
export type WhatsAppMessageType = 'text' | 'image' | 'document' | 'video' | 'audio' | 'location' | 'contacts' | 'template';
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
    name: {
        formattedName: string;
        firstName?: string;
        lastName?: string;
    };
    phones?: Array<{
        phone: string;
        type?: string;
    }>;
    emails?: Array<{
        email: string;
        type?: string;
    }>;
}
export interface WhatsAppTemplateContent {
    name: string;
    language: {
        code: string;
    };
    components?: WhatsAppTemplateComponent[];
}
export interface WhatsAppTemplateComponent {
    type: 'header' | 'body' | 'button';
    parameters: Array<{
        type: string;
        text?: string;
        image?: WhatsAppMediaContent;
    }>;
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
export declare class WhatsAppDriver extends BaseDriver<WhatsAppDriverConfig> {
    private readonly credentialManager;
    readonly name = "whatsapp";
    readonly version = "1.0.0";
    private _accessToken;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: WhatsAppDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleSendMessage;
    private handleSendTemplate;
    private handleGetMessages;
    private handleSendMedia;
    private handleMarkAsRead;
    private handleGetBusinessProfile;
    private handleSendLocation;
    private handleSendContact;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=whatsapp-driver.d.ts.map